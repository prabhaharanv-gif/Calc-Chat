import { post } from './api.js';

// After a server restart the room (and the guest's place in it) is gone. The guest re-joins with the same code + secret.
// -> 'ok' joined again | 'wait' the owner has not re-opened the room yet (or no network): try again later
//    | 'full' somebody else took the place meanwhile | 'fail'
export async function rejoinGuest({ code, secret, pub }) {
  try {
    const r = await post('/api/join', { code, secret, pub });
    if (r.ok) return 'ok';
    if (r.status === 404 || r.status === 429) return 'wait';
    if (r.status === 409) return 'full';
    return 'fail';
  } catch { return 'wait'; }
}
