import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SERVER } from './config.js';
import { post } from './api.js';
import Icon from './Icon.jsx';

const MAX_FILE = 25 * 1024 * 1024;

// Media arrives as binary; turn it into a temporary in-memory blob URL.
function hydrate(m) {
  if (!m.data) return m;
  const { data, ...rest } = m;
  return { ...rest, url: URL.createObjectURL(new Blob([data], { type: m.mime })) };
}
const revoke = (list) => list.forEach((m) => m.url && URL.revokeObjectURL(m.url));

function timeLeft(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export default function Chat({ role, code, secret, title, onBack, onLock, theme, onTheme }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [presence, setPresence] = useState({ owner: false, guest: false });
  const [recording, setRecording] = useState(false);
  const [, setTick] = useState(0);
  const sock = useRef(null);
  const msgsRef = useRef([]);
  const recRef = useRef(null);
  const endRef = useRef(null);

  const setAll = (next) => { msgsRef.current = next; setMsgs(next); };

  useEffect(() => {
    const s = io(SERVER || undefined, { auth: { code, secret } });
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
    s.on('cleared', () => { revoke(msgsRef.current); setAll([]); });
    s.on('presence', setPresence);
    s.on('closed', () => { alert('This chat was closed by the owner.'); onBack(); });

    // Local auto-delete when a message reaches its 4 hour limit.
    const timer = setInterval(() => {
      const now = Date.now();
      const keep = [];
      const drop = [];
      msgsRef.current.forEach((m) => (m.expiresAt > now ? keep : drop).push(m));
      if (drop.length) { revoke(drop); setAll(keep); } else setTick((t) => t + 1);
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const sendText = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    sock.current?.emit('message', { type: 'text', text });
    setText('');
  };

  const sendBlob = async (blob, type, extra = {}) => {
    const data = await blob.arrayBuffer();
    return new Promise((resolve) => {
      sock.current.emit('message', { type, data, mime: blob.type, name: blob.name, ...extra }, (r) => {
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

  const peerOnline = role === 'owner' ? presence.guest : presence.owner;
  const sub = error || (status !== 'online' ? 'Connecting...' : peerOnline ? 'Online' : 'Waiting for the other person');

  return (
    <div className="page chat">
      <header className="bar">
        <button className="iconbtn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <div className="grow">
          <div>{role === 'owner' ? 'You' : 'Friend'}</div>
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
          <div key={m.id} className={`bubble ${m.from === role ? 'me' : ''}`}>
            {m.type === 'text' && <div className="txt">{m.text}</div>}
            {m.type === 'image' && <img src={m.url} alt="" draggable={false} />}
            {m.type === 'video' && <video src={m.url} controls playsInline controlsList="nodownload" />}
            {m.type === 'audio' && <audio src={m.url} controls controlsList="nodownload" />}
            {m.type === 'file' && <a href={m.url} download={m.name || 'file'}>📎 {m.name || 'file'}</a>}
            <div className="time">
              {new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ⏳ {timeLeft(m.expiresAt - Date.now())}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={sendText}>
        <label className="icon" title="Photo / video / file">
          <Icon name="clip" size={20} />
          <input type="file" accept="image/*,video/*,audio/*,*/*" onChange={onPick} hidden />
        </label>
        <input value={text} onChange={(e) => setText(e.target.value)}
          placeholder={recording ? '● Recording... tap mic to send' : 'Type a message'} disabled={recording} />
        {text.trim() ? (
          <button className="send">Send</button>
        ) : (
          <button type="button" className={`icon mic ${recording ? 'rec' : ''}`} onClick={toggleRecord}><Icon name="mic" size={20} /></button>
        )}
      </form>
    </div>
  );
}
