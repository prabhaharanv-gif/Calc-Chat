import { useCallback, useEffect, useRef, useState } from 'react';
import Chat from './Chat.jsx';
import Icon from './Icon.jsx';
import { post } from './api.js';
import { randomCode, randomSecret } from './storage.js';
import { getIdentity } from './identity.js';

const JOIN_ERRORS = {
  not_found: 'Code not found. Ask your friend to open the app once, then try again.',
  full: 'That chat already has two people.',
  own_code: 'That is your own code. Share it with a friend instead.',
  rate: 'Too many tries. Wait a minute.',
  bad_code: 'Code looks wrong (8 letters/numbers).',
};

const TABS = [
  { id: 'chat', label: 'Chat', icon: 'message' },
  { id: 'join', label: 'Join', icon: 'user' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

const PRIVACY = [
  ['lock', 'End-to-end encrypted'],
  ['clock', 'Messages vanish after 4 hours'],
  ['shield', 'Nothing is ever saved'],
  ['eyeoff', 'No account, no phone number'],
];

// 8-character code shown as two groups of four tiles.
function Tiles({ code, small }) {
  return (
    <div className={`hm-tiles ${small ? 'small' : ''}`}>
      {[0, 4].map((s) => (
        <div className="hm-tg" key={s}>
          {code.slice(s, s + 4).split('').map((c, i) => <span key={i} className="hm-tile">{c}</span>)}
        </div>
      ))}
    </div>
  );
}

export default function Home({ profile, update, onLock, theme, onTheme, activeRoom, jump, onSeen }) {
  const [view, setView] = useState(null); // null | 'owner' | 'guest'
  const [tab, setTab] = useState(profile.name ? 'chat' : 'settings');
  const [joinInput, setJoinInput] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!profile.name); // ask for a name if none is set yet
  const [nameDraft, setNameDraft] = useState(profile.name || '');
  const timer = useRef(null);

  const flash = useCallback((text, err = false) => {
    clearTimeout(timer.current);
    setToast({ text, err });
    timer.current = setTimeout(() => setToast(null), 2400);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Tell the app which chat is open (so it does not notify about it), and open one when a banner is tapped.
  useEffect(() => {
    if (activeRoom) activeRoom.current = view;
    return () => { if (activeRoom) activeRoom.current = null; };
  }, [view, activeRoom]);
  useEffect(() => {
    if (jump && (jump.role === 'owner' || profile.joined)) { setTab('chat'); setView(jump.role); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.id]);

  const signalOn = profile.notify !== false;
  const toggleSignal = () => update({ notify: !signalOn });

  const host = useCallback(async () => {
    try {
      const id = await getIdentity();
      const r = await post('/api/host', { code: profile.ownCode, secret: profile.ownSecret, name: profile.name, pub: id?.pubJson });
      if (!r.ok) flash('Server problem. Try again.', true);
    } catch { flash('Cannot reach server.', true); }
  }, [profile.ownCode, profile.ownSecret, profile.name, flash]);

  useEffect(() => { host(); }, [host]);

  const saveName = (e) => {
    e.preventDefault();
    const n = nameDraft.trim().slice(0, 24);
    if (!n) return;
    update({ name: n });
    setEditing(false);
    if (!profile.name) setTab('chat');
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(profile.ownCode); flash('Code copied'); } catch { flash('Copy blocked by the browser', true); }
  };
  const share = () => navigator.share?.({ text: `Join my private chat. Code: ${profile.ownCode}` }).catch(() => {});

  const newCode = async () => {
    if (!confirm('Create a new code? The old code and its chat will be deleted.')) return;
    try { await post('/api/close', { code: profile.ownCode, secret: profile.ownSecret }); } catch { /* offline */ }
    update({ ownCode: randomCode(), ownSecret: randomSecret() });
    flash('New code created');
  };

  const join = async (e) => {
    e.preventDefault();
    const code = joinInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 8) return flash(JOIN_ERRORS.bad_code, true);
    setBusy(true);
    try {
      const secret = randomSecret();
      const id = await getIdentity();
      const r = await post('/api/join', { code, secret, name: profile.name, pub: id?.pubJson });
      if (r.ok) {
        update({ joined: { code, secret } });
        setJoinInput('');
        setView('guest');
      } else flash(JOIN_ERRORS[r.error] || 'Could not join.', true);
    } catch { flash('Cannot reach server.', true); }
    setBusy(false);
  };

  const leave = async () => {
    if (!confirm('Leave this chat? Its messages will be deleted.')) return;
    try { await post('/api/close', profile.joined); } catch { /* offline */ }
    update({ joined: null });
  };

  if (view === 'owner') {
    return <Chat role="owner" code={profile.ownCode} secret={profile.ownSecret} name={profile.name}
      onBack={() => setView(null)} onLock={onLock} theme={theme} onTheme={onTheme} onSeen={onSeen} />;
  }
  if (view === 'guest' && profile.joined) {
    return <Chat role="guest" code={profile.joined.code} secret={profile.joined.secret}
      name={profile.name} onBack={() => setView(null)} onLock={onLock} theme={theme} onTheme={onTheme} onSeen={onSeen} />;
  }

  return (
    <div className="page hm">
      <div className="hm-blob b1" />
      <div className="hm-blob b2" />

      <header className="hm-head">
        <div>
          <div className="hm-hello">{profile.name ? 'Hello,' : 'Welcome'}</div>
          <div className="hm-name">{profile.name || 'Set up your profile'}</div>
        </div>
        <div className="row">
          <button className="iconbtn glass" onClick={onTheme} aria-label="Switch theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button className="iconbtn glass" onClick={onLock} aria-label="Lock"><Icon name="lock" /></button>
        </div>
      </header>

      <main className="hm-main">
        <div className="hm-stack" key={tab}>
          {tab === 'chat' && (
            <>
              <section className="hm-key">
                <span className="hm-chip"><Icon name="lock" size={12} />End-to-end encrypted</span>
                <div className="hm-label">YOUR PRIVATE CODE</div>
                <button className="hm-code" onClick={copy} aria-label="Copy your code"><Tiles code={profile.ownCode} /></button>
                <div className="hm-tap">Tap the code to copy</div>
                <div className="hm-actions">
                  {navigator.share && <button className="hm-pill" onClick={share}><Icon name="share" size={15} />Share</button>}
                  <button className="hm-pill" onClick={copy}><Icon name="copy" size={15} />Copy</button>
                  <button className="hm-pill" onClick={newCode}><Icon name="refresh" size={15} />New code</button>
                </div>
              </section>

              <button className="hm-cta" onClick={() => setView('owner')}>
                <Icon name="message" size={20} />Open my chat
              </button>

              {profile.joined && (
                <button className="hm-friend" onClick={() => setView('guest')}>
                  <span className="hm-fi"><Icon name="user" size={18} /></span>
                  <span className="grow">
                    <b>Friend&apos;s chat</b>
                    <small>{profile.joined.code}</small>
                  </span>
                  <Icon name="arrow" size={18} />
                </button>
              )}
            </>
          )}

          {tab === 'join' && (
            <section className="hm-card">
              <div className="hm-bigicon"><Icon name="user" size={28} /></div>
              <h2>Join a friend</h2>
              {profile.joined ? (
                <>
                  <p>You are connected with</p>
                  <Tiles code={profile.joined.code} small />
                  <button className="hm-cta" onClick={() => setView('guest')}><Icon name="message" size={20} />Open chat</button>
                  <button className="hm-link bad" onClick={leave}>Leave this chat</button>
                </>
              ) : (
                <>
                  <p>Enter the 8-letter code your friend shared with you.</p>
                  <form onSubmit={join} className="hm-joinform">
                    <input placeholder="ENTER CODE" value={joinInput} maxLength={12} autoCapitalize="characters"
                      autoComplete="off" spellCheck="false" onChange={(e) => setJoinInput(e.target.value)} />
                    <button className="hm-cta" disabled={busy}>{busy ? 'Joining...' : 'Join chat'}</button>
                  </form>
                </>
              )}
            </section>
          )}

          {tab === 'settings' && (
            <>
              <section className="hm-group">
                <h4>Profile</h4>
                <div className="hm-row">
                  <span className="hm-k">Name</span>
                  {editing ? (
                    <form className="hm-nameform" onSubmit={saveName}>
                      <input autoFocus value={nameDraft} maxLength={24} placeholder="Your name"
                        onChange={(e) => setNameDraft(e.target.value)} />
                      <button className="hm-save">Save</button>
                    </form>
                  ) : (
                    <>
                      <span className="hm-v grow">{profile.name}</span>
                      <button className="hm-edit" aria-label="Edit name"
                        onClick={() => { setNameDraft(profile.name || ''); setEditing(true); }}><Icon name="edit" size={16} /></button>
                    </>
                  )}
                </div>
              </section>

              <section className="hm-group">
                <h4>Message signal</h4>
                <div className="hm-row">
                  <span className="hm-pi"><Icon name="message" size={16} /></span>
                  <span className="hm-v grow">Secret signal
                    <small>Every game title turns green when a message is waiting (maroon = none).</small>
                  </span>
                  <button className={`hm-switch ${signalOn ? 'on' : ''}`} onClick={toggleSignal}
                    role="switch" aria-checked={signalOn} aria-label="Secret message signal" />
                </div>
              </section>

              <section className="hm-group hm-privacy">
                <h4>Privacy</h4>
                {PRIVACY.map(([icon, text]) => (
                  <div className="hm-row" key={text}>
                    <span className="hm-pi"><Icon name={icon} size={16} /></span>
                    <span className="hm-v">{text}</span>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </main>

      {toast && <div className={`hm-toast ${toast.err ? 'err' : ''}`}>{toast.text}</div>}

      <nav className="hm-dock" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={20} />{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
