// Passcode hashing. New hashes use PBKDF2-SHA256 with many rounds (slow on purpose, so guessing a stolen hash
// is expensive). Where the browser has no WebCrypto, a slower-to-guess iterated SHA-256 is used instead.
// Old plain "sha256(salt:pin)" hashes still work and are upgraded the first time the right PIN is entered.
import { sha256 } from './sha256.js';

const subtle = globalThis.crypto?.subtle;
const enc = new TextEncoder();
const PBKDF2_ROUNDS = 210000;
const FALLBACK_ROUNDS = 30000;
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function pbkdf2(salt, pin, rounds) {
  const key = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`calc-chat:${salt}`), iterations: rounds }, key, 256));
}
function iterated(salt, pin, rounds) {
  let h = sha256(`${salt}:${pin}`);
  for (let i = 1; i < rounds; i++) h = sha256(`${h}:${salt}`);
  return h;
}

export async function hashPin(salt, pin, { useSubtle = !!subtle } = {}) {
  return useSubtle
    ? `pbkdf2$${PBKDF2_ROUNDS}$${await pbkdf2(salt, pin, PBKDF2_ROUNDS)}`
    : `sha256x$${FALLBACK_ROUNDS}$${iterated(salt, pin, FALLBACK_ROUNDS)}`;
}

// -> { ok, upgrade } where `upgrade` is a stronger hash to store when an old-format hash matched.
export async function verifyPin(profile, pin) {
  const stored = String(profile.passHash || '');
  const [kind, rounds, digest] = stored.split('$');
  let ok = false;
  if (kind === 'pbkdf2' && subtle) ok = (await pbkdf2(profile.salt, pin, Number(rounds))) === digest;
  else if (kind === 'sha256x') ok = iterated(profile.salt, pin, Number(rounds)) === digest;
  else if (!digest) {
    ok = sha256(`${profile.salt}:${pin}`) === stored; // legacy
    return { ok, upgrade: ok ? await hashPin(profile.salt, pin) : null };
  }
  return { ok, upgrade: null };
}
