// End-to-end encryption helpers (WebCrypto).
//   identity:  ECDH P-256 key pair per device
//   session:   ECDH(my private, friend's public) -> HKDF-SHA256 (salt = chat code) -> AES-256-GCM key
//   messages:  [12-byte random IV][ciphertext+tag]
// The server only ever sees ciphertext and public keys.
const subtle = globalThis.crypto?.subtle;
export const supported = !!subtle;

const enc = new TextEncoder();
const dec = new TextDecoder();
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };

export async function generateIdentity() {
  const kp = await subtle.generateKey(ECDH, true, ['deriveBits']);
  const priv = await subtle.exportKey('jwk', kp.privateKey);
  const pub = await subtle.exportKey('jwk', kp.publicKey);
  return { priv, pub: { crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y } };
}

export async function deriveKey(privJwk, peerPubJson, roomCode) {
  const priv = await subtle.importKey('jwk', privJwk, ECDH, false, ['deriveBits']);
  const pub = await subtle.importKey('jwk', JSON.parse(peerPubJson), ECDH, false, []);
  const bits = await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const hkdf = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(roomCode), info: enc.encode('calcchat-e2e-v1') },
    hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

// Padding: every plaintext is padded up to a size class before it is encrypted, so the server (and anyone watching
// the network) only learns the size class, not the exact length. Layout: 0xA7 | length (4 bytes) | data | zeros.
const MAGIC = 0xa7;
export function paddedSize(n, min = 256) {
  if (n <= 1 << 20) { let s = min; while (s < n) s *= 2; return s; } // powers of two up to 1 MB
  const MB = 1 << 20;
  return Math.ceil(n / MB) * MB; // then whole megabytes
}
function pad(bytes, { min = 256, max = Infinity } = {}) {
  const need = bytes.length + 5;
  let size = paddedSize(need, min);
  if (size > max) size = need; // too close to a server limit: send it unpadded rather than fail
  const out = new Uint8Array(size);
  out[0] = MAGIC;
  new DataView(out.buffer).setUint32(1, bytes.length);
  out.set(bytes, 5);
  return out;
}
function unpad(b) {
  if (b[0] !== MAGIC) throw new Error('bad padding');
  const len = new DataView(b.buffer, b.byteOffset).getUint32(1);
  if (5 + len > b.length) throw new Error('bad padding');
  return b.slice(5, 5 + len);
}

export async function encryptBytes(key, bytes, padOpts) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, pad(new Uint8Array(bytes), padOpts)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out.buffer;
}

export async function decryptBytes(key, buf) {
  const b = new Uint8Array(buf);
  return unpad(new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12)))).buffer;
}

// Text must stay under the server's 20000-byte limit, so it is only padded while it fits.
export const encText = (key, text, padOpts = { min: 256, max: 19000 }) => encryptBytes(key, enc.encode(text), padOpts);
export const decText = async (key, buf) => dec.decode(await decryptBytes(key, buf));

// Short number both people can compare out loud to detect a man-in-the-middle.
export async function safetyNumber(pubJsonA, pubJsonB) {
  const [a, b] = [pubJsonA, pubJsonB].sort();
  const h = new Uint8Array(await subtle.digest('SHA-256', enc.encode(`${a}|${b}`)));
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(h[i]);
  return (n % 10n ** 12n).toString().padStart(12, '0').match(/.{4}/g).join(' ');
}
