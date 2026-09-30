package se.lagomappen.lagom.widget;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * Vad widgeten ska visa – ren logik utan android.*, testad med JUnit. {@link LagomWidgetProvider}
 * översätter resultatet till RemoteViews rad för rad.
 *
 * Reglerna (kontraktet i docs/WIDGET.md):
 * - Ingen sparad data → reservtexten från appens resurser ("Öppna Lagom för dagens siffror").
 * - {@code state} är inte "ok" (ingen profil, exempeldata) → datans {@code fallbackText}, ingen
 *   knapp och ingen fasta.
 * - Ingen dag i datan har dagens lokala datum (appen har inte öppnats på en vecka, eller klockan har
 *   ställts om) → {@code fallbackText}, men knappen "Lägg till" finns kvar.
 * - Medvetet läge → aldrig energisiffror eller energistapel, oavsett vad datan innehåller.
 * - En text som är null eller tom döljer sin rad; ett förlopp på -1 döljer sin stapel.
 * - Valfria rader visas i prioritetsordning så långt höjden räcker: energidetaljen, måltider, fasta
 *   och vatten (i layouten står de i ordningen detalj, måltider, vatten, fasta).
 */
public final class WidgetView {

    /** Rubriken: "Idag" när dagens siffror visas, annars "Lagom". */
    public final boolean titleToday;
    /** Visa knappen "Lägg till" (text eller ikon enligt {@link #layout}). */
    public final boolean showAdd;
    /** Reservtexten, eller null när dagens siffror visas. */
    public final String fallbackText;
    public final String energyText;
    public final String energyDetail;
    /** 0–1000, eller -1 när stapeln döljs. */
    public final int energyPermille;
    public final String mealsText;
    public final String waterText;
    /** 0–1000, eller -1 när stapeln döljs (alltid -1 när vattenraden döljs). */
    public final int waterPermille;
    /** Pågående fasta att visa, eller null. */
    public final WidgetPayload.Fasting fasting;
    /** Storleksvarianten som vyn gäller för. */
    public final WidgetLayout layout;

    private WidgetView(
        boolean titleToday,
        boolean showAdd,
        String fallbackText,
        String energyText,
        String energyDetail,
        int energyPermille,
        String mealsText,
        String waterText,
        int waterPermille,
        WidgetPayload.Fasting fasting,
        WidgetLayout layout
    ) {
        this.titleToday = titleToday;
        this.showAdd = showAdd;
        this.fallbackText = fallbackText;
        this.energyText = energyText;
        this.energyDetail = energyDetail;
        this.energyPermille = energyPermille;
        this.mealsText = mealsText;
        this.waterText = waterText;
        this.waterPermille = waterPermille;
        this.fasting = fasting;
        this.layout = layout;
    }

    /** Visar vyn dagens siffror (och inte en reservtext)? */
    public boolean showsDay() {
        return fallbackText == null;
    }

    /**
     * Bestäm vad som visas.
     *
     * @param payload         den sparade datan, eller null om ingen finns (eller den inte gick att läsa)
     * @param today           dagens lokala datum 'ÅÅÅÅ-MM-DD'
     * @param defaultFallback reservtexten när datan saknas eller saknar en egen
     * @param layout          storleksvarianten
     */
    public static WidgetView decide(WidgetPayload payload, String today, String defaultFallback, WidgetLayout layout) {
        if (payload == null) {
            return fallback(defaultFallback, true, layout);
        }
        String fallbackText = isBlank(payload.fallbackText) ? defaultFallback : payload.fallbackText;
        if (payload.state != WidgetPayload.State.OK) {
            return fallback(fallbackText, false, layout);
        }
        WidgetPayload.Day day = payload.dayFor(today);
        if (day == null) {
            return fallback(fallbackText, true, layout);
        }

        String energyText = payload.mindful ? null : blankToNull(day.energyText);
        String energyDetail = payload.mindful ? null : blankToNull(day.energyDetail);
        int energyPermille = payload.mindful ? WidgetPayload.PERMILLE_HIDDEN : day.energyPermille;
        String mealsText = blankToNull(day.mealsText);
        String waterText = blankToNull(day.waterText);
        WidgetPayload.Fasting fasting = payload.fasting;

        // Utan energitext (medvetet läge) finns plats för en rad till.
        int budget = layout.rows + (energyText == null ? 1 : 0);
        boolean showDetail = false;
        boolean showMeals = false;
        boolean showFasting = false;
        boolean showWater = false;
        if (energyDetail != null && budget > 0) {
            showDetail = true;
            budget--;
        }
        if (mealsText != null && budget > 0) {
            showMeals = true;
            budget--;
        }
        if (fasting != null && budget > 0) {
            showFasting = true;
            budget--;
        }
        if (waterText != null && budget > 0) {
            showWater = true;
        }

        return new WidgetView(
            true,
            true,
            null,
            energyText,
            showDetail ? energyDetail : null,
            energyPermille,
            showMeals ? mealsText : null,
            showWater ? waterText : null,
            showWater ? day.waterPermille : WidgetPayload.PERMILLE_HIDDEN,
            showFasting ? fasting : null,
            layout
        );
    }

    private static WidgetView fallback(String text, boolean showAdd, WidgetLayout layout) {
        return new WidgetView(
            false,
            showAdd,
            text,
            null,
            null,
            WidgetPayload.PERMILLE_HIDDEN,
            null,
            null,
            WidgetPayload.PERMILLE_HIDDEN,
            null,
            layout
        );
    }

    /**
     * Basen för en Chronometer som räknar upp från {@code startedAt} (millisekunder sedan 1970):
     * Chronometer räknar i {@code SystemClock.elapsedRealtime()}, så basen är "nu" i den klockan
     * minus den tid som har gått enligt väggklockan. En starttid i framtiden (klockan ställd bakåt)
     * räknas som noll.
     *
     * @param elapsedRealtimeNow SystemClock.elapsedRealtime() just nu
     * @param wallClockNow       System.currentTimeMillis() just nu
     */
    public static long chronometerBase(long elapsedRealtimeNow, long wallClockNow, long startedAt) {
        long elapsed = Math.max(0L, wallClockNow - startedAt);
        return elapsedRealtimeNow - elapsed;
    }

    /** Marginal efter midnatt för ritningen vid dygnsskiftet, så att den säkert hamnar på nya dagen. */
    public static final long AFTER_MIDNIGHT_MS = 60_000L;

    /**
     * Fönstret (ms) som systemet får leverera ritningen vid dygnsskiftet inom
     * (AlarmManager.setWindow). 10 minuter är det kortaste fönster Android 12+ tillåter; ett vanligt
     * inexakt alarm (set) kan komma upp till en timme för sent.
     */
    public static final long MIDNIGHT_WINDOW_MS = 10 * 60_000L;

    /**
     * Tidpunkten (millisekunder sedan 1970) för nästa ritning vid dygnsskiftet: en minut efter nästa
     * lokala midnatt. Följer tidszonens regler (sommartid) via {@link LocalDate#atStartOfDay(ZoneId)}.
     */
    public static long nextMidnightRefresh(ZonedDateTime now) {
        ZoneId zone = now.getZone();
        return now.toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() + AFTER_MIDNIGHT_MS;
    }

    private static boolean isBlank(String text) {
        return text == null || text.trim().isEmpty();
    }

    private static String blankToNull(String text) {
        return isBlank(text) ? null : text;
    }
}
