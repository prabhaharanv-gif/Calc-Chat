import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SERVER } from './config.js';
import { post } from './api.js';
import Icon from './Icon.jsx';
import { deriveKey, encryptBytes, decryptBytes, encText, decText, safetyNumber } from './e2e.js';
import { getIdentity } from './identity.js';

const MAX_FILE = 25 * 1024 * 1024;
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const LABELS = { image: 'Photo', video: 'Video', audio: 'Voice message', file: 'File' };
const QICON = { image: 'image', video: 'video', audio: 'mic', file: 'file' };
const preview = (m) => {
  if (!m) return 'Message deleted';
  if (m.failed) return 'Message';
  if (m.type === 'text') return m.text;
  if (m.type === 'file') return m.name || 'File';
  return LABELS[m.type] || 'Message';
};
const revoke = (list) => list.forEach((m) => m.url && URL.revokeObjectURL(m.url));

// Decrypt one message from the server. Media becomes a temporary in-memory blob URL.
async function open(m, key) {
  const { payload, data, meta, ...rest } = m;
  try {
    if (m.type === 'text') return { ...rest, text: await decText(key, payload) };
    const info = meta ? JSON.parse(await decText(key, meta)) : {};
    const bytes = await decryptBytes(key, data);
    return {
      ...rest,
      name: info.name,
      duration: info.duration,
      url: URL.createObjectURL(new Blob([bytes], { type: info.mime || 'application/octet-stream' })),
    };
  } catch {
    return { ...rest, failed: true, text: '' };
  }
}

export default function Chat({ role, code, secret, name, onBack, onLock, theme, onTheme }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [presence, setPresence] = useState({ owner: false, guest: false });
  const [ready, setReady] = useState(false); // shared encryption key established
  const [safety, setSafety] = useState('');
  const [info, setInfo] = useState(false);
  const [recording, setRecording] = useState(false);
  const [menu, setMenu] = useState(null); // message whose action dropdown is open
  const [menuPos, setMenuPos] = useState(null); // bubble rectangle the dropdown hangs from
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [flash, setFlash] = useState(null);
  const sock = useRef(null);
  const msgsRef = useRef([]);
  const recRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const keyBox = useRef({ pub: null, key: null, waiters: [] });
  const chain = useRef(Promise.resolve());

  const setAll = (next) => { msgsRef.current = next; setMsgs(next); };

  useEffect(() => {
    let dead = false;
    let s = null;
    const box = keyBox.current;
    box.pub = null;
    box.key = null;
    box.waiters = [];
    chain.current = Promise.resolve();
    // Events are processed in order, even though decryption is asynchronous.
    const enqueue = (fn) => { chain.current = chain.current.then(fn).catch(() => {}); };
    const waitKey = async () => {
      while (!box.key) await new Promise((r) => box.waiters.push(r));
      return box.key;
    };

    (async () => {
      const id = await getIdentity();
      if (dead) return;
      if (!id) { setError('Secure chat needs HTTPS or the Android app.'); return; }
      s = io(SERVER || undefined, { auth: { code, secret, name, pub: id.pubJson } });
      sock.current = s;

      s.on('connect', () => { setStatus('online'); setError(''); });
      s.on('disconnect', () => setStatus('offline'));
      s.on('connect_error', async (e) => {
        if (e.message === 'no_room' && role === 'owner') {
          try { await post('/api/host', { code, secret, name, pub: id.pubJson }); setTimeout(() => s.connect(), 300); return; } catch { /* fall through */ }
        }
        if (e.message === 'no_room') setError('Chat not available yet. Ask the owner to open the app.');
        else if (e.message === 'forbidden') setError('You no longer have access to this chat.');
        else setError('Cannot reach server. Retrying...');
        setStatus('offline');
      });

      s.on('history', (h) => enqueue(async () => {
        const key = await waitKey();
        const out = [];
        for (const m of h) out.push(await open(m, key));
        revoke(msgsRef.current);
        setAll(out);
      }));
      s.on('message', (m) => enqueue(async () => {
        const o = await open(m, await waitKey());
        setAll([...msgsRef.current, o]);
      }));
      s.on('update', (u) => enqueue(async () => {
        const { payload, ...rest } = u;
        if (payload) {
          try { rest.text = await decText(await waitKey(), payload); } catch { rest.failed = true; }
        }
        setAll(msgsRef.current.map((m) => (m.id === rest.id ? { ...m, ...rest } : m)));
      }));
      s.on('deleted', ({ id: gone }) => enqueue(async () => {
        const m = msgsRef.current.find((x) => x.id === gone);
        if (m) revoke([m]);
        setAll(msgsRef.current.filter((x) => x.id !== gone));
        setReplyTo((r) => (r?.id === gone ? null : r));
        setEditing((e) => { if (e?.id === gone) { setText(''); return null; } return e; });
      }));
      s.on('cleared', () => enqueue(async () => {
        revoke(msgsRef.current);
        setAll([]);
        setReplyTo(null);
        setEditing(null);
        setMenu(null);
      }));
      s.on('closed', () => { alert('This chat was closed by the owner.'); onBack(); });

      // The friend's public key arrives here; combine it with ours to get the shared secret.
      s.on('presence', async (p) => {
        setPresence(p);
        const peerPub = (role === 'owner' ? p.guestPub : p.ownerPub) || null;
        if (peerPub === box.pub) return;
        box.pub = peerPub;
        if (!peerPub) { box.key = null; setReady(false); setSafety(''); return; }
        try {
          const k = await deriveKey(id.privJwk, peerPub, code);
          if (box.pub !== peerPub) return;
          box.key = k;
          setReady(true);
          setSafety(await safetyNumber(id.pubJson, peerPub));
          box.waiters.splice(0).forEach((r) => r());
        } catch { setError("Your friend's encryption key is invalid."); }
      });
    })();

    // Local auto-delete when a message reaches its 4 hour limit.
    const timer = setInterval(() => {
      const now = Date.now();
      const keep = [];
      const drop = [];
      msgsRef.current.forEach((m) => (m.expiresAt > now ? keep : drop).push(m));
      if (drop.length) { revoke(drop); setAll(keep); }
    }, 10000);

    return () => {
      dead = true;
      clearInterval(timer);
      s?.disconnect();
      revoke(msgsRef.current);
      msgsRef.current = [];
      recRef.current?.stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, secret, role]);

  // Scroll down only when a new message arrives (not for reactions/edits).
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  const peerName = (role === 'owner' ? presence.guestName : presence.ownerName) || 'Friend';
  const peerOnline = role === 'owner' ? presence.guest : presence.owner;
  const sub = error || (status !== 'online' ? 'Connecting...' : peerOnline ? 'Online' : 'Waiting for the other person');

  const needKey = () => {
    const k = keyBox.current.key;
    if (!k) alert('Waiting for your friend to join so the secure key can be set up.');
    return k;
  };

  const sendText = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const key = needKey();
    if (!key) return;
    const payload = await encText(key, t);
    if (editing) {
      sock.current?.emit('edit', { id: editing.id, payload });
      setEditing(null);
    } else {
      sock.current?.emit('message', { type: 'text', payload, replyTo: replyTo?.id });
      setReplyTo(null);
    }
    setText('');
  };

  const sendBlob = async (blob, type, extra = {}) => {
    const key = needKey();
    if (!key) return;
    const meta = await encText(key, JSON.stringify({ name: blob.name || '', mime: blob.type || '', ...extra }));
    const data = await encryptBytes(key, await blob.arrayBuffer());
    const rid = replyTo?.id;
    setReplyTo(null);
    return new Promise((resolve) => {
      sock.current.emit('message', { type, data, meta, replyTo: rid }, (r) => {
        if (!r?.ok) alert('Could not send (max 25 MB).');
        resolve();
      });
    });
  };

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_FILE) return alert('Max file size is 25 MB.');
    const type = f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video'
      : f.type.startsWith('audio/') ? 'audio' : 'file';
    await sendBlob(f, type);
  };

  const toggleRecord = async () => {
    if (recRef.current) { recRef.current.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return alert('Voice messages need HTTPS or the Android app.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      const t0 = Date.now();
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
        setRecording(false);
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        if (blob.size) sendBlob(blob, 'audio', { duration: Math.round((Date.now() - t0) / 1000) });
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
    } catch { alert('Microphone permission denied.'); }
  };

  const clearChat = () => {
    if (confirm('Clear this chat for both people?')) sock.current?.emit('clear');
  };

  // ---- message actions ----
  const react = (id, emoji) => sock.current?.emit('react', { id, emoji });
  const closeMenu = () => setMenu(null);
  const doReact = (emoji) => { react(menu.id, emoji); closeMenu(); };
  const doReply = () => { setReplyTo(menu); setEditing(null); closeMenu(); inputRef.current?.focus(); };
  const doEdit = () => { setEditing(menu); setReplyTo(null); setText(menu.text); closeMenu(); inputRef.current?.focus(); };
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(menu.text); } catch { /* clipboard blocked */ }
    closeMenu();
  };
  const doDelete = () => {
    const id = menu.id;
    closeMenu();
    if (confirm('Delete this message for everyone?')) sock.current?.emit('delete', { id });
  };
  const cancelCtx = () => { setReplyTo(null); setEditing(null); setText(''); };

  const jump = (id) => {
    const el = document.getElementById(`m-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(id);
    setTimeout(() => setFlash(null), 1200);
  };

  const onBubbleClick = (e, m) => {
    if (['AUDIO', 'VIDEO', 'A'].includes(e.target.tagName)) return;
    const r = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    setMenu(m);
  };

  const groupReactions = (m) => {
    const groups = {};
    Object.entries(m.reactions || {}).forEach(([r, em]) => {
      if (!groups[em]) groups[em] = [];
      groups[em].push(r);
    });
    return Object.entries(groups);
  };

  const ctx = editing || replyTo;

  return (
    <div className="page chat">
      <header className="bar">
        <button className="iconbtn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <div className="grow" onClick={() => setInfo(true)} style={{ cursor: 'pointer' }}>
          <div>{peerName}</div>
          <div className="muted small subline">
            {ready && !error && <Icon name="lock" size={11} />}{sub}
          </div>
        </div>
        <button className="iconbtn" onClick={onTheme} aria-label="Switch theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button className="iconbtn" onClick={clearChat} aria-label="Clear chat for both"><Icon name="trash" /></button>
        <button className="iconbtn" onClick={onLock} aria-label="Lock"><Icon name="lock" /></button>
      </header>

      <div className="msgs">
        {msgs.length === 0 && (
          <div className="empty">
            {role === 'owner' ? <>Share your code <b>{code}</b> with a friend to start chatting.</> : 'Say hi 👋'}
            <div className="small">
              {ready ? 'End-to-end encrypted. ' : 'Chat opens when your friend joins. '}
              Messages auto-delete after 4 hours. Nothing is saved.
            </div>
          </div>
        )}
        {msgs.map((m) => {
          const mine = m.from === role;
          const orig = m.replyTo ? msgs.find((x) => x.id === m.replyTo) : null;
          const timeEl = (
            <div className="time">
              {m.edited && <span>edited</span>}
              {new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          );
          const broken = <div className="txt muted"><i>Can&apos;t decrypt this message</i></div>;
          return (
            <div key={m.id} id={`m-${m.id}`} className={`bubble ${mine ? 'me' : ''} ${flash === m.id ? 'flash' : ''} ${groupReactions(m).length ? 'hasr' : ''}`}
              onClick={(e) => onBubbleClick(e, m)}>
              {m.replyTo && (
                <div className="quote" onClick={(e) => { e.stopPropagation(); jump(m.replyTo); }}>
                  <b>{orig ? (orig.from === role ? 'You' : peerName) : 'Message'}</b>
                  <span>
                    {orig && QICON[orig.type] && <Icon name={QICON[orig.type]} size={15} />}
                    {preview(orig)}
                  </span>
                </div>
              )}
              {m.type === 'text' && (
                <div className="line">
                  {m.failed ? broken : <div className="txt">{m.text}</div>}
                  {timeEl}
                </div>
              )}
              {m.type !== 'text' && (m.failed ? broken : (
                <>
                  {m.type === 'image' && <img src={m.url} alt="" draggable={false} />}
                  {m.type === 'video' && <video src={m.url} controls playsInline controlsList="nodownload" />}
                  {m.type === 'audio' && <audio src={m.url} controls controlsList="nodownload" />}
                  {m.type === 'file' && <a href={m.url} download={m.name || 'file'}>📎 {m.name || 'file'}</a>}
                </>
              ))}
              {groupReactions(m).length > 0 && (
                <div className="reacts">
                  {groupReactions(m).map(([em, roles]) => (
                    <button key={em} className={`rchip ${roles.includes(role) ? 'on' : ''}`}
                      onClick={(e) => { e.stopPropagation(); react(m.id, em); }}>
                      {em}{roles.length > 1 && <span>{roles.length}</span>}
                    </button>
                  ))}
                </div>
              )}
              {m.type !== 'text' && timeEl}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {ctx && (
        <div className="ctxbar">
          <div className="ctxbody">
            <div className="ctxlabel">
              {editing ? 'Editing message' : `Replying to ${replyTo.from === role ? 'yourself' : peerName}`}
            </div>
            <div className="ctxtext">{preview(ctx)}</div>
          </div>
          <button className="iconbtn small" onClick={cancelCtx} aria-label="Cancel"><Icon name="x" size={16} /></button>
        </div>
      )}

      <form className="composer" onSubmit={sendText}>
        <label className={`icon ${ready ? '' : 'off'}`} title="Photo / video / file">
          <Icon name="clip" size={20} />
          <input type="file" accept="image/*,video/*,audio/*,*/*" onChange={onPick} disabled={!ready} hidden />
        </label>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} disabled={recording || !ready}
          placeholder={recording ? '● Recording... tap mic to send' : ready ? 'Type a message' : 'Waiting for your friend to join...'} />
        {text.trim() ? (
          <button className="send">{editing ? 'Save' : 'Send'}</button>
        ) : (
          <button type="button" className={`icon mic ${recording ? 'rec' : ''}`} onClick={toggleRecord} disabled={!ready}><Icon name="mic" size={20} /></button>
        )}
      </form>

      {info && (
        <div className="popwrap" onClick={() => setInfo(false)}>
          <div className="pop infopop" onClick={(e) => e.stopPropagation()}>
            <div className="infohead"><Icon name="shield" size={18} />End-to-end encrypted</div>
            {ready ? (
              <>
                <p>Only you and {peerName} can read these messages. Not even the server can.</p>
                <div className="muted small">Safety number</div>
                <div className="safety">{safety}</div>
                <p className="muted small">Compare this number with your friend (call or in person). If it matches, nobody is listening in.</p>
              </>
            ) : (
              <p>Encryption starts as soon as your friend joins.</p>
            )}
          </div>
        </div>
      )}

      {menu && menuPos && (() => {
        const isMine = menu.from === role;
        const canText = menu.type === 'text' && !menu.failed;
        const rows = 1 + (canText ? 1 : 0) + (isMine && canText ? 1 : 0) + (isMine ? 1 : 0);
        const W = 224;
        const H = 56 + rows * 38;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const left = Math.max(8, Math.min(isMine ? menuPos.right - W : menuPos.left, vw - W - 8));
        let top = menuPos.bottom + 6;
        if (top + H > vh - 8) {
          top = menuPos.top - H - 6;
          if (top < 8) top = Math.max(8, vh - H - 8);
        }
        return (
          <div className="popwrap" onClick={closeMenu}>
            <div className="pop" style={{ left, top, width: W }} onClick={(e) => e.stopPropagation()}>
              <div className="reactrow">
                {REACTIONS.map((em) => (
                  <button key={em} className={`rbtn ${menu.reactions?.[role] === em ? 'on' : ''}`} onClick={() => doReact(em)}>{em}</button>
                ))}
              </div>
              <button className="act" onClick={doReply}><Icon name="reply" size={17} />Reply</button>
              {canText && <button className="act" onClick={doCopy}><Icon name="copy" size={17} />Copy</button>}
              {isMine && canText && <button className="act" onClick={doEdit}><Icon name="edit" size={17} />Edit</button>}
              {isMine && <button className="act bad" onClick={doDelete}><Icon name="trash" size={17} />Delete</button>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
