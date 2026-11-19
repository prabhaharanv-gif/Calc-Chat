import { useState } from 'react';
import { hashPin } from './pinhash.js';
import { randomSecret } from './storage.js';

// First-run screen. It is deliberately plain: it looks like a normal games app profile page and never mentions
// chats, hidden screens or wiping. (How the secret part works is explained inside Settings, after unlocking.)
export default function Setup({ onDone }) {
  const [name, setName] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setErr('Enter a player name');
    if (!/^\d{4,8}$/.test(p1)) return setErr('Code: 4 to 8 digits');
    if (p1 !== p2) return setErr('Codes do not match');
    const salt = randomSecret().slice(0, 16);
    onDone({ name: name.trim().slice(0, 24), salt, passHash: await hashPin(salt, p1), passLen: p1.length, fails: 0 });
  };

  return (
    <div className="page center">
      <form className="card" onSubmit={submit}>
        <h2>Gamaroon</h2>
        <p className="muted">Create your player profile to save scores and progress.</p>
        <input placeholder="Player name" value={name} maxLength={24}
          onChange={(e) => setName(e.target.value)} autoFocus />
        <input type="password" inputMode="numeric" placeholder="Profile code (4-8 digits)" value={p1}
          onChange={(e) => setP1(e.target.value.replace(/\D/g, ''))} maxLength={8} />
        <input type="password" inputMode="numeric" placeholder="Confirm code" value={p2}
          onChange={(e) => setP2(e.target.value.replace(/\D/g, ''))} maxLength={8} />
        {err && <div className="err">{err}</div>}
        <button className="primary">Start playing</button>
      </form>
    </div>
  );
}
