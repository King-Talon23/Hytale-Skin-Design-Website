# Skin Editor companion mod (for Hytale)

Wear the custom assets made on https://hytale-skin-editor.com in your own worlds, or on servers that run this mod.
Unofficial; not affiliated with or endorsed by Hypixel Studios.

## Use
1. Put `SkinEditor-<version>.jar` in your mods folder and enable it for the world.
2. On the website, Wardrobe -> **Save skins to a folder**, and pick (or make) `Documents\Hytale Skins`. Your custom assets
   are written to its `Custom assets` folder as you paint.
3. In game: `/skins list`, `/skins wear <id>`, `/skins off`.

The mod copies your custom assets into a pack it keeps in the world (`mods/SkinEditor_Live`) and the game sends new textures
to players while the world runs. What you wear stays on after dying, changing worlds or rejoining, until `/skins off`.

Using a different folder: `/skins folder C:/path/to/folder` (use forward slashes: the game's command line drops backslashes).
For servers, the website's **Download all for the mod** gives a pack to unzip into the server's mods folder instead.

Everyone in the world sees what you wear, because the server sends it. Worlds and servers without the mod show your normal
skin. Repaints of edition and reward items are skipped, so the mod never puts paid cosmetics on anyone.

Earrings, including custom ones, are drawn as normal.

## Build
`bash build.sh` (JDK 25, compiles against your installed `HytaleServer.jar`) gives `out/SkinEditor-<version>.jar`.
