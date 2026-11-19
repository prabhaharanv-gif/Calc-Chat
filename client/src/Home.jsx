import { useCallback, useEffect, useRef, useState } from 'react';
import Chat from './Chat.jsx';
import Icon from './Icon.jsx';
import { post } from './api.js';
import { randomCode, randomSecret } from './storage.js';
import { getIdentity } from './identity.js';
import { isNative, getSecure, setSecure } from './watcher.js';

const JOIN_ERRORS = {
  not_found: 'Code not found. Ask your friend to open the app once, then try again.',
  full: 'That chat already has two people.',
  own_code: 'That is your own code. Share it with a friend instead.',
  rate: 'Too many tries. Wait a minute.',
  bad_code: 'Code looks wrong (8 letters/numbers).',
};

const PRIVACY = [
  ['lock', 'End-to-end encrypted'],
  ['clock', 'Messages vanish after 30 minutes'],
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

export default function Home({ profile, update, onLock, theme, onTheme, activeRoom, onSeen, onView }) {
  const [view, setView] = useState(null); // null | 'owner' | 'guest'
  const [tab, setTab] = useState(profile.name ? 'chat' : 'settings');
  const [joinInput, setJoinInput] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!profile.name); // ask for a name if none is set yet
  const [nameDraft, setNameDraft] = useState(profile.name || '');
  const timer = useRef(null);
  const [renaming, setRenaming] = useState(null); // 'owner' | 'guest' while a chat name is being edited
  const [renameDraft, setRenameDraft] = useState('');
  const chatName = (role) => profile.chatNames?.[role] || (role === 'owner' ? 'My chat' : "Friend's chat");
  const startRename = (role) => { setRenameDraft(chatName(role)); setRenaming(role); };
  const saveRename = (e) => {
    e.preventDefault();
    const n = renameDraft.trim().slice(0, 24);
    update({ chatNames: { ...(profile.chatNames || {}), [renaming]: n } }); // empty = back to the default name
    setRenaming(null);
  };
  const [ask, setAsk] = useState(null); // in-app confirm dialog (native confirm() is blocked in some app webviews)

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
  useEffect(() => { onView?.(view); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoWipe = profile.autoWipe !== false;
  const toggleAutoWipe = () => {
    if (autoWipe) { update({ autoWipe: false, fails: 0 }); return; }
    setAsk({
      text: 'Silent Auto-Wipe can permanently delete your private chats. After 3 wrong PIN attempts in a row, all chat data on this device is erased and the chat is deleted on the server. This may also remove the conversation for your friend. It happens without any warning.',
      yes: 'Turn on',
      run: () => update({ autoWipe: true, fails: 0 }),
    });
  };
  const hold = profile.holdMs === 0 ? 0 : profile.holdMs || 2000;
  const [shotsBlocked, setShotsBlocked] = useState(true); // Android: screenshots / recent-apps preview blocked
  useEffect(() => { if (isNative) getSecure().then(setShotsBlocked); }, []);
  const toggleShots = () => { const next = !shotsBlocked; setShotsBlocked(next); setSecure(next); };
  const pinOn = profile.pinOn !== false;
  const togglePin = () => {
    if (!pinOn) { update({ pinOn: true }); return; }
    setAsk({
      text: 'Turn the passcode off? Anyone who holds a game title for a moment will open your chats without a code. Silent Auto-Wipe cannot protect you while it is off.',
      yes: 'Turn off',
      run: () => update({ pinOn: false, fails: 0 }),
    });
  };
  const signalOn = profile.notify !== false;
  const toggleSignal = () => update({ notify: !signalOn });

  const host = useCallback(async () => {
    try {
      const id = await getIdentity();
      const r = await post('/api/host', { code: profile.ownCode, secret: profile.ownSecret, pub: id?.pubJson });
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

  const newCode = () => setAsk({ text: 'Delete this chat? The old code and its messages will be deleted and a new code is created.', yes: 'Delete', run: doNewCode });
  const doNewCode = async () => {
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
      const r = await post('/api/join', { code, secret, pub: id?.pubJson });
      if (r.ok) {
        update({ joined: { code, secret } });
        setJoinInput('');
        setView('guest');
      } else flash(JOIN_ERRORS[r.error] || 'Could not join.', true);
    } catch { flash('Cannot reach server.', true); }
    setBusy(false);
  };

  const leave = () => setAsk({ text: 'Leave this chat? Its messages will be deleted.', yes: 'Leave', run: doLeave });
  const doLeave = async () => {
    try { await post('/api/close', profile.joined); } catch { /* offline */ }
    update({ joined: null });
  };

  if (view === 'owner') {
    return <Chat role="owner" code={profile.ownCode} secret={profile.ownSecret} name={profile.name} hidden={!!profile.hide?.owner}
      onBack={() => setView(null)} onLock={onLock} theme={theme} onTheme={onTheme} onSeen={onSeen} />;
  }
  if (view === 'guest' && profile.joined) {
    return <Chat role="guest" code={profile.joined.code} secret={profile.joined.secret}
      name={profile.name} hidden={!!profile.hide?.guest} onBack={() => setView(null)} onLock={onLock} theme={theme} onTheme={onTheme} onSeen={onSeen} />;
  }

  return (
    <div className="page hm">
      <div className="hm-blob b1" />
      <div className="hm-blob b2" />

      <header className="hm-head">
        {tab === 'chat' ? (
          <div>
            <div className="hm-hello">{profile.name ? 'Hello,' : 'Welcome'}</div>
            <div className="hm-name">{profile.name || 'Set up your profile'}</div>
          </div>
        ) : (
          <div className="row">
            <button className="iconbtn glass" onClick={() => setTab('chat')} aria-label="Back"><Icon name="back" /></button>
            <div className="hm-name">{tab === 'join' ? 'Join a friend' : 'Settings'}</div>
          </div>
        )}
        <div className="row">
          <button className="iconbtn glass" onClick={onTheme} aria-label="Switch theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button className="iconbtn glass" onClick={() => setTab('settings')} aria-label="Settings"><Icon name="gear" /></button>
          <button className="iconbtn glass" onClick={onLock} aria-label="Lock"><Icon name="lock" /></button>
        </div>
      </header>

      <main className="hm-main">
        <div className={`hm-stack ${tab === 'settings' ? 'set' : ''}`} key={tab}>
          {tab === 'chat' && (
            <>
              <section className="hm-pass">
                <div className="hm-pass-top">
                  <span><Icon name="lock" size={12} />PRIVATE PASS</span>
                  <span className="hm-pass-n">{profile.name}</span>
                </div>
                <button className="hm-pass-code" onClick={copy} aria-label="Copy your code">
                  {[0, 4].map((s) => (
                    <span className="hm-pass-g" key={s}>{profile.ownCode.slice(s, s + 4)}</span>
                  ))}
                </button>
                <div className="hm-pass-foot">
                  <span>Tap the code to copy</span>
                  <div className="hm-actions">
                    {navigator.share && <button className="hm-pb" onClick={share} aria-label="Share code"><Icon name="share" size={16} /></button>}
                    <button className="hm-pb" onClick={copy} aria-label="Copy code"><Icon name="copy" size={16} /></button>
                    <button className="hm-pb" onClick={newCode} aria-label="New code"><Icon name="refresh" size={16} /></button>
                  </div>
                </div>
              </section>

              <div className="hm-sec">YOUR CHATS</div>
              {[['owner', newCode, 'Delete'], ...(profile.joined ? [['guest', leave, 'Leave']] : [])].map(([role, act, label]) => {
                const visible = !profile.hide?.[role];
                return (
                  <article className="hm-chat" key={role}>
                    {renaming === role ? (
                      <form className="hm-chat-main hm-rename" onSubmit={saveRename}>
                        <input autoFocus value={renameDraft} maxLength={24} placeholder="Chat name"
                          onChange={(e) => setRenameDraft(e.target.value)} onBlur={saveRename} />
                        <button className="hm-save">Save</button>
                      </form>
                    ) : (
                      <button className="hm-chat-main" onClick={() => setView(role)}>
                        <span className={`hm-av ${visible ? 'on' : ''}`}>{(chatName(role)[0] || '?').toUpperCase()}</span>
                        <span className="grow">
                          <b>{chatName(role)}</b>
                          <small>{role === 'owner' ? profile.ownCode : profile.joined?.code}</small>
                        </span>
                      </button>
                    )}
                    <div className="hm-chat-ctl">
                      <button className={`hm-tog ${visible ? 'on' : ''}`} role="switch" aria-checked={visible}
                        aria-label="Show me online in this chat"
                        onClick={() => update({ hide: { ...(profile.hide || {}), [role]: visible } })}>
                        <span className="hm-knob" />
                        <em>{visible ? 'Online' : 'Offline'}</em>
                      </button>
                      <div className="row">
                        <button className="hm-sb" onClick={() => startRename(role)} aria-label="Rename chat"><Icon name="edit" size={15} /></button>
                        <button className="hm-sb bad" onClick={act} aria-label={`${label} chat`}><Icon name="trash" size={15} /></button>
                      </div>
                    </div>
                  </article>
                );
              })}

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
                <h4>Security</h4>
                <div className="hm-row">
                  <span className="hm-pi"><Icon name="lock" size={16} /></span>
                  <span className="hm-v grow">Passcode lock
                    <small>{pinOn ? 'A code is needed after you hold a game title.' : 'Off: holding a game title opens your chats directly.'}</small>
                  </span>
                  <button className={`hm-switch ${pinOn ? 'on' : ''}`} onClick={togglePin}
                    role="switch" aria-checked={pinOn} aria-label="Passcode lock" />
                </div>
                {isNative && (
                  <div className="hm-row">
                    <span className="hm-pi"><Icon name="eyeoff" size={16} /></span>
                    <span className="hm-v grow">Block screenshots
                      <small>{shotsBlocked ? 'Screenshots, screen recording and the recent-apps preview are blocked.' : 'Off: screenshots and screen recording are allowed.'}</small>
                    </span>
                    <button className={`hm-switch ${shotsBlocked ? 'on' : ''}`} onClick={toggleShots}
                      role="switch" aria-checked={shotsBlocked} aria-label="Block screenshots" />
                  </div>
                )}
                <div className="hm-row">
                  <span className="hm-pi"><Icon name="shield" size={16} /></span>
                  <span className="hm-v grow">Silent Auto-Wipe
                    <small>Automatically reset private chat data after 3 consecutive incorrect PIN attempts.</small>
                  </span>
                  <button className={`hm-switch ${autoWipe ? 'on' : ''}`} onClick={toggleAutoWipe}
                    role="switch" aria-checked={autoWipe} aria-label="Silent Auto-Wipe" />
                </div>
              </section>

              <section className="hm-group">
                <h4>Hold time</h4>
                <div className="hm-row">
                  <span className="hm-v grow">Hold a game title to open the PIN pad
                    <small>{hold === 0 ? 'No hold: just tap a game title.' : 'How long you press before it opens.'}</small>
                  </span>
                  <div className="hm-seg" role="radiogroup" aria-label="Hold time">
                    <button role="radio" aria-checked={hold === 0} aria-label="No hold (tap)" title="No hold (tap)"
                      className={`off ${hold === 0 ? 'on' : ''}`} onClick={() => update({ holdMs: 0 })}><Icon name="ban" size={16} /></button>
                    {[1000, 2000, 3000].map((ms) => (
                      <button key={ms} role="radio" aria-checked={hold === ms}
                        className={hold === ms ? 'on' : ''} onClick={() => update({ holdMs: ms })}>{ms / 1000}s</button>
                    ))}
                  </div>
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

      {ask && (
        <div className="hm-dlg" onClick={() => setAsk(null)}>
          <div className="hm-dlgbox" onClick={(e) => e.stopPropagation()}>
            <p>{ask.text}</p>
            <div className="hm-dlgbtns">
              <button onClick={() => setAsk(null)}>Cancel</button>
              <button className={ask.yes === 'Turn on' ? '' : 'bad'} onClick={() => { const r = ask.run; setAsk(null); r(); }}>{ask.yes}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`hm-toast ${toast.err ? 'err' : ''}`}>{toast.text}</div>}

      {tab === 'chat' && (
        <button className="hm-fab" onClick={() => setTab('join')} aria-label="Join a friend's chat"><Icon name="plus" size={26} /></button>
      )}
    </div>
  );
}
