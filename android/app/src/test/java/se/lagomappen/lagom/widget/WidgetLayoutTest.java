package se.lagomappen.lagom.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Storleksvarianterna (res/layout/lagom_widget.xml och varianterna på Android 12+). */
public class WidgetLayoutTest {

    /** Systemets textstorlekar: Liten, Standard, Stor, Störst (Android 8–13) och upp till 200 % (Android 14+). */
    private static final float[] FONT_SCALES = { 0.85f, 1f, 1.15f, 1.3f, 1.5f, 1.8f, 2f };

    // Layoutens verkliga mått, oberoende av konstanterna i WidgetLayout: teckensnittens mätvärden
    // (Roboto: top/ascent/descent/bottom 2163/1900/500/555 av 2048; serif = Noto Serif:
    // ascent/descent 1069/293 av 1000) och marginalerna i res/layout/lagom_widget.xml.
    private static final double ROBOTO = (1900 + 500) / 2048.0;
    private static final double ROBOTO_FONT_PADDING = ((2163 - 1900) + (555 - 500)) / 2048.0;
    private static final double NOTO_SERIF = (1069 + 293) / 1000.0;
    /** Radernas marginaler ovanför (detalj 2, måltider 4, vatten 3, fasta 3) – den största först. */
    private static final double[] ROW_MARGINS_WORST_FIRST = { 4, 3, 3, 2 };

    /** Höjden (dp) som dagens siffror tar: marginal, rubrikrad, energitext, stapel och {@code rows} rader. */
    private static double dayContentHeight(int rows, double fs) {
        double height = 2 * 14 + 48 + 24 * fs * NOTO_SERIF + 8 + 6;
        for (int i = 0; i < rows; i++) {
            double text = 13 * fs * (ROBOTO + ROBOTO_FONT_PADDING);
            height += ROW_MARGINS_WORST_FIRST[i] + Math.max(14, text);
        }
        return height;
    }

    /** Höjden (dp) som reservtexten tar med {@code lines} rader (15 sp, 13 sp i en trång widget). */
    private static double fallbackContentHeight(int lines, double fs, boolean tight) {
        double sp = tight ? 13 : 15;
        double padding = tight ? 12 : 14;
        return 2 * padding + 48 + 4 + (lines * ROBOTO + ROBOTO_FONT_PADDING) * sp * fs;
    }

    @Test
    public void narrowWidgetsGetTheRoundButton() {
        assertTrue(WidgetLayout.forSize(110, 200).iconButton);
        assertTrue(WidgetLayout.forSize(199, 200).iconButton);
        assertFalse(WidgetLayout.forSize(200, 200).iconButton);
        assertFalse(WidgetLayout.forSize(320, 200).iconButton);
    }

    @Test
    public void lowWidgetsAreTightWithoutOptionalRows() {
        WidgetLayout low = WidgetLayout.forSize(250, 110);
        assertTrue(low.tight);
        assertEquals(0, low.rows);
        // Vid normal textstorlek: 2 × 14 + 48 + 33 + 14 = 123 dp för rubrikrad, energi och stapel.
        assertEquals(123, WidgetLayout.tightBelow(1f));
        assertTrue(WidgetLayout.forSize(250, 122).tight);
        assertFalse(WidgetLayout.forSize(250, 123).tight);
        assertEquals(0, WidgetLayout.forSize(250, 123).rows);
        // En trång variant har aldrig rader, oavsett vad som begärs.
        assertEquals(0, new WidgetLayout(false, true, 3).rows);
    }

    @Test
    public void oneMoreRowPerStep() {
        assertEquals(0, WidgetLayout.forSize(250, 144).rows);
        assertEquals(1, WidgetLayout.forSize(250, 145).rows);
        assertEquals(1, WidgetLayout.forSize(250, 165).rows);
        assertEquals(2, WidgetLayout.forSize(250, 166).rows);
        assertEquals(3, WidgetLayout.forSize(250, 188).rows);
        assertEquals(4, WidgetLayout.forSize(250, 209).rows);
        assertEquals("Högst fyra valfria rader", 4, WidgetLayout.forSize(250, 600).rows);
    }

    @Test
    public void largerTextGivesFewerRowsInsteadOfClippedOnes() {
        // Förut: fyra rader i 202 dp oavsett textstorlek – med Stor text (1,15) behövdes cirka
        // 219 dp och den sista raden klipptes mitt i texten, med Störst (1,3) två rader.
        assertEquals(3, WidgetLayout.forSize(250, 202, 1f).rows);
        assertEquals(3, WidgetLayout.forSize(250, 202, 1.15f).rows);
        assertEquals(2, WidgetLayout.forSize(250, 202, 1.3f).rows);
        assertEquals(1, WidgetLayout.forSize(250, 202, 2f).rows);
        // Tvåa-varianten (utan rader) blir trång när energitexten och stapeln inte längre får plats.
        assertFalse(WidgetLayout.forSize(250, 130, 1f).tight);
        assertTrue(WidgetLayout.forSize(250, 130, 1.3f).tight);
        assertEquals(133, WidgetLayout.tightBelow(1.3f));
    }

    @Test
    public void everyVariantFitsWithTheRealTextHeights() {
        for (float fs : FONT_SCALES) {
            for (int height = WidgetLayout.MIN_HEIGHT; height <= 420; height++) {
                WidgetLayout layout = WidgetLayout.forSize(250, height, fs);
                String where = "Höjd " + height + " dp, textstorlek " + fs;
                if (!layout.tight) {
                    assertTrue(where + ": " + layout.rows + " rader", dayContentHeight(layout.rows, fs) <= height);
                    if (layout.rows < WidgetLayout.MAX_ROWS) {
                        // Inte onödigt snål: en rad till skulle nästan få plats (högst 8 dp marginal).
                        assertTrue(where + ": för få rader", dayContentHeight(layout.rows + 1, fs) > height - 8 * fs);
                    }
                }
                // Reservtexten: bara hela rader (minst en, som då kortas med "…").
                if (layout.fallbackLines > 1) {
                    assertTrue(where + ": " + layout.fallbackLines + " rader reservtext",
                        fallbackContentHeight(layout.fallbackLines, fs, layout.tight) <= height);
                }
            }
        }
    }

    @Test
    public void theFallbackTextGetsOnlyWholeLines() {
        // Den minsta widgeten (110 dp): två rader vid normal text, en rad med Störst (1,3).
        assertEquals(2, WidgetLayout.forSize(150, 110, 1f).fallbackLines);
        assertEquals(1, WidgetLayout.forSize(150, 110, 1.3f).fallbackLines);
        // 130 dp: två rader à 15 sp (tre klipptes förut), tre när höjden räcker.
        assertEquals(2, WidgetLayout.forSize(150, 130, 1f).fallbackLines);
        assertEquals(3, WidgetLayout.forSize(150, 160, 1f).fallbackLines);
        assertEquals("Aldrig fler än layoutens maxLines", 3, WidgetLayout.forSize(150, 400, 1f).fallbackLines);
        assertEquals("Minst en rad", 1, WidgetLayout.forSize(150, 110, 2f).fallbackLines);
    }

    @Test
    public void anUnknownSizeGivesTheFullVariant() {
        WidgetLayout unknown = WidgetLayout.forSize(0, 0);
        assertFalse(unknown.iconButton);
        assertFalse(unknown.tight);
        assertEquals(WidgetLayout.MAX_ROWS, unknown.rows);
        assertEquals(WidgetLayout.MAX_FALLBACK_LINES, unknown.fallbackLines);
    }

    @Test
    public void anUnknownFontScaleCountsAsNormal() {
        assertEquals(WidgetLayout.forSize(250, 202, 1f).rows, WidgetLayout.forSize(250, 202, 0f).rows);
        assertEquals(WidgetLayout.forSize(250, 202, 1f).rows, WidgetLayout.forSize(250, 202, Float.NaN).rows);
        // Mindre än systemets minsta (0,85) räknas som 0,85 – aldrig fler rader än så.
        assertEquals(WidgetLayout.forSize(250, 202, 0.85f).rows, WidgetLayout.forSize(250, 202, 0.5f).rows);
        // Orimligt stort räknas som 4 – ändliga, stigande höjder och inga undantag.
        assertEquals(WidgetLayout.forSize(250, 400, 4f).rows, WidgetLayout.forSize(250, 400, Float.POSITIVE_INFINITY).rows);
        assertTrue(WidgetLayout.forSize(250, 200, Float.POSITIVE_INFINITY).tight);
        int[] buckets = WidgetLayout.heightBuckets(Float.POSITIVE_INFINITY);
        assertEquals(6, buckets.length);
        for (int i = 1; i < buckets.length; i++) assertTrue(buckets[i] > buckets[i - 1]);
    }

    @Test
    public void theAndroid12BucketsCoverEveryVariant() {
        for (float fs : FONT_SCALES) {
            int[] buckets = WidgetLayout.heightBuckets(fs);
            // Varje höjdsteg ger ett eget antal rader (0 trång, 0, 1, 2, 3, 4) – inga dubbletter i onödan.
            int[] expectedRows = { 0, 0, 1, 2, 3, 4 };
            assertEquals(expectedRows.length, buckets.length);
            assertEquals(WidgetLayout.MIN_HEIGHT, buckets[0]);
            for (int i = 0; i < buckets.length; i++) {
                String where = "Höjd " + buckets[i] + " dp, textstorlek " + fs;
                WidgetLayout layout = WidgetLayout.forSize(WidgetLayout.WIDTH_BUCKETS[1], buckets[i], fs);
                assertEquals(where, expectedRows[i], layout.rows);
                assertEquals(where, i == 0, layout.tight);
                if (i > 0) {
                    assertTrue(where + ": stigande", buckets[i] > buckets[i - 1]);
                    // Steget är det första där varianten ändras – 1 dp lägre ger den förra.
                    WidgetLayout below = WidgetLayout.forSize(WidgetLayout.WIDTH_BUCKETS[1], buckets[i] - 1, fs);
                    assertEquals(where, expectedRows[i - 1], below.rows);
                    assertEquals(where, i == 1, below.tight);
                }
            }
        }
        assertEquals(WidgetLayout.MIN_WIDTH, WidgetLayout.WIDTH_BUCKETS[0]);
        assertTrue(WidgetLayout.forSize(WidgetLayout.WIDTH_BUCKETS[0], 202).iconButton);
        assertFalse(WidgetLayout.forSize(WidgetLayout.WIDTH_BUCKETS[1], 202).iconButton);
        // Android tillåter högst 16 varianter i en RemoteViews med storlekar.
        assertTrue(WidgetLayout.WIDTH_BUCKETS.length * WidgetLayout.heightBuckets(1f).length <= 16);
    }
}
