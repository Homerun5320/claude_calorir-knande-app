# Widgeten på hemskärmen

Lagoms widget **Idag** visar en kort sammanfattning av dagen på telefonens hemskärm: hur mycket
energi som är kvar av dagsmålet, hur många måltider som är loggade, vatten och en pågående fasta –
och en knapp, **Lägg till**, som öppnar appen direkt på Lägg till mat.

> **Läget (2026-09-30):** Android-widgeten finns i repot – appens egen kod i `android/`, JS-sidan i
> `src/native/widget.ts` och `src/lib/widgetSummary.ts`. Den byggs i molnbygget men är inte provad
> på en riktig telefon ännu ([avsnitt 7](#7-testa-på-en-telefon)). **iPhone-widgeten finns i koden
> men är avslagen** tills App Group finns i ägarens Apple-konto: målet `LagomWidgetExtension` byggs
> i kontrollbygget men bäddas inte in i appen, och `WIDGET_IOS_READY` i `src/native/widget.ts` är
> `false` – på iPhone gör modulen ingenting. Den slås på med `node scripts/ios-widget.mjs enable`
> ([avsnitt 8](#8-iphone--planen)).

Inga nya paket och inga nya behörigheter: tillägget `LagomWidget` är appens egen kod (inget
npm-paket, inga Gradle-beroenden utöver det Capacitor redan har), och Data safety är oförändrad
eftersom inget lämnar telefonen.

## Innehåll

1. [Vad widgeten visar](#1-vad-widgeten-visar)
2. [Så hänger det ihop](#2-så-hänger-det-ihop)
3. [Kontraktet](#3-kontraktet)
4. [När widgeten uppdateras](#4-när-widgeten-uppdateras)
5. [Integritet](#5-integritet)
6. [Filerna](#6-filerna)
7. [Testa på en telefon](#7-testa-på-en-telefon)
8. [iPhone – planen](#8-iphone--planen)
9. [Ändra widgeten](#9-ändra-widgeten)

---

## 1. Vad widgeten visar

Widgeten heter **Idag** och ligger under **Lagom** i hemskärmens lista över widgetar ("Dagens
energi, måltider och vatten – och en knapp för att lägga till."). Den är 4 × 2 rutor från början och
kan göras större eller mindre, ned till 2 × 2.

```
┌─────────────────────────────────────────┐
│ Idag                    [ + Lägg till ] │
│ 1 150 kcal kvar                         │
│ ████████████░░░░░░░░░░░░░               │
│ 1 110 av 2 260 kcal                     │
│ 3 måltider loggade                      │
│ 1,25 av 1,6 l  ██████████░░             │
│ Fastat 16:05:12 · Mål 16 h              │
└─────────────────────────────────────────┘
```

- **Rubrikraden:** "Idag" och knappen "Lägg till" (en rund ikon när widgeten är smal).
- **Energin:** stor text ("1 150 kcal kvar", "300 kcal över – helt okej" eller "Precis lagom idag"
  inom ±3 %) och en stapel mot dagens mål. Samma siffror och ord som dagsringen på Idag – med
  träningen tillagd med användarens andel, veckobudgetens mål för just den dagen och avrundning i
  kcal eller kJ. Över målet står det neutralt, aldrig en varning eller röd färg.
- **Valfria rader** i prioritetsordning, så många som får plats: energidetaljen ("1 110 av
  2 260 kcal"), måltiderna ("3 måltider loggade", "Inget loggat än"), fastan (räknar upp av sig
  själv) och vattnet ("1,25 av 1,6 l" med en stapel). På 2 × 2 visas bara energin och stapeln.
  Hur många rader som får plats beror också på telefonens textstorlek. Från Android 12 skickar
  widgeten en färdig variant per storlek (`RemoteViews` per bredd och höjd), så att hemskärmen
  väljer rätt direkt när widgeten ändrar storlek; äldre Android ritas om efter den nya storleken.
- **Färger:** designsystemets tokens (bakgrund, text, gran, fjäll) i ljust och mörkt läge
  (`values/widget_colors.xml`, `values-night/`), rundade hörn efter systemet från Android 12.

| Läge | Rubrik | Visas | "Lägg till" |
| --- | --- | --- | --- |
| Dagens siffror (`state` `ok` och en dag med telefonens datum) | Idag | Energi, stapel och raderna ovan | Ja |
| **Medvetet läge** | Idag | Inga energisiffror och ingen energistapel – bara måltider, vatten och fasta (som på Idag) | Ja |
| Ingen dag med dagens datum (appen har inte öppnats på en vecka, eller klockan har ställts om) | Lagom | "Öppna Lagom för dagens siffror" | Ja |
| Ingen data alls (nyinstallerad, efter "Radera all data", eller oläslig data) | Lagom | "Öppna Lagom för dagens siffror" (widgetens egen text) | Ja |
| Ingen profil ännu (`noProfile`) | Lagom | "Skapa din profil i Lagom" | Nej |
| Exempeldata (`demo`) | Lagom | "Widgeten visar inte exempeldata" | Nej |

Ett tryck på widgeten öppnar **Idag**, knappen öppnar **Lägg till mat**. Välkomstflödet och spärren
(AccessGate) gäller som vanligt: utan profil öppnas välkomstflödet, och efter provperioden utan
licens visas spärren i stället för Lägg till mat.

## 2. Så hänger det ihop

```
Butikerna (dagbok, profil, vikter, fasta, exempelmarkering)
   │  ändring → 1,5 s
   ▼
buildWidgetPayload()          src/lib/widgetSummary.ts – ren funktion, all text på svenska
   │  JSON (WidgetPayload v1)
   ▼
LagomWidget.update({ data })  src/native/widget.ts → Capacitor-bryggan
   │
   ▼
LagomWidgetPlugin (Java)      kontrollerar, sparar i SharedPreferences "lagom-widget"
   │  refreshAll()
   ▼
LagomWidgetProvider           väljer dagens rad, ritar RemoteViews – hemskärmen visar dem
   │  tryck
   ▼
MainActivity (lagom-widget://idag | lagom-widget://lagg-till) → "/" eller "/lagg-till"
```

- **JS-sidan** (`src/native/widget.ts`) laddas bara via `loadNative('widget')` och startas sist i
  `src/native/init.ts` (väntas inte in). Den finns inte i webbygget.
- **Sammanfattningen** byggs av `buildWidgetPayload(input, now)` ur butikernas tillstånd. Den
  räknar varje dag med dess eget mål (`targetsFor`, veckobudgeten) och formaterar allt med
  `src/lib/format.ts` – widgeten formaterar aldrig tal själv.
- **Widgeten** (`android/app/src/main/java/se/lagomappen/lagom/widget/`) tar emot texten, väljer
  raden för telefonens lokala datum och ritar den. Allt om Android-projektet:
  [NATIVE.md §6](NATIVE.md#hemskärmswidgeten).
- **"Radera all data"** anropar `clearWidget()` via `clearNativeCopies` i
  `src/features/settings/wipe.ts` – alltid, även när bara exempeldata raderas. En väntande
  uppdatering avbryts, så att widgeten inte fylls igen av själva raderingen.

## 3. Kontraktet

Båda sidor följer det här exakt. Ändras något: se [avsnitt 9](#9-ändra-widgeten).

### Tillägget `LagomWidget`

Registreras i Android-appen själv (`MainActivity.onCreate`, före `super.onCreate`) och i
iPhone-appen i `LagomBridgeViewController.capacitorDidLoad()` (anropas inte förrän widgeten är
påslagen, [avsnitt 8](#8-iphone--planen)). JS: `registerPlugin<LagomWidgetPlugin>('LagomWidget')` –
bara i `src/native/widget.ts`.

| Metod | Vad |
| --- | --- |
| `update({ data: string }): Promise<void>` | `data` är JSON-texten för `WidgetPayload` version 1, högst **32 768 tecken**. Ogiltig eller för stor data avvisas med `call.reject` (koderna `INVALID`, `TOO_LARGE`, `STORAGE`, `FAILED`, fasta meddelanden utan innehåll) – **den förra datan ligger kvar**. Annars sparas texten i SharedPreferences-filen `lagom-widget`, nyckeln `payload`, och alla placerade widgetar ritas om. |
| `clear(): Promise<void>` | Tar bort den sparade datan och ritar om alla widgetar – de visar då läget utan data. |

### `WidgetPayload` version 1

```jsonc
{
  "v": 1,
  "generatedAt": 1790777100000,         // epoch ms
  "state": "ok",                        // "ok" | "noProfile" | "demo"
  "mindful": false,
  "fallbackText": "Öppna Lagom för dagens siffror",  // visas när ingen dag har dagens datum, eller state inte är "ok"
  "days": [                             // idag först, sedan de sex följande lokala datumen; tom när state inte är "ok"
    {
      "date": "2026-09-30",             // 'YYYY-MM-DD', lokalt datum
      "energyText": "1 150 kcal kvar",  // null i medvetet läge
      "energyDetail": "1 110 av 2 260 kcal",   // null i medvetet läge
      "energyPermille": 491,            // 0–1000 mot dagens mål (högst 1000); -1 = ingen stapel (medvetet läge)
      "mealsText": "3 måltider loggade",
      "waterText": "1,25 av 1,6 l",     // null = dölj vattnet
      "waterPermille": 781              // 0–1000; -1 = ingen stapel
    }
    // … 2026-10-01 till 2026-10-06
  ],
  "fasting": { "startedAt": 1790712000000, "label": "Fasta pågår", "targetText": "Mål 16 h" }  // eller null
}
```

- **All text är färdigformaterad på svenska** av JS med `src/lib/format.ts`. Tusentalsavgränsare
  och mellanrummet i "1,6 l" är hårda blanksteg (U+00A0; i exemplet ovan står vanliga) – widgeten
  visar dem som de är och tar aldrig bort dem.
- **Exempeldata och ingen profil:** `state` `demo` respektive `noProfile`, `days` tom,
  `fasting` null och bara `fallbackText` ("Widgeten visar inte exempeldata", "Skapa din profil i
  Lagom").
- **Medvetet läge:** `energyText` och `energyDetail` är null och `energyPermille` −1. Widgeten
  döljer ändå alltid energisiffrorna när `mindful` är true, oavsett vad dagarna innehåller.
- **Fastan:** `startedAt` är ett heltal större än 0 (annars utelämnar JS fastan – en ogiltig fasta
  skulle annars få widgeten att avvisa hela datan). Widgeten räknar själv upp tiden.
- **Widgetens kontroll** (`WidgetPayload.java`, `WidgetJson.java`; på iPhone `WidgetPayload.swift`
  med samma regler): `v` måste vara 1, texterna högst 200 tecken (UTF-16-enheter), högst 31 dagar,
  giltiga datum, högst 8 nivåer djup. **Okända fält godtas och ignoreras**, så att ett nytt valfritt
  fält inte får en äldre widget att sluta fungera.
- En hel sammanfattning är i praktiken under 4 096 tecken, även efter ett års dagbok.

### Länkarna från widgeten

- Ett tryck på widgeten: en **uttrycklig** Intent till `MainActivity` med `ACTION_VIEW` och
  `lagom-widget://idag`. Knappen "Lägg till": samma med `lagom-widget://lagg-till`.
- **Ingen intent-filter** läggs till för `lagom-widget://`. `MainActivity` är ändå exporterad (den
  är startaktiviteten), så en annan app kan också starta den med en sådan länk. Därför leder bara
  de två länkarna någonstans – och bara till sidor som man ändå når i appen.
- Capacitors App-tillägg lämnar dem som `appUrlOpen` (appen körs, `singleTask` → `onNewIntent`)
  och via `App.getLaunchUrl()` (kallstart). JS följer **bara** de två: `lagom-widget://idag` → `/`
  och `lagom-widget://lagg-till` → `/lagg-till` (hash-routerns sökvägar i `src/App.tsx`). Allt
  annat ignoreras.
- **Vid en kallstart kommer länken två vägar:** `App.getLaunchUrl()` och en sparad `appUrlOpen`
  (`BridgeActivity` skickar start-Intent:en till `onNewIntent`). Att öppna sidan är idempotent.
- **Länken följs en gång.** Capacitor läser start-Intent:en bara när aktiviteten skapas, och
  `App.getLaunchUrl()` ger den sedan så länge aktiviteten lever:
  - *Omladdning i samma aktivitet* ("Ladda om" på felsidan, eller en omladdning
    efter `vite:preloadError`): JS läser startlänken bara vid sidans första laddning (`pageWasReloaded()`
    i `src/native/widget.ts` läser navigeringens typ – ingen egen lagring).
  - *Aktiviteten återskapas med sin gamla Intent* – från Senaste efter att processen har avslutats
    (`FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`) eller ur sparat tillstånd: `MainActivity` tar bort
    widgetlänken ur Intent:en före `super.onCreate` (`WidgetLinks.isReplayedLink`), så att bryggan
    aldrig ser den. Lägg till öppnas alltså inte igen, långt efter trycket på widgeten.
  - Ett nytt tryck på widgeten kommer via `onNewIntent` (`appUrlOpen`) och påverkas inte av något
    av det.

## 4. När widgeten uppdateras

**Appen skickar** en ny sammanfattning

- en gång när den startar (när butikerna har lästs in),
- 1,5 s efter den senaste ändringen i dagboken, profilen och inställningarna, vikterna, fastan
  eller exempelmarkeringen (flera ändringar i rad blir en uppdatering),
- direkt när appen öppnas igen (datumet kan ha bytts, och Health Connect kan ha fyllt i något),
- direkt när appen går till bakgrunden, om en ändring väntar.

Samma innehåll skickas aldrig två gånger i rad (tidsstämpeln räknas inte). Inget skickas innan
butikerna har lästs in eller medan lagringen bara finns i minnet (`isMemoryOnlyStorage()`, t.ex.
data från en nyare version eller en skrivning som misslyckades) – då ligger den senaste hela
sammanfattningen kvar.

**Widgeten ritas om** när appen skickar ny data, när den läggs till eller ändrar storlek, var
30:e minut (`updatePeriodMillis`, systemets minsta intervall) och efter lokal midnatt med ett
inexakt alarm med ett fönster på 10 minuter (`AlarmManager.setWindow`, RTC – inget exakt alarm, ingen
behörighet): nästa dags rad visas senast cirka 00:11, eller när telefonen vaknar om den sover då. Eftersom datan har sju dagar visar widgeten nästa dags rad ("Inget loggat än" och
dagens mål) även om appen inte har öppnats. Har den inte öppnats på en vecka visas "Öppna Lagom för
dagens siffror".

Att tänka på:

- Bara appen på **den här telefonen** uppdaterar widgeten – det som loggas på en annan enhet syns
  inte förrän det har förts över med en säkerhetskopia.
- Kommande dagars mål räknas när sammanfattningen byggs (med dåvarande vikt och veckobudget);
  öppnas appen räknas de om.
- Poster som redan finns i dagboken för en kommande dag räknas i "måltider loggade" för den dagen.

## 5. Integritet

- **Bara summor och antal:** energi (kvar, ätit, mål), antal måltider med något loggat, vatten och
  en pågående fasta. **Aldrig** namn på livsmedel, måltider eller recept, anteckningar, vikt eller
  hälsouppgifter som graviditet eller allergier.
- **Medvetet läge:** inga energisiffror och ingen energistapel – både i datan och i widgeten.
- **Aldrig exempeldata.**
- **Var:** SharedPreferences-filen `lagom-widget` (`MODE_PRIVATE`) i appens egen lagring. Den
  följer inte med i Googles säkerhetskopia i molnet (`data_extraction_rules.xml`, domänen
  `sharedpref`; äldre Android: `allowBackup="false"`). Vid överföring direkt till en ny telefon
  (kabel eller wifi när den ställs in) följer den med som appens övriga data (`device-transfer`,
  domänen `sharedpref`) och ersätts när appen startas där. Sammanfattningen sparas även när ingen
  widget är placerad – tillägget vet inte om någon är det – men den **visas bara om användaren
  själv lägger till widgeten**.
- **Synlighet:** widgeten finns bara på hemskärmen (`widgetCategory="home_screen"`, inte
  låsskärmen), men där kan alla som ser skärmen läsa den. Supportsidan säger det och hur man tar
  bort den eller slår på medvetet läge.
- **Inget lämnar telefonen:** hemskärmsappen ritar widgeten på telefonen (RemoteViews). Inget nät,
  inga behörigheter, ingen analys. Felloggen får bara fasta meddelanden (`native:widget`), och
  Android-sidan loggar aldrig innehållet.
- **Radering:** "Radera all data" tömmer den (`clearWidget()`), och den försvinner när appen
  avinstalleras.
- **Integritetspolicyn** (`src/features/legal/legalContent.ts`): en rad i lagringstabellen och ett
  stycke under "Din dagbok finns bara på din enhet" – i webbens och Google Play-appens text, **aldrig
  i `appStore`-varianten** (den får inte nämna Android, och iPhone har ingen widget). Data safety
  och App Privacy är oförändrade.

## 6. Filerna

| Fil | Vad |
| --- | --- |
| `src/lib/widgetSummary.ts` (+ `.test.ts`) | `buildWidgetPayload`, `serializeWidgetPayload`, `WIDGET_TEXT`, `WIDGET_MAX_CHARS`, `WIDGET_DAYS`. Dagsmålen kommer från `computeTargetsInfo` (`src/lib/targetsInfo.ts`), samma beräkning som `useTargets`; testet jämför dem med kroken för 13 datum och fyra fall |
| `src/native/widget.ts` (+ `.test.ts`) | Tillägget, uppdateringarna, länkarna (`pageWasReloaded()`), `clearWidget()`, `WIDGET_IOS_READY` |
| `src/native/widgetAndroid.test.ts` | Att JS och Android-sidan hänger ihop: länkarna mot `WidgetLinks.java`, 32 768 tecken mot `WidgetPayload.MAX_CHARS`, mottagaren i manifestet, `MainActivity` och JUnit-testerna i kontrollbygget |
| `src/native/index.ts`, `src/native/init.ts`, `src/features/settings/wipe.ts` | `MODULES.widget`, starten och raderingen |
| `android/app/src/main/java/se/lagomappen/lagom/MainActivity.java` | Registrerar `LagomWidgetPlugin` och tar bort en uppspelad widgetlänk (`dropReplayedWidgetLink`) – båda före `super.onCreate` |
| `android/app/src/main/java/se/lagomappen/lagom/widget/` | `LagomWidgetPlugin`, `LagomWidgetProvider`, `WidgetStore`, `WidgetPayload`, `WidgetJson`, `WidgetView`, `WidgetLayout`, `WidgetLinks` (länkarna och `isReplayedLink`) |
| `android/app/src/test/java/se/lagomappen/lagom/widget/` | JUnit-testerna för det som inte behöver Android – `WidgetPayloadTest`, `WidgetViewTest`, `WidgetLayoutTest`, `WidgetLinksTest` (`cd android && ./gradlew testDebugUnitTest`; kontrollbygget kör `:app:testDebugUnitTest`) |
| `android/app/src/main/res/` | `layout/lagom_widget.xml`, `layout/lagom_widget_preview.xml`, `xml/lagom_widget_info.xml`, `values/widget_colors.xml` (+ `values-night/`), `values/widget_dimens.xml`, `drawable/widget_*` (+ `drawable-v31/`), texterna i `values/strings.xml` |
| `android/app/src/main/AndroidManifest.xml` | `<receiver android:name=".widget.LagomWidgetProvider" android:exported="false">` |
| `ios/App/LagomWidget/`, `ios/App/App/LagomWidgetPlugin.swift`, `ios/App/LagomWidgetTests/`, `scripts/ios-widget.mjs` | iPhone-widgeten (avslagen) – se [avsnitt 8](#8-iphone--planen) |

## 7. Testa på en telefon

Hämta test-APK:n från kontrollbygget (`.github/workflows/native.yml`, artefakten
`lagom-android-testbygge`) och installera den (`adb install -r app-debug.apk`, eller öppna filen
på telefonen och tillåt installation från okända källor). Prova:

1. **Före appen:** lägg till widgeten (håll fingret på hemskärmen → Widgetar → Lagom → Idag). Den
   visar "Öppna Lagom för dagens siffror" och knappen.
2. **Exempeldata:** Utforska med exempeldata → "Widgeten visar inte exempeldata", ingen knapp.
3. **Egen profil:** skapa en profil – siffrorna kommer inom ett par sekunder. Logga mat, vatten och
   träning: widgeten följer med. Gå över målet: "… över – helt okej", ingen varning.
4. **Medvetet läge** (Inställningar → Utseende och visning): energisiffrorna och stapeln försvinner,
   måltider och vatten står kvar.
5. **Fasta:** starta en fasta – raden räknar upp; avsluta den – raden försvinner.
6. **Storlekar:** 4 × 2, 2 × 2 (rund knapp, bara energin), större; ljust och mörkt läge; stor text
   och skärmstorlek (Inställningar → Skärm).
7. **Länkarna:** tryck på widgeten och på "Lägg till" både när appen körs och efter att den har
   stängts helt – rätt sida öppnas, och bakåtknappen beter sig som vanligt. Samma sak från datorn:
   `adb shell am start -W -a android.intent.action.VIEW -d "lagom-widget://lagg-till" -n se.lagomappen.lagom/.MainActivity`.
   Andra adresser (t.ex. `lagom-widget://annat`) ska inte göra något.
   **Ingen upprepning:** öppna appen med "Lägg till", gå till en annan sida och lägg appen i
   bakgrunden. Avsluta processen (`adb shell am kill se.lagomappen.lagom`) och öppna appen från
   Senaste – Lägg till ska **inte** öppnas igen. Samma sak med Utvecklaralternativ → "Behåll inte
   aktiviteter" påslaget. Ett nytt tryck på "Lägg till" ska däremot fortfarande fungera.
8. **Midnatt:** låt telefonen passera midnatt (eller ställ klockan) – nästa dags rad visas utan att
   appen öppnas. En klocka som ställs för hand kan ta upp till 30 minuter. Åtta dagar fram: "Öppna
   Lagom för dagens siffror".
9. **Radera all data:** widgeten visar läget utan data.
10. **Omstart och flygplansläge:** efter omstart och upplåsning visas den sparade datan; inget
    kräver nätet.
11. **TalkBack:** widgeten och knappen läses upp begripligt.
12. **Den sparade datan** (bara testbygget, som går att felsöka):
    `adb shell run-as se.lagomappen.lagom cat shared_prefs/lagom-widget.xml` – bara summor och
    antal, inga livsmedel.

## 8. iPhone – planen

**Läget:** iPhone-widgeten finns i koden men är **avslagen**. En iPhone-widget är ett eget *app
extension*-mål (WidgetKit) med ett eget Bundle ID, och appen och widgeten kan bara dela data genom
en **App Group**, som måste finnas i ägarens Apple Developer-konto, vara påslagen för båda Bundle
ID:na och finnas i båda signeringsprofilerna. Så länge den inte finns skulle en app som bäddar in
widgeten inte gå att signera, och hela iPhone-appen skulle stoppas. Därför gäller i dag:

- Målet `LagomWidgetExtension` finns i Xcode-projektet och byggs i kontrollbygget, men appmålet
  beror inte på det och bäddar inte in det (ingen `PBXTargetDependency`, ingen kopieringsfas).
- `App.entitlements` saknar `com.apple.security.application-groups`.
- `WIDGET_IOS_READY` i `src/native/widget.ts` är `false`: på iPhone gör JS-modulen ingenting, och
  tillägget `LagomWidget` kompileras in i appen men anropas aldrig (utan App Group avvisar det
  `update` med `STORAGE`).

De tre ändras alltid tillsammans med **`node scripts/ios-widget.mjs enable`** (se sist i avsnittet).
`node scripts/ios-widget.mjs status` skriver `på` eller `av`, och `check` stoppar med ett svenskt fel
när de tre inte stämmer (halvvägs påslagen). Båda tar `--root=<katalog>`.

### Utformning

- Samma `WidgetPayload` version 1 och samma JS: med `WIDGET_IOS_READY = true` gör
  `src/native/widget.ts` på iPhone exakt det den gör på Android (`widgetSupported()`).
- Storlekarna `systemSmall` och `systemMedium` på hemskärmen – **inte** låsskärmens
  `accessory`-storlekar. StandBy (laddning i liggande läge, synligt för andra i rummet) undantas med
  `.disfavoredLocations([.standBy], for: [.systemSmall])`, och siffrorna och staplarna är
  `privacySensitive()`.
- Widgetmålet kräver **iOS 17** (`IPHONEOS_DEPLOYMENT_TARGET = 17.0`; appen stöder fortfarande
  16.4), så `.containerBackground(for: .widget)` och `disfavoredLocations` används utan
  tillgänglighetskontroller. På iOS 16 finns ingen widget att välja – appen fungerar som vanligt.
- Namn och beskrivning som på Android: `.configurationDisplayName("Idag")` och `.description("Dagens
  energi, måltider och vatten – och en knapp för att lägga till.")`, svenska som utvecklingsspråk.
- Samma regler som på Android (`WidgetContent.swift` motsvarar `WidgetView.java`): medvetet läge
  döljer energin, exempeldata och ingen profil ger bara texten utan knapp, en tom text döljer sin
  rad, och valfria rader som inte får plats tas bort i prioritetsordning (energidetaljen, måltider,
  fasta, vatten) med `ViewThatFits`. Färgerna kommer från widgetens asset-katalog – samma som
  `values/widget_colors.xml`, ljust och mörkt. Fastan räknar upp med `Text(start, style: .timer)`.
- **Tidslinjen:** en post nu och en vid varje lokal midnatt då datan har en ny dag (och midnatten
  efter den sista, då `fallbackText` visas), med policyn `.never` – appen ber WidgetKit ladda om
  tidslinjen varje gång den skickar ny data. Datumen jämförs i den gregorianska kalendern i
  telefonens tidszon, och dygnens början räknas från kl. 12 så att sommartiden blir rätt. Byter
  telefonen tidszon står de uträknade midnätterna kvar tills appen skickar ny data (Android ritar om
  var 30:e minut).

### Koden

| Fil | Mål | Vad |
| --- | --- | --- |
| `ios/App/App/LagomWidgetPlugin.swift` | App | Tillägget `LagomWidget` (`CAPBridgedPlugin`, `update` och `clear`, samma felkoder som på Android). `update` avvisar saknad data (`INVALID`), för stor data (`TOO_LARGE`, räknat i UTF-16-enheter som i JS och Java) och ogiltig data (`INVALID`, samma kontroll som på Android) – den förra datan ligger då kvar. Annars sparas texten i App Groupens `UserDefaults` under nyckeln `payload` och `WidgetCenter.shared.reloadTimelines(ofKind: "LagomWidget")` anropas. Utan App Group: `STORAGE`. `clear` tar bort nyckeln och ritar om. |
| `ios/App/App/LagomBridgeViewController.swift`, `SceneDelegate.swift` | App | Registrerar tillägget i `capacitorDidLoad()`, före sidans första laddning; `SceneDelegate` använder den i stället för `CAPBridgeViewController()`. |
| `ios/App/LagomWidget/WidgetShared.swift` | App + widget | App Group, nyckeln, 32 768 tecken, `kind` och länkarna. `sharedDefaults()` ger `nil` när gruppens behållare saknas (behörigheten finns inte i bygget). |
| `ios/App/LagomWidget/WidgetPayload.swift` | App + widget | Modellen och `WidgetPayload.parse(_:)` – en egen strikt JSON-tolkare (RFC 8259) med samma regler som `WidgetPayload.java`/`WidgetJson.java`, så att båda plattformarna godtar och avvisar samma data. Felen (`WidgetPayloadError`) är fasta svenska texter som aldrig citerar datan. |
| `ios/App/LagomWidget/WidgetContent.swift` | widget | Vad som visas vid en tidpunkt och tidslinjens poster – bara Foundation. |
| `ios/App/LagomWidget/LagomTodayWidget.swift`, `TodayWidgetView.swift`, `LagomWidgetBundle.swift` | widget | `TimelineProvider` och widgeten "Idag", vyerna i SwiftUI och `@main`. |
| `ios/App/LagomWidget/Assets.xcassets`, `PrivacyInfo.xcprivacy` | widget (resurser) | Färgerna (bl.a. `AccentColor` och `WidgetBackground`, som bygginställningarna pekar på) och widgetens integritetsmanifest (UserDefaults-skälet `1C8F.1`, ingen insamlad data). |
| `ios/App/LagomWidget/Info.plist`, `LagomWidget.entitlements` | widget (bygginställningar, ingen byggfas) | `NSExtension` → `NSExtensionPointIdentifier` = `com.apple.widgetkit-extension`; App Group i widgetens behörigheter. |
| `ios/App/App/PrivacyInfo.xcprivacy` | App | UserDefaults-skälen `CA92.1` och `1C8F.1` (delade UserDefaults i en App Group). |
| `ios/App/LagomWidgetTests/` | – | Swift-testerna: `main.swift` och facitfilerna i `fixtures/`, som `src/native/widgetIosFixtures.test.ts` skriver ur `buildWidgetPayload`. Inte i Xcode-projektet. |
| `scripts/ios-widget.mjs`, `scripts/pbxproj.mjs` | – | `status`, `check` och `enable`, och läsaren för projektfilen. Testerna: `netlify/tests/ios-widget.test.ts` och `src/native/iosWidgetCi.test.ts`. |

Målet i `project.pbxproj` (nya id:n börjar med `7A1D6E0`): `LagomWidgetExtension`
(`com.apple.product-type.app-extension`, produkten `LagomWidgetExtension.appex`),
`PRODUCT_BUNDLE_IDENTIFIER = se.lagomappen.lagom.widget`, `IPHONEOS_DEPLOYMENT_TARGET = 17.0`,
`TARGETED_DEVICE_FAMILY = 1`, `APPLICATION_EXTENSION_API_ONLY = YES`, `SKIP_INSTALL = YES`,
`SWIFT_VERSION = 5.0`, `WidgetKit.framework` och `SwiftUI.framework`. `MARKETING_VERSION` och
`CURRENT_PROJECT_VERSION` är desamma som appens – molnbygget skickar dem till alla mål, och App Store
kräver att widgeten har samma som appen. En ny fil i `ios/App/LagomWidget/` eller en ny Swift-fil i
`ios/App/App/` måste också in i projektfilen (testet kontrollerar det). XcodeGen och Tuist avråds:
de skriver om hela projektet som Capacitor har skapat.

**Länkarna** – `widgetURL(lagom-widget://idag)` för hela widgeten och
`Link(destination: lagom-widget://lagg-till)` för knappen i `systemMedium` (i `systemSmall` är hela
widgeten ett tryck, till Idag). De kommer fram via `SceneDelegateProxy` i `SceneDelegate.swift` –
`scene(_:openURLContexts:)` när appen körs och `connectionOptions.urlContexts` vid kallstart – som
`appUrlOpen` och `App.getLaunchUrl()`. iOS spelar inte upp länkar igen när en scen återställs, så
inget som `WidgetLinks.isReplayedLink` behövs. Enligt Apples dokumentation öppnar `widgetURL` och
`Link` alltid appen som widgeten hör till; prova på en telefon att länken kommer fram utan att
schemat registreras i `CFBundleURLTypes`. Behövs det: registrera `lagom-widget` – andra appar kan då
också öppna länkarna, men de leder ändå bara till `/` och `/lagg-till`.

### Kontrolleras i CI

Swift och Xcode finns inte lokalt – Swift-koden kompileras först i molnbygget.

- **`native.yml`, jobbet *iPhone-widgetens logik (Swift på Linux)*** – vid varje körning, som
  Android-kontrollen. De tre filerna använder bara Foundation (även på Linux):
  `swiftc -o "$OUT" ios/App/LagomWidget/WidgetShared.swift ios/App/LagomWidget/WidgetPayload.swift ios/App/LagomWidget/WidgetContent.swift ios/App/LagomWidgetTests/main.swift`
  och sedan `"$OUT" ios/App/LagomWidgetTests/fixtures` (slutkod 0 när allt gick igenom).
- **`native.yml`, iPhone-bygget** (på begäran), efter det vanliga appbygget: samma Swift-tester på
  macOS, widgetmålet för sig
  (`xcodebuild -project ios/App/App.xcodeproj -target LagomWidgetExtension -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build`)
  och appen med widgeten inbäddad – påslagen med `enable` bara i molnets utcheckning, aldrig
  incheckad – med kontroll av Bundle ID, tilläggspunkt, version och byggnummer i
  `App.app/PlugIns/LagomWidgetExtension.appex`.
- **`release.yml` och `codemagic.yaml`** läser läget en gång (`check`, sedan `status`) innan något
  ändrar projektet. `på`: även profilen för `se.lagomappen.lagom.widget` hämtas, och IPA:n ska
  innehålla widgeten med rätt Bundle ID, samma version och App Group i både appens och widgetens
  signatur. `av`: IPA:n får inte innehålla widgeten. Halvvägs påslagen stoppar bygget.

### Signering och profiler

1. *developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → App Groups → +*:
   `group.se.lagomappen.lagom` (beskrivning "Lagom widget").
2. *Identifiers → `se.lagomappen.lagom` → App Groups → Configure*: välj gruppen och spara.
   Befintliga profiler blir ogiltiga – molnbygget skapar nya (`--create`).
3. *Identifiers → + → App IDs → App*: *Explicit* `se.lagomappen.lagom.widget`, beskrivning "Lagom
   widget", förmågan **App Groups** med samma grupp. Inget annat (ingen HealthKit).
4. **Molnbyggena** (`release.yml` och `codemagic.yaml`) sköter resten när widgeten är på: ett andra
   `app-store-connect fetch-signing-files se.lagomappen.lagom.widget --platform IOS --type IOS_APP_STORE --strict-match-identifier --create`
   före `xcode-project use-profiles`, som kopplar varje profil till sitt mål efter Bundle ID. App
   Store Connect API-nyckeln och certifikatnyckeln är desamma – inga nya hemligheter. Så länge
   widgeten är av finns målet i projektet utan profil; `use-profiles` ska då bara hoppa över det
   (kontrollera det i den första körningen efter den här ändringen).
5. **App Store Connect:** widgeten följer med i appen – ingen egen app och inga nya produkter.
   App Privacy är oförändrad (inget lämnar telefonen).
6. **Testa i TestFlight** enligt [avsnitt 7](#7-testa-på-en-telefon) (på iPhone: håll fingret på
   hemskärmen → Redigera → Lägg till widget → Lagom).

### När iPhone-widgeten slås på – i samma ändring

- [ ] Stegen under *Signering och profiler* är gjorda i ägarens konto.
- [ ] `node scripts/ios-widget.mjs enable`: appmålet beror på widgetmålet och bäddar in det
      ("Embed Foundation Extensions", PlugIns), App Group i `App.entitlements` och
      `WIDGET_IOS_READY = true`. Skriptet vägrar om widgeten redan är på eller halvvägs och skriver
      ut det som återstår.
- [ ] Integritetspolicyn: en rad i `appStore`-variantens lagringstabell (App Group-behållaren,
      delad mellan appen och widgeten) och ett stycke under "Din dagbok finns bara på din enhet" –
      utan att nämna Android. Ändra testet i `src/features/legal/legal.test.tsx` (som i dag kräver
      att iPhone-texten saknar widgeten) och kör `npx vitest run src/features/legal -u`.
- [ ] APP-STORE.md: widgeten i beskrivningen (och "Nyheter"), NATIVE.md §5 och §8, supportsidan,
      det här avsnittet och CLAUDE.md.
- [ ] `npx vitest run netlify/tests/ios-widget.test.ts src/native src/features/legal` och
      `node scripts/ios-widget.mjs check`.
- [ ] Provat i TestFlight.

## 9. Ändra widgeten

- **Aldrig mer än summor och antal** – inga livsmedels- eller måltidsnamn, anteckningar, vikt eller
  andra hälsouppgifter, inga energisiffror i medvetet läge och aldrig exempeldata. Tonen från
  CLAUDE.md gäller: neutralt över målet, inga varningar.
- **Ett nytt valfritt fält** går bra i version 1 (widgeten ignorerar okända fält). Ändras betydelsen
  av ett fält eller tas ett bort: höj `v` och låt widgeten godta både den gamla och den nya
  versionen – den sparade datan från förra versionen ligger kvar efter en uppdatering tills appen
  öppnas.
- **Ny text** formateras i `src/lib/widgetSummary.ts` med `src/lib/format.ts`, aldrig i widgeten.
- **Nya länkar** kräver en ändring på båda sidor: `WIDGET_LINKS` i `src/native/widget.ts` och
  `WidgetLinks.java` (`widgetAndroid.test.ts` jämför dem). De leder bara till sidor som man ändå
  når i appen – vem som helst kan skicka dem till `MainActivity`.
- **Båda plattformarna:** kontrollen av datan och vad som visas finns både i Java
  (`android/…/widget/`) och i Swift (`ios/App/LagomWidget/`) – ändra dem tillsammans, så att de
  godtar och visar samma sak.
- **Testerna:** `npx vitest run src/lib/widgetSummary.test.ts src/native/widget.test.ts
  src/native/widgetAndroid.test.ts` och JUnit-testerna i `android/app/src/test/`. Ändras texterna
  eller formatet: skriv om Swift-testernas facitfiler med
  `npx vitest run src/native/widgetIosFixtures.test.ts -u` (Swift-testerna körs i molnbygget).
- **Ny data i widgeten** → uppdatera integritetspolicyns rad (webben och Play), avsnitt 5 här,
  supportsidan (`public/support/index.html`) och vid behov Data safety.
