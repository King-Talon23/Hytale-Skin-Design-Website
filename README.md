# Skin Editor for Hytale (unofficial)

Design, save and preview Hytale avatar skins outside the game. The site hosts no Hytale assets. Its only server part is a small
API for published skins (optional, needs Sign in with Hytale). Each player connects their own `Assets.zip`; the editor reads the character files out of it in
the browser and keeps that copy, and the player's skins, in the browser's own storage on their computer.

Not affiliated with or endorsed by Hypixel Studios. Hytale is a trademark of Hypixel Studios.

## Layout
- `site/` is the whole published website (deploy this folder and nothing else).
  - `app/zip.js` reads single files out of the zip in place; `app/game.js` imports and serves the game files from IndexedDB.
  - `app/skin.js` skin format and rules; `app/figure.js` 3D build, thumbnails and the animation player; `app/store.js` the wardrobe
    (5 in-game slots, 45 custom skins); `app/main.js` the interface.
  - `vendor/` three.js 0.160.0 (MIT), pinned; `fonts/` Lexend and Nunito Sans (OFL); hashes in `vendor/SHA256SUMS`.
  - `_headers` the security headers (Cloudflare Pages format).
- `functions/api/` the published-skins API (Cloudflare Pages Functions), `lib/api.js` its shared code. Database: Cloudflare D1
  bound as `DB`; sessions are signed with the `SESSION_KEY` secret. Without either, the API answers that publishing is off.
- `dev/` local test server. Never deployed.

## Run locally
    python dev/serve.py
Open http://localhost:8766 and choose your `Assets.zip`. `http://localhost:8766/?devzip` reads the zip from the default
Windows install path without the file dialog (development only).

## Deploy
Any static host that can send the headers in `site/_headers` (Cloudflare Pages: build command none, output directory `site`).
There is no build step and no runtime dependency download.
