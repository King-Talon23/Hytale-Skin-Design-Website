// The pixel painter behind the asset creator. It edits one canvas (the item's texture) and knows nothing about 3D:
// callers hand it texture pixels to paint between, whether they came from the flat view or from a ray cast on the model.
const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
function toHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; }
function fromHsl(h, s, l) { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, i = Math.floor(h / 60) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; }

export const SHAPES = new Set(['line', 'box', 'boxfill']), ONCE = new Set(['pick', 'fill', 'replace']);   // drag-out shapes; tools that act once per click

export function createPainter(canvas, onChange, onPick) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }), W = canvas.width; let H = canvas.height;
  const undo = [], redo = []; let img = null, base = null, start = null, touched = null, fresh = false, dirty = false, adjFrom = null;
  const copy = () => { const d = ctx.getImageData(0, 0, W, H); return new ImageData(new Uint8ClampedArray(d.data), W, H); };
  function px(x, y) {   // one texel, once per stroke (so lighten, darken and see-through paint do not stack while the pointer rests)
    if (x < 0 || y < 0 || x >= W || y >= H) return; const k = y * W + x; if (touched.has(k)) return; touched.add(k);
    if (P.inside && P.mask && !P.mask[k]) return;   // outside the drawn area: never shows on the model
    const d = img.data, i = k * 4, t = P.tool;
    if (t === 'erase') d[i + 3] = 0;
    else if (t === 'light' || t === 'dark') { if (!d[i + 3]) return; const m = t === 'light' ? 1.12 : 0.88; for (let c = 0; c < 3; c++) d[i + c] = clamp(d[i + c] * m + (m > 1 ? 4 : -4)); }
    else if (t === 'noise') { if (!d[i + 3]) return; const n = (Math.random() - 0.5) * 26; for (let c = 0; c < 3; c++) d[i + c] = clamp(d[i + c] + n); }
    else { const [r, g, b] = rgb(P.color), a = d[i + 3] ? P.opacity : 1; d[i] = clamp(d[i] * (1 - a) + r * a); d[i + 1] = clamp(d[i + 1] * (1 - a) + g * a); d[i + 2] = clamp(d[i + 2] * (1 - a) + b * a); d[i + 3] = 255; }
  }
  function dot(x, y) { const s = P.size, o = Math.floor((s - 1) / 2); for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) px(x - o + dx, y - o + dy); }
  function line(a, b) { let x = a.x, y = a.y; const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y), sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1; let e = dx + dy;
    for (let n = 0; n < 4096; n++) { dot(x, y); if (x === b.x && y === b.y) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x += sx; } if (e2 <= dx) { e += dx; y += sy; } } }
  function box(a, b, filled) { const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    if (filled) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y); return; }
    for (const [p, q] of [[{ x: x0, y: y0 }, { x: x1, y: y0 }], [{ x: x1, y: y0 }, { x: x1, y: y1 }], [{ x: x1, y: y1 }, { x: x0, y: y1 }], [{ x: x0, y: y1 }, { x: x0, y: y0 }]]) line(p, q); }
  const colourAt = (d, i) => [d[i], d[i + 1], d[i + 2], d[i + 3]], is = (d, i, c) => d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2] && d[i + 3] === c[3];
  function flood(x, y) {   // fills the connected area of one exact colour
    const d = img.data, at = (X, Y) => (Y * W + X) * 4, from = colourAt(d, at(x, y)), [r, g, b] = rgb(P.color); if (is(d, at(x, y), [r, g, b, 255])) return;
    const tol = P.tolerance * 3, near = i => from[3] ? d[i + 3] && Math.abs(d[i] - from[0]) + Math.abs(d[i + 1] - from[1]) + Math.abs(d[i + 2] - from[2]) <= tol : !d[i + 3];
    const seen = new Uint8Array(W * H), stack = [[x, y]];
    while (stack.length) { const [X, Y] = stack.pop(); if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const k = Y * W + X, i = k * 4; if (seen[k] || !near(i)) continue; seen[k] = 1;
      if (P.inside && P.mask && !P.mask[k]) continue;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; stack.push([X + 1, Y], [X - 1, Y], [X, Y + 1], [X, Y - 1]); }
  }
  function replaceAll(x, y) {   // every texel of the clicked colour, wherever it is on the texture
    const d = img.data, from = colourAt(d, (y * W + x) * 4), [r, g, b] = rgb(P.color); if (!from[3]) return;
    for (let i = 0; i < d.length; i += 4) if (is(d, i, from)) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  }
  function fillSide(x, y) {   // the whole side of a box under the click, in one colour (the caller says where that side sits on the texture)
    const r = P.faceAt && P.faceAt(x, y); if (!r) return flood(x, y); const d = img.data, [cr, cg, cb] = rgb(P.color);
    for (let Y = Math.max(0, Math.floor(r.y)); Y < Math.min(H, Math.ceil(r.y + r.h)); Y++) for (let X = Math.max(0, Math.floor(r.x)); X < Math.min(W, Math.ceil(r.x + r.w)); X++) {
      const i = (Y * W + X) * 4; d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = 255; } }
  function fillEvery(x, y) {   // every texel close to the clicked colour, anywhere on the item ("Similar colours" sets how close)
    const d = img.data, from = colourAt(d, (y * W + x) * 4), [r, g, b] = rgb(P.color), tol = P.tolerance * 3; if (!from[3]) return flood(x, y);
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3] || Math.abs(d[i] - from[0]) + Math.abs(d[i + 1] - from[1]) + Math.abs(d[i + 2] - from[2]) > tol) continue;
      if (P.inside && P.mask && !P.mask[i / 4]) continue; d[i] = r; d[i + 1] = g; d[i + 2] = b; } }
  const show = () => { ctx.putImageData(img, 0, 0); dirty = true; onChange(false); };
  function swap(from, to) { if (!from.length) return; to.push(copy()); ctx.putImageData(from.pop(), 0, 0); onChange(true); }
  const P = { tool: 'brush', size: 1, color: '#e0b050', opacity: 1, inside: true, mask: null, tolerance: 24, fillMode: 'area', faceAt: null,   // tolerance: how far a colour may differ (0-100) and still count as the same for Fill
    begin() { img = ctx.getImageData(0, 0, W, H); base = new ImageData(new Uint8ClampedArray(img.data), W, H); undo.push(base); if (undo.length > 40) undo.shift(); touched = new Set(); fresh = true; dirty = false; start = null; },
    stroke(a, b) { if (!img) return; const first = fresh, t = P.tool; fresh = false; if (first) start = a;
      if (t === 'pick') { if (first) { const i = (b.y * W + b.x) * 4, d = img.data; if (d[i + 3]) { P.color = hex(d[i], d[i + 1], d[i + 2]); onPick && onPick(); } } return; }
      if (t === 'fill' || t === 'replace') { if (first) { (t === 'replace' ? replaceAll : P.fillMode === 'side' ? fillSide : P.fillMode === 'every' ? fillEvery : flood)(b.x, b.y); show(); } return; }
      if (SHAPES.has(t)) { img.data.set(base.data); touched.clear(); if (t === 'line') line(start, b); else box(start, b, t === 'boxfill'); show(); return; }   // the shape is redrawn from where the drag began
      line(a, b); show(); },
    end() { if (!img) return; if (dirty) { redo.length = 0; onChange(true); } else undo.pop(); img = null; base = null; touched = null; },
    undo() { swap(undo, redo); }, redo() { swap(redo, undo); },
    // the texture gets taller: the picture and every undo step keep their pixels where they were, the new rows are empty
    grow(h2) { const old = copy(); canvas.height = h2; H = h2; ctx.putImageData(old, 0, 0);
      const pad = im => { const n = new ImageData(W, h2); n.data.set(im.data); return n; }; for (const a of [undo, redo]) a.forEach((im, i) => { a[i] = pad(im); }); if (adjFrom) adjFrom = pad(adjFrom); },
    // a shape dragged out on the 3D model: the texels under points along the drag, joined where they sit next to each other
    trace(points, reach) { if (!img) return; fresh = false; img.data.set(base.data); touched.clear(); let prev = null;
      for (const p of points) { if (!p) { prev = null; continue; } if (prev && Math.abs(prev.x - p.x) + Math.abs(prev.y - p.y) <= reach) line(prev, p); else dot(p.x, p.y); prev = p; }
      show(); },
    write(fn) { undo.push(copy()); if (undo.length > 40) undo.shift(); redo.length = 0; const d = ctx.getImageData(0, 0, W, H); fn(d.data, W, H); ctx.putImageData(d, 0, 0); onChange(true); },   // copy-paste and box paint areas
    replace(source) { undo.push(copy()); redo.length = 0; ctx.clearRect(0, 0, W, H); ctx.drawImage(source, 0, 0, W, H); onChange(true); },
    // recolour the whole item: hue in degrees, saturation and brightness from -1 to 1. Previews from the picture as it was when the sliders were first moved.
    adjust(h, s, l, commit) {
      adjFrom ||= copy(); const out = new ImageData(new Uint8ClampedArray(adjFrom.data), W, H), d = out.data;
      for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; let [H0, S0, L0] = toHsl(d[i], d[i + 1], d[i + 2]);
        H0 = ((H0 + h) % 360 + 360) % 360; S0 = Math.max(0, Math.min(1, s > 0 ? S0 + (1 - S0) * s : S0 * (1 + s))); L0 = Math.max(0, Math.min(1, l > 0 ? L0 + (1 - L0) * l * 0.6 : L0 * (1 + l * 0.6)));
        const [r, g, b] = fromHsl(H0, S0, L0); d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b); }
      ctx.putImageData(out, 0, 0);
      if (commit) { if (h || s || l) { undo.push(adjFrom); redo.length = 0; } else ctx.putImageData(adjFrom, 0, 0); adjFrom = null; }
      onChange(!!commit); },
    palette(n = 14) {   // the texture's own most used colours, to paint with
      const d = ctx.getImageData(0, 0, W, H).data, count = new Map();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { const k = hex(d[i], d[i + 1], d[i + 2]); count.set(k, (count.get(k) || 0) + 1); }
      const out = [], rgb = k => [1, 3, 5].map(i => parseInt(k.slice(i, i + 2), 16));   // most used first, skipping shades too close to one already picked
      for (const [k] of [...count].sort((a, b) => b[1] - a[1])) { const c = rgb(k); if (out.every(o => Math.abs(o[1][0] - c[0]) + Math.abs(o[1][1] - c[1]) + Math.abs(o[1][2] - c[2]) > 24)) out.push([k, c]); if (out.length >= n) break; }
      return out.map(o => o[0]); } };
  return P;
}
