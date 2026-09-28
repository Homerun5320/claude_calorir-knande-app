# Lagom – kaloriräknaren

> *Lagom är bäst.* En svensk kalori- och näringsdagbok som är vacker, komplett, gratis och privat.

Lagom är en installerbar webbapp (PWA) för mobil och dator. Den är byggd för den svenska marknaden och har svenska livsmedel, svenska köksmått (dl, msk, tsk, krm), Livsmedelsverkets kostråd, Tallriksmodellen och de nordiska näringsrekommendationerna (NNR 2023). Allt fungerar offline, och ingen data lämnar telefonen.

## Så löser Lagom problemen med andra kaloriappar

| Problem i vanliga kaloriappar | Så gör Lagom |
| --- | --- |
| Crowdsourcade databaser med dubbletter och 15–30 % fel | Kurerad svensk databas med 855 livsmedel baserad på Livsmedelsverkets värden – en rad per vardagsbegrepp (Kycklingbröst, Pasta, Havredryck) i stället för sex nästan likadana varianter. Varje fil är oberoende faktagranskad, och ett automatiskt test kontrollerar att energin stämmer med makronäringsämnena. Varje livsmedel visar sin källa, och användarbidrag från Open Food Facts märks tydligt. |
| Okända näringsvärden visas som 0 | Okänt visas som "–", och appen visar hur fullständiga näringsdata är. |
| Betalvägg för streckkoder, makromål och export – och prenumerationer som är svåra att säga upp | 14 dagar gratis, sedan engångsköp 599 kr eller årslicens 299 kr utan automatisk förnyelse – ingen reklam, inga dolda avgifter. Allt ingår: streckkodsläsaren, alla näringsämnen, recept, export och insikter. Din data låses aldrig – efter provperioden kan du alltid se, exportera och radera den. |
| Reklam och uppsäljning | Ingen reklam, inga konton, inga prenumerationer. |
| Krascher, synkfel och dataförlust | Allt lagras lokalt och appen fungerar offline. Säkerhetskopiering till fil (JSON) och export till Excel (CSV). |
| Engelska mått och utländska livsmedel | Svenska livsmedel och klassiker (knäckebröd, falukorv, kanelbulle, ärtsoppa …) och svenska köksmått omräknade med densitet ("2 dl havregryn" blir rätt vikt). Kött, fisk, pasta och ris kan vägas råa eller okokta ("150 g rå", "1 dl okokt") – Lagom räknar om till tillagad vikt. |
| Långsam, krånglig registrering | Smart sök som klarar å/ä/ö, stavfel och sammansatta ord. Senaste och favoriter per måltid, kopiera gårdagens måltid, sparade måltider och en korg för att lägga till flera livsmedel på en gång. |
| Statiska kalorimål som inte stämmer | Adaptiv energiförbrukning som räknas fram ur din vikttrend och ditt faktiska intag. |
| Överskattade träningskalorier | Nettokalorier (MET − vila). Du väljer själv hur stor andel som läggs till dagens budget. |
| Recept blir fel efter tillagning | Recept räknas på tillagad vikt ("väg grytan när den är klar"). |
| Dömande ton som kan skada vid ätstörningar | Varm och icke-dömande ton, ett medvetet läge utan siffror, säkerhetsgolv för kalorier, ingen viktnedgång vid graviditet, amning eller under 18 år, och hänvisning till 1177 och Frisk & Fri. |
| Integritet | Ingen server och inget konto. Datan stannar i din telefon (GDPR), och du kan exportera eller radera allt när som helst. |

## Funktioner

- **Idag**: dagsringen (kcal kvar med makrofärger), makron, måltider, vatten, dagens tallrik, veckoöversikt, tips och svensk matkalender (t.ex. Kanelbullens dag).
- **Dagbok**: måltider (frukost, lunch, fika, middag, kvällsmat, mellanmål) med redigering, flytta/kopiera, mallar, anteckningar och mående.
- **Lägg till**: sök, streckkodsläsare (Open Food Facts), snabbregistrering, egna livsmedel och portionsväljare med svenska mått, "g rå" och "dl okokt". Samlingsvärden för produkttyper med många märken och Livsmedelsverkets övriga livsmedel i en egen sektion (se [Livsmedelsdatabasen](#livsmedelsdatabasen)).
- **Recept**: egna recept med tillagad vikt och 35 svenska klassiker.
- **Vikt & mått**: trendvikt, prognos för måldatum, BMI och midja/längd-kvot samt adaptiv förbrukning.
- **Insikter**: näring mot NNR 2023, Livsmedelsverkets kostråd, Tallriksmodellen, klimatavtryck (kg CO2e) och mönster.
- **Träning, dryck och fasta**: aktiviteter med MET-värden (längdskidor, innebandy, padel …), vatten, koffein, alkohol i standardglas och en fastetimer.
- **Inställningar**: mål, måltider, tema, medvetet läge samt export/import och radering.

## Livsmedelsdatabasen

Lagoms egen databas (`src/data/foods/`) har 855 kurerade livsmedel med svenska namn, portioner, sökord och klimatvärden. Den följer några enkla principer:

- **Grova linjer.** En rad per vardagsbegrepp så som det äts, med kort och naturligt namn: "Kycklingbröst", "Kycklingkorv", "Nötfärs", "Lax", "Pasta", "Ris". Varianter som knappt skiljer sig åt är sammanslagna, och de gamla namnen finns kvar som sökord.
- **Tillagat som standard – väg gärna rått.** Kött, fågel, fisk, pasta, ris, gryn och torkade baljväxter anges tillagade – 69 livsmedel har omräkning från rå, okokt eller fryst vikt. Väger du varan rå eller okokt väljer du enheten "g rå", "g okokt" eller "dl okokt", så räknar Lagom om till tillagad vikt (150 g rått kycklingbröst ≈ 113 g stekt, 1 dl okokt ris ≈ 255 g kokt). Frukt och grönsaker som äts råa är fortfarande råa.
- **Samlingsvärden för produkter med många märken.** Havredryck, granola, müsli, flingor, energidryck, proteinbar, smaksatt yoghurt, läsk, chips, glass, korv, frysta färdigrätter med flera (172 livsmedel) har en rad var med ett genomsnitt av vanliga märken i svenska butiker. De är märkta "Samlingsvärde" och saknar märke – skanna streckkoden för exakta värden för ditt märke (Open Food Facts).
- **Gamla id:n fungerar.** Borttagna och sammanslagna livsmedel har alias till bästa ersättare (394 st i `src/data/foods/aliases/`), så att favoriter, Senaste, sparade måltider och recept fortsätter att fungera. En gammal mängd i gram rå vara blir "g rå" hos den tillagade raden.
- **Fler från Livsmedelsverket.** Livsmedelsverkets fullständiga databas (2 606 livsmedel) blandas inte in bland huvudträffarna. De visas i en egen, hopfälld sektion "Fler från Livsmedelsverket" som fälls ut automatiskt när huvudträffarna är få. Råa och okokta varor, torkade baljväxter och specialposter (" rå", barnmat, välling, inälvor) visas där bara om sökningen själv innehåller ordet.

## Kvalitet

- 1 383 automatiska tester (vitest), bland annat en säkerhetsmatris som prövar 40 000 slumpade profiler mot reglerna för kalorimål.
- Granskad ur fem perspektiv: funktionstest i webbläsare, kodgranskning, design och svensk text, tillgänglighet (WCAG 2.2 AA) samt näringslära och säkerhet.
- Fungerar från 320 px mobilbredd till stor skärm, i ljust och mörkt läge.

## Prova utan att mata in något

Välj **Utforska med exempeldata** på välkomstskärmen. Då fylls appen med två veckor av en påhittad användares svenska vardagsmat. Exempeldata kan rensas under Inställningar → Data.

## Betalning och licenser

Lagom är gratis att prova i 14 dagar. Sedan köper man en **Livstidslicens (599 kr)** eller en **Årslicens (299 kr, 365 dagar, förnyas inte automatiskt)**. Priserna är inklusive moms. Köpet görs via Stripe Checkout (kort, Klarna, Swish) och ger en signerad licensnyckel som appen kontrollerar offline – inget konto behövs. Serverdelen är tre små Netlify Functions utan databas.

Så sätter du upp Stripe och Netlify, testar köpflödet och går live: [`docs/BETALNING.md`](docs/BETALNING.md). Alla miljövariabler finns i [`.env.example`](.env.example).

## Utveckling

```bash
npm install
npm run dev        # utvecklingsserver
npm run build      # typkontroll + produktionsbygge (dist/)
npm test           # vitest
npm run typecheck  # tsc -b
```

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
