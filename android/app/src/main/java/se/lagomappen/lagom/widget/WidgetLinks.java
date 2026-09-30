package se.lagomappen.lagom.widget;

/**
 * Länkarna från widgeten till appen – ren Java, testad med JUnit.
 *
 * Widgeten skickar en uttrycklig Intent till MainActivity med ACTION_VIEW och en av länkarna nedan.
 * Ingen intent-filter, så ingen annan apps vanliga länk öppnar Lagom – men MainActivity är
 * startaktiviteten och därmed exporterad, så en annan app kan starta den uttryckligen med en sådan
 * länk. Därför leder src/native/widget.ts bara de här två vidare, till "/" och "/lagg-till" (sidor
 * som man ändå når i appen). Capacitors App-tillägg lämnar länken till webbdelen som 'appUrlOpen'
 * (appen körs, och ett sparat 'appUrlOpen' vid kallstart) och via App.getLaunchUrl() (kallstart).
 */
public final class WidgetLinks {

    /** Schemat för widgetens länkar. */
    public static final String SCHEME = "lagom-widget";
    /** Tryck på widgeten – öppnar Idag ("/"). */
    public static final String TODAY = SCHEME + "://idag";
    /** Knappen "Lägg till" – öppnar "/lagg-till". */
    public static final String ADD = SCHEME + "://lagg-till";

    private WidgetLinks() {}

    /**
     * Ska länken i aktivitetens start-Intent tas bort innan bryggan läser den? Ja för en widgetlänk
     * när Android återskapar aktiviteten med sin gamla Intent – från "Senaste" efter att processen
     * har avslutats ({@code launchedFromHistory}) eller vid återställning ({@code restored}, dvs.
     * savedInstanceState finns). Då öppnas inte Lägg till igen, långt efter trycket på widgeten.
     * En ny länk från widgeten kommer i så fall via onNewIntent och påverkas inte.
     */
    public static boolean isReplayedLink(String scheme, boolean launchedFromHistory, boolean restored) {
        return SCHEME.equals(scheme) && (launchedFromHistory || restored);
    }
}
