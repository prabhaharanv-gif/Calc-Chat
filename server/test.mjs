// End-to-end test: node test.mjs   (starts its own server on port 4100 with a 2s message TTL)
import { spawn } from 'child_process';
import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = 4100;
const base = `http://localhost:${PORT}`;
const srv = spawn('node', ['index.js'], { env: { ...process.env, PORT, MSG_TTL_MS: '2500', SWEEP_MS: '300' }, stdio: 'inherit' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
const connect = (code, secret) => new Promise((res, rej) => {
  const s = io(base, { auth: { code, secret }, transports: ['websocket'] });
  s.msgs = []; s.cleared = 0;
  s.on('history', (h) => (s.msgs = h));
  s.on('message', (m) => s.msgs.push(m));
  s.on('cleared', () => { s.msgs = []; s.cleared++; });
  s.on('connect', () => res(s));
  s.on('connect_error', (e) => rej(e));
});
const emit = (s, m) => new Promise((r) => s.emit('message', m, r));

const hex = (c) => c.repeat(32);
const CODE = 'ABCD2345', OWN = hex('a'), GUEST = hex('b'), THIRD = hex('c');

try {
  await wait(800);
  assert.equal((await post('/api/join', { code: CODE, secret: GUEST })).status, 404, 'join before host -> 404');
  assert.equal((await post('/api/host', { code: CODE, secret: OWN })).status, 200);
  assert.equal((await post('/api/host', { code: CODE, secret: THIRD })).status, 403, 'hijack host blocked');
  assert.equal((await post('/api/join', { code: CODE, secret: GUEST })).status, 200);
  assert.equal((await post('/api/join', { code: CODE, secret: THIRD })).status, 409, 'third person blocked');
  console.log('ok  codes / join / room full');

  await assert.rejects(connect(CODE, THIRD), /forbidden/);
  const a = await connect(CODE, OWN);
  const b = await connect(CODE, GUEST);

  await emit(a, { type: 'text', text: 'hello' });
  const img = Buffer.alloc(1024 * 1024, 7);
  await emit(b, { type: 'image', data: img, mime: 'image/png', name: 'x.png' });
  await emit(a, { type: 'audio', data: Buffer.alloc(5000, 1), mime: 'audio/webm', duration: 3 });
  await emit(b, { type: 'video', data: Buffer.alloc(5000, 2), mime: 'video/mp4' });
  await wait(300);
  assert.equal(a.msgs.length, 4); assert.equal(b.msgs.length, 4);
  assert.equal(b.msgs[1].data.length, img.length, 'image bytes intact');
  assert.equal(b.msgs[0].from, 'owner');
  const bad = await emit(a, { type: 'image', data: Buffer.alloc(10), mime: 'text/html' });
  assert.equal(bad.ok, false, 'mime mismatch rejected');
  const big = await emit(a, { type: 'video', data: Buffer.alloc(26 * 1024 * 1024), mime: 'video/mp4' }).catch(() => ({ ok: false }));
  console.log('ok  text / image / voice / video relay, validation');

  a.emit('clear');
  await wait(300);
  assert.equal(a.msgs.length, 0); assert.equal(b.msgs.length, 0);
  console.log('ok  clear removes messages on both sides');

  await emit(a, { type: 'text', text: 'will be wiped' });
  assert.equal((await post('/api/wipe', { code: CODE, secret: GUEST })).status, 200);
  await wait(300);
  assert.equal(a.msgs.length, 0); assert.equal(b.msgs.length, 0);
  assert.equal((await post('/api/wipe', { code: CODE, secret: THIRD })).status, 403);
  console.log('ok  wipe (3 wrong passcodes) clears both sides');

  await emit(a, { type: 'text', text: 'expires soon' });
  a.disconnect(); b.disconnect();
  await wait(3500);
  const a2 = await connect(CODE, OWN);
  await wait(200);
  assert.equal(a2.msgs.length, 0, 'expired message is gone from the server');
  console.log('ok  messages auto-expire (TTL)');

  assert.equal((await post('/api/close', { code: CODE, secret: GUEST })).status, 200);
  assert.equal((await post('/api/join', { code: CODE, secret: THIRD })).status, 200, 'guest slot freed after leave');
  assert.equal((await post('/api/close', { code: CODE, secret: OWN })).status, 200);
  assert.equal((await post('/api/join', { code: CODE, secret: GUEST })).status, 404, 'owner close deletes room');
  console.log('ok  leave / close');
  console.log('\nALL TESTS PASSED');
} catch (e) {
  console.error('\nTEST FAILED:', e);
  process.exitCode = 1;
} finally {
  srv.kill();
  setTimeout(() => process.exit(), 200);
}
