import { useCallback, useEffect, useRef, useState } from 'react';

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
const LONG_PRESS_MS = 2500;

// Hold an element (a game's title) for ~3 seconds to trigger the hidden PIN pad.
export function useLongPress(onTrigger, ms = LONG_PRESS_MS) {
  const timer = useRef(null);
  const cancel = useCallback(() => clearTimeout(timer.current), []);
  useEffect(() => cancel, [cancel]);
  return {
    onPointerDown: () => { clearTimeout(timer.current); timer.current = setTimeout(onTrigger, ms); },
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

  const submit = useCallback(async (code) => {
    if (busy) return;
    setBusy(true);
    const r = await onCode(code, { explicit: true });
    if (r !== 'unlock') {
      setShake(true);
      setTimeout(() => { setShake(false); setPin(''); setBusy(false); }, 450);
    }
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

  return (
    <div className="pinwrap" onClick={() => !busy && onClose()}>
      <div className={`pinpad ${shake ? 'shake' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="pindots">
          {Array.from({ length: Math.max(passLen || 4, pin.length) }).map((_, i) => (
            <span key={i} className={i < pin.length ? 'on' : ''} />
          ))}
        </div>
        <div className="pingrid">
          {PAD.map((k) => (
            <button key={k} onClick={() => (k === '⌫' ? back() : k === '✓' ? ok() : add(k))}>{k}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
