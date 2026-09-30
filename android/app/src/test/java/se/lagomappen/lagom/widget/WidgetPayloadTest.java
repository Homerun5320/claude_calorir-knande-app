package se.lagomappen.lagom.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.Test;

/**
 * Kontrollen av widgetdatan (kontraktet i docs/WIDGET.md) – på Map/List, som WidgetJson ger efter
 * tolkningen med org.json (som bara finns som stubbar i lokala enhetstester).
 */
public class WidgetPayloadTest {

    // ---------------------------------------------------------------------------------------------
    // Hjälpare
    // ---------------------------------------------------------------------------------------------

    /** En Map av par: nyckel, värde, nyckel, värde … (värden får vara null). */
    static Map<String, Object> map(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) map.put((String) pairs[i], pairs[i + 1]);
        return map;
    }

    static Map<String, Object> day(String date) {
        return map(
            "date", date,
            "energyText", "1 240 kcal kvar",
            "energyDetail", "760 av 2 000 kcal",
            "energyPermille", 380,
            "mealsText", "3 måltider loggade",
            "waterText", "0,75 av 2 l",
            "waterPermille", 375
        );
    }

    /** En giltig sammanfattning med dagarna {@code dates} (idag först). */
    static Map<String, Object> payload(String... dates) {
        List<Object> days = new ArrayList<>();
        for (String date : dates) days.add(day(date));
        return map(
            "v", 1,
            "generatedAt", 1_790_000_000_000L,
            "state", "ok",
            "mindful", false,
            "fallbackText", "Öppna Lagom för dagens siffror",
            "days", days,
            "fasting", null
        );
    }

    static WidgetPayload parse(Object root) {
        try {
            return WidgetPayload.fromMap(root);
        } catch (WidgetPayload.InvalidPayloadException e) {
            throw new AssertionError("Borde godtas: " + e.getMessage(), e);
        }
    }

    static void assertRejected(Object root) {
        try {
            WidgetPayload.fromMap(root);
            fail("Borde avvisas");
        } catch (WidgetPayload.InvalidPayloadException e) {
            assertNotNull(e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> firstDay(Map<String, Object> payload) {
        return (Map<String, Object>) ((List<Object>) payload.get("days")).get(0);
    }

    // ---------------------------------------------------------------------------------------------
    // Giltig data
    // ---------------------------------------------------------------------------------------------

    @Test
    public void readsAValidPayload() {
        WidgetPayload p = parse(payload("2026-09-30", "2026-10-01"));
        assertEquals(1_790_000_000_000L, p.generatedAt);
        assertEquals(WidgetPayload.State.OK, p.state);
        assertFalse(p.mindful);
        assertEquals("Öppna Lagom för dagens siffror", p.fallbackText);
        assertEquals(2, p.days.size());
        WidgetPayload.Day today = p.days.get(0);
        assertEquals("2026-09-30", today.date);
        assertEquals("1 240 kcal kvar", today.energyText);
        assertEquals("760 av 2 000 kcal", today.energyDetail);
        assertEquals(380, today.energyPermille);
        assertEquals("3 måltider loggade", today.mealsText);
        assertEquals("0,75 av 2 l", today.waterText);
        assertEquals(375, today.waterPermille);
        assertNull(p.fasting);
    }

    @Test
    public void acceptsTheOtherStatesWithoutDays() {
        Map<String, Object> noProfile = payload();
        noProfile.put("state", "noProfile");
        noProfile.put("fallbackText", "Skapa din profil i Lagom");
        assertEquals(WidgetPayload.State.NO_PROFILE, parse(noProfile).state);

        Map<String, Object> demo = payload();
        demo.put("state", "demo");
        demo.put("fallbackText", "Widgeten visar inte exempeldata");
        assertEquals(WidgetPayload.State.DEMO, parse(demo).state);
    }

    @Test
    public void acceptsNumbersAsTheJsonParserGivesThem() {
        // org.json ger Integer, Long eller Double beroende på talet.
        Map<String, Object> p = payload("2026-09-30");
        p.put("v", 1.0);
        p.put("generatedAt", 1.79e12);
        firstDay(p).put("energyPermille", 380L);
        WidgetPayload parsed = parse(p);
        assertEquals(1_790_000_000_000L, parsed.generatedAt);
        assertEquals(380, parsed.days.get(0).energyPermille);
    }

    @Test
    public void nullableTextsMayBeNullOrMissing() {
        Map<String, Object> p = payload("2026-09-30");
        Map<String, Object> d = firstDay(p);
        d.put("energyText", null);
        d.put("energyDetail", null);
        d.remove("waterText");
        WidgetPayload.Day parsed = parse(p).days.get(0);
        assertNull(parsed.energyText);
        assertNull(parsed.energyDetail);
        assertNull(parsed.waterText);
    }

    @Test
    public void ignoresUnknownFields() {
        Map<String, Object> p = payload("2026-09-30");
        p.put("somethingNew", map("x", 1));
        firstDay(p).put("steps", "4 000 steg");
        assertEquals(1, parse(p).days.size());
    }

    @Test
    public void readsFasting() {
        Map<String, Object> p = payload("2026-09-30");
        p.put("fasting", map("startedAt", 1_789_990_000_000L, "label", "Fasta pågår", "targetText", "Mål 16 h"));
        WidgetPayload.Fasting fasting = parse(p).fasting;
        assertNotNull(fasting);
        assertEquals(1_789_990_000_000L, fasting.startedAt);
        assertEquals("Fasta pågår", fasting.label);
        assertEquals("Mål 16 h", fasting.targetText);

        p.put("fasting", map("startedAt", 1_789_990_000_000L, "label", "Fasta pågår", "targetText", null));
        assertNull(parse(p).fasting.targetText);

        p.remove("fasting");
        assertNull(parse(p).fasting);
    }

    // ---------------------------------------------------------------------------------------------
    // Förlopp
    // ---------------------------------------------------------------------------------------------

    @Test
    public void clampsPermille() {
        assertEquals(0, WidgetPayload.clampPermille(0));
        assertEquals(500, WidgetPayload.clampPermille(500));
        assertEquals(1000, WidgetPayload.clampPermille(1000));
        assertEquals(1000, WidgetPayload.clampPermille(1500));
        assertEquals(1000, WidgetPayload.clampPermille(Long.MAX_VALUE));
        assertEquals(-1, WidgetPayload.clampPermille(-1));
        assertEquals(-1, WidgetPayload.clampPermille(-250));
        assertEquals(-1, WidgetPayload.clampPermille(Long.MIN_VALUE));
    }

    @Test
    public void clampsAndRoundsPermilleFromTheData() {
        Map<String, Object> p = payload("2026-09-30");
        Map<String, Object> d = firstDay(p);
        d.put("energyPermille", 1840);
        d.put("waterPermille", -7);
        WidgetPayload.Day parsed = parse(p).days.get(0);
        assertEquals(1000, parsed.energyPermille);
        assertEquals(-1, parsed.waterPermille);

        d.put("energyPermille", 412.6);
        d.remove("waterPermille");
        parsed = parse(p).days.get(0);
        assertEquals(413, parsed.energyPermille);
        assertEquals("Saknat förlopp döljer stapeln", -1, parsed.waterPermille);
    }

    // ---------------------------------------------------------------------------------------------
    // Ogiltig data
    // ---------------------------------------------------------------------------------------------

    @Test
    public void rejectsWrongRootAndVersion() {
        assertRejected(null);
        assertRejected("text");
        assertRejected(Arrays.asList(1, 2));

        Map<String, Object> p = payload("2026-09-30");
        p.put("v", 2);
        assertRejected(p);
        p.put("v", "1");
        assertRejected(p);
        p.put("v", 1.5);
        assertRejected(p);
        p.remove("v");
        assertRejected(p);
    }

    @Test
    public void rejectsWrongTopLevelFields() {
        Map<String, Object> p = payload("2026-09-30");
        p.put("state", "okej");
        assertRejected(p);

        p = payload("2026-09-30");
        p.remove("mindful");
        assertRejected(p);

        p = payload("2026-09-30");
        p.put("mindful", "false");
        assertRejected(p);

        p = payload("2026-09-30");
        p.put("fallbackText", null);
        assertRejected(p);

        p = payload("2026-09-30");
        p.put("generatedAt", -1);
        assertRejected(p);

        p = payload("2026-09-30");
        p.put("generatedAt", 12.5);
        assertRejected(p);

        p = payload("2026-09-30");
        p.put("days", map("date", "2026-09-30"));
        assertRejected(p);

        p = payload("2026-09-30");
        p.remove("days");
        assertRejected(p);
    }

    @Test
    public void rejectsTooManyDays() {
        String[] dates = new String[WidgetPayload.MAX_DAYS + 1];
        for (int i = 0; i < dates.length; i++) dates[i] = String.format(Locale.ROOT, "2026-10-%02d", (i % 31) + 1);
        assertRejected(payload(dates));

        String[] allowed = Arrays.copyOf(dates, WidgetPayload.MAX_DAYS);
        assertEquals(WidgetPayload.MAX_DAYS, parse(payload(allowed)).days.size());
    }

    @Test
    public void rejectsInvalidDates() {
        for (String date : new String[] { "2026-02-30", "2026-9-30", "30/09/2026", "2026-09-30T00:00", "", "2026-13-01" }) {
            assertRejected(payload(date));
        }
        Map<String, Object> p = payload("2026-09-30");
        firstDay(p).put("date", 20260930);
        assertRejected(p);
        assertTrue(WidgetPayload.isIsoDate("2028-02-29"));
        assertFalse(WidgetPayload.isIsoDate("2027-02-29"));
    }

    @Test
    public void rejectsWrongDayFields() {
        Map<String, Object> p = payload("2026-09-30");
        firstDay(p).remove("mealsText");
        assertRejected(p);

        p = payload("2026-09-30");
        firstDay(p).put("energyText", 1240);
        assertRejected(p);

        p = payload("2026-09-30");
        firstDay(p).put("energyPermille", "380");
        assertRejected(p);

        p = payload("2026-09-30");
        firstDay(p).put("waterPermille", Double.NaN);
        assertRejected(p);

        p = payload("2026-09-30");
        @SuppressWarnings("unchecked")
        List<Object> days = (List<Object>) p.get("days");
        days.add("2026-10-01");
        assertRejected(p);
    }

    @Test
    public void rejectsTooLongTexts() {
        StringBuilder longText = new StringBuilder();
        for (int i = 0; i <= WidgetPayload.MAX_TEXT; i++) longText.append('x');
        Map<String, Object> p = payload("2026-09-30");
        firstDay(p).put("mealsText", longText.toString());
        assertRejected(p);

        p = payload("2026-09-30");
        p.put("fallbackText", longText.toString());
        assertRejected(p);

        p = payload("2026-09-30");
        firstDay(p).put("mealsText", longText.substring(1));
        assertEquals(WidgetPayload.MAX_TEXT, parse(p).days.get(0).mealsText.length());
    }

    @Test
    public void rejectsInvalidFasting() {
        Map<String, Object> p = payload("2026-09-30");
        p.put("fasting", map("startedAt", 0, "label", "Fasta pågår", "targetText", "Mål 16 h"));
        assertRejected(p);
        p.put("fasting", map("startedAt", -5, "label", "Fasta pågår"));
        assertRejected(p);
        p.put("fasting", map("startedAt", "1789990000000", "label", "Fasta pågår"));
        assertRejected(p);
        p.put("fasting", map("startedAt", 1_789_990_000_000L));
        assertRejected(p);
        p.put("fasting", "Fasta pågår");
        assertRejected(p);
    }

    // ---------------------------------------------------------------------------------------------
    // Texten före tolkningen
    // ---------------------------------------------------------------------------------------------

    @Test
    public void checksTheLengthOfTheText() throws Exception {
        StringBuilder text = new StringBuilder("\"");
        while (text.length() < WidgetPayload.MAX_CHARS - 1) text.append('a');
        text.append('"');
        assertEquals(WidgetPayload.MAX_CHARS, text.length());
        WidgetPayload.checkText(text.toString());

        text.insert(1, 'a');
        try {
            WidgetPayload.checkText(text.toString());
            fail("För lång text borde avvisas");
        } catch (WidgetPayload.InvalidPayloadException e) {
            assertEquals("Widgetdatan är för stor", e.getMessage());
        }
        try {
            WidgetPayload.checkText(null);
            fail("Saknad text borde avvisas");
        } catch (WidgetPayload.InvalidPayloadException expected) {
            // Väntat.
        }
    }

    @Test
    public void measuresNestingOutsideStrings() {
        assertEquals(0, WidgetPayload.maxNestingDepth("\"text\""));
        assertEquals(1, WidgetPayload.maxNestingDepth("{\"a\":1}"));
        assertEquals(3, WidgetPayload.maxNestingDepth("{\"days\":[{\"date\":\"2026-09-30\"}],\"fasting\":{}}"));
        // Klamrar i strängar räknas inte, inte heller efter ett escapat citattecken.
        assertEquals(1, WidgetPayload.maxNestingDepth("{\"a\":\"[[[[{{{{\"}"));
        assertEquals(1, WidgetPayload.maxNestingDepth("{\"a\":\"x\\\"[[[[\"}"));
        assertEquals(2, WidgetPayload.maxNestingDepth("{\"a\":\"\\\\\",\"b\":[1]}"));
    }

    @Test
    public void rejectsDeeplyNestedText() throws Exception {
        StringBuilder deep = new StringBuilder();
        for (int i = 0; i < 5000; i++) deep.append('[');
        try {
            WidgetPayload.checkText(deep.toString());
            fail("Djup nästling borde avvisas före tolkningen");
        } catch (WidgetPayload.InvalidPayloadException e) {
            assertEquals("Widgetdatan är för djupt nästlad", e.getMessage());
        }
        WidgetPayload.checkText("{\"days\":[{\"date\":\"2026-09-30\"}],\"fasting\":{\"startedAt\":1}}");
    }

    // ---------------------------------------------------------------------------------------------
    // Dagarna
    // ---------------------------------------------------------------------------------------------

    @Test
    public void findsTheDayForADate() {
        WidgetPayload p = parse(payload("2026-09-30", "2026-10-01", "2026-10-02"));
        assertEquals("2026-10-01", p.dayFor("2026-10-01").date);
        assertNull(p.dayFor("2026-10-03"));
        assertNull(p.dayFor("2026-09-29"));
        assertNull(p.dayFor(null));
    }

    @Test
    public void theFirstOfDuplicateDatesWins() {
        Map<String, Object> p = payload("2026-09-30", "2026-09-30");
        @SuppressWarnings("unchecked")
        Map<String, Object> second = (Map<String, Object>) ((List<Object>) p.get("days")).get(1);
        second.put("mealsText", "Andra");
        WidgetPayload parsed = parse(p);
        assertSame(parsed.days.get(0), parsed.dayFor("2026-09-30"));
        assertEquals("3 måltider loggade", parsed.dayFor("2026-09-30").mealsText);
    }
}
