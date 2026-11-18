import { generateIdentity, supported } from './e2e.js';
import { load, save } from './storage.js';

let cache = null;

// This device's long-term key pair. Only the keys are stored, never messages.
export async function getIdentity() {
  if (!supported) return null;
  if (cache) return cache;
  let p = load().e2e;
  if (!p?.priv || !p?.pub) {
    p = await generateIdentity();
    save({ e2e: p });
  }
  cache = { privJwk: p.priv, pubJson: JSON.stringify(p.pub) };
  return cache;
}
