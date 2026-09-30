package se.lagomappen.lagom.widget;

import android.annotation.TargetApi;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Resources;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import com.getcapacitor.Logger;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.HashMap;
import java.util.Map;
import se.lagomappen.lagom.MainActivity;
import se.lagomappen.lagom.R;

/**
 * Hemskärmswidgeten "Idag": dagens energi, måltider, vatten och en pågående fasta – och knappen
 * "Lägg till". Texterna kommer färdiga från appen (tillägget {@link LagomWidgetPlugin}, kontraktet
 * i docs/WIDGET.md); vad som visas bestäms av {@link WidgetView} och storleken av
 * {@link WidgetLayout}.
 *
 * Uppdateras när appen skickar ny data, var 30:e minut (updatePeriodMillis, systemets minsta
 * intervall, inexakt) och en gång efter lokal midnatt med ett INEXAKT alarm med ett fönster på 10
 * minuter (AlarmManager.setWindow med RTC: väcker inte telefonen, kräver ingen behörighet och är
 * inget exakt alarm) – så att nästa dags rad i datan visas senast cirka 00:11, eller när telefonen
 * vaknar om den sover då. Inga tjänster och ingen WorkManager.
 *
 * Tryck på widgeten öppnar Idag och knappen öppnar Lägg till: en uttrycklig Intent till
 * MainActivity med ACTION_VIEW och lagom-widget://idag respektive lagom-widget://lagg-till
 * ({@link WidgetLinks}). MainActivity har launchMode singleTask, så en körande app får länken i
 * onNewIntent (Capacitors App-tillägg: 'appUrlOpen') och en kallstart via getIntent()
 * (App.getLaunchUrl(), och dessutom ett sparat 'appUrlOpen'). En gammal länk som Android spelar upp
 * igen när aktiviteten återskapas tas bort i MainActivity.
 */
public class LagomWidgetProvider extends AppWidgetProvider {

    /** Ritningen vid dygnsskiftet (uttrycklig broadcast till den här mottagaren). */
    static final String ACTION_REFRESH = "se.lagomappen.lagom.widget.action.REFRESH";

    // Egna nummer för varje PendingIntent (påminnelserna använder notis-id 7100–7199).
    private static final int REQUEST_TODAY = 7301;
    private static final int REQUEST_ADD = 7302;
    private static final int REQUEST_REFRESH = 7303;

    private static final String LOG_TAG = "LagomWidget";

    /** Energitextens storlek (sp): vanlig och trång variant. */
    private static final float ENERGY_TEXT_SP = 24f;
    private static final float ENERGY_TEXT_TIGHT_SP = 18f;
    /** Reservtextens storlek (sp): två rader på 13 sp får plats även i den minsta widgeten (110 dp). */
    private static final float FALLBACK_TEXT_SP = 15f;
    private static final float FALLBACK_TEXT_TIGHT_SP = 13f;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && ACTION_REFRESH.equals(intent.getAction())) {
            refreshAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        render(context, manager, appWidgetIds);
        scheduleMidnightRefresh(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        render(context, manager, new int[] { appWidgetId });
    }

    @Override
    public void onEnabled(Context context) {
        scheduleMidnightRefresh(context);
    }

    @Override
    public void onDisabled(Context context) {
        // Den sista widgeten är borttagen: inget alarm kvar.
        try {
            AlarmManager alarms = context.getSystemService(AlarmManager.class);
            if (alarms != null) alarms.cancel(refreshIntent(context));
        } catch (RuntimeException e) {
            Logger.warn(LOG_TAG, "Widgetens alarm kunde inte tas bort");
        }
    }

    /** Rita om alla placerade widgetar (efter update/clear i tillägget och vid dygnsskiftet). */
    public static void refreshAll(Context context) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            if (manager == null) return;
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, LagomWidgetProvider.class));
            if (ids == null || ids.length == 0) return;
            render(context, manager, ids);
            scheduleMidnightRefresh(context);
        } catch (RuntimeException e) {
            Logger.warn(LOG_TAG, "Widgetarna kunde inte ritas om");
        }
    }

    /** Rita widgetarna {@code ids}. Kastar aldrig – en widget som inte kan ritas behåller sin förra bild. */
    static void render(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null || ids.length == 0) return;
        try {
            Frame frame = new Frame(context);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+: en variant per storlek – systemet väljer den största som får plats.
                RemoteViews views = sizedViews(context, frame);
                for (int id : ids) update(manager, id, views);
                return;
            }
            for (int id : ids) {
                // Android 8–11: storleken i stående läge (appen och hemskärmen är oftast stående).
                Bundle options = manager.getAppWidgetOptions(id);
                int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
                int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
                update(manager, id, build(context, frame.decide(width, height), frame));
            }
        } catch (RuntimeException e) {
            Logger.warn(LOG_TAG, "Widgeten kunde inte ritas");
        }
    }

    private static void update(AppWidgetManager manager, int id, RemoteViews views) {
        try {
            manager.updateAppWidget(id, views);
        } catch (RuntimeException e) {
            Logger.warn(LOG_TAG, "Widgeten kunde inte uppdateras");
        }
    }

    /**
     * Det som är lika för alla widgetar och storlekar i en ritning: datan, dagens datum, klockorna,
     * systemets textstorlek och de två länkarna (varje PendingIntent är ett anrop till systemet – de
     * skapas en gång).
     */
    private static final class Frame {
        final WidgetPayload payload;
        final String today;
        final String defaultFallback;
        final long wallClock;
        final long elapsed;
        /** Textstorleken (Inställningar → Skärm → Teckenstorlek): texten i sp växer, måtten i dp inte. */
        final float fontScale;
        final PendingIntent openToday;
        final PendingIntent openAdd;

        Frame(Context context) {
            payload = WidgetStore.load(context);
            today = LocalDate.now().toString();
            defaultFallback = context.getString(R.string.widget_fallback_default);
            wallClock = System.currentTimeMillis();
            elapsed = SystemClock.elapsedRealtime();
            fontScale = context.getResources().getConfiguration().fontScale;
            openToday = openIntent(context, WidgetLinks.TODAY, REQUEST_TODAY);
            openAdd = openIntent(context, WidgetLinks.ADD, REQUEST_ADD);
        }

        /** Vyn för en widget som är {@code widthDp} × {@code heightDp} vid systemets textstorlek. */
        WidgetView decide(int widthDp, int heightDp) {
            return WidgetView.decide(payload, today, defaultFallback, WidgetLayout.forSize(widthDp, heightDp, fontScale));
        }
    }

    /** Android 12+ (anropas bara då): varianterna per storlek i en RemoteViews. */
    @TargetApi(Build.VERSION_CODES.S)
    private static RemoteViews sizedViews(Context context, Frame frame) {
        Map<SizeF, RemoteViews> variants = new HashMap<>();
        for (int width : WidgetLayout.WIDTH_BUCKETS) {
            // Höjderna beror på textstorleken: en valfri rad till bara där den får plats med stor text.
            for (int height : WidgetLayout.heightBuckets(frame.fontScale)) {
                variants.put(new SizeF(width, height), build(context, frame.decide(width, height), frame));
            }
        }
        return new RemoteViews(variants);
    }

    /** Översätt {@link WidgetView} till RemoteViews för res/layout/lagom_widget.xml. */
    private static RemoteViews build(Context context, WidgetView view, Frame frame) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.lagom_widget);
        Resources res = context.getResources();
        WidgetLayout layout = view.layout;

        int padding = res.getDimensionPixelSize(layout.tight ? R.dimen.widget_padding_tight : R.dimen.widget_padding);
        views.setViewPadding(android.R.id.background, padding, padding, padding, padding);

        views.setTextViewText(R.id.widget_title, context.getString(view.titleToday ? R.string.widget_title_today : R.string.widget_title_app));
        views.setViewVisibility(R.id.widget_add, view.showAdd && !layout.iconButton ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.widget_add_icon, view.showAdd && layout.iconButton ? View.VISIBLE : View.GONE);

        // Reservtexten (ingen data, ingen profil, exempeldata, ingen dag för idag).
        setText(views, R.id.widget_fallback, view.fallbackText);
        // Bara hela rader som får plats med systemets textstorlek (resten kortas med "…").
        views.setInt(R.id.widget_fallback, "setMaxLines", layout.fallbackLines);
        views.setTextViewTextSize(R.id.widget_fallback, TypedValue.COMPLEX_UNIT_SP, layout.tight ? FALLBACK_TEXT_TIGHT_SP : FALLBACK_TEXT_SP);

        // Energin: text, detalj och stapel (aldrig i medvetet läge – WidgetView döljer dem).
        setText(views, R.id.widget_energy, view.energyText);
        views.setTextViewTextSize(R.id.widget_energy, TypedValue.COMPLEX_UNIT_SP, layout.tight ? ENERGY_TEXT_TIGHT_SP : ENERGY_TEXT_SP);
        setText(views, R.id.widget_energy_detail, view.energyDetail);
        setBar(views, R.id.widget_energy_bar, view.energyPermille);

        // Måltider och vatten.
        setText(views, R.id.widget_meals, view.mealsText);
        views.setViewVisibility(R.id.widget_water_row, view.waterText == null ? View.GONE : View.VISIBLE);
        if (view.waterText != null) views.setTextViewText(R.id.widget_water, view.waterText);
        setBar(views, R.id.widget_water_bar, view.waterPermille);

        // Fastan: en Chronometer som räknar upp från starttiden ("Fastat 14:03:22") och målet.
        WidgetPayload.Fasting fasting = view.fasting;
        if (fasting != null) {
            long base = WidgetView.chronometerBase(frame.elapsed, frame.wallClock, fasting.startedAt);
            views.setChronometer(R.id.widget_fasting_timer, base, context.getString(R.string.widget_fasting_format), true);
            // Ikonen beskrivs med appens text ("Fasta pågår") för skärmläsare.
            String label = fasting.label.trim().isEmpty() ? context.getString(R.string.widget_fasting_description) : fasting.label;
            views.setContentDescription(R.id.widget_fasting_icon, label);
            setText(views, R.id.widget_fasting_target, fasting.targetText);
            views.setViewVisibility(R.id.widget_fasting_row, View.VISIBLE);
        } else {
            // Stoppa räknaren när raden är dold (den tickar annars i onödan).
            views.setChronometer(R.id.widget_fasting_timer, frame.elapsed, null, false);
            views.setViewVisibility(R.id.widget_fasting_row, View.GONE);
        }

        // Tryck: widgeten öppnar Idag, knapparna Lägg till.
        views.setOnClickPendingIntent(android.R.id.background, frame.openToday);
        views.setOnClickPendingIntent(R.id.widget_add, frame.openAdd);
        views.setOnClickPendingIntent(R.id.widget_add_icon, frame.openAdd);
        return views;
    }

    /** Texten i en TextView, eller dold när texten är null. */
    private static void setText(RemoteViews views, int id, String text) {
        if (text == null) {
            views.setViewVisibility(id, View.GONE);
            return;
        }
        views.setTextViewText(id, text);
        views.setViewVisibility(id, View.VISIBLE);
    }

    /** En stapel med 0–1000 promille, eller dold vid -1. */
    private static void setBar(RemoteViews views, int id, int permille) {
        if (permille < 0) {
            views.setViewVisibility(id, View.GONE);
            return;
        }
        views.setProgressBar(id, WidgetPayload.PERMILLE_MAX, permille, false);
        views.setViewVisibility(id, View.VISIBLE);
    }

    /**
     * En uttrycklig Intent till MainActivity med ACTION_VIEW och länken – ingen intent-filter behövs
     * (och ingen annan app kan använda den här PendingIntent:en till något annat: FLAG_IMMUTABLE).
     */
    private static PendingIntent openIntent(Context context, String link, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent refreshIntent(Context context) {
        Intent intent = new Intent(context, LagomWidgetProvider.class).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(context, REQUEST_REFRESH, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /**
     * Ett inexakt alarm med ett fönster (setWindow, RTC – väcker inte telefonen) från en minut efter
     * nästa lokala midnatt och högst {@link WidgetView#MIDNIGHT_WINDOW_MS} framåt. Ett vanligt
     * {@code set()} får systemet skjuta upp med 75 % av tiden fram till alarmet (från Android 12
     * högst en timme); fönstret håller ritningen inom 10 minuter efter 00:01, eller så snart
     * telefonen är vaken igen. Ersätter ett tidigare (samma PendingIntent). Inte ett exakt alarm –
     * ingen behörighet (SCHEDULE_EXACT_ALARM/USE_EXACT_ALARM) behövs.
     */
    static void scheduleMidnightRefresh(Context context) {
        try {
            AlarmManager alarms = context.getSystemService(AlarmManager.class);
            if (alarms == null) return;
            long start = WidgetView.nextMidnightRefresh(ZonedDateTime.now());
            alarms.setWindow(AlarmManager.RTC, start, WidgetView.MIDNIGHT_WINDOW_MS, refreshIntent(context));
        } catch (RuntimeException e) {
            Logger.warn(LOG_TAG, "Widgetens alarm vid midnatt kunde inte ställas");
        }
    }
}
