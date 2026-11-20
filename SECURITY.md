# Security

## Design
- **A small server side, for published skins only** (`functions/api/`, Cloudflare D1). It holds per player: game UUID, username,
  and the skins they chose to publish (a name and a list of game part names; custom assets are refused). No passwords, emails,
  tokens, IPs or analytics. `DELETE /api/me` removes all of it.
- **API rules:** every write needs the site's `Origin` and a session cookie (`__Host-`, HttpOnly, Secure, SameSite=Strict,
  HMAC-signed with the `SESSION_KEY` secret, 30 days; void as soon as the player row is deleted or banned). Bodies are JSON
  capped at 8 KB, recipes pass a slot and part-name allow-list, names are stripped and capped, 45 skins per player, 30 writes an
  hour. Identity comes from Hytale's own `/userinfo`, called by the server with the token the browser hands over once.
- **Game files and skins stay in the player's browser** (IndexedDB). Nothing is uploaded.
- **Two outside hosts, both on demand:** the player lookup sends the typed username to `https://playerdb.co`, and Sign in with
  Hytale (off until a client ID is set in `site/app/config.js`) talks to `https://connect.accounts.hytale.com`. They are the only
  hosts allowed by the Content Security Policy.
- **Sign-in keeps no tokens.** It is OpenID Connect with PKCE as a public client (no secret). `state` is checked, the one-time
  code is removed from the address bar at once, the tokens are used once to read the chosen game profile and then dropped, and
  only that profile (UUID and username) is kept, in the player's browser. The access token is also handed once to
  `/api/session`, which checks it with Hytale and drops it.
- **Strict Content Security Policy** (`site/_headers`): scripts, styles and fonts from this origin only; no inline script or
  style; no frames, forms, plugins or `eval`. Plus HSTS (preload), `nosniff`, `no-referrer`, a locked Permissions-Policy and
  same-origin opener/resource policies.
- **No HTML strings.** The interface is built with `textContent` and DOM properties only (`el()` in `app/main.js`); nothing typed,
  imported or looked up is ever parsed as markup.
- **Everything from outside is validated.** Skins (files, lookups, backups) pass `sanitize()` in `skin.js`: known slots only,
  values matching a strict pattern. Names are stripped and capped. Zip parsing is bounds-checked with size limits, and only
  file names under the known character folders are read.
- **No third-party code at runtime.** three.js and the fonts are vendored at pinned versions with recorded hashes; no CDN,
  no package install on deploy.

## Before going public (owner's checklist)
- GitHub: two-factor on the account, branch protection on `main` (no force-push, required review for outside PRs),
  secret scanning and Dependabot alerts on, no deploy secrets in the repo.
- Host: deploy only `site/`; confirm the headers with securityheaders.com and the CSP with csp-evaluator.
- Domain: registrar lock and two-factor at the registrar, DNSSEC on, HSTS preload submitted after HTTPS is confirmed, CAA
  record limited to the host's certificate authority.
- API: keep `SESSION_KEY` only in the Cloudflare dashboard (never in the repo); add a rate-limiting rule on `/api/*`.

## Reporting
Open a private security advisory on the GitHub repository.
