# Lagom – kaloriräknaren

> *Lagom är bäst.* En svensk kalori- och näringsdagbok som är vacker, komplett och privat – gratis att prova i 14 dagar.

Lagom är en installerbar webbapp (PWA) för mobil och dator, och förbereds för App Store (iPhone) och Google Play. Den är byggd för den svenska marknaden och vuxna (18+), och har svenska livsmedel, svenska köksmått (dl, msk, tsk, krm), Livsmedelsverkets kostråd, Tallriksmodellen och de nordiska näringsrekommendationerna (NNR 2023). Allt fungerar offline, och dagboken lämnar aldrig enheten.

## Så löser Lagom problemen med andra kaloriappar

| Problem i vanliga kaloriappar | Så gör Lagom |
| --- | --- |
| Crowdsourcade databaser med dubbletter och felaktiga värden | Kurerad svensk databas med 855 livsmedel baserad på Livsmedelsverkets värden – en rad per vardagsbegrepp (Kycklingbröst, Pasta, Havredryck) i stället för sex nästan likadana varianter. Varje fil är oberoende faktagranskad, och ett automatiskt test kontrollerar att energin stämmer med makronäringsämnena. Varje livsmedel visar sin källa, och användarbidrag från Open Food Facts märks tydligt. |
| Okända näringsvärden visas som 0 | Okänt visas som "–", och appen visar hur fullständiga näringsdata är. |
| Betalvägg för streckkoder, makromål och export – och prenumerationer som är svåra att säga upp | 14 dagar gratis att prova, sedan Årslicens 349 kr eller Livstidslicens 699 kr (engångsköp) utan automatisk förnyelse – ingen reklam, inga dolda avgifter. Allt ingår: streckkodsläsaren, alla näringsämnen, recept, export och insikter. Din data låses aldrig – efter provperioden kan du alltid se, exportera och radera den. |
| Reklam och uppsäljning | Ingen reklam, inga konton, inga prenumerationer. |
| Krascher, synkfel och dataförlust | Allt lagras lokalt och appen fungerar offline. Säkerhetskopiering till fil (JSON) och export till Excel (CSV). |
| Engelska mått och utländska livsmedel | Svenska livsmedel och klassiker (knäckebröd, falukorv, kanelbulle, ärtsoppa …) och svenska köksmått omräknade med densitet ("2 dl havregryn" blir rätt vikt). Kött, fisk, pasta och ris kan vägas råa eller okokta ("150 g rå", "1 dl okokt") – Lagom räknar om till tillagad vikt. |
| Långsam, krånglig registrering | Smart sök som klarar å/ä/ö, stavfel och sammansatta ord. Senaste och favoriter per måltid, kopiera gårdagens måltid, sparade måltider och en korg för att lägga till flera livsmedel på en gång. |
| Statiska kalorimål som inte stämmer | Adaptiv energiförbrukning som räknas fram ur din vikttrend och ditt faktiska intag. |
| Överskattade träningskalorier | Nettokalorier (MET − vila). Du väljer själv hur stor andel som läggs till dagens budget. |
| Recept blir fel efter tillagning | Recept räknas på tillagad vikt ("väg grytan när den är klar"). |
| Dömande ton som kan skada vid ätstörningar | Varm och icke-dömande ton, ett medvetet läge utan siffror, säkerhetsgolv för kalorier, ingen viktnedgång vid graviditet, amning eller under 18 år, och hänvisning till 1177 och Frisk & Fri. |
| Integritet | Inget konto och ingen server med dagböcker. Datan stannar på din enhet, och du kan exportera eller radera allt när som helst. |

## Funktioner

- **Idag**: dagsringen (kcal kvar med makrofärger), makron, måltider, vatten, dagens tallrik, veckoöversikt, tips och svensk matkalender (t.ex. Kanelbullens dag).
- **Dagbok**: måltider (frukost, lunch, fika, middag, kvällsmat, mellanmål) med redigering, flytta/kopiera, mallar, anteckningar och mående.
- **Lägg till**: sök, streckkodsläsare (Open Food Facts), snabbregistrering, egna livsmedel och portionsväljare med svenska mått, "g rå" och "dl okokt". Samlingsvärden för produkttyper med många märken och Livsmedelsverkets övriga livsmedel i en egen sektion (se [Livsmedelsdatabasen](#livsmedelsdatabasen)).
- **Recept**: egna recept med tillagad vikt, 35 svenska klassiker och import från en receptlänk (`/recept/importera`).
- **Veckoplanering** (`/planering`): planera veckans måltider och få en inköpslista. Recept planeras med portioner att laga och portioner du äter. Listan grupperas per butiksavdelning, kött, pasta och ris står i rå eller okokt vikt, och den kan delas eller kopieras. Allt sparas lokalt (`lagom-plan`) och följer med i säkerhetskopian.
- **Vikt & mått**: trendvikt, prognos för måldatum, BMI och midja/längd-kvot samt adaptiv förbrukning.
- **Insikter**: näring mot NNR 2023, Livsmedelsverkets kostråd, Tallriksmodellen, klimatavtryck (kg CO2e) och mönster – och en rapport att skriva ut (`/rapport`, bara på webben).
- **Träning, dryck och fasta**: aktiviteter med MET-värden (längdskidor, innebandy, padel …), vatten, koffein, alkohol i standardglas och en fastetimer.
- **Inställningar**: mål, måltider, tema, medvetet läge samt export/import och radering. Integritetspolicyn (`/integritet`) och köp- och användarvillkoren (`/villkor`) finns i appen och som fristående sidor.
- **Bara i apparna för iPhone och Android**: telefonens egen streckkodsläsare, export och delning med delningsbladet, frivilliga påminnelser (lokala notiser), en frivillig koppling till Apple Hälsa eller Health Connect (vikt och steg in, energi, vatten och vikt ut), haptik, en automatisk kopia av dagboken på telefonen och Androids bakåtknapp.

## Livsmedelsdatabasen

Lagoms egen databas (`src/data/foods/`) har 855 kurerade livsmedel med svenska namn, portioner, sökord och klimatvärden. Den följer några enkla principer:

- **Grova linjer.** En rad per vardagsbegrepp så som det äts, med kort och naturligt namn: "Kycklingbröst", "Kycklingkorv", "Nötfärs", "Lax", "Pasta", "Ris". Varianter som knappt skiljer sig åt är sammanslagna, och de gamla namnen finns kvar som sökord.
- **Tillagat som standard – väg gärna rått.** Kött, fågel, fisk, pasta, ris, gryn och torkade baljväxter anges tillagade – 69 livsmedel har omräkning från rå, okokt eller fryst vikt. Väger du varan rå eller okokt väljer du enheten "g rå", "g okokt" eller "dl okokt", så räknar Lagom om till tillagad vikt (150 g rått kycklingbröst ≈ 113 g stekt, 1 dl okokt ris ≈ 255 g kokt). Frukt och grönsaker som äts råa är fortfarande råa.
- **Samlingsvärden för produkter med många märken.** Havredryck, granola, müsli, flingor, energidryck, proteinbar, smaksatt yoghurt, läsk, chips, glass, korv, frysta färdigrätter med flera (172 livsmedel) har en rad var med ett genomsnitt av vanliga märken i svenska butiker. De är märkta "Samlingsvärde" och saknar märke – skanna streckkoden för exakta värden för ditt märke (Open Food Facts).
- **Gamla id:n fungerar.** Borttagna och sammanslagna livsmedel har alias till bästa ersättare (394 st i `src/data/foods/aliases/`), så att favoriter, Senaste, sparade måltider och recept fortsätter att fungera. En gammal mängd i gram rå vara blir "g rå" hos den tillagade raden.
- **Fler från Livsmedelsverket.** Livsmedelsverkets fullständiga databas (2 606 livsmedel) blandas inte in bland huvudträffarna. De visas i en egen, hopfälld sektion "Fler från Livsmedelsverket" som fälls ut automatiskt när huvudträffarna är få. Råa och okokta varor, torkade baljväxter och specialposter (" rå", barnmat, välling, inälvor) visas där bara om sökningen själv innehåller ordet.

## Kvalitet

- Drygt 2 200 automatiska tester (vitest), bland annat en säkerhetsmatris som prövar 40 000 slumpade profiler mot reglerna för kalorimål. CI (`.github/workflows/ci.yml`) kör typkontroll, lint, tester och bygge på varje ändring.
- Granskad ur fem perspektiv: funktionstest i webbläsare, kodgranskning, design och svensk text, tillgänglighet (WCAG 2.2 AA) samt näringslära och säkerhet.
- Fungerar från 320 px mobilbredd till stor skärm, i ljust och mörkt läge.

## Prova utan att mata in något

Välj **Utforska med exempeldata** på välkomstskärmen. Då fylls appen med två veckor av en påhittad användares svenska vardagsmat. Exemplet är skrivskyddat och startar ingen provperiod – den startar först när du skapar din egen profil. Exempeldata kan rensas under Inställningar → Data.

## Betalning och licenser

Lagom är gratis att prova i 14 dagar. Sedan köper man en **Årslicens (349 kr, 365 dagar, förnyas inte automatiskt)** eller en **Livstidslicens (699 kr, engångsköp)**. Livstid betyder för alltid, och felrättningar ingår – men inte ett löfte om alla framtida funktioner. Priserna på webben är inklusive moms (se [Moms](#moms) nedan).

- **På webben** görs köpet via Stripe Checkout (kort, Klarna, Swish) och ger en signerad licensnyckel som appen kontrollerar offline – inget konto behövs. Återbetalda köp spärras med en signerad spärrlista, och den som tappat nyckeln kan hämta den igen med e-post och kvittonummer.
- **I App Store och Google Play** görs köpet bara i appen (Apple IAP respektive Google Play Billing), och priset kommer från butiken. I App Store-bygget går det inte att klistra in licensnycklar – köp återställs via Apple-ID med "Återställ köp", och den som köpt på webben får en erbjudandekod via supporten. Köpen i appen är inkopplade men ska provas i TestFlight och Play-testning före inskickning (se [Plattformar och butiker](#plattformar-och-butiker)).

Serverdelen är sex små Netlify Functions utan databas: `create-checkout`, `verify-purchase`, `stripe-webhook`, `recover-license`, `license-revocations` och `recipe-fetch` (receptimporten). De publika adresserna har anropsbegränsning i `netlify.toml`.

Så sätter du upp Stripe och Netlify, testar köpflödet och går live: [`docs/BETALNING.md`](docs/BETALNING.md). Alla miljövariabler finns i [`.env.example`](.env.example).

### Säljarens uppgifter

Lagom säljs av en enskild firma. Köparen måste få säljarens uppgifter före köpet (distansavtalslagen), så skarpa byggen (`VITE_COMMERCE_MODE=live`) och butiksbyggen **stoppas** tills de här variablerna är ifyllda. De visas i appen, på fakturan och på de fristående sidorna `integritet/`, `villkor/`, `support/` och `radera-konto/`, där platshållarna (`[Företagsnamn]` …) fylls i vid bygget:

| Variabel | Vad |
| --- | --- |
| `VITE_SELLER_NAME` | Ditt namn eller firmanamnet |
| `VITE_SELLER_ORGNR` | Organisationsnummer – för enskild firma ditt personnummer |
| `VITE_SELLER_ADDRESS` | Postadress |
| `VITE_SELLER_PHONE` | Telefonnummer |
| `VITE_SUPPORT_EMAIL` | En riktig e-postadress (inte `example.invalid` eller `example.se`) |
| `VITE_SELLER_VAT` | Frivillig: momsregistreringsnummer, bara om firman är momsregistrerad |

Ett **produktionsbygge på Netlify i testläge** stoppas också. Förhandsvisningar och grenbyggen får testläget via `netlify.toml`; för _Production_ sätter du `LAGOM_ALLOW_TEST_COMMERCE=1` i Netlify tills skarpt läge är klart, och tar bort den när du börjar sälja.

### Moms

Priserna och kvittot utgår i dag från 25 % moms. **Beslut som saknas:** är den enskilda firman inte momsregistrerad (momsbefrielse vid omsättning under 120 000 kr per år) får "inkl. 25 % moms" och "varav moms" inte visas, och Stripe ska inte ta ut moms. Det kräver ändringar i köpsidan, kvittot, villkoren (`src/features/legal/legalContent.ts`) och Stripe-priserna – kontrollera med Skatteverket innan försäljningen börjar.

## Plattformar och butiker

Samma kod körs på webben och i de inbyggda apparna för App Store (bara iPhone) och Google Play. Bygget styrs av `VITE_DISTRIBUTION` (`web`, `appstore` eller `play`) och körmiljön avgörs i `src/config/platform.ts` (`sellsOnWeb`, `isInApp`, `allowsLicenseKeyEntry` …). Båda butiksapparna är [Capacitor 8](https://capacitorjs.com)-appar (projekten `ios/` och `android/`) runt butiksbygget i `dist-native/`; native-koden ligger i `src/native/` och laddas bara i apparna. Allt om apparna: [`docs/NATIVE.md`](docs/NATIVE.md).

| Bygge | Kommando | Hamnar i | Köp |
| --- | --- | --- | --- |
| Webben | `npx vite build` | `dist/` | Stripe |
| iPhone (App Store) | `VITE_API_BASE=https://<webbplatsen> npm run build:ios` | `dist-native/` → `ios/` | Bara köp i appen (StoreKit 2) |
| Android (Google Play) | `VITE_API_BASE=https://<webbplatsen> npm run build:android` | `dist-native/` → `android/` | Bara köp i appen (Google Play Billing) |

Butiksbyggena kräver dessutom säljarvariablerna ovan, till exempel:

```bash
VITE_API_BASE=https://<webbplatsen> \
VITE_SELLER_NAME="…" VITE_SELLER_ORGNR="…" VITE_SELLER_ADDRESS="…" VITE_SELLER_PHONE="…" \
VITE_SUPPORT_EMAIL="…" npm run build:ios
```

I butiksbygget finns ingen service worker (uppdateringar kommer via butiken), CSP:n läggs som meta-tagg i `index.html` (samma regler som `netlify.toml`, plus `VITE_API_BASE`), och varken Stripe-köp, kronpriser eller licensnyckelaktivering (App Store) visas. Köpen i appen görs med `@capgo/native-purchases` (StoreKit 2 och Play Billing, utan egen server) i `src/native/purchases.ts`. De är inkopplade (`NATIVE_PURCHASES_READY` i `src/lib/storePurchases.ts` är true) men bara testade med ett mockat tillägg – prova köp, avbrutet köp, "Återställ köp" och butikens priser i TestFlight och Play-testning före första inskickningen. Själva apparna byggs i CI (`.github/workflows/native.yml` för kontrollbyggen, `.github/workflows/release.yml` eller `codemagic.yaml` för signerade byggen till TestFlight och Google Play intern test) – Android SDK och Xcode behövs inte lokalt.

Steg för steg: [`docs/LANSERING.md`](docs/LANSERING.md) (vad som återstår före lansering), [`docs/APP-STORE.md`](docs/APP-STORE.md), [`docs/GOOGLE-PLAY.md`](docs/GOOGLE-PLAY.md) och [`docs/IOS-BYGGE-I-MOLNET.md`](docs/IOS-BYGGE-I-MOLNET.md) (iPhone-bygget i molnet, utan egen Mac).

### Butiksmaterial

```bash
node scripts/generate-icons.mjs --only=store     # appikonen 1024 × 1024 m.fl. till store-assets/
npm run native:assets                            # appikoner och startskärmar i ios/ och android/
node scripts/generate-store-graphics.mjs         # Google Plays funktionsgrafik (1024 × 500)
node scripts/app-store-screenshots.mjs [--dist=dist-native] [--only=apple|play] [--scheme=ljust|morkt]
ANDROID_PACKAGE=… ANDROID_SHA256="…,…" node scripts/generate-assetlinks.mjs   # assetlinks.json – bara för den tidigare TWA-appen, behövs inte för Capacitor-appen
```

Skärmdumparna kräver ett färdigt bygge och Playwright, och de checkas inte in (`store-assets/screenshots/` är gitignorerad).

### Lagom Moln (avstängt)

Lagom 1.0 har ingen egen databas. Den frivilliga, krypterade molnkopian **Lagom Moln** finns i koden men är avstängd tills `VITE_SUPABASE_URL` och `VITE_SUPABASE_PUBLISHABLE_KEY` sätts vid bygget. Läs [`docs/BACKEND.md`](docs/BACKEND.md) och [`docs/DPIA-SYNK.md`](docs/DPIA-SYNK.md) innan den slås på.

## Juridik och integritet

Texterna finns på ett ställe, `src/features/legal/legalContent.ts`, och de fristående sidorna och dokumenten skapas ur dem (`npx vitest run src/features/legal -u`):

- [`docs/INTEGRITETSPOLICY.md`](docs/INTEGRITETSPOLICY.md), [`docs/KOPVILLKOR.md`](docs/KOPVILLKOR.md) och [`docs/ANVANDARVILLKOR.md`](docs/ANVANDARVILLKOR.md)
- [`docs/BEHANDLINGSREGISTER.md`](docs/BEHANDLINGSREGISTER.md) och [`docs/AVSETT-ANDAMAL.md`](docs/AVSETT-ANDAMAL.md)

Allt är utkast skrivna utan jurist – läs dem noga och fyll i det som står inom hakparentes innan lanseringen.

## Utveckling

```bash
npm install
npm run dev        # utvecklingsserver
npm run build      # typkontroll + produktionsbygge (dist/)
npm test           # vitest
npm run typecheck  # tsc -b
npx oxlint src netlify scripts   # lint
```

Om Lagom → Felsökning visar versionen (`package.json`) och bygget (Netlifys `COMMIT_REF`), och där finns en lokal fellogg som användaren själv kan mejla. Licenserna för alla inbyggda paket skrivs till `licenses.txt` vid bygget.

### Livsmedelsverkets fullständiga databas

Den inbyggda databasen är kurerad och kvalitetskontrollerad. Hela Livsmedelsverkets livsmedelsdatabas (2 606 livsmedel) följer med som `public/data/livsmedelsverket.json` och visas i sökningens sektion "Fler från Livsmedelsverket". Med nätåtkomst kan du uppdatera filen:

```bash
npm run data:lmv   # skriver public/data/livsmedelsverket.json som appen laddar automatiskt
```

### Teknik

React 19, TypeScript, Vite, Tailwind CSS v4, Zustand (IndexedDB), motion, lucide-react och vite-plugin-pwa. Se [`CLAUDE.md`](CLAUDE.md) för kodkonventioner och designsystemet "Nordisk natur".

## Källor

- Livsmedelsverkets livsmedelsdatabas: namn och näringsvärden
- Nordiska näringsrekommendationer 2023 (NNR 2023): referensvärden
- Livsmedelsverkets kostråd och Tallriksmodellen
- Open Food Facts: streckkoder och produkter (ODbL)
- RISE Klimatdatabas för livsmedel: klimatschabloner (ungefärliga)
- 2024 Adult Compendium of Physical Activities: MET-värden

*Lagom är inte en medicinteknisk produkt och ersätter inte råd från vården. Kontakta 1177 Vårdguiden vid frågor om hälsa.*
