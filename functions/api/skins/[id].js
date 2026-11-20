// DELETE /api/skins/<id>: unpublish one of your own skins.
import { json, sameSite, spend, whoIs } from '../../../lib/api.js';

export async function onRequestDelete({ request, env, params }) {
  if (!sameSite(request)) return json({ error: 'Not allowed.' }, 403);
  const me = await whoIs(request, env); if (!me) return json({ error: 'Sign in with Hytale first.' }, 401);
  const id = String(params.id || ''); if (!/^[A-Za-z0-9_-]{12}$/.test(id)) return json({ error: 'Unknown skin.' }, 404);
  if (!await spend(env, me.uuid)) return json({ error: 'Too many changes for now. Try again in an hour.' }, 429);
  const r = await env.DB.prepare('DELETE FROM skins WHERE id = ?1 AND owner_uuid = ?2').bind(id, me.uuid).run();
  return r.meta.changes ? json({ ok: true }) : json({ error: 'Unknown skin.' }, 404);
}
