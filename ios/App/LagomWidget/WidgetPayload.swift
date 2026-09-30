// Widgetens data, version 1 – kontraktet med src/native/widget.ts och src/lib/widgetSummary.ts
// (docs/WIDGET.md, avsnitt 3). Appen skickar JSON-texten med färdiga svenska texter; widgeten
// formaterar aldrig själv några tal.
//
// Kontrollen följer Android-widgeten (WidgetPayload.java och WidgetJson.java) regel för regel, så
// att båda plattformarna godtar och avvisar samma data: högst 32 768 tecken (UTF-16), högst 8
// nivåer djup, v = 1, texter högst 200 tecken, högst 31 dagar, giltiga datum, förlopp som avrundas
// och begränsas till -1 eller 0–1000. Okända fält godtas och ignoreras, så att en senare version
// kan lägga till fält utan att en äldre widget slutar fungera.
//
// JSON-texten tolkas av en liten egen tolkare (strikt JSON enligt RFC 8259) i stället för
// JSONSerialization: den ger samma typer på iPhone och Linux (ett tal är aldrig ett Bool) och skiljer
// heltal från decimaltal som org.json gör. Ogiltig data avvisas med WidgetPayloadError – meddelandet
// är alltid en fast text och citerar aldrig innehållet.
//
// Filen ingår i både appen (tillägget LagomWidgetPlugin) och widgeten, och bara Foundation används
// (Swift-testerna kompilerar den även på Linux).

import Foundation

/// Ogiltig widgetdata. Texten i `invalid` är ett fast svenskt meddelande utan innehåll från datan.
enum WidgetPayloadError: Error, Equatable {
    /// Texten är längre än LagomWidgetShared.maxChars (UTF-16-enheter).
    case tooLarge
    /// Texten är inte giltig JSON eller följer inte kontraktet.
    case invalid(String)
}

/// Sammanfattningen som appen skickar (WidgetPayload version 1).
struct WidgetPayload: Equatable {
    /// Kontraktets version (fältet `v`).
    static let version = 1
    /// Högsta nästlingsdjup i JSON-texten (version 1 behöver 3) – skyddar tolkaren mot "[[[[…".
    static let maxDepth = 8
    /// Flest dagar som godtas (appen skickar idag och sex dagar till).
    static let maxDays = 31
    /// Längsta text i ett fält, i UTF-16-enheter – längre texter är ett fel hos avsändaren.
    static let maxText = 200
    /// Förlopp: 0–1000 promille; -1 betyder att stapeln döljs.
    static let permilleMax = 1000
    static let permilleHidden = -1

    /// Läget i appen när sammanfattningen byggdes.
    enum State: String, Equatable {
        /// Profil finns – dagarna och fastan gäller.
        case ok = "ok"
        /// Ingen profil ännu (välkomstflödet är inte klart).
        case noProfile = "noProfile"
        /// Exempeldata – widgeten visar aldrig exempeldata.
        case demo = "demo"
    }

    /// En dag i sammanfattningen, med texterna som appen redan har formaterat.
    struct Day: Equatable {
        /// Lokalt datum 'ÅÅÅÅ-MM-DD'.
        let date: String
        /// "1 240 kcal kvar" – nil i medvetet läge.
        let energyText: String?
        /// "760 av 2 000 kcal" – nil i medvetet läge.
        let energyDetail: String?
        /// 0–1000, eller -1 när stapeln döljs.
        let energyPermille: Int
        /// "3 måltider loggade", "Inget loggat än".
        let mealsText: String
        /// "0,75 av 2 l" – nil döljer vattnet.
        let waterText: String?
        /// 0–1000, eller -1 när stapeln döljs.
        let waterPermille: Int

        init(
            date: String,
            energyText: String?,
            energyDetail: String?,
            energyPermille: Int,
            mealsText: String,
            waterText: String?,
            waterPermille: Int
        ) {
            self.date = date
            self.energyText = energyText
            self.energyDetail = energyDetail
            self.energyPermille = WidgetPayload.clampPermille(Int64(energyPermille))
            self.mealsText = mealsText
            self.waterText = waterText
            self.waterPermille = WidgetPayload.clampPermille(Int64(waterPermille))
        }
    }

    /// En pågående fasta.
    struct Fasting: Equatable {
        /// Starttid i millisekunder sedan 1970 (Date.now() i appen).
        let startedAt: Int64
        /// T.ex. "Fasta pågår" – beskrivning för skärmläsare.
        let label: String
        /// T.ex. "Mål 16 h", eller nil.
        let targetText: String?
    }

    /// När sammanfattningen byggdes (millisekunder sedan 1970).
    let generatedAt: Int64
    let state: State
    let mindful: Bool
    /// Visas när ingen dag har dagens datum, eller när `state` inte är `ok`.
    let fallbackText: String
    /// Dagarna i den ordning appen skickade dem (idag först). Tom när `state` inte är `ok`.
    let days: [Day]
    /// Pågående fasta, eller nil.
    let fasting: Fasting?

    /// Dagen med datumet `isoDate` (lokalt 'ÅÅÅÅ-MM-DD'), eller nil. Vid dubbletter gäller den första.
    func day(for isoDate: String) -> Day? {
        return days.first { $0.date == isoDate }
    }
}

// MARK: - Tolkning och kontroll

extension WidgetPayload {
    /// Tolka och kontrollera JSON-texten från appen.
    ///
    /// - Throws: `WidgetPayloadError.tooLarge` när texten är längre än `LagomWidgetShared.maxChars`
    ///   UTF-16-enheter, annars `WidgetPayloadError.invalid` med ett fast meddelande.
    static func parse(_ text: String) throws -> WidgetPayload {
        try checkText(text)
        var parser = JSONParser(text)
        let root = try parser.parseDocument()
        return try fromJSON(root)
    }

    /// Kontrollerna som görs på texten före tolkningen: längd och nästlingsdjup.
    static func checkText(_ text: String) throws {
        if text.utf16.count > LagomWidgetShared.maxChars {
            throw WidgetPayloadError.tooLarge
        }
        if maxNestingDepth(text) > maxDepth {
            throw WidgetPayloadError.invalid("Widgetdatan är för djupt nästlad")
        }
    }

    /// Det största nästlingsdjupet av {} och [] i en JSON-text (utanför strängar). Körs före
    /// tolkningen, så att en text som "[[[[…" aldrig når den rekursiva tolkaren.
    static func maxNestingDepth(_ json: String) -> Int {
        var depth = 0
        var maximum = 0
        var inString = false
        var escaped = false
        // Klamrar, citattecken och bakstreck är ASCII och förekommer aldrig inuti ett tecken som
        // tar flera byte i UTF-8, så det räcker att gå igenom byten.
        for byte in json.utf8 {
            if inString {
                if escaped {
                    escaped = false
                } else if byte == 0x5C {
                    escaped = true
                } else if byte == 0x22 {
                    inString = false
                }
                continue
            }
            switch byte {
            case 0x22:
                inString = true
            case 0x7B, 0x5B:
                depth += 1
                if depth > maximum { maximum = depth }
            case 0x7D, 0x5D:
                depth = max(0, depth - 1)
            default:
                break
            }
        }
        return maximum
    }

    /// Promille till 0–1000, eller -1 (dold) för alla negativa värden.
    static func clampPermille(_ value: Int64) -> Int {
        if value < 0 { return permilleHidden }
        return Int(min(Int64(permilleMax), value))
    }

    /// Javas Math.round: närmaste heltal, och halvvägs uppåt (mot +∞) – -0,5 blir 0, 412,5 blir 413.
    static func roundHalfUp(_ value: Double) -> Double {
        let floor = value.rounded(.down)
        return value - floor >= 0.5 ? floor + 1 : floor
    }

    /// Ett giltigt lokalt datum 'ÅÅÅÅ-MM-DD' med siffrorna 0–9 (t.ex. inte 2026-02-30).
    static func isIsoDate(_ value: String) -> Bool {
        return dateParts(value) != nil
    }

    /// År, månad och dag ur 'ÅÅÅÅ-MM-DD', eller nil om datumet inte är giltigt – som
    /// LocalDate.parse i Android-versionen (den gregorianska kalendern, skottår).
    static func dateParts(_ value: String) -> (year: Int, month: Int, day: Int)? {
        let bytes = Array(value.utf8)
        guard bytes.count == 10, bytes[4] == 0x2D, bytes[7] == 0x2D else { return nil }
        func number(_ range: Range<Int>) -> Int? {
            var result = 0
            for index in range {
                let byte = bytes[index]
                guard byte >= 0x30 && byte <= 0x39 else { return nil }
                result = result * 10 + Int(byte - 0x30)
            }
            return result
        }
        guard let year = number(0..<4), let month = number(5..<7), let day = number(8..<10) else {
            return nil
        }
        guard month >= 1, month <= 12, day >= 1, day <= daysInMonth(year: year, month: month) else {
            return nil
        }
        return (year: year, month: month, day: day)
    }

    private static func daysInMonth(year: Int, month: Int) -> Int {
        switch month {
        case 2:
            let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
            return leap ? 29 : 28
        case 4, 6, 9, 11:
            return 30
        default:
            return 31
        }
    }

    // MARK: Modellen ur den tolkade JSON-texten (som WidgetPayload.fromMap på Android)

    private static func fromJSON(_ root: JSONNode) throws -> WidgetPayload {
        let map = try object(root, "Widgetdatan är inget objekt")

        guard let version = wholeNumber(field(map, "v")), version == Int64(WidgetPayload.version) else {
            throw WidgetPayloadError.invalid("Okänd version av widgetdatan")
        }

        guard let generatedAt = wholeNumber(field(map, "generatedAt")), generatedAt >= 0 else {
            throw WidgetPayloadError.invalid("Ogiltig tidsstämpel")
        }

        guard case .string(let stateValue)? = field(map, "state"), let state = State(rawValue: stateValue) else {
            throw WidgetPayloadError.invalid("Okänt läge i widgetdatan")
        }

        guard case .bool(let mindful)? = field(map, "mindful") else {
            throw WidgetPayloadError.invalid("Ogiltigt medvetet läge")
        }

        let fallbackText = try requireText(field(map, "fallbackText"), "Ogiltig reservtext")

        guard case .array(let rawDays)? = field(map, "days") else {
            throw WidgetPayloadError.invalid("Dagarna saknas")
        }
        if rawDays.count > maxDays {
            throw WidgetPayloadError.invalid("För många dagar")
        }
        var days: [Day] = []
        days.reserveCapacity(rawDays.count)
        for rawDay in rawDays {
            days.append(try parseDay(rawDay))
        }

        var fasting: Fasting? = nil
        if let rawFasting = field(map, "fasting") {
            fasting = try parseFasting(rawFasting)
        }

        return WidgetPayload(
            generatedAt: generatedAt,
            state: state,
            mindful: mindful,
            fallbackText: fallbackText,
            days: days,
            fasting: fasting
        )
    }

    private static func parseDay(_ raw: JSONNode) throws -> Day {
        let day = try object(raw, "En dag är inget objekt")
        guard case .string(let date)? = field(day, "date"), isIsoDate(date) else {
            throw WidgetPayloadError.invalid("Ogiltigt datum")
        }
        // Samma ordning som på Android, så att samma fel ger samma meddelande.
        let energyText = try optionalText(field(day, "energyText"), "Ogiltig energitext")
        let energyDetail = try optionalText(field(day, "energyDetail"), "Ogiltig energidetalj")
        let energyPermille = try permille(field(day, "energyPermille"), "Ogiltigt energiförlopp")
        let mealsText = try requireText(field(day, "mealsText"), "Ogiltig måltidstext")
        let waterText = try optionalText(field(day, "waterText"), "Ogiltig vattentext")
        let waterPermille = try permille(field(day, "waterPermille"), "Ogiltigt vattenförlopp")
        return Day(
            date: date,
            energyText: energyText,
            energyDetail: energyDetail,
            energyPermille: energyPermille,
            mealsText: mealsText,
            waterText: waterText,
            waterPermille: waterPermille
        )
    }

    private static func parseFasting(_ raw: JSONNode) throws -> Fasting {
        let fasting = try object(raw, "Fastan är inget objekt")
        guard let startedAt = wholeNumber(field(fasting, "startedAt")), startedAt > 0 else {
            throw WidgetPayloadError.invalid("Ogiltig starttid för fastan")
        }
        let label = try requireText(field(fasting, "label"), "Ogiltig text för fastan")
        let targetText = try optionalText(field(fasting, "targetText"), "Ogiltigt mål för fastan")
        return Fasting(startedAt: startedAt, label: label, targetText: targetText)
    }

    /// Fältet `key`, eller nil när det saknas eller är null (som Map.get på Android).
    private static func field(_ map: [String: JSONNode], _ key: String) -> JSONNode? {
        guard let value = map[key] else { return nil }
        if case .null = value { return nil }
        return value
    }

    private static func object(_ value: JSONNode?, _ message: String) throws -> [String: JSONNode] {
        guard case .object(let members)? = value else {
            throw WidgetPayloadError.invalid(message)
        }
        return members
    }

    /// Ett heltal: ett tal utan decimaler och exponent, eller ett decimaltal som är ett helt tal
    /// med högst 53 bitar (som isWhole på Android). nil annars.
    private static func wholeNumber(_ value: JSONNode?) -> Int64? {
        switch value {
        case .integer(let number)?:
            return number
        case .double(let number)?:
            guard number.isFinite, number.rounded(.towardZero) == number, abs(number) < 9.007199254740992e15 else {
                return nil
            }
            return Int64(number)
        default:
            return nil
        }
    }

    /// Ett förlopp: saknas det döljs stapeln; ett ändligt tal avrundas och begränsas till -1 eller 0–1000.
    private static func permille(_ value: JSONNode?, _ message: String) throws -> Int {
        guard let value = value else { return permilleHidden }
        let number: Double
        switch value {
        case .integer(let whole):
            number = Double(whole)
        case .double(let fraction):
            number = fraction
        default:
            throw WidgetPayloadError.invalid(message)
        }
        guard number.isFinite else { throw WidgetPayloadError.invalid(message) }
        let rounded = roundHalfUp(max(-1.0, min(Double(permilleMax), number)))
        return clampPermille(Int64(rounded))
    }

    /// En text på högst `maxText` UTF-16-enheter (som String.length() på Android).
    private static func requireText(_ value: JSONNode?, _ message: String) throws -> String {
        guard case .string(let text)? = value, text.utf16.count <= maxText else {
            throw WidgetPayloadError.invalid(message)
        }
        return text
    }

    private static func optionalText(_ value: JSONNode?, _ message: String) throws -> String? {
        guard let value = value else { return nil }
        return try requireText(value, message)
    }
}

// MARK: - JSON

/// Ett tolkat JSON-värde – motsvarar Map/List/String/Number/Boolean/null på Android.
private enum JSONNode {
    case object([String: JSONNode])
    case array([JSONNode])
    case string(String)
    /// Ett tal utan decimaler och exponent som ryms i 64 bitar (Integer/Long i org.json).
    case integer(Int64)
    /// Övriga tal (Double i org.json).
    case double(Double)
    case bool(Bool)
    case null
}

/// En strikt JSON-tolkare (RFC 8259) för widgetens lilla text. Djupet är redan kontrollerat
/// (`checkText`), så rekursionen är begränsad. Allt som inte är giltig JSON ger samma fasta fel.
private struct JSONParser {
    private static let syntaxError = WidgetPayloadError.invalid("Widgetdatan är inte giltig JSON")

    private let bytes: [UInt8]
    private var position = 0

    init(_ text: String) {
        bytes = Array(text.utf8)
    }

    /// Hela texten: ett värde med bara blanktecken runt omkring.
    mutating func parseDocument() throws -> JSONNode {
        skipWhitespace()
        let value = try parseValue()
        skipWhitespace()
        guard position == bytes.count else { throw JSONParser.syntaxError }
        return value
    }

    private var current: UInt8? {
        return position < bytes.count ? bytes[position] : nil
    }

    private static func isDigit(_ byte: UInt8) -> Bool {
        return byte >= 0x30 && byte <= 0x39
    }

    private mutating func skipWhitespace() {
        // Mellanslag, tabb, radmatning och vagnretur.
        while let byte = current, byte == 0x20 || byte == 0x09 || byte == 0x0A || byte == 0x0D {
            position += 1
        }
    }

    private mutating func skipDigits() {
        while let byte = current, JSONParser.isDigit(byte) {
            position += 1
        }
    }

    private mutating func parseValue() throws -> JSONNode {
        guard let byte = current else { throw JSONParser.syntaxError }
        switch byte {
        case 0x7B: // {
            return try parseObject()
        case 0x5B: // [
            return try parseArray()
        case 0x22: // "
            return .string(try parseString())
        case 0x74: // t
            try expectLiteral("true")
            return .bool(true)
        case 0x66: // f
            try expectLiteral("false")
            return .bool(false)
        case 0x6E: // n
            try expectLiteral("null")
            return .null
        case 0x2D, 0x30...0x39: // - och 0–9
            return try parseNumber()
        default:
            throw JSONParser.syntaxError
        }
    }

    private mutating func expectLiteral(_ literal: String) throws {
        for expected in literal.utf8 {
            guard current == expected else { throw JSONParser.syntaxError }
            position += 1
        }
    }

    private mutating func parseObject() throws -> JSONNode {
        position += 1 // {
        var members: [String: JSONNode] = [:]
        skipWhitespace()
        if current == 0x7D {
            position += 1
            return .object(members)
        }
        while true {
            skipWhitespace()
            guard current == 0x22 else { throw JSONParser.syntaxError }
            let key = try parseString()
            skipWhitespace()
            guard current == 0x3A else { throw JSONParser.syntaxError } // :
            position += 1
            skipWhitespace()
            let value = try parseValue()
            // org.json godtar inga oändliga tal i ett objekt (JSONObject.put → checkDouble).
            if case .double(let number) = value, !number.isFinite {
                throw JSONParser.syntaxError
            }
            // Vid dubbletter gäller den sista, som i org.json.
            members[key] = value
            skipWhitespace()
            guard let separator = current else { throw JSONParser.syntaxError }
            position += 1
            if separator == 0x7D { return .object(members) } // }
            guard separator == 0x2C else { throw JSONParser.syntaxError } // ,
        }
    }

    private mutating func parseArray() throws -> JSONNode {
        position += 1 // [
        var elements: [JSONNode] = []
        skipWhitespace()
        if current == 0x5D {
            position += 1
            return .array(elements)
        }
        while true {
            skipWhitespace()
            elements.append(try parseValue())
            skipWhitespace()
            guard let separator = current else { throw JSONParser.syntaxError }
            position += 1
            if separator == 0x5D { return .array(elements) } // ]
            guard separator == 0x2C else { throw JSONParser.syntaxError } // ,
        }
    }

    private mutating func parseString() throws -> String {
        position += 1 // "
        var buffer: [UInt8] = []
        while true {
            guard let byte = current else { throw JSONParser.syntaxError }
            position += 1
            switch byte {
            case 0x22: // "
                // Texten kommer från en Swift-sträng (giltig UTF-8) och escape-sekvenserna läggs
                // till som giltig UTF-8 – avkodningen ersätter aldrig något.
                return String(decoding: buffer, as: UTF8.self)
            case 0x5C: // \
                try parseEscape(into: &buffer)
            case 0x00...0x1F:
                // Styrtecken måste skrivas som escape-sekvenser i JSON.
                throw JSONParser.syntaxError
            default:
                buffer.append(byte)
            }
        }
    }

    private mutating func parseEscape(into buffer: inout [UInt8]) throws {
        guard let byte = current else { throw JSONParser.syntaxError }
        position += 1
        switch byte {
        case 0x22, 0x5C, 0x2F: // \" \\ \/
            buffer.append(byte)
        case 0x62: // \b
            buffer.append(0x08)
        case 0x66: // \f
            buffer.append(0x0C)
        case 0x6E: // \n
            buffer.append(0x0A)
        case 0x72: // \r
            buffer.append(0x0D)
        case 0x74: // \t
            buffer.append(0x09)
        case 0x75: // \uXXXX
            let unit = try parseHex4()
            if unit >= 0xD800 && unit <= 0xDBFF {
                // Ett surrogatpar blir ett tecken. Ett ensamt surrogat (som Java godtar men en
                // Swift-sträng inte kan innehålla) blir U+FFFD – också en UTF-16-enhet, så längden
                // räknas som på Android.
                if current == 0x5C, position + 1 < bytes.count, bytes[position + 1] == 0x75 {
                    let saved = position
                    position += 2
                    let low = try parseHex4()
                    if low >= 0xDC00 && low <= 0xDFFF {
                        JSONParser.appendUTF8(0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00), to: &buffer)
                        return
                    }
                    // Inget lågt surrogat: nästa escape-sekvens tolkas för sig.
                    position = saved
                }
                JSONParser.appendUTF8(0xFFFD, to: &buffer)
            } else if unit >= 0xDC00 && unit <= 0xDFFF {
                JSONParser.appendUTF8(0xFFFD, to: &buffer)
            } else {
                JSONParser.appendUTF8(unit, to: &buffer)
            }
        default:
            throw JSONParser.syntaxError
        }
    }

    private mutating func parseHex4() throws -> UInt32 {
        var value: UInt32 = 0
        for _ in 0..<4 {
            guard let byte = current else { throw JSONParser.syntaxError }
            let digit: UInt32
            switch byte {
            case 0x30...0x39:
                digit = UInt32(byte - 0x30)
            case 0x41...0x46:
                digit = UInt32(byte - 0x41) + 10
            case 0x61...0x66:
                digit = UInt32(byte - 0x61) + 10
            default:
                throw JSONParser.syntaxError
            }
            value = value * 16 + digit
            position += 1
        }
        return value
    }

    /// Kodpunkten `scalar` (aldrig ett surrogat) som UTF-8.
    private static func appendUTF8(_ scalar: UInt32, to buffer: inout [UInt8]) {
        if scalar < 0x80 {
            buffer.append(UInt8(scalar))
        } else if scalar < 0x800 {
            buffer.append(UInt8(0xC0 | (scalar >> 6)))
            buffer.append(UInt8(0x80 | (scalar & 0x3F)))
        } else if scalar < 0x10000 {
            buffer.append(UInt8(0xE0 | (scalar >> 12)))
            buffer.append(UInt8(0x80 | ((scalar >> 6) & 0x3F)))
            buffer.append(UInt8(0x80 | (scalar & 0x3F)))
        } else {
            buffer.append(UInt8(0xF0 | (scalar >> 18)))
            buffer.append(UInt8(0x80 | ((scalar >> 12) & 0x3F)))
            buffer.append(UInt8(0x80 | ((scalar >> 6) & 0x3F)))
            buffer.append(UInt8(0x80 | (scalar & 0x3F)))
        }
    }

    /// Ett tal enligt JSON: -?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)? – inga inledande nollor,
    /// inget +, ingen ensam punkt. Heltal som ryms i 64 bitar blir `integer`, allt annat `double`
    /// (som org.json: Integer/Long, annars Double).
    private mutating func parseNumber() throws -> JSONNode {
        let start = position
        var isInteger = true
        if current == 0x2D { position += 1 } // -
        guard let first = current, JSONParser.isDigit(first) else { throw JSONParser.syntaxError }
        position += 1
        if first != 0x30 { skipDigits() }
        if current == 0x2E { // .
            isInteger = false
            position += 1
            guard let digit = current, JSONParser.isDigit(digit) else { throw JSONParser.syntaxError }
            skipDigits()
        }
        if current == 0x65 || current == 0x45 { // e E
            isInteger = false
            position += 1
            if current == 0x2B || current == 0x2D { position += 1 } // + -
            guard let digit = current, JSONParser.isDigit(digit) else { throw JSONParser.syntaxError }
            skipDigits()
        }
        let literal = String(decoding: bytes[start..<position], as: UTF8.self)
        if isInteger, let whole = Int64(literal) {
            return .integer(whole)
        }
        return .double(JSONParser.double(literal))
    }

    /// Talet som Double, som Javas Double.valueOf: ett tal som är för stort för en Double blir
    /// ±oändligt och ett som är för litet blir 0 – oavsett om plattformens Double(_:) ger nil eller
    /// ett värde för tal utanför området.
    private static func double(_ literal: String) -> Double {
        if let value = Double(literal) { return value }
        let negative = literal.hasPrefix("-")
        if decimalMagnitude(literal) > 0 {
            return negative ? -Double.infinity : Double.infinity
        }
        return negative ? -0.0 : 0.0
    }

    /// Ungefär hur många siffror talet har före decimaltecknet (negativt för tal under 1), med
    /// exponenten inräknad. Int.min för noll. Används bara för tal som Double(_:) inte kunde läsa.
    private static func decimalMagnitude(_ literal: String) -> Int {
        var mantissa = Substring(literal)
        var exponent = 0
        if let marker = mantissa.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            let digits = mantissa[mantissa.index(after: marker)...]
            exponent = Int(digits) ?? (digits.hasPrefix("-") ? -1_000_000 : 1_000_000)
            mantissa = mantissa[..<marker]
        }
        exponent = max(-1_000_000, min(1_000_000, exponent))
        var integerDigits = 0
        var leadingFractionZeros = 0
        var seenNonZero = false
        var inFraction = false
        for character in mantissa {
            if character == "-" { continue }
            if character == "." {
                inFraction = true
                continue
            }
            if !seenNonZero && character == "0" {
                if inFraction { leadingFractionZeros += 1 }
                continue
            }
            seenNonZero = true
            if !inFraction { integerDigits += 1 }
        }
        if !seenNonZero { return Int.min }
        return (integerDigits > 0 ? integerDigits : -leadingFractionZeros) + exponent
    }
}
