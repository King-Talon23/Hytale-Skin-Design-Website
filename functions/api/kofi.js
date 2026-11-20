// POST /api/kofi: Ko-fi's webhook after a tip. Supporting is optional and unlocks nothing: it only adds a "Supporter" badge
// beside the player's name on their published skins. The tipper writes their Hytale username in the Ko-fi message; that name
// is marked (or kept waiting until the player first signs in). Nothing else from Ko-fi (email, name, amount) is stored.
// Needs the KOFI_TOKEN secret (Ko-fi > Settings > API/Webhooks > verification token); without it the hook is off.
import { ensure, json } from '../../lib/api.js';
const NAME = /^[A-Za-z0-9_.-]{3,40}$/;

export async function onRequestPost({ request, env }) {
  const KEY = env.KOFI_TOKEN || env['Ko-Fi'];   // the dashboard secret is named "Ko-Fi"
  if (!KEY || !env.DB) return json({ error: 'off' }, 503);
  const t = await request.text(); if (t.length > 16384) return json({ error: 'too big' }, 413);
  let d = null; try { d = JSON.parse(new URLSearchParams(t).get('data') || 'null'); } catch { /* not Ko-fi */ }
  const tok = String(d && d.verification_token || ''), want = String(KEY);
  let diff = tok.length ^ want.length; for (let i = 0; i < Math.min(tok.length, want.length); i++) diff |= tok.charCodeAt(i) ^ want.charCodeAt(i);
  if (!d || diff) return json({ error: 'not allowed' }, 403);
  // only an explicit name counts ("Hytale: Name", or a message that is just the name), so ordinary words never become badges
  const msg = String(d.message || '').trim(), tagged = /(?:hytale|ign|username|user)\s*[:=]\s*@?([A-Za-z0-9_.-]{3,40})/i.exec(msg);
  const words = tagged ? [tagged[1]] : NAME.test(msg.replace(/^@/, '')) ? [msg.replace(/^@/, '')] : [];
  if (!words.length) return json({ ok: true, marked: 0 });   // a tip with no username: thank you, nothing to mark
  await ensure(env.DB); let marked = 0;
  for (const w of words) {
    const r = await env.DB.prepare('UPDATE players SET supporter = 1 WHERE lower(username) = lower(?1)').bind(w).run();
    if (r.meta.changes) marked++;
    else await env.DB.prepare('INSERT OR REPLACE INTO supporters_pending (username, at) VALUES (lower(?1), ?2)').bind(w, Date.now()).run();
  }
  return json({ ok: true, marked });
}
