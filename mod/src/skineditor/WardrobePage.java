package skineditor;

import com.hypixel.hytale.codec.Codec;
import com.hypixel.hytale.codec.KeyedCodec;
import com.hypixel.hytale.codec.builder.BuilderCodec;
import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.protocol.packets.interface_.CustomPageLifetime;
import com.hypixel.hytale.protocol.packets.interface_.CustomUIEventBindingType;
import com.hypixel.hytale.server.core.entity.entities.player.pages.InteractiveCustomUIPage;
import com.hypixel.hytale.server.core.ui.Anchor;
import com.hypixel.hytale.server.core.ui.Value;
import com.hypixel.hytale.server.core.ui.builder.EventData;
import com.hypixel.hytale.server.core.ui.builder.UICommandBuilder;
import com.hypixel.hytale.server.core.ui.builder.UIEventBuilder;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;

import java.util.List;
import javax.annotation.Nonnull;

/**
 * The in-game wardrobe: the open Lumberjack wardrobe with two racks. The top one holds the player's own skin (the in-game preset
 * slots join it once Hytale allows sign-in); the bottom one the skins saved in the website's Locker ("My skins" in the skins folder),
 * all on one rail that slides along under the mouse wheel when the pointer is on it (a controller moves between the racks and along
 * them with the game's own focus moves), each on a hook with the picture the site saves beside it. A click
 * wears that skin (the mod writes Wearing.json, so custom pieces and the keepOwn rule work as from the site); the own skin gives the
 * real one back. The skin under the pointer comes forward a little; the worn one is lifted off the rail on its hanger and pops
 * out bigger. Opened by using the
 * Designer Wardrobe block, or any of the game's wardrobes in WardrobeSets (each in its own look); no commands.
 */
final class WardrobePage extends InteractiveCustomUIPage<WardrobePage.Event> {
    static final String PAGE_ID = "HytaleDesigner_Wardrobe";
    static final String LAYOUT = "Pages/HytaleDesigner/Wardrobe.ui";
    static final String CARD = "Pages/HytaleDesigner/WardrobeCard.ui";

    private final Wardrobe wardrobe;
    private final PlayerRef who;
    private final String layout;                                // the wardrobe set's own art and layout (WardrobeSets)
    private final String spot;                                  // this player at this wardrobe block: reopening it brings back the skin last touched
    private int hovered = -2;                                   // the hanger under the pointer: -1 = own skin, 0.. = bottom rack, -2 = none
    static final String NO_PIC = "UI/Custom/Pages/Memories/MissingIcon.png";
    private List<Wardrobe.Look> looks = List.of();
    private String status = "";

    WardrobePage(PlayerRef who, Wardrobe wardrobe, String layout, String spot) {
        super(who, CustomPageLifetime.CanDismissOrCloseThroughInteraction, Event.CODEC);
        this.wardrobe = wardrobe; this.who = who; this.layout = layout; this.spot = spot;
    }

    @Override
    public void build(@Nonnull Ref<EntityStore> ref, @Nonnull UICommandBuilder ui, @Nonnull UIEventBuilder ev, @Nonnull Store<EntityStore> store) {
        ui.append(layout);
        looks = wardrobe.looks();
        int show = -1; String worn = wardrobe.wornName();      // open with the worn skin in view, or the one last touched at this wardrobe
        for (int i = 0; i < looks.size(); i++) if (looks.get(i).name().equals(worn)) show = i;
        Integer last = spot == null ? null : wardrobe.pageAt(spot);
        if (last != null && last < looks.size()) show = last;
        for (int i = 0; i < looks.size(); i++) {
            ui.append("#Grid", CARD);
            String card = "#Grid[" + i + "] ";
            bind(ev, card + "#Card", Integer.toString(i));
            ui.set(card + "#Name.Text", looks.get(i).name());
            ui.set(card + "#Fav.Visible", looks.get(i).fav());
            String pic = looks.get(i).picture();
            ui.set(card + "#Pic.AssetPath", pic != null ? pic : NO_PIC);
        }
        if (show > 0) ui.set("#Grid.ScrollChildIndexIntoView", show);
        String own = wardrobe.ownPicture(who.getUuid());
        if (own != null) ui.set("#OwnPic.AssetPath", own);
        ui.set("#OwnName.Text", who.getUsername());
        bind(ev, "#OwnCard", "own");
        ui.set("#Count.Text", looks.size() + " / 50");
        ui.set("#Empty.Visible", looks.isEmpty());
        render(ui);
    }

    private static void bind(UIEventBuilder ev, String sel, String slot) {
        ev.addEventBinding(CustomUIEventBindingType.Activating, sel, EventData.of("Type", "Wear").append("Slot", slot), false);
        ev.addEventBinding(CustomUIEventBindingType.MouseEntered, sel, EventData.of("Type", "Enter").append("Slot", slot), false);
        ev.addEventBinding(CustomUIEventBindingType.MouseExited, sel, EventData.of("Type", "Leave").append("Slot", slot), false);
    }

    @Override
    public void handleDataEvent(@Nonnull Ref<EntityStore> ref, @Nonnull Store<EntityStore> store, @Nonnull Event e) {
        if (e.type == null || e.slot == null) return;
        int i;
        try { i = "own".equals(e.slot) ? -1 : Integer.parseInt(e.slot); } catch (NumberFormatException x) { return; }
        if (i < -1 || i >= looks.size()) return;
        UICommandBuilder ui = new UICommandBuilder();
        switch (e.type) {
            case "Enter" -> hovered = i;
            case "Leave" -> { if (hovered == i) hovered = -2; }
            case "Wear" -> {
                try { if (i == -1) wardrobe.wearOwn(); else wardrobe.wear(looks.get(i)); status = ""; }
                catch (Exception ex) { status = "Could not change: " + ex.getMessage(); }
                if (i >= 0 && spot != null) wardrobe.leavePage(spot, i);
            }
            default -> { return; }
        }
        render(ui); sendUpdate(ui, null, false);
    }

    /** the worn skin is lifted with its coat hanger (hook off the rail) and pops out bigger, the one under the pointer grows a
     *  little; both grow around the hanger's shoulder bar (96 below the rack's top, less the lift), so a skin never leaves its
     *  hanger. Shoulders sit 32% down a site picture and 36% down the game's own avatar picture (0.617 as wide as tall). */
    private void render(UICommandBuilder ui) {
        String worn = wardrobe.wornName();
        for (int i = 0; i < looks.size(); i++) {
            boolean on = looks.get(i).name().equals(worn); String card = "#Grid[" + i + "] ";
            int s = on ? 102 : hovered == i ? 90 : 86, up = on ? LIFT : 0;
            ui.setObject(card + "#Hanger.Anchor", box(16, 23 - up, 63, 86));
            ui.setObject(card + "#Pic.Anchor", box(47 - s / 2, 96 - up - Math.round(s * 0.32f), s, s));
        }
        boolean own = wardrobe.wearingOwn();
        int h = own ? 108 : hovered == -1 ? 96 : 92, w = Math.round(h * 0.617f), up = own ? LIFT : 0;
        ui.setObject("#OwnHanger.Anchor", box(16, 23 - up, 63, 86));
        ui.setObject("#OwnPic.Anchor", box(47 - w / 2, 96 - up - Math.round(h * 0.36f), w, h));
        ui.set("#Status.Text", status);
    }

    static final int LIFT = 12;                                 // how far the worn skin's hanger is lifted off the rail

    private static Anchor box(int left, int top, int width, int height) {
        Anchor a = new Anchor(); a.setLeft(Value.of(left)); a.setTop(Value.of(top)); a.setWidth(Value.of(width)); a.setHeight(Value.of(height));
        return a;
    }

    static final class Event {
        static final BuilderCodec<Event> CODEC = BuilderCodec.builder(Event.class, Event::new)
            .append(new KeyedCodec<>("Type", Codec.STRING), (o, v) -> o.type = v, o -> o.type).add()
            .append(new KeyedCodec<>("Slot", Codec.STRING), (o, v) -> o.slot = v, o -> o.slot).add()
            .build();
        String type;
        String slot;
    }
}
