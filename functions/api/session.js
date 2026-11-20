// POST /api/session {access_token}: right after Sign in with Hytale, the site hands over the access token once. This server asks
// Hytale's own /userinfo who it belongs to (so it trusts Hytale, not the browser), keeps the game profile (UUID and username),
// drops the token and sets its own session cookie.
import { body, ensure, json, sameSite, sessionCookie, switchedOn, uuidOf } from '../../lib/api.js';
const NAME = /^[A-Za-z0-9_.-]{1,40}$/;

export async function onRequestPost({ request, env }) {
  if (!sameSite(request)) return json({ error: 'Not allowed.' }, 403);
  if (!switchedOn(env)) return json({ error: 'Publishing is not switched on yet.' }, 503);
  const b = await body(request), token = b && b.access_token;
  if (typeof token !== 'string' || !/^[\w.~+/=-]{10,4096}$/.test(token)) return json({ error: 'Sign in again.' }, 400);
  const r = await fetch('https://connect.accounts.hytale.com/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  const me = r.ok ? await r.json().catch(() => null) : null, p = me && me.profile, uuid = uuidOf(p && p.uuid);
  if (!uuid || typeof p.username !== 'string' || !NAME.test(p.username)) return json({ error: 'Hytale did not confirm a game profile. Sign in again and pick a profile.' }, 401);
  await ensure(env.DB);
  const row = await env.DB.prepare('SELECT banned FROM players WHERE uuid = ?1').bind(uuid).first();
  if (row && row.banned) return json({ error: 'This profile cannot publish skins.' }, 403);
  await env.DB.prepare('INSERT INTO players (uuid, username, updated) VALUES (?1, ?2, ?3) ON CONFLICT(uuid) DO UPDATE SET username = ?2, updated = ?3').bind(uuid, p.username, Date.now()).run();
  const res = json({ uuid, username: p.username }); res.headers.append('Set-Cookie', await sessionCookie(env, uuid)); return res;
}
