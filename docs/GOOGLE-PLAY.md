# Lagom i Google Play (Android)

Allt som behövs för att lägga upp Lagom i Google Play: konto, sluten test, butikstexter, grafik,
köp i appen, formulärsvar i Play Console, instruktioner till granskarna och själva appen (en
Trusted Web Activity byggd med Bubblewrap). Skrivet för en ägare utan jurist eller revisor.

> **Ändrat 2026-09-28 – Play-appen blir en inbyggd Capacitor-app, inte en TWA.** Ägaren har
> beslutat att båda butiksapparna byggs med Capacitor 8. Android-appen är nu projektet `android/`
> (applicationId `se.lagomappen.lagom`, bygget `npm run build:android` med
> `VITE_DISTRIBUTION=play`), köpen görs med Google Play Billing via `@capgo/native-purchases`, och
> appen använder Health Connect. Det som står nedan om TWA, Bubblewrap och Digital Asset Links
> (avsnitt 10–11, delar av 7) gäller inte längre och skrivs om; kontot, butikstexterna, grafiken,
> den slutna testen och formulären gäller fortfarande, med tilläggen i [NATIVE.md](NATIVE.md)
> (behörigheter, Health Connect-deklarationen, Data safety, 16 KB-sidor).

> **Viktigt:** det här är en arbetsbeskrivning, inte juridisk rådgivning. Googles regler och
> formulär ändras ofta – läs texten i Play Console innan du svarar, och kontrollera skatt och
> moms med Skatteverket (verksamt.se) om du är osäker.

**Så fungerar Play-appen:** den är ett tunt Android-skal (Trusted Web Activity, TWA) runt
webbversionen av Lagom. Appen startar `https://<domän>/?plattform=play`, och Lagom känner igen
att den körs i Play-appen (`RUNTIME === 'twa'` i `src/config/platform.ts`): då visas inga
webbpriser eller webbköp, och köp görs med Google Play Billing. Filen
`/.well-known/assetlinks.json` på webbplatsen bevisar att webbplatsen och appen hör ihop – utan
den visas en adressrad överst i appen.

## Innehåll

1. [Beslut som gäller](#1-beslut-som-gäller)
2. [Konto och avtal](#2-konto-och-avtal)
3. [Sluten test med 12 testare (krav före produktion)](#3-sluten-test-med-12-testare-krav-före-produktion)
4. [Skapa appen i Play Console](#4-skapa-appen-i-play-console)
5. [Butikstexter](#5-butikstexter)
6. [Grafik och skärmdumpar](#6-grafik-och-skärmdumpar)
7. [Köp i appen och priser](#7-köp-i-appen-och-priser)
8. [Appinnehåll – formulären i Play Console](#8-appinnehåll--formulären-i-play-console)
9. [App access – instruktioner till granskarna](#9-app-access--instruktioner-till-granskarna)
10. [Bygga appen med Bubblewrap](#10-bygga-appen-med-bubblewrap)
11. [Digital Asset Links (assetlinks.json)](#11-digital-asset-links-assetlinksjson)
12. [Nycklar och säkerhet](#12-nycklar-och-säkerhet)
13. [Checklista före produktion](#13-checklista-före-produktion)

---

## 1. Beslut som gäller

| Fråga | Beslut (2026-09-28) |
| --- | --- |
| Företagsform | Enskild firma. **Personligt** Google Play-utvecklarkonto. |
| Land | **Bara Sverige** vid lanseringen. |
| Målgrupp | Vuxna, **18 år och äldre**. |
| Priser | Årslicens **349 kr** och Livstidslicens **699 kr** (inkl. moms). |
| Livstid | För alltid, felrättningar ingår – inga löften om nya funktioner. |
| Betalning | **Bara köp i appen** (Google Play Billing). Inga länkar till eller omnämnanden av webbköp i appen eller texterna. |
| Licensnycklar | Kan aktiveras i Play-appen (Inställningar → Licens), men appen hänvisar aldrig till webbköp. |
| Provperiod | 14 dagar. Startar när den egna profilen skapas – exempeldatan är skrivskyddad. |

## 2. Konto och avtal

1. **Utvecklarkonto** (play.google.com/console): välj *Personligt konto* (för dig själv). Avgiften
   är en engångssumma på 25 USD. Google kontrollerar din identitet (id-handling) och att du har
   tillgång till en riktig Android-telefon (via appen Play Console).
2. **Betalningsprofil** (Play Console → *Konfigurera* → *Betalningsprofil*): krävs för att sälja.
   Fyll i bankkonto. Säljer du appar eller köp i appen **visas din adress offentligt** på
   butikssidan – välj vilken adress du vill använda.
3. **Näringsidkare enligt EU:s DSA** (Play Console → *Konto* → *Status som näringsidkare*): du
   säljer och är därför näringsidkare (*trader*). Namn, adress, telefon och e-post visas för
   användare i EU.
4. **Serviceavgift 15 %:** Google tar 15 % på de första 1 miljon USD per år. Kontrollera under
   *Konto* → *Serviceavgift* att nivån är aktiverad (du kan behöva bekräfta en kontogrupp).
5. **Moms och bokföring:** vid köp i Google Play är det Google som säljer till kunden och
   redovisar momsen i EU. Du får utbetalningar efter moms och avgift och en månadsrapport
   (*Ekonomiska rapporter*). Spara rapporterna som underlag för firmans bokföring.

## 3. Sluten test med 12 testare (krav före produktion)

Personliga konton som skapats efter november 2023 måste köra en **sluten test** med **minst
12 testare som är med i 14 dagar i följd** innan det går att ansöka om produktion. Räkna med
knappt tre veckor från start till ansökan.

### Plan för att hitta testare

1. **Samla 15–20 personer** (några hoppar alltid av): vänner, familj och klasskamrater med
   Android-telefon. Fråga personligt – ett kort meddelande fungerar bäst:
   > *"Jag har gjort en svensk kaloriapp och behöver testare i Google Play i två veckor. Du
   > behöver bara installera appen och öppna den några gånger. Allt stannar i din telefon.
   > Vill du vara med?"*
2. **Skapa en Google-grupp** (groups.google.com, t.ex. `lagom-testare@googlegroups.com`) eller en
   e-postlista i Play Console, och lägg in testarnas Gmail-adresser (de måste använda samma
   Google-konto som i Play Butik).
3. **Play Console → Testa och släpp → Testning → Sluten testning → Skapa spår**: lägg till
   gruppen/listan, välj Sverige och ladda upp appen (`.aab`, se [avsnitt 10](#10-bygga-appen-med-bubblewrap)).
4. **Skicka anmälningslänken** (*Anmäl dig till testet*) till alla. Be dem:
   - gå med via länken och installera appen från Play Butik,
   - **inte lämna testet** under de 14 dagarna,
   - öppna appen några gånger i veckan och gärna prova exempeldata, en egen profil och sökning.
5. **Följ upp** efter 2–3 dagar och efter en vecka (Play Console visar hur många som är med).
   Tacka gärna testarna med en gratis licensnyckel efteråt.
6. **Samla synpunkter** i ett enkelt formulär eller i Google-gruppen – Google frågar i ansökan
   om produktion hur testet gick och vad du har ändrat.
7. **Ansök om produktion** (*Instrumentpanel* → *Ansök om produktionsåtkomst*) när 14 dagar har
   gått med minst 12 testare.

## 4. Skapa appen i Play Console

*Play Console → Alla appar → Skapa app*

| Fält | Värde |
| --- | --- |
| Appnamn | `Lagom – kaloriräknaren` |
| Standardspråk | Svenska – `sv-SE` |
| App eller spel | App |
| Kostnadsfri eller betald | **Kostnadsfri** (köpen görs i appen) – kan inte ändras till betald senare |
| Deklarationer | Godkänn riktlinjerna för utvecklare och exportlagarna i USA |

Under *Testa och släpp* → *Produktion* → *Länder/regioner*: välj **bara Sverige** (gör samma sak
för spåret för sluten test).

## 5. Butikstexter

*Play Console → Väx → Butiksnärvaro → Huvudbutiksinformation*

Reglerna (Googles policy för metadata): inga rankingord ("bäst", "nr 1", "gratis") i appnamn,
ikon och kort beskrivning – i den fullständiga beskrivningen står provperioden som "14 dagar utan
kostnad" – inga emoji eller versaler för att sticka ut, inga omdömen från användare, inga myndighetslogotyper och
ingen antydan om att Lagom är kopplad till Livsmedelsverket. Nämn inte webbköp eller andra butiker.

### Appnamn (högst 30 tecken)

```
Lagom – kaloriräknaren
```

(22 tecken.)

### Kort beskrivning (högst 80 tecken)

```
Svensk kostdagbok med Livsmedelsverkets värden, svenska mått och streckkoder
```

(76 tecken.)

### Fullständig beskrivning (högst 4 000 tecken)

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
• Exportera allt när du vill, eller radera allt med ett par tryck
• Sökord och streckkoder skickas till Open Food Facts för att hitta produkter – utan ditt namn, din e-post eller din dagbok

PRIS
14 dagar utan kostnad, sedan årslicens eller livstidslicens som köp i appen via Google Play, utan automatisk förnyelse. Priserna visas i Google Play innan du köper. Provperioden startar först när du skapar din profil – exempeldatan kan du titta på så länge du vill. När provperioden är slut kan du fortfarande se, exportera och radera allt du har loggat.

KÄLLOR
Lagom är en fristående app och är inte kopplad till Livsmedelsverket; de flesta näringsvärdena kommer från Livsmedelsverkets öppna livsmedelsdatabas (CC BY 4.0), övriga är samlingsvärden för vanliga märken och värden från förpackningar. Källa: https://soknaringsinnehall.livsmedelsverket.se. Produktuppgifter från streckkoder kommer från Open Food Facts (ODbL). Rekommendationerna bygger på Nordiska näringsrekommendationer 2023 och Livsmedelsverkets kostråd.

Lagom ger allmän information och uppskattningar – inte medicinsk rådgivning. Har du en sjukdom, är gravid eller har frågor om din hälsa: prata med vården.
```

(Ungefär 2 750 tecken.) Beskriv aldrig en funktion som inte finns i det bygge du laddar upp –
veckoplaneringen och receptimporten finns i version 1.0, men kontrollera ändå. Googles policy för
appar med information från myndigheter kräver att källan anges (gärna med adress) – det gör raden
"Källa:" ovan.

### Kategori och kontaktuppgifter

*Play Console → Väx → Butiksnärvaro → Butiksinställningar*

| Fält | Värde |
| --- | --- |
| Kategori | **Hälsa och träning** |
| Taggar | Kalorier, Kost och näring, Viktkontroll (välj de som finns i listan) |
| E-post | Supportadressen (samma som `VITE_SUPPORT_EMAIL`) |
| Webbplats | `https://<domän>/` |
| Integritetspolicy | `https://<domän>/integritet/` (anges under *Appinnehåll*) |

`<domän>` = samma adress som `APP_URL` i docs/BETALNING.md.

## 6. Grafik och skärmdumpar

| Bild | Fil | Krav i Play Console |
| --- | --- | --- |
| Appikon | `store-assets/google-play-icon-512.png` | 512 × 512 px, 32-bitars PNG (med alfakanal), högst 1 024 KB. Helt fyrkantig – Google rundar hörnen själv. |
| Funktionsgrafik | `store-assets/feature-graphic-1024x500.jpg` | 1 024 × 500 px, JPEG eller 24-bitars PNG utan alfa. |
| Skärmdumpar, telefon | `store-assets/screenshots/play/ljust/*.png` | 2–8 bilder, 1 080 × 1 920 px (9:16). |

Skapa bilderna igen efter ändringar i ikonen eller designen:

```sh
node scripts/generate-icons.mjs --only=store       # ikonerna (kontrollerar storlek, färgtyp och filstorlek)
node scripts/generate-store-graphics.mjs           # funktionsgrafiken
```

Funktionsgrafiken visar ikonen, "Lagom – kaloriräknaren" och "Svensk mat, näring och kostråd" i
designsystemets färger – inga priser, rankingord eller myndighetslogotyper.

### Skärmdumpar

```sh
npx vite build                                              # webbygget – Play-appen visar webbversionen
node scripts/app-store-screenshots.mjs --only=play          # → store-assets/screenshots/play/{ljust,morkt}/
```

- Skriptet öppnar appen med `?plattform=play`, precis som Play-appen, så att bilderna visar det
  som syns i Play-appen (inga webbpriser eller tips om hemskärmen).
- Skriptet startar `vite preview` på en ledig port, laddar exempeldatan via *Utforska med
  exempeldata* och fotograferar Idag, Dagbok, Insikter (förra veckan), Recept, Vikt & mått och
  ett livsmedel med näringsvärden – i ljust och mörkt läge. Servern stängs efteråt.
- Dryck (alkohol) och Lagom Premium (priser) fotograferas aldrig. Rutan om exempeldata och
  notiser döljs.
- Bilderna saknar alfakanal och är 1 080 × 1 920 px (kontrolleras av skriptet).
- `--dist=…` pekar på ett annat bygge; `--scheme=ljust` tar bara ljust läge.
- Mappen checkas inte in – ta bilderna precis före uppladdningen.
- Playwright hittas i projektet eller globalt. Saknas det:
  `npm i -g playwright && npx playwright install chromium`.

## 7. Köp i appen och priser

*Play Console → Tjäna pengar → Produkter*

Produkt-id:na måste vara exakt desamma som i `src/lib/storePurchases.ts`:

| Produkt | Produkt-id | Typ i Play Console | Pris |
| --- | --- | --- | --- |
| Livstidslicens | `livstid` | **Engångsprodukt** (köps en gång, förbrukas aldrig) | 699 kr |
| Årslicens | `ar` | **Prenumeration med förbetald basplan** (*prepaid plan*, 1 år) – förnyas inte automatiskt | 349 kr |

- Play Console anger priset inklusive moms för Sverige. Välj Sverige som enda land.
- Årslicensen ska **inte** vara en vanlig automatiskt förnyad prenumeration – Lagom lovar
  "utan automatisk förnyelse". En förbetald basplan gäller ett år och förnyas bara om köparen
  själv köper igen. Den syns i Play-kontot, så att *Återställ köp* fungerar på en ny telefon.
- **Kontrollera när köpen byggs** (Digital Goods API i TWA:n): att förbetalda planer stöds fullt
  ut. Om inte: använd en engångsprodukt för årslicensen och låt appen räkna 365 dagar från köpet –
  men den får då inte förbrukas (*consume*), annars kan köpet inte återställas.
- Någon särskild produkt för provperioden behövs inte i Google Play – de 14 dagarna räknas i appen.
- Aktivera produkterna och testa dem med **licenstestare** (*Konfigurera* → *Licenstestning*) –
  då dras inga pengar.

## 8. Appinnehåll – formulären i Play Console

*Play Console → Policy → Appinnehåll*. Svara så här:

### Integritetspolicy

`https://<domän>/integritet/`

### Annonser

**Nej**, appen innehåller inga annonser.

### Annons-id (Advertising ID)

**Nej**, appen använder inte annons-id. Kontrollera att Android-manifestet i Bubblewrap-projektet
inte innehåller behörigheten `com.google.android.gms.permission.AD_ID`.

### Datasäkerhet (Data safety)

**Samlar appen in eller delar någon av de obligatoriska datatyperna?** Ja – bara det här:

| Kategori → datatyp | Insamlad | Delad | Behandlas bara tillfälligt? | Obligatorisk? | Syfte |
| --- | --- | --- | --- | --- | --- |
| Appaktivitet → **Sökhistorik i appen** | Ja | Nej | Nej | Nej (valfri – sökningen fungerar också offline bland Lagoms livsmedel) | Appens funktioner |

Förklaring: sökord och streckkoder skickas till Open Food Facts för att hitta produkter. Det
räknas inte som *delning*, eftersom användaren själv startar sökningen och förväntar sig att den
skickas. Inget konto, ingen reklam och ingen koppling till någon person.

Övriga frågor:

| Fråga | Svar |
| --- | --- |
| Krypteras all data under överföring? | **Ja** (HTTPS) |
| Kan användare begära att data raderas? | **Ja** – Inställningar → Data och säkerhetskopia → Radera all data raderar allt i telefonen. Lagom har inga konton och sparar ingen data på servrar. |
| Hälsa och träning, kost, vikt | **Inte insamlat** – dagboken lämnar aldrig telefonen. |
| Köphistorik | **Inte insamlat** av appen – köpet hanteras av Google Play. *Om* köp senare kontrolleras mot en egen server (Netlify-funktion): ange *Köphistorik – insamlad, inte delad, appens funktioner*. Väljs **RevenueCat** som köp-i-appen-tillägg får RevenueCat köphistorik och ett användar-id: ange då *Köphistorik* och *Enhets- eller andra id:n* (insamlade, delade med tjänsteleverantör), och lägg till RevenueCat i integritetspolicyn och registerförteckningen – före inskickningen. Rekommendationen är ett tillägg som talar direkt med Play Billing utan egen server. |
| Kraschloggar och diagnostik | **Inte insamlat** – felloggen stannar i telefonen och skickas bara om användaren själv mejlar den till supporten. |
| Receptimport från en webbadress | Adressen skickas till Lagoms server, som hämtar receptet direkt och inte sparar något. Vill du vara försiktig: ange *Appaktivitet → Annat användargenererat innehåll – insamlad, behandlas bara tillfälligt, inte delad, appens funktioner*. |
| Foton/kamera | **Inte insamlat** – kamerabilden tolkas i telefonen för streckkoder och sparas eller skickas inte. |
| Säkerhetsgranskning (MASA) | Nej (valfri) |

### Hälsoappar (Health apps)

*Appinnehåll → Hälsoappar*. Kryssa i:

- **Nutrition and weight management** (Kost och viktkontroll)
- **Activity and fitness** (Aktivitet och träning)

Kryssa **inte** i något som rör medicinteknik, sjukdomar, mediciner, graviditet eller Health
Connect. Svara **Nej** på frågan om appen är en medicinteknisk produkt (se docs/AVSETT-ANDAMAL.md).

### Innehållsklassning (IARC-formuläret)

*Appinnehåll → Innehållsklassning → Starta formuläret*. Kategori: **Alla andra apptyper** (inte
spel, inte sociala nätverk). E-post: supportadressen.

| Fråga (förenklad) | Svar |
| --- | --- |
| Våld, blod, skräck, sexuellt innehåll, svordomar | Nej |
| Hänvisningar till alkohol, tobak eller droger | **Ja – alkohol** (dryck kan loggas i standardglas med neutral fakta; alkohol framställs inte positivt och säljs inte) |
| Spel om pengar, simulerat spel | Nej |
| Kan användare kommunicera eller dela innehåll med varandra i appen? | **Nej** (delning via telefonens delningsmeny räknas inte) |
| Delar appen användarens plats? | Nej |
| Kan användare köpa digitala varor? | **Ja** (licenser via Google Play) |
| Obegränsad webbåtkomst i appen? | Nej |

Åldersgränserna (t.ex. PEGI) räknas fram automatiskt när formuläret skickas.

### Målgrupp och innehåll

*Appinnehåll → Målgrupp och innehåll*: välj **bara 18 år och äldre**. Svara **Nej** på att appen
kan locka barn. (Ägarens beslut 2026-09-28: målgruppen är vuxna.) Appen stämmer med det: den går
bara att använda från 18 år (räknat på födelseåret), och den som fyller 18 i år får inget förslag
om viktnedgång förrän hen säkert har fyllt 18.

### Övriga deklarationer

| Formulär | Svar |
| --- | --- |
| Nyhetsapp | Nej |
| Covid-19-app | Nej |
| Myndighetsapp | Nej – Lagom är fristående |
| Finansiella funktioner | Nej |
| Näringsidkare (DSA) | Ja, se [avsnitt 2](#2-konto-och-avtal) |

## 9. App access – instruktioner till granskarna

*Appinnehåll → Appåtkomst*: välj **Vissa funktioner är begränsade** och lägg till en instruktion.

Skapa först en licensnyckel till granskarna (den privata nyckeln finns bara hos dig – se
docs/BETALNING.md):

```sh
LICENSE_PRIVATE_KEY=… node scripts/issue-license.mjs --plan livstid --id play_granskning
```

Klistra in nyckeln i instruktionen nedan i stället för `<LICENSNYCKEL>`. Lägg aldrig in den i
spärrlistan för återbetalda licenser.

| Fält | Värde |
| --- | --- |
| Namn på instruktionen | `Sample data and full access` |
| Användarnamn / lösenord | Lämna tomt – inget konto behövs |
| Instruktioner | Se texten nedan |

```
No account or login is needed. On the welcome screen, tap 'Utforska med exempeldata' to load two weeks of read-only sample data. All data stays on the device.

To try logging food, tap 'Börja med min egen profil' on the Idag screen and answer a few questions. This creates a profile and starts the 14-day free trial, during which everything is available.

After the trial, viewing, export and deletion always work; only new logging requires a purchase (Google Play Billing: Mer → Lagom Premium, with a Restore purchases button). To test full access without buying, open Inställningar → Licens and paste this licence key, then tap 'Aktivera licensen':
<LICENSNYCKEL>

The app is in Swedish and only available in Sweden. Nutrition values come from the Swedish Food Agency's open database (CC BY 4.0); the app is independent and not affiliated with the agency. The app gives general information and estimates, not medical advice.
```

## 10. Bygga appen med Bubblewrap

Bubblewrap (Googles verktyg) gör ett Android-projekt av webbappens manifest. Det behövs inte i
`package.json` – det körs med `npx`. Första gången laddar Bubblewrap ned Java (JDK 17) och
Android SDK åt dig, så det går bra på Windows, Mac och Linux.

1. **Publicera webbplatsen** först (Netlify) och kontrollera att
   `https://<domän>/manifest.webmanifest` fungerar.
2. **Skapa projektet** i en egen mapp utanför repot (t.ex. `~/lagom-play`):

   ```sh
   npx @bubblewrap/cli@1.25 init --manifest https://<domän>/manifest.webmanifest
   ```

   Svara på frågorna:

   | Fråga | Svar |
   | --- | --- |
   | Domain | `<domän>` |
   | URL path / Start URL | `/?plattform=play` – så känner Lagom igen Play-appen |
   | Application name / Short name | `Lagom – kaloriräknaren` / `Lagom` |
   | Application ID (paketnamn) | T.ex. `se.<dittnamn>.lagom` – **kan inte ändras efter första uppladdningen** |
   | Display mode | `standalone` |
   | Orientation | `portrait` eller `default` – webbappens manifest anger ingen orientering, så välj det som ser bäst ut i skärmdumparna |
   | Status bar color / Splash | `#1F5A43` / `#F6F3EC` |
   | Icon URL | `https://<domän>/icon-512.png`, maskable `https://<domän>/icon-512-maskable.png` |
   | Include support for Play Billing? | **Ja** (lägger till Digital Goods API) |
   | Request geolocation permission? | Nej |
   | Signing key | Låt Bubblewrap skapa `android.keystore` och välj **starka lösenord** – se [avsnitt 12](#12-nycklar-och-säkerhet) |

3. **Bygg:**

   ```sh
   npx @bubblewrap/cli@1.25 build
   ```

   Resultatet är `app-release-bundle.aab` (laddas upp i Play Console) och `app-release-signed.apk`
   (för att testa på en egen telefon).
4. **Versionsnummer:** höj `appVersionCode` (ett heltal som alltid måste öka) och
   `appVersionName` (t.ex. `1.0.0`, samma som `version` i `package.json`) i `twa-manifest.json`
   före varje ny uppladdning, och kör `npx @bubblewrap/cli@1.25 update` följt av `build`.
5. **Ladda upp** `.aab`-filen till spåret för sluten test ([avsnitt 3](#3-sluten-test-med-12-testare-krav-före-produktion)).
   Aktivera **Play App Signing** när Play Console frågar (standard för nya appar).
6. **Webbversionen uppdateras utan ny uppladdning.** Play-appen visar alltid den publicerade
   webbversionen – en ny `.aab` behövs bara när skalet ändras (ikon, namn, paket, behörigheter).

Finns det en nyare 1.x-version av Bubblewrap kan den användas på samma sätt.

## 11. Digital Asset Links (assetlinks.json)

Filen `public/.well-known/assetlinks.json` skapas med skriptet `scripts/generate-assetlinks.mjs`
från paketnamnet och fingeravtrycken för signeringsnycklarna:

1. Hämta fingeravtrycken i *Play Console → Testa och släpp → Appintegritet → Appsignering*:
   - **App signing key certificate** – SHA-256 (Googles nyckel, som signerar appen användarna får)
   - **Upload key certificate** – SHA-256 (din uppladdningsnyckel)
2. Skapa filen (båda fingeravtrycken, kommaseparerade):

   ```sh
   ANDROID_PACKAGE=se.<dittnamn>.lagom \
   ANDROID_SHA256="AA:BB:…(32 par),CC:DD:…(32 par)" \
   node scripts/generate-assetlinks.mjs
   ```

   Skriptet kontrollerar att paketnamnet är en omvänd domän och att varje fingeravtryck är 32
   par hexsiffror med kolon emellan, och säger på svenska vad som är fel. Ett SHA-1-fingeravtryck
   (20 par) känns igen och avvisas.
3. Checka in filen och publicera webbplatsen. Netlify skickar den som `application/json`.
4. Kontrollera:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<domän>&relation=delegate_permission/common.handle_all_urls`
   – svaret ska innehålla ditt paketnamn. Öppna sedan appen: ingen adressrad ska synas överst.

Fingeravtrycken är inte hemliga (de står öppet i filen).

## 12. Nycklar och säkerhet

- **`android.keystore` (uppladdningsnyckeln) och dess lösenord är hemliga.** Med dem kan vem som
  helst ladda upp en falsk version av Lagom. De ska aldrig in i Git – `.gitignore` stoppar
  `*.jks`, `*.keystore` och `android.keystore`.
- **Säkerhetskopiera** nyckelfilen och lösenorden på två ställen: i en lösenordshanterare (t.ex.
  Bitwarden, med filen som bilaga) och på ett krypterat USB-minne som förvaras hemma.
- **Play App Signing:** Google förvarar den nyckel som signerar appen till användarna. Tappar du
  uppladdningsnyckeln kan du be om en ny i *Appintegritet → Appsignering → Begär återställning
  av uppladdningsnyckel* – det tar några dagar, men appen går inte förlorad.
- **Licensnyckelns privata del** (`LICENSE_PRIVATE_KEY`) hanteras lika försiktigt – se
  docs/BETALNING.md.
- Ge aldrig någon annan inloggning till Play Console med ditt konto. Behöver någon hjälpa till:
  bjud in dem som användare med begränsade behörigheter.

## 13. Checklista före produktion

- [ ] Konto verifierat, betalningsprofil klar, DSA-status ifylld, 15 %-nivån aktiverad.
- [ ] Säljaruppgifterna (`VITE_SELLER_*`) och `VITE_SUPPORT_EMAIL` ifyllda – inga platshållare kvar på `/integritet/`, `/villkor/` och `/support/`.
- [ ] `assetlinks.json` publicerad och kontrollerad; ingen adressrad i appen.
- [ ] Sluten test: minst 12 testare i 14 dagar i följd.
- [ ] Butikstexter, ikon, funktionsgrafik och 2–8 skärmdumpar uppladdade.
- [ ] Produkterna `livstid` och `ar` skapade, aktiva och testade med licenstestare.
- [ ] Appinnehåll: integritetspolicy, annonser, annons-id, datasäkerhet, hälsoappar, IARC, målgrupp 18+, appåtkomst med granskarlicens.
- [ ] Länder: bara Sverige.
- [ ] Inga omnämnanden av webbköp eller App Store i appen eller texterna.
- [ ] `android.keystore` och lösenorden säkerhetskopierade på två ställen.
