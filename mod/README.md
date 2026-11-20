# Skin Editor companion mod (for Hytale)

Wear the custom assets made on https://hytale-skin-editor.com in your own worlds, or on servers that run this mod.
Unofficial; not affiliated with or endorsed by Hypixel Studios.

## Use
1. Put `SkinEditor-<version>.jar` in your mods folder and enable it for the world.
2. In the website's Creator tab, press **Download all for the mod**. Unzip `SkinEditor_MyAssets.zip` into the world's
   `mods` folder and enable the pack too. The pack holds only your own painted textures; models come from your game.
3. In game: `/skins list`, `/skins wear <id>`, `/skins off`.

Everyone in the world sees what you wear, because the server sends it. Worlds and servers without the mod show your
normal skin. Repaints of edition and reward items are not exported, so the mod never puts paid cosmetics on anyone.

## Build
`bash build.sh` (JDK 25, compiles against your installed `HytaleServer.jar`) gives `out/SkinEditor-<version>.jar`.
