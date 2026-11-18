import { useState, useCallback, useEffect, useRef } from 'react';
import Calculator from './Calculator.jsx';
import Game2048 from './Game2048.jsx';
import Snake from './Snake.jsx';
import Setup from './Setup.jsx';
import Home from './Home.jsx';
import { post } from './api.js';
import { sha256 } from './sha256.js';
import { initProfile, load, save } from './storage.js';
import { useScreenGuard } from './useScreenGuard.js';
import { useInbox } from './useInbox.js';
import Icon from './Icon.jsx';

const FOUR_HOURS = 4 * 60 * 60 * 1000;

export default function App() {
  const [profile, setProfile] = useState(initProfile);
  const [unlocked, setUnlocked] = useState(false);
  const [notice, setNotice] = useState(null); // in-app banner (only inside the unlocked area)
  const [jump, setJump] = useState(null); // asks Home to open a chat (from the banner)
  const [pings, setPings] = useState({ owner: 0, guest: 0 }); // time of the newest message from the friend, per chat
  const hidden = useScreenGuard();
  const unlockedRef = useRef(false);
  const activeRoom = useRef(null); // which chat is open right now ('owner' | 'guest' | null)
  const noticeTimer = useRef(null);
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
  const onPing = useCallback(({ role, name, time, replay }) => {
    setPings((p) => ({ ...p, [role]: Math.max(p[role] || 0, time || Date.now()) }));
    if (replay || load().notify === false) return;
    if (unlockedRef.current && !document.hidden && activeRoom.current !== role) {
      setNotice({ role, name });
      clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 6000);
    }
  }, []);
  useInbox(profile, !!profile.passHash, onPing);
  // A new code / a different friend starts fresh.
  useEffect(() => { setPings((p) => ({ ...p, owner: 0 })); }, [profile.ownCode]);
  useEffect(() => { setPings((p) => ({ ...p, guest: 0 })); }, [profile.joined?.code]);
  useEffect(() => { if (!unlocked) setNotice(null); }, [unlocked]);

  // The chat screen calls this when it shows the friend's newest message.
  const markSeen = useCallback((role, time) => {
    const seen = load().seen || {};
    if ((seen[role] || 0) >= time) return;
    setProfile(save({ seen: { ...seen, [role]: time } }));
  }, []);

  const waiting = (role) => Date.now() - pings[role] < FOUR_HOURS && pings[role] > (profile.seen?.[role] || 0);
  const signal = profile.notify !== false && (waiting('owner') || (!!profile.joined && waiting('guest')));

  const openFromNotice = () => {
    if (notice) setJump({ role: notice.role, id: Date.now() });
    setNotice(null);
  };

  // Delete all messages of every chat this device is part of (both sides).
  const wipeAll = useCallback(async () => {
    const p = load();
    const targets = [];
    if (p.ownCode) targets.push({ code: p.ownCode, secret: p.ownSecret });
    if (p.joined) targets.push(p.joined);
    let failed = false;
    for (const t of targets) {
      try {
        const r = await post('/api/wipe', t);
        if (!r.ok && r.status !== 404 && r.status !== 403) failed = true;
      } catch { failed = true; }
    }
    save({ pendingWipe: failed }); // retry later if the server was unreachable
  }, []);

  useEffect(() => {
    const retry = () => { if (load().pendingWipe) wipeAll(); };
    retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [wipeAll]);

  // Called by the calculator when a digits-only entry is submitted with "=".
  const onCode = useCallback(async (digits, opts) => {
    const p = load();
    // The calculator only treats a passcode-length entry as an attempt; the game's PIN pad always does.
    if (digits.length !== p.passLen && !opts?.explicit) return 'ignore';
    if (sha256(`${p.salt}:${digits}`) === p.passHash) {
      save({ fails: 0 });
      setUnlocked(true);
      return 'unlock';
    }
    const fails = (p.fails || 0) + 1;
    if (fails >= 3) {
      save({ fails: 0, pendingWipe: true });
      wipeAll();
    } else save({ fails });
    return 'wrong';
  }, [wipeAll]);

  let screen;
  if (!profile.passHash) screen = <Setup onDone={update} />;
  else if (!unlocked) {
    if (profile.mode === 'game') screen = <Game2048 onCode={onCode} passLen={profile.passLen} signal={signal} />;
    else if (profile.mode === 'snake') screen = <Snake onCode={onCode} passLen={profile.passLen} signal={signal} />;
    else screen = <Calculator onCode={onCode} signal={signal} />;
  } else {
    screen = (
      <Home profile={profile} update={update} onLock={() => setUnlocked(false)} theme={theme} onTheme={toggleTheme}
        activeRoom={activeRoom} jump={jump} onSeen={markSeen} />
    );
  }

  return (
    <>
      {screen}
      {notice && unlocked && (
        <div className="notice" role="alert" onClick={openFromNotice}>
          <span className="notice-i"><Icon name="message" size={18} /></span>
          <span className="grow"><b>{notice.name || 'Friend'}</b><small>New message</small></span>
          <button className="notice-x" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); setNotice(null); }}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
      {hidden && unlocked && <div className="shield" />}
    </>
  );
}
