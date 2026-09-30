package se.lagomappen.lagom.widget;

import android.content.Context;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Det lokala Capacitor-tillägget "LagomWidget" (registreras i MainActivity, inget npm-paket).
 * Webbdelen når det bara via src/native/widget.ts. Kontraktet står i docs/WIDGET.md:
 *
 * - {@code update({ data })}: {@code data} är JSON-texten för widgetdata version 1, högst
 *   {@link WidgetPayload#MAX_CHARS} tecken. Ogiltig eller för stor data avvisas med call.reject –
 *   den förra datan ligger då kvar. Annars sparas texten (SharedPreferences "lagom-widget",
 *   nyckeln "payload") och alla placerade widgetar ritas om.
 * - {@code clear()}: tar bort den sparade datan och ritar om alla widgetar (de visar då läget
 *   utan data).
 *
 * Capacitor kör tilläggens metoder på en egen tråd (inte huvudtråden), så sparandet sker synkront
 * med commit() innan anropet besvaras. Inget här kraschar appen: alla fel blir call.reject med en
 * fast text och en felkod (INVALID, TOO_LARGE, STORAGE eller FAILED) – aldrig innehållet i datan.
 */
@CapacitorPlugin(name = "LagomWidget")
public class LagomWidgetPlugin extends Plugin {

    private static final String LOG_TAG = "LagomWidget";

    @PluginMethod
    public void update(PluginCall call) {
        try {
            String data = call.getString("data");
            if (data == null) {
                call.reject("Widgetdata saknas", "INVALID");
                return;
            }
            if (data.length() > WidgetPayload.MAX_CHARS) {
                call.reject("Widgetdatan är för stor", "TOO_LARGE");
                return;
            }
            try {
                WidgetJson.parse(data);
            } catch (WidgetPayload.InvalidPayloadException e) {
                // Meddelandet är en fast text (WidgetPayload citerar aldrig datan).
                call.reject(e.getMessage(), "INVALID");
                return;
            }
            Context context = getContext();
            if (!WidgetStore.write(context, data)) {
                call.reject("Widgetdatan kunde inte sparas", "STORAGE");
                return;
            }
            LagomWidgetProvider.refreshAll(context);
            call.resolve();
        } catch (RuntimeException | StackOverflowError e) {
            Logger.warn(LOG_TAG, "Widgetdatan kunde inte tas emot");
            call.reject("Widgeten kunde inte uppdateras", "FAILED");
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            Context context = getContext();
            if (!WidgetStore.clear(context)) {
                call.reject("Widgetdatan kunde inte tas bort", "STORAGE");
                return;
            }
            LagomWidgetProvider.refreshAll(context);
            call.resolve();
        } catch (RuntimeException e) {
            Logger.warn(LOG_TAG, "Widgetdatan kunde inte tas bort");
            call.reject("Widgeten kunde inte tömmas", "FAILED");
        }
    }
}
