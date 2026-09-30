package se.lagomappen.lagom.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Widgetens länkar (samma som WIDGET_LINKS i src/native/widget.ts) och gamla länkar vid återskapning. */
public class WidgetLinksTest {

    @Test
    public void theLinksMatchTheContract() {
        assertEquals("lagom-widget://idag", WidgetLinks.TODAY);
        assertEquals("lagom-widget://lagg-till", WidgetLinks.ADD);
        assertEquals("lagom-widget", WidgetLinks.SCHEME);
    }

    @Test
    public void aNewTapFromTheWidgetIsKept() {
        assertFalse(WidgetLinks.isReplayedLink("lagom-widget", false, false));
    }

    @Test
    public void anOldLinkReplayedByAndroidIsDropped() {
        // Från "Senaste" efter att processen har avslutats.
        assertTrue(WidgetLinks.isReplayedLink("lagom-widget", true, false));
        // Aktiviteten återskapas med savedInstanceState.
        assertTrue(WidgetLinks.isReplayedLink("lagom-widget", false, true));
        assertTrue(WidgetLinks.isReplayedLink("lagom-widget", true, true));
    }

    @Test
    public void otherLinksAreLeftToCapacitor() {
        assertFalse(WidgetLinks.isReplayedLink("https", true, true));
        assertFalse(WidgetLinks.isReplayedLink(null, true, true));
        assertFalse(WidgetLinks.isReplayedLink("Lagom-Widget", true, true));
    }
}
