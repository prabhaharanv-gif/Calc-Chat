import { Capacitor } from '@capacitor/core';

// Generic on purpose: no sender, no content (messages are end-to-end encrypted and the app is disguised).
const TITLE = 'New message';
const BODY = 'Open the app to read it';
const native = () => Capacitor.isNativePlatform();

async function plugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

// Ask the OS for permission to show notifications (call from a tap).
export async function ensurePermission() {
  try {
    if (native()) {
      const LN = await plugin();
      const r = await LN.requestPermissions();
      return r.display === 'granted';
    }
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  } catch { return false; }
}

export async function showSystemNotification() {
  try {
    if (native()) {
      const LN = await plugin();
      const perm = await LN.checkPermissions();
      if (perm.display !== 'granted') return;
      await LN.schedule({
        notifications: [{ id: Math.floor(Date.now() % 2147483647), title: TITLE, body: BODY, schedule: { at: new Date(Date.now() + 200) } }],
      });
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(TITLE, { body: BODY, tag: 'calcchat-new', renotify: true });
  } catch { /* some mobile browsers only allow service-worker notifications */ }
}
