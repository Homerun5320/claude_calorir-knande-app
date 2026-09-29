# Dagbokens lagring – mätning och beslut

Underlag för checklistepunkten **dagbok-en-nyckel**: "Hela dagboken skrivs om som en JSON-sträng
vid varje ändring (ca 5–6 MB efter tre år). Mät först och bestäm format innan native lagring
byggs." Mätt 2026-09-29 och igen samma dag med dagbokens egen lagring (§5). **Version A är
byggd:** dagboken läser både en nyckel och en nyckel per månad men skriver fortfarande det gamla
formatet; månadsskrivaren är klar, testad och mätt men avstängd (§1, §7).

## Innehåll

1. [Sammanfattning och beslut](#1-sammanfattning-och-beslut)
2. [Så sparas dagboken i dag](#2-så-sparas-dagboken-i-dag)
3. [Hur ofta dagboken skrivs](#3-hur-ofta-dagboken-skrivs)
4. [Så mättes det](#4-så-mättes-det)
5. [Resultat](#5-resultat)
6. [Slutsats: behövs uppdelning?](#6-slutsats-behövs-uppdelning)
7. [En nyckel per månad i IndexedDB](#7-en-nyckel-per-månad-i-indexeddb)
8. [Alternativ som inte föreslås nu](#8-alternativ-som-inte-föreslås-nu)
9. [Små förbättringar som kan göras direkt](#9-små-förbättringar-som-kan-göras-direkt)
10. [Köra mätningen igen](#10-köra-mätningen-igen)

## 1. Sammanfattning och beslut

- **Storlek:** ungefär 7 kB per dag med 5–8 poster om dagen: **2,7 MB efter ett år, 4,9 MB efter
  två och 7,4 MB efter tre** (UTF-8). Checklistans 5–6 MB stämmer för den som loggar ungefär fem
  poster om dagen. Storleken växer linjärt.
- **83–85 % av dagboken är ögonblicksbilder av livsmedel.** Varje post bär en hel kopia av
  livsmedlet (alla näringsämnen, portioner, sökord, anteckning …), men tre års dagbok innehåller
  bara drygt 200 olika ögonblicksbilder bland 6 700 poster. Utan dubbletterna skulle tre år vara
  1,6 MB.
- **Varje ändring skriver om hela dagboken på huvudtråden** (så länge månadsskrivaren är av). Ett
  tryck på vattenknappen, en sparning av stegen eller en loggning blockerar appen i ungefär **0,25 s efter ett år och
  0,45 s efter två–tre år på en mellanklasstelefon** (CPU-strypning 4×), och **0,4 respektive
  0,65–0,7 s på en enklare** (6×). Över 0,2 s räknas som tröghet (INP), över 0,5 s som dåligt.
- **Starten klarar sig:** att läsa in tre års dagbok tar 0,26 s (4×) och 0,38 s (6×) – långt under
  lagringens tidsgräns på 8 s.
- **Minnet:** tre års dagbok tar 24,5 MB JS-minne. Kopian av den sparade strängen som lagringen
  höll kvar efter varje skrivning (14,8 MB efter tre år) släpps sedan 2026-09-29 när skrivningen
  har lyckats – mätt 0,08 MB (§9, punkt 5).
- **Månadsskrivaren löser skrivningarna – mätt med den riktiga koden** (§5): en loggning blockerar
  **15–19 ms vid 4× och 21–29 ms vid 6×** (klar på 18–23 respektive 26–34 ms) oavsett hur gammal
  dagboken är, mot 0,27–0,47 s och 0,41–0,74 s med en nyckel – 18–32 gånger snabbare. Vattenknappen
  likadant. Varje skrivning sparar ≈ 200 000 tecken (månaden och indexet) i stället för hela
  dagboken.
- **Bytet till månader görs en gång** (första skrivningen med skrivaren på): efter tre år blockerar
  det i 0,51 s (4×) och 0,79 s (6×) och är klart på 0,81 respektive 1,3 s; efter ett år 0,19 och
  0,30 s. **Starten** med månaderna tar upp till ungefär 20 % längre än med en nyckel (tre år: 0,29
  mot 0,25 s vid 4×, 0,48 mot 0,40 s vid 6×). Efter bytet ligger månaderna och kopian
  `lagom-diary-v1` bredvid varandra (7,8 i stället för 3,9 MB på disk efter tre år) tills kopian
  tas bort.
- **Version A kostar inget:** med skrivaren av tar start, loggning och vattenknapp lika lång tid
  som före dagbokens egen lagring – skillnaderna går åt båda hållen och ligger inom mätbruset (§5).

**Beslut (förslag till ägaren):**

1. **Ingen formatändring före lanseringen.** Ingen användare har mer än några veckors data, och
   varje skrivning tar då några millisekunder.
2. **Dela upp dagboken i en nyckel per månad i IndexedDB** (avsnitt 7) – samma kod på webben och i
   apparna. Den bör vara ute **inom ungefär ett halvår efter lanseringen**, innan de första
   användarna har ett års data. Två steg: **version A – läsaren – är byggd** och följer med med
   skrivaren avstängd (`DIARY_MONTHS_WRITE_BUILD = false` i `src/stores/diaryMonthStorage.ts`). Den
   läser både en nyckel och månaderna men skriver en nyckel, så att en version med skrivaren kan
   rullas tillbaka utan att någon ser en tom dagbok. **Att slå på skrivaren (version B) kräver:**
   - **en mätning på en riktig iPhone** – WebKit är inte mätt (§4). Mät en loggning och bytet med
     en stor dagbok (t.ex. mätningens `backup-3y.json` via "Importera säkerhetskopia") i ett
     testbygge med skrivaren på, i Safari → Utveckla → Webbgranskaren → Tidslinjer;
   - **att `DIARY_MONTHS_WRITE_BUILD` sätts till `true`** – inget annat i lagringen (`PERSIST_VERSIONS`
     för dagboken stannar på 1);
   - **gränssnittet för "går inte att tolka"** (§7, Skydden): en egen text i stället för
     "Webbläsaren låter inte Lagom spara" och påminnelsen om säkerhetskopia som inte tystnar
     (`hasUnreadableData()`/`hasProtectedData()`) – en trasig månad blir möjlig först med B;
   - **inget i integritetspolicyn:** lagringstabellens rad för dagboken anger bara "IndexedDB",
     utan nyckelnamn (kontrollerat i `src/features/legal/legalContent.ts`, i alla tre tabellerna –
     webben, Google Play och App Store), och "Radera all data" tar bort månaderna och kopian;
   - och, enligt migreringsplanen (§7), att A har hunnit ut: några veckor på webben, i apparna
     tidigast butiksversionen efter A.
3. **Ingen egen native lagring (SQLite) för dagboken nu.** Den behövs inte för prestandan,
   kräver ett nytt tillägg som ägaren inte har godkänt och ger två lagringar att hålla i takt.
   Speglingen (`lagom-spegling.json`) finns kvar som skydd mot att iOS rensar webbvyns lagring.
4. **De små förbättringarna i avsnitt 9** (färre skrivningar i rad: ångra, töm måltid,
   Hälsa-synk, inga skrivningar utan ändring, stegfältet efter en paus, och kopian i minnet) är
   alla gjorda 2026-09-29.

## 2. Så sparas dagboken i dag

- `useDiaryStore` (`src/stores/diaryStore.ts`) använder zustands `persist` med dagbokens egen
  lagring `diaryStorage` (`src/stores/diaryMonthStorage.ts`, avsnitt 7) och `partialize` (bara
  `entries`, `water`, `exercise`, `days`, i den ordningen). Före 2026-09-29 var det
  `idbStorage = createJSONStorage(() => idbStateStorage)` (`src/stores/storage.ts`), som de andra
  butikerna fortfarande använder.
- Månadsskrivaren är avstängd (`DIARY_MONTHS_WRITE_BUILD = false`), så allt ligger fortfarande i
  **en nyckel**, `lagom-diary`, i idb-keyvals databas `keyval-store` – byte för byte samma sträng som
  förut: `{"state":{"entries":{…},"water":{…},"exercise":{…},"days":{…}},"version":1}`.
- En matpost (`FoodEntry`) har en **ögonblicksbild av hela livsmedlet** (`food: Food`) så att
  dagboken inte ändras när databasen uppdateras. Snapshotet görs i `makeFoodEntry`
  (`src/lib/diary.ts`) och innehåller allt: upp till 35 näringsämnen, portioner, sökord (`synonyms`),
  anteckning, märkningar, Open Food Facts-uppgifter med ingredienstext och bildadress. (Sparade
  måltider tar redan bort ingredienstexten, se `templateFood` i `features/add/useAddFood.ts`.)
- **Skrivning:** varje `set()` i butiken → `persist` → `diaryStorage.setItem` → `JSON.stringify`
  av hela dagboken (synkront, på huvudtråden) → en skrivtransaktion som sparar strängen och tar bort
  eventuella månadsnycklar. IndexedDB serialiserar värdet på huvudtråden och skriver till disk i
  webbläsarens egen process. `persist` skriver om hela dagboken vid varje `set()` – vatten och
  dagens uppgifter hoppar över `set()` när värdet redan är detsamma (§9, punkt 4), och stegfältet
  och anteckningen sparar efter en paus (`useDeferredSave`, §9 punkt 3). Butikens objekt hålls i
  `memory` bara tills skrivningen har lyckats (§9, punkt 5).
- **Läsning vid start:** en läsetransaktion hämtar `lagom-diary` och alla månadsnycklar (i dag
  inga); är det version 1 läses versionen från slutet (`storedVersion`), `JSON.parse` och in i
  butiken.
- Efter varje lyckad skrivning meddelas andra flikar, som läser in och tolkar hela dagboken igen
  (dolda flikar högst var 30:e sekund, `stores/hydration.ts`).
- Strängen lagras med **två byte per tecken** i minnet (V8, och sannolikt WebKit): det räcker med
  ett enda tecken över U+00FF, och tre års dagbok har över tusen tankstreck ("–") i livsmedlens
  anteckningar.

## 3. Hur ofta dagboken skrivs

Varje rad nedan är en **hel omskrivning** av dagboken (7,4 MB efter tre år) så länge
månadsskrivaren är av – med den påslagen skrivs bara de ändrade månaderna (≈ 200 kB, §5):

| Händelse | Skrivningar av dagboken | Annat som skrivs |
|---|---|---|
| Logga ett livsmedel | 1 | livsmedelsbutiken 1–2 gånger (statistik, cache för skannade produkter) |
| Logga en måltid med *n* livsmedel | 1 | livsmedelsbutiken *n*–2*n* gånger |
| **Ångra** en loggning eller kopiering med *n* poster | ***n*** (`removeEntry` i en slinga: `useAddFood`, `AddFoodPage`, `DayCards`, `MealsOverview`, `MealSheets`, `DiaryPage`) – **nu 1** (`removeEntries`) | |
| **Töm en måltid**, och ångra det | ***n*** + ***n*** (`removeEntry`/`restoreEntry` i en slinga, `DiaryPage`; likadant i `SupplementsCard`) – **nu 1 + 1** (`removeEntries`/`restoreEntries`) | |
| Flytta en post | 2 (`moveEntry` = ta bort + lägga till) – **nu 1** | |
| Ändra/ta bort en post, kopiera måltid/dag | 1 | |
| Tryck på vattenknappen | 1 per tryck (0 när mängden inte ändras, t.ex. − vid 0 ml) | |
| **Steg** i stegfältet | **1 per tangenttryck** och per tryck på +/− – **nu 1 per paus på 600 ms**, och direkt när fältet lämnas, dagen byts eller appen göms; tryck på −/+ i rad blir 1 (`StepsCard` → `useDeferredSave`) | |
| Humör, energi, hunger, "dagen klar" | 1 per tryck (0 när värdet redan är satt) | |
| Dagens anteckning | 1 per paus på 600 ms, och direkt när fältet lämnas, dagen byts eller appen göms (`DayNotesCard` → `useDeferredSave`) | |
| Träning: lägga till/ändra/ta bort | 1 | |
| **Hälsa-synk** i apparna | **1 per dag med nya steg** (upp till 7 i rad, `importSteps` i `native/health.ts`) – **nu 1** (`setDayMetas`) | |
| Annan flik sparar | 0 – men den här fliken läser och tolkar hela dagboken | |
| Speglingen i apparna | 0 – men hela säkerhetskopian (alla butiker) blir JSON högst 30 s efter en ändring – **nu högst en gång per fem minuter** medan appen är öppen (30 s efter den första ändringen, tidigast fem minuter efter förra skrivningen, `MIRROR_MIN_INTERVAL_MS`) – och alltid när appen går till bakgrunden (på Android även när en egen aktivitet öppnas: streckkodsläsaren, kameran, Health Connect) | fil `lagom-spegling.json` |

Svar på frågorna i checklistan: **ja, varje ändring skriver om hela dagboken, utan fördröjning**
(utom stegfältet och anteckningen, som väntar på en paus), och
**en enda loggning skriver om hela dagboken** (plus livsmedelsbutiken, 163 kB efter tre år).

## 4. Så mättes det

**Data** (`src/stores/diaryStorage.bench.test.ts`, deterministisk slump): en användare som loggat
varje dag i 1, 2 och 3 år med 5–8 poster om dagen (i snitt 6,5), byggd med appens riktiga kod:

- 80 % Lagoms kurerade livsmedel (berikade med Livsmedelsverkets värden som i katalogen) ur ett
  personligt förråd på 150 livsmedel där ett trettiotal dominerar, 10 % skannade produkter från
  Open Food Facts (via `mapOffProduct`, med ingredienstext 120–600 tecken), 5 % egna recept (via
  `recipeToFood`), 3 % egna livsmedel, 2 % Livsmedelsverket och 5 % snabbregistreringar.
- Portioner, gram och dl (`gramsFor`), klockslag på var fjärde post, anteckning på 3 %.
- Vatten 85 % av dagarna, träning 35 %, steg 60 %, "dagen klar" 50 %, mående 20 %, anteckning 8 %.
- Kalibrering: en ögonblicksbild är i snitt 960–1 080 tecken i datan, 974 i hela databasen och
  1 142 för exempeldatans vardagsmat – datan är alltså inte överdriven.
- Posterna läggs i `useDiaryStore` med dess riktiga lagring. Testet kontrollerar att strängen i
  IndexedDB är exakt den som mäts.

**Tider** (`scripts/measure-diary-storage.mjs`): butikens riktiga kod (`diaryStore.ts`,
`storage.ts`, zustand, idb-keyval) byggs med Vite och körs i Chromium 141 (Playwright) med en
beständig profil, så att IndexedDB ligger på disk. Medianen av 11 körningar, med
CDP-strypningen `Emulation.setCPUThrottlingRate` 1×, 4× och 6× på en Intel Xeon 2,1 GHz
(molnmaskin). 4× motsvarar DevTools "mellanklassmobil" (en några år gammal Android i mellanklassen),
6× "enklare mobil". Nya iPhones är snabbare och ligger troligen närmare 1–2×.

- **Blockerar** = tiden tills huvudtråden är fri igen (stringify + IndexedDB:s serialisering),
  det användaren märker som tröghet. **Klart** = när IndexedDB bekräftat skrivningen.
- **Osäkerheter:** strypningen gäller bara sidans huvudtråd – diskskrivningen i webbläsarens
  process stryps inte, så "klart" är en undre gräns. Skräpsamlingen gör tiderna brusiga (±20 %;
  två år mättes genomgående något långsammare per skrivning än tre år). Faktorerna 4× och 6× är
  fasta och räknas på molnmaskinens Xeon; DevTools kalibrerar i stället strypningen per dator, så
  tiderna är troligen något pessimistiska för en verklig mellanklassmobil. Å andra sidan räknar
  "blockerar" inte med Reacts rendering och butikens prenumeranter, så appens egen tid per tryck
  är högre än lagringens. Inget av detta ändrar slutsatsen. **WebKit (iPhone-appen och
  Safari) är inte mätt** – Playwrights WebKit finns inte i byggmiljön. Mät på en riktig iPhone
  (Safari → Utveckla → Webbgranskaren → Tidslinjer) innan skrivaren slås på.

**Andra mätningen** (samma dag, med dagbokens egen lagring och 9 körningar per värde, samma
maskin och Chromium 141):

- **Version 1** som appen skriver i dag (skrivaren av), med samma mätningar som ovan.
- **Månadsskrivaren** påslagen bara på mätsidan (`setDiaryMonthWriteForTests(true)`): bytet från
  version 1 (varje körning börjar med den gamla strängen i IndexedDB och startar i en egen uppgift),
  start med månaderna, en loggning och vattenknappen. Mätningen kontrollerar att bytet skriver alla
  månader och en kopia som är exakt den gamla strängen, att loggningarna bara skriver månaden, att
  allt läses in igen och att dagboken sedan skrivs tillbaka som version 1 – samma sträng som före
  och inga månadsnycklar kvar (vägen tillbaka).
- **Före och efter:** med `--before=3bac682` byggs även butiken och lagringen från commit 3bac682
  (före dagbokens egen lagring) och mäts på en egen sida – direkt efter att sidan öppnats, precis
  som dagens kod, och varannan gång först. (I en första körning hade dagens kod gjort andra
  mätningar före starten; där skilde starttiderna upp till 24 %, vilket försvann när båda mättes i
  samma läge.)
- **Minne och disk** i en ny, tom profil per dagbok, så att diskstorleken inte räknar med gamla
  värden som LevelDB ännu inte har städat bort.

## 5. Resultat

### Storlek

| Dagbok | Poster | Dagboken (UTF-8) | gzip | Per dag | En månad | Livsmedelsbutiken | Spegling | Export (indrag) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 år | 2 375 | 2,7 MB | 0,4 MB | 7,7 kB | 214 kB | 141 kB | 2,9 MB | 4,7 MB |
| 2 år | 4 720 | 4,9 MB | 0,8 MB | 6,9 kB | 189 kB | 171 kB | 5,1 MB | 8,4 MB |
| 3 år | 7 084 | 7,4 MB | 1,1 MB | 6,9 kB | 195 kB | 163 kB | 7,6 MB | 12,4 MB |

"Spegling" är `JSON.stringify(createBackup())` (filen i apparna), "Export" samma med indrag 1
(`saveBackup`/"Exportera (JSON)"). gzip visar hur mycket som upprepas.

### Vad dagboken består av (3 år)

| Del | Andel |
|---|---:|
| Ögonblicksbilder av livsmedel | 83 % |
| – varav näringsämnen | 36 % |
| – portioner | 10 % |
| – sökord (`synonyms`) | 9 % |
| – anteckning (`note`) | 8 % |
| – Open Food Facts-uppgifter (`extra`) | 5 % |
| – övrigt (id, namn, kategori, märkningar …) | 15 % |
| Resten (mängd, enhet, datum, id, vatten, träning, dagar) | 17 % |

6 722 matposter har 220 olika ögonblicksbilder. Med varje ögonblicksbild sparad en gång och en
referens i posten blir tre år **1,6 MB (22 %)**.

### Tider i Chromium (median, ms)

Första mätningen (koden före dagbokens egen lagring, 11 körningar). Den andra mätningen gav samma
bild för version 1 (tabellerna nedan).

| Mätning | 1 år 1× | 4× | 6× | 2 år 1× | 4× | 6× | 3 år 1× | 4× | 6× |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `JSON.parse` av dagboken | 11 | 52 | 78 | 20 | 98 | 114 | 29 | 139 | 210 |
| `JSON.stringify` av dagboken | 18 | 98 | 153 | 33 | 183 | 220 | 42 | 246 | 372 |
| IndexedDB: skriva strängen | 19 | 70 | 111 | 32 | 124 | 300 | 50 | 178 | 272 |
| IndexedDB: läsa strängen | 9 | 46 | 78 | 19 | 90 | 137 | 24 | 116 | 179 |
| **Start** (läsa in genom butiken) | 20 | 93 | 149 | 38 | 182 | 348 | 53 | 256 | 379 |
| **Loggning: blockerar** | 50 | **239** | **384** | 110 | **461** | **720** | 86 | **442** | **657** |
| Loggning: längsta av 11 | 55 | 261 | 434 | 184 | 496 | 1 063 | 103 | 477 | 734 |
| Loggning: klart | 56 | 246 | 391 | 127 | 471 | 729 | 99 | 452 | 670 |
| Vattenknappen: blockerar | 51 | 245 | 389 | 89 | 448 | 718 | 85 | 435 | 658 |
| **En månad: stringify** | 0,7 | 3,6 | 5,6 | 1,0 | 4,4 | 7,7 | 1,0 | 3,2 | 5,4 |
| **En månad: klart** (stringify + IndexedDB) | 4,3 | 12 | 17 | 4,7 | 13 | 22 | 4,8 | 12 | 18 |
| Speglingen: `JSON.stringify(säkerhetskopian)` | 19 | 91 | 150 | 39 | 190 | 300 | 53 | 263 | 395 |
| + Android-bryggan (anropet blir JSON) | 13 | 64 | 101 | 26 | 130 | 199 | 36 | 188 | 288 |
| Export med indrag | 30 | 161 | 241 | 62 | 306 | 480 | 76 | 416 | 635 |
| `JSON.parse` av säkerhetskopian | 11 | 49 | 71 | 21 | 98 | 148 | 28 | 156 | 203 |

Tumregel: en skrivning blockerar ungefär **60–95 ms per MB dagbok på en mellanklasstelefon** och
90–145 ms per MB på en enklare.

**Speglingen i apparna** (`native/mirror.ts`) kostar på Android stringify + brygga: 0,45 s (4×) och
0,7 s (6×) efter tre år, högst var femte minut medan man loggar (före 2026-09-29 var 30:e sekund)
och när appen går till bakgrunden. På Android räknas också streckkodsläsaren, kameran för "Ta en
bild" och Health Connects behörighetsfråga som att gå till bakgrunden (egna aktiviteter som stoppar
appens) – den som loggar genom att skanna betalar alltså fortfarande en skrivning per skanning när
något har ändrats, som före 2026-09-29.
Därtill tolkar Capacitors Java-sida anropet (9 miljoner tecken JSON) och skriver filen (inte
mätt, sker utanför webbvyns huvudtråd). På iPhone skickas anropet utan JSON-steget; stringify av säkerhetskopian
återstår. `parseBackup` (med kontroll av varje post) tar 155 ms i Node efter tre år och körs bara
vid återställning.

### Månadsskrivaren (version 2) i Chromium (median av 9, ms)

Andra mätningen, med skrivaren påslagen på mätsidan. Raden "version 1" är samma loggning med
skrivaren av, i samma körning.

| Mätning | 1 år 1× | 4× | 6× | 2 år 1× | 4× | 6× | 3 år 1× | 4× | 6× |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Loggning: blockerar** | 3,9 | **15** | **21** | 3,5 | **15** | **25** | 3,6 | **19** | **29** |
| Loggning: längsta av 9 | 5,4 | 21 | 25 | 5,1 | 19 | 32 | 5,5 | 25 | 35 |
| Loggning: klart | 6,2 | 19 | 26 | 6,3 | 18 | 30 | 6,4 | 23 | 34 |
| Loggning: blockerar – version 1 | 87 | 266 | 413 | 101 | 474 | 743 | 97 | 432 | 581 |
| Vattenknappen: blockerar | 2,9 | 15 | 22 | 3,3 | 13 | 23 | 3,6 | 16 | 26 |
| **Start** med månaderna | 31 | 103 | 157 | 48 | 199 | 294 | 78 | 294 | 477 |
| Start med en nyckel (samma läge) | 27 | 106 | 166 | 37 | 179 | 288 | 59 | 248 | 401 |
| **Bytet från version 1: blockerar** | 49 | 188 | 295 | 88 | 344 | 547 | 131 | 507 | 791 |
| Bytet: klart | 86 | 331 | 510 | 152 | 567 | 896 | 222 | 808 | 1 297 |

- En loggning skriver 223 000, 198 000 respektive 205 000 tecken (den aktuella månaden och
  indexet) i stället för hela dagboken (2,9, 5,1 och 7,7 miljoner tecken).
- Bytet skriver 13, 25 respektive 37 månader (2,9, 5,1 och 7,7 miljoner tecken) plus kopian. Den
  längsta uppgiften på huvudtråden under bytet är lika lång som "blockerar" – uppdelningen,
  kontrollen och månaderna är en uppgift, kopian en kortare. Bytet görs en gång per användare.
- Starten med månaderna tar längre tid än med en nyckel: vid 4–6× 2–12 % efter två år och 7–19 %
  efter tre (två körningar); efter ett år är skillnaden inom bruset.
- Två tidigare körningar (också 9 per värde) gav samma bild: loggning 14–16 ms (4×) och 21–27 ms
  (6×), bytet efter tre år 0,53 s (4×) och 0,79–0,80 s (6×) blockerat.
- **Efter mätningen** fick skrivaren kontrollen i transaktionen (§7, Skrivning punkt 3): varje
  skrivning läser först indexet i sin transaktion och skriver månaderna när det är läst, och indexet
  har en märkning (`token`, ≈ 35 tecken). En kort kontrollkörning efteråt (5 per värde, 4×, bara
  1 och 3 år) låg i samma spann: loggning klar på 18 respektive 25 ms, vattenknappen 8–12 ms
  blockerad, bytet efter tre år klart på 0,83 s. Tabellen ovan är inte gjord om.

### Version 1 före och efter dagbokens egen lagring (median av 9, ms)

Samma körning, `--before=3bac682` (koden före) mot dagens kod med skrivaren av:

| Mätning | 1 år 1× | 4× | 6× | 2 år 1× | 4× | 6× | 3 år 1× | 4× | 6× |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Start – före | 21 | 161 | 152 | 38 | 177 | 273 | 56 | 282 | 345 |
| Start – nu | 26 | 104 | 154 | 41 | 172 | 265 | 60 | 268 | 371 |
| Loggning: blockerar – före | 86 | 267 | 384 | 95 | 469 | 751 | 93 | 453 | 696 |
| Loggning: blockerar – nu | 87 | 266 | 413 | 101 | 474 | 743 | 97 | 432 | 581 |
| Loggning: klart – före | 96 | 272 | 392 | 104 | 478 | 765 | 106 | 465 | 706 |
| Loggning: klart – nu | 95 | 274 | 425 | 109 | 486 | 777 | 114 | 446 | 601 |
| Vattenknappen – före | 49 | 271 | 416 | 92 | 427 | 707 | 101 | 452 | 685 |
| Vattenknappen – nu | 51 | 268 | 382 | 98 | 449 | 721 | 95 | 449 | 693 |

Skillnaderna går åt båda hållen: loggningen −16 till +7 %, vattenknappen −8 till +7 % och starten
−5 till +8 % vid 2–3 år (efter ett år +5 ms vid 1× och ett avvikande värde för "före" vid 4×). En
andra körning med samma metod gav −8 till +3 % för loggningen, −10 till +6 % för vattenknappen och
−4 till +3 % för starten vid 4–6×. Allt ligger inom mätbruset (±20 %, §4): **version A kostar
inget med skrivaren av.**

### Minne och disk (Chromium, 1×)

Andra mätningen, i en ny profil per dagbok:

| Dagbok | JS-minne för dagboken | Kopian i `memory` efter en skrivning: före → nu | IndexedDB på disk | Efter bytet till månader (+ kopian) |
|---|---:|---:|---:|---:|
| 1 år | 9,3 MB | 5,5 → 0,05 MB | 1,4 MB | 2,9 MB |
| 2 år | 16,5 MB | 9,8 → 0,07 MB | 2,6 MB | 5,3 MB |
| 3 år | 24,5 MB | 14,8 → 0,08 MB | 3,9 MB | 7,8 MB |

- JS-minnet är större än JSON-strängen eftersom varje post får en egen kopia av livsmedlet när
  dagboken tolkas (JSON har inga referenser). Bytet till månader lägger inte till något som blir
  kvar (+0,1 MB).
- Kopian i `memory` (strängen som skrevs) släpps nu när skrivningen har lyckats (§9, punkt 5).
- Chromium komprimerar värdena i IndexedDB (3,9 MB på disk för 7,4 MB JSON; den första mätningen
  angav 4,2 MB utan ny profil). Efter bytet ligger månaderna och kopian `lagom-diary-v1` bredvid
  varandra – ungefär dubbelt så mycket – tills kopian tas bort i version C. Hur WebKit lagrar en
  tvåbytessträng i sin SQLite-baserade IndexedDB är inte mätt – räkna med upp till 15 MB per
  skrivning på iPhone tills det är mätt.

### Node (referens)

`LAGOM_MEASURE_STORAGE=1 npx vitest run src/stores/diaryStorage.bench.test.ts` skriver samma
storlekar och tider i Node med fake-indexeddb (3 år: stringify 40–46 ms, parse 38–42 ms), och
sedan 2026-09-29 även månadsskrivaren (3 år: bytet 178 ms synkront och 402 ms klart, en loggning
4,9 ms synkront och 7 ms klart). De visar att datan och formatet stämmer, men tiderna för
telefoner är Chromium-tiderna ovan.

## 6. Slutsats: behövs uppdelning?

**Ja, men inte nu – planera in den till det första halvåret efter lanseringen.**

- I dag (före lanseringen) har ingen användare stor dagbok, och en skrivning tar några ms.
- Efter **ett år** blockerar varje tryck ~0,25 s på en mellanklasstelefon och ~0,4 s på en enklare.
  Det märks – särskilt där många skrivningar kommer i rad: stegfältet (en skrivning per siffra
  före 2026-09-29), "Ångra" och "Töm måltiden" (en per post före 2026-09-29), vattenknappen när man
  trycker flera gånger och Hälsa-synken.
- Efter **två–tre år** är det 0,45–0,7 s per tryck och uppåt en sekund i sämsta fall. Det bryter
  mot appens känsla ("lagom", lugn) och syns i INP.
- Starttiden, lagringsutrymmet och tidsgränsen (8 s) är inte problemet – skrivningarna är det.
- Uppdelningen behöver inte vänta på native lagring: den görs i lagringslagret och gäller webben
  och apparna på en gång. **Native lagring (SQLite) behövs inte** för att lösa det här.
- **Läget 2026-09-29:** läsaren (version A) är byggd, och månadsskrivaren är klar och mätt i
  Chromium – en loggning blockerar 15–29 ms i stället för 0,27–0,74 s vid 4–6× (§5). Den slås på
  när villkoren i §1 är uppfyllda; det som saknas är främst mätningen på en riktig iPhone.

## 7. En nyckel per månad i IndexedDB

**Läget 2026-09-29:** version A – läsaren – är byggd (`src/stores/diaryMonthStorage.ts`) och följer
med i appen med skrivaren avstängd (`DIARY_MONTHS_WRITE_BUILD = false`). Månadsskrivaren (version B)
finns i samma fil, är testad och mätt (§5), men slås på först när villkoren i §1 är uppfyllda.
Nedan står det som är byggt, och var det skiljer sig från förslaget.

### Format (version 2)

```
lagom-diary          {"state":{"format":"manader","stateVersion":1,"token":"…"},"version":2}
lagom-diary:2026-09  {"entries":{…},"water":{…},"exercise":{…},"days":{…}}   (bara datum i månaden)
lagom-diary:ovrigt   nycklar som inte börjar med "ÅÅÅÅ-MM-" (ska inte finnas, men inget tappas)
lagom-diary-v1       den gamla strängen, sparad vid bytet (tas bort i version C)
```

- **Månaderna hittas med ett nyckelintervall** (`lagom-diary:` till `lagom-diary:\uFFFF`,
  `getAllKeys`/`getAll`) – inte med en lista över månaderna i indexet som i förslaget. En gammal
  flik eller ett avbrutet byte kan då aldrig tappa bort en månad. `lagom-diary-v1` ligger utanför
  intervallet ('-' sorteras före ':').
- **Två versioner:** `version` 2 är lagringsformatets version (`DIARY_INDEX_VERSION`). En version av
  Lagom före A ser den som data från en nyare version: den läser inte in dagboken, skriver aldrig
  över den och sparar bara i minnet. `stateVersion` är butikens version (`PERSIST_VERSIONS`, i dag
  1) och går till zustands `migrate` som förut. `version` över 2 eller `stateVersion` över 1 räknas
  som data från en nyare version. **Indexet känns igen på sin form** (`state.format` =
  `"manader"`, `inspectMain`), inte på versionen – då krockar lagringsformatets version aldrig med
  butikens, och dagbokens version i `PERSIST_VERSIONS` kan höjas som för andra butiker.
- **`token`** är en slumpad märkning (tid, räknare, slump – ingen data) som är ny för varje
  skrivning. Skrivaren jämför den i sin transaktion (se Skrivning, punkt 3). Läsaren bryr sig inte
  om den – extra fält i indexet går bra, så version A läser index från en senare version som lägger
  till fält där.
- **Allt som den här versionen inte känner till räknas som data från en nyare version** (läses inte
  in, skrivs inte över, tas inte bort): en nyckel i månadsintervallet som inte är `ÅÅÅÅ-MM` eller
  `ovrigt`, fält i en månad utöver de fyra och fält i dagbokens tillstånd (version 1) utöver de fyra.
  Version A kan inte ändras efter utgivningen – annars skulle den tyst ta bort det vid nästa
  skrivning. **Något nytt i intervallet eller i dagbokens tillstånd kräver därför `version` 3 i
  indexet** (eller en högre butiksversion för version 1).
- Butikens form (`entries`, `water`, `exercise`, `days`) är densamma: säkerhetskopian, speglingen,
  molnet och CSV-exporten läser butikens tillstånd och märker ingenting.

### Läsning

En läsetransaktion hämtar `lagom-diary` och hela intervallet – en ögonblicksbild som ingen samtidig
skrivning kan dela på (`readDiarySnapshot`). Hela dagboken hålls i minnet som förut.

| Sparat | Vad läsaren gör |
|---|---|
| Version 1 (en sträng) | Tolkar den som förut. Kvarglömda månader används inte och tas bort vid nästa skrivning |
| Index med version 2 (med eller utan `token` och andra extra fält) | Sätter ihop månaderna till hela dagboken |
| Index med `version` > 2 eller `stateVersion` > 1; version 1 med `version` > 1 | Data från en nyare version: läses inte in, skrivs aldrig över, minnesläge |
| En okänd nyckel i intervallet, ett okänt fält i en månad eller i dagboken (version 1) | Data från en nyare version, som raden ovan |
| Månader utan index | Läser in dem ändå och loggar det en gång; indexet skrivs vid nästa skrivning |
| En trasig månad, ett trasigt index (även `version` < 2) eller ett värde av fel typ | **Går inte att tolka** (nytt läge i `storage.ts`, `hasUnreadableData()`): minnesläge, skrivs inte över och tas inte bort under sessionen. Loggas med ett fast meddelande – aldrig tolkningsfelet, som kan citera dagboken |

### Skrivning

**Skrivaren av (version A, i dag):** en skrivtransaktion med `put` av strängen i version 1 – byte
för byte samma som `createJSONStorage` gav (testat, och kontrollerat i Chromium) – och `delete` av
hela intervallet. En dagbok i månadsformatet blir alltså version 1 igen i en enda transaktion: det
är vägen tillbaka från version B. `lagom-diary-v1` tas bara bort när dagboken töms ("Radera all
data") och av `removeItem`.

**Skrivaren på (version B):**

1. **Bytet** – första skrivningen efter version 1, eller när läget på disken är okänt. Hela
   dagboken delas upp i månader och **kontrolleras i minnet före bytet**: varje månadssträng tolkas
   tillbaka, månaderna sätts ihop och jämförs med dagboken (postid:n per datum, vatten, träning,
   dagsuppgifter). Stämmer det inte loggas felet och resten av sessionen skrivs version 1. Annars
   en transaktion: bort med intervallet, alla månader, indexet och den gamla strängen till
   `lagom-diary-v1` (läst i samma transaktion). Förslagets "läs in allt igen och jämför efteråt"
   behövs inte – antingen sparas allt eller inget.
2. **Därefter** bara de ändrade månaderna och indexet. Zustand byter bara ut de listor som ändras,
   så en jämförelse per referens (`next.entries[datum] !== prev.entries[datum]`, likadant för
   `water`, `exercise` och `days`) ger månaderna. Tomma månader tas bort; en tom dagbok blir ett
   tomt index utan månader och utan kopia.
3. **Kontrollen i transaktionen.** Ändrade månader räknas mot den senast påbörjade skrivningen
   (inte den senast lyckade som i förslaget), och varje skrivning läser först `lagom-diary` i sin
   egen transaktion. Bara om det är exakt det index (med `token`) som fliken väntar sig – det den
   själv skrev senast eller läste in – skrivs bara de ändrade månaderna. Annars har någon annan
   skrivit emellan: en annan flik med version 1 (som tar bort månaderna) eller med månader, en
   äldre version, eller så misslyckades en tidigare skrivning. Då skrivs alla månader (och en
   sträng i version 1 till kopian) **i samma transaktion** – den senaste skrivningen vinner, hela
   dagboken, som med en nyckel. Utan kontrollen kunde en skrivning av en månad hamna efter en annan
   fliks version 1, och alla andra månader försvann; två flikar med skrivaren på kunde blanda
   månader (en flyttad post dubbelt eller borta). Det är testat med en transaktion från en annan
   anslutning som hålls öppen.
4. **Stämpeln är en ledtråd.** Har stämpeln i localStorage ändrats (`changedElsewhere`) skrivs alla
   månader direkt; kontrollen i transaktionen avgör ändå.
5. **Misslyckade skrivningar.** Efter en misslyckad skrivning är läget på disken okänt, och nästa
   skrivning skriver alla månader (en senare skrivning som redan har startat ser själv att indexet
   inte stämmer). Misslyckas en skrivning av alla månader – t.ex. bytet på en nästan full enhet,
   som behöver plats för månaderna och kopian – loggas det och **resten av sessionen skrivs version
   1**, som redan fungerade; nästa session försöker igen. Annars skulle varje ändring göra om hela
   bytet och misslyckas.
6. **Data från en nyare version i transaktionen** (en annan flik med en nyare version har sparat
   under tiden): skrivningen avbryts och dagboken skyddas som vid en läsning (`protectNewerData`,
   `hasNewerData()`). Bara "Radera all data" (`releaseNewerData`) får skriva över den.

Dagbokens transaktioner går genom en egen anslutning till samma databas (`createStore('keyval-store',
'keyval')`) och körs i den ordning de skapas. Kastar något mitt i en transaktion avbryts den.
Skrivaren av (version A) gör ingen kontroll: version 1 är hela dagboken, och den senaste skrivningen
vinner som förut.

### Skydden

Samma som för alla butiker, nu samlade i `guardedRead`/`guardedWrite`/`guardedRemove` i
`stores/storage.ts` och delade av den vanliga lagringen och dagbokens: inget skrivs över oläst data,
data från en nyare version eller data som inte går att tolka; långsamma läsningar, minnesläge,
stämpel och signal till andra flikar fungerar som förut. Nytt är läget "går inte att tolka"
(`isMemoryOnlyStorage()` och `hasUnreadableData()` blir true) och att kopian i `memory` släpps efter
en lyckad skrivning (§9). `hasProtectedData()` är true när sparad data inte har lästs in (nyare
version eller går inte att tolka) – en säkerhetskopia saknar den då, och påminnelsen om
säkerhetskopia ska inte tystna.

- **Går inte att tolka – kvar att göra i gränssnittet** (utanför lagringen): varningen i
  `AppShell.tsx` säger i dag "Webbläsaren låter inte Lagom spara" även för en trasig dagbok, och
  `markBackupNow()` i `AppShell.tsx`, `DataSection.tsx` och `RouteError.tsx` kontrollerar bara
  `hasNewerData()` – de ska använda `hasUnreadableData()` (egen text) och `hasProtectedData()`.
  Hela dagboken skyddas, inte bara den trasiga månaden; att läsa in resten och aldrig skriva den
  trasiga nyckeln, och att kunna återställa från en säkerhetskopia eller speglingen utan "Radera
  all data", är beslut för version B. Speglingen skrivs inte medan något är skyddat
  (`isMemoryOnlyStorage()`) – så att den sista hela kopian inte skrivs över med en tom dagbok.

- **"Radera all data"** (`clearDiary`) tar bort månaderna och kopian (skrivaren av: en tom dagbok i
  version 1; på: ett tomt index), och `removeItem` tar bort allt i en transaktion.
  `releaseNewerData` släpper nu även data som inte går att tolka, så att en trasig dagbok går att
  radera (rätten till radering). Det är ett avsteg från "skriv aldrig över" som **ägaren bör
  bekräfta**.
- **Nycklarna:** bara `lagom-diary` står i `STORE_KEYS`. Månaderna och `lagom-diary-v1` hör till
  dagboken, hittas med intervallet och tas bort med den. Säkerhetskopian, molnet, speglingen och
  `hydration.ts` (andra flikar läser in via `getItem`) behöver ingen ändring.

### Steg 2 (valfritt): ögonblicksbilderna en gång

Spara varje ögonblicksbild en gång (nyckel = livsmedlets id + innehållets kontrollsumma) och bara
en referens i posterna. Vid läsning länkas posterna till samma objekt. Tre år: 7,4 → 1,6 MB, och
starten och JS-minnet bör krympa ungefär lika mycket (inte mätt). Det är mer komplicerat
(kontrollsummor, städning av oanvända ögonblicksbilder) – gör det bara om starten eller minnet blir
ett problem. Det kräver `version` 3 i indexet (version A och B kan inte läsa referenser) och en
nyckel **utanför** månadsintervallet (t.ex. `lagom-diary-livsmedel`, inte `lagom-diary:livsmedel`).
Att bara ta bort sökord och anteckning ur ögonblicksbilden sparar ~17 % men ändrar vad en sparad
post innehåller.

### Steg 3 (senare): speglingen

Speglingen skriver hela säkerhetskopian (0,45–0,7 s på Android efter tre år). Samma idé kan gälla
där: en fil per månad plus ett index, eller hela filen gzip-komprimerad (`CompressionStream`,
1,1 MB i stället för 7,6 MB genom bryggan). Enklast först: skriv den glesare (t.ex. högst var
femte minut) men alltid när appen går till bakgrunden.

*Glesare: gjort 2026-09-29* (`src/native/mirror.ts`, `src/native/mirror.test.ts`). Medan appen är
öppen skrivs speglingen högst en gång per `MIRROR_MIN_INTERVAL_MS` (fem minuter): den första
ändringen efter en skrivning speglas vid det senare av "förra skrivningen + fem minuter" och
"ändringen + 30 s" (`MIRROR_DEBOUNCE_MS`), senare ändringar flyttar inte tiden, och en ändring
väntar alltså aldrig mer än fem minuter. Intervallet räknas med `performance.now()`, som inte
hoppar när telefonens klocka ställs om.

- Som förut: en gång 30 s efter starten när det finns data, och alltid direkt när appen går till
  bakgrunden (`appStateChange` med `isActive: false` → `flushMirror`) – även mitt i intervallet.
  Nästa ändring räknar sina fem minuter från den skrivningen.
- En ändring som kommer efter `flushMirror` men innan appen är aktiv igen skrivs direkt. Stegfältet
  och anteckningen (`useDeferredSave`) sparar på `visibilitychange` eller efter 600 ms, och
  `appStateChange(false)` kommer före (`willResignActive` på iPhone, `onStop` på Android) – annars
  skulle värdet vänta upp till fem minuter medan appen ligger i bakgrunden och kan stängas.
- Android: streckkodsläsaren, kameran för "Ta en bild" och Health Connects behörighetsfråga är
  egna aktiviteter som stoppar appens (`BridgeActivity.onStop` → `isActive: false`). De räknas som
  att gå till bakgrunden – JavaScript kan inte skilja dem från hemknappen – så den som loggar genom
  att skanna får en skrivning per skanning när något har ändrats (samma som före 2026-09-29).
  Gränsen på fem minuter gäller alltså medan man loggar inne i appen. På iPhone visas skannern i
  appen och påverkar inte speglingen.
- Inget går förlorat: ändringen är osparad tills en skrivning lyckas. Ett misslyckat försök
  räknas som en skrivning för intervallet (strängen var redan byggd) och görs om vid nästa
  ändring eller när appen går till bakgrunden – aldrig i en slinga.
- Som förut aldrig när lagringen är skyddad (`canMirror`: inte inläst, bara i minnet, nyare data),
  för exempeldata eller medan frågan om återställning är öppen.
- Efter "Radera all data" speglas det som läggs in som efter en ny start (30 s).

Efter tre år på Android blir det alltså 0,45–0,7 s av huvudtråden högst var femte minut i stället
för var 30:e sekund medan man loggar i appen (vid skanning se ovan). Kvarvarande risk: stängs appen
av systemet utan att först gå till bakgrunden (sällsynt), eller innan skrivningen efter en sen
ändring hunnit bli klar, kan speglingen sakna de senaste minuterna – dagboken i IndexedDB har dem
ändå; speglingen skyddar bara mot att iOS rensar webbvyns lagring. Vill man slippa skrivningen per
skanning på Android kan modulerna som öppnar en egen aktivitet (barcode, photos, health) markera
det, så att `flushMirror` då bara skriver när förra skrivningen är äldre än fem minuter – inte gjort,
eftersom en app som stängs medan skannern är öppen då kan sakna upp till fem minuter i speglingen. En fil per månad eller komprimering
är kvar som nästa steg om skrivningen i bakgrunden blir för långsam.

### Migreringsplan

1. **Version A – läsaren:** *byggd 2026-09-29.* Läser version 1 och 2, skriver version 1 och tar
   bort månadsnycklarna i samma transaktion. `PERSIST_VERSIONS` för `lagom-diary` är kvar på 1.
2. **Version B – skrivaren:** `DIARY_MONTHS_WRITE_BUILD = true` (villkoren i §1), några veckor efter
   A på webben och tidigast i butiksversionen efter A i apparna. Rullas B tillbaka läser A
   månaderna och skriver version 1 igen; en version före A sparar bara i minnet tills den uppdateras.
3. **Version C:** ta bort `lagom-diary-v1` (efter minst en månad med B).

### Tester

`src/stores/diaryMonthStorage.test.ts` (40 tester, datan från `diaryFixture.ts`): version 1 byte för
byte som `createJSONStorage`; version 2 läses och skrivs tillbaka som version 1 i en transaktion;
bytet (månader, index och kopia i en transaktion); reserven när kontrollen inte stämmer; månader
utan index; en annan flik; tom dagbok; avbrutna och överlappande skrivningar (även i fel ordning)
och reserven till version 1 när alla månader inte går att skriva; slumpade följder av alla
butikens åtgärder (läs in igen → samma dagbok, bara ändrade månader skrivna); skydden (nyare
version, trasig månad eller huvudnyckel, okända nycklar och fält, långsam läsning, felloggen utan
dagbokens innehåll); andra flikar – även samtidiga skrivningar med en transaktion från en annan
anslutning som hålls öppen (version 1, månader och en nyare version) – och "Radera all data".
Testerna fångar avsiktliga fel i skrivaren (utan kontrollen i transaktionen, utan skyddet mot
nyare data, utan reserven till version 1, utan `days` i jämförelsen, utan borttagningen av
intervallet, utan kontrollen av okända nycklar och fält). Därtill `storage.test.ts`, `persist.test.ts`, `diaryStore.test.ts`
och mätningen i `scripts/measure-diary-storage.mjs` (kontrollerar också bytet, kopian och vägen
tillbaka till version 1 i Chromium).

### Risker

| Risk | Skydd |
|---|---|
| Ett fel i jämförelsen gör att en ändring aldrig sparas | Slumpade tester (läs in igen → samma dagbok); jämförelse mot senast påbörjade skrivning; efter ett fel skrivs alla månader; speglingen och säkerhetskopian bygger på tillståndet i minnet |
| Ett fel i uppdelningen vid bytet | Kontrollen i minnet före bytet, reserv till version 1 resten av sessionen, `lagom-diary-v1` |
| Avbrott mitt i en skrivning | En transaktion för månader + index (+ kopian vid bytet); nästa skrivning skriver alla månader; misslyckas bytet (fullt) skrivs version 1 resten av sessionen |
| Äldre version eller gammal flik skriver över | `version: 2` i indexet och skyddet mot nyare data; månaderna hittas med intervallet; kontrollen i transaktionen (`token`) → hela dagboken skrivs, aldrig en månad ovanpå version 1 eller en blandning av två flikars månader |
| En nyare version sparar medan den här fliken är öppen | Skrivaren ser det i transaktionen, skriver inte över och skyddar dagboken; version A (skrivaren av) skriver som förut – den senaste vinner, och andra flikar läser in via stämpeln |
| En senare version lägger till något utan att höja versionen | Okända nycklar i intervallet och okända fält skyddas som nyare data; regeln "nytt kräver version 3" står i CLAUDE.md |
| Tillbakarullning | Version A läser version 2 och skriver version 1 i en transaktion (testat, och prövat i Chromium av mätningen, §4) |
| Trasig data | "Går inte att tolka": minnesläge, loggas (utan innehåll), skrivs inte över; egen text och påminnelsen om säkerhetskopia behöver `hasUnreadableData()`/`hasProtectedData()` i gränssnittet |
| Dubbelt utrymme efter bytet (månaderna + kopian) | Mätt i Chromium: 3,9 → 7,8 MB på disk efter tre år – litet jämfört med kvoten; `lagom-diary-v1` tas bort i version C |
| WebKit beter sig annorlunda | Mät på en riktig iPhone före version B |

## 8. Alternativ som inte föreslås nu

- **SQLite i apparna** (t.ex. `@capacitor-community/sqlite` – inte godkänt av ägaren): en rad per
  post, transaktioner och en fil som iOS inte rensar. Men webben behöver ändå IndexedDB (två
  lagringar att hålla i takt), all data måste ändå in i minnet vid start (genom bryggan, som på
  Android blir JSON), och allt kan bara provas på riktiga telefoner. Ta upp det igen om iOS i
  praktiken rensar webbvyns lagring trots speglingen, eller om dagböckerna blir mycket större.
- **Bara fördröja skrivningarna** (debounce): färre skrivningar i rad, men varje skrivning kostar
  lika mycket, och det som inte hunnit sparas förloras om appen stängs av systemet. Kan
  kombineras med månadsnycklar, med tömning vid `beforeunload`/`pagehide`/`visibilitychange` och
  när appen går till bakgrunden – så gör stegfältet och anteckningen nu (`useDeferredSave`, §9).
- **Komprimering** (`CompressionStream`): 85 % mindre, men stringify blir kvar och
  komprimeringen kostar också.
- **Stringify i en Web Worker:** objektet måste kopieras till arbetaren (structured clone), vilket
  kostar ungefär lika mycket som stringify.

## 9. Små förbättringar som kan göras direkt

Ingen av dem ändrar formatet. De minskar antalet omskrivningar i rad:

1. **Ta bort och återställ flera poster med en skrivning** (`removeEntries`/`restoreEntries` i
   `diaryStore`), använda i ångra, "Töm måltiden" och tillskottskortet i stället för
   `removeEntry`/`restoreEntry` i en slinga. Att ångra en kopierad dag med sju poster efter tre år
   går då från ~3 s blockerad huvudtråd (4×) till ~0,45 s. `moveEntry` skriver också en gång.
   *Gjort 2026-09-29 (`src/stores/diaryStore.test.ts`).*
2. **Hälsa-synken:** alla dagars steg skrivs med en `setDayMetas` i stället för en `setDayMeta`
   per dag. *Gjort 2026-09-29.*
3. **Stegfältet:** spara efter en kort paus (som anteckningen, 600 ms) i stället för vid varje
   tangenttryck. *Gjort 2026-09-29* (`src/hooks/useDeferredSave.ts`: 600 ms efter sista
   ändringen, direkt vid blur, byte av dag, avmontering, `beforeunload` (bara medan något väntar –
   Chromium sparar aldrig en IndexedDB-skrivning som startar i `pagehide` när sidan laddas om eller
   fliken öppnar en annan adress; hittat med `scripts/e2e/karna.mjs`), `pagehide` och
   `visibilitychange` → hidden, aldrig när värdet är oförändrat; `StepsCard.test.tsx`). Anteckningen (`DayNotesCard`)
   använder samma krok och sparar nu också när appen göms. "12000" siffra för siffra är en
   skrivning, tryck på −/+ i rad likaså.
4. **Hoppa över skrivningar som inte ändrar något** (`addWater`, `setWater`, `setDayMeta` och
   `setDayMetas` anropar inte `set()` när värdet redan är detsamma). *Gjort 2026-09-29.*
5. **Släpp kopian i `memory`** när skrivningen till IndexedDB har lyckats (15 MB efter tre år).
   Kopian behövs bara när IndexedDB inte fungerar eller inte har lästs in. *Gjort 2026-09-29*
   (`guardedWrite` i `stores/storage.ts`: kopian släpps när skrivningen lyckats och värdet
   fortfarande är det senaste; dagbokens lagring håller dessutom bara en referens till objektet,
   ingen sträng). Gäller alla butiker. Mätt i Chromium efter tre år: 0,08 MB kvar efter en
   skrivning i stället för 14,8 MB (§5).

## 10. Köra mätningen igen

```sh
# Lagringens tester (version 1 och 2, bytet, skydden, slumpade följder)
npx vitest run src/stores/diaryMonthStorage.test.ts src/stores/storage.test.ts src/stores/persist.test.ts

# Storlekar och tider i Node, även månadsskrivaren (hoppas annars över i testsviten)
LAGOM_MEASURE_STORAGE=1 npx vitest run src/stores/diaryStorage.bench.test.ts --silent=false

# Chromium med riktig IndexedDB och CPU-strypning (bygger datan själv om den saknas):
# version 1 som appen skriver i dag, och månadsskrivaren påslagen på mätsidan
node scripts/measure-diary-storage.mjs --runs=9 --json=/tmp/lagring-resultat.json
# … och jämför version 1 med en äldre version av lagringen (git-ref, t.ex. före dagbokens egen lagring)
node scripts/measure-diary-storage.mjs --runs=9 --before=3bac682 --json=/tmp/lagring-resultat.json
node scripts/measure-diary-storage.mjs --years=3 --rates=4 --runs=5   # snabbare
```

Skriptet behöver Playwright med Chromium (samma som `scripts/app-store-screenshots.mjs`), skriver
data och Chromium-profil i `<tmp>/lagom-lagring` (`--data=<mapp>`) och ändrar inget i repot.
Månadsskrivaren slås bara på i mätsidans eget bygge (`setDiaryMonthWriteForTests`), och varje
mätning av den avslutas med att dagboken skrivs tillbaka som version 1 – det prövar samtidigt vägen
tillbaka. Minne och disk mäts i en ny profil per dagbok (`chromium-profil-minne`), eftersom LevelDB
städar gamla värden först senare. Med `--before=<git-ref>` byggs `diaryStore.ts`, `storage.ts` och
(om den finns) `diaryMonthStorage.ts` från den versionen; allt annat tas från arbetskopian. Kör
mätningen igen när formatet ändras, och komplettera med en mätning på en riktig iPhone och en
mellanklass-Android.
