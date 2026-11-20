// POST /api/skins {id?, name, skin}: publish a skin, or update one of your own published skins (with its id).
import { MAX_SKINS, body, cleanName, json, newId, recipeOf, sameSite, spend, switchedOn, whoIs } from '../../../lib/api.js';

export async function onRequestPost({ request, env }) {
  if (!sameSite(request)) return json({ error: 'Not allowed.' }, 403);
  if (!switchedOn(env)) return json({ error: 'Publishing is not switched on yet.' }, 503);
  const me = await whoIs(request, env); if (!me) return json({ error: 'Sign in with Hytale first.' }, 401);
  const b = await body(request); if (!b) return json({ error: 'That skin could not be read.' }, 400);
  const name = cleanName(b.name), recipe = recipeOf(b.skin);
  if (!name) return json({ error: 'Give the skin a name first.' }, 400);
  if (!recipe) return json({ error: 'Only skins made of game items can be published. Custom assets stay on your computer.' }, 400);
  const now = Date.now(), text = JSON.stringify(recipe);
  if (b.id != null) {
    const id = String(b.id); if (!/^[A-Za-z0-9_-]{12}$/.test(id)) return json({ error: 'Unknown skin.' }, 404);
    const row = await env.DB.prepare('SELECT owner_uuid FROM skins WHERE id = ?1').bind(id).first();
    if (!row || row.owner_uuid !== me.uuid) return json({ error: 'Unknown skin.' }, 404);
    if (!await spend(env, me.uuid)) return json({ error: 'Too many changes for now. Try again in an hour.' }, 429);
    await env.DB.prepare('UPDATE skins SET name = ?2, recipe = ?3, updated = ?4 WHERE id = ?1').bind(id, name, text, now).run();
    return json({ id });
  }
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM skins WHERE owner_uuid = ?1').bind(me.uuid).first()).n;
  if (n >= MAX_SKINS) return json({ error: `You have ${MAX_SKINS} published skins, the most there can be. Unpublish one first.` }, 409);
  if (!await spend(env, me.uuid)) return json({ error: 'Too many changes for now. Try again in an hour.' }, 429);
  const id = newId();
  await env.DB.prepare('INSERT INTO skins (id, owner_uuid, name, recipe, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?5)').bind(id, me.uuid, name, text, now).run();
  return json({ id }, 201);
}
