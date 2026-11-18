import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SERVER } from './config.js';
import { post } from './api.js';
import Icon from './Icon.jsx';

const MAX_FILE = 25 * 1024 * 1024;
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const LABELS = { image: 'Photo', video: 'Video', audio: 'Voice message', file: 'File' };
const preview = (m) => (m.type === 'text' ? m.text : LABELS[m.type] || 'Message');

// Media arrives as binary; turn it into a temporary in-memory blob URL.
function hydrate(m) {
  if (!m.data) return m;
  const { data, ...rest } = m;
  return { ...rest, url: URL.createObjectURL(new Blob([data], { type: m.mime })) };
}
const revoke = (list) => list.forEach((m) => m.url && URL.revokeObjectURL(m.url));

export default function Chat({ role, code, secret, name, onBack, onLock, theme, onTheme }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [presence, setPresence] = useState({ owner: false, guest: false });
  const [recording, setRecording] = useState(false);
  const [menu, setMenu] = useState(null); // message whose action sheet is open
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [flash, setFlash] = useState(null);
  const sock = useRef(null);
  const msgsRef = useRef([]);
  const recRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const setAll = (next) => { msgsRef.current = next; setMsgs(next); };

  useEffect(() => {
    const s = io(SERVER || undefined, { auth: { code, secret, name } });
    sock.current = s;
    s.on('connect', () => { setStatus('online'); setError(''); });
    s.on('disconnect', () => setStatus('offline'));
    s.on('connect_error', async (e) => {
      if (e.message === 'no_room' && role === 'owner') {
        try { await post('/api/host', { code, secret }); setTimeout(() => s.connect(), 300); return; } catch { /* fall through */ }
      }
      if (e.message === 'no_room') setError('Chat not available yet. Ask the owner to open the app.');
      else if (e.message === 'forbidden') setError('You no longer have access to this chat.');
      else setError('Cannot reach server. Retrying...');
      setStatus('offline');
    });
    s.on('history', (h) => { revoke(msgsRef.current); setAll(h.map(hydrate)); });
    s.on('message', (m) => setAll([...msgsRef.current, hydrate(m)]));
    s.on('update', (u) => setAll(msgsRef.current.map((m) => (m.id === u.id ? { ...m, ...u } : m))));
    s.on('deleted', ({ id }) => {
      const gone = msgsRef.current.find((m) => m.id === id);
      if (gone) revoke([gone]);
      setAll(msgsRef.current.filter((m) => m.id !== id));
      setReplyTo((r) => (r?.id === id ? null : r));
      setEditing((e) => { if (e?.id === id) { setText(''); return null; } return e; });
    });
    s.on('cleared', () => {
      revoke(msgsRef.current);
      setAll([]);
      setReplyTo(null);
      setEditing(null);
      setMenu(null);
    });
    s.on('presence', setPresence);
    s.on('closed', () => { alert('This chat was closed by the owner.'); onBack(); });

    // Local auto-delete when a message reaches its 4 hour limit.
    const timer = setInterval(() => {
      const now = Date.now();
      const keep = [];
      const drop = [];
      msgsRef.current.forEach((m) => (m.expiresAt > now ? keep : drop).push(m));
      if (drop.length) { revoke(drop); setAll(keep); }
    }, 10000);

    return () => {
      clearInterval(timer);
      s.disconnect();
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

  const sendText = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (editing) {
      sock.current?.emit('edit', { id: editing.id, text: t });
      setEditing(null);
    } else {
      sock.current?.emit('message', { type: 'text', text: t, replyTo: replyTo?.id });
      setReplyTo(null);
    }
    setText('');
  };

  const sendBlob = async (blob, type, extra = {}) => {
    const data = await blob.arrayBuffer();
    const rid = replyTo?.id;
    setReplyTo(null);
    return new Promise((resolve) => {
      sock.current.emit('message', { type, data, mime: blob.type, name: blob.name, replyTo: rid, ...extra }, (r) => {
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
        <div className="grow">
          <div>{peerName}</div>
          <div className="muted small">{sub}</div>
        </div>
        <button className="iconbtn" onClick={onTheme} aria-label="Switch theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button className="iconbtn" onClick={clearChat} aria-label="Clear chat for both"><Icon name="trash" /></button>
        <button className="iconbtn" onClick={onLock} aria-label="Lock"><Icon name="lock" /></button>
      </header>

      <div className="msgs">
        {msgs.length === 0 && (
          <div className="empty">
            {role === 'owner' ? <>Share your code <b>{code}</b> with a friend to start chatting.</> : 'Say hi 👋'}
            <div className="small">Messages auto-delete after 4 hours. Nothing is saved.</div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} id={`m-${m.id}`} className={`bubble ${m.from === role ? 'me' : ''} ${flash === m.id ? 'flash' : ''}`}
            onClick={(e) => onBubbleClick(e, m)}>
            {m.replyTo && (
              <div className="quote" onClick={(e) => { e.stopPropagation(); jump(m.replyTo.id); }}>
                <b>{m.replyTo.from === role ? 'You' : peerName}</b>
                <span>{m.replyTo.text}</span>
              </div>
            )}
            {m.type === 'text' && <div className="txt">{m.text}</div>}
            {m.type === 'image' && <img src={m.url} alt="" draggable={false} />}
            {m.type === 'video' && <video src={m.url} controls playsInline controlsList="nodownload" />}
            {m.type === 'audio' && <audio src={m.url} controls controlsList="nodownload" />}
            {m.type === 'file' && <a href={m.url} download={m.name || 'file'}>📎 {m.name || 'file'}</a>}
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
            <div className="time">
              {m.edited && <span>edited</span>}
              {new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
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
        <label className="icon" title="Photo / video / file">
          <Icon name="clip" size={20} />
          <input type="file" accept="image/*,video/*,audio/*,*/*" onChange={onPick} hidden />
        </label>
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={recording ? '● Recording... tap mic to send' : 'Type a message'} disabled={recording} />
        {text.trim() ? (
          <button className="send">{editing ? 'Save' : 'Send'}</button>
        ) : (
          <button type="button" className={`icon mic ${recording ? 'rec' : ''}`} onClick={toggleRecord}><Icon name="mic" size={20} /></button>
        )}
      </form>

      {menu && (
        <div className="sheetwrap" onClick={closeMenu}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="reactrow">
              {REACTIONS.map((em) => (
                <button key={em} className={`rbtn ${menu.reactions?.[role] === em ? 'on' : ''}`} onClick={() => doReact(em)}>{em}</button>
              ))}
            </div>
            <button className="act" onClick={doReply}><Icon name="reply" size={19} />Reply</button>
            {menu.type === 'text' && <button className="act" onClick={doCopy}><Icon name="copy" size={19} />Copy</button>}
            {menu.from === role && menu.type === 'text' && (
              <button className="act" onClick={doEdit}><Icon name="edit" size={19} />Edit</button>
            )}
            {menu.from === role && (
              <button className="act bad" onClick={doDelete}><Icon name="trash" size={19} />Delete</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
