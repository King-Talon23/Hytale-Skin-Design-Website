// Builds the character in 3D from the game's own model and texture files, and plays the game's own animations on it.
import * as THREE from '../vendor/three.module.min.js';
import { TransformControls } from '../vendor/TransformControls.js';
import * as game from './game.js';
import { FIELDS } from './game.js';
import { BLOCKS, SET_PIECES } from './scene-data.js';

const cache = new Map(), once = (k, f) => cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k));
export const clearCache = () => cache.clear();
// a custom asset's texture comes from the asset creator (the live canvas while it is being painted), not from the game files
let customSource = null; export const setCustomSource = f => { customSource = f; };
let shapeSource = null; export const setShapeSource = f => { shapeSource = f; };   // 'shape:<id>@<version>' -> model JSON
export function refreshCustom(id) { for (const [k, v] of cache) if (k.startsWith('t:custom:' + id + '@')) v.then(T => { T.mat.map.needsUpdate = true; }, () => {}); }
export async function bakedCanvas(tex, tint) { const T = await texture(tex, tint), c = document.createElement('canvas'); c.width = T.w; c.height = T.h; c.getContext('2d').drawImage(T.mat.map.image, 0, 0); return c; }
async function pixels(p) {
  if (p.startsWith('custom:')) { const c = await customSource(p.slice(7).split('@')[0]), x = c.getContext('2d', { willReadFrequently: true }); return { c, x, d: x.getImageData(0, 0, c.width, c.height) }; }
  const i = await game.bitmap(game.common(p)), c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0); return { c, x, d: x.getImageData(0, 0, i.width, i.height) }; }
const texture = (tex, tint) => once('t:' + tex + '|' + tint, async () => {
  const { c, x, d } = await pixels(tex);
  if (tint) { const g = (await pixels(tint)).d, gw = g.width, a = d.data;   // the gradient is a ramp: a grey texel takes the ramp's colour at its own brightness; coloured texels stay
    for (let i = 0; i < a.length; i += 4) if (a[i + 3] && Math.abs(a[i] - a[i + 1]) < 3 && Math.abs(a[i + 1] - a[i + 2]) < 3) {
      const k = Math.min(gw - 1, Math.round(a[i] * (gw - 1) / 255)) * 4; a[i] = g.data[k]; a[i + 1] = g.data[k + 1]; a[i + 2] = g.data[k + 2]; }
    x.putImageData(d, 0, 0); }
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.05, side: THREE.DoubleSide, fog: false });
  // centroid sampling: antialiased edge pixels look up the texture inside the face, not past its edge (that drew thin lines along box edges)
  mat.onBeforeCompile = sh => { const c = k => THREE.ShaderChunk[k].replace(/varying vec2/g, 'centroid varying vec2');
    sh.vertexShader = sh.vertexShader.replace('#include <uv_pars_vertex>', c('uv_pars_vertex')); sh.fragmentShader = sh.fragmentShader.replace('#include <uv_pars_fragment>', c('uv_pars_fragment')); };
  mat.customProgramCacheKey = () => 'centroid-uv';
  return { mat, w: c.width, h: c.height };
});

// ---- a blockymodel box/quad as a mesh
const FACES = { front: [2, 1, 0, 1, 1, -1], back: [2, -1, 0, -1, 1, -1], right: [0, 1, 2, -1, 1, -1], left: [0, -1, 2, 1, 1, -1], top: [1, 1, 0, 1, 2, -1], bottom: [1, -1, 0, 1, 2, 1] };
const S = 0.7071068, QUADROT = { '+Z': [0, 0, 0, 1], '-Z': [0, 1, 0, 0], '+Y': [-S, 0, 0, S], '-Y': [S, 0, 0, S], '+X': [0, S, 0, S], '-X': [0, -S, 0, S] };
const xyz = (o, d = 0) => [o?.x ?? d, o?.y ?? d, o?.z ?? d];
export function usedRects(modelJson) {
  const out = [];
  // each rect is named by the way that face really points on the model (a quad's 'front' may face sideways, a turned part's faces turn with it)
  const DIR = [['right', 'left'], ['top', 'bottom'], ['front', 'back']], facing = (name, q) => { const [ax, sg] = FACES[name], v = new THREE.Vector3(); v.setComponent(ax, sg); v.applyQuaternion(q);
    const a = [v.x, v.y, v.z].map(Math.abs), k = a.indexOf(Math.max(...a)); return DIR[k][v.getComponent(k) > 0 ? 0 : 1]; };
  const walk = (n, pq = new THREE.Quaternion()) => { const sh = n.shape || {}, o = n.orientation, q = pq.clone().multiply(new THREE.Quaternion(o?.x ?? 0, o?.y ?? 0, o?.z ?? 0, o?.w ?? 1));
    if ((sh.type === 'box' || sh.type === 'quad') && sh.visible !== false) { const size = xyz(sh.settings?.size), lay = sh.textureLayout || {}, fq = sh.type === 'quad' ? q.clone().multiply(new THREE.Quaternion(...(QUADROT[sh.settings?.normal] || QUADROT['+Z']))) : q;
      for (const [name, [, , ua, , va]] of Object.entries(sh.type === 'quad' ? { front: FACES.front } : FACES)) {
        const fl = lay[name]; if (!fl) continue; const fu = size[ua], fv = size[va]; if (fu <= 0 || fv <= 0) continue;
        const ox = fl.offset?.x ?? 0, oy = fl.offset?.y ?? 0, a = ((fl.angle | 0) % 360 + 360) % 360, xs = [], ys = [];
        for (const [su, sv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const pu = su * fu * (fl.mirror?.x ? -1 : 1), pv = sv * fv * (fl.mirror?.y ? -1 : 1);
          const [X, Y] = a === 90 ? [ox - pv, oy + pu] : a === 180 ? [ox - pu, oy - pv] : a === 270 ? [ox + pv, oy - pu] : [ox + pu, oy + pv]; xs.push(X); ys.push(Y); }
        out.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), face: facing(name, fq), node: n.name }); } }
    for (const c of n.children || []) walk(c, q); };
  for (const n of modelJson.nodes || []) walk(n);
  return out;
}
function shapeMesh(sh, T) {
  const size = xyz(sh.settings?.size), st = xyz(sh.stretch, 1), off = xyz(sh.offset), half = size.map(v => v / 2), quad = sh.type === 'quad'; if (quad) half[2] = 0;
  const qr = new THREE.Quaternion(...(quad ? QUADROT[sh.settings?.normal] || QUADROT['+Z'] : QUADROT['+Z'])), lay = sh.textureLayout || {}, pos = [], uv = [], idx = [], fuv = [];
  for (const [name, [na, ns, ua, us, va, vs]] of Object.entries(quad ? { front: FACES.front } : FACES)) {
    const fl = lay[name]; if (!fl) continue; const fu = size[ua], fv = size[va]; if (fu <= 0 || fv <= 0) continue;
    const ox = fl.offset?.x ?? 0, oy = fl.offset?.y ?? 0, a = ((fl.angle | 0) % 360 + 360) % 360, b = pos.length / 3;
    for (const [su, sv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const g = [0, 0, 0]; g[na] = ns * half[na]; g[ua] = us * (su - 0.5) * size[ua]; g[va] = vs * (sv - 0.5) * size[va];
      const v = new THREE.Vector3(...g).applyQuaternion(qr); pos.push(v.x * st[0] + off[0], v.y * st[1] + off[1], v.z * st[2] + off[2]);
      // mirrored (that axis runs back from the offset), then turned about the offset by the angle
      const pu = su * fu * (fl.mirror?.x ? -1 : 1), pv = sv * fv * (fl.mirror?.y ? -1 : 1);
      const [X, Y] = a === 90 ? [ox - pv, oy + pu] : a === 180 ? [ox - pu, oy - pv] : a === 270 ? [ox + pv, oy - pu] : [ox + pu, oy + pv];
      fuv.push(X, Y);
    }
    // pull the corners a hair inside the face's rectangle: with antialiasing, edge pixels otherwise sample the texel next door and draw thin lines along box edges
    const cx = (fuv[0] + fuv[2] + fuv[4] + fuv[6]) / 4, cy = (fuv[1] + fuv[3] + fuv[5] + fuv[7]) / 4, E = 1 / 64;
    for (let k = 0; k < 8; k += 2) { const X = fuv[k] + Math.sign(cx - fuv[k]) * E, Y = fuv[k + 1] + Math.sign(cy - fuv[k + 1]) * E; uv.push(X / T.w, 1 - Y / T.h); }
    fuv.length = 0;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, T.mat); mesh.userData.texel = st; return mesh;
}
// a node: its pivot group, its own shape, and a child holder at the shape's offset (children hang from pivot + offset)
function node(n, T, bones, parts) {
  const g = new THREE.Group(); g.position.set(...xyz(n.position)); const o = n.orientation; if (o) g.quaternion.set(o.x ?? 0, o.y ?? 0, o.z ?? 0, o.w ?? 1);
  const sh = n.shape || {}; if ((sh.type === 'box' || sh.type === 'quad') && sh.visible !== false) { const m = shapeMesh(sh, T); if (m) { g.add(m); g.userData.mesh = m; m.userData.nodeName = n.name; } }
  const kids = new THREE.Group(); kids.position.set(...xyz(sh.offset)); g.add(kids); if (bones && !bones[n.name]) bones[n.name] = kids;
  if (n.name) { g.userData.rest = { p: g.position.clone(), q: g.quaternion.clone() }; (parts.get(n.name) || parts.set(n.name, []).get(n.name)).push(g); }
  for (const c of n.children || []) kids.add(node(c, T, bones, parts)); return g;
}
// a cosmetic's pieces sit under empty nodes named after the body's bones: re-hang them on that bone
function attach(ns, T, bones, parts) {
  for (const n of ns) {
    const b = bones[n.name]; if (!b) { attach(n.children || [], T, bones, parts); continue; }
    for (const c of n.children || []) if (!bones[c.name]) b.add(node(c, T, null, parts));
    attach((n.children || []).filter(c => bones[c.name]), T, bones, parts);
  }
}
export async function build(skin, R) {
  const list = FIELDS.map(f => [f, R.resolve(f, skin)]).filter(p => p[1]);
  const loaded = (await Promise.all(list.map(async ([f, r]) => { try { return [f, r.model.startsWith('shape:') ? await shapeSource(r.model.slice(6).split('@')[0]) : await game.json(game.common(r.model)), await texture(r.tex, r.tint)]; } catch (e) { console.warn(f, e.message); return null; } }))).filter(Boolean);
  const root = new THREE.Group(), bones = {}, parts = new Map(), body = loaded.find(l => l[0] === 'bodyCharacteristic');
  if (!body) throw new Error('the body model is missing from the game files');
  for (const n of body[1].nodes) root.add(node(n, body[2], bones, parts));
  for (const [f, m, T] of loaded) if (f !== 'bodyCharacteristic') attach(m.nodes, T, bones, parts);
  root.userData.parts = parts; root.userData.bones = bones; return root;
}
// an animal (or any model with attachments) built the same way, for the Mount moves
export async function buildCreature(cfg) {
  const m = await game.json(game.common(cfg.model)), T = await texture(cfg.tex), root = new THREE.Group(), bones = {}, parts = new Map();
  for (const n of m.nodes) root.add(node(n, T, bones, parts));
  for (const a of cfg.atts || []) { try { attach((await game.json(game.common(a.model))).nodes, await texture(a.tex), bones, parts); } catch (e) { console.warn(a.model, e.message); } }
  root.userData.parts = parts; return root;
}
// a block held in the hand: a small cube wearing the block's texture on every side
export async function buildBlock(tex, size = 16) { const T = await texture(tex), root = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), T.mat); m.position.y = size / 2 + 2; root.add(m); root.userData.parts = new Map(); return root; }
export function dispose(root) { root?.traverse(o => o.geometry?.dispose()); }

// ---- animation: .blockyanim keyframes are deltas on the rest pose, 60 frames a second
const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
function span(keys, T, dur, loop) {   // the two keyframes around T and how far between them
  const n = keys.length; if (!n) return null; if (n === 1) return [keys[0], keys[0], 0];
  if (T <= keys[0].time || T >= keys[n - 1].time) {
    if (!loop) return T <= keys[0].time ? [keys[0], keys[0], 0] : [keys[n - 1], keys[n - 1], 0];
    const a = keys[n - 1], b = keys[0], gap = b.time + dur - a.time; return [a, b, gap > 0 ? ((T >= a.time ? T : T + dur) - a.time) / gap : 0];
  }
  let i = 1; while (keys[i].time < T) i++; const a = keys[i - 1], b = keys[i]; return [a, b, (T - a.time) / (b.time - a.time || 1)];
}
// Moves that carry the player across the ground in game (walk, run, dash, roll, swim, fly ...). The animation files only hold the
// body motion, so the stage shows the travel itself: the ground slides under the figure, in units a second ([sideways, forward]).
const STILL = new Set(['Poses', 'Emote', 'Taunt', 'Flavor', 'Expressions', 'Climb', 'Mantle']);
export function motionOf(group, n) {
  if (STILL.has(group) || /Idle|Look|Float|Sink|Step_|Interact|Death|Hurt|Wake|Fall|^Jump(_Crouch)?$|^Crouch$/.test(n)) return null;
  const back = /Back(ward)?$/.test(n), left = /_Left$/.test(n), right = /_Right$/.test(n);
  let s = /^Dash/.test(n) ? 720 : /^Roll/.test(n) ? 380 : /^Slide/.test(n) ? 430 : /Sprint/.test(n) ? 440 : /^(Fly|Glide)_Fast/.test(n) ? 540 : /^Glide/.test(n) ? 380
    : /^Fly_Crouch/.test(n) ? 130 : /^Fly/.test(n) ? 300 : /Run_Slow/.test(n) ? 200 : /Run/.test(n) ? 300 : /Crouch_Walk/.test(n) ? 85 : /Walk/.test(n) ? 140
    : /^Jump_Far/.test(n) ? 260 : /^Swim_(Dive_)?Fast/.test(n) ? 260 : /^Swim(_Backward|_Dive|_Dive_Backward)?$/.test(n) ? 150 : 0;
  if (!s) return null; if (back) s *= 0.75;
  return left ? [s, 0] : right ? [-s, 0] : [0, back ? -s : s];
}
const BLEND = 0.28, HOLD = 1.4;   // seconds to ease into a new move; seconds a one-shot move rests on its last frame before it replays
export class Animator {
  constructor() { this.anim = null; this.t = 0; this.speed = 1; this.playing = true; this.figure = null; this.blend = 1; this.held = 0; this.move = null; this.pulse = false; this.resting = false; this.pt = 0; this.still = false; }
  setFigure(root) { if (root !== this.figure) this.blend = 1; this.figure = root; this.apply(); }   // the same figure again (held things hung on it) keeps its blend going
  set(anim, speed = 1, instant = false) {
    if (anim) for (const tr of Object.values(anim.nodeAnimations || {})) for (const k of ['position', 'orientation', 'shapeVisible']) (tr[k] ||= []).sort((a, b) => a.time - b.time);
    const times = new Set(); if (anim) for (const tr of Object.values(anim.nodeAnimations || {})) for (const ks of Object.values(tr)) if (Array.isArray(ks)) for (const k of ks) times.add(k.time);
    this.blendTime = anim && times.size <= 1 ? 0.5 : BLEND;   // a move that is one held pose gets a slower, visible ease into it
    this.still = !!anim && times.size <= 1; this.move = null; this.pulse = false; this.resting = false; this.pt = 0;
    this.capture(instant); this.anim = anim; this.baseSpeed = speed; this.t = 0; this.held = 0; this.apply();
  }
  // travel for this move; a held pose that travels (a dash) is shown as a burst: into the pose, across the ground, back to standing, again
  setMove(v) { this.move = v || null; this.pulse = !!v && this.still; this.resting = false; this.pt = 0; if (this.pulse) this.blendTime = 0.15; }
  get velocity() { return this.move && this.anim && this.playing && !this.resting ? this.move : null; }
  // remember the pose the figure is in now, so the next move eases out of it instead of snapping
  capture(instant) { this.blend = instant || !this.figure ? 1 : 0; if (this.blend) return;
    this.figure.userData.parts.forEach(gs => gs.forEach(g => { const f = g.userData.from ||= { p: new THREE.Vector3(), q: new THREE.Quaternion() }; f.p.copy(g.position); f.q.copy(g.quaternion); })); }
  get duration() { return Math.max(1, this.anim?.duration || 1); }
  update(dt) {
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / (this.blendTime || BLEND));
    if (this.pulse && this.playing) { this.pt += dt;
      if (!this.resting && this.pt > 0.55) { this.capture(false); this.blendTime = 0.4; this.resting = true; this.pt = 0; }
      else if (this.resting && this.pt > 1.0) { this.capture(false); this.blendTime = 0.15; this.resting = false; this.pt = 0; } }
    const A = this.anim;
    if (A && this.playing) { const end = this.duration;
      if (this.t < end) this.t += dt * 60 * this.speed * (this.baseSpeed || 1);
      if (this.t >= end) { if (!A.holdLastKeyframe) this.t %= end;
        else { this.t = end; this.held += dt; if (this.held > HOLD) { this.capture(false); this.t = 0; this.held = 0; } } } }   // a one-shot move plays again after a rest
    this.apply();
  }
  apply() {
    const A = this.resting ? null : this.anim, parts = this.figure?.userData.parts; if (!parts) return;
    parts.forEach(gs => gs.forEach(g => { g.position.copy(g.userData.rest.p); g.quaternion.copy(g.userData.rest.q); if (g.userData.mesh) g.userData.mesh.visible = true; }));
    if (A) { const dur = this.duration, loop = !A.holdLastKeyframe, T = Math.min(this.t, dur);
      for (const [name, tr] of Object.entries(A.nodeAnimations || {})) { const gs = parts.get(name); if (!gs) continue;
        const o = span(tr.orientation, T, dur, loop), p = span(tr.position, T, dur, loop), v = tr.shapeVisible.length ? span(tr.shapeVisible, T, dur, loop) : null;
        for (const g of gs) { const r = g.userData.rest;
          if (o) { const a = o[0].delta, b = o[1].delta; q0.set(a.x ?? 0, a.y ?? 0, a.z ?? 0, a.w ?? 1); q1.set(b.x ?? 0, b.y ?? 0, b.z ?? 0, b.w ?? 1); g.quaternion.copy(r.q).multiply(q0.slerp(q1, o[2])); }
          if (p) { const a = p[0].delta, b = p[1].delta, u = p[2], L = k => (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * u; g.position.set(r.p.x + L('x'), r.p.y + L('y'), r.p.z + L('z')); }
          if (v && g.userData.mesh) g.userData.mesh.visible = v[0].delta !== false; } } }
    if (this.blend < 1) { const k = this.blend * this.blend * (3 - 2 * this.blend);
      parts.forEach(gs => gs.forEach(g => { const f = g.userData.from; if (!f) return; g.position.lerpVectors(f.p, g.position, k); q0.copy(f.q).slerp(g.quaternion, k); g.quaternion.copy(q0); })); }
  }
}
export async function loadAnim(group, name) { return game.json(`Common/Characters/Animations/${group}/${name}.blockyanim`); }

// ---- the game's blocks as meshes, drawn many at a time: a cube block's six faces, or a block model baked into one geometry
const BLOCK = 64;   // one block in the figure's units (block models are made at 32 to a block, so they are doubled)
const SHADE = 0.72;   // the scene's lights are set for the figure; scenery takes this much of them so a sunlit top shows the block's own colour
const canvasOf = path => once('c:' + path, async () => { const i = await game.bitmap(game.common(path)), c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); return c; });
function tinted(c, hex) {   // a greyscale texture coloured the way the game tints it (multiply), keeping its see-through parts
  if (!hex) return c; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const x = o.getContext('2d'); x.drawImage(c, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = hex; x.fillRect(0, 0, o.width, o.height); x.globalCompositeOperation = 'destination-in'; x.drawImage(c, 0, 0); return o; }
function blockMat(c, cut) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
  return new THREE.MeshLambertMaterial({ map: t, color: new THREE.Color(SHADE, SHADE, SHADE), alphaTest: cut ? 0.5 : 0, side: cut ? THREE.DoubleSide : THREE.FrontSide }); }
function mergeMeshes(group) {   // every box and quad of a model, moved into place and joined into one geometry
  group.updateMatrixWorld(true); const pos = [], uv = [], nor = [], idx = []; const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  group.traverse(m => { if (!m.isMesh) return; const g = m.geometry, P = g.attributes.position, U = g.attributes.uv, N = g.attributes.normal, base = pos.length / 3; nm.getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); pos.push(v.x, v.y, v.z); uv.push(U.getX(i), U.getY(i)); v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); }
    for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i)); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g; }
// one block type as [{ geo, mat }] (a cube with several tops gives one entry per top, the world picks among them)
const blockParts = (name, tint) => once('blk:' + name + '|' + tint, async () => {
  const b = BLOCKS[name]; if (!b) throw new Error('unknown block ' + name);
  if (b.cube) { const side0 = await canvasOf(b.cube.side), bottom = blockMat(await canvasOf(b.cube.bottom));
    let side = side0; if (b.cube.sideMask) { side = document.createElement('canvas'); side.width = side0.width; side.height = side0.height; const x = side.getContext('2d'); x.drawImage(side0, 0, 0); x.drawImage(tinted(await canvasOf(b.cube.sideMask), tint), 0, 0, side.width, side.height); }
    const sideM = blockMat(side), tops = Array.isArray(b.cube.top) ? b.cube.top : [b.cube.top], geo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK).translate(0, BLOCK / 2, 0);
    return Promise.all(tops.map(async t => ({ geo, mat: [sideM, sideM, blockMat(b.tintUp ? tinted(await canvasOf(t), tint) : await canvasOf(t)), bottom, sideM, sideM] }))); }
  const m = await game.json(game.common(b.model)), c = tinted(await canvasOf(b.tex[0]), b.tint), mat = blockMat(c, true), T = { w: c.width, h: c.height, mat }, g = new THREE.Group();
  for (const n of m.nodes) g.add(node(n, T, null, new Map())); g.scale.setScalar(BLOCK / 32);
  const geo = mergeMeshes(g); g.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); return [{ geo, mat }]; });
export async function blockModel(name) { const [p] = await blockParts(name); const m = new THREE.Mesh(p.geo, Array.isArray(p.mat) ? p.mat : p.mat); m.userData.shared = true; return m; }   // one piece of furniture (a chair, a ladder ...)
const disposeTree = root => root.traverse(o => { if (o.isInstancedMesh) o.dispose(); });   // block geometries and materials are shared and cached, only the instance lists go
// a block's turn in a prefab: 0-63, quarter turns about y, then x, then z
const turnOf = r => new THREE.Quaternion().setFromEuler(new THREE.Euler(((r >> 2) & 3) * Math.PI / 2, (r & 3) * Math.PI / 2, ((r >> 4) & 3) * Math.PI / 2, 'YXZ'));
// a small piece of the zone: rolling land of its ground blocks, its own grasses and flowers, and a few of its trees, from the game's prefabs
async function buildWorld(sc, tint) {
  // The land repeats every P blocks both ways. Two lanes FLAT blocks either side of the lines x = 0 and z = 0 stay level, so a moving
  // animation (always straight along x or z) carries the character down a lane: the whole land slides past as one piece, and nothing
  // solid ever reaches the character or the camera. Hills, trees and tall plants fill the squares between the lanes.
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = 80, FLAT = 10, R = 27, TAU = Math.PI * 2, sym = v => { const w = ((v % P) + P) % P; return w >= P / 2 ? w - P : w; };
  const lane = (x, z) => Math.min(Math.abs(sym(x)), Math.abs(sym(z)));   // blocks to the nearest lane's middle line
  const height = (x, z) => { const d = lane(x, z); if (d < FLAT) return 0;
    const n = Math.sin(TAU * 2 * x / P + 1.3) * Math.cos(TAU * 3 * z / P - 0.7) + 0.7 * Math.sin(TAU * (x + z) / P + 2.1) + 0.4 * Math.cos(TAU * 4 * (x - z) / P);
    return Math.max(0, Math.round((n + 0.5) * sc.hills * 0.55 * Math.min(1, (d - FLAT) / 4))); };
  const H = []; for (let x = 0; x < P; x++) for (let z = 0; z < P; z++) H[x * P + z] = height(x, z);
  const h = (x, z) => H[(((x % P) + P) % P) * P + (((z % P) + P) % P)];
  const items = new Map(), put = (key, x, y, z, q, plant) => (items.get(key) || items.set(key, { plant, list: [] }).get(key)).list.push([x, y, z, q]);
  const nTops = (await blockParts(sc.ground, tint)).length;
  // plant sizes (third value): 1 low, 2 knee-high, none tall; the closer to a lane's middle, the lower
  const pick = size => { const from = sc.plants.filter(p => size === 1 ? p[2] === 1 : size === 2 ? p[2] : true); if (!from.length) return null; let r = rnd() * from.reduce((t, p) => t + p[1], 0);
    for (const [n, w] of from) if ((r -= w) <= 0) return n; return from[0][0]; };
  // trees in the squares between the lanes, each wholly inside (reach = how far its blocks spread from the trunk), never touching another
  const taken = new Set(), trees = await Promise.all(sc.trees.map(p => game.json(p))), placed = [];
  for (let i = 0, tries = 0; placed.length < 5 && tries < 400; tries++) { const tb = trees[i % trees.length].blocks, reach = Math.max(0, ...tb.map(b => Math.hypot(b.x, b.z)));
    const cx = Math.round(FLAT + reach + 2 + rnd() * (P - 2 * (FLAT + reach + 2))), cz = Math.round(FLAT + reach + 2 + rnd() * (P - 2 * (FLAT + reach + 2)));
    if (P - 2 * (FLAT + reach + 2) < 0 || placed.some(t => Math.hypot(sym(t[0] - cx), sym(t[1] - cz)) < t[2] + reach + 2)) { if (tries % 40 === 39) i++; continue; }
    placed.push([cx, cz, reach]); i++;
    const trunks = tb.filter(b => /Trunk/.test(b.name)), lift = trunks.length ? -Math.min(...trunks.map(b => b.y)) : 0, base = h(cx, cz);   // the trunk's foot on the ground
    for (const b0 of tb) { if (!BLOCKS[b0.name]) continue; const x = cx + b0.x, z = cz + b0.z, y = base + b0.y + lift;
      put(b0.name + '|0', x, y, z, b0.rotation ? turnOf(b0.rotation) : null, false); if (b0.y + lift === 0) taken.add(sym(x) + ',' + sym(z)); } }
  for (let x = 0; x < P; x++) for (let z = 0; z < P; z++) { const top = h(x, z), low = Math.min(top, h(x + 1, z), h(x - 1, z), h(x, z + 1), h(x, z - 1));
    for (let y = low; y <= top; y++) put(y === top ? sc.ground + '|' + Math.floor(rnd() * nTops) : sc.under + '|0', x, y - 1, z, null, false);
    if (taken.has(sym(x) + ',' + sym(z)) || rnd() >= sc.density) continue; const px = x + (rnd() - 0.5) * 0.5, pz = z + (rnd() - 0.5) * 0.5, d = lane(px, pz);
    const name = pick(d < 3.2 ? 1 : d < FLAT ? 2 : 0); if (name) put(name + '|0', px, top, pz, rnd() * TAU, true); }
  const root = new THREE.Group(), M = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1), SC = new THREE.Vector3();
  const sets = []; for (const [key, { plant, list }] of items) { const [name, k] = key.split('|'), parts = await blockParts(name, tint), p = parts[+k] || parts[0];
    const im = new THREE.InstancedMesh(p.geo, p.mat, list.length); im.frustumCulled = false; root.add(im); sets.push({ im, list, plant }); }
  let ax = 0, az = 0, laid = null;   // how far the land has slid (scene units), and where it was last laid out
  const avoid = () => root.userData.avoid || [];   // set pieces' ground rectangles [x0, z0, x1, z1] in blocks: no plant inside them
  // lay out the land for the current slide: wrapped round the character, only what is within R blocks (the fog hides the edge)
  const layout = (plantsOnly) => { const ox = ax / BLOCK, oz = az / BLOCK, c = root.userData.cam, clear = root.userData.clear || 1, rects = avoid();
    for (const st of sets) { if (plantsOnly && !st.plant) continue; let n = 0;
      for (const [x0, y, z0, q] of st.list) { const x = sym(x0 + ox), z = sym(z0 + oz); if (x * x + z * z > R * R) continue;
        let k = 1; if (st.plant) { const d = Math.hypot(x, z);   // a plant shrinks away near the character, the camera's lens and any set piece
          k = Math.min(1, Math.max(0, (d - clear) / 0.7), c ? Math.max(0, (Math.hypot(x * BLOCK - c.x, z * BLOCK - c.z) / BLOCK - 2.2) / 1.2) : 1);
          if (c && k > 0) { const cx = c.x / BLOCK, cz = c.z / BLOCK, L = cx * cx + cz * cz, t = L ? Math.max(0, Math.min(1, (x * cx + z * cz) / L)) : 0;   // and along the line from the lens to the character, so no clump fills the foreground
            k = Math.min(k, Math.max(0, (Math.hypot(x - t * cx, z - t * cz) - 0.9) / 0.8)); }
          for (const r of rects) if (x > r[0] - 0.6 && x < r[2] + 0.6 && z > r[1] - 0.6 && z < r[3] + 0.6) k = 0;
          if (k < 0.02) continue; }
        st.im.setMatrixAt(n++, M.compose(V.set(x * BLOCK, y * BLOCK, z * BLOCK), st.plant ? Q.setFromAxisAngle(Y, q) : q || Q.identity(), st.plant ? SC.setScalar(k) : ONE)); }
      st.im.count = n; st.im.instanceMatrix.needsUpdate = true; } };
  const span = P * BLOCK;
  root.userData.move = (dx, dz) => {
    ax = (ax + dx) % span; az = (az + dz) % span;
    const key = ax.toFixed(1) + ',' + az.toFixed(1); if (key !== laid) { laid = key; layout(false); } else layout(true); };
  root.userData.offset = () => [ax, az]; root.userData.span = span;
  // a move along one lane must start from the crossing, or it would run down the other lane into the squares: back to it (under the mist)
  root.userData.snap = along => { if (along === 'x') az = 0; else ax = 0; laid = null; layout(false); };
  root.userData.solids = () => sets.filter(t => !t.plant).flatMap(t => t.list.filter(b => b[1] >= 0).map(b => [sym(b[0]), b[1], sym(b[2])]));   // for tests: blocks above the ground, in blocks
  // for tests: the nearest solid block above the ground to a point (scene units), in blocks, as the land lies now
  root.userData.solidNear = (px = 0, pz = 0) => { let best = Infinity; const ox = ax / BLOCK, oz = az / BLOCK;
    for (const st of sets) { if (st.plant) continue; for (const [x0, y, z0] of st.list) { if (y < 0) continue; const x = sym(x0 + ox), z = sym(z0 + oz);
      best = Math.min(best, Math.max(0, Math.hypot(x - px / BLOCK, z - pz / BLOCK) - 0.71)); } } return best; };
  root.userData.relayout = () => { laid = null; layout(false); };
  layout(false); root.position.y = -0.5; return root; }
// ---- the stage (main view) and a small off-screen renderer for thumbnails
function lights(scene) { scene.add(new THREE.AmbientLight(0xffffff, 1.7)); const l = new THREE.DirectionalLight(0xfff4e0, 1.9); l.position.set(-60, 160, 120); scene.add(l); }
export function stage(canvas, Controls) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(); lights(scene);
  const cam = new THREE.PerspectiveCamera(32, 1, 1, 6000); cam.position.set(-75, 95, 255);
  const ctl = new Controls(cam, canvas); ctl.target.set(0, 62, 0); ctl.enablePan = false; ctl.zoomToCursor = false;   // zoom stays on the figure's centre, lined up with the buttons under it
  ctl.minDistance = 40; ctl.maxDistance = 480; ctl.maxPolarAngle = Math.PI * 0.55; ctl.update();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(58, 48), new THREE.MeshBasicMaterial({ color: 0x0b1626, transparent: true, opacity: 0.55, fog: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = -0.2; scene.add(disc);
  const CELL = 32, grid = new THREE.GridHelper(CELL * 40, 40, 0x4a76ad, 0x33557f); grid.material.transparent = true; grid.material.opacity = 0; grid.material.depthWrite = false; scene.add(grid);
  let sky = null, world = null, scrollers = [], flowing = [], mist = null; const FOG = [950, 1750];   // mist: the short fade that hides the land going back to the crossing   // the in-game background (setBackdrop below); set pieces that slide while climbing
  // the climbing wall: the same grid stood up in front of the figure, sliding the other way as it climbs
  const wallG = new THREE.GridHelper(CELL * 16, 16, 0x4a76ad, 0x33557f); wallG.rotation.x = Math.PI / 2; wallG.material.transparent = true; wallG.material.opacity = 0; wallG.material.depthWrite = false; wallG.visible = false; scene.add(wallG);
  let wallOn = null; const WALL_Z = 12, WALL_Y = 70;
  const vel = new THREE.Vector2(), want = new THREE.Vector2();
  function travel(dt) { const v = anim.velocity; want.set(v ? v[0] : 0, v ? v[1] : 0); vel.lerp(want, 1 - Math.exp(-dt * 9));
    // the clearing's floor slides with the move (a horse needs more room round it than a person)
    if (world) { world.userData.cam = cam.position; world.userData.clear = Math.max(mountRoot ? 2.3 : 1, plantClear, painting ? 4 : 0);
      let mx = anim.move ? -vel.x * dt : 0, mz = anim.move ? -vel.y * dt : 0; const [ox, oz] = world.userData.offset(), span = world.userData.span;
      const along = Math.abs(want.x) > Math.abs(want.y) ? 'x' : Math.abs(want.y) > 0 ? 'z' : null;   // the lane the new move runs down
      if (along === 'x') mz = 0; else if (along === 'z') mx = 0;   // the land only ever slides down the current move's lane
      if (!mist && along && (along === 'x' ? Math.abs(oz % span) > 1 : Math.abs(ox % span) > 1)) mist = { t: 0, along, snapped: false };
      if (mist) { mist.t += dt / 0.45; const k = mist.t < 0.5 ? mist.t * 2 : Math.max(0, 2 - mist.t * 2), f = scene.fog;
        if (!mist.snapped && mist.t >= 0.5) { world.userData.snap(mist.along); mist.snapped = true; }
        if (f) { const d = cam.position.distanceTo(ctl.target); f.near = FOG[0] + (d + 60 - FOG[0]) * k; f.far = FOG[1] + (d + 330 - FOG[1]) * k; }   // the land fades into the zone's own haze and back
        world.userData.move(mist.snapped ? mx : 0, mist.snapped ? mz : 0); if (mist.t >= 1) { if (f) { f.near = FOG[0]; f.far = FOG[1]; } mist = null; } }
      else world.userData.move(mx, mz); }
    for (const w of flowing) { const [ox, oz] = world ? world.userData.offset() : [0, 0], m = w.material.map; if (m) m.offset.set(-ox / w.userData.flow, oz / w.userData.flow); }   // water drifts with the land
    grid.position.x = (grid.position.x - vel.x * dt) % CELL; grid.position.z = (grid.position.z - vel.y * dt) % CELL;   // the ground runs backwards under the figure
    grid.material.opacity += ((anim.move && anim.anim && !world ? 0.5 : 0) - grid.material.opacity) * (1 - Math.exp(-dt * 6)); grid.visible = grid.material.opacity > 0.01;
    const wy = wallG.position.y - WALL_Y - (wallOn ? wallOn[1] : 0) * dt, wx = wallG.position.x - (wallOn ? wallOn[0] : 0) * dt;
    wallG.position.set(wx % CELL, WALL_Y + wy % CELL, WALL_Z); for (const p of scrollers) { const b = p.userData.scroll; if (!wallOn) { p.position.copy(b); continue; } p.position.x = b.x + (p.position.x - b.x - wallOn[0] * dt) % BLOCK; p.position.y = b.y + (p.position.y - b.y - wallOn[1] * dt) % BLOCK; }
    wallG.material.opacity += ((wallOn && !scrollers.length ? 0.5 : 0) - wallG.material.opacity) * (1 - Math.exp(-dt * 6)); wallG.visible = wallG.material.opacity > 0.01; }
  let hl = null, helpers = [];   // outlines around picked boxes (see drawHL)
  const anim = new Animator(), mountAnim = new Animator(); let figure = null, held = [], perchY = 0, faceCb = null, faced = '', last = performance.now(), mountRoot = null, seat = null, hoverTo = 0, hoverAt = 0;
  let inset = 0, insetR = 0, figTop = 130, autoFit = true;   // the buttons over the bottom and right of the view: the picture is centred on what is left, at the same scale
  const insets = () => { const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1; return [inset > 0 && inset < h * 0.45 ? inset : 0, insetR > 0 && insetR < w * 0.35 ? insetR : 0, w, h]; };
  function fit() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false);
    const [b, r] = insets(); cam.aspect = (w + r) / (h + b); cam.fov = 2 * Math.atan(Math.tan(16 * Math.PI / 180) * (h + b) / h) * 180 / Math.PI;
    if (b || r) cam.setViewOffset(w + r, h + b, r, b, w, h); else cam.clearViewOffset(); cam.updateProjectionMatrix(); }
  new ResizeObserver(() => { fit(); refit(); }).observe(canvas); fit();   // a resized window refits the character (unless the player set the view)
  let tw = null;   // a camera glide in progress (glideCam below)
  const stepCam = now => { if (!tw) return; const k = Math.min(1, (now - tw.at) / 400), e = k * k * (3 - 2 * k);
    ctl.target.lerpVectors(tw.t0, tw.t1, e); const sp = new THREE.Spherical(tw.s0.radius + (tw.s1.radius - tw.s0.radius) * e, tw.s0.phi + (tw.s1.phi - tw.s0.phi) * e, tw.s0.theta + tw.dth * e);
    cam.position.copy(ctl.target).add(new THREE.Vector3().setFromSpherical(sp)); ctl.update(); if (k >= 1) tw = null; };
  (function loop(now) { requestAnimationFrame(loop); stepCam(now); const dt = Math.min(0.1, (now - last) / 1000 || 0); anim.update(dt); mountAnim.playing = anim.playing; mountAnim.update(dt); travel(dt); float(dt, now); for (const h of helpers) h.update(); dropHeld(); facing(); last = now; renderer.render(scene, cam); })(last);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  // the texel of `image` under a screen point, for painting straight on the model
  function texel(image) { for (const h of ray.intersectObject(figure, true)) { if (!h.uv || !h.object.visible || h.object.material?.map?.image !== image) continue;
      return { x: Math.min(image.width - 1, Math.max(0, Math.floor(h.uv.x * image.width))), y: Math.min(image.height - 1, Math.max(0, Math.floor((1 - h.uv.y) * image.height))) }; }
    return null; }
  // the brush outline on the model: a square of brush-size texels, snapped to the texel grid of the face under the pointer
  const curs = [0xffffff, 0xf4c452].map(col => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    const l = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true })); l.renderOrder = 12; l.visible = false; l.frustumCulled = false; scene.add(l); return l; });
  const hitOn = image => { for (const h of ray.intersectObject(figure, true)) if (h.uv && h.face && h.object.visible && h.object.material?.map?.image === image) return h; return null; };
  const texOf = (h, image) => ({ x: Math.min(image.width - 1, Math.max(0, Math.floor(h.uv.x * image.width))), y: Math.min(image.height - 1, Math.max(0, Math.floor((1 - h.uv.y) * image.height))) });
  const tv = new THREE.Vector3();
  function square(l, h, size) {
    if (!h) { l.visible = false; return; }
    const o = h.object, n = h.face.normal, ax = Math.abs(n.x) > 0.5 ? 0 : Math.abs(n.y) > 0.5 ? 1 : 2, ts = (o.userData.texel || [1, 1, 1]).map(v => Math.abs(v) || 1);
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const mn = o.geometry.boundingBox.min.toArray(), lp = o.worldToLocal(h.point.clone()).toArray(), [u, v] = [0, 1, 2].filter(k => k !== ax);
    for (const k of [u, v]) lp[k] = mn[k] + (Math.floor((lp[k] - mn[k]) / ts[k] + 1e-6) + 0.5) * ts[k];
    lp[ax] += Math.sign(n.getComponent(ax)) * 0.15; const pos = l.geometry.attributes.position;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => { const p = lp.slice(); p[u] += a * size * ts[u] / 2; p[v] += b * size * ts[v] / 2; o.localToWorld(tv.fromArray(p)); pos.setXYZ(i, tv.x, tv.y, tv.z); });
    pos.needsUpdate = true; l.visible = true;
  }
  function aim(cx, cy) { const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); }
  function cursor(cx, cy, image, size, mirror) {   // draws the outline(s) and returns the texel under the pointer (with .m for the mirrored spot)
    if (cx == null || !figure) { for (const l of curs) l.visible = false; return null; }
    aim(cx, cy); const h = hitOn(image); square(curs[0], h, size); const p = h ? texOf(h, image) : null;
    if (mirror && h) { ray.ray.origin.x *= -1; ray.ray.direction.x *= -1; const h2 = hitOn(image); square(curs[1], h2, size); if (h2) p.m = texOf(h2, image); } else curs[1].visible = false;
    return p;
  }
  function pick(cx, cy, image, mirror) { if (!figure) return null; const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam);
    const p = texel(image); if (!p || !mirror) return p;
    ray.ray.origin.x *= -1; ray.ray.direction.x *= -1; p.m = texel(image); return p; }   // the same ray flipped left to right lands on the matching spot of the other side
  // while painting, the left button paints and the right button turns the view
  let painting = false, plantClear = 0;   // plants keep further away while an item is edited, or when a move sits or lies on the ground
  function paintMode(on) { painting = !!on; ctl.maxPolarAngle = on ? Math.PI * 0.97 : Math.PI * 0.55; ctl.mouseButtons.LEFT = on ? -1 : THREE.MOUSE.ROTATE; ctl.mouseButtons.RIGHT = THREE.MOUSE.ROTATE; ctl.touches.ONE = on ? -1 : THREE.TOUCH.ROTATE; canvas.style.cursor = on ? 'crosshair' : ''; }
  // the box under a screen point (first hit that passes the filter), and outlines around the boxes a filter picks
  // the picked box glows (its own copy of the material, lit gold) as well as getting an outline
  let lit = []; const glow = new Map();
  function drawHL() { for (const h of helpers) { scene.remove(h); h.geometry.dispose(); } helpers = []; for (const m of lit) if (m.userData.baseMat) { m.material = m.userData.baseMat; delete m.userData.baseMat; } lit = []; if (!hl || !figure) return;
    figure.updateMatrixWorld(true); figure.traverse(o => { if (o.isMesh && o.visible && hl(o)) { const h = new THREE.BoxHelper(o, 0xf4c452); h.material.depthTest = false; h.renderOrder = 10; helpers.push(h); scene.add(h);
      const base = o.material; if (!glow.has(base)) { const g = base.clone(); g.emissive = new THREE.Color(0x6a4a08); glow.set(base, g); } o.userData.baseMat = base; o.material = glow.get(base); lit.push(o); } }); }
  // the item being edited stands out: every other part of the character turns into a faint see-through mannequin
  const ghost = new THREE.MeshLambertMaterial({ color: 0xa9bfd6, transparent: true, opacity: 0.14, depthWrite: false }); let isoImage = null;
  // while one item is edited (the body see-through), a FRONT mark on the floor says which way the figure faces
  const frontMark = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#f4c452'; g.beginPath(); g.moveTo(128, 6); g.lineTo(168, 50); g.lineTo(88, 50); g.closePath(); g.fill();
    g.font = '800 44px Lexend, Segoe UI, sans-serif'; g.textAlign = 'center'; g.fillText('FRONT', 128, 108);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(48, 24), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.85 }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.4, 46); m.visible = false; scene.add(m); return m; })();
  function applyIsolate() { frontMark.visible = !!isoImage; figure?.traverse(o => { if (!o.isMesh) return; const real = o.userData.realMat || o.material, keep = !isoImage || real?.map?.image === isoImage;
    if (keep && o.userData.realMat) { o.material = o.userData.realMat; delete o.userData.realMat; } else if (!keep && !o.userData.realMat) { o.userData.realMat = o.material; o.material = ghost; } }); }
  function pickMesh(cx, cy, keep) { if (!figure) return null; const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam);
    for (const h of ray.intersectObject(figure, true)) if (h.object.visible && keep(h.object)) return h.object; return null; }
  // the gizmo: drag arrows (move), cubes (resize) or rings (rotate) on one box, like Blockbench and Blender. The box itself
  // follows live; on release onEnd gets the change in the box's own axes, and the caller rebuilds the model from its data.
  const tc = new TransformControls(cam, canvas); tc.setSize(0.85); tc.setTranslationSnap(0.5); tc.setRotationSnap(THREE.MathUtils.degToRad(5)); tc.setScaleSnap(0.05); scene.add(tc);
  const handle = new THREE.Object3D(); scene.add(handle);
  let gz = null, start = null;
  tc.addEventListener('dragging-changed', e => { ctl.enabled = !e.value; });
  tc.addEventListener('objectChange', () => { if (!gz) return; const g = gz.mesh.parent;
    if (gz.mode === 'move') gz.mesh.position.copy(handle.position.clone().sub(start.p).applyQuaternion(start.q.clone().invert()));
    else if (gz.mode === 'resize') gz.mesh.scale.copy(handle.scale);
    else g.quaternion.copy(g.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handle.quaternion)); });
  tc.addEventListener('mouseUp', () => { if (!gz) return; const g = gz.mesh.parent;
    gz.onEnd({ move: handle.position.clone().sub(start.p).applyQuaternion(start.q.clone().invert()), scale: handle.scale.clone(),
      turn: g.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handle.quaternion) }); });
  function gizmo(o) {
    gz = o; if (!o) { tc.detach(); return; }
    const g = o.mesh.parent; g.updateMatrixWorld(true);
    handle.position.copy(o.mode === 'rotate' ? g.getWorldPosition(new THREE.Vector3()) : new THREE.Box3().setFromObject(o.mesh).getCenter(new THREE.Vector3()));
    handle.quaternion.copy(g.getWorldQuaternion(new THREE.Quaternion())); handle.scale.set(1, 1, 1);
    start = { p: handle.position.clone(), q: handle.quaternion.clone() };
    tc.setMode(o.mode === 'move' ? 'translate' : o.mode === 'resize' ? 'scale' : 'rotate'); tc.setSpace('local'); tc.attach(handle);
  }
  const VIEWS = { front: [0, 62, 270], back: [0, 62, -270], side: [-270, 62, 0], top: [0, 330, 1], persp: [-75, 95, 255] };
  // a ridden animal under the figure: the figure sits at the animal's seat (in model units) and the view backs off to fit both
  const seatAt = () => { if (!figure) return; const k = anim.blend < 1 ? anim.blend * anim.blend * (3 - 2 * anim.blend) : 1; figure.position.set(0, (seat ? seat[1] : 0) + hoverAt + perchY * k, seat ? seat[2] : 0); };   // a seat's lift eases in with the pose, so nobody stands on the chair first
  // scenery a move needs: boxes and planes in the scene (a chair, a bed, the water's surface); perch lifts the figure onto it
  const setPiece = new THREE.Group(); scene.add(setPiece);
  async function scenery(list, perch = 0) { const my = (scenery.n = (scenery.n || 0) + 1);
    const made = await Promise.all((list || []).map(async it => { let map = null;
      if (it.block) { const g = new THREE.Group(); try { g.add(await blockModel(it.block)); } catch (e) { console.warn(it.block, e.message); return null; } g.position.set(...it.at); g.rotation.y = (it.turn || 0) * Math.PI / 180; if (it.stretch) g.scale.z = it.stretch; return g; }   // the game's own furniture (stretch: a touch longer along its own z)
      if (it.ladder) { const [cols, rows] = it.ladder, g = new THREE.Group(); try { await blockModel(SET_PIECES.ladder); await blockModel(SET_PIECES.wall); } catch (e) { console.warn('ladder', e.message); return null; }   // a wall of the game's ladders on planks, one block more each way so it can slide
        for (let c = -3; c <= cols + 2; c++) for (let r = -1; r <= rows; r++) { const x = (c - (cols - 1) / 2) * BLOCK, w = await blockModel(SET_PIECES.wall); w.position.set(x, r * BLOCK, BLOCK); g.add(w);
          if (cols > 1 ? c >= -1 && c <= cols : c === 0) { const l = await blockModel(SET_PIECES.ladder); l.position.set(x, r * BLOCK, 0); l.rotation.y = Math.PI; g.add(l); } }   // the wall wider than the ladders
        g.position.set(...it.at); g.userData.scroll = g.position.clone(); return g; }
      if (it.tex) { try { const T = await texture(it.tex); map = T.mat.map.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(...(it.repeat || [1, 1])); map.needsUpdate = true; } catch (e) { console.warn(it.tex, e.message); } }
      const mat = new THREE.MeshLambertMaterial({ map, color: it.color ?? 0xffffff, transparent: it.opacity != null, opacity: it.opacity ?? 1, depthWrite: it.opacity == null, side: THREE.DoubleSide });
      const geo = it.plane ? new THREE.PlaneGeometry(...it.plane) : new THREE.BoxGeometry(...it.box), m = new THREE.Mesh(geo, mat);
      if (it.plane) m.rotation.x = -Math.PI / 2; if (it.volume) { m.userData.volume = true; m.renderOrder = 2; } m.position.set(...it.at); if (it.flow) m.userData.flow = it.plane[0] / (it.repeat || [1])[0]; return m; }));
    const drop = m => m.traverse(o => { if (o.isMesh && !o.userData.shared) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });   // game blocks are shared, kept
    const lost = made.some(m => !m); made.splice(0, made.length, ...made.filter(Boolean)); if (lost) api.onMissing?.();   // older copies of the game files lack the furniture
    if (my !== scenery.n) return made.forEach(drop);
    for (const m of [...setPiece.children]) { setPiece.remove(m); drop(m); }
    for (const m of made) setPiece.add(m); scrollers = made.filter(m => m.userData.scroll); flowing = made.filter(m => m.userData.flow); perchY = perch; seatAt(); groundRects(); }
  // the ground each set piece stands on, in blocks, so no plant grows through a chair, a bed or a ladder wall
  function groundRects() { const box = new THREE.Box3(), rs = []; setPiece.updateMatrixWorld(true);
    for (const m of setPiece.children) { if (m.userData.flow || m.userData.volume) continue; box.setFromObject(m); if (box.isEmpty() || box.min.y > 40) continue; rs.push([box.min.x / BLOCK, box.min.z / BLOCK, box.max.x / BLOCK, box.max.z / BLOCK]); }
    if (world) { world.userData.avoid = rs; world.userData.relayout(); } else pendingRects = rs; }
  let pendingRects = [];
  // flying moves: the figure rises off the ground and bobs gently, easing up and down when the move changes
  function float(dt, now) { if (figure && perchY) seatAt(); for (const h of held) { if (anim.blend > 0.8 || now - (h.at || 0) > 600) h.shown = true; h.root.visible = !!h.shown; }   // a held thing shows once the hands have reached it, not swinging up from the feet
    if (!figure || (!hoverTo && !hoverAt)) return; hoverAt += (hoverTo - hoverAt) * (1 - Math.exp(-dt * 4)); if (Math.abs(hoverTo - hoverAt) < 0.05) hoverAt = hoverTo;
    seatAt(); if (hoverAt > 1 && hoverTo) figure.position.y += Math.sin(now / 1000 * 2.2) * 2.5 * Math.min(1, hoverAt / hoverTo); }
  // things held in the hands (a glider, a sword ...): each hangs on a bone of the figure and moves with it; re-hung when the figure is rebuilt
  // a held thing can sit a little away from where the move puts it (shift: [x, y, z] in model units in the scene, the figure faces +z, whatever the hand's turn)
  const dq = new THREE.Quaternion(), dv = new THREE.Vector3(), ds = new THREE.Vector3();
  // which side of the figure faces the camera (the figure faces +z): told to api.onFacing when it changes
  function facing() { if (!faceCb) return; const a = Math.atan2(cam.position.x - ctl.target.x, cam.position.z - ctl.target.z) * 180 / Math.PI;
    const f = Math.abs(a) <= 45 ? 'front' : Math.abs(a) >= 135 ? 'back' : a > 0 ? 'left side' : 'right side'; if (f !== faced) { faced = f; faceCb(f); } }
  function dropHeld() { for (const h of held) { const b = h.root.parent; if (!h.shift || !b) continue; b.updateWorldMatrix(true, false); b.getWorldQuaternion(dq).invert(); b.getWorldScale(ds);
    h.root.position.copy(dv.set(...h.shift).applyQuaternion(dq).divide(ds)); } }
  // the moves animate the held thing's own parts too (the glider's frame and flaps), so those parts join the figure's while it is held;
  // parts sharing a name with the body (the item's root is named after the hand's attachment) stay out, or the move would apply twice
  const unhang = () => { for (const h of held) { h.root.parent?.remove(h.root); const fp = h.on?.userData.parts; if (fp) for (const [k, g] of h.added || []) { const gs = fp.get(k); if (gs) { const i = gs.indexOf(g); if (i >= 0) gs.splice(i, 1); if (!gs.length) fp.delete(k); } } h.on = null; h.added = []; } };
  const hang = () => { unhang(); for (const h of held) { const b = figure?.userData.bones?.[h.bone]; if (!b) continue; b.add(h.root);
    if (h.root.children.length === 1) { const top = h.root.children[0]; top.position.set(0, 0, 0); top.userData.rest?.p.set(0, 0, 0); }   // as in game: the item's own root node sits ON the hand's attachment point (its offset in the file is ignored)
    const fp = figure.userData.parts; h.on = figure; h.added = [];
    h.root.userData.parts?.forEach((gs, k) => { if (fp.has(k) && !h.added.some(a => a[0] === k)) return; for (const g of gs) { (fp.get(k) || fp.set(k, []).get(k)).push(g); h.added.push([k, g]); } }); }
    anim.setFigure(figure); };
  function props(list) { unhang(); for (const h of held) dispose(h.root); held = list || []; for (const h of held) h.at = performance.now(); if (figure) hang(); }
  // a tall move (gliding, arms and glider high overhead): aim higher and back off so it all fits; lift(0) puts the view back
  let lifted = null;
  // camera moves glide (about 0.4 s) around the character instead of jumping; grabbing the view stops a glide
  const endGlide = () => { if (tw) stepCam(tw.at + 1e6); };   // jump a running glide to its end
  const glideCam = fn => { const t0 = ctl.target.clone(), p0 = cam.position.clone(); const r = fn(); const t1 = ctl.target.clone(), p1 = cam.position.clone();
    if (t0.distanceTo(t1) < 0.5 && p0.distanceTo(p1) < 0.5) return r;
    const s0 = new THREE.Spherical().setFromVector3(p0.clone().sub(t0)), s1 = new THREE.Spherical().setFromVector3(p1.clone().sub(t1)); let dth = s1.theta - s0.theta; dth = ((dth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    tw = { t0, t1, s0, s1, dth, at: performance.now() }; ctl.target.copy(t0); cam.position.copy(p0); ctl.update(); return r; };
  function lift(...a) { return glideCam(() => liftNow(...a)); }
  function liftNow(y, phi = 0, len = 360, z = 0) { const off = cam.position.clone().sub(ctl.target);   // phi: look down from at least this high (polar angle), to see into a bed
    if (y) { if (!lifted) lifted = { len: off.length(), phi: new THREE.Spherical().setFromVector3(off).phi }; off.setLength(len < 0 ? -len : Math.max(off.length(), len)); if (len < 0) { const sp = new THREE.Spherical().setFromVector3(off); sp.theta = 0; off.setFromSpherical(sp); } ctl.target.set(0, y, z);   // a negative len is an exact distance (close on the face)
      if (phi) { const sp = new THREE.Spherical().setFromVector3(off); sp.phi = Math.min(sp.phi, phi); off.setFromSpherical(sp); } }
    else if (lifted) { const sp = new THREE.Spherical().setFromVector3(off); sp.radius = lifted.len; sp.phi = Math.max(sp.phi, lifted.phi); off.setFromSpherical(sp); ctl.target.set(0, 62, 0); lifted = null; } else return;
    cam.position.copy(ctl.target).add(off); ctl.update(); }
  function mount(root, at) { endGlide(); return mountNow(root, at); }
  function mountNow(root, at) {
    const was = !!mountRoot; if (mountRoot) { scene.remove(mountRoot); dispose(mountRoot); }
    mountRoot = root || null; seat = root ? at : null; if (root) { scene.add(root); mountAnim.setFigure(root); } else { mountAnim.anim = null; mountAnim.figure = null; }
    seatAt();
    if (root) { const top = at[1] + 135, [b, , , h] = insets(), len = Math.min(700, (top + 40) * h / (2 * Math.tan(16 * Math.PI / 180) * (h - b)));   // rider and animal both in view: the rider's head is the seat plus a body
      ctl.maxDistance = Math.max(480, len); const off = cam.position.clone().sub(ctl.target).setLength(len), sp = new THREE.Spherical().setFromVector3(off); sp.theta = 0.9; sp.phi = Math.min(sp.phi, 1.3); off.setFromSpherical(sp); ctl.target.set(0, top / 2 + 4, 0); cam.position.copy(ctl.target).add(off); ctl.update(); }
    else if (was) { ctl.maxDistance = 480; const off = cam.position.clone().sub(ctl.target).setLength(fitLen()); ctl.target.set(0, 62, 0); cam.position.copy(ctl.target).add(off); ctl.update(); }
  }
  const fitLen = () => { const [b, r, w, h] = insets(), t = Math.tan(16 * Math.PI / 180), tall = 2 * Math.max(62, figTop - 62) + 26;   // far enough that the whole character (helmet and all) fits in the free part of the view
    return Math.min(470, Math.max(tall * h / (2 * t * (h - b)), 48 * h / (t * (w - r)))); };
  const refit = () => glideCam(refitNow);
  const refitNow = () => { if (!autoFit || lifted || mountRoot) return; const off = cam.position.clone().sub(ctl.target); off.setLength(fitLen()); cam.position.copy(ctl.target).add(off); ctl.update(); };
  let grabbed = null; ctl.addEventListener('start', () => { tw = null; grabbed = cam.position.clone(); }); ctl.addEventListener('end', () => { if (grabbed && cam.position.distanceTo(grabbed) > 2) autoFit = false; grabbed = null; });   // once the player really zooms or turns the view, it stays theirs (a click is not a turn)
  const api = { inset: (px, right = 0) => { px = Math.max(0, Math.round(px || 0)); right = Math.max(0, Math.round(right || 0)); if (px !== inset || right !== insetR) { inset = px; insetR = right; fit(); refit(); } }, plantClear: r => { plantClear = r || 0; }, isolate: img => { isoImage = img || null; applyIsolate(); drawHL(); }, anim, mountAnim, mount, props, lift, scenery, onFacing: cb => { faceCb = cb; faced = ''; }, wall: v => { wallOn = v || null; }, hover: h => { hoverTo = Math.max(0, h || 0); }, pick, pickMesh, paintMode, gizmo, cursor, afterShow: null,
    gizmoBusy: () => tc.dragging || tc.axis !== null,
    // where a click lands on a box: the point and the face's outward direction, in the box's own part (node) space
    pickHit(cx, cy, keep) { if (!figure) return null; aim(cx, cy); for (const h of ray.intersectObject(figure, true)) if (h.object.visible && keep(h.object)) {
      const g = h.object.parent, point = g.worldToLocal(h.point.clone()), geo = h.object.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
      const normal = h.face ? h.face.normal.clone() : new THREE.Vector3(0, 0, 1); if (normal.dot(point.clone().sub(geo.boundingBox.getCenter(new THREE.Vector3()))) < 0) normal.negate();   // always outward
      return { mesh: h.object, point, normal }; } return null; },
    // drag a box itself: it slides flat to the screen; move() gives the shift in the box's own axes, like the gizmo
    boxDrag(mesh, cx, cy) { const g = mesh.parent; g.updateMatrixWorld(true); aim(cx, cy); const hit = ray.intersectObject(mesh, false)[0]; if (!hit) return null;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cam.getWorldDirection(new THREE.Vector3()), hit.point), start = hit.point.clone(), q = g.getWorldQuaternion(new THREE.Quaternion()).invert(), s = g.getWorldScale(new THREE.Vector3()), p0 = mesh.position.clone(); ctl.enabled = false;
      return { move(x, y) { aim(x, y); const p = ray.ray.intersectPlane(plane, new THREE.Vector3()); if (!p) return null; const d = p.sub(start).applyQuaternion(q).divide(s); mesh.position.copy(p0).add(d); return d; },
        end() { ctl.enabled = true; mesh.position.copy(p0); } }; },
    zoomBy(k) { autoFit = false; const off = cam.position.clone().sub(ctl.target), len = Math.max(ctl.minDistance, Math.min(ctl.maxDistance, off.length() * k)); cam.position.copy(ctl.target).add(off.setLength(len)); ctl.update(); },
    frameOn(img) {   // turn the view on the parts painted with this texture, close enough to fill the view
      if (!figure || !img) return; const box = new THREE.Box3(); figure.updateMatrixWorld(true);
      figure.traverse(o => { if (o.isMesh && (o.userData.realMat || o.material)?.map?.image === img) box.expandByObject(o); }); if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3()), r = Math.max(14, box.getSize(new THREE.Vector3()).length() / 2), dir = cam.position.clone().sub(ctl.target).normalize();
      ctl.target.copy(c); const half = Math.min(cam.fov * Math.PI / 360, Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect));   // the narrower of the two view angles
      cam.position.copy(c).add(dir.multiplyScalar(Math.min(ctl.maxDistance, Math.max(ctl.minDistance, r / Math.sin(half) * 1.1)))); ctl.update(); },
    orbit(dx, dy) { const off = cam.position.clone().sub(ctl.target), s = new THREE.Spherical().setFromVector3(off); const k = 2 * Math.PI / Math.max(1, canvas.clientHeight); s.theta -= dx * k; s.phi = Math.max(0.05, Math.min(Math.PI - 0.05, s.phi - dy * k)); off.setFromSpherical(s); cam.position.copy(ctl.target).add(off); ctl.update(); },
    findMesh(keep) { let hit = null; figure?.traverse(o => { if (!hit && o.isMesh && keep(o)) hit = o; }); return hit; },
    setView(name) { const v = VIEWS[name] || VIEWS.persp; cam.position.set(...v); ctl.target.set(0, 62, 0); ctl.update(); },
    highlight(f) { hl = f; drawHL(); },
    show(root) { if (figure) { unhang(); scene.remove(figure); dispose(figure); } figure = root; scene.add(root); { const y = new THREE.Box3().setFromObject(root).max.y; if (isFinite(y) && Math.abs(y - figTop) > 4) { figTop = Math.max(120, Math.min(220, y)); refit(); } } seatAt(); anim.setFigure(root); hang(); lit = []; applyIsolate(); drawHL(); if (api.afterShow) api.afterShow(); },
    view(front) { return glideCam(() => api.viewNow(front)); },
    viewNow(front) { const off = new THREE.Vector3(front ? 0 : -75, 33, front ? 265 : 255);   // during a tall move (gliding, flying, climbing) keep its raised aim and distance
      if (lifted) off.setLength(Math.max(off.length(), 360)); else { ctl.target.set(0, 62, 0); off.setLength(fitLen()); autoFit = true; } cam.position.copy(ctl.target).add(off); ctl.update(); },
    behind() { endGlide(); return api.behindNow(); },
    behindNow() { if (cam.position.z - ctl.target.z < 0) return; const off = cam.position.clone().sub(ctl.target); off.x = -off.x; off.z = -off.z; cam.position.copy(ctl.target).add(off); ctl.update(); } };   // a climb is watched from behind, as in the game
  // ---- in-game backgrounds: a sky dome from the zone's sky and fog colours, and a floor of its ground blocks fading into that fog
  const shadow = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.6, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  // bd: { top, fog } colours from the zone's weather at noon, sc: its entry in SCENES, tint: the biome's grass colour
  api.world = () => world; api.camera = cam; api.orbit = (az, el, dist) => { const t = ctl.target; cam.position.set(t.x + Math.sin(az) * Math.cos(el) * dist, t.y + Math.sin(el) * dist, t.z + Math.cos(az) * Math.cos(el) * dist); ctl.update(); };   // for tests
  api.setBackdrop = async (bd, sc, tint) => { const my = (api.setBackdrop.n = (api.setBackdrop.n || 0) + 1);
    let built = null; if (bd) try { built = await buildWorld(sc, tint); } catch (e) { console.warn('scene', e); if (my === api.setBackdrop.n) throw new Error('scene files missing'); return; }   // the caller says what is missing
    if (my !== api.setBackdrop.n) { if (built) disposeTree(built); return; }
    if (sky) { scene.remove(sky); sky.geometry.dispose(); sky.material.dispose(); sky = null; }
    if (world) { scene.remove(world); disposeTree(world); world = null; } scene.fog = null;
    disc.material.map = bd ? shadow : null; disc.material.color.set(bd ? 0xffffff : 0x0b1626); disc.material.opacity = bd ? 1 : 0.55; disc.material.needsUpdate = true; disc.position.y = bd ? 0.9 : -0.2;   // the shadow above the sliding floor
    ctl.maxPolarAngle = Math.PI * (bd ? 0.47 : 0.55); ctl.update();   // on real land the camera stays above the ground
    if (!bd) return;
    const top = new THREE.Color(bd.top), hor = new THREE.Color(bd.fog), R = 2600, g = new THREE.SphereGeometry(R, 48, 24), p = g.attributes.position, cols = [];
    for (let i = 0; i < p.count; i++) { const c = hor.clone().lerp(top, Math.pow(Math.max(0, p.getY(i) / R), 0.5)); cols.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -2; scene.add(sky);
    if (built) { world = built; scene.add(world); world.userData.avoid = pendingRects; groundRects(); }
    scene.fog = new THREE.Fog(hor, FOG[0], FOG[1]); mist = null;   // the far edge of the land melts into the sky, as the game's fog does
  };
  return api;
}
let TR, tscene, tcam;
// [look-at height, half size, sideways camera offset, camera height above the target]
const FRAME = { head: [112, 36, -120, 40], face: [112, 24, -55, 12], ear: [114, 32, -170, 14], hat: [118, 34, -110, 70],
  pants: [34, 36, -110, 10], socks: [22, 30, -130, 8], shoes: [10, 22, -150, 34], gloves: [52, 18, -130, 12, -22], hips: [44, 28, -120, 20], top: [76, 34, -110, 30], legs: [30, 34, -120, 40], body: [64, 70, -120, 40], torso: [74, 36, -120, 40], full: [66, 76, -120, 40] };
export function snapshot(root, frame = 'full', back = false, px = 128) {   // a square picture of a built figure (128 px unless asked), as a data URL
  if (!TR) { TR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    tscene = new THREE.Scene(); lights(tscene); tcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000); }
  const [cy, h, sx, up, tx = 0] = FRAME[frame] || FRAME.full, s = back ? -1 : 1;
  tcam.left = -h; tcam.right = h; tcam.top = h; tcam.bottom = -h; tcam.updateProjectionMatrix(); tcam.position.set(sx * s + tx, cy + up, 300 * s); tcam.lookAt(tx, cy, 0);
  TR.setSize(px, px); tscene.add(root); TR.render(tscene, tcam); tscene.remove(root); dispose(root);
  return TR.domElement.toDataURL();
}
