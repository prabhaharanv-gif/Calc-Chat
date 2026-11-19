// Silent Auto-Wipe tests: node autowipe-test.mjs   (no browser needed; storage APIs are faked)
import assert from 'assert';

const mem = new Map();
const store = () => ({
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { sets.push([k, String(v)]); mem.set(k, String(v)); },
  removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
});
const sets = [];
globalThis.localStorage = store();
globalThis.sessionStorage = { ...store(), setItem() {}, clear() { sessionCleared++; } };
let sessionCleared = 0;
const idb = new Set(['chat-cache', 'media']);
globalThis.indexedDB = {
  databases: async () => [...idb].map((name) => ({ name })),
  deleteDatabase: (name) => { const r = {}; setTimeout(() => { idb.delete(name); r.onsuccess?.(); }); return r; },
};
const cacheKeys = new Set(['api', 'media']);
globalThis.caches = { keys: async () => [...cacheKeys], delete: async (k) => cacheKeys.delete(k) };
// Any UI/notification attempt during a wipe is a failure.
let ui = 0;
globalThis.alert = () => { ui++; };
globalThis.Notification = class { constructor() { ui++; } };

const A = await import('./src/autowipe.js');
const { save, load } = await import('./src/storage.js');

const PRIV = { kty: 'EC', d: 'SECRET-PRIVATE-KEY-MATERIAL', x: 'x', y: 'y' };
const seed = (extra = {}) => {
  mem.clear(); sets.length = 0;
  save({ name: 'Prabha', passHash: 'h', salt: 's', passLen: 4, ownCode: 'ABCD2345', ownSecret: 'a'.repeat(32),
    joined: { code: 'WXYZ6789', secret: 'b'.repeat(32) }, chatNames: { owner: 'Hi', guest: 'Friend' }, hide: { owner: true }, notify: true, theme: 'dark', holdMs: 3000, e2e: { priv: PRIV, pub: { kty: 'EC', x: 'x' } }, fails: 0, ...extra });
  localStorage.setItem('snake_best', '200');
};
const wrong = async () => A.finishAttempt(false, await A.beginAttempt());
const right = async () => A.finishAttempt(true, await A.beginAttempt());
const okPost = (calls = []) => async (path, body) => { calls.push([path, body]); return { ok: true, status: 200 }; };
const offline = async () => { throw new Error('network'); };

// 1-3: counting
seed();
assert.equal((await wrong()), 'wrong'); assert.equal(load().fails, 1);
assert.equal((await wrong()), 'wrong'); assert.equal(load().fails, 2);
assert.equal(load().ownCode, 'ABCD2345', 'no wipe after 2 wrong PINs');
assert.equal((await wrong()), 'wipe', '3rd consecutive wrong PIN triggers the wipe');
console.log('ok  1/2/3 one and two wrong = no wipe, third = wipe');

// 4: a correct PIN resets
seed();
(await wrong()); (await wrong());
assert.equal((await right()), 'ok'); assert.equal(load().fails, 0);
(await wrong()); (await wrong());
assert.equal((await wrong()), 'wipe', 'counter really restarted from 0');
console.log('ok  4 correct PIN resets the counter');

// 5: restart does not reset (counter is stored; a fresh module instance reads it back)
seed();
(await wrong()); (await wrong());
const B = await import('./src/autowipe.js?restarted');
assert.equal((await B.finishAttempt(false, await B.beginAttempt())), 'wipe', 'attempts survive an app restart');
console.log('ok  5 restart keeps the attempt counter');

// switched off: never counts, never wipes
seed({ autoWipe: false });
for (let i = 0; i < 5; i++) assert.equal((await wrong()), 'wrong');
assert.equal(load().fails || 0, 0); assert.equal(load().ownCode, 'ABCD2345');
console.log('ok  setting OFF: no counting, no wipe');

// concurrent attempts are serialised, so exactly one wipe fires
seed();
const results = await Promise.all([1, 2, 3].map(() => A.serial(() => wrong())));
assert.deepEqual(results, ['wrong', 'wrong', 'wipe']);
assert.equal(results.filter((r) => r === 'wipe').length, 1, 'parallel attempts cannot dodge the limit');
console.log('ok  concurrent attempts are serialised');

// 6/7/8/9/11/12: wipe while offline -> local data gone, server pending, then confirmed
seed(); idb.add('chat-cache'); cacheKeys.add('api'); ui = 0;
let nativeWiped = 0; let identityReset = 0;
const raw = JSON.stringify(PRIV);
await A.silentWipe({ post: offline, nativeWipe: async () => { nativeWiped++; }, resetIdentity: () => { identityReset++; }, serverWaitMs: 50 });
const kept = load();
assert.deepEqual(Object.keys(kept).sort(), ['autoWipe', 'fails', 'holdMs', 'name', 'notify', 'passHash', 'passLen', 'salt', 'theme'].filter((k) => k in kept).sort(), 'only app profile fields remain');
for (const k of A.CHAT_KEYS) assert.ok(!(k in kept), `chat field gone: ${k}`);
assert.equal(kept.name, 'Prabha'); assert.equal(kept.passHash, 'h'); assert.equal(kept.holdMs, 3000); assert.equal(kept.theme, 'dark');
assert.equal(localStorage.getItem('snake_best'), '200', 'game scores stay');
assert.ok(localStorage.getItem(A.QUEUE_KEY), 'retry queue kept');
assert.ok(![...mem.values()].some((v) => v.includes('SECRET-PRIVATE-KEY-MATERIAL')), 'private key material is gone');
const lastProfileWrite = sets.filter(([k]) => k === 'cc_profile_v2').pop();
assert.ok(lastProfileWrite && !lastProfileWrite[1].includes('SECRET-PRIVATE-KEY-MATERIAL'), 'key was overwritten before removal');
assert.equal(idb.size, 0, 'IndexedDB databases deleted'); assert.equal(cacheKeys.size, 0, 'caches deleted');
assert.equal(nativeWiped, 1); assert.equal(identityReset, 1); assert.ok(sessionCleared > 0);
assert.equal(A.readQueue().length, 2, 'offline: both server deletions stay queued (not claimed done)');
assert.equal(ui, 0, 'no alert / notification during the wipe');
console.log('ok  6/8/9/11 offline wipe: local data + keys + caches destroyed, silent, server pending');

// server retry: failure keeps the entry, confirmation removes it
const calls = [];
assert.equal(await A.flushQueue(async () => ({ ok: false, status: 500 })), 2, '500 keeps entries queued');
assert.equal(await A.flushQueue(okPost(calls)), 0, 'confirmed deletions leave the queue');
assert.deepEqual(calls.map(([p, b]) => [p, b.code, b.silent]), [['/api/close', 'ABCD2345', true], ['/api/close', 'WXYZ6789', true]]);
assert.equal(localStorage.getItem(A.QUEUE_KEY), null);
console.log('ok  6/7 server deletion retried and only dropped after the server confirms (both rooms)');

// 10: repeated / concurrent wipes are idempotent
seed();
await Promise.all([A.silentWipe({ post: okPost(), serverWaitMs: 50 }), A.silentWipe({ post: okPost(), serverWaitMs: 50 })]);
await A.silentWipe({ post: okPost(), serverWaitMs: 50 });
assert.deepEqual([...mem.keys()].sort(), ['cc_profile_v2', 'snake_best']); assert.equal(A.readQueue().length, 0); assert.equal(load().name, 'Prabha');
console.log('ok  10 repeated wipe requests are idempotent');

// counted BEFORE the PIN is checked: starting an attempt and then killing the app still uses up a try
seed();
await A.beginAttempt(); await A.beginAttempt(); // two attempts that never finished
assert.equal(load().fails, 2, 'unfinished attempts are already counted');
assert.equal(await A.finishAttempt(false, await A.beginAttempt()), 'wipe', 'third attempt wipes even though the first two never returned');
console.log('ok  attempts are counted before the PIN is checked');

// Keystore-sealed counter (Android): editing / rolling back the profile cannot reset it; unreadable value = tampering
const sealed = { n: 0, tampered: false };
A.__setNative({ get: async () => ({ ...sealed }), set: async (n) => { sealed.n = n; sealed.tampered = false; } });
seed();
await wrong(); await wrong();
assert.equal(sealed.n, 2);
save({ fails: 0 }); // an attacker edits the stored profile back to 0
assert.equal(await wrong(), 'wipe', 'the sealed counter still remembers 2 failures');
seed(); sealed.n = 0; sealed.tampered = true; // sealed value corrupted / forged
assert.equal(await wrong(), 'wipe', 'tampered counter counts as one try left, so the next wrong PIN wipes');
seed(); sealed.n = 2; sealed.tampered = false;
assert.equal(await right(), 'ok'); assert.equal(sealed.n, 0, 'correct PIN resets the sealed counter too');
A.__setNative({ get: async () => null, set: async () => {} });
console.log('ok  sealed counter cannot be reset by editing the profile');

console.log('\nALL AUTOWIPE TESTS PASSED');
