package se.lagomappen.lagom.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static se.lagomappen.lagom.widget.WidgetPayloadTest.firstDay;
import static se.lagomappen.lagom.widget.WidgetPayloadTest.map;
import static se.lagomappen.lagom.widget.WidgetPayloadTest.parse;
import static se.lagomappen.lagom.widget.WidgetPayloadTest.payload;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import org.junit.Test;

/** Vad widgeten visar: lägen, dagens rad, dygnsskiftet, medvetet läge, raderna och fastans räknare. */
public class WidgetViewTest {

    private static final String DEFAULT_FALLBACK = "Öppna Lagom för dagens siffror";
    /** Hela 4 × 3-varianten: alla fyra valfria rader får plats. */
    private static final WidgetLayout ROOMY = WidgetLayout.forSize(300, 220);

    /** En vecka från 2026-09-30 (idag först), som appen skickar den. */
    private static final String[] WEEK = {
        "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06",
    };

    private static WidgetView decide(WidgetPayload payload, String today) {
        return WidgetView.decide(payload, today, DEFAULT_FALLBACK, ROOMY);
    }

    // ---------------------------------------------------------------------------------------------
    // Lägena
    // ---------------------------------------------------------------------------------------------

    @Test
    public void withoutDataShowsTheDefaultTextAndTheAddButton() {
        WidgetView view = decide(null, "2026-09-30");
        assertFalse(view.showsDay());
        assertFalse(view.titleToday);
        assertTrue(view.showAdd);
        assertEquals(DEFAULT_FALLBACK, view.fallbackText);
        assertHidesTheDay(view);
    }

    @Test
    public void noProfileAndDemoShowOnlyTheirTextWithoutButton() {
        Map<String, Object> noProfile = payload();
        noProfile.put("state", "noProfile");
        noProfile.put("fallbackText", "Skapa din profil i Lagom");
        WidgetView view = decide(parse(noProfile), "2026-09-30");
        assertEquals("Skapa din profil i Lagom", view.fallbackText);
        assertFalse(view.showAdd);
        assertFalse(view.titleToday);
        assertHidesTheDay(view);

        // Exempeldata visas aldrig – inte ens om datan råkar innehålla dagar och en fasta.
        Map<String, Object> demo = payload(WEEK);
        demo.put("state", "demo");
        demo.put("fallbackText", "Widgeten visar inte exempeldata");
        demo.put("fasting", map("startedAt", 1_789_990_000_000L, "label", "Fasta pågår", "targetText", "Mål 16 h"));
        view = decide(parse(demo), "2026-09-30");
        assertEquals("Widgeten visar inte exempeldata", view.fallbackText);
        assertFalse(view.showAdd);
        assertHidesTheDay(view);
    }

    @Test
    public void anEmptyFallbackTextFromTheAppUsesTheDefault() {
        Map<String, Object> p = payload();
        p.put("state", "noProfile");
        p.put("fallbackText", "  ");
        assertEquals(DEFAULT_FALLBACK, decide(parse(p), "2026-09-30").fallbackText);
    }

    @Test
    public void showsTodaysRow() {
        WidgetView view = decide(parse(payload(WEEK)), "2026-09-30");
        assertTrue(view.showsDay());
        assertTrue(view.titleToday);
        assertTrue(view.showAdd);
        assertNull(view.fallbackText);
        assertEquals("1 240 kcal kvar", view.energyText);
        assertEquals("760 av 2 000 kcal", view.energyDetail);
        assertEquals(380, view.energyPermille);
        assertEquals("3 måltider loggade", view.mealsText);
        assertEquals("0,75 av 2 l", view.waterText);
        assertEquals(375, view.waterPermille);
        assertNull(view.fasting);
    }

    // ---------------------------------------------------------------------------------------------
    // Dygnsskiftet och saknade dagar
    // ---------------------------------------------------------------------------------------------

    @Test
    public void afterMidnightShowsTheNextDaysRowFromTheSameData() {
        Map<String, Object> p = payload(WEEK);
        @SuppressWarnings("unchecked")
        Map<String, Object> tomorrow = (Map<String, Object>) ((java.util.List<Object>) p.get("days")).get(1);
        tomorrow.put("energyText", "2 000 kcal kvar");
        tomorrow.put("energyDetail", "0 av 2 000 kcal");
        tomorrow.put("energyPermille", 0);
        tomorrow.put("mealsText", "Inget loggat än");
        WidgetPayload data = parse(p);

        WidgetView before = decide(data, "2026-09-30");
        WidgetView after = decide(data, "2026-10-01");
        assertEquals("1 240 kcal kvar", before.energyText);
        assertEquals("2 000 kcal kvar", after.energyText);
        assertEquals("Inget loggat än", after.mealsText);
        assertEquals(0, after.energyPermille);
        assertTrue(after.titleToday);
    }

    @Test
    public void theLastDayInTheDataIsStillShown() {
        assertTrue(decide(parse(payload(WEEK)), "2026-10-06").showsDay());
    }

    @Test
    public void aDateOutsideTheDataShowsTheAppsFallbackTextButKeepsTheButton() {
        WidgetPayload data = parse(payload(WEEK));
        for (String today : new String[] { "2026-10-07", "2026-09-29", "2027-01-01" }) {
            WidgetView view = decide(data, today);
            assertFalse(today, view.showsDay());
            assertEquals("Öppna Lagom för dagens siffror", view.fallbackText);
            assertTrue("Knappen finns kvar – profilen finns", view.showAdd);
            assertHidesTheDay(view);
        }
    }

    @Test
    public void aGapInTheDaysShowsTheFallback() {
        WidgetPayload data = parse(payload("2026-09-30", "2026-10-02"));
        assertFalse(decide(data, "2026-10-01").showsDay());
        assertTrue(decide(data, "2026-10-02").showsDay());
    }

    @Test
    public void okWithoutDaysShowsTheFallback() {
        WidgetView view = decide(parse(payload()), "2026-09-30");
        assertFalse(view.showsDay());
        assertTrue(view.showAdd);
    }

    // ---------------------------------------------------------------------------------------------
    // Medvetet läge
    // ---------------------------------------------------------------------------------------------

    @Test
    public void mindfulModeNeverShowsEnergyEvenIfTheDataHasIt() {
        Map<String, Object> p = payload(WEEK);
        p.put("mindful", true);
        WidgetView view = decide(parse(p), "2026-09-30");
        assertTrue(view.showsDay());
        assertNull(view.energyText);
        assertNull(view.energyDetail);
        assertEquals(-1, view.energyPermille);
        // Måltider och vatten är inga energisiffror.
        assertEquals("3 måltider loggade", view.mealsText);
        assertEquals("0,75 av 2 l", view.waterText);
    }

    @Test
    public void mindfulModeAsTheAppSendsIt() {
        Map<String, Object> p = payload(WEEK);
        p.put("mindful", true);
        Map<String, Object> d = firstDay(p);
        d.put("energyText", null);
        d.put("energyDetail", null);
        d.put("energyPermille", -1);
        WidgetView view = decide(parse(p), "2026-09-30");
        assertNull(view.energyText);
        assertEquals(-1, view.energyPermille);
    }

    @Test
    public void mindfulModeGivesRoomForOneMoreRowInATightWidget() {
        Map<String, Object> p = payload(WEEK);
        WidgetLayout tight = WidgetLayout.forSize(150, 110);
        WidgetView normal = WidgetView.decide(parse(p), "2026-09-30", DEFAULT_FALLBACK, tight);
        assertNotNull(normal.energyText);
        assertNull("Trång widget: inga valfria rader", normal.mealsText);

        p.put("mindful", true);
        WidgetView mindful = WidgetView.decide(parse(p), "2026-09-30", DEFAULT_FALLBACK, tight);
        assertNull(mindful.energyText);
        assertEquals("3 måltider loggade", mindful.mealsText);
        assertNull(mindful.waterText);
    }

    // ---------------------------------------------------------------------------------------------
    // Raderna efter storlek
    // ---------------------------------------------------------------------------------------------

    @Test
    public void optionalRowsFollowThePriorityOrder() {
        Map<String, Object> p = payload(WEEK);
        p.put("fasting", map("startedAt", 1_789_990_000_000L, "label", "Fasta pågår", "targetText", "Mål 16 h"));
        WidgetPayload data = parse(p);

        WidgetView none = WidgetView.decide(data, "2026-09-30", DEFAULT_FALLBACK, new WidgetLayout(false, false, 0));
        assertNotNull(none.energyText);
        assertEquals(380, none.energyPermille);
        assertNull(none.energyDetail);
        assertNull(none.mealsText);
        assertNull(none.fasting);
        assertNull(none.waterText);
        assertEquals(-1, none.waterPermille);

        WidgetView one = WidgetView.decide(data, "2026-09-30", DEFAULT_FALLBACK, new WidgetLayout(false, false, 1));
        assertNotNull(one.energyDetail);
        assertNull(one.mealsText);

        WidgetView two = WidgetView.decide(data, "2026-09-30", DEFAULT_FALLBACK, new WidgetLayout(false, false, 2));
        assertNotNull(two.mealsText);
        assertNull(two.fasting);

        WidgetView three = WidgetView.decide(data, "2026-09-30", DEFAULT_FALLBACK, new WidgetLayout(false, false, 3));
        assertNotNull("Fastan går före vattnet", three.fasting);
        assertNull(three.waterText);

        WidgetView four = WidgetView.decide(data, "2026-09-30", DEFAULT_FALLBACK, new WidgetLayout(false, false, 4));
        assertEquals("0,75 av 2 l", four.waterText);
        assertEquals(375, four.waterPermille);
    }

    @Test
    public void missingRowsLeaveRoomForTheNext() {
        Map<String, Object> p = payload(WEEK);
        firstDay(p).put("energyDetail", null);
        WidgetView view = WidgetView.decide(parse(p), "2026-09-30", DEFAULT_FALLBACK, new WidgetLayout(false, false, 2));
        assertEquals("3 måltider loggade", view.mealsText);
        assertEquals("Ingen fasta – vattnet får platsen", "0,75 av 2 l", view.waterText);
    }

    @Test
    public void blankTextsAndHiddenBarsAreHidden() {
        Map<String, Object> p = payload(WEEK);
        Map<String, Object> d = firstDay(p);
        d.put("mealsText", "");
        d.put("waterText", null);
        d.put("waterPermille", 500);
        d.put("energyDetail", " ");
        d.put("energyPermille", -1);
        WidgetView view = decide(parse(p), "2026-09-30");
        assertNull(view.mealsText);
        assertNull(view.waterText);
        assertEquals("Vattnets stapel följer raden", -1, view.waterPermille);
        assertNull(view.energyDetail);
        assertEquals(-1, view.energyPermille);
        assertEquals("1 240 kcal kvar", view.energyText);
    }

    @Test
    public void waterWithoutTargetShowsTextButNoBar() {
        Map<String, Object> p = payload(WEEK);
        firstDay(p).put("waterPermille", -1);
        WidgetView view = decide(parse(p), "2026-09-30");
        assertEquals("0,75 av 2 l", view.waterText);
        assertEquals(-1, view.waterPermille);
    }

    // ---------------------------------------------------------------------------------------------
    // Fastan
    // ---------------------------------------------------------------------------------------------

    @Test
    public void fastingIsShownOnlyWithTodaysRow() {
        Map<String, Object> p = payload(WEEK);
        p.put("fasting", map("startedAt", 1_789_990_000_000L, "label", "Fasta pågår", "targetText", "Mål 16 h"));
        WidgetPayload data = parse(p);
        WidgetView today = decide(data, "2026-09-30");
        assertNotNull(today.fasting);
        assertEquals("Fasta pågår", today.fasting.label);
        assertEquals("Mål 16 h", today.fasting.targetText);
        assertNull("Ingen dag för idag – be om att öppna appen i stället", decide(data, "2026-10-08").fasting);
    }

    @Test
    public void chronometerBaseCountsUpFromTheStart() {
        long elapsedNow = 5_000_000L; // SystemClock.elapsedRealtime()
        long wallNow = 1_790_000_000_000L; // System.currentTimeMillis()
        long startedAt = wallNow - (14 * 3_600_000L + 3 * 60_000L + 22_000L); // 14:03:22 sedan

        long base = WidgetView.chronometerBase(elapsedNow, wallNow, startedAt);
        // Chronometer visar elapsedRealtime() - base.
        assertEquals(14 * 3_600_000L + 3 * 60_000L + 22_000L, elapsedNow - base);
        // Basen kan vara negativ (fastan började före den senaste omstarten) – det är giltigt.
        assertTrue(base < 0);
        // En sekund senare har räknaren gått en sekund.
        assertEquals(elapsedNow - base + 1_000L, (elapsedNow + 1_000L) - base);
    }

    @Test
    public void chronometerBaseForAStartInTheFutureIsZeroElapsed() {
        long elapsedNow = 5_000_000L;
        long wallNow = 1_790_000_000_000L;
        assertEquals(elapsedNow, WidgetView.chronometerBase(elapsedNow, wallNow, wallNow + 60_000L));
        assertEquals(elapsedNow, WidgetView.chronometerBase(elapsedNow, wallNow, wallNow));
    }

    // ---------------------------------------------------------------------------------------------
    // Ritningen vid midnatt
    // ---------------------------------------------------------------------------------------------

    @Test
    public void nextRefreshIsJustAfterTheNextLocalMidnight() {
        ZoneId stockholm = ZoneId.of("Europe/Stockholm");
        ZonedDateTime evening = ZonedDateTime.of(2026, 9, 30, 23, 59, 30, 0, stockholm);
        long refresh = WidgetView.nextMidnightRefresh(evening);
        ZonedDateTime at = java.time.Instant.ofEpochMilli(refresh).atZone(stockholm);
        assertEquals(LocalDate.of(2026, 10, 1), at.toLocalDate());
        assertEquals(0, at.getHour());
        assertEquals(1, at.getMinute());

        // Strax efter midnatt: nästa midnatt, inte den som just passerade.
        ZonedDateTime night = ZonedDateTime.of(2026, 10, 1, 0, 0, 5, 0, stockholm);
        assertEquals(LocalDate.of(2026, 10, 2), java.time.Instant.ofEpochMilli(WidgetView.nextMidnightRefresh(night)).atZone(stockholm).toLocalDate());
    }

    @Test
    public void theMidnightRefreshHasATenMinuteWindow() {
        // Ett vanligt inexakt alarm (set) kan komma upp till en timme för sent: widgeten visade då
        // gårdagens rad under "Idag" till cirka 01:01. Fönstret (setWindow) slutar senast 00:11.
        ZoneId stockholm = ZoneId.of("Europe/Stockholm");
        ZonedDateTime evening = ZonedDateTime.of(2026, 9, 30, 22, 0, 0, 0, stockholm);
        long start = WidgetView.nextMidnightRefresh(evening);
        ZonedDateTime latest = java.time.Instant.ofEpochMilli(start + WidgetView.MIDNIGHT_WINDOW_MS).atZone(stockholm);
        assertEquals(LocalDate.of(2026, 10, 1), latest.toLocalDate());
        assertEquals(0, latest.getHour());
        assertEquals(11, latest.getMinute());
        // Android 12+ förlänger kortare fönster till 10 minuter – längre behövs inte.
        assertEquals(10 * 60_000L, WidgetView.MIDNIGHT_WINDOW_MS);
    }

    @Test
    public void nextRefreshFollowsDaylightSavingTime() {
        ZoneId stockholm = ZoneId.of("Europe/Stockholm");
        // Natten till sista söndagen i oktober 2026 (25/10) är 25 timmar lång lokalt – midnatt är ändå midnatt.
        ZonedDateTime before = ZonedDateTime.of(2026, 10, 24, 12, 0, 0, 0, stockholm);
        ZonedDateTime at = java.time.Instant.ofEpochMilli(WidgetView.nextMidnightRefresh(before)).atZone(stockholm);
        assertEquals(LocalDate.of(2026, 10, 25), at.toLocalDate());
        assertEquals(0, at.getHour());
        assertEquals(1, at.getMinute());

        ZonedDateTime spring = ZonedDateTime.of(2027, 3, 27, 22, 0, 0, 0, stockholm);
        at = java.time.Instant.ofEpochMilli(WidgetView.nextMidnightRefresh(spring)).atZone(stockholm);
        assertEquals(LocalDate.of(2027, 3, 28), at.toLocalDate());
        assertEquals(0, at.getHour());
    }

    // ---------------------------------------------------------------------------------------------

    private static void assertHidesTheDay(WidgetView view) {
        assertNull(view.energyText);
        assertNull(view.energyDetail);
        assertEquals(-1, view.energyPermille);
        assertNull(view.mealsText);
        assertNull(view.waterText);
        assertEquals(-1, view.waterPermille);
        assertNull(view.fasting);
    }
}
