package se.lagomappen.lagom.widget;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Logger;

/**
 * Widgetens sparade data: JSON-texten i SharedPreferences-filen "lagom-widget", nyckeln "payload"
 * (appens egen lagring på enheten – följer inte med i molnsäkerhetskopian, se
 * res/xml/data_extraction_rules.xml). Bara texter som har klarat {@link WidgetJson#parse(String)}
 * sparas.
 *
 * Inget här kastar: ett fel ger null/false och en fast rad i loggen (aldrig innehållet).
 */
final class WidgetStore {

    static final String PREFS = "lagom-widget";
    static final String KEY_PAYLOAD = "payload";
    private static final String LOG_TAG = "LagomWidget";

    private WidgetStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Den sparade JSON-texten, eller null. */
    static String read(Context context) {
        try {
            return prefs(context).getString(KEY_PAYLOAD, null);
        } catch (RuntimeException e) {
            // T.ex. innan telefonen har låsts upp efter en omstart (krypterad lagring).
            Logger.warn(LOG_TAG, "Widgetens data kunde inte läsas");
            return null;
        }
    }

    /**
     * Spara JSON-texten synkront (commit – anropas från tilläggets egen tråd, aldrig från
     * huvudtråden). true när den är sparad (eller redan var det).
     */
    static boolean write(Context context, String json) {
        try {
            SharedPreferences prefs = prefs(context);
            if (json.equals(prefs.getString(KEY_PAYLOAD, null))) return true;
            return prefs.edit().putString(KEY_PAYLOAD, json).commit();
        } catch (RuntimeException e) {
            Logger.warn(LOG_TAG, "Widgetens data kunde inte sparas");
            return false;
        }
    }

    /** Ta bort den sparade datan synkront. true när den är borta. */
    static boolean clear(Context context) {
        try {
            return prefs(context).edit().remove(KEY_PAYLOAD).commit();
        } catch (RuntimeException e) {
            Logger.warn(LOG_TAG, "Widgetens data kunde inte tas bort");
            return false;
        }
    }

    /** Den sparade datan tolkad, eller null om ingen finns eller den inte går att läsa. */
    static WidgetPayload load(Context context) {
        String json = read(context);
        if (json == null) return null;
        try {
            return WidgetJson.parse(json);
        } catch (WidgetPayload.InvalidPayloadException | RuntimeException | StackOverflowError e) {
            Logger.warn(LOG_TAG, "Widgetens sparade data är ogiltig");
            return null;
        }
    }
}
