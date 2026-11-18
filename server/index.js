// Calc Chat server. Nothing is ever written to disk or a database:
// rooms and messages live only in RAM and auto-expire.
// Message content (text, media bytes, file names) is END-TO-END ENCRYPTED by the
// clients: this server only relays opaque ciphertext plus minimal metadata.
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
const MAX_TEXT = 20000; // bytes of encrypted text per message
const MAX_META = 2000; // bytes of encrypted media metadata
const ROOM_CAP = 200 * 1024 * 1024; // 200 MB of media per room (oldest dropped first)
const MSG_TYPES = ['text', 'image', 'audio', 'video', 'file'];
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/** code -> { ownerHash, guestHash|null, messages[], names, pubs, touched } */
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
const toBuf = (v) =>
  Buffer.isBuffer(v) ? v : v instanceof ArrayBuffer ? Buffer.from(v)
    : ArrayBuffer.isView(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength) : null;

// Display names are optional, kept in RAM only, and shown to the other person.
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
// Public keys (ECDH P-256 JWK as a JSON string) are relayed so the two devices can derive a shared secret.
const cleanPub = (p) => (typeof p === 'string' && p.length > 0 && p.length <= 400 ? p : '');

const newRoom = (ownerHash) => ({
  ownerHash, guestHash: null, messages: [], touched: Date.now(),
  names: { owner: '', guest: '' }, pubs: { owner: '', guest: '' },
});

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
    ownerPub: room.pubs.owner,
    guestPub: room.pubs.guest,
  });
}

// Owner registers (or re-registers after a server restart) their room.
app.post('/api/host', (req, res) => {
  if (limited(req, 60)) return res.status(429).json({ error: 'rate' });
  const { code, secret, name, pub } = req.body || {};
  if (!validCode(code) || !validSecret(secret)) return res.status(400).json({ error: 'bad_request' });
  let room = rooms.get(code);
  if (!room) {
    room = newRoom(sha(secret));
    rooms.set(code, room);
  } else if (!same(room.ownerHash, sha(secret))) {
    return res.status(403).json({ error: 'forbidden' });
  }
  // Register name + public key now, so the friend can encrypt even if we are offline.
  if (cleanName(name)) room.names.owner = cleanName(name);
  if (cleanPub(pub)) room.pubs.owner = cleanPub(pub);
  room.touched = Date.now();
  res.json({ ok: true, guest: !!room.guestHash });
});

// Second person joins using the owner's code.
app.post('/api/join', (req, res) => {
  if (limited(req, 20)) return res.status(429).json({ error: 'rate' });
  const { code, secret, name, pub } = req.body || {};
  if (!validCode(code) || !validSecret(secret)) return res.status(400).json({ error: 'bad_code' });
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: 'not_found' });
  const h = sha(secret);
  if (same(room.ownerHash, h)) return res.status(400).json({ error: 'own_code' });
  if (!room.guestHash) room.guestHash = h;
  else if (!same(room.guestHash, h)) return res.status(409).json({ error: 'full' });
  if (cleanName(name)) room.names.guest = cleanName(name);
  if (cleanPub(pub)) room.pubs.guest = cleanPub(pub);
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
    room.pubs.guest = '';
    room.messages = [];
    io.to(code).emit('cleared');
    for (const s of await io.in(code).fetchSockets()) if (s.data.role === 'guest') s.disconnect(true);
    presence(code);
  }
  res.json({ ok: true });
});

io.use((socket, next) => {
  const { code, secret, name, pub } = socket.handshake.auth || {};
  if (!validCode(code) || !validSecret(secret)) return next(new Error('bad_auth'));
  const room = rooms.get(code);
  if (!room) return next(new Error('no_room'));
  const role = roleOf(room, secret);
  if (!role) return next(new Error('forbidden'));
  socket.data = { code, role };
  const n = cleanName(name);
  if (n) room.names[role] = n;
  const p = cleanPub(pub);
  if (p) room.pubs[role] = p;
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
    if (!MSG_TYPES.includes(m.type)) return ack?.({ ok: false });
    const now = Date.now();
    const msg = { id: crypto.randomUUID(), from: role, type: m.type, time: now, expiresAt: now + MSG_TTL, reactions: {} };
    if (m.type === 'text') {
      const payload = toBuf(m.payload);
      if (!payload || !payload.length || payload.length > MAX_TEXT) return ack?.({ ok: false, error: 'size' });
      msg.payload = payload;
    } else {
      const data = toBuf(m.data);
      const meta = toBuf(m.meta);
      if (!data || !data.length || data.length > MAX_FILE + 64) return ack?.({ ok: false, error: 'size' });
      msg.data = data;
      if (meta && meta.length <= MAX_META) msg.meta = meta;
    }
    if (typeof m.replyTo === 'string' && r.messages.some((x) => x.id === m.replyTo)) msg.replyTo = m.replyTo;
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

  // One reaction per person per message; same emoji again removes it.
  socket.on('react', (p) => {
    const msg = findMsg(p?.id);
    if (!msg || !REACTIONS.includes(p.emoji)) return;
    if (msg.reactions[role] === p.emoji) delete msg.reactions[role];
    else msg.reactions[role] = p.emoji;
    io.to(code).emit('update', { id: msg.id, reactions: msg.reactions });
  });

  // Edit: only your own text messages (the new ciphertext replaces the old one).
  socket.on('edit', (p) => {
    const msg = findMsg(p?.id);
    if (!msg || msg.from !== role || msg.type !== 'text') return;
    const payload = toBuf(p.payload);
    if (!payload || !payload.length || payload.length > MAX_TEXT) return;
    msg.payload = payload;
    msg.edited = true;
    io.to(code).emit('update', { id: msg.id, payload, edited: true });
  });

  // Delete for everyone: only your own messages.
  socket.on('delete', (p) => {
    const r = rooms.get(code);
    const msg = findMsg(p?.id);
    if (!r || !msg || msg.from !== role) return;
    r.messages = r.messages.filter((x) => x.id !== msg.id);
    io.to(code).emit('deleted', { id: msg.id });
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
