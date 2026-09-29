# Lagom – utvecklarkonventioner

Lagom är en svensk kalori- och näringsdagbok (PWA): React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4 + Zustand 5 (persisterat i IndexedDB via idb-keyval). All data stannar lokalt på enheten.

## Kommandon

- `npx tsc -b` – typkontroll (måste vara felfri)
- `npx vitest run [sökväg]` – tester (vitest + jsdom + fake-indexeddb, `globals: true`)
- `npx oxlint src netlify scripts` – lint (samma som CI i `.github/workflows/ci.yml`)
- `npx vite build` – produktionsbygge (`dist/`). Butiksbygge och native-appar: se "Plattform och butiker" och "Native-appar".
- Ändra inte `package.json` och installera inga paket. Om ett paket verkligen behövs: skriv det i din slutrapport. Undantag: Capacitor 8 och tilläggen under "Native-appar" är godkända av ägaren (exakta versioner i `package.json`); alla andra nya paket kräver fortfarande ägarens godkännande.

## Kodstil

- `erasableSyntaxOnly` + `verbatimModuleSyntax`: inga `enum`, inga parameter properties, använd `import type` för typer.
- `strict`, `noUnusedLocals`, `noUnusedParameters` är på.
- Importera med relativa sökvägar eller aliaset `@/` (= `src/`).
- Domäntyper finns i `src/types.ts`. Näringsämnen i `src/lib/nutrients.ts` (`NUTRIENTS`, `NutrientKey`, `sumNutrients`, `scaleNutrients` …).
- Kommentarer och all text som användaren ser skrivs på **svenska** med korrekt å/ä/ö. Kodidentifierare på engelska.
- Siffror visas alltid med `src/lib/format.ts` (decimalkomma, `formatNumber`, `formatNutrient`, `formatEnergy`, `formatGrams`). Tolka inmatade tal med `parseSwedishNumber` (klarar "1,5").
- Datum är lokala `ISODate`-strängar ('YYYY-MM-DD') – använd `src/lib/dates.ts` (`todayISO`, `addDays`, `relativeDayLabel`, `isoWeek` …). Veckan börjar på måndag.
- Mått: `src/lib/units.ts` (`gramsFor`, `availableUnits`, `formatAmount`) – svenska köksmått dl/msk/tsk/krm/cl och portioner. `formatAmount(…, true)` böjer portionsord och upprepar aldrig gramvikten ("2 smörgåsar (124 g)"). Kött, fågel, fisk, pasta, ris och gryn anges tillagade; med `Food.rawWeight` finns enheterna `'g-ra'` ("g rå"/"g okokt") och `'dl-ra'` ("dl okokt") som räknas om till tillagad vikt.
- Ett saknat näringsvärde (`undefined`) betyder okänt, inte 0. Visa "–".
- Externa länkar: alltid `<ExternalLink>` från `components/ui` (ny flik, `rel="noopener noreferrer"`, ikon och "(öppnas i ny flik)"/"(öppnas utanför appen)" för skärmläsare). `showIcon={false}` när länken har en egen ikon; mailto:/tel: får varken ny flik eller ikon. Aldrig `target="_blank"` direkt.
- Fel som fångas: `logError(error, context)` från `src/lib/errorLog.ts` (lokal fellogg, högst 20 poster i `lagom-error-log`, utan livsmedel och värden – skickas bara om användaren själv mejlar den).
- Version: `typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'` (och `__BUILD_ID__`, reserv `'lokal'`) – sätts i `vite.config.ts`, finns inte i testerna.
- Utskrift: dölj navigering och knappar med `print:hidden`; ljusa tokens gäller automatiskt vid utskrift.

## Zustand – viktigt

- Butiker: `useProfileStore`, `useDiaryStore`, `useFoodStore`, `useBodyStore`, `useFastingStore`, `useLicenseStore`, `usePlanStore` (veckoplaneringen) och `useReminderStore` (påminnelserna i apparna, `lagom-reminders`) i `src/stores/`.
- En ny persisterad butik registreras på alla ställen: `STORE_KEYS` och `PERSIST_VERSIONS` i `stores/storage.ts` (butiken tar sin version därifrån), `STORES`/`BY_KEY` i `stores/hydration.ts` och `persist.test.ts`, säkerhetskopian (`lib/backup.ts`: `createBackup`, `restoreBackup`, `wipeAllData`; `lib/backupValidation.ts`), `PERSISTED_STORES` i `lib/cloud/cloudBackup.ts` och `PERSISTED` i `src/native/mirror.ts` (den automatiska kopian i apparna). Lagom Molns nycklar `lagom-cloud` och `lagom-cloud-key` ligger medvetet utanför `STORE_KEYS` (följer aldrig med i säkerhetskopior eller "Radera all data").
- Selektorer får **inte** skapa nya objekt/arrayer vid varje anrop (ger oändlig renderingsloop i React 19). Välj fält var för sig, använd stabila tomma konstanter (`?? EMPTY`) eller `useShallow` från `zustand/react/shallow`. Beräkna härledda värden med `useMemo`.
- Färdiga hooks: `useDay(date)` (poster, summor, vatten, träning), `useTargets()` (dagsmål), `useToday()`, `useDocumentTitle(title)` (förfina sidtiteln – AppShell sätter en per sökväg), `useMemoryOnlyStorage()` (true när data inte kan sparas).
- Toast-notiser: `toast('Tillagt', { action: { label: 'Ångra', onClick } })` från `src/components/ui/toast.tsx`. Notiser med åtgärd visas 8 s och pausas vid hovring/fokus; fel (`tone: 'error'`) läses upp direkt.

## Design – "Nordisk natur"

Designsystemet finns i `src/index.css`. Använd alltid tokens, aldrig hårdkodade färger (då fungerar mörkt läge automatiskt):

- Ytor: `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-surface-3`, `border-line`
- Text: `text-ink`, `text-ink-2`, `text-ink-3`
- Primär: `bg-gran text-on-gran`, `text-gran`, `bg-gran-soft`
- Accenter (+ `-soft`): `lingon` (protein/varning), `hjortron` (kolhydrater), `blabar` (fett), `mossa` (fibrer/bra), `vinbar` (alkohol), `fjall` (vatten), `sol` (höjdpunkter)
- Semantiska: `text-protein`, `bg-carbs`, `text-fat`, `bg-fiber`, `text-water`, `text-good`, `text-warn`, `text-bad`
- Omvänd yta (toast m.m.): `bg-inverse text-on-inverse`, accent `text-inverse-accent` – mörk i ljust tema, ljus i mörkt
- `text-ink-3` klarar 4,5:1 mot alla ytor och får användas för liten sekundärtext
- Typsnitt: `font-display` (Fraunces) för rubriker och stora siffror, klassen `display-num` för stora tal, `eyebrow` för små etiketter i versaler. Brödtext Inter.
- Kort: klassen `card` (rundad 1.5rem, mjuk skugga) + `p-4`/`p-5`. Knappar/chips rundade (`rounded-2xl`/`rounded-full`).
- Ikoner: `lucide-react`. Animationer: `motion/react` (sparsamt, fjädrande; respektera reducerad rörelse).
- Mobil först (375 px), innehåll max `max-w-3xl`. Tryckytor minst 44 px. Sidor har `px-4` och inleds med `PageHeader` (som hanterar safe area – lägg inte till `pt-safe` utöver den).
- Safe areas: använd `var(--sa-top)`, `var(--sa-bottom)`, `var(--sa-left)`, `var(--sa-right)` (även i Tailwind, t.ex. `pb-[max(1rem,var(--sa-bottom))]`) – aldrig `env(safe-area-inset-*)` direkt (testas i `layout.test.tsx`).
- Nya sidor: lägg routen i `src/App.tsx` och sökvägen i `ROUTE_TITLES` (och vid behov `MORE_SECTIONS`/`FULLSCREEN`) i `components/layout/AppShell.tsx`.
- Tillgänglighet: semantiska element, `aria-label` på ikonknappar, etiketter på fält, synlig fokus.

## Livsmedelsdatabasen

- `src/data/foods/<fil>.ts` (9 filer, 855 kurerade livsmedel, id `lagom:<slug>`) skrivs med `defineFood`. En rad per vardagsbegrepp med kort, naturligt svenskt namn ("Kycklingbröst", inte "Kycklingbröstfilé, stekt, utan skinn"); varianter, märken och gamla namn blir sökord (`syn`).
- Kött, fågel, fisk, pasta, ris, gryn och torkade baljväxter anges **tillagade** med `raw: [faktor, 'ra' | 'okokt' | 'torkad' | 'fryst', densitet?]` (→ `Food.rawWeight`, enheterna `'g-ra'`/`'dl-ra'`, "g rå", "g okokt", "g fryst" …). Inga separata rå/okokta rader. Frukt och grönsaker som äts råa är råa. Undantag som anges torra eftersom de används torra: havregryn, mannagryn, snabbgröt, grötris och mjöl.
- Produkttyper med många märken (havredryck, granola, läsk, chips, korv …) är **samlingsvärden**: `avg: true` (→ `Food.isAverage`), inget `brand`, och en `note` som börjar "Samlingsvärde: …" och hänvisar till streckkoden för exakta märken.
- Ta aldrig bort eller byt ett id utan alias: `{ from, to, unit?, scale?, density? }` i `src/data/foods/aliases/<fil>.ts` (`unit: 'g-ra'` när en rå rad ersätts av den tillagade; `scale` när ersättaren har helt annan energi per gram, t.ex. tillagade → torra snabbnudlar; `density` för att räkna om gamla volymer). Kontrollera att gamla mängder ger ungefär samma energi hos ersättaren – annars behövs en egen rad eller `scale`. `legacy-ids.ts` är genererad – ändra inte. I `aliases/legacy-portions.ts` ändras inte befintliga rader; slås en rad ihop läggs dess gamla portioner till där. Slå upp livsmedel via `lib/foodRepo`/`useFood` (följer alias; `resolveFoodAlias`, `canonicalFoodId`, `aliasAmount`). Inbyggda recept (`src/data/recipes.ts`) och exempeldata (`src/lib/demo.ts`) pekar direkt på dagens id:n – det testas.
- Livsmedelsverkets fullständiga databas (`public/data/livsmedelsverket.json`, 2 606 livsmedel, id `lmv:<nr>`) visas bara i sökningens hopfällda sektion "Fler från Livsmedelsverket" – även poster som sparats i `cachedFoods` (importen i Inställningar). Råa och okokta poster, torkade baljväxter och specialposter (barnmat, inälvor …) döljs där om sökningen inte innehåller ordet. Ett kurerat livsmedel länkas med `lmv` (nummer) bara när det är samma livsmedel med ungefär samma värden: den länkade posten fyller i saknade näringsämnen och döljs i sökningen.
- Undvik att ett kurerat namn krockar med en inbyggd klassiker (`src/data/recipes.ts`), t.ex. "Färdiga köttbullar" mot receptet "Köttbullar".

## Plattform och butiker

- `VITE_DISTRIBUTION` (`web` | `appstore` | `play`, standard `web`) väljer bygge. Körmiljön avgörs i `src/config/platform.ts`: `sellsOnWeb()`, `isInApp()`, `isNativeApp()`, `isTwa()`, `allowsLicenseKeyEntry()`, `offersLicenseRecovery()`, `storagePlace()` ("i den här webbläsaren"/"i appen på den här enheten") och `cameraSettingsHint()`. Skriv aldrig "i den här webbläsaren" direkt – använd `storagePlace()`.
- Stripe, kronpriser och `priceSummary()` visas bara när `sellsOnWeb()`. Annars används `priceSummaryText()`, och butikspriserna kommer från butiken (`src/lib/storePurchases.ts`, inkopplat med `@capgo/native-purchases` i `src/native/purchases.ts` via `setNativeStorePurchases()`, produkt-id `livstid`, `ar` och `prov14`; byggkontrollen stoppar butiksbyggen när `NATIVE_PURCHASES_READY` är false). `NATIVE_PURCHASES_READY` är true men köpen är bara testade med mockat tillägg – prova i TestFlight och Play-testning före inskickning. I Play kan en årslicens som gäller inte köpas igen (`renewalBlockedInStore` i premiumLogic); i App Store kedjas årslicenser som förnyas i förväg (`chainYears` i `src/native/purchases.ts`, läser hela historiken). Senast kända butiksköp (produkt, köpdatum, utgång, butik – inga kvitton) sparas i localStorage `lagom-butikskop` (`STORE_CACHE_KEY` i `hooks/useAccess.ts`, utanför `STORE_KEYS`) så att ett misslyckat anrop vid start inte stänger ute den som betalat. Tester som stubbar `Capacitor.isNativePlatform → true` får den väntande butiken – använd `setStorePurchasesForTests(fake)` eller `setNativeStorePurchases(null)`. I App Store-bygget går det inte att klistra in licensnycklar; köp återställs med "Återställ köp".
- Butiksbygge: `VITE_DISTRIBUTION=appstore VITE_API_BASE=https://<webbplatsen> npx vite build` → `dist-native/` (ingen service worker, CSP som meta-tagg från `netlify.toml`) – eller hela vägen in i apparna med `npm run build:ios` / `npm run build:android` (se "Native-appar"). Byggkontrollen `scripts/commerce-guard.ts` stoppar skarpa byggen och butiksbyggen utan `VITE_SELLER_NAME`, `VITE_SELLER_ORGNR`, `VITE_SELLER_ADDRESS`, `VITE_SELLER_PHONE` och en riktig `VITE_SUPPORT_EMAIL` (`VITE_SELLER_VAT` är frivillig), och ett Netlify-produktionsbygge i testläge utan `LAGOM_ALLOW_TEST_COMMERCE=1`.
- Övriga variabler: `VITE_WEB_SALES=on|off`, `VITE_APPSTORE_URL`, `VITE_PLAY_URL`, `VITE_LICENSE_PUBLIC_KEYS` (kommaseparerad, den nuvarande nyckeln först). Se `.env.example` och `docs/BETALNING.md`.
- Exempeldata är skrivskyddad: `useAccess().demo` är true, och `requireAccess(action)` visar exempelarket i stället för att logga. Provperioden startar först när den egna profilen skapas – utom i iPhone-appen (`trialViaStore()`: App Store-bygget i appen), där App Store-riktlinje 3.1.1 kräver att den startas med 0-kronorsköpet `prov14` (knappen `StartTrialButton`, status `'ejstartad'` tills dess) och räknas från köpdatumet; "Återställ köp" ger tillbaka den så att den inte börjar om vid ominstallation. Anropa `requireAccess('<åtgärd>')` före allt som skapar nytt.
- Lagom Moln är avstängt tills `VITE_SUPABASE_URL` och `VITE_SUPABASE_PUBLISHABLE_KEY` sätts (i butiksbyggen stoppar byggkontrollen dem om inte `LAGOM_ALLOW_STORE_CLOUD=1`) (`CLOUD_ENABLED` i `src/config/cloud.ts`, se `docs/BACKEND.md`). Koden i `src/lib/cloud` får bara laddas med dynamisk import. Lägg ingen Supabase-adress i CSP:n förrän projektet finns och ägaren har godkänt det.

## Native-appar (Capacitor 8)

- Butiksapparna för App Store (bara iPhone) och Google Play är Capacitor 8-appar runt `dist-native/`. Projekten `ios/` (Swift Package Manager) och `android/` checkas in; `capacitor.config.ts` styr dem. Allt om bygge, behörigheter, integritetsmanifest och butiksformulär: `docs/NATIVE.md`.
- Godkända paket (ägaren, 2026-09-28): `@capacitor/core`, `@capacitor/cli` (dev), `@capacitor/ios`, `@capacitor/android`, `@capacitor/app`, `@capacitor/filesystem`, `@capacitor/share`, `@capacitor/haptics`, `@capacitor/status-bar`, `@capacitor/keyboard`, `@capacitor/splash-screen`, `@capacitor/local-notifications`, `@capacitor/barcode-scanner` (ML Kit på Android, Apple Vision på iPhone), `@capgo/native-purchases` (köp i appen: StoreKit 2 och Play Billing, utan egen server och utan extra konto) och `@capgo/capacitor-health` (Apple Hälsa och Health Connect). Andra tillägg kräver godkännande.
- Kodens organisation: **appkoden importerar bara `src/native/index.ts`** (`isNative()`, `nativePlatform()`, `initNative()`, `loadNative('<modul>')`, `NATIVE_BUILD`). Varje funktion ligger i en egen modul i `src/native/` som får importera `@capacitor/*` statiskt, och registreras i `MODULES` i `src/native/index.ts` – alla dynamiska importer av native-moduler står där, annars följer native-koden med i webbygget och service workerns cache. `loadNative()` ger `null` på webben: `const files = await loadNative('files'); if (files) { …; return }` och annars webbens väg som förut. `initNative()` (anropas av AppShell efter hydreringen) startar funktionerna via `src/native/init.ts` i ordningen system → köp → (spegling, påminnelser, Hälsa). Allt är no-op på webben, kastar aldrig (fel → `logError`), och `src/native/native.test.ts` kontrollerar reglerna.
- Modulerna: `system` (statusfält efter temat, tangentbord med klassen `keyboard-open` på `<html>`, startskärmen döljs efter hydreringen, Androids bakåtknapp: ark/dialog → bakåt → minimera på startsidan), `purchases`, `files` (`saveFile`/`shareText` via delningsbladet – `saveFile` i lib/backup.ts och `shareOrCopy` använder den), `mirror` (automatisk kopia `lagom-spegling.json` – `Library/NoCloud` på iPhone så att den inte hamnar i iCloud, appens filmapp på Android – erbjuder återställning när appen är tom; frågan kan bara besvaras med knapparna och "Börja om" bekräftas), `reminders` (lokala notiser, id 7100–7199, inställningssidan pratar via `useReminderBridge`), `haptics` (använd `haptic('tap' | 'success')` från `src/native`), `barcode` (ScanPage; ZXing på Android – ML Kit skickar driftdata till Google och används inte, och `MlKitInitProvider` tas bort i manifestet; Vision på iPhone) och `health` (Apple Hälsa/Health Connect, `lagom-health` i localStorage utanför `STORE_KEYS`; datatyperna i `HEALTH_CHOICE_TYPES` ska stämma med `AndroidManifest.xml`, `Info.plist` och Play-deklarationen – läser vikt och steg, skriver vikt, energi och vatten; energi och vatten skickas bara för avslutade dagar). "Radera all data" tar bort kopian, exportfilerna och hälsokopplingen (`clearNativeCopies` i features/settings/wipe.ts).
- Sidor och rader som bara finns i apparna (Inställningar → Påminnelser och Apple Hälsa/Health Connect) laddas med `lazy()` bakom en byggkonstant (`APP_SECTIONS_BUILD` i SettingsPage) och visas bara när `isNative()` – då följer de inte med i webbygget.
- Kommandon (butiksbyggena kräver samma variabler som ovan; lokala testbyggen med `LAGOM_ALLOW_STORE_WITHOUT_IAP=1` och testvärden, se `docs/NATIVE.md`):
  - `npm run build:ios` – `VITE_DISTRIBUTION=appstore vite build && cap sync ios`
  - `npm run build:android` – `VITE_DISTRIBUTION=play vite build`, `scripts/native-config.mjs` och `cap sync android`
  - `npm run cap:sync` – kopiera `dist-native/` och tilläggen till båda projekten
  - `npm run native:assets` – appikoner och startskärmar ur `public/icon.svg` (`scripts/generate-native-assets.mjs`)
  - Själva apparna byggs i CI (`.github/workflows/native.yml`; Android SDK och Xcode finns inte lokalt). `node scripts/check-android-16kb.mjs <apk|aab>` kontrollerar 16 KB-sidor.
  - Butiksbyggen (signerade, TestFlight och Google Play intern test): `.github/workflows/release.yml` (taggar `v*` eller för hand, varje app bara när dess hemligheter finns, alltid `VITE_COMMERCE_MODE=live`) eller `codemagic.yaml` (Codemagics gratisnivå). Hemligheter och variabler står i `docs/NATIVE.md` §9, och `src/native/storeBuilds.test.ts` kontrollerar filerna. Lanseringen sammanfattas i `docs/LANSERING.md`.
- Ändra aldrig `appId` (`se.lagomappen.lagom`) efter första uppladdningen, och aldrig `server.hostname`/`iosScheme`/`androidScheme` – dagboken ligger i webbvyns IndexedDB, som hör till ursprunget.
- Ändra inte genererade filer: `ios/App/CapApp-SPM/Package.swift`, `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle` och den kopierade webbdelen (`ios/App/App/public`, `android/app/src/main/assets/public`).
- Behörigheter hålls minimala: tilläggens onödiga Android-behörigheter tas bort med `tools:node="remove"` i `AndroidManifest.xml`, och inga exakta alarm – schemalägg påminnelser med `isExactNotification: false`. Texter i `Info.plist` (kamera, Hälsa) är på svenska. Ny native-funktion som samlar eller skickar data → uppdatera `PrivacyInfo.xcprivacy`, App Privacy/Data safety (`docs/NATIVE.md`) och integritetspolicyn.

## Juridik och integritet

- Inga analysverktyg, ingen reklam och inga tredjepartsskript utan samtyckeslösning och uppdaterad integritetspolicy (lagringen på enheten är i dag bara nödvändig lagring enligt LEK 9 kap. 28 §). Ny lagring (localStorage, IndexedDB, filer i apparna …) ska in i lagringstabellen i policyn – i båda tabellerna (webben/Play och `appStore`), och `appStore`-varianten får aldrig nämna Android, Google Play eller Health Connect (testas).
- Juridiska texter ändras bara i `src/features/legal/legalContent.ts`; kör sedan `npx vitest run src/features/legal -u` (skapar `public/integritet/`, `public/villkor/` och `docs/INTEGRITETSPOLICY.md`, `KOPVILLKOR.md`, `ANVANDARVILLKOR.md`). Säljarens uppgifter fylls i vid bygget (`staticSeller.ts`, `vite.config.ts`).
- Målgruppen är vuxna (18+). Graviditetsråden finns i `src/lib/pregnancy.ts` och ses över varje år (nästa gång senast juni 2027).
- Fritextloggningen finns i `src/lib/freeText.ts` ("X med Y" slås ihop när det är ett livsmedelsnamn), och tallrikens antaganden i `src/features/add/plateLog.ts`.

## Ton

Varm, uppmuntrande och icke-dömande – "lagom". Aldrig skuld eller skam kring mat. Inga röda "du har ätit för mycket"-varningar; använd neutrala formuleringar ("Över målet idag – helt okej, det jämnar ut sig över veckan"). Säkerhet: kalorigolv, ingen viktnedgång vid graviditet/amning/under 18 år, hänvisning till 1177 och Frisk & Fri vid oro för ätstörningar.

## Källor

- Livsmedelsverkets livsmedelsdatabas (namn och näringsvärden per 100 g), Nordiska näringsrekommendationer 2023 (NNR 2023), Livsmedelsverkets kostråd, Tallriksmodellen.
- Open Food Facts (streckkoder, ODbL) – anropas från klienten.
