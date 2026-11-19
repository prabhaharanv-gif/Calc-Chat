import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { load } from './storage.js';

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
const LONG_PRESS_MS = 2000;

// Hold an element (a game's title) for 1-3 seconds (the user picks it in Settings) to trigger the hidden PIN pad.
// Hold time 0 means "no hold needed": a simple tap on the title opens the PIN pad instead.
const holdTime = () => { const v = load().holdMs; return v === 0 ? 0 : v || LONG_PRESS_MS; };
export function useLongPress(onTrigger, ms) {
  const timer = useRef(null);
  const cancel = useCallback(() => clearTimeout(timer.current), []);
  useEffect(() => cancel, [cancel]);
  return {
    onPointerDown: () => {
      const t = ms ?? holdTime();
      clearTimeout(timer.current);
      if (t > 0) timer.current = setTimeout(onTrigger, t);
    },
    onClick: () => { if ((ms ?? holdTime()) === 0) onTrigger(); },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
  };
}

// Hidden PIN pad shared by the games. A wrong PIN just shakes and clears (no hint).
export default function PinPad({ passLen, onCode, onClose }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const skip = load().pinOn === false; // passcode lock switched off in Settings: no PIN pad, open straight away
  const [granted, setGranted] = useState(false); // correct PIN: play the unlock animation while the screen fades into the chat

  const submit = useCallback(async (code) => {
    if (busy) return;
    setBusy(true);
    const r = await onCode(code, { explicit: true });
    if (r === 'unlock') { setGranted(true); return; }
    // Wrong PIN: red dots + a gentle shake + a short buzz, no text hint.
    setShake(true);
    try { navigator.vibrate?.([25, 35, 25]); } catch { /* not supported */ }
    setTimeout(() => { setShake(false); setPin(''); setBusy(false); }, 480);
  }, [busy, onCode]);

  const add = useCallback((d) => {
    if (busy) return;
    const next = (pin + d).slice(0, 8);
    setPin(next);
    if (passLen && next.length === passLen) submit(next);
  }, [busy, pin, passLen, submit]);

  const back = () => { if (!busy) setPin((p) => p.slice(0, -1)); };
  const ok = () => { if (pin.length >= 4) submit(pin); };

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) add(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') ok();
      else if (e.key === 'Escape' && !busy) onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => { if (skip) onCode('', { bypass: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (skip) return null;

  return (
    <div className="pinwrap" onClick={() => !busy && onClose()}>
      <div className={`pinpad ${shake ? 'shake' : ''} ${granted ? 'ok' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className={`pindots ${shake ? 'err' : ''} ${granted ? 'ok' : ''}`}>
          {Array.from({ length: Math.max(passLen || 4, pin.length) }).map((_, i) => (
            <span key={i} className={i < pin.length ? 'on' : ''} />
          ))}
        </div>
        <div className="pingrid">
          {PAD.map((k) => (
            <button key={k} onClick={() => (k === '⌫' ? back() : k === '✓' ? ok() : add(k))}
              aria-label={k === '⌫' ? 'Delete' : k === '✓' ? 'Enter' : k}>
              {k === '⌫' ? <Icon name="backspace" size={24} /> : k === '✓' ? <Icon name="check" size={26} /> : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
