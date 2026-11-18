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

export async function encryptBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out.buffer;
}

export async function decryptBytes(key, buf) {
  const b = new Uint8Array(buf);
  return subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12));
}

export const encText = (key, text) => encryptBytes(key, enc.encode(text));
export const decText = async (key, buf) => dec.decode(await decryptBytes(key, buf));

// Short number both people can compare out loud to detect a man-in-the-middle.
export async function safetyNumber(pubJsonA, pubJsonB) {
  const [a, b] = [pubJsonA, pubJsonB].sort();
  const h = new Uint8Array(await subtle.digest('SHA-256', enc.encode(`${a}|${b}`)));
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(h[i]);
  return (n % 10n ** 12n).toString().padStart(12, '0').match(/.{4}/g).join(' ');
}
