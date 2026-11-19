import { generateIdentity, supported } from './e2e.js';
import { load, save } from './storage.js';
import { isNative, seal, unseal } from './watcher.js';

let cache = null;
export const resetIdentity = () => { cache = null; };

// This device's long-term key pair. Only the keys are stored, never messages.
// In the Android app the private key is sealed with a hardware-backed Keystore key before it is stored, so the
// stored value cannot be read without this app on this phone. (In a browser it is stored as before.)
export async function getIdentity() {
  if (!supported) return null;
  if (cache) return cache;
  let p = load().e2e;

  if (isNative && p?.priv && !p.sealed) { // upgrade an older plain-text key
    const blob = await seal(JSON.stringify(p.priv));
    if (blob) { p = { pub: p.pub, sealed: blob }; save({ e2e: p }); }
  }
  if (p?.sealed) {
    const text = await unseal(p.sealed);
    let priv = null;
    try { priv = text ? JSON.parse(text) : null; } catch { /* unreadable */ }
    if (priv && p.pub) { cache = { privJwk: priv, pubJson: JSON.stringify(p.pub) }; return cache; }
    p = null; // the Keystore key is gone (wipe / reinstall): make a new identity
  }
  if (!p?.priv || !p?.pub) {
    const gen = await generateIdentity();
    const blob = isNative ? await seal(JSON.stringify(gen.priv)) : null;
    p = blob ? { pub: gen.pub, sealed: blob } : gen;
    save({ e2e: p });
  }
  cache = { privJwk: p.priv || JSON.parse(await unseal(p.sealed)), pubJson: JSON.stringify(p.pub) };
  return cache;
}
