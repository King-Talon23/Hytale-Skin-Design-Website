// Custom assets: a player's own repainted copy of an item's texture. Kept in this browser only. They exist on this site,
// not in the game: an asset is the item it was made from (its model) plus one PNG the player painted.
import * as db from './db.js';
import { FIELDS } from './game.js';
import { cleanName } from './skin.js';

export const MAX = 60;
const MODEL = /^[\w ./-]{1,200}\.blockymodel$/, ID = /^[0-9a-f]{8}$/;
const ok = a => a && ID.test(a.id) && FIELDS.includes(a.field) && typeof a.model === 'string' && MODEL.test(a.model) && !a.model.includes('..')
  && a.data instanceof Blob && a.data.size > 0 && a.data.size < 2_000_000 && a.w > 0 && a.h > 0 && a.w <= 1024 && a.h <= 1024;
export const newId = () => [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join('');
export async function list() { return (await db.all('assets')).filter(ok).sort((a, b) => b.updated - a.updated); }
export async function save(a) {
  const r = { id: a.id, name: cleanName(a.name) || 'My asset', field: a.field, baseId: String(a.baseId || '').slice(0, 64), model: a.model, w: a.w, h: a.h, data: a.data, updated: Date.now(),
    flag: typeof a.flag === 'string' ? a.flag.slice(0, 80) : undefined,   // set when the asset is too close to a paid item
    shape: okShape(a.shape) ? a.shape : undefined };   // the item's model, reshaped in the Creator (JSON text)
  if (!ok(r)) throw new Error('That asset could not be saved.');
  await db.put('assets', r.id, r); return r;
}
export const remove = id => db.del('assets', id);
export const MAX_BOXES = 64;
export function okShape(t) {   // a blockymodel this site wrote: small, parseable, boxes and quads only, sane numbers
  if (typeof t !== 'string' || t.length > 200_000) return false;
  let m; try { m = JSON.parse(t); } catch { return false; } if (!m || !Array.isArray(m.nodes)) return false;
  let n = 0; const num = v => v == null || (typeof v === 'number' && isFinite(v) && Math.abs(v) <= 512);
  const ok = node => { if (!node || typeof node.name !== 'string' || node.name.length > 64 || ++n > 400) return false; const s = node.shape || {};
    if (s.type && !['box', 'quad', 'none'].includes(s.type)) return false;
    for (const o of [node.position, s.offset, s.settings?.size, s.stretch]) if (o && !(num(o.x) && num(o.y) && num(o.z))) return false;
    const q = node.orientation; if (q && ![q.x, q.y, q.z, q.w].every(v => v == null || (typeof v === 'number' && Math.abs(v) <= 1.0001))) return false;
    return (node.children || []).every(ok); };
  return m.nodes.every(ok);
}
