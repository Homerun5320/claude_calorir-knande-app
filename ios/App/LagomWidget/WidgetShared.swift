// Det som appen och hemskärmswidgeten delar (docs/WIDGET.md, avsnitt 3 och 8): App Group,
// nyckeln för den sparade datan, den största tillåtna datan, widgetens namn hos systemet och de
// två länkarna från widgeten.
//
// Filen ingår i både appen (tillägget LagomWidgetPlugin) och widgeten, och bara Foundation
// används – den kompileras även med swiftc på Linux i Swift-testerna
// (ios/App/LagomWidgetTests/main.swift). Därför står det som bara finns på Apples plattformar
// bakom #if canImport(Darwin).

import Foundation

enum LagomWidgetShared {
    /// App Group som appen och widgeten delar. Måste finnas i ägarens Apple-konto och i båda
    /// målens behörigheter (App.entitlements och LagomWidget.entitlements).
    static let appGroup = "group.se.lagomappen.lagom"

    /// Nyckeln i App Groups UserDefaults där JSON-texten (WidgetPayload version 1) ligger –
    /// samma namn som i Android-widgetens SharedPreferences.
    static let payloadKey = "payload"

    /// Högsta tillåtna längd på JSON-texten, räknad i UTF-16-enheter (text.utf16.count) – samma
    /// som JS-strängens length och Javas String.length(), så att gränsen är densamma överallt.
    static let maxChars = 32_768

    /// Widgetens namn hos systemet (StaticConfiguration och WidgetCenter.reloadTimelines).
    static let kind = "LagomWidget"

    /// Tryck på widgeten – appen öppnar Idag ("/").
    static let todayURL: URL = URL(string: "lagom-widget://idag")!

    /// Knappen "Lägg till" – appen öppnar Lägg till mat ("/lagg-till").
    static let addURL: URL = URL(string: "lagom-widget://lagg-till")!

    /// App Groups UserDefaults, eller nil när gruppens behållare inte finns (behörigheten saknas –
    /// gruppen är inte påslagen i det här bygget). UserDefaults(suiteName:) ger annars en vanlig,
    /// privat UserDefaults som widgeten aldrig ser, så behållaren kontrolleras först. På Linux
    /// (Swift-testerna) finns ingen App Group: alltid nil.
    static func sharedDefaults() -> UserDefaults? {
        #if canImport(Darwin)
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) != nil else {
            return nil
        }
        return UserDefaults(suiteName: appGroup)
        #else
        return nil
        #endif
    }
}
