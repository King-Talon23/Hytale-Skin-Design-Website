// GET /api/players/<uuid>/skins: the skins a player has published (newest first), for anyone to see.
import { ensure, json, uuidOf } from '../../../../lib/api.js';

export async function onRequestGet({ params, env }) {
  const uuid = uuidOf(params.uuid); if (!uuid) return json({ error: 'That is not a player UUID.' }, 400);
  if (!env.DB) return json({ skins: [] }, 200, 30);   // the database is not connected yet
  await ensure(env.DB);
  const { results } = await env.DB.prepare(`SELECT s.id, s.name, s.recipe, s.updated FROM skins s LEFT JOIN players p ON p.uuid = s.owner_uuid
    WHERE s.owner_uuid = ?1 AND s.hidden = 0 AND COALESCE(p.banned, 0) = 0 ORDER BY s.updated DESC LIMIT 45`).bind(uuid).all();
  const p = await env.DB.prepare('SELECT supporter FROM players WHERE uuid = ?1').bind(uuid).first();
  const skins = []; for (const r of results) { try { skins.push({ id: r.id, name: r.name, skin: JSON.parse(r.recipe), updated: r.updated }); } catch { /* skip a broken row */ } }
  return json({ skins, supporter: !!(p && p.supporter) }, 200, 60);
}
