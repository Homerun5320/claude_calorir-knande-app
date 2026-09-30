// Swift-testerna för iPhone-widgetens logik: kontrollen av datan (WidgetPayload.swift), vad som
// visas vid en tidpunkt och tidslinjens poster (WidgetContent.swift) och det delade
// (WidgetShared.swift). Ingen XCTest och inget Xcode-projekt – ett vanligt program som molnbygget
// kompilerar och kör på både macOS och Linux:
//
//   swiftc -o "$OUT" ios/App/LagomWidget/WidgetShared.swift ios/App/LagomWidget/WidgetPayload.swift \
//     ios/App/LagomWidget/WidgetContent.swift ios/App/LagomWidgetTests/main.swift
//   "$OUT" ios/App/LagomWidgetTests/fixtures
//
// Slutkod 0 när alla kontroller gick igenom; annars en rad per fel och slutkod 1.
//
// - Facitfilerna i fixtures/ är riktiga sammanfattningar från appen (buildWidgetPayload), skrivna av
//   src/native/widgetIosFixtures.test.ts – de ska godtas och ge rätt rad.
// - Kontrollen av datan följer Android-widgetens JUnit-tester (android/app/src/test/…/
//   WidgetPayloadTest.java och WidgetViewTest.java) fall för fall, så att båda plattformarna godtar
//   och avvisar samma data.
// - Tidslinjen kontrolleras över sommartidens början och slut i Europe/Stockholm (2026-10-25 och
//   2027-03-28). De förväntade tidpunkterna räknas fram i UTC utan Calendar, så att testet inte
//   bara jämför Foundation med sig själv.

import Foundation
#if canImport(Glibc)
import Glibc
#elseif canImport(Musl)
import Musl
#elseif canImport(Darwin)
import Darwin
#endif

// MARK: - Testramen

/// Räknar kontrollerna och samlar felen.
final class Harness {
    private(set) var checks = 0
    private(set) var failures: [String] = []

    func check(_ condition: Bool, _ description: String) {
        checks += 1
        if !condition {
            failures.append(description)
        }
    }

    func equal<T: Equatable>(_ actual: T, _ expected: T, _ description: String) {
        checks += 1
        if actual != expected {
            failures.append("\(description): fick \(String(describing: actual)), väntade \(String(describing: expected))")
        }
    }

    /// Texten ska godtas – ger datan, eller nil (och ett fel).
    @discardableResult
    func accepts(_ json: String, _ description: String) -> WidgetPayload? {
        checks += 1
        do {
            return try WidgetPayload.parse(json)
        } catch {
            failures.append("\(description): borde godtas men avvisades (\(error))")
            return nil
        }
    }

    /// Texten ska avvisas – med felet `expected` när det anges, annars med något fast meddelande.
    func rejects(_ json: String, _ description: String, _ expected: WidgetPayloadError? = nil) {
        checks += 1
        do {
            _ = try WidgetPayload.parse(json)
            failures.append("\(description): borde avvisas")
        } catch let error as WidgetPayloadError {
            if let expected = expected, error != expected {
                failures.append("\(description): fick \(error), väntade \(expected)")
            } else if case .invalid(let message) = error, message.isEmpty {
                failures.append("\(description): tomt felmeddelande")
            }
        } catch {
            failures.append("\(description): oväntat fel \(error)")
        }
    }
}

// MARK: - JSON för testerna

/// En JSON-text som sträng: citattecken, bakstreck och radbrytning skrivs som escape-sekvenser.
func quoted(_ text: String) -> String {
    var result = "\""
    for scalar in text.unicodeScalars {
        switch scalar {
        case "\"":
            result += "\\\""
        case "\\":
            result += "\\\\"
        case "\n":
            result += "\\n"
        default:
            result.unicodeScalars.append(scalar)
        }
    }
    return result + "\""
}

/// Ett JSON-objekt som par av nyckel och rå JSON-text, i ordning – ett fält i taget kan ändras.
struct JSONObject {
    var pairs: [(key: String, raw: String)]

    init(_ pairs: [(key: String, raw: String)]) {
        self.pairs = pairs
    }

    mutating func set(_ key: String, _ raw: String) {
        if let index = pairs.firstIndex(where: { $0.key == key }) {
            pairs[index].raw = raw
        } else {
            pairs.append((key: key, raw: raw))
        }
    }

    mutating func remove(_ key: String) {
        pairs.removeAll { $0.key == key }
    }

    var json: String {
        let members: [String] = pairs.map { pair -> String in
            return quoted(pair.key) + ":" + pair.raw
        }
        return "{" + members.joined(separator: ",") + "}"
    }
}

enum Fixed {
    static let openApp = "Öppna Lagom för dagens siffror"
    static let noProfile = "Skapa din profil i Lagom"
    static let demo = "Widgeten visar inte exempeldata"
    static let fastingJSON = "{\"startedAt\":1789990000000,\"label\":\"Fasta pågår\",\"targetText\":\"Mål 16 h\"}"
    /** En vecka från 2026-09-30 (idag först), som appen skickar den. */
    static let week = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]
}

/// En dag som i Android-testerna (WidgetPayloadTest.day).
func dayObject(_ date: String) -> JSONObject {
    return JSONObject([
        ("date", quoted(date)),
        ("energyText", quoted("1 240 kcal kvar")),
        ("energyDetail", quoted("760 av 2 000 kcal")),
        ("energyPermille", "380"),
        ("mealsText", quoted("3 måltider loggade")),
        ("waterText", quoted("0,75 av 2 l")),
        ("waterPermille", "375"),
    ])
}

/// En giltig sammanfattning med dagarna `days` (WidgetPayloadTest.payload).
func payloadObject(_ days: [JSONObject]) -> JSONObject {
    let dayTexts: [String] = days.map { $0.json }
    let dayList: String = "[" + dayTexts.joined(separator: ",") + "]"
    return JSONObject([
        ("v", "1"),
        ("generatedAt", "1790000000000"),
        ("state", quoted("ok")),
        ("mindful", "false"),
        ("fallbackText", quoted(Fixed.openApp)),
        ("days", dayList),
        ("fasting", "null"),
    ])
}

/// En giltig sammanfattning med dagarna `dates`; `editDay` ändrar den första dagen och `edit` hela.
func payloadJSON(
    _ dates: [String],
    editDay: (inout JSONObject) -> Void = { _ in },
    edit: (inout JSONObject) -> Void = { _ in }
) -> String {
    var days = dates.map { dayObject($0) }
    if !days.isEmpty {
        editDay(&days[0])
    }
    var root = payloadObject(days)
    edit(&root)
    return root.json
}

/// Dagarna `dates` med måltidstexten "Måltider <datum>", så att det syns vilken dag som visas.
func labelledWeekJSON(_ dates: [String]) -> String {
    let days = dates.map { date -> JSONObject in
        var day = dayObject(date)
        day.set("mealsText", quoted("Måltider \(date)"))
        return day
    }
    return payloadObject(days).json
}

// MARK: - Datum utan Calendar

/// Dagar sedan 1970-01-01 för ett gregorianskt datum (Howard Hinnants days_from_civil).
func daysFromCivil(_ year: Int, _ month: Int, _ day: Int) -> Int {
    let y = month <= 2 ? year - 1 : year
    let era = (y >= 0 ? y : y - 399) / 400
    let yoe = y - era * 400
    let mp = (month + 9) % 12
    let doy = (153 * mp + 2) / 5 + day - 1
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146_097 + doe - 719_468
}

/// Datumet för dag nummer `days` sedan 1970-01-01 (civil_from_days).
func civilFromDays(_ days: Int) -> (year: Int, month: Int, day: Int) {
    let z = days + 719_468
    let era = (z >= 0 ? z : z - 146_096) / 146_097
    let doe = z - era * 146_097
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153
    let day = doy - (153 * mp + 2) / 5 + 1
    let month = mp < 10 ? mp + 3 : mp - 9
    let year = yoe + era * 400 + (month <= 2 ? 1 : 0)
    return (year: year, month: month, day: day)
}

func twoDigits(_ value: Int) -> String {
    return value < 10 ? "0\(value)" : "\(value)"
}

func isoString(_ date: (year: Int, month: Int, day: Int)) -> String {
    return "\(date.year)-\(twoDigits(date.month))-\(twoDigits(date.day))"
}

/// En tidpunkt i UTC (inga sommartider i UTC – här går det bra att räkna med 86 400 s per dygn).
func utc(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0, _ second: Int = 0) -> Date {
    let seconds = daysFromCivil(year, month, day) * 86_400 + hour * 3_600 + minute * 60 + second
    return Date(timeIntervalSince1970: TimeInterval(seconds))
}

func gregorianCalendar(_ zone: TimeZone) -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    return calendar
}

/// Dagens rad ur innehållet, eller nil när widgeten visar en reservtext.
func todayRow(_ content: WidgetContent) -> WidgetContent.Today? {
    if case .today(let today) = content {
        return today
    }
    return nil
}

// MARK: - Facitfilerna från appen

func readFixture(_ t: Harness, _ directory: String, _ name: String) -> String? {
    let path = directory + "/" + name + ".json"
    do {
        return try String(contentsOfFile: path, encoding: .utf8)
    } catch {
        t.check(false, "Facitfilen \(name).json kunde inte läsas i \(directory)")
        return nil
    }
}

func testFixtures(_ t: Harness, _ directory: String, _ stockholm: Calendar) {
    // 2026-09-30 kl. 12 i Stockholm (UTC+2).
    let noon = utc(2026, 9, 30, 10)

    // "normal": en vanlig dag med vatten och tre måltider.
    if let text = readFixture(t, directory, "normal"), let p = t.accepts(text, "normal.json") {
        t.equal(p.generatedAt, 1_790_762_400_000, "normal: generatedAt")
        t.equal(p.state, .ok, "normal: state")
        t.equal(p.mindful, false, "normal: mindful")
        t.equal(p.fallbackText, Fixed.openApp, "normal: fallbackText")
        t.equal(p.days.count, 7, "normal: sju dagar")
        t.equal(p.days.first?.date, "2026-09-30", "normal: idag först")
        t.equal(p.days.last?.date, "2026-10-06", "normal: sista dagen")
        t.check(p.fasting == nil, "normal: ingen fasta")
        let expected = WidgetContent.Today(
            energyText: "1\u{00A0}240 kcal kvar",
            energyDetail: "760 av 2\u{00A0}000 kcal",
            energyPermille: 380,
            mealsText: "3 måltider loggade",
            waterText: "0,75 av 2\u{00A0}l",
            waterPermille: 375,
            fasting: nil
        )
        let content = WidgetContent.resolve(payload: p, at: noon, calendar: stockholm)
        t.equal(content, .today(expected), "normal: dagens rad kl. 12")
        t.equal(content.title, "Idag", "normal: rubriken")
        t.check(content.showsAdd, "normal: knappen Lägg till")
        t.check(content.fallbackText == nil, "normal: ingen reservtext")

        // Efter midnatt: morgondagens rad ur samma data.
        let tomorrow = todayRow(WidgetContent.resolve(payload: p, at: utc(2026, 9, 30, 22), calendar: stockholm))
        t.equal(tomorrow?.energyText, "1\u{00A0}500 kcal kvar", "normal: 1 oktober 00:00")
        t.equal(tomorrow?.mealsText, "1 måltid loggad", "normal: 1 oktober, måltider")
        let lastSecond = todayRow(WidgetContent.resolve(payload: p, at: utc(2026, 9, 30, 21, 59, 59), calendar: stockholm))
        t.equal(lastSecond?.mealsText, "3 måltider loggade", "normal: 30 september 23:59:59")
        // Den sista dagen visas hela dagen; sedan reservtexten med knappen kvar.
        t.check(todayRow(WidgetContent.resolve(payload: p, at: utc(2026, 10, 6, 21, 59, 59), calendar: stockholm)) != nil, "normal: 6 oktober 23:59:59")
        let after = WidgetContent.resolve(payload: p, at: utc(2026, 10, 6, 22), calendar: stockholm)
        t.equal(after, .message(Fixed.openApp, showAdd: true), "normal: 7 oktober 00:00")
        t.equal(after.title, "Lagom", "normal: rubriken utan dagens rad")
        let before = WidgetContent.resolve(payload: p, at: utc(2026, 9, 29, 21, 59, 59), calendar: stockholm)
        t.equal(before, .message(Fixed.openApp, showAdd: true), "normal: 29 september 23:59:59")
        t.equal(WidgetContent.payload(from: text), p, "normal: payload(from:)")
    }

    // "over": över målet – neutral text, stapeln full.
    if let text = readFixture(t, directory, "over"), let p = t.accepts(text, "over.json") {
        let row = todayRow(WidgetContent.resolve(payload: p, at: noon, calendar: stockholm))
        t.equal(row?.energyText, "300 kcal över – helt okej", "over: energitexten")
        t.equal(row?.energyDetail, "2\u{00A0}300 av 2\u{00A0}000 kcal", "over: detaljen")
        t.equal(row?.energyPermille, 1000, "over: stapeln")
        t.equal(row?.waterPermille, 1000, "over: vattnet")
    }

    // "mindful": inga energisiffror, men måltider och vatten.
    if let text = readFixture(t, directory, "mindful"), let p = t.accepts(text, "mindful.json") {
        t.equal(p.mindful, true, "mindful: mindful")
        let row = todayRow(WidgetContent.resolve(payload: p, at: noon, calendar: stockholm))
        t.check(row != nil, "mindful: dagens rad")
        t.check(row?.energyText == nil, "mindful: ingen energitext")
        t.check(row?.energyDetail == nil, "mindful: ingen detalj")
        t.equal(row?.energyPermille, -1, "mindful: ingen stapel")
        t.equal(row?.mealsText, "3 måltider loggade", "mindful: måltider")
        t.equal(row?.waterText, "0,75 av 2\u{00A0}l", "mindful: vatten")
    }

    // "fasting": en pågående fasta sedan 2026-09-29 kl. 22 i Stockholm.
    if let text = readFixture(t, directory, "fasting"), let p = t.accepts(text, "fasting.json") {
        t.equal(p.fasting, WidgetPayload.Fasting(startedAt: 1_790_712_000_000, label: "Fasta pågår", targetText: "Mål 16 h"), "fasting: datan")
        let row = todayRow(WidgetContent.resolve(payload: p, at: noon, calendar: stockholm))
        t.equal(row?.fasting, WidgetContent.Fasting(startedAt: utc(2026, 9, 29, 20), label: "Fasta pågår", targetText: "Mål 16 h"), "fasting: raden")
    }

    // "noWaterTarget": inget dryckesmål – ingen vattenrad.
    if let text = readFixture(t, directory, "noWaterTarget"), let p = t.accepts(text, "noWaterTarget.json") {
        let row = todayRow(WidgetContent.resolve(payload: p, at: noon, calendar: stockholm))
        t.check(row != nil, "noWaterTarget: dagens rad")
        t.check(row?.waterText == nil, "noWaterTarget: ingen vattentext")
        t.equal(row?.waterPermille, -1, "noWaterTarget: ingen vattenstapel")
    }

    // "demo": exempeldata visas aldrig.
    if let text = readFixture(t, directory, "demo"), let p = t.accepts(text, "demo.json") {
        t.equal(p.state, .demo, "demo: state")
        t.check(p.days.isEmpty && p.fasting == nil, "demo: inga dagar och ingen fasta")
        let content = WidgetContent.resolve(payload: p, at: noon, calendar: stockholm)
        t.equal(content, .message(Fixed.demo, showAdd: false), "demo: bara texten")
        t.check(!content.showsAdd, "demo: ingen knapp")
        t.equal(WidgetContent.entryDates(payload: p, now: noon, calendar: stockholm), [noon], "demo: en post")
    }

    // "noProfile": ingen profil ännu.
    if let text = readFixture(t, directory, "noProfile"), let p = t.accepts(text, "noProfile.json") {
        t.equal(p.state, .noProfile, "noProfile: state")
        let content = WidgetContent.resolve(payload: p, at: noon, calendar: stockholm)
        t.equal(content, .message(Fixed.noProfile, showAdd: false), "noProfile: bara texten")
        t.equal(content.title, "Lagom", "noProfile: rubriken")
        t.equal(WidgetContent.entryDates(payload: p, now: noon, calendar: stockholm), [noon], "noProfile: en post")
    }
}

// MARK: - Kontrollen av datan (WidgetPayloadTest.java)

func testParse(_ t: Harness) {
    // Giltig data.
    if let p = t.accepts(payloadJSON(["2026-09-30", "2026-10-01"]), "giltig data") {
        t.equal(p.generatedAt, 1_790_000_000_000, "giltig: generatedAt")
        t.equal(p.state, .ok, "giltig: state")
        t.equal(p.mindful, false, "giltig: mindful")
        t.equal(p.fallbackText, Fixed.openApp, "giltig: fallbackText")
        t.equal(p.days.count, 2, "giltig: två dagar")
        t.equal(
            p.days.first,
            WidgetPayload.Day(
                date: "2026-09-30",
                energyText: "1 240 kcal kvar",
                energyDetail: "760 av 2 000 kcal",
                energyPermille: 380,
                mealsText: "3 måltider loggade",
                waterText: "0,75 av 2 l",
                waterPermille: 375
            ),
            "giltig: dagen"
        )
        t.check(p.fasting == nil, "giltig: ingen fasta")
    }

    // De andra lägena utan dagar.
    let noProfile = payloadJSON([], edit: { $0.set("state", quoted("noProfile")); $0.set("fallbackText", quoted(Fixed.noProfile)) })
    t.equal(t.accepts(noProfile, "noProfile utan dagar")?.state, .noProfile, "noProfile: state")
    let demo = payloadJSON([], edit: { $0.set("state", quoted("demo")); $0.set("fallbackText", quoted(Fixed.demo)) })
    t.equal(t.accepts(demo, "demo utan dagar")?.state, .demo, "demo: state")

    // Tal som org.json ger dem: heltal eller decimaltal.
    let numbers = payloadJSON(["2026-09-30"], editDay: { $0.set("energyPermille", "380.0") }, edit: { $0.set("v", "1.0"); $0.set("generatedAt", "1.79e12") })
    if let p = t.accepts(numbers, "tal som decimaltal") {
        t.equal(p.generatedAt, 1_790_000_000_000, "1.79e12 som tidsstämpel")
        t.equal(p.days.first?.energyPermille, 380, "380.0 som förlopp")
    }

    // Texter som får vara null eller saknas.
    let nullable = payloadJSON(["2026-09-30"], editDay: {
        $0.set("energyText", "null")
        $0.set("energyDetail", "null")
        $0.remove("waterText")
    })
    if let day = t.accepts(nullable, "null och saknade texter")?.days.first {
        t.check(day.energyText == nil && day.energyDetail == nil && day.waterText == nil, "null och saknade texter blir nil")
    }

    // Okända fält godtas och ignoreras.
    let unknown = payloadJSON(["2026-09-30"], editDay: { $0.set("steps", quoted("4 000 steg")) }, edit: { $0.set("somethingNew", "{\"x\":1}") })
    t.equal(t.accepts(unknown, "okända fält")?.days.count, 1, "okända fält ignoreras")

    // Fastan.
    let fasting = payloadJSON(["2026-09-30"], edit: { $0.set("fasting", Fixed.fastingJSON) })
    t.equal(
        t.accepts(fasting, "fasta")?.fasting,
        WidgetPayload.Fasting(startedAt: 1_789_990_000_000, label: "Fasta pågår", targetText: "Mål 16 h"),
        "fastan läses"
    )
    let fastingWithoutTarget = payloadJSON(["2026-09-30"], edit: { $0.set("fasting", "{\"startedAt\":1789990000000,\"label\":\"Fasta pågår\",\"targetText\":null}") })
    let parsedWithoutTarget = t.accepts(fastingWithoutTarget, "fasta utan mål")
    t.check(parsedWithoutTarget?.fasting != nil && parsedWithoutTarget?.fasting?.targetText == nil, "fasta utan mål: targetText nil")
    let noFasting = payloadJSON(["2026-09-30"], edit: { $0.remove("fasting") })
    t.check(t.accepts(noFasting, "fasta saknas")?.fasting == nil, "fasta saknas: nil")

    // Förlopp: begränsas och avrundas som Math.round i Java (halvvägs uppåt).
    t.equal(WidgetPayload.clampPermille(0), 0, "clampPermille(0)")
    t.equal(WidgetPayload.clampPermille(500), 500, "clampPermille(500)")
    t.equal(WidgetPayload.clampPermille(1000), 1000, "clampPermille(1000)")
    t.equal(WidgetPayload.clampPermille(1500), 1000, "clampPermille(1500)")
    t.equal(WidgetPayload.clampPermille(Int64.max), 1000, "clampPermille(max)")
    t.equal(WidgetPayload.clampPermille(-1), -1, "clampPermille(-1)")
    t.equal(WidgetPayload.clampPermille(-250), -1, "clampPermille(-250)")
    t.equal(WidgetPayload.clampPermille(Int64.min), -1, "clampPermille(min)")
    let permilleCases: [(raw: String, expected: Int)] = [
        ("1840", 1000), ("-7", -1), ("412.6", 413), ("412.5", 413), ("412.4", 412), ("-0.5", 0),
        ("-0.51", -1), ("999.5", 1000), ("1e3", 1000), ("0", 0), ("-1", -1), ("1e-9", 0),
    ]
    for (raw, expected) in permilleCases {
        let json = payloadJSON(["2026-09-30"], editDay: { $0.set("energyPermille", raw); $0.set("waterPermille", raw) })
        let day = t.accepts(json, "förlopp \(raw)")?.days.first
        t.equal(day?.energyPermille, expected, "energiförlopp \(raw)")
        t.equal(day?.waterPermille, expected, "vattenförlopp \(raw)")
    }
    let missingPermille = payloadJSON(["2026-09-30"], editDay: { $0.remove("waterPermille"); $0.set("energyPermille", "null") })
    let missingDay = t.accepts(missingPermille, "saknat förlopp")?.days.first
    t.equal(missingDay?.waterPermille, -1, "saknat förlopp döljer stapeln")
    t.equal(missingDay?.energyPermille, -1, "null som förlopp döljer stapeln")

    // Fel rot och version.
    t.rejects("null", "roten null", .invalid("Widgetdatan är inget objekt"))
    t.rejects("\"text\"", "roten en text", .invalid("Widgetdatan är inget objekt"))
    t.rejects("[1,2]", "roten en lista", .invalid("Widgetdatan är inget objekt"))
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("v", "2") }), "v = 2", .invalid("Okänd version av widgetdatan"))
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("v", quoted("1")) }), "v = \"1\"")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("v", "1.5") }), "v = 1.5")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("v", "true") }), "v = true")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.remove("v") }), "v saknas")

    // Fel fält på översta nivån.
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("state", quoted("okej")) }), "okänt läge", .invalid("Okänt läge i widgetdatan"))
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.remove("mindful") }), "mindful saknas")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("mindful", quoted("false")) }), "mindful som text")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("mindful", "0") }), "mindful som tal")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("fallbackText", "null") }), "fallbackText null")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("generatedAt", "-1") }), "negativ tidsstämpel")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("generatedAt", "12.5") }), "tidsstämpel med decimaler")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("generatedAt", "1e20") }), "tidsstämpel över 2^53")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("days", "{\"date\":\"2026-09-30\"}") }), "dagarna som objekt")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.remove("days") }), "dagarna saknas", .invalid("Dagarna saknas"))

    // För många dagar.
    var dates: [String] = []
    for i in 0...WidgetPayload.maxDays {
        dates.append("2026-10-\(twoDigits((i % 31) + 1))")
    }
    t.rejects(payloadJSON(dates), "32 dagar", .invalid("För många dagar"))
    t.equal(t.accepts(payloadJSON(Array(dates.prefix(WidgetPayload.maxDays))), "31 dagar")?.days.count, WidgetPayload.maxDays, "31 dagar godtas")

    // Ogiltiga datum.
    for date in ["2026-02-30", "2026-9-30", "30/09/2026", "2026-09-30T00:00", "", "2026-13-01", "2026-00-10", "2026-09-00", "2026-09-3a", "\u{FF12}\u{FF10}\u{FF12}\u{FF16}-09-30"] {
        t.rejects(payloadJSON([date]), "ogiltigt datum \(date)", .invalid("Ogiltigt datum"))
    }
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.set("date", "20260930") }), "datum som tal")
    t.check(WidgetPayload.isIsoDate("2028-02-29"), "2028-02-29 är ett datum")
    t.check(!WidgetPayload.isIsoDate("2027-02-29"), "2027-02-29 är inget datum")
    t.check(WidgetPayload.isIsoDate("2000-02-29"), "2000-02-29 är ett datum")
    t.check(!WidgetPayload.isIsoDate("1900-02-29"), "1900-02-29 är inget datum")
    t.check(WidgetPayload.isIsoDate("2026-12-31"), "2026-12-31 är ett datum")

    // Fel fält i en dag.
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.remove("mealsText") }), "mealsText saknas", .invalid("Ogiltig måltidstext"))
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.set("mealsText", "null") }), "mealsText null")
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.set("energyText", "1240") }), "energyText som tal", .invalid("Ogiltig energitext"))
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.set("energyPermille", quoted("380")) }), "förlopp som text", .invalid("Ogiltigt energiförlopp"))
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.set("energyPermille", "true") }), "förlopp som Bool")
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.set("waterPermille", "NaN") }), "förlopp NaN (ingen JSON)")
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.set("waterPermille", "1e400") }), "oändligt förlopp")
    t.rejects(
        payloadJSON(["2026-09-30"], edit: { $0.set("days", "[" + dayObject("2026-09-30").json + ",\"2026-10-01\"]") }),
        "en dag som text",
        .invalid("En dag är inget objekt")
    )

    // För långa texter (högst 200 UTF-16-enheter, som String.length() i Java).
    let long = String(repeating: "x", count: WidgetPayload.maxText + 1)
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.set("mealsText", quoted(long)) }), "mealsText 201 tecken")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("fallbackText", quoted(long)) }), "fallbackText 201 tecken", .invalid("Ogiltig reservtext"))
    let exact = String(repeating: "x", count: WidgetPayload.maxText)
    t.equal(t.accepts(payloadJSON(["2026-09-30"], editDay: { $0.set("mealsText", quoted(exact)) }), "mealsText 200 tecken")?.days.first?.mealsText.utf16.count, 200, "200 tecken godtas")
    let swedish = String(repeating: "å", count: WidgetPayload.maxText)
    t.check(t.accepts(payloadJSON(["2026-09-30"], editDay: { $0.set("mealsText", quoted(swedish)) }), "200 å") != nil, "200 å (400 byte) godtas")
    let emoji = String(repeating: "\u{1F34E}", count: WidgetPayload.maxText / 2)
    t.check(t.accepts(payloadJSON(["2026-09-30"], editDay: { $0.set("mealsText", quoted(emoji)) }), "100 emoji") != nil, "100 emoji (200 UTF-16-enheter) godtas")
    t.rejects(payloadJSON(["2026-09-30"], editDay: { $0.set("mealsText", quoted(emoji + "\u{1F34E}")) }), "101 emoji (202 UTF-16-enheter)")

    // Ogiltig fasta.
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("fasting", "{\"startedAt\":0,\"label\":\"Fasta pågår\",\"targetText\":\"Mål 16 h\"}") }), "fasta från 0", .invalid("Ogiltig starttid för fastan"))
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("fasting", "{\"startedAt\":-5,\"label\":\"Fasta pågår\"}") }), "fasta från -5")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("fasting", "{\"startedAt\":\"1789990000000\",\"label\":\"Fasta pågår\"}") }), "starttid som text")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("fasting", "{\"startedAt\":1789990000000.5,\"label\":\"Fasta pågår\"}") }), "starttid med decimaler")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("fasting", "{\"startedAt\":1789990000000}") }), "fasta utan text", .invalid("Ogiltig text för fastan"))
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("fasting", quoted("Fasta pågår")) }), "fastan som text", .invalid("Fastan är inget objekt"))

    // Dagen för ett datum; vid dubbletter gäller den första.
    if let p = t.accepts(payloadJSON(["2026-09-30", "2026-10-01", "2026-10-02"]), "tre dagar") {
        t.equal(p.day(for: "2026-10-01")?.date, "2026-10-01", "dagen 2026-10-01")
        t.check(p.day(for: "2026-10-03") == nil, "ingen dag 2026-10-03")
        t.check(p.day(for: "2026-09-29") == nil, "ingen dag 2026-09-29")
    }
    let duplicates = payloadObject([dayObject("2026-09-30"), { () -> JSONObject in
        var second = dayObject("2026-09-30")
        second.set("mealsText", quoted("Andra"))
        return second
    }()]).json
    t.equal(t.accepts(duplicates, "dubbletter")?.day(for: "2026-09-30")?.mealsText, "3 måltider loggade", "den första av dubbletterna gäller")

    // Felmeddelandena citerar aldrig datan.
    let secret = "hemlig-text-\(String(repeating: "x", count: 200))"
    for json in [
        payloadJSON(["2026-09-30"], edit: { $0.set("fallbackText", quoted(secret)) }),
        payloadJSON(["2026-09-30"], editDay: { $0.set("date", quoted("hemlig-text")) }),
        "{\"v\":1,\"hemlig-text\":",
        "hemlig-text",
    ] {
        do {
            _ = try WidgetPayload.parse(json)
            t.check(false, "ogiltig data med hemlig text borde avvisas")
        } catch WidgetPayloadError.invalid(let message) {
            t.check(!message.contains("hemlig"), "felmeddelandet citerar inte datan")
        } catch {
            t.check(false, "oväntat fel för data med hemlig text: \(error)")
        }
    }
}

// MARK: - Texten före tolkningen och JSON

func testText(_ t: Harness) {
    let limit = LagomWidgetShared.maxChars
    t.equal(limit, 32_768, "maxChars")

    // Längden räknas i UTF-16-enheter, som JS och Java.
    let atLimit = "\"" + String(repeating: "a", count: limit - 2) + "\""
    t.equal(atLimit.utf16.count, limit, "texten vid gränsen")
    t.rejects(atLimit, "texten vid gränsen är ingen sammanfattning", .invalid("Widgetdatan är inget objekt"))
    let overLimit = "\"" + String(repeating: "a", count: limit - 1) + "\""
    t.rejects(overLimit, "maxChars + 1 tecken", .tooLarge)
    // Emoji är två UTF-16-enheter: 16 385 emoji är 32 770 enheter men 16 385 tecken.
    t.rejects(String(repeating: "\u{1F34E}", count: limit / 2 + 1), "för många UTF-16-enheter", .tooLarge)
    // "å" är två byte i UTF-8 men en UTF-16-enhet – inte för stor.
    t.rejects("\"" + String(repeating: "å", count: limit - 2) + "\"", "å vid gränsen är inte för stor", .invalid("Widgetdatan är inget objekt"))
    do {
        try WidgetPayload.checkText(atLimit)
        t.check(true, "checkText vid gränsen")
    } catch {
        t.check(false, "checkText vid gränsen: \(error)")
    }

    // En hel sammanfattning utfylld med blanktecken till precis gränsen godtas; ett till gör den för stor.
    let valid = payloadJSON(Fixed.week)
    let padded = valid + String(repeating: " ", count: limit - valid.utf16.count)
    t.equal(padded.utf16.count, limit, "utfylld sammanfattning")
    t.check(t.accepts(padded, "sammanfattning på precis maxChars") != nil, "sammanfattning på precis maxChars godtas")
    t.rejects(padded + " ", "sammanfattning på maxChars + 1", .tooLarge)

    // Nästlingsdjupet räknas utanför strängar.
    t.equal(WidgetPayload.maxNestingDepth("\"text\""), 0, "djup: text")
    t.equal(WidgetPayload.maxNestingDepth("{\"a\":1}"), 1, "djup: objekt")
    t.equal(WidgetPayload.maxNestingDepth("{\"days\":[{\"date\":\"2026-09-30\"}],\"fasting\":{}}"), 3, "djup: kontraktet")
    t.equal(WidgetPayload.maxNestingDepth("{\"a\":\"[[[[{{{{\"}"), 1, "djup: klamrar i en sträng")
    t.equal(WidgetPayload.maxNestingDepth("{\"a\":\"x\\\"[[[[\"}"), 1, "djup: efter ett escapat citattecken")
    t.equal(WidgetPayload.maxNestingDepth("{\"a\":\"\\\\\",\"b\":[1]}"), 2, "djup: efter ett escapat bakstreck")
    t.rejects(String(repeating: "[", count: 5000), "5 000 nivåer", .invalid("Widgetdatan är för djupt nästlad"))
    t.check(t.accepts(payloadJSON(["2026-09-30"], edit: { $0.set("x", "[[[[[[[0]]]]]]]") }), "8 nivåer") != nil, "8 nivåer godtas")
    t.rejects(payloadJSON(["2026-09-30"], edit: { $0.set("x", "[[[[[[[[0]]]]]]]]") }), "9 nivåer", .invalid("Widgetdatan är för djupt nästlad"))

    // Strikt JSON: allt som inte är giltig JSON ger samma fasta fel.
    let notJSON = WidgetPayloadError.invalid("Widgetdatan är inte giltig JSON")
    let valid1 = payloadJSON(["2026-09-30"])
    t.rejects("", "tom text", notJSON)
    t.rejects("   ", "bara blanktecken", notJSON)
    t.rejects(valid1 + " x", "text efter objektet", notJSON)
    t.rejects(valid1 + valid1, "två objekt", notJSON)
    t.rejects(String(valid1.dropLast()), "objektet slutar inte", notJSON)
    t.check(t.accepts(" \n\t" + valid1 + "\r\n ", "blanktecken runt objektet") != nil, "blanktecken runt objektet godtas")
    t.rejects("{'v':1}", "enkla citattecken", notJSON)
    t.rejects("{v:1}", "nyckel utan citattecken", notJSON)
    t.rejects("{\"v\":1,}", "komma sist i ett objekt", notJSON)
    t.rejects("{\"a\":[1,]}", "komma sist i en lista", notJSON)
    t.rejects("{\"a\":01}", "inledande nolla", notJSON)
    t.rejects("{\"a\":+1}", "plustecken", notJSON)
    t.rejects("{\"a\":.5}", "ensam punkt", notJSON)
    t.rejects("{\"a\":1.}", "punkt utan decimaler", notJSON)
    t.rejects("{\"a\":1e}", "exponent utan siffror", notJSON)
    t.rejects("{\"a\":TRUE}", "TRUE", notJSON)
    t.rejects("{\"a\":\"rad\nbrytning\"}", "radbrytning i en sträng", notJSON)
    t.rejects("{\"a\":\"\\x\"}", "okänd escape-sekvens", notJSON)
    t.rejects("{\"a\":\"\\u12\"}", "kort \\u-sekvens", notJSON)

    // Escape-sekvenser i texterna.
    let escapes: [(raw: String, expected: String)] = [
        ("\\u00e5", "å"),
        ("\\u00A0", "\u{00A0}"),
        ("\\ud83c\\udf4e", "\u{1F34E}"),
        ("\\ud800", "\u{FFFD}"),
        ("\\udc00x", "\u{FFFD}x"),
        ("\\ud800\\u0041", "\u{FFFD}A"),
        ("\\\"\\\\\\/\\b\\f\\n\\r\\t", "\"\\/\u{08}\u{0C}\n\r\t"),
    ]
    for (raw, expected) in escapes {
        let json = payloadJSON(["2026-09-30"], editDay: { $0.set("mealsText", "\"" + raw + "\"") })
        t.equal(t.accepts(json, "escape \(raw)")?.days.first?.mealsText, expected, "escape \(raw)")
    }
    // Vid dubbletter av en nyckel gäller den sista (som org.json).
    let duplicateKey = payloadJSON(["2026-09-30"], editDay: { $0.pairs.append((key: "mealsText", raw: quoted("Sista"))) })
    t.equal(t.accepts(duplicateKey, "dubbel nyckel")?.days.first?.mealsText, "Sista", "den sista av dubbla nycklar gäller")
}

// MARK: - Vad som visas (WidgetViewTest.java)

func testResolve(_ t: Harness, _ stockholm: Calendar) {
    let noon = utc(2026, 9, 30, 10)
    func resolve(_ json: String, at date: Date = utc(2026, 9, 30, 10)) -> WidgetContent {
        return WidgetContent.resolve(payload: WidgetPayload.payload(json), at: date, calendar: stockholm)
    }

    // Ingen data.
    let none = WidgetContent.resolve(payload: nil, at: noon, calendar: stockholm)
    t.equal(none, .noData, "ingen data")
    t.equal(none.title, "Lagom", "ingen data: rubriken")
    t.equal(none.fallbackText, Fixed.openApp, "ingen data: widgetens egen text")
    t.check(none.showsAdd, "ingen data: knappen finns")
    t.check(WidgetContent.payload(from: nil) == nil, "ingen text: ingen data")
    t.check(WidgetContent.payload(from: "inte json") == nil, "oläslig text: ingen data")

    // Ingen profil och exempeldata: bara texten, ingen knapp – även med dagar och fasta i datan.
    let noProfile = payloadJSON([], edit: { $0.set("state", quoted("noProfile")); $0.set("fallbackText", quoted(Fixed.noProfile)) })
    t.equal(resolve(noProfile), .message(Fixed.noProfile, showAdd: false), "ingen profil")
    let demo = payloadJSON(Fixed.week, edit: {
        $0.set("state", quoted("demo"))
        $0.set("fallbackText", quoted(Fixed.demo))
        $0.set("fasting", Fixed.fastingJSON)
    })
    t.equal(resolve(demo), .message(Fixed.demo, showAdd: false), "exempeldata med dagar visas aldrig")
    t.equal(WidgetContent.entryDates(payload: WidgetPayload.payload(demo), now: noon, calendar: stockholm), [noon], "exempeldata: en post")

    // En tom reservtext från appen ger widgetens egen.
    let blankFallback = payloadJSON([], edit: { $0.set("state", quoted("noProfile")); $0.set("fallbackText", quoted("  ")) })
    t.equal(resolve(blankFallback), .message(Fixed.openApp, showAdd: false), "tom reservtext")
    let blankOk = payloadJSON(["2026-09-01"], edit: { $0.set("fallbackText", quoted("")) })
    t.equal(resolve(blankOk), .message(Fixed.openApp, showAdd: true), "tom reservtext utan dag")

    // Dagens rad.
    let week = payloadJSON(Fixed.week)
    let expected = WidgetContent.Today(
        energyText: "1 240 kcal kvar",
        energyDetail: "760 av 2 000 kcal",
        energyPermille: 380,
        mealsText: "3 måltider loggade",
        waterText: "0,75 av 2 l",
        waterPermille: 375,
        fasting: nil
    )
    t.equal(resolve(week), .today(expected), "dagens rad")

    // Datum utanför datan: appens reservtext, knappen finns kvar.
    for date in [utc(2026, 10, 6, 22), utc(2026, 9, 29, 12), utc(2027, 1, 1, 12)] {
        t.equal(resolve(week, at: date), .message(Fixed.openApp, showAdd: true), "datum utanför datan \(date)")
    }
    t.check(todayRow(resolve(week, at: utc(2026, 10, 6, 12))) != nil, "den sista dagen visas")
    // Ett hål i dagarna.
    let gap = payloadJSON(["2026-09-30", "2026-10-02"])
    t.equal(resolve(gap, at: utc(2026, 10, 1, 12)), .message(Fixed.openApp, showAdd: true), "hål i dagarna")
    t.check(todayRow(resolve(gap, at: utc(2026, 10, 2, 12))) != nil, "dagen efter hålet")
    // "ok" utan dagar.
    t.equal(resolve(payloadJSON([])), .message(Fixed.openApp, showAdd: true), "ok utan dagar")

    // Medvetet läge: aldrig energi, även om datan har den.
    let mindful = todayRow(resolve(payloadJSON(Fixed.week, edit: { $0.set("mindful", "true") })))
    t.check(mindful != nil, "medvetet läge: dagens rad")
    t.check(mindful?.energyText == nil && mindful?.energyDetail == nil, "medvetet läge: ingen energitext")
    t.equal(mindful?.energyPermille, -1, "medvetet läge: ingen energistapel")
    t.equal(mindful?.mealsText, "3 måltider loggade", "medvetet läge: måltider")
    t.equal(mindful?.waterText, "0,75 av 2 l", "medvetet läge: vatten")
    let mindfulAsSent = payloadJSON(Fixed.week, editDay: {
        $0.set("energyText", "null")
        $0.set("energyDetail", "null")
        $0.set("energyPermille", "-1")
    }, edit: { $0.set("mindful", "true") })
    t.equal(todayRow(resolve(mindfulAsSent))?.energyPermille, -1, "medvetet läge som appen skickar det")

    // Tomma texter och dolda staplar.
    let blanks = todayRow(resolve(payloadJSON(Fixed.week, editDay: {
        $0.set("mealsText", quoted(""))
        $0.set("waterText", "null")
        $0.set("waterPermille", "500")
        $0.set("energyDetail", quoted(" "))
        $0.set("energyPermille", "-1")
    })))
    t.check(blanks != nil, "tomma texter: dagens rad")
    t.check(blanks?.mealsText == nil, "tom måltidstext döljs")
    t.check(blanks?.waterText == nil, "vattnet döljs")
    t.equal(blanks?.waterPermille, -1, "vattnets stapel följer raden")
    t.check(blanks?.energyDetail == nil, "detalj med bara blanksteg döljs")
    t.equal(blanks?.energyPermille, -1, "energistapeln döljs")
    t.equal(blanks?.energyText, "1 240 kcal kvar", "energitexten finns kvar")
    // Ett hårt blanksteg är text (som String.trim() i Java).
    let nbsp = todayRow(resolve(payloadJSON(Fixed.week, editDay: { $0.set("mealsText", quoted("\u{00A0}")) })))
    t.equal(nbsp?.mealsText, "\u{00A0}", "hårt blanksteg räknas som text")
    // Vatten utan mål: texten men ingen stapel.
    let waterNoTarget = todayRow(resolve(payloadJSON(Fixed.week, editDay: { $0.set("waterPermille", "-1") })))
    t.equal(waterNoTarget?.waterText, "0,75 av 2 l", "vatten utan mål: texten")
    t.equal(waterNoTarget?.waterPermille, -1, "vatten utan mål: ingen stapel")

    // Fastan: bara med dagens rad.
    let fastingWeek = payloadJSON(Fixed.week, edit: { $0.set("fasting", Fixed.fastingJSON) })
    let fastingStart = Date(timeIntervalSince1970: 1_789_990_000)
    t.equal(
        todayRow(resolve(fastingWeek))?.fasting,
        WidgetContent.Fasting(startedAt: fastingStart, label: "Fasta pågår", targetText: "Mål 16 h"),
        "fastan med dagens rad"
    )
    t.equal(resolve(fastingWeek, at: utc(2026, 10, 8, 12)), .message(Fixed.openApp, showAdd: true), "ingen fasta utan dagens rad")
    // En starttid efter postens tid (klockan ställd bakåt) räknas från posten, som på Android.
    // Fastan i Fixed.fastingJSON började 2026-09-21 kl. 13:26:40 i Stockholm.
    let early = utc(2026, 9, 20, 10)
    t.check(early < fastingStart, "posten före fastans start")
    let futureWeek = payloadJSON(["2026-09-20"], edit: { $0.set("fasting", Fixed.fastingJSON) })
    t.equal(todayRow(resolve(futureWeek, at: early))?.fasting?.startedAt, early, "starttid i framtiden")
    // Tom text för fastan: widgetens egen beskrivning; tomt mål döljs.
    let blankFasting = payloadJSON(Fixed.week, edit: { $0.set("fasting", "{\"startedAt\":1789990000000,\"label\":\"\",\"targetText\":\" \"}") })
    t.equal(
        todayRow(resolve(blankFasting))?.fasting,
        WidgetContent.Fasting(startedAt: fastingStart, label: "Fasta pågår", targetText: nil),
        "fasta med tomma texter"
    )

    // Datumen jämförs alltid i den gregorianska kalendern, även om telefonen har en annan.
    var buddhist = Calendar(identifier: .buddhist)
    buddhist.timeZone = stockholm.timeZone
    t.equal(WidgetContent.resolve(payload: WidgetPayload.payload(week), at: noon, calendar: buddhist), .today(expected), "buddhistisk kalender")
    t.equal(WidgetContent.isoDate(noon, calendar: buddhist), "2026-09-30", "isoDate i buddhistisk kalender")

    // Exemplet i widgetgalleriet.
    t.equal(todayRow(WidgetContent.sample)?.energyPermille, 380, "exemplet: stapeln")
    t.equal(WidgetContent.sample.title, "Idag", "exemplet: rubriken")
}

extension WidgetPayload {
    /// Datan ur en JSON-text i testerna, eller nil.
    static func payload(_ json: String) -> WidgetPayload? {
        return try? WidgetPayload.parse(json)
    }
}

// MARK: - Valfria rader efter storlek

func testRows(_ t: Harness) {
    let full = WidgetContent.Today(
        energyText: "1 240 kcal kvar",
        energyDetail: "760 av 2 000 kcal",
        energyPermille: 380,
        mealsText: "3 måltider loggade",
        waterText: "0,75 av 2 l",
        waterPermille: 375,
        fasting: WidgetContent.Fasting(startedAt: Date(timeIntervalSince1970: 1_789_990_000), label: "Fasta pågår", targetText: "Mål 16 h")
    )
    t.equal(full.optionalRowCount, 4, "fyra valfria rader")
    t.equal(WidgetContent.maxRows, 4, "maxRows")

    let none = full.limited(to: 0)
    t.equal(none.energyText, "1 240 kcal kvar", "0 rader: energitexten finns kvar")
    t.equal(none.energyPermille, 380, "0 rader: stapeln finns kvar")
    t.check(none.energyDetail == nil && none.mealsText == nil && none.fasting == nil && none.waterText == nil, "0 rader: inga valfria rader")
    t.equal(none.waterPermille, -1, "0 rader: ingen vattenstapel")
    t.equal(full.limited(to: -3), none, "negativt antal rader som 0")

    let one = full.limited(to: 1)
    t.check(one.energyDetail != nil && one.mealsText == nil, "1 rad: energidetaljen")
    let two = full.limited(to: 2)
    t.check(two.mealsText != nil && two.fasting == nil, "2 rader: måltiderna")
    let three = full.limited(to: 3)
    t.check(three.fasting != nil && three.waterText == nil, "3 rader: fastan går före vattnet")
    t.equal(three.waterPermille, -1, "3 rader: ingen vattenstapel")
    t.equal(full.limited(to: 4), full, "4 rader: allt")
    t.equal(full.limited(to: 10), full, "fler rader än som finns")

    // En rad som saknas lämnar plats åt nästa.
    var missing = full
    missing.energyDetail = nil
    missing.fasting = nil
    let limited = missing.limited(to: 2)
    t.equal(limited.mealsText, "3 måltider loggade", "utan detalj: måltiderna")
    t.equal(limited.waterText, "0,75 av 2 l", "utan detalj och fasta: vattnet får platsen")
    t.equal(limited.waterPermille, 375, "utan detalj och fasta: vattnets stapel")
    t.equal(missing.optionalRowCount, 2, "två valfria rader")

    // Medvetet läge: energitexten saknas, alla valfria rader får plats som vanligt.
    var mindful = full
    mindful.energyText = nil
    mindful.energyDetail = nil
    mindful.energyPermille = -1
    let mindfulOne = mindful.limited(to: 1)
    t.equal(mindfulOne.mealsText, "3 måltider loggade", "medvetet läge: måltiderna först")
    t.check(mindfulOne.fasting == nil && mindfulOne.waterText == nil, "medvetet läge: en rad")
}

// MARK: - Tidslinjen och sommartiden

func testTimeline(_ t: Harness, _ stockholm: Calendar) {
    let noon = utc(2026, 9, 30, 10)
    let week = WidgetPayload.payload(payloadJSON(Fixed.week))

    t.equal(WidgetContent.entryDates(payload: nil, now: noon, calendar: stockholm), [noon], "ingen data: en post")

    // En vecka från 2026-09-30 kl. 12: nu och midnatt 1–7 oktober (CEST, UTC+2).
    let midnights: [Date] = (1...7).map { (day: Int) -> Date in
        return utc(2026, 9, 30 + day, 0).addingTimeInterval(-2.0 * 3_600.0)
    }
    let expectedWeek: [Date] = [noon] + midnights
    let weekDates = WidgetContent.entryDates(payload: week, now: noon, calendar: stockholm)
    t.equal(weekDates, expectedWeek, "en vecka: nu och sju midnätter")
    let weekContents = weekDates.map { WidgetContent.resolve(payload: week, at: $0, calendar: stockholm) }
    t.check(weekContents.dropLast().allSatisfy { todayRow($0) != nil }, "en vecka: dagens rad fram till sista dagen")
    t.equal(weekContents.last, .message(Fixed.openApp, showAdd: true), "en vecka: reservtexten efter sista dagen")

    // Precis vid midnatt: ingen dubblett av nu.
    let midnight = utc(2026, 9, 30, 22)
    let atMidnight = WidgetContent.entryDates(payload: week, now: midnight, calendar: stockholm)
    t.equal(atMidnight.first, midnight, "vid midnatt: nu först")
    t.equal(atMidnight.count, 7, "vid midnatt: nu och sex midnätter")
    t.equal(Set(atMidnight).count, atMidnight.count, "vid midnatt: inga dubbletter")

    // Alla dagar har passerat: bara nu.
    let late = utc(2026, 10, 20, 10)
    t.equal(WidgetContent.entryDates(payload: week, now: late, calendar: stockholm), [late], "gamla dagar: en post")

    // Hål och osorterade dagar.
    let gap = WidgetPayload.payload(payloadJSON(["2026-10-02", "2026-09-30"]))
    let gapDates = WidgetContent.entryDates(payload: gap, now: noon, calendar: stockholm)
    t.equal(gapDates, [noon, utc(2026, 9, 30, 22), utc(2026, 10, 1, 22), utc(2026, 10, 2, 22)], "hål i dagarna")
    t.equal(
        gapDates.map { WidgetContent.resolve(payload: gap, at: $0, calendar: stockholm).title },
        ["Idag", "Lagom", "Idag", "Lagom"],
        "hål i dagarna: rubrikerna"
    )

    // Sommartiden slutar 2026-10-25 kl. 03 (CEST, UTC+2) → 02 (CET, UTC+1): dygnet är 25 timmar.
    let autumnDays = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]
    let autumn = WidgetPayload.payload(labelledWeekJSON(autumnDays))
    let autumnNow = utc(2026, 10, 22, 10)
    let autumnExpected: [Date] = [
        autumnNow,
        utc(2026, 10, 22, 22), utc(2026, 10, 23, 22), utc(2026, 10, 24, 22),
        utc(2026, 10, 25, 23), utc(2026, 10, 26, 23), utc(2026, 10, 27, 23), utc(2026, 10, 28, 23),
    ]
    let autumnDates = WidgetContent.entryDates(payload: autumn, now: autumnNow, calendar: stockholm)
    t.equal(autumnDates, autumnExpected, "hösten: lokala midnätter över sommartidens slut")
    let autumnRows: [String] = autumnDates.map { (date: Date) -> String in
        return todayRow(WidgetContent.resolve(payload: autumn, at: date, calendar: stockholm))?.mealsText ?? "reserv"
    }
    let autumnExpectedRows: [String] = autumnDays.map { (day: String) -> String in "Måltider \(day)" } + ["reserv"]
    t.equal(autumnRows, autumnExpectedRows, "hösten: rätt dag vid varje post")
    let autumnChecks: [(date: Date, iso: String)] = [
        (utc(2026, 10, 24, 21, 59, 59), "2026-10-24"),
        (utc(2026, 10, 24, 22), "2026-10-25"),
        (utc(2026, 10, 25, 0, 30), "2026-10-25"), // 02:30 CEST
        (utc(2026, 10, 25, 1, 30), "2026-10-25"), // 02:30 CET, samma klockslag igen
        (utc(2026, 10, 25, 22, 59, 59), "2026-10-25"), // 23:59:59 CET
        (utc(2026, 10, 25, 23), "2026-10-26"),
    ]
    for (date, iso) in autumnChecks {
        t.equal(WidgetContent.isoDate(date, calendar: stockholm), iso, "hösten: lokalt datum \(date)")
    }
    t.equal(WidgetContent.startOfDay(isoDate: "2026-10-25", calendar: stockholm), utc(2026, 10, 24, 22), "hösten: 25 oktober börjar")
    t.equal(WidgetContent.startOfDay(isoDate: "2026-10-26", calendar: stockholm), utc(2026, 10, 25, 23), "hösten: 26 oktober börjar")

    // Sommartiden börjar 2027-03-28 kl. 02 (CET, UTC+1) → 03 (CEST, UTC+2): dygnet är 23 timmar.
    let springDays = ["2027-03-25", "2027-03-26", "2027-03-27", "2027-03-28", "2027-03-29", "2027-03-30", "2027-03-31"]
    let spring = WidgetPayload.payload(labelledWeekJSON(springDays))
    let springNow = utc(2027, 3, 25, 11)
    let springExpected: [Date] = [
        springNow,
        utc(2027, 3, 25, 23), utc(2027, 3, 26, 23), utc(2027, 3, 27, 23),
        utc(2027, 3, 28, 22), utc(2027, 3, 29, 22), utc(2027, 3, 30, 22), utc(2027, 3, 31, 22),
    ]
    let springDates = WidgetContent.entryDates(payload: spring, now: springNow, calendar: stockholm)
    t.equal(springDates, springExpected, "våren: lokala midnätter över sommartidens början")
    let springRows: [String] = springDates.map { (date: Date) -> String in
        return todayRow(WidgetContent.resolve(payload: spring, at: date, calendar: stockholm))?.mealsText ?? "reserv"
    }
    let springExpectedRows: [String] = springDays.map { (day: String) -> String in "Måltider \(day)" } + ["reserv"]
    t.equal(springRows, springExpectedRows, "våren: rätt dag vid varje post")
    let springChecks: [(date: Date, iso: String)] = [
        (utc(2027, 3, 27, 22, 59, 59), "2027-03-27"),
        (utc(2027, 3, 27, 23), "2027-03-28"),
        (utc(2027, 3, 28, 0, 30), "2027-03-28"), // 01:30 CET
        (utc(2027, 3, 28, 1, 30), "2027-03-28"), // 03:30 CEST
        (utc(2027, 3, 28, 21, 59, 59), "2027-03-28"), // 23:59:59 CEST
        (utc(2027, 3, 28, 22), "2027-03-29"),
    ]
    for (date, iso) in springChecks {
        t.equal(WidgetContent.isoDate(date, calendar: stockholm), iso, "våren: lokalt datum \(date)")
    }
    t.equal(WidgetContent.startOfDay(isoDate: "2027-03-28", calendar: stockholm), utc(2027, 3, 27, 23), "våren: 28 mars börjar")
    t.equal(WidgetContent.startOfDay(isoDate: "2027-03-29", calendar: stockholm), utc(2027, 3, 28, 22), "våren: 29 mars börjar")
    t.check(WidgetContent.startOfDay(isoDate: "2026-02-30", calendar: stockholm) == nil, "ogiltigt datum: ingen dag")

    // Varje dag 2026–2027 i några tidszoner: dagens början ger rätt datum, och sekunden före den
    // hör till dagen innan.
    let first = daysFromCivil(2026, 1, 1)
    let last = daysFromCivil(2027, 12, 31)
    t.equal(isoString(civilFromDays(first)), "2026-01-01", "civilFromDays")
    t.equal(isoString(civilFromDays(daysFromCivil(2028, 2, 29))), "2028-02-29", "civilFromDays, skottdag")
    for identifier in ["Europe/Stockholm", "America/New_York", "Australia/Lord_Howe", "Asia/Tokyo", "UTC"] {
        guard let zone = TimeZone(identifier: identifier) else {
            t.check(false, "tidszonen \(identifier) saknas")
            continue
        }
        let calendar = gregorianCalendar(zone)
        var wrong: [String] = []
        for number in first...last {
            let iso = isoString(civilFromDays(number))
            guard let start = WidgetContent.startOfDay(isoDate: iso, calendar: calendar) else {
                wrong.append(iso)
                continue
            }
            let previous = isoString(civilFromDays(number - 1))
            if WidgetContent.isoDate(start, calendar: calendar) != iso || WidgetContent.isoDate(start.addingTimeInterval(-1), calendar: calendar) != previous {
                wrong.append(iso)
            }
        }
        t.equal(wrong, [], "dygnens början i \(identifier)")
    }
}

// MARK: - Det delade

func testShared(_ t: Harness) {
    t.equal(LagomWidgetShared.appGroup, "group.se.lagomappen.lagom", "App Group")
    t.equal(LagomWidgetShared.payloadKey, "payload", "nyckeln")
    t.equal(LagomWidgetShared.kind, "LagomWidget", "widgetens namn")
    t.equal(LagomWidgetShared.todayURL.absoluteString, "lagom-widget://idag", "länken till Idag")
    t.equal(LagomWidgetShared.addURL.absoluteString, "lagom-widget://lagg-till", "länken till Lägg till")
    #if !canImport(Darwin)
    // Ingen App Group utanför Apples plattformar.
    t.check(LagomWidgetShared.sharedDefaults() == nil, "ingen App Group på Linux")
    #endif
    t.equal(WidgetText.titleToday, "Idag", "rubriken Idag")
    t.equal(WidgetText.titleApp, "Lagom", "rubriken Lagom")
    t.equal(WidgetText.fallbackDefault, Fixed.openApp, "widgetens egen reservtext = appens")
}

// MARK: - Körningen

let harness = Harness()
let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    print("Användning: \(arguments.first ?? "LagomWidgetTests") <mappen med facitfilerna>")
    exit(2)
}
guard let stockholmZone = TimeZone(identifier: "Europe/Stockholm") else {
    print("FEL: tidszonen Europe/Stockholm saknas")
    exit(1)
}
let stockholm = gregorianCalendar(stockholmZone)

testFixtures(harness, arguments[1], stockholm)
testParse(harness)
testText(harness)
testResolve(harness, stockholm)
testRows(harness)
testTimeline(harness, stockholm)
testShared(harness)

if harness.failures.isEmpty {
    print("Widgetens Swift-tester: alla \(harness.checks) kontroller gick igenom.")
    exit(0)
}
for failure in harness.failures {
    print("FEL: \(failure)")
}
print("Widgetens Swift-tester: \(harness.failures.count) av \(harness.checks) kontroller misslyckades.")
exit(1)
