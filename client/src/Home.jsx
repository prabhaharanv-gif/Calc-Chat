import { useCallback, useEffect, useState } from 'react';
import Chat from './Chat.jsx';
import { post } from './api.js';
import { randomCode, randomSecret } from './storage.js';

const JOIN_ERRORS = {
  not_found: 'Code not found. Ask your friend to open the app once, then try again.',
  full: 'That chat already has two people.',
  own_code: 'That is your own code. Share it with a friend instead.',
  rate: 'Too many tries. Wait a minute.',
  bad_code: 'Code looks wrong (8 letters/numbers).',
};

export default function Home({ profile, update, onLock }) {
  const [view, setView] = useState(null); // null | 'owner' | 'guest'
  const [joinInput, setJoinInput] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const host = useCallback(async () => {
    try {
      const r = await post('/api/host', { code: profile.ownCode, secret: profile.ownSecret });
      setMsg(r.ok ? '' : 'Server problem. Try again.');
    } catch { setMsg('Cannot reach server.'); }
  }, [profile.ownCode, profile.ownSecret]);

  useEffect(() => { host(); }, [host]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.ownCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };
  const share = () => navigator.share?.({ text: `Join my private chat. Code: ${profile.ownCode}` }).catch(() => {});

  const newCode = async () => {
    if (!confirm('Create a new code? The old code and its chat will be deleted.')) return;
    try { await post('/api/close', { code: profile.ownCode, secret: profile.ownSecret }); } catch { /* offline */ }
    update({ ownCode: randomCode(), ownSecret: randomSecret() });
  };

  const join = async (e) => {
    e.preventDefault();
    const code = joinInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 8) return setMsg(JOIN_ERRORS.bad_code);
    setBusy(true);
    try {
      const secret = randomSecret();
      const r = await post('/api/join', { code, secret });
      if (r.ok) {
        update({ joined: { code, secret } });
        setJoinInput('');
        setMsg('');
        setView('guest');
      } else setMsg(JOIN_ERRORS[r.error] || 'Could not join.');
    } catch { setMsg('Cannot reach server.'); }
    setBusy(false);
  };

  const leave = async () => {
    if (!confirm('Leave this chat? Its messages will be deleted.')) return;
    try { await post('/api/close', profile.joined); } catch { /* offline */ }
    update({ joined: null });
  };

  if (view === 'owner') {
    return <Chat role="owner" code={profile.ownCode} secret={profile.ownSecret} title="My chat"
      onBack={() => setView(null)} onLock={onLock} />;
  }
  if (view === 'guest' && profile.joined) {
    return <Chat role="guest" code={profile.joined.code} secret={profile.joined.secret}
      title={`Chat ${profile.joined.code}`} onBack={() => setView(null)} onLock={onLock} />;
  }

  return (
    <div className="page">
      <header className="bar">
        <span>Private Chat</span>
        <button className="ghost" onClick={onLock}>🔒 Lock</button>
      </header>
      <div className="home">
        <section className="card">
          <div className="muted">Your code</div>
          <div className="code">{profile.ownCode}</div>
          <div className="row">
            <button className="ghost" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            {navigator.share && <button className="ghost" onClick={share}>Share</button>}
            <button className="ghost" onClick={newCode}>New code</button>
          </div>
          <button className="primary" onClick={() => setView('owner')}>Open my chat</button>
          <p className="muted small">Anyone with this code can join your chat (max 2 people).</p>
        </section>

        <section className="card">
          <div className="muted">Join a friend</div>
          {profile.joined ? (
            <>
              <div className="code small">{profile.joined.code}</div>
              <button className="primary" onClick={() => setView('guest')}>Open chat</button>
              <button className="ghost" onClick={leave}>Leave chat</button>
            </>
          ) : (
            <form onSubmit={join} className="col">
              <input placeholder="Enter friend's code" value={joinInput} maxLength={12}
                onChange={(e) => setJoinInput(e.target.value)} autoCapitalize="characters" />
              <button className="primary" disabled={busy}>Join</button>
            </form>
          )}
        </section>
        {msg && <div className="err">{msg}</div>}
        <p className="muted small center-text">
          Messages and media are never saved. They disappear after 4 hours.
        </p>
      </div>
    </div>
  );
}
