# Konsekvensbedömning (DPIA) – Lagom Moln

> **Utkast – ska ses över av ägaren innan Lagom Moln slås på.** Ingen jurist har granskat texten.
> Konsekvensbedömningen gäller bara den frivilliga tjänsten Lagom Moln (krypterad molnkopia).
> Resten av Lagom behandlar inga hälsouppgifter på någon server. Lagom Moln är **avstängt** i
> version 1.0 – se [BACKEND.md](BACKEND.md).
>
> Uppdatera dokumentet när något ändras (leverantör, region, vad som sparas, samtyckestexten) och
> skriv datumet nedan. Spara gamla versioner – de visar vad som gällde när.

- **Personuppgiftsansvarig:** [Företagsnamn], enskild firma, org.nr [Org.nr], [Adress], [E-post]
- **Senast uppdaterad:** 2026-09-28
- **Status:** utkast, tjänsten är avstängd

## 1. Varför en konsekvensbedömning behövs

Lagom Moln sparar en kopia av dagboken hos en molntjänst. Dagboken innehåller **hälsouppgifter**
(artikel 9 GDPR): vad och hur mycket någon äter, vikt, kroppsmått, alkohol, träning och om någon är
gravid eller ammar. En konsekvensbedömning krävs när en behandling sannolikt leder till hög risk,
och Integritetsskyddsmyndigheten (IMY) räknar känsliga uppgifter och ny teknik bland kriterierna.
Även om innehållet är krypterat så att vi inte kan läsa det görs bedömningen – det är det
försiktiga valet.

## 2. Beskrivning av behandlingen

| Fält | Beskrivning |
| --- | --- |
| Ändamål | Att användaren ska kunna återställa sin dagbok på en ny eller återställd enhet. Inget annat – ingen analys, ingen reklam, ingen profilering. |
| Rättslig grund | Uttryckligt samtycke (art. 6.1 a och art. 9.2 a). Samtycket ges med en kryssruta som aldrig är förifylld och kan när som helst återkallas genom att stänga av och radera. |
| Registrerade | Vuxna användare (18 år och äldre) som själva slår på Lagom Moln. |
| Uppgifter som vi *kan* se | E-postadress (för inloggningen), tidpunkter för inloggning och uppladdning, storleken på den krypterade kopian, IP-adress i leverantörernas loggar, samtyckets version och tidpunkt. |
| Uppgifter som *bara användaren* kan läsa | Hela säkerhetskopian: dagbok, vikt, kroppsmått, recept, egna livsmedel, fasta, inställningar och profil (inklusive graviditet/amning). Den krypteras på enheten innan den skickas. |
| Mottagare (biträden) | Supabase (databas och inloggning), e-posttjänsten som skickar engångskoden: [fylls i av ägaren]. Supabase använder i sin tur underbiträden (bl.a. molnleverantören där servern står). |
| Var datan lagras | Supabase-projekt i regionen eu-north-1 (Stockholm). |
| Överföring utanför EU | Supabase Inc. är ett amerikanskt bolag. Support och drift kan ske från USA – EU–US Data Privacy Framework och standardavtalsklausuler i Supabases DPA. Innehållet är krypterat med en nyckel som bara användaren har. |
| Lagringstid | Tills användaren stänger av med "Radera också kopian i molnet" eller raderar kontot. Leverantörens säkerhetskopior skrivs över inom 7 dagar. **Beslut som saknas:** vad som händer med konton som inte använts på länge (förslag: påminnelse efter 24 månader, radering efter ytterligare 30 dagar). |

### Så flödar datan

1. Användaren loggar in med e-post och en engångskod (8 siffror). Ett konto med bara
   e-postadressen skapas hos Supabase.
2. Användaren läser informationen och kryssar i samtycket (avsnitt 6). Utan samtycke sparas
   ingenting mer.
3. Användaren väljer en lösenfras (minst 12 tecken) och får en återställningsnyckel som visas en
   gång. En slumpad datanyckel skapas på enheten och sparas i molnet bara krypterad med
   lösenfrasen respektive återställningsnyckeln.
4. Säkerhetskopian krypteras på enheten (AES-256-GCM) och laddas upp en gång per dygn, när appen
   stängs (högst var tionde minut) och när användaren trycker på "Säkerhetskopiera nu".
   Exempeldata laddas aldrig upp.
5. På en ny enhet: logga in, lås upp med lösenfrasen (eller återställningsnyckeln), återställ.
6. Radering: "Radera konto och molndata" i appen, eller via e-post enligt sidan
   `/radera-konto/`.

## 3. Nödvändighet och proportionalitet

- **Frivilligt.** Lagom fungerar fullt ut utan Lagom Moln. Säkerhetskopia som fil finns alltid
  som alternativ.
- **Uppgiftsminimering.** Servern får bara det som behövs för att lagra och lämna tillbaka en
  krypterad fil. Postens namn är en HMAC, så inte ens vad posten är syns.
- **Ändamålsbegränsning.** Vi kan tekniskt inte använda innehållet till något annat.
- **Lagringsbegränsning.** Användaren raderar själv när som helst; se också beslutet om inaktiva
  konton ovan.
- **Rättigheter.** Radering i appen och på webben. Tillgång och dataportabilitet: användaren har
  redan allt på sin enhet och kan exportera det. Rättelse görs i appen.
- **Ålder.** Lagom riktar sig till vuxna (18+).

## 4. Risker

Sannolikhet och konsekvens bedöms som låg, medel eller hög, *efter* åtgärderna i avsnitt 5.

| Risk | Vad kan hända | Sannolikhet | Konsekvens | Kvarvarande risk |
| --- | --- | --- | --- | --- |
| **Kapat konto** (någon kommer åt användarens e-post) | Angriparen kan logga in och radera molnkopian eller kontot. Innehållet kan inte läsas utan lösenfrasen eller återställningsnyckeln. Datan på användarens enhet finns kvar. | Låg | Medel (förlorad kopia) | Låg |
| **Förlorad lösenfras och återställningsnyckel** | Molnkopian går inte att få tillbaka – inte heller med vår hjälp. | Medel | Medel (datan finns oftast kvar på enheten) | Accepterad – tydlig information i appen innan start |
| **Incident eller intrång hos leverantören** | E-postadresser, tider och storlekar kan läcka. Att någon använder en kaloriapp kan i sig kännas känsligt. Innehållet är krypterat. | Låg | Medel | Låg |
| **Stöld av databasen och gissning av lösenfraser** | En angripare med databasen kan försöka gissa svaga lösenfraser offline. | Låg | Hög för den enskilda | Låg–medel |
| **Felkonfiguration** (radskydd, nycklar, rättigheter) | En användare skulle kunna nå någon annans krypterade klump. | Låg | Medel (innehållet är ändå krypterat) | Låg |
| **Programfel i appen** | En uppladdning skriver över en bättre kopia, t.ex. från en ny tom telefon. | Låg | Medel | Låg |
| **Åtkomst från ägaren eller leverantörens personal** | Kan se e-post och metadata, inte innehållet. | Låg | Låg | Låg |
| **Minderåriga** | En person under 18 år slår på tjänsten. | Låg | Medel | Låg |

## 5. Åtgärder

| Åtgärd | Mot vilka risker |
| --- | --- |
| **End-to-end-kryptering på enheten**: slumpad datanyckel, AES-256-GCM, lösenfras via PBKDF2-SHA256 med 600 000 varv, återställningsnyckel på 256 bitar, posterna bundna till konto och post-id. Nycklarna går inte att exportera från enheten. | Incident, stöld, åtkomst, felkonfiguration |
| **Radskydd (RLS)** på alla tabeller, inga rättigheter för ej inloggade, kolumnvisa rättigheter, skrivningar bara via kontrollerade funktioner. Automatiska databastester (pgTAP). | Felkonfiguration |
| **Revisionskontroll** vid uppladdning (konflikt i stället för överskrivning), inga uppladdningar före inläsning, i minnesläge, med exempeldata eller när dagboken plötsligt krympt. | Programfel |
| **Frivillighet och samtycke**: kryssruta som inte är förifylld, versionshanterad samtyckestext som sparas med tidpunkt. Appen laddar inte upp något utan samtycke till den gällande texten, och databasen tar inte emot något till ett valv utan samtycke. | Laglighet |
| **Radering**: i appen (kontot och allt i molnet, valfritt även enheten), på webben via `/radera-konto/` och via e-post. Sessionen glöms direkt på enheten. | Rättigheter, kapat konto |
| **Lösenfras minst 12 tecken** och tydlig information om att den inte kan återställas. | Gissning, förlorad lösenfras |
| **Drift**: MFA på alla konton, Spend cap, Security Advisor, egen SMTP, anropsbegränsning, publik nyckel i appen och hemliga nycklar bara på servern (se BACKEND.md avsnitt 4). | Incident, kapat konto |
| **Avtal**: DPA med Supabase och e-posttjänsten. Registerförteckningen uppdateras. | Laglighet, överföring |
| **Incidentplan**: anmäl till IMY inom 72 timmar om en incident sannolikt innebär en risk, informera berörda användare om risken är hög. Skriv ner alla incidenter, även små. | Incident |
| **Åldersgräns 18+** i butikerna och villkoren. | Minderåriga |

Förbättringar att överväga senare: Argon2id i stället för PBKDF2 (starkare mot gissning),
CAPTCHA vid begäran om kod, byte av lösenfras utan återställningsnyckeln, automatisk radering av
inaktiva konton.

## 6. Samtyckestexten

Visas i steg 2 bredvid en kryssruta som aldrig är förifylld. Versionen sparas i valvet
(`consent_version`) tillsammans med tidpunkten (`consent_at`).

- **Version:** `2026-10-01` (`CLOUD_CONSENT_VERSION` i `src/lib/cloud/consent.ts`)
- **Text:**

> Jag samtycker till att min dagbok, vikt och mina mått lagras krypterat hos Lagoms molntjänst för att jag ska kunna återställa dem. Bara jag har nyckeln. Jag kan när som helst stänga av och radera.

Ändras texten i sak: höj versionen i `src/lib/cloud/consent.ts` och uppdatera texten här. Alla
som redan använder Lagom Moln får då godkänna den nya texten innan tjänsten används igen.

## 7. Det här måste uppdateras innan Lagom Moln slås på

### Integritetspolicyn

`docs/INTEGRITETSPOLICY.md`, `src/features/legal/legalContent.ts` och `public/integritet/index.html`
(de hålls i synk av testerna):

- **Din dagbok finns bara på din enhet** – lägg till undantaget: om du själv slår på Lagom Moln
  sparas en krypterad kopia i molnet.
- **Tjänster som appen kontaktar** – Supabase (inloggning och lagring) och e-posttjänsten för
  engångskoden.
- **Varför vi får behandla uppgifterna** – uttryckligt samtycke (art. 9.2 a) för Lagom Moln.
- **Hur länge vi sparar** – tills du raderar; säkerhetskopior skrivs över inom 7 dagar; beslutet
  om inaktiva konton.
- **Mottagare och överföringar utanför EU** – Supabase (eu-north-1, Supabase Inc. i USA) och
  e-posttjänsten.
- **Dina rättigheter** – radera kontot i appen eller via `/radera-konto/`.
- **Ingen samtyckesbanner behövs** (anteckningen till ägaren) – stämmer fortfarande för webbplatsen,
  men samtycket till Lagom Moln ges i appen.

### Registerförteckningen

`docs/BEHANDLINGSREGISTER.md`: ny behandling "5. Lagom Moln" med ändamål, rättslig grund
(art. 6.1 a och 9.2 a), uppgifter, mottagare, överföringar, lagringstid och säkerhetsåtgärder
enligt avsnitt 2 och 5 ovan. Ta bort raden om att Lagom Moln är avstängt under "Det här ingår inte".

### App Store (integritetsetiketten, `docs/APP-STORE.md` avsnitt 7)

Deklarera försiktigt – att deklarera för mycket är tillåtet, för lite är ett brott mot reglerna:

- **Contact Info → Email Address**: insamlas, kopplad till användaren, för appens funktion.
- **Health & Fitness** och **User Content → Other User Content**: insamlas (valfritt), kopplad
  till användaren, för appens funktion. Innehållet är krypterat så att vi inte kan läsa det –
  låt en granskning avgöra om det får deklareras som "inte insamlat"; tills dess, deklarera det.
- Kontoradering i appen finns (riktlinje 5.1.1(v)).
- Granskningsanteckningar: Lagom Moln är frivilligt; resten av appen fungerar utan konto.

### Google Play (Datasäkerhet, `docs/GOOGLE-PLAY.md` avsnitt 8)

- **Kontoskapande:** ja (e-post och engångskod).
- **Webbadress för kontoradering:** `https://<domän>/radera-konto/`.
- **Insamlade uppgifter:** e-postadress; hälsa och fitness (valfritt); "Annat användarinnehåll".
  Krypterat under överföring: ja. Användaren kan begära radering: ja.

### Texter i appen och på webben

- Inställningar: gruppen "Data och integritet" säger att Lagom saknar konton – ändra när
  Lagom Moln visas.
- `public/support/index.html`: avsnittet om att radera allt ("vi har inga konton") och
  "Jag har bytt telefon" – nämn Lagom Moln och länka till `/radera-konto/`.
- Inställningar → Data, Om Lagom och välkomstflödet där det står att ingen data finns på någon
  server.
- Villkoren (`docs/ANVANDARVILLKOR.md`): att Lagom Moln är frivilligt, att kopian inte kan
  återställas utan lösenfras eller återställningsnyckel och att tjänsten kan avvecklas med
  varsel (se BACKEND.md avsnitt 8).

## 8. Beslut

| Fråga | Beslut |
| --- | --- |
| Slås Lagom Moln på? | **Nej, inte i 1.0** (ägarens beslut 2026-09-28). |
| Leverantör och region | Supabase, egen organisation "Lagom", Pro, eu-north-1 – när det blir aktuellt. |
| E-posttjänst för engångskoden | [fylls i av ägaren] |
| Inaktiva konton | [fylls i av ägaren] |
| Bedömningen godkänd av | [namn, datum] |
