// POST /api/logout: ends this browser's session.
import { clearCookie, json, sameSite } from '../../lib/api.js';

export async function onRequestPost({ request }) {
  if (!sameSite(request)) return json({ error: 'Not allowed.' }, 403);
  const res = json({ ok: true }); res.headers.append('Set-Cookie', clearCookie); return res;
}
