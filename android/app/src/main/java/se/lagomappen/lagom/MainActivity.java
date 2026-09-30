package se.lagomappen.lagom;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import se.lagomappen.lagom.widget.LagomWidgetPlugin;
import se.lagomappen.lagom.widget.WidgetLinks;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Före super.onCreate, som skapar bryggan och läser start-Intent:en (App.getLaunchUrl()).
        dropReplayedWidgetLink(getIntent(), savedInstanceState != null);
        // Appens egna tillägg (inga npm-paket) registreras före super.onCreate, som skapar bryggan.
        // LagomWidget: hemskärmswidgeten, se widget/LagomWidgetPlugin.java och docs/WIDGET.md.
        registerPlugin(LagomWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Android återskapar aktiviteten med sin gamla Intent (från "Senaste" eller efter att processen
     * har avslutats). En gammal länk från widgeten ska då inte öppnas igen – se WidgetLinks.
     */
    private static void dropReplayedWidgetLink(Intent intent, boolean restored) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        boolean fromHistory = (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
        if (WidgetLinks.isReplayedLink(data.getScheme(), fromHistory, restored)) intent.setData(null);
    }
}
