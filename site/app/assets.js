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
    flag: typeof a.flag === 'string' ? a.flag.slice(0, 80) : undefined };   // set when the asset is too close to a paid item
  if (!ok(r)) throw new Error('That asset could not be saved.');
  await db.put('assets', r.id, r); return r;
}
export const remove = id => db.del('assets', id);
