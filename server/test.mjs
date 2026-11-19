// End-to-end test: node test.mjs   (starts its own server on port 4100 with a 2.5s message TTL)
import { spawn } from 'child_process';
import { io } from 'socket.io-client';
import assert from 'assert';

const PORT = 4100;
const base = `http://localhost:${PORT}`;
const srv = spawn('node', ['index.js'], { env: { ...process.env, PORT, MSG_TTL_MS: '2500', SWEEP_MS: '300' }, stdio: 'inherit' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
const connect = (code, secret, name, pub) => new Promise((res, rej) => {
  const s = io(base, { auth: { code, secret, name, pub }, transports: ['websocket'] });
  s.msgs = []; s.cleared = 0; s.presence = {}; s.updates = []; s.deleted = [];
  s.on('presence', (p) => (s.presence = p));
  s.on('update', (u) => s.updates.push(u));
  s.on('deleted', (d) => s.deleted.push(d.id));
  s.on('history', (h) => (s.msgs = h));
  s.on('message', (m) => s.msgs.push(m));
  s.on('cleared', () => { s.msgs = []; s.cleared++; });
  s.on('connect', () => res(s));
  s.on('connect_error', (e) => rej(e));
});
const emit = (s, m) => new Promise((r) => s.emit('message', m, r));
const txt = (s, extra = {}) => ({ type: 'text', payload: Buffer.from(s), ...extra });

const hex = (c) => c.repeat(32);
const CODE = 'ABCD2345', OWN = hex('a'), GUEST = hex('b'), THIRD = hex('c');
const PUB_A = '{"kty":"EC","x":"A"}', PUB_B = '{"kty":"EC","x":"B"}';

try {
  await wait(800);
  assert.equal((await post('/api/join', { code: CODE, secret: GUEST })).status, 404, 'join before host -> 404');
  assert.equal((await post('/api/host', { code: CODE, secret: OWN })).status, 200);
  assert.equal((await post('/api/host', { code: CODE, secret: THIRD })).status, 403, 'hijack host blocked');
  assert.equal((await post('/api/join', { code: CODE, secret: GUEST })).status, 200);
  assert.equal((await post('/api/join', { code: CODE, secret: THIRD })).status, 409, 'third person blocked');
  console.log('ok  codes / join / room full');

  await assert.rejects(connect(CODE, THIRD), /forbidden/);
  const a = await connect(CODE, OWN, 'Alice', PUB_A);
  const b = await connect(CODE, GUEST, '<b>Bob</b>', PUB_B);
  await wait(300);
  assert.equal(a.presence.guestName, 'bBob/b', 'guest name shown to owner (angle brackets stripped)');
  assert.equal(b.presence.ownerName, 'Alice', 'owner name shown to guest');
  assert.equal(a.presence.guestPub, PUB_B, 'guest public key relayed to owner');
  assert.equal(b.presence.ownerPub, PUB_A, 'owner public key relayed to guest');
  console.log('ok  display names + public key exchange');

  // Keys registered over HTTP (before any socket is open) are visible to the other person.
  const CODE2 = 'WXYZ6789';
  await post('/api/host', { code: CODE2, secret: OWN, name: 'Carol', pub: PUB_A });
  await post('/api/join', { code: CODE2, secret: GUEST, name: 'Dave', pub: PUB_B });
  const c2 = await connect(CODE2, OWN);
  await wait(250);
  assert.equal(c2.presence.guestPub, PUB_B); assert.equal(c2.presence.guestName, 'Dave');
  assert.equal(c2.presence.ownerPub, PUB_A); assert.equal(c2.presence.ownerName, 'Carol');
  c2.disconnect();
  console.log('ok  key + name registered via host/join');

  // Messages are opaque ciphertext to the server.
  await emit(a, txt('ciphertext-1'));
  const img = Buffer.alloc(1024 * 1024, 7);
  await emit(b, { type: 'image', data: img, meta: Buffer.from('m1') });
  await emit(a, { type: 'audio', data: Buffer.alloc(5000, 1), meta: Buffer.from('m2') });
  await emit(b, { type: 'video', data: Buffer.alloc(5000, 2), meta: Buffer.from('m3') });
  await wait(300);
  assert.equal(a.msgs.length, 4); assert.equal(b.msgs.length, 4);
  assert.equal(b.msgs[1].data.length, img.length, 'image bytes intact');
  assert.equal(Buffer.from(b.msgs[0].payload).toString(), 'ciphertext-1', 'payload relayed untouched');
  assert.equal(b.msgs[0].from, 'owner');
  assert.equal(b.msgs[0].text, undefined, 'no plaintext field on the wire');
  assert.equal((await emit(a, { type: 'nope', payload: Buffer.from('x') })).ok, false, 'bad type rejected');
  assert.equal((await emit(a, { type: 'text', payload: Buffer.alloc(0) })).ok, false, 'empty text rejected');
  assert.equal((await emit(a, { type: 'text', payload: Buffer.alloc(21000) })).ok, false, 'oversize text rejected');
  assert.equal((await emit(a, { type: 'video', data: Buffer.alloc(26 * 1024 * 1024) }).catch(() => ({ ok: false }))).ok, false, 'oversize media rejected');
  console.log('ok  text / image / voice / video relay, validation');

  // Inbox sockets get a content-free ping, and are not counted as being in the chat.
  const inbox = await new Promise((res, rej) => {
    const s = io(base, { auth: { code: CODE, secret: OWN, inbox: true }, transports: ['websocket'] });
    s.pings = []; s.events = []; s.pres = [];
    s.on('presence', (p) => s.pres.push(p));
    s.on('ping', (p) => s.pings.push(p));
    s.onAny((ev) => s.events.push(ev));
    s.on('connect', () => res(s)); s.on('connect_error', rej);
  });
  await emit(b, txt('ping-test'));
  await wait(250);
  const ping = inbox.pings.at(-1);
  assert.deepEqual({ from: ping.from, name: ping.name, replay: ping.replay }, { from: 'guest', name: 'bBob/b', replay: undefined }, 'inbox gets who sent it, nothing else');
  assert.equal(typeof ping.time, 'number');
  assert.ok(!inbox.events.includes('message') && !inbox.events.includes('history'), 'inbox never receives chat content');
  assert.ok(inbox.pres.length > 0 && inbox.pres.every((p) => Object.keys(p).sort().join() === 'guest,owner'), 'inbox only gets the two online flags (no names or keys)');
  inbox.disconnect();
  await wait(200);
  assert.equal(a.presence.owner, true, 'owner still shown online via the real chat socket');
  // A freshly connected inbox is told about the newest message from the other person (unread signal), flagged as a replay.
  const inbox2 = await new Promise((res, rej) => {
    const s = io(base, { auth: { code: CODE, secret: OWN, inbox: true }, transports: ['websocket'] });
    s.pings = []; s.on('ping', (p) => s.pings.push(p)); s.on('connect', () => res(s)); s.on('connect_error', rej);
  });
  await wait(250);
  assert.equal(inbox2.pings.length, 1); assert.equal(inbox2.pings[0].replay, true); assert.equal(inbox2.pings[0].time, ping.time);
  inbox2.disconnect();
  console.log('ok  inbox ping (no content, no presence) + replay for unread signal');

  // reactions / reply / edit / delete
  const m0 = a.msgs[0];
  b.emit('react', { id: m0.id, emoji: '❤️' });
  await wait(200);
  assert.deepEqual(a.updates.at(-1), { id: m0.id, reactions: { guest: '❤️' } });
  b.emit('react', { id: m0.id, emoji: '❤️' });
  await wait(200);
  assert.deepEqual(a.updates.at(-1).reactions, {}, 'same reaction toggles off');
  b.emit('react', { id: m0.id, emoji: '💩' });
  await wait(150);
  assert.deepEqual(a.updates.at(-1).reactions, {}, 'unknown emoji ignored');
  const before = a.updates.length;
  b.emit('edit', { id: m0.id, payload: Buffer.from('hacked') });
  b.emit('delete', { id: m0.id });
  await wait(200);
  assert.equal(a.updates.length, before); assert.equal(a.deleted.length, 0, "can't edit/delete the other person's message");
  await emit(b, txt('reply-ct', { replyTo: m0.id }));
  await emit(b, txt('reply-to-nothing', { replyTo: 'does-not-exist' }));
  await wait(150);
  const rep = a.msgs.at(-2);
  assert.equal(rep.replyTo, m0.id, 'reply keeps the original id');
  assert.equal(a.msgs.at(-1).replyTo, undefined, 'reply to unknown message ignored');
  a.emit('edit', { id: m0.id, payload: Buffer.from('ciphertext-v2') });
  await wait(200);
  const ed = a.updates.at(-1);
  assert.equal(ed.id, m0.id); assert.equal(Buffer.from(ed.payload).toString(), 'ciphertext-v2'); assert.equal(ed.edited, true);
  a.emit('delete', { id: m0.id });
  await wait(200);
  assert.deepEqual(b.deleted, [m0.id]); assert.deepEqual(a.deleted, [m0.id]);
  console.log('ok  reaction / reply / edit / delete');

  a.emit('clear');
  await wait(300);
  assert.equal(a.msgs.length, 0); assert.equal(b.msgs.length, 0);
  console.log('ok  clear removes messages on both sides');

  await emit(a, txt('will be wiped'));
  assert.equal((await post('/api/wipe', { code: CODE, secret: GUEST })).status, 200);
  await wait(300);
  assert.equal(a.msgs.length, 0); assert.equal(b.msgs.length, 0);
  assert.equal((await post('/api/wipe', { code: CODE, secret: THIRD })).status, 403);
  console.log('ok  wipe (3 wrong passcodes) clears both sides');

  await emit(a, txt('expires soon'));
  a.disconnect(); b.disconnect();
  await wait(3500);
  const a2 = await connect(CODE, OWN, 'Alice', PUB_A);
  await wait(200);
  assert.equal(a2.msgs.length, 0, 'expired message is gone from the server');
  console.log('ok  messages auto-expire (TTL)');

  assert.equal((await post('/api/close', { code: CODE, secret: GUEST })).status, 200);
  await wait(200);
  assert.equal(a2.presence.guestPub, '', 'guest key cleared after leaving');
  assert.equal((await post('/api/join', { code: CODE, secret: THIRD })).status, 200, 'guest slot freed after leave');
  assert.equal((await post('/api/close', { code: CODE, secret: OWN })).status, 200);
  assert.equal((await post('/api/join', { code: CODE, secret: GUEST })).status, 404, 'owner close deletes room');
  console.log('ok  leave / close');

  // ---- silent auto-wipe: owner closes the room for both people, nothing is announced, repeating is harmless ----
  const WC = 'WXYZ2345', WO = hex('d'), WG = hex('e');
  await post('/api/host', { code: WC, secret: WO, name: 'Owner', pub: PUB_A });
  await post('/api/join', { code: WC, secret: WG, name: 'Guest', pub: PUB_B });
  const wo = await connect(WC, WO, 'Owner', PUB_A);
  const wg = await connect(WC, WG, 'Guest', PUB_B);
  let closedPayload = null; wg.on('closed', (d) => { closedPayload = d; });
  await emit(wo, { type: 'image', data: Buffer.alloc(2048, 7), meta: Buffer.from('m') });
  await emit(wg, txt('hello'));
  await wait(150);
  assert.equal(wg.msgs.length, 2, 'both messages exist before the wipe');
  assert.equal((await post('/api/close', { code: WC, secret: hex('f'), silent: true })).status, 403, 'a stranger cannot delete the room');
  assert.equal((await post('/api/close', { code: WC, secret: WO, silent: true })).status, 200);
  await wait(200);
  assert.deepEqual(closedPayload, { silent: true }, 'other device is told silently (no alert flag)');
  assert.equal((await post('/api/join', { code: WC, secret: WG })).status, 404, 'room, messages, media, pairing and keys are gone');
  assert.equal((await post('/api/close', { code: WC, secret: WO, silent: true })).status, 200, 'repeating the wipe is idempotent');
  let refused = false;
  await connect(WC, WO, 'Owner', PUB_A).catch(() => { refused = true; });
  assert.ok(refused, 'old credentials/sessions no longer work');
  // guest-side wipe: guest leaves, owner keeps an empty chat and no guest key
  await post('/api/host', { code: WC, secret: WO, name: 'Owner', pub: PUB_A });
  await post('/api/join', { code: WC, secret: WG, name: 'Guest', pub: PUB_B });
  const wo2 = await connect(WC, WO, 'Owner', PUB_A);
  await emit(wo2, txt('x')); await wait(100);
  assert.equal((await post('/api/close', { code: WC, secret: WG, silent: true })).status, 200);
  await wait(200);
  assert.equal(wo2.msgs.length, 0, 'guest wipe clears the conversation for the owner too');
  assert.equal(wo2.presence.guestPub, '', 'guest encryption key removed');
  console.log('ok  silent auto-wipe on the server (both participants, idempotent, authorised)');

  // ---- message status: sent -> delivered (other device connected) -> read (other screen showed it) ----
  const RC = 'RCPT2345', RO = hex('1'), RG = hex('2');
  await post('/api/host', { code: RC, secret: RO, name: 'Owner', pub: PUB_A });
  await post('/api/join', { code: RC, secret: RG, name: 'Guest', pub: PUB_B });
  const ro = await connect(RC, RO, 'Owner', PUB_A);
  const receipts = []; ro.on('receipt', (r) => receipts.push(r));
  await emit(ro, txt('are you there'));
  await wait(150);
  assert.equal(ro.msgs[0].delivered, false, 'friend offline: only sent');
  assert.equal(receipts.length, 0);
  // friend's device comes online in the background (inbox): delivered
  const rgInbox = io(base, { auth: { code: RC, secret: RG, inbox: true }, transports: ['websocket'] });
  await wait(250);
  assert.deepEqual(receipts[0]?.state, 'delivered', 'inbox connection marks it delivered');
  assert.equal(receipts[0].ids[0], ro.msgs[0].id);
  // friend opens the chat and shows it: read
  const rg = await connect(RC, RG, 'Guest', PUB_B);
  await wait(100);
  assert.equal(rg.msgs[0].delivered, true, 'history already carries the delivered flag');
  rg.emit('read', { ids: [rg.msgs[0].id] });
  await wait(150);
  assert.equal(receipts.at(-1).state, 'read', 'read receipt reaches the sender');
  // a reply sent while the friend is connected is delivered at once; hidden people send no read receipts
  const beforeCount = receipts.length;
  await emit(rg, txt('yes'));
  await wait(150);
  assert.ok(receipts.length > beforeCount && receipts.at(-1).state === 'delivered', 'connected friend: delivered immediately');
  const rgHidden = await new Promise((res, rej) => { const x = io(base, { auth: { code: RC, secret: RO, hidden: true }, transports: ['websocket'] }); x.on('connect', () => res(x)); x.on('connect_error', rej); });
  const rgReceipts = []; rg.on('receipt', (r) => rgReceipts.push(r));
  const theirMsg = ro.msgs[0].id; // (hidden owner tries to ack its own message: must be ignored)
  rgHidden.emit('read', { ids: [theirMsg] }); await wait(150);
  assert.ok(!rgReceipts.some((r) => r.state === 'read'), 'hidden / own messages never produce read receipts');
  rgInbox.disconnect(); rgHidden.disconnect(); ro.disconnect(); rg.disconnect();
  console.log('ok  sent / delivered / read receipts');
  // ---- encrypted display name ("meta") + flood protection ----
  const MC = 'MMETA345', MO = hex('3'), MG = hex('4');
  await post('/api/host', { code: MC, secret: MO, pub: PUB_A });
  await post('/api/join', { code: MC, secret: MG, pub: PUB_B });
  const mo = await connect(MC, MO, '', PUB_A);
  const mg = await connect(MC, MG, '', PUB_B);
  mo.emit('meta', Buffer.from('opaque-ciphertext-of-a-name'));
  await wait(200);
  assert.equal(Buffer.from(mg.presence.ownerMeta).toString(), 'opaque-ciphertext-of-a-name', 'friend receives the encrypted name');
  assert.equal(mg.presence.ownerName, '', 'no plain-text name is stored or sent');
  mo.emit('meta', Buffer.alloc(999)); await wait(100);
  assert.equal(Buffer.from(mg.presence.ownerMeta).length, 27, 'oversize meta is ignored');
  let limited = 0;
  for (let i = 0; i < 45; i++) { const r = await emit(mo, txt('flood ' + i)); if (r?.error === 'rate') limited++; }
  assert.ok(limited > 0 && limited < 45, `flooding is throttled (${limited} of 45 refused)`);
  mo.disconnect(); mg.disconnect();
  console.log('ok  encrypted display name + message flood limit');
  console.log('\nALL TESTS PASSED');
} catch (e) {
  console.error('\nTEST FAILED:', e);
  process.exitCode = 1;
} finally {
  srv.kill();
  setTimeout(() => process.exit(), 200);
}
