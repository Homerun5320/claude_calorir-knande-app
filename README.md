# Lagom – kaloriräknaren

> *Lagom är bäst.* En svensk kalori- och näringsdagbok som är vacker, komplett, gratis och privat.

Lagom är en installerbar webbapp (PWA) för mobil och dator. Den är byggd för den svenska marknaden och har svenska livsmedel, svenska köksmått (dl, msk, tsk, krm), Livsmedelsverkets kostråd, Tallriksmodellen och de nordiska näringsrekommendationerna (NNR 2023). Allt fungerar offline, och ingen data lämnar telefonen.

## Så löser Lagom problemen med andra kaloriappar

| Problem i vanliga kaloriappar | Så gör Lagom |
| --- | --- |
| Crowdsourcade databaser med dubbletter och 15–30 % fel | Kurerad svensk databas baserad på Livsmedelsverkets värden, med automatisk kvalitetskontroll. Varje livsmedel visar sin källa, och användarbidrag från Open Food Facts märks tydligt. |
| Okända näringsvärden visas som 0 | Okänt visas som "–", och appen visar hur fullständiga näringsdata är. |
| Betalvägg för streckkoder, makromål och export | Allt är gratis. Streckkodsläsaren, alla näringsämnen, recept, export och insikter ingår. |
| Reklam och uppsäljning | Ingen reklam, inga konton, inga prenumerationer. |
| Krascher, synkfel och dataförlust | Allt lagras lokalt och appen fungerar offline. Säkerhetskopiering till fil (JSON) och export till Excel (CSV). |
| Engelska mått och utländska livsmedel | Svenska livsmedel och klassiker (knäckebröd, falukorv, kanelbulle, ärtsoppa …) och svenska köksmått omräknade med densitet ("2 dl havregryn" blir rätt vikt). |
| Långsam, krånglig registrering | Smart sök som klarar å/ä/ö, stavfel och sammansatta ord. Senaste och favoriter per måltid, kopiera gårdagens måltid, sparade måltider och en korg för att lägga till flera livsmedel på en gång. |
| Statiska kalorimål som inte stämmer | Adaptiv energiförbrukning som räknas fram ur din vikttrend och ditt faktiska intag. |
| Överskattade träningskalorier | Nettokalorier (MET − vila). Du väljer själv hur stor andel som läggs till dagens budget. |
| Recept blir fel efter tillagning | Recept räknas på tillagad vikt ("väg grytan när den är klar"). |
| Dömande ton som kan skada vid ätstörningar | Varm och icke-dömande ton, ett medvetet läge utan siffror, säkerhetsgolv för kalorier, ingen viktnedgång vid graviditet, amning eller under 18 år, och hänvisning till 1177 och Frisk & Fri. |
| Integritet | Ingen server och inget konto. Datan stannar i din telefon (GDPR), och du kan exportera eller radera allt när som helst. |

## Funktioner

- **Idag**: dagsringen (kcal kvar med makrofärger), makron, måltider, vatten, dagens tallrik, veckoöversikt, tips och svensk matkalender (t.ex. Kanelbullens dag).
- **Dagbok**: måltider (frukost, lunch, fika, middag, kvällsmat, mellanmål) med redigering, flytta/kopiera, mallar, anteckningar och mående.
- **Lägg till**: sök, streckkodsläsare (Open Food Facts), snabbregistrering, egna livsmedel och portionsväljare med svenska mått.
- **Recept**: egna recept med tillagad vikt och svenska klassiker.
- **Vikt & mått**: trendvikt, prognos för måldatum, BMI och midja/längd-kvot samt adaptiv förbrukning.
- **Insikter**: näring mot NNR 2023, Livsmedelsverkets kostråd, Tallriksmodellen, klimatavtryck (kg CO2e) och mönster.
- **Träning, dryck och fasta**: aktiviteter med MET-värden (längdskidor, innebandy, padel …), vatten, koffein, alkohol i standardglas och en fastetimer.
- **Inställningar**: mål, måltider, tema, medvetet läge samt export/import och radering.

## Utveckling

```bash
npm install
npm run dev        # utvecklingsserver
npm run build      # typkontroll + produktionsbygge (dist/)
npm test           # vitest
npm run typecheck  # tsc -b
```

### Livsmedelsverkets fullständiga databas

Den inbyggda databasen är kurerad och kvalitetskontrollerad. Med nätåtkomst kan du dessutom hämta hela Livsmedelsverkets livsmedelsdatabas (cirka 2 600 livsmedel):

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
