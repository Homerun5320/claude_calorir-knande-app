package se.lagomappen.lagom.widget;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Widgetens data, version 1 – kontraktet med src/native/widget.ts och src/lib/widgetSummary.ts
 * (docs/WIDGET.md). Appen skickar JSON-texten med färdiga svenska texter; widgeten formaterar
 * aldrig själv några tal.
 *
 * Klassen är ren Java utan android.* och org.json, så att kontrollen och logiken kan testas med
 * JUnit på datorn (org.json finns bara som stubbar i lokala enhetstester). JSON-texten görs om till
 * Map/List av {@link WidgetJson}; {@link #fromMap(Object)} kontrollerar och bygger modellen.
 *
 * Ogiltig data avvisas med {@link InvalidPayloadException} – felmeddelandet är alltid en fast text
 * och citerar aldrig innehållet. Okända fält godtas (och ignoreras), så att en senare version kan
 * lägga till fält utan att en äldre widget slutar fungera.
 */
public final class WidgetPayload {

    /** Kontraktets version. */
    public static final int VERSION = 1;
    /** Högsta tillåtna längd på JSON-texten, i tecken (UTF-16-enheter, som String.length()). */
    public static final int MAX_CHARS = 32_768;
    /** Högsta nästlingsdjup i JSON-texten (version 1 behöver 3) – skyddar mot rekursion i tolkningen. */
    public static final int MAX_DEPTH = 8;
    /** Flest dagar som godtas (kontraktet skickar idag och sex dagar till). */
    public static final int MAX_DAYS = 31;
    /** Längsta text i ett fält – längre texter är ett fel hos avsändaren. */
    public static final int MAX_TEXT = 200;
    /** Förlopp: 0–1000 promille; -1 betyder att stapeln döljs. */
    public static final int PERMILLE_MAX = 1000;
    public static final int PERMILLE_HIDDEN = -1;

    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    /** Läget i appen när sammanfattningen byggdes. */
    public enum State {
        /** Profil finns – dagarna och fastan gäller. */
        OK("ok"),
        /** Ingen profil ännu (välkomstflödet är inte klart). */
        NO_PROFILE("noProfile"),
        /** Exempeldata – widgeten visar aldrig exempeldata. */
        DEMO("demo");

        private final String wire;

        State(String wire) {
            this.wire = wire;
        }

        static State fromWire(String value) {
            for (State state : values()) {
                if (state.wire.equals(value)) return state;
            }
            return null;
        }
    }

    /** En dag i sammanfattningen, med texterna som appen redan har formaterat. */
    public static final class Day {
        public final String date;
        public final String energyText;
        public final String energyDetail;
        public final int energyPermille;
        public final String mealsText;
        public final String waterText;
        public final int waterPermille;

        public Day(
            String date,
            String energyText,
            String energyDetail,
            int energyPermille,
            String mealsText,
            String waterText,
            int waterPermille
        ) {
            this.date = date;
            this.energyText = energyText;
            this.energyDetail = energyDetail;
            this.energyPermille = clampPermille(energyPermille);
            this.mealsText = mealsText;
            this.waterText = waterText;
            this.waterPermille = clampPermille(waterPermille);
        }
    }

    /** En pågående fasta. */
    public static final class Fasting {
        /** Starttid, millisekunder sedan 1970 (Date.now() i appen). */
        public final long startedAt;
        /** T.ex. "Fasta pågår" – beskrivning för skärmläsare. */
        public final String label;
        /** T.ex. "Mål 16 h", eller null. */
        public final String targetText;

        public Fasting(long startedAt, String label, String targetText) {
            this.startedAt = startedAt;
            this.label = label;
            this.targetText = targetText;
        }
    }

    /** Ogiltig widgetdata. Meddelandet är en fast text utan innehåll från datan. */
    public static final class InvalidPayloadException extends Exception {
        private static final long serialVersionUID = 1L;

        public InvalidPayloadException(String message) {
            super(message);
        }
    }

    public final long generatedAt;
    public final State state;
    public final boolean mindful;
    public final String fallbackText;
    /** Dagarna i den ordning appen skickade dem (idag först). Tom när state inte är OK. */
    public final List<Day> days;
    /** Pågående fasta, eller null. */
    public final Fasting fasting;

    public WidgetPayload(long generatedAt, State state, boolean mindful, String fallbackText, List<Day> days, Fasting fasting) {
        this.generatedAt = generatedAt;
        this.state = state;
        this.mindful = mindful;
        this.fallbackText = fallbackText;
        this.days = Collections.unmodifiableList(new ArrayList<>(days));
        this.fasting = fasting;
    }

    /** Dagen med datumet {@code isoDate} (lokalt 'ÅÅÅÅ-MM-DD'), eller null. Vid dubbletter gäller den första. */
    public Day dayFor(String isoDate) {
        if (isoDate == null) return null;
        for (Day day : days) {
            if (day.date.equals(isoDate)) return day;
        }
        return null;
    }

    /** Promille till 0–1000, eller -1 (dold) för alla negativa värden. */
    public static int clampPermille(long value) {
        if (value < 0) return PERMILLE_HIDDEN;
        return (int) Math.min(PERMILLE_MAX, value);
    }

    /**
     * Det största nästlingsdjupet av {} och [] i en JSON-text (utanför strängar). Körs före
     * tolkningen, så att en text som "[[[[…" aldrig når den rekursiva tolkaren.
     */
    public static int maxNestingDepth(String json) {
        int depth = 0;
        int max = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (c == '\\') {
                    escaped = true;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }
            if (c == '"') {
                inString = true;
            } else if (c == '{' || c == '[') {
                depth++;
                if (depth > max) max = depth;
            } else if (c == '}' || c == ']') {
                depth = Math.max(0, depth - 1);
            }
        }
        return max;
    }

    /**
     * Kontrollerna som görs på texten före tolkningen: längd och nästlingsdjup.
     *
     * @throws InvalidPayloadException om texten saknas, är för lång eller för djupt nästlad
     */
    public static void checkText(String json) throws InvalidPayloadException {
        if (json == null) throw new InvalidPayloadException("Widgetdata saknas");
        if (json.length() > MAX_CHARS) throw new InvalidPayloadException("Widgetdatan är för stor");
        if (maxNestingDepth(json) > MAX_DEPTH) throw new InvalidPayloadException("Widgetdatan är för djupt nästlad");
    }

    /**
     * Bygg modellen ur den tolkade JSON-texten (Map/List/String/Number/Boolean/null, se
     * {@link WidgetJson#toJava(Object)}).
     *
     * @throws InvalidPayloadException om något fält saknas eller har fel typ eller värde
     */
    public static WidgetPayload fromMap(Object root) throws InvalidPayloadException {
        Map<?, ?> map = asMap(root, "Widgetdatan är inget objekt");

        Object v = map.get("v");
        if (!(v instanceof Number) || !isWhole((Number) v) || ((Number) v).longValue() != VERSION) {
            throw new InvalidPayloadException("Okänd version av widgetdatan");
        }

        long generatedAt = requireWholeNumber(map.get("generatedAt"), "Ogiltig tidsstämpel");
        if (generatedAt < 0) throw new InvalidPayloadException("Ogiltig tidsstämpel");

        Object stateValue = map.get("state");
        State state = stateValue instanceof String ? State.fromWire((String) stateValue) : null;
        if (state == null) throw new InvalidPayloadException("Okänt läge i widgetdatan");

        Object mindful = map.get("mindful");
        if (!(mindful instanceof Boolean)) throw new InvalidPayloadException("Ogiltigt medvetet läge");

        String fallbackText = requireText(map.get("fallbackText"), "Ogiltig reservtext");

        Object daysValue = map.get("days");
        if (!(daysValue instanceof List)) throw new InvalidPayloadException("Dagarna saknas");
        List<?> rawDays = (List<?>) daysValue;
        if (rawDays.size() > MAX_DAYS) throw new InvalidPayloadException("För många dagar");
        List<Day> days = new ArrayList<>(rawDays.size());
        for (Object rawDay : rawDays) days.add(parseDay(rawDay));

        Fasting fasting = null;
        Object fastingValue = map.get("fasting");
        if (fastingValue != null) fasting = parseFasting(fastingValue);

        return new WidgetPayload(generatedAt, state, (Boolean) mindful, fallbackText, days, fasting);
    }

    private static Day parseDay(Object raw) throws InvalidPayloadException {
        Map<?, ?> day = asMap(raw, "En dag är inget objekt");
        Object dateValue = day.get("date");
        if (!(dateValue instanceof String) || !isIsoDate((String) dateValue)) {
            throw new InvalidPayloadException("Ogiltigt datum");
        }
        return new Day(
            (String) dateValue,
            optionalText(day.get("energyText"), "Ogiltig energitext"),
            optionalText(day.get("energyDetail"), "Ogiltig energidetalj"),
            permille(day.get("energyPermille"), "Ogiltigt energiförlopp"),
            requireText(day.get("mealsText"), "Ogiltig måltidstext"),
            optionalText(day.get("waterText"), "Ogiltig vattentext"),
            permille(day.get("waterPermille"), "Ogiltigt vattenförlopp")
        );
    }

    private static Fasting parseFasting(Object raw) throws InvalidPayloadException {
        Map<?, ?> fasting = asMap(raw, "Fastan är inget objekt");
        long startedAt = requireWholeNumber(fasting.get("startedAt"), "Ogiltig starttid för fastan");
        if (startedAt <= 0) throw new InvalidPayloadException("Ogiltig starttid för fastan");
        String label = requireText(fasting.get("label"), "Ogiltig text för fastan");
        String targetText = optionalText(fasting.get("targetText"), "Ogiltigt mål för fastan");
        return new Fasting(startedAt, label, targetText);
    }

    /** Ett giltigt lokalt datum 'ÅÅÅÅ-MM-DD' (t.ex. inte 2026-02-30). */
    static boolean isIsoDate(String value) {
        if (!ISO_DATE.matcher(value).matches()) return false;
        try {
            LocalDate.parse(value);
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }

    private static Map<?, ?> asMap(Object value, String message) throws InvalidPayloadException {
        if (!(value instanceof Map)) throw new InvalidPayloadException(message);
        return (Map<?, ?>) value;
    }

    private static boolean isWhole(Number n) {
        if (n instanceof Double || n instanceof Float) {
            double d = n.doubleValue();
            return !Double.isNaN(d) && !Double.isInfinite(d) && d == Math.rint(d) && Math.abs(d) < 9.007199254740992E15;
        }
        return true;
    }

    private static long requireWholeNumber(Object value, String message) throws InvalidPayloadException {
        if (!(value instanceof Number) || !isWhole((Number) value)) throw new InvalidPayloadException(message);
        return ((Number) value).longValue();
    }

    /** Ett förlopp: saknas det döljs stapeln; ett ändligt tal avrundas och begränsas till -1 eller 0–1000. */
    private static int permille(Object value, String message) throws InvalidPayloadException {
        if (value == null) return PERMILLE_HIDDEN;
        if (!(value instanceof Number)) throw new InvalidPayloadException(message);
        double d = ((Number) value).doubleValue();
        if (Double.isNaN(d) || Double.isInfinite(d)) throw new InvalidPayloadException(message);
        return clampPermille(Math.round(Math.max(-1.0, Math.min(PERMILLE_MAX, d))));
    }

    private static String requireText(Object value, String message) throws InvalidPayloadException {
        if (!(value instanceof String) || ((String) value).length() > MAX_TEXT) throw new InvalidPayloadException(message);
        return (String) value;
    }

    private static String optionalText(Object value, String message) throws InvalidPayloadException {
        if (value == null) return null;
        return requireText(value, message);
    }
}
