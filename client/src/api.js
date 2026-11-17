import { SERVER } from './config.js';

export async function post(path, body) {
  const r = await fetch(SERVER + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch { /* empty body */ }
  return { ok: r.ok, status: r.status, ...j };
}
