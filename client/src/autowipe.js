// Silent Auto-Wipe: after 3 consecutive wrong PINs all CHAT data is destroyed, quietly. The app itself (profile name,
// passcode, settings, game scores) stays, so nothing looks different from outside.
// - the failed-attempt counter lives in the stored profile (survives app restarts) and PIN attempts run one at a time
// - local data is erased first (keys are overwritten before removal), then the server rooms are closed
// - server deletion is confirmed by the server; until then it stays in a tiny retry queue (code + secret only)
// Nothing here logs, alerts or notifies. The caller shows no UI.
import { load, save } from './storage.js';
import { getFails, setFails } from './watcher.js';

export const MAX_FAILS = 3;
export const QUEUE_KEY = 'cc_wipe_queue_v1';
const PROFILE_KEY = 'cc_profile_v2';
// Everything in the profile that belongs to chats: codes, secrets, friend, chat names, online switches, keys, trust, unread.
export const CHAT_KEYS = ['ownCode', 'ownSecret', 'joined', 'chatNames', 'hide', 'e2e', 'trust', 'seen', 'pendingWipe'];

export const autoWipeOn = (profile = load()) => profile.autoWipe !== false;

// ---- one PIN attempt at a time (no parallel attempts to dodge the counter) ----
let chain = Promise.resolve();
export const serial = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

// ---- failed-attempt counter ----
// Every attempt is counted BEFORE the PIN is even checked (so killing the app mid-check does not help), and the
// counter is kept in two places: the profile and, in the Android app, a Keystore-sealed value that cannot be forged
// by editing files. The larger of the two wins. A sealed value that cannot be read (tampering) counts as "one try left".
let native = { get: getFails, set: setFails };
export const __setNative = (n) => { native = n; }; // for tests

async function readCount() {
  const local = load().fails || 0;
  const n = await native.get();
  if (!n) return local;
  if (n.tampered) return Math.max(local, MAX_FAILS - 1);
  return Math.max(local, n.n || 0);
}
async function writeCount(n) { save({ fails: n }); await native.set(n); }

export async function beginAttempt() {
  if (!autoWipeOn()) return 0;
  const n = (await readCount()) + 1;
  await writeCount(n);
  return n;
}

// -> 'ok' (counter reset), 'wrong' (counted) or 'wipe' (this was the 3rd wrong PIN in a row)
export async function finishAttempt(correct, n) {
  if (correct) { if (n || load().fails) await writeCount(0); return 'ok'; }
  if (!autoWipeOn() || !n) return 'wrong';
  return n >= MAX_FAILS ? 'wipe' : 'wrong';
}

// ---- pending server deletions (survive the local wipe) ----
export function readQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY));
    return Array.isArray(q) ? q.filter((t) => t && t.code && t.secret) : [];
  } catch { return []; }
}
function writeQueue(q) {
  try {
    if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    else localStorage.removeItem(QUEUE_KEY);
  } catch { /* storage blocked */ }
}
export function queueTargets(targets) {
  const q = readQueue();
  for (const t of targets) if (!q.some((x) => x.code === t.code)) q.push({ code: t.code, secret: t.secret });
  writeQueue(q);
}

// Close every queued room on the server. An entry is removed only after the server answers:
// 200 (closed / already gone) or 403/404/400 (nothing of ours left to delete). Network errors keep it queued.
let flushing = null;
export function flushQueue(post) {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const t of readQueue()) {
      try {
        const r = await post('/api/close', { code: t.code, secret: t.secret, silent: true });
        if (r.ok || [400, 403, 404].includes(r.status)) writeQueue(readQueue().filter((x) => x.code !== t.code));
      } catch { /* offline: try again later */ }
    }
    return readQueue().length;
  })().finally(() => { flushing = null; });
  return flushing;
}

// ---- local destruction ----
const junk = (s) => Array.from({ length: Math.max(8, String(s || '').length) }, () => Math.floor(Math.random() * 36).toString(36)).join('');

// Overwrite key material before it is removed, so nothing recoverable is left in the stored value.
function shred(profile) {
  const e = profile.e2e;
  if (!e) return;
  const bad = { ...profile, e2e: { priv: { k: junk(JSON.stringify(e.priv || e.sealed || '')) }, pub: { k: junk(JSON.stringify(e.pub)) }, ...(e.sealed ? { sealed: junk(e.sealed) } : {}) },
    ownSecret: junk(profile.ownSecret), joined: profile.joined ? { code: junk(profile.joined.code), secret: junk(profile.joined.secret) } : null,
    passHash: junk(profile.passHash), salt: junk(profile.salt) };
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(bad)); } catch { /* ignore */ }
}

export async function wipeLocal({ nativeWipe, resetIdentity } = {}) {
  const p = load();
  shred(p);
  // Keep the app profile (name, passcode hash, settings) but drop every chat field; game scores are not touched.
  const rest = { ...p };
  for (const k of CHAT_KEYS) delete rest[k];
  rest.fails = 0;
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(rest)); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  try { resetIdentity?.(); } catch { /* ignore */ }
  try {
    const dbs = (await globalThis.indexedDB?.databases?.()) || [];
    await Promise.all(dbs.filter((d) => d.name).map((d) => new Promise((res) => {
      const r = globalThis.indexedDB.deleteDatabase(d.name);
      r.onsuccess = r.onerror = r.onblocked = () => res();
    })));
  } catch { /* ignore */ }
  try { for (const k of (await globalThis.caches?.keys?.()) || []) await globalThis.caches.delete(k); } catch { /* ignore */ }
  try { for (const r of (await globalThis.navigator?.serviceWorker?.getRegistrations?.()) || []) await r.unregister(); } catch { /* ignore */ }
  try { await nativeWipe?.(); } catch { /* ignore */ }
}

// The whole wipe. Safe to call twice (second call finds nothing to do).
let wiping = null;
export function silentWipe({ post, nativeWipe, resetIdentity, serverWaitMs = 2500 } = {}) {
  if (wiping) return wiping;
  wiping = (async () => {
    const p = load();
    const targets = [];
    if (p.ownCode && p.ownSecret) targets.push({ code: p.ownCode, secret: p.ownSecret });
    if (p.joined?.code && p.joined?.secret) targets.push(p.joined);
    queueTargets(targets);                       // 1. remember what must be deleted on the server
    await wipeLocal({ nativeWipe, resetIdentity }); // 2. destroy everything on this device
    const waited = flushQueue(post);              // 3. ask the server (confirmed deletions leave the queue)
    await Promise.race([waited, new Promise((r) => setTimeout(r, serverWaitMs))]);
  })().finally(() => { wiping = null; });
  return wiping;
}
