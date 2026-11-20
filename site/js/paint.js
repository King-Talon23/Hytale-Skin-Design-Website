// The pixel painter behind the asset creator. It edits one canvas (the item's texture) and knows nothing about 3D:
// callers hand it texture pixels to paint between, whether they came from the flat view or from a ray cast on the model.
const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

export function createPainter(canvas, onChange, onPick) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }), W = canvas.width, H = canvas.height;
  const undo = [], redo = []; let img = null, touched = null, fresh = false, dirty = false;
  const copy = () => { const d = ctx.getImageData(0, 0, W, H); return new ImageData(new Uint8ClampedArray(d.data), W, H); };
  function px(x, y) {   // one texel, once per stroke (so lighten/darken does not stack while the pointer rests)
    if (x < 0 || y < 0 || x >= W || y >= H) return; const k = y * W + x; if (touched.has(k)) return; touched.add(k);
    const d = img.data, i = k * 4;
    if (P.tool === 'erase') d[i + 3] = 0;
    else if (P.tool === 'light' || P.tool === 'dark') { if (!d[i + 3]) return; const m = P.tool === 'light' ? 1.12 : 0.88; for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round(d[i + c] * m + (m > 1 ? 4 : -4)))); }
    else { const [r, g, b] = rgb(P.color); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  }
  function dot(x, y) { const s = P.size, o = Math.floor((s - 1) / 2); for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) px(x - o + dx, y - o + dy); }
  function line(a, b) { let x = a.x, y = a.y; const dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y), sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1; let e = dx + dy;
    for (let n = 0; n < 4096; n++) { dot(x, y); if (x === b.x && y === b.y) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x += sx; } if (e2 <= dx) { e += dx; y += sy; } } }
  function flood(x, y) {   // fills the connected area of one exact colour
    const d = img.data, at = (X, Y) => (Y * W + X) * 4, s = at(x, y), from = [d[s], d[s + 1], d[s + 2], d[s + 3]], [r, g, b] = rgb(P.color);
    if (from[0] === r && from[1] === g && from[2] === b && from[3] === 255) return;
    const same = i => d[i] === from[0] && d[i + 1] === from[1] && d[i + 2] === from[2] && d[i + 3] === from[3], stack = [[x, y]];
    while (stack.length) { const [X, Y] = stack.pop(); if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const i = at(X, Y); if (!same(i)) continue;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; stack.push([X + 1, Y], [X - 1, Y], [X, Y + 1], [X, Y - 1]); }
  }
  const show = () => { ctx.putImageData(img, 0, 0); dirty = true; onChange(false); };
  function swap(from, to) { if (!from.length) return; to.push(copy()); ctx.putImageData(from.pop(), 0, 0); onChange(true); }
  const P = { tool: 'brush', size: 1, color: '#e0b050',
    begin() { img = ctx.getImageData(0, 0, W, H); undo.push(new ImageData(new Uint8ClampedArray(img.data), W, H)); if (undo.length > 40) undo.shift(); touched = new Set(); fresh = true; dirty = false; },
    stroke(a, b) { if (!img) return; const first = fresh; fresh = false;
      if (P.tool === 'pick') { if (first) { const i = (b.y * W + b.x) * 4, d = img.data; if (d[i + 3]) { P.color = hex(d[i], d[i + 1], d[i + 2]); onPick && onPick(); } } return; }
      if (P.tool === 'fill') { if (first) { flood(b.x, b.y); show(); } return; }
      line(a, b); show(); },
    end() { if (!img) return; if (dirty) { redo.length = 0; onChange(true); } else undo.pop(); img = null; touched = null; },
    undo() { swap(undo, redo); }, redo() { swap(redo, undo); },
    replace(source) { undo.push(copy()); redo.length = 0; ctx.clearRect(0, 0, W, H); ctx.drawImage(source, 0, 0, W, H); onChange(true); },
    palette(n = 14) {   // the texture's own most used colours, to paint with
      const d = ctx.getImageData(0, 0, W, H).data, count = new Map();
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { const k = hex(d[i], d[i + 1], d[i + 2]); count.set(k, (count.get(k) || 0) + 1); }
      return [...count].sort((a, b) => b[1] - a[1]).slice(0, n).map(c => c[0]); } };
  return P;
}
