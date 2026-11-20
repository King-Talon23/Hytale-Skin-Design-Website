import { OrbitControls } from '../vendor/OrbitControls.js';
import * as game from './game.js';
import * as db from './db.js';
import * as fig from './figure.js';
import * as store from './store.js';
import * as auth from './auth.js';
import * as assets from './assets.js';
import { createPainter, SHAPES, ONCE } from './paint.js';
import { icon as catIcon } from './icons.js';
import { SUPPORT_URL, MOD_URL } from './config.js';
const modLink = cls => /^https:\/\/(www\.)?curseforge\.com\/hytale\/[a-z-]+\/[a-z0-9-]{2,80}$/.test(MOD_URL) ? el('a', { class: 'btn ' + cls, href: MOD_URL, target: '_blank', rel: 'noopener noreferrer', text: 'Get the mod' }) : null;
// the footer's support link: only a Ko-fi page, and only when one is set
if (/^https:\/\/ko-fi\.com\/[A-Za-z0-9_]{2,60}$/.test(SUPPORT_URL)) { const a = document.getElementById('support'); if (a) { a.href = SUPPORT_URL; a.hidden = false; document.getElementById('supportdot').hidden = false; } }
import { rules, sanitize, cleanName, parse, nice, LABEL, GROUPS, REQUIRED } from './skin.js';

const $ = id => document.getElementById(id);
// Every element is made here with textContent and properties: no HTML strings anywhere, so nothing typed, imported or looked up can inject markup.
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (v == null) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'data') Object.assign(e.dataset, v); else e[k] = v; }
  e.append(...kids.flat(Infinity).filter(k => k != null && k !== false)); return e;
}
const VERSION = '0.1.0', REPO = 'https://github.com/King-Talon23/Hytale-Skin-Design-Website';
const HEX = /^#[0-9a-fA-F]{3,8}$/;
const store_ = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } } };
const say = (t, bad) => { const s = $('status'); s.textContent = t || ''; s.classList.toggle('bad', !!bad); clearTimeout(say.t); if (t) say.t = setTimeout(() => s.textContent = '', bad ? 8000 : 4000); };

// ---------------------------------------------------------------- dialogs
function ask(title, body, buttons) {
  const d = $('dlg'); $('dlgtitle').textContent = title; $('dlgbody').replaceChildren(...[].concat(body));
  $('dlgbtns').replaceChildren(...buttons.map(b => el('button', { class: 'btn ' + (b.primary ? 'primary' : b.danger ? 'danger' : 'ghost'), value: b.value, text: b.label })));
  return new Promise(ok => { d.onclose = () => ok(d.returnValue || ''); d.returnValue = ''; d.showModal(); });
}
const confirmBox = (title, text, yes, danger) => ask(title, el('p', { text }), [{ label: 'Cancel', value: '' }, { label: yes, value: 'yes', primary: !danger, danger }]).then(v => v === 'yes');
function download(name, data) { const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
async function readJsonFile(file, max = 2_000_000) { if (file.size > max) throw new Error('That file is too large.'); return JSON.parse(await file.text()); }

// ---------------------------------------------------------------- connect screen
const PATHS = { win: '%APPDATA%\\Hytale\\install\\release\\package\\game\\latest', mac: '~/Library/Application Support/Hytale/install/release/package/game/latest', linux: '~/.local/share/Hytale/install/release/package/game/latest' };
function showConnect() {
  $('app').hidden = true; $('connect').hidden = false; setConn(null);
  const os = /Mac/i.test(navigator.platform) ? 'mac' : /Linux/i.test(navigator.platform) ? 'linux' : 'win';
  const pick = o => { $('path').textContent = PATHS[o]; for (const b of $('os').children) b.classList.toggle('on', b.dataset.os === o); };
  for (const b of $('os').children) b.onclick = () => pick(b.dataset.os); pick(os);
  $('copypath').onclick = async () => { try { await navigator.clipboard.writeText($('path').textContent); $('copypath').textContent = 'Copied'; } catch { $('copypath').textContent = 'Select and copy it'; } setTimeout(() => $('copypath').textContent = 'Copy path', 1800); };
  $('zipfile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) doConnect(() => game.connect(f, progress)); };
}
function progress(p) { const b = $('progress'); b.hidden = false; b.firstElementChild.style.width = Math.round(p * 100) + '%'; b.lastElementChild.textContent = p < 1 ? `Reading your game files… ${Math.round(p * 100)}%` : 'Done'; }
let connecting = false;
async function doConnect(run) {
  if (connecting) return; connecting = true; $('connerr').textContent = ''; $('app').hidden = true; $('connect').hidden = false; progress(0);
  try { await run(); fig.clearCache(); await startApp(); }
  catch (e) { console.error(e); $('progress').hidden = true; $('connerr').textContent = (e && e.message) || 'Could not read that file.'; }
  connecting = false;
}
addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); $('drop').hidden = false; } });
addEventListener('dragleave', e => { if (!e.relatedTarget) $('drop').hidden = true; });
addEventListener('drop', e => { e.preventDefault(); $('drop').hidden = true; const fs = [...e.dataTransfer.files]; if (!fs.length) return;
  const zip = fs.find(f => /\.zip$/i.test(f.name)); if (zip) return doConnect(() => game.connect(zip, progress));
  if (R) importSkinFiles(fs); });
function setConn(meta) { const c = $('conn'); c.classList.toggle('ok', !!meta); c.lastElementChild.textContent = meta ? 'Game files connected' : 'Not connected'; c.onclick = () => meta ? setTab('help') : showConnect(); }

// ---------------------------------------------------------------- app state
let CAT, R, st, META, tab = 'editor', group = 'Head', slot = 'haircut', filter = '';
let cur = { id: null, kind: null, slot: null, name: '', skin: null }, hist = [], hpos = -1, dirty = false, WARD = { game: [], custom: [] };
let FOLDER = { state: 'none' }, ACCOUNT = null, SHOWGAME = false;
let found = [];   // skins brought in this session by a lookup or from files; not saved until the player saves them

async function startApp() {
  META = await game.status(); CAT = await game.catalog(); R = rules(CAT); setConn(META); ASSETS = await assets.list().catch(() => []); registerAssets(); await loadLock(); await loadEmotes(); SHOWGAME = !!(await db.get('meta', 'showInGame').catch(() => false));
  $('connect').hidden = true; $('app').hidden = false;
  if (!st) { st = fig.stage($('view'), OrbitControls); bindPaint($('view'), e => ED && !ED.shapeOpen && ED.painter.tool !== 'select' ? st.pick(e.clientX, e.clientY, ED.canvas, ED.mirror) : null, 10, true);
    $('view').addEventListener('pointermove', e => { if (!ED) return; const p = ED.shapeOpen || ED.painter.tool === 'select' ? st.cursor(null) : st.cursor(e.clientX, e.clientY, ED.canvas, brushSize(), ED.mirror);
      ED.hover = p; ED.hoverM = p?.m || null; drawOvl(); });
    $('view').addEventListener('pointerleave', () => { if (!ED) return; st.cursor(null); ED.hover = ED.hoverM = null; drawOvl(); });
    st.afterShow = () => { outlineBox(); placeGizmo(); if (ED && ED.frame) { ED.frame = false; st.frameOn(ED.canvas); } };
    $('view').addEventListener('pointerdown', e => { if (!ED || !ED.shapeOpen || e.button !== 0 || st.gizmoBusy()) return;
      const hit = st.pickMesh(e.clientX, e.clientY, o => o.material?.map?.image === ED.canvas); if (!hit) return;
      const k = boxesOf(ED.model).findIndex(b => b.node.name === hit.userData.nodeName); if (k >= 0 && k !== ED.box) { ED.box = k; render(); placeGizmo(); } }); }
  try { if (await store.resumeFolder(false)) await reloadAssets(); } catch (e) { console.warn(e); }
  FOLDER = await store.folderState(); WARD = await store.list(); ACCOUNT = await auth.account().catch(() => null); await loadPub();
  const draft = await db.get('meta', 'draft'), ds = sanitize(draft?.skin);
  cur = ds ? { id: draft.id || null, kind: draft.kind || null, slot: draft.slot ?? null, name: cleanName(draft.name), skin: R.fit(ds) } : { id: null, kind: null, slot: null, name: '', skin: R.blank() };
  if (cur.id && ![...WARD.game, ...WARD.custom].some(r => r && r.id === cur.id)) { cur.id = null; cur.kind = null; }
  hist = [JSON.stringify(cur.skin)]; hpos = 0; dirty = false;
  playAnim('Default', 'Idle', 0.5); render(); rebuild(); pushWearing();
}
function open(rec, asNew, look) {   // put a skin on the stage: a wardrobe record, or a found skin (asNew); look = just looking (not sent to the game)
  flush();
  cur = asNew ? { id: null, kind: null, slot: null, name: cleanName(rec.name), skin: R.fit(rec.skin) } : { id: rec.id, kind: rec.kind, slot: rec.slot ?? null, name: rec.name, skin: R.fit(rec.skin) };
  hist = [JSON.stringify(cur.skin)]; hpos = 0; dirty = !!asNew; keepDraft(); rebuild(); plate(); if (!look) pushWearing();
}
function setSkin(s) { cur.skin = s; autosave(); pushWearing(); hist = hist.slice(0, hpos + 1); hist.push(JSON.stringify(s)); if (hist.length > 200) hist.shift(); hpos = hist.length - 1; dirty = true; keepDraft(); rebuild(); render(); }
function step(d) { const p = hpos + d; if (p < 0 || p >= hist.length) return; hpos = p; cur.skin = JSON.parse(hist[p]); dirty = true; autosave(); pushWearing(); keepDraft(); rebuild(); render(); }
// the companion mod dresses you in game from "<skins folder>/Wearing.json"
function pushWearing() { clearTimeout(pushWearing.t); pushWearing.t = setTimeout(async () => {
  if (FOLDER.state !== 'on') return;
  try { await store.writeWearing(SHOWGAME ? { on: true, name: cur.name || 'New skin', keepOwn: store.keepOwnOf(cur.skin), skin: cur.skin } : { on: false }); } catch (e) { console.warn(e); } }, 400); }
function drawGameSwitch() { const b = $('ingame'); if (!b) return; b.hidden = FOLDER.state !== 'on'; b.classList.toggle('primary', SHOWGAME); b.classList.toggle('ghost', !SHOWGAME);
  b.textContent = SHOWGAME ? 'In game: on' : 'In game: off'; b.title = SHOWGAME ? 'Your character in your own worlds wears this (Skin Editor Sync mod)' : 'Show this skin on your character in your own worlds (needs the Skin Editor Sync mod)'; }
const persist = c => c.kind === 'game' ? store.saveGame(c.slot, c.name, c.skin) : store.saveCustom(c.name, c.skin, c.id);
function autosave() { if (!cur.id) return; clearTimeout(autosave.t); autosave.t = setTimeout(flush, 700); }   // a saved skin saves itself as it changes
async function flush() { clearTimeout(autosave.t); if (!cur.id || !dirty) return; const c = { ...cur };
  try { await persist(c); WARD = await store.list(); if (cur.id === c.id && JSON.stringify(cur.skin) === JSON.stringify(c.skin)) { dirty = false; plate(); } } catch (e) { console.error(e); say(e.message || 'Could not save.', true); } }
function keepDraft() { clearTimeout(keepDraft.t); keepDraft.t = setTimeout(() => db.put('meta', 'draft', { id: cur.id, kind: cur.kind, slot: cur.slot, name: cur.name, skin: cur.skin }).catch(() => {}), 300); }
let building = 0;
async function rebuild() { const my = ++building;
  try { const root = await fig.build(cur.skin, R); if (my !== building) return fig.dispose(root); st.show(root); }
  catch (e) { console.error(e); if (my === building) say('Could not build this skin: ' + e.message, true); } }
let peekT;
function peek(part) { clearTimeout(peekT); peekT = setTimeout(async () => { const my = ++building;
  try { const root = await fig.build(part === undefined ? cur.skin : { ...cur.skin, [slot]: part }, R); if (my !== building) return fig.dispose(root); st.show(root); } catch (e) { console.warn(e); } }, part === undefined ? 140 : 70); }
const hover = part => ({ onpointerenter: e => { if (e.pointerType === 'mouse') peek(part); }, onpointerleave: e => { if (e.pointerType === 'mouse') peek(); } });
function plate() {
  const tag = cur.kind === 'game' ? ['In-game slot ' + (cur.slot + 1), 'game'] : cur.kind === 'custom' ? ['My skin', 'custom'] : ['Not saved', 'none'];
  $('nameplate').replaceChildren(el('b', { text: cur.name || 'New skin' }), el('span', { class: 'tag ' + tag[1], text: tag[0] }), ...(cur.id ? [el('span', { class: 'tag none', text: dirty ? 'Saving…' : 'Saved' })] : []));
  $('undo').disabled = hpos <= 0; $('redo').disabled = hpos >= hist.length - 1;
}

// ---------------------------------------------------------------- pictures: one at a time, only for tiles on screen
let jobGen = 0; const pics = new Map(); let chain = Promise.resolve();
const HEADF = new Set(['face', 'eyes', 'eyebrows', 'mouth', 'ears', 'haircut', 'facialHair', 'headAccessory', 'faceAccessory', 'earAccessory']), LEGF = new Set(['pants', 'overpants', 'shoes', 'underwear']);
const BASE = ['bodyCharacteristic', 'face', 'eyes', 'eyebrows', 'mouth', 'ears', 'underwear'];
function picture(key, make) { if (pics.has(key)) return Promise.resolve(pics.get(key)); const gen = jobGen;
  return chain = chain.then(async () => { if (gen !== jobGen) return null; if (pics.has(key)) return pics.get(key);
    try { const u = await make(); pics.set(key, u); if (pics.size > 1500) pics.delete(pics.keys().next().value); await new Promise(r => setTimeout(r)); return u; } catch (e) { console.warn(e); return null; } }); }
const lazy = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { lazy.unobserve(e.target); e.target._load?.(); } }, { rootMargin: '200px' });
const lastPic = new Map();   // the previous picture of a tile stays up until its new one is drawn
function lazyImg(key, make, prev) { const img = el('img', { alt: '', draggable: false });
  if (pics.has(key)) { img.src = pics.get(key); if (prev) lastPic.set(prev, img.src); }
  else { if (prev && lastPic.has(prev)) img.src = lastPic.get(prev);
    img._load = async () => { const u = await picture(key, make); if (u) { img.src = u; if (prev) lastPic.set(prev, u); } }; lazy.observe(img); }
  return img; }
// in a picture of one face item, the things that would cover it come off (a hood hides hair, a beard hides the mouth ...)
const HIDE = { haircut: ['headAccessory'], face: ['headAccessory', 'faceAccessory', 'facialHair', 'haircut'], eyes: ['headAccessory', 'faceAccessory', 'haircut'],
  eyebrows: ['headAccessory', 'faceAccessory', 'haircut'], mouth: ['headAccessory', 'faceAccessory', 'facialHair'], facialHair: ['headAccessory', 'faceAccessory'],
  skinFeature: ['headAccessory', 'faceAccessory', 'facialHair'], ears: ['headAccessory', 'haircut', 'earAccessory', 'faceAccessory', 'facialHair'], earAccessory: ['headAccessory', 'haircut', 'faceAccessory', 'facialHair'], faceAccessory: ['headAccessory'],
  gloves: ['overtop', 'cape'], overpants: ['shoes', 'pants'], underwear: ['pants', 'overpants', 'undertop', 'overtop', 'cape', 'shoes'], undertop: ['overtop', 'cape'], pants: ['cape', 'shoes', 'overpants'], shoes: ['cape'] };
const FACE_FRAME = { face: 'face', eyes: 'face', eyebrows: 'face', mouth: 'face', facialHair: 'face', faceAccessory: 'face', ears: 'ear', earAccessory: 'ear',
  headAccessory: 'hat', haircut: 'head', pants: 'pants', overpants: 'socks', shoes: 'shoes', gloves: 'gloves', underwear: 'hips', undertop: 'top', overtop: 'top' };
// pieces that hide the one in the picture: a coat over the gloves, boots over the socks, trousers over underwear
function itemThumb(f, it, color, variant) {   // the current character, wearing this option
  const s = { ...cur.skin, [f]: R.partStr(it, color, variant) }; for (const k of HIDE[f] || []) s[k] = null;
  const frame = FACE_FRAME[f] || (HEADF.has(f) ? 'head' : LEGF.has(f) ? 'legs' : f === 'bodyCharacteristic' || f === 'skinFeature' ? 'body' : 'torso');
  return lazyImg('i|' + f + '|' + JSON.stringify(s), async () => fig.snapshot(await fig.build(s, R), frame, f === 'cape'), f + '|' + it.Id);
}
// an animation's picture: the current skin caught part-way through the move
function animThumb(g, n) { const s = R.fit(cur.skin);
  return lazyImg('a|' + g + '|' + n + '|' + JSON.stringify(s), async () => { const [root, a] = await Promise.all([fig.build(s, R), fig.loadAnim(g, n)]);
    const an = new fig.Animator(); an.setFigure(root); an.set(a, 1, true); an.t = an.duration * 0.45; an.apply(); return fig.snapshot(root, 'full'); }); }
const portrait = skin => { const s = R.fit(skin); return lazyImg('p|' + JSON.stringify(s), async () => fig.snapshot(await fig.build(s, R), 'full')); };

// ---------------------------------------------------------------- panels
function setTab(t) { if (t !== 'editor' && picking) leavePicker(); if (ED && t !== 'creator') closeAsset(true).then(() => { playAnim('Default', 'Idle', 0.5); rebuild(); });
  tab = t; for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === t); if (R) render(); }
let pressing = false, renderLater = false;
const flushRender = () => { pressing = false; if (renderLater) { renderLater = false; render(); } };
addEventListener('pointerdown', e => { if (e.target.closest?.('button, a, summary, label, select, .skin')) { pressing = true; setTimeout(flushRender, 1500); } }, true);
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { if (pressing) setTimeout(flushRender, 0); }, true);
function render() { if (pressing) { renderLater = true; return; } jobGen++; plate(); drawEmotes(); drawGameSwitch(); outlineBox();
  $('app').classList.toggle('ws', !!ED); if (ED) return renderWorkspace(); const p = $('panel'), was = p.className, top = p.querySelector('.pbody')?.scrollTop || 0; p.className = 'panel tab-' + tab;
  p.replaceChildren(...({ editor: panelEditor, wardrobe: panelWardrobe, animations: panelAnimations, lookup: panelLookup, feedback: panelFeedback, creator: panelCreator, help: panelHelp }[tab])());
  if (was === p.className && top) { const b = p.querySelector('.pbody'); if (b) b.scrollTop = top; } }
// our own small symbols for the category rail (drawn here, not taken from the game)
const ICON = { Head: 'M6 3h12v13H6zM9 8v3h2V8zM13 8v3h2V8zM9 17h6v4H9z', Body: 'M9 2h6v6H9zM7 9h10v8H7zM3 9h3v8H3zM18 9h3v8h-3zM8 18h3v4H8zM13 18h3v4h-3z',
  Torso: 'M8 3l4 2 4-2 5 3-2 4-2-1v12H7V9l-2 1-2-4z', Legs: 'M6 3h12l1 18h-5l-2-11-2 11H5z', Capes: 'M8 3h8l4 18-4-2-4 2-4-2-4 2z' };
const SLOT_ICON = { haircut: 'M5 13V8l2-4 3 2 2-3 2 3 3-2 2 4v5h-3V9H8v4z', eyebrows: 'M3 11l7-3 1 2-7 3zM21 11l-7-3-1 2 7 3z', eyes: 'M3 8h8v8H3zM13 8h8v8h-8zM6 11v3h3v-3zM15 11v3h3v-3z',
  facialHair: 'M5 5h3v6h8V5h3v10l-4 5H9l-4-5z', headAccessory: 'M7 6h10v8h5v3H2v-3h5z', faceAccessory: 'M2 9h9v6H2zM13 9h9v6h-9zM4 11v2h5v-2zM15 11v2h5v-2z',
  earAccessory: 'M11 2h2v5h-2zM7 13a5 5 0 1 0 10 0a5 5 0 1 0-10 0zM10 13a2 2 0 1 1 4 0a2 2 0 1 1-4 0z', bodyCharacteristic: ICON.Body, face: 'M5 4h14v16H5zM8 9v3h2V9zM14 9v3h2V9zM9 15v2h6v-2z',
  mouth: 'M3 9h18v3l-3 5H6l-3-5zM6 12v1h12v-1z', ears: 'M8 20V9l10-6-3 9v8z', skinFeature: 'M5 6h3v3H5zM14 4h3v3h-3zM10 11h3v3h-3zM17 12h3v3h-3zM5 15h3v3H5zM13 18h3v3h-3z',
  underwear: 'M4 6h16v6l-6 6h-4l-6-6z', undertop: ICON.Torso, overtop: 'M8 3l4 3 4-3 5 3-2 4-2-1v12h-4V8l-1 1-1-1v13H7V9l-2 1-2-4z', gloves: 'M7 21v-8L5 9l2-1 2 3V4h2v6h1V3h2v7h1V5h2v9l-2 7z',
  pants: ICON.Legs, overpants: 'M9 3h7v10l4 4v4H9z', shoes: 'M6 4h7v9l7 3v5H6z', cape: ICON.Capes };
function icon(d) { const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); p.setAttribute('fill-rule', 'evenodd'); s.append(p); return s; }
const head = (title, right) => el('div', { class: 'phead' }, el('h2', { text: title }), right);

// ---------------------------------------------------------------- the locker: every slot at a glance, and a picker per slot
const TIERS = ['Standard', 'Base', 'Supporter', 'Cursebreaker', 'Event'];
function tierOf(e) {   // from how the game unlocks the item (its entitlements), standing in for rarity
  if (!e || e.custom) return 0; const t = Array.isArray(e.Entitlements) ? e.Entitlements : []; if (!t.length) return 0;
  if (t.some(x => !String(x).startsWith('game.'))) return 4; if (t.includes('game.base')) return 1; if (t.includes('game.deluxe')) return 2; return 3;
}
const tierClass = e => e && e.custom ? 'mine' : 't' + tierOf(e);
let LOCK = { favs: new Set(), seen: null }, picking = false, seenSlot = null, lockFilter = 'all', lockSort = 'up';
const favKey = (f, e) => f + '|' + e.Id, isNew = (f, e) => !e.custom && LOCK.seen && !LOCK.seen.has(favKey(f, e));
const saveLock = () => db.put('meta', 'locker', { favs: [...LOCK.favs], seen: [...LOCK.seen] }).catch(() => {});
async function loadLock() {
  const m = await db.get('meta', 'locker').catch(() => null), all = game.FIELDS.flatMap(f => R.ITEMS[f].filter(e => !e.custom).map(e => favKey(f, e)));
  LOCK.favs = new Set(m?.favs || []); LOCK.seen = m ? new Set(m.seen || []) : new Set(all); if (!m) saveLock();   // on a first visit nothing counts as new
}
function leavePicker() { if (seenSlot) { for (const e of R.ITEMS[seenSlot]) if (!e.custom) LOCK.seen.add(favKey(seenSlot, e)); saveLock(); seenSlot = null; } picking = false; }
function variantName(it, v) { const nk = it?.Variants?.[v]?.NameKey; return (nk && CAT.names[nk]) || nice(v); }
function lookCard(r, kind) { return el('button', { class: 'look ' + kind + (cur.id === r.id ? ' on' : ''), title: r.name, onclick: () => open(r) }, portrait(r.skin)); }
function panelEditor() { return picking ? panelPicker() : panelLocker(); }
function panelLocker() {
  const tile = f => { const it = R.find(f, cur.skin[f]), { color, variant } = parse(cur.skin[f]);
    return el('button', { class: 'slot ' + (it ? tierClass(it) : 'none'), title: LABEL[f], onclick: () => { slot = f; picking = true; seenSlot = f; filter = ''; lockFilter = 'all'; render(); } },
      it ? itemThumb(f, it, color, variant) : el('span', { class: 'nothing', text: '—' }),
      el('i', {}, icon(SLOT_ICON[f]), el('span', { text: LABEL[f] })), el('b', { text: it ? itemName(it) : 'None' })); };
  const looks = [...WARD.game.filter(Boolean).map(r => lookCard(r, 'game')), ...WARD.custom.map(r => lookCard(r, 'custom'))];
  return [head('Wardrobe'), el('div', { class: 'pbody locker' },
    GROUPS.map(([g, fs]) => { const fields = fs.filter(f => R.ITEMS[f].length); return fields.length ? [el('h3', { text: g }), el('div', { class: 'slots' }, fields.map(tile))] : null; }),
    el('h3', { text: 'Saved looks' }), el('div', { class: 'looks' }, looks, el('button', { class: 'look add', title: 'Save this look', text: '+', onclick: saveAs })))];
}
function panelPicker() {
  const f = slot, it = R.find(f, cur.skin[f]), { color, variant } = parse(cur.skin[f]);
  const change = (item, c, v) => setSkin({ ...cur.skin, [f]: R.partStr(item, c, v) });
  const all = R.ITEMS[f], tiersHere = [...new Set(all.filter(e => !e.custom).map(tierOf))].sort();
  const counts = { fav: all.filter(e => LOCK.favs.has(favKey(f, e))).length, new: all.filter(e => isNew(f, e)).length, mine: all.filter(e => e.custom).length };
  const chip = (id, label) => el('button', { class: 'chip' + (lockFilter === id ? ' on' : ''), text: label, onclick: () => { lockFilter = id; sortBox.hidden = id !== 'all'; drawCards(); for (const c of bar.querySelectorAll('.chip[data-f]')) c.classList.toggle('on', c.dataset.f === id); }, data: { f: id } });
  const sortBox = el('select', { class: 'sort', title: 'Order', hidden: lockFilter !== 'all', onchange: e => { lockSort = e.target.value; drawCards(); } },
    [['up', 'Standard first'], ['down', 'Event first']].map(([v, t]) => el('option', { value: v, text: t, selected: v === lockSort })));
  const bar = el('div', { class: 'options lockbar' }, chip('all', 'All'), counts.fav ? chip('fav', `Favourites ${counts.fav}`) : null, counts.new ? chip('new', `New ${counts.new}`) : null,
    tiersHere.length > 1 ? tiersHere.map(t => chip('t' + t, TIERS[t])) : null, counts.mine ? chip('mine', 'Mine') : null,
    sortBox);
  const detail = el('div', { class: 'detail' }), showDetail = e => { const t = e ? (e.custom ? 'Custom asset · site only' : TIERS[tierOf(e)]) : '';
    detail.replaceChildren(el('b', { text: e ? itemName(e) : 'None' }), el('span', { text: ' · ' + LABEL[f] }), el('em', { class: e ? tierClass(e) : '', text: t })); };
  const cardsBox = el('div', { class: 'cards lcards' });
  function drawCards() {
    const q = filter.toLowerCase(); let items = all.filter(e => itemName(e).toLowerCase().includes(q));
    if (lockFilter === 'fav') items = items.filter(e => LOCK.favs.has(favKey(f, e))); else if (lockFilter === 'new') items = items.filter(e => isNew(f, e));
    else if (lockFilter === 'mine') items = items.filter(e => e.custom); else if (/^t\d$/.test(lockFilter)) items = items.filter(e => !e.custom && 't' + tierOf(e) === lockFilter);
    const dir = lockFilter === 'all' && lockSort === 'down' ? -1 : 1, rank = e => e.custom ? 5 : tierOf(e);   // the game's order inside each tier; custom assets last
    items = items.map((e, i) => [e, i]).sort((a, b) => (rank(a[0]) - rank(b[0])) * dir || a[1] - b[1]).map(x => x[0]);
    const card = e => { const part = e ? R.partStr(e, color, variant) : null, hv = hover(part), k = e && favKey(f, e), fav = e && LOCK.favs.has(k);
      const star = e ? el('span', { class: 'star' + (fav ? ' on' : ''), role: 'button', title: fav ? 'Remove from favourites' : 'Add to favourites', text: fav ? '★' : '☆',
        onclick: ev => { ev.stopPropagation(); LOCK.favs.has(k) ? LOCK.favs.delete(k) : LOCK.favs.add(k); saveLock(); render(); } }) : null;
      return el('button', { class: 'lcard ' + (e ? tierClass(e) : 'none') + (e === it ? ' on' : ''), title: e ? itemName(e) : 'None', onclick: () => change(e, color, variant),
        onpointerenter: ev => { hv.onpointerenter(ev); showDetail(e); }, onpointerleave: ev => { hv.onpointerleave(ev); showDetail(it); } },
        e ? itemThumb(f, e, color, variant) : el('span', { class: 'nothing', text: '✕' }), star, e && isNew(f, e) ? el('span', { class: 'new', text: 'NEW' }) : null, el('b', { text: e ? itemName(e) : 'None' })); };
    cardsBox.replaceChildren(...(REQUIRED.has(f) || lockFilter !== 'all' ? [] : [card(null)]), ...items.map(card));
    if (!cardsBox.children.length) cardsBox.append(el('p', { class: 'blank', text: 'Nothing here.' }));
  }
  drawCards(); showDetail(it);
  const search = el('input', { type: 'search', placeholder: 'Search', value: filter, maxLength: 40, oninput: e => { filter = e.target.value; drawCards(); } });
  const cols = it ? R.colorsOf(it, variant) : [], vs = it?.Variants ? Object.keys(it.Variants) : [];
  const swatches = el('div', { class: 'swatches' }, cols.map(([k, base]) => { const b = el('button', { title: nice(k), class: k === color ? 'on' : '', onclick: () => change(it, k, variant), ...hover(R.partStr(it, k, variant)) });
    const ok = (Array.isArray(base) ? base : [base]).filter(c => HEX.test(c)); b.style.background = ok.length > 1 ? `linear-gradient(135deg, ${ok.join(',')})` : ok[0] || '#888'; return b; }));
  const options = el('div', { class: 'options' }, vs.map(v => el('button', { class: 'chip' + (v === (variant || vs[0]) ? ' on' : ''), text: variantName(it, v), onclick: () => change(it, color, v), ...hover(R.partStr(it, color, v)) })));
  return [head('Wardrobe'), el('div', { class: 'pbody' },
    el('div', { class: 'pickhead' }, el('button', { class: 'btn ghost', text: '‹ Wardrobe', onclick: () => { leavePicker(); render(); } }), icon(SLOT_ICON[f]), el('b', { text: LABEL[f] })),
    el('div', { class: 'row' }, search, locked('Owned only', 'the owned cosmetics filter', 'chip')), bar, cardsBox, detail,
    cols.length ? [el('h3', { text: 'Colour' }), swatches] : null, vs.length > 1 ? [el('h3', { text: 'Option' }), options] : null)];
}
// six favourite moves under the character, one click to play
let EMOTES = null;
const EMOTE_DEFAULT = ['Wave', 'Clap', 'Dance_Boogie', 'Shrug', 'Salute_Chest', 'Laugh_Strong'];
async function loadEmotes() { const m = await db.get('meta', 'emotes').catch(() => null), have = new Set(CAT.anims.Emote || []);
  EMOTES = (Array.isArray(m) ? m : EMOTE_DEFAULT.map(n => 'Emote/' + n)).filter(k => { const [g, n] = k.split('/'); return (CAT.anims[g] || []).includes(n); }).slice(0, 6);
  if (!EMOTES.length) EMOTES = [...have].slice(0, 6).map(n => 'Emote/' + n); }
function toggleEmote(g, n) { const k = g + '/' + n, i = EMOTES.indexOf(k); if (i >= 0) EMOTES.splice(i, 1); else { EMOTES.push(k); if (EMOTES.length > 6) EMOTES.shift(); } db.put('meta', 'emotes', EMOTES).catch(() => {}); drawEmotes(); }
function drawEmotes() { const box = $('emotes'); if (!box || !EMOTES) return; box.hidden = !!ED;
  box.replaceChildren(...EMOTES.map(k => { const [g, n] = k.split('/');
    return el('button', { class: 'emote' + (st.anim.anim && playing.group === g && playing.name === n ? ' on' : ''), title: nice(n), onclick: () => playAnim(g, n, 1, true) }, animThumb(g, n)); })); }

// ---- publishing: skins made of game items can be shared under the player's name (needs Sign in with Hytale)
let PUB = { on: false, signedIn: false }, PUBMAP = {};   // PUBMAP: local skin id -> published id
const api = async (path, method = 'GET', data) => { const r = await fetch('/api' + path, { method, credentials: 'same-origin', cache: 'no-store', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'The skin server did not answer. Try again.'); return j; };
async function loadPub() {
  PUBMAP = (await db.get('meta', 'published').catch(() => null)) || {};
  try { PUB = await api('/me'); } catch { PUB = { on: false, signedIn: false }; }
  if (PUB.signedIn) { const live = new Set(PUB.skins.map(s => s.id)); for (const k of Object.keys(PUBMAP)) if (!live.has(PUBMAP[k])) delete PUBMAP[k]; await savePubMap(); }
}
const savePubMap = () => db.put('meta', 'published', PUBMAP).catch(() => {});
const canPublish = () => auth.enabled && PUB.on && PUB.signedIn;
const publish = guard(async (rec, quiet) => {
  if (hasCustom(rec.skin)) throw new Error('Skins with custom assets can only be shared as files. Custom assets stay on your computer.');
  const r = await api('/skins', 'POST', { id: PUBMAP[rec.id] || null, name: rec.name, skin: rec.skin }); PUBMAP[rec.id] = r.id; await savePubMap();
  if (!quiet) { say(`Published "${rec.name}"`); render(); } });
const unpublish = guard(async (rec, quiet) => { const id = PUBMAP[rec.id]; if (!id) return; await api('/skins/' + id, 'DELETE').catch(e => { if (!/Unknown skin/.test(e.message)) throw e; });
  delete PUBMAP[rec.id]; await savePubMap(); if (!quiet) { say(`Unpublished "${rec.name}"`); render(); } });
const movePub = async (from, to) => { if (PUBMAP[from] && to) { PUBMAP[to] = PUBMAP[from]; delete PUBMAP[from]; await savePubMap(); } };
const pubButton = rec => !canPublish() ? locked('Publish', 'publishing', 'mini') : el('button', { class: 'mini' + (PUBMAP[rec.id] ? ' on' : ''), text: PUBMAP[rec.id] ? 'Unpublish' : 'Publish',
  title: PUBMAP[rec.id] ? 'Published: anyone who looks you up sees it. Saving updates it.' : 'Let anyone who looks you up see this skin', onclick: e => { e.stopPropagation(); (PUBMAP[rec.id] ? unpublish : publish)(rec); } });
const forgetMe = guard(async () => {
  if (!await confirmBox('Delete my published data', 'Remove every skin you published and your profile from this site’s server? Skins on your computer stay.', 'Delete', true)) return;
  await api('/me', 'DELETE'); PUBMAP = {}; await savePubMap(); await auth.signOut(); ACCOUNT = null; PUB = { on: PUB.on, signedIn: false }; say('Your published data was deleted'); render(); });

function card(rec, kind, i) {
  if (!rec) return el('div', { class: 'skin empty ' + kind }, el('div', { class: 'pic' }, el('span', { text: '+' })), el('b', { text: 'Slot ' + (i + 1) }), el('small', { text: 'Empty' }));
  const act = (label, fn, cls) => el('button', { class: 'mini ' + (cls || ''), text: label, onclick: e => { e.stopPropagation(); fn(); } });
  const acts = kind === 'game' ? [act('Set in game', () => checklist(rec)), act('Move out', () => moveOut(rec)), pubButton(rec), locked('Send to game', 'sending this skin to your in-game preset', 'mini')]
    : kind === 'custom' ? [act('To in-game', () => toGame(rec)), act('Copy', () => duplicate(rec)), pubButton(rec), act('Export', () => download(rec.name.replace(/[^\w -]/g, '') + '.skin.json', { name: rec.name, skin: rec.skin })), act('Delete', () => removeSkin(rec), 'danger')]
    : [act('Save', () => { open(rec, true); saveAs(); })];
  return el('div', { class: 'skin ' + kind + (cur.id && cur.id === rec.id ? ' on' : ''), tabIndex: 0, title: 'Open in the editor', onclick: () => { if (kind === 'pub') { open(rec, true, true); return render(); } open(rec, kind === 'found'); setTab('editor'); },
    onkeydown: e => { if (e.key === 'Enter') e.currentTarget.click(); } },
    el('div', { class: 'pic' }, portrait(rec.skin)), el('b', { text: rec.name }), kind === 'game' ? el('small', { text: 'Slot ' + (rec.slot + 1) }) : null, el('div', { class: 'acts' }, acts));
}
// Features that need a Hytale account. Sign in with Hytale is not available to this site yet, so they are shown greyed out.
const NEED = f => ACCOUNT ? `Hytale does not offer ${f} to other apps yet` : `Must connect Hytale account to enable ${f}`;
const locked = (label, feature, cls = 'btn ghost') => el('button', { class: cls + ' locked', disabled: true, title: NEED(feature), text: label });
const need = feature => el('p', { class: 'need', text: NEED(feature) + '.' });
function accountRow() {
  if (!auth.enabled) return el('div', { class: 'folder account' }, el('div', {}, el('b', {}, 'Hytale account ', el('span', { class: 'tag none', text: 'WIP' })),
    ),
    el('button', { class: 'btn primary locked', disabled: true, title: 'Coming soon', text: 'Connect Hytale account' }));
  if (!ACCOUNT) return el('div', { class: 'folder account' }, el('div', {}, el('b', { text: 'Hytale account' }),
    ),
    el('button', { class: 'btn primary', text: 'Connect Hytale account', onclick: guard(() => auth.start()) }));
  return el('div', { class: 'folder account on' }, el('div', {}, el('b', { text: 'Signed in as ' + ACCOUNT.username }), PUB.supporter ? el('span', { class: 'tag supporter', text: 'Supporter' }) : null),
    el('button', { class: 'btn ghost', text: 'Show my skin', onclick: () => { setTab('lookup'); lookup(ACCOUNT.username); } }),
    el('button', { class: 'btn ghost', text: 'Sign out', onclick: guard(async () => { await auth.signOut(); ACCOUNT = null; PUB = { on: PUB.on, signedIn: false }; render(); }) }),
    PUB.signedIn ? el('button', { class: 'btn ghost danger', text: 'Delete my published data', onclick: forgetMe }) : null);
}
function folderRow() {
  if (!store.folderSupported) return el('p', { class: 'note', text: 'Saving to a folder needs Chrome or Edge.' });
  if (FOLDER.state === 'none') return null;   // the numbered steps above cover choosing one
  const after = async r => { FOLDER = await store.folderState(); await reloadAssets(); await refreshWard(); pushWearing(); if (r) say(r.imported ? `Folder connected, ${r.imported} skin${r.imported > 1 ? 's' : ''} brought in` : 'Folder connected'); };
  const btn = (t, fn, c = 'ghost') => el('button', { class: 'btn ' + c, text: t, onclick: guard(fn) });
  const [title, text] = FOLDER.state === 'on' ? ['Saving to folder: ' + FOLDER.name, 'Every skin and custom asset is a small file in this folder and updates as you edit.']
    : FOLDER.state === 'ask' ? ['Folder paused: ' + FOLDER.name, 'Your browser needs your OK again before it can write to the folder. Until then, changes are kept in the browser.']
    : ['Save skins to a folder', 'Pick a folder on your computer, for example a "Hytale Skins" folder in Documents. Each skin becomes a small file there and updates as you edit.'];
  return el('div', { class: 'folder ' + FOLDER.state }, el('div', {}, el('b', { text: title })), modLink('ghost'),
    FOLDER.state === 'none' ? btn('Choose folder', async () => after(await store.chooseFolder()), 'primary')
      : [FOLDER.state === 'ask' ? btn('Reconnect', async () => after(await store.resumeFolder(true)), 'primary') : btn('Change', async () => after(await store.chooseFolder())),
         btn('Stop', async () => { await store.forgetFolder(); await after(); })]);
}
function gameSteps() {   // the path to wearing your skins in Hytale, in order
  if (!store.folderSupported) return null; const linked = FOLDER.state === 'on', all = linked && SHOWGAME;
  const row = (n, done, title, text, action) => el('li', { class: done ? 'done' : '' }, el('span', { class: 'num', text: done ? '✓' : n }), el('div', {}, el('b', { text: title }), el('small', { text })), done ? null : action);
  return el('details', { class: 'gamesteps', open: !all }, el('summary', { text: all ? 'Wearing your skins in Hytale: all set' : 'Wear your skins in Hytale: 3 steps' }), el('ol', {},
    row(1, false, 'Get the Skin Editor Sync mod', 'Install it once from CurseForge. It dresses you in game.', modLink('ghost')),
    row(2, linked, 'Choose a skins folder', 'Pick a "Hytale Skins" folder in Documents. The mod reads it.', linked ? null : el('button', { class: 'btn primary', text: FOLDER.state === 'ask' ? 'Reconnect folder' : 'Choose folder', onclick: guard(async () => { FOLDER.state === 'ask' ? await store.resumeFolder(true) : await store.chooseFolder(); FOLDER = await store.folderState(); await reloadAssets(); await refreshWard(); pushWearing(); }) })),
    row(3, linked && SHOWGAME, 'Switch on "In game"', linked ? 'The switch under the preview. What you wear here, you wear in your worlds.' : 'The switch appears under the preview once a folder is chosen.', el('button', { class: 'btn ghost', text: 'Turn on', disabled: !linked, onclick: () => { if (!SHOWGAME) $('ingame').onclick(); } }))));
}
function panelWardrobe() {
  return [head('Locker'), el('div', { class: 'pbody' }, gameSteps(), folderRow(), accountRow(),
    el('div', { class: 'shelf game' }, el('h3', {}, el('span', { text: 'In-game slots' }), el('em', { text: `${WARD.game.filter(Boolean).length} / ${store.GAME_SLOTS}` })),
      el('div', { class: 'row' }, locked('Load my presets', 'loading your in-game presets'), locked('Send all to game', 'sending skins to your in-game presets')), need('preset sync'),
      el('div', { class: 'cards' }, WARD.game.map((r, i) => card(r, 'game', i)))),
    el('div', { class: 'shelf custom' }, el('h3', {}, el('span', { text: 'My skins' }), el('em', { text: `${WARD.custom.length} / ${store.CUSTOM_MAX}` })),
      WARD.custom.length ? el('div', { class: 'cards' }, WARD.custom.map(r => card(r, 'custom'))) : el('p', { class: 'blank', text: 'Nothing saved yet. Design a skin in the Wardrobe and press Save.' })))];
}
async function refreshWard() { WARD = await store.list(); if (cur.id && ![...WARD.game, ...WARD.custom].some(r => r && r.id === cur.id)) { cur.id = null; cur.kind = null; cur.slot = null; } render(); }
function guard(fn) { return async (...a) => { try { await fn(...a); } catch (e) { if (e && e.name === 'AbortError') return; console.error(e); say(e.message || 'That did not work.', true); } }; }
const slotButtons = () => WARD.game.map((r, i) => ({ label: `Slot ${i + 1}${r ? ': ' + r.name : ' (empty)'}`, value: String(i) }));
const toGame = guard(async rec => {
  if (hasCustom(rec.skin)) throw new Error('In-game slots cannot hold custom assets, because the game does not have them.');
  const v = await ask('Move to an in-game slot', el('p', { text: `"${rec.name}" goes into the slot you pick. A skin already in that slot moves to My skins, so nothing is lost.` }), [...slotButtons(), { label: 'Cancel', value: '' }]);
  if (v === '') return; await store.swap(rec.id, +v); await movePub(rec.id, 'game-' + v); if (cur.id === rec.id) { cur.id = 'game-' + v; cur.kind = 'game'; cur.slot = +v; } await refreshWard(); say('Moved to in-game slot ' + (+v + 1));
});
const moveOut = guard(async rec => { const n = await store.saveCustom(rec.name, rec.skin); await movePub(rec.id, n && n.id); await store.remove(rec.id); await refreshWard(); say('Moved to My skins'); });
const duplicate = guard(async rec => { await store.saveCustom(cleanName(rec.name + ' copy'), rec.skin); await refreshWard(); });
const removeSkin = guard(async rec => { if (!await confirmBox('Delete skin', `Delete "${rec.name}"? This cannot be undone.`, 'Delete', true)) return; if (PUBMAP[rec.id] && canPublish()) await unpublish(rec, true); await store.remove(rec.id); await refreshWard(); });
function checklist(rec) {
  const rows = GROUPS.flatMap(([g, fs]) => fs.filter(f => rec.skin[f]).map(f => { const p = parse(rec.skin[f]), item = R.find(f, rec.skin[f]);
    return el('tr', {}, el('td', { text: g + ' ▸ ' + LABEL[f] }), el('td', { text: item ? itemName(item) : nice(p.id) }), el('td', { text: [p.color && nice(p.color), p.variant && nice(p.variant)].filter(Boolean).join(', ') })); }));
  ask(`Set "${rec.name}" in game`, [el('p', { text: `In Hytale, open My Avatar, choose preset ${rec.slot + 1} and pick these parts:` }), el('table', { class: 'parts' }, el('tbody', {}, rows))], [{ label: 'Done', value: '', primary: true }]);
}
async function save() { if (!cur.id) return saveAs();
  await guard(async () => { const r = cur.kind === 'game' ? await store.saveGame(cur.slot, cur.name, cur.skin) : await store.saveCustom(cur.name, cur.skin, cur.id); dirty = false; await refreshWard(); say(`Saved "${r.name}"`);
    if (PUBMAP[r.id] && canPublish() && !hasCustom(r.skin)) publish(r, true); })(); }
async function saveAs() {
  const name = el('input', { type: 'text', value: cur.name || '', maxLength: 40, placeholder: 'Skin name', autofocus: true });
  const where = el('select', {}, el('option', { value: 'custom', text: `My skins (${WARD.custom.length} / ${store.CUSTOM_MAX})` }), WARD.game.map((r, i) => el('option', { value: String(i), text: `In-game slot ${i + 1}${r ? ', replaces "' + r.name + '"' : ' (empty)'}` })));
  const v = await ask('Save skin', [el('label', { text: 'Name' }), name, el('label', { text: 'Save to' }), where], [{ label: 'Cancel', value: '' }, { label: 'Save', value: 'yes', primary: true }]);
  if (v !== 'yes') return; const n = cleanName(name.value) || 'Unnamed';
  if (where.value !== 'custom' && hasCustom(cur.skin)) return say('In-game slots cannot hold custom assets. Save this one to My skins.', true);
  await guard(async () => { const r = where.value === 'custom' ? await store.saveCustom(n, cur.skin) : await store.saveGame(+where.value, n, cur.skin);
    cur.id = r.id; cur.kind = r.kind; cur.slot = r.slot ?? null; cur.name = r.name; dirty = false; keepDraft(); await refreshWard(); say(`Saved "${r.name}"`); })();
}

// animations
let playing = { group: 'Default', name: 'Idle' };
const ORDER = ['Emote', 'Default', 'Poses', 'Taunt', 'Flavor', 'Expressions'];
let onceT;
// ---- Mount moves: the player rides the animal the game lets them ride (tamed horse, camel, ram), with its own matching move.
// Checked against a ridden horse in game 2026-11-20 (side, front, back, high views): seat height and place match; no saddle;
// mane and tail are black or grey at random (black shown).
const MOUNT_PATH = 'NPC/Livestock/', BLOCK = 64;   // model units per block
const MOUNTS = {
  Horse: { model: MOUNT_PATH + 'Horse/Models/Model.blockymodel', tex: MOUNT_PATH + 'Horse/Models/Texture.png', seat: [0, 1.6, 0], anims: MOUNT_PATH + 'Horse/Animations/Default/',
    atts: [{ model: MOUNT_PATH + 'Horse/Models/Attachments/Mane.blockymodel', tex: MOUNT_PATH + 'Horse/Models/Attachments/Mane_Black.png' }] },   // the ridden (Tamed_Horse) role uses the plain horse: no saddle; mane and tail black or grey at random
  Camel: { model: MOUNT_PATH + 'Camel/Models/Model.blockymodel', tex: MOUNT_PATH + 'Camel/Models/Texture.png', seat: [0, 2.25, 0.2], anims: MOUNT_PATH + 'Camel/Animations/Default/',
    atts: [{ model: MOUNT_PATH + 'Camel/Models/Attachments/Shell.blockymodel', tex: MOUNT_PATH + 'Camel/Models/Attachments/Shell_Textures/Green.png' }] },
  Ram: { model: MOUNT_PATH + 'Ram/Models/Model.blockymodel', tex: MOUNT_PATH + 'Ram/Models/Texture.png', seat: [0, 1.3, 0], anims: MOUNT_PATH + 'Ram/Animations/Default/', atts: [] } };
const MOUNT_MOVE = { Mount_Idle: ['Idle', 1], Mount_Walk: ['Walk', 1], Mount_Walk_Backward: ['Walk_Backward', 1], Mount_Run: ['Run', 1], Mount_Run_Backward: ['Walk_Backward', 1.6], Mount_Sprint: ['Run', 1.3] };
let mountKind = 'Horse', mountOn = null, mountMsg = '';
async function setMount(kind, move) {
  if (!st) return; if (!kind) { if (mountOn) { st.mount(null); mountOn = null; } return; }
  const M = MOUNTS[kind];
  try {
    if (mountOn !== kind) { const root = await fig.buildCreature(M); st.mount(root, M.seat.map(v => v * BLOCK)); mountOn = kind; }
    const [n, sp] = MOUNT_MOVE[move] || ['Idle', 1]; st.mountAnim.set(await game.json(game.common(M.anims + n + '.blockyanim')), sp); mountMsg = '';
  } catch (e) { console.warn(e); st.mount(null); mountOn = null; mountMsg = 'Your saved copy of the game files is from before animals were added. Refresh it once to see them (your skins are kept).'; }
}
async function playAnim(g, n, speed = 1, once = false) { clearTimeout(onceT); try { await setMount(g === 'Mount' ? mountKind : null, n); const a = await fig.loadAnim(g, n); st.hover(g === 'Fly' ? 44 : g === 'Glide' ? 60 : 0); playing = { group: g, name: n }; st.anim.set(a, speed);
    if (once) { const still = fig.motionOf(g, n) && st.anim.still, ms = still ? 1700 : (Math.max(1, a.duration || 60) / 60 / speed) * 1000 + (a.holdLastKeyframe ? 700 : 0) + 250;
      onceT = setTimeout(() => { if (playing.group === g && playing.name === n) playAnim('Default', 'Idle', 0.5); }, ms); } st.anim.setMove(fig.motionOf(g, n)); st.anim.playing = true; drawEmotes(); } catch (e) { say('That animation could not be loaded.', true); } if (tab === 'animations') render(); }
let animGroup = 'Emote';
// the move groups as locker tiles: the game's 16 folders folded into a few, each tile showing its signature move
const CATS = [['Emote', ['Emote']], ['Moves', ['Default']], ['Poses', ['Poses']], ['Taunt', ['Taunt']], ['Flavor', ['Flavor']], ['Faces', ['Expressions']],
  ['Travel', ['Fly', 'Glide', 'Dash', 'Roll', 'Slide', 'Swim', 'Climb', 'Mantle']], ['Mount', ['Mount']]];
function animCats() {
  const have = g => (CAT.anims[g] || []).length, out = CATS.map(([k, gs]) => [k, gs.filter(have)]).filter(([, gs]) => gs.length);
  const used = new Set(out.flatMap(c => c[1])); for (const g of Object.keys(CAT.anims)) if (!used.has(g) && have(g)) out.push([nice(g), [g]]);
  return out;
}
function panelAnimations() {
  const cats = animCats(); if (!cats.some(c => c[0] === animGroup)) animGroup = cats[0][0];
  const gs = cats.find(c => c[0] === animGroup)[1], A = st.anim, count = list => list.reduce((t, g) => t + CAT.anims[g].length, 0);
  const item = (g, n) => { const k = g + '/' + n, pinned = EMOTES && EMOTES.includes(k);
    return el('button', { class: A.anim && playing.group === g && playing.name === n ? 'on' : '', title: nice(n), onclick: () => playAnim(g, n) }, animThumb(g, n), el('span', { text: nice(n) }),
      el('i', { class: 'star' + (pinned ? ' on' : ''), title: pinned ? 'Remove from quick slots' : 'Add to quick slots', text: pinned ? '★' : '☆', onclick: e => { e.stopPropagation(); toggleEmote(g, n); render(); } })); };
  return [head('Animations'), el('div', { class: 'pbody' },
    el('div', { class: 'now' }, el('b', { text: A.anim ? nice(playing.name) : 'Rest pose' })),
    el('div', { class: 'cattiles' }, cats.map(([k, list]) => el('button', { class: 'cattile' + (k === animGroup ? ' on' : ''), onclick: () => { animGroup = k; render(); } },
      catIcon(k), el('b', { text: k }), el('small', { text: String(count(list)) })))),
    animGroup === 'Mount' ? el('div', { class: 'options' }, el('b', { class: 'dim', text: 'Ride:' }), Object.keys(MOUNTS).map(k => el('button', { class: 'chip' + (k === mountKind ? ' on' : ''), text: k,
      onclick: () => { mountKind = k; if (playing.group === 'Mount' && A.anim) playAnim('Mount', playing.name); else render(); } }))) : null,
    animGroup === 'Mount' && mountMsg ? el('div', { class: 'row' }, el('p', { class: 'need', text: mountMsg }), el('button', { class: 'btn ghost', text: 'Refresh game files', onclick: () => showConnect() })) : null,
    gs.length > 1 ? gs.map(g => [el('h3', { class: 'animhead', text: nice(g) }), el('div', { class: 'animlist' }, CAT.anims[g].map(n => item(g, n)))])
      : el('div', { class: 'animlist' }, CAT.anims[gs[0]].map(n => item(gs[0], n))))];
}

// other players' skins
let lookupMsg = '', shown = null;   // shown: the last player found, with the skins they published on this site
const lookup = guard(async name => {
  name = name.trim(); if (!/^[A-Za-z0-9_-]{2,36}$/.test(name)) { lookupMsg = 'Type a Hytale username or a player UUID.'; return render(); }
  lookupMsg = 'Looking…'; render();
  try {
    const r = await fetch('https://playerdb.co/api/player/hytale/' + encodeURIComponent(name), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    const j = r.ok ? await r.json() : null, p = j?.data?.player, s = sanitize(p?.skin);
    if (!s) lookupMsg = r.status === 429 ? 'Too many lookups for now. Try again in a minute.' : 'No player with that name or UUID was found.';
    else { const nm = cleanName(p.username) || name; found = [{ name: nm, skin: s }, ...found.filter(f => f.name !== nm)].slice(0, 60); lookupMsg = ''; open(found[0], true, true); loadPublished(nm, p.id); }
  } catch { lookupMsg = 'The lookup service could not be reached.'; }
  render();
});
async function loadPublished(name, id) {
  if (!/^[0-9a-f-]{32,36}$/i.test(id || '')) { shown = null; return; }
  const me = shown = { name, uuid: id, skins: null }; render();
  try { const r = await fetch('/api/players/' + encodeURIComponent(id) + '/skins', { credentials: 'omit', cache: 'no-store' }), j = r.ok ? await r.json() : null;
    me.supporter = !!j?.supporter; me.skins = (Array.isArray(j?.skins) ? j.skins : []).map(k => ({ id: 'pub_' + String(k.id).slice(0, 24), name: cleanName(k.name) || 'Skin', skin: sanitize(k.skin) })).filter(k => k.skin).slice(0, 45);
  } catch { me.skins = []; me.failed = true; }
  if (shown === me) render();
}
async function importSkinFiles(files) { let n = 0;
  for (const f of [...files].slice(0, 200)) { try { const j = await readJsonFile(f), s = sanitize(j?.skin || j); if (s) { found.unshift({ name: cleanName(j?.name || f.name.replace(/(_portrait\.png)?\.(skin|json)+$/gi, '')).slice(0, 40) || 'Imported', skin: s }); n++; } } catch { /* not a skin file */ } }
  found = found.slice(0, 200); say(n ? `Brought in ${n} skin${n > 1 ? 's' : ''}` : 'No skins were found in those files.', !n); tab = 'lookup'; setTab('lookup'); }
function panelLookup() {
  const input = el('input', { type: 'text', placeholder: 'Username or UUID', maxLength: 36, autocomplete: 'off', spellcheck: false });
  const form = el('form', { class: 'row', onsubmit: e => { e.preventDefault(); lookup(input.value); } }, input, el('button', { class: 'btn primary', text: 'Find' }));
  const file = el('input', { type: 'file', accept: '.json,.skin,application/json', multiple: true, hidden: true, onchange: e => { importSkinFiles(e.target.files); e.target.value = ''; } });
  return [head('Players'), el('div', { class: 'pbody' },
    el('h3', { text: 'Find a player' }), form, el('p', { class: 'err', text: lookupMsg }),
    shown ? [el('h3', {}, 'Published by ' + shown.name, shown.supporter ? el('span', { class: 'tag supporter', title: 'Supports the site on Ko-fi', text: 'Supporter' }) : null), shown.skins === null ? el('p', { class: 'need', text: 'Looking…' })
      : shown.skins.length ? el('div', { class: 'cards' }, shown.skins.map(r => card(r, 'pub'))) : el('p', { class: 'need', text: shown.failed ? 'Published skins could not be loaded.' : `${shown.name} has not published any skins here yet.` })] : null,
    el('h3', { text: 'Open skin files' }), el('label', { class: 'btn ghost' }, 'Choose skin files', file),
    found.length ? [el('h3', { text: 'Found this session' }), el('div', { class: 'cards' }, found.map(r => card(r, 'found')))] : null)];
}

function panelHelp() {
  const sec = (t, ...ps) => [el('h3', { text: t }), ...ps.map(p => typeof p === 'string' ? el('p', { text: p }) : p)];
  const backupFile = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: guard(async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const r = await store.importAll(await readJsonFile(f, 40_000_000)); await reloadAssets(); await refreshWard(); say(`Restored ${r.added} skin${r.added === 1 ? '' : 's'}${r.skipped ? `, ${r.skipped} did not fit` : ''}`); }) });
  return [head('Help'), el('div', { class: 'pbody prose' },
    sec('Game files', META ? `Connected: ${META.name}, ${META.files} character files, read on ${new Date(META.at).toLocaleDateString()}.` : 'Not connected yet.',
      el('div', { class: 'row' }, el('button', { class: 'btn ghost', text: 'Connect again', onclick: showConnect }),
        el('button', { class: 'btn danger', text: 'Forget game files', onclick: guard(async () => { if (!await confirmBox('Forget game files', 'Removes the copy of your game files from this browser. Your saved skins stay.', 'Forget', true)) return; await game.forget(); R = null; pics.clear(); fig.clearCache(); showConnect(); }) }))),
    MOD_URL ? sec('Skin Editor Sync', 'Wear what you design in your own worlds: install the mod, pick a skins folder in the Locker, then turn on In game.', el('div', { class: 'row' }, modLink('primary'))) : null,
    sec('Backup', 'Keep a backup file if you have not picked a skins folder in the Locker.',
      el('div', { class: 'row' }, el('button', { class: 'btn ghost', text: 'Download backup', onclick: guard(async () => download('skin-editor-backup.json', await store.exportAll())) }), el('label', { class: 'btn ghost' }, 'Restore backup', backupFile))),
    el('p', {}, el('a', { href: '/privacy', text: 'Privacy: what the site keeps and how to delete it' })))];
}

// Feedback goes to the project's public GitHub issues: the site itself stores and sends nothing.
function panelFeedback() {
  const diag = `Site ${VERSION}; game files: ${META ? `${META.files} files, read ${new Date(META.at).toISOString().slice(0, 10)}` : 'not connected'}; browser: ${navigator.userAgent.slice(0, 140)}`;
  const link = (text, href, cls) => el('a', { class: 'btn ' + cls, text, href, target: '_blank', rel: 'noopener noreferrer' });
  return [head('Feedback'), el('div', { class: 'pbody prose' },
    el('h3', { text: 'Report a bug' }), el('p', { text: 'Something broken or drawn wrong? Tell us what happened. The report form opens on GitHub with the site version and your browser filled in; you can read and edit it before sending.' }),
    link('Report a bug', `${REPO}/issues/new?template=bug.yml&diagnostics=${encodeURIComponent(diag)}`, 'primary'),
    el('h3', { text: 'Request a feature' }), el('p', { text: 'Vote for a request with a thumbs-up, or add your own. The most wanted get built first.' }),
    el('div', { class: 'row' }, link('See and vote on requests', `${REPO}/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement+sort%3Areactions-%2B1-desc`, 'ghost'), link('Request a feature', `${REPO}/issues/new?template=feature.yml`, 'primary')),
    )];
}

// ---------------------------------------------------------------- asset creator
let ASSETS = [], ED = null, edN = 0;
const itemName = e => e && e.custom ? e.Name : (e && CAT.names && CAT.names[e.Name]) || nice(e ? e.Id : '');
const hasCustom = skin => Object.values(skin).some(v => typeof v === 'string' && v.startsWith('Custom_'));
async function reloadAssets() { ASSETS = await assets.list().catch(() => []); registerAssets(); await loadLock(); await loadEmotes(); SHOWGAME = !!(await db.get('meta', 'showInGame').catch(() => false)); cur.skin = R.fit(cur.skin); }
const syncFolder = () => store.sync().catch(e => say(e.message, true));
function registerAssets() {   // custom assets join the catalogue as extra items in their slot, so the editor treats them like any other
  for (const f of game.FIELDS) { const arr = CAT.items[f]; for (let i = arr.length - 1; i >= 0; i--) if (arr[i].custom) arr.splice(i, 1); }
  for (const a of ASSETS) { const base = CAT.items[a.field].find(e => e.Id === a.baseId) || {};
    CAT.items[a.field].push({ ...base, Id: 'Custom_' + a.id, custom: true, baseId: a.baseId, Name: a.name,
      Model: (ED && ED.asset.id === a.id ? ED.model : a.shape) ? `shape:${a.id}@${ED && ED.asset.id === a.id ? 'e' + ED.n + '.' + (ED.shapeN || 0) : a.updated}` : a.model, Variants: undefined, GradientSet: undefined, GreyscaleTexture: undefined, IsDefaultAsset: false,
      Textures: { Mine: { Texture: `custom:${a.id}@${ED && ED.asset.id === a.id ? 'live' + ED.n : a.updated}`, BaseColor: ['#f4c452'] } } }); }
}
fig.setCustomSource(async id => {
  if (ED && ED.asset.id === id) return ED.canvas;
  const a = ASSETS.find(x => x.id === id); if (!a) throw new Error('that custom asset is gone');
  const bmp = await createImageBitmap(a.data), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); return c;
});
const newAsset = guard(async (f, val) => {
  say('Making your copy…'); document.body.classList.add('busy');
  try { await makeAsset(f, val); } finally { document.body.classList.remove('busy'); }
});
async function makeAsset(f, val) {
  if (ASSETS.length >= assets.MAX) throw new Error(`You have ${assets.MAX} custom assets, the most this site keeps. Delete one first.`);
  const skin = val ? { ...cur.skin, [f]: val } : cur.skin, r = R.resolve(f, skin), it = R.find(f, skin[f]); if (!r || !it) throw new Error('Pick an item first.');
  const paidBase = it.custom ? CAT.items[f].find(e => e.Id === it.baseId) : it;
  if (paidBase && tierOf(paidBase) > 0) throw new Error(`${itemName(paidBase)} is a ${TIERS[tierOf(paidBase)]} item. Paid items can't be repainted.`);
  const src = it.custom ? ASSETS.find(x => 'Custom_' + x.id === it.Id) : null;
  if (it.custom && !src) throw new Error('That custom item is gone. Pick another one.');
  let a;
  if (src) a = await assets.save({ ...src, id: assets.newId(), name: src.name.replace(/ \(mine\)$/, '') + ' copy', flag: undefined });
  else { const c = await fig.bakedCanvas(r.tex, r.tint), data = await new Promise(ok => c.toBlob(ok, 'image/png'));
    a = await assets.save({ id: assets.newId(), name: itemName(it) + ' (mine)', field: f, baseId: it.Id, model: r.model, w: c.width, h: c.height, data }); }
  ASSETS = await assets.list(); registerAssets(); setSkin({ ...cur.skin, [f]: 'Custom_' + a.id + '.Mine' }); await openAsset(a); say('');
}
const makePainter = (c, a) => createPainter(c, final => { fig.refreshCustom(a.id); if (final) { queueAssetSave(); recordPaint(); if (ED && !ED.replaying) render(); } }, () => render());
// a texture with no free room grows downwards (twice as tall, up to 256): the old paint stays where it was, the new rows are empty
function growTexture() {
  const c = ED.canvas; if (c.height * 2 > 256) return false;
  ED.painter.grow(c.height * 2); ED.asset = { ...ED.asset, h: c.height }; ED.n = ++edN; return true;
}
async function openAsset(a) {
  if (ED) await closeAsset(true);
  const bmp = await createImageBitmap(a.data), c = el('canvas', { width: bmp.width, height: bmp.height, className: 'paint' }); c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0);
  ED = { frame: true, asset: a, canvas: c, n: ++edN, zoom: Math.max(2, Math.min(8, Math.floor(280 / bmp.width))), rects: [], mode: 'paint', stool: 'select', hist: [], fut: [] };
  if (a.shape) ED.model = JSON.parse(a.shape);
  try { ED.rects = fig.usedRects(ED.model || await game.json(game.common(a.model))); } catch (e) { console.warn('no drawn area for', a.model, e); }
  ED.painter = makePainter(c, a); Object.assign(ED.painter, BRUSH);
  if (ED.rects.length) { const m = new Uint8Array(c.width * c.height); for (const r of ED.rects) for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(c.height, Math.ceil(r.y + r.h)); y++) for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(c.width, Math.ceil(r.x + r.w)); x++) m[y * c.width + x] = 1; ED.painter.mask = m; }
  ED.palette = ED.painter.palette(); ED.ovl = el('canvas', { className: 'limits' }); requestAnimationFrame(() => { fitTexture(); render(); if (!store_.get('se_tour')) requestAnimationFrame(() => tour(0)); });
  const flatPx = e => { const r = c.getBoundingClientRect(); return { x: Math.min(c.width - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * c.width))), y: Math.min(c.height - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * c.height))) }; };
  bindPaint(c, flatPx, 1e9); bindSelect(c, flatPx);
  c.addEventListener('pointermove', e => { if (!ED) return; ED.hover = flatPx(e); ED.hoverM = null; drawOvl(); }); c.addEventListener('pointerleave', () => { if (!ED) return; ED.hover = null; drawOvl(); });
  registerAssets(); if (!(cur.skin[a.field] || '').startsWith('Custom_' + a.id)) setSkin({ ...cur.skin, [a.field]: 'Custom_' + a.id + '.Mine' });
  setMount(null); ED.iso = true; st.isolate(c); st.anim.set(null); st.paintMode(true); tab = 'creator'; for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === 'creator'); render(); rebuild();
}
const BRUSH = (() => { try { const b = JSON.parse(store_.get('se_brush') || '{}'), o = {}; if (/^#[0-9a-f]{6}$/i.test(b.color)) o.color = b.color; if (b.size >= 1 && b.size <= 8) o.size = Math.round(b.size); if (b.opacity > 0 && b.opacity <= 1) o.opacity = b.opacity; return o; } catch { return {}; } })();
const keepBrush = () => { if (!ED) return; const P = ED.painter; Object.assign(BRUSH, { color: P.color, size: P.size, opacity: P.opacity }); store_.set('se_brush', JSON.stringify(BRUSH)); };
const markSaved = ok => { if (!ED) return; ED.saved = ok; const s = $('wssaved'); if (s) { s.textContent = ok ? 'Saved' : 'Saving…'; s.classList.toggle('busy', !ok); } };
function queueAssetSave() { markSaved(false); clearTimeout(queueAssetSave.t); queueAssetSave.t = setTimeout(() => flushAsset().catch(e => say(e.message, true)), 900); }
async function flushAsset() { clearTimeout(queueAssetSave.t); if (!ED) return; const e = ED, data = await new Promise(ok => e.canvas.toBlob(ok, 'image/png'));
  try { e.asset = await assets.save({ ...e.asset, data, shape: e.model && e.shapeN ? JSON.stringify(e.model) : e.asset.shape }); ASSETS = await assets.list(); syncFolder(); } finally { if (ED === e) markSaved(true); } }
async function closeAsset(quiet) {
  if (!ED) return; keepBrush(); if (ED.float) placeFloat(); tour(99); if ($('viewhint')) $('viewhint').hidden = true; st.cursor(null); await checkReplica(); await flushAsset().catch(e => say(e.message, true)); ED = null; registerAssets(); st.highlight(null); st.isolate(null); st.paintMode(false); st.gizmo(null); st.setView('persp'); pics.clear(); lastPic.clear();
  if (!quiet) { playAnim('Default', 'Idle', 0.5); rebuild(); render(); }
}
// painting: the same strokes whether the pointer is on the flat texture or on the 3D model
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function sharersOf(node) { const mine = ED.rects.filter(r => r.node === node); return [...new Set(ED.rects.filter(r => r.node !== node && mine.some(m => overlaps(m, r))).map(r => r.node))]; }
async function colourPart(node) {
  const others = sharersOf(node);
  if (others.length) { await editModel(); const k = boxesOf(ED.model).findIndex(b => b.node.name === node);
    if (k >= 0) { ED.box = k; if (!ownArea(true)) return say('This part shares its paint and the texture is full, so it can’t be coloured on its own.', true); } }
  tintAll(ED.painter.color, node);
  if (others.length) say(`${partName(node)} got paint of its own (it shared it with ${others.map(partName).join(', ')}) and is now this colour.`);
}
const partName = n => { const b = ED.model && boxesOf(ED.model).find(x => x.node.name === n); return b ? boxLabel(b.node) : n.replace(/^L-/, 'Left ').replace(/^R-/, 'Right ').replace(/[-_]+/g, ' '); };
function partAt(e, onModel, toPixel) {   // the box under the pointer: on the model by its mesh, on the texture by the area it owns
  if (onModel) { const m = st.pickMesh(e.clientX, e.clientY, o => o.material?.map?.image === ED.canvas); return m ? m.userData.nodeName : null; }
  const p = toPixel(e); if (!p) return null; const hit = ED.rects.filter(q => p.x >= q.x && p.x < q.x + q.w && p.y >= q.y && p.y < q.y + q.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]; return hit ? hit.node : null;
}
function turnDrag(e) {   // drag on empty space or another body part: the model turns, like right-drag
  const v = $('view'); let x = e.clientX, y = e.clientY; try { v.setPointerCapture(e.pointerId); } catch { /* fine */ }
  const move = ev => { st.orbit(ev.clientX - x, ev.clientY - y); x = ev.clientX; y = ev.clientY; store_.set('se_turned', '1'); if ($('viewhint')) $('viewhint').hidden = true; };
  const up = () => { v.removeEventListener('pointermove', move); v.removeEventListener('pointerup', up); v.removeEventListener('pointercancel', up); };
  v.addEventListener('pointermove', move); v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
}
function bindPaint(target, toPixel, reach, onModel) { let down = false, last = null;
  const twin = (a, b) => { const t = ED.painter.tool; if (ED.mirror && b.m && !SHAPES.has(t) && !ONCE.has(t)) ED.painter.stroke(a && a.m ? a.m : b.m, b.m); };
  let lastC = null, startC = null;
  const at = (x, y) => toPixel({ clientX: x, clientY: y });
  const along = (a, b, step = 2) => { const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)), out = []; for (let i = 1; i <= n; i++) out.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }); return out; };
  const outline = (a, b) => { const c = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a]; const pts = [a]; for (let i = 0; i < 4; i++) pts.push(...along(c[i], c[i + 1]), null); return pts; };
  const shapeOnModel = (cur, final) => { const t = ED.painter.tool, a = startC; let pts;
    if (t === 'line') pts = [a, ...along(a, cur)];
    else if (t === 'boxfill' && final) { pts = []; const x0 = Math.min(a.x, cur.x), x1 = Math.max(a.x, cur.x), y0 = Math.min(a.y, cur.y), y1 = Math.max(a.y, cur.y);
      for (let y = y0; y <= y1; y += 2) { for (let x = x0; x <= x1; x += 2) pts.push({ x, y }); pts.push(null); } }
    else pts = outline(a, cur);
    ED.painter.trace(pts.map(q => q && at(q.x, q.y)), reach); };
  target.addEventListener('pointerdown', e => { if (!ED || e.button !== 0 || (!onModel && (ED.painter.tool === 'select' || ED.mode === 'shape'))) return;
    if (ED.painter.tool === 'part' && ED.mode !== 'shape') { const node = partAt(e, onModel, toPixel); if (node) { e.preventDefault(); colourPart(node).catch(err => say(err.message, true)); return; } if (!onModel) return; }
    const p = onModel && (ED.painter.tool === 'select' || ED.painter.tool === 'part') ? null : toPixel(e);
    if (!p) { if (onModel && !st.gizmoBusy() && !(ED.mode === 'shape' && st.pickMesh(e.clientX, e.clientY, o => o.material?.map?.image === ED.canvas))) turnDrag(e); return; } e.preventDefault(); try { target.setPointerCapture(e.pointerId); } catch { /* fine */ }
    down = true; last = p; lastC = startC = { x: e.clientX, y: e.clientY }; ED.painter.begin();
    if (onModel && SHAPES.has(ED.painter.tool)) shapeOnModel(startC, false); else { ED.painter.stroke(p, p); twin(null, p); } });
  const paintTo = p => { if (!p) { last = null; return; } const from = last && Math.abs(last.x - p.x) + Math.abs(last.y - p.y) <= reach ? last : p; ED.painter.stroke(from, p); twin(from === last ? last : null, p); last = p; };
  target.addEventListener('pointermove', e => { if (!down || !ED) return; const cur = { x: e.clientX, y: e.clientY };
    if (!onModel) { const p = toPixel(e); if (p) { ED.painter.stroke(last && !SHAPES.has(ED.painter.tool) && Math.abs(last.x - p.x) + Math.abs(last.y - p.y) > reach ? p : last || p, p); twin(last, p); last = p; } return; }
    if (SHAPES.has(ED.painter.tool)) { shapeOnModel(cur, false); lastC = cur; return; }
    for (const q of along(lastC, cur)) paintTo(at(q.x, q.y));   // a fast drag is filled in between pointer positions, so it never breaks into dots
    lastC = cur; });
  const up = e => { if (!down) return; down = false; if (ED && onModel && SHAPES.has(ED.painter.tool) && ED.painter.tool === 'boxfill' && e && e.clientX != null) shapeOnModel({ x: e.clientX, y: e.clientY }, true); ED && ED.painter.end(); };
  target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
}
const urls = new Map();
function assetPicture(a) { const k = a.id + '@' + a.updated; if (!urls.has(k)) { for (const [o, u] of urls) if (o.startsWith(a.id + '@')) { URL.revokeObjectURL(u); urls.delete(o); } urls.set(k, URL.createObjectURL(a.data)); } return el('img', { alt: '', src: urls.get(k), draggable: false }); }
function downloadBlob(name, blob) { const a = el('a', { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const lockedBase = a => { const it = CAT.items[a.field].find(e => e.Id === a.baseId); return it ? tierOf(it) : 0; };
const modReady = a => lockedBase(a) === 0 && !a.flag;
// ---- paid items stay paid: no repaints of edition or reward items, and no repaints that copy one
// A custom asset keeps its base item's 3D shape, so it can only pass for a paid item that uses the same model. Its texture is
// compared, on the drawn area only, with every paid texture for that model: pixel colours (a straight copy) and the light and
// dark pattern around the average (a recolour). It is flagged when it matches a paid item closely and matches that item clearly
// better than its own free base.
const imgCache = new Map();
async function imageData(path) {   // { d, w, h } of a game texture
  if (imgCache.has(path)) return imgCache.get(path);
  let out = null;
  try { const b = await game.bitmap(game.common(path)), c = el('canvas', { width: b.width, height: b.height }), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(b, 0, 0); out = { d: x.getImageData(0, 0, b.width, b.height).data, w: b.width, h: b.height }; } catch { /* not readable */ }
  imgCache.set(path, out); return out;
}
function cropTo(data, mask, W, w, h) {   // the top-left w x h of a W-wide picture and its mask
  const d = new Uint8ClampedArray(w * h * 4), m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { d.set(data.subarray(y * W * 4, (y * W + w) * 4), y * w * 4); m.set(mask.subarray(y * W, y * W + w), y * w); }
  return [d, m];
}
function texturesFor(item, model) {   // [path, coloured?] for every look of an item on this model
  const out = [], take = s => { if (!s || s.Model !== model) return; if (s.Textures) for (const t of Object.values(s.Textures)) if (t.Texture) out.push([t.Texture, true]); if (s.GreyscaleTexture) out.push([s.GreyscaleTexture, false]); };
  take(item); for (const v of Object.values(item.Variants || {})) take({ ...item, ...v, Model: v.Model || item.Model });
  return out;
}
function likeness(mine, other, mask, coloured) {
  let n = 0, sa = 0, sb = 0;
  for (let k = 0; k < mask.length; k++) { const i = k * 4; if (!mask[k] || !mine[i + 3] || !other[i + 3]) continue; n++; sa += mine[i] + mine[i + 1] + mine[i + 2]; sb += other[i] + other[i + 1] + other[i + 2]; }
  if (n < 24) return 0; const ma = sa / n / 3, mb = sb / n / 3; let same = 0, shape = 0;
  for (let k = 0; k < mask.length; k++) { const i = k * 4; if (!mask[k] || !mine[i + 3] || !other[i + 3]) continue;
    if (coloured && Math.abs(mine[i] - other[i]) + Math.abs(mine[i + 1] - other[i + 1]) + Math.abs(mine[i + 2] - other[i + 2]) <= 36) same++;
    if (Math.abs((mine[i] + mine[i + 1] + mine[i + 2]) / 3 - ma - ((other[i] + other[i + 1] + other[i + 2]) / 3 - mb)) <= 10) shape++; }
  return Math.max(same, shape) / n;
}
async function replicaOf(a, canvas, mask) {
  const items = CAT.items[a.field].filter(e => !e.custom), paid = items.filter(e => tierOf(e) > 0 && texturesFor(e, a.model).length); if (!paid.length) return null;
  const w = canvas.width, h = canvas.height, mine = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const m = mask || new Uint8Array(w * h).fill(1), crops = new Map(), best = async e => { let s = 0; for (const [p, col] of texturesFor(e, a.model)) { const img = await imageData(p); if (!img || img.w > w || img.h > h) continue;
    const k = img.w + 'x' + img.h; if (!crops.has(k)) crops.set(k, img.w === w && img.h === h ? [mine, m] : cropTo(mine, m, w, img.w, img.h)); const [mm, mk] = crops.get(k); s = Math.max(s, likeness(mm, img.d, mk, col)); } return s; };
  const base = items.find(e => e.Id === a.baseId), own = base ? await best(base) : 0;
  let hit = null, top = 0; for (const e of paid) { const s = await best(e); if (s > top) { top = s; hit = e; } }
  return top >= 0.85 && top >= own + 0.1 ? itemName(hit) : null;
}
// ---- shapes: a reshaped item may not copy a paid item's shape either. Each model becomes its list of boxes (centre and sorted
// sizes, with every node's position, turn and offset applied); two shapes match when most boxes of each have a twin in the
// other (centre and sizes within a tolerance that grows with the box). Flagged like a texture copy: the shape matches a paid item closely
// and clearly better than the free item it was made from does.
function qmul(a, b) { return { x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z }; }
function qrot(q, v) { const p = qmul(qmul(q, { x: v[0], y: v[1], z: v[2], w: 0 }), { x: -q.x, y: -q.y, z: -q.z, w: q.w }); return [p.x, p.y, p.z]; }
function boxList(model) {
  const out = [], v = o => [o?.x ?? 0, o?.y ?? 0, o?.z ?? 0];
  const walk = (n, R, t) => { const q = { x: n.orientation?.x ?? 0, y: n.orientation?.y ?? 0, z: n.orientation?.z ?? 0, w: n.orientation?.w ?? 1 };
    const p = qrot(R, v(n.position)), R2 = qmul(R, q), t2 = [t[0] + p[0], t[1] + p[1], t[2] + p[2]], sh = n.shape || {}, o = qrot(R2, v(sh.offset)), c = [t2[0] + o[0], t2[1] + o[1], t2[2] + o[2]];
    if ((sh.type === 'box' || sh.type === 'quad') && sh.visible !== false) { const st = v(sh.stretch).map(x => x || 1), sz = v(sh.settings?.size).map((x, k) => Math.abs(x * st[k])).sort((a, b) => a - b); out.push({ c, s: sz }); }
    for (const ch of n.children || []) walk(ch, R2, c); };
  for (const n of model.nodes || []) walk(n, { x: 0, y: 0, z: 0, w: 1 }, [0, 0, 0]);
  return out;
}
function shapeLikeness(A, B) {
  if (!A.length || !B.length) return 0;
  // tolerances grow with the box, so small shifts and stretches of a copied shape still count as the same box
  const twin = (b, list) => list.some(a => Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1], a.c[2] - b.c[2]) <= Math.max(2.5, 0.3 * b.s[2]) && a.s.every((x, k) => Math.abs(x - b.s[k]) <= Math.max(2, 0.25 * b.s[k])));
  return Math.min(B.filter(b => twin(b, A)).length / B.length, A.filter(a => twin(a, B)).length / A.length);
}
async function shapeReplicaOf(a, model) {
  const items = CAT.items[a.field].filter(e => !e.custom), models = e => [...new Set([e.Model, ...Object.values(e.Variants || {}).map(v => v.Model)].filter(Boolean))];
  const mine = boxList(model), load = async p => { try { return boxList(await game.json(game.common(p))); } catch { return []; } };
  const base = items.find(e => e.Id === a.baseId); let own = 0;
  let hit = null, top = 0;
  for (const e of items.filter(e => tierOf(e) > 0)) for (const m of models(e)) { const s = shapeLikeness(mine, await load(m)); if (s > top) { top = s; hit = e;
    if (base) for (const bm of models(base)) own = Math.max(own, shapeLikeness(await load(bm), await load(m))); } }
  return top >= 0.8 && top >= own + 0.15 ? itemName(hit) : null;
}
async function checkReplica() {   // after an import, a recolour, a shape change or leaving the editor
  if (!ED) return; const e = ED;
  let flag = await replicaOf(e.asset, e.canvas, e.painter.mask).catch(() => null), why = 'looks';
  if (!flag && e.model && (e.shapeN || e.asset.shape)) { flag = await shapeReplicaOf(e.asset, e.model).catch(() => null); why = 'shape is'; }
  if ((flag || undefined) === e.asset.flag) return;
  e.asset = { ...e.asset, flag: flag || undefined }; queueAssetSave();
  if (flag) say(`This ${why} too close to ${flag}, a paid item. It stays on this site: it won't show in game or export. Change it more and the check clears.`, true);
  render();
}

const FLAG_WHY = n => `This looks too much like ${n}, a paid item, so it stays on this site and won't show in game. Change its colours or pattern more and the check clears by itself.`;
function anyItem() {   // or start from any free item in the game, worn or not
  const slots = game.FIELDS.filter(f => CAT.items[f].some(e => !e.custom && tierOf(e) === 0)), slot = el('select', { title: 'Slot' }, slots.map(f => el('option', { value: f, text: LABEL[f] })));
  const ok = e => !e.custom && tierOf(e) === 0 && !/^\s*\[?tmp\]?/i.test(itemName(e)) && !/(^|_)tmp(_|$)/i.test(e.Id);
  const item = el('select', { title: 'Item' }), find_ = el('input', { type: 'search', placeholder: 'Search', class: 'anysearch' }), pic = el('div', { class: 'pic anypic' });
  const pick = () => { const [f, id] = item.value.split('|'); return [f, CAT.items[f]?.find(x => x.Id === id)]; };
  const show = () => { const [f, e] = pick(); pic.replaceChildren(e ? itemThumb(f, e) : ''); };
  const fill = () => { const q = find_.value.trim().toLowerCase(), from = q ? slots : [slot.value];   // a search looks in every slot
    const list = from.flatMap(f => CAT.items[f].filter(e => ok(e) && (!q || itemName(e).toLowerCase().includes(q))).map(e => [itemName(e) + (q ? ` (${LABEL[f]})` : ''), f, e]));
    item.replaceChildren(...(list.length ? list.sort((a, b) => a[0].localeCompare(b[0])).map(([n, f, e]) => el('option', { value: f + '|' + e.Id, text: n })) : [el('option', { value: '', text: 'Nothing found' })])); show(); };
  slot.value = slots.includes(anyItem.slot) ? anyItem.slot : slots.includes('overtop') ? 'overtop' : slots[0]; fill(); slot.onchange = () => { anyItem.slot = slot.value; find_.value = ''; fill(); }; find_.oninput = fill; item.onchange = show;
  return [el('h3', { text: 'Or start from any item' }), el('div', { class: 'row anyitem' }, pic, el('div', { class: 'anycol' }, el('div', { class: 'row' }, slot, find_), item),
    el('button', { class: 'btn primary', text: 'Edit a copy', onclick: () => { const [f, e] = pick(); if (e) newAsset(f, R.partStr(e)); } }))];
}
function assetCard(a) {
  const act = (label, fn, cls) => el('button', { class: 'mini ' + (cls || ''), text: label, onclick: e => { e.stopPropagation(); fn(); } });
  const worn = cur.skin[a.field] && cur.skin[a.field].startsWith('Custom_' + a.id);
  return el('div', { class: 'skin asset' + (worn ? ' on' : ''), tabIndex: 0, title: 'Open in the creator', onclick: guard(() => openAsset(a)) },
    el('div', { class: 'pic tex' }, assetPicture(a)), el('b', { text: a.name }), el('small', { text: modReady(a) ? LABEL[a.field] : a.flag ? 'Site only: looks like ' + a.flag : 'Paid item: site only', title: a.flag ? FLAG_WHY(a.flag) : '' }),
    el('div', { class: 'acts' }, act('Edit', guard(() => openAsset(a)), 'primary'), worn ? el('span', { class: 'worn', text: 'Worn ✓', title: 'Your character has this on' }) : act('Wear', () => setSkin({ ...cur.skin, [a.field]: 'Custom_' + a.id + '.Mine' })),

      act('Delete', guard(async () => { if (!await confirmBox('Delete custom asset', `Delete "${a.name}"? Skins wearing it lose that part. This cannot be undone.`, 'Delete', true)) return;
        await assets.remove(a.id); ASSETS = await assets.list(); syncFolder(); registerAssets(); if (worn) setSkin(R.fit(cur.skin)); else cur.skin = R.fit(cur.skin); pics.clear(); rebuild(); pressing = false; render(); say(`Deleted "${a.name}"`); }), 'danger')));
}
const disclosure = () => el('div', { class: 'disclose' }, el('b', { text: 'Site only' }), el('span', { text: 'With the Skin Editor Sync mod installed and Show in game on, your character in your own worlds wears what you have on here, custom assets included. Repaints of edition and reward items stay on this site.' }));
// the drawn area over the flat texture: everything outside it is dimmed and each drawn face is outlined
function limits(c) {
  const z = ED.zoom, o = el('canvas', { className: 'limits', width: c.width * z, height: c.height * z }), x = o.getContext('2d');
  o.style.width = c.width * z + 'px';
  if (!ED.rects.length) return o;
  x.fillStyle = 'rgba(8, 14, 24, 0.72)'; x.fillRect(0, 0, o.width, o.height);
  for (const r of ED.rects) x.clearRect(r.x * z, r.y * z, r.w * z, r.h * z);
  x.strokeStyle = 'rgba(244, 196, 82, 0.9)'; x.lineWidth = 1;
  for (const r of ED.rects) x.strokeRect(r.x * z + 0.5, r.y * z + 0.5, r.w * z - 1, r.h * z - 1);
  const sel = ED.mode === 'shape' && curBox() ? curBox().node.name : null;   // Shape mode: the selected box's faces, lit blue
  if (sel) { x.fillStyle = 'rgba(127, 211, 255, 0.28)'; x.strokeStyle = '#7fd3ff'; x.lineWidth = 2;
    for (const r of ED.rects) if (r.node === sel) { x.fillRect(r.x * z, r.y * z, r.w * z, r.h * z); x.strokeRect(r.x * z + 1, r.y * z + 1, r.w * z - 2, r.h * z - 2); } x.lineWidth = 1; }
  if (z >= 4) { x.fillStyle = 'rgba(244, 196, 82, 0.95)'; x.font = '700 10px Lexend, sans-serif';
    for (const r of ED.rects) if (r.w * z > 34 && r.h * z > 14) x.fillText(r.face, r.x * z + 3, r.y * z + 11); }
  return o;
}
// ---------------------------------------------------------------- shapes: an asset's own copy of its item's 3D model
fig.setShapeSource(async id => {
  if (ED && ED.asset.id === id && ED.model) return ED.model;
  const a = ASSETS.find(x => x.id === id); if (!a || !a.shape) throw new Error('that shape is gone'); return JSON.parse(a.shape);
});
const boxesOf = m => { const out = []; const walk = (n, parent) => { const s = n.shape || {}; if ((s.type === 'box' || s.type === 'quad') && s.visible !== false) out.push({ node: n, parent }); for (const c of n.children || []) walk(c, n); }; for (const n of m.nodes) walk(n, null); return out; };
async function editModel() { if (!ED.model) ED.model = ED.asset.shape ? JSON.parse(ED.asset.shape) : structuredClone(await game.json(game.common(ED.asset.model))); return ED.model; }
function shapeChanged() {   // the preview, the drawn-area guide and the saved copy follow every edit
  ED.shapeN = (ED.shapeN || 0) + 1; ED.rects = fig.usedRects(ED.model); maskFromRects();
  registerAssets(); rebuild(); queueAssetSave(); render();
  clearTimeout(shapeChanged.t); shapeChanged.t = setTimeout(() => checkReplica(), 1200);
}
function maskFromRects() { const c = ED.canvas, m = new Uint8Array(c.width * c.height);
  for (const r of ED.rects) for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(c.height, Math.ceil(r.y + r.h)); y++) for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(c.width, Math.ceil(r.x + r.w)); x++) m[y * c.width + x] = 1;
  ED.painter.mask = ED.rects.length ? m : null; }
function outlineBox() {   // the selected box, outlined on the model while the shape tools are open
  if (!st) return; if (!ED || !ED.shapeOpen || !ED.model) return st.highlight(null);
  const b = boxesOf(ED.model)[ED.box || 0], tw = ED.sym ? twinOf(b) : null; st.highlight(b ? o => o.material?.map?.image === ED.canvas && (o.userData.nodeName === b.node.name || !!tw && o.userData.nodeName === tw.name) : null); }
// turning a box: its node's orientation as X/Y/Z degrees (applied X, then Y, then Z, as the 3D view does)
const D2R = Math.PI / 180;
function toEuler(q) { const { x = 0, y = 0, z = 0, w = 1 } = q || {};
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - w * z), m13 = 2 * (x * z + w * y), m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - w * x), m32 = 2 * (y * z + w * x), m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.max(-1, Math.min(1, m13))), far = Math.abs(m13) > 0.9999999;
  return [far ? Math.atan2(m32, m22) : Math.atan2(-m23, m33), ey, far ? 0 : Math.atan2(-m12, m11)].map(r => Math.round(r / D2R * 10) / 10); }
function toQuat(dx, dy, dz) { const [c1, c2, c3] = [dx, dy, dz].map(d => Math.cos(d * D2R / 2)), [s1, s2, s3] = [dx, dy, dz].map(d => Math.sin(d * D2R / 2)), r = v => Math.round(v * 1e6) / 1e6;
  return { x: r(s1 * c2 * c3 + c1 * s2 * s3), y: r(c1 * s2 * c3 - s1 * c2 * s3), z: r(c1 * c2 * s3 + s1 * s2 * c3), w: r(c1 * c2 * c3 - s1 * s2 * s3) }; }
// ---------------------------------------------------------------- the creator workspace, laid out like Blockbench
// top: name, Paint/Shape tabs, undo, redo, Done. Left edge: tools with their shortcut keys. Left panel: the texture. Middle: the
// model with view buttons and, in Shape mode, a gizmo. Right: colours and brush (Paint), or the outliner and box fields (Shape).
const PAINT_TOOLS = [['select', 'Select area', 'M', '⬚'], ['brush', 'Brush', 'B', '✎'], ['erase', 'Eraser', 'E', '⌫'], ['part', 'Colour a part (click a part to colour all of it)', 'P', '◩'], ['fill', 'Fill', 'F', '◧'], ['pick', 'Pick colour', 'I', '◉'], ['replace', 'Replace colour', 'H', '⇄'],
  ['line', 'Line', 'L', '╱'], ['box', 'Box', 'U', '▢'], ['boxfill', 'Filled box', '', '■'], ['light', 'Lighten', '', '☀'], ['dark', 'Darken', '', '☾'], ['noise', 'Noise', 'N', '░']];
const SHORT = { part: 'Part', more: 'More', select: 'Select', pick: 'Pick', replace: 'Replace', boxfill: 'Filled', light: 'Lighten', dark: 'Darken', dup: 'Copy', del: 'Delete' };   // names under the tool icons
const SHAPE_TOOLS = [['select', 'Select', 'V', '⬚'], ['move', 'Move', 'G', '✥'], ['resize', 'Resize', 'S', '⤢'], ['rotate', 'Rotate', 'R', '⟳']];
const recordPaint = () => { if (ED && !ED.replaying) { ED.hist.push({ k: 'p' }); ED.fut = []; } };
function recordShape(before) { ED.hist.push({ k: 's', other: before }); ED.fut = []; }
function undoEntry(e, redo) {
  if (e.k === 'p') { ED.replaying = true; redo ? ED.painter.redo() : ED.painter.undo(); ED.replaying = false; return e; }
  if (e.k === 'g') return { k: 'g', parts: e.parts.slice().reverse().map(x => undoEntry(x, redo)) };
  const now = JSON.stringify(ED.model); ED.model = JSON.parse(e.other); ED.box = Math.min(ED.box || 0, boxesOf(ED.model).length - 1); ED.reshaped = true; return { k: 's', other: now };
}
function wsUndo(redo) {
  if (!ED) return; ED.float = null; const from = redo ? ED.fut : ED.hist, to = redo ? ED.hist : ED.fut, e = from.pop(); if (!e) return;
  ED.reshaped = false; to.push(undoEntry(e, redo)); if (ED.reshaped) shapeChanged();
  ED.palette = ED.painter.palette(); render();
}
function shapeEdit(fn) {   // with Symmetry on, the box's twin on the other side follows the change
  const before = JSON.stringify(ED.model), b0 = curBox(), tw = symTwin(); fn();
  if (tw && b0 && b0.node !== tw && boxesOf(ED.model).some(x => x.node === b0.node) && boxesOf(ED.model).some(x => x.node === tw)) mirrorNode(b0.node, tw);
  finishShape(before); }
async function setMode(m) { if (ED.float) placeFloat(); if (m === 'shape') { await editModel(); ED.box ||= 0; ED.stool ||= 'select'; st.cursor(null); ED.hover = ED.hoverM = null; } ED.mode = m; ED.shapeOpen = m === 'shape'; render(); placeGizmo(); }
function pickTool(id) { if (ED.mode === 'shape') ED.stool = id; else { if (id !== 'select' && ED.float) placeFloat(); ED.painter.tool = id; } render(); placeGizmo(); }
function curBox() { return ED.model ? boxesOf(ED.model)[ED.box || 0] : null; }
function placeGizmo() {
  if (!st) return; wsAnim(); const b = ED && ED.mode === 'shape' && ['move', 'resize', 'rotate'].includes(ED.stool) ? curBox() : null;
  const mesh = b && st.findMesh(o => o.material?.map?.image === ED.canvas && o.userData.nodeName === b.node.name);
  if (!mesh) return st.gizmo(null);
  st.gizmo({ mesh, mode: ED.stool, onEnd: ({ move, scale, turn }) => shapeEdit(() => { const sh = b.node.shape, r = (v, q) => Math.round(v / q) * q;
    if (ED.stool === 'move') sh.offset = { x: r((sh.offset?.x ?? 0) + move.x, 0.5), y: r((sh.offset?.y ?? 0) + move.y, 0.5), z: r((sh.offset?.z ?? 0) + move.z, 0.5) };
    else if (ED.stool === 'resize') { const z = sh.settings.size; sh.settings.size = { x: Math.max(0, r(z.x * scale.x, 1)), y: Math.max(0, r(z.y * scale.y, 1)), z: Math.max(0, r((z.z ?? 0) * scale.z, 1)) }; }
    else { const k = v => Math.round(v * 1e6) / 1e6; b.node.orientation = { x: k(turn.x), y: k(turn.y), z: k(turn.z), w: k(turn.w) }; } }) });
}
// a number you can type, or drag left and right on its letter, like Blender and Blockbench
function scrub(label, get, set, step = 1, min = -64, max = 64) {
  const clamp = v => Math.max(min, Math.min(max, Math.round(v / step) * step));
  const inp = el('input', { type: 'number', step, min, max, value: Math.round(get() * 100) / 100, onchange: e => shapeEdit(() => set(clamp(Number(e.target.value) || 0))) });
  const lab = el('span', { class: 'scrub', text: label, title: 'Drag left or right to change it, or type a number' });
  lab.onpointerdown = e => { e.preventDefault(); const x0 = e.clientX, v0 = get(), before = JSON.stringify(ED.model), tw = symTwin(), me = curBox(); let moved = false, t = 0; lab.setPointerCapture(e.pointerId);
    lab.onpointermove = ev => { const v = clamp(v0 + Math.round((ev.clientX - x0) / 6) * step); if (v === get()) return; set(v); if (tw && me) mirrorNode(me.node, tw); inp.value = v; moved = true;
      clearTimeout(t); t = setTimeout(() => { registerAssets(); rebuild(); }, 60); };
    lab.onpointerup = () => { lab.onpointermove = lab.onpointerup = null; if (moved) finishShape(before); }; };
  return el('label', { class: 'numfield' }, lab, inp);
}
// the whole drawn area in one colour: each pixel keeps how light or dark it was compared with the item's average
function tintAll(hex, node) {   // node: only that box's texture area
  const P = ED.painter, c = ED.canvas, [r0, g0, b0] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  let m = P.mask; if (node) { m = new Uint8Array(c.width * c.height); let any = false; for (const r of ED.rects) if (r.node === node) { any = true; for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(c.height, Math.ceil(r.y + r.h)); y++) for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(c.width, Math.ceil(r.x + r.w)); x++) m[y * c.width + x] = 1; } if (!any) return; }
  P.write((d, W, H) => { let sum = 0, n = 0; for (let p = 0; p < W * H; p++) if (d[p * 4 + 3] && (!m || m[p])) { sum += lum(d, p * 4); n++; } if (!n) return;
    const avg = Math.max(1, sum / n);
    for (let p = 0; p < W * H; p++) { const i = p * 4; if (!d[i + 3] || (m && !m[p])) continue; const k = Math.min(1.8, Math.max(0.35, lum(d, i) / avg)); d[i] = Math.min(255, r0 * k); d[i + 1] = Math.min(255, g0 * k); d[i + 2] = Math.min(255, b0 * k); } });
  ED.palette = P.palette(); render(); checkReplica(); say(node ? `${partName(node)} is now this colour.` : 'The whole item is now this colour. Ctrl+Z undoes it.');
}
function paintSide() {
  const P = ED.painter, adj = { h: 0, s: 0, l: 0 };
  const slider = (label, min, max, step, get, set, fmt) => { const lab = el('span', { text: `${label} ${fmt(get())}` });
    return el('label', { class: 'wsslider' }, lab, el('input', { type: 'range', min, max, step, value: get(), oninput: e => { set(+e.target.value); lab.textContent = `${label} ${fmt(get())}`; } })); };
  const adjRow = (key, label, min, max) => { const set = v => { adj[key] = Math.max(min, Math.min(max, Math.round(v) || 0)); P.adjust(adj.h, adj.s / 100, adj.l / 100, false); };
    const num = el('input', { type: 'number', min, max, step: 1, value: adj[key], class: 'adjnum', onchange: e => { set(+e.target.value); rng.value = adj[key]; } }),
      rng = el('input', { type: 'range', min, max, step: 1, value: adj[key], oninput: e => { set(+e.target.value); num.value = adj[key]; } });
    return el('label', { class: 'wsslider adj' }, el('span', { text: label }), rng, num); };
  const endAdjust = keep => { if (!keep) adj.h = adj.s = adj.l = 0; P.adjust(adj.h, adj.s / 100, adj.l / 100, true); ED.palette = P.palette(); render(); if (keep) checkReplica(); };
  const toggle = (text, on, fn, title) => el('button', { class: 'chip' + (on ? ' on' : ''), text: `${text}: ${on ? 'on' : 'off'}`, title, onclick: fn });
  const chip = (text, fn, key, off) => el('button', { class: 'chip', text, title: key || '', disabled: !!off, onclick: () => { fn(); render(); } });
  if (ED.adjOpen) return [el('div', { class: 'wshead', text: 'Fine-tune colours of the whole item' }), el('p', { class: 'dim small', text: 'Type a number for exact steps. Keep saves it, Cancel puts it back.' }),
    adjRow('h', 'Hue', -180, 180), adjRow('s', 'Saturation', -100, 100), adjRow('l', 'Brightness', -100, 100),
    el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Keep', onclick: () => { ED.adjOpen = false; endAdjust(true); } }), el('button', { class: 'btn ghost', text: 'Cancel', onclick: () => { ED.adjOpen = false; endAdjust(false); } }))];
  return [el('div', { class: 'wshead', text: 'Colour' }),
    el('div', { class: 'row' }, el('input', { type: 'color', value: P.color, title: 'Any colour', oninput: e => { P.color = e.target.value; }, onchange: e => useColour(e.target.value) }), el('code', { class: 'hex', text: P.color })),
    el('div', { class: 'swlabel', text: 'Basic' }), swatchRow(BASIC), el('div', { class: 'swlabel', text: 'In this item' }), swatchRow(ED.palette),
    el('div', { class: 'swlabel', text: 'Recent' }), RECENT.length ? swatchRow(RECENT) : el('div', { class: 'swatches empty', text: 'Colours you use show here' }),
    el('button', { class: 'btn primary wide', text: 'Colour whole item', title: 'Turn the whole item this colour and keep its light and dark shading', onclick: () => tintAll(P.color) }),
    el('div', { class: 'wshead', text: 'Brush' }),
    slider('Size', 1, 8, 1, () => P.size, v => { P.size = v; }, v => v), slider('Strength', 10, 100, 10, () => Math.round(P.opacity * 100), v => { P.opacity = v / 100; }, v => v + '%'),
    P.tool === 'fill' ? slider('Similar colours', 0, 100, 4, () => P.tolerance, v => { P.tolerance = v; }, v => v ? v + '%' : 'exact only') : null,
    el('div', { class: 'options' }, toggle('Mirror', ED.mirror, () => { ED.mirror = !ED.mirror; render(); }, 'Painting on the model also paints the matching spot on the other side')),
    P.tool === 'select' || ED.sel || ED.float || ED.clip ? [el('div', { class: 'wshead', text: 'Selection' }), el('div', { class: 'options' },
      ...(ED.float ? [chip('Place', placeFloat, 'Enter'), chip('Flip ↔', () => flipFloat(true)), chip('Flip ↕', () => flipFloat(false)), chip('Cancel', () => { ED.float = null; render(); }, 'Esc')]
        : [chip('Copy', () => copySel(false), 'Ctrl+C', !ED.sel), chip('Cut', () => copySel(true), 'Ctrl+X', !ED.sel), chip('Paste', pasteClip, 'Ctrl+V', !ED.clip), chip('Clear', clearSel, 'Del', !ED.sel)]))] : null,
    ED.adjOpen ? [el('div', { class: 'wshead', text: 'Adjust colours of the whole item' }), adjRow('h', 'Hue', -180, 180), adjRow('s', 'Saturation', -100, 100), adjRow('l', 'Brightness', -100, 100),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Keep', onclick: () => { ED.adjOpen = false; endAdjust(true); } }), el('button', { class: 'btn ghost', text: 'Cancel', onclick: () => { ED.adjOpen = false; endAdjust(false); } }))]
      : el('button', { class: 'btn ghost wide', text: 'Fine-tune colours…', title: 'Shift the hue, saturation or brightness of the whole item', onclick: () => { ED.adjOpen = true; render(); } })];
}
// boxes get readable names: the player's own, else one made from the game's node name ("L-ArmCostume" -> "Left arm", new boxes -> "Box 2")
function boxLabel(node) {
  const own = ED.asset.labels && ED.asset.labels[node.name]; if (own) return own;
  if (/^Box_/.test(node.name)) { const all = boxesOf(ED.model).filter(b => /^Box_/.test(b.node.name)); return 'Box ' + (all.findIndex(b => b.node === node) + 1); }
  const s = node.name.replace(/Costume$/, '').replace(/^L-/, 'Left ').replace(/^R-/, 'Right ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : node.name;
}
function renameBox(btn, node) {
  const inp = el('input', { type: 'text', value: boxLabel(node), maxLength: 30, class: 'rename' });
  const done = keep => { if (keep) { const v = cleanName(inp.value).slice(0, 30); ED.asset = { ...ED.asset, labels: { ...(ED.asset.labels || {}), [node.name]: v || undefined } }; if (!v) delete ED.asset.labels[node.name]; queueAssetSave(); } render(); };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); }; inp.onblur = () => done(true);
  btn.replaceWith(inp); inp.focus(); inp.select();
}
// the texture view: the wheel zooms, right- or middle-drag pans; in Shape mode a click picks the box that owns that area
function fitTexture() { if (!ED) return; const w = $('wsleft').clientWidth - 26; ED.zoom = Math.max(1, Math.min(24, Math.floor(w / ED.canvas.width))); }
function bindTexView(box) {
  box.addEventListener('wheel', e => { if (!ED) return; e.preventDefault(); const z = Math.max(1, Math.min(24, ED.zoom + (e.deltaY < 0 ? 1 : -1))); if (z !== ED.zoom) { ED.zoom = z; render(); } }, { passive: false });
  box.addEventListener('contextmenu', e => e.preventDefault());
  box.addEventListener('pointerdown', e => {
    if (!ED) return;
    if (e.button === 1 || e.button === 2) { e.preventDefault(); const x0 = e.clientX, y0 = e.clientY, sx = box.scrollLeft, sy = box.scrollTop; box.setPointerCapture(e.pointerId);
      box.onpointermove = ev => { box.scrollLeft = sx - (ev.clientX - x0); box.scrollTop = sy - (ev.clientY - y0); }; box.onpointerup = () => { box.onpointermove = box.onpointerup = null; }; return; }
    if (e.button !== 0 || ED.mode !== 'shape') return;
    const c = ED.canvas, r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * c.width, y = (e.clientY - r.top) / r.height * c.height;
    const hit = ED.rects.filter(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]; if (!hit) return;
    const k = boxesOf(ED.model).findIndex(b => b.node.name === hit.node); if (k >= 0) { ED.box = k; render(); placeGizmo(); }
  });
}

// ---- first-time help: a short tour of the workspace, and a hint on the model until it has been turned once
const TOUR = [['#view', 'Paint right on the model', 'Drag on the item to paint it. Drag anywhere else to turn the model; the wheel zooms.'],
  ['#wsright', 'Colours', 'Pick a colour, then press Colour whole item to turn the whole thing that colour. Brush and Fill paint parts of it.'],
  ['#wsleft', 'The flat texture', 'The same item laid out flat. You can paint here too. Dimmed parts never show on the model.'],
  ['.wsmodes', 'Paint and Shape', 'Shape changes the form: make sleeves longer, add boxes, mirror them to the other side.'],
  ['#wsdone', 'Saved as you go', 'Every change saves by itself. Press Done when you are finished.']];
let tourLit = null;
function tour(i = 0) {
  document.querySelector('.tour')?.remove(); tourLit?.classList.remove('tourlit'); tourLit = null;
  if (i >= TOUR.length || !ED) { store_.set('se_tour', '1'); return; }
  const [sel, title, text] = TOUR[i], tg = document.querySelector(sel); if (!tg) return tour(i + 1);
  const last = i === TOUR.length - 1, box = el('div', { class: 'tour', role: 'dialog' }, el('b', { text: title }), el('p', { text }),
    el('div', { class: 'row' }, el('span', { class: 'dim', text: `${i + 1} of ${TOUR.length}` }), el('span', { class: 'grow' }),
      last ? null : el('button', { class: 'btn ghost', text: 'Skip', onclick: () => tour(99) }), el('button', { class: 'btn primary', text: last ? 'Got it' : 'Next', onclick: () => tour(i + 1) })));
  document.body.appendChild(box); tg.classList.add('tourlit'); tourLit = tg;
  const v = $('view').getBoundingClientRect(), bw = 290, bh = box.offsetHeight;   // always the bottom middle of the 3D view
  const x = Math.min(innerWidth - bw - 12, Math.max(12, v.left + v.width / 2 - bw / 2)), y = Math.max(12, v.bottom - bh - 14);
  box.style.left = x + 'px'; box.style.top = y + 'px';
}
function viewHint() {
  let h = $('viewhint'); if (!h) { h = el('div', { id: 'viewhint', class: 'viewhint' }); $('view').parentElement.appendChild(h);
    $('view').addEventListener('pointerdown', e => { if (e.button === 2 && ED) { store_.set('se_turned', '1'); $('viewhint').hidden = true; } }); }
  h.hidden = !ED || !!store_.get('se_turned'); clearTimeout(viewHint.t); if (!h.hidden) viewHint.t = setTimeout(() => { h.hidden = true; }, 9000);
  if (ED) h.textContent = ED.mode === 'shape' ? 'Click a box to pick it  ·  Drag empty space to turn  ·  Wheel zooms' : 'Drag on the item to paint  ·  Drag elsewhere to turn  ·  Wheel zooms';
}
// ---- colours: a fixed set of basics, the item's own colours and the ones used lately
const BASIC = ['#ffffff', '#c9c9c9', '#808080', '#3d3d3d', '#000000', '#e23b3b', '#ef8a35', '#f4d24a', '#7cc444', '#2e9a58', '#3db7c9', '#3b6fe0', '#7a4fd6', '#d65ab4', '#8a5a32', '#f2c9a1'];
let RECENT = (() => { try { const r = JSON.parse(store_.get('se_recent') || '[]'); return Array.isArray(r) ? r.filter(h => /^#[0-9a-f]{6}$/i.test(h)).slice(0, 8) : []; } catch { return []; } })();
function useColour(h) { const P = ED.painter; P.color = h; if (P.tool === 'pick' || P.tool === 'erase' || P.tool === 'select') P.tool = 'brush';
  RECENT = [h, ...RECENT.filter(x => x !== h)].slice(0, 8); store_.set('se_recent', JSON.stringify(RECENT)); render(); }
const swatchRow = list => el('div', { class: 'swatches' }, list.map(h => { const b = el('button', { title: h, class: h === ED.painter.color ? 'on' : '', onclick: () => useColour(h) }); b.style.background = h; return b; }));
// ---- the finish: after Done, say what happens next
async function finishAsset() {
  const a = ED.asset; await closeAsset(); const linked = FOLDER.state === 'on';
  const text = linked ? (SHOWGAME ? 'It is on your character in your own worlds too, through the Skin Editor Sync mod.' : 'Turn on In game to wear it in your own Hytale worlds (needs the Skin Editor Sync mod).')
    : 'To wear it in Hytale, install the Skin Editor Sync mod and pick a skins folder in the Locker.';
  const upd = cur.id && cur.name ? ` "${cur.name}" now wears it too.` : '';
  if (store_.get('se_finished')) return say(`Saved. You are wearing ${a.name}.${upd}`);
  store_.set('se_finished', '1');
  const btns = [{ label: 'Back to my items', value: 'back', primary: true }, { label: 'Keep editing', value: 'edit' }, { label: 'Make a copy', value: 'copy' },
    ...(linked && !SHOWGAME ? [{ label: 'Show in game', value: 'game' }] : !linked ? [{ label: 'Set up in game', value: 'setup' }] : [])];
  const unsaved = !cur.id || dirty;
  const big = el('img', { alt: '', draggable: false }); fig.build(R.fit(cur.skin), R).then(root => { big.src = fig.snapshot(root, 'full', false, 256); }).catch(() => {});   // drawn now, not behind the thumbnail queue
  const v = await ask('You are wearing it', [el('div', { class: 'finishpic' }, big), el('p', { text }),
    unsaved ? el('p', { class: 'dim', text: 'Your item is saved. The outfit you are wearing is not saved yet: press Save under the preview to keep it in My skins.' }) : null].filter(Boolean), btns);
  if (v === 'game') $('ingame').onclick(); else if (v === 'setup') setTab('wardrobe');
  else if (v === 'edit') { const x = ASSETS.find(y => y.id === a.id); if (x) openAsset(x); }
  else if (v === 'copy') newAsset(a.field);
}
// ---- resizing keeps the paint tidy: a box that grows gets fresh room on the texture, its old paint stretched to fit
const sizeOf = sh => ['x', 'y', 'z'].map(k => Math.ceil(Math.abs(sh.settings?.size?.[k] ?? 0)));
function tidyResized(beforeJson) {
  let before; try { before = JSON.parse(beforeJson); } catch { return []; }
  const old = new Map(); for (const b of boxesOf(before)) old.set(b.node.name, b.node.shape);
  const paints = [];
  for (const b of boxesOf(ED.model)) {
    const sh = b.node.shape, o = old.get(b.node.name); if (!o || !sh.textureLayout || !o.textureLayout) continue;
    const ns = sizeOf(sh), os = sizeOf(o); if (!ns.some((v, k) => v > os[k])) continue;   // only a box that grows can spill over other paint
    if (JSON.stringify(sh.textureLayout) !== JSON.stringify(o.textureLayout)) continue;
    const lay = allocLayout(sh) || (growTexture() ? allocLayout(sh) : null); if (!lay) { say('There is no free room on the texture for the bigger box, so its paint may look mixed up.', true); continue; }
    const src = o.textureLayout; sh.textureLayout = lay;
    paints.push((d, W, H) => { for (const [f, fu, fv] of faceDims(sh)) { const to = lay[f], from = src[f]; if (!to || !from) continue;
      const [ua, va] = FACE_UV[f], ou = Math.max(1, os[ua]), ov = Math.max(1, os[va]);
      for (let v = 0; v < fv; v++) for (let u = 0; u < fu; u++) { const [dx, dy] = texelAt(to, u, v); if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
        const [sx, sy] = texelAt(from, Math.min(ou - 1, Math.floor(u * ou / fu)), Math.min(ov - 1, Math.floor(v * ov / fv))); if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const i = (sy * W + sx) * 4, j = (dy * W + dx) * 4; d[j] = d[i]; d[j + 1] = d[i + 1]; d[j + 2] = d[i + 2]; d[j + 3] = d[i + 3]; } } });
    ED.rects = ED.rects.concat(fig.usedRects({ nodes: [b.node] }));   // the next grown box must not take the same room
  }
  return paints;
}
function finishShape(before) {
  const paints = tidyResized(before); recordShape(before);
  if (paints.length) { ED.painter.write((d, W, H) => paints.forEach(p => p(d, W, H))); ED.hist.push({ k: 'g', parts: ED.hist.splice(-2) }); }
  shapeChanged();
}
const CORE_TOOLS = ['select', 'brush', 'erase', 'part', 'fill', 'pick'];

function shapeSide() {
  const boxes = boxesOf(ED.model), i = Math.min(ED.box || 0, boxes.length - 1), b = boxes[i], sh = b.node.shape;
  const axisField = (lab, obj, key, ax, min, max, step = 1) => scrub(lab, () => obj[key]?.[ax] ?? 0, v => { obj[key] = { x: 0, y: 0, z: 0, ...obj[key], [ax]: v }; }, step, min, max);
  const turnField = (lab, k) => scrub(lab, () => toEuler(b.node.orientation)[k], v => { const d = toEuler(b.node.orientation); d[k] = v; b.node.orientation = toQuat(...d); }, 15, -180, 180);
  return [el('div', { class: 'wshead', text: 'Outliner' }),
    el('div', { class: 'outliner' }, boxes.map((x, k) => { const name = boxLabel(x.node), same = boxes.filter(y => boxLabel(y.node) === name), nth = same.length > 1 ? ' ' + (same.findIndex(y => y.node === x.node) + 1) : '';
      return el('button', { class: k === i ? 'on' : '', text: name + nth, title: 'Double-click to rename', onclick: () => { ED.box = k; render(); placeGizmo(); }, ondblclick: e => renameBox(e.currentTarget, x.node),
        onmouseenter: () => st.highlight(o => o.material?.map?.image === ED.canvas && o.userData.nodeName === x.node.name), onmouseleave: () => outlineBox() }); })),
    el('div', { class: 'options' }, ...[['Add box', () => addBox('add'), 'A: a new 4-block box in the brush colour'], ['Duplicate', () => addBox('dup'), 'Ctrl+D'], ['Mirror copy', () => addBox('mirror'), 'M: a copy on the other side, paint flipped'],
      ['Own paint', () => ownArea(), 'Give this box its own room on the texture, so painting it no longer paints other parts'], ['Delete', delBox, 'Del']].map(([t, fn, k]) => el('button', { class: 'chip', text: t, title: k, onclick: fn }))),
    el('div', { class: 'options' }, el('button', { class: 'chip' + (ED.sym ? ' on' : ''), text: `Symmetry: ${ED.sym ? 'on' : 'off'}`, title: 'Changes to a box also change its twin on the other side',
      onclick: () => { ED.sym = !ED.sym; render(); } }), ED.sym ? el('small', { class: 'dim', text: twinOf(b) ? 'Twin: ' + twinOf(b).name : 'No twin for this box' }) : null),
    el('div', { class: 'wshead', text: boxLabel(b.node) }),
    el('div', { class: 'wsgroup' }, el('b', { text: 'Position' }), axisField('X', sh, 'offset', 'x', -64, 64, 0.5), axisField('Y', sh, 'offset', 'y', -64, 64, 0.5), axisField('Z', sh, 'offset', 'z', -64, 64, 0.5)),
    el('div', { class: 'wsgroup' }, el('b', { text: 'Size' }),
      el('div', { class: 'sizebtns' }, ...[['Longer', 'y', 2], ['Shorter', 'y', -2], ['Wider', 'x', 2], ['Narrower', 'x', -2], ['Thicker', 'z', 2], ['Thinner', 'z', -2]].map(([t, ax, d]) =>
        el('button', { class: 'chip', text: t, title: ax === 'y' ? 'Changes the height; the top stays where it is' : '', onclick: () => shapeEdit(() => { const cur_ = sh.settings.size?.[ax] ?? 0, nv = Math.max(1, cur_ + d), dd = nv - cur_;
          sh.settings = { ...sh.settings, size: { x: 0, y: 0, z: 0, ...sh.settings.size, [ax]: nv } }; if (ax === 'y') sh.offset = { x: 0, y: 0, z: 0, ...sh.offset, y: (sh.offset?.y ?? 0) - dd / 2 }; }) }))),
      axisField('W', sh.settings, 'size', 'x', 0, 64), axisField('H', sh.settings, 'size', 'y', 0, 64), axisField('D', sh.settings, 'size', 'z', 0, 64)),
    el('div', { class: 'wsgroup' }, el('b', { text: 'Rotation' }), turnField('X', 0), turnField('Y', 1), turnField('Z', 2)),
    el('div', { class: 'row' }, el('button', { class: 'btn ghost', text: 'Reset shape', onclick: resetShape }))];
}
const dupBox = () => addBox('dup');
function delBox() { const boxes = boxesOf(ED.model), i = ED.box || 0, b = boxes[i]; if (boxes.length <= 1) return say('A shape needs at least one box.', true);
  if ((b.node.children || []).length) return say('This box holds other boxes. Delete those first.', true);
  shapeEdit(() => { const list = b.parent ? b.parent.children : ED.model.nodes; list.splice(list.indexOf(b.node), 1); ED.box = Math.max(0, i - 1); }); }
const resetShape = guard(async () => { if (!await confirmBox('Reset shape', 'Go back to the item’s original shape? You can undo this.', 'Reset', true)) return;
  const orig = structuredClone(await game.json(game.common(ED.asset.model))); shapeEdit(() => { ED.model = orig; ED.box = 0; }); });
function renderWorkspace() {
  const P = ED.painter, a = ED.asset, c = ED.canvas, mode = ED.mode || 'paint'; ED.shapeOpen = mode === 'shape';
  const tools = mode === 'paint' ? PAINT_TOOLS : SHAPE_TOOLS, active = mode === 'paint' ? P.tool : ED.stool || 'select';
  $('wstop').replaceChildren(...[
    el('input', { type: 'text', class: 'wsname', value: a.name, maxLength: 40, title: 'Name', onchange: e => { ED.asset = { ...ED.asset, name: cleanName(e.target.value) || a.name }; queueAssetSave(); } }),
    el('div', { class: 'wsmodes' }, [['paint', 'Paint'], ['shape', 'Shape']].map(([m, t]) => el('button', { class: mode === m ? 'on' : '', text: t, title: 'Tab switches', onclick: guard(() => setMode(m)) }))),
    el('span', { id: 'wssaved', class: 'wssaved', text: ED.saved === false ? 'Saving…' : 'Saved' }),
    el('span', { class: 'grow' }), a.flag ? el('button', { class: 'tag none', text: 'Site only: looks like ' + a.flag, title: FLAG_WHY(a.flag), onclick: () => say(FLAG_WHY(a.flag), true) }) : null,
    el('button', { class: 'btn icon', text: '↶', title: 'Undo (Ctrl+Z)', disabled: !ED.hist.length, onclick: () => wsUndo(false) }),
    el('button', { class: 'btn icon', text: '↷', title: 'Redo (Ctrl+Y)', disabled: !ED.fut.length, onclick: () => wsUndo(true) }),
    el('button', { class: 'btn icon', text: '?', title: 'Show the tips again', onclick: () => tour(0) }),
    el('button', { id: 'wsdone', class: 'btn primary', text: 'Done', onclick: () => finishAsset() })].filter(Boolean));
  const tool = (id, label, key, ic, on, fn) => el('button', { class: 'wstool' + (on ? ' on' : ''), title: label + (key ? ` (${key})` : ''), onclick: fn }, el('span', { text: ic }), el('b', { text: SHORT[id] || label }), key && key.length === 1 ? el('i', { text: key }) : null);
  const shown = mode === 'paint' ? tools.filter(t => ED.moreTools || CORE_TOOLS.includes(t[0]) || t[0] === active) : tools;
  $('wstools').replaceChildren(...shown.map(([id, label, key, ic]) => tool(id, label, key, ic, active === id, () => pickTool(id))),
    ...(mode === 'paint' ? [tool('more', ED.moreTools ? 'Fewer tools' : 'More tools', '', ED.moreTools ? '−' : '⋯', false, () => { ED.moreTools = !ED.moreTools; render(); })] : []),
    ...(mode === 'shape' ? [el('hr'), tool('dup', 'Duplicate box', 'Ctrl+D', '⧉', false, dupBox), tool('del', 'Delete box', 'Del', '✕', false, delBox)] : []));
  c.style.width = c.width * ED.zoom + 'px';
  if (!ED.box_) { ED.box_ = el('div', { class: 'paintbox' }); bindTexView(ED.box_); }
  ED.box_.replaceChildren(el('div', { class: 'paintwrap' }, c, limits(c), sizeOvl()));
  $('wsleft').replaceChildren(...[el('div', { class: 'wshead row' }, el('span', { text: 'Texture', class: 'grow' }),
      el('button', { class: 'chip' + (ED.wide ? ' on' : ''), text: ED.wide ? 'Smaller' : 'Bigger', title: 'Make the texture panel wider', onclick: () => { ED.wide = !ED.wide; $('app').classList.toggle('ws-wide', ED.wide); requestAnimationFrame(() => { fitTexture(); render(); }); } })),
    ED.box_,
    el('div', { class: 'row' }, el('button', { class: 'btn icon', text: '−', title: 'Zoom out (mouse wheel)', onclick: () => { ED.zoom = Math.max(1, ED.zoom - 1); render(); } }), el('button', { class: 'btn icon', text: '+', title: 'Zoom in (mouse wheel)', onclick: () => { ED.zoom = Math.min(24, ED.zoom + 1); render(); } }),
      ED.rects.length ? el('button', { class: 'chip' + (P.inside ? '' : ' on'), text: `Paint outside the item: ${P.inside ? 'off' : 'on'}`, title: 'The dimmed parts of the texture never show on the model. Turn this on to paint there anyway.', onclick: () => { P.inside = !P.inside; render(); } }) : null),
    ].filter(Boolean));
  $('wsright').replaceChildren(...(mode === 'paint' ? paintSide() : shapeSide()).flat(Infinity).filter(Boolean));
  viewHint();
  $('viewbtns').replaceChildren(...[['front', 'Front', '1'], ['back', 'Back', '2'], ['side', 'Side', '3'], ['top', 'Top', '7'], ['persp', 'Persp', '5']].map(([v, t, k]) => el('button', { text: t, title: `${t} view (${k})`, onclick: () => { st.setView(v); st.frameOn(ED.canvas); } })), animPicker(),
    el('button', { class: ED.iso ? 'on' : '', text: ED.iso ? 'Item only' : 'Whole body', title: 'Show only the item you are editing, or the whole character', onclick: () => { ED.iso = !ED.iso; st.isolate(ED.iso ? ED.canvas : null); render(); } }));
  const b = mode === 'shape' ? curBox() : null;
  $('wsstatus').textContent = mode === 'paint'
    ? `Paint · ${PAINT_TOOLS.find(t => t[0] === P.tool)?.[1] || P.tool} · ${P.tool === 'select' ? 'drag over the texture to select · Ctrl+C copy · Ctrl+V paste · drag the piece · Enter places' : 'drag on the item paints'} · drag elsewhere to turn · M select · Ctrl+Z undo · Tab: Shape`
    : `Shape · ${b ? boxLabel(b.node) : ''} · click a box on the model or its area on the texture · ${ED.stool === 'move' ? 'drag the arrows to move' : ED.stool === 'resize' ? 'drag the handles to resize' : ED.stool === 'rotate' ? 'drag the rings to turn' : 'G move, S resize, R rotate'} · A add · Ctrl+D duplicate · M mirror copy · Del delete · Tab: Paint`;
}
// shortcuts while the workspace is open (caught before the page's own Ctrl+Z, which undoes the skin)
addEventListener('keydown', e => {
  if (!ED || e.target?.matches?.('input, textarea, select') || $('dlg').open) return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey; let done = true;
  if (ctrl && k === 'z') wsUndo(e.shiftKey); else if (ctrl && k === 'y') wsUndo(true);
  else if (ctrl && k === 'd' && ED.mode === 'shape') dupBox();
  else if (ED.mode === 'shape' && !ctrl && (k === 'a' || k === 'm')) addBox(k === 'a' ? 'add' : 'mirror');
  else if (ED.mode !== 'shape' && ctrl && (k === 'c' || k === 'x')) copySel(k === 'x');
  else if (ED.mode !== 'shape' && ctrl && k === 'v') pasteClip();
  else if (ED.mode !== 'shape' && ctrl && k === 'a') { ED.sel = { x: 0, y: 0, w: ED.canvas.width, h: ED.canvas.height }; ED.painter.tool = 'select'; render(); }
  else if (ED.mode !== 'shape' && k === 'enter' && ED.float) { placeFloat(); render(); }
  else if (ED.mode !== 'shape' && k === 'escape' && (ED.float || ED.sel)) { if (ED.float) ED.float = null; else ED.sel = null; render(); }
  else if (ED.mode !== 'shape' && (k === 'delete' || k === 'backspace') && ED.sel && !ED.float) clearSel();
  else if ((k === 'delete' || k === 'x') && ED.mode === 'shape' && !ctrl) delBox();
  else if (k === 'tab') setMode(ED.mode === 'shape' ? 'paint' : 'shape');
  else if (['1', '2', '3', '7', '5'].includes(k) && !ctrl) { st.setView({ 1: 'front', 2: 'back', 3: 'side', 7: 'top', 5: 'persp' }[k]); st.frameOn(ED.canvas); }
  else if (!ctrl && !e.altKey) { const t = (ED.mode === 'shape' ? SHAPE_TOOLS : PAINT_TOOLS).find(x => x[2] && x[2].toLowerCase() === k); if (t) pickTool(t[0]); else done = false; }
  else done = false;
  if (done) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

// ---- brush outline, area selection and copy-paste on the flat texture
const brushSize = () => { const t = ED.painter.tool; return SHAPES.has(t) || ONCE.has(t) || t === 'select' ? 1 : ED.painter.size; };
function sizeOvl() { const o = ED.ovl, z = ED.zoom, c = ED.canvas; if (o.width !== c.width * z || o.height !== c.height * z) { o.width = c.width * z; o.height = c.height * z; o.style.width = c.width * z + 'px'; } drawOvl(); return o; }
function drawOvl() {
  if (!ED || !ED.ovl) return; const o = ED.ovl, z = ED.zoom, x = o.getContext('2d'); x.clearRect(0, 0, o.width, o.height);
  const box = (r, col, dash) => { for (const [c, w] of [['rgba(0,0,0,.7)', 3], [col, 1]]) { x.setLineDash(dash && w === 1 ? [4, 3] : []); x.strokeStyle = c; x.lineWidth = w; x.strokeRect(r.x * z + 0.5, r.y * z + 0.5, r.w * z - 1, r.h * z - 1); } x.setLineDash([]); };
  const f = ED.float;
  if (f) { if (!f.cv) { f.cv = el('canvas', { width: f.img.width, height: f.img.height }); f.cv.getContext('2d').putImageData(f.img, 0, 0); }
    x.imageSmoothingEnabled = false; x.drawImage(f.cv, f.x * z, f.y * z, f.img.width * z, f.img.height * z); box({ x: f.x, y: f.y, w: f.img.width, h: f.img.height }, '#7fd3ff', true); }
  else if (ED.sel) box(ED.sel, '#7fd3ff', true);
  if (ED.mode !== 'shape') { const s = brushSize(), off = Math.floor((s - 1) / 2); for (const [p, col] of [[ED.hover, '#ffffff'], [ED.hoverM, '#f4c452']]) if (p) box({ x: p.x - off, y: p.y - off, w: s, h: s }, col); }
}
function bindSelect(c, toPixel) {   // the Select tool: drag out an area, or drag a pasted piece to move it
  let drag = null;
  c.addEventListener('pointerdown', e => { if (!ED || e.button !== 0 || ED.painter.tool !== 'select' || ED.mode === 'shape') return; const p = toPixel(e); e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const f = ED.float; if (f && p.x >= f.x && p.y >= f.y && p.x < f.x + f.img.width && p.y < f.y + f.img.height) drag = { move: true, dx: p.x - f.x, dy: p.y - f.y };
    else { if (f) placeFloat(); drag = { x: p.x, y: p.y }; ED.sel = { x: p.x, y: p.y, w: 1, h: 1 }; } drawOvl(); });
  c.addEventListener('pointermove', e => { if (!drag || !ED) return; const p = toPixel(e);
    if (drag.move) { ED.float.x = p.x - drag.dx; ED.float.y = p.y - drag.dy; } else ED.sel = { x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x) + 1, h: Math.abs(p.y - drag.y) + 1 };
    drawOvl(); });
  const up = () => { if (drag) { drag = null; render(); } }; c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
}
function copySel(cut) {
  if (!ED.sel) return say('Pick the Select tool (M) and drag over the texture first.', true);
  const { x, y, w, h } = ED.sel; ED.clip = ED.canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h);
  if (cut) ED.painter.write((d, W) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) d[(j * W + i) * 4 + 3] = 0; });
  render();
}
function pasteClip() {
  if (!ED.clip) return say('Copy an area first (Ctrl+C).', true); if (ED.float) placeFloat();
  const at = ED.sel || ED.hover || { x: 0, y: 0 }; ED.float = { img: new ImageData(new Uint8ClampedArray(ED.clip.data), ED.clip.width, ED.clip.height), x: at.x, y: at.y };
  ED.painter.tool = 'select'; render();
}
function placeFloat() {   // stamps the pasted piece where it sits (see-through texels stay as they were; Inside only still holds)
  const f = ED.float; if (!f) return; ED.float = null; const P = ED.painter, w = f.img.width, h = f.img.height, s = f.img.data;
  P.write((d, W, H) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const X = f.x + i, Y = f.y + j, a = (j * w + i) * 4; if (X < 0 || Y < 0 || X >= W || Y >= H || !s[a + 3]) continue;
    const k = Y * W + X; if (P.inside && P.mask && !P.mask[k]) continue; d.set(s.subarray(a, a + 4), k * 4); } });
  ED.sel = { x: Math.max(0, f.x), y: Math.max(0, f.y), w, h };
}
function flipFloat(across) {
  const f = ED.float; if (!f) return; const w = f.img.width, h = f.img.height, s = f.img.data, out = new ImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const a = (j * w + i) * 4, b = ((across ? j : h - 1 - j) * w + (across ? w - 1 - i : i)) * 4; out.data.set(s.subarray(b, b + 4), a); }
  f.img = out; f.cv = null; drawOvl();
}
function clearSel() { const s = ED.sel; if (!s) return; ED.painter.write((d, W) => { for (let j = s.y; j < s.y + s.h; j++) for (let i = s.x; i < s.x + s.w; i++) d[(j * W + i) * 4 + 3] = 0; }); }

// ---- boxes with their own room on the texture, mirrored copies and symmetry
const FACE_UV = { front: [0, 1], back: [0, 1], right: [2, 1], left: [2, 1], top: [0, 2], bottom: [0, 2] };
const faceDims = sh => { const s = ['x', 'y', 'z'].map(k => Math.ceil(Math.abs(sh.settings?.size?.[k] ?? 0)));
  return (sh.type === 'quad' ? ['front'] : Object.keys(FACE_UV)).map(f => [f, s[FACE_UV[f][0]], s[FACE_UV[f][1]]]).filter(([, w, h]) => w > 0 && h > 0); };
function allocLayout(sh) {   // free room on the texture for a box's faces: one Blockbench-style block if it fits, else face by face
  const W = ED.canvas.width, H = ED.canvas.height, occ = new Uint8Array(W * H);
  for (const r of ED.rects) for (let y = Math.max(0, Math.floor(r.y)); y < Math.min(H, Math.ceil(r.y + r.h)); y++) for (let x = Math.max(0, Math.floor(r.x)); x < Math.min(W, Math.ceil(r.x + r.w)); x++) occ[y * W + x] = 1;
  const fits = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (occ[y * W + x]) return false; return true; };
  const spot = (w, h) => { for (let y = 0; y + h <= H; y++) for (let x = 0; x + w <= W; x++) if (fits(x, y, w, h)) return { x, y }; return null; };
  const face = (x, y) => ({ offset: { x, y }, mirror: { x: false, y: false }, angle: 0 }), dims = faceDims(sh); if (!dims.length) return null;
  if (dims.length === 6) { const by = Object.fromEntries(dims.map(d => [d[0], d])), w = by.front[1], h = by.front[2], d = by.top[2], at = spot(2 * (w + d), d + h);
    if (at) { const { x, y } = at; return { top: face(x + d, y), bottom: face(x + d + w, y), right: face(x, y + d), front: face(x + d, y + d), left: face(x + d + w, y + d), back: face(x + 2 * d + w, y + d) }; } }
  const out = {}; for (const [f, w, h] of dims.sort((a, b) => b[1] * b[2] - a[1] * a[2])) { const at = spot(w, h); if (!at) return null;
    for (let y = at.y; y < at.y + h; y++) occ.fill(1, y * W + at.x, y * W + at.x + w); out[f] = face(at.x, at.y); }
  return out;
}
function texelAt(fl, u, v) { const pu = (u + 0.5) * (fl.mirror?.x ? -1 : 1), pv = (v + 0.5) * (fl.mirror?.y ? -1 : 1), ox = fl.offset?.x ?? 0, oy = fl.offset?.y ?? 0, a = ((fl.angle | 0) % 360 + 360) % 360;
  const [X, Y] = a === 90 ? [ox - pv, oy + pu] : a === 180 ? [ox - pu, oy - pv] : a === 270 ? [ox + pv, oy - pu] : [ox + pu, oy + pv]; return [Math.floor(X), Math.floor(Y)]; }
// paints a box's faces in their new place: copied from the old place (flipped left to right for a mirror), or one colour
const paintFaces = (sh, dst, src, flip, rgb) => (d, W, H) => {
  for (const [f, fu, fv] of faceDims(sh)) { const to = dst[f], from = src && src[flip ? ({ left: 'right', right: 'left' }[f] || f) : f]; if (!to) continue;
    for (let v = 0; v < fv; v++) for (let u = 0; u < fu; u++) { const [dx, dy] = texelAt(to, u, v); if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue; const j = (dy * W + dx) * 4;
      if (rgb) { d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; d[j + 3] = 255; continue; } if (!from) continue;
      const [sx, sy] = texelAt(from, flip ? fu - 1 - u : u, v); if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue; const i = (sy * W + sx) * 4; d[j] = d[i]; d[j + 1] = d[i + 1]; d[j + 2] = d[i + 2]; d[j + 3] = d[i + 3]; } } };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function mirrorNode(src, dst) {   // dst becomes src flipped across the middle (left to right)
  const s = src.shape, d = dst.shape, p = src.position || {}, o = s.offset || {}, q = src.orientation || {}, neg = v => -(v ?? 0) || 0;
  d.settings = { ...d.settings, size: { ...s.settings?.size } }; if (s.type === 'quad' && /X$/.test(s.settings?.normal || '')) d.settings.normal = (s.settings.normal[0] === '+' ? '-' : '+') + 'X';
  d.offset = { x: neg(o.x), y: o.y ?? 0, z: o.z ?? 0 }; dst.position = { x: neg(p.x), y: p.y ?? 0, z: p.z ?? 0 }; dst.orientation = { x: q.x ?? 0, y: neg(q.y), z: neg(q.z), w: q.w ?? 1 };
}
function twinOf(b) {   // the box on the other side: a sibling with the same size at the mirrored place
  if (!b) return null; const n = b.node, sh = n.shape, near = (a, c) => Math.abs((a ?? 0) - (c ?? 0)) < 0.01;
  if (Math.abs((n.position?.x ?? 0) + (sh.offset?.x ?? 0)) < 0.25) return null;
  return (b.parent ? b.parent.children : ED.model.nodes).find(t => t !== n && t.shape && t.shape.type === sh.type && ['x', 'y', 'z'].every(k => near(t.shape.settings?.size?.[k], sh.settings?.size?.[k]))
    && near(t.shape.offset?.x, -(sh.offset?.x ?? 0)) && near(t.shape.offset?.y, sh.offset?.y) && near(t.shape.offset?.z, sh.offset?.z)
    && near(t.position?.x, -(n.position?.x ?? 0)) && near(t.position?.y, n.position?.y) && near(t.position?.z, n.position?.z)) || null;
}
const symTwin = () => ED.sym && ED.mode === 'shape' ? twinOf(curBox()) : null;
function addBox(kind = 'dup') {   // 'dup' a copy, 'mirror' a copy on the other side, 'add' a new 4-block box; each gets its own room on the texture
  const boxes = boxesOf(ED.model), b = boxes[ED.box || 0]; if (!b) return; if (boxes.length >= assets.MAX_BOXES) return say(`A shape can have up to ${assets.MAX_BOXES} boxes.`, true);
  const n = b.node, sh = n.shape;
  if (kind === 'mirror' && Math.abs((n.position?.x ?? 0) + (sh.offset?.x ?? 0)) < 0.25) return say('This box sits on the middle line. Move it to one side first, then mirror it.', true);
  let paint = null;
  shapeEdit(() => { const copy = structuredClone({ ...n, children: [] }), cs = copy.shape; copy.name = 'Box_' + Math.random().toString(36).slice(2, 7); cs.offset = { x: 0, y: 0, z: 0, ...cs.offset };
    if (kind === 'mirror') mirrorNode(n, copy); else if (kind === 'add') { const front = (sh.offset?.z ?? 0) + Math.abs(sh.settings?.size?.z ?? 0) / 2 * (n.shape?.stretch?.z || 1); cs.settings = { ...cs.settings, size: { x: 4, y: 4, z: cs.type === 'quad' ? 0 : 4 } }; cs.stretch = { x: 1, y: 1, z: 1 }; cs.offset.z = front + 2; } else cs.offset.x += 2;
    const lay = allocLayout(cs) || (growTexture() ? allocLayout(cs) : null); if (lay) { cs.textureLayout = lay; paint = paintFaces(cs, lay, sh.textureLayout, kind === 'mirror', kind === 'add' ? hexRgb(ED.painter.color) : null); }
    (b.parent ? b.parent.children : ED.model.nodes).push(copy); ED.box = boxesOf(ED.model).findIndex(x => x.node === copy); });
  if (paint) { ED.painter.write(paint); ED.hist.push({ k: 'g', parts: ED.hist.splice(-2) }); render(); if (kind === 'add') say('New box added on the front, outlined in gold. Move it with the Move tool (G) or the Position numbers.'); }
  else say('The texture has no free room left, so the new box shares paint with the box it came from.', true);
}
function ownArea(quiet) {   // move the selected box's paint to free room of its own, so it no longer shares texels with other boxes
  const b = curBox(); if (!b) return false; const sh = b.node.shape, old = structuredClone(sh.textureLayout || {}), lay = allocLayout(sh) || (growTexture() ? allocLayout(sh) : null);
  if (!lay) { if (!quiet) say('The texture is as big as it can be and has no free room left for this box.', true); return false; }
  shapeEdit(() => { sh.textureLayout = lay; }); ED.painter.write(paintFaces(sh, lay, old, false, null)); ED.hist.push({ k: 'g', parts: ED.hist.splice(-2) }); render();
  if (!quiet) say(`${boxLabel(b.node)} has its own paint now: painting it no longer paints other parts.`); return true;
}
// ---- a move playing while you work (paused while a gizmo is out, so the handles stay on the box)
function animChoices() { const have = k => { const [g, n] = k.split('/'); return (CAT.anims[g] || []).includes(n); };
  return [...new Set(['Default/Idle', 'Default/Walk', 'Default/Run', 'Default/Crouch', ...(EMOTES || [])])].filter(have); }
function wsAnim() {
  if (!ED || !st) return; const want = ED.mode === 'shape' && ['move', 'resize', 'rotate'].includes(ED.stool) ? null : ED.anim || null;
  if (want === ED.animOn) return; ED.animOn = want;
  if (!want) { clearTimeout(onceT); st.anim.set(null); st.anim.setMove(null); } else { const [g, n] = want.split('/'); playAnim(g, n, 1); }
}
const animPicker = () => el('select', { class: 'wsanim', title: 'Preview a move while you work', onchange: e => { ED.anim = e.target.value || null; wsAnim(); } },
  el('option', { value: '', text: 'Still', selected: !ED.anim }), animChoices().map(k => el('option', { value: k, text: nice(k.split('/')[1]), selected: ED.anim === k })));

function panelCreator() {
  if (!ED) { const worn = game.FIELDS.filter(f => R.resolve(f, cur.skin));
    const paidIn = f => { const it = R.find(f, cur.skin[f]), b = it && it.custom ? CAT.items[f].find(e => e.Id === it.baseId) : it; return b && tierOf(b) > 0; };
    const tile = f => { const it = R.find(f, cur.skin[f]), p = parse(cur.skin[f]), paid = paidIn(f);
      return el('div', { class: 'skin starttile' + (paid ? ' paid' : '') }, el('div', { class: 'pic' }, itemThumb(f, it, p.color, p.variant)), el('b', { text: itemName(it) }), el('small', { text: LABEL[f] }),
        paid ? el('small', { class: 'dim', text: 'Paid item' }) : it.custom ? el('div', { class: 'acts' }, el('button', { class: 'mini primary', text: 'Open', title: 'Keep editing your version', onclick: guard(() => { const a = ASSETS.find(x => 'Custom_' + x.id === it.Id); if (!a) throw new Error('That custom item is gone.'); return openAsset(a); }) }),
          el('button', { class: 'mini', text: 'Copy', title: 'Make a second version to edit', onclick: () => newAsset(f) }))
        : el('button', { class: 'mini primary', text: 'Edit a copy', onclick: () => newAsset(f) })); };
    return [head('Asset Creator'), el('div', { class: 'pbody' },
      el('h3', { text: 'Make your own version of something you wear' }), el('div', { class: 'cards' }, worn.map(tile)), anyItem(),
      el('h3', { text: `My custom assets (${ASSETS.length} / ${assets.MAX})` }),
      ASSETS.length ? el('div', { class: 'cards' }, ASSETS.map(assetCard)) : el('p', { class: 'blank', text: 'None yet. Pick an item above and press Edit a copy.' }))]; }
  return [];
}

// ---------------------------------------------------------------- wiring
for (const b of $('tabs').children) b.onclick = () => setTab(b.dataset.tab);
document.addEventListener('click', e => { const a = e.target.closest('a[data-tab]'); if (a) { e.preventDefault(); if (R) setTab(a.dataset.tab); else ask('How this works', el('p', { text: 'The editor reads the character files from your own Assets.zip and keeps them in this browser only. Nothing is uploaded, and this site hosts no Hytale files.' }), [{ label: 'OK', value: '', primary: true }]); } });
$('undo').onclick = () => step(-1); $('redo').onclick = () => step(1);
$('random').onclick = () => setSkin(R.random());
$('new').onclick = () => { flush(); cur = { id: null, kind: null, slot: null, name: '', skin: R.blank() }; hist = [JSON.stringify(cur.skin)]; hpos = 0; dirty = false; keepDraft(); rebuild(); render(); };
$('front').onclick = () => st.view(true);
$('ingame').onclick = async () => { SHOWGAME = !SHOWGAME; await db.put('meta', 'showInGame', SHOWGAME).catch(() => {}); drawGameSwitch(); pushWearing(); say(SHOWGAME ? 'Showing in game' : 'Your own skin is back in game'); };
$('save').onclick = save; $('saveas').onclick = saveAs;
addEventListener('keydown', e => { if (!R || e.target?.matches?.('input, textarea, select') || $('dlg').open) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); step(e.shiftKey ? 1 : -1); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); step(1); } });

(async function boot() {
  try {
    // Local development only: read the developer's own Assets.zip through the dev server (dev/ is never deployed).
    if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('devzip') && !(await game.status()))
      { const { devSource } = await import('../dev/devsource.js'); showConnect(); return doConnect(async () => game.importFrom(await devSource(), { name: 'Assets.zip (dev)', size: 0, modified: 0 }, progress)); }
    if (await game.status()) await startApp(); else showConnect();
  } catch (e) { console.error(e); showConnect(); $('connerr').textContent = 'This browser blocked local storage, which the editor needs. Try a normal (not private) window.'; }
})();
