# Skin Editor Sync (companion mod for Hytale)

Shows the skin you are wearing on https://hytale-skin-editor.com on your character in your own worlds, custom assets
included. No commands. Unofficial; not affiliated with or endorsed by Hypixel Studios.

## Use
1. Put `SkinEditor-<version>.jar` in your mods folder and enable it for the world.
2. On the website, Locker -> **Save skins to a folder** and pick (or make) `Documents\Hytale Skins`.
3. Turn on **In game** (next to Front, under the character). Whatever you wear in the Wardrobe now shows on your character in
   game within a second, and keeps showing after you close the website. Turn it off and your own skin comes back.

Custom textures and reshaped models reach the game through a pack the mod keeps in the world (`mods/SkinEditor_Live`).
Repaints and shape changes show live.
Everyone in the world sees you dressed, because the server sends it.

## Limits
- Your own worlds only: the mod finds the website's folder on the PC the world runs on, and recognises you as the account
  that PC plays as. Servers elsewhere need Hytale sign-in on both ends (planned).
- It changes what you wear in the world. It cannot change your 5 presets in Hytale's avatar editor: those live on your
  Hytale account, which no mod or website can write.
- Slots holding edition or reward items keep your own part, and repaints of those items are not shown, so the mod never puts
  a paid cosmetic on anyone.

## Build
`bash build.sh` (JDK 25, compiles against your installed `HytaleServer.jar`) gives `out/SkinEditor-<version>.jar`. Released on CurseForge from 1.0.0.

## License
MIT (see `LICENSE` in this folder). This covers the mod only; the website code is not licensed for reuse.
