import { useState, useCallback, useEffect, useRef } from 'react';
import Games from './Games.jsx';
import Setup from './Setup.jsx';
import Home from './Home.jsx';
import { post } from './api.js';
import { verifyPin } from './pinhash.js';
import { initProfile, load, save } from './storage.js';
import { useScreenGuard } from './useScreenGuard.js';
import { useInbox } from './useInbox.js';
import Icon from './Icon.jsx';
import { OnlineContext } from './OnlineContext.js';
import { SERVER } from './config.js';
import { getIdentity, resetIdentity } from './identity.js';
import { startWatcher, stopWatcher, wipeWatcher } from './watcher.js';
import { serial, beginAttempt, finishAttempt, silentWipe, flushQueue, readQueue } from './autowipe.js';

const WAIT_WINDOW = 30 * 60 * 1000;

export default function App() {
  const [profile, setProfile] = useState(initProfile);
  const [unlocked, setUnlocked] = useState(false);
  const [pings, setPings] = useState({ owner: 0, guest: 0 }); // time of the newest message from the friend, per chat
  const hidden = useScreenGuard();
  const unlockedRef = useRef(false);
  const activeRoom = useRef(null); // which chat is open right now ('owner' | 'guest' | null)
  useEffect(() => { unlockedRef.current = unlocked; }, [unlocked]);

  const update = useCallback((patch) => setProfile(save(patch)), []);

  // Light/dark theme: saved choice, else follow the phone's setting.
  const theme = profile.theme
    || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggleTheme = useCallback(() => update({ theme: theme === 'dark' ? 'light' : 'dark' }), [theme, update]);

  // ---- secret "message waiting" signal ----
  // The inbox keeps listening (even before unlock). When a friend's message is newer than the last one
  // you opened, the front screen shows a green title. Content is never involved.
  // Only the title colour changes: no banner or any other notification.
  const onPing = useCallback(({ role, time }) => {
    setPings((p) => ({ ...p, [role]: Math.max(p[role] || 0, time || Date.now()) }));
  }, []);
  const [friendOn, setFriendOn] = useState({ owner: false, guest: false }); // is the friend inside the chat right now?
  const [chatOpen, setChatOpen] = useState(false); // the chat box itself is on screen (no Online button there)
  const onFriend = useCallback((role, on) => setFriendOn((f) => (f[role] === on ? f : { ...f, [role]: on })), []);
  useInbox(profile, !!profile.passHash, onPing, onFriend);

  // Android: keep the background watcher running so a generic game notification can appear while the app is closed.
  const notifyOn = profile.notify !== false;
  useEffect(() => {
    if (!profile.passHash || !notifyOn || !SERVER) { stopWatcher(); return; }
    let dead = false;
    (async () => {
      const id = await getIdentity();
      if (dead) return;
      const rooms = [{ role: 'owner', code: profile.ownCode, secret: profile.ownSecret, pub: id?.pubJson }];
      if (profile.joined) rooms.push({ role: 'guest', code: profile.joined.code, secret: profile.joined.secret });
      startWatcher({ server: SERVER, rooms });
    })();
    return () => { dead = true; };
  }, [profile.passHash, notifyOn, profile.ownCode, profile.ownSecret, profile.joined?.code, profile.joined?.secret]);
  const online = friendOn.owner || (!!profile.joined && friendOn.guest);
  useEffect(() => { if (!unlocked) setChatOpen(false); }, [unlocked]);
  // A new code / a different friend starts fresh.
  useEffect(() => { setPings((p) => ({ ...p, owner: 0 })); }, [profile.ownCode]);
  useEffect(() => { setPings((p) => ({ ...p, guest: 0 })); }, [profile.joined?.code]);

  // The chat screen calls this when it shows the friend's newest message.
  const markSeen = useCallback((role, time) => {
    const seen = load().seen || {};
    if ((seen[role] || 0) >= time) return;
    setProfile(save({ seen: { ...seen, [role]: time } }));
  }, []);

  const waiting = (role) => Date.now() - pings[role] < WAIT_WINDOW && pings[role] > (profile.seen?.[role] || 0);
  const signal = profile.notify !== false && (waiting('owner') || (!!profile.joined && waiting('guest')));


  // Server deletions that are still waiting for the server's confirmation (after a silent auto-wipe) are retried
  // at start, when the network comes back and every minute. Nothing is shown to the user.
  useEffect(() => {
    const retry = () => { if (readQueue().length) flushQueue(post); };
    retry();
    const t = setInterval(retry, 60000);
    window.addEventListener('online', retry);
    return () => { clearInterval(t); window.removeEventListener('online', retry); };
  }, []);

  // Called by the hidden PIN pad (opened by holding a game title). Attempts run one at a time; 3 wrong in a row
  // trigger the silent auto-wipe (if it is switched on in Settings): no alert, then the app restarts at first-time setup.
  const onCode = useCallback((digits, opts) => serial(async () => {
    const p = load();
    if (opts?.bypass) { // only honoured when the passcode lock is switched off in Settings
      if (p.pinOn !== false) return 'wrong';
      setUnlocked(true); // opens straight away, no transition
      return 'unlock';
    }
    if (digits.length !== p.passLen && !opts?.explicit) return 'ignore';
    const tries = await beginAttempt(); // counted before the check, so it cannot be dodged
    const { ok, upgrade } = await verifyPin(p, digits);
    if (ok && upgrade) save({ passHash: upgrade }); // old weak hash -> strong hash
    const r = await finishAttempt(ok, tries);
    if (r === 'ok') {
      setUnlocked(true); // opens straight away, no transition
      return 'unlock';
    }
    if (r === 'wipe') {
      await silentWipe({ post, nativeWipe: wipeWatcher, resetIdentity });
      window.location.reload();
    }
    return 'wrong';
  }), []);

  let screen;
  if (!profile.passHash) screen = <Setup onDone={update} />;
  else if (!unlocked) {
    screen = (
      <div className="front">
        <Games onCode={onCode} passLen={profile.passLen} signal={signal} />
      </div>
    );
  } else {
    screen = (
      <div className="homein">
        <Home profile={profile} update={update} onLock={() => setUnlocked(false)} theme={theme} onTheme={toggleTheme}
          activeRoom={activeRoom} onSeen={markSeen} onView={(v) => setChatOpen(!!v)} />
      </div>
    );
  }

  return (
    <OnlineContext.Provider value={online}>
      {screen}
      {hidden && unlocked && <div className="shield" />}
    </OnlineContext.Provider>
  );
}
