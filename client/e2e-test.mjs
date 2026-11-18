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
console.log('e2e: all checks passed');
