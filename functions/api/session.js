// POST /api/session {code, verifier, redirect_uri}: right after Sign in with Hytale the site hands over the one-time code.
// This server redeems it with Hytale itself under this site's own client ID, so only a sign-in made for this site works
// (a token issued to some other app can't be used here). It reads the picked game profile from Hytale's /userinfo, keeps
// the UUID and username, drops the tokens and sets its own session cookie. The profile goes back to the browser.
import { body, ensure, json, sameSite, sessionCookie, signinAllowed, switchedOn, uuidOf, SITE } from '../../lib/api.js';
import { HYTALE_CLIENT_ID } from '../../site/app/config.js';
const ISSUER = 'https://connect.accounts.hytale.com', NAME = /^[A-Za-z0-9_.-]{1,40}$/;
const AGAIN = 'That sign-in is not valid any more. Start again from the Locker.';

export async function onRequestPost({ request, env }) {
  if (!sameSite(request)) return json({ error: 'Not allowed.' }, 403);
  if (!HYTALE_CLIENT_ID) return json({ error: 'Sign in with Hytale is not switched on yet.' }, 503);
  if (switchedOn(env)) { await ensure(env.DB); if (!await signinAllowed(env, request)) return json({ error: 'Too many sign-ins from here. Wait a few minutes and try again.' }, 429); }
  const b = await body(request), code = b && b.code, verifier = b && b.verifier, redirect = b && b.redirect_uri;
  const okRedirect = [SITE + '/auth/callback', new URL(request.url).origin + '/auth/callback'];
  if (typeof code !== 'string' || !/^[\w.~-]{1,4096}$/.test(code) || typeof verifier !== 'string' || !/^[\w~.-]{43,128}$/.test(verifier) || !okRedirect.includes(redirect))
    return json({ error: AGAIN }, 400);
  const t = await fetch(ISSUER + '/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier, client_id: HYTALE_CLIENT_ID }) });
  const tokens = await t.json().catch(() => null);
  if (!t.ok || !tokens || typeof tokens.access_token !== 'string') return json({ error: tokens && tokens.error === 'invalid_grant' ? AGAIN : 'Hytale did not accept the sign-in. Try again.' }, 401);
  const r = await fetch(ISSUER + '/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
  const me = r.ok ? await r.json().catch(() => null) : null, p = me && me.profile, uuid = uuidOf(p && p.uuid);
  if (!uuid || typeof p.username !== 'string' || !NAME.test(p.username)) return json({ error: 'No game profile was shared. Sign in again and pick a profile.' }, 401);
  // what the account owns, when Hytale shares it: handed to the browser to unlock those items there, never stored here
  const ent = ([me.entitlements, p.entitlements, me.editions, p.editions].find(Array.isArray) || []).filter(x => typeof x === 'string' && x.length <= 80).slice(0, 300);
  const out = { uuid, username: p.username, entitlements: ent, publishing: false };
  if (!switchedOn(env)) return json(out);
  await ensure(env.DB);
  const row = await env.DB.prepare('SELECT banned, sess FROM players WHERE uuid = ?1').bind(uuid).first();
  if (row && row.banned) return json(out);
  await env.DB.prepare('INSERT INTO players (uuid, username, updated) VALUES (?1, ?2, ?3) ON CONFLICT(uuid) DO UPDATE SET username = ?2, updated = ?3').bind(uuid, p.username, Date.now()).run();
  const res = json({ ...out, publishing: true }); res.headers.append('Set-Cookie', await sessionCookie(env, uuid, row ? row.sess || 0 : 0)); return res;
}
