# Lagom i App Store (iPhone)

Allt som behövs för att lägga upp Lagom i App Store: konto, butikstexter, bilder, köp i appen,
formulärsvar, granskningsanteckningar och bygget. Skrivet för en ägare utan jurist, revisor eller
Mac – varje steg säger var i App Store Connect det görs.

> **Viktigt:** det här är en arbetsbeskrivning, inte juridisk rådgivning. Apples regler, formulär
> och avgifter ändras ofta. Läs alltid texten i App Store Connect innan du svarar, och kontrollera
> skatt och moms med Skatteverket (verksamt.se) om du är osäker.

**Läget just nu (2026-09-28):** iPhone-appen byggs med Capacitor 8. Xcode-projektet (`ios/`,
bara iPhone, integritetsmanifest, HealthKit), köp i appen med StoreKit 2
(`@capgo/native-purchases`) och de inbyggda funktionerna – streckkodsläsare (Apples Vision),
delning och export, lokala påminnelser, Apple Hälsa, haptik, statusfält och tangentbord – finns i
`src/native/`. Signerade byggen och uppladdning till TestFlight görs i molnet
(`.github/workflows/release.yml` eller `codemagic.yaml`). Allt om projektet, paketen och byggena:
[NATIVE.md](NATIVE.md); molnbygget steg för steg: [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md).

## Innehåll

1. [Beslut som gäller](#1-beslut-som-gäller)
2. [Konto och avtal](#2-konto-och-avtal)
3. [Skapa appen i App Store Connect](#3-skapa-appen-i-app-store-connect)
4. [Butikstexter](#4-butikstexter)
5. [Ikon och skärmdumpar](#5-ikon-och-skärmdumpar)
6. [Köp i appen och priser](#6-köp-i-appen-och-priser)
7. [App Privacy (integritetsetiketten)](#7-app-privacy-integritetsetiketten)
8. [Åldersklassning](#8-åldersklassning)
9. [Övriga frågor i App Store Connect](#9-övriga-frågor-i-app-store-connect)
10. [App Review Notes (granskningsanteckningar)](#10-app-review-notes-granskningsanteckningar)
11. [Bygge, TestFlight och inskickning](#11-bygge-testflight-och-inskickning)
12. [Checklista före inskickning](#12-checklista-före-inskickning)
13. [Vanliga avslag och hur du undviker dem](#13-vanliga-avslag-och-hur-du-undviker-dem)

---

## 1. Beslut som gäller

| Fråga | Beslut (2026-09-28) |
| --- | --- |
| Företagsform | Enskild firma. **Individkonto** hos Apple – säljarnamnet i App Store blir ditt eget namn. |
| Land | **Bara Sverige** vid lanseringen. |
| Enheter | **Bara iPhone** i version 1 (ingen iPad). |
| Målgrupp | Vuxna, **18 år och äldre**. |
| Priser | Årslicens **349 kr** och Livstidslicens **699 kr** (närmaste prisnivå i App Store Connect). |
| Livstid | För alltid, felrättningar ingår – inga löften om nya funktioner. |
| Betalning | **Bara köp i appen** (Apple In-App Purchase). Inga länkar till eller omnämnanden av webbköp. Koden för webbköp finns inte i appens paket – byggkontrollen stoppar bygget annars. |
| Licensnycklar | Kan **inte** aktiveras i App Store-appen. Köp återställs med **Återställ köp** (Apple-ID). Den som har köpt på webben får en erbjudandekod via supporten (se [avsnitt 6](#erbjudandekoder-för-webbköpare)). |
| Provperiod | 14 dagar. Startas med ett gratis köp i App Store (`prov14`, 0 kr, riktlinje 3.1.1) när den egna profilen är skapad – exempeldatan är skrivskyddad och startar ingen provperiod. Följer Apple-kontot och börjar inte om efter en ominstallation. |
| Appskal | **Capacitor 8**, iOS 16.4 eller senare, byggs med Xcode 26 i molnet. |
| Native-funktioner i v1 | Streckkodsläsare, delning/export, lokala påminnelser, Apple Hälsa (frivilligt), haptik. |

## 2. Konto och avtal

1. **Apple Developer Program** (developer.apple.com/programs): gå med som *Individual*. Avgiften är
   99 USD per år (dras i kronor). Du behöver ett Apple-ID med tvåfaktorsautentisering.
2. **Avtal, skatt och bank** (App Store Connect → *Business*, tidigare *Agreements, Tax, and
   Banking*): godkänn avtalet **Paid Apps Agreement**, fyll i bankkonto och skatteformulär. Som
   privatperson i Sverige fyller du i det amerikanska formuläret **W-8BEN** (intygar att du inte
   är skattskyldig i USA). Utan det här avtalet går det inte att sälja köp i appen.
3. **Näringsidkare enligt EU:s DSA** (App Store Connect → *Business* → *Digital Services Act*):
   du säljer appen och är därför *trader*. Apple kräver då adress, telefonnummer och e-post, som
   **visas offentligt på App Store-sidan i EU**. Tänk igenom vilken adress och vilket nummer du
   vill visa (t.ex. ett separat nummer för firman). Apple verifierar uppgifterna.
4. **App Store Small Business Program** (developer.apple.com/app-store/small-business-program):
   ansök – då tar Apple 15 % i provision i stället för 30 % så länge intäkterna är under
   1 miljon USD per år. Gör det innan första försäljningen.
5. **Moms och bokföring:** vid köp i App Store är det Apple som säljer till kunden och redovisar
   momsen i EU. Du får en utbetalning (efter moms och provision) och en rapport varje månad
   (*Payments and Financial Reports*). Spara rapporterna – de är underlag för bokföringen i
   firman. Fråga Skatteverket om du är osäker på hur utbetalningarna ska bokföras.

## 3. Skapa appen i App Store Connect

*App Store Connect → Appar → + → Ny app*

| Fält | Värde |
| --- | --- |
| Plattform | iOS |
| Namn | `Lagom` (reserv: `Lagom – kaloriräknaren` om namnet är upptaget) |
| Primärt språk | Svenska |
| Bundle ID | `se.lagomappen.lagom` (samma som i Xcode-projektet och `capacitor.config.ts`) – **kan inte ändras senare**; bekräfta det först ([NATIVE.md §1](NATIVE.md#1-att-bekräfta-innan-första-uppladdningen)) |
| SKU | `lagom-ios` (syns bara för dig) |
| Användaråtkomst | Full åtkomst |

Under *Prissättning och tillgänglighet* → *Tillgänglighet*: välj **bara Sverige**.

Bara iPhone ställs in i Xcode-projektet (*Targeted Device Family* = iPhone, `TARGETED_DEVICE_FAMILY = 1`)
– då behövs inga iPad-skärmdumpar. Se [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md).

## 4. Butikstexter

Reglerna som texterna följer (App Review Guidelines 2.3):

- Inga priser och inga rankingord ("bäst", "nr 1", "gratis") i **namn, undertitel, ikon och nyckelord**, och inga emoji. I beskrivningen står provperioden som "14 dagar utan kostnad" – ordet "gratis" används inte ens där.
- Inga andra plattformar (2.3.10) – nämn inte Android, Google Play eller webbversionen.
- Ingen hänvisning till köp utanför appen (3.1.1).
- Inga myndighetslogotyper och ingen antydan om att Lagom är kopplad till Livsmedelsverket.
- Namn och undertitel högst 30 tecken, nyckelord högst 100 tecken, beskrivning högst 4 000 tecken.

### Namn (högst 30 tecken)

```
Lagom
```

Reserv om namnet är upptaget (22 tecken):

```
Lagom – kaloriräknaren
```

Bara `Lagom` är troligen upptaget – minst två appar heter Lagom/LAGOM i App Store (se
[APPNAMN.md](APPNAMN.md)). Säger App Store Connect nej, använd reserven direkt.

### Undertitel (högst 30 tecken)

```
Svensk mat, näring & kostråd
```

(28 tecken.)

### Kampanjtext (högst 170 tecken, kan ändras utan ny granskning)

```
Logga svensk mat med Livsmedelsverkets näringsvärden och svenska mått. Inget konto, ingen reklam – dagboken stannar i din telefon.
```

### Beskrivning (högst 4 000 tecken)

```
Lagom är en svensk kost- och näringsdagbok för dig som vill ha koll på vad du äter – utan pekpinnar. Allt är på svenska, med svensk mat, svenska mått och Livsmedelsverkets näringsvärden.

LOGGA MAT SNABBT
• Sök bland svenska vardagslivsmedel – de flesta med näringsvärden från Livsmedelsverkets livsmedelsdatabas
• Ange mängden som du är van vid: gram, dl, msk, tsk, krm eller portioner (en skiva, en smörgås, en kopp)
• Kött, fisk, pasta och ris anges tillagade – du kan också ange vikten rå eller okokt, så räknar Lagom om
• Skanna streckkoden på förpackningen för att hitta produkten
• Spara måltider du äter ofta och lägg in dem med ett tryck

NÄRING OCH MÅL
• Dagsringen visar energi, protein, kolhydrater, fett och fibrer mot ditt dagsmål
• Vitaminer och mineraler jämförs med Nordiska näringsrekommendationer (NNR 2023)
• Livsmedelsverkets kostråd och Tallriksmodellen, förklarade enkelt
• Vatten, träning och vikt på samma ställe
• Koppla till Apple Hälsa om du vill: hämta vikt och steg, och spara energi, vatten och vikt
• Påminnelser om måltider och vatten om du vill – lugna, lokala notiser

RECEPT, PLANERING OCH INSIKTER
• Svenska klassiker och dina egna recept, med näring per portion
• Hämta recept från en webbadress
• Planera veckans måltider och få en inköpslista
• Insikter för veckan, 30 och 90 dagar – bara dagar du har loggat räknas
• Vikt och mått med en lugn trendlinje i stället för dagliga svängningar

LUGNT OCH UTAN SKULD
Lagom dömer inte. Går du över målet en dag står det "helt okej, det jämnar ut sig över veckan" – inga röda varningar. Appen räknar med ett kalorigolv och föreslår aldrig viktnedgång under graviditet eller amning. Är du orolig för din relation till mat finns hjälp hos 1177 och Frisk & Fri.

DIN DATA STANNAR HOS DIG
• Inget konto och ingen inloggning
• Dagboken sparas bara på din telefon – ingen reklam och ingen spårning
• Uppgifter från Apple Hälsa läses och sparas bara i telefonen och används aldrig för reklam
• Exportera allt när du vill, eller radera allt med ett par tryck
• Sökord och streckkoder skickas till Open Food Facts för att hitta produkter – utan ditt namn, din e-post eller din dagbok

PRIS
14 dagar utan kostnad, sedan årslicens eller livstidslicens som köp i appen, utan automatisk förnyelse. Priserna visas i App Store innan du köper. Provperioden startar du med ett köp för 0 kr i App Store när du har skapat din profil – exempeldatan kan du titta på så länge du vill. När provperioden är slut kan du fortfarande se, exportera och radera allt du har loggat.

KÄLLOR
Lagom är en fristående app och är inte kopplad till Livsmedelsverket; de flesta näringsvärdena kommer från Livsmedelsverkets öppna livsmedelsdatabas (CC BY 4.0), övriga är samlingsvärden för vanliga märken och värden från förpackningar. Produktuppgifter från streckkoder kommer från Open Food Facts (ODbL). Rekommendationerna bygger på Nordiska näringsrekommendationer 2023 och Livsmedelsverkets kostråd.

Lagom ger allmän information och uppskattningar – inte medicinsk rådgivning. Har du en sjukdom, är gravid eller har frågor om din hälsa: prata med vården.
```

(Ungefär 3 000 tecken.) Rubriken är medvetet inte "Lagom är bäst" – ordet "bäst" kan uppfattas som ett
rankingord vid granskningen. Veckoplaneringen, receptimporten, påminnelserna och Apple Hälsa ska
finnas i version 1.0 – kontrollera ändå i det bygge du skickar in att allt i texten finns i appen
(2.3.1). Raden om Apple Hälsa ska stå kvar så länge kopplingen finns: Apple kräver att en app som
använder HealthKit säger det i beskrivningen och tydligt i appen (2.5.1).

### Nyckelord (högst 100 tecken, kommaseparerade utan mellanslag)

```
kalorier,kaloriräknare,kcal,kostdagbok,matdagbok,protein,fibrer,vikt,hälsa,recept,streckkod,vatten
```

(98 tecken.) Ord i namnet och undertiteln (Lagom, mat, näring, kostråd) räknas redan och ska inte
upprepas. Använd aldrig namn på andra appar, företag eller myndigheter som nyckelord.

### Nyheter i den här versionen (version 1.0)

```
Välkommen till Lagom! Den första versionen innehåller matdagbok med Livsmedelsverkets näringsvärden och svenska mått, streckkodsläsare, recept, insikter, vikt och mått, vatten och träning – och om du vill påminnelser och koppling till Apple Hälsa. Hittar du något som inte fungerar? Skriv till oss via Om Lagom → Felsökning.
```

### Kategori

- Primär kategori: **Hälsa och träning** (Health & Fitness)
- Sekundär kategori (valfri): **Mat och dryck** (Food & Drink)

### Adresser och övrigt

| Fält | Värde |
| --- | --- |
| Support-URL | `https://<domän>/support/` (sidan finns i `public/support/index.html`) |
| Marknadsförings-URL (valfri) | `https://<domän>/` |
| Integritetspolicy-URL | `https://<domän>/integritet/` |
| Licensavtal (EULA) | Apples standardavtal räcker. Lagoms villkor finns på `https://<domän>/villkor/`. |
| Copyright | `2026 <ditt namn>` |

`<domän>` fylls i när domänen är bestämd (samma adress som `APP_URL` i docs/BETALNING.md, t.ex.
`lagom.netlify.app` tills en egen domän finns). Supportsidans e-postadress fylls i från
`VITE_SUPPORT_EMAIL` när sidan byggs.

## 5. Ikon och skärmdumpar

### Appikonen (1 024 × 1 024 px)

`store-assets/app-store-icon-1024.png` – fyrkantig, utan genomskinlighet och **utan alfakanal**
(Apple avvisar ikoner med alfakanal). Den används i Xcode-projektets ikon (en enda 1 024-ikon
räcker i dagens Xcode) och visas i App Store. Skapa den igen efter ändringar i `public/icon.svg`:

```sh
node scripts/generate-icons.mjs --only=store
```

Skriptet kontrollerar själv att filen är 1 024 × 1 024 px och har PNG-färgtyp 2 (RGB utan alfa)
och avbryter annars. Ikonen ligger medvetet inte i `public/` – då skulle den hamna i webbappens
cache i onödan.

### Skärmdumpar

App Store Connect kräver skärmdumpar för den största iPhone-storleken (6,9 tum,
1 320 × 2 868 px) och skalar ned dem till mindre telefoner själv. Du behöver 3–10 bilder.

Skärmdumparna tas med exempeldatan, i ljust och mörkt läge, med skriptet
`scripts/app-store-screenshots.mjs` (Playwright, ingen Mac behövs):

```sh
# 1. Bygg appen (skriptet bygger inte själv). Använd butiksbygget – med samma miljövariabler
#    som i avsnitt 11 (säljaruppgifterna och VITE_SUPPORT_EMAIL krävs, annars stoppas bygget):
VITE_DISTRIBUTION=appstore VITE_API_BASE=https://<domän> npx vite build   # → dist-native/
# 2. Ta bilderna:
node scripts/app-store-screenshots.mjs --dist=dist-native --only=apple
```

- Utan `--dist` används `dist/` (webbygget från `npx vite build`). Ta inte App Store-bilderna
  från webbygget – där kan webbens tips och köpvägar synas, som inte finns i iPhone-appen.
- Bilderna hamnar i `store-assets/screenshots/apple/ljust/` och `…/morkt/` (1 320 × 2 868 px).
  Välj **ett** av lägena (ljust rekommenderas) när du laddar upp.
- Sidorna: Idag, Dagbok, Insikter (förra veckan), Recept, Vikt & mått och ett livsmedel med
  näringsvärden. Dryck (alkohol) och Lagom Premium (priser) fotograferas aldrig.
- Rutan "Du tittar på exempeldata" och notiser döljs, så att bilderna visar appen som i vardagen.
- Skriptet startar `vite preview` på en ledig port och stänger den efteråt.
- Mappen `store-assets/screenshots/` checkas inte in (se `.gitignore`) – ta bilderna precis före
  inskickningen, från samma version som du skickar in. Datumen i bilderna är dagens datum.
- Playwright hittas i projektet eller globalt (`npm root -g`). Saknas det:
  `npm i -g playwright && npx playwright install chromium`.

Apple kräver att skärmdumparna visar appen som den faktiskt ser ut (2.3.3) – redigera dem inte
och lägg inte till priser eller påståenden.

## 6. Köp i appen och priser

*App Store Connect → din app → Monetisering → Köp i appen*

Produkt-id:na måste vara exakt desamma som i `src/lib/storePurchases.ts`:

| Referensnamn | Produkt-id | Typ | Pris |
| --- | --- | --- | --- |
| Livstidslicens | `livstid` | **Non-Consumable** (engångsköp) | Närmaste prisnivå till 699 kr |
| Årslicens | `ar` | **Non-Renewing Subscription** (förnyas inte automatiskt) | Närmaste prisnivå till 349 kr |

För varje produkt:

1. Visningsnamn (svenska): `Livstidslicens` respektive `Årslicens`.
2. Beskrivning: `Allt i Lagom. För alltid – felrättningar ingår.` respektive
   `Allt i Lagom i ett år. Förnyas inte automatiskt.`
3. Pris: välj Sverige som bas och den prisnivå som ligger närmast 349 kr/699 kr (priserna i App
   Store anges inklusive moms). Tillgänglighet: bara Sverige.
4. Granskningsbild: en skärmdump av sidan Lagom Premium (640 × 920 px eller större) och en kort
   anteckning, t.ex. *"Shown on Mer → Lagom Premium."*
5. Första gången skickas produkterna in **tillsammans med appversionen**.

Så beter sig appen (bra att veta vid granskningen):

- Priserna i appen hämtas från App Store – inga kronbelopp är inskrivna i appbygget. Butikens
  priser visas i välkomststeget och i sammanfattningen innan provperioden startar (riktlinje
  3.1.1: det som kostar efter provperioden ska synas innan den börjar). Går priserna inte att
  hämta står det "priserna visas i App Store innan du köper".
- **Byggkontrollen stoppar App Store-bygget** om köp i appen inte är inkopplade
  (`NATIVE_PURCHASES_READY` i `src/lib/storePurchases.ts`; köpen finns i `src/native/purchases.ts`
  och flaggan är true). Då kan en app där det inte går att köpa aldrig skickas in av misstag. Ett testbygge
  för simulatorn eller skärmdumpar görs med `LAGOM_ALLOW_STORE_WITHOUT_IAP=1` – skicka aldrig in ett
  sådant bygge. Går butiken inte att nå visar köpknappen "Köp är inte tillgängliga just nu" –
  aldrig ett löfte om en kommande version.
- Årslicensen döljs när en livstidslicens redan är köpt.
- **Återställ köp** finns på sidan Lagom Premium och under Inställningar → Licens.
- Årslicensen gäller 365 dagar från köpet och förnyas inte. Apple kräver att sådana köp kan
  återställas på användarens alla iPhone med samma Apple-ID – det sköts av Återställ köp.
  Tillägget (`@capgo/native-purchases`) använder StoreKit 2 (`Transaction.currentEntitlements`,
  `Transaction.all`, `AppStore.sync`), som till skillnad från StoreKit 1 också hämtar köp av typen
  Non-Renewing Subscription.
- **Förnyelse i förväg:** de sista 30 dagarna kan ett nytt år köpas. Appen läser då alla köpta år
  (`Transaction.all`, utan återkallade) och lägger dem efter varandra – det nya året börjar när
  det förra slutar, så inga betalda dagar går förlorade. Köppanelen säger det före köpet, och
  köpvillkoren likaså (Apples modell för non-renewing subscriptions: appen ansvarar för perioden).
- De senast kända köpen sparas på telefonen (`lagom-butikskop` i localStorage: produkt, köpdatum,
  slutdatum), så att den som har köpt inte stängs ute när App Store inte svarar.
- Ett återbetalt köp (Apple återbetalar själv, via reportaproblem.apple.com) får ett
  återkallelsedatum och slutar gälla nästa gång appen hämtar köpen.

### Testa köpen (TestFlight och sandlådan)

- **I TestFlight** görs köpen automatiskt i Apples testmiljö (sandlådan) med testarens **eget
  Apple-ID** – inga pengar dras. Ett köp av `livstid` eller `prov14` kan inte nollställas för det
  Apple-ID:t. Prova därför i den här ordningen: provperioden (`prov14`), sedan `ar`, sedan
  `livstid`, och be en vän med ett annat Apple-ID att prova samma sak.
- **Sandlådekonton** (*App Store Connect → Användare och åtkomst → Sandlåda → Testkonton → +*)
  går att nollställa (*Rensa köphistorik*). Använd en e-postadress som inte redan är ett Apple-ID,
  t.ex. `dittnamn+sandbox1@gmail.com`, och land **Sverige**. På iPhone med iOS 18 eller senare
  loggar du in under *Inställningar → Utvecklare → Sandbox-Apple-konto*. Menyn *Utvecklare* visas
  normalt bara på telefoner som har använts med Xcode – finns den inte räcker TestFlight och ett
  andra Apple-ID.
- Prova: starta provperioden med "Starta 14 dagar gratis" (och avbryt en gång först – då startar
  inget), köp `ar` och `livstid`, avbryt ett köp, *Återställ köp* efter att appen har tagits bort
  och installerats igen (provperioden ska komma tillbaka, inte börja om), att priserna från App
  Store syns före provperioden, att ett år som köps i förväg förlänger årslicensen med ett helt år,
  att Lagom är upplåst i flygplansläge, och att årslicensen döljs när livstid är köpt.
- `NATIVE_PURCHASES_READY` i `src/lib/storePurchases.ts` är satt till true men räknas som klar
  först när det här fungerar på en riktig iPhone. Fungerar något inte: sätt den till false och
  bygg om, så stoppar byggkontrollen butiksbyggena tills det är rättat.

### Provperioden (14 dagar) i App Store

Apple beskriver i riktlinje 3.1.1 hur en app utan automatiskt förnyad prenumeration får erbjuda
en gratis provperiod: som ett **engångsköp (Non-Consumable) för 0 kr** med namnet
"14 dagars provperiod" (på engelska *14-day Trial*). **Så gör iPhone-appen:** provperioden
startas med köpet `prov14` och räknas från det (`trialViaStore()` i `src/config/platform.ts`,
`startStoreTrial()` i `src/features/premium/premiumLogic.ts`). Webben och Google Play-appen har
kvar den lokala provperioden.

| Referensnamn | Produkt-id | Typ | Pris |
| --- | --- | --- | --- |
| 14 dagars provperiod | `prov14` | Non-Consumable | 0 kr (gratis) |

- **Produkten måste finnas och skickas in med appversionen** – appen köper den. Visningsnamn
  `14 dagars provperiod`, beskrivning `Prova allt i Lagom i 14 dagar. Inget dras.`, granskningsbild:
  kortet "Starta din provperiod" på Idag.
- Välkomstflödets sista steg har knappen **"Starta 14 dagar gratis"**, och texten ovanför säger hur
  länge provperioden gäller, att den gäller en gång per Apple-konto, att ny loggning sedan kräver
  en licens och vad licenserna kostar (butikens priser). Profilen skapas även om köpet avbryts; då
  har Idag, spärren, Inställningar → Licens och Lagom Premium samma knapp. Exempeldatan går att
  titta på utan att starta provperioden.
- Provperioden följer Apple-kontot: den kommer tillbaka med *Återställ köp* och börjar inte om
  när appen installeras på nytt eller datan raderas.

### Erbjudandekoder för webbköpare

Den som har köpt en licens på webben kan inte aktivera licensnyckeln i iPhone-appen. Hjälp dem
så här:

1. *App Store Connect → Köp i appen → Livstidslicens (eller Årslicens) → Erbjudandekoder* (Offer
   Codes): skapa en kod för engångsbruk.
2. Kontrollera först att webbköpet är äkta och inte återbetalt (se docs/BETALNING.md och
   spärrlistan för återbetalda licenser).
3. Mejla koden till kunden med instruktionen: *App Store → din profilbild → Lös in presentkort
   eller kod*.

Nämn aldrig webbköp i App Store-appen eller i butikstexterna – det sköts bara via supporten.

## 7. App Privacy (integritetsetiketten)

*App Store Connect → din app → App Privacy*

**Samlar du eller tredje part in data från den här appen?** Ja – bara det här:

| Datatyp | Används för | Kopplad till personen? | Spårning? |
| --- | --- | --- | --- |
| **Sökhistorik** (Search History) | Appens funktion (App Functionality) | **Nej** | **Nej** |

Varför: sökord och streckkoder skickas till Open Food Facts för att hitta produkter. Inget konto,
inget användar-id och ingen reklam – därför är uppgiften inte kopplad till någon person och används
inte för spårning.

Det här samlas **inte** in (och ska inte kryssas i):

- Hälsa och träning, kost och vikt – dagboken sparas bara på telefonen och lämnar den aldrig. Det
  gäller också uppgifter som läses från eller sparas i Apple Hälsa (HealthKit).
- Köp – köpet hanteras av Apple; appen skickar inga köpuppgifter till någon server. Tillägget
  `@capgo/native-purchases` talar direkt med StoreKit 2, utan egen server och utan konto hos någon
  tredje part (se [NATIVE.md §2](NATIVE.md#2-paketen-och-varför)). Skulle det bytas mot
  **RevenueCat** får RevenueCat köphistorik och ett
  användar-id – då måste *Purchases* och *Identifiers* anges här, RevenueCat läggas till som
  personuppgiftsbiträde i integritetspolicyn och i registerförteckningen, och Data safety i Google
  Play ändras på samma sätt – **före** inskickningen.
- Identifierare, plats, kontakter, foton – streckkodsläsaren tolkar kamerabilden i telefonen och
  sparar eller skickar inga bilder. Framstegsbilder (frivilliga) sparas nedskalade och utan
  platsuppgifter bara i appens mapp på telefonen (`Library/NoCloud`) och lämnar den aldrig – det
  räknas inte som insamling. Delade recept och måltider skickar användaren själv (länk eller fil).
- Diagnostik – felloggen sparas bara i telefonen och skickas bara om användaren själv mejlar
  felrapporten till supporten. Det är frivilligt och sker sällan, vilket enligt Apples regler
  inte behöver redovisas. (Vill du vara extra försiktig kan du ange *Other Diagnostic Data –
  App Functionality – Not linked – No tracking*.)
- Receptimport från en webbadress – adressen skickas till Lagoms
  server, som hämtar receptet direkt och inte sparar något. Apple räknar inte sådant som
  insamling, eftersom uppgiften bara används just då för att svara på förfrågan.

De inbyggda funktionerna ändrar inte svaren:

| Funktion | Lämnar data telefonen? | Anges i App Privacy? |
| --- | --- | --- |
| Apple Hälsa (HealthKit) – läser vikt och steg; skriver vikt, energi och vatten | Nej – läses och skrivs på telefonen | Nej (men beskrivs i integritetspolicyn; Apple kräver att hälsodata aldrig används för reklam eller lämnas vidare) |
| Streckkodsläsaren (Apples Vision) | Nej – bilden tolkas på telefonen och sparas inte; bara streckkoden skickas till Open Food Facts | Sökhistorik (som ovan) |
| Påminnelser (lokala notiser) | Nej – ingen pushtjänst | Nej |
| Köp i appen (StoreKit 2) | Bara mellan telefonen och Apple | Nej |
| Export och delning | Bara dit användaren själv väljer i delningsbladet | Nej |

**Spårning (App Tracking Transparency):** Nej. Appen visar ingen spårningsfråga.

**Privacy manifest (`PrivacyInfo.xcprivacy`):** finns i Xcode-projektet
(`ios/App/App/PrivacyInfo.xcprivacy`) med samma datatyp (Search History, inte kopplad, ingen
spårning) och de "required reason APIs" som tilläggen använder (filtidsstämplar `C617.1`,
UserDefaults `CA92.1`) – se [NATIVE.md §8](NATIVE.md#8-integritet-app-privacy-och-data-safety).

## 8. Åldersklassning

*App Store Connect → din app → App Information → Age Rating*. Svara så här (namnen på frågorna
kan skilja något):

| Fråga | Svar | Varför |
| --- | --- | --- |
| Alcohol, Tobacco, or Drug Use or References | **Infrequent** | Dryck kan loggas, med alkoholenheter och Livsmedelsverkets råd. Alkohol framställs aldrig positivt. |
| Medical or Treatment Information | **Infrequent** | Kostråd, NNR 2023 och hänvisningar till 1177 och Frisk & Fri – allmän information, inte behandling. |
| Health or Wellness Topics | **Ja** | Kost, vikt och näring. |
| Sexual content, violence, horror, profanity, gambling, contests | Nej / None | – |
| Unrestricted Web Access | Nej | Externa länkar öppnas i Safari, inte i en webbläsare i appen. |
| User-Generated Content, Messaging and Chat, sociala medier | **Nej** | Ingen kontakt mellan användare. |
| Advertising | Nej | Ingen reklam. |
| Parental Controls / Age Assurance | Nej | – |

Målgruppen är vuxna (18+), och appen går bara att använda från 18 år (räknat på födelseåret –
den som fyller 18 i år släpps in, men får inget förslag om viktnedgång förrän hen säkert har
fyllt 18). Beräknas en lägre åldersgräns och App Store Connect erbjuder att välja en högre
(*Age Rating Override* eller liknande), välj **18+**. Finns inget sådant val gäller den beräknade
gränsen – det är okej, eftersom appen själv släpper in bara vuxna.

## 9. Övriga frågor i App Store Connect

| Fråga | Svar |
| --- | --- |
| **Regulated medical device** (EU MDR-status) | **Nej.** Lagom är en kostdagbok med allmän information, inte en medicinteknisk produkt. Se docs/AVSETT-ANDAMAL.md. |
| **Export Compliance / kryptering** | Appen använder bara standardkryptering (HTTPS) och signaturkontroll. Sätt `ITSAppUsesNonExemptEncryption` = **NO** i `Info.plist`, så slipper du frågan vid varje uppladdning. |
| **Content Rights** – innehåller appen innehåll från tredje part? | **Ja**, och du har rätt att använda det: Livsmedelsverkets livsmedelsdatabas (CC BY 4.0, källan anges i appen), Open Food Facts (data ODbL, bilder CC BY-SA, källan anges), typsnitten Fraunces och Inter (SIL Open Font License), Workbox (MIT). Licenstexterna finns i `public/licenses/` och i Om Lagom. |
| **Betalningsval i EU** (alternativa villkor, länkar till extern betalning) | **Nej.** Behåll Apples standardvillkor och bara köp i appen. Ansök inte om *StoreKit External Purchase Link Entitlement* eller *Alternative Terms Addendum for Apps in the EU*. |
| **Sign in with Apple** | Behövs inte – appen har inga konton. |
| **Kamerabehörighet** (`NSCameraUsageDescription` i `Info.plist`) | `Lagom använder kameran för att läsa streckkoder på förpackningar – de bilderna sparas inte. Om du slår på framstegsbilder kan du också ta bilder på dig själv; de sparas bara i appen på din iPhone och lämnar den aldrig.` |
| **Apple Hälsa** (`NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`, HealthKit-förmågan) | Texterna och förmågan finns i projektet ([NATIVE.md §5](NATIVE.md#5-iphone-projektet-ios)). Slå på **HealthKit** för Bundle ID:t på developer.apple.com. Apple kräver att appen tydligt visar när den använder Hälsa (Inställningar → Apple Hälsa), att beskrivningen nämner kopplingen (2.5.1), att integritetspolicyn beskriver den och att hälsodata aldrig används för reklam eller lämnas vidare (5.1.3). |
| **Notiser** | Lokala påminnelser – ingen pushfunktion (*Push Notifications* ska **inte** slås på för Bundle ID:t). iPhone frågar om lov först när användaren slår på en påminnelse. |
| **Digital Services Act – trader** | Ja (du säljer appen). Se [avsnitt 2](#2-konto-och-avtal). |

## 10. App Review Notes (granskningsanteckningar)

*App Store Connect → versionen → App Review Information*. Kryssa **inte** i "Sign-in required".
Kontaktuppgifter: ditt namn, telefon och e-post. Klistra in (på engelska):

```
No account needed. Tap 'Utforska med exempeldata' on the welcome screen to load two weeks of sample data. All data stays on the device. Purchases: Mer → Lagom Premium (In-App Purchase, Restore button). The Annual licence is hidden when a Lifetime licence is owned. After the trial only new logging requires a purchase – viewing, export and deletion always work.

The sample data is read-only. To try logging food, tap 'Börja med min egen profil' (Idag) and answer a few questions. The last step explains the trial (length, what requires a purchase afterwards, prices from the App Store) and its button 'Starta 14 dagar gratis' starts the 14-day trial with the free in-app purchase 'prov14'. If that purchase is cancelled, the profile is still created and the same button is shown on Idag.

In-app purchases: 'prov14' (14-day Trial, non-consumable, free – follows the Apple ID and is restored with Restore Purchases, so it cannot be restarted by reinstalling), 'livstid' (Lifetime licence, non-consumable) and 'ar' (Annual licence, non-renewing subscription, 365 days, does not auto-renew; an Annual licence bought during the last 30 days starts when the current one ends). Prices are loaded from the App Store. Restore Purchases is on Mer → Lagom Premium and in Inställningar → Licens.

Native features (all optional and off by default): Apple Health (HealthKit) in Inställningar → Apple Hälsa reads weight and steps and writes weight that the user logs, and dietary energy and water for finished days (HealthKit samples cannot be edited by the app afterwards, so only completed days are sent); health data stays on the device and is never used for advertising or shared. Reminders (Inställningar → Påminnelser) are local notifications only. The barcode scanner uses the camera with Apple's Vision framework; no images are stored or sent. Export and backup use the iOS share sheet. The whole app works offline with on-device storage.

The app is in Swedish and only available in Sweden. Nutrition values come from the Swedish Food Agency's open database (CC BY 4.0); the app is independent and not affiliated with the agency. The app gives general information and estimates, not medical advice.
```

Kontrollera före inskickningen att texten stämmer med bygget – ta bort en funktion ur stycket
"Native features" om den inte finns i versionen du skickar in.

## 11. Bygge, TestFlight och inskickning

Du har ingen Mac – bygget, signeringen och uppladdningen görs i molnet, med **GitHub Actions**
(`.github/workflows/release.yml`) eller **Codemagic** (`codemagic.yaml`). Jämförelse och steg för
steg: [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md); hemligheterna: [NATIVE.md §9](NATIVE.md#9-molnbyggen-kontroll-signering-och-uppladdning).
I korthet:

1. **En gång:** Bundle ID `se.lagomappen.lagom` med **HealthKit** och **In-App Purchase**, appen i
   App Store Connect, en App Store Connect API-nyckel (rollen **App Manager**) och en privat nyckel
   för distributionscertifikatet – se [NATIVE.md §10](NATIVE.md#10-steg-för-steg-för-ägaren-utan-mac).
   Xcode-projektet är redan klart (bara iPhone, ikon, `ITSAppUsesNonExemptEncryption` = NO,
   kamera- och Hälsa-texter, integritetsmanifest).
2. **Webbdelen** byggs skarpt i molnbygget (`npm run build:ios`) med dina uppgifter som
   variabler – samma som i Netlifys produktion:

   | Variabel | Vad |
   | --- | --- |
   | `VITE_API_BASE` | Webbplatsens adress med `https://` (serverfunktionerna) |
   | `VITE_SELLER_NAME`, `VITE_SELLER_ADDRESS`, `VITE_SELLER_PHONE` | Dina uppgifter som säljare (enskild firma: ditt namn) – visas i köpvillkoren |
   | `VITE_SELLER_ORGNR` | Frivilligt (bara en varning utan): för enskild firma ditt personnummer, som då blir offentligt. Läs rutan om det i docs/BETALNING.md |
   | `VITE_SUPPORT_EMAIL` | Supportadressen (inte en exempeladress) |
   | `VITE_COMMERCE_MODE` | `live` – molnbygget vägrar annars (i testläge godtas osignerade testlicenser från säkerhetskopior) |
   | `VITE_LICENSE_PUBLIC_KEYS` | Samma publika licensnyckel som på Netlify (krävs i skarpt läge; licensnycklar kan inte klistras in i App Store-appen) |

   Byggkontrollen (`scripts/commerce-guard.ts`) stoppar bygget om något saknas. Ett testbygge med
   `LAGOM_ALLOW_STORE_WITHOUT_IAP=1` (simulator, skärmdumpar) görs bara i kontrollbygget
   (`native.yml`) och skickas aldrig in. De fristående sidorna (integritetspolicy, villkor,
   support, radering) tas bort ur `dist-native/`: i appen finns policyn och villkoren som egna
   sidor med iPhone-text.
3. **Versionsnummer:** marknadsversionen (t.ex. 1.0.0) tas från `version` i `package.json`;
   byggnumret är körningens nummer i GitHub (plus `LAGOM_BUILD_NUMBER_OFFSET`) eller App Store
   Connects senaste + 1 i Codemagic. Molnbygget kontrollerar båda i den färdiga IPA:n.
4. **Signera och ladda upp:** molnbygget hämtar (eller skapar första gången)
   distributionscertifikatet och en App Store-profil via API-nyckeln, arkiverar med Xcode 26,
   kontrollerar att HealthKit finns i appens behörigheter och laddar upp till App Store Connect.
5. **TestFlight:** efter uppladdningen behandlar Apple bygget (upp till en timme). Interna testare
   får det direkt; installera TestFlight-appen på din iPhone. Testa köp (avsnitt 6), Återställ
   köp, streckkodsläsaren, Apple Hälsa, påminnelser, export/delning och radering av data – och
   att appen fungerar utan uppkoppling.
6. **Skicka in:** välj bygget under versionen, fyll i allt i den här filen och tryck på
   *Lägg till för granskning*. Svaret kommer oftast inom ett par dygn.

## 12. Checklista före inskickning

- [ ] Paid Apps Agreement, bank och W-8BEN är klara; Small Business Program sökt; DSA-uppgifter ifyllda.
- [ ] Säljaruppgifterna (`VITE_SELLER_*`) och `VITE_SUPPORT_EMAIL` är ifyllda – inga `[Företagsnamn]` eller `[E-post]` kvar i integritetspolicyn, villkoren eller supportsidan.
- [ ] `https://<domän>/support/`, `/integritet/` och `/villkor/` fungerar.
- [ ] Namn, undertitel, beskrivning, nyckelord, kategori och URL:er inlagda.
- [ ] Ikon och 3–10 skärmdumpar (1 320 × 2 868 px) från den version som skickas in.
- [ ] Köp i appen `prov14` (0 kr), `livstid` och `ar` skapade, prissatta, bara Sverige, med granskningsbild, och valda för den här versionen (avsnitt 6) – appen köper `prov14` när provperioden startas.
- [ ] Köpen provade i TestFlight enligt "Testa köpen" ovan (provperioden, avbrutet köp, Återställ köp, förnyelse i förväg, flygplansläge).
- [ ] Välkomstflödet säger före provperioden hur lång den är, vad som kräver köp efteråt och vad licenserna kostar (butikens priser – kontrollera i TestFlight att de syns).
- [ ] Bygget kommer från molnbygget (`release.yml` eller `codemagic.yaml`) – **utan** `LAGOM_ALLOW_STORE_WITHOUT_IAP`, med `VITE_COMMERCE_MODE=live` och `NATIVE_PURCHASES_READY = true` – och är **inte** markerat "bara intern test".
- [ ] HealthKit och In-App Purchase påslagna för Bundle ID:t; integritetspolicyn beskriver Apple Hälsa, påminnelser och köp via App Store.
- [ ] Testat i TestFlight på en riktig iPhone: Apple Hälsa (koppla, neka, koppla bort), påminnelser (tillåt/neka notiser), streckkodsläsaren (och nekad kamera), export via delningsbladet.
- [ ] App Privacy, åldersklassning, MDR = Nej, export compliance, Content Rights besvarade.
- [ ] Tillgänglighet: bara Sverige. Enheter: bara iPhone.
- [ ] Granskningsanteckningarna ovan inklistrade.
- [ ] Testat i TestFlight: exempeldata, egen profil, köp (sandbox), Återställ köp, export och radering.
- [ ] Inga omnämnanden av webbköp, Android eller Google Play i appen eller texterna.

## 13. Vanliga avslag och hur du undviker dem

| Riktlinje | Risk | Så undviker du det |
| --- | --- | --- |
| 2.1 Appens fullständighet | Granskaren hittar platshållare, döda länkar eller en krasch. | Testa i TestFlight; inga `[E-post]`-platshållare kvar. |
| 2.3.3 Skärmdumpar | Bilder som inte visar appen i bruk. | Använd skriptet; redigera inte bilderna. |
| 2.3.10 Andra plattformar | Texten nämner Android eller webben. | Håll texterna som ovan. |
| 3.1.1 Köp i appen | Länk till eller omnämnande av webbköp. | App Store-bygget visar inga webbpriser eller licensnycklar. |
| 3.1.2 Återställning | Köp går inte att återställa. | Knappen Återställ köp finns på två ställen. |
| 4.2 Minsta funktion | Appen upplevs som en webbsida i ett skal. | Anteckningarna nämner de inbyggda funktionerna (Apple Hälsa, påminnelser, streckkodsläsare med Vision, delningsbladet) och att allt fungerar offline. |
| 2.5.1 / 5.1.3 HealthKit | Kopplingen nämns inte i beskrivningen, syns inte tydligt i appen eller saknas i integritetspolicyn. | Raden om Apple Hälsa i beskrivningen, Inställningar → Apple Hälsa i appen, och ett stycke om Hälsa i policyn. |
| 5.1.1 Behörigheter | Appen frågar om kamera, Hälsa eller notiser utan att det behövs just då. | Frågorna kommer först när användaren själv startar streckkodsläsaren, kopplar Hälsa eller slår på en påminnelse. |
| 5.1.1 Integritet | Integritetspolicyn saknas eller stämmer inte med App Privacy. | Samma uppgifter i båda (se avsnitt 7). |
| 1.4.1 Hälsa | Påståenden om medicinsk effekt. | Texten säger "allmän information och uppskattningar – inte medicinsk rådgivning". |

Blir appen avvisad: läs meddelandet i *Resolution Center*, svara lugnt och sakligt (gärna på
engelska) och rätta det som efterfrågas. Det går att överklaga via *App Review Board* om du
tycker att beslutet är fel.
