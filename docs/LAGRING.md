# Dagbokens lagring – mätning och beslut

Underlag för checklistepunkten **dagbok-en-nyckel**: "Hela dagboken skrivs om som en JSON-sträng
vid varje ändring (ca 5–6 MB efter tre år). Mät först och bestäm format innan native lagring
byggs." Mätt 2026-09-29. Ingen formatändring är gjord – det här dokumentet är beslutsunderlaget.

## Innehåll

1. [Sammanfattning och beslut](#1-sammanfattning-och-beslut)
2. [Så sparas dagboken i dag](#2-så-sparas-dagboken-i-dag)
3. [Hur ofta dagboken skrivs](#3-hur-ofta-dagboken-skrivs)
4. [Så mättes det](#4-så-mättes-det)
5. [Resultat](#5-resultat)
6. [Slutsats: behövs uppdelning?](#6-slutsats-behövs-uppdelning)
7. [Förslag: en nyckel per månad i IndexedDB](#7-förslag-en-nyckel-per-månad-i-indexeddb)
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
- **Varje ändring skriver om hela dagboken på huvudtråden.** Ett tryck på vattenknappen, en
  siffra i stegfältet eller en loggning blockerar appen i ungefär **0,25 s efter ett år och
  0,45 s efter två–tre år på en mellanklasstelefon** (CPU-strypning 4×), och **0,4 respektive
  0,65–0,7 s på en enklare** (6×). Över 0,2 s räknas som tröghet (INP), över 0,5 s som dåligt.
- **Starten klarar sig:** att läsa in tre års dagbok tar 0,26 s (4×) och 0,38 s (6×) – långt under
  lagringens tidsgräns på 8 s.
- **Minnet:** tre års dagbok tar 24,5 MB JS-minne, plus 15 MB för en kopia av den sparade strängen
  som lagringen håller kvar efter varje skrivning (`memory` i `stores/storage.ts`).
- **Månadsnycklar löser skrivningarna:** samma loggning med bara den aktuella månaden (≈ 200 kB)
  är helt klar på 12–22 ms (4–6×), oavsett hur gammal dagboken är.

**Beslut (förslag till ägaren):**

1. **Ingen formatändring före lanseringen.** Ingen användare har mer än några veckors data, och
   varje skrivning tar då några millisekunder.
2. **Dela upp dagboken i en nyckel per månad i IndexedDB** (avsnitt 7) – samma kod på webben och i
   apparna. Den bör vara ute **inom ungefär ett halvår efter lanseringen**, innan de första
   användarna har ett års data. Bygg den i två steg (läsare först, skrivare sedan).
3. **Ingen egen native lagring (SQLite) för dagboken nu.** Den behövs inte för prestandan,
   kräver ett nytt tillägg som ägaren inte har godkänt och ger två lagringar att hålla i takt.
   Speglingen (`lagom-spegling.json`) finns kvar som skydd mot att iOS rensar webbvyns lagring.
4. **De små förbättringarna i avsnitt 9** (färre skrivningar i rad: ångra, töm måltid,
   Hälsa-synk, inga skrivningar utan ändring) är gjorda 2026-09-29; stegfältet och kopian i minnet
   återstår.

## 2. Så sparas dagboken i dag

- `useDiaryStore` (`src/stores/diaryStore.ts`) använder zustands `persist` med
  `idbStorage = createJSONStorage(() => idbStateStorage)` (`src/stores/storage.ts`).
- Allt ligger i **en nyckel**, `lagom-diary`, i idb-keyvals databas `keyval-store`. Värdet är en
  JSON-sträng: `{"state":{"entries":{…},"water":{…},"exercise":{…},"days":{…}},"version":1}`.
- En matpost (`FoodEntry`) har en **ögonblicksbild av hela livsmedlet** (`food: Food`) så att
  dagboken inte ändras när databasen uppdateras. Snapshotet görs i `makeFoodEntry`
  (`src/lib/diary.ts`) och innehåller allt: upp till 35 näringsämnen, portioner, sökord (`synonyms`),
  anteckning, märkningar, Open Food Facts-uppgifter med ingredienstext och bildadress. (Sparade
  måltider tar redan bort ingredienstexten, se `templateFood` i `features/add/useAddFood.ts`.)
- **Skrivning:** varje `set()` i butiken → `persist` → `JSON.stringify` av hela dagboken
  (synkront, på huvudtråden) → `idbStateStorage.setItem` sparar strängen i `memory` och skriver
  den med idb-keyval. IndexedDB serialiserar värdet på huvudtråden och skriver till disk i
  webbläsarens egen process. Ingen fördröjning (debounce), och `persist` skriver om hela dagboken
  vid varje `set()` – bara vatten och dagens uppgifter hoppar sedan 2026-09-29 över `set()` när
  värdet redan är detsamma (§9, punkt 4).
- **Läsning vid start:** hela strängen hämtas, versionen läses från slutet (`storedVersion`),
  `JSON.parse` och in i butiken.
- Efter varje lyckad skrivning meddelas andra flikar, som läser in och tolkar hela dagboken igen
  (dolda flikar högst var 30:e sekund, `stores/hydration.ts`).
- Strängen lagras med **två byte per tecken** i minnet (V8, och sannolikt WebKit): det räcker med
  ett enda tecken över U+00FF, och tre års dagbok har över tusen tankstreck ("–") i livsmedlens
  anteckningar.

## 3. Hur ofta dagboken skrivs

Varje rad nedan är en **hel omskrivning** av dagboken (7,4 MB efter tre år):

| Händelse | Skrivningar av dagboken | Annat som skrivs |
|---|---|---|
| Logga ett livsmedel | 1 | livsmedelsbutiken 1–2 gånger (statistik, cache för skannade produkter) |
| Logga en måltid med *n* livsmedel | 1 | livsmedelsbutiken *n*–2*n* gånger |
| **Ångra** en loggning eller kopiering med *n* poster | ***n*** (`removeEntry` i en slinga: `useAddFood`, `AddFoodPage`, `DayCards`, `MealsOverview`, `MealSheets`, `DiaryPage`) – **nu 1** (`removeEntries`) | |
| **Töm en måltid**, och ångra det | ***n*** + ***n*** (`removeEntry`/`restoreEntry` i en slinga, `DiaryPage`; likadant i `SupplementsCard`) – **nu 1 + 1** (`removeEntries`/`restoreEntries`) | |
| Flytta en post | 2 (`moveEntry` = ta bort + lägga till) – **nu 1** | |
| Ändra/ta bort en post, kopiera måltid/dag | 1 | |
| Tryck på vattenknappen | 1 per tryck (0 när mängden inte ändras, t.ex. − vid 0 ml) | |
| **Steg** i stegfältet | **1 per tangenttryck** och per tryck på +/− (`StepsCard` → `NumberField`) | |
| Humör, energi, hunger, "dagen klar" | 1 per tryck (0 när värdet redan är satt) | |
| Dagens anteckning | 1 per paus på 600 ms (`DayNotesCard`) | |
| Träning: lägga till/ändra/ta bort | 1 | |
| **Hälsa-synk** i apparna | **1 per dag med nya steg** (upp till 7 i rad, `importSteps` i `native/health.ts`) – **nu 1** (`setDayMetas`) | |
| Annan flik sparar | 0 – men den här fliken läser och tolkar hela dagboken | |
| Speglingen i apparna | 0 – men hela säkerhetskopian (alla butiker) blir JSON högst 30 s efter en ändring och när appen går till bakgrunden | fil `lagom-spegling.json` |

Svar på frågorna i checklistan: **ja, varje ändring skriver om hela dagboken, utan fördröjning**, och
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
  (Safari → Utveckla → Webbgranskaren → Tidslinjer) innan uppdelningen byggs.

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
0,7 s (6×) efter tre år, högst var 30:e sekund medan man loggar och när appen går till bakgrunden.
Därtill tolkar Capacitors Java-sida anropet (9 miljoner tecken JSON) och skriver filen (inte
mätt, sker utanför webbvyns huvudtråd). På iPhone skickas anropet utan JSON-steget; stringify av säkerhetskopian
återstår. `parseBackup` (med kontroll av varje post) tar 155 ms i Node efter tre år och körs bara
vid återställning.

### Minne och disk (Chromium, 1×)

| Dagbok | JS-minne för dagboken | + kopian i `memory` efter en skrivning | IndexedDB på disk |
|---|---:|---:|---:|
| 1 år | 9,3 MB | 5,5 MB | 1,4 MB |
| 2 år | 16,5 MB | 9,8 MB | 2,7 MB |
| 3 år | 24,5 MB | 14,8 MB | 4,2 MB |

- JS-minnet är större än JSON-strängen eftersom varje post får en egen kopia av livsmedlet när
  dagboken tolkas (JSON har inga referenser).
- Chromium komprimerar värdena i IndexedDB (4,2 MB på disk för 7,4 MB JSON). Hur WebKit lagrar
  en tvåbytessträng i sin SQLite-baserade IndexedDB är inte mätt – räkna med upp till 15 MB per
  skrivning på iPhone tills det är mätt.

### Node (referens)

`LAGOM_MEASURE_STORAGE=1 npx vitest run src/stores/diaryStorage.bench.test.ts` skriver samma
storlekar och tider i Node med fake-indexeddb (3 år: stringify 43–46 ms, parse 38–42 ms). De visar
att datan och formatet stämmer, men tiderna för telefoner är Chromium-tiderna ovan.

## 6. Slutsats: behövs uppdelning?

**Ja, men inte nu – planera in den till det första halvåret efter lanseringen.**

- I dag (före lanseringen) har ingen användare stor dagbok, och en skrivning tar några ms.
- Efter **ett år** blockerar varje tryck ~0,25 s på en mellanklasstelefon och ~0,4 s på en enklare.
  Det märks – särskilt där många skrivningar kommer i rad: stegfältet (en skrivning per siffra),
  "Ångra" och "Töm måltiden" (en per post), vattenknappen när man trycker flera gånger och Hälsa-synken.
- Efter **två–tre år** är det 0,45–0,7 s per tryck och uppåt en sekund i sämsta fall. Det bryter
  mot appens känsla ("lagom", lugn) och syns i INP.
- Starttiden, lagringsutrymmet och tidsgränsen (8 s) är inte problemet – skrivningarna är det.
- Uppdelningen behöver inte vänta på native lagring: den görs i lagringslagret och gäller webben
  och apparna på en gång. **Native lagring (SQLite) behövs inte** för att lösa det här.

## 7. Förslag: en nyckel per månad i IndexedDB

### Format (version 2)

```
lagom-diary          {"state":{"format":"manader","months":["2023-10", …, "2026-09"]},"version":2}
lagom-diary:2026-09  {"entries":{…},"water":{…},"exercise":{…},"days":{…}}   (bara datum i månaden)
lagom-diary-v1       den gamla strängen, sparad vid migreringen (tas bort efter ett par versioner)
```

- `lagom-diary` blir ett litet index med `version: 2` (`PERSIST_VERSIONS`). Det befintliga skyddet
  mot data från en nyare version (`isFromNewerVersion` läser versionen i slutet av strängen) gör
  att en version av Lagom som **inte** känner till version 2 varken läser eller skriver över den
  nya datan – den sparar bara i minnet. Därför måste version A i migreringsplanen nedan uttryckligen
  godta dagbokens version 2 vid läsning (ett undantag i `isFromNewerVersion` för `lagom-diary`,
  medan `PERSIST_VERSIONS` fortfarande är 1 så att den skriver version 1). Annars hamnar den som
  rullas tillbaka från version B i minnesläge i stället för att se sin dagbok.
- Butikens form (`entries`, `water`, `exercise`, `days`) ändras inte – resten av appen,
  säkerhetskopian, speglingen, molnet och CSV-exporten märker ingenting. Bara lagringens och
  versionernas tester (`storage.test.ts`, `persist.test.ts`) behöver ändras.

### Skrivning

En egen `PersistStorage` för dagboken (i stället för `createJSONStorage`) får hela tillståndet som
objekt och skriver bara det som ändrats:

1. Jämför med det senast skrivna tillståndet **per referens**: zustand byter bara ut de listor som
   ändras, så `next.entries[datum] !== prev.entries[datum]` (och samma för `water`, `exercise`,
   `days`) ger de ändrade månaderna. Är hela `next.water === prev.water` hoppas den över. Det är
   drygt 1 000 jämförelser efter tre år – försumbart. Jämförelsen görs mot det senast *lyckade*
   läget, så att en misslyckad skrivning tas med nästa gång.
2. `JSON.stringify` bara av de ändrade månaderna (≈ 200 kB).
3. **En enda IndexedDB-transaktion** (idb-keyvals `createStore`/`UseStore` ger objektlagret):
   `put` för ändrade månader, `delete` för månader som blivit tomma, `put` för indexet. Antingen
   sparas allt eller inget.
4. Samma skydd som i dag: inget skrivs förrän indexet och alla månader har lästs in (`unread`,
   en långsam läsning gäller hela dagboken), inget över data från en nyare version, misslyckade
   skrivningar syns i `isMemoryOnlyStorage()`, stämpel och meddelande till andra flikar på
   `lagom-diary`.

### Läsning

Läs indexet; är det version 1 (den gamla strängen) → migrering. Annars `getMany` av alla månader i
en transaktion och sätt ihop tillståndet. Hela dagboken hålls i minnet som i dag (starten blir som
nu). Att bara läsa de senaste månaderna vid start är en senare, separat förbättring – den kräver
att Insikter, milstolpar, adaptiv förbrukning och sökningens "Senaste" kan vänta på äldre data.

### Steg 2 (valfritt): ögonblicksbilderna en gång

Spara varje ögonblicksbild en gång (`lagom-diary:livsmedel`, nyckel = livsmedlets id + innehållets
kontrollsumma) och bara en referens i posterna. Vid läsning länkas posterna till samma objekt.
Tre år: 7,4 → 1,6 MB, och starten och JS-minnet bör krympa ungefär lika mycket (inte mätt). Det
är mer komplicerat (kontrollsummor, städning av oanvända ögonblicksbilder) – gör det bara om
starten eller minnet blir ett problem. Att bara ta bort sökord och anteckning ur ögonblicksbilden sparar ~17 % men ändrar vad en
sparad post innehåller.

### Steg 3 (senare): speglingen

Speglingen skriver hela säkerhetskopian (0,45–0,7 s på Android efter tre år). Samma idé kan gälla
där: en fil per månad plus ett index, eller hela filen gzip-komprimerad (`CompressionStream`,
1,1 MB i stället för 7,6 MB genom bryggan). Enklast först: skriv den glesare (t.ex. högst var
femte minut) men alltid när appen går till bakgrunden.

### Migreringsplan

1. **Version A – läsaren:** kan läsa både version 1 och 2 men skriver fortfarande version 1 (och tar
   bort eventuella månadsnycklar när den skriver). `PERSIST_VERSIONS` för `lagom-diary` är kvar på
   1, men `isFromNewerVersion` får ett undantag som släpper igenom dagbokens version 2 till den nya
   läsaren (andra versioner över 1 stoppas som i dag). Då kan version B rullas tillbaka utan att
   någon ser en tom dagbok eller hamnar i minnesläge.
2. **Version B – skrivaren** (några veckor senare, när de flesta har A; i apparna nästa
   butiksversion): vid första starten läses strängen i version 1, zustand kör `migrate` och sparar
   – den nya lagringen skriver alla månader och indexet i en transaktion och flyttar den gamla
   strängen till `lagom-diary-v1`. Därefter läses allt in igen och jämförs (antal poster per dag);
   stämmer det inte används den gamla strängen och felet loggas med `logError`.
3. **Version C:** ta bort `lagom-diary-v1` (efter minst en månad).

Registrera månadsnycklarna där `STORE_KEYS` används i dag: "Radera all data" (`clearDiary` →
lagringen tar bort alla månader), `removeItem`, `persist.test.ts`, `hydration.ts` (andra flikar
läser in via indexet) och CLAUDE.md.

### Tester

- Slumpade följder av alla butikens åtgärder (lägga till, ta bort, flytta mellan månader, vatten,
  steg, `clearDiary`) → läs in på nytt → samma tillstånd som i minnet.
- Migrering med den treåriga dagboken från `diaryStorage.bench.test.ts` (samma innehåll före och
  efter, `lagom-diary-v1` finns kvar).
- Avbrott: en misslyckad transaktion lämnar det gamla läget orört; fullt lagringsutrymme syns.
- Skyddet mot nyare version, långsam läsning, andra flikar och "Radera all data".
- Mätningen i `scripts/measure-diary-storage.mjs` utökad med den nya lagringen.

### Risker

| Risk | Skydd |
|---|---|
| Ett fel i jämförelsen gör att en ändring aldrig sparas | Slumpade tester; jämför antalet poster efter varje start i utvecklingsläge; speglingen och säkerhetskopian bygger på tillståndet i minnet och fångar det som saknas |
| Avbrott mitt i en skrivning | En transaktion för månader + index |
| Äldre version eller gammal flik skriver över | `version: 2` i indexet och det befintliga skyddet; två-stegsutrullningen |
| Tillbakarullning | Version A kan läsa version 2 (undantaget i `isFromNewerVersion`, se steg 1) |
| Dubbelt utrymme under migreringen (7 + 7 MB) | Litet jämfört med kvoten; `lagom-diary-v1` tas bort i version C |
| WebKit beter sig annorlunda | Mät på en riktig iPhone före och efter |

## 8. Alternativ som inte föreslås nu

- **SQLite i apparna** (t.ex. `@capacitor-community/sqlite` – inte godkänt av ägaren): en rad per
  post, transaktioner och en fil som iOS inte rensar. Men webben behöver ändå IndexedDB (två
  lagringar att hålla i takt), all data måste ändå in i minnet vid start (genom bryggan, som på
  Android blir JSON), och allt kan bara provas på riktiga telefoner. Ta upp det igen om iOS i
  praktiken rensar webbvyns lagring trots speglingen, eller om dagböckerna blir mycket större.
- **Bara fördröja skrivningarna** (debounce): färre skrivningar i rad, men varje skrivning kostar
  lika mycket, och det som inte hunnit sparas förloras om appen stängs av systemet. Kan
  kombineras med månadsnycklar, med tömning vid `pagehide`/`visibilitychange` och när appen går
  till bakgrunden.
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
   tangenttryck. *Återstår* (`StepsCard` → `NumberField`; tänk på att spara direkt när fältet
   lämnas och när appen går till bakgrunden).
4. **Hoppa över skrivningar som inte ändrar något** (`addWater`, `setWater`, `setDayMeta` och
   `setDayMetas` anropar inte `set()` när värdet redan är detsamma). *Gjort 2026-09-29.*
5. **Släpp kopian i `memory`** när skrivningen till IndexedDB har lyckats (15 MB efter tre år).
   Kopian behövs bara när IndexedDB inte fungerar eller inte har lästs in – granska mot
   `storage.test.ts` innan. *Återstår* (rör skyddet mot misslyckade skrivningar och bör göras
   tillsammans med månadsnycklarna).

## 10. Köra mätningen igen

```sh
# Storlekar och tider i Node (hoppas annars över i testsviten)
LAGOM_MEASURE_STORAGE=1 npx vitest run src/stores/diaryStorage.bench.test.ts --silent=false

# Chromium med riktig IndexedDB och CPU-strypning (bygger datan själv om den saknas)
node scripts/measure-diary-storage.mjs --runs=11 --json=/tmp/lagring-resultat.json
node scripts/measure-diary-storage.mjs --years=3 --rates=4 --runs=5   # snabbare
```

Skriptet behöver Playwright med Chromium (samma som `scripts/app-store-screenshots.mjs`), skriver
data och Chromium-profil i `<tmp>/lagom-lagring` (`--data=<mapp>`) och ändrar inget i repot. Kör
det igen när formatet ändras, och komplettera med en mätning på en riktig iPhone och en
mellanklass-Android.
