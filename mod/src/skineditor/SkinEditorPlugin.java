package skineditor;

import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.protocol.PlayerSkin;
import com.hypixel.hytale.server.core.asset.type.model.config.Model;
import com.hypixel.hytale.server.core.asset.type.model.config.ModelAttachment;
import com.hypixel.hytale.server.core.cosmetics.CosmeticsModule;
import com.hypixel.hytale.server.core.cosmetics.PlayerSkinPart;
import com.hypixel.hytale.server.core.modules.entity.component.ModelComponent;
import com.hypixel.hytale.server.core.modules.entity.player.PlayerSkinComponent;
import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.plugin.JavaPluginInit;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.Universe;
import com.hypixel.hytale.server.core.universe.world.World;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Companion mod for the Skin Editor website. No commands: it dresses you automatically.
 *
 * The website writes to a skins folder on this PC (default Documents/Hytale Skins): your custom assets in "Custom assets", and,
 * while its "Show in game" switch is on, what you are wearing on the site in "Wearing.json". Once a second this mod reads that
 * file and dresses your character to match; switch it off on the site and your own skin comes back.
 *
 * Custom textures reach players through a folder pack this mod keeps in the world (mods/SkinEditor_Live). A repainted texture
 * gets a new file name, because game clients keep textures they have already loaded.
 *
 * The client draws a player's skin parts from its own copy of the cosmetics, so custom textures cannot ride on the skin. While
 * custom pieces are worn the player becomes the Player model with one attachment per part (the same parts and colours) plus the
 * custom pieces. A look made only of game parts is put on as a normal skin. Slots the website marks "keepOwn" (edition and
 * reward items) always keep the player's own part, so the mod never gives anyone a paid cosmetic.
 *
 * Who is "you": the account whose skin the game cached on this PC (UserData/CachedPlayerSkins), so this works in your own
 * worlds. Other players in the world see you dressed, because the server sends it.
 */
public final class SkinEditorPlugin extends JavaPlugin {

    static final Pattern ID = Pattern.compile("^[0-9a-f]{8}$");
    static final Pattern ASSET_PATH = Pattern.compile("^[A-Za-z0-9_ ./-]{1,200}$");
    static final Pattern TEX = Pattern.compile("^Characters/SkinEditor/[0-9a-f]{8}-[0-9a-f]{8}\\.png$");
    static final Pattern PART = Pattern.compile("^[A-Za-z0-9_ -]{1,64}(\\.[A-Za-z0-9_ -]{1,64}){0,2}$");
    static final String[] FIELDS = { "bodyCharacteristic", "underwear", "face", "ears", "mouth", "haircut", "facialHair", "eyebrows", "eyes", "pants", "overpants",
        "undertop", "overtop", "shoes", "headAccessory", "faceAccessory", "earAccessory", "skinFeature", "gloves", "cape" };
    static final Set<String> SLOTS = Set.of(FIELDS);
    static final String LIVE = "SkinEditor_Live";
    static final String VERSION = "1.0.2";

    record Asset(String id, String field, String model, String texture) {}
    /** what the website says you are wearing */
    record Wearing(Map<String, String> parts, Set<String> keepOwn, String raw) {}

    private Path modsDir, userData, skinsDir;
    private ScheduledExecutorService tick;
    private final Map<UUID, PlayerSkin> own = new java.util.concurrent.ConcurrentHashMap<>();       // each dressed player's real skin
    private final Map<UUID, String> dressedWith = new java.util.concurrent.ConcurrentHashMap<>();   // the Wearing.json text last applied
    private final Map<UUID, PlayerSkin> applied = new java.util.concurrent.ConcurrentHashMap<>();   // the plain skin we put on (no custom pieces)
    private volatile String lastSync = "";
    private volatile String markedOn = "";   // the day the folder marker was last written

    public SkinEditorPlugin(JavaPluginInit init) {
        super(init);
        // the live pack must be a valid pack before the server loads asset packs (after plugins are found, before setup)
        try { locate(); ensureLivePack(); } catch (Throwable ignored) { }
        // a world only loads packs it was told about (single-player worlds start with "default mods enabled" off), so the live pack is
        // switched on here, unless the player turned it off themselves
        try { var cfg = com.hypixel.hytale.server.core.HytaleServer.get().getConfig().getModConfig();
            var id = new com.hypixel.hytale.common.plugin.PluginIdentifier("SkinEditorPack", "Live"); var mc = cfg.get(id);
            if (mc == null || mc.getEnabled() == null) { if (mc == null) mc = new com.hypixel.hytale.server.core.config.ModConfig(); mc.setEnabled(true); cfg.put(id, mc); }
        } catch (Throwable e) { System.err.println("[SkinEditor] could not switch the live pack on: " + e); }
    }

    @Override
    protected void setup() {
        try { locate(); ensureLivePack(); syncAssets(); } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not prepare: " + e); }
        tick = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "SkinEditor"); t.setDaemon(true); return t; });
        tick.scheduleWithFixedDelay(this::step, 2, 1, TimeUnit.SECONDS);
    }

    private void locate() {
        modsDir = getDataDirectory().toAbsolutePath().getParent();                      // <save>/mods
        Path save = modsDir.getParent(), saves = save == null ? null : save.getParent();
        userData = saves == null ? null : saves.getParent();                              // UserData (Saves/<world>/mods)
        Path home = Path.of(System.getProperty("user.home"));
        skinsDir = home.resolve("Documents").resolve("Hytale Skins");
        Path oneDrive = home.resolve("OneDrive").resolve("Documents");
        boolean found = false;
        for (Path p : List.of(skinsDir, oneDrive.resolve("Hytale Skins"))) if (Files.isDirectory(p)) { skinsDir = p; found = true; break; }
        if (!found) {   // make the folder the website saves to, so it is always the same place (Documents, or OneDrive's Documents when Windows keeps it there)
            if (Files.isDirectory(oneDrive) && !Files.isDirectory(home.resolve("Documents"))) skinsDir = oneDrive.resolve("Hytale Skins");
            try { Files.createDirectories(skinsDir); } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not make " + skinsDir + ": " + e); }
        }
    }

    // ------------------------------------------------------------------ once a second
    private void step() {
        markFolder();
        try { syncAssets(); } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] sync: " + e); }
        try {
            UUID me = localPlayer(); if (me == null) return;
            PlayerRef pr = Universe.get().getPlayer(me); if (pr == null) return;
            Ref<EntityStore> ref = pr.getReference(); if (ref == null || !ref.isValid()) return;
            Wearing want = readWearing(); Map<String, Asset> all = assets();
            World w = ref.getStore().getExternalData().getWorld();
            w.execute(() -> { try { apply(ref.getStore(), ref, me, want, all); } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not dress: " + e); } });
        } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] step: " + e); }
    }

    /** "Skin Editor Sync.json" in the skins folder tells the website this mod is installed and has run (once a day, only if the folder exists) */
    private void markFolder() {
        String today = java.time.LocalDate.now().toString(); if (today.equals(markedOn) || skinsDir == null || !Files.isDirectory(skinsDir)) return;
        String body = "{\n \"format\": \"skin-editor-sync\",\n \"version\": \"" + VERSION + "\",\n \"seen\": \"" + today + "\"\n}\n";
        try { Files.writeString(skinsDir.resolve("Skin Editor Sync.json"), body); markedOn = today; }
        catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not write the folder marker: " + e); markedOn = today; }
    }

    /** the account this PC plays as: the newest skin the game cached in UserData/CachedPlayerSkins */
    private UUID localPlayer() {
        if (userData == null) return null; Path dir = userData.resolve("CachedPlayerSkins"); if (!Files.isDirectory(dir)) return null;
        try (Stream<Path> fs = Files.list(dir)) {
            Path newest = null; long t = Long.MIN_VALUE;
            for (Path f : (Iterable<Path>) fs::iterator) { String n = f.getFileName().toString(); if (!n.endsWith(".json")) continue; long m = Files.getLastModifiedTime(f).toMillis(); if (m > t) { t = m; newest = f; } }
            return newest == null ? null : UUID.fromString(newest.getFileName().toString().replace(".json", ""));
        } catch (Exception e) { return null; }
    }

    private Wearing readWearing() {
        try { Path f = skinsDir.resolve("Wearing.json"); if (!Files.isRegularFile(f) || Files.size(f) > 20_000) return null;
            String json = Files.readString(f); if (!"skin-editor-wearing".equals(str(json, "format")) || !"true".equals(raw(json, "on"))) return null;
            int at = json.indexOf("\"skin\""); if (at < 0) return null; String body = json.substring(at);
            Map<String, String> parts = new LinkedHashMap<>();
            for (String fld : FIELDS) { Matcher m = Pattern.compile("\"" + fld + "\"\\s*:\\s*(null|\"([^\"]*)\")").matcher(body);
                String v = m.find() && m.group(2) != null ? m.group(2) : null; if (v != null && !PART.matcher(v).matches()) return null; parts.put(fld, v); }
            Set<String> keep = new HashSet<>(); Matcher k = Pattern.compile("\"keepOwn\"\\s*:\\s*\\[([^\\]]*)\\]").matcher(json);
            if (k.find()) for (String fld : FIELDS) if (k.group(1).contains("\"" + fld + "\"")) keep.add(fld);
            return new Wearing(parts, keep, json);
        } catch (Exception e) { return null; }
    }

    /** on the world thread: dress the player to match the website, or give their own skin back */
    private void apply(Store<EntityStore> store, Ref<EntityStore> ref, UUID who, Wearing want, Map<String, Asset> all) throws Exception {
        if (!ref.isValid()) return;
        PlayerSkinComponent pc = store.getComponent(ref, PlayerSkinComponent.getComponentType());
        boolean ours = pc == null || (applied.containsKey(who) && same(pc.getPlayerSkin(), applied.get(who)));
        if (!ours) { own.put(who, new PlayerSkin(pc.getPlayerSkin())); dressedWith.remove(who); }   // the game put the real skin (back): a join, respawn or world change
        String key = want == null ? null : want.raw() + "|" + all.keySet() + "|" + all.values().stream().map(Asset::texture).toList();
        if (Objects.equals(key, dressedWith.get(who))) return;   // already dressed like this
        PlayerSkin base = own.get(who); if (base == null) return;
        if (want == null) {   // switched off on the site: the real skin goes back
            if (dressedWith.remove(who) != null) { applied.remove(who); plain(store, ref, base); }
            return;
        }
        PlayerSkin skin = new PlayerSkin(base); Map<String, Asset> custom = new LinkedHashMap<>();
        for (String f : FIELDS) {
            if (want.keepOwn().contains(f)) continue;   // a paid item: the player's own part stays
            String v = want.parts().get(f);
            if (v != null && v.startsWith("Custom_")) { Asset a = all.get(v.substring(7).split("\\.")[0]); if (a != null && a.field().equals(f)) custom.put(f, a); continue; }
            put(skin, f, v);
        }
        if (custom.isEmpty()) {
            try { CosmeticsModule.get().validateSkin(skin); } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] the website's skin has parts this game version lacks"); dressedWith.put(who, key); return; }
            applied.put(who, new PlayerSkin(skin)); plain(store, ref, skin);
        } else {
            applied.remove(who);
            for (String f : custom.keySet()) put(skin, f, null);
            List<ModelAttachment> extra = new ArrayList<>(); for (Asset a : custom.values()) extra.add(new ModelAttachment(a.model(), a.texture(), null, null, 1.0));
            CosmeticsModule cm = CosmeticsModule.get();
            Model m = skinToModel(cm, skin, cm.createModel(skin), extra);
            if (store.getComponent(ref, PlayerSkinComponent.getComponentType()) != null) store.removeComponent(ref, PlayerSkinComponent.getComponentType());
            store.putComponent(ref, ModelComponent.getComponentType(), new ModelComponent(m));
        }
        dressedWith.put(who, key);
    }

    private static void plain(Store<EntityStore> store, Ref<EntityStore> ref, PlayerSkin skin) {
        PlayerSkinComponent psc = new PlayerSkinComponent(skin); psc.setNetworkOutdated();   // marked so it is sent to the clients again
        store.putComponent(ref, PlayerSkinComponent.getComponentType(), psc);
        store.putComponent(ref, ModelComponent.getComponentType(), new ModelComponent(CosmeticsModule.get().createModel(skin)));
    }
    static Object get(PlayerSkin s, String f) throws Exception { return PlayerSkin.class.getField(f).get(s); }
    static void put(PlayerSkin s, String f, String v) throws Exception { PlayerSkin.class.getField(f).set(s, v); }
    static boolean same(PlayerSkin a, PlayerSkin b) throws Exception { for (String f : FIELDS) if (!Objects.equals(get(a, f), get(b, f))) return false; return true; }

    // ------------------------------------------------------------------ custom assets: skins folder -> live pack
    private void ensureLivePack() throws Exception {
        Path live = modsDir.resolve(LIVE);
        Files.createDirectories(live.resolve("Common").resolve("Characters").resolve("SkinEditor")); Files.createDirectories(live.resolve("Server").resolve("SkinEditor"));
        Path m = live.resolve("manifest.json");
        // "DisabledByDefault": false: a pack that appears after the world was made is otherwise skipped as disabled (fresh installs)
        if (!Files.isRegularFile(m) || !Files.readString(m).contains("DisabledByDefault")) Files.writeString(m, "{\n \"Group\": \"SkinEditorPack\",\n \"Name\": \"Live\",\n \"Version\": \"1.0.0\",\n"
            + " \"Description\": \"Kept up to date by the Skin Editor mod from your skins folder. Do not edit.\",\n \"Authors\": [{ \"Name\": \"Skin Editor\" }],\n \"ServerVersion\": \"*\",\n \"DisabledByDefault\": false\n}\n");
    }

    /** copies "<skins folder>/Custom assets" into the live pack; each texture is named after its content, so a repaint is a new file */
    synchronized void syncAssets() throws Exception {
        Path src = skinsDir.resolve("Custom assets"); if (!Files.isDirectory(src)) return;
        StringBuilder stamp = new StringBuilder();
        try (Stream<Path> fs = Files.list(src)) { for (Path f : (Iterable<Path>) fs::iterator) stamp.append(f.getFileName()).append(Files.getLastModifiedTime(f).toMillis()).append(Files.size(f)).append(';'); }
        if (stamp.toString().equals(lastSync)) return;
        ensureLivePack(); Path live = modsDir.resolve(LIVE), texDir = live.resolve("Common").resolve("Characters").resolve("SkinEditor"), entDir = live.resolve("Server").resolve("SkinEditor");
        Set<String> keepFiles = new HashSet<>();
        try (Stream<Path> fs = Files.list(src)) {
            for (Path f : (Iterable<Path>) fs::iterator) {
                String n = f.getFileName().toString(); if (!n.endsWith(".json") || Files.size(f) > 20_000) continue;
                String json = Files.readString(f); if ("true".equals(raw(json, "locked"))) continue;   // repaints of edition and reward items stay on the site
                String id = str(json, "id"), field = str(json, "field"), model = str(json, "model");
                if (id == null || !ID.matcher(id).matches() || field == null || !SLOTS.contains(field) || model == null || !ASSET_PATH.matcher(model).matches() || model.contains("..") || !model.endsWith(".blockymodel")) continue;
                Path png = src.resolve(n.substring(0, n.length() - 5) + ".png"); if (!Files.isRegularFile(png) || Files.size(png) > 2_000_000) continue;
                byte[] data = Files.readAllBytes(png); if (data.length < 8 || (data[0] & 0xff) != 0x89 || data[1] != 'P' || data[2] != 'N' || data[3] != 'G') continue;
                String ver = String.format("%08x", java.util.Arrays.hashCode(data)), tex = id + "-" + ver + ".png";
                Path out = texDir.resolve(tex); if (!Files.isRegularFile(out)) Files.write(out, data);
                // a reshaped asset brings its own model: it gets a content-named file too, and the entry points at it
                Path shp = src.resolve(n.substring(0, n.length() - 5) + ".blockymodel");
                if (Files.isRegularFile(shp) && Files.size(shp) <= 200_000) { String mj = Files.readString(shp).trim();
                    if (mj.startsWith("{") && mj.contains("\"nodes\"")) { String mf = id + "-" + String.format("%08x", mj.hashCode()) + ".blockymodel";
                        Path mo = texDir.resolve(mf); if (!Files.isRegularFile(mo)) Files.writeString(mo, mj); keepFiles.add(mf); model = "Characters/SkinEditor/" + mf; } }
                String entry = "{\"format\": \"skin-editor-asset\", \"id\": \"" + id + "\", \"field\": \"" + field + "\", \"model\": \"" + model + "\", \"texture\": \"Characters/SkinEditor/" + tex + "\"}\n";
                Path ent = entDir.resolve(id + ".json"); if (!Files.isRegularFile(ent) || !Files.readString(ent).equals(entry)) Files.writeString(ent, entry);
                keepFiles.add(tex); keepFiles.add(id + ".json");
            }
        }
        for (Path dir : List.of(texDir, entDir)) try (Stream<Path> fs = Files.list(dir)) {   // old repaints and deleted assets go
            for (Path f : (Iterable<Path>) fs::iterator) if (!keepFiles.contains(f.getFileName().toString())) Files.deleteIfExists(f);
        }
        lastSync = stamp.toString();
    }

    /** the custom assets in the live pack, by id */
    Map<String, Asset> assets() {
        Map<String, Asset> out = new LinkedHashMap<>(); Path live = modsDir.resolve(LIVE), entDir = live.resolve("Server").resolve("SkinEditor");
        if (!Files.isDirectory(entDir)) return out;
        try (Stream<Path> fs = Files.list(entDir)) {
            for (Path f : (Iterable<Path>) fs::iterator) {
                if (!f.getFileName().toString().endsWith(".json")) continue; String json = Files.readString(f);
                String id = str(json, "id"), field = str(json, "field"), model = str(json, "model"), tex = str(json, "texture");
                if (id == null || !ID.matcher(id).matches() || field == null || !SLOTS.contains(field) || model == null || tex == null || !TEX.matcher(tex).matches()) continue;
                if (Files.isRegularFile(live.resolve("Common").resolve(tex))) out.put(id, new Asset(id, field, model, tex));
            }
        } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not read the live pack: " + e); }
        return out;
    }

    private static String str(String json, String key) {
        Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(json);
        return m.find() ? m.group(1).replace("\\\"", "\"").replace("\\\\", "\\") : null;
    }
    private static String raw(String json, String key) { Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*(true|false)").matcher(json); return m.find() ? m.group(1) : null; }

    /** a skin as the Player model with one attachment per part, resolved from the game's cosmetics list (variant, fixed texture, or greyscale + colour) */
    @SuppressWarnings("unchecked")
    static Model skinToModel(CosmeticsModule cm, PlayerSkin ps, Model base, List<ModelAttachment> extra) throws Exception {
        var reg = cm.getRegistry();
        java.util.function.Function<String, com.hypixel.hytale.server.core.cosmetics.PlayerSkin.PlayerSkinPartId> pid =
            id -> id == null ? null : com.hypixel.hytale.server.core.cosmetics.PlayerSkin.PlayerSkinPartId.fromString(id);
        var bodyId = pid.apply(ps.bodyCharacteristic); String tone = bodyId != null && bodyId.textureId != null ? bodyId.textureId : "02";
        var hairId = pid.apply(ps.haircut); String hair = hairId != null ? hairId.textureId : null;
        Object[][] parts = { {ps.face, reg.getFaces()}, {ps.ears, reg.getEars()}, {ps.mouth, reg.getMouths()}, {ps.eyes, reg.getEyes()}, {ps.eyebrows, reg.getEyebrows()},
            {ps.haircut, reg.getHaircuts()}, {ps.facialHair, reg.getFacialHairs()}, {ps.underwear, reg.getUnderwear()}, {ps.pants, reg.getPants()}, {ps.overpants, reg.getOverpants()},
            {ps.undertop, reg.getUndertops()}, {ps.overtop, reg.getOvertops()}, {ps.shoes, reg.getShoes()}, {ps.gloves, reg.getGloves()}, {ps.headAccessory, reg.getHeadAccessories()},
            {ps.faceAccessory, reg.getFaceAccessories()}, {ps.earAccessory, reg.getEarAccessories()}, {ps.skinFeature, reg.getSkinFeatures()}, {ps.cape, reg.getCapes()} };
        // earrings hang from R/L-Ear-Attachment (or Head), which every body model has, so they are drawn like the rest
        List<ModelAttachment> out = new ArrayList<>(extra);   // custom pieces first: the client draws only the first several attachments
        for (Object[] pr : parts) {
            String id = (String) pr[0]; if (id == null || id.isEmpty()) continue;
            var map = (Map<String, PlayerSkinPart>) pr[1];
            var p = pid.apply(id); var part = map.get(p.assetId); if (part == null) continue;
            String mdl = part.getModel(), grey = part.getGreyscaleTexture(); var texs = part.getTextures();
            if (p.variantId != null && part.getVariants() != null && part.getVariants().containsKey(p.variantId)) { var v = part.getVariants().get(p.variantId);
                if (v.getModel() != null) mdl = v.getModel(); if (v.getGreyscaleTexture() != null) grey = v.getGreyscaleTexture(); if (v.getTextures() != null) texs = v.getTextures(); }
            String tex, gset = null, gid = null;
            if (texs != null && p.textureId != null && texs.containsKey(p.textureId)) tex = texs.get(p.textureId).getTexture();
            else { tex = grey; gset = part.getGradientSet(); gid = p.textureId != null ? p.textureId : "Skin".equals(gset) ? tone : "Hair".equals(gset) ? hair : null; }
            if (mdl != null && tex != null) out.add(new ModelAttachment(mdl, tex, gset, gid, 1.0));
        }
        Model m = new Model(base); var body = bodyId == null ? null : reg.getBodyCharacteristics().get(bodyId.assetId);
        java.util.function.BiConsumer<String, Object> set = (f, v) -> { try { var fl = Model.class.getDeclaredField(f); fl.setAccessible(true); fl.set(m, v); } catch (Exception e) { throw new RuntimeException(e); } };
        set.accept("attachments", out.toArray(new ModelAttachment[0]));
        if (body != null) { if (body.getModel() != null) set.accept("model", body.getModel()); if (body.getGreyscaleTexture() != null) set.accept("texture", body.getGreyscaleTexture()); }
        set.accept("gradientSet", "Skin"); set.accept("gradientId", tone);
        set.accept("cachedPacket", null);
        return m;
    }

}
