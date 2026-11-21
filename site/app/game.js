// The player's own game files. On "connect" the site reads the few thousand small files the editor needs straight out of
// the player's Assets.zip and keeps that copy in this browser only (IndexedDB), so they connect once. No game file is ever
// hosted by, or uploaded to, the website.
import { openZip, fileSource } from './zip.js';
import * as db from './db.js';
import { SCENE_FILES } from './scene-data.js';

const EXT = /\.(png|json|blockymodel|blockyanim|lang)$/;
const LANG = 'Common/Languages/en-US/avatarCustomization/';
// things the moves hold: the glider for Glide, weapons and tools for the poses and taunts ([model, texture] under Common/)
export const PROPS = {
  glider: ['Items/Glider/Scrap.blockymodel', 'Items/Glider/Scrap_Texture.png'], battleaxe: ['Items/Weapons/Battleaxe/Iron.blockymodel', 'Items/Weapons/Battleaxe/Iron_Texture.png'],
  book: ['Items/Weapons/Spellbook/Book.blockymodel', 'Items/Weapons/Spellbook/Book_Fire_Texture.png'], pickaxe: ['Items/Tools/Pickaxe/Iron.blockymodel', 'Items/Tools/Pickaxe/Iron_Texture.png'],
  staff: ['Items/Weapons/Staff/Bo_Wood.blockymodel', 'Items/Weapons/Staff/Bo_Wood_Texture.png'], wizstaff: ['Items/Weapons/Staff/Wizard.blockymodel', 'Items/Weapons/Staff/Wizard_Texture.png'], sword: ['Items/Weapons/Sword/Iron.blockymodel', 'Items/Weapons/Sword/Iron_Texture.png'],
  mace: ['Items/Weapons/Mace/Iron.blockymodel', 'Items/Weapons/Mace/Iron_Texture.png'], bow: ['Items/Weapons/Bow/Bronze.blockymodel', 'Items/Weapons/Bow/Bronze_Texture.png'],
  potion: ['Items/Consumables/Potions/Potion.blockymodel', 'Items/Consumables/Potions/Potion_Textures/Pink.png'], block: [null, 'BlockTextures/Rock_Stone.png'] };   // a block is a plain cube with this texture
// textures for the scenery some moves need (a chair to sit on, a bed, water)
export const SCENERY_TEX = { wood: 'BlockTextures/Wood_Softwood_Planks_Top.png', water: 'BlockTextures/Fluid_Water.png', stone: 'BlockTextures/Rock_Stone.png' };
// backgrounds behind the character and the set pieces of the moves: built from the game's own files (see scene-data.js)
export { SCENES, SET_PIECES } from './scene-data.js';
// which set of files a connect reads; raised when the site starts needing more, so a remembered Assets.zip is read again
export const FILES_V = 5;
const PROP_FILES = new Set([...Object.values(PROPS).flat(), ...Object.values(SCENERY_TEX)].filter(Boolean).map(p => 'Common/' + p)
  .concat(SCENE_FILES));
const wanted = n => EXT.test(n) && !n.includes('..') && (PROP_FILES.has(n) ||
  n.startsWith('Cosmetics/CharacterCreator/') || n.startsWith(LANG) || n.startsWith('Common/Cosmetics/') || n.startsWith('Common/TintGradients/') ||
  (n.startsWith('Common/Characters/') && !n.includes('/Animations/Items/') && !n.endsWith('_FPS.blockyanim')) ||
  /^Common\/NPC\/Livestock\/(Horse|Camel|Ram)\/(Models\/|Animations\/Default\/)/.test(n));   // the animals players ride, for the Mount moves

// skin field -> the game's catalogue file, in the game's own order
export const SLOTS = [['bodyCharacteristic', 'BodyCharacteristics'], ['face', 'Faces'], ['eyes', 'Eyes'], ['eyebrows', 'Eyebrows'], ['mouth', 'Mouths'], ['ears', 'Ears'],
  ['haircut', 'Haircuts'], ['facialHair', 'FacialHair'], ['skinFeature', 'SkinFeatures'], ['underwear', 'Underwear'], ['undertop', 'Undertops'],
  ['overtop', 'Overtops'], ['pants', 'Pants'], ['overpants', 'Overpants'], ['shoes', 'Shoes'], ['gloves', 'Gloves'], ['cape', 'Capes'],
  ['headAccessory', 'HeadAccessory'], ['faceAccessory', 'FaceAccessory'], ['earAccessory', 'EarAccessory']];
export const FIELDS = SLOTS.map(s => s[0]);

export async function status() { return (await db.get('meta', 'game')) || null; }

export async function connect(file, onProgress = () => {}) {
  return importFrom(fileSource(file), { name: file.name, size: file.size, modified: file.lastModified }, onProgress);
}
export async function importFrom(src, info, onProgress = () => {}) {
  const zip = await openZip(src, wanted);
  const need = SLOTS.map(s => `Cosmetics/CharacterCreator/${s[1]}.json`).concat('Cosmetics/CharacterCreator/GradientSets.json', 'Common/Characters/Player.blockymodel');
  const have = new Set(zip.names); const missing = need.filter(n => !have.has(n));
  if (missing.length) throw new Error('This zip is not the Hytale Assets.zip (the character creator files are not in it).');
  await db.clear('files'); await db.del('meta', 'game'); await db.del('meta', 'anims');
  const names = zip.names; let doneCount = 0;
  for (let i = 0; i < names.length; i += 64) {   // 64 files at a time: quick, and never holds much in memory
    const part = names.slice(i, i + 64), bufs = await Promise.all(part.map(n => zip.read(n)));
    await db.putMany('files', part.map((n, k) => [n, bufs[k]]));
    doneCount += part.length; onProgress(doneCount / names.length);
  }
  const meta = { ...info, files: names.length, at: Date.now(), v: FILES_V };
  await db.put('meta', 'game', meta); cache.clear(); return meta;
}
export async function forget() { await db.clear('files'); await db.del('meta', 'game'); await db.del('meta', 'anims'); await db.del('meta', 'zipHandle').catch(() => {}); await db.clear('thumbs').catch(() => {}); cache.clear(); }
// the Assets.zip the player picked (a file handle, Chrome and Edge only), kept so a game update can be read again without hunting for the file
export const rememberZip = h => db.put('meta', 'zipHandle', h).catch(() => {});
export const zipHandle = () => db.get('meta', 'zipHandle').catch(() => null);

const cache = new Map(), once = (k, f) => cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k));
const utf8 = new TextDecoder();
export const bytes = path => db.get('files', path);
export const json = path => once('j:' + path, async () => { const b = await bytes(path); if (!b) throw new Error('missing ' + path); return JSON.parse(utf8.decode(b)); });
export const bitmap = path => once('b:' + path, async () => { const b = await bytes(path); if (!b) throw new Error('missing ' + path); return createImageBitmap(new Blob([b], { type: 'image/png' })); });
export const common = p => 'Common/' + p;

export async function catalog() {
  const cat = n => json(`Cosmetics/CharacterCreator/${n}.json`), opt = async n => { try { return await cat(n); } catch { return []; } };
  const [slots, gradients, fallbacks, emotes] = await Promise.all([
    Promise.all(SLOTS.map(async ([field, file]) => ({ field, items: await cat(file) }))), cat('GradientSets'), opt('HaircutFallbacks'), opt('Emotes')]);
  // player moves only: the player folder also holds poses made for creatures and factions (Feran, Outlander, Guardian ...)
  const MOB = /^(Feran|Outlander|Guardian|Skeleton|Zombie|Trork|Goblin|Kweebec|Golem|Scarak|Void)/i, all = (await db.get('meta', 'anims')) || await listAnims();
  const anims = Object.fromEntries(await Promise.all(Object.entries(all).map(async ([g, ns]) => [g, await unique(g, ns.filter(n => !MOB.test(n)))]))); for (const g in anims) if (!anims[g].length) delete anims[g];
  const names = await langNames();
  return { names, items: Object.fromEntries(slots.map(s => [s.field, s.items])), gradients: Object.fromEntries(gradients.map(g => [g.Id, g.Gradients])),
    fallbacks: Array.isArray(fallbacks) ? {} : fallbacks, emotes, anims };
}
async function langNames() {   // "Cape_King.name = King's Cape" in capes.lang is the name for the key avatarCustomization.capes.Cape_King.name
  const out = {}, utf8 = new TextDecoder();
  for (const k of await db.keys('files')) { if (!k.startsWith(LANG) || !k.endsWith('.lang')) continue; const sect = k.slice(LANG.length, -5);
    for (const line of utf8.decode(await bytes(k)).split(/\r?\n/)) { const m = /^\s*([\w.-]+)\s*=\s*(.+?)\s*$/.exec(line); if (m && m[2].length <= 60) out[`avatarCustomization.${sect}.${m[1]}`] = m[2]; } }
  return out;
}
// the game ships some moves twice: the same file under two names, or a misspelt short cut ("Tounge" next to "Tongue", the same letters jumbled).
// Keep the first of each (the list is sorted, so the right spelling).
async function unique(g, ns) { const seen = new Set(), out = [];
  for (const n of ns) { const b = await bytes(`Common/Characters/Animations/${g}/${n}.blockyanim`), letters = 'n:' + n.toLowerCase().split('').sort().join('');
    const sum = b ? 'h:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', b)), x => x.toString(16).padStart(2, '0')).join('') : null;
    if (seen.has(letters) || (sum && seen.has(sum))) continue; seen.add(letters); if (sum) seen.add(sum); out.push(n); }
  return out; }
async function listAnims() {   // every player animation the game ships, grouped by its folder
  const out = {};
  for (const k of await db.keys('files')) { const m = /^Common\/Characters\/Animations\/([^/]+)\/([^/]+)\.blockyanim$/.exec(k); if (m) (out[m[1]] ??= []).push(m[2]); }
  for (const g of Object.values(out)) g.sort();
  await db.put('meta', 'anims', out); return out;
}
