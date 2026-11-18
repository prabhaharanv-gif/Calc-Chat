import { useCallback, useEffect, useState } from 'react';
import Chat from './Chat.jsx';
import Icon from './Icon.jsx';
import { post } from './api.js';
import { randomCode, randomSecret } from './storage.js';

const JOIN_ERRORS = {
  not_found: 'Code not found. Ask your friend to open the app once, then try again.',
  full: 'That chat already has two people.',
  own_code: 'That is your own code. Share it with a friend instead.',
  rate: 'Too many tries. Wait a minute.',
  bad_code: 'Code looks wrong (8 letters/numbers).',
};

// 8-character code shown as two groups of four tiles.
function Tiles({ code, small }) {
  return (
    <div className={`tiles ${small ? 'small' : ''}`}>
      {[0, 4].map((s) => (
        <div className="tilegroup" key={s}>
          {code.slice(s, s + 4).split('').map((c, i) => <span key={i} className="tile">{c}</span>)}
        </div>
      ))}
    </div>
  );
}

export default function Home({ profile, update, onLock, theme, onTheme }) {
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
    return <Chat role="owner" code={profile.ownCode} secret={profile.ownSecret} title="You"
      onBack={() => setView(null)} onLock={onLock} theme={theme} onTheme={onTheme} />;
  }
  if (view === 'guest' && profile.joined) {
    return <Chat role="guest" code={profile.joined.code} secret={profile.joined.secret}
      title="Friend" onBack={() => setView(null)} onLock={onLock} theme={theme} onTheme={onTheme} />;
  }

  return (
    <div className="page homepage">
      <header className="homebar">
        <div className="brand">
          <span className="logo"><Icon name="shield" size={17} /></span>
          <span>Private Chat</span>
        </div>
        <div className="row">
          <button className="iconbtn" onClick={onTheme} aria-label="Switch theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button className="iconbtn" onClick={onLock} aria-label="Lock"><Icon name="lock" /></button>
        </div>
      </header>

      <div className="home">
        <section className="hero">
          <div className="eyebrow">Your private code</div>
          <Tiles code={profile.ownCode} />
          <div className="pills">
            <button className="pill" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copied' : 'Copy'}
            </button>
            {navigator.share && (
              <button className="pill" onClick={share}><Icon name="share" size={15} />Share</button>
            )}
            <button className="pill" onClick={newCode}><Icon name="refresh" size={15} />New code</button>
          </div>
          <button className="cta" onClick={() => setView('owner')}>
            <Icon name="message" size={18} />Open my chat
          </button>
          <p className="hint">Give this code to one person. They can join your chat.</p>
        </section>

        <section className="panel">
          <div className="paneltitle"><Icon name="user" size={18} /><h3>Join a friend</h3></div>
          {profile.joined ? (
            <>
              <Tiles code={profile.joined.code} small />
              <div className="row">
                <button className="primary grow" onClick={() => setView('guest')}>Open chat</button>
                <button className="danger" onClick={leave}>Leave</button>
              </div>
            </>
          ) : (
            <form onSubmit={join} className="joinrow">
              <input placeholder="ENTER CODE" value={joinInput} maxLength={12} autoCapitalize="characters"
                autoComplete="off" spellCheck="false" onChange={(e) => setJoinInput(e.target.value)} />
              <button className="primary" disabled={busy}>{busy ? '...' : 'Join'}</button>
            </form>
          )}
        </section>

        {msg && <div className="err center-text">{msg}</div>}

        <ul className="perks">
          <li><Icon name="eyeoff" size={20} /><span>No account</span></li>
          <li><Icon name="clock" size={20} /><span>Gone in 4 hours</span></li>
          <li><Icon name="shield" size={20} /><span>Nothing saved</span></li>
        </ul>
      </div>
    </div>
  );
}
