// Builds the character in 3D from the game's own model and texture files, and plays the game's own animations on it.
import * as THREE from '../vendor/three.module.min.js';
import { TransformControls } from '../vendor/TransformControls.js';
import * as game from './game.js';
import { FIELDS } from './game.js';

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
  const mat = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.05, side: THREE.DoubleSide });
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
  const walk = n => { const sh = n.shape || {};
    if ((sh.type === 'box' || sh.type === 'quad') && sh.visible !== false) { const size = xyz(sh.settings?.size), lay = sh.textureLayout || {};
      for (const [name, [, , ua, , va]] of Object.entries(sh.type === 'quad' ? { front: FACES.front } : FACES)) {
        const fl = lay[name]; if (!fl) continue; const fu = size[ua], fv = size[va]; if (fu <= 0 || fv <= 0) continue;
        const ox = fl.offset?.x ?? 0, oy = fl.offset?.y ?? 0, a = ((fl.angle | 0) % 360 + 360) % 360, xs = [], ys = [];
        for (const [su, sv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const pu = su * fu * (fl.mirror?.x ? -1 : 1), pv = sv * fv * (fl.mirror?.y ? -1 : 1);
          const [X, Y] = a === 90 ? [ox - pv, oy + pu] : a === 180 ? [ox - pu, oy - pv] : a === 270 ? [ox + pv, oy - pu] : [ox + pu, oy + pv]; xs.push(X); ys.push(Y); }
        out.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), face: name, node: n.name }); } }
    for (const c of n.children || []) walk(c); };
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
  root.userData.parts = parts; return root;
}
// an animal (or any model with attachments) built the same way, for the Mount moves
export async function buildCreature(cfg) {
  const m = await game.json(game.common(cfg.model)), T = await texture(cfg.tex), root = new THREE.Group(), bones = {}, parts = new Map();
  for (const n of m.nodes) root.add(node(n, T, bones, parts));
  for (const a of cfg.atts || []) { try { attach((await game.json(game.common(a.model))).nodes, await texture(a.tex), bones, parts); } catch (e) { console.warn(a.model, e.message); } }
  root.userData.parts = parts; return root;
}
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
  setFigure(root) { this.figure = root; this.blend = 1; this.apply(); }
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

// ---- the stage (main view) and a small off-screen renderer for thumbnails
function lights(scene) { scene.add(new THREE.AmbientLight(0xffffff, 1.7)); const l = new THREE.DirectionalLight(0xfff4e0, 1.9); l.position.set(-60, 160, 120); scene.add(l); }
export function stage(canvas, Controls) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene(); lights(scene);
  const cam = new THREE.PerspectiveCamera(32, 1, 1, 2000); cam.position.set(-75, 95, 255);
  const ctl = new Controls(cam, canvas); ctl.target.set(0, 62, 0); ctl.enablePan = false; ctl.zoomToCursor = false;   // zoom stays on the figure's centre, lined up with the buttons under it
  ctl.minDistance = 40; ctl.maxDistance = 480; ctl.maxPolarAngle = Math.PI * 0.55; ctl.update();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(58, 48), new THREE.MeshBasicMaterial({ color: 0x0b1626, transparent: true, opacity: 0.55 })); disc.rotation.x = -Math.PI / 2; disc.position.y = -0.2; scene.add(disc);
  const CELL = 32, grid = new THREE.GridHelper(CELL * 40, 40, 0x4a76ad, 0x33557f); grid.material.transparent = true; grid.material.opacity = 0; grid.material.depthWrite = false; scene.add(grid);
  const vel = new THREE.Vector2(), want = new THREE.Vector2();
  function travel(dt) { const v = anim.velocity; want.set(v ? v[0] : 0, v ? v[1] : 0); vel.lerp(want, 1 - Math.exp(-dt * 9));
    grid.position.x = (grid.position.x - vel.x * dt) % CELL; grid.position.z = (grid.position.z - vel.y * dt) % CELL;   // the ground runs backwards under the figure
    grid.material.opacity += ((anim.move && anim.anim ? 0.5 : 0) - grid.material.opacity) * (1 - Math.exp(-dt * 6)); grid.visible = grid.material.opacity > 0.01; }
  let hl = null, helpers = [];   // outlines around picked boxes (see drawHL)
  const anim = new Animator(), mountAnim = new Animator(); let figure = null, last = performance.now(), mountRoot = null, seat = null, hoverTo = 0, hoverAt = 0;
  function fit() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  new ResizeObserver(fit).observe(canvas); fit();
  (function loop(now) { requestAnimationFrame(loop); const dt = Math.min(0.1, (now - last) / 1000 || 0); anim.update(dt); mountAnim.playing = anim.playing; mountAnim.update(dt); travel(dt); float(dt, now); for (const h of helpers) h.update(); last = now; renderer.render(scene, cam); })(last);
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
  function paintMode(on) { ctl.maxPolarAngle = on ? Math.PI * 0.97 : Math.PI * 0.55; ctl.mouseButtons.LEFT = on ? -1 : THREE.MOUSE.ROTATE; ctl.mouseButtons.RIGHT = THREE.MOUSE.ROTATE; ctl.touches.ONE = on ? -1 : THREE.TOUCH.ROTATE; canvas.style.cursor = on ? 'crosshair' : ''; }
  // the box under a screen point (first hit that passes the filter), and outlines around the boxes a filter picks
  // the picked box glows (its own copy of the material, lit gold) as well as getting an outline
  let lit = []; const glow = new Map();
  function drawHL() { for (const h of helpers) { scene.remove(h); h.geometry.dispose(); } helpers = []; for (const m of lit) if (m.userData.baseMat) { m.material = m.userData.baseMat; delete m.userData.baseMat; } lit = []; if (!hl || !figure) return;
    figure.updateMatrixWorld(true); figure.traverse(o => { if (o.isMesh && o.visible && hl(o)) { const h = new THREE.BoxHelper(o, 0xf4c452); h.material.depthTest = false; h.renderOrder = 10; helpers.push(h); scene.add(h);
      const base = o.material; if (!glow.has(base)) { const g = base.clone(); g.emissive = new THREE.Color(0x6a4a08); glow.set(base, g); } o.userData.baseMat = base; o.material = glow.get(base); lit.push(o); } }); }
  // the item being edited stands out: every other part of the character turns into a faint see-through mannequin
  const ghost = new THREE.MeshLambertMaterial({ color: 0xa9bfd6, transparent: true, opacity: 0.14, depthWrite: false }); let isoImage = null;
  function applyIsolate() { figure?.traverse(o => { if (!o.isMesh) return; const real = o.userData.realMat || o.material, keep = !isoImage || real?.map?.image === isoImage;
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
  const seatAt = () => { if (figure) figure.position.set(0, (seat ? seat[1] : 0) + hoverAt, seat ? seat[2] : 0); };
  // flying moves: the figure rises off the ground and bobs gently, easing up and down when the move changes
  function float(dt, now) { if (!figure || (!hoverTo && !hoverAt)) return; hoverAt += (hoverTo - hoverAt) * (1 - Math.exp(-dt * 4)); if (Math.abs(hoverTo - hoverAt) < 0.05) hoverAt = hoverTo;
    seatAt(); if (hoverAt > 1 && hoverTo) figure.position.y += Math.sin(now / 1000 * 2.2) * 2.5 * Math.min(1, hoverAt / hoverTo); }
  function mount(root, at) {
    const was = !!mountRoot; if (mountRoot) { scene.remove(mountRoot); dispose(mountRoot); }
    mountRoot = root || null; seat = root ? at : null; if (root) { scene.add(root); mountAnim.setFigure(root); } else { mountAnim.anim = null; mountAnim.figure = null; }
    seatAt();
    if (was !== !!root) { const k = root ? 1.6 : 1 / 1.6, ty = root ? 62 + at[1] * 0.7 : 62, off = cam.position.clone().sub(ctl.target).multiplyScalar(k);
      ctl.target.set(0, ty, 0); cam.position.copy(ctl.target).add(off); ctl.update(); }
  }
  const api = { isolate: img => { isoImage = img || null; applyIsolate(); drawHL(); }, anim, mountAnim, mount, hover: h => { hoverTo = Math.max(0, h || 0); }, pick, pickMesh, paintMode, gizmo, cursor, afterShow: null,
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
    zoomBy(k) { const off = cam.position.clone().sub(ctl.target), len = Math.max(ctl.minDistance, Math.min(ctl.maxDistance, off.length() * k)); cam.position.copy(ctl.target).add(off.setLength(len)); ctl.update(); },
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
    show(root) { if (figure) { scene.remove(figure); dispose(figure); } figure = root; scene.add(root); seatAt(); anim.setFigure(root); lit = []; applyIsolate(); drawHL(); if (api.afterShow) api.afterShow(); },
    view(front) { cam.position.set(front ? 0 : -75, 95, front ? 265 : 255); ctl.target.set(0, 62, 0); ctl.update(); } };
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
