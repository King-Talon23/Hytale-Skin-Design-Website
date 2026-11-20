// Sign in with Hytale: OpenID Connect, Authorization Code flow with PKCE, as a public (browser-only) client with no secret.
// The site keeps one thing from a sign-in: the game profile the player picked (UUID and username), in this browser only.
// Tokens are used once to read that profile and then dropped; nothing is sent to any server of ours, because there is none.
import { HYTALE_CLIENT_ID } from './config.js';
import * as db from './db.js';

const ISSUER = 'https://connect.accounts.hytale.com', SCOPE = 'openid hytale:profile', KEY = 'hy_signin';
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i, NAME = /^[A-Za-z0-9_.-]{1,40}$/;
export const enabled = /^[A-Za-z0-9._~-]{3,200}$/.test(HYTALE_CLIENT_ID);   // off until a client ID is set in config.js
const redirectUri = () => location.origin + '/auth/callback';
const b64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const challengeOf = async verifier => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
export function authorizeUrl(state, challenge) {
  return `${ISSUER}/oauth2/auth?` + new URLSearchParams({ response_type: 'code', client_id: HYTALE_CLIENT_ID, redirect_uri: redirectUri(), scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256' });
}

export async function start() {   // leaves the site for Hytale's own sign-in and consent page
  if (!enabled) throw new Error('Sign in with Hytale is not switched on yet.');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32))), state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(KEY, JSON.stringify({ verifier, state, at: Date.now() }));
  location.assign(authorizeUrl(state, await challengeOf(verifier)));
}

const ERRORS = { access_denied: 'You chose not to share on the Hytale screen. Nothing was shared.', invalid_scope: 'This site is not approved for what it asked Hytale for.' };
const AGAIN = 'That sign-in is not valid any more. Start again from the Locker.';
export async function finish(query) {   // runs on /auth/callback
  let saved = null; try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { /* treated as missing */ }
  sessionStorage.removeItem(KEY); history.replaceState(null, '', location.pathname);   // the one-time code leaves the address bar straight away
  const err = query.get('error'); if (err) throw new Error(ERRORS[err] || 'Hytale could not sign you in. Try again.');   // only our own wording is shown, never text from the address
  const code = query.get('code');
  if (!saved || typeof saved.verifier !== 'string' || !code || !/^[\w.~-]{1,4096}$/.test(code) || query.get('state') !== saved.state || Date.now() - saved.at > 15 * 60000) throw new Error(AGAIN);
  const opts = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' };
  const r = await fetch(`${ISSUER}/oauth2/token`, { ...opts, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: saved.verifier, client_id: HYTALE_CLIENT_ID }) });
  const tokens = await r.json().catch(() => null);
  if (!r.ok || !tokens || typeof tokens.access_token !== 'string') throw new Error(tokens?.error === 'invalid_grant' ? AGAIN : 'Hytale did not accept the sign-in. Try again.');
  // The profile is read from Hytale's own /userinfo over HTTPS with the token just issued, so the id_token is not used or trusted here.
  const u = await fetch(`${ISSUER}/userinfo`, { ...opts, headers: { Authorization: 'Bearer ' + tokens.access_token } });
  const me = u.ok ? await u.json().catch(() => null) : null, p = me && me.profile;
  if (!p || typeof p.uuid !== 'string' || typeof p.username !== 'string' || !UUID.test(p.uuid) || !NAME.test(p.username)) throw new Error('No game profile was shared. Sign in again and pick a profile.');
  const account = { uuid: p.uuid.toLowerCase(), username: p.username, at: Date.now() };
  await db.put('meta', 'account', account); return account;   // the tokens go out of scope here and are never stored
}
export async function account() { const a = await db.get('meta', 'account'); return a && UUID.test(a.uuid) && NAME.test(a.username) ? a : null; }
export const signOut = () => db.del('meta', 'account');
