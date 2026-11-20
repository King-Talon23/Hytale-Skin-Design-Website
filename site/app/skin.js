// What a skin is: one string per slot, "Id.Colour[.Variant]", the format the game itself uses. No rendering here.
import { FIELDS } from './game.js';

export const LABEL = { bodyCharacteristic: 'Body & Skin', face: 'Face', eyes: 'Eyes', eyebrows: 'Eyebrows', mouth: 'Mouth', ears: 'Ears', haircut: 'Haircut', facialHair: 'Facial Hair',
  skinFeature: 'Skin Feature', underwear: 'Underwear', undertop: 'Undertop', overtop: 'Overtop', pants: 'Pants', overpants: 'Legwear', shoes: 'Shoes', gloves: 'Gloves', cape: 'Capes',
  headAccessory: 'Headwear', faceAccessory: 'Face Accessory', earAccessory: 'Ear Accessory' };
export const GROUPS = [
  ['Head', ['haircut', 'eyebrows', 'eyes', 'facialHair', 'headAccessory', 'faceAccessory', 'earAccessory']],
  ['Body', ['bodyCharacteristic', 'face', 'mouth', 'ears', 'skinFeature', 'underwear']],
  ['Torso', ['undertop', 'overtop', 'gloves']],
  ['Legs', ['pants', 'overpants', 'shoes']],
  ['Capes', ['cape']]];
export const REQUIRED = new Set(['bodyCharacteristic', 'face', 'eyes', 'mouth', 'ears', 'underwear']);   // the game never leaves these empty
export const nice = s => String(s).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

const PART = /^[A-Za-z0-9_ -]{1,64}(\.[A-Za-z0-9_ -]{1,64}){0,2}$/;
// Anything that comes from outside (a file, a lookup, a backup) passes through here: only known slots, only plain part strings.
export function sanitize(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {}; let any = false;
  for (const f of FIELDS) { const v = o[f]; out[f] = typeof v === 'string' && PART.test(v) ? v : null; any ||= out[f] != null; }
  return any ? out : null;
}
export const cleanName = s => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40);

export const parse = v => { const [id, color, variant] = (v || '').split('.'); return { id, color, variant }; };

export function rules(CAT) {
  const ITEMS = CAT.items;
  const find = (f, v) => ITEMS[f].find(e => e.Id === parse(v).id);
  const src = (it, variant) => { const s = it.Variants ? { ...it, ...(it.Variants[variant] || Object.values(it.Variants)[0]) } : it;
    return s.Textures && !Object.values(s.Textures).some(t => t.Texture) ? { ...s, Textures: null } : s; };   // an empty Textures entry means a gradient item
  const colorsOf = (it, variant) => { const s = src(it, variant);
    if (s.Textures) return Object.entries(s.Textures).map(([k, v]) => [k, v.BaseColor || ['#888']]);
    if (s.GradientSet === 'Skin' && !ITEMS.bodyCharacteristic.includes(it)) return [];   // face, ears, mouth follow the body's skin tone
    return Object.entries(CAT.gradients[s.GradientSet] || {}).map(([k, v]) => [k, v.BaseColor || ['#888']]); };
  function partStr(it, color, variant) {
    if (!it) return null;
    const vs = it.Variants ? Object.keys(it.Variants) : []; if (vs.length && !vs.includes(variant)) variant = vs[0];
    const cs = colorsOf(it, variant).map(c => c[0]); if (cs.length && !cs.includes(color)) color = cs[0]; if (!cs.length) color = null;
    return [it.Id, color, vs.length ? variant : null].filter((x, i) => i === 0 || x != null).join('.');   // a variant always follows a colour
  }
  function resolve(f, skin) {   // slot -> the model, texture and tint to draw, or null
    let { id, color, variant } = parse(skin[f]); let it = ITEMS[f].find(e => e.Id === id); if (!it) return null;
    if (f === 'haircut') {   // a fully covering hat hides the hair; a half covering one swaps tall haircuts for the generic one
      const ha = find('headAccessory', skin.headAccessory), t = ha && ha.HeadAccessoryType; if (t === 'FullyCovering') return null;
      if (t === 'HalfCovering' && it.RequiresGenericHaircut) it = ITEMS[f].find(e => e.Id === CAT.fallbacks[it.HairType]) || it;
    }
    const s = src(it, variant); if (!s.Model) return null;
    if (s.Textures) return { model: s.Model, tex: (s.Textures[color] || Object.values(s.Textures)[0]).Texture, tint: null };
    const set = CAT.gradients[s.GradientSet] || {}, col = s.GradientSet === 'Skin' ? parse(skin.bodyCharacteristic).color : color;
    return { model: s.Model, tex: s.GreyscaleTexture, tint: (set[col] || Object.values(set)[0] || {}).Texture || null };
  }
  const empty = () => Object.fromEntries(FIELDS.map(f => [f, null]));
  function blank() { const s = empty();
    for (const f of FIELDS) { const d = ITEMS[f].find(e => e.IsDefaultAsset) || (REQUIRED.has(f) ? ITEMS[f][0] : null); s[f] = partStr(d); } return s; }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function random() { const s = empty();
    for (const f of FIELDS) { if (!ITEMS[f].length) continue;
      const none = !REQUIRED.has(f) && Math.random() < ({ haircut: .05, eyebrows: .05, undertop: .1, pants: .05, shoes: .15 }[f] ?? .6); if (none) continue;
      const it = pick(ITEMS[f]), v = it.Variants ? pick(Object.keys(it.Variants)) : null; s[f] = partStr(it, pick(colorsOf(it, v))?.[0], v); }
    return s; }
  // a skin from outside may name parts this game version does not have: drop those, and fill what the game requires
  function fit(skin) { const s = { ...empty(), ...skin }, b = blank();
    for (const f of FIELDS) { const it = find(f, s[f]); const { color, variant } = parse(s[f]); s[f] = it ? partStr(it, color, variant) : REQUIRED.has(f) ? b[f] : null; } return s; }
  return { ITEMS, find, src, colorsOf, partStr, resolve, blank, random, empty, fit };
}
