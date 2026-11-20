// GET /api/me: whether publishing is on, who is signed in, and the skins they published.
// DELETE /api/me: removes everything this server holds about the signed-in player (their published skins and their profile row),
// which also ends all their sessions.
import { clearCookie, json, sameSite, switchedOn, whoIs } from '../../lib/api.js';

export async function onRequestGet({ request, env }) {
  if (!switchedOn(env)) return json({ on: false });
  const me = await whoIs(request, env); if (!me) return json({ on: true, signedIn: false });
  const { results } = await env.DB.prepare('SELECT id, name, hidden, updated FROM skins WHERE owner_uuid = ?1 ORDER BY updated DESC').bind(me.uuid).all();
  return json({ on: true, signedIn: true, uuid: me.uuid, username: me.username, skins: results.map(r => ({ id: r.id, name: r.name, hidden: !!r.hidden, updated: r.updated })) });
}
export async function onRequestDelete({ request, env }) {
  if (!sameSite(request)) return json({ error: 'Not allowed.' }, 403);
  const me = await whoIs(request, env); if (!me) return json({ error: 'Sign in first.' }, 401);
  await env.DB.batch([env.DB.prepare('DELETE FROM skins WHERE owner_uuid = ?1').bind(me.uuid), env.DB.prepare('DELETE FROM writes WHERE uuid = ?1').bind(me.uuid),
    env.DB.prepare('DELETE FROM supporters_pending WHERE username = lower(?1)').bind(me.username), env.DB.prepare('DELETE FROM players WHERE uuid = ?1').bind(me.uuid)]);
  const res = json({ ok: true }); res.headers.append('Set-Cookie', clearCookie); return res;
}
