import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { SERVER } from './config.js';
import { post } from './api.js';
import { getIdentity } from './identity.js';

// Keeps one light "inbox" connection per chat room (own code + joined code) while the app is open,
// even when it is locked. The server sends only a tiny ping ("someone sent a message"), never content.
export function useInbox(profile, armed, onPing) {
  const cb = useRef(onPing);
  cb.current = onPing;
  const joinedCode = profile.joined?.code;
  const joinedSecret = profile.joined?.secret;

  useEffect(() => {
    if (!armed) return undefined;
    let dead = false;
    const sockets = [];
    (async () => {
      const id = await getIdentity();
      if (dead) return;
      const rooms = [{ role: 'owner', code: profile.ownCode, secret: profile.ownSecret }];
      if (joinedCode) rooms.push({ role: 'guest', code: joinedCode, secret: joinedSecret });
      for (const r of rooms) {
        const s = io(SERVER || undefined, {
          auth: { code: r.code, secret: r.secret, name: profile.name, pub: id?.pubJson, inbox: true },
        });
        s.on('ping', (p) => {
          if (p?.from !== r.role) cb.current({ role: r.role, name: p?.name, time: p?.time, replay: p?.replay === true });
        });
        s.on('connect_error', async (e) => {
          if (e.message === 'no_room' && r.role === 'owner') {
            try {
              await post('/api/host', { code: r.code, secret: r.secret, name: profile.name, pub: id?.pubJson });
              setTimeout(() => { if (!dead) s.connect(); }, 500);
            } catch { /* offline: socket.io keeps retrying other errors */ }
          }
        });
        sockets.push(s);
      }
    })();
    return () => { dead = true; sockets.forEach((s) => s.disconnect()); };
  }, [armed, profile.ownCode, profile.ownSecret, joinedCode, joinedSecret, profile.name]);
}
