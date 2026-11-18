import { useState, useCallback, useEffect } from 'react';
import Calculator from './Calculator.jsx';
import Game2048 from './Game2048.jsx';
import Snake from './Snake.jsx';
import Setup from './Setup.jsx';
import Home from './Home.jsx';
import { post } from './api.js';
import { sha256 } from './sha256.js';
import { initProfile, load, save } from './storage.js';
import { useScreenGuard } from './useScreenGuard.js';

export default function App() {
  const [profile, setProfile] = useState(initProfile);
  const [unlocked, setUnlocked] = useState(false);
  const hidden = useScreenGuard();

  const update = useCallback((patch) => setProfile(save(patch)), []);

  // Light/dark theme: saved choice, else follow the phone's setting.
  const theme = profile.theme
    || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggleTheme = useCallback(() => update({ theme: theme === 'dark' ? 'light' : 'dark' }), [theme, update]);

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
    if (profile.mode === 'game') screen = <Game2048 onCode={onCode} passLen={profile.passLen} />;
    else if (profile.mode === 'snake') screen = <Snake onCode={onCode} passLen={profile.passLen} />;
    else screen = <Calculator onCode={onCode} />;
  }
  else screen = <Home profile={profile} update={update} onLock={() => setUnlocked(false)} theme={theme} onTheme={toggleTheme} />;

  return (
    <>
      {screen}
      {hidden && unlocked && <div className="shield" />}
    </>
  );
}
