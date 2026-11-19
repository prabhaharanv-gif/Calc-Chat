import { Capacitor, registerPlugin } from '@capacitor/core';

// Android only: a background service that shows a generic "game" notification when the friend writes.
// It never gets (or shows) any message content, name or code.
const Watcher = Capacitor.isNativePlatform() ? registerPlugin('Watcher') : null;

export const isNative = !!Watcher;
export const getSecure = () => (Watcher ? Watcher.getSecure().then((r) => !!r.enabled).catch(() => true) : Promise.resolve(true));
export const setSecure = (enabled) => Watcher?.setSecure({ enabled }).catch(() => {});
export const seal = (text) => (Watcher ? Watcher.seal({ text }).then((r) => r.blob || null).catch(() => null) : Promise.resolve(null));
export const unseal = (blob) => (Watcher ? Watcher.unseal({ blob }).then((r) => r.text || null).catch(() => null) : Promise.resolve(null));
// PIN attempt counter, sealed with the Keystore (Android only). getFails -> { n, tampered } or null on the web.
export const getFails = () => (Watcher ? Watcher.getFails().then((r) => ({ n: r.n || 0, tampered: !!r.tampered })).catch(() => null) : Promise.resolve(null));
export const setFails = (n) => (Watcher ? Watcher.setFails({ n }).catch(() => {}) : Promise.resolve());
export const startWatcher = (cfg) => Watcher?.start(cfg).catch(() => {});
export const stopWatcher = () => Watcher?.stop().catch(() => {});
export const wipeWatcher = () => Watcher?.wipe().catch(() => {});
