# Betalning och licenser

Lagom är gratis att prova i 14 dagar. Sedan köper man en licens:

| Plan | Pris (inkl. 25 % moms) | Giltighet |
| --- | --- | --- |
| Årslicens | 299 kr | 365 dagar från köpet. **Förnyas inte automatiskt** – inga fler dragningar. |
| Livstidslicens | 599 kr | För alltid. Engångsköp. |

Ingen reklam, inga dolda avgifter och inga konton. Användarens data låses aldrig: efter provperioden kan man fortfarande se, exportera och radera allt – bara ny loggning kräver licens.

Den här guiden beskriver hur betalningen sätts upp med **Stripe** (kort, Klarna, Swish m.m.) och **Netlify** (webbhotell och serverfunktioner), hur licenserna fungerar och vad som måste vara på plats innan du säljer på riktigt.

---

## Innehåll

1. [Så fungerar det](#så-fungerar-det)
2. [Testläge utan betalning](#testläge-utan-betalning)
3. [Steg för steg](#steg-för-steg)
4. [Testa med Stripes testläge](#testa-med-stripes-testläge)
5. [Gå live – checklista](#gå-live--checklista)
6. [Licenserna](#licenserna)
7. [Support: ny enhet, manuell licens, återbetalning](#support-ny-enhet-manuell-licens-återbetalning)
8. [Begränsningar](#begränsningar)
9. [API-referens](#api-referens)
10. [Felsökning](#felsökning)

---

## Så fungerar det

```
 Appen (#/premium)          Netlify Functions                 Stripe
 ─────────────────          ─────────────────                 ──────
 Välj plan + kryssa i  ──►  POST /api/create-checkout  ──►  Kontrollera priset,
 samtycket                  { plan, consent }                skapa Checkout-session
                                                       ◄──  betalningslänk
 Skickas till Stripe  ────────────────────────────────────►  Kunden betalar
                                                             (kort, Klarna, Swish …)
 #/tack?session_id=…  ◄────────────────────────────────────  Tillbaka till appen
 POST /api/verify-purchase ─► Hämta sessionen, kontrollera
 { sessionId }                att den är betald och gäller
                              Lagom, signera licensnyckeln,
                              spara den på betalningen  ──►  metadata "lagom_license"
 Licensnyckel  ◄────────────  { licenseKey }
 verifieras offline och sparas i appen

 (valfritt) Stripe-webhook ──► /api/stripe-webhook: samma utfärdande direkt när betalningen är klar,
                               även om kunden stängde fliken innan tacksidan laddades.
```

- **Ingen databas och inga konton.** Den enda platsen där köpet finns är Stripe. Licensnyckeln sparas som metadata på betalningen, så att supporten alltid kan hitta den.
- **Planen bestäms av servern.** Klienten skickar bara vilken plan kunden vill köpa; vid verifieringen läses planen från köpet i Stripe och kontrolleras mot det som faktiskt betalades.
- **Priset kontrolleras.** Servern vägrar starta ett köp om priset i Stripe inte är exakt samma som i appen, så kunden debiteras aldrig något annat än det som visas.
- **Licensen kontrolleras offline.** Nyckeln är signerad (ECDSA P-256) och appen verifierar den med en inbyggd publik nyckel – utan nätverk och utan att servern behöver vara uppe.

### Filer

| Fil | Vad |
| --- | --- |
| `src/config/commerce.ts` | Provperiod, planer och priser som visas i appen |
| `src/lib/license.ts` | Licensformatet, verifiering och signering |
| `netlify/functions/*.mts` | Serverfunktionerna (tunna skal) |
| `netlify/lib/` | Logiken: Stripe-klient, prisregler, licensutfärdande, CORS m.m. |
| `netlify/lib/plans.ts` | Serverns kopia av planerna – ett test kräver att den stämmer med `commerce.ts` |
| `netlify/tests/` | Tester (körs med `npm test`) |
| `netlify.toml` | Bygge, `/api/*`, säkerhetsheaders (CSP) och cache |
| `scripts/generate-license-keys.mjs` | Skapar nyckelparet för licenser |
| `scripts/issue-license.mjs` | Utfärdar en licens manuellt |
| `scripts/commerce-guard.ts` | Byggkontroll (via `vite.config.ts`): stoppar skarpa byggen utan giltig publik nyckel och hemligheter i `VITE_`-variabler |
| `.env.example` | Alla miljövariabler med förklaringar |

---

## Testläge utan betalning

Så länge `VITE_COMMERCE_MODE` inte är `live` (eller `VITE_LICENSE_PUBLIC_KEY` saknas) körs appen i **testläge**: köpknappen ger direkt en osignerad testlicens och ingen server behövs. Testlicenser godtas aldrig av en app som är byggd i skarpt läge.

Ett bygge (`vite build`) med `VITE_COMMERCE_MODE=live` men utan en giltig publik nyckel **stoppas** i stället för att tyst bli testläge med gratis testlicenser. Bygget stoppas också om `live` är felstavat eller om en `VITE_`-variabel ser ut att innehålla en hemlighet (`sk_…`, `rk_…`, `whsec_…` eller den privata licensnyckeln) – allt i `VITE_`-variabler byggs in i appen och syns för alla. Kontrollen finns i `scripts/commerce-guard.ts`.

---

## Steg för steg

### 1. Stripe-konto

1. Skapa ett konto på [stripe.com](https://stripe.com) med land **Sverige**. Fyll i företagsuppgifterna (enskild firma eller aktiebolag) och bankkontot för utbetalningar.
2. **Settings → Business → Public details:** företagsnamn, support-e-post, webbplats, *Privacy policy* och *Terms of service* (adressen till köpvillkoren, se steg 8).
3. **Statement descriptor:** t.ex. `LAGOM` – det kunden ser på kontoutdraget.
4. **Settings → Business → Customer emails:** slå på *Successful payments*, så att kunden får ett kvitto via e-post (bekräftelse på varaktigt medium).

Allt nedan görs först i **testläget** (reglaget *Test mode* i Stripe) och sedan en gång till i skarpt läge.

### 2. Produkter och priser

I **Product catalogue → Add product**:

| Produkt | Pris | Typ | Skatt |
| --- | --- | --- | --- |
| Lagom Årslicens | 299,00 SEK | *One-off* (engångs) | *Include tax in price: Yes* |
| Lagom Livstidslicens | 599,00 SEK | *One-off* (engångs) | *Include tax in price: Yes* |

Kopiera prisernas id (`price_…`) till `STRIPE_PRICE_AR` och `STRIPE_PRICE_LIVSTID`.

Servern kontrollerar vid varje nytt köp (resultatet cachas i tio minuter) att priset är aktivt, ett engångspris i SEK, att momsen ingår och att beloppet är exakt det som står i `src/config/commerce.ts`. Stämmer det inte startas inget köp och orsaken skrivs i funktionsloggen, t.ex. `STRIPE_PRICE_AR: priset i Stripe är 349 kr men appen visar 299 kr`.

**Byta pris:** ändra `src/config/commerce.ts` och `netlify/lib/plans.ts` (testerna misslyckas tills de stämmer), skapa ett nytt pris i Stripe och sätt t.ex. `STRIPE_PRICE_AR=price_nytt,price_gammalt`. Det första id:t används för nya köp; äldre köp går fortfarande att verifiera.

**Utan pris-id** skickas priset från koden (`price_data`). Det fungerar för ett snabbt test, men Stripes rapporter blir tydligare med riktiga produkter.

### 3. Betalsätt

**Settings → Payments → Payment methods:** slå på **Kort**, **Apple Pay/Google Pay**, **Klarna** och **Swish** (om Swish finns i listan för ditt konto). Serverfunktionen anger inga betalsätt själv – Stripe Checkout visar de som är påslagna och passar kunden. Checkout visas på svenska.

Om en betalning dröjer svarar servern att den inte är klar ännu, och appen frågar igen en stund senare. Med webhooken (steg 7) utfärdas licensen dessutom automatiskt när betalningen blir klar.

### 4. Moms

- Priserna är **inklusive 25 % moms**, så som konsumentpriser ska anges.
- Du redovisar momsen i momsdeklarationen. Stripes rapporter (**Balance → Reports**) visar försäljning och avgifter per period.
- **Stripe Tax (valfritt):** aktivera Stripe Tax, registrera Sverige och sätt `STRIPE_AUTOMATIC_TAX=on`. Eftersom priserna är "inklusive" ändras inte kundens pris; momsen specificeras på kvittot.
- Säljer du till konsumenter i andra EU-länder över den gemensamma tröskeln (10 000 euro per år) gäller moms i kundens land via OSS. Läs mer hos Skatteverket.

### 5. Nycklar för licenserna

```bash
node scripts/generate-license-keys.mjs
```

Skriptet skriver ut två rader:

- `VITE_LICENSE_PUBLIC_KEY=…` – **publik**, byggs in i appen.
- `LICENSE_PRIVATE_KEY=…` – **hemlig**. Den som har den kan skapa giltiga licenser. Lägg den bara i Netlify, spara en kopia i en lösenordshanterare och checka **aldrig** in den i git.

Skapa **ett par för test** och **ett skarpt par** precis innan du börjar sälja. Byt aldrig det skarpa paret: appen verifierar med den publika nyckeln som den byggdes med, så alla sålda licenser slutar fungera om paret byts.

Kontrollera att paret hör ihop:

```bash
LICENSE_PRIVATE_KEY=… VITE_LICENSE_PUBLIC_KEY=… node scripts/issue-license.mjs --plan ar --days 1
```

### 6. Netlify

1. **Add new site → Import an existing project** och välj repot. Bygginställningarna läses från `netlify.toml` (`npm run build`, `dist`, funktioner i `netlify/functions`, Node 22).
2. **Site configuration → Environment variables.** Välj *Different value for each deploy context* för nycklarna: testvärden för *Deploy Previews*/*Branch deploys*, skarpa för *Production*.

**Vid bygget** (scope *Builds*, syns i appen – inga hemligheter):

| Variabel | Exempel | Beskrivning |
| --- | --- | --- |
| `VITE_COMMERCE_MODE` | `live` | Riktiga köp. Utan den körs testläget. |
| `VITE_LICENSE_PUBLIC_KEY` | `MFkwEwYH…` | Publik nyckel från steg 5 |
| `VITE_SUPPORT_EMAIL` | `hej@lagom-appen.se` | Visas vid köp och i felmeddelanden |
| `VITE_SELLER_NAME` | `Lagom AB` | Säljarens namn (krävs enligt distansavtalslagen) |
| `VITE_API_BASE` | *(tom)* | Bara om funktionerna ligger på en annan adress än appen |

**Serverfunktionerna** (scope *Functions*, markera som hemliga om din plan har det):

| Variabel | Krävs | Beskrivning |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | ja | `sk_…` eller hellre en begränsad nyckel `rk_…` (se nedan) |
| `STRIPE_PRICE_AR` | rekommenderas | Pris-id för Årslicens (fler id:n med kommatecken) |
| `STRIPE_PRICE_LIVSTID` | rekommenderas | Pris-id för Livstidslicens |
| `LICENSE_PRIVATE_KEY` | ja | Privat nyckel från steg 5 |
| `APP_URL` | rekommenderas | Appens adress, t.ex. `https://lagom.netlify.app`. Utan den används webbplatsens adress. |
| `ALLOWED_ORIGINS` | nej | Fler adresser som får anropa funktionerna, t.ex. en egen domän |
| `STRIPE_WEBHOOK_SECRET` | nej | `whsec_…` för webhooken (steg 7) |
| `TERMS_URL` | inför live | Köpvillkoren (steg 8) |
| `STRIPE_AUTOMATIC_TAX` | nej | `on` = Stripe Tax |

**Begränsad Stripe-nyckel** (*Developers → API keys → Create restricted key*): ge bara *Checkout Sessions: Write*, *Prices: Read* och *PaymentIntents: Write*. Allt annat *None*.

3. Driftsätt. `VITE_*`-variabler byggs in i appen, så efter en ändring behövs ett nytt bygge (**Deploys → Trigger deploy**).
4. Vill du ha hårdare skydd mot överbelastning än den enkla begränsningen i funktionerna kan du lägga en regel för `/api/*` under Netlifys *Rate limiting*, om din plan har det.

### 7. Webhook (valfri men rekommenderad)

I Stripe: **Developers → Webhooks → Add endpoint** (i nyare dashboard under *Workbench*):

- Adress: `https://<din-adress>/api/stripe-webhook`
- Händelser: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
- Kopiera *Signing secret* (`whsec_…`) till `STRIPE_WEBHOOK_SECRET`.

Webhooken kontrollerar Stripes signatur (HMAC-SHA256, högst fem minuter gammal), utfärdar licensen för betalda Lagom-köp och sparar den på betalningen – även om kunden stängde fliken. Loggen innehåller bara sessions-id, plan, belopp och status, inga personuppgifter. Testläget och skarpt läge har olika webhooks och olika hemligheter.

### 8. Köpvillkor och ångerrätt

Enligt distansavtalslagen (2 kap. 11 § p. 11) gäller ångerrätten inte digitalt innehåll som levereras direkt, **om** kunden uttryckligen har samtyckt till att leveransen börjar direkt, har bekräftat att ångerrätten då går förlorad, och du har skickat en bekräftelse på avtalet (2 kap. 12 §). Därför:

- **I appen:** köpsidan har en kryssruta för samtycket med länk till köpvillkoren. Appen skickar `consent: true`, och samtycket och tidpunkten sparas i köpets metadata. Servern kräver samtycket: utan `consent: true` skapas inget köp (400 `samtycke-saknas`), inte heller från andra klienter än appen.
- **I Stripe Checkout:** med `TERMS_URL` satt måste kunden även där kryssa i: *"Jag godkänner köpvillkoren och att licensen levereras direkt efter betalningen. Jag förstår att ångerrätten upphör när leveransen har börjat."* Stripe sparar godkännandet på köpet. Kräver att *Terms of service* är ifylld i Stripe (steg 1).
- **Bekräftelsen:** betalningens beskrivning innehåller samtycket och följer med Stripes kvitto. Kontrollera ett kvitto från ett skarpt testköp.

Köpsidan i appen (`#/premium`) har en sammanfattning av villkoren. Inför lanseringen bör köpvillkoren också finnas på en egen adress (t.ex. en sida på webbplatsen) som du anger i `TERMS_URL` och i Stripe.

---

## Testa med Stripes testläge

1. Använd Stripes **testnycklar** (`sk_test_…`/`rk_test_…`), priser skapade i **testläget** och ett **testnyckelpar** för licenserna. Sätt `VITE_COMMERCE_MODE=live` i förhandsversionen så att hela flödet används.
2. Köp med testkort:
   - `4242 4242 4242 4242` – godkänns (valfritt framtida datum, valfri CVC)
   - `4000 0025 0000 3155` – kräver 3D Secure-verifiering
   - `4000 0000 0000 0002` – nekas
   - Klarna och Swish visar en testsida där du kan godkänna eller avbryta betalningen.
3. Kontrollera:
   - [ ] Tacksidan visar licensnyckeln och appen visar rätt plan (och slutdatum för årslicens).
   - [ ] Laddar du om tacksidan kommer **samma** nyckel tillbaka.
   - [ ] I Stripe: **Payments → betalningen → Metadata** har `lagom_license`.
   - [ ] Avbryter du i Checkout kommer du tillbaka till köpsidan och inget dras.
   - [ ] Webhooken svarar 200 (Stripe visar varje leverans).
   - [ ] Licensen fungerar i flygplansläge.

**Lokalt:** installera Netlify CLI (`npm install -g netlify-cli`), lägg variablerna i `.env.local` (ignoreras av git) och kör `netlify dev`. Appen och funktionerna nås då på `http://localhost:8888`. Webhooks lokalt: `stripe listen --forward-to localhost:8888/api/stripe-webhook` (Stripe CLI skriver ut en `whsec_…` att använda). Om säkerhetsheadersna i `netlify.toml` stör Vites utvecklingsserver: kör `npm run build` och sedan `netlify dev --dir dist`.

Snabbtest med curl:

```bash
curl -s -X POST https://<din-adress>/api/create-checkout \
  -H 'Content-Type: application/json' -d '{"plan":"ar","consent":true}'
# → {"url":"https://checkout.stripe.com/c/pay/cs_test_…"}

curl -s -X POST https://<din-adress>/api/verify-purchase \
  -H 'Content-Type: application/json' -d '{"sessionId":"cs_test_…"}'
# → {"licenseKey":"LAGOM1.…","plan":"ar","issuedAt":"…","expiresAt":"…"}
```

---

## Gå live – checklista

- [ ] Stripe-kontot är aktiverat för skarpa betalningar, bankkonto och statement descriptor är klara.
- [ ] Produkter och priser är skapade i **skarpt läge** → `STRIPE_PRICE_AR` och `STRIPE_PRICE_LIVSTID` för *Production*.
- [ ] Skarp nyckel `rk_live_…` → `STRIPE_SECRET_KEY` för *Production*.
- [ ] **Nytt skarpt nyckelpar** → `VITE_LICENSE_PUBLIC_KEY` och `LICENSE_PRIVATE_KEY` för *Production*, med säker kopia. (Licenser från testperioden slutar då gälla – så ska det vara.)
- [ ] `VITE_COMMERCE_MODE=live`, `VITE_SELLER_NAME`, `VITE_SUPPORT_EMAIL` och `APP_URL` är satta. Nytt bygge gjort.
- [ ] **Köpvillkor** publicerade och angivna i `TERMS_URL` och i Stripe. De bör innehålla: säljarens namn, organisationsnummer, adress och e-post; pris inklusive moms; vad licensen ger och hur länge; att årslicensen **inte förnyas automatiskt**; att leveransen sker direkt och att ångerrätten då upphör; reklamation och kontakt; att tvister kan prövas av Allmänna reklamationsnämnden (ARN).
- [ ] **Integritetspolicy:** dagboken lagras bara på användarens enhet. Vid köp behandlar Stripe betal- och kontaktuppgifter. Servern sparar inget eget, loggar bara sessions-id och plan. Licensnyckeln innehåller inga personuppgifter.
- [ ] **Bokföring:** Stripes utbetalningar, avgifter och eventuella återbetalningar bokförs; spara underlagen i sju år. Momsen redovisas.
- [ ] Webhook skapad i **skarpt läge** med egen `STRIPE_WEBHOOK_SECRET`.
- [ ] Ett riktigt köp med eget kort, kontroll av kvitto och licens, och sedan återbetalning i Stripe.

---

## Licenserna

**Format:** `LAGOM1.<innehåll>.<signatur>`. Innehållet är base64url-kodad JSON:

```json
{ "v": 1, "id": "cs_live_…", "plan": "ar", "iat": 1790000000, "exp": 1821536000 }
```

`id` är Stripe-köpets id (eller `lic_…` för manuella licenser), `iat` när köpet gjordes och `exp` när en årslicens går ut (saknas för livstid). Inga namn, ingen e-post. Signaturen är ECDSA P-256/SHA-256.

- **Offline:** appen kontrollerar signaturen med den inbyggda publika nyckeln. Den fungerar utan nät – och fortsätter fungera även om servern skulle stängas.
- **Kan inte förfalskas:** utan den privata nyckeln går det inte att skapa en giltig nyckel eller ändra plan eller datum i en befintlig.
- **Samma köp → samma nyckel:** första gången sparas nyckeln på betalningen i Stripe (`lagom_license`) och återanvänds sedan. Byts nyckelparet (från test till skarpt) signeras en ny. Om tacksidan och webhooken hinner fråga i exakt samma ögonblick kan två nycklar med identiskt innehåll skapas – båda fungerar likadant.
- **Årslicensen** gäller 365 dagar från köpet och förnyas inte. När den har gått ut kan användaren fortfarande se, exportera och radera sin data, och köpa en ny licens när hen vill.

---

## Support: ny enhet, manuell licens, återbetalning

**Ny telefon eller dator.** Licensen gäller på alla kundens egna enheter.

1. Kopiera nyckeln under **Inställningar → Licens** (eller mejla den till dig själv) och klistra in den på samma ställe på den nya enheten.
2. Flytta dagboken med **Inställningar → Data → Säkerhetskopia**: spara på den gamla enheten och återställ på den nya.
3. Har kunden kvar länken till tacksidan ger den samma nyckel igen.

**Kunden har tappat nyckeln.** Sök upp betalningen i Stripe (t.ex. på kundens e-post) och kopiera `lagom_license` från betalningens metadata. Finns den inte där: ta köpets id (`cs_live_…`) och anropa `/api/verify-purchase` enligt curl-exemplet ovan.

**Utfärda en licens manuellt** (reklamation, presskod, förlängd provperiod):

```bash
export LICENSE_PRIVATE_KEY=…              # den skarpa privata nyckeln
export VITE_LICENSE_PUBLIC_KEY=…          # valfritt: kontrollerar att nyckeln fungerar i appen
node scripts/issue-license.mjs --plan livstid --id arende_123
node scripts/issue-license.mjs --plan ar --from 2026-03-01           # årslicens från ett visst datum
node scripts/issue-license.mjs --plan ar --days 30 --id forlangt_prov
```

Kör skriptet på din egen dator och rensa terminalhistoriken efteråt om du klistrade in nyckeln direkt på kommandoraden.

**Återbetalning** görs i Stripe (**Payments → Refund**). En licens som redan har levererats kan inte dras tillbaka eftersom den kontrolleras offline – vi litar på kunden.

---

## Begränsningar

Medvetna avvägningar för en app utan konton där all data stannar på enheten:

- **Provperioden** lagras lokalt. Den som rensar webbplatsdata (eller använder privat läge där inget sparas) kan starta om den. Det är priset för att inte kräva konto eller skicka något om användaren till en server. Den **betalda licensen** kan däremot inte förfalskas. Inom appen går provperioden inte att förlänga: radering, exempeldata, ett nytt välkomstflöde och återställning av en säkerhetskopia behåller alltid den tidigaste starten, och en start i framtiden (klockan ställd framåt när profilen skapades) rättas till nu.
- **Klockan.** Provperioden och årslicensen räknas mot enhetens klocka. Den som ställer tillbaka klockan får också dagboken på fel datum, så det är ingen praktisk väg runt spärren.
- **Spärren finns i appen.** Allt ligger lokalt, så den som ändrar i webbläsarens lagring (eller redigerar en säkerhetskopia och läser in den) kan lägga in data utan licens. Import och export spärras medvetet aldrig – användarens data ska alltid gå att flytta.
- **Licenser kan inte spärras.** En nyckel som delas vidare fungerar även hos andra, och en återbetald eller bestriden betalning drar inte tillbaka nyckeln (`/api/verify-purchase` lämnar också ut den igen för samma köp). Utan konton finns ingen bra motåtgärd; en framtida version kan bygga in en spärrlista.
- **Testköp och skarpa licenser måste ha olika nyckelpar.** Signerar servern med det skarpa nyckelparet medan `STRIPE_SECRET_KEY` är en testnyckel, blir köp med Stripes testkort (4242 …) giltiga licenser i den skarpa appen. Använd därför ett eget testnyckelpar för förhandsversioner och Stripes testläge, och skapa det skarpa paret först när du går live (se checklistan).
- **Nyckelparet kan inte bytas** utan att sålda licenser slutar fungera (se steg 5).
- **Begränsningen av antal anrop** i funktionerna gäller per funktionsinstans och är ett enkelt skydd. Netlifys *Rate limiting* ger ett hårdare.
- **Ingen egen databas.** Köpen finns i Stripe och licensnycklarna i betalningarnas metadata.

---

## API-referens

Alla svar är JSON och cachas aldrig. Fel har formen `{ "code": "…", "error": "…" }`, där `error` är ett svenskt meddelande som kan visas som det är. Anrop från andra webbplatser än appen (`APP_URL`, `ALLOWED_ORIGINS` eller samma adress som funktionerna) nekas. Ett oväntat fel ger 500 `internt-fel` utan detaljer – felmeddelandet finns bara i funktionsloggen.

### `POST /api/create-checkout`

Kropp: `{ "plan": "ar" | "livstid", "consent": true }`. `consent` måste vara exakt `true` (samtycket till omedelbar leverans och att ångerrätten upphör) och sparas i köpets metadata.

| Status | Kod | När |
| --- | --- | --- |
| 200 | – | `{ "url": "https://checkout.stripe.com/…" }` – skicka kunden dit |
| 400 | `ogiltig-plan`, `ogiltig-begaran` | Okänd plan eller ogiltig JSON |
| 400 | `samtycke-saknas` | `consent: true` saknas – inget köp skapas |
| 403 | `fel-ursprung` | Anrop från en annan webbplats |
| 413 | `for-stor` | Kroppen är större än 2 kB |
| 429 | `for-manga` | För många försök (header `Retry-After`) |
| 502 | `betaltjanst-fel` | Stripe svarar inte – försök igen |
| 503 | `ej-konfigurerad` | Inställningar saknas eller priset stämmer inte (se funktionsloggen) |

### `POST /api/verify-purchase`

Kropp: `{ "sessionId": "cs_…" }`.

| Status | Kod | När |
| --- | --- | --- |
| 200 | – | `{ "licenseKey", "plan", "issuedAt", "expiresAt" }` (`expiresAt` är `null` för livstid) |
| 202 | `ej-betald` | `{ "status": "pending", "pending": true }` – betalningen är inte klar, fråga igen om en stund |
| 400 | `ogiltigt-id` | Id:t har fel format |
| 404 | `hittades-inte` | Inget köp med det id:t |
| 410 | `avbruten` | Köpet avbröts eller gick ut |
| 410 | `utgangen` | Årslicensen från köpet har gått ut |
| 422 | `okant-kop` | Köpet gäller inte en Lagom-licens eller beloppet stämmer inte |
| 429, 502, 503 | som ovan | |

### `POST /api/stripe-webhook`

Anropas bara av Stripe. 400 vid ogiltig signatur, 503 om `STRIPE_WEBHOOK_SECRET` saknas, 500 vid tillfälligt fel (Stripe försöker då igen i upp till tre dygn), annars 200.

---

## Felsökning

Titta först i funktionsloggen: **Netlify → Logs → Functions**. Alla rader från Lagom börjar med `[lagom]`.

| Symptom | Trolig orsak |
| --- | --- |
| "Betalningen är inte igång just nu" | Loggen säger vilken variabel som saknas, eller att priset i Stripe inte stämmer med appen. |
| 403 `fel-ursprung` | Appen körs från en adress som inte är `APP_URL` – lägg till den i `ALLOWED_ORIGINS`. |
| Appen godtar inte nyckeln ("kunde inte verifieras") | `VITE_LICENSE_PUBLIC_KEY` och `LICENSE_PRIVATE_KEY` hör inte ihop, eller appen byggdes inte om efter ändringen. Kontrollera med `issue-license.mjs` (steg 5). |
| "Det här är en testlicens" | Appen är byggd i skarpt läge men nyckeln kommer från testläget. |
| Webhooken får 400 | Fel `STRIPE_WEBHOOK_SECRET` (test och skarpt läge har olika) eller en proxy som ändrar kroppen. |
| Temat blinkar vid start eller konsolen visar CSP-fel | Temaskriptet i `index.html` har ändrats. `npm test` visar den nya hashen att lägga in i `netlify.toml`. |
| Produktbilder eller streckkoder laddas inte | En ny extern adress har lagts till i koden men inte i `connect-src`/`img-src` i `netlify.toml`. |
