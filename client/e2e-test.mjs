// node e2e-test.mjs : checks the end-to-end encryption helpers
import assert from 'assert';
import { generateIdentity, deriveKey, encText, decText, encryptBytes, decryptBytes, safetyNumber } from './src/e2e.js';

const alice = await generateIdentity();
const bob = await generateIdentity();
const eve = await generateIdentity();
const pubA = JSON.stringify(alice.pub), pubB = JSON.stringify(bob.pub), pubE = JSON.stringify(eve.pub);

const kA = await deriveKey(alice.priv, pubB, 'ABCD2345');
const kB = await deriveKey(bob.priv, pubA, 'ABCD2345');

const ct = await encText(kA, 'hello பிரபா 👋');
assert.equal(await decText(kB, ct), 'hello பிரபா 👋', 'both sides derive the same key');
assert.notEqual(new TextDecoder().decode(ct.slice(12)), 'hello', 'ciphertext differs from plaintext');

const ct2 = await encText(kA, 'hello பிரபா 👋');
assert.notDeepEqual(new Uint8Array(ct), new Uint8Array(ct2), 'random IV: same text encrypts differently');

const bytes = crypto.getRandomValues(new Uint8Array(60000));
const back = new Uint8Array(await decryptBytes(kB, await encryptBytes(kA, bytes)));
assert.deepEqual(back, bytes, 'binary round trip (photos/voice/video)');

const kE = await deriveKey(eve.priv, pubA, 'ABCD2345');
await assert.rejects(decText(kE, ct), 'an eavesdropper key cannot decrypt');
const kWrongRoom = await deriveKey(bob.priv, pubA, 'ZZZZ9999');
await assert.rejects(decText(kWrongRoom, ct), 'a different chat code gives a different key');

const tampered = new Uint8Array(ct); tampered[20] ^= 1;
await assert.rejects(decText(kB, tampered.buffer), 'tampering is detected');

assert.equal(await safetyNumber(pubA, pubB), await safetyNumber(pubB, pubA), 'safety number is symmetric');
assert.notEqual(await safetyNumber(pubA, pubB), await safetyNumber(pubA, pubE), 'safety number changes if a key is swapped');
assert.match(await safetyNumber(pubA, pubB), /^\d{4} \d{4} \d{4}$/);
// padding: the server only sees size classes, and everything still round-trips exactly
const { paddedSize } = await import('./src/e2e.js');
const sizeOf = async (s) => (await encText(kA, s)).byteLength;
assert.equal(await sizeOf('hi'), await sizeOf('a slightly longer message than hi'), 'short messages look identical in size');
assert.notEqual(await sizeOf('hi'), await sizeOf('x'.repeat(5000)), 'very different sizes are still different classes');
assert.equal(await decText(kB, await encText(kA, 'x'.repeat(5000))), 'x'.repeat(5000), 'long text round-trips');
assert.equal(await decText(kB, await encText(kA, '')), '', 'empty text round-trips');
for (const n of [1, 100, 5000, 70000, 1500000]) {
  const b = new Uint8Array(n); for (let o = 0; o < n; o += 65536) crypto.getRandomValues(b.subarray(o, Math.min(n, o + 65536)));
  assert.deepEqual(new Uint8Array(await decryptBytes(kB, await encryptBytes(kA, b, { min: 4096 }))), b, `binary ${n} bytes round-trips`);
}
assert.equal(paddedSize(10), 256); assert.equal(paddedSize(257), 512); assert.equal(paddedSize((1 << 20) + 1), 2 << 20);
assert.equal(await sizeOf('x'.repeat(19500)), 12 + 19500 + 5 + 16, 'near the server limit: sent unpadded instead of failing');
const nameMeta = await encText(kA, 'Prabha', { min: 64, max: 200 });
assert.ok(nameMeta.byteLength <= 256, 'padded display name fits the server meta limit');
assert.equal(await decText(kB, nameMeta), 'Prabha');
console.log('e2e: padding checks passed');
console.log('e2e: all checks passed');
