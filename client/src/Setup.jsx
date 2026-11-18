import { useState } from 'react';
import { sha256 } from './sha256.js';
import { randomSecret } from './storage.js';

export const MODES = [
  { id: 'snake', label: 'Snake', title: 'Snake', how: <>Hold the <b>Snake</b> title for 3 seconds and enter your passcode to open the chat.</> },
  { id: 'game', label: '2048', title: '2048', how: <>Hold the <b>2048</b> title for 3 seconds and enter your passcode to open the chat.</> },
  { id: 'calc', label: 'Calculator', title: 'calculator', how: <>Type your passcode in the calculator and press <b>=</b> to open the chat.</> },
];

export default function Setup({ onDone }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState('snake');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const current = MODES.find((m) => m.id === mode);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setErr('Enter your name');
    if (!/^\d{4,8}$/.test(p1)) return setErr('Passcode: 4 to 8 digits');
    if (p1 !== p2) return setErr('Passcodes do not match');
    const salt = randomSecret().slice(0, 16);
    onDone({ name: name.trim().slice(0, 24), mode, salt, passHash: sha256(`${salt}:${p1}`), passLen: p1.length, fails: 0 });
  };

  return (
    <div className="page center">
      <form className="card" onSubmit={submit}>
        <h2>Welcome</h2>
        <p className="muted">
          This app hides a private chat behind a {current.title === 'calculator' ? 'calculator' : `${current.title} game`}.{' '}
          {current.how} After <b>3 wrong tries</b>, all chat messages are deleted.
        </p>
        <div className="seg">
          {MODES.map((m) => (
            <button type="button" key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
        <input placeholder="Your name (shown to your friend)" value={name} maxLength={24}
          onChange={(e) => setName(e.target.value)} autoFocus />
        <input type="password" inputMode="numeric" placeholder="New passcode (4-8 digits)" value={p1}
          onChange={(e) => setP1(e.target.value.replace(/\D/g, ''))} maxLength={8} />
        <input type="password" inputMode="numeric" placeholder="Confirm passcode" value={p2}
          onChange={(e) => setP2(e.target.value.replace(/\D/g, ''))} maxLength={8} />
        {err && <div className="err">{err}</div>}
        <button className="primary">Save</button>
      </form>
    </div>
  );
}
