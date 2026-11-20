// POST /api/logout: signs this player out everywhere. Bumping their session number makes every cookie already handed out stop working.
import { clearCookie, json, sameSite, whoIs } from '../../lib/api.js';

export async function onRequestPost({ request, env }) {
  if (!sameSite(request)) return json({ error: 'Not allowed.' }, 403);
  const me = await whoIs(request, env);
  if (me) await env.DB.prepare('UPDATE players SET sess = sess + 1 WHERE uuid = ?1').bind(me.uuid).run();
  const res = json({ ok: true }); res.headers.append('Set-Cookie', clearCookie); return res;
}
