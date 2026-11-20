// Shared by the API (Cloudflare Pages Functions in /functions). The database is Cloudflare D1, bound to the Pages project as DB.
// Only published skins live there: the part names a skin is made of, its name, and the game UUID of the player who published it.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS players (uuid TEXT PRIMARY KEY, username TEXT NOT NULL, banned INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS skins (id TEXT PRIMARY KEY, owner_uuid TEXT NOT NULL, name TEXT NOT NULL, recipe TEXT NOT NULL,
     created INTEGER NOT NULL, updated INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS skins_owner ON skins (owner_uuid, hidden, updated)`,
];
let ready = null;   // the tables are made once per worker, on first use
export const ensure = db => (ready ||= db.batch(SCHEMA.map(s => db.prepare(s))).catch(e => { ready = null; throw e; }));

const UUID = /^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i;
export const uuidOf = s => { const m = UUID.exec(String(s || '')); return m ? m.slice(1).join('-').toLowerCase() : null; };

// The site's security headers do not reach Functions responses, so the API sets its own.
const BASE = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' };
export const json = (body, status = 200, cacheSeconds = 0) => new Response(JSON.stringify(body), { status,
  headers: { ...BASE, 'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store' } });
