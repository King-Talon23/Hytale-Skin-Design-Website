package skineditor;

import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.protocol.PlayerSkin;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.asset.type.model.config.Model;
import com.hypixel.hytale.server.core.asset.type.model.config.ModelAttachment;
import com.hypixel.hytale.server.core.command.system.CommandContext;
import com.hypixel.hytale.server.core.command.system.arguments.system.RequiredArg;
import com.hypixel.hytale.server.core.command.system.arguments.types.ArgTypes;
import com.hypixel.hytale.server.core.command.system.basecommands.AbstractCommandCollection;
import com.hypixel.hytale.server.core.command.system.basecommands.AbstractPlayerCommand;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Companion mod for the Skin Editor website: wears the custom assets players made there.
 *
 * Packs exported from the site are folder asset packs dropped into this world's mods folder. Each custom asset is a texture
 * (Common/Characters/SkinEditor/<id>.png, sent to every player by the server like any asset) and a small entry
 * (Server/SkinEditor/<id>.json) naming the game's own model it belongs on and the skin slot it replaces.
 *
 * The game client draws a player's skin parts from its own copy of the cosmetics, so a new texture cannot ride on the skin.
 * Instead, while custom assets are worn, the player becomes the Player model with one attachment per skin part (the same
 * parts, models and colours the skin would draw) plus the custom pieces, and the skin component is set aside. Taking them
 * off puts the skin back. Everyone in the world sees the result, because it is the server that sends it.
 */
public final class SkinEditorPlugin extends JavaPlugin {

    static final Pattern ID = Pattern.compile("^[0-9a-f]{8}$");
    static final Pattern ASSET_PATH = Pattern.compile("^[A-Za-z0-9_ ./-]{1,200}$");
    static final Map<String, String> SLOTS = new LinkedHashMap<>();   // skin field -> what players call it
    static {
        for (String[] s : new String[][] { {"haircut", "Haircut"}, {"facialHair", "Facial hair"}, {"eyebrows", "Eyebrows"}, {"eyes", "Eyes"}, {"face", "Face"}, {"mouth", "Mouth"},
            {"ears", "Ears"}, {"skinFeature", "Skin feature"}, {"underwear", "Underwear"}, {"undertop", "Undertop"}, {"overtop", "Overtop"}, {"pants", "Pants"},
            {"overpants", "Legwear"}, {"shoes", "Shoes"}, {"gloves", "Gloves"}, {"cape", "Cape"}, {"headAccessory", "Headwear"}, {"faceAccessory", "Face accessory"}, {"earAccessory", "Earring"} }) SLOTS.put(s[0], s[1]);
    }

    /** one custom asset from a pack */
    record Asset(String id, String name, String field, String model, String texture) {}

    static final Map<UUID, PlayerSkin> ORIGINAL = new ConcurrentHashMap<>();          // the skin a player had before wearing custom assets
    static final Map<UUID, Map<String, Asset>> WORN = new ConcurrentHashMap<>();     // skin field -> custom asset, per player
    private Path modsDir, dataDir;
    private volatile Path skinsDir;
    private ScheduledExecutorService tick;
    static final String LIVE = "SkinEditor_Live";   // the folder pack this mod keeps filled from the skins folder

    public SkinEditorPlugin(JavaPluginInit init) {
        super(init);
        // the live pack must be a valid pack before the server loads asset packs, which happens after plugins are found but before setup()
        try { dataDir = getDataDirectory().toAbsolutePath(); modsDir = dataDir.getParent(); ensureLivePack(); } catch (Throwable ignored) { }
    }

    @Override
    protected void setup() {
        dataDir = getDataDirectory().toAbsolutePath(); modsDir = dataDir.getParent();
        try { Files.createDirectories(dataDir); } catch (Exception ignored) { }
        skinsDir = loadFolder(); loadWorn(); loadLooks();
        try { ensureLivePack(); syncFolder(); } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not prepare " + LIVE + ": " + e); }
        getCommandRegistry().registerCommand(new Skins(this));
        tick = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "SkinEditor"); t.setDaemon(true); return t; });
        tick.scheduleWithFixedDelay(this::keepOn, 2, 1, TimeUnit.SECONDS);
        tick.scheduleWithFixedDelay(() -> { try { syncFolder(); } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] sync: " + e); } }, 5, 5, TimeUnit.SECONDS);
    }

    // ------------------------------------------------------------------ keeping custom pieces on
    /** after a respawn, a world change or a rejoin the server puts the plain skin back: take it as the new base and dress again */
    private void keepOn() {
        java.util.Set<UUID> who0 = new java.util.HashSet<>(WORN.keySet()); who0.addAll(LOOKS.keySet());
        for (UUID who : who0) {
            try {
                PlayerRef pr = Universe.get().getPlayer(who); if (pr == null) continue;
                Ref<EntityStore> ref = pr.getReference(); if (ref == null || !ref.isValid()) continue;
                World w = ref.getStore().getExternalData().getWorld();
                w.execute(() -> { try {
                    if (!ref.isValid() || (!WORN.containsKey(who) && !LOOKS.containsKey(who))) return;
                    PlayerSkinComponent pc = ref.getStore().getComponent(ref, PlayerSkinComponent.getComponentType());
                    if (pc == null) return;   // still dressed by us (custom pieces)
                    if (APPLIED.containsKey(who) && same(pc.getPlayerSkin(), APPLIED.get(who))) return;   // still the look we put on
                    ORIGINAL.put(who, new PlayerSkin(pc.getPlayerSkin()));
                    refreshWorn(who); if (WORN.containsKey(who) || LOOKS.containsKey(who)) dress(ref.getStore(), ref, who);
                } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not dress " + who + ": " + e); } });
            } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] keepOn: " + e); }
        }
    }
    /** worn entries point at assets that may have been repainted or deleted since: take the current ones */
    private void refreshWorn(UUID who) {
        Map<String, Asset> worn = WORN.get(who); if (worn == null) return; Map<String, Asset> all = assets();
        for (String f : List.copyOf(worn.keySet())) { Asset now = all.get(worn.get(f).id()); if (now == null) worn.remove(f); else worn.put(f, now); }   // no nulls: the map does not take them
        if (worn.isEmpty()) WORN.remove(who);
    }
    private Path wornFile() { return dataDir.resolve("worn.txt"); }
    void saveWorn() {   // "<uuid> <field> <id>" per line, so worn pieces come back after a restart
        StringBuilder sb = new StringBuilder();
        WORN.forEach((u, m) -> m.forEach((f, a) -> sb.append(u).append(' ').append(f).append(' ').append(a.id()).append('\n')));
        try { Files.writeString(wornFile(), sb.toString()); } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not save worn.txt: " + e); }
    }
    private void loadWorn() {
        try { if (!Files.isRegularFile(wornFile())) return; Map<String, Asset> all = assets();
            for (String line : Files.readAllLines(wornFile())) { String[] p = line.trim().split(" "); if (p.length != 3) continue;
                Asset a = all.get(p[2]); if (a == null || !a.field().equals(p[1])) continue;
                WORN.computeIfAbsent(UUID.fromString(p[0]), k -> new ConcurrentHashMap<>()).put(p[1], a); }
        } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not read worn.txt: " + e); }
    }

    // ------------------------------------------------------------------ the website's skins folder
    /** the folder the website writes to (Wardrobe -> Save skins to a folder); "Hytale Skins" in Documents unless /skins folder set another */
    private Path loadFolder() {
        try { Path f = dataDir.resolve("folder.txt"); if (Files.isRegularFile(f)) { String s = Files.readString(f).trim(); if (!s.isEmpty()) return Path.of(s); } } catch (Exception ignored) { }
        Path home = Path.of(System.getProperty("user.home"));
        for (Path p : List.of(home.resolve("Documents").resolve("Hytale Skins"), home.resolve("OneDrive").resolve("Documents").resolve("Hytale Skins"))) if (Files.isDirectory(p)) return p;
        return home.resolve("Documents").resolve("Hytale Skins");
    }
    void setFolder(Path p) throws Exception { Files.writeString(dataDir.resolve("folder.txt"), p.toString()); skinsDir = p; syncFolder(); }
    Path folder() { return skinsDir; }
    private void ensureLivePack() throws Exception {
        Path live = modsDir.resolve(LIVE);
        Files.createDirectories(live.resolve("Common").resolve("Characters").resolve("SkinEditor")); Files.createDirectories(live.resolve("Server").resolve("SkinEditor"));
        Path m = live.resolve("manifest.json");
        if (!Files.isRegularFile(m)) Files.writeString(m, "{\n \"Group\": \"SkinEditorPack\",\n \"Name\": \"Live\",\n \"Version\": \"1.0.0\",\n"
            + " \"Description\": \"Kept up to date by the Skin Editor mod from your skins folder. Do not edit.\",\n \"Authors\": [{ \"Name\": \"Skin Editor\" }],\n \"ServerVersion\": \"*\"\n}\n");
    }
    /** copies the custom assets in "<skins folder>/Custom assets" into the live pack; the server's asset monitor sends new textures to players */
    synchronized void syncFolder() throws Exception {
        Path src = skinsDir == null ? null : skinsDir.resolve("Custom assets"); if (src == null || !Files.isDirectory(src)) return;
        ensureLivePack(); Path live = modsDir.resolve(LIVE), texDir = live.resolve("Common").resolve("Characters").resolve("SkinEditor"), entDir = live.resolve("Server").resolve("SkinEditor");
        java.util.Set<String> keep = new java.util.HashSet<>();
        try (Stream<Path> files = Files.list(src)) {
            for (Path f : (Iterable<Path>) files::iterator) {
                String n = f.getFileName().toString(); if (!n.endsWith(".json") || Files.size(f) > 20_000) continue;
                String json = Files.readString(f); if ("true".equals(rawValue(json, "locked"))) continue;   // repaints of edition and reward items stay on the site
                Asset a = parse(json); if (a == null) continue;
                Path png = src.resolve(n.substring(0, n.length() - 5) + ".png"); if (!Files.isRegularFile(png) || Files.size(png) > 2_000_000) continue;
                byte[] head = new byte[8]; try (var in = Files.newInputStream(png)) { if (in.read(head) != 8 || (head[0] & 0xff) != 0x89 || head[1] != 'P' || head[2] != 'N' || head[3] != 'G') continue; }
                keep.add(a.id());
                Path tex = texDir.resolve(a.id() + ".png"), ent = entDir.resolve(a.id() + ".json");
                if (!Files.isRegularFile(tex) || Files.size(tex) != Files.size(png) || Files.getLastModifiedTime(tex).compareTo(Files.getLastModifiedTime(png)) < 0) Files.copy(png, tex, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                String entry = "{\"format\": \"skin-editor-asset\", \"version\": 1, \"id\": \"" + a.id() + "\", \"name\": \"" + a.name().replace("\\", "").replace("\"", "'") + "\", \"field\": \"" + a.field() + "\", \"model\": \"" + a.model() + "\"}\n";
                if (!Files.isRegularFile(ent) || !Files.readString(ent).equals(entry)) Files.writeString(ent, entry);
            }
        }
        for (Path dir : List.of(texDir, entDir)) try (Stream<Path> files = Files.list(dir)) {   // assets deleted on the site go here too
            for (Path f : (Iterable<Path>) files::iterator) { String n = f.getFileName().toString(), id = n.replaceAll("\\..*$", ""); if (ID.matcher(id).matches() && !keep.contains(id)) Files.deleteIfExists(f); }
        }
    }
    private static String rawValue(String json, String key) { Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*(true|false)").matcher(json); return m.find() ? m.group(1) : null; }

    // ------------------------------------------------------------------ packs
    /** every custom asset in the folder packs of this world's mods folder, read fresh each time so new packs show without a restart of the mod */
    Map<String, Asset> assets() {
        Map<String, Asset> out = new LinkedHashMap<>();
        if (modsDir == null || !Files.isDirectory(modsDir)) return out;
        try (Stream<Path> packs = Files.list(modsDir)) {
            for (Path pack : (Iterable<Path>) packs::iterator) {
                Path dir = pack.resolve("Server").resolve("SkinEditor");
                if (!Files.isDirectory(dir)) continue;
                try (Stream<Path> files = Files.list(dir)) {
                    for (Path f : (Iterable<Path>) files::iterator) {
                        if (!f.getFileName().toString().endsWith(".json") || Files.size(f) > 20_000) continue;
                        Asset a = parse(Files.readString(f));
                        if (a != null && Files.isRegularFile(pack.resolve("Common").resolve(a.texture()))) out.put(a.id(), a);
                    }
                } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not read " + dir + ": " + e); }
            }
        } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not list " + modsDir + ": " + e); }
        return out;
    }

    private static String str(String json, String key) {
        Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(json);
        return m.find() ? m.group(1).replace("\\\"", "\"").replace("\\\\", "\\") : null;
    }

    /** an entry the website wrote; anything unexpected is ignored rather than trusted */
    static Asset parse(String json) {
        if (!"skin-editor-asset".equals(str(json, "format"))) return null;
        String id = str(json, "id"), field = str(json, "field"), model = str(json, "model"), name = str(json, "name");
        if (id == null || !ID.matcher(id).matches() || field == null || !SLOTS.containsKey(field)) return null;
        if (model == null || !ASSET_PATH.matcher(model).matches() || model.contains("..") || !model.endsWith(".blockymodel")) return null;
        String texture = "Characters/SkinEditor/" + id + ".png";
        if (name == null || name.isBlank()) name = "Custom " + SLOTS.get(field);
        return new Asset(id, name.length() > 40 ? name.substring(0, 40) : name, field, model, texture);
    }

    // ------------------------------------------------------------------ wearing
    /** every skin field, in the game's order */
    static final String[] FIELDS = { "bodyCharacteristic", "underwear", "face", "ears", "mouth", "haircut", "facialHair", "eyebrows", "eyes", "pants", "overpants",
        "undertop", "overtop", "shoes", "headAccessory", "faceAccessory", "earAccessory", "skinFeature", "gloves", "cape" };
    static final Pattern PART = Pattern.compile("^[A-Za-z0-9_ -]{1,64}(\\.[A-Za-z0-9_ -]{1,64}){0,2}$");
    /** a whole skin saved on the website: its parts, and the slots that must keep the player's own part (paid items they may not own) */
    record Look(String name, Map<String, String> parts, java.util.Set<String> keepOwn) {}
    static final Map<UUID, Look> LOOKS = new ConcurrentHashMap<>();
    static final Map<UUID, PlayerSkin> APPLIED = new ConcurrentHashMap<>();   // the plain skin this mod last put on a player (look without custom pieces)

    static Object get(PlayerSkin s, String f) throws Exception { return PlayerSkin.class.getField(f).get(s); }
    static void put(PlayerSkin s, String f, String v) throws Exception { PlayerSkin.class.getField(f).set(s, v); }
    static boolean same(PlayerSkin a, PlayerSkin b) throws Exception { for (String f : FIELDS) if (!java.util.Objects.equals(get(a, f), get(b, f))) return false; return true; }

    static void wear(Store<EntityStore> store, Ref<EntityStore> ref, UUID who, Asset a) throws Exception {
        rememberOwn(store, ref, who);
        WORN.computeIfAbsent(who, k -> new ConcurrentHashMap<>()).put(a.field(), a);
        dress(store, ref, who);
    }

    /** a saved website skin on the player; custom pieces in it are worn as custom assets */
    static void wearLook(Store<EntityStore> store, Ref<EntityStore> ref, UUID who, Look look, Map<String, Asset> all) throws Exception {
        rememberOwn(store, ref, who);
        Map<String, Asset> worn = new ConcurrentHashMap<>();
        for (var e : look.parts().entrySet()) { String v = e.getValue(); if (v == null || !v.startsWith("Custom_")) continue;
            Asset a = all.get(v.substring(7).split("\\.")[0]); if (a != null && a.field().equals(e.getKey())) worn.put(e.getKey(), a); }
        if (worn.isEmpty()) WORN.remove(who); else WORN.put(who, worn);
        LOOKS.put(who, look);
        dress(store, ref, who);
    }

    /** the player's own skin, taken from the live component unless it is one this mod put there */
    static void rememberOwn(Store<EntityStore> store, Ref<EntityStore> ref, UUID who) throws Exception {
        PlayerSkinComponent pc = store.getComponent(ref, PlayerSkinComponent.getComponentType());
        if (pc != null && !(APPLIED.containsKey(who) && same(pc.getPlayerSkin(), APPLIED.get(who)))) ORIGINAL.put(who, new PlayerSkin(pc.getPlayerSkin()));
        if (!ORIGINAL.containsKey(who)) throw new IllegalStateException("no skin to start from");
    }

    static void takeOff(Store<EntityStore> store, Ref<EntityStore> ref, UUID who, String field) throws Exception {
        Map<String, Asset> worn = WORN.get(who);
        if (field == null) { WORN.remove(who); LOOKS.remove(who); } else if (worn != null) { worn.remove(field); if (worn.isEmpty()) WORN.remove(who); }
        if (!WORN.containsKey(who) && !LOOKS.containsKey(who)) {   // nothing of ours left: the plain skin goes back, exactly as the game had it
            APPLIED.remove(who); PlayerSkin orig = ORIGINAL.remove(who); if (orig == null) return;
            plain(store, ref, orig);
            return;
        }
        dress(store, ref, who);
    }

    private static void plain(Store<EntityStore> store, Ref<EntityStore> ref, PlayerSkin skin) {
        PlayerSkinComponent psc = new PlayerSkinComponent(skin); psc.setNetworkOutdated();   // marked so it is sent to the clients again
        store.putComponent(ref, PlayerSkinComponent.getComponentType(), psc);
        store.putComponent(ref, ModelComponent.getComponentType(), new ModelComponent(CosmeticsModule.get().createModel(skin)));
    }

    /** the skin to show: the player's own, with the look's parts over it (except paid slots), then custom pieces on top */
    private static PlayerSkin base(UUID who) throws Exception {
        PlayerSkin skin = new PlayerSkin(ORIGINAL.get(who)); Look look = LOOKS.get(who);
        if (look != null) for (String f : FIELDS) { if (look.keepOwn().contains(f)) continue; String v = look.parts().get(f);
            put(skin, f, v != null && v.startsWith("Custom_") ? (String) get(ORIGINAL.get(who), f) : v); }
        return skin;
    }

    private static void dress(Store<EntityStore> store, Ref<EntityStore> ref, UUID who) throws Exception {
        CosmeticsModule cm = CosmeticsModule.get();
        PlayerSkin skin = base(who);
        Map<String, Asset> worn = WORN.getOrDefault(who, Map.of());
        if (worn.isEmpty()) {   // a look with only game parts: a normal skin, drawn by every client from its own cosmetics
            try { cm.validateSkin(skin); } catch (Exception e) { throw new IllegalStateException("this skin has parts your game version does not have"); }
            APPLIED.put(who, new PlayerSkin(skin)); plain(store, ref, skin); return;
        }
        APPLIED.remove(who);
        for (String f : worn.keySet()) put(skin, f, null);   // the custom piece replaces the game's piece in that slot
        List<ModelAttachment> extra = new ArrayList<>();
        for (Asset a : worn.values()) extra.add(new ModelAttachment(a.model(), a.texture(), null, null, 1.0));
        Model m = skinToModel(cm, skin, cm.createModel(skin), extra);
        if (store.getComponent(ref, PlayerSkinComponent.getComponentType()) != null) store.removeComponent(ref, PlayerSkinComponent.getComponentType());
        store.putComponent(ref, ModelComponent.getComponentType(), new ModelComponent(m));
    }

    // ------------------------------------------------------------------ looks from the skins folder
    /** every whole skin saved in the skins folder ("My skins" and "In-game slots"), by name */
    Map<String, Look> looks() {
        Map<String, Look> out = new java.util.TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        if (skinsDir == null) return out;
        for (String sub : List.of("In-game slots", "My skins")) {
            Path dir = skinsDir.resolve(sub); if (!Files.isDirectory(dir)) continue;
            try (Stream<Path> files = Files.list(dir)) {
                for (Path f : (Iterable<Path>) files::iterator) {
                    if (!f.getFileName().toString().endsWith(".json") || Files.size(f) > 20_000) continue;
                    String json = Files.readString(f); if (!"skin-editor-skin".equals(str(json, "format"))) continue;
                    Look l = parseLook(json); if (l != null) out.putIfAbsent(l.name(), l);
                }
            } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not read " + dir + ": " + e); }
        }
        return out;
    }
    static Look parseLook(String json) {
        int at = json.indexOf("\"skin\""); if (at < 0) return null; String body = json.substring(at);
        Map<String, String> parts = new LinkedHashMap<>();
        for (String f : FIELDS) { Matcher m = Pattern.compile("\"" + f + "\"\\s*:\\s*(null|\"([^\"]*)\")").matcher(body);
            String v = m.find() && m.group(2) != null ? m.group(2) : null; if (v != null && !PART.matcher(v).matches()) return null; parts.put(f, v); }
        java.util.Set<String> keep = new java.util.HashSet<>();
        Matcher k = Pattern.compile("\"keepOwn\"\\s*:\\s*\\[([^\\]]*)\\]").matcher(json);
        if (k.find()) for (String f : FIELDS) if (k.group(1).contains("\"" + f + "\"")) keep.add(f);
        String name = str(json, "name"); if (name == null || name.isBlank()) return null;
        return new Look(name.length() > 40 ? name.substring(0, 40) : name, parts, keep);
    }
    private Path looksFile() { return dataDir.resolve("looks.txt"); }
    void saveLooks() {   // "<uuid>\t<look name>" per line
        StringBuilder sb = new StringBuilder(); LOOKS.forEach((u, l) -> sb.append(u).append('\t').append(l.name()).append('\n'));
        try { Files.writeString(looksFile(), sb.toString()); } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not save looks.txt: " + e); }
    }
    private void loadLooks() {
        try { if (!Files.isRegularFile(looksFile())) return; Map<String, Look> all = looks();
            for (String line : Files.readAllLines(looksFile())) { String[] p = line.split("\t", 2); if (p.length != 2) continue; Look l = all.get(p[1]); if (l != null) LOOKS.put(UUID.fromString(p[0]), l); }
        } catch (Exception e) { getLogger().atWarning().log("[SkinEditor] could not read looks.txt: " + e); }
    }

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

    // ------------------------------------------------------------------ commands: /skins list | wear <id> | off [slot]
    static final class Skins extends AbstractCommandCollection {
        Skins(SkinEditorPlugin p) {
            super("skins", "Wear custom assets made on the Skin Editor website");
            addSubCommand(new ListCmd(p)); addSubCommand(new WearCmd(p)); addSubCommand(new OffCmd(p)); addSubCommand(new FolderCmd(p)); addSubCommand(new LookCmd(p));
        }
    }

    static final class ListCmd extends AbstractPlayerCommand {
        private final SkinEditorPlugin p;
        ListCmd(SkinEditorPlugin p) { super("list", "List the custom assets in this world's packs"); this.p = p; }
        @Override protected void execute(CommandContext ctx, Store<EntityStore> store, Ref<EntityStore> ref, PlayerRef player, World world) {
            Map<String, Asset> all = new LinkedHashMap<>();
            try { p.syncFolder(); } catch (Exception ignored) { }
            if (all.isEmpty()) all = p.assets();
            Map<String, Look> looks = p.looks(); Look on = LOOKS.get(player.getUuid());
            if (all.isEmpty() && looks.isEmpty()) { ctx.sendMessage(Message.raw("Nothing found. On the website, save your skins to " + p.folder() + " (Wardrobe, Save skins to a folder), or set the folder with /skins folder <path>.")); return; }
            Map<String, Asset> worn = WORN.getOrDefault(player.getUuid(), Map.of());
            StringBuilder sb = new StringBuilder();
            if (!looks.isEmpty()) { sb.append("Saved skins (/skins look <name>):"); for (Look l : looks.values()) sb.append("\n  ").append(l.name()).append(on != null && on.name().equalsIgnoreCase(l.name()) ? "  [wearing]" : ""); sb.append('\n'); }
            sb.append("Custom assets (/skins wear <id>):");
            for (Asset a : all.values()) sb.append("\n  ").append(a.id()).append("  ").append(a.name()).append(" (").append(SLOTS.get(a.field())).append(')')
                .append(worn.containsKey(a.field()) && worn.get(a.field()).id().equals(a.id()) ? "  [wearing]" : "");
            ctx.sendMessage(Message.raw(sb.toString()));
        }
    }

    static final class WearCmd extends AbstractPlayerCommand {
        private final SkinEditorPlugin p; private final RequiredArg<String> id;
        WearCmd(SkinEditorPlugin p) { super("wear", "Wear a custom asset"); this.p = p; id = withRequiredArg("id", "the asset's id from /skins list", ArgTypes.STRING); }
        @Override protected void execute(CommandContext ctx, Store<EntityStore> store, Ref<EntityStore> ref, PlayerRef player, World world) {
            String want = String.valueOf(id.get(ctx)).trim().toLowerCase();
            Asset a = p.assets().get(want);
            if (a == null) { ctx.sendMessage(Message.raw("No custom asset " + want + ". See /skins list.")); return; }
            try { wear(store, ref, player.getUuid(), a); p.saveWorn(); ctx.sendMessage(Message.raw("Wearing " + a.name() + ". /skins off to take it off.")); }
            catch (Exception e) { ctx.sendMessage(Message.raw("Could not wear " + a.name() + ": " + e.getMessage())); }
        }
    }

    static final class LookCmd extends AbstractPlayerCommand {
        private final SkinEditorPlugin p; private final RequiredArg<String> name;
        LookCmd(SkinEditorPlugin p) { super("look", "Wear a whole skin saved on the website"); this.p = p; name = withRequiredArg("name", "the skin's name from /skins list", ArgTypes.GREEDY_STRING); }
        @Override protected void execute(CommandContext ctx, Store<EntityStore> store, Ref<EntityStore> ref, PlayerRef player, World world) {
            String want = String.valueOf(name.get(ctx)).trim().replace("\"", "");
            try { p.syncFolder(); } catch (Exception ignored) { }
            Look l = p.looks().get(want);
            if (l == null) { ctx.sendMessage(Message.raw("No saved skin called " + want + ". See /skins list.")); return; }
            try { wearLook(store, ref, player.getUuid(), l, p.assets()); p.saveWorn(); p.saveLooks();
                ctx.sendMessage(Message.raw("Wearing " + l.name() + (l.keepOwn().isEmpty() ? "" : " (paid items kept as your own)") + ". /skins off to go back.")); }
            catch (Exception e) { ctx.sendMessage(Message.raw("Could not wear " + l.name() + ": " + e.getMessage())); }
        }
    }

    static final class FolderCmd extends AbstractPlayerCommand {
        private final SkinEditorPlugin p; private final RequiredArg<String> path;
        FolderCmd(SkinEditorPlugin p) { super("folder", "Set the skins folder the website saves to"); this.p = p; path = withRequiredArg("path", "the folder chosen on the website", ArgTypes.GREEDY_STRING); }
        @Override protected void execute(CommandContext ctx, Store<EntityStore> store, Ref<EntityStore> ref, PlayerRef player, World world) {
            Path d = Path.of(String.valueOf(path.get(ctx)).trim().replace("\"", ""));
            if (!Files.isDirectory(d)) { ctx.sendMessage(Message.raw("No such folder: " + d + ". Write the path with forward slashes, like C:/Users/you/Documents/Hytale Skins.")); return; }
            try { p.setFolder(d); ctx.sendMessage(Message.raw("Using " + d + ". /skins list to see your custom assets.")); }
            catch (Exception e) { ctx.sendMessage(Message.raw("Could not use that folder: " + e.getMessage())); }
        }
    }

    static final class OffCmd extends AbstractPlayerCommand {
        private final SkinEditorPlugin p;
        OffCmd(SkinEditorPlugin p) { super("off", "Take off all custom assets"); this.p = p; }
        @Override protected void execute(CommandContext ctx, Store<EntityStore> store, Ref<EntityStore> ref, PlayerRef player, World world) {
            try { takeOff(store, ref, player.getUuid(), null); p.saveWorn(); p.saveLooks(); ctx.sendMessage(Message.raw("Back to your own skin.")); }
            catch (Exception e) { ctx.sendMessage(Message.raw("Could not take them off: " + e.getMessage())); }
        }
    }
}
