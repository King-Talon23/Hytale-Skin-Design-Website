// The wardrobe. Two shelves that never mix:
//   game   - 5 slots that mirror the presets inside Hytale (ids game-0 .. game-4)
//   custom - up to 45 skins that exist only on this site
import * as db from './db.js';
import { sanitize, cleanName } from './skin.js';
import * as assets from './assets.js';

export const GAME_SLOTS = 5, CUSTOM_MAX = 45;
const gameId = i => 'game-' + i;

export async function list() {
  const rows = (await db.all('skins')).filter(r => r && sanitize(r.skin));
  const game = Array.from({ length: GAME_SLOTS }, (_, i) => rows.find(r => r.id === gameId(i)) || null);
  const custom = rows.filter(r => r.kind === 'custom').sort((a, b) => b.updated - a.updated);
  return { game, custom };
}
function record(id, kind, name, skin, slot) { return { id, kind, slot: kind === 'game' ? slot : undefined, name: cleanName(name) || 'Unnamed', skin: sanitize(skin), updated: Date.now() }; }
async function put(r) { if (!r.skin) throw new Error('That is not a skin.'); await db.put('skins', r.id, r); return r; }
const write = async r => { await put(r); await mirror(); return r; };

export async function saveCustom(name, skin, id) {
  if (!id && (await list()).custom.length >= CUSTOM_MAX) throw new Error(`Your wardrobe is full (${CUSTOM_MAX} skins). Delete one first.`);
  return write(record(id || crypto.randomUUID(), 'custom', name, skin));
}
export const saveGame = (slot, name, skin) => write(record(gameId(slot), 'game', name, skin, slot));
export const remove = async id => { await db.del('skins', id); await mirror(); };

// Put a custom skin into an in-game slot. Whatever was in the slot takes the custom skin's place, so nothing is lost.
export async function swap(customId, slot) {
  const { game, custom } = await list(), c = custom.find(r => r.id === customId); if (!c) throw new Error('That skin is gone.');
  const old = game[slot];
  await put(record(gameId(slot), 'game', c.name, c.skin, slot));
  if (old) await put(record(c.id, 'custom', old.name, old.skin)); else await db.del('skins', c.id);
  await mirror();
}

export async function exportAll() { const { game, custom } = await list();
  const mine = []; for (const a of await assets.list()) mine.push({ id: a.id, name: a.name, field: a.field, baseId: a.baseId, model: a.model, w: a.w, h: a.h, png: await toBase64(a.data) });
  return { format: 'skin-editor-backup', version: 2, game: game.map(r => r && { name: r.name, skin: r.skin }), custom: custom.map(r => ({ name: r.name, skin: r.skin })), assets: mine }; }
async function toBase64(blob) { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// a custom asset from outside (a backup or the skins folder): the picture must really be a PNG of the size it claims, and its id must be free
async function takeAsset(meta, bytes, have) {
  if (!meta || typeof meta.id !== 'string' || have.has(meta.id) || have.size >= assets.MAX || bytes.length > 2_000_000 || !PNG.every((v, i) => bytes[i] === v)) return false;
  const data = new Blob([bytes], { type: 'image/png' }), bmp = await createImageBitmap(data); if (bmp.width !== meta.w || bmp.height !== meta.h) return false;
  await assets.save({ id: meta.id, name: meta.name, field: meta.field, baseId: meta.baseId, model: meta.model, w: bmp.width, h: bmp.height, data }); have.add(meta.id); return true;
}
export async function importAll(data) {   // adds to what is there; never overwrites a filled in-game slot
  if (!data || data.format !== 'skin-editor-backup' || !Array.isArray(data.custom)) throw new Error('That file is not a Skin Editor backup.');
  const cur = await list(); let added = 0, skipped = 0, room = CUSTOM_MAX - cur.custom.length;
  const have = new Set((await assets.list()).map(a => a.id));   // assets first, so restored skins that wear them find them
  for (const m of Array.isArray(data.assets) ? data.assets.slice(0, 200) : []) { try { if (typeof m.png === 'string' && m.png.length < 3_000_000 && await takeAsset(m, Uint8Array.from(atob(m.png), c => c.charCodeAt(0)), have)) added++; } catch { /* not a usable asset */ } }
  const same = new Set(cur.custom.map(r => r.name + '|' + JSON.stringify(r.skin)));   // restoring the same backup twice does not double up
  for (const r of data.custom.slice(0, 500)) { const s = sanitize(r?.skin); if (!s) continue; const k = cleanName(r.name) + '|' + JSON.stringify(s); if (same.has(k)) continue; if (room <= 0) { skipped++; continue; } await saveCustom(r.name, s); same.add(k); room--; added++; }
  for (let i = 0; i < GAME_SLOTS; i++) { const r = data.game?.[i], s = sanitize(r?.skin); if (s && !cur.game[i]) { await saveGame(i, r.name, s); added++; } }
  return { added, skipped };
}

// ---- a folder on the player's own computer (Chrome and Edge). The browser copy stays the working copy; every change is
// mirrored into two subfolders as one small .json file per skin, and skins found there are brought in when the folder connects.
export const folderSupported = typeof self.showDirectoryPicker === 'function';
const SUB = { custom: 'My skins', game: 'In-game slots' }, ASSET_DIR = 'Custom assets';
export const sync = () => mirror();
// what the player is wearing, for the companion mod: "<skins folder>/Wearing.json" (on:false when Show in game is off)
let lastWearing = null;
export async function writeWearing(data) {
  if (!dir) return false; const text = JSON.stringify({ format: 'skin-editor-wearing', version: 1, ...data }, null, 1); if (text === lastWearing) return true;
  const w = await (await dir.getFileHandle('Wearing.json', { create: true })).createWritable(); await w.write(text); await w.close(); lastWearing = text; return true;
}
// the companion mod writes "<skins folder>/Skin Editor Sync.json" once a day while it runs: { version, seen } when it has, else null
export async function modSeen() {
  if (!dir) return null;
  try { const j = JSON.parse(await (await (await dir.getFileHandle('Skin Editor Sync.json')).getFile()).text());
    return j && j.format === 'skin-editor-sync' && /^\d{4}-\d{2}-\d{2}$/.test(j.seen) ? { version: String(j.version || '').slice(0, 20), seen: j.seen } : null; } catch { return null; }
}
// the connected skins folder (or one of its subfolders), for a file picker to open in; null when none is connected
export async function skinsFolder(sub) { if (!dir) return null; if (!sub) return dir; try { return await dir.getDirectoryHandle(sub); } catch { return dir; } }
export let lockedOf = () => false;   // set by the page: repaints of edition and reward items, which the mod will not wear
export const setLockedOf = f => { lockedOf = f; };
export let keepOwnOf = () => [];   // set by the page: slots holding paid items, which the mod keeps as the player's own
export const setKeepOwnOf = f => { keepOwnOf = f; };
let dir = null; const written = new Map(), known = new Set();
const safe = n => { let t = String(n).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 60) || 'Unnamed'; return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t) ? '_' + t : t; };
export async function folderState() {
  if (!folderSupported) return { state: 'none' };
  const h = await db.get('meta', 'folder'); if (!h) return { state: 'none' };
  const on = dir && (await h.queryPermission({ mode: 'readwrite' })) === 'granted';
  return { state: on ? 'on' : 'ask', name: h.name, mod: on ? await modSeen() : null };   // mod: the companion mod's marker, when it has run
}
export async function chooseFolder() { return useFolder(await self.showDirectoryPicker({ id: 'skins', mode: 'readwrite', startIn: 'documents' })); }
export async function useFolder(h) { await db.put('meta', 'folder', h); dir = h; written.clear(); known.clear(); lastWearing = null; return attach(); }
export async function resumeFolder(ask) {
  if (!folderSupported) return null; const h = await db.get('meta', 'folder'); if (!h) return null;
  let p = await h.queryPermission({ mode: 'readwrite' }); if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' });
  if (p !== 'granted') return null; dir = h; written.clear(); known.clear(); return attach();
}
export async function forgetFolder() { dir = null; await db.del('meta', 'folder'); }
async function attach() {   // bring in skins the folder has and this browser does not, then write everything out
  const cur = await list(); let imported = 0, room = CUSTOM_MAX - cur.custom.length;
  const have = new Set(cur.custom.map(r => r.name + '|' + JSON.stringify(r.skin)));
  for (const kind of ['custom', 'game']) { const d = await dir.getDirectoryHandle(SUB[kind], { create: true }); let n = 0;
    for await (const [name, h] of d.entries()) { if (h.kind !== 'file' || !/\.json$/i.test(name) || ++n > 300) continue;
      try { const f = await h.getFile(); if (f.size > 200000) continue; const j = JSON.parse(await f.text()), sk = sanitize(j && j.skin); if (!sk) continue;
        known.add(SUB[kind] + '/' + name); const nm = cleanName(j.name || name.replace(/\.json$/i, ''));
        if (kind === 'custom') { const key = nm + '|' + JSON.stringify(sk); if (have.has(key) || room <= 0) continue; have.add(key); await put(record(crypto.randomUUID(), 'custom', nm, sk)); room--; imported++; }
        else { const i = Number.isInteger(j.slot) ? j.slot : -1; if (i < 0 || i >= GAME_SLOTS || cur.game[i]) continue; cur.game[i] = await put(record(gameId(i), 'game', nm, sk, i)); imported++; }
      } catch { /* not one of ours */ } } }
  try { const d = await dir.getDirectoryHandle(ASSET_DIR, { create: true }), have = new Set((await assets.list()).map(a => a.id)); let n = 0;
    for await (const [name, h] of d.entries()) { if (h.kind !== 'file' || !/\.json$/i.test(name) || ++n > 200) continue;
      try { const f = await h.getFile(); if (f.size > 20000) continue; const meta = JSON.parse(await f.text()); if (!meta || meta.format !== 'skin-editor-asset') continue;
        const png = await (await d.getFileHandle(name.replace(/\.json$/i, '.png'))).getFile(); known.add(ASSET_DIR + '/' + name); known.add(ASSET_DIR + '/' + name.replace(/\.json$/i, '.png'));
        if (await takeAsset(meta, new Uint8Array(await png.arrayBuffer()), have)) imported++; } catch { /* not one of ours */ } } } catch (e) { console.warn(e); }
  await mirror(); return { imported };
}
let mirroring = Promise.resolve();
function mirror() { if (!dir) return Promise.resolve(); return mirroring = mirroring.catch(() => {}).then(doMirror); }
async function doMirror() {
  if (!dir) return;
  try {
    const { game, custom } = await list(), want = new Map(), used = new Set();
    const file = r => JSON.stringify({ format: 'skin-editor-skin', version: 1, name: r.name, kind: r.kind, slot: r.slot, keepOwn: keepOwnOf(r.skin), skin: r.skin }, null, 1);
    for (const r of game) if (r) want.set(`${SUB.game}/Slot ${r.slot + 1} - ${safe(r.name)}.json`, file(r));
    for (const r of [...custom].sort((a, b) => a.id < b.id ? -1 : 1)) { let b = safe(r.name), n = b, i = 2; while (used.has(n.toLowerCase())) n = `${b} (${i++})`; used.add(n.toLowerCase()); want.set(`${SUB.custom}/${n}.json`, file(r)); }
    for (const kind of ['custom', 'game']) { const d = await dir.getDirectoryHandle(SUB[kind], { create: true });
      for (const [path, text] of want) { if (!path.startsWith(SUB[kind] + '/') || written.get(path) === text) continue;
        const w = await (await d.getFileHandle(path.slice(SUB[kind].length + 1), { create: true })).createWritable(); await w.write(text); await w.close(); written.set(path, text); known.add(path); }
      for (const path of [...known]) if (path.startsWith(SUB[kind] + '/') && !want.has(path)) { try { await d.removeEntry(path.slice(SUB[kind].length + 1)); } catch { /* already gone */ } known.delete(path); written.delete(path); } }
    // custom assets: the painted picture as a PNG, with a small .json beside it saying which item it belongs to
    const ad = await dir.getDirectoryHandle(ASSET_DIR, { create: true }), keep = new Set();
    for (const a of await assets.list()) { const stem = `${safe(a.name)} (${a.id})`, files = [[stem + '.png', a.data, a.id + '@' + a.updated], ...(a.shape ? [[stem + '.blockymodel', a.shape, null]] : []), [stem + '.json', JSON.stringify({ format: 'skin-editor-asset', version: 1, id: a.id, name: a.name, field: a.field, baseId: a.baseId, model: a.model, w: a.w, h: a.h, locked: !!lockedOf(a) }, null, 1), null]];
      for (const [name, body, stamp] of files) { const path = ASSET_DIR + '/' + name, mark = stamp || body; keep.add(path); if (written.get(path) === mark) continue;
        const w = await (await ad.getFileHandle(name, { create: true })).createWritable(); await w.write(body); await w.close(); written.set(path, mark); known.add(path); } }
    for (const path of [...known]) if (path.startsWith(ASSET_DIR + '/') && !keep.has(path)) { try { await ad.removeEntry(path.slice(ASSET_DIR.length + 1)); } catch { /* already gone */ } known.delete(path); written.delete(path); }
  } catch (e) { console.error(e); throw new Error('Could not write to your skins folder. Your skins are still saved in this browser.'); }
}
