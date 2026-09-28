# Lagom i App Store (iPhone)

Allt som behövs för att lägga upp Lagom i App Store: konto, butikstexter, bilder, köp i appen,
formulärsvar, granskningsanteckningar och bygget. Skrivet för en ägare utan jurist, revisor eller
Mac – varje steg säger var i App Store Connect det görs.

> **Viktigt:** det här är en arbetsbeskrivning, inte juridisk rådgivning. Apples regler, formulär
> och avgifter ändras ofta. Läs alltid texten i App Store Connect innan du svarar, och kontrollera
> skatt och moms med Skatteverket (verksamt.se) om du är osäker.

**Läget just nu (hösten 2026):** iPhone-appen byggs med Capacitor, som ännu inte är installerat.
Koden är förberedd (`VITE_DISTRIBUTION=appstore`, plattformsflaggor i `src/config/platform.ts`,
köp i appen i `src/lib/storePurchases.ts`), men själva Xcode-projektet och IAP-tillägget kommer i
nästa steg. Bygget görs i molnet – se [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md).

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
| Betalning | **Bara köp i appen** (Apple In-App Purchase). Inga länkar till eller omnämnanden av webbköp. |
| Licensnycklar | Kan **inte** aktiveras i App Store-appen. Köp återställs med **Återställ köp** (Apple-ID). Den som har köpt på webben får en erbjudandekod via supporten (se [avsnitt 6](#erbjudandekoder-för-webbköpare)). |
| Provperiod | 14 dagar. Startar när den egna profilen skapas – exempeldatan är skrivskyddad och startar ingen provperiod. |

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
| Bundle ID | Samma som i Xcode-projektet, t.ex. `se.<dittnamn>.lagom` – **kan inte ändras senare** |
| SKU | `lagom-ios` (syns bara för dig) |
| Användaråtkomst | Full åtkomst |

Under *Prissättning och tillgänglighet* → *Tillgänglighet*: välj **bara Sverige**.

Bara iPhone ställs in i Xcode-projektet (*Targeted Device Family* = iPhone, `TARGETED_DEVICE_FAMILY = 1`)
– då behövs inga iPad-skärmdumpar. Se [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md).

## 4. Butikstexter

Reglerna som texterna följer (App Review Guidelines 2.3):

- Inga priser i namn eller undertitel, inga rankingord ("bäst", "nr 1", "gratis"), inga emoji.
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
• Sök bland svenska vardagslivsmedel med näringsvärden från Livsmedelsverkets livsmedelsdatabas
• Ange mängden som du är van vid: gram, dl, msk, tsk, krm eller portioner (en skiva, en smörgås, en kopp)
• Kött, fisk, pasta och ris anges tillagade – du kan också ange vikten rå eller okokt, så räknar Lagom om
• Skanna streckkoden på förpackningen för att hitta produkten
• Spara måltider du äter ofta och lägg in dem med ett tryck

NÄRING OCH MÅL
• Dagsringen visar energi, protein, kolhydrater, fett och fibrer mot ditt dagsmål
• Vitaminer och mineraler jämförs med Nordiska näringsrekommendationer (NNR 2023)
• Livsmedelsverkets kostråd och Tallriksmodellen, förklarade enkelt
• Vatten, träning och vikt på samma ställe

RECEPT OCH INSIKTER
• Svenska klassiker och dina egna recept, med näring per portion
• Insikter för veckan, 30 och 90 dagar – bara dagar du har loggat räknas
• Vikt och mått med en lugn trendlinje i stället för dagliga svängningar

LUGNT OCH UTAN SKULD
Lagom dömer inte. Går du över målet en dag står det "helt okej, det jämnar ut sig över veckan" – inga röda varningar. Appen räknar med ett kalorigolv och föreslår aldrig viktnedgång under graviditet eller amning. Är du orolig för din relation till mat finns hjälp hos 1177 och Frisk & Fri.

DIN DATA STANNAR HOS DIG
• Inget konto och ingen inloggning
• Dagboken sparas bara på din telefon – ingen reklam och ingen spårning
• Exportera allt när du vill, eller radera allt med ett par tryck
• Sökord och streckkoder skickas till Open Food Facts för att hitta produkter, utan uppgifter om dig

PRIS
14 dagar gratis, sedan årslicens eller livstidslicens som köp i appen, utan automatisk förnyelse. Provperioden startar först när du skapar din profil – exempeldatan kan du titta på så länge du vill. När provperioden är slut kan du fortfarande se, exportera och radera allt du har loggat.

KÄLLOR
Lagom är en fristående app och är inte kopplad till Livsmedelsverket; näringsvärdena kommer från Livsmedelsverkets öppna livsmedelsdatabas (CC BY 4.0). Produktuppgifter från streckkoder kommer från Open Food Facts (ODbL). Rekommendationerna bygger på Nordiska näringsrekommendationer 2023 och Livsmedelsverkets kostråd.

Lagom ger allmän information och uppskattningar – inte medicinsk rådgivning. Har du en sjukdom, är gravid eller har frågor om din hälsa: prata med vården.
```

(2 547 tecken.) Rubriken är medvetet inte "Lagom är bäst" – ordet "bäst" kan uppfattas som ett
rankingord vid granskningen.

> **Veckoplanering med inköpslista** byggs just nu. Lägg till en rad under *Recept och insikter*
> först när funktionen finns i det bygge du skickar in – beskriv aldrig något som inte finns i
> appen (2.3.1).

### Nyckelord (högst 100 tecken, kommaseparerade utan mellanslag)

```
kalorier,kaloriräknare,kcal,kostdagbok,matdagbok,protein,fibrer,vikt,hälsa,recept,streckkod,vatten
```

(98 tecken.) Ord i namnet och undertiteln (Lagom, mat, näring, kostråd) räknas redan och ska inte
upprepas. Använd aldrig namn på andra appar, företag eller myndigheter som nyckelord.

### Nyheter i den här versionen (version 1.0)

```
Välkommen till Lagom! Den första versionen innehåller matdagbok med Livsmedelsverkets näringsvärden och svenska mått, streckkodsläsare, recept, insikter, vikt och mått, vatten och träning. Hittar du något som inte fungerar? Skriv till oss via Om Lagom → Felsökning.
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
2. Beskrivning: `Allt i Lagom för alltid – felrättningar ingår.` respektive
   `Allt i Lagom i ett år. Förnyas inte automatiskt.`
3. Pris: välj Sverige som bas och den prisnivå som ligger närmast 349 kr/699 kr (priserna i App
   Store anges inklusive moms). Tillgänglighet: bara Sverige.
4. Granskningsbild: en skärmdump av sidan Lagom Premium (640 × 920 px eller större) och en kort
   anteckning, t.ex. *"Shown on Mer → Lagom Premium."*
5. Första gången skickas produkterna in **tillsammans med appversionen**.

Så beter sig appen (bra att veta vid granskningen):

- Priserna i appen hämtas från App Store – inga kronbelopp är inskrivna i appbygget.
- Årslicensen döljs när en livstidslicens redan är köpt.
- **Återställ köp** finns på sidan Lagom Premium och under Inställningar → Licens.
- Årslicensen gäller 365 dagar från köpet och förnyas inte. Apple kräver att sådana köp kan
  återställas på användarens alla iPhone med samma Apple-ID – det sköts av Återställ köp.
  **Att tänka på när köp-i-appen-tillägget väljs:** tillägget måste använda StoreKit 2
  (`Transaction.currentEntitlements`). Den äldre återställningen i StoreKit 1
  (`restoreCompletedTransactions`) hämtar inte köp av typen Non-Renewing Subscription, och då
  skulle årslicensen inte gå att återställa.

### Provperioden (14 dagar) i App Store

Apple beskriver i riktlinje 3.1.1 hur en app utan automatiskt förnyad prenumeration får erbjuda
en gratis provperiod: som ett **engångsköp (Non-Consumable) för 0 kr** med namnet
"14 dagars provperiod" (på engelska *14-day Trial*). Lagom är förberett för det – produkt-id
`prov14` i `src/lib/storePurchases.ts`, och appen räknar provperioden från det tidigaste av den
lokala starten och köpet.

| Referensnamn | Produkt-id | Typ | Pris |
| --- | --- | --- | --- |
| 14 dagars provperiod | `prov14` | Non-Consumable | 0 kr (gratis) |

- **Rekommendation:** skapa produkten och låt appen "köpa" den när provperioden startar (när den
  egna profilen skapas) – så följer du Apples beskrivning, och provperioden börjar inte om när
  appen installeras på nytt. Hur det kopplas in avgörs när köp-i-appen-tillägget installeras.
- Före provperioden måste appen tydligt säga hur lång den är, vad som inte går efteråt (logga
  nytt) och vad det kostar att fortsätta (priserna från App Store). Kontrollera det i
  välkomstflödet innan du skickar in.
- Är du osäker: skicka in med produkten och skriv i granskningsanteckningarna hur provperioden
  fungerar (se avsnitt 10). Det är enklare än att få ett avslag.

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

- Hälsa och träning, kost och vikt – dagboken sparas bara på telefonen och lämnar den aldrig.
- Köp – köpet hanteras av Apple; appen skickar inga köpuppgifter till någon server.
- Identifierare, plats, kontakter, foton – streckkodsläsaren tolkar kamerabilden i telefonen och
  sparar eller skickar inga bilder.
- Diagnostik – felloggen sparas bara i telefonen och skickas bara om användaren själv mejlar
  felrapporten till supporten. Det är frivilligt och sker sällan, vilket enligt Apples regler
  inte behöver redovisas. (Vill du vara extra försiktig kan du ange *Other Diagnostic Data –
  App Functionality – Not linked – No tracking*.)
- Receptimport från en webbadress (om funktionen finns i bygget) – adressen skickas till Lagoms
  server, som hämtar receptet direkt och inte sparar något. Apple räknar inte sådant som
  insamling, eftersom uppgiften bara används just då för att svara på förfrågan.

**Spårning (App Tracking Transparency):** Nej. Appen visar ingen spårningsfråga.

**Privacy manifest (`PrivacyInfo.xcprivacy`):** läggs i Xcode-projektet när Capacitor installeras.
Deklarera samma datatyp (Search History, inte kopplad, ingen spårning) och de "required reason
APIs" som Capacitor och tilläggen använder (t.ex. UserDefaults – skäl `CA92.1`).

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

Målgruppen är vuxna (18+). Beräknas en lägre åldersgräns och App Store Connect erbjuder att välja
en högre (*Age Rating Override* eller liknande), välj **18+**. Finns inget sådant val gäller den
beräknade gränsen – det är okej; texterna i appen riktar sig ändå till vuxna, och viktnedgång
föreslås aldrig under 18 år.

## 9. Övriga frågor i App Store Connect

| Fråga | Svar |
| --- | --- |
| **Regulated medical device** (EU MDR-status) | **Nej.** Lagom är en kostdagbok med allmän information, inte en medicinteknisk produkt. Se docs/AVSETT-ANDAMAL.md. |
| **Export Compliance / kryptering** | Appen använder bara standardkryptering (HTTPS) och signaturkontroll. Sätt `ITSAppUsesNonExemptEncryption` = **NO** i `Info.plist`, så slipper du frågan vid varje uppladdning. |
| **Content Rights** – innehåller appen innehåll från tredje part? | **Ja**, och du har rätt att använda det: Livsmedelsverkets livsmedelsdatabas (CC BY 4.0, källan anges i appen), Open Food Facts (data ODbL, bilder CC BY-SA, källan anges), typsnitten Fraunces och Inter (SIL Open Font License), Workbox (MIT). Licenstexterna finns i `public/licenses/` och i Om Lagom. |
| **Betalningsval i EU** (alternativa villkor, länkar till extern betalning) | **Nej.** Behåll Apples standardvillkor och bara köp i appen. Ansök inte om *StoreKit External Purchase Link Entitlement* eller *Alternative Terms Addendum for Apps in the EU*. |
| **Sign in with Apple** | Behövs inte – appen har inga konton. |
| **Kamerabehörighet** (`NSCameraUsageDescription` i `Info.plist`) | `Lagom använder kameran för att läsa streckkoder på förpackningar. Inga bilder sparas eller skickas.` |
| **Digital Services Act – trader** | Ja (du säljer appen). Se [avsnitt 2](#2-konto-och-avtal). |

## 10. App Review Notes (granskningsanteckningar)

*App Store Connect → versionen → App Review Information*. Kryssa **inte** i "Sign-in required".
Kontaktuppgifter: ditt namn, telefon och e-post. Klistra in (på engelska):

```
No account needed. Tap 'Utforska med exempeldata' on the welcome screen to load two weeks of sample data. All data stays on the device. Purchases: Mer → Lagom Premium (In-App Purchase, Restore button). The Annual licence is hidden when a Lifetime licence is owned. The 14-day trial starts when a profile is created; after it ends only new logging requires a purchase – viewing, export and deletion always work.

The sample data is read-only. To try logging food, tap 'Börja med min egen profil' (Idag) and answer a few questions – this creates a profile and starts the 14-day trial.

In-app purchases: 'livstid' (Lifetime licence, non-consumable) and 'ar' (Annual licence, non-renewing subscription, 365 days, does not auto-renew). Prices are loaded from the App Store. Restore Purchases is on Mer → Lagom Premium and in Inställningar → Licens.

The app is in Swedish and only available in Sweden. Nutrition values come from the Swedish Food Agency's open database (CC BY 4.0); the app is independent and not affiliated with the agency. The app gives general information and estimates, not medical advice. The camera is only used to scan barcodes; no images are stored or sent.
```

Använder appen provperioden i App Store (`prov14`, se [avsnitt 6](#provperioden-14-dagar-i-app-store)),
lägg till den här meningen i stycket om köp i appen:

```
'prov14' (14-day Trial, non-consumable, free) is claimed automatically when a profile is created; the trial length, what requires a purchase afterwards and the prices are shown before it starts.
```

## 11. Bygge, TestFlight och inskickning

Du har ingen Mac – bygget och uppladdningen görs i molnet. Jämförelse och steg finns i
[IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md). I korthet:

1. **Webbdelen för appen** (på din dator eller i molnbygget):

   ```sh
   npm ci
   VITE_DISTRIBUTION=appstore VITE_API_BASE=https://<domän> npx vite build   # → dist-native/
   npx cap sync ios        # när Capacitor är installerat
   ```

   Byggkontrollen (`scripts/commerce-guard.ts`) stoppar butiksbygget om något av det här saknas –
   lägg in dem som miljövariabler (hemliga värden hör aldrig hemma i `VITE_`-variabler):

   | Variabel | Vad |
   | --- | --- |
   | `VITE_DISTRIBUTION` | `appstore` |
   | `VITE_API_BASE` | Webbplatsens adress med `https://` (serverfunktionerna) |
   | `VITE_SELLER_NAME`, `VITE_SELLER_ORGNR`, `VITE_SELLER_ADDRESS`, `VITE_SELLER_PHONE` | Dina uppgifter som säljare (enskild firma: ditt namn och personnummer) – visas i köpvillkoren. Personnumret blir då offentligt; läs rutan om det i docs/BETALNING.md |
   | `VITE_SUPPORT_EMAIL` | Supportadressen (inte en exempeladress) |
   | `VITE_LICENSE_PUBLIC_KEY` | Rekommenderas (varning utan): behövs för spärrlistan över återbetalda licenser |
2. **Xcode-projektet** (en gång, i molnbygget eller på en lånad Mac): Bundle ID, ditt team,
   bara iPhone, ikon från `store-assets/app-store-icon-1024.png`, `ITSAppUsesNonExemptEncryption`
   = NO, `NSCameraUsageDescription` och privacy manifest.
3. **Versionsnummer:** marknadsversionen (t.ex. 1.0.0) följer `version` i `package.json`;
   byggnumret måste öka för varje uppladdning.
4. **Arkivera och ladda upp** – molnbygget signerar med en App Store Connect API-nyckel och
   laddar upp till TestFlight.
5. **TestFlight:** installera TestFlight-appen på din iPhone, testa köp med ett
   sandbox-konto (*App Store Connect → Användare och åtkomst → Sandbox*), Återställ köp,
   streckkodsläsaren och exportera/radera data.
6. **Skicka in:** välj bygget under versionen, fyll i allt i den här filen och tryck på
   *Lägg till för granskning*. Svaret kommer oftast inom ett par dygn.

## 12. Checklista före inskickning

- [ ] Paid Apps Agreement, bank och W-8BEN är klara; Small Business Program sökt; DSA-uppgifter ifyllda.
- [ ] Säljaruppgifterna (`VITE_SELLER_*`) och `VITE_SUPPORT_EMAIL` är ifyllda – inga `[Företagsnamn]` eller `[E-post]` kvar i integritetspolicyn, villkoren eller supportsidan.
- [ ] `https://<domän>/support/`, `/integritet/` och `/villkor/` fungerar.
- [ ] Namn, undertitel, beskrivning, nyckelord, kategori och URL:er inlagda.
- [ ] Ikon och 3–10 skärmdumpar (1 320 × 2 868 px) från den version som skickas in.
- [ ] Köp i appen `livstid` och `ar` skapade, prissatta, bara Sverige, med granskningsbild – och `prov14` (0 kr) om provperioden görs i App Store (avsnitt 6).
- [ ] Välkomstflödet säger före provperioden hur lång den är, vad som kräver köp efteråt och vad licenserna kostar.
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
| 4.2 Minsta funktion | Appen upplevs som en webbsida i ett skal. | Nämn i anteckningarna att allt fungerar offline, med lokal lagring och streckkodsläsare. |
| 5.1.1 Integritet | Integritetspolicyn saknas eller stämmer inte med App Privacy. | Samma uppgifter i båda (se avsnitt 7). |
| 1.4.1 Hälsa | Påståenden om medicinsk effekt. | Texten säger "allmän information och uppskattningar – inte medicinsk rådgivning". |

Blir appen avvisad: läs meddelandet i *Resolution Center*, svara lugnt och sakligt (gärna på
engelska) och rätta det som efterfrågas. Det går att överklaga via *App Review Board* om du
tycker att beslutet är fel.
