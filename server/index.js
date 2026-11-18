// Calc Chat server. Nothing is ever written to disk or a database:
// rooms and messages live only in RAM and auto-expire.
import express from 'express';
import cors from 'cors';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const MSG_TTL = Number(process.env.MSG_TTL_MS) || 4 * 60 * 60 * 1000; // 4 hours
const SWEEP_MS = Number(process.env.SWEEP_MS) || 30 * 1000;
const ROOM_IDLE = 24 * 60 * 60 * 1000; // empty room with no messages is forgotten after 24h
const MAX_FILE = 25 * 1024 * 1024; // 25 MB per media message
const ROOM_CAP = 200 * 1024 * 1024; // 200 MB of media per room (oldest dropped first)

/** code -> { ownerHash, guestHash|null, messages[], touched } */
const rooms = new Map();

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const same = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const validCode = (c) => typeof c === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(c);
const validSecret = (s) => typeof s === 'string' && /^[a-f0-9]{32,128}$/.test(s);
const roleOf = (room, secret) => {
  const h = sha(secret);
  if (same(room.ownerHash, h)) return 'owner';
  if (room.guestHash && same(room.guestHash, h)) return 'guest';
  return null;
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const hits = new Map();
const limited = (req, max) => {
  const key = req.ip + req.path;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
};

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: MAX_FILE + 1024 * 1024,
  pingTimeout: 60000,
});

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const LABELS = { image: 'Photo', video: 'Video', audio: 'Voice message', file: 'File' };
const snippet = (m) => (m.type === 'text' ? m.text.slice(0, 100) : LABELS[m.type] || 'Message');

// Display names are optional, kept in RAM only, and shown to the other person.
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);

async function presence(code) {
  const room = rooms.get(code);
  if (!room) return;
  const socks = await io.in(code).fetchSockets();
  const roles = new Set(socks.map((s) => s.data.role));
  io.to(code).emit('presence', {
    owner: roles.has('owner'),
    guest: roles.has('guest'),
    ownerName: room.names.owner,
    guestName: room.names.guest,
  });
}

// Owner registers (or re-registers after a server restart) their room.
app.post('/api/host', (req, res) => {
  if (limited(req, 60)) return res.status(429).json({ error: 'rate' });
  const { code, secret } = req.body || {};
  if (!validCode(code) || !validSecret(secret)) return res.status(400).json({ error: 'bad_request' });
  let room = rooms.get(code);
  if (!room) {
    room = { ownerHash: sha(secret), guestHash: null, messages: [], names: { owner: '', guest: '' }, touched: Date.now() };
    rooms.set(code, room);
  } else if (!same(room.ownerHash, sha(secret))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  room.touched = Date.now();
  res.json({ ok: true, guest: !!room.guestHash });
});

// Second person joins using the owner's code.
app.post('/api/join', (req, res) => {
  if (limited(req, 20)) return res.status(429).json({ error: 'rate' });
  const { code, secret } = req.body || {};
  if (!validCode(code) || !validSecret(secret)) return res.status(400).json({ error: 'bad_code' });
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'not_found' });
  const h = sha(secret);
  if (same(room.ownerHash, h)) return res.status(400).json({ error: 'own_code' });
  if (!room.guestHash) room.guestHash = h;
  else if (!same(room.guestHash, h)) return res.status(409).json({ error: 'full' });
  room.touched = Date.now();
  presence(code);
  res.json({ ok: true });
});

// Delete every message in the room, for both sides (used by "wrong passcode x3").
app.post('/api/wipe', (req, res) => {
  if (limited(req, 30)) return res.status(429).json({ error: 'rate' });
  const { code, secret } = req.body || {};
  if (!validCode(code) || !validSecret(secret)) return res.status(400).json({ error: 'bad_request' });
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'not_found' });
  if (!roleOf(room, secret)) return res.status(403).json({ error: 'forbidden' });
  room.messages = [];
  io.to(code).emit('cleared');
  res.json({ ok: true });
});

// Owner: destroy the room. Guest: leave it (messages are wiped, slot freed).
app.post('/api/close', async (req, res) => {
  if (limited(req, 30)) return res.status(429).json({ error: 'rate' });
  const { code, secret } = req.body || {};
  if (!validCode(code) || !validSecret(secret)) return res.status(400).json({ error: 'bad_request' });
  const room = rooms.get(code);
  if (!room) return res.json({ ok: true });
  const role = roleOf(room, secret);
  if (!role) return res.status(403).json({ error: 'forbidden' });
  if (role === 'owner') {
    io.to(code).emit('closed');
    io.in(code).disconnectSockets(true);
    rooms.delete(code);
  } else {
    room.guestHash = null;
    room.names.guest = '';
    room.messages = [];
    io.to(code).emit('cleared');
    for (const s of await io.in(code).fetchSockets()) if (s.data.role === 'guest') s.disconnect(true);
    presence(code);
  }
  res.json({ ok: true });
});

io.use((socket, next) => {
  const { code, secret, name } = socket.handshake.auth || {};
  if (!validCode(code) || !validSecret(secret)) return next(new Error('bad_auth'));
  const room = rooms.get(code);
  if (!room) return next(new Error('no_room'));
  const role = roleOf(room, secret);
  if (!role) return next(new Error('forbidden'));
  socket.data = { code, role };
  const n = cleanName(name);
  if (n) room.names[role] = n;
  next();
});

io.on('connection', (socket) => {
  const { code, role } = socket.data;
  const room = rooms.get(code);
  socket.join(code);
  room.touched = Date.now();
  socket.emit('history', room.messages.filter((m) => m.expiresAt > Date.now()));
  presence(code);

  socket.on('message', (m, ack) => {
    const r = rooms.get(code);
    if (!r || !m) return;
    const type = ['text', 'image', 'audio', 'video', 'file'].includes(m.type) ? m.type : null;
    if (!type) return ack?.({ ok: false });
    const now = Date.now();
    const msg = { id: crypto.randomUUID(), from: role, type, time: now, expiresAt: now + MSG_TTL };
    if (type === 'text') {
      msg.text = String(m.text || '').slice(0, 4000);
      if (!msg.text.trim()) return ack?.({ ok: false });
    } else {
      const data = Buffer.isBuffer(m.data) ? m.data : m.data ? Buffer.from(m.data) : null;
      if (!data || !data.length || data.length > MAX_FILE) return ack?.({ ok: false, error: 'size' });
      const mime = String(m.mime || 'application/octet-stream').slice(0, 100);
      if (type !== 'file' && !mime.startsWith(type + '/')) return ack?.({ ok: false, error: 'mime' });
      Object.assign(msg, { data, mime, name: String(m.name || '').slice(0, 100), duration: Number(m.duration) || 0 });
    }
    msg.reactions = {};
    if (typeof m.replyTo === 'string') {
      const ref = r.messages.find((x) => x.id === m.replyTo);
      if (ref) msg.replyTo = { id: ref.id, from: ref.from, text: snippet(ref) };
    }
    r.messages.push(msg);
    r.touched = now;
    let bytes = r.messages.reduce((n, x) => n + (x.data?.length || 0), 0);
    while ((bytes > ROOM_CAP || r.messages.length > 500) && r.messages.length) {
      bytes -= r.messages.shift().data?.length || 0;
    }
    io.to(code).emit('message', msg);
    ack?.({ ok: true });
  });

  const findMsg = (id) => rooms.get(code)?.messages.find((x) => x.id === id);
  // Keep quoted previews in replies in sync when the original is edited/deleted.
  const refreshQuotes = (r, id, text) => {
    for (const x of r.messages) {
      if (x.replyTo?.id === id) {
        x.replyTo.text = text;
        io.to(code).emit('update', { id: x.id, replyTo: x.replyTo });
      }
    }
  };

  // One reaction per person per message; same emoji again removes it.
  socket.on('react', (p) => {
    const msg = findMsg(p?.id);
    if (!msg || !REACTIONS.includes(p.emoji)) return;
    if (msg.reactions[role] === p.emoji) delete msg.reactions[role];
    else msg.reactions[role] = p.emoji;
    io.to(code).emit('update', { id: msg.id, reactions: msg.reactions });
  });

  // Edit: only your own text messages.
  socket.on('edit', (p) => {
    const r = rooms.get(code);
    const msg = findMsg(p?.id);
    if (!r || !msg || msg.from !== role || msg.type !== 'text') return;
    const text = String(p.text || '').slice(0, 4000);
    if (!text.trim()) return;
    msg.text = text;
    msg.edited = true;
    io.to(code).emit('update', { id: msg.id, text, edited: true });
    refreshQuotes(r, msg.id, snippet(msg));
  });

  // Delete for everyone: only your own messages.
  socket.on('delete', (p) => {
    const r = rooms.get(code);
    const msg = findMsg(p?.id);
    if (!r || !msg || msg.from !== role) return;
    r.messages = r.messages.filter((x) => x.id !== msg.id);
    io.to(code).emit('deleted', { id: msg.id });
    refreshQuotes(r, msg.id, 'Message deleted');
  });

  // "Clear chat": wipes it for both people.
  socket.on('clear', () => {
    const r = rooms.get(code);
    if (!r) return;
    r.messages = [];
    io.to(code).emit('cleared');
  });

  socket.on('disconnect', () => presence(code));
});

// Memory sweeper: drop expired messages and forgotten empty rooms.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    room.messages = room.messages.filter((m) => m.expiresAt > now);
    const live = io.sockets.adapter.rooms.get(code);
    if (!live?.size && !room.messages.length && now - room.touched > ROOM_IDLE) rooms.delete(code);
  }
  for (const [k, list] of hits) if (!list.some((t) => now - t < 60000)) hits.delete(k);
}, SWEEP_MS).unref();

// In production the same server can host the built web app.
const dist = path.join(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

server.listen(PORT, () => console.log(`Calc Chat server on http://localhost:${PORT}`));
