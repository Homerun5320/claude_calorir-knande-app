# De inbyggda apparna (Capacitor 8)

Lagom finns som inbyggd app i **App Store (bara iPhone)** och **Google Play (Android)**. Båda är
[Capacitor 8](https://capacitorjs.com)-appar runt samma webbkod som webbversionen, byggd med
`VITE_DISTRIBUTION=appstore|play` till `dist-native/`. Webbversionen (`dist/`) påverkas inte.

Det här dokumentet beskriver grunden: paketen, projekten `ios/` och `android/`, byggkommandona,
behörigheter, integritetsmanifestet och underlaget till butikernas integritetsformulär. Butikernas
formulär och texter i övrigt: [APP-STORE.md](APP-STORE.md), [GOOGLE-PLAY.md](GOOGLE-PLAY.md) och
[IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md).

> **Läget (2026-09-28):** grunden är på plats – projekten, ikoner, startskärmar, behörigheter,
> integritetsmanifest och byggkommandon – och funktionerna finns i `src/native/` (köp i appen,
> export och delning, påminnelser, streckkodsläsare, Hälsa, haptik, statusfält, bakåtknapp).
> Molnbyggena är klara: kontrollbygget (`.github/workflows/native.yml`) och de signerade
> butiksbyggena till TestFlight och Google Play (`.github/workflows/release.yml` eller
> `codemagic.yaml`), se [avsnitt 9](#9-molnbyggen-kontroll-signering-och-uppladdning). Det som
> återstår för dig står i [avsnitt 10](#10-steg-för-steg-för-ägaren-utan-mac) och
> [LANSERING.md](LANSERING.md). `NATIVE_PURCHASES_READY` i `src/lib/storePurchases.ts` är true,
> men köpen räknas som klara först när de har provats på riktiga telefoner (TestFlight och
> Play-testning).

## Innehåll

1. [Att bekräfta innan första uppladdningen](#1-att-bekräfta-innan-första-uppladdningen)
2. [Paketen och varför](#2-paketen-och-varför)
3. [Bygga](#3-bygga)
4. [Koden: src/native/](#4-koden-srcnative)
5. [iPhone-projektet (ios/)](#5-iphone-projektet-ios)
6. [Android-projektet (android/)](#6-android-projektet-android)
7. [Ikoner och startskärmar](#7-ikoner-och-startskärmar)
8. [Integritet: App Privacy och Data safety](#8-integritet-app-privacy-och-data-safety)
9. [Molnbyggen: kontroll, signering och uppladdning](#9-molnbyggen-kontroll-signering-och-uppladdning)
10. [Steg för steg för ägaren (utan Mac)](#10-steg-för-steg-för-ägaren-utan-mac)
11. [Kvar att göra](#11-kvar-att-göra)

---

## 1. Att bekräfta innan första uppladdningen

| Vad | Värde | Varför det är viktigt |
| --- | --- | --- |
| **App-id** (Bundle ID i App Store, applicationId i Google Play) | `se.lagomappen.lagom` | **Kan aldrig ändras** efter första uppladdningen till App Store Connect eller Play Console – ett nytt id blir en ny app utan betyg, köp eller användare. Id:t är ett omvänt domännamn men kräver ingen domän. **Ägaren bekräftar det** (eller väljer ett annat) innan Bundle ID skapas hos Apple. Byts det: ändra `appId` i `capacitor.config.ts`, `PRODUCT_BUNDLE_IDENTIFIER` i `ios/App/App.xcodeproj/project.pbxproj`, `namespace`/`applicationId` i `android/app/build.gradle`, paketet för `MainActivity.java` och `package_name`/`custom_url_scheme` i `android/app/src/main/res/values/strings.xml`. Domänen lagomappen.se var sannolikt ledig 2026-09-29 och bör registreras – se [APPNAMN.md](APPNAMN.md). |
| **Webbvyns ursprung** | `capacitor://localhost` (iPhone), `https://localhost` (Android) | Dagboken ligger i webbvyns IndexedDB, som hör till ursprunget. Ändras `server.hostname`, `iosScheme` eller `androidScheme` i `capacitor.config.ts` efter lanseringen **försvinner all sparad data** för användarna. Serverfunktionerna godtar just de här ursprungen (`ALLOWED_NATIVE_ORIGINS`). |
| **Appnamn** | `Lagom` | Visas under ikonen. Namnet i butikerna sätts i App Store Connect och Play Console. |
| **Version** | `version` i `package.json` (1.0.0) | Molnbyggena tar den för båda apparna: `versionName` på Android och `MARKETING_VERSION` (skickas med till Xcode) på iPhone. `MARKETING_VERSION` i Xcode-projektet gäller bara byggen på en egen Mac – håll den lika. En tagg måste vara `v` + versionen. Byggnumret ökar i molnbygget (avsnitt 9). |

## 2. Paketen och varför

Ägaren har godkänt Capacitor 8 och tilläggen nedan (2026-09-28). Versionerna är låsta exakt i
`package.json`. Andra nya paket kräver fortfarande godkännande.

| Paket | Version | Används till | Licens |
| --- | --- | --- | --- |
| `@capacitor/core`, `@capacitor/ios`, `@capacitor/android` | 8.5.2 | Själva appskalet | MIT |
| `@capacitor/cli` (dev) | 8.5.2 | `cap sync` m.m. | MIT |
| `@capacitor/app` | 8.1.1 | Androids bakåtknapp, appens tillstånd (förgrund/bakgrund) | MIT |
| `@capacitor/filesystem` | 8.1.3 | Skriva export och säkerhetskopia till en fil före delning | MIT |
| `@capacitor/share` | 8.0.2 | Systemets delningsblad ("Spara i Filer", mejl …) | MIT |
| `@capacitor/haptics` | 8.0.2 | Lätt vibration vid t.ex. loggning | MIT |
| `@capacitor/status-bar` | 8.0.3 | Statusfältets stil (ljust/mörkt) | MIT |
| `@capacitor/keyboard` | 8.0.5 | Tangentbordet (storleksändring, händelser) | MIT |
| `@capacitor/splash-screen` | 8.0.2 | Startskärmen | MIT |
| `@capacitor/local-notifications` | 8.3.1 | Lokala påminnelser (inga pushnotiser, ingen server) | MIT |
| `@capacitor/barcode-scanner` | 3.1.2 | Inbyggd streckkodsläsare: **ML Kit** på Android, Apples **Vision** på iPhone | MIT |
| `@capgo/native-purchases` | 8.8.1 | Köp i appen: **StoreKit 2** och **Google Play Billing 9** | MPL-2.0 |
| `@capgo/capacitor-health` | 8.11.4 | **Apple Hälsa** (HealthKit) och **Health Connect** | MPL-2.0 |

MPL-2.0 gäller bara tilläggens egna filer (vi ändrar dem inte); licenstexten följer med i
`licenses.txt` i bygget. `@capacitor/barcode-scanner` drar med sig `html5-qrcode` (Apache-2.0):
tillägget importerar dess lista över streckkodsformat, så biblioteket följer med i butiksbyggets
streckkodsdel (laddas först när streckkodsläsaren öppnas, aldrig i webbygget), men dess
webbläsarskanner används inte i apparna – där skannar ML Kit respektive Vision.

`npm audit --omit=dev`: **0 sårbarheter** (2026-09-28). I utvecklingsberoendena finns 3 måttliga
(`uuid` via `xcode` i `@capacitor/cli`) – bara byggverktyget, aldrig i appen; CI:ns kontroll
(`--omit=dev --audit-level=high`) påverkas inte.

### Köp i appen: varför @capgo/native-purchases

Ägaren ville ha det smidigaste och enklaste, helst utan egen server och utan extra konto
(integritetstexterna förutsätter att köpet bara går mellan telefonen och Apple/Google).

| | `@capgo/native-purchases` 8.8.1 | `cordova-plugin-purchase` 13.18 (Capacitor: `capacitor-plugin-cdv-purchase`) | `@revenuecat/purchases-capacitor` 13.6 |
| --- | --- | --- | --- |
| Capacitor 8 | Ja (peer `>=8`, SPM och CocoaPods) | Ja (peer `^6 \|\| ^7 \|\| ^8`) | Ja |
| StoreKit 2 | Ja, alltid (`Transaction.currentEntitlements`, `AppStore.sync`) | Ja i Capacitor-varianten; Cordova behöver ett extra tillägg | Ja |
| Play Billing Library 8+ (krav för nya appar sedan 2026-08-31) | **9.1.0** | 9.0.0 | Via RevenueCats SDK |
| Icke-förbrukningsbara köp (`livstid`, `prov14`) | Ja (`PURCHASE_TYPE.INAPP`, kvitteras automatiskt i Play) | Ja | Ja |
| Non-renewing subscription (`ar` i App Store) / engångsprodukt (`ar` i Play) | Ja – syns i `getPurchases()` med köpdatum; appen räknar 365 dagar själv | Ja | Ja |
| Återställ köp | `restorePurchases()` (StoreKit 2 `AppStore.sync`) + `getPurchases()` | Ja | Ja |
| Butikens pris, lokaliserat | `priceString` (t.ex. "699,00 kr") | Ja | Ja |
| API | Enkla promise-anrop (`getProducts`, `purchaseProduct`, `getPurchases`) | Händelsestyrt (`store.when().approved()…`), mer att lära | Enkelt, men kräver konto |
| Server/konto | **Ingen** – inga nätanrop utöver Apple/Google | Ingen (valfri valideringstjänst iaptic) | **RevenueCat-konto och API-nyckel**; köphistorik och användar-id skickas till RevenueCat |
| Underhåll | Aktivt (senaste 2026-09-22), major följer Capacitor | Aktivt (2026-07) | Aktivt |

**Valet: `@capgo/native-purchases`.** Det uppfyller alla krav utan server och konto, har det
enklaste API:t och den nyaste Play Billing-versionen. Källkoden är genomgången: tillägget gör inga
egna nätanrop. RevenueCat behövs inte – och skulle kräva ändringar i integritetspolicyn,
registerförteckningen, App Privacy (*Purchases*, *Identifiers*) och Data safety.

Att tänka på när köpen kopplas in:

- Produkterna hämtas och köps med `productType: PURCHASE_TYPE.INAPP` för alla tre (`livstid`,
  `ar`, `prov14`) – också årslicensen, eftersom den inte förnyas automatiskt (i Play är den en
  engångsprodukt, i App Store en *Non-Renewing Subscription* som StoreKit 2 behandlar som ett köp
  utan förnyelse). Ange **inte** `isConsumable` – då kvitteras köpen i Play i stället för att
  förbrukas.
- "Återställ köp": `restorePurchases()` och därefter `getPurchases()`. På iPhone ger
  `getPurchases({ onlyCurrentEntitlements: true })` gällande köp; årslicensens slutdatum räknas
  från köpdatumet (365 dagar), eftersom butiken inte har något slutdatum för sådana köp.
  `Transaction.currentEntitlements` ger bara det senaste köpet av en non-renewing subscription, så
  när `ar` eller `prov14` finns läses också hela historiken (`onlyCurrentEntitlements: false`, dvs.
  `Transaction.all`, utan återkallade köp): köpta år läggs efter varandra (`chainYears` – ett år som
  köps i förväg börjar när det förra slutar) och provperioden räknas från det första köpet.
- **Provperioden i iPhone-appen** startas med köpet `prov14` (Non-Consumable för 0 kr, riktlinje
  3.1.1) – knappen "Starta 14 dagar gratis" i välkomstflödets sista steg, på Idag, i spärren och på
  Lagom Premium, efter texten om hur länge den gäller, vad som sedan kräver köp och vad det kostar.
  Provperioden räknas från köpet (`trialViaStore()` i `src/config/platform.ts`), följer
  Apple-kontot och kommer tillbaka med "Återställ köp" – en ominstallation startar den inte om.
  Exempeldatan går att titta på utan att starta den. Webben och Google Play-appen har kvar den
  lokala provperioden som startar när profilen skapas.
- **De senast kända köpen** (produkt, köpdatum, slutdatum, butik – inga kvitton eller id:n) sparas
  i localStorage (`lagom-butikskop`, bara i apparna, utanför säkerhetskopian) och används när
  butiken inte svarar, t.ex. utan uppkoppling eller när Play Billing inte går att nå – så att den
  som har betalat inte stängs ute. De ersätts varje gång butiken svarar (ett återbetalt köp
  försvinner då), och en hämtning som misslyckas görs om efter 15 s, 1 min och 5 min.
- Återbetalda köp: på iPhone har transaktionen `revocationDate`; i Play försvinner köpet ur
  `getPurchases()`.
- Implementationen finns i `src/native/purchases.ts` och kopplas till `getStorePurchases()` i
  `src/lib/storePurchases.ts` (som inte får importera något – byggkontrollen läser filen) med
  `setNativeStorePurchases()` från `startNative()`. `NATIVE_PURCHASES_READY` är true, men köpen är
  bara testade med ett mockat tillägg: prova köp av `livstid` och `ar`, avbrutet köp, "Återställ
  köp" och butikens priser i TestFlight och Play-testning före första inskickningen – och sätt
  tillbaka flaggan till false om något inte fungerar.
- **Kvittering i Play:** tillägget stänger butiksanslutningen direkt efter sin egen kvittering, så
  appen köper med `autoAcknowledgePurchases: false` och kvitterar själv med `acknowledgePurchase`
  – direkt efter köpet och vid varje hämtning av köpen (start, fokus, Återställ köp). Då kvitteras
  också väntande köp som blir klara senare, inom Googles tredagarsgräns.
- **Årslicensen i Play** förbrukas (`consumePurchase`) först när den har gått ut och ett nytt år
  köps. Ett år som gäller kan inte köpas igen (Play tillåter inget nytt köp av en ägd produkt), så
  köpsidan erbjuder då bara livstid och texten "Årslicensen kan förnyas här när den har gått ut"
  (`renewalBlockedInStore` i `src/features/premium/premiumLogic.ts`). **I App Store** kan ett nytt
  år köpas de sista 30 dagarna; det läggs efter det som gäller, och köppanelen säger att inga dagar
  går förlorade (`storeRenewalNote`).
- Anropen till tillägget görs **ett i taget** (Android-delen stänger anslutningen vid varje anrop),
  med tidsgränser. På iPhone lyssnar appen på `transactionUpdated` (godkända "Be om lov att köpa",
  köp på en annan enhet och återbetalningar) och uppdaterar tillgången.

### Streckkodsläsaren: varför @capacitor/barcode-scanner

`@capacitor-mlkit/barcode-scanning` (8.2.1) stöder Capacitor 8 men **bara CocoaPods** på iPhone –
Googles ML Kit finns inte för Swift Package Manager, som Capacitor 8 använder. Ionics officiella
`@capacitor/barcode-scanner` (3.1.2) har **ZXing och ML Kit på Android** och Apples **Vision** på
iPhone (inga Google-bibliotek i iPhone-appen), stöder SPM och har en färdig helskärmsvy med
ficklampa och tillgänglighetsetiketter (texterna skickas in från appen, på svenska). Den kräver
Android 8.0 (API 26), liksom Health Connect.

- **Android läser med ZXing** (`ANDROID_SCANNING_LIBRARY` i `src/native/barcode.ts`). ML Kit läser
  något bättre i svagt ljus, men skickar enligt Googles redovisning driftdata till Google (enhet,
  app, identifierare, prestanda, felkoder) – det skulle kräva samtycke, ändrad integritetspolicy
  och Data safety. ML Kit-biblioteket följer ändå med i APK:n (tillägget beror på det) men anropas
  aldrig, och ML Kits egen `MlKitInitProvider` (som annars startar ML Kit när appen startar) tas
  bort i `AndroidManifest.xml` med `tools:node="remove"`. Kontrollera i Play-testningen att ingen
  trafik går till Google från läsaren (t.ex. med nätverksloggen i Android Studio). **Byts läsaren
  till ML Kit** måste den raden tas bort – och Data safety, integritetspolicyn och frågan om
  samtycke ses över först.
- Läsaren släpper bara igenom livsmedelskoder (EAN-13/8, UPC-A/E med kontrollsiffra) och GS1-koder
  i QR/DataMatrix (Digital Link eller elementsträngar), som ger produktens GTIN.
- Efter ett nej till kameran visar tillägget en egen dialog. På iPhone översätts den med
  `ios/App/App/sv.lproj/Localizable.strings`; på Android är texten ("Camera Access Not Enabled")
  inbyggd i tillägget och engelsk – Lagom visar sin svenska text direkt efteråt.
- ScanPage öppnar läsaren en gång när sidan öppnas och sedan med "Skanna streckkod" / "Skanna
  nästa" (efter "Lägg i korgen"). Saknas tillägget tar webbens kamera över.

### Hälsa: varför @capgo/capacitor-health

| | `@capgo/capacitor-health` 8.11.4 | `capacitor-health` (mley) 8.4.0 | `@perfood/capacitor-healthkit` |
| --- | --- | --- | --- |
| HealthKit + Health Connect | Ja | Ja | Bara HealthKit, Capacitor 4 |
| Läsa vikt och steg (aktiv energi läses inte av Lagom) | Ja (`weight`, `steps`) | Ja | – |
| Skriva vikt, näring (energi), vatten | **Ja** (`saveSample`: `weight`, `dietaryEnergyConsumed`, `dietaryWater`) | Nej (bara läsa) | – |
| Health Connect-klient | 1.1.0 (stabil) | 1.2.0-alpha01 | – |
| Underhåll | Aktivt (2026-09-22) | Aktivt | Övergivet |

## 3. Bygga

Webbdelen byggs med byggkontrollen (`scripts/commerce-guard.ts`), som kräver `VITE_API_BASE` och
säljarens uppgifter för butiksbyggen, och som stoppar butiksbyggen tills köp i appen är inkopplade.

```sh
npm run build:ios       # VITE_DISTRIBUTION=appstore vite build && cap sync ios
npm run build:android   # VITE_DISTRIBUTION=play vite build && node scripts/native-config.mjs && cap sync android
npm run cap:sync        # kopiera dist-native/ och tilläggen till båda projekten igen
npm run native:assets   # appikoner och startskärmar (avsnitt 7)
```

**Lokalt testbygge** (simulator, emulator, skärmdumpar – får aldrig skickas in):

```sh
VITE_API_BASE=https://lagom.invalid \
VITE_SELLER_NAME="Testbygge" VITE_SELLER_ADDRESS="Testgatan 1, 123 45 Teststad" \
VITE_SELLER_PHONE="000-000 00 00" VITE_SUPPORT_EMAIL="ci@users.noreply.github.com" \
LAGOM_ALLOW_STORE_WITHOUT_IAP=1 npm run build:android
```

- `LAGOM_ALLOW_STORE_WITHOUT_IAP=1` släpper igenom butiksbygget fast köpen inte är inkopplade –
  bara för test. Bygget varnar tydligt.
- Supportadressen får inte vara en exempeladress (`example.*`, `.invalid`, `.test`) – därför
  GitHubs noreply-adress i testbygget. Testvärdena hamnar i appens köpvillkor; använd dina riktiga
  uppgifter i alla byggen som andra ska se.
- På Windows fungerar `VAR=värde kommando` inte i `cmd.exe` – kör kommandona i Git Bash eller WSL.
- Capacitors kommandoradsverktyg skickar anonym användningsstatistik när det körs interaktivt.
  Stäng av det en gång på din dator: `npx cap telemetry off`. (I CI skickas inget.)
- Själva apparna (Gradle, Xcode) byggs i GitHub Actions eller Codemagic – se avsnitt 9 och
  [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md). Har du Android Studio kan du öppna `android/`
  direkt efter `npm run build:android`.

Filer som **skapas** och inte ska ändras för hand: `ios/App/CapApp-SPM/Package.swift`,
`android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`, den kopierade webbdelen
(`ios/App/App/public/`, `android/app/src/main/assets/public/`, ignoreras av Git) och
`android/app/src/main/res/values/lagom_generated.xml` (ignoreras av Git).

## 4. Koden: src/native/

- **Appkoden importerar bara `src/native/index.ts`**: `isNative()`, `nativePlatform()`
  (`'ios' | 'android' | 'web'`), `platform`, `initNative()`, `loadNative('<modul>')` och
  `NATIVE_BUILD`.
- Varje funktion ligger i en egen modul i `src/native/` som får importera `@capacitor/*`
  statiskt. Modulen registreras i `MODULES` i `index.ts` och laddas med `loadNative()`, som ger
  `null` på webben:

  ```ts
  const files = await loadNative('files')
  if (files) return files.saveFile(filename, content, mime)
  // … webbens väg som förut
  ```

  | Modul | Vad | Används av |
  | --- | --- | --- |
  | `system` | Statusfältet följer appens tema, tangentbordet (iPhone: webbvyn krymper, raden med "Klar"; klassen `keyboard-open` på `<html>` döljer bottennavigeringen), startskärmen döljs efter hydreringen, Androids bakåtknapp (ark/dialog → bakåt → minimera på startsidan), `target="_blank"`-länkar till appens egna sidor öppnas på webbplatsen | `init.ts` (först) |
  | `purchases` | Köp i appen (se avsnitt 2) | `init.ts` → `setNativeStorePurchases()` |
  | `files` | `saveFile()` skriver till `Directory.Cache/delning/` och öppnar delningsbladet; `shareText()`; `clearExportCache()` | `saveFile` i `src/lib/backup.ts`, `shareOrCopy` i `src/features/diary/share.ts`, "Radera all data" |
  | `mirror` | Automatisk kopia (`lagom-spegling.json`, via en tillfällig fil) högst 30 s efter en ändring och när appen går till bakgrunden – på iPhone i `Directory.LibraryNoCloud` (utanför iCloud- och datorsäkerhetskopian), på Android i `Directory.Data`. Är appen tom men kopian finns frågar appen om återställning; frågan går bara att besvara med knapparna och "Börja om" bekräftas en gång till. Aldrig för exempeldata, minnesläge eller data från en nyare version | `init.ts` (väntas inte in), "Radera all data" |
  | `reminders` | Lokala påminnelser (måltider, vatten, fasta, säkerhetskopia, veckans fokus), id 7100–7199, `isExactNotification: false`, egen kanal "Påminnelser" på Android. Frågar om lov först när användaren slår på en påminnelse | `init.ts`, Inställningar → Påminnelser (via `useReminderBridge`) |
  | `haptics` | `tap()`/`success()` – använd `haptic()` från `src/native`; tyst vid "Minska rörelse" | vatten, mat loggad, fasta, köp, streckkod |
  | `barcode` | Streckkodsläsaren (se avsnitt 2) | ScanPage |
  | `health` | Apple Hälsa/Health Connect: läser vikt och steg, skriver vikt samt energi och vatten för avslutade dagar. Av från början; `lagom-health` i localStorage | `init.ts`, Inställningar → Apple Hälsa/Health Connect |
  | `photos` | Framstegsbilder: nedskalade JPEG utan EXIF i `framsteg/` med `index.json` – på iPhone i `Directory.LibraryNoCloud`, på Android i `Directory.Data`. Android-kamerans tillfälliga original (`Pictures/JPEG_*.jpg` i appens externa filmapp, med en `.nomedia` så att galleriappar inte visar mappen) tas bort med `clearCameraCaptures()` direkt efter nedskalningen, när sidan öppnas och vid varje start av appen. Ett trasigt `index.json` byggs om ur filerna i mappen. Av från början | `src/lib/progressPhotos.ts` (Vikt & mått → Framstegsbilder), `init.ts` (Android: `clearCameraCaptures`), "Radera all data" |

- **Alla dynamiska importer av native-moduler står i `index.ts`.** Vite tar bara bort en dynamisk
  import ur webbygget när villkoret (`NATIVE_BUILD`, en konstant i bygget) står i samma modul –
  prövat med provbyggen: står importen i en annan fil följer native-koden med i `dist/` och i
  service workerns cache.
- `initNative()` anropas en gång av AppShell (efter hydreringen och `useTheme`) och startar
  funktionerna i `src/native/init.ts`: `system` först (startskärmen), sedan köpen (useAccess
  väntar på dem, högst 15 s), sedan påminnelser och Hälsa; speglingen väntas inte in, eftersom den
  kan vänta på användarens svar. `SplashScreen.launchShowDuration` (3 s) är reserven om skriptet
  aldrig startar.
- Inställningssidorna Påminnelser och Apple Hälsa/Health Connect finns bara i apparna. De laddas
  med `lazy()` bakom byggkonstanten `APP_SECTIONS_BUILD` i `SettingsPage.tsx` (samma mönster som
  `NATIVE_BUILD`) och följer därför inte med i webbygget.
- "Radera all data" (`wipeAndReset`) tar i apparna också bort kopian, exportfilerna och
  hälsokopplingen (`clearNativeCopies` i `src/features/settings/wipe.ts`) och – även på webben –
  framstegsbilderna (`deleteProgressPhotos` → `deleteAllProgressPhotos` i
  `src/lib/progressPhotos.ts`). Raderas bara exempeldata ("Skapa min egen profil") ligger kopian
  och bilderna kvar – de är användarens egna.
- De inbyggda apparna sätter klassen `native-app` på `<html>` (`system`), och `src/index.css`
  stänger då av bildernas långtrycksmeny (`-webkit-touch-callout: none`).
- Allt är no-op på webben och i testerna, och kastar aldrig: fel loggas med `logError`.
- `src/native/native.test.ts` kontrollerar reglerna (inga `@capacitor/*` utanför `src/native/`,
  ingen import av `src/native/<modul>` utanför `index.ts`).
- Webbygget är i praktiken oförändrat och innehåller ingen Capacitor-kod: 182 poster i service
  workerns förteckning i september 2026 (178 före apparna – bl.a. är `src/native/index.ts` och
  `src/lib/errorLog.ts` nu små delade delar på 0,4 respektive 3 kB, eftersom fler sidor använder
  dem, och den fristående integritetssidan för Android-appen, `/integritet/android/`, har
  tillkommit). ScanPage och Inställningar blev omkring 1,5 kB större var (appvägen i ScanPage
  och sektionernas rubriker); själva apparnas sektioner och modulerna finns bara i `dist-native/`.

## 5. iPhone-projektet (ios/)

Skapat med `npx cap add ios --packagemanager SPM` (Capacitor 8, Swift Package Manager – det gick
bra på Linux). Inställningar:

| Var | Inställning |
| --- | --- |
| `Info.plist` | `CFBundleDisplayName` Lagom, `CFBundleDevelopmentRegion` **sv** och `CFBundleLocalizations` [sv] (systemets knappar och dialoger i appen blir svenska), `ITSAppUsesNonExemptEncryption` **false**, bara **porträtt**, `UIRequiredDeviceCapabilities` arm64 |
| `NSCameraUsageDescription` | "Lagom använder kameran för att läsa streckkoder på förpackningar – de bilderna sparas inte. Om du slår på framstegsbilder kan du också ta bilder på dig själv; de sparas bara i appen på din iPhone och lämnar den aldrig." |
| `NSHealthShareUsageDescription` | "Om du vill läser Lagom vikt och steg från Hälsa – vikten hamnar i viktkurvan och stegen under Träning. Uppgifterna stannar på din iPhone." |
| `NSHealthUpdateUsageDescription` | "Lagom sparar vikt, energi från måltider och vatten som du loggar i Hälsa om du vill. Inget skickas någon annanstans." |
| `NSPhotoLibraryAddUsageDescription` | "Om du vill spara en produktbild i Bilder behöver Lagom lov att lägga till den där. Lagom kan inte se ditt bildbibliotek, och framstegsbilder sparas aldrig i Bilder." – en reserv: webbvyns meny "Spara bild" är avstängd i appen (`-webkit-touch-callout: none`), men utan texten skulle iOS avsluta appen om en bild ändå sparas (t.ex. via delningsbladet). Ingen läsbehörighet (`NSPhotoLibraryUsageDescription`). |
| `App.entitlements` | HealthKit (`com.apple.developer.healthkit`). Slå också på **HealthKit** och **In-App Purchase** för Bundle ID:t på developer.apple.com (*Identifiers*) – annars misslyckas signeringen. |
| `PrivacyInfo.xcprivacy` | Se [avsnitt 8](#8-integritet-app-privacy-och-data-safety). Ligger i appmålet (Copy Bundle Resources). |
| Byggen | `TARGETED_DEVICE_FAMILY = 1` (**bara iPhone**), `SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO`, `SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD = NO`, `IPHONEOS_DEPLOYMENT_TARGET = 16.4`, `MARKETING_VERSION = 1.0.0` |
| Schema | Delat schema `App` (`xcshareddata/xcschemes/App.xcscheme`) – krävs av Codemagic och `xcodebuild -scheme App` |

- **iOS 16.4 eller senare**: Tailwind CSS v4 (appens stilar) kräver Safari 16.4. Capacitor 8 klarar
  iOS 15, men där skulle appen se trasig ut.
- **Bara iPhone:** en iPad kan ändå installera iPhone-appar i kompatibilitetsläge, och Apple kan
  granska appen på en iPad – den ska fungera där (den ser ut som på en stor iPhone). På Mac med
  Apple-chip och Vision Pro är appen avstängd via byggflaggorna ovan; kontrollera också
  *Pricing and Availability* i App Store Connect.
- **Säkerhetskopior:** telefonens egen iCloud-säkerhetskopia tar med appens data (webbvyns
  lagring), om användaren har den påslagen. Det styrs av användaren – integritetspolicyn nämner
  det. Den automatiska kopian (`lagom-spegling.json`) ligger däremot i `Library/NoCloud` och följer
  inte med – den ska bara skydda mot att lagringen rensas på samma telefon, och inte bli en andra
  kopia av dagboken (med vikter från Apple Hälsa) i säkerhetskopian. Kopior från de första
  testbyggena (i `Documents`) läses som reserv och tas bort när en ny kopia har skrivits.
- Xcode 26 (iOS 26-SDK) krävs för uppladdning till App Store sedan april 2026.
- Swift-paketen hämtas från GitHub vid första bygget (`capacitor-swift-pm` låst till 8.5.2,
  `OSBarcodeLib-iOS` och `ion-ios-filesystem` från tilläggen). Checka in
  `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` efter första
  lyckade bygget, så att samma versioner används varje gång – molnbyggena sparar den som artefakt
  (`lagom-ios-package-resolved…`).

## 6. Android-projektet (android/)

Skapat med `npx cap add android`. Inställningar:

| Var | Inställning |
| --- | --- |
| `variables.gradle` | `minSdkVersion` **26** (Android 8.0 – Health Connect och streckkodsläsaren kräver det; Capacitor 8 själv klarar 24), `compileSdkVersion`/`targetSdkVersion` **36** |
| `app/build.gradle` | `namespace`/`applicationId` `se.lagomappen.lagom`; `versionName` från `package.json`; `versionCode` från `-PlagomVersionCode=<nummer>` (standard 1); uppladdningsnyckel från miljövariablerna `LAGOM_UPLOAD_KEYSTORE`, `…_KEYSTORE_PASSWORD`, `…_KEY_ALIAS`, `…_KEY_PASSWORD` (bara i molnbygget, aldrig i Git); `useLegacyPackaging = false` (16 KB) |
| `AndroidManifest.xml` | `allowBackup="false"` + `data_extraction_rules.xml` (ingen automatisk molnkopia till Google Drive – dagboken stannar på telefonen; överföring direkt till en ny telefon fungerar), `usesCleartextTraffic="false"`, porträtt |
| Tema | `values/colors.xml` och `values-night/colors.xml`: gran `#1F5A43`, bakgrund `#F6F3EC`, mörk bakgrund `#0B1210`; `Theme.AppCompat.DayNight` |
| `file_paths.xml` | FileProvider för exportmappen i cachen (`Directory.Cache/delning/`) och för `Pictures/` i appens externa filmapp (`external-files-path`, där kameraappen skriver framstegsbildens tillfälliga original – `clearCameraCaptures` tar bort den direkt efter nedskalningen och annars vid nästa start) – aldrig filmappen, där den automatiska kopian av dagboken och framstegsbilderna ligger |
| `<queries>` | Avsikten `android.media.action.IMAGE_CAPTURE`: "Ta en bild" för framstegsbilder (`<input capture>`) öppnar kameraappen via Capacitors filväljare, som på Android 11+ bara hittar kameran när avsikten är deklarerad. Utan den faller knappen tillbaka till filväljaren |

Webbvyn är telefonens *Android System WebView* (uppdateras via Google Play). Appens stilar
(Tailwind CSS v4) kräver version 111 eller senare, och CSP:n förutsätter att webbvyn kan lägga in
Capacitors brygga utan inbäddat skript (`DOCUMENT_START_SCRIPT`, finns i alla så nya webbvyer).

### Behörigheter

| Behörighet | Varför |
| --- | --- |
| `INTERNET` | Open Food Facts, receptimport, serverfunktionerna |
| `CAMERA` (+ `uses-feature` kamera, inte krav) | Streckkodsläsaren och framstegsbilderna ("Ta en bild") |
| `POST_NOTIFICATIONS` | Lokala påminnelser (Android 13+ frågar) |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` (från tillägget) | Påminnelserna finns kvar efter omstart |
| `VIBRATE` (från tillägget) | Haptik |
| `com.android.vending.BILLING` (från Play Billing) | Köp i appen |
| `health.READ_WEIGHT`, `health.WRITE_WEIGHT`, `health.READ_STEPS`, `health.WRITE_NUTRITION`, `health.WRITE_HYDRATION` | Health Connect: läsa vikt och steg; skriva vikt, energi från måltider och vatten |

**Borttaget** med `tools:node="remove"`: `SCHEDULE_EXACT_ALARM` och `USE_EXACT_ALARM` (Google Play
kräver en särskild deklaration och påminnelser behöver inte exakt tid – schemalägg med
`isExactNotification: false`, annars öppnar tillägget inställningen "Alarm och påminnelser"), och
de ca 40 hälsobehörigheter som `@capgo/capacitor-health` deklarerar men Lagom inte använder (bl.a.
`READ_ACTIVE_CALORIES_BURNED`). ML Kits `MlKitInitProvider` tas också bort (se avsnitt 2).
Ändras datatyperna i Hälsa-funktionen: ändra listan i manifestet och deklarationen i Play Console.

### Health Connect

- **Integritetspolicyn i behörighetsfrågan:** Health Connect öppnar tilläggets aktivitet
  (`PermissionsRationaleActivity`, och på Android 14+ aliaset `ViewPermissionUsageActivity`), som
  visar `health_connect_privacy_policy_url` i en egen webbvy som följer länkar. `npm run
  build:android` pekar den till `file:///android_asset/public/privacypolicy.html`
  (`scripts/native-config.mjs`): integritetspolicyn för Android-appen, som Google Play-bygget lägger
  i appens paket (skapad ur `legalContent.ts`, samma som `public/integritet/android/`). Den fungerar
  utan uppkoppling och har inga länkar vidare till webbplatsens villkor med webbpriser. I Play
  Console anges webbplatsens adress (`https://<domän>/integritet/`).
- **Play Console → Appinnehåll → Hälsoappar / Health Connect:** deklarera varje datatyp med
  motivering, t.ex.:
  - *Vikt (läsa/skriva):* "Visar viktkurvan i Lagom och sparar vikt som användaren loggar i Health Connect, om användaren vill."
  - *Steg (läsa):* "Visar dagens steg i Lagoms träningsvy. Användaren kan själv lägga till steg utöver sin vardag som aktivitet."
  - *Näring och vatten (skriva):* "Sparar energi från loggade måltider och druckna glas i Health Connect när dagen är avslutad, om användaren vill."
- Data från Health Connect sparas bara på telefonen och skickas inte vidare – enligt Googles
  definition samlas den alltså inte in (Data safety), men den ska ändå beskrivas i
  integritetspolicyn (Health Connect-kravet), se avsnitt 10.

### 16 KB-sidor

Google Play kräver att appar för Android 15+ fungerar med 16 KB minnessidor. Capacitor och de
flesta tillägg har ingen egen maskinkod; det som har det är **ML Kit** (streckkodsläsaren). Android
Gradle Plugin 8.13 lägger okomprimerade bibliotek på 16 KB-gränser; att biblioteken själva är
byggda för 16 KB kontrolleras i CI med `node scripts/check-android-16kb.mjs <apk|aab>` (läser
ELF-rubrikerna direkt, inga paket). Det gick inte att kontrollera lokalt – Googles Maven-arkiv
(dl.google.com) är spärrat i utvecklingsmiljön. Misslyckas kontrollen: uppdatera
`@capacitor/barcode-scanner` (eller ML Kit-versionen) innan inskickningen.

## 7. Ikoner och startskärmar

`npm run native:assets` (`scripts/generate-native-assets.mjs`, samma Playwright-rendering som
`scripts/generate-icons.mjs`, inga nya paket):

- **Android:** adaptiv ikon – grön bakgrund (`ic_launcher_background`), märket som förgrund
  (`mipmap-*/ic_launcher_foreground.png`, inom säkra zonen) och en tonad variant för Android 13+
  (`drawable/ic_launcher_monochrome.xml`). Notisikonen är en vit siluett av märket
  (`drawable/ic_stat_lagom.xml`). Startskärmen är ikonen på appens bakgrund, ljus eller mörk
  (`values/styles.xml`), utan egna bilder.
- **iPhone:** appikonen är `store-assets/app-store-icon-1024.png` (utan alfakanal); startskärmen
  är ikonen mitt på `#F6F3EC` eller, i mörkt läge, `#0B1210` (`Splash.imageset`).

Ändras `public/icon.svg`: kör `node scripts/generate-icons.mjs` och sedan `npm run native:assets`.
Vektorerna (notisikon, tonad ikon) följer märkets koordinater i `icon.svg` och ändras för hand.

## 8. Integritet: App Privacy och Data safety

### PrivacyInfo.xcprivacy (iPhone)

| Nyckel | Värde | Varför |
| --- | --- | --- |
| `NSPrivacyTracking` | false | Ingen spårning, ingen reklam |
| `NSPrivacyTrackingDomains` | tom | – |
| `NSPrivacyCollectedDataTypes` | **Search History** – inte kopplad till personen, ingen spårning, *App Functionality* | Sökord och streckkoder skickas till Open Food Facts (samma som App Privacy, [APP-STORE.md §7](APP-STORE.md#7-app-privacy-integritetsetiketten)) |
| `NSPrivacyAccessedAPITypes` | **File timestamp – C617.1** | `@capacitor/filesystem` (via `IONFilesystemLib`) läser filers tidsstämplar i appens egna mappar |
| | **UserDefaults – CA92.1** | Försiktighetsåtgärd: `OSBarcodeLib` och `IONFilesystemLib` har inga egna manifest. Capacitor själv och de andra tilläggen använder inga "required reason"-API:er (genomsökt); Capacitors egna manifest är tomma. |

Apple mejlar vid uppladdningen (ITMS-91053) om ett API saknas – lägg då till det här.

### App Privacy (App Store Connect) och Data safety (Play Console)

Oförändrat mot [APP-STORE.md §7](APP-STORE.md#7-app-privacy-integritetsetiketten) och
[GOOGLE-PLAY.md §8](GOOGLE-PLAY.md#8-appinnehåll--formulären-i-play-console): bara **sökhistorik**
(till Open Food Facts), inte kopplad, ingen spårning. De nya funktionerna ändrar inte det – utom
Google ML Kit i Android-appens streckkodsläsare (se tabellen):

| Funktion | Lämnar data telefonen? | Redovisas som insamling? |
| --- | --- | --- |
| Köp i appen (`@capgo/native-purchases`) | Bara mellan telefonen och Apple/Google – Lagom får inga köpuppgifter | Nej |
| Apple Hälsa / Health Connect | Nej – läses och skrivs på telefonen | Nej (men beskrivs i integritetspolicyn) |
| Streckkodsläsaren | Bilden tolkas på telefonen och sparas inte; bara streckkoden skickas till Open Food Facts (som förut). Android läser med **ZXing** och iPhone med **Vision** – inget av dem skickar något. (Google ML Kit, som skulle skicka driftdata till Google, används inte.) | Sökhistorik (som förut). Byts läsaren till ML Kit tillkommer *Diagnostik* och *Enhets-id* i Data safety, se [GOOGLE-PLAY.md §8](GOOGLE-PLAY.md#datasäkerhet-data-safety). |
| Påminnelser | Nej – lokala notiser, ingen pushtjänst | Nej |
| Export/delning | Bara dit användaren själv väljer | Nej |
| Automatisk kopia (`lagom-spegling.json`) | Nej – en fil i appens mapp. På iPhone i `Library/NoCloud`, som inte följer med i iCloud- eller datorsäkerhetskopian; på Android undantagen från Googles molnkopia (`data_extraction_rules.xml`) | Nej (beskrivs i integritetspolicyn) |
| De senast kända köpen (`lagom-butikskop`) | Nej – localStorage i appen (produkt, köpdatum, slutdatum), så att köpen gäller utan uppkoppling | Nej (beskrivs i integritetspolicyns lagringstabell) |
| Framstegsbilder (`src/native/photos.ts`, `src/lib/progressPhotos.ts`) | Nej – nedskalade JPEG utan EXIF/GPS i appens mapp (`framsteg/`, `index.json`): `Library/NoCloud` på iPhone (utanför iCloud- och datorsäkerhetskopian), appens filmapp på Android (undantagen från Googles molnkopia, `data_extraction_rules.xml`). Ingen delning, inte i säkerhetskopian eller speglingen, inget moln. Android: kamerans tillfälliga original (`Pictures/JPEG_*.jpg` i appens externa filmapp) tas bort direkt efter nedskalningen, och annars vid nästa start av appen | Nej – bilderna lämnar aldrig enheten, så de samlas inte in (varken *Photos* i App Privacy eller *Photos and videos* i Data safety); beskrivs i integritetspolicyns lagringstabell |

## 9. Molnbyggen: kontroll, signering och uppladdning

Själva apparna byggs i molnet – Xcode finns bara på macOS och Android SDK behövs inte lokalt.

| Fil | Körs | Gör | Signerar och laddar upp? |
| --- | --- | --- | --- |
| `.github/workflows/native.yml` | Pull requests och push till `main` som rör appskalet; iPhone bara på begäran | Android: debug-APK (kan installeras för test), osignerad release-AAB, 16 KB-kontroll. iPhone: simulatorbygge med Xcode 26 och `Package.resolved` som artefakt | **Nej** – testbygge (`LAGOM_ALLOW_STORE_WITHOUT_IAP=1`), testvärden när Variables saknas, inga hemligheter |
| `.github/workflows/release.yml` | Tagg `v*` (t.ex. `v1.0.0`) och för hand (*Actions → Butiksbyggen → Run workflow*) | Signerad AAB → Google Play, intern testning; signerad IPA → TestFlight | **Ja** – varje app bara när dess hemligheter finns |
| `codemagic.yaml` | iPhone: tagg `v*` och för hand; Android: för hand | Samma som `release.yml`, på Codemagics Mac mini M2 (gratisnivån) | **Ja** |

Använd **en tjänst per app** (rekommendation: Android i GitHub Actions, iPhone i Codemagic så länge
repot är privat – se [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md)). Taggar du en version startar
båda; `release.yml` hoppar över en app vars hemligheter inte finns i GitHub.

### native.yml – kontrollbygget

- **Bevakade sökvägar** (samma lista för pull requests och `main`): `android/**`, `ios/**`,
  `capacitor.config.ts`, `package.json`, `package-lock.json`, `.nvmrc`, `vite.config.ts` (bygget
  och byggkontrollen), `src/native/**`, `src/lib/storePurchases.ts` och
  `scripts/commerce-guard.ts` (kan stoppa butiksbygget), `scripts/native-config.mjs`,
  `scripts/check-android-16kb.mjs` och arbetsflödet självt. Ändringar i resten av webbkoden
  kontrolleras av `ci.yml`.
- **macOS bara på begäran:** *Actions → Native-appar → Run workflow → Bygg även iPhone-appen*.
  macOS-minuter räknas tio gånger i privata repon.
- Webbdelen byggs som testbygge; dina riktiga säljaruppgifter används om de finns som Variables.

### release.yml – de signerade butiksbyggena

1. **Förutsättningar** (Linux, några sekunder): kontrollerar vilka hemligheter som finns, att
   webbdelens variabler finns och att `VITE_COMMERCE_MODE` är `live` (i testläge godtas
   osignerade testlicenser – i Play-appen och från säkerhetskopior), och att en tagg stämmer med
   `package.json`. Saknas en apps hemligheter hoppas den över med en förklaring i körningens
   sammanfattning; ett fel i variablerna stoppar allt innan någon macOS-maskin startas.
2. **Android** (Linux): `npm run build:android` (skarpt), uppladdningsnyckeln avkodas och
   kontrolleras (`keytool`), Gradle `bundleRelease -PlagomVersionCode=<nr>`, signaturen
   kontrolleras (`jarsigner`) och fingeravtrycket skrivs i sammanfattningen, 16 KB-kontrollen,
   AAB:n sparas som artefakt (30 dagar) och laddas – om tjänstkontot finns – upp till **intern
   testning** (`r0adkll/upload-google-play`, låst till en commit). Nyckelfilen raderas efteråt.
3. **iPhone** (macOS 26, Xcode 26): `npm run build:ios` (skarpt), `codemagic-cli-tools` 0.69.0
   (låst version) hämtar – eller skapar första gången – distributionscertifikatet och en
   App Store-profil via API-nyckeln, `xcode-project build-ipa` arkiverar och exporterar med
   version och byggnummer, IPA:n kontrolleras (Bundle ID, version, byggnummer, HealthKit),
   sparas som artefakt och laddas upp till **TestFlight**. Varför inte Xcodes egen molnsignering:
   se [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md#varför-inte-xcodes-egen-molnsignering).

För hand kan du välja app (`alla`, `android`, `iphone`), stänga av uppladdningen (då blir det bara
artefakter) och markera iPhone-bygget som *bara intern test* – ett sådant bygge kan aldrig skickas
in för granskning.

### Hemligheter och variabler

*GitHub: repot → Settings → Secrets and variables → Actions.* Hemligheterna används bara i de steg
som signerar eller laddar upp – aldrig under `npm ci` eller webbygget, och aldrig för pull
requests.

| Hemlighet (GitHub *Secrets*) | Vad | I Codemagic |
| --- | --- | --- |
| `LAGOM_UPLOAD_KEYSTORE_BASE64` | Uppladdningsnyckeln (`lagom-upload.jks`) i base64 | Android keystore med referensen `lagom_upload` |
| `LAGOM_UPLOAD_KEYSTORE_PASSWORD` | Nyckelfilens lösenord | (i keystoren) |
| `LAGOM_UPLOAD_KEY_ALIAS` | Nyckelns alias, `lagom-upload` | (i keystoren) |
| `LAGOM_UPLOAD_KEY_PASSWORD` | Nyckelns lösenord (samma som filens i PKCS12) | (i keystoren) |
| `PLAY_SERVICE_ACCOUNT_JSON` | Valfri: tjänstkontots JSON-nyckel för uppladdning till Google Play | `GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS` i gruppen `google_play` |
| `APP_STORE_CONNECT_ISSUER_ID` | API-nyckelns *Issuer ID* | Integrationen `Lagom` (Developer Portal) |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | API-nyckelns *Key ID* | Integrationen `Lagom` |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Innehållet i `.p8`-filen | Integrationen `Lagom` |
| `CERTIFICATE_PRIVATE_KEY` | Distributionscertifikatets privata RSA-nyckel | `CERTIFICATE_PRIVATE_KEY` i gruppen `app_store` |

`android/app/build.gradle` läser uppladdningsnyckeln från miljövariablerna
`LAGOM_UPLOAD_KEYSTORE` (sökvägen – sätts av bygget), `LAGOM_UPLOAD_KEYSTORE_PASSWORD`,
`LAGOM_UPLOAD_KEY_ALIAS` och `LAGOM_UPLOAD_KEY_PASSWORD`.

| Variabel (GitHub *Variables*) | Vad |
| --- | --- |
| `VITE_API_BASE` | Webbplatsens `https://`-adress (serverfunktionerna, Health Connects integritetslänk) |
| `VITE_COMMERCE_MODE` | `live` – krävs i butiksbyggena |
| `VITE_LICENSE_PUBLIC_KEYS` (eller `VITE_LICENSE_PUBLIC_KEY`) | Samma publika licensnyckel som på Netlify |
| `VITE_SELLER_NAME`, `VITE_SELLER_ADDRESS`, `VITE_SELLER_PHONE`, `VITE_SUPPORT_EMAIL` | Säljarens uppgifter (krävs) |
| `VITE_SELLER_ORGNR`, `VITE_SELLER_VAT` | Frivilliga (se docs/BETALNING.md) |
| `LAGOM_BUILD_NUMBER_OFFSET` | Valfri: läggs till körningens nummer (standard 0) |
| `PLAY_RELEASE_STATUS` | Valfri: `draft` så länge Play Console kräver utkast (appen har aldrig släppts på något spår); annars `completed` |

I Codemagic ligger webbdelens variabler i gruppen `lagom_bygge` (plus `APP_STORE_APPLE_ID` och
valfritt `LAGOM_INTERN_TESTFLIGHT` i `app_store`) – se kommentaren överst i `codemagic.yaml`.

### Version och byggnummer

- **Version** (1.0.0): `version` i `package.json` för båda apparna. Höj den, committa och tagga
  `v<version>` – en tagg som inte stämmer stoppar bygget.
- **Byggnummer** (versionCode, CFBundleVersion – måste öka för varje uppladdning):
  GitHub Actions: körningens nummer (`github.run_number`) + `LAGOM_BUILD_NUMBER_OFFSET`.
  Codemagic: butikens senaste + 1 (App Store Connect med `APP_STORE_APPLE_ID`, Google Play med
  tjänstkontot), annars Codemagics räknare + offset. Byter du tjänst: höj offset över det senaste
  numret i butiken.

### Vad som kontrolleras – och vad som inte kunde provas här

Byggena kontrollerar byggkontrollen (`scripts/commerce-guard.ts`), variablerna, taggen, att
uppladdningsnyckeln går att öppna, att AAB:n är signerad (och med vilken nyckel), 16 KB-sidorna,
och att IPA:n har rätt Bundle ID, version, byggnummer och HealthKit. Arbetsflödena är kontrollerade
med `actionlint` och `shellcheck`, förutsättningssteget och Android-signaturkontrollerna är provade
lokalt, och `src/native/storeBuilds.test.ts` håller filerna i takt med projekten. Själva Gradle-
och Xcode-stegen kan bara provas i en riktig körning – räkna med att första körningen av varje app
kan behöva en justering.

## 10. Steg för steg för ägaren (utan Mac)

Ordningen nedan tar ungefär en månad, mest på grund av Googles slutna test (14 dagar) och Apples
kontroll av kontot. Allt görs i webbläsaren på en Windows-dator eller Mac – ingen Mac krävs.
Bocka av i [lanseringslistan](LANSERING.md).

### 1. Konton (vecka 1 – börja direkt, det tar några dagar)

1. **Apple Developer Program** (developer.apple.com/programs): *Individual*, 99 USD per år, ett
   Apple-ID med tvåstegsverifiering. Apple kontrollerar din identitet – det kan ta några dagar.
   Godkänn sedan **Paid Apps Agreement** och fyll i bank och skatteformulär (W-8BEN) i App Store
   Connect → *Business* ([APP-STORE.md §2](APP-STORE.md#2-konto-och-avtal)).
2. **Google Play Console** (play.google.com/console): *Personligt konto*, 25 USD en gång,
   id-kontroll och en Android-telefon med appen Play Console. Skapa sedan
   **betalningsprofilen** ([GOOGLE-PLAY.md §2](GOOGLE-PLAY.md#2-konto-och-avtal)).
3. **GitHub** (har du) och, för iPhone-bygget, **Codemagic** (codemagic.io, logga in med GitHub)
   – eller bara GitHub om repot är publikt.
4. En **lösenordshanterare** (t.ex. Bitwarden) för nycklarna nedan.

### 2. Bekräfta app-id:t

`se.lagomappen.lagom` ([avsnitt 1](#1-att-bekräfta-innan-första-uppladdningen)). Vill du ha ett
annat: säg till innan något skapas hos Apple eller Google – efter första uppladdningen går det
aldrig att ändra.

### 3. Apple: Bundle ID, appen och nycklarna

1. **Bundle ID** med **HealthKit** (utan *Clinical Health Records*) – steg i
   [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md#det-här-behövs-oavsett-tjänst).
2. **Appen i App Store Connect** (*Appar → + → Ny app*: iOS, `Lagom`, svenska,
   `se.lagomappen.lagom`, SKU `lagom-ios`) – [APP-STORE.md §3](APP-STORE.md#3-skapa-appen-i-app-store-connect).
3. **App Store Connect API-nyckel** med rollen **App Manager** (`.p8`, *Key ID*, *Issuer ID*).
4. **Certifikatnyckeln**: `ssh-keygen -t rsa -b 2048 -m PEM -f lagom_ios_distribution_key -q -N ""`
   (Git Bash).
5. Lägg in dem i **Codemagic** (integrationen `Lagom` och gruppen `app_store`) **eller** som
   hemligheter i GitHub (tabellen i [avsnitt 9](#hemligheter-och-variabler)) – inte båda.

### 4. Produkterna i App Store Connect

*App Store Connect → Lagom → Monetisering → Köp i appen → +*. Id:na måste vara exakt dessa:

| Referensnamn | Produkt-id | Typ | Pris | Visningsnamn / beskrivning (svenska) |
| --- | --- | --- | --- | --- |
| Livstidslicens | `livstid` | **Non-Consumable** | 699 kr (eller närmaste prisnivå) | `Livstidslicens` / `Allt i Lagom. För alltid – felrättningar ingår.` |
| Årslicens | `ar` | **Non-Renewing Subscription** | 349 kr (eller närmaste prisnivå) | `Årslicens` / `Allt i Lagom i ett år. Förnyas inte automatiskt.` |
| 14 dagars provperiod | `prov14` | **Non-Consumable** | **0 kr** (gratis) | `14 dagars provperiod` / `Prova allt i Lagom i 14 dagar. Inget dras.` |

Priset väljs med Sverige som bas (inklusive moms), tillgänglighet **bara Sverige**, och varje
produkt behöver en granskningsbild (skärmdump av Lagom Premium – för `prov14` kortet "Starta din
provperiod" på Idag eller välkomstflödets sista steg). Första gången skickas alla tre produkterna
in **tillsammans med appversionen** – appen köper `prov14` när provperioden startas (riktlinje
3.1.1), så den måste finnas. Detaljer: [APP-STORE.md §6](APP-STORE.md#6-köp-i-appen-och-priser).

### 5. Google: appen, uppladdningsnyckeln och första versionen

1. **Skapa appen** i Play Console ([GOOGLE-PLAY.md §4](GOOGLE-PLAY.md#4-skapa-appen-i-play-console)).
2. **Uppladdningsnyckeln**: skapa `lagom-upload.jks` med `keytool` och lägg in de fyra
   hemligheterna i GitHub ([GOOGLE-PLAY.md §11](GOOGLE-PLAY.md#11-uppladdningsnyckeln-och-play-app-signing)).
   Säkerhetskopiera filen och lösenordet på två ställen.
3. **Första bygget**: *Actions → Butiksbyggen → Run workflow* (`android`). Hämta AAB:n under
   *Artifacts* och ladda upp den för hand till **Intern testning**; godkänn **Play App Signing**.
   Jämför uppladdningsnyckelns fingeravtryck i körningens sammanfattning med Play Console.
4. **Produkterna** (nu går det, eftersom en version med köpbehörigheten finns): *Tjäna pengar med
   Play → Produkter → Engångsprodukter*:

   | Produkt-id | Typ | Köpalternativ | Pris |
   | --- | --- | --- | --- |
   | `livstid` | Engångsprodukt | Köp (*Buy*) | 699 kr, bara Sverige |
   | `ar` | Engångsprodukt (inte prenumeration) | Köp (*Buy*) | 349 kr, bara Sverige |

   Aktivera produkterna och köpalternativen. `prov14` behövs inte i Google Play. Detaljer:
   [GOOGLE-PLAY.md §7](GOOGLE-PLAY.md#7-köp-i-appen-och-priser).
5. **Tjänstkontot** (valfritt, så att molnbygget laddar upp själv): [GOOGLE-PLAY.md §11](GOOGLE-PLAY.md#tjänstekonto-för-uppladdning-valfritt)
   → hemligheten `PLAY_SERVICE_ACCOUNT_JSON`.

### 6. Testa köpen (sandlådan och licenstestare)

- **iPhone:** TestFlight-byggen köper i Apples sandlåda med testarens eget Apple-ID – gratis, men
  ett köp av `livstid` kan inte göras om. Testa i ordningen provperiod → `ar` → `livstid`, och be
  en vän med ett annat Apple-ID göra samma sak. Sandlådekonton (*Användare och åtkomst →
  Sandlåda → Testkonton*) går att nollställa, men inloggningen (*Inställningar → Utvecklare*)
  visas normalt bara på telefoner som har använts med Xcode. [APP-STORE.md §6](APP-STORE.md#testa-köpen-testflight-och-sandlådan).
- **Android:** lägg dig själv (och testarna) som **licenstestare** (*Konfigurera →
  Licenstestning*, RESPOND_NORMALLY). Köp med testkorten – inget dras.
  [GOOGLE-PLAY.md §7](GOOGLE-PLAY.md#testa-köpen-med-licenstestare).
- Prova på båda: köp `ar` och `livstid`, avbrutet köp, *Återställ köp* efter ominstallation,
  butikens priser före provperioden, och att Lagom är upplåst i flygplansläge efter ett köp. På
  iPhone också: provperioden startas med "Starta 14 dagar gratis" (köpet `prov14`), ett avbrutet
  provköp startar inget, provperioden kommer tillbaka med *Återställ köp* efter ominstallation (och
  börjar inte om), och ett år som köps i förväg förlänger årslicensen med ett helt år. Fungerar
  något inte: sätt `NATIVE_PURCHASES_READY` till false (så stoppas butiksbyggena) och säg till.
  Köpen måste vara provade så här **innan** någon version skickas in för granskning – molnbyggena
  laddar bara upp till TestFlight och Googles interna test, aldrig till granskning.

### 7. TestFlight

1. Tagga en version (`git tag v1.0.0 && git push origin v1.0.0`) eller starta iPhone-bygget för
   hand i Codemagic/GitHub.
2. *App Store Connect → TestFlight → Interna testare*: skapa en grupp med dig själv och slå på
   automatisk distribution. Installera **TestFlight** på iPhonen.
3. Testa listan i [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md#testflight--testa-på-din-iphone):
   exempeldata, egen profil, streckkodsläsaren, köp, Återställ köp, Apple Hälsa, påminnelser,
   export, radering, utan uppkoppling.

### 8. Googles slutna test (12 testare i 14 dagar)

1. Samla 15–20 personer med Android-telefon och en Google-grupp för dem.
2. Flytta en version från intern testning till **Sluten testning** med gruppen och Sverige.
3. Skicka anmälningslänken; ingen får lämna testet under 14 dagar i följd.
4. Ansök om produktion efter 14 dagar. Hela planen:
   [GOOGLE-PLAY.md §3](GOOGLE-PLAY.md#3-sluten-test-med-12-testare-krav-före-produktion).

Starta den slutna testen så tidigt som möjligt – den bestämmer när Android-appen kan släppas.

### 9. Formulären och inskickningen

- **App Store:** butikstexter, skärmdumpar, App Privacy, åldersklassning, granskningsanteckningar
  och checklistan i [APP-STORE.md](APP-STORE.md) (§4–13).
- **Google Play:** butikstexter, grafik, Data safety, **Health apps-deklarationen** med de fem
  Health Connect-typerna, IARC, målgrupp 18+ och checklistan i [GOOGLE-PLAY.md](GOOGLE-PLAY.md)
  (§5–13).
- **Streckkodsläsaren på Android** läser med ZXing, och ML Kits startprovider är borttagen – svaren
  i Data safety gäller som de står ([GOOGLE-PLAY.md §8](GOOGLE-PLAY.md#datasäkerhet-data-safety)).
- **Lagom Moln** får inte följa med i butiksbyggena: byggkontrollen stoppar ett butiksbygge med
  `VITE_SUPABASE_URL` (se [BACKEND.md](BACKEND.md)). Sätt inte Netlifys Supabase-variabler i
  GitHub eller Codemagic.

### Android Studio på en PC (valfritt)

Behövs inte – molnbygget gör allt – men är bra för att provköra appen i en emulator eller på din
telefon med kabel.

1. Installera **Android Studio** (senaste stabila, developer.android.com/studio). Den har med
   Java 21 och SDK Manager. Öppna *SDK Manager* och installera **Android 16 (API 36)** och
   *Android SDK Build-Tools*. Installera också **Node.js 22** (som `.nvmrc`) och **Git for
   Windows** (Git Bash).
2. I Git Bash, i repot:

   ```sh
   npm ci
   npx cap telemetry off        # en gång
   VITE_API_BASE=https://lagom.invalid \
   VITE_SELLER_NAME="Testbygge" VITE_SELLER_ADDRESS="Testgatan 1, 123 45 Teststad" \
   VITE_SELLER_PHONE="000-000 00 00" VITE_SUPPORT_EMAIL="ci@users.noreply.github.com" \
   LAGOM_ALLOW_STORE_WITHOUT_IAP=1 npm run build:android
   ```

   (Använd dina riktiga uppgifter och `VITE_API_BASE` om du vill prova serverfunktionerna.)
3. Android Studio → *Open* → mappen `android/`. Vänta tills Gradle har synkat klart (första gången
   hämtas mycket).
4. **Emulator:** *Device Manager → +* → en Pixel med en systembild **med Google Play** (API 36) –
   då finns Health Connect. **Telefon:** slå på *Utvecklaralternativ → USB-felsökning* och anslut
   med kabel. Tryck på ▶ (*Run 'app'*).
5. Efter varje ändring i webbkoden: kör kommandot i steg 2 igen (eller `npx cap sync android`
   efter ett eget `vite build`) och tryck på ▶.

Att tänka på: köp fungerar bara i en app som installerats från Google Play av en licenstestare
(inte från Android Studio). Butiksbyggen ska göras i molnet – då behöver uppladdningsnyckeln aldrig
ligga på datorn. Har du någon gång tillgång till en Mac med Xcode 26: `npm run build:ios` och
`npx cap open ios` öppnar iPhone-projektet på samma sätt.

## 11. Kvar att göra

- [ ] **Ägaren:** bekräfta app-id:t `se.lagomappen.lagom` (avsnitt 1) innan Bundle ID skapas.
- [ ] **Ägaren:** konton, nycklar, produkter, testning och formulär enligt avsnitt 10 och
      [LANSERING.md](LANSERING.md).
- [ ] Köpen provade på riktiga telefoner (TestFlight och Play-testning) – annars
      `NATIVE_PURCHASES_READY = false`.
- [x] Streckkodsläsaren på Android: ZXing i stället för ML Kit (`ANDROID_SCANNING_LIBRARY`), och
      ML Kits `MlKitInitProvider` borttagen i manifestet. Prova läsningen i svagt ljus på en riktig
      telefon.
- [x] Provperioden i iPhone-appen startas med köpet `prov14` (riktlinje 3.1.1), årslicenser som
      köps i förväg läggs efter varandra, och de senast kända köpen sparas på telefonen.
- [x] Aktiv energi läses inte (behörigheterna hålls till det som används), och energi och vatten
      skickas till Hälsa/Health Connect först när dagen är avslutad.
- [x] Integritetspolicyn (`src/features/legal/legalContent.ts`): Apple Hälsa och Health Connect,
      påminnelser, den automatiska kopian och exportfilerna i lagringstabellen, att telefonens
      egen säkerhetskopia (iCloud) kan innehålla appens data (men inte den automatiska kopian),
      streckkodsläsaren i apparna, köp direkt mellan telefonen och butiken, de sparade köpen
      (`lagom-butikskop`) och en egen text för Google Play-appen (även som fristående sida för
      Health Connect).
- [ ] Prova på riktiga telefoner (TestFlight och Play-testning), utöver köpen:
      - påminnelser: frågan om notiser (Android 13+ och iPhone), att de kommer i tid, att ett tryck
        öppnar rätt sida, kanalen "Påminnelser" och att de finns kvar efter omstart,
      - Apple Hälsa/Health Connect: behörighetsarket, att vikter och steg hamnar rätt, att energi
        och vatten syns i Hälsa/Health Connect utan dubbletter, och att Lagoms egna vikter inte
        hämtas tillbaka; integritetssidan i Health Connect (`health_connect_privacy_policy_url`,
      ska visa appens egen `privacypolicy.html` även i flygplansläge),
      - export och delning ("Spara i Filer" på iPhone), och att den automatiska kopian återställs
        efter att appens lagring rensats,
      - bakåtknappen och bakåtgesten på Android, statusfältets färg vid byte av tema, raden med
        "Klar" ovanför sifferfälten på iPhone, villkorslänken i köparket,
      - streckkodsläsaren (ZXing) i svagt ljus, nekad kamera (dialogen på svenska på iPhone),
      - att ett långt tryck på en produktbild inte ger någon meny (iPhone och Android),
      - den automatiska kopian: stäng frågan "Vi hittade din data" – den går bara att besvara med
        knapparna, och "Börja om" frågar en gång till.
- [ ] Kontrollera i CI i det sammanslagna Android-manifestet (`app/build/intermediates/merged_manifests`)
      att bara de fem hälsobehörigheterna finns kvar, att `MlKitInitProvider` saknas och att
      `PermissionsRationaleActivity` och `ViewPermissionUsageActivity` finns med.
- [ ] Första körningen av `release.yml` (eller Codemagic) för varje app – kontrollera att
      signering, 16 KB-kontrollen och uppladdningen går igenom, och checka in `Package.resolved`.
