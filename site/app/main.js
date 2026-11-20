import { OrbitControls } from '../vendor/OrbitControls.js';
import * as game from './game.js';
import * as db from './db.js';
import * as fig from './figure.js';
import * as store from './store.js';
import * as auth from './auth.js';
import * as assets from './assets.js';
import { createPainter, SHAPES, ONCE } from './paint.js';
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
const say = (t, bad) => { const s = $('status'); s.textContent = t || ''; s.classList.toggle('bad', !!bad); clearTimeout(say.t); if (t) say.t = setTimeout(() => s.textContent = '', 4000); };

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
  if (!st) { st = fig.stage($('view'), OrbitControls); bindPaint($('view'), e => ED ? st.pick(e.clientX, e.clientY, ED.canvas, ED.mirror) : null, 10, true); }
  try { if (await store.resumeFolder(false)) await reloadAssets(); } catch (e) { console.warn(e); }
  FOLDER = await store.folderState(); WARD = await store.list(); ACCOUNT = await auth.account().catch(() => null);
  const draft = await db.get('meta', 'draft'), ds = sanitize(draft?.skin);
  cur = ds ? { id: draft.id || null, kind: draft.kind || null, slot: draft.slot ?? null, name: cleanName(draft.name), skin: R.fit(ds) } : { id: null, kind: null, slot: null, name: '', skin: R.blank() };
  if (cur.id && ![...WARD.game, ...WARD.custom].some(r => r && r.id === cur.id)) { cur.id = null; cur.kind = null; }
  hist = [JSON.stringify(cur.skin)]; hpos = 0; dirty = false;
  playAnim('Default', 'Idle', 0.5); render(); rebuild(); pushWearing();
}
function open(rec, asNew) {   // put a skin on the stage: a wardrobe record, or a found skin (asNew)
  flush();
  cur = asNew ? { id: null, kind: null, slot: null, name: cleanName(rec.name), skin: R.fit(rec.skin) } : { id: rec.id, kind: rec.kind, slot: rec.slot ?? null, name: rec.name, skin: R.fit(rec.skin) };
  hist = [JSON.stringify(cur.skin)]; hpos = 0; dirty = !!asNew; keepDraft(); rebuild(); plate(); pushWearing();
}
function setSkin(s) { cur.skin = s; autosave(); pushWearing(); hist = hist.slice(0, hpos + 1); hist.push(JSON.stringify(s)); if (hist.length > 200) hist.shift(); hpos = hist.length - 1; dirty = true; keepDraft(); rebuild(); render(); }
function step(d) { const p = hpos + d; if (p < 0 || p >= hist.length) return; hpos = p; cur.skin = JSON.parse(hist[p]); dirty = true; autosave(); pushWearing(); keepDraft(); rebuild(); render(); }
// the companion mod dresses you in game from "<skins folder>/Wearing.json"
function pushWearing() { clearTimeout(pushWearing.t); pushWearing.t = setTimeout(async () => {
  if (FOLDER.state !== 'on') return;
  try { await store.writeWearing(SHOWGAME ? { on: true, name: cur.name || 'New skin', keepOwn: store.keepOwnOf(cur.skin), skin: cur.skin } : { on: false }); } catch (e) { console.warn(e); } }, 400); }
function drawGameSwitch() { const b = $('ingame'); if (!b) return; b.hidden = FOLDER.state !== 'on'; b.classList.toggle('primary', SHOWGAME); b.classList.toggle('ghost', !SHOWGAME);
  b.textContent = SHOWGAME ? 'In game: on' : 'In game: off'; b.title = SHOWGAME ? 'Your character in your own worlds wears this (Skin Editor mod)' : 'Show this skin on your character in your own worlds (needs the Skin Editor mod)'; }
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
function render() { jobGen++; plate(); drawEmotes(); drawGameSwitch(); const p = $('panel'), was = p.className, top = p.querySelector('.pbody')?.scrollTop || 0; p.className = 'panel tab-' + tab;
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

function card(rec, kind, i) {
  if (!rec) return el('div', { class: 'skin empty ' + kind }, el('div', { class: 'pic' }, el('span', { text: '+' })), el('b', { text: 'Slot ' + (i + 1) }), el('small', { text: 'Empty' }));
  const act = (label, fn, cls) => el('button', { class: 'mini ' + (cls || ''), text: label, onclick: e => { e.stopPropagation(); fn(); } });
  const acts = kind === 'game' ? [act('Set in game', () => checklist(rec)), act('Move out', () => moveOut(rec)), locked('Send to game', 'sending this skin to your in-game preset', 'mini')]
    : kind === 'custom' ? [act('To in-game', () => toGame(rec)), act('Copy', () => duplicate(rec)), act('Export', () => download(rec.name.replace(/[^\w -]/g, '') + '.skin.json', { name: rec.name, skin: rec.skin })), act('Delete', () => removeSkin(rec), 'danger')]
    : [act('Save', () => { open(rec, true); saveAs(); })];
  return el('div', { class: 'skin ' + kind + (cur.id && cur.id === rec.id ? ' on' : ''), tabIndex: 0, title: 'Open in the editor', onclick: () => { open(rec, kind === 'found'); setTab('editor'); },
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
  return el('div', { class: 'folder account on' }, el('div', {}, el('b', { text: 'Signed in as ' + ACCOUNT.username })),
    el('button', { class: 'btn ghost', text: 'Show my skin', onclick: () => { setTab('lookup'); lookup(ACCOUNT.username); } }),
    el('button', { class: 'btn ghost', text: 'Sign out', onclick: guard(async () => { await auth.signOut(); ACCOUNT = null; render(); }) }));
}
function folderRow() {
  if (!store.folderSupported) return el('p', { class: 'note', text: 'Saving to a folder needs Chrome or Edge.' });
  const after = async r => { FOLDER = await store.folderState(); await reloadAssets(); await refreshWard(); pushWearing(); if (r) say(r.imported ? `Folder connected, ${r.imported} skin${r.imported > 1 ? 's' : ''} brought in` : 'Folder connected'); };
  const btn = (t, fn, c = 'ghost') => el('button', { class: 'btn ' + c, text: t, onclick: guard(fn) });
  const [title, text] = FOLDER.state === 'on' ? ['Saving to folder: ' + FOLDER.name, 'Every skin and custom asset is a small file in this folder and updates as you edit.']
    : FOLDER.state === 'ask' ? ['Folder paused: ' + FOLDER.name, 'Your browser needs your OK again before it can write to the folder. Until then, changes are kept in the browser.']
    : ['Save skins to a folder', 'Pick a folder on your computer, for example a "Hytale Skins" folder in Documents. Each skin becomes a small file there and updates as you edit.'];
  return el('div', { class: 'folder ' + FOLDER.state }, el('div', {}, el('b', { text: title })),
    FOLDER.state === 'none' ? btn('Choose folder', async () => after(await store.chooseFolder()), 'primary')
      : [FOLDER.state === 'ask' ? btn('Reconnect', async () => after(await store.resumeFolder(true)), 'primary') : btn('Change', async () => after(await store.chooseFolder())),
         btn('Stop', async () => { await store.forgetFolder(); await after(); })]);
}
function panelWardrobe() {
  return [head('Locker'), el('div', { class: 'pbody' }, folderRow(), accountRow(),
    el('div', { class: 'shelf game' }, el('h3', {}, el('span', { text: 'In-game slots' }), el('em', { text: `${WARD.game.filter(Boolean).length} / ${store.GAME_SLOTS}` })),
      el('div', { class: 'row' }, locked('Load my presets', 'loading your in-game presets'), locked('Send all to game', 'sending skins to your in-game presets')), need('preset sync'),
      el('div', { class: 'cards' }, WARD.game.map((r, i) => card(r, 'game', i)))),
    el('div', { class: 'shelf custom' }, el('h3', {}, el('span', { text: 'My skins' }), el('em', { text: `${WARD.custom.length} / ${store.CUSTOM_MAX}` })),
      WARD.custom.length ? el('div', { class: 'cards' }, WARD.custom.map(r => card(r, 'custom'))) : el('p', { class: 'blank', text: 'Nothing saved yet. Design a skin in the Editor and press Save.' })))];
}
async function refreshWard() { WARD = await store.list(); if (cur.id && ![...WARD.game, ...WARD.custom].some(r => r && r.id === cur.id)) { cur.id = null; cur.kind = null; cur.slot = null; } render(); }
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { if (e && e.name === 'AbortError') return; console.error(e); say(e.message || 'That did not work.', true); } };
const slotButtons = () => WARD.game.map((r, i) => ({ label: `Slot ${i + 1}${r ? ': ' + r.name : ' (empty)'}`, value: String(i) }));
const toGame = guard(async rec => {
  if (hasCustom(rec.skin)) throw new Error('In-game slots cannot hold custom assets, because the game does not have them.');
  const v = await ask('Move to an in-game slot', el('p', { text: `"${rec.name}" goes into the slot you pick. A skin already in that slot moves to My skins, so nothing is lost.` }), [...slotButtons(), { label: 'Cancel', value: '' }]);
  if (v === '') return; await store.swap(rec.id, +v); if (cur.id === rec.id) { cur.id = 'game-' + v; cur.kind = 'game'; cur.slot = +v; } await refreshWard(); say('Moved to in-game slot ' + (+v + 1));
});
const moveOut = guard(async rec => { await store.saveCustom(rec.name, rec.skin); await store.remove(rec.id); await refreshWard(); say('Moved to My skins'); });
const duplicate = guard(async rec => { await store.saveCustom(cleanName(rec.name + ' copy'), rec.skin); await refreshWard(); });
const removeSkin = guard(async rec => { if (!await confirmBox('Delete skin', `Delete "${rec.name}"? This cannot be undone.`, 'Delete', true)) return; await store.remove(rec.id); await refreshWard(); });
function checklist(rec) {
  const rows = GROUPS.flatMap(([g, fs]) => fs.filter(f => rec.skin[f]).map(f => { const p = parse(rec.skin[f]), item = R.find(f, rec.skin[f]);
    return el('tr', {}, el('td', { text: g + ' ▸ ' + LABEL[f] }), el('td', { text: item ? itemName(item) : nice(p.id) }), el('td', { text: [p.color && nice(p.color), p.variant && nice(p.variant)].filter(Boolean).join(', ') })); }));
  ask(`Set "${rec.name}" in game`, [el('p', { text: `In Hytale, open My Avatar, choose preset ${rec.slot + 1} and pick these parts:` }), el('table', { class: 'parts' }, el('tbody', {}, rows))], [{ label: 'Done', value: '', primary: true }]);
}
async function save() { if (!cur.id) return saveAs();
  await guard(async () => { const r = cur.kind === 'game' ? await store.saveGame(cur.slot, cur.name, cur.skin) : await store.saveCustom(cur.name, cur.skin, cur.id); dirty = false; await refreshWard(); say(`Saved "${r.name}"`); })(); }
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
async function playAnim(g, n, speed = 1, once = false) { clearTimeout(onceT); try { const a = await fig.loadAnim(g, n); playing = { group: g, name: n }; st.anim.set(a, speed);
    if (once) { const still = fig.motionOf(g, n) && st.anim.still, ms = still ? 1700 : (Math.max(1, a.duration || 60) / 60 / speed) * 1000 + (a.holdLastKeyframe ? 700 : 0) + 250;
      onceT = setTimeout(() => { if (playing.group === g && playing.name === n) playAnim('Default', 'Idle', 0.5); }, ms); } st.anim.setMove(fig.motionOf(g, n)); st.anim.playing = true; drawEmotes(); } catch (e) { say('That animation could not be loaded.', true); } if (tab === 'animations') render(); }
let animGroup = 'Emote';
function panelAnimations() {
  const groups = Object.keys(CAT.anims).sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b)); if (!groups.includes(animGroup)) animGroup = groups[0];
  const A = st.anim;
  return [head('Animations'), el('div', { class: 'pbody' },
    el('div', { class: 'now' }, el('b', { text: A.anim ? nice(playing.name) : 'Rest pose' }),
      el('button', { class: 'btn ghost', text: A.playing ? 'Pause' : 'Play', onclick: () => { A.playing = !A.playing; render(); } }),
      el('button', { class: 'btn ghost', text: 'Rest pose', onclick: () => { A.set(null); render(); } })),
    el('div', { class: 'options' }, groups.map(g => el('button', { class: 'chip' + (g === animGroup ? ' on' : ''), text: nice(g), onclick: () => { animGroup = g; render(); } }))),
    el('div', { class: 'animlist' }, (CAT.anims[animGroup] || []).map(n => { const k = animGroup + '/' + n, pinned = EMOTES && EMOTES.includes(k);
      return el('button', { class: A.anim && playing.group === animGroup && playing.name === n ? 'on' : '', title: nice(n), onclick: () => playAnim(animGroup, n) }, animThumb(animGroup, n), el('span', { text: nice(n) }),
        el('i', { class: 'star' + (pinned ? ' on' : ''), title: pinned ? 'Remove from quick slots' : 'Add to quick slots', text: pinned ? '★' : '☆', onclick: e => { e.stopPropagation(); toggleEmote(animGroup, n); render(); } })); })))];
}

// other players' skins
let lookupMsg = '';
const lookup = guard(async name => {
  name = name.trim(); if (!/^[A-Za-z0-9_-]{2,36}$/.test(name)) { lookupMsg = 'Type a Hytale username or a player UUID.'; return render(); }
  lookupMsg = 'Looking…'; render();
  try {
    const r = await fetch('https://playerdb.co/api/player/hytale/' + encodeURIComponent(name), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    const j = r.ok ? await r.json() : null, p = j?.data?.player, s = sanitize(p?.skin);
    if (!s) lookupMsg = r.status === 429 ? 'Too many lookups for now. Try again in a minute.' : 'No player with that name or UUID was found.';
    else { const nm = cleanName(p.username) || name; found = [{ name: nm, skin: s }, ...found.filter(f => f.name !== nm)].slice(0, 60); lookupMsg = ''; }
  } catch { lookupMsg = 'The lookup service could not be reached.'; }
  render();
});
async function importSkinFiles(files) { let n = 0;
  for (const f of [...files].slice(0, 200)) { try { const j = await readJsonFile(f), s = sanitize(j?.skin || j); if (s) { found.unshift({ name: cleanName(j?.name || f.name.replace(/(_portrait\.png)?\.(skin|json)+$/gi, '')).slice(0, 40) || 'Imported', skin: s }); n++; } } catch { /* not a skin file */ } }
  found = found.slice(0, 200); say(n ? `Brought in ${n} skin${n > 1 ? 's' : ''}` : 'No skins were found in those files.', !n); tab = 'lookup'; setTab('lookup'); }
function panelLookup() {
  const input = el('input', { type: 'text', placeholder: 'Username or UUID', maxLength: 36, autocomplete: 'off', spellcheck: false });
  const form = el('form', { class: 'row', onsubmit: e => { e.preventDefault(); lookup(input.value); } }, input, el('button', { class: 'btn primary', text: 'Find' }));
  const file = el('input', { type: 'file', accept: '.json,.skin,application/json', multiple: true, hidden: true, onchange: e => { importSkinFiles(e.target.files); e.target.value = ''; } });
  return [head('Players'), el('div', { class: 'pbody' },
    el('h3', { text: 'Find a player' }), form, el('p', { class: 'err', text: lookupMsg }),
    el('h3', { text: 'Open skin files' }), el('label', { class: 'btn ghost' }, 'Choose skin files', file),
    found.length ? [el('h3', { text: 'Found this session' }), el('div', { class: 'cards' }, found.map(r => card(r, 'found')))] : null)];
}

function panelHelp() {
  const sec = (t, ...ps) => [el('h3', { text: t }), ...ps.map(p => typeof p === 'string' ? el('p', { text: p }) : p)];
  const backupFile = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: guard(async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const r = await store.importAll(await readJsonFile(f, 40_000_000)); await reloadAssets(); await refreshWard(); say(`Restored ${r.added} skin${r.added === 1 ? '' : 's'}${r.skipped ? `, ${r.skipped} did not fit` : ''}`); }) });
  return [head('Help'), el('div', { class: 'pbody prose' },
    sec('How it works', 'The editor draws your character from the cosmetic files in your own copy of Hytale. When you connect, it reads the small character files out of Assets.zip and keeps a copy in this browser, on your computer. This website hosts no Hytale files and none of yours are uploaded.'),
    sec('Your game files', META ? `Connected: ${META.name}, ${META.files} character files, read on ${new Date(META.at).toLocaleDateString()}.` : 'Not connected yet.',
      'After a game update that adds cosmetics, connect again to pick them up.',
      el('div', { class: 'row' }, el('button', { class: 'btn ghost', text: 'Connect again', onclick: showConnect }),
        el('button', { class: 'btn danger', text: 'Forget game files', onclick: guard(async () => { if (!await confirmBox('Forget game files', 'Removes the copy of your game files from this browser. Your saved skins stay.', 'Forget', true)) return; await game.forget(); R = null; pics.clear(); fig.clearCache(); showConnect(); }) }))),
    sec('In-game slots and My skins', 'In-game slots (gold) mirror the 5 presets inside Hytale. My skins (blue) are up to 45 extra skins that exist only here. Hytale offers no way for other sites to read or change your presets, so you keep the gold slots in step yourself: "Set in game" lists exactly which parts to pick.'),
    sec('Back up your skins', 'Skins are kept in this browser, and in your skins folder if you chose one in the Locker. Without a folder, clearing site data or switching browser starts empty, so keep a backup file.',
      el('div', { class: 'row' }, el('button', { class: 'btn ghost', text: 'Download backup', onclick: guard(async () => download('skin-editor-backup.json', await store.exportAll())) }), el('label', { class: 'btn ghost' }, 'Restore backup', backupFile))),
    sec('Privacy', 'No account, no cookies, no analytics, no ads. The only request this site makes to another server is the player lookup, and only when you press Find.'),
    sec('About', 'An unofficial fan tool. Not affiliated with or endorsed by Hypixel Studios. Hytale is a trademark of Hypixel Studios; the cosmetics you see come from your own game.'))];
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
    CAT.items[a.field].push({ ...base, Id: 'Custom_' + a.id, custom: true, baseId: a.baseId, Name: a.name, Model: a.model, Variants: undefined, GradientSet: undefined, GreyscaleTexture: undefined, IsDefaultAsset: false,
      Textures: { Mine: { Texture: `custom:${a.id}@${ED && ED.asset.id === a.id ? 'live' + ED.n : a.updated}`, BaseColor: ['#f4c452'] } } }); }
}
fig.setCustomSource(async id => {
  if (ED && ED.asset.id === id) return ED.canvas;
  const a = ASSETS.find(x => x.id === id); if (!a) throw new Error('that custom asset is gone');
  const bmp = await createImageBitmap(a.data), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); return c;
});
const newAsset = guard(async f => {
  if (ASSETS.length >= assets.MAX) throw new Error(`You have ${assets.MAX} custom assets, the most this site keeps. Delete one first.`);
  const r = R.resolve(f, cur.skin), it = R.find(f, cur.skin[f]); if (!r || !it) throw new Error('Wear something in that slot first.');
  const c = await fig.bakedCanvas(r.tex, r.tint), data = await new Promise(ok => c.toBlob(ok, 'image/png'));
  const a = await assets.save({ id: assets.newId(), name: itemName(it) + (it.custom ? ' copy' : ' (mine)'), field: f, baseId: it.custom ? it.baseId : it.Id, model: r.model, w: c.width, h: c.height, data });
  ASSETS = await assets.list(); registerAssets(); setSkin({ ...cur.skin, [f]: 'Custom_' + a.id + '.Mine' }); await openAsset(a);
});
async function openAsset(a) {
  if (ED) await closeAsset(true);
  const bmp = await createImageBitmap(a.data), c = el('canvas', { width: bmp.width, height: bmp.height, className: 'paint' }); c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0);
  ED = { asset: a, canvas: c, n: ++edN, zoom: Math.max(2, Math.min(8, Math.floor(440 / bmp.width))) };
  ED.painter = createPainter(c, final => { fig.refreshCustom(a.id); if (final) queueAssetSave(); }, () => render());
  ED.palette = ED.painter.palette(); bindPaint(c, e => { const r = c.getBoundingClientRect(); return { x: Math.min(c.width - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * c.width))), y: Math.min(c.height - 1, Math.max(0, Math.floor((e.clientY - r.top) / r.height * c.height))) }; }, 1e9);
  registerAssets(); st.anim.set(null); st.paintMode(true); tab = 'creator'; for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === 'creator'); render(); rebuild();
}
function queueAssetSave() { clearTimeout(queueAssetSave.t); queueAssetSave.t = setTimeout(() => flushAsset().catch(e => say(e.message, true)), 900); }
async function flushAsset() { clearTimeout(queueAssetSave.t); if (!ED) return; const e = ED, data = await new Promise(ok => e.canvas.toBlob(ok, 'image/png'));
  e.asset = await assets.save({ ...e.asset, data }); ASSETS = await assets.list(); syncFolder(); }
async function closeAsset(quiet) {
  if (!ED) return; await flushAsset().catch(e => say(e.message, true)); ED = null; registerAssets(); st.paintMode(false); pics.clear(); lastPic.clear();
  if (!quiet) { playAnim('Default', 'Idle', 0.5); rebuild(); render(); }
}
// painting: the same strokes whether the pointer is on the flat texture or on the 3D model
function bindPaint(target, toPixel, reach, onModel) { let down = false, last = null;
  const twin = (a, b) => { const t = ED.painter.tool; if (ED.mirror && b.m && !SHAPES.has(t) && !ONCE.has(t)) ED.painter.stroke(a && a.m ? a.m : b.m, b.m); };
  target.addEventListener('pointerdown', e => { if (!ED || e.button !== 0) return; const p = toPixel(e); if (!p) return; e.preventDefault(); try { target.setPointerCapture(e.pointerId); } catch { /* fine */ }
    down = true; last = p; ED.painter.begin(); ED.painter.stroke(p, p); twin(null, p); });
  target.addEventListener('pointermove', e => { if (!down || !ED) return; const p = toPixel(e); if (!p) { last = null; return; }
    const from = last && (Math.abs(last.x - p.x) + Math.abs(last.y - p.y) <= reach || (onModel && SHAPES.has(ED.painter.tool))) ? last : p;
    ED.painter.stroke(from, p); twin(from === last ? last : null, p); last = p; });   // on the model, a jump to another face starts a new dab instead of streaking across the texture
  const up = () => { if (!down) return; down = false; ED && ED.painter.end(); }; target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
}
const urls = new Map();
function assetPicture(a) { const k = a.id + '@' + a.updated; if (!urls.has(k)) { for (const [o, u] of urls) if (o.startsWith(a.id + '@')) { URL.revokeObjectURL(u); urls.delete(o); } urls.set(k, URL.createObjectURL(a.data)); } return el('img', { alt: '', src: urls.get(k), draggable: false }); }
function downloadBlob(name, blob) { const a = el('a', { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const lockedBase = a => { const it = CAT.items[a.field].find(e => e.Id === a.baseId); return it ? tierOf(it) : 0; };
const modReady = a => lockedBase(a) === 0;
function assetCard(a) {
  const act = (label, fn, cls) => el('button', { class: 'mini ' + (cls || ''), text: label, onclick: e => { e.stopPropagation(); fn(); } });
  const worn = cur.skin[a.field] && cur.skin[a.field].startsWith('Custom_' + a.id);
  return el('div', { class: 'skin asset' + (worn ? ' on' : ''), tabIndex: 0, title: 'Open in the creator', onclick: guard(() => openAsset(a)) },
    el('div', { class: 'pic tex' }, assetPicture(a)), el('b', { text: a.name }), el('small', { text: LABEL[a.field] }),
    el('div', { class: 'acts' }, act(worn ? 'Wearing' : 'Wear', () => setSkin({ ...cur.skin, [a.field]: 'Custom_' + a.id + '.Mine' })),
      act('Export', () => downloadBlob(a.name.replace(/[^\w -]/g, '') + '.png', a.data)),
      act('Delete', guard(async () => { if (!await confirmBox('Delete custom asset', `Delete "${a.name}"? Skins wearing it lose that part. This cannot be undone.`, 'Delete', true)) return;
        await assets.remove(a.id); ASSETS = await assets.list(); syncFolder(); registerAssets(); cur.skin = R.fit(cur.skin); pics.clear(); rebuild(); render(); }), 'danger')));
}
const disclosure = () => el('div', { class: 'disclose' }, el('b', { text: 'Site only' }), el('span', { text: 'With the Skin Editor mod installed and Show in game on, your character in your own worlds wears what you have on here, custom assets included. Repaints of edition and reward items stay on this site.' }));
function panelCreator() {
  if (!ED) { const worn = game.FIELDS.filter(f => R.resolve(f, cur.skin));
    const sel = el('select', {}, worn.map(f => el('option', { value: f, text: `${LABEL[f]}: ${itemName(R.find(f, cur.skin[f]))}` })));
    return [head('Asset Creator'), el('div', { class: 'pbody' }, disclosure(),
      el('h3', { text: 'Start from something you are wearing' }), el('div', { class: 'row' }, sel, el('button', { class: 'btn primary', text: 'Create', onclick: () => newAsset(sel.value) })),
      el('h3', { text: `My custom assets (${ASSETS.length} / ${assets.MAX})` }),
      ASSETS.length ? el('div', { class: 'cards' }, ASSETS.map(assetCard)) : el('p', { class: 'blank', text: 'None yet. Pick a slot above and press Create.' }))]; }
  const P = ED.painter, a = ED.asset, c = ED.canvas; c.style.width = c.width * ED.zoom + 'px';
  const tool = (id, label) => el('button', { class: 'chip' + (P.tool === id ? ' on' : ''), text: label, onclick: () => { P.tool = id; render(); } });
  const btn = (t, fn, cls = 'ghost') => el('button', { class: 'btn ' + cls, text: t, onclick: fn });
  const sizeLabel = el('label', { text: `Brush size ${P.size}` }), opLabel = el('label', { text: `Strength ${Math.round(P.opacity * 100)}%` });
  // recolour the whole item: three sliders that preview live and are kept or dropped together
  const adj = { h: 0, s: 0, l: 0 }, adjRow = (key, label, min, max) => { const lab = el('label', { text: `${label} 0` });
    return el('div', { class: 'grow' }, lab, el('input', { type: 'range', min, max, step: 1, value: 0, 'data-adj': key, oninput: e => { adj[key] = +e.target.value; lab.textContent = `${label} ${e.target.value}`; P.adjust(adj.h, adj.s / 100, adj.l / 100, false); } })); };
  const endAdjust = keep => { if (!keep) adj.h = adj.s = adj.l = 0; P.adjust(adj.h, adj.s / 100, adj.l / 100, true); ED.palette = P.palette(); render(); };
  const file = el('input', { type: 'file', accept: 'image/png', hidden: true, onchange: guard(async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 2_000_000) throw new Error('That image is too large.');
    const bmp = await createImageBitmap(f); if (bmp.width !== c.width || bmp.height !== c.height) throw new Error(`The image must be ${c.width} by ${c.height} pixels, the size of this texture.`); P.replace(bmp); ED.palette = P.palette(); render(); }) });
  return [head('Asset Creator'), el('div', { class: 'pbody' }, disclosure(),
    el('div', { class: 'row' }, el('input', { type: 'text', value: a.name, maxLength: 40, onchange: e => { ED.asset = { ...ED.asset, name: cleanName(e.target.value) || a.name }; queueAssetSave(); } }), btn('Done', () => closeAsset(), 'primary')),
    el('div', { class: 'options' }, tool('brush', 'Brush'), tool('erase', 'Eraser'), tool('fill', 'Fill'), tool('replace', 'Replace colour'), tool('pick', 'Pick colour'), tool('light', 'Lighten'), tool('dark', 'Darken'), tool('noise', 'Noise'),
      tool('line', 'Line'), tool('box', 'Box'), tool('boxfill', 'Filled box'),
      el('button', { class: 'chip' + (ED.mirror ? ' on' : ''), text: 'Mirror: ' + (ED.mirror ? 'on' : 'off'), title: 'When painting on the model, paint the matching spot on the other side too', onclick: () => { ED.mirror = !ED.mirror; render(); } })),
    el('div', { class: 'row tools' }, el('input', { type: 'color', value: P.color, title: 'Colour', oninput: e => { P.color = e.target.value; }, onchange: () => { if (P.tool === 'pick' || P.tool === 'erase') P.tool = 'brush'; render(); } }),
      el('div', { class: 'grow' }, sizeLabel, el('input', { type: 'range', min: 1, max: 8, step: 1, value: P.size, oninput: e => { P.size = +e.target.value; sizeLabel.textContent = `Brush size ${P.size}`; } })),
      el('div', { class: 'grow' }, opLabel, el('input', { type: 'range', min: 10, max: 100, step: 10, value: Math.round(P.opacity * 100), oninput: e => { P.opacity = +e.target.value / 100; opLabel.textContent = `Strength ${e.target.value}%`; } }))),
    el('div', { class: 'swatches' }, ED.palette.map(h => { const b = el('button', { title: h, class: h === P.color ? 'on' : '', onclick: () => { P.color = h; if (P.tool === 'pick' || P.tool === 'erase') P.tool = 'brush'; render(); } }); b.style.background = h; return b; })),
    el('div', { class: 'row' }, btn('Undo', () => P.undo()), btn('Redo', () => P.redo()), btn('Zoom −', () => { ED.zoom = Math.max(1, ED.zoom - 1); render(); }), btn('Zoom +', () => { ED.zoom = Math.min(16, ED.zoom + 1); render(); }),
      el('label', { class: 'btn ghost' }, 'Import PNG', file), btn('Export PNG', () => c.toBlob(b => downloadBlob(a.name.replace(/[^\w -]/g, '') + '.png', b), 'image/png'))),
    el('h3', { text: 'Recolour the whole item' }), el('div', { class: 'row tools' }, adjRow('h', 'Hue', -180, 180), adjRow('s', 'Saturation', -100, 100), adjRow('l', 'Brightness', -100, 100)),
    el('div', { class: 'row' }, btn('Keep recolour', () => endAdjust(true), 'primary'), btn('Cancel recolour', () => endAdjust(false))),
    el('div', { class: 'paintbox' }, c))];
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
addEventListener('keydown', e => { if (!R || e.target.matches('input, textarea, select') || $('dlg').open) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); step(e.shiftKey ? 1 : -1); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); step(1); } });

(async function boot() {
  try {
    // Local development only: read the developer's own Assets.zip through the dev server (dev/ is never deployed).
    if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('devzip') && !(await game.status()))
      { const { devSource } = await import('../dev/devsource.js'); showConnect(); return doConnect(async () => game.importFrom(await devSource(), { name: 'Assets.zip (dev)', size: 0, modified: 0 }, progress)); }
    if (await game.status()) await startApp(); else showConnect();
  } catch (e) { console.error(e); showConnect(); $('connerr').textContent = 'This browser blocked local storage, which the editor needs. Try a normal (not private) window.'; }
})();
