// Vad widgeten ska visa vid en viss tidpunkt – ren logik med bara Foundation, som WidgetView.java i
// Android-widgeten. TodayWidgetView.swift ritar resultatet och LagomTodayWidget.swift bygger
// tidslinjen med entryDates(…).
//
// Reglerna (kontraktet i docs/WIDGET.md, samma som på Android):
// - Ingen sparad data (eller data som inte går att läsa) → widgetens egen reservtext ("Öppna Lagom
//   för dagens siffror") och knappen "Lägg till".
// - `state` är inte "ok" (ingen profil, exempeldata) → datans `fallbackText`, ingen knapp och ingen
//   fasta. Exempeldata visas aldrig, inte ens om datan råkar innehålla dagar.
// - Ingen dag i datan har telefonens lokala datum (appen har inte öppnats på en vecka, eller klockan
//   har ställts om) → `fallbackText`, men knappen finns kvar.
// - Medvetet läge → aldrig energisiffror eller energistapel, oavsett vad datan innehåller.
// - En text som är tom döljer sin rad; ett förlopp på -1 döljer sin stapel; utan vattentext ingen
//   vattenstapel.
// - Valfria rader i prioritetsordning så långt höjden räcker (`limited(to:)`): energidetaljen,
//   måltider, fasta och vatten. Vyn står i ordningen detalj, måltider, vatten, fasta.
//
// Datumen jämförs i den gregorianska kalendern i telefonens tidszon (appen skriver datumen med
// JS-datumets lokala tid) – aldrig med 86 400 sekunder per dygn, så att sommartiden blir rätt.
//
// Filen ingår bara i widgeten, men kompileras även med swiftc på Linux i Swift-testerna
// (ios/App/LagomWidgetTests/main.swift) – därför bara Foundation.

import Foundation

/// Widgetens egna texter – samma som i Android-widgetens res/values/strings.xml (widget_*).
/// Dagens siffror kommer som färdiga texter från appen; widgeten formaterar aldrig tal själv.
enum WidgetText {
    /// Rubriken med dagens siffror (widget_title_today).
    static let titleToday = "Idag"
    /// Rubriken när widgeten visar en rad i stället för siffrorna (widget_title_app).
    static let titleApp = "Lagom"
    /// Knappen (widget_add) och hur VoiceOver beskriver den (widget_add_description).
    static let add = "Lägg till"
    static let addDescription = "Lägg till i dagboken"
    /// Innan appen har skickat något, eller när datan inte går att läsa (widget_fallback_default).
    static let fallbackDefault = "Öppna Lagom för dagens siffror"
    /// Fastans räknare: "Fastat 14:03:22" (widget_fasting_format, "Fastat %s").
    static let fastingElapsed = "Fastat"
    /// Fastan för VoiceOver när appens text saknas (widget_fasting_description).
    static let fastingDescription = "Fasta pågår"
    /// Vattenraden för VoiceOver (widget_water_description).
    static let waterDescription = "Vatten"
}

/// Vad widgeten visar vid en tidpunkt.
enum WidgetContent: Equatable {
    /// Ingen sparad data: nyinstallerad, efter "Radera all data" eller oläslig data.
    case noData
    /// En rad i stället för siffrorna. `showAdd`: knappen "Lägg till" (bara när profilen finns).
    case message(String, showAdd: Bool)
    /// Dagens siffror.
    case today(Today)

    /// Dagens rad, med medvetet läge och tomma texter redan tillämpade.
    struct Today: Equatable {
        /// "1 240 kcal kvar" – nil i medvetet läge.
        var energyText: String?
        /// "760 av 2 000 kcal" – nil i medvetet läge eller när raden inte får plats.
        var energyDetail: String?
        /// 0–1000, eller -1 när stapeln döljs.
        var energyPermille: Int
        /// "3 måltider loggade", eller nil när raden inte får plats.
        var mealsText: String?
        /// "0,75 av 2 l", eller nil när vattnet döljs.
        var waterText: String?
        /// 0–1000, eller -1 när stapeln döljs (alltid -1 utan vattentext).
        var waterPermille: Int
        /// Pågående fasta, eller nil.
        var fasting: Fasting?
    }

    /// En pågående fasta – widgeten räknar själv upp tiden från `startedAt`.
    struct Fasting: Equatable {
        /// När fastan började – aldrig senare än tidslinjens post (en starttid i framtiden, t.ex. när
        /// klockan har ställts bakåt, räknas från postens tid, som på Android).
        let startedAt: Date
        /// "Fasta pågår" – beskriver fastan för VoiceOver.
        let label: String
        /// "Mål 16 h", eller nil.
        let targetText: String?
    }

    /// Flest valfria rader: energidetaljen, måltider, fasta och vatten.
    static let maxRows = 4

    /// Exemplet i widgetgalleriet och platshållaren – samma som Android-widgetens förhandsvisning
    /// (res/layout/lagom_widget_preview.xml; \u{00A0} är hårt blanksteg som i appens texter).
    static let sample = WidgetContent.today(Today(
        energyText: "1\u{00A0}240 kcal kvar",
        energyDetail: "760 av 2\u{00A0}000 kcal",
        energyPermille: 380,
        mealsText: "3 måltider loggade",
        waterText: "0,75 av 2 l",
        waterPermille: 375,
        fasting: nil
    ))
}

// MARK: - Rubrik, knapp och reservtext

extension WidgetContent {
    /// "Idag" när dagens siffror visas, annars "Lagom".
    var title: String {
        if case .today = self { return WidgetText.titleToday }
        return WidgetText.titleApp
    }

    /// Visa knappen "Lägg till" (i systemMedium; i systemSmall är hela widgeten ett tryck).
    var showsAdd: Bool {
        switch self {
        case .noData:
            return true
        case .message(_, let showAdd):
            return showAdd
        case .today:
            return true
        }
    }

    /// Reservtexten, eller nil när dagens siffror visas.
    var fallbackText: String? {
        switch self {
        case .noData:
            return WidgetText.fallbackDefault
        case .message(let text, _):
            return text
        case .today:
            return nil
        }
    }
}

// MARK: - Valfria rader

extension WidgetContent.Today {
    /// Antal valfria rader som finns (energidetaljen, måltider, fasta och vatten).
    var optionalRowCount: Int {
        var count = 0
        if energyDetail != nil { count += 1 }
        if mealsText != nil { count += 1 }
        if fasting != nil { count += 1 }
        if waterText != nil { count += 1 }
        return count
    }

    /// Samma rad med högst `rows` valfria rader, i prioritetsordning: energidetaljen, måltider,
    /// fasta och vatten (som WidgetView.decide på Android). En rad som saknas lämnar plats åt nästa.
    /// Energitexten och energistapeln är inga valfria rader och finns alltid kvar.
    func limited(to rows: Int) -> WidgetContent.Today {
        var budget = max(0, rows)
        var result = self
        if result.energyDetail != nil {
            if budget > 0 { budget -= 1 } else { result.energyDetail = nil }
        }
        if result.mealsText != nil {
            if budget > 0 { budget -= 1 } else { result.mealsText = nil }
        }
        if result.fasting != nil {
            if budget > 0 { budget -= 1 } else { result.fasting = nil }
        }
        if result.waterText != nil {
            if budget > 0 {
                budget -= 1
            } else {
                result.waterText = nil
                result.waterPermille = WidgetPayload.permilleHidden
            }
        }
        return result
    }
}

// MARK: - Vad som visas vid en tidpunkt

extension WidgetContent {
    /// Den gregorianska kalendern i telefonens tidszon – den som widgeten jämför datumen i.
    static func localCalendar() -> Calendar {
        return gregorian(in: TimeZone.current)
    }

    /// Datan ur App Groupens text, eller nil när texten saknas eller inte går att läsa (widgeten
    /// visar då läget utan data). Felet citerar aldrig datan och loggas inte.
    static func payload(from text: String?) -> WidgetPayload? {
        guard let text = text else { return nil }
        return try? WidgetPayload.parse(text)
    }

    /// Bestäm vad som visas vid tidpunkten `date`.
    ///
    /// - Parameters:
    ///   - payload: den sparade datan, eller nil om ingen finns (eller den inte gick att läsa)
    ///   - date: tidpunkten (tidslinjens post)
    ///   - calendar: kalendern vars tidszon avgör det lokala datumet – datumen jämförs alltid i den
    ///     gregorianska kalendern (appens datum är gregorianska även om telefonen har en annan)
    static func resolve(payload: WidgetPayload?, at date: Date, calendar: Calendar) -> WidgetContent {
        guard let payload = payload else { return .noData }
        let fallback = isBlank(payload.fallbackText) ? WidgetText.fallbackDefault : payload.fallbackText
        guard payload.state == .ok else { return .message(fallback, showAdd: false) }
        let localDate = isoDate(date, calendar: calendar)
        guard let day = payload.day(for: localDate) else { return .message(fallback, showAdd: true) }

        let waterText = nonBlank(day.waterText)
        return .today(Today(
            energyText: payload.mindful ? nil : nonBlank(day.energyText),
            energyDetail: payload.mindful ? nil : nonBlank(day.energyDetail),
            energyPermille: payload.mindful ? WidgetPayload.permilleHidden : day.energyPermille,
            mealsText: nonBlank(day.mealsText),
            waterText: waterText,
            waterPermille: waterText == nil ? WidgetPayload.permilleHidden : day.waterPermille,
            fasting: payload.fasting.map { fastingContent($0, at: date) }
        ))
    }

    /// Tidpunkterna för tidslinjens poster: först `now`, sedan varje lokal midnatt efter `now` då
    /// innehållet kan byta – början av varje dag i datan och midnatten efter varje dag (efter den
    /// sista dagen, eller före ett hål, visas `fallbackText`). Sorterade och utan dubbletter. Bara
    /// `now` när datan saknas eller `state` inte är "ok".
    static func entryDates(payload: WidgetPayload?, now: Date, calendar: Calendar) -> [Date] {
        guard let payload = payload, payload.state == .ok else { return [now] }
        let local = gregorian(in: calendar.timeZone)
        var boundaries = Set<Date>()
        for day in payload.days {
            guard let dayNoon = noon(of: day.date, calendar: local) else { continue }
            boundaries.insert(local.startOfDay(for: dayNoon))
            if let nextNoon = local.date(byAdding: .day, value: 1, to: dayNoon) {
                boundaries.insert(local.startOfDay(for: nextNoon))
            }
        }
        return [now] + boundaries.filter { $0 > now }.sorted()
    }

    /// Det lokala datumet 'ÅÅÅÅ-MM-DD' för `date` i den gregorianska kalendern i `calendar`s tidszon.
    static func isoDate(_ date: Date, calendar: Calendar) -> String {
        let parts = gregorian(in: calendar.timeZone).dateComponents([.year, .month, .day], from: date)
        let year: String = padded(parts.year ?? 0, width: 4)
        let month: String = padded(parts.month ?? 0, width: 2)
        let day: String = padded(parts.day ?? 0, width: 2)
        return "\(year)-\(month)-\(day)"
    }

    /// Början av dagen 'ÅÅÅÅ-MM-DD' i `calendar`s tidszon (lokal midnatt, eller dagens första
    /// tidpunkt där sommartiden börjar vid midnatt), eller nil för ett ogiltigt datum.
    static func startOfDay(isoDate: String, calendar: Calendar) -> Date? {
        let local = gregorian(in: calendar.timeZone)
        guard let dayNoon = noon(of: isoDate, calendar: local) else { return nil }
        return local.startOfDay(for: dayNoon)
    }

    // MARK: Hjälpare

    private static func gregorian(in timeZone: TimeZone) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    /// Kl. 12 lokal tid dagen 'ÅÅÅÅ-MM-DD' – finns alltid, även där sommartiden börjar vid midnatt
    /// (då finns inte 00:00 den dagen, och startOfDay ger 01:00).
    private static func noon(of isoDate: String, calendar: Calendar) -> Date? {
        guard let parts = WidgetPayload.dateParts(isoDate) else { return nil }
        var components = DateComponents()
        components.year = parts.year
        components.month = parts.month
        components.day = parts.day
        components.hour = 12
        return calendar.date(from: components)
    }

    private static func fastingContent(_ fasting: WidgetPayload.Fasting, at date: Date) -> Fasting {
        let start = Date(timeIntervalSince1970: TimeInterval(fasting.startedAt) / 1000)
        return Fasting(
            startedAt: min(start, date),
            label: nonBlank(fasting.label) ?? WidgetText.fastingDescription,
            targetText: nonBlank(fasting.targetText)
        )
    }

    /// Tom eller bara blanktecken – som String.trim().isEmpty() på Android (tecken till och med
    /// U+0020; ett hårt blanksteg räknas som text).
    static func isBlank(_ text: String?) -> Bool {
        guard let text = text else { return true }
        return text.unicodeScalars.allSatisfy { $0.value <= 0x20 }
    }

    private static func nonBlank(_ text: String?) -> String? {
        return isBlank(text) ? nil : text
    }

    private static func padded(_ value: Int, width: Int) -> String {
        let digits = String(value)
        if digits.count >= width { return digits }
        return String(repeating: "0", count: width - digits.count) + digits
    }
}
