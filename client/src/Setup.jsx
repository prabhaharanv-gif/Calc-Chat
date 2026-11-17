import { useState } from 'react';
import { sha256 } from './sha256.js';
import { randomSecret } from './storage.js';

export default function Setup({ onDone }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(p1)) return setErr('Use 4 to 8 digits');
    if (p1 !== p2) return setErr('Passcodes do not match');
    const salt = randomSecret().slice(0, 16);
    onDone({ salt, passHash: sha256(`${salt}:${p1}`), passLen: p1.length, fails: 0 });
  };

  return (
    <div className="page center">
      <form className="card" onSubmit={submit}>
        <h2>Set your passcode</h2>
        <p className="muted">
          This app looks like a calculator. Type your passcode in the calculator and press <b>=</b> to open your
          private chat. After <b>3 wrong tries</b>, all chat messages are deleted.
        </p>
        <input type="password" inputMode="numeric" placeholder="New passcode (4-8 digits)" value={p1}
          onChange={(e) => setP1(e.target.value.replace(/\D/g, ''))} maxLength={8} autoFocus />
        <input type="password" inputMode="numeric" placeholder="Confirm passcode" value={p2}
          onChange={(e) => setP2(e.target.value.replace(/\D/g, ''))} maxLength={8} />
        {err && <div className="err">{err}</div>}
        <button className="primary">Save</button>
      </form>
    </div>
  );
}
