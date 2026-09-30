// Widgetens utseende i SwiftUI – samma innehåll och ordning som Android-widgetens
// res/layout/lagom_widget.xml: rubrikraden ("Idag" eller "Lagom", och knappen "Lägg till" i
// systemMedium och systemLarge), energitexten, energidetaljen, energistapeln och sedan valfria rader
// (måltider, vatten och fastan med en räknare som går av sig själv).
//
// - Vad som visas bestäms av WidgetContent.swift; här ritas det bara. All text kommer färdig från
//   appen och visas som den är (Text(verbatim:) – ingen översättning och ingen formatering).
// - Valfria rader som inte får plats (liten widget, stor textstorlek) tas bort i
//   prioritetsordning med ViewThatFits: energidetaljen, måltider, fasta och vatten – en rad visas
//   hel eller inte alls, som på Android.
// - Färgerna kommer bara från widgetens asset-katalog (ljust och mörkt läge, samma som Android-
//   widgetens values/widget_colors.xml). Staplarna har alltid samma neutrala färg, även över
//   målet – inga röda varningar.
// - Siffrorna (energi, måltider, vatten och fastan) och staplarna är markerade som känsliga, så att
//   systemet kan dölja dem när telefonen är låst. Staplarna är dekor för VoiceOver – texten bredvid
//   säger samma sak.

import SwiftUI
import WidgetKit

struct TodayWidgetView: View {
    let entry: TodayEntry

    @Environment(\.widgetFamily) private var family

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            WidgetHeader(title: entry.content.title, showsAdd: family != .systemSmall && entry.content.showsAdd)
            switch entry.content {
            case .noData:
                FallbackText(text: WidgetText.fallbackDefault)
            case .message(let text, _):
                FallbackText(text: text)
            case .today(let today):
                TodayRows(today: today, family: family)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) {
            Color("WidgetBackground")
        }
        // Hela widgeten öppnar Idag; knappen (en Link) öppnar Lägg till.
        .widgetURL(LagomWidgetShared.todayURL)
    }
}

// MARK: - Rubrikraden

/// "IDAG" (eller "LAGOM") och knappen "Lägg till".
private struct WidgetHeader: View {
    let title: String
    let showsAdd: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(verbatim: title)
                .font(.caption.weight(.semibold))
                .tracking(0.8)
                .textCase(.uppercase)
                .foregroundStyle(Color("Gran"))
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            if showsAdd {
                AddButton()
            }
        }
    }
}

/// Knappen "Lägg till": en grön kapsel i en tryckyta som är minst 44 punkter hög.
private struct AddButton: View {
    var body: some View {
        Link(destination: LagomWidgetShared.addURL) {
            HStack(spacing: 4) {
                Image(systemName: "plus")
                    .font(.footnote.weight(.bold))
                Text(verbatim: WidgetText.add)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(Color("OnGran"))
            .padding(.leading, 12)
            .padding(.trailing, 14)
            .frame(minHeight: 36)
            .background {
                Capsule()
                    .fill(Color("Gran"))
                    .widgetAccentable()
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(verbatim: WidgetText.addDescription))
    }
}

// MARK: - Reservtexten

/// En rad i stället för siffrorna: ingen data än, ingen profil, exempeldata eller ingen dag för idag.
private struct FallbackText: View {
    let text: String

    var body: some View {
        Text(verbatim: text)
            .font(.subheadline)
            .foregroundStyle(Color("Ink2"))
            .lineLimit(4)
            .minimumScaleFactor(0.85)
    }
}

// MARK: - Dagens siffror

/// Dagens rad med så många valfria rader som får plats – den första varianten som ryms visas.
private struct TodayRows: View {
    let today: WidgetContent.Today
    let family: WidgetFamily

    var body: some View {
        // WidgetContent.maxRows (4) valfria rader och nedåt; den sista varianten (inga valfria
        // rader) visas om ingen annan får plats.
        ViewThatFits(in: .vertical) {
            DayColumn(today: today.limited(to: 4), family: family)
            DayColumn(today: today.limited(to: 3), family: family)
            DayColumn(today: today.limited(to: 2), family: family)
            DayColumn(today: today.limited(to: 1), family: family)
            DayColumn(today: today.limited(to: 0), family: family)
        }
    }
}

/// En variant av dagens rad: energi, detalj, stapel, måltider, vatten och fasta (det som finns).
private struct DayColumn: View {
    let today: WidgetContent.Today
    let family: WidgetFamily

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if today.energyText != nil || today.energyDetail != nil {
                EnergyText(energyText: today.energyText, energyDetail: today.energyDetail, family: family)
            }
            if today.energyPermille >= 0 {
                ProgressBar(permille: today.energyPermille, color: Color("Gran"), height: 6)
                    .privacySensitive()
                    .padding(.top, 8)
            }
            if let meals = today.mealsText {
                Text(verbatim: meals)
                    .font(.footnote)
                    .foregroundStyle(Color("Ink2"))
                    .lineLimit(1)
                    .privacySensitive()
                    .padding(.top, 4)
            }
            if let water = today.waterText {
                WaterRow(text: water, permille: today.waterPermille)
                    .padding(.top, 4)
            }
            if let fasting = today.fasting {
                FastingRow(fasting: fasting)
                    .padding(.top, 4)
            }
        }
    }
}

/// "1 240 kcal kvar" (stor, serif) och "760 av 2 000 kcal" – ett element för VoiceOver.
private struct EnergyText: View {
    let energyText: String?
    let energyDetail: String?
    let family: WidgetFamily

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let energy = energyText {
                Text(verbatim: energy)
                    .font(.system(energyStyle, design: .serif).weight(.bold))
                    .foregroundStyle(Color("Ink"))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .privacySensitive()
            }
            if let detail = energyDetail {
                Text(verbatim: detail)
                    .font(.footnote)
                    .foregroundStyle(Color("Ink2"))
                    .lineLimit(1)
                    .privacySensitive()
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Serif och fet som Android-widgetens energitext – något mindre i den lilla widgeten.
    private var energyStyle: Font.TextStyle {
        return family == .systemSmall ? .title3 : .title2
    }
}

/// Vattnet: ikonen, "0,75 av 2 l" och en liten stapel. VoiceOver: "Vatten, 0,75 av 2 l".
private struct WaterRow: View {
    let text: String
    let permille: Int

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "drop.fill")
                .font(.caption2)
                .foregroundStyle(Color("Fjall"))
            Text(verbatim: text)
                .font(.footnote)
                .foregroundStyle(Color("Ink2"))
                .lineLimit(1)
                .privacySensitive()
                .frame(maxWidth: .infinity, alignment: .leading)
            if permille >= 0 {
                ProgressBar(permille: permille, color: Color("Fjall"), height: 4)
                    .privacySensitive()
                    .frame(width: 56)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "\(WidgetText.waterDescription), \(text)"))
    }
}

/// Fastan: ikonen (beskrivs med appens text, "Fasta pågår"), "Fastat 14:03:22" som räknar upp av
/// sig själv och målet ("Mål 16 h").
private struct FastingRow: View {
    let fasting: WidgetContent.Fasting

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "timer")
                .font(.caption2)
                .foregroundStyle(Color("Ink2"))
                .accessibilityLabel(Text(verbatim: fasting.label))
            timerText
                .font(.footnote)
                .monospacedDigit()
                .foregroundStyle(Color("Ink2"))
                .lineLimit(1)
                .multilineTextAlignment(.leading)
        }
        .privacySensitive()
        .accessibilityElement(children: .combine)
    }

    /// "Fastat 14:03:22 · Mål 16 h" i en enda text, så att räknaren inte tar hela radens bredd.
    /// Räknaren (Text.DateStyle.timer) går av sig själv utan nya poster i tidslinjen.
    private var timerText: Text {
        let elapsed: LocalizedStringKey = "\(WidgetText.fastingElapsed) \(fasting.startedAt, style: .timer)"
        guard let target = fasting.targetText else { return Text(elapsed) }
        let targetText: Text = Text(verbatim: target).foregroundStyle(Color("Ink3"))
        let combined: LocalizedStringKey = "\(Text(elapsed)) · \(targetText)"
        return Text(combined)
    }
}

// MARK: - Stapeln

/// En stapel med 0–1000 promille på ett ljust spår, med rundade ändar. Dekor: dold för VoiceOver
/// (texten säger samma sak). När systemet döljer känsligt innehåll (låst telefon, platshållaren)
/// visas bara spåret.
private struct ProgressBar: View {
    let permille: Int
    let color: Color
    let height: CGFloat

    @Environment(\.redactionReasons) private var redactionReasons

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color("Track"))
                if redactionReasons.isEmpty {
                    Capsule()
                        .fill(color)
                        .frame(width: proxy.size.width * CGFloat(min(max(permille, 0), 1000)) / 1000)
                        .widgetAccentable()
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}
