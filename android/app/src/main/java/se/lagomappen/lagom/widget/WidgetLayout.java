package se.lagomappen.lagom.widget;

/**
 * Hur mycket som får plats i widgeten vid en viss storlek (dp) och systemets textstorlek
 * (Configuration.fontScale). Ren Java – testas med JUnit.
 *
 * Layouten (res/layout/lagom_widget.xml) är en kolumn: rubrikrad med knappen "Lägg till" (48 dp
 * hög), energitexten, stapeln och sedan valfria rader (energidetaljen, måltider, fasta, vatten) som
 * visas i prioritetsordning så långt höjden räcker. Marginaler, rubrikraden och staplarna är i dp,
 * men texten är i sp och växer med textstorleken – därför räknas textens del av höjden om med
 * {@code fontScale} (linjärt: Android 14+ skalar stor text mindre än så, så uppskattningen är på
 * den säkra sidan). En rad som inte får plats visas inte alls, i stället för att klippas mitt i
 * texten.
 *
 * På Android 12+ ritas en variant per storlek i {@link #WIDTH_BUCKETS} ×
 * {@link #heightBuckets(float)} och systemet väljer den största som får plats; på Android 8–11
 * väljs varianten efter widgetens storlek (onAppWidgetOptionsChanged). En ändrad textstorlek syns
 * vid nästa ritning (senast efter 30 minuter, eller när appen skickar ny data).
 */
public final class WidgetLayout {

    /** Under den här bredden (dp) visas knappen som en rund ikon i stället för med text. */
    public static final int NARROW_BELOW = 200;
    /** Widgetens minsta bredd och höjd (dp): minResizeWidth/minResizeHeight i res/xml/lagom_widget_info.xml. */
    public static final int MIN_WIDTH = 110;
    public static final int MIN_HEIGHT = 110;
    /** Flest valfria rader: energidetaljen, måltider, fasta och vatten. */
    public static final int MAX_ROWS = 4;
    /** Flest rader för reservtexten i en trång respektive vanlig widget (maxLines i layouten). */
    public static final int MAX_FALLBACK_LINES_TIGHT = 2;
    public static final int MAX_FALLBACK_LINES = 3;

    // Måtten i dp vid normal textstorlek – samma som i res/layout/lagom_widget.xml och
    // res/values/widget_dimens.xml. Texthöjderna är radhöjden i Roboto (1,327 em med teckensnittets
    // marginal, 1,172 em utan) och serif/Noto Serif (1,362 em utan marginal), avrundade uppåt.

    /** Inre marginal (widget_padding), och i en trång widget (widget_padding_tight). */
    static final double PADDING = 14;
    static final double PADDING_TIGHT = 12;
    /** Rubrikraden: knappens tryckyta (widget_touch_target) – högre än rubriken även med stor text. */
    static final double HEADER = 48;
    /** Energitexten: 24 sp serif utan teckensnittets marginal (en trång widget har 18 sp och inga rader). */
    static final double ENERGY_LINE = 33;
    /** Energistapeln: 8 dp marginal och 6 dp stapel. */
    static final double BAR = 14;
    /** En valfri rad: 13 sp med teckensnittets marginal … */
    static final double ROW_TEXT = 17.5;
    /** … och den största marginalen ovanför en rad (4 dp, skalas inte med texten). */
    static final double ROW_MARGIN = 4;
    /** Reservtexten: marginalen ovanför, en rad och teckensnittets marginal (15 sp, 13 sp trång). */
    static final double FALLBACK_MARGIN = 4;
    static final double FALLBACK_LINE = 17.6;
    static final double FALLBACK_PAD = 2.4;
    static final double FALLBACK_LINE_TIGHT = 15.3;
    static final double FALLBACK_PAD_TIGHT = 2.1;

    /** Systemets minsta textstorlek är 0,85; ett mindre eller okänt värde räknas som 0,85 respektive 1. */
    static final double MIN_FONT_SCALE = 0.85;
    /** Android tillåter högst 2,0 – taket skyddar bara mot orimliga värden. */
    static final double MAX_FONT_SCALE = 4.0;
    /** Skydd mot avrundningsfel i flyttalen (en höjd som precis räcker ska räcka). */
    private static final double EPSILON = 1e-6;

    /** Bredder (dp) för varianterna på Android 12+: smal (ikonknapp) och bred (knapp med text). */
    public static final int[] WIDTH_BUCKETS = { MIN_WIDTH, NARROW_BELOW };

    /** Knappen "Lägg till" som rund ikon (smal widget). */
    public final boolean iconButton;
    /** Trång höjd: mindre marginal och energitext, inga valfria rader. */
    public final boolean tight;
    /** Antal valfria rader som får plats (0–{@link #MAX_ROWS}). */
    public final int rows;
    /** Antal rader för reservtexten (maxLines): 1–2 i en trång widget, annars 1–3. */
    public final int fallbackLines;

    public WidgetLayout(boolean iconButton, boolean tight, int rows) {
        this(iconButton, tight, rows, tight ? MAX_FALLBACK_LINES_TIGHT : MAX_FALLBACK_LINES);
    }

    public WidgetLayout(boolean iconButton, boolean tight, int rows, int fallbackLines) {
        this.iconButton = iconButton;
        this.tight = tight;
        this.rows = tight ? 0 : Math.max(0, Math.min(MAX_ROWS, rows));
        this.fallbackLines = Math.max(1, Math.min(tight ? MAX_FALLBACK_LINES_TIGHT : MAX_FALLBACK_LINES, fallbackLines));
    }

    /** Varianten vid normal textstorlek (fontScale 1). */
    public static WidgetLayout forSize(int widthDp, int heightDp) {
        return forSize(widthDp, heightDp, 1f);
    }

    /**
     * Varianten för en widget som är {@code widthDp} × {@code heightDp} vid textstorleken
     * {@code fontScale}. En okänd storlek (0 eller mindre – vissa hemskärmar rapporterar ingen) ger
     * den fulla varianten.
     */
    public static WidgetLayout forSize(int widthDp, int heightDp, float fontScale) {
        boolean iconButton = widthDp > 0 && widthDp < NARROW_BELOW;
        if (heightDp <= 0) return new WidgetLayout(iconButton, false, MAX_ROWS);
        double fs = clampScale(fontScale);
        if (heightDp < tightBelow(fontScale)) {
            return new WidgetLayout(iconButton, true, 0, fallbackLinesFor(heightDp, fs, true));
        }
        int rows = (int) Math.floor((heightDp - baseHeight(fs)) / rowHeight(fs) + EPSILON);
        return new WidgetLayout(iconButton, false, rows, fallbackLinesFor(heightDp, fs, false));
    }

    /**
     * Under den här höjden (dp) är widgeten trång: rubrikraden, energitexten (24 sp) och stapeln får
     * inte plats med den vanliga marginalen. 123 dp vid normal textstorlek, 133 dp vid 1,3.
     */
    public static int tightBelow(float fontScale) {
        return Math.max(MIN_HEIGHT + 1, (int) Math.ceil(baseHeight(clampScale(fontScale)) - EPSILON));
    }

    /**
     * Höjderna (dp) för varianterna på Android 12+ vid textstorleken {@code fontScale}: den minsta
     * (trång), den första som inte är trång och sedan den första höjd där en valfri rad till får
     * plats – så att varje variant visar så mycket som ryms och inget mer.
     */
    public static int[] heightBuckets(float fontScale) {
        double fs = clampScale(fontScale);
        int[] buckets = new int[2 + MAX_ROWS];
        buckets[0] = MIN_HEIGHT;
        buckets[1] = tightBelow(fontScale);
        for (int rows = 1; rows <= MAX_ROWS; rows++) {
            int height = (int) Math.ceil(baseHeight(fs) + rows * rowHeight(fs) - EPSILON);
            buckets[1 + rows] = Math.max(buckets[rows] + 1, height);
        }
        return buckets;
    }

    /** Textstorleken som används i beräkningen: okänd (NaN, 0 eller mindre) → 1, annars 0,85–4. */
    static double clampScale(float fontScale) {
        if (Float.isNaN(fontScale) || fontScale <= 0f) return 1.0;
        return Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, fontScale));
    }

    /** Höjden utan valfria rader: marginalerna, rubrikraden, energitexten och stapeln. */
    private static double baseHeight(double fs) {
        return 2 * PADDING + HEADER + ENERGY_LINE * fs + BAR;
    }

    private static double rowHeight(double fs) {
        return ROW_TEXT * fs + ROW_MARGIN;
    }

    /** Hur många hela rader reservtexten får under rubrikraden (minst en – den kortas då med "…"). */
    private static int fallbackLinesFor(int heightDp, double fs, boolean tight) {
        double available = heightDp - 2 * (tight ? PADDING_TIGHT : PADDING) - HEADER - FALLBACK_MARGIN;
        double pad = (tight ? FALLBACK_PAD_TIGHT : FALLBACK_PAD) * fs;
        double line = (tight ? FALLBACK_LINE_TIGHT : FALLBACK_LINE) * fs;
        return (int) Math.floor((available - pad) / line + EPSILON);
    }
}
