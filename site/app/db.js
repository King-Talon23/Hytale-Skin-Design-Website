// Everything the site remembers lives in this browser's IndexedDB: the player's own copy of the game files it needs,
// and their skins. Nothing is sent to a server.
const NAME = 'skin-editor', VERSION = 2;
let opening;
function open() {
  return opening ??= new Promise((ok, no) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => { const d = r.result;
      for (const s of ['files', 'meta', 'skins', 'assets']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
// item pictures live in a database of their own, so adding them never needed an upgrade of the main one (which another open tab would block)
let thumbing;
const openThumbs = () => thumbing ??= new Promise((ok, no) => { const r = indexedDB.open(NAME + '-thumbs', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('thumbs'); r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); ok(r.result); }; r.onerror = () => no(r.error); });
const db = store => store === 'thumbs' ? openThumbs() : open();
const done = t => new Promise((ok, no) => { t.oncomplete = () => ok(); t.onerror = t.onabort = () => no(t.error); });
const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });

export async function get(store, key) { return req((await db(store)).transaction(store).objectStore(store).get(key)); }
export async function all(store) { return req((await db(store)).transaction(store).objectStore(store).getAll()); }
export async function keys(store) { return req((await db(store)).transaction(store).objectStore(store).getAllKeys()); }
export async function put(store, key, value) { const t = (await db(store)).transaction(store, 'readwrite'); t.objectStore(store).put(value, key); return done(t); }
export async function putMany(store, pairs) { const t = (await db(store)).transaction(store, 'readwrite'), s = t.objectStore(store); for (const [k, v] of pairs) s.put(v, k); return done(t); }
export async function del(store, key) { const t = (await db(store)).transaction(store, 'readwrite'); t.objectStore(store).delete(key); return done(t); }
export async function clear(store) { const t = (await db(store)).transaction(store, 'readwrite'); t.objectStore(store).clear(); return done(t); }
