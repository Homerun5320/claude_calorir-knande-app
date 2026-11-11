// Hemskärmswidgeten "Idag" på iPhone: dagens energi, måltider, vatten och en pågående fasta – och
// knappen "Lägg till" (systemMedium och systemLarge). Samma widget som Android-appens LagomWidgetProvider.java och
// samma kontrakt (docs/WIDGET.md): texterna kommer färdiga från appen via App Groupens
// UserDefaults (tillägget LagomWidgetPlugin i appen), och vad som visas bestäms av
// WidgetContent.swift.
//
// Tidslinjen: en post nu och en vid varje lokal midnatt då datan har en ny dag, och en sista vid
// midnatten efter den sista dagen (då visas `fallbackText`). Datan innehåller idag och sex dagar
// till, så widgeten visar rätt dag även när appen inte har öppnats på några dagar – utan att väcka
// något. Appen ber WidgetKit ladda om tidslinjen varje gång den skickar ny data, och dessutom laddar
// widgeten om sig själv med några timmars mellanrum (policyn .after): dygnsgränserna räknas i
// telefonens tidszon när tidslinjen byggs, och byter telefonen tidszon ska widgeten hitta rätt dag
// igen även om appen inte öppnas (Android ritar om var 30:e minut).
//
// Bara hemskärmen (systemSmall, systemMedium och systemLarge) – inte låsskärmens accessory-storlekar.
// Vattnet och fastan får inte plats i de två mindre storlekarna (energin, stapeln och måltiderna
// tar platsen), så systemLarge finns för dem – som Androids större storlekar. StandBy (laddning i
// liggande läge, synligt för andra i rummet) nedprioriteras för systemSmall men går fortfarande att
// välja, så alla siffror (energi, måltider, vatten, fastan och staplarna) är markerade som
// känsliga (privacySensitive) så att systemet kan dölja dem när telefonen är låst.
// Tryck på widgeten öppnar Idag (lagom-widget://idag), knappen Lägg till (lagom-widget://lagg-till).

import SwiftUI
import WidgetKit

/// En post i tidslinjen: vad widgeten visar från tidpunkten `date`.
struct TodayEntry: TimelineEntry {
    let date: Date
    let content: WidgetContent
}

/// Läser den sparade datan och bygger tidslinjen. Inga nätanrop och inget som skrivs.
struct TodayProvider: TimelineProvider {
    /// Hur länge tidslinjen gäller innan widgeten laddar om den själv (se överst i filen).
    private static let refreshInterval: TimeInterval = 6 * 60 * 60

    /// Platshållaren medan widgeten laddas – ett neutralt exempel som systemet gör oläsligt.
    func placeholder(in context: Context) -> TodayEntry {
        return TodayEntry(date: Date(), content: WidgetContent.sample)
    }

    /// Ögonblicksbilden: exemplet i widgetgalleriet, annars det riktiga innehållet just nu.
    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        let now = Date()
        if context.isPreview {
            completion(TodayEntry(date: now, content: WidgetContent.sample))
            return
        }
        let content = WidgetContent.resolve(payload: TodayProvider.loadPayload(), at: now, calendar: WidgetContent.localCalendar())
        completion(TodayEntry(date: now, content: content))
    }

    /// Tidslinjen från den sparade datan (se överst i filen).
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let now = Date()
        let calendar = WidgetContent.localCalendar()
        let payload = TodayProvider.loadPayload()
        let entries = WidgetContent.entryDates(payload: payload, now: now, calendar: calendar).map { date in
            TodayEntry(date: date, content: WidgetContent.resolve(payload: payload, at: date, calendar: calendar))
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(TodayProvider.refreshInterval))))
    }

    /// Datan i App Groupens UserDefaults, eller nil när den saknas, inte går att läsa eller när
    /// App Group inte finns i bygget (widgeten visar då läget utan data).
    private static func loadPayload() -> WidgetPayload? {
        let text = LagomWidgetShared.sharedDefaults()?.string(forKey: LagomWidgetShared.payloadKey)
        return WidgetContent.payload(from: text)
    }
}

/// Widgeten "Idag" – namnet och beskrivningen i widgetgalleriet är desamma som på Android
/// (widget_label och widget_description i res/values/strings.xml).
struct LagomTodayWidget: Widget {
    let kind: String = LagomWidgetShared.kind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Idag")
        .description("Dagens energi, måltider och vatten – och en knapp för att lägga till.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .disfavoredLocations([.standBy], for: [.systemSmall])
    }
}
