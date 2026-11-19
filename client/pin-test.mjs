// Passcode hashing tests: node pin-test.mjs
import assert from 'assert';
import { hashPin, verifyPin } from './src/pinhash.js';
import { sha256 } from './src/sha256.js';

const salt = 'abcdef0123456789';
const profile = async (pin, opts) => ({ salt, passHash: await hashPin(salt, pin, opts) });

// new hashes: PBKDF2, salted, verifies only the right PIN
const p = await profile('1234');
assert.ok(p.passHash.startsWith('pbkdf2$210000$'), 'PBKDF2 with 210k rounds');
assert.equal((await verifyPin(p, '1234')).ok, true);
assert.equal((await verifyPin(p, '1235')).ok, false);
assert.notEqual(p.passHash, (await profile('1234')).passHash.replace(salt, 'x') + 'x');
assert.notEqual(await hashPin('othersalt', '1234'), p.passHash, 'salt changes the hash');
console.log('ok  PBKDF2 hash verifies only the right PIN');

// it is slow on purpose
const t = Date.now(); await verifyPin(p, '0000');
assert.ok(Date.now() - t > 20, `one guess must cost real time (took ${Date.now() - t} ms)`);
console.log(`ok  one guess costs ${Date.now() - t} ms (plain sha256 is ~0 ms)`);

// no WebCrypto: iterated SHA-256 fallback still works
const f = await profile('4321', { useSubtle: false });
assert.ok(f.passHash.startsWith('sha256x$'));
assert.equal((await verifyPin(f, '4321')).ok, true);
assert.equal((await verifyPin(f, '4322')).ok, false);
console.log('ok  fallback hash works');

// legacy sha256(salt:pin) profiles still unlock, and are upgraded
const legacy = { salt, passHash: sha256(`${salt}:9876`) };
const bad = await verifyPin(legacy, '1111');
assert.equal(bad.ok, false); assert.equal(bad.upgrade, null);
const good = await verifyPin(legacy, '9876');
assert.equal(good.ok, true);
assert.ok(good.upgrade.startsWith('pbkdf2$'), 'right PIN upgrades the old hash');
assert.equal((await verifyPin({ salt, passHash: good.upgrade }, '9876')).ok, true, 'upgraded hash verifies');
assert.equal((await verifyPin({ salt, passHash: good.upgrade }, '9877')).ok, false);
console.log('ok  legacy hash accepted and upgraded');

// garbage / empty stored values never match
assert.equal((await verifyPin({ salt, passHash: '' }, '1234')).ok, false);
assert.equal((await verifyPin({ salt, passHash: 'pbkdf2$1$zz' }, '1234')).ok, false);
console.log('\nALL PIN TESTS PASSED');
