// Shared by the API (Cloudflare Pages Functions in /functions). The database is Cloudflare D1, bound to the Pages project as DB.
// Only published skins live there: the part names a skin is made of, its name, and the game UUID of the player who published it.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (uuid TEXT PRIMARY KEY, username TEXT NOT NULL, banned INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS skins (id TEXT PRIMARY KEY, owner_uuid TEXT NOT NULL, name TEXT NOT NULL, recipe TEXT NOT NULL,
     created INTEGER NOT NULL, updated INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS skins_owner ON skins (owner_uuid, hidden, updated)`,
  `CREATE TABLE IF NOT EXISTS writes (uuid TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS writes_uuid ON writes (uuid, at)`,
  // sign-in attempts per address, as a one-way code (never the address itself), kept 10 minutes to stop people hammering sign-in
  `CREATE TABLE IF NOT EXISTS signins (who TEXT NOT NULL, at INTEGER NOT NULL)`,
  // supporters_pending: from the old Ko-fi badges (switched off); kept only so old rows can be cleared
  `CREATE TABLE IF NOT EXISTS supporters_pending (username TEXT PRIMARY KEY, at INTEGER NOT NULL)`,
];
const MIGRATIONS = [`ALTER TABLE players ADD COLUMN supporter INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE players ADD COLUMN sess INTEGER NOT NULL DEFAULT 0`,
  `UPDATE players SET supporter = 0 WHERE supporter <> 0`, `DELETE FROM supporters_pending`];   // supporter badges were switched off 2026-11-20: clear any left over   // each may already be applied
let ready = null;   // the tables are made once per worker, on first use
export const ensure = db => (ready ||= db.batch(SCHEMA.map(s => db.prepare(s)))
  .then(() => Promise.all(MIGRATIONS.map(m => db.prepare(m).run().catch(e => { if (!/duplicate column/i.test(String(e && e.message))) throw e; }))))
  .catch(e => { ready = null; throw e; }));

const UUID = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i;
export const uuidOf = s => { const m = UUID.exec(String(s || '')); return m ? m.slice(1).join('-').toLowerCase() : null; };

// The site's security headers do not reach Functions responses, so the API sets its own.
const BASE = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' };
export const json = (body, status = 200, cacheSeconds = 0) => new Response(JSON.stringify(body), { status,
  headers: { ...BASE, 'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store' } });

// ---- writes: who is asking (a signed session cookie), what they may send, and how often
export const SITE = 'https://hytale-skin-editor.com';
const FIELDS = ['bodyCharacteristic', 'face', 'eyes', 'eyebrows', 'mouth', 'ears', 'haircut', 'facialHair', 'skinFeature', 'underwear', 'undertop',
  'overtop', 'pants', 'overpants', 'shoes', 'gloves', 'cape', 'headAccessory', 'faceAccessory', 'earAccessory'];   // same as site/app/game.js
const PART = /^[A-Za-z0-9_ -]{1,64}(\.[A-Za-z0-9_ -]{1,64}){0,2}$/;   // same rule as site/app/skin.js
export const MAX_SKINS = 45, WRITES_PER_HOUR = 30, SESSION_DAYS = 30;
export const switchedOn = env => !!(env.SESSION_KEY && env.DB);
export const cleanName = s => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);
// A published skin is part names only. Custom assets (Custom_*) are never accepted: their textures stay on the maker's computer.
export function recipeOf(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null; const out = {}; let any = false;
  for (const k of Object.keys(o)) if (!FIELDS.includes(k)) return null;
  for (const f of FIELDS) { const v = o[f]; if (v == null) continue; if (typeof v !== 'string' || !PART.test(v) || /^Custom_/i.test(v)) return null; out[f] = v; any = true; }
  return any && out.bodyCharacteristic ? out : null;
}
// writes must come from the site itself (on top of the SameSite cookie)
export const sameSite = request => { const o = request.headers.get('Origin'); return !!o && (o === SITE || o === new URL(request.url).origin); };
export async function body(request, max = 8192) {   // small JSON bodies only
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return null;
  const t = await request.text(); if (t.length > max) return null; try { return JSON.parse(t); } catch { return null; }
}
export const newId = () => { const b = crypto.getRandomValues(new Uint8Array(9)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_'); };   // 12 characters

// Session cookie: "<uuid>.<expires>.<session number>.<hmac>", signed with the SESSION_KEY secret. The player row must still exist and
// the number must match, so deleting your data, a ban, or signing out ends every session at once.
const enc = new TextEncoder(), b64 = a => btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sign = async (secret, text) => b64(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(text)));
const COOKIE = '__Host-se_session';
export async function sessionCookie(env, uuid, sess = 0) {
  const v = `${uuid}.${Date.now() + SESSION_DAYS * 864e5}.${sess | 0}`;
  return `${COOKIE}=${v}.${await sign(env.SESSION_KEY, v)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`;
}
export const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
export async function whoIs(request, env) {   // the signed-in player, or null
  if (!switchedOn(env)) return null;
  const m = /(?:^|;\s*)__Host-se_session=([^;]+)/.exec(request.headers.get('Cookie') || ''); if (!m) return null;
  const [uuid, exp, sess, mac] = m[1].split('.'); if (!uuidOf(uuid) || !(+exp > Date.now()) || !/^\d{1,9}$/.test(sess || '') || !mac) return null;
  const want = await sign(env.SESSION_KEY, `${uuid}.${exp}.${sess}`); if (want.length !== mac.length) return null;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ mac.charCodeAt(i); if (diff) return null;
  await ensure(env.DB);
  return await env.DB.prepare('SELECT uuid, username FROM players WHERE uuid = ?1 AND banned = 0 AND sess = ?2').bind(uuid, +sess).first();
}
// at most SIGNINS_PER_10_MIN sign-ins from one address; the address is only kept as a keyed hash
export const SIGNINS_PER_10_MIN = 10;
export async function signinAllowed(env, request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local', who = (await sign(env.SESSION_KEY, 'signin:' + ip)).slice(0, 22), now = Date.now();
  await env.DB.prepare('DELETE FROM signins WHERE at < ?1').bind(now - 600e3).run();
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM signins WHERE who = ?1').bind(who).first()).n;
  if (n >= SIGNINS_PER_10_MIN) return false;
  await env.DB.prepare('INSERT INTO signins (who, at) VALUES (?1, ?2)').bind(who, now).run(); return true;
}
// at most WRITES_PER_HOUR publishes, updates and unpublishes per player per hour
export async function spend(env, uuid) {
  const now = Date.now();
  await env.DB.prepare('DELETE FROM writes WHERE at < ?1').bind(now - 3600e3).run();
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM writes WHERE uuid = ?1').bind(uuid).first()).n;
  if (n >= WRITES_PER_HOUR) return false;
  await env.DB.prepare('INSERT INTO writes (uuid, at) VALUES (?1, ?2)').bind(uuid, now).run(); return true;
}
