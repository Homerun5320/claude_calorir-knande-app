// Startpunkten för widgettillägget LagomWidgetExtension (WidgetKit): de widgetar som Lagom har på
// iPhone. Just nu en, "Idag" (LagomTodayWidget.swift).
//
// Tillägget byggs i CI men följer inte med i appen förrän App Group "group.se.lagomappen.lagom"
// finns i ägarens Apple-konto och widgeten slås på med `node scripts/ios-widget.mjs enable`
// (docs/WIDGET.md, avsnitt 8). Utan App Group ser widgeten ingen data och visar bara "Öppna Lagom
// för dagens siffror".

import SwiftUI
import WidgetKit

@main
struct LagomWidgetBundle: WidgetBundle {
    var body: some Widget {
        LagomTodayWidget()
    }
}
