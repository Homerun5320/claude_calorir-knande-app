# Backend för Lagom – beslutsunderlag och drift

> **Läs först.** Lagom 1.0 lanseras **utan egen databas**. Den frivilliga tjänsten **Lagom Moln**
> (en krypterad kopia av dagboken i molnet) finns färdig i koden men är **avstängd**. Den slås på
> först när två miljövariabler sätts vid bygget (se [avsnitt 7](#7-slå-på-lagom-moln-i-appen)) –
> och det ska bara göras efter att du har gått igenom checklistan i
> [avsnitt 4](#4-driftkrav-innan-lagom-moln-slås-på) och konsekvensbedömningen i
> [docs/DPIA-SYNK.md](DPIA-SYNK.md).
>
> Det här dokumentet är skrivet för dig som ägare utan jurist, revisor eller Mac. Priser och
> villkor hos leverantörerna ändras – kontrollera alltid aktuella uppgifter på deras webbplatser
> innan du bestämmer dig. Inget här är juridisk rådgivning.

## Innehåll

1. [Varför 1.0 lanseras utan databas](#1-varför-10-lanseras-utan-databas)
2. [Jämförelse av alternativen](#2-jämförelse-av-alternativen)
3. [Supabase-projektet: använd inte "Homerun5320's Project"](#3-supabase-projektet-använd-inte-homerun5320s-project)
4. [Driftkrav innan Lagom Moln slås på](#4-driftkrav-innan-lagom-moln-slås-på)
5. [Köra migreringen och testerna lokalt](#5-köra-migreringen-och-testerna-lokalt)
6. [Lägga migreringen i produktion](#6-lägga-migreringen-i-produktion)
7. [Slå på Lagom Moln i appen](#7-slå-på-lagom-moln-i-appen)
8. [Stänga av eller avveckla](#8-stänga-av-eller-avveckla)
9. [Så fungerar Lagom Moln tekniskt](#9-så-fungerar-lagom-moln-tekniskt)

---

## 1. Varför 1.0 lanseras utan databas

Lagom fungerar i dag helt utan konton. Dagboken, vikten och allt annat sparas bara på användarens
enhet (IndexedDB). Servern (Netlify) används bara för köp på webben, licensnycklar och spärrlistan
för återbetalda licenser – aldrig för dagboken.

Det är ett medvetet val för version 1.0:

| Skäl | Förklaring |
| --- | --- |
| **Integritet** | Kaloriintag, vikt, kroppsmått, graviditet och alkohol är *hälsouppgifter* – en särskild kategori i GDPR (artikel 9). Så länge de bara finns på användarens enhet behandlar du dem inte, och integritetspolicyn, butikernas integritetsetiketter och registerförteckningen blir enkla. |
| **Ansvar** | En databas med hälsouppgifter kräver konsekvensbedömning, personuppgiftsbiträdesavtal, säkerhetsarbete och en plan för incidenter (anmälan till IMY inom 72 timmar). Det är mycket för en enskild firma att bära från dag ett. |
| **Kostnad** | Utan databas kostar driften i princip bara Netlify. En produktionsdatabas kostar från ungefär 25 USD i månaden (se nedan). |
| **Butiksgranskning** | Appar med konton måste kunna radera kontot i appen (Apple, riktlinje 5.1.1(v)) och ange en webbadress för kontoradering i Google Play. Det är byggt, men varje ny del är en ny sak som kan ge avslag. |
| **Alternativ finns** | Användarna kan redan flytta sin data med en säkerhetskopia som fil (Inställningar → Data → Exportera). |

Lagom Moln är därför byggt så att det går att slå på senare utan att ändra appen – men 1.0 ska
fungera fullt ut utan det.

---

## 2. Jämförelse av alternativen

Ungefärliga uppgifter hösten 2026. **Kontrollera aktuella priser och villkor** innan du väljer.

| Alternativ | Kostnad | Inlåsning | Region (var datan ligger) | Komplexitet för dig | Passar Lagom? |
| --- | --- | --- | --- | --- | --- |
| **Bara Netlify + Stripe** (dagens lösning) | Ingen extra kostnad utöver Netlify | Låg | Ingen dagbok lagras. Serverfunktionerna hanterar bara köp och licenser. | Låg – finns redan | **Ja, för 1.0.** |
| **Supabase** (Postgres + inloggning) | Gratisnivån pausas vid inaktivitet och saknar säkerhetskopior – inte för produktion. Pro: cirka 25 USD/månad per organisation (drygt 250 kr), med ett utgiftstak (Spend cap) påslaget som standard. | Låg – vanlig Postgres, kan flyttas med `pg_dump` | Du väljer region; **eu-north-1 (Stockholm)** finns | Medel. Inloggning, radskydd (RLS) och API ingår. | **Ja, om Lagom Moln slås på.** Koden är byggd för detta. |
| **Firebase** (Google) | Gratisnivå, sedan betalning efter användning (Blaze). Inget hårt utgiftstak – bara budgetvarningar. | Hög – egen databas (Firestore) och egna säkerhetsregler | EU-regioner finns (t.ex. Finland) | Medel | Nej – svårare att flytta ifrån och risk för oväntade kostnader. |
| **PocketBase** (öppen källkod, egen server) | Egen server hos t.ex. ett europeiskt molnföretag, ungefär 50–100 kr/månad | Låg | Där du hyr servern | **Hög** – du ansvarar själv för uppdateringar, säkerhetskopior, övervakning och säkerhet | Nej – för mycket drift för en ensam student. |
| **Netlify Database** (Postgres via Neon) | Beror på Neons prissättning | Låg – Postgres | Beror på vald region | Medel–hög – ingen inbyggd inloggning; den måste byggas eller köpas separat | Nej, inte nu. Tjänsten är ny – kontrollera status och region innan du överväger den. |

**Rekommendation:** Lansera 1.0 utan databas. Om och när Lagom Moln ska slås på: Supabase i en
egen organisation "Lagom" med Pro-plan och region eu-north-1 (se nästa avsnitt).

---

## 3. Supabase-projektet: använd inte "Homerun5320's Project"

Ditt befintliga Supabase-projekt, **"Homerun5320's Project"**, ska **inte** användas för Lagom:

- Det ligger i en personlig organisation och kan innehålla annat (tester, andra appar). Lagoms
  användardata ska ligga helt för sig själv – då blir åtkomst, avtal och radering tydliga.
- Region och plan är okända eller fel (gratisprojekt pausas och saknar säkerhetskopior).
- Personuppgiftsbiträdesavtalet (DPA) och registerförteckningen ska gälla just Lagom.

Gör så här **när** (och bara när) du har bestämt dig för att slå på Lagom Moln:

1. Skapa en ny **organisation** i Supabase med namnet **Lagom**.
2. Välj **Pro**-planen för organisationen. Låt **Spend cap** vara påslaget.
3. Skapa ett projekt, t.ex. `lagom-moln`, i regionen **eu-north-1 (Stockholm)**. Välj ett långt,
   slumpat databaslösenord och spara det i en lösenordshanterare.
4. Slå på **tvåstegsverifiering (MFA)** för ditt Supabase-konto (och för GitHub och Netlify).
5. Bjud inte in någon annan till organisationen om det inte behövs.

Just nu (hösten 2026) ska inget nytt betalt Supabase-projekt skapas – det är ägarens beslut.

---

## 4. Driftkrav innan Lagom Moln slås på

Checklista. Allt görs i Supabase-projektets inställningar (Dashboard) om inget annat står.

### Inloggning (Authentication)

- [ ] **Egen SMTP** (Authentication → Emails → SMTP Settings). Supabases inbyggda e-post är bara
      för tester och skickar bara ett fåtal mejl i timmen. Välj en e-posttjänst med servrar i EU
      och ett personuppgiftsbiträdesavtal. Sätt upp SPF, DKIM och DMARC för domänen.
- [ ] **Engångskod i stället för länk.** E-postmallarna *Confirm signup* och *Magic Link* måste
      innehålla koden `{{ .Token }}` (appen frågar efter en kod, inte en länk). Skriv mallarna på
      svenska, t.ex. "Din kod till Lagom Moln är {{ .Token }}. Den gäller i 15 minuter."
- [ ] **OTP-inställningar:** kodlängd **8 siffror** (appen visar "Kod (8 siffror)"), giltighet
      t.ex. **900 sekunder** (15 minuter).
- [ ] **Anropsbegränsningar** (Authentication → Rate Limits): behåll standardvärdena eller
      skärp dem. Appen visar "För många försök just nu" när gränsen nås.
- [ ] Stäng av inloggningssätt som inte används (telefon, anonyma inloggningar, externa
      leverantörer). Appen använder bara e-post med engångskod.
- [ ] Behåll standardvärdena för åtkomsttokens giltighet (3 600 sekunder) och för återanvändning
      av förnyelsetoken (10 sekunder). Appen förnyar själv 60 sekunder före utgång.

### Nycklar

- [ ] Använd de nya nycklarna (Settings → API Keys): den **publika** nyckeln (`sb_publishable_…`)
      i appen, den **hemliga** (`sb_secret_…`) bara på servern om den någon gång behövs.
- [ ] **En hemlig nyckel får aldrig ligga i en `VITE_`-variabel** – allt med `VITE_` hamnar i
      appen och kan läsas av vem som helst. Appen vägrar dessutom slå på Lagom Moln med en nyckel
      som inte börjar med `sb_publishable_`.
- [ ] Stäng av de gamla JWT-nycklarna (anon/service_role) om de inte används.

### Databas och säkerhet

- [ ] Kör migreringen (avsnitt 6) och därefter **Security Advisor** och **Performance Advisor**
      (Advisors i menyn). Åtgärda alla fel och varningar innan appen slås på. En upplysning om
      att `webhook_events` har radskydd men ingen policy är avsiktlig – bara servern ska nå den
      tabellen.
- [ ] **Enforce SSL** på (Database → Settings).
- [ ] Säkerhetskopior: Pro har dagliga säkerhetskopior som sparas i **7 dagar**. Sidan
      `public/radera-konto/` lovar att raderade konton försvinner ur säkerhetskopiorna inom 7 dagar
      – ändra texten om planen ändras.
- [ ] Bara schemat `public` exponeras i Data API (standard).

### Avtal och dokument

- [ ] Signera Supabases personuppgiftsbiträdesavtal (DPA) och e-posttjänstens DPA. Spara dem.
- [ ] Uppdatera integritetspolicyn, registerförteckningen, butikernas integritetsetiketter och
      supportsidan – listan finns i [DPIA-SYNK.md](DPIA-SYNK.md#7-det-här-måste-uppdateras-innan-lagom-moln-slås-på).
- [ ] Gå igenom konsekvensbedömningen och fyll i det som saknas.

### Appen

- [ ] Lägg `https://<ref>.supabase.co` i `connect-src` i Content-Security-Policy i `netlify.toml`
      (och motsvarande i butiksbyggena). Annars blockerar webbläsaren anropen.
- [ ] Integrationen i appen (avsnitt 7) är gjord och provad.

---

## 5. Köra migreringen och testerna lokalt

Du behöver **Docker Desktop** (finns för Windows och Linux – ingen Mac behövs) och Node. Supabase
CLI körs med `npx`, så inget installeras i projektet och `package.json` ändras inte.

```bash
# En gång: skapa supabase/config.toml (migreringarna och testerna i supabase/ påverkas inte).
npx supabase init

# Starta en lokal Supabase (tar några minuter första gången).
npx supabase start

# Kör alla migreringar i supabase/migrations från början.
npx supabase db reset

# Kör databastesterna i supabase/tests (pgTAP). Alla ska vara "ok".
npx supabase test db

# Stoppa när du är klar.
npx supabase stop
```

Testerna (`supabase/tests/lagom_moln.test.sql`) kontrollerar bland annat att den som inte är
inloggad nekas allt, att användare A inte kan läsa eller ändra B:s valv, att en användare utan
valv får felkoden `P0002`, revisioner och konflikter, gravstenar, kvoten och att
`delete_my_account` raderar allt i kaskad.

### Prova appen mot den lokala databasen

1. Ställ in engångskoden i `supabase/config.toml` under `[auth.email]`: `otp_length = 8` och
   `otp_expiry = 900`. Lägg `{{ .Token }}` i e-postmallarna (se kommentarerna i filen). Kör
   `npx supabase stop` och `npx supabase start` igen.
2. `npx supabase status` visar adressen (`http://127.0.0.1:54321`) och den publika nyckeln
   (`sb_publishable_…`). Visar den bara en "anon key" som börjar med `eyJ` är CLI:n för gammal –
   kör `npx supabase@latest` i stället.
3. Skapa filen `.env.local` (checkas aldrig in):
   ```
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   http-adresser godtas bara i utvecklingsläget (`npm run dev`), aldrig i ett bygge.
4. `npm run dev`. Mejlen med koden hamnar i den lokala brevlådan (Mailpit), vars adress
   `npx supabase status` visar.

---

## 6. Lägga migreringen i produktion

Görs bara efter beslut att slå på Lagom Moln och när projektet i avsnitt 3 finns.

```bash
npx supabase login
npx supabase link --project-ref <projektets ref>
npx supabase db push        # visar vad som körs och frågar innan
```

Alternativt: klistra in innehållet i `supabase/migrations/20261001120000_lagom_moln.sql` i SQL
Editor och kör det en gång.

- Kör **aldrig** `db reset` mot produktionsprojektet – det raderar all data.
- Ändringar i databasen görs alltid som en **ny** migreringsfil. Ändra aldrig en migrering som
  redan har körts i produktion.
- **Varje ny databasfunktion** måste få raden
  `revoke execute on function public.<namn>(<argument>) from public, anon;` (och
  `grant execute … to authenticated;` om appen ska anropa den). Postgres låter annars alla – även
  den som inte är inloggad – köra nya funktioner, och det går inte att stänga av för bara schemat
  `public`. Nya tabeller och sekvenser skyddas däremot automatiskt av migreringen.
- Om `delete_my_account` skulle nekas rättighet att radera i `auth.users` (Supabase har skärpt
  rättigheterna i auth-schemat tidigare): ersätt funktionen med en serverfunktion som använder den
  hemliga nyckeln och Supabases admin-API för att radera användaren. Kontrollera detta när
  testerna körs mot en ny lokal stack.

---

## 7. Slå på Lagom Moln i appen

Lagom Moln är på när **båda** variablerna är satta vid bygget (t.ex. i Netlify → Site
configuration → Environment variables):

| Variabel | Värde |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` (https, utan snedstreck på slutet) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Den publika nyckeln, `sb_publishable_…` |

Saknas någon av dem – eller ser de fel ut – är Lagom Moln avstängt och ingen molnkod laddas
(`CLOUD_ENABLED` i `src/config/cloud.ts`).

Integrationen i appen görs först när Lagom Moln är godkänt (allt fungerar avstängt utan den):

1. `src/features/settings/SettingsPage.tsx`: en sektion `moln` ("Lagom Moln") som laddar
   `sections/CloudSection` med dynamisk import och bara visas när `CLOUD_ENABLED`.
2. `src/stores/hydration.ts`: `useCloudStore` i listan `STORES` (inte i `BY_KEY` eller
   `STORE_KEYS` – inloggningen ska aldrig följa med i en säkerhetskopia eller raderas av
   "Radera all data").
3. Automatiska kopior: i `src/main.tsx` (eller `App.tsx`),
   `if (CLOUD_ENABLED) void import('./lib/cloud/cloudBackup').then((m) => m.startCloudAutoBackup())`.
4. `netlify.toml`: `https://<ref>.supabase.co` i `connect-src`.
5. `vite.config.ts`: platshållarna `[Företagsnamn]` och `[E-post]` i
   `public/radera-konto/index.html` fylls i med `fillSellerPlaceholders` på samma sätt som
   support-, integritets- och villkorssidorna (och sidan tas med i varningen
   `missingSellerPlaceholders`). `/radera-konto` läggs i `navigateFallbackDenylist`, så att
   appens service worker inte visar appen i stället för sidan.
6. `scripts/commerce-guard.ts` (rekommenderas): stoppa bygget om
   `VITE_SUPABASE_PUBLISHABLE_KEY` börjar med `sb_secret_` eller `eyJ` (en hemlig nyckel eller en
   gammal JWT-nyckel), och varna om `VITE_SUPABASE_URL` är satt men inte börjar med `https://`.
7. Texter som säger att Lagom saknar konton (Inställningar, supportsidan, integritetspolicyn)
   uppdateras – se DPIA-SYNK.md.

### Prova innan lansering

- [ ] Logga in med e-post och kod, godkänn samtycket (kryssrutan är tom från början), välj
      lösenfras och spara återställningsnyckeln.
- [ ] "Säkerhetskopiera nu" – en kopia syns under "I molnet".
- [ ] På en annan enhet: logga in, lås upp med lösenfrasen, "Återställ från molnet".
- [ ] "Glömt lösenfrasen?" med återställningsnyckeln.
- [ ] Exempeldata laddas aldrig upp.
- [ ] "Radera konto och molndata" – kontot försvinner i Supabase (Authentication → Users) och
      raderna i `vaults` och `sync_items`.
- [ ] Sidan `/radera-konto/` visar rätt företagsnamn och e-post.

---

## 8. Stänga av eller avveckla

- **Tillfälligt:** ta bort de två variablerna och bygg om. Lagom Moln försvinner ur appen, men
  konton och krypterad data finns kvar i databasen.
- **För gott:** meddela användarna i god tid (minst 30 dagar) och be dem radera sina konton eller
  spara en säkerhetskopia som fil. Radera sedan Supabase-projektet. Uppdatera integritetspolicyn
  och butikernas etiketter.

---

## 9. Så fungerar Lagom Moln tekniskt

### Filer

| Fil | Vad |
| --- | --- |
| `src/config/cloud.ts` | Flaggan `CLOUD_ENABLED`, adress och publik nyckel |
| `src/lib/cloud/vaultCrypto.ts` | Kryptering på enheten (WebCrypto, inga paket) |
| `src/lib/cloud/supabaseAuth.ts` | Inloggning med engångskod, förnyelse av token |
| `src/lib/cloud/postgrest.ts` | Anrop till databasen (select, insert, update, rpc, del) |
| `src/lib/cloud/cloudBackup.ts` | Uppladdning, nedladdning, radering och automatiska kopior |
| `src/lib/cloud/cloudSetup.ts`, `vault.ts`, `keyStore.ts`, `consent.ts`, `http.ts` | Valvet, nyckeln på enheten, samtycket och felhantering |
| `src/stores/cloudStore.ts` | Inloggning och läge på enheten (IndexedDB, `lagom-cloud`) |
| `src/features/settings/sections/CloudSection.tsx` | Inställningar → Lagom Moln |
| `supabase/migrations/20261001120000_lagom_moln.sql` | Tabeller, rättigheter, RLS och funktioner |
| `supabase/tests/lagom_moln.test.sql` | Databastester (pgTAP) |
| `public/radera-konto/index.html` | Fristående sida om kontoradering (för Google Play) |

### Kryptering (end-to-end)

- En slumpad **datanyckel** skapas på enheten. Den sparas i molnet bara *inslagen* (krypterad)
  två gånger: med en nyckel från **lösenfrasen** (PBKDF2-SHA256, 600 000 varv) och med den
  slumpade **återställningsnyckeln** (256 bitar, visas en gång som 13 grupper om fyra tecken).
- Varje post komprimeras (gzip) och krypteras med AES-256-GCM. Postens namn i databasen är en
  HMAC, så servern ser inte ens vad posten är.
- Varken du, Supabase eller någon annan kan läsa innehållet. Glömmer användaren både lösenfrasen
  och återställningsnyckeln går molnkopian inte att få tillbaka.
- Den upplåsta nyckeln sparas på enheten som en icke-exporterbar nyckel (`lagom-cloud-key`),
  så att lösenfrasen inte behöver skrivas in varje gång.

### Databasen

| Tabell | Innehåll | Vem når den |
| --- | --- | --- |
| `vaults` | Ett valv per konto: inslagna nycklar, nyckelhärledning, samtycke, `seq`, `bytes_used` | Ägaren läser, skapar och ändrar vissa kolumner. `seq` och `bytes_used` ändras bara av `sync_push`. |
| `sync_items` | Krypterade poster (fas 1: en enda – säkerhetskopian) | Ägaren läser och raderar. Skrivs bara via `sync_push`. |
| `entitlements` | Köp kopplade till ett konto (för framtida bruk) | Ägaren läser. Skrivs av servern. |
| `webhook_events` | Behandlade webhooks | Bara servern. |

- `anon` (ej inloggad) har inga rättigheter alls. Radskydd (RLS) på alla tabeller.
- `sync_push(p_items)` skriver poster med **revisionskontroll**: en post som bygger på en äldre
  revision skrivs inte (konflikt), så en ny telefon kan inte råka skriva över kopian i molnet
  innan den har återställts. Kvot: 50 000 000 byte totalt och 4 000 000 byte per post. Ett valv
  utan samtycke (`consent_version` saknas) tar inte emot något.
- Appen laddar inte heller upp något förrän samtycket till den gällande samtyckestexten finns på
  enheten. Höjs versionen i `src/lib/cloud/consent.ts` stannar de automatiska kopiorna tills
  användaren har godkänt den nya texten under Inställningar → Lagom Moln.
- `delete_my_account()` raderar kontot. Valv, poster och köp följer med i kaskad.

### Kända begränsningar i fas 1

- En kopia av hela dagboken, ingen löpande synkning mellan enheter.
- Byte av lösenfras finns bara via återställningsnyckeln ("Glömt lösenfrasen?").
- Ingen CAPTCHA vid begäran om kod – anropsbegränsningen i Supabase får räcka.
- Apples granskare kan inte ta emot koden. Skriv i granskningsanteckningarna att Lagom Moln är
  frivilligt och att resten av appen fungerar utan konto, eller ge dem en testbrevlåda.
- Inloggningen är Lagoms egen (e-post och kod), så "Logga in med Apple" krävs inte
  (App Store-riktlinje 4.8 gäller inloggning via externa tjänster).
