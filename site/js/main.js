import { OrbitControls } from '../vendor/OrbitControls.js';
import * as game from './game.js';
import * as db from './db.js';
import * as fig from './figure.js';
import * as store from './store.js';
import { rules, sanitize, cleanName, parse, nice, LABEL, GROUPS, REQUIRED } from './skin.js';

const $ = id => document.getElementById(id);
// Every element is made here with textContent and properties: no HTML strings anywhere, so nothing typed, imported or looked up can inject markup.
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (v == null) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'data') Object.assign(e.dataset, v); else e[k] = v; }
  e.append(...kids.flat().filter(k => k != null && k !== false)); return e;
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
async function readJsonFile(file) { if (file.size > 2_000_000) throw new Error('That file is too large to be a skin.'); return JSON.parse(await file.text()); }

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
let found = [];   // skins brought in this session by a lookup or from files; not saved until the player saves them

async function startApp() {
  META = await game.status(); CAT = await game.catalog(); R = rules(CAT); setConn(META);
  $('connect').hidden = true; $('app').hidden = false;
  st ??= fig.stage($('view'), OrbitControls);
  WARD = await store.list();
  const draft = await db.get('meta', 'draft'), ds = sanitize(draft?.skin);
  cur = ds ? { id: draft.id || null, kind: draft.kind || null, slot: draft.slot ?? null, name: cleanName(draft.name), skin: R.fit(ds) } : { id: null, kind: null, slot: null, name: '', skin: R.blank() };
  if (cur.id && ![...WARD.game, ...WARD.custom].some(r => r && r.id === cur.id)) { cur.id = null; cur.kind = null; }
  hist = [JSON.stringify(cur.skin)]; hpos = 0; dirty = false;
  playAnim('Default', 'Idle', 0.5); render(); rebuild();
}
function open(rec, asNew) {   // put a skin on the stage: a wardrobe record, or a found skin (asNew)
  cur = asNew ? { id: null, kind: null, slot: null, name: cleanName(rec.name), skin: R.fit(rec.skin) } : { id: rec.id, kind: rec.kind, slot: rec.slot ?? null, name: rec.name, skin: R.fit(rec.skin) };
  hist = [JSON.stringify(cur.skin)]; hpos = 0; dirty = !!asNew; keepDraft(); rebuild(); plate();
}
function setSkin(s) { cur.skin = s; hist = hist.slice(0, hpos + 1); hist.push(JSON.stringify(s)); if (hist.length > 200) hist.shift(); hpos = hist.length - 1; dirty = true; keepDraft(); rebuild(); render(); }
function step(d) { const p = hpos + d; if (p < 0 || p >= hist.length) return; hpos = p; cur.skin = JSON.parse(hist[p]); dirty = true; keepDraft(); rebuild(); render(); }
function keepDraft() { clearTimeout(keepDraft.t); keepDraft.t = setTimeout(() => db.put('meta', 'draft', { id: cur.id, kind: cur.kind, slot: cur.slot, name: cur.name, skin: cur.skin }).catch(() => {}), 300); }
let building = 0;
async function rebuild() { const my = ++building;
  try { const root = await fig.build(cur.skin, R); if (my !== building) return fig.dispose(root); st.show(root); }
  catch (e) { console.error(e); if (my === building) say('Could not build this skin: ' + e.message, true); } }
function plate() {
  const tag = cur.kind === 'game' ? ['In-game slot ' + (cur.slot + 1), 'game'] : cur.kind === 'custom' ? ['My skin', 'custom'] : ['Not saved', 'none'];
  $('nameplate').replaceChildren(el('b', { text: cur.name || 'New skin' }), el('span', { class: 'tag ' + tag[1], text: tag[0] }), ...(dirty && cur.id ? [el('span', { class: 'tag none', text: 'Edited' })] : []));
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
function lazyImg(key, make) { const img = el('img', { alt: '', draggable: false }); if (pics.has(key)) img.src = pics.get(key); else { img._load = async () => { const u = await picture(key, make); if (u) img.src = u; }; lazy.observe(img); } return img; }
function itemThumb(f, it, color, variant) {
  const s = R.empty(); for (const k of BASE) s[k] = cur.skin[k]; s[f] = R.partStr(it, color, variant);
  const frame = HEADF.has(f) ? 'head' : LEGF.has(f) ? 'legs' : f === 'bodyCharacteristic' || f === 'skinFeature' ? 'body' : 'torso';
  return lazyImg('i|' + f + '|' + BASE.map(k => s[k]).join('|') + '|' + s[f], async () => fig.snapshot(await fig.build(s, R), frame, f === 'cape'));
}
// an animation's picture: the current skin caught part-way through the move
function animThumb(g, n) { const s = R.fit(cur.skin);
  return lazyImg('a|' + g + '|' + n + '|' + JSON.stringify(s), async () => { const [root, a] = await Promise.all([fig.build(s, R), fig.loadAnim(g, n)]);
    const an = new fig.Animator(); an.setFigure(root); an.set(a); an.t = an.duration * 0.45; an.apply(); return fig.snapshot(root, 'full'); }); }
const portrait = skin => { const s = R.fit(skin); return lazyImg('p|' + JSON.stringify(s), async () => fig.snapshot(await fig.build(s, R), 'full')); };

// ---------------------------------------------------------------- panels
function setTab(t) { tab = t; for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === t); if (R) render(); }
function render() { jobGen++; plate(); const p = $('panel'); p.className = 'panel tab-' + tab;
  p.replaceChildren(...({ editor: panelEditor, wardrobe: panelWardrobe, animations: panelAnimations, lookup: panelLookup, feedback: panelFeedback, help: panelHelp }[tab])()); }
const head = (title, right) => el('div', { class: 'phead' }, el('h2', { text: title }), right);

function panelEditor() {
  const fields = GROUPS.find(g => g[0] === group)[1].filter(f => R.ITEMS[f].length); if (!fields.includes(slot)) slot = fields[0];
  const it = R.find(slot, cur.skin[slot]), { color, variant } = parse(cur.skin[slot]);
  const change = (item, c, v) => setSkin({ ...cur.skin, [slot]: R.partStr(item, c, v) });
  const rail = el('div', { class: 'rail' }, GROUPS.map(([g]) => el('button', { class: g === group ? 'on' : '', text: g, onclick: () => { group = g; filter = ''; render(); } })));
  const sub = el('div', { class: 'rail sub' }, fields.map(f => el('button', { class: f === slot ? 'on' : '', onclick: () => { slot = f; filter = ''; render(); } }, el('span', { text: LABEL[f] }), el('small', { text: cur.skin[f] ? nice(parse(cur.skin[f]).id) : 'None' }))));
  const q = filter.toLowerCase(), items = R.ITEMS[slot].filter(e => nice(e.Id).toLowerCase().includes(q));
  const grid = el('div', { class: 'grid' },
    REQUIRED.has(slot) ? null : el('button', { class: 'tile none' + (!it ? ' on' : ''), title: 'None', onclick: () => change(null) }, el('span', { text: '✕' })),
    items.map(e => el('button', { class: 'tile' + (e === it ? ' on' : ''), title: nice(e.Id), onclick: () => change(e, color, variant) }, itemThumb(slot, e, color, variant))));
  const search = el('input', { type: 'search', placeholder: 'Search', value: filter, maxLength: 40, oninput: e => { filter = e.target.value; const g = panelEditor(); $('panel').querySelector('.grid').replaceWith(g[1].querySelector('.grid')); } });
  const cols = it ? R.colorsOf(it, variant) : [], vs = it?.Variants ? Object.keys(it.Variants) : [];
  const swatches = el('div', { class: 'swatches' }, cols.map(([k, base]) => { const b = el('button', { title: nice(k), class: k === color ? 'on' : '', onclick: () => change(it, k, variant) });
    const ok = (Array.isArray(base) ? base : [base]).filter(c => HEX.test(c)); b.style.background = ok.length > 1 ? `linear-gradient(135deg, ${ok.join(',')})` : ok[0] || '#888'; return b; }));
  const options = el('div', { class: 'options' }, vs.map(v => el('button', { class: 'chip' + (v === (variant || vs[0]) ? ' on' : ''), text: nice(v), onclick: () => change(it, color, v) })));
  const body = el('div', { class: 'pbody' }, el('div', { class: 'crumb' }, el('span', { text: group }), el('i', { text: '▸' }), el('b', { text: LABEL[slot] })), search, grid,
    cols.length ? [el('h3', { text: 'Color' }), swatches] : null, vs.length > 1 ? [el('h3', { text: 'Option' }), options] : null);
  return [head('Customize Avatar'), el('div', { class: 'editor' }, rail, sub, body)];
}

function card(rec, kind, i) {
  if (!rec) return el('div', { class: 'skin empty ' + kind }, el('div', { class: 'pic' }, el('span', { text: '+' })), el('b', { text: 'Slot ' + (i + 1) }), el('small', { text: 'Empty' }));
  const act = (label, fn, cls) => el('button', { class: 'mini ' + (cls || ''), text: label, onclick: e => { e.stopPropagation(); fn(); } });
  const acts = kind === 'game' ? [act('Set in game', () => checklist(rec)), act('Move out', () => moveOut(rec))]
    : kind === 'custom' ? [act('To in-game', () => toGame(rec)), act('Copy', () => duplicate(rec)), act('Export', () => download(rec.name.replace(/[^\w -]/g, '') + '.skin.json', { name: rec.name, skin: rec.skin })), act('Delete', () => removeSkin(rec), 'danger')]
    : [act('Save', () => { open(rec, true); saveAs(); })];
  return el('div', { class: 'skin ' + kind + (cur.id && cur.id === rec.id ? ' on' : ''), tabIndex: 0, title: 'Open in the editor', onclick: () => { open(rec, kind === 'found'); setTab('editor'); },
    onkeydown: e => { if (e.key === 'Enter') e.currentTarget.click(); } },
    el('div', { class: 'pic' }, portrait(rec.skin)), el('b', { text: rec.name }), kind === 'game' ? el('small', { text: 'Slot ' + (rec.slot + 1) }) : null, el('div', { class: 'acts' }, acts));
}
function panelWardrobe() {
  return [head('Wardrobe'), el('div', { class: 'pbody' },
    el('div', { class: 'shelf game' }, el('h3', {}, el('span', { text: 'In-game slots' }), el('em', { text: `${WARD.game.filter(Boolean).length} / ${store.GAME_SLOTS}` })),
      el('p', { class: 'note', text: 'These mirror your 5 presets inside Hytale. The site cannot read or change your Hytale account, so after you move a skin here, use "Set in game" for the list of parts to pick in My Avatar.' }),
      el('div', { class: 'cards' }, WARD.game.map((r, i) => card(r, 'game', i)))),
    el('div', { class: 'shelf custom' }, el('h3', {}, el('span', { text: 'My skins' }), el('em', { text: `${WARD.custom.length} / ${store.CUSTOM_MAX}` })),
      el('p', { class: 'note', text: 'Extra skins that live only on this site, in this browser. Back them up from Help.' }),
      WARD.custom.length ? el('div', { class: 'cards' }, WARD.custom.map(r => card(r, 'custom'))) : el('p', { class: 'blank', text: 'Nothing saved yet. Design a skin in the Editor and press Save.' })))];
}
async function refreshWard() { WARD = await store.list(); if (cur.id && ![...WARD.game, ...WARD.custom].some(r => r && r.id === cur.id)) { cur.id = null; cur.kind = null; cur.slot = null; } render(); }
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); say(e.message || 'That did not work.', true); } };
const slotButtons = () => WARD.game.map((r, i) => ({ label: `Slot ${i + 1}${r ? ': ' + r.name : ' (empty)'}`, value: String(i) }));
const toGame = guard(async rec => {
  const v = await ask('Move to an in-game slot', el('p', { text: `"${rec.name}" goes into the slot you pick. A skin already in that slot moves to My skins, so nothing is lost.` }), [...slotButtons(), { label: 'Cancel', value: '' }]);
  if (v === '') return; await store.swap(rec.id, +v); if (cur.id === rec.id) { cur.id = 'game-' + v; cur.kind = 'game'; cur.slot = +v; } await refreshWard(); say('Moved to in-game slot ' + (+v + 1));
});
const moveOut = guard(async rec => { await store.saveCustom(rec.name, rec.skin); await store.remove(rec.id); await refreshWard(); say('Moved to My skins'); });
const duplicate = guard(async rec => { await store.saveCustom(cleanName(rec.name + ' copy'), rec.skin); await refreshWard(); });
const removeSkin = guard(async rec => { if (!await confirmBox('Delete skin', `Delete "${rec.name}"? This cannot be undone.`, 'Delete', true)) return; await store.remove(rec.id); await refreshWard(); });
function checklist(rec) {
  const rows = GROUPS.flatMap(([g, fs]) => fs.filter(f => rec.skin[f]).map(f => { const p = parse(rec.skin[f]);
    return el('tr', {}, el('td', { text: g + ' ▸ ' + LABEL[f] }), el('td', { text: nice(p.id) }), el('td', { text: [p.color && nice(p.color), p.variant && nice(p.variant)].filter(Boolean).join(', ') })); }));
  ask(`Set "${rec.name}" in game`, [el('p', { text: `In Hytale, open My Avatar, choose preset ${rec.slot + 1} and pick these parts:` }), el('table', { class: 'parts' }, el('tbody', {}, rows))], [{ label: 'Done', value: '', primary: true }]);
}
async function save() { if (!cur.id) return saveAs();
  await guard(async () => { const r = cur.kind === 'game' ? await store.saveGame(cur.slot, cur.name, cur.skin) : await store.saveCustom(cur.name, cur.skin, cur.id); dirty = false; await refreshWard(); say(`Saved "${r.name}"`); })(); }
async function saveAs() {
  const name = el('input', { type: 'text', value: cur.name || '', maxLength: 40, placeholder: 'Skin name', autofocus: true });
  const where = el('select', {}, el('option', { value: 'custom', text: `My skins (${WARD.custom.length} / ${store.CUSTOM_MAX})` }), WARD.game.map((r, i) => el('option', { value: String(i), text: `In-game slot ${i + 1}${r ? ', replaces "' + r.name + '"' : ' (empty)'}` })));
  const v = await ask('Save skin', [el('label', { text: 'Name' }), name, el('label', { text: 'Save to' }), where], [{ label: 'Cancel', value: '' }, { label: 'Save', value: 'yes', primary: true }]);
  if (v !== 'yes') return; const n = cleanName(name.value) || 'Unnamed';
  await guard(async () => { const r = where.value === 'custom' ? await store.saveCustom(n, cur.skin) : await store.saveGame(+where.value, n, cur.skin);
    cur.id = r.id; cur.kind = r.kind; cur.slot = r.slot ?? null; cur.name = r.name; dirty = false; keepDraft(); await refreshWard(); say(`Saved "${r.name}"`); })();
}

// animations
let playing = { group: 'Default', name: 'Idle' };
const ORDER = ['Emote', 'Default', 'Poses', 'Taunt', 'Flavor', 'Expressions'];
async function playAnim(g, n, speed = 1) { try { const a = await fig.loadAnim(g, n); playing = { group: g, name: n }; st.anim.set(a, speed); st.anim.playing = true; } catch (e) { say('That animation could not be loaded.', true); } if (tab === 'animations') render(); }
let animGroup = 'Emote';
function panelAnimations() {
  const groups = Object.keys(CAT.anims).sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b)); if (!groups.includes(animGroup)) animGroup = groups[0];
  const A = st.anim;
  return [head('Animations'), el('div', { class: 'pbody' },
    el('p', { class: 'note', text: 'See how the skin moves. These are the game\'s own player animations, read from your game files.' }),
    el('div', { class: 'now' }, el('b', { text: A.anim ? nice(playing.name) : 'Rest pose' }),
      el('button', { class: 'btn ghost', text: A.playing ? 'Pause' : 'Play', onclick: () => { A.playing = !A.playing; render(); } }),
      el('button', { class: 'btn ghost', text: 'Rest pose', onclick: () => { A.set(null); render(); } })),
    el('div', { class: 'options' }, groups.map(g => el('button', { class: 'chip' + (g === animGroup ? ' on' : ''), text: nice(g), onclick: () => { animGroup = g; render(); } }))),
    el('div', { class: 'animlist' }, (CAT.anims[animGroup] || []).map(n => el('button', { class: A.anim && playing.group === animGroup && playing.name === n ? 'on' : '', title: nice(n), onclick: () => playAnim(animGroup, n) }, animThumb(animGroup, n), el('span', { text: nice(n) })))))];
}

// other players' skins
let lookupMsg = '';
const lookup = guard(async name => {
  name = name.trim(); if (!/^[A-Za-z0-9_-]{2,36}$/.test(name)) { lookupMsg = 'Type a Hytale username (letters, digits, _).'; return render(); }
  lookupMsg = 'Looking…'; render();
  try {
    const r = await fetch('https://playerdb.co/api/player/hytale/' + encodeURIComponent(name), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    const j = r.ok ? await r.json() : null, p = j?.data?.player, s = sanitize(p?.skin);
    if (!s) lookupMsg = r.status === 429 ? 'Too many lookups for now. Try again in a minute.' : 'No player with that name was found.';
    else { const nm = cleanName(p.username) || name; found = [{ name: nm, skin: s }, ...found.filter(f => f.name !== nm)].slice(0, 60); lookupMsg = ''; }
  } catch { lookupMsg = 'The lookup service could not be reached.'; }
  render();
});
async function importSkinFiles(files) { let n = 0;
  for (const f of [...files].slice(0, 200)) { try { const j = await readJsonFile(f), s = sanitize(j?.skin || j); if (s) { found.unshift({ name: cleanName(j?.name || f.name.replace(/(_portrait\.png)?\.(skin|json)+$/gi, '')).slice(0, 40) || 'Imported', skin: s }); n++; } } catch { /* not a skin file */ } }
  found = found.slice(0, 200); say(n ? `Brought in ${n} skin${n > 1 ? 's' : ''}` : 'No skins were found in those files.', !n); tab = 'lookup'; setTab('lookup'); }
function panelLookup() {
  const input = el('input', { type: 'text', placeholder: 'Hytale username', maxLength: 36, autocomplete: 'off', spellcheck: false });
  const form = el('form', { class: 'row', onsubmit: e => { e.preventDefault(); lookup(input.value); } }, input, el('button', { class: 'btn primary', text: 'Find' }));
  const file = el('input', { type: 'file', accept: '.json,.skin,application/json', multiple: true, hidden: true, onchange: e => { importSkinFiles(e.target.files); e.target.value = ''; } });
  return [head('Players'), el('div', { class: 'pbody' },
    el('h3', { text: 'Find a player' }), el('p', { class: 'note', text: 'Shows the skin a player has equipped right now. The name you type is sent to playerdb.co, a public community lookup service; nothing else is.' }), form, el('p', { class: 'err', text: lookupMsg }),
    el('h3', { text: 'Open skin files' }), el('p', { class: 'note', text: 'Your game keeps your equipped skin in UserData\\CachedPlayerSkins and the skins of players it has seen in UserData\\CachedAvatarPreviews (the .skin files). Choose or drop them here.' }),
    el('label', { class: 'btn ghost' }, 'Choose skin files', file),
    found.length ? [el('h3', { text: 'Found this session' }), el('div', { class: 'cards' }, found.map(r => card(r, 'found')))] : null)];
}

function panelHelp() {
  const sec = (t, ...ps) => [el('h3', { text: t }), ...ps.map(p => typeof p === 'string' ? el('p', { text: p }) : p)];
  const backupFile = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: guard(async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const r = await store.importAll(await readJsonFile(f)); await refreshWard(); say(`Restored ${r.added} skin${r.added === 1 ? '' : 's'}${r.skipped ? `, ${r.skipped} did not fit` : ''}`); }) });
  return [head('Help'), el('div', { class: 'pbody prose' },
    sec('How it works', 'The editor draws your character from the cosmetic files in your own copy of Hytale. When you connect, it reads the small character files out of Assets.zip and keeps a copy in this browser, on your computer. This website hosts no Hytale files and none of yours are uploaded.'),
    sec('Your game files', META ? `Connected: ${META.name}, ${META.files} character files, read on ${new Date(META.at).toLocaleDateString()}.` : 'Not connected yet.',
      'After a game update that adds cosmetics, connect again to pick them up.',
      el('div', { class: 'row' }, el('button', { class: 'btn ghost', text: 'Connect again', onclick: showConnect }),
        el('button', { class: 'btn danger', text: 'Forget game files', onclick: guard(async () => { if (!await confirmBox('Forget game files', 'Removes the copy of your game files from this browser. Your saved skins stay.', 'Forget', true)) return; await game.forget(); R = null; pics.clear(); fig.clearCache(); showConnect(); }) }))),
    sec('In-game slots and My skins', 'In-game slots (gold) mirror the 5 presets inside Hytale. My skins (blue) are up to 45 extra skins that exist only here. Hytale offers no way for other sites to read or change your presets, so you keep the gold slots in step yourself: "Set in game" lists exactly which parts to pick.'),
    sec('Back up your skins', 'Skins are stored in this browser only. Clearing site data, or using another browser or computer, starts empty. Keep a backup file.',
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
    el('p', { class: 'note', text: 'Reports are public and need a free GitHub account. This site collects nothing itself.' }))];
}

// ---------------------------------------------------------------- wiring
for (const b of $('tabs').children) b.onclick = () => setTab(b.dataset.tab);
document.addEventListener('click', e => { const a = e.target.closest('a[data-tab]'); if (a) { e.preventDefault(); if (R) setTab(a.dataset.tab); else ask('How this works', el('p', { text: 'The editor reads the character files from your own Assets.zip and keeps them in this browser only. Nothing is uploaded, and this site hosts no Hytale files.' }), [{ label: 'OK', value: '', primary: true }]); } });
$('undo').onclick = () => step(-1); $('redo').onclick = () => step(1);
$('random').onclick = () => setSkin(R.random());
$('new').onclick = () => { cur = { id: null, kind: null, slot: null, name: '', skin: R.blank() }; hist = [JSON.stringify(cur.skin)]; hpos = 0; dirty = false; keepDraft(); rebuild(); render(); };
$('front').onclick = () => st.view(true);
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
