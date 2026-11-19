// Connectivity + behaviour test against a DEPLOYED server (or a local one):
//   node remote-test.mjs https://your-service.example.com
// Uses WebSocket-only connections, so it proves that secure WebSockets (wss://) work through the host's proxy.
// It creates a throw-away room with random credentials and deletes it at the end. Nothing is logged except pass/fail.
import { io } from 'socket.io-client';
import crypto from 'crypto';
import assert from 'assert';

const base = (process.argv[2] || process.env.SERVER_URL || '').replace(/\/+$/, '');
if (!base) { console.error('usage: node remote-test.mjs https://server.example.com'); process.exit(2); }

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % 32]).join('');
const OWN = crypto.randomBytes(24).toString('hex'), GUEST = crypto.randomBytes(24).toString('hex');
const PUB_A = '{"kty":"EC","x":"A"}', PUB_B = '{"kty":"EC","x":"B"}';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const connect = (secret, pub, extra = {}) => new Promise((res, rej) => {
  const s = io(base, { auth: { code, secret, pub, ...extra }, transports: ['websocket'], reconnectionDelay: 300 });
  s.msgs = []; s.presence = {}; s.receipts = []; s.cleared = 0; s.closed = null; s.connects = 0;
  s.on('history', (h) => { s.msgs = h; });
  s.on('message', (m) => s.msgs.push(m));
  s.on('presence', (p) => { s.presence = p; });
  s.on('receipt', (r) => s.receipts.push(r));
  s.on('cleared', () => { s.msgs = []; s.cleared++; });
  s.on('closed', (d) => { s.closed = d; });
  s.on('connect', () => { s.connects++; res(s); });
  s.on('connect_error', rej);
});
const send = (s, text) => new Promise((r) => s.emit('message', { type: 'text', payload: Buffer.from(text) }, r));

let ok = 0;
const pass = (name) => { ok++; console.log('ok  ' + name); };

try {
  // 1. reachability, health check, privacy page
  const h = await fetch(base + '/healthz');
  assert.equal(h.status, 200); assert.deepEqual(await h.json(), { ok: true });
  pass('health check answers');
  const pol = await fetch(base + '/privacy');
  assert.equal(pol.status, 200); assert.ok((await pol.text()).includes('Privacy Policy'));
  pass('privacy page is served');
  assert.ok(base.startsWith('https://') || /localhost|127\.0\.0\.1/.test(base), 'public servers must be https');

  // 2. pairing + two devices connected at the same time
  assert.equal((await post('/api/host', { code, secret: OWN, pub: PUB_A })).status, 200);
  assert.equal((await post('/api/join', { code, secret: GUEST, pub: PUB_B })).status, 200);
  const a = await connect(OWN, PUB_A);
  const b = await connect(GUEST, PUB_B);
  assert.equal(a.io.engine.transport.name, 'websocket');
  await wait(300);
  assert.ok(a.presence.owner && a.presence.guest, 'both devices show as online');
  pass(`two devices connected over ${base.startsWith('https') ? 'wss' : 'ws'} (websocket transport)`);

  // 3. messages both ways + 30 minute expiry + receipts
  assert.equal((await send(a, 'ciphertext-1')).ok, true);
  assert.equal((await send(b, 'ciphertext-2')).ok, true);
  await wait(400);
  assert.equal(a.msgs.length, 2); assert.equal(b.msgs.length, 2);
  assert.ok(a.msgs.every((m) => m.expiresAt - m.time === 30 * 60 * 1000), 'messages expire after exactly 30 minutes');
  assert.ok(a.receipts.some((r) => r.state === 'delivered'), 'delivered receipt arrives');
  pass('real-time messages work in both directions; expiry is 30 minutes; delivery receipts');

  // 4. reconnect after a network interruption (the connection is cut abruptly, the client reconnects by itself)
  const before = b.connects;
  b.io.engine.close();
  await wait(2500);
  assert.ok(b.connected && b.connects > before, 'client reconnected by itself');
  assert.equal(b.msgs.length, 2, 'history is restored after reconnecting');
  assert.equal((await send(b, 'after-reconnect')).ok, true);
  await wait(300);
  assert.equal(a.msgs.length, 3);
  pass('reconnection after a dropped connection (history restored, messaging continues)');

  // 5. clear for both
  a.emit('clear');
  await wait(400);
  assert.equal(a.msgs.length, 0); assert.equal(b.msgs.length, 0);
  pass('clear-for-both empties the chat on both devices');

  // 6. server-side wipe (silent auto-wipe): the owner closes the room, the guest is told quietly, nothing is left
  assert.equal((await post('/api/close', { code, secret: 'f'.repeat(48), silent: true })).status, 403, 'a stranger cannot delete the room');
  assert.equal((await post('/api/close', { code, secret: OWN, silent: true })).status, 200);
  await wait(500);
  assert.deepEqual(b.closed, { silent: true });
  assert.equal((await post('/api/join', { code, secret: GUEST })).status, 404, 'room is gone on the server');
  assert.equal((await post('/api/close', { code, secret: OWN, silent: true })).status, 200, 'repeating the wipe is harmless');
  pass('silent auto-wipe deletes the room for both people (authorised, idempotent)');
  a.disconnect(); b.disconnect();

  // 7. restart recovery as the apps do it: owner registers the room again, guest joins again with the same secret
  const code2 = code;
  assert.equal((await post('/api/host', { code: code2, secret: OWN, pub: PUB_A })).status, 200, 'owner re-registers the room');
  const gj = await connect(GUEST, PUB_B).then(() => 'connected', (e) => e.message);
  assert.equal(gj, 'forbidden', 'a guest the new server instance does not know is refused until it re-joins');
  assert.equal((await post('/api/join', { code: code2, secret: GUEST, pub: PUB_B })).status, 200, 'guest re-joins with the same code + secret');
  const g2 = await connect(GUEST, PUB_B);
  assert.ok(g2.connected);
  g2.disconnect();
  pass('restart recovery path (owner re-hosts, guest re-joins automatically)');

  await post('/api/close', { code: code2, secret: OWN, silent: true });
  console.log(`\nREMOTE TESTS PASSED (${ok} checks) against ${base}`);
} catch (e) {
  console.error('\nREMOTE TEST FAILED:', e.message);
  process.exitCode = 1;
} finally {
  setTimeout(() => process.exit(), 200);
}
