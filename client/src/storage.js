// Only identity/settings live on the device. Messages are NEVER stored.
const KEY = 'cc_profile_v2';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function save(patch) {
  const next = { ...load(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}

const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
export const randomCode = () => Array.from(rand(8), (b) => ALPHABET[b % 32]).join('');
export const randomSecret = () => Array.from(rand(24), (b) => b.toString(16).padStart(2, '0')).join('');

export function initProfile() {
  const p = load();
  if (p.ownCode && p.ownSecret) return p;
  return save({ ownCode: randomCode(), ownSecret: randomSecret() });
}
