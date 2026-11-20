// The page Hytale sends the player back to after signing in.
import { enabled, finish } from './auth.js';

const title = document.getElementById('cb-title'), text = document.getElementById('cb-text'), extra = document.getElementById('cb-extra');
if (enabled && location.search) {
  title.textContent = 'Signing you in…'; text.textContent = 'One moment.'; extra.hidden = true;
  try {
    const me = await finish(new URLSearchParams(location.search));
    title.textContent = 'Signed in as ' + me.username; text.textContent = 'Taking you back to the editor…';
    setTimeout(() => location.replace('/'), 900);
  } catch (e) {
    title.textContent = 'Sign in did not finish'; text.textContent = (e && e.message) || 'Something went wrong. Try again.'; extra.hidden = true;
  }
}
