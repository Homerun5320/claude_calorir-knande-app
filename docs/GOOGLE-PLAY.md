# Lagom i Google Play (Android)

Allt som behövs för att lägga upp Lagom i Google Play: konto, sluten test, butikstexter, grafik,
köp i appen, formulärsvar i Play Console, instruktioner till granskarna och själva appen (en
inbyggd Capacitor 8-app, projektet `android/`). Skrivet för en ägare utan jurist eller revisor.

> **Viktigt:** det här är en arbetsbeskrivning, inte juridisk rådgivning. Googles regler och
> formulär ändras ofta – läs texten i Play Console innan du svarar, och kontrollera skatt och
> moms med Skatteverket (verksamt.se) om du är osäker.

**Så fungerar Play-appen:** den är en inbyggd Android-app byggd med
[Capacitor 8](NATIVE.md) (applicationId `se.lagomappen.lagom`). Hela Lagom ligger i appen – samma
kod som webbversionen, byggd med `VITE_DISTRIBUTION=play` (`npm run build:android`) – så den
fungerar utan uppkoppling och visar aldrig webbpriser eller webbköp. Köp görs med **Google Play
Billing** i appen (`@capgo/native-purchases`). Appen har också inbyggda funktioner: streckkodsläsare,
delning och export via telefonens delningsmeny, lokala påminnelser, en frivillig koppling till
**Health Connect**, en widget på hemskärmen, haptik och Androids bakåtknapp. Allt om projektet, behörigheterna och byggena:
[NATIVE.md](NATIVE.md).

Skillnader mot den tidigare planen med en Trusted Web Activity (TWA/Bubblewrap):

- **Ingen Digital Asset Links-fil behövs** för appen (`assetlinks.json` hörde till TWA:n).
- **Varje ändring kräver en ny uppladdning.** Appen innehåller webbdelen, så en ny webbversion på
  Netlify når inte Play-appen – bygg och ladda upp en ny AAB (avsnitt 10).
- Appen byggs i molnet (GitHub Actions eller Codemagic) och signeras med **uppladdningsnyckeln**
  (avsnitt 11). Android Studio behövs inte, men går att använda om du har en PC (avsnitt 10).

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
10. [Bygga och ladda upp appen](#10-bygga-och-ladda-upp-appen)
11. [Uppladdningsnyckeln och Play App Signing](#11-uppladdningsnyckeln-och-play-app-signing)
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
| Appskal | **Capacitor 8** (inbyggd app, inte TWA). Minst Android 8.0 (API 26). |
| Native-funktioner i v1 | Streckkodsläsare, delning/export, lokala påminnelser, Health Connect (frivilligt), haptik, bakåtknappen. |
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
   gruppen/listan, välj Sverige och ladda upp appen (`.aab`, se [avsnitt 10](#10-bygga-och-ladda-upp-appen)).
   Tips: börja med spåret **Intern testning** (upp till 100 testare, ingen granskning) för dig
   själv – molnbygget laddar upp dit – och flytta sedan samma version till den slutna testen
   (*Intern testning → versionen → Flytta upp → Sluten testning*).
4. **Skicka anmälningslänken** (*Anmäl dig till testet*) till alla. Be dem:
   - gå med via länken och installera appen från Play Butik,
   - **inte lämna testet** under de 14 dagarna,
   - öppna appen några gånger i veckan och gärna prova exempeldata, en egen profil, sökning,
     streckkodsläsaren och – om de vill – påminnelser och Health Connect.
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

Paketnamnet anges inte här – det kommer från den första AAB:n (`se.lagomappen.lagom`, se
[NATIVE.md §1](NATIVE.md#1-att-bekräfta-innan-första-uppladdningen)) och kan **aldrig** ändras
efteråt. Bekräfta det innan du laddar upp.

Under *Testa och släpp* → *Produktion* → *Länder/regioner*: välj **bara Sverige** (gör samma sak
för spåret för sluten test).

## 5. Butikstexter

*Play Console → Väx → Butiksnärvaro → Huvudbutiksinformation*

Reglerna (Googles policy för metadata): inga rankingord ("bäst", "nr 1", "gratis") i appnamn,
ikon och kort beskrivning – i den fullständiga beskrivningen står provperioden som "14 dagar utan
kostnad" – inga emoji eller versaler för att sticka ut, inga omdömen från användare, inga myndighetslogotyper och
ingen antydan om att Lagom är kopplad till Livsmedelsverket. Nämn inte webbköp eller andra butiker.
Dessutom (samma som för App Store):

- Inga andra plattformar: inte iPhone, Apple, App Store eller Apple Hälsa – och inte webbversionen.
- Bara det som finns i Play-appen. **Röstsökningen finns inte i apparna** och nämns aldrig.
  "Fyll i från förpackningen" beskrivs med telefonens egen textigenkänning eller inklistrad text.
- Allergier: säg aldrig "säker", "fri från" eller "innehåller inte" – bara att Lagom visar vad Open
  Food Facts anger, med källan, och att förpackningen alltid ska läsas.
- Tonen från CLAUDE.md: varm och utan skuld – inga dagar i rad, inga röda varningar.
- Appnamn högst 30 tecken, kort beskrivning högst 80, fullständig beskrivning högst 4 000 och
  versionsinformationen högst 500 tecken. `src/native/storeBuilds.test.ts` läser kodblocken under
  rubrikerna nedan och kontrollerar gränserna och orden – byt inte namn på rubrikerna utan att
  ändra testet.

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
• Sök bland svenska vardagslivsmedel
• Ange mängden som du är van vid: gram, dl, msk, tsk, krm eller portioner (en skiva, en kopp)
• Kött, fisk, pasta och ris anges tillagade – ange vikten rå eller okokt, så räknar Lagom om
• Skanna streckkoden för att hitta produkten
• Saknas en vara? Fyll i från förpackningen med telefonens textigenkänning eller inklistrad text – du granskar innan du sparar
• Spara måltider du äter ofta och lägg in dem med ett tryck
• Widget på hemskärmen om du vill – dagens energi, måltider, vatten och en pågående fasta

NÄRING OCH MÅL
• Dagsringen visar energi, protein, kolhydrater, fett och fibrer mot ditt dagsmål
• Veckobudget om du vill: samma energi över veckan, med lite extra till fredagsmyset eller helgen – kalorigolvet gäller varje dag
• Vitaminer och mineraler jämförs med Nordiska näringsrekommendationer (NNR 2023)
• Livsmedelsverkets kostråd och Tallriksmodellen, förklarade enkelt
• Allergiprofil: markera det du inte tål, så visar Lagom vad Open Food Facts anger om allergener och spår i produkten, med källan – läs alltid förpackningen
• Vatten, träning, steg och vikt på samma ställe
• Fasta om du vill – en enkel timer för 12:12 till 20:4, utan poäng eller serier
• Koppla till Health Connect om du vill: hämta vikt och steg, och spara energi, vatten och vikt
• Påminnelser om måltider och vatten om du vill – lokala notiser

RECEPT, PLANERING OCH INSIKTER
• Svenska klassiker och dina egna recept, med näring per portion
• Hämta recept från en webbadress
• Dela dina recept och sparade måltider som länk eller fil
• Planera veckans måltider och få en inköpslista
• Insikter för veckan, 30 och 90 dagar – bara dagar du har loggat räknas
• Vikt och mått med en lugn trendlinje i stället för dagliga svängningar
• Framstegsbilder om du vill – avstängda från början, sparas bara i telefonen och följer inte med i säkerhetskopian

LUGNT OCH UTAN SKULD
Lagom dömer inte. Går du över målet en dag står det "helt okej, det jämnar ut sig över veckan" – inga röda varningar. Milstolparna firar att du är igång, aldrig dagar i rad, vikt eller kalorier. Appen räknar med ett kalorigolv och föreslår aldrig viktnedgång under graviditet eller amning – då används inte heller veckobudgeten. Fasta rekommenderas inte vid graviditet, amning, under 18 år, ätstörning eller diabetes med blodsockersänkande läkemedel – prata med vården först. Är du orolig för din relation till mat finns hjälp hos 1177 och Frisk & Fri.

DIN DATA STANNAR HOS DIG
• Inget konto och ingen inloggning
• Dagboken sparas bara på din telefon – ingen reklam och ingen spårning
• Uppgifter från Health Connect läses och sparas bara i telefonen
• Exportera allt du har loggat när du vill, eller radera allt med ett par tryck
• Sökord och streckkoder skickas till Open Food Facts för att hitta produkter – utan ditt namn, din e-post eller din dagbok

PRIS
14 dagar utan kostnad, sedan årslicens eller livstidslicens som köp i appen via Google Play, utan automatisk förnyelse. Priserna visas i Google Play innan du köper. Provperioden startar först när du skapar din profil. När provperioden är slut kan du fortfarande se, exportera och radera allt du har loggat.

KÄLLOR
Lagom är en fristående app och är inte kopplad till Livsmedelsverket; de flesta näringsvärdena kommer från Livsmedelsverkets öppna livsmedelsdatabas (CC BY 4.0), övriga är samlingsvärden för vanliga märken och värden från förpackningar. Källa: https://soknaringsinnehall.livsmedelsverket.se. Produktuppgifter från streckkoder kommer från Open Food Facts (ODbL). Rekommendationerna bygger på Nordiska näringsrekommendationer 2023 och Livsmedelsverkets kostråd.

Lagom ger allmän information och uppskattningar – inte medicinsk rådgivning. Har du en sjukdom, är gravid eller har frågor om din hälsa: prata med vården.
```

(3 992 tecken med radbrytningar.) Beskriv aldrig en funktion som inte finns i det bygge du laddar upp –
veckoplaneringen, receptimporten, påminnelserna, Health Connect och widgeten ska finnas i version 1.0,
men kontrollera i den version du laddar upp (Inställningar → Påminnelser, Inställningar → Health
Connect och hemskärmens lista över widgetar, där den heter **Idag** under Lagom). Saknas någon: ta
bort raden – och motsvarande ord i versionsinformationen. Googles policy för
appar med information från myndigheter kräver att källan anges (gärna med adress) – det gör raden
"Källa:" ovan.

Veckobudgeten (Inställningar → Mål och makron), allergiprofilen (Inställningar → Allergier och
överkänslighet), delade recept och måltider, framstegsbilderna (Vikt & mått), "Fyll i från
förpackningen" (formuläret för eget livsmedel och skanningen) och milstolparna (Mer → Milstolpar)
finns i Play-bygget (kontrollerat 2026-09-29 med `VITE_DISTRIBUTION=play`). Delning som länk kräver
webbplatsens adress (`VITE_API_BASE`), som byggkontrollen redan kräver i butiksbyggen; utan den går
det bara att dela som fil. Röstsökningen är webbens och finns inte i appen – den står därför inte i
texterna.

Widgeten på hemskärmen är Android-appens egen kod (det lokala tillägget `LagomWidget` i
`android/app/src/main/java/se/lagomappen/lagom/widget/`, registrerat i `MainActivity`, se
[WIDGET.md](WIDGET.md)) och finns bara i Play-appen. Den lägger inte till några behörigheter eller
beroenden, och inget lämnar telefonen – Data safety är därför oförändrad. Raden säger bara det
widgeten visar: energin (inga siffror i medvetet läge), antal måltider, vatten och en pågående
fasta – aldrig exempeldata. Den byggs i molnbygget men kan bara provas på en riktig telefon
([WIDGET.md §7](WIDGET.md#7-testa-på-en-telefon)) – gör det innan raden följer med till produktion.

Fastan (Mer → Fasta, en enkel timer för 12:12 till 20:4) finns i alla byggen – ingen byggkonstant
styr sidan (kontrollerat 2026-10-03 i `src/App.tsx` och `features/more/MorePage.tsx`). Raden i
beskrivningen är medvetet kort och utan hälsopåståenden: inget om viktnedgång, fettförbränning eller
effekt på kroppen och inget beröm – bara att den är valfri och utan poäng eller serier. Meningen om
vem fastan inte rekommenderas för (graviditet, amning, under 18 år, ätstörning, diabetes med
blodsockersänkande läkemedel) står i stycket "Lugnt och utan skuld", tillsammans med 1177 och
Frisk & Fri och förbehållet sist i texten ("prata med vården"). Den ska stå kvar så länge raden
finns, och orden ska stämma med sidan Fasta i appen och med supportsidans avsnitt "Hur fungerar
fastan?" (`public/support/index.html`). Skriv aldrig "bränner fett", "autofagi", "detox" eller
"snabbare viktnedgång" i butikstexterna. Fastan kräver ingen ny behörighet och ingen ny uppgift i
Data safety – den sparas bara i telefonen, som resten av dagboken.

### Versionsinformation (högst 500 tecken)

*Play Console → Testa och släpp → Produktion → Skapa ny version → Versionsinformation.* Texten står
mellan språktaggarna `<sv-SE>` och `</sv-SE>` i rutan. För de första testversionerna räcker en
kort rad (avsnitt 10); den här texten gäller version 1.0 i produktion.

```
Välkommen till Lagom! Den första versionen innehåller matdagbok med Livsmedelsverkets näringsvärden och svenska mått, streckkodsläsare och "Fyll i från förpackningen", recept att dela som länk eller fil, veckoplanering och veckobudget, allergiprofil, insikter, milstolpar, vikt och mått, vatten, träning och fasta – och om du vill framstegsbilder, påminnelser, en widget på hemskärmen och koppling till Health Connect. Hittar du något som inte fungerar? Skriv till oss via Om Lagom → Felsökning.
```

(495 tecken.)

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
# 1. Butiksbygget för Play (samma miljövariabler som i NATIVE.md §3 – säljaruppgifterna krävs):
VITE_DISTRIBUTION=play VITE_API_BASE=https://<domän> npx vite build     # → dist-native/
# 2. Ta bilderna:
node scripts/app-store-screenshots.mjs --dist=dist-native --only=play   # → store-assets/screenshots/play/{ljust,morkt}/
```

- Ta bilderna från butiksbygget (`dist-native/`), inte från webbygget – då visar de det som syns
  i Play-appen (inga webbpriser eller tips om hemskärmen). Skriptet lägger till `?plattform=play`
  (från tiden med TWA); det ändrar inget i butiksbygget.
- Inbyggda vyer (streckkodsläsarens helskärm, Health Connects behörighetsfråga, notiser) syns inte
  i webbläsaren. Vill du visa dem: ta en skärmdump på en Android-telefon med testbygget (1 080 ×
  1 920 px eller större, 9:16) – redigera den inte.
- Widgeten på hemskärmen syns bara på en telefon, och den visar **aldrig exempeldata** ("Widgeten
  visar inte exempeldata"). Vill du visa den: skapa en egen testprofil i testbygget, logga några
  påhittade måltider och ta skärmdumpen på hemskärmen – med en neutral bakgrund och utan andra
  appars ikoner eller notiser i bild.
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

Köpen görs **i appen med Google Play Billing** (Play Billing Library 9.1 via
`@capgo/native-purchases`, koden i `src/native/purchases.ts`) – direkt mellan telefonen och Google
Play, utan egen server och utan konto hos någon tredje part. Google kräver Play Billing Library 8
eller senare för nya appar sedan 2026-08-31; 9.1 uppfyller det.

Innan produkter kan skapas måste betalningsprofilen vara klar ([avsnitt 2](#2-konto-och-avtal))
och en AAB med behörigheten `com.android.vending.BILLING` vara uppladdad till något spår – ladda
upp den första versionen till intern testning först ([avsnitt 10](#10-bygga-och-ladda-upp-appen)).

*Play Console → Tjäna pengar med Play → Produkter → Engångsprodukter → Skapa engångsprodukt*

Produkt-id:na måste vara exakt desamma som i `src/lib/storePurchases.ts`:

| Produkt | Produkt-id | Typ i Play Console | Köpalternativ | Pris |
| --- | --- | --- | --- | --- |
| Livstidslicens | `livstid` | **Engångsprodukt** | Köp (*Buy*), id t.ex. `kop` | 699 kr |
| Årslicens | `ar` | **Engångsprodukt** (inte prenumeration) | Köp (*Buy*), id t.ex. `kop` | 349 kr |

För varje produkt:

1. Namn: `Livstidslicens` respektive `Årslicens`. Beskrivning: `Allt i Lagom. För alltid –
   felrättningar ingår.` respektive `Allt i Lagom i ett år. Förnyas inte automatiskt.`
2. Köpalternativ: typen **Köp** (inte Hyra). Pris i svenska kronor inklusive moms – 349 kr
   respektive 699 kr – och tillgänglighet **bara Sverige**.
3. **Aktivera** både produkten och köpalternativet. Inaktiva produkter syns inte i appen (där står
   då att köp inte är tillgängliga just nu).

Så beter sig appen:

- **Årslicensen är en engångsprodukt, inte en prenumeration** – Lagom lovar "utan automatisk
  förnyelse". Appen räknar 365 dagar från köpdatumet (Google har inget slutdatum för
  engångsprodukter). Köpet kvitteras men förbrukas inte medan året gäller, så det syns i
  Play-kontot och *Återställ köp* fungerar på en ny telefon. Köper någon ett nytt år efter att det
  gamla har gått ut förbrukar appen först det gamla köpet – annars svarar Play "Du äger redan den
  här produkten".
- **Livstidslicensen** kvitteras och förbrukas aldrig. Årslicensen döljs när livstid redan är köpt.
- **Kvittering:** ett köp som inte kvitteras (*acknowledge*) inom 3 dagar återbetalas automatiskt av
  Google. Appen kvitterar direkt efter köpet och varje gång köpen hämtas (vid start, när appen
  öppnas igen och vid *Återställ köp*) – även ett väntande köp som blev klart senare.
- **Återbetalning:** återbetala och återkalla i *Play Console → Beställningshantering*. Köpet
  försvinner då ur telefonens köp och licensen slutar gälla nästa gång appen hämtar köpen. Googles
  Voided Purchases API behövs inte – se [Återbetalningar och återkallade köp](#återbetalningar-och-återkallade-köp).
- **Priserna i appen kommer från Google Play** (lokaliserat, t.ex. "349,00 kr") – inga kronbelopp
  är inskrivna i appbygget.
- Någon produkt för provperioden behövs inte i Google Play – de 14 dagarna räknas i appen
  (`prov14` finns bara i App Store).
- Licensnycklar från webbköp kan aktiveras i Play-appen (Inställningar → Licens), men appen
  hänvisar aldrig till webbköpet.

### Återbetalningar och återkallade köp

**Slutsats (utredd 2026-09-29): Lagom behöver inte Googles Voided Purchases API** – varken för
köpen i Play-appen eller för licensnycklarna från webben. Ingen server och ingen ny kod behövs för
återbetalningar i Google Play. Det gäller också när du återbetalar *utan* att ta bort rätten: då
ska kunden behålla licensen, och ett sådant köp räknas inte ens som återkallat (se nedan).

| Händelse | Vad Google Play gör med köpet | Vad som händer i Lagom |
| --- | --- | --- |
| Du återbetalar i *Beställningshantering* **och tar bort rätten** (valet att återkalla köpet i återbetalningsrutan) | Köpet blir återkallat (*voided*) och ägs inte längre av kunden | Köpet saknas nästa gång appen hämtar köpen – licensen slutar gälla |
| Google återbetalar (t.ex. kundens återbetalningsbegäran i Google Play) eller kunden får pengarna tillbaka via banken (*chargeback*) | Köpet blir återkallat (*voided*) | Samma som ovan |
| Du återbetalar **utan** att ta bort rätten (t.ex. av goodwill) | Köpet ägs fortfarande och är betalt (`PURCHASED`) – det räknas inte som återkallat | Licensen gäller – det är vad valet betyder |

Därför behövs API:et inte:

1. **Telefonen frågar Google Play själv.** Köpen hämtas med Play Billing (`getPurchases` i
   `@capgo/native-purchases`, som anropar `BillingClient.queryPurchasesAsync`, se
   `src/native/purchases.ts`). Enligt Googles referens ger den bara *"currently owned items"* –
   *"Only active subscriptions and non-consumed one-time purchases are returned"*. Ett återkallat
   köp ägs inte längre och finns alltså inte med. Googles testguide bekräftar samma sak från andra
   hållet: för att kunna testköpa en engångsprodukt igen *"you can refund and revoke purchases
   using Google Play Console"*. Lagom ger bara tillgång för köp i läget `PURCHASED`.
2. **Den sparade rätten ersätts varje gång Play svarar.** Appen hämtar köpen vid start, när den
   återfår fokus, en gång i timmen medan den är öppen och vid *Återställ köp*. Den senast kända
   listan i telefonen (`lagom-butikskop` i localStorage, `STORE_CACHE_KEY` i
   `src/hooks/useAccess.ts`) skrivs över med Plays svar – ett återkallat köp försvinner då även
   därifrån. Går Play inte att nå (t.ex. utan uppkoppling) gäller den sparade listan tills nästa
   svar, och appen försöker igen efter 15 s, 1 min och 5 min. Tillägget avvisar anropet i stället
   för att ge en tom lista när Play svarar med fel, så ett tillfälligt fel tar aldrig bort en
   betald licens.
3. **Voided Purchases API är ett server-API** (Google Play Developer API med ett tjänstekonto) för
   appar som håller rätten i en egen databas eller säljer förbrukningsvaror, t.ex. spelvaluta som
   ska tas tillbaka (*claw back*). Lagom har inga konton, ingen databas över köp och inga
   förbrukningsvaror – årslicensen `ar` förbrukas först när den har gått ut och ett nytt år köps.
   En server når inte heller en telefon som är offline, så API:et skulle inte täppa till den enda
   luckan (en telefon som aldrig kopplar upp sig behåller den sparade rätten – samma avvägning som
   spärrlistan för webbens nycklar, se docs/BETALNING.md, *Begränsningar*). Det skulle däremot
   kräva en server, ett tjänstekonto med tillgång till Play Console och att köpens tokens skickas
   dit – med nya uppgifter i Data safety (*Köphistorik*) och integritetspolicyn.
4. **Återbetalning utan att ta bort rätten syns inte i API:et heller.** Google räknar en
   återbetalning från utvecklaren som återkallad (*voided*) bara när man väljer att återkalla köpet
   i Play Console (*"cancels or refunds a user order and checks the 'revoke' option in the
   console"*, *Fight fraud and abuse*). API:et skulle alltså inte ha något att rapportera, och
   kunden ska ändå behålla licensen.

**Webbens licensnycklar påverkas inte.** De köps med Stripe och spärras vid full återbetalning eller
tvist via spärrlistan (`/api/license-revocations`, se docs/BETALNING.md, *Återbetalda köp och
spärrlistan*). Ett köp i Google Play ger aldrig någon licensnyckel, och en återbetalning i Play
påverkar aldrig en nyckel – en nyckel som har aktiverats i Play-appen kontrolleras mot spärrlistan
precis som på webben. Granskarnas nyckel ([avsnitt 9](#9-app-access--instruktioner-till-granskarna))
påverkas inte heller.

**Återkrav (chargeback) som Google vill ha synpunkter på:** Google kan skicka en
`PendingRefundReviewNotification` (realtidsnotis, RTDN) och låta utvecklaren svara inom 24 timmar
med ReviewRefund API. Det kräver en server med RTDN (Google Cloud Pub/Sub) och Play Developer API –
Lagom använder det inte, och då avgör Google utan Lagoms synpunkter. Det är frivilligt.

**Då behövs API:et (och RTDN):** om Lagom någon gång håller Play-köp på en server – t.ex. licenser
som knyts till ett konto i Lagom Moln eller delas mellan iPhone, Android och webben – eller börjar
sälja förbrukningsvaror. Då ska servern prenumerera på RTDN för återkallade köp och stämma av med
Voided Purchases API, och Data safety och integritetspolicyn uppdateras före inskickningen.

> **Källor och reservation:** developer.android.com gick att nå 2026-09-29: *Integrate the Google
> Play Billing Library*, *One-time purchase lifecycle*, *Fight fraud and abuse* (avsnittet *Detect
> and handle voided purchases*), *Test your Google Play Billing Library integration* och referensen
> för `BillingClient.queryPurchasesAsync`. Referensen för Voided Purchases API
> (developers.google.com) och Play Console-hjälpen (support.google.com) gick **inte** att nå från
> byggmiljön. Vad kryssrutan heter i återbetalningsrutan och exakt hur fort ett återkallat köp
> försvinner från telefonen (Play Butik har en egen cache) ska därför kontrolleras med
> licenstestare före produktion – se steg 4 nedan.

### Testa köpen med licenstestare

1. *Play Console → Konfigurera → Licenstestning*: lägg till din Gmail-adress (och testarnas om de
   ska kunna köpa) och välj svaret **RESPOND_NORMALLY**.
2. Samma konton måste vara testare på ett testspår (intern testning räcker) och ha installerat
   appen från Play Butik via testlänken – en APK som installerats på annat sätt kan inte köpa.
3. Köprutan visar då att det är en testbeställning utan debitering, med testkorten *Test card,
   always approves* och *Test card, always declines* (och kort som godkänns eller nekas efter en
   stund – bra för väntande köp).
4. Prova: köp `ar`, köp `livstid`, avbryt ett köp, ett nekat kort, ett väntande köp som blir klart
   när appen är stängd, *Återställ köp* efter att appen har avinstallerats, och återbetalningar.
   Kontrollera i *Beställningshantering* att köpen är kvitterade. Återbetalningarna
   ([Återbetalningar och återkallade köp](#återbetalningar-och-återkallade-köp)):
   - Återbetala ett köp **och ta bort rätten**. Stäng Lagom helt och öppna appen igen (eller tryck
     *Återställ köp*): licensen ska vara borta och all data finnas kvar. Anteckna hur lång tid det
     tog innan köpet försvann.
   - Återbetala ett annat köp **utan** att ta bort rätten: licensen ska gälla som förut.
   - Valfritt: köp med testkortet *Test card, approves then charges back* (simulerat återkrav). När
     Google har avgjort återkravet ska licensen försvinna på samma sätt.
5. `NATIVE_PURCHASES_READY` i `src/lib/storePurchases.ts` är satt till true men räknas som klar
   först när det här fungerar på en riktig telefon. Fungerar något inte: sätt den till false och
   bygg om, så stoppar byggkontrollen butiksbyggena tills det är rättat.

## 8. Appinnehåll – formulären i Play Console

*Play Console → Policy → Appinnehåll*. Svara så här:

### Integritetspolicy

`https://<domän>/integritet/`

### Annonser

**Nej**, appen innehåller inga annonser.

### Annons-id (Advertising ID)

**Nej**, appen använder inte annons-id. Varken Capacitor, Play Billing, Health Connect eller
streckkodsläsaren lägger till behörigheten `com.google.android.gms.permission.AD_ID`. Kontrollera
efter första uppladdningen: *Testa och släpp → Appsamling (App bundle explorer) → versionen →
Behörigheter* – där ska bara behörigheterna i [NATIVE.md §6](NATIVE.md#behörigheter) finnas
(internet, kamera, notiser, start efter omstart, vibration, köp i appen och de fem
Health Connect-behörigheterna: vikt läsa och skriva, steg läsa, näring och vatten skriva).

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
| Foton/kamera | **Inte insamlat** – kamerabilden tolkas i telefonen (ZXing) för streckkoder och sparas eller skickas inte. Framstegsbilder (frivilliga) sparas nedskalade och utan platsuppgifter bara i appens mapp på telefonen och lämnar den aldrig (undantagna från Googles molnkopia). Kameraappens tillfälliga originalbild tas bort direkt efter nedskalningen, och annars vid nästa start av appen. (Se också rutan om ML Kit nedan.) |
| Health Connect (vikt, steg, näring, vatten) | **Inte insamlat** – läses och skrivs bara i telefonen och lämnar den aldrig. Data som bara behandlas på enheten räknas inte som insamling. Kopplingen ska ändå beskrivas i integritetspolicyn (Health Connect-kravet). |
| Påminnelser | **Inte insamlat** – lokala notiser som skapas i telefonen, ingen pushtjänst. |
| Widgeten på hemskärmen | **Inte insamlat** – appen sparar en färdig sammanfattning (energi, antal måltider, vatten, fasta; inga livsmedel) i sina egna SharedPreferences (`lagom-widget`, undantagna från Googles molnkopia), och hemskärmen ritar den på telefonen. Inget skickas någonstans, ingen behörighet behövs, och widgeten läggs bara till om användaren själv vill. |
| Köp i appen | **Inte insamlat** av Lagom – köpet går direkt mellan telefonen och Google Play (`@capgo/native-purchases` gör inga egna nätanrop). |
| Export och delning | **Inte insamlat** – filen går bara dit användaren själv väljer i delningsmenyn. Det gäller även delade recept och sparade måltider (länk eller fil) – receptet ligger i länken efter # och når aldrig Lagoms server. |
| Säkerhetsgranskning (MASA) | Nej (valfri) |

> **Streckkodsläsaren på Android och Google ML Kit – beslutat: ZXing.** Bilden tolkas i
> telefonen och lämnar den aldrig. Men enligt Googles egen redovisning (*ML Kit – Prepare for
> Google Play's data disclosure requirements*, developers.google.com/ml-kit/android-data-disclosure)
> skickar ML Kit driftdata till Google: uppgifter om enheten och appen, identifierare,
> prestandamått, API-inställningar, händelsetyper och felkoder – krypterat, inte delat med tredje
> part, för diagnostik och analys av ML Kit. Det räknas som insamling i Data safety och passar
> dåligt med Lagoms princip om inga analysverktyg (CLAUDE.md). Välj en väg:
>
> 1. **Rekommenderat: ZXing som läsare på Android.** Tillägget har ZXing inbyggt; det läser EAN-
>    och UPC-koder utan att skicka något. **Så är det nu:** `src/native/barcode.ts` läser med
>    ZXing (`ANDROID_SCANNING_LIBRARY`), och svaren ovan gäller som de står. ML Kits bibliotek
>    följer ändå med tillägget, men dess `MlKitInitProvider` (som annars startar ML Kit när appen
>    startar) tas bort i `AndroidManifest.xml` med `tools:node="remove"`. Kontrollera i
>    Play-testningen (t.ex. med en nätverkslogg) att inget går till `firebaselogging`/
>    `datatransport`. Testa läsaren i svagt ljus på en riktig telefon.
> 2. **Behåll ML Kit:** ta bort raden med `MlKitInitProvider` i `AndroidManifest.xml`, läs Googles aktuella lista och ange det den säger, i dag troligen
>    *Appinfo och prestanda → Diagnostik* och *Enhets-id eller andra id:n* (insamlade, inte delade,
>    syfte *Analys*). Lägg också till Google (ML Kit) i integritetspolicyn och
>    registerförteckningen, och bedöm om identifieraren kräver samtycke (LEK 9 kap. 28 §) – före
>    inskickningen.
>
> På iPhone används Apples Vision, som inte skickar något.

### Hälsoappar och Health Connect (Health apps)

*Appinnehåll → Hälsoappar*. Formuläret krävs för varje version som använder Health Connect, och
Google granskar det innan appen (eller en ändrad lista över datatyper) godkänns – räkna med några
dagar. Godkännandet gäller paketnamnet, inte en viss version.

1. **Hälsofunktioner** – kryssa i:
   - **Nutrition and weight management** (Kost och viktkontroll)
   - **Activity and fitness** (Aktivitet och träning)

   Kryssa **inte** i något under *Medical* (medicinteknik, sjukdomar, mediciner, graviditet) eller
   *Human subjects research*. Svara **Nej** på frågan om appen är en medicinteknisk produkt (se
   docs/AVSETT-ANDAMAL.md).
2. **Health Connect-datatyper** – deklarera exakt de fem behörigheter som finns i
   `android/app/src/main/AndroidManifest.xml`, inga fler (aktiv energi läses inte – tillägget
   deklarerar `READ_ACTIVE_CALORIES_BURNED`, men den tas bort i manifestet med
   `tools:node="remove"`). Motiveringen skrivs på engelska
   (granskarna), en per behörighet:

   | Behörighet | Läsa/skriva | Motivering att klistra in |
   | --- | --- | --- |
   | `READ_WEIGHT` | Läsa | `Optional and off by default. When the user turns it on, new weight measurements (for example from a smart scale) are shown in Lagom's weight chart, so the user does not have to enter them twice. One value per day; values stay on the device.` |
   | `WRITE_WEIGHT` | Skriva | `Optional. Saves weights that the user logs in Lagom to Health Connect, so other health apps the user chooses can use them.` |
   | `READ_STEPS` | Läsa | `Optional. Fills in the step count for today and the previous six days in the activity part of Lagom's food diary, so the user does not have to enter it by hand. Values stay on the device.` |
   | `WRITE_NUTRITION` | Skriva | `Optional. Saves the energy (kcal) of meals the user logs in Lagom's food diary to Health Connect once the day is finished, so the user's other health apps can show it.` |
   | `WRITE_HYDRATION` | Skriva | `Optional. Saves the water the user logs in Lagom to Health Connect once the day is finished.` |

3. **Integritetspolicyn** i formuläret är webbplatsens adress (`https://<domän>/integritet/`, eller
   Android-versionen `https://<domän>/integritet/android/`). Inne i appen visar Health Connect
   samma text från appens eget paket (`privacypolicy.html`, skapad ur `legalContent.ts` av
   Google Play-bygget; `npm run build:android` pekar ut den via `scripts/native-config.mjs`) –
   utan uppkoppling och utan länkar vidare till webbplatsens villkor med webbpriser. Den ska beskriva kopplingen: vilka datatyper, att de bara läses och
   skrivs i telefonen, att inget skickas till Lagom eller någon annan, och hur man stänger av den
   (Inställningar → Health Connect i Lagom, eller i Health Connect).
4. **Ändras datatyperna** (i `src/native/health.ts`): ändra manifestet, Info.plist-texterna,
   integritetspolicyn och det här formuläret i samma version.

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

After the trial, viewing, export and deletion always work; only new logging requires a purchase (Google Play Billing: Mer → Lagom Premium, with a Restore purchases button; one-time products 'livstid' and 'ar', the annual licence lasts 365 days and does not renew). To test full access without buying, open Inställningar → Licens and paste this licence key, then tap 'Aktivera licensen':
<LICENSNYCKEL>

Optional features, all off by default: Health Connect (Inställningar → Health Connect) reads weight and steps and writes weight, dietary energy and water (energy and water for finished days); data stays on the device. Reminders (Inställningar → Påminnelser) are local notifications. The camera is only used to scan barcodes; no images are stored or sent.

Fasting (Mer → Fasta, optional): a simple timer for 12:12 to 20:4 with a history. It has no scores, streaks or health claims and does not change the daily goal. The page says who fasting is not recommended for (pregnancy or breastfeeding, under 18, diabetes treated with blood-sugar-lowering medicine, a current or past eating disorder), tells users to talk to their healthcare provider (1177) first and links to support (Frisk & Fri, 1177). For users who are pregnant, breastfeeding or under 18 the start button is replaced by a caution message until they choose to show the timer. Fasts are stored only on the device.

Home screen widget (optional): long-press the home screen, choose Widgets and add 'Idag' under Lagom. It shows today's remaining energy, logged meals and water (and an ongoing fast), and opens the app ('Lägg till' opens the add-food screen). It never shows sample data, so create a profile first to see numbers. The summary is stored only on the device.

The app is in Swedish and only available in Sweden. Nutrition values come from the Swedish Food Agency's open database (CC BY 4.0); the app is independent and not affiliated with the agency. The app gives general information and estimates, not medical advice.
```

## 10. Bygga och ladda upp appen

Appen byggs i molnet – ingen egen Android-miljö behövs. Allt om projektet och byggena:
[NATIVE.md](NATIVE.md) (§3 byggkommandon, §9 molnbyggena, §10 steg för steg).

### Molnbygget (rekommenderat)

- **GitHub Actions** (`.github/workflows/release.yml`, jobbet *Android*): körs när du taggar en
  version (`git tag v1.0.0 && git push origin v1.0.0`) eller för hand (*Actions → Butiksbyggen →
  Run workflow*). Det bygger webbdelen skarpt (`VITE_DISTRIBUTION=play`, dina säljaruppgifter,
  `VITE_COMMERCE_MODE=live`), en **signerad AAB** med uppladdningsnyckeln, kontrollerar
  signaturen och 16 KB-sidorna, sparar AAB:n som artefakt (30 dagar) och laddar – om
  tjänstekontot finns – upp den till **intern testning**. Körs på Linux: kostar bara vanliga
  minuter.
- **Codemagic** (`codemagic.yaml`, arbetsflödet `android-play`): samma steg på Codemagics Mac,
  startas för hand. Använd en tjänst för Android, inte båda.

### Första uppladdningen görs för hand

Google Plays API kan inte skapa den första versionen av en app. Första gången:

1. Kör molnbygget utan tjänstekonto (eller med – uppladdningen misslyckas då med "Package not
   found", det gör inget). Hämta AAB:n under körningens *Artifacts* (`lagom-android-<version>-<nr>`,
   packa upp zip-filen).
2. *Play Console → Lagom → Testa och släpp → Testning → Intern testning → Skapa ny version*.
3. Play Console frågar om **Play App Signing** – godkänn standardvalet (Google skapar och förvarar
   appens signeringsnyckel). Din uppladdningsnyckel registreras med den första AAB:n
   ([avsnitt 11](#11-uppladdningsnyckeln-och-play-app-signing)).
4. Ladda upp AAB:n, skriv en kort versionsnotering ("Första testversionen") och **släpp** versionen
   till intern testning (ingen granskning, klar inom några minuter).
5. Därefter laddar molnbygget upp nya versioner själv. Svarar Play "Only releases with status
   draft may be created on draft app": sätt Variablen `PLAY_RELEASE_STATUS` till `draft` i GitHub
   (eller `submit_as_draft: true` i `codemagic.yaml`) och släpp utkasten i Play Console tills
   appen har släppts på något spår.

### Versionsnummer

- **versionName** (t.ex. `1.0.0`, visas för användarna) = `version` i `package.json` – samma i
  iPhone-appen och Om Lagom. Höj den före en ny version och tagga `v<version>`.
- **versionCode** (heltal som måste öka för varje uppladdning) = körningens nummer i GitHub Actions
  (plus Variablen `LAGOM_BUILD_NUMBER_OFFSET`) eller Google Plays senaste + 1 i Codemagic. Byter du
  tjänst: sätt `LAGOM_BUILD_NUMBER_OFFSET` så att numret blir högre än det senaste i Play Console.

### Flytta vidare

Intern testning → **Sluten testning** (de 12 testarna, [avsnitt 3](#3-sluten-test-med-12-testare-krav-före-produktion))
→ efter godkänd ansökan **Produktion**: *versionen → Flytta upp*, eller skapa en ny version i
spåret och välj AAB:n från biblioteket. Den slutna testen och produktion granskas av Google.

### Med Android Studio (om du har en PC)

Går att använda för att provköra appen i en emulator eller på din telefon med USB-kabel – se
[NATIVE.md §10](NATIVE.md#android-studio-på-en-pc-valfritt). Butiksbyggena görs ändå i molnet, så
att uppladdningsnyckeln inte behöver ligga på datorn.

### Testbygget utan Play

Kontrollbygget (`.github/workflows/native.yml`) sparar en **debug-APK** (`lagom-android-testbygge`)
som kan installeras direkt på en Android-telefon (tillåt installation från okända källor för
filhanteraren). Den är osignerad för butiken, kan inte köpa något och får aldrig delas ut – använd
den bara för att snabbt prova en ändring.

## 11. Uppladdningsnyckeln och Play App Signing

Med **Play App Signing** förvarar Google den nyckel som signerar appen till användarna. Du signerar
bara uppladdningen med din **uppladdningsnyckel**. Tappar du den kan den bytas (appen går inte
förlorad), men den ska ändå hanteras som en hemlighet.

### Skapa uppladdningsnyckeln (en gång)

Skapa nycklarna i en egen mapp **utanför** repot (t.ex. `Dokument/lagom-nycklar`), så att de aldrig
kan hamna i Git. Du behöver `keytool`, som följer med Java (Android Studio har det i
`…\Android Studio\jbr\bin\keytool.exe`; annars installera Temurin JDK 21 från adoptium.net). I
Git Bash, PowerShell eller Terminal:

```sh
keytool -genkeypair -v -keystore lagom-upload.jks -storetype PKCS12 \
  -keyalg RSA -keysize 4096 -validity 10000 -alias lagom-upload \
  -dname "CN=<ditt namn>, C=SE"
```

- Välj ett **starkt lösenord** (minst 20 tecken, från lösenordshanteraren). I PKCS12-formatet är
  nyckelns lösenord detsamma som filens.
- Spara `lagom-upload.jks` och lösenordet i lösenordshanteraren (filen som bilaga) **och** på ett
  krypterat USB-minne hemma. Aldrig i Git – `.gitignore` stoppar `*.jks` och `*.keystore`.

### Lägg in den i molnbygget

**GitHub** (*repot → Settings → Secrets and variables → Actions → Secrets → New repository secret*):

| Hemlighet | Värde |
| --- | --- |
| `LAGOM_UPLOAD_KEYSTORE_BASE64` | Hela `lagom-upload.jks` i base64 (se nedan) |
| `LAGOM_UPLOAD_KEYSTORE_PASSWORD` | Lösenordet |
| `LAGOM_UPLOAD_KEY_ALIAS` | `lagom-upload` |
| `LAGOM_UPLOAD_KEY_PASSWORD` | Samma lösenord (PKCS12) |

Base64 utan radbrytningar:

```sh
# Git Bash (Windows) eller Linux:
base64 -w0 lagom-upload.jks > lagom-upload.b64
# PowerShell:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("lagom-upload.jks")) | Set-Content -NoNewline lagom-upload.b64
# macOS:
base64 -i lagom-upload.jks -o lagom-upload.b64
```

Öppna `lagom-upload.b64`, kopiera allt till hemligheten och **radera filen** efteråt.
`android/app/build.gradle` läser nyckeln från miljövariablerna `LAGOM_UPLOAD_KEYSTORE` (sökvägen,
sätts av bygget), `LAGOM_UPLOAD_KEYSTORE_PASSWORD`, `LAGOM_UPLOAD_KEY_ALIAS` och
`LAGOM_UPLOAD_KEY_PASSWORD`.

**Codemagic:** *Personal Account → codemagic.yaml settings → Code signing identities → Android
keystores*: ladda upp `lagom-upload.jks` med lösenord, alias och referensnamnet `lagom_upload`.

### Kontrollera fingeravtrycket

Molnbygget skriver uppladdningsnyckelns SHA-256 i körningens sammanfattning. Efter första
uppladdningen ska samma fingeravtryck stå under *Play Console → Testa och släpp → Appintegritet →
Appsignering → Certifikat för uppladdningsnyckel*.

### Tappad eller läckt nyckel

*Appintegritet → Appsignering → Begär återställning av uppladdningsnyckel*: skapa en ny nyckel som
ovan, exportera certifikatet och ladda upp det där:

```sh
keytool -export -rfc -keystore lagom-upload-ny.jks -alias lagom-upload -file upload_certificate.pem
```

Det tar några dagar. Byt sedan hemligheterna i GitHub/Codemagic.

### Tjänstekonto för uppladdning (valfritt)

Behövs bara för att molnbygget ska ladda upp till intern testning själv:

1. **Google Cloud Console** (console.cloud.google.com), inloggad med samma Google-konto: skapa
   ett projekt (t.ex. `lagom-play`) och aktivera **Google Play Android Developer API**.
2. *IAM och administratör → Tjänstkonton → Skapa tjänstkonto*, t.ex. `lagom-uppladdning`. Inga
   roller i Cloud-projektet behövs.
3. Tjänstkontot → *Nycklar → Lägg till nyckel → JSON* – filen laddas ned en gång.
4. **Play Console → Användare och behörigheter → Bjud in nya användare**: tjänstkontots
   e-postadress (`…@…iam.gserviceaccount.com`). Under *Appbehörigheter*: lägg till Lagom med
   **Visa appinformation (skrivskyddad)** och **Släpp appar till testspår**. Ge inte behörighet
   att släppa till produktion eller administrera kontot.
5. Klistra in hela JSON-filens innehåll som hemligheten `PLAY_SERVICE_ACCOUNT_JSON` i GitHub (eller
   `GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS` i Codemagics grupp `google_play`) och **radera filen**.
   Läcker den: ta bort nyckeln i Cloud Console och skapa en ny.

## 12. Nycklar och säkerhet

- **Uppladdningsnyckeln (`lagom-upload.jks`), dess lösenord och tjänstkontots JSON-nyckel är
  hemliga.** De finns bara i lösenordshanteraren, på USB-minnet och som hemligheter i GitHub eller
  Codemagic – aldrig i Git, i mejl eller i `VITE_`-variabler.
- Molnbygget använder hemligheterna bara i de steg som signerar och laddar upp, och kör aldrig
  för pull requests.
- Slå på GitHubs *secret scanning* och *push protection* (*Settings → Code security*), så stoppas
  en nyckel som råkar hamna i en commit.
- **Licensnyckelns privata del** (`LICENSE_PRIVATE_KEY`) hanteras lika försiktigt – se
  docs/BETALNING.md.
- Ge aldrig någon annan inloggning till Play Console med ditt konto. Behöver någon hjälpa till:
  bjud in dem som användare med begränsade behörigheter.

## 13. Checklista före produktion

- [ ] Konto verifierat, betalningsprofil klar, DSA-status ifylld, serviceavgiftsnivån kontrollerad.
- [ ] Säljaruppgifterna (`VITE_SELLER_*`) och `VITE_SUPPORT_EMAIL` ifyllda – inga platshållare kvar på `/integritet/`, `/villkor/` och `/support/`.
- [ ] Uppladdningsnyckeln skapad och säkerhetskopierad på två ställen; hemligheterna inlagda; Play App Signing aktiverat och fingeravtrycket kontrollerat.
- [ ] Första AAB:n uppladdad för hand till intern testning; molnbygget laddar upp nästa.
- [ ] 16 KB-kontrollen grön i molnbygget.
- [ ] Produkterna `livstid` och `ar` (engångsprodukter, 699 kr och 349 kr, bara Sverige) aktiva och testade med licenstestare: köp, avbrutet köp, väntande köp, Återställ köp, återbetalning med och utan borttagen rätt.
- [x] Återbetalda Play-köp: Voided Purchases API behövs inte – telefonen hämtar köpen från Play och ett återkallat köp försvinner ([avsnitt 7](#återbetalningar-och-återkallade-köp)).
- [ ] Testat på en riktig telefon: exempeldata, egen profil, streckkodsläsaren, export/delning, påminnelser, Health Connect, widgeten på hemskärmen ([WIDGET.md §7](WIDGET.md#7-testa-på-en-telefon)), bakåtknappen, utan uppkoppling.
- [x] Streckkodsläsaren på Android läser med ZXing – Data safety och integritetspolicyn stämmer med det ([avsnitt 8](#datasäkerhet-data-safety)).
- [x] Integritetspolicyn beskriver Health Connect, påminnelser, den automatiska kopian, widgetens sammanfattning (`lagom-widget`) och köp via Google Play Billing (kontrollera att den publicerade versionen är uppdaterad).
- [ ] Sluten test: minst 12 testare i 14 dagar i följd.
- [ ] Butikstexter (och versionsinformationen för produktion), ikon, funktionsgrafik och 2–8 skärmdumpar från butiksbygget uppladdade.
- [ ] Appinnehåll: integritetspolicy, annonser, annons-id, datasäkerhet, hälsoappar med de fem Health Connect-behörigheterna, IARC, målgrupp 18+, appåtkomst med granskarlicens.
- [ ] Länder: bara Sverige.
- [ ] Inga omnämnanden av webbköp eller App Store i appen eller texterna.
