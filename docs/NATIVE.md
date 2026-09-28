# De inbyggda apparna (Capacitor 8)

Lagom finns som inbyggd app i **App Store (bara iPhone)** och **Google Play (Android)**. Båda är
[Capacitor 8](https://capacitorjs.com)-appar runt samma webbkod som webbversionen, byggd med
`VITE_DISTRIBUTION=appstore|play` till `dist-native/`. Webbversionen (`dist/`) påverkas inte.

Det här dokumentet beskriver grunden: paketen, projekten `ios/` och `android/`, byggkommandona,
behörigheter, integritetsmanifestet och underlaget till butikernas integritetsformulär. Butikernas
formulär och texter i övrigt: [APP-STORE.md](APP-STORE.md), [GOOGLE-PLAY.md](GOOGLE-PLAY.md) och
[IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md).

> **Läget (2026-09-28):** grunden är på plats – projekten, ikoner, startskärmar, behörigheter,
> integritetsmanifest och byggkommandon. Funktionerna (köp i appen, delning, påminnelser,
> streckkodsläsare, Hälsa, haptik, statusfält, bakåtknapp) kopplas in i `src/native/` i nästa
> steg. Tills köpen fungerar på en riktig telefon stoppar byggkontrollen alla butiksbyggen utom
> testbyggen (`NATIVE_PURCHASES_READY` i `src/lib/storePurchases.ts`).

## Innehåll

1. [Att bekräfta innan första uppladdningen](#1-att-bekräfta-innan-första-uppladdningen)
2. [Paketen och varför](#2-paketen-och-varför)
3. [Bygga](#3-bygga)
4. [Koden: src/native/](#4-koden-srcnative)
5. [iPhone-projektet (ios/)](#5-iphone-projektet-ios)
6. [Android-projektet (android/)](#6-android-projektet-android)
7. [Ikoner och startskärmar](#7-ikoner-och-startskärmar)
8. [Integritet: App Privacy och Data safety](#8-integritet-app-privacy-och-data-safety)
9. [CI: kontrollbyggen i GitHub Actions](#9-ci-kontrollbyggen-i-github-actions)
10. [Kvar att göra](#10-kvar-att-göra)

---

## 1. Att bekräfta innan första uppladdningen

| Vad | Värde | Varför det är viktigt |
| --- | --- | --- |
| **App-id** (Bundle ID i App Store, applicationId i Google Play) | `se.lagomappen.lagom` | **Kan aldrig ändras** efter första uppladdningen till App Store Connect eller Play Console – ett nytt id blir en ny app utan betyg, köp eller användare. Id:t är ett omvänt domännamn men kräver ingen domän. **Ägaren bekräftar det** (eller väljer ett annat) innan Bundle ID skapas hos Apple. Byts det: ändra `appId` i `capacitor.config.ts`, `PRODUCT_BUNDLE_IDENTIFIER` i `ios/App/App.xcodeproj/project.pbxproj`, `namespace`/`applicationId` i `android/app/build.gradle`, paketet för `MainActivity.java` och `package_name`/`custom_url_scheme` i `android/app/src/main/res/values/strings.xml`. |
| **Webbvyns ursprung** | `capacitor://localhost` (iPhone), `https://localhost` (Android) | Dagboken ligger i webbvyns IndexedDB, som hör till ursprunget. Ändras `server.hostname`, `iosScheme` eller `androidScheme` i `capacitor.config.ts` efter lanseringen **försvinner all sparad data** för användarna. Serverfunktionerna godtar just de här ursprungen (`ALLOWED_NATIVE_ORIGINS`). |
| **Appnamn** | `Lagom` | Visas under ikonen. Namnet i butikerna sätts i App Store Connect och Play Console. |
| **Version** | `version` i `package.json` (1.0.0) | Android tar den automatiskt (`versionName`). På iPhone står den som `MARKETING_VERSION` i Xcode-projektet – ändra båda samtidigt. Byggnumret ökar i molnbygget (`-PlagomVersionCode=…` på Android, `agvtool` på iPhone). |

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
- Återbetalda köp: på iPhone har transaktionen `revocationDate`; i Play försvinner köpet ur
  `getPurchases()`.
- Implementationen läggs i `src/native/purchases.ts` och kopplas till `getStorePurchases()` i
  `src/lib/storePurchases.ts` (som inte får importera något – byggkontrollen läser filen). Sätt
  `NATIVE_PURCHASES_READY = true` först när köp, Återställ köp och butikens priser fungerar i
  TestFlight och Play-testning.

### Streckkodsläsaren: varför @capacitor/barcode-scanner

`@capacitor-mlkit/barcode-scanning` (8.2.1) stöder Capacitor 8 men **bara CocoaPods** på iPhone –
Googles ML Kit finns inte för Swift Package Manager, som Capacitor 8 använder. Ionics officiella
`@capacitor/barcode-scanner` (3.1.2) använder **ML Kit på Android** och Apples **Vision** på
iPhone (inga Google-bibliotek i iPhone-appen), stöder SPM och har en färdig helskärmsvy med
ficklampa och tillgänglighetsetiketter (texterna skickas in från appen, på svenska). Den kräver
Android 8.0 (API 26), liksom Health Connect.

### Hälsa: varför @capgo/capacitor-health

| | `@capgo/capacitor-health` 8.11.4 | `capacitor-health` (mley) 8.4.0 | `@perfood/capacitor-healthkit` |
| --- | --- | --- | --- |
| HealthKit + Health Connect | Ja | Ja | Bara HealthKit, Capacitor 4 |
| Läsa vikt, steg, aktiv energi | Ja (`weight`, `steps`, `calories`) | Ja | – |
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
- Varje funktion ligger i en egen modul i `src/native/` (t.ex. `share.ts`) som får importera
  `@capacitor/*` statiskt. Modulen registreras i `MODULES` i `index.ts` och laddas med
  `loadNative()`, som ger `null` på webben:

  ```ts
  const share = await loadNative('share')
  if (share) {
    await share.shareFile(…)
    return
  }
  // … webbens väg som förut
  ```

- **Alla dynamiska importer av native-moduler står i `index.ts`.** Vite tar bara bort en dynamisk
  import ur webbygget när villkoret (`NATIVE_BUILD`, en konstant i bygget) står i samma modul –
  prövat med provbyggen: står importen i en annan fil följer native-koden med i `dist/` och i
  service workerns cache.
- `initNative()` anropas en gång av AppShell och startar funktionerna i `src/native/init.ts`.
- Allt är no-op på webben och i testerna, och kastar aldrig: fel loggas med `logError`.
- `src/native/native.test.ts` kontrollerar reglerna (inga `@capacitor/*` utanför `src/native/`,
  ingen import av `src/native/<modul>` utanför `index.ts`).
- Webbygget är i praktiken oförändrat: samma filer och samma 178 poster i service workerns
  förteckning; huvudfilen blev drygt 200 byte större (de tomma stubbarna).

## 5. iPhone-projektet (ios/)

Skapat med `npx cap add ios --packagemanager SPM` (Capacitor 8, Swift Package Manager – det gick
bra på Linux). Inställningar:

| Var | Inställning |
| --- | --- |
| `Info.plist` | `CFBundleDisplayName` Lagom, `CFBundleDevelopmentRegion` **sv** och `CFBundleLocalizations` [sv] (systemets knappar och dialoger i appen blir svenska), `ITSAppUsesNonExemptEncryption` **false**, bara **porträtt**, `UIRequiredDeviceCapabilities` arm64 |
| `NSCameraUsageDescription` | "Lagom använder kameran för att läsa streckkoder på förpackningar. Bilderna sparas inte." |
| `NSHealthShareUsageDescription` | "Lagom läser vikt, steg och aktiv energi från Hälsa om du vill, så att dagboken och dagsmålet stämmer. Uppgifterna stannar på din iPhone." |
| `NSHealthUpdateUsageDescription` | "Lagom sparar vikt, energi från måltider och vatten som du loggar i Hälsa om du vill. Inget skickas någon annanstans." |
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
  lagring), om användaren har den påslagen. Det styrs av användaren – nämn det i
  integritetspolicyn (se avsnitt 10).
- Xcode 26 (iOS 26-SDK) krävs för uppladdning till App Store sedan april 2026.
- Swift-paketen hämtas från GitHub vid första bygget (`capacitor-swift-pm` låst till 8.5.2,
  `OSBarcodeLib-iOS` och `ion-ios-filesystem` från tilläggen). Checka in
  `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` efter första
  lyckade bygget (CI eller Mac), så att samma versioner används varje gång.

## 6. Android-projektet (android/)

Skapat med `npx cap add android`. Inställningar:

| Var | Inställning |
| --- | --- |
| `variables.gradle` | `minSdkVersion` **26** (Android 8.0 – Health Connect och streckkodsläsaren kräver det; Capacitor 8 själv klarar 24), `compileSdkVersion`/`targetSdkVersion` **36** |
| `app/build.gradle` | `namespace`/`applicationId` `se.lagomappen.lagom`; `versionName` från `package.json`; `versionCode` från `-PlagomVersionCode=<nummer>` (standard 1); uppladdningsnyckel från miljövariablerna `LAGOM_UPLOAD_KEYSTORE`, `…_KEYSTORE_PASSWORD`, `…_KEY_ALIAS`, `…_KEY_PASSWORD` (bara i molnbygget, aldrig i Git); `useLegacyPackaging = false` (16 KB) |
| `AndroidManifest.xml` | `allowBackup="false"` + `data_extraction_rules.xml` (ingen automatisk molnkopia till Google Drive – dagboken stannar på telefonen; överföring direkt till en ny telefon fungerar), `usesCleartextTraffic="false"`, porträtt |
| Tema | `values/colors.xml` och `values-night/colors.xml`: gran `#1F5A43`, bakgrund `#F6F3EC`, mörk bakgrund `#0B1210`; `Theme.AppCompat.DayNight` |
| `file_paths.xml` | FileProvider bara för appens cache- och filmappar (skriv delade filer till `Directory.Cache`) |

Webbvyn är telefonens *Android System WebView* (uppdateras via Google Play). Appens stilar
(Tailwind CSS v4) kräver version 111 eller senare, och CSP:n förutsätter att webbvyn kan lägga in
Capacitors brygga utan inbäddat skript (`DOCUMENT_START_SCRIPT`, finns i alla så nya webbvyer).

### Behörigheter

| Behörighet | Varför |
| --- | --- |
| `INTERNET` | Open Food Facts, receptimport, serverfunktionerna |
| `CAMERA` (+ `uses-feature` kamera, inte krav) | Streckkodsläsaren |
| `POST_NOTIFICATIONS` | Lokala påminnelser (Android 13+ frågar) |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` (från tillägget) | Påminnelserna finns kvar efter omstart |
| `VIBRATE` (från tillägget) | Haptik |
| `com.android.vending.BILLING` (från Play Billing) | Köp i appen |
| `health.READ_WEIGHT`, `health.WRITE_WEIGHT`, `health.READ_STEPS`, `health.READ_ACTIVE_CALORIES_BURNED`, `health.WRITE_NUTRITION`, `health.WRITE_HYDRATION` | Health Connect: läsa vikt, steg och aktiv energi; skriva vikt, energi från måltider och vatten |

**Borttaget** med `tools:node="remove"`: `SCHEDULE_EXACT_ALARM` och `USE_EXACT_ALARM` (Google Play
kräver en särskild deklaration och påminnelser behöver inte exakt tid – schemalägg med
`isExactNotification: false`, annars öppnar tillägget inställningen "Alarm och påminnelser"), och
de ca 40 hälsobehörigheter som `@capgo/capacitor-health` deklarerar men Lagom inte använder.
Ändras datatyperna i Hälsa-funktionen: ändra listan i manifestet och deklarationen i Play Console.

### Health Connect

- **Integritetspolicyn i behörighetsfrågan:** Health Connect öppnar tilläggets aktivitet
  (`PermissionsRationaleActivity`, och på Android 14+ aliaset `ViewPermissionUsageActivity`), som
  visar `health_connect_privacy_policy_url`. `npm run build:android` skriver den till
  `VITE_API_BASE` + `/integritet/` (`scripts/native-config.mjs`) – samma adress som
  integritetspolicyn i Play Console.
- **Play Console → Appinnehåll → Hälsoappar / Health Connect:** deklarera varje datatyp med
  motivering, t.ex.:
  - *Vikt (läsa/skriva):* "Visar viktkurvan i Lagom och sparar vikt som användaren loggar i Health Connect, om användaren vill."
  - *Steg och aktiv energi (läsa):* "Visar dagens rörelse i dagboken och kan räknas in i dagens energimål."
  - *Näring och vatten (skriva):* "Sparar energi från loggade måltider och druckna glas i Health Connect, om användaren vill."
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
(till Open Food Facts), inte kopplad, ingen spårning. De nya funktionerna ändrar inte det:

| Funktion | Lämnar data telefonen? | Redovisas som insamling? |
| --- | --- | --- |
| Köp i appen (`@capgo/native-purchases`) | Bara mellan telefonen och Apple/Google – Lagom får inga köpuppgifter | Nej |
| Apple Hälsa / Health Connect | Nej – läses och skrivs på telefonen | Nej (men beskrivs i integritetspolicyn) |
| Streckkodsläsaren | Nej – bilden tolkas på telefonen och sparas inte; bara streckkoden skickas till Open Food Facts (som förut) | Sökhistorik (som förut) |
| Påminnelser | Nej – lokala notiser, ingen pushtjänst | Nej |
| Export/delning | Bara dit användaren själv väljer | Nej |

## 9. CI: kontrollbyggen i GitHub Actions

`.github/workflows/native.yml`:

- **Android** (Linux, vid pull requests som rör native-koden och på begäran): `npm run
  build:android`, Gradle `assembleDebug` och `bundleRelease` (osignerad), 16 KB-kontrollen och en
  test-APK som kan hämtas under *Artifacts* och installeras på en Android-telefon.
- **iPhone** (macOS, bara på begäran: *Actions → Native-appar → Run workflow → Bygg även
  iPhone-appen*): `npm run build:ios` och ett simulatorbygge utan signering med Xcode 26.
- Webbdelen är ett testbygge (`LAGOM_ALLOW_STORE_WITHOUT_IAP=1`). Riktiga säljaruppgifter läggs in
  som *Variables* i repot; annars används testvärden.
- Signerade byggen och uppladdning till TestFlight/Play görs i ett eget arbetsflöde (Codemagic
  eller GitHub Actions) när köpen fungerar – se [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md).

## 10. Kvar att göra

- [ ] **Ägaren:** bekräfta app-id:t `se.lagomappen.lagom` (avsnitt 1) innan Bundle ID skapas.
- [ ] Koppla in funktionerna i `src/native/` (köp, delning/export, påminnelser, streckkodsläsare,
      Hälsa, haptik, statusfält/tangentbord/startskärm, bakåtknappen).
- [ ] Köpen: `src/native/purchases.ts`, `NATIVE_PURCHASES_READY = true` efter test i TestFlight och
      Play-testning.
- [ ] Integritetspolicyn (`src/features/legal/legalContent.ts`): Apple Hälsa och Health Connect
      (vilka datatyper, att de stannar på telefonen, hur man återkallar), att telefonens egen
      säkerhetskopia (iCloud) kan innehålla appens data, lokala påminnelser, och att köp i
      Android-appen görs via Google Play Billing (Play-appen är nu inbyggd, inte TWA).
- [ ] [GOOGLE-PLAY.md](GOOGLE-PLAY.md) beskriver fortfarande TWA/Bubblewrap – skriv om avsnitt 7,
      10 och 11 för Capacitor (Play Billing i appen, Health Connect-deklarationen, uppladdningsnyckel,
      ingen Digital Asset Links behövs för appen).
- [ ] Signerade byggen och uppladdning (Codemagic eller GitHub Actions) med App Store Connect-nyckel
      och Play-uppladdningsnyckel.
- [ ] Kontrollera i CI att 16 KB-kontrollen går igenom (ML Kit).
