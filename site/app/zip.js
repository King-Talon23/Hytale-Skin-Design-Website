// Reads single files out of a (possibly multi-gigabyte) zip in place, without loading it, and writes small zips (stored, no compression).
// A source is { size, read(start, end) -> Promise<ArrayBuffer> }; a File the player picked is wrapped by fileSource().

export const fileSource = file => ({ size: file.size, read: (a, b) => file.slice(a, b).arrayBuffer() });

const MAX_DIRECTORY = 64 * 1024 * 1024;   // a central directory larger than this is not a game archive
const MAX_ENTRY = 32 * 1024 * 1024;       // no single file we use is anywhere near this

export async function openZip(src, wanted) {
  if (src.size < 22) throw new Error('This file is not a zip archive.');
  const tailLen = Math.min(src.size, 65557), tail = new DataView(await src.read(src.size - tailLen, src.size));
  let e = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('This file is not a zip archive.');
  let count = tail.getUint16(e + 10, true), size = tail.getUint32(e + 12, true), start = tail.getUint32(e + 16, true);
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) {   // zip64: the real numbers sit in a second record
    if (e < 20 || tail.getUint32(e - 20, true) !== 0x07064b50) throw new Error('Unreadable zip (zip64 locator missing).');
    const at = Number(tail.getBigUint64(e - 12, true)), r = new DataView(await src.read(at, at + 56));
    if (r.getUint32(0, true) !== 0x06064b50) throw new Error('Unreadable zip (zip64 record missing).');
    count = Number(r.getBigUint64(32, true)); size = Number(r.getBigUint64(40, true)); start = Number(r.getBigUint64(48, true));
  }
  if (size > MAX_DIRECTORY || start + size > src.size) throw new Error('Unreadable zip (bad directory).');
  const buf = await src.read(start, start + size), d = new DataView(buf), bytes = new Uint8Array(buf), utf8 = new TextDecoder();
  const entries = new Map();
  for (let p = 0, i = 0; i < count && p + 46 <= size; i++) {
    if (d.getUint32(p, true) !== 0x02014b50) throw new Error('Unreadable zip (bad entry).');
    const method = d.getUint16(p + 10, true), nameLen = d.getUint16(p + 28, true), extraLen = d.getUint16(p + 30, true), commentLen = d.getUint16(p + 32, true);
    let csize = d.getUint32(p + 20, true), usize = d.getUint32(p + 24, true), offset = d.getUint32(p + 42, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (wanted(name)) {
      if (csize === 0xffffffff || usize === 0xffffffff || offset === 0xffffffff) {
        for (let x = p + 46 + nameLen, end = x + extraLen; x + 4 <= end;) {
          const id = d.getUint16(x, true), len = d.getUint16(x + 2, true);
          if (id === 1) { let q = x + 4;
            if (usize === 0xffffffff) { usize = Number(d.getBigUint64(q, true)); q += 8; }
            if (csize === 0xffffffff) { csize = Number(d.getBigUint64(q, true)); q += 8; }
            if (offset === 0xffffffff) offset = Number(d.getBigUint64(q, true)); }
          x += 4 + len;
        }
      }
      entries.set(name, { method, csize, usize, offset });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  async function read(name) {
    const en = entries.get(name); if (!en) throw new Error('Not in the archive: ' + name);
    if (en.csize > MAX_ENTRY || en.usize > MAX_ENTRY) throw new Error('File too large: ' + name);
    const h = new DataView(await src.read(en.offset, en.offset + 30));
    if (h.getUint32(0, true) !== 0x04034b50) throw new Error('Unreadable zip (bad file header).');
    const at = en.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true), raw = await src.read(at, at + en.csize);
    if (en.method === 0) return raw;
    if (en.method !== 8) throw new Error('Unsupported compression in the archive.');
    return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  }
  return { names: [...entries.keys()], read };
}

// ---- writing: files = [[path, Uint8Array | string]], stored without compression (the PNGs inside are compressed already)
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  for (const [path, body] of files) {
    const name = enc.encode(path), data = typeof body === 'string' ? enc.encode(body) : body, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    parts.push(h, name, data); central.push(c, name); offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, x) => n + x.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
