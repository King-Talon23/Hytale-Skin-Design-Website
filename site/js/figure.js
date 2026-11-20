// Builds the character in 3D from the game's own model and texture files, and plays the game's own animations on it.
import * as THREE from '../vendor/three.module.min.js';
import * as game from './game.js';
import { FIELDS } from './game.js';

const cache = new Map(), once = (k, f) => cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k));
export const clearCache = () => cache.clear();
// a custom asset's texture comes from the asset creator (the live canvas while it is being painted), not from the game files
let customSource = null; export const setCustomSource = f => { customSource = f; };
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
  return { mat: new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.05, side: THREE.DoubleSide }), w: c.width, h: c.height };
});

// ---- a blockymodel box/quad as a mesh
const FACES = { front: [2, 1, 0, 1, 1, -1], back: [2, -1, 0, -1, 1, -1], right: [0, 1, 2, -1, 1, -1], left: [0, -1, 2, 1, 1, -1], top: [1, 1, 0, 1, 2, -1], bottom: [1, -1, 0, 1, 2, 1] };
const S = 0.7071068, QUADROT = { '+Z': [0, 0, 0, 1], '-Z': [0, 1, 0, 0], '+Y': [-S, 0, 0, S], '-Y': [S, 0, 0, S], '+X': [0, S, 0, S], '-X': [0, -S, 0, S] };
const xyz = (o, d = 0) => [o?.x ?? d, o?.y ?? d, o?.z ?? d];
function shapeMesh(sh, T) {
  const size = xyz(sh.settings?.size), st = xyz(sh.stretch, 1), off = xyz(sh.offset), half = size.map(v => v / 2), quad = sh.type === 'quad'; if (quad) half[2] = 0;
  const qr = new THREE.Quaternion(...(quad ? QUADROT[sh.settings?.normal] || QUADROT['+Z'] : QUADROT['+Z'])), lay = sh.textureLayout || {}, pos = [], uv = [], idx = [];
  for (const [name, [na, ns, ua, us, va, vs]] of Object.entries(quad ? { front: FACES.front } : FACES)) {
    const fl = lay[name]; if (!fl) continue; const fu = size[ua], fv = size[va]; if (fu <= 0 || fv <= 0) continue;
    const ox = fl.offset?.x ?? 0, oy = fl.offset?.y ?? 0, a = ((fl.angle | 0) % 360 + 360) % 360, b = pos.length / 3;
    for (const [su, sv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const g = [0, 0, 0]; g[na] = ns * half[na]; g[ua] = us * (su - 0.5) * size[ua]; g[va] = vs * (sv - 0.5) * size[va];
      const v = new THREE.Vector3(...g).applyQuaternion(qr); pos.push(v.x * st[0] + off[0], v.y * st[1] + off[1], v.z * st[2] + off[2]);
      // mirrored (that axis runs back from the offset), then turned about the offset by the angle
      const pu = su * fu * (fl.mirror?.x ? -1 : 1), pv = sv * fv * (fl.mirror?.y ? -1 : 1);
      const [X, Y] = a === 90 ? [ox - pv, oy + pu] : a === 180 ? [ox - pu, oy - pv] : a === 270 ? [ox + pv, oy - pu] : [ox + pu, oy + pv];
      uv.push(X / T.w, 1 - Y / T.h);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, T.mat);
}
// a node: its pivot group, its own shape, and a child holder at the shape's offset (children hang from pivot + offset)
function node(n, T, bones, parts) {
  const g = new THREE.Group(); g.position.set(...xyz(n.position)); const o = n.orientation; if (o) g.quaternion.set(o.x ?? 0, o.y ?? 0, o.z ?? 0, o.w ?? 1);
  const sh = n.shape || {}; if ((sh.type === 'box' || sh.type === 'quad') && sh.visible !== false) { const m = shapeMesh(sh, T); if (m) { g.add(m); g.userData.mesh = m; } }
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
  const loaded = (await Promise.all(list.map(async ([f, r]) => { try { return [f, await game.json(game.common(r.model)), await texture(r.tex, r.tint)]; } catch (e) { console.warn(f, e.message); return null; } }))).filter(Boolean);
  const root = new THREE.Group(), bones = {}, parts = new Map(), body = loaded.find(l => l[0] === 'bodyCharacteristic');
  if (!body) throw new Error('the body model is missing from the game files');
  for (const n of body[1].nodes) root.add(node(n, body[2], bones, parts));
  for (const [f, m, T] of loaded) if (f !== 'bodyCharacteristic') attach(m.nodes, T, bones, parts);
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
  const ctl = new Controls(cam, canvas); ctl.target.set(0, 62, 0); ctl.enablePan = false; ctl.minDistance = 90; ctl.maxDistance = 480; ctl.maxPolarAngle = Math.PI * 0.55; ctl.update();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(58, 48), new THREE.MeshBasicMaterial({ color: 0x0b1626, transparent: true, opacity: 0.55 })); disc.rotation.x = -Math.PI / 2; disc.position.y = -0.2; scene.add(disc);
  const CELL = 32, grid = new THREE.GridHelper(CELL * 40, 40, 0x4a76ad, 0x33557f); grid.material.transparent = true; grid.material.opacity = 0; grid.material.depthWrite = false; scene.add(grid);
  const vel = new THREE.Vector2(), want = new THREE.Vector2();
  function travel(dt) { const v = anim.velocity; want.set(v ? v[0] : 0, v ? v[1] : 0); vel.lerp(want, 1 - Math.exp(-dt * 9));
    grid.position.x = (grid.position.x - vel.x * dt) % CELL; grid.position.z = (grid.position.z - vel.y * dt) % CELL;   // the ground runs backwards under the figure
    grid.material.opacity += ((anim.move && anim.anim ? 0.5 : 0) - grid.material.opacity) * (1 - Math.exp(-dt * 6)); grid.visible = grid.material.opacity > 0.01; }
  const anim = new Animator(); let figure = null, last = performance.now();
  function fit() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  new ResizeObserver(fit).observe(canvas); fit();
  (function loop(now) { requestAnimationFrame(loop); const dt = Math.min(0.1, (now - last) / 1000 || 0); anim.update(dt); travel(dt); last = now; renderer.render(scene, cam); })(last);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  // the texel of `image` under a screen point, for painting straight on the model
  function texel(image) { for (const h of ray.intersectObject(figure, true)) { if (!h.uv || !h.object.visible || h.object.material?.map?.image !== image) continue;
      return { x: Math.min(image.width - 1, Math.max(0, Math.floor(h.uv.x * image.width))), y: Math.min(image.height - 1, Math.max(0, Math.floor((1 - h.uv.y) * image.height))) }; }
    return null; }
  function pick(cx, cy, image, mirror) { if (!figure) return null; const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam);
    const p = texel(image); if (!p || !mirror) return p;
    ray.ray.origin.x *= -1; ray.ray.direction.x *= -1; p.m = texel(image); return p; }   // the same ray flipped left to right lands on the matching spot of the other side
  // while painting, the left button paints and the right button turns the view
  function paintMode(on) { ctl.mouseButtons.LEFT = on ? -1 : THREE.MOUSE.ROTATE; ctl.mouseButtons.RIGHT = THREE.MOUSE.ROTATE; ctl.touches.ONE = on ? -1 : THREE.TOUCH.ROTATE; canvas.style.cursor = on ? 'crosshair' : ''; }
  return { anim, pick, paintMode, show(root) { if (figure) { scene.remove(figure); dispose(figure); } figure = root; scene.add(root); anim.setFigure(root); },
    view(front) { cam.position.set(front ? 0 : -75, 95, front ? 265 : 255); ctl.target.set(0, 62, 0); ctl.update(); } };
}
let TR, tscene, tcam;
const FRAME = { head: [112, 36], legs: [30, 34], body: [64, 70], torso: [74, 36], full: [66, 76] };
export function snapshot(root, frame = 'full', back = false) {   // a 128 px picture of a built figure, as a data URL
  if (!TR) { TR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); TR.setSize(128, 128);
    tscene = new THREE.Scene(); lights(tscene); tcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000); }
  const [cy, h] = FRAME[frame] || FRAME.full, s = back ? -1 : 1;
  tcam.left = -h; tcam.right = h; tcam.top = h; tcam.bottom = -h; tcam.updateProjectionMatrix(); tcam.position.set(-120 * s, cy + 40, 300 * s); tcam.lookAt(0, cy, 0);
  tscene.add(root); TR.render(tscene, tcam); tscene.remove(root); dispose(root);
  return TR.domElement.toDataURL();
}
