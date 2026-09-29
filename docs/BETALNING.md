# Betalning och licenser

Lagom är gratis att prova i 14 dagar från att man skapar sin egen profil (exempeldatan räknas inte). Sedan köper man en licens:

| Plan | Pris på webben (inkl. 25 % moms) | Giltighet |
| --- | --- | --- |
| Årslicens | 349 kr | 365 dagar från köpet. **Förnyas inte automatiskt** – inga fler dragningar. |
| Livstidslicens | 699 kr | För alltid. Engångsköp – felrättningar ingår. |

Ingen reklam, inga dolda avgifter och inga konton. Användarens data låses aldrig: efter provperioden kan man fortfarande se, exportera och radera allt – bara ny loggning kräver licens.

**Livstid** betyder att licensen gäller för alltid – den upphör aldrig att gälla, och nyckeln fungerar offline även om servern skulle stängas – och att felrättningar ingår så länge Lagom tillhandahålls. Den lovar _inte_ nya funktioner eller alla framtida uppdateringar. Den slutliga formuleringen beslutar du som ägare – den står i köpvillkoren (`docs/KOPVILLKOR.md`) och i Stripe-texterna i `netlify/lib/plans.ts` och `netlify/lib/handlers.ts`, som ska säga samma sak.

Den här guiden beskriver hur betalningen på **webben** sätts upp med **Stripe** (kort, Klarna, Swish m.m.) och **Netlify** (webbhotell och serverfunktioner), hur licenserna fungerar och vad som måste vara på plats innan du säljer på riktigt. I apparna från App Store och Google Play används **inte** Stripe – se [Appbutikerna](#appbutikerna).

> **Läs detta först.** Guiden är skriven för dig som driver Lagom som enskild firma utan jurist eller revisor. Den förklarar vad koden gör och vad du behöver ställa in, men den är ingen juridisk rådgivning. Där det står _kontrollera_ bör du läsa hos källan (Stripe, Skatteverket, Konsumentverket) eller fråga någon som kan, innan du börjar sälja.

---

## Innehåll

1. [Så fungerar det](#så-fungerar-det)
2. [Testläge utan betalning](#testläge-utan-betalning)
3. [Steg för steg](#steg-för-steg)
4. [Testa med Stripes testläge](#testa-med-stripes-testläge)
5. [Gå live – checklista](#gå-live--checklista)
6. [Appbutikerna](#appbutikerna)
7. [Licenserna](#licenserna)
8. [Återbetalda köp och spärrlistan](#återbetalda-köp-och-spärrlistan)
9. [Support: ny enhet, tappad nyckel, manuell licens, återbetalning](#support-ny-enhet-tappad-nyckel-manuell-licens-återbetalning)
10. [Begränsningar](#begränsningar)
11. [API-referens](#api-referens)
12. [Felsökning](#felsökning)

---

## Så fungerar det

```
 Appen (#/premium)          Netlify Functions                 Stripe
 ─────────────────          ─────────────────                 ──────
 Välj plan + kryssa i  ──►  POST /api/create-checkout  ──►  Kontrollera priset,
 samtycket                  { plan, consent }                skapa Checkout-session
                                                             (med faktura efter köpet)
                                                       ◄──  betalningslänk
 Skickas till Stripe  ────────────────────────────────────►  Kunden betalar
                                                             (kort, Klarna, Swish …)
                                                             Faktura/kvitto mejlas
 #/tack?session_id=…  ◄────────────────────────────────────  Tillbaka till appen
 POST /api/verify-purchase ─► Hämta sessionen, kontrollera
 { sessionId }                att den är betald, gäller
                              Lagom och inte är återbetald,
                              signera licensnyckeln och
                              spara den på betalningen  ──►  metadata "lagom_license"
 Licensnyckel  ◄────────────  { licenseKey }
 verifieras offline och sparas i appen

 (valfritt) Stripe-webhook ──► /api/stripe-webhook: samma utfärdande direkt när betalningen är klar,
                               och notering av återbetalda/bestridda köp ("lagom_status").
 Appen, en gång per dygn ────► GET /api/license-revocations: signerad spärrlista över återbetalda köp.
 "Tappat nyckeln?" ──────────► POST /api/recover-license { email, receipt }: samma nyckel igen.
```

- **Ingen databas och inga konton.** Den enda platsen där köpet finns är Stripe. Licensnyckeln sparas som metadata på betalningen, så att supporten alltid kan hitta den.
- **Planen bestäms av servern.** Klienten skickar bara vilken plan kunden vill köpa; vid verifieringen läses planen från köpet i Stripe och kontrolleras mot det som faktiskt betalades.
- **Priset kontrolleras.** Servern vägrar starta ett köp om priset i Stripe inte är exakt samma som i appen, så kunden debiteras aldrig något annat än det som visas.
- **Licensen kontrolleras offline.** Nyckeln är signerad (ECDSA P-256) och appen verifierar den med en inbyggd publik nyckel – utan nätverk och utan att servern behöver vara uppe.
- **Återbetalda köp spärras.** Ett helt återbetalt eller bestritt köp ger ingen nyckel, och appen hämtar en signerad spärrlista så att en redan aktiverad nyckel slutar gälla (se [spärrlistan](#återbetalda-köp-och-spärrlistan)).

### Filer

| Fil | Vad |
| --- | --- |
| `src/config/commerce.ts` | Provperiod, planer och priser som visas i appen |
| `src/lib/license.ts` | Licensformatet, verifiering, signering och spärrlistans format |
| `netlify/functions/*.mts` | Serverfunktionerna (tunna skal) |
| `netlify/lib/handlers.ts` | Köp, verifiering och webhook, CORS och anropsbegränsning |
| `netlify/lib/fulfillment.ts` | Från betald session till licensnyckel, och regeln för återbetalda köp |
| `netlify/lib/revocations.ts` | Spärrlistan (`/api/license-revocations`) |
| `netlify/lib/recover.ts` | "Hämta min licensnyckel igen" (`/api/recover-license`) |
| `netlify/lib/recipeFetch.ts` | Receptimporten (`/api/recipe-fetch`) med skydd mot anrop till interna adresser |
| `netlify/lib/plans.ts` | Serverns kopia av planerna – ett test kräver att den stämmer med `commerce.ts` |
| `netlify/tests/` | Tester (körs med `npm test`) |
| `netlify.toml` | Bygge, `/api/*`, anropsbegränsning, säkerhetsheaders (CSP) och cache |
| `scripts/generate-license-keys.mjs` | Skapar nyckelparet för licenser |
| `scripts/issue-license.mjs` | Utfärdar en licens manuellt |
| `scripts/commerce-guard.ts` | Byggkontroll (via `vite.config.ts`): stoppar skarpa byggen och butiksbyggen utan giltig publik nyckel eller säljaruppgifter, hemligheter i `VITE_`-variabler och butiksbyggen där koden för webbköp (Stripe Checkout, tacksidan, "Tappat nyckeln?", i App Store-bygget även aktiveringen av licensnycklar) finns kvar i paketet (`findWebPurchaseCode`, körs av `vite.config.ts`) |
| `.env.example` | Alla miljövariabler med förklaringar |

---

## Testläge utan betalning

Så länge `VITE_COMMERCE_MODE` inte är `live` (eller den publika licensnyckeln saknas) körs appen i **testläge**: köpknappen ger direkt en osignerad testlicens och ingen server behövs. Testlicenser godtas aldrig av en app som är byggd i skarpt läge, och aldrig i butiksapparna.

Ett bygge (`vite build`) med `VITE_COMMERCE_MODE=live` men utan en giltig publik nyckel **stoppas** i stället för att tyst bli testläge med gratis testlicenser. Bygget stoppas också om `live` är felstavat, om en `VITE_`-variabel ser ut att innehålla en hemlighet (`sk_…`, `rk_…`, `whsec_…` eller den privata licensnyckeln), om säljarens uppgifter saknas i ett skarpt bygge eller butiksbygge, och om ett produktionsbygge på Netlify görs i testläge utan `LAGOM_ALLOW_TEST_COMMERCE=1`. Kontrollen finns i `scripts/commerce-guard.ts`.

Serverfunktionerna gör samma sak för köpen: med en skarp Stripe-nyckel (`sk_live_…`/`rk_live_…`) startas inga köp förrän säljarens uppgifter finns (se steg 6). Med en testnyckel används platshållare som `[Företagsnamn]` på fakturan, så att allt kan provas innan företagsuppgifterna är klara.

---

## Steg för steg

### 1. Stripe-konto

1. Skapa ett konto på [stripe.com](https://stripe.com) med land **Sverige**. Som företagstyp väljer du **enskild firma** (på engelska _Individual / Sole proprietorship_). Fyll i dina uppgifter och bankkontot för utbetalningar.
2. **Settings → Business → Public details:** företagsnamn (för enskild firma ditt namn eller firmanamnet), support-e-post, webbplats, **Privacy policy** (adressen till integritetspolicyn, t.ex. `https://<din domän>/integritet/`) och **Terms of service** (adressen till köpvillkoren, t.ex. `https://<din domän>/villkor/`, se steg 8). _Terms of service_ måste vara ifylld för att kryssrutan för köpvillkoren i Checkout ska fungera.
3. **Statement descriptor:** t.ex. `LAGOM` – det kunden ser på kontoutdraget.
4. **Settings → Business → Customer emails:** slå på **Successful payments**. Då mejlar Stripe kvittot och fakturan till kunden efter köpet – det är bekräftelsen på varaktigt medium som distansavtalslagen kräver (se steg 8).
5. **Fakturor efter köpet (avgift):** varje köp skapar en faktura i Stripe (`invoice_creation`), med dina uppgifter, samtycket och villkorsversionen i sidfoten. Stripe kan ta en **extra avgift per faktura** (Stripe Invoicing) utöver kortavgiften. Kontrollera den aktuella avgiften på [stripe.com/se/pricing](https://stripe.com/se/pricing) (under _Invoicing_) innan du går live, så att du vet vad varje köp kostar dig. Efter testköpet i steg 9 ser du den faktiska avgiften på betalningen.

Allt nedan görs först i **testläget** (reglaget _Test mode_ i Stripe) och sedan en gång till i skarpt läge.

### 2. Produkter och priser

I **Product catalogue → Add product**:

| Produkt | Pris | Typ | Skatt |
| --- | --- | --- | --- |
| Lagom Årslicens | 349,00 SEK | _One-off_ (engångs) | _Include tax in price: Yes_ |
| Lagom Livstidslicens | 699,00 SEK | _One-off_ (engångs) | _Include tax in price: Yes_ |

Beskrivningar (kopiera gärna): Årslicens – _"Full tillgång till Lagom i 365 dagar. Förnyas inte automatiskt."_ Livstidslicens – _"Full tillgång till Lagom för alltid, utan årsavgift. Engångsköp – felrättningar ingår."_ Lova inte "alla framtida uppdateringar".

Kopiera prisernas id (`price_…`) till `STRIPE_PRICE_AR` och `STRIPE_PRICE_LIVSTID`.

Servern kontrollerar vid varje nytt köp (resultatet cachas i tio minuter) att priset är aktivt, ett engångspris i SEK, att momsen ingår och att beloppet är exakt det som står i `src/config/commerce.ts`. Stämmer det inte startas inget köp och orsaken skrivs i funktionsloggen, t.ex. `STRIPE_PRICE_AR: priset i Stripe är 299 kr men appen visar 349 kr`.

**Byta pris:** ändra `src/config/commerce.ts` och `netlify/lib/plans.ts` (testerna misslyckas tills de stämmer), skapa ett nytt pris i Stripe och sätt t.ex. `STRIPE_PRICE_AR=price_nytt,price_gammalt`. Det första id:t används för nya köp; äldre köp går fortfarande att verifiera. Arkivera det gamla priset i Stripe först när inga fler köp startas med det.

**Äldre köp efter en prisändring.** Lägg det gamla priset i `legacyPriceKr` i `netlify/lib/plans.ts` (i dag 299 kr för Årslicens och 599 kr för Livstidslicens). Då går köp till det gamla priset alltid att verifiera och hämta igen med "Tappat nyckeln?" – även utan pris-id (`price_data`), där det inte finns något id att behålla. Nya köp görs alltid till dagens pris.

**Utan pris-id** skickas priset från koden (`price_data`). Det fungerar för ett snabbt test, men Stripes rapporter blir tydligare med riktiga produkter.

### 3. Betalsätt och försäljning bara i Sverige

**Settings → Payments → Payment methods:** slå på **Kort**, **Apple Pay/Google Pay**, **Klarna** och **Swish** (om Swish finns i listan för ditt konto). Serverfunktionen anger inga betalsätt själv – Stripe Checkout visar de som är påslagna och passar kunden. Checkout visas på svenska.

**Adaptive Pricing** (_Settings → Payments → Adaptive Pricing_, lokala valutor) ska vara **av**: priset ska visas och betalas i kronor inklusive moms, precis som i appen, och servern godkänner bara köp i SEK.

**Försäljning bara till kunder i Sverige.** Lanseringen sker bara i Sverige. Stripe Checkout har ingen inställning som stänger ute andra länder helt, så gör så här:

- Checkout **kräver fakturaadress** (`billing_address_collection: required`, inställt i koden). Landet står på fakturan och syns på betalningen i Stripe (**Payments** → filtrera eller titta på _Billing details_), så att du vet var kunderna bor.
- Marknadsför bara i Sverige, visa priser bara i SEK och skriv i köpvillkoren att erbjudandet gäller konsumenter i Sverige.
- **Radar-regel (valfritt):** har ditt konto egna Radar-regler (ingår i _Radar for Fraud Teams_, som kostar extra) kan du blockera kort som är utgivna utanför Sverige med regeln `Block if :card_country: != 'SE'`. Tänk på att den också stoppar svenskar med utländska kort. Klarna och Swish påverkas inte av regeln.
- **Stripe Tax (valfritt, se steg 4):** registrera bara Sverige. Stripe räknar då ut momsen utifrån kundens adress och varnar i _Tax → Registrations_ om du närmar dig gränser i andra länder.
- Köper någon utanför Sverige ändå är köpet giltigt och ska levereras. Under EU:s gemensamma tröskel (10 000 euro per år för försäljning till konsumenter i andra EU-länder) gäller svensk moms. Kontrollera reglerna hos Skatteverket om det börjar bli många sådana köp.

Om en betalning dröjer svarar servern att den inte är klar ännu, och appen frågar igen en stund senare. Med webhooken (steg 7) utfärdas licensen dessutom automatiskt när betalningen blir klar.

### 4. Moms

- Priserna är **inklusive 25 % moms**, så som konsumentpriser ska anges.
- **Momsbefrielse:** en enskild firma med låg omsättning (i skrivande stund högst 120 000 kr per år) kan vara befriad från moms och ska då **inte** ta ut moms. Kontrollera hos Skatteverket vad som gäller för dig innan du går live. Är du momsbefriad: lämna `VITE_SELLER_VAT` tom, använd inte Stripe Tax och se över texten "inkl. 25 % moms" i appen och i köpvillkoren tillsammans med någon som kan.
- Är du momsregistrerad redovisar du momsen i momsdeklarationen. Stripes rapporter (**Balance → Reports**) visar försäljning och avgifter per period.
- **Stripe Tax (valfritt):** aktivera Stripe Tax, registrera Sverige och sätt `STRIPE_AUTOMATIC_TAX=on`. Eftersom priserna är "inklusive" ändras inte kundens pris; momsen specificeras på kvittot och fakturan.

### 5. Nycklar för licenserna

```bash
node scripts/generate-license-keys.mjs
```

Skriptet skriver ut två rader:

- `VITE_LICENSE_PUBLIC_KEY=…` – **publik**, byggs in i appen.
- `LICENSE_PRIVATE_KEY=…` – **hemlig**. Den som har den kan skapa giltiga licenser. Lägg den bara i Netlify, spara en kopia i en lösenordshanterare och checka **aldrig** in den i git.

Skapa **ett par för test** och **ett skarpt par** precis innan du börjar sälja. Varje licens innehåller ett nyckel-id (`kid`, de första 8 tecknen av en SHA-256-hash av den publika nyckeln), så att appen vet vilken nyckel som signerade. Ett nyckelbyte är möjligt men ska planeras – se [Byta nyckelpar](#byta-nyckelpar).

Kontrollera att paret hör ihop:

```bash
LICENSE_PRIVATE_KEY=… VITE_LICENSE_PUBLIC_KEY=… node scripts/issue-license.mjs --plan ar --days 1
```

### 6. Netlify

1. **Add new site → Import an existing project** och välj repot. Bygginställningarna läses från `netlify.toml` (`npm run build`, `dist`, funktioner i `netlify/functions`, Node 22).
2. **Site configuration → Environment variables.** Välj _Different value for each deploy context_ för nycklarna: testvärden för _Deploy Previews_/_Branch deploys_, skarpa för _Production_.

**Vid bygget** (syns i appen – inga hemligheter):

| Variabel | Exempel | Beskrivning |
| --- | --- | --- |
| `VITE_DISTRIBUTION` | `web` | `web` för webbversionen. `appstore`/`play` bara för butiksbyggena. |
| `VITE_COMMERCE_MODE` | `live` | Riktiga köp. Utan den körs testläget. |
| `VITE_LICENSE_PUBLIC_KEY` | `MFkwEwYH…` | Publik nyckel från steg 5 |
| `VITE_LICENSE_PUBLIC_KEYS` | _(tom)_ | Bara vid nyckelbyte: flera publika nycklar, den nuvarande först |
| `VITE_SUPPORT_EMAIL` | `hej@<din domän>` | Visas vid köp, i felmeddelanden och på fakturan. `…@example.invalid` är bara en platshållare. |
| `VITE_SELLER_NAME` | `Anna Andersson` | Säljarens namn (för enskild firma ditt namn eller firmanamnet) |
| `VITE_SELLER_ORGNR` | _(tom)_ | Organisationsnummer – för enskild firma ditt personnummer. **Frivilligt**: saknas det utelämnas det i appen, i villkoren och på fakturan, och bygget ger bara en varning (se rutan nedan). |
| `VITE_SELLER_ADDRESS` | `Storgatan 1, 123 45 Småstad` | Postadress |
| `VITE_SELLER_PHONE` | `070-123 45 67` | Telefonnummer |
| `VITE_SELLER_VAT` | _(tom)_ | Momsregistreringsnummer, bara om du är momsregistrerad |
| `VITE_TERMS_URL` | `https://<din domän>/villkor/` | Köpvillkoren. Bygget varnar när den saknas i skarpt läge – sätt samma adress i `TERMS_URL` för funktionerna, så att köparen godkänner villkoren i Stripe. |
| `VITE_WEB_SALES` | _(tom)_ | `off` = inga köp på webben (Lagom säljs då bara i appbutikerna). Tomt = på. |
| `VITE_APPSTORE_URL`, `VITE_PLAY_URL` | _(tomma)_ | Länkar till Lagom i App Store och Google Play. Visas på köpsidan när webbförsäljningen är av. |
| `VITE_API_BASE` | _(tom)_ | Bara om funktionerna ligger på en annan adress än appen (alltid i butiksbyggena). Lägg då också till adressen i `connect-src` i `netlify.toml`, annars stoppar CSP:n anropen. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | _(tomma)_ | Lämna tomma – Lagom Moln är avstängt i version 1.0 och ingen egen databas används |
| `LAGOM_ALLOW_TEST_COMMERCE` | _(tom)_ | `1` = ett produktionsbygge i testläge är avsiktligt (t.ex. före lanseringen). Sätt den för _Production_ tills skarpt läge är klart – annars stoppas produktionsbygget. Förhandsvisningar och grenbyggen har den redan (`netlify.toml`). Ta bort den när du börjar sälja. Ge den scope **Builds** och **Functions**: funktionerna använder den också (se "Testköp i produktionen" nedan). |
| `VITE_ACCEPT_TEST_PURCHASES` | _(tom)_ | **Sätt aldrig själv för Production.** `1` = appen godtar licenser från köp med Stripes testkort (`cs_test_…`) även i skarpt läge. Förhandsvisningar och grenbyggen har den redan (`netlify.toml`); byggkontrollen stoppar ett produktionsbygge eller butiksbygge med den. |
| `LAGOM_ALLOW_STORE_WITHOUT_IAP` | _(tom)_ | Bara för butiksbyggen på din egen dator: `1` = bygg App Store-/Play-appen fast köp i appen inte är inkopplade (för simulator och skärmdumpar). Ett sådant bygge får **aldrig** skickas in. |

> **Säljarens uppgifter behövs på två ställen.** `VITE_SELLER_*` och `VITE_SUPPORT_EMAIL` byggs in i appen **och** läses av serverfunktionerna, som skriver dem på fakturan. Ge dem därför scope **Builds** och **Functions** (eller _All scopes_) i Netlify. Saknas de för funktionerna startas inga skarpa köp, och loggen säger vilka som fattas.
>
> **Personnummer på fakturan – frivilligt tills vidare.** För en enskild firma är organisationsnumret ditt personnummer. Sätter du `VITE_SELLER_ORGNR` står det i appen, i villkoren och på varje faktura. Distansavtalslagen (2 kap. 2 §) kräver säljarens namn, adress, telefon och e-post; e-handelslagen (8 §) kräver ett registreringsnummer om firman finns i handelsregistret (hos Bolagsverket). Såvitt vi vet behöver en enskild firma som **inte** är registrerad där inte visa personnumret – men det är **inte kontrollerat av en jurist**. Fråga Verksamt eller en jurist, och lämna variabeln tom om du får klartecken. Observera: är firman momsregistrerad innehåller momsregistreringsnumret (`VITE_SELLER_VAT`, `SE` + personnumret + `01`) ändå personnumret, och det måste stå på fakturan.

**Serverfunktionerna** (hemliga, markera som hemliga om din plan har det):

| Variabel | Krävs | Beskrivning |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | ja | `sk_…` eller hellre en begränsad nyckel `rk_…` (se nedan) |
| `STRIPE_PRICE_AR` | rekommenderas | Pris-id för Årslicens (fler id:n med kommatecken) |
| `STRIPE_PRICE_LIVSTID` | rekommenderas | Pris-id för Livstidslicens |
| `LICENSE_PRIVATE_KEY` | ja | Privat nyckel från steg 5 |
| `APP_URL` | rekommenderas | Appens adress, t.ex. `https://lagom.netlify.app`. Utan den används webbplatsens adress. Kunden skickas alltid hit efter betalningen när köpet kommer från appen. |
| `ALLOWED_ORIGINS` | nej | Fler adresser som får anropa funktionerna, t.ex. en egen domän |
| `ALLOWED_NATIVE_ORIGINS` | nej | Ursprung för iPhone-appen. Tomt = `capacitor://localhost,https://localhost`; `off` = inga. Bara exakt de två formerna godtas. Stripe-köp kan aldrig startas därifrån. |
| `STRIPE_WEBHOOK_SECRET` | rekommenderas | `whsec_…` för webhooken (steg 7) |
| `TERMS_URL` | inför live | Köpvillkoren (steg 8) |
| `TERMS_VERSION` | nej | Köpvillkorens version, t.ex. `2026-10-01` (standard). Sparas på varje köp och står på fakturan. Ändra när du publicerar nya villkor. |
| `STRIPE_AUTOMATIC_TAX` | nej | `on` = Stripe Tax |
| `LICENSE_REVOKED_IDS` | nej | Licenser som ska spärras utan återbetalning (köp-id eller nyckelhashar, kommaseparerade) |

**Begränsad Stripe-nyckel** (_Developers → API keys → Create restricted key_). Ge bara de här behörigheterna, allt annat _None_:

| Resurs | Behörighet | Används till |
| --- | --- | --- |
| Checkout Sessions | Write | Starta köp, läsa köp och söka köp för "Hämta min licensnyckel igen" |
| Prices | Read | Kontrollera priset |
| Payment Intents | Write | Spara licensnyckeln och köpets status (`lagom_status`) på betalningen |
| Charges | Read | Se om köpet är återbetalt eller bestritt |
| Refunds | Read | Spärrlistan |
| Disputes | Read | Spärrlistan och kontroll av tvister |

3. Driftsätt. `VITE_*`-variabler byggs in i appen, så efter en ändring behövs ett nytt bygge (**Deploys → Trigger deploy**).

#### Anropsbegränsning

Netlifys **rate limiting** står i varje funktion (`export const config = { path, rateLimit }` i `netlify/functions/*.mts`) och räknas i Netlifys nätverk innan funktionen anropas – över alla kopior av funktionen. En funktion med egen `path` nås **bara** på `/api/<namn>` – inte via `/.netlify/functions/<namn>` – så gränserna går inte att kringgå. Över gränsen svarar Netlify `429`. Funktionerna har dessutom en enkel begränsning i minnet (per kopia) som extra skydd.

Gränserna räknas per besökare (IP-adress) på webbplatsen: `aggregateBy: ['ip', 'domain']`, som finns i alla Netlify-planer. En gemensam gräns för hela webbplatsen (`['domain']` ensamt) kräver Enterprise med High-Performance Edge och används inte. Fönstret (`windowSize`) får vara 1–180 sekunder.

| Adress | Gräns i Netlify | Varför |
| --- | --- | --- |
| `/api/create-checkout` | 10 per minut och IP-adress | Skapar köp i Stripe |
| `/api/verify-purchase` | 30 per minut och IP-adress | Tacksidan frågar flera gånger medan betalningen blir klar |
| `/api/recover-license` | 5 per 3 minuter och IP-adress (i funktionen dessutom 5 per 10 minuter per IP-adress, 10 per timme per e-postadress och minst 1,5 sekunder per svar utan licens) | Skyddar mot att någon provar sig fram med e-post och kvittonummer |
| `/api/recipe-fetch` | 10 per minut och IP-adress | Hämtar andra webbplatser åt appen. Kräver dessutom appens ursprung (Origin) – anrop från curl och skript nekas. |
| `/api/license-revocations` | 60 per minut och IP-adress | Spärrlistan (svaret cachas en timme) |
| `/api/stripe-webhook` | ingen | Stripe skickar händelser i klump; signaturen kontrolleras alltid |

**"Tappat nyckeln?" har ingen gemensam gräns för hela webbplatsen.** Tidigare gällde 20 försök per 3 minuter för alla besökare tillsammans (`aggregateBy: ['domain']`). Den regeln togs bort 2026-09-29 eftersom en gräns bara per domän enligt uppgift kräver Enterprise med High-Performance Edge – **uppgiften kunde inte kontrolleras** (Netlifys dokumentation gick inte att nå från byggmiljön). Nu gäller 5 försök per 3 minuter och IP-adress i Netlify, plus gränserna i funktionens minne (per kopia). Med många IP-adresser går det alltså att prova fler kombinationer av e-post och kvittonummer än förut. Risken bedöms som låg: kvittonumret har 8 siffror (100 miljoner möjligheter per e-postadress), fel e-post och fel nummer ger samma svar och samma svarstid, och det enda som går att vinna är en licens. En egen räknare för hela webbplatsen (t.ex. i Netlify Blobs) kräver ett nytt paket och ägarens godkännande, och en gemensam gräns gör det dessutom möjligt för vem som helst att stänga av "Tappat nyckeln?" för alla genom att fylla kvoten. **Att göra före lansering:** kontrollera i Netlifys UI (eller med Netlifys support) om planen godtar en regel med bara `aggregateBy: ['domain']`. Gör den det kan `config.rateLimit` i `netlify/functions/recover-license.mts` bytas till `{ windowLimit: 20, windowSize: 180, aggregateBy: ['domain'] }` (ändra samtidigt `netlify/tests/netlify-toml.test.ts`) – gränsen per IP-adress i funktionens minne gäller ändå.

> **Obs:** Netlify hoppar **tyst** över en `rateLimit` som är felskriven (ett felstavat fält eller fel typ) – det syns inte i driftsättningsloggen. En ensam sträng i `aggregateBy` (`'ip'` i stället för `['ip', 'domain']`) blir dessutom en gräns för hela webbplatsen. Testet `netlify/tests/netlify-toml.test.ts` kontrollerar därför formen och gränserna exakt – ändra dem där samtidigt. Prova alltid i en förhandsvisning.

**Kontrollera i en förhandsvisning (deploy preview).** Reglerna följer med varje driftsättning, även förhandsvisningar. Byt `<adress>` mot förhandsvisningens adress, t.ex. `https://deploy-preview-12--lagom.netlify.app`:

```bash
URL=https://<adress>
# 1. Adresserna: den gamla ska inte finnas, den nya svarar (400 = fel parameter, som väntat).
curl -s -o /dev/null -w "%{http_code}\n" "$URL/.netlify/functions/recover-license"   # 404
curl -s -o /dev/null -w "%{http_code}\n" "$URL/api/license-revocations?x=1"          # 400

# 2. Gränsen: sex ogiltiga försök i rad mot "Tappat nyckeln?" (inget anrop till Stripe görs).
for i in 1 2 3 4 5 6; do
  curl -s -o svar.txt -w "%{http_code} " -X POST -H "Content-Type: application/json" -d '{}' "$URL/api/recover-license"
  head -c 80 svar.txt; echo
done
```

De fem första ska ge `400` (`{"code":"ogiltig-epost",…}`), eller `503` om förhandsvisningen saknar Stripe- och licensnycklarna. Det sjätte ska ge `429` **utan** Lagoms JSON (`"code":"for-manga"`) – då kom svaret från Netlify innan funktionen anropades, och funktionsloggen (Logs → Functions) visar bara fem anrop. Ger det sjätte `429` med `"for-manga"`, eller `400`/`503`, gäller inte Netlifys regel: kontrollera `config` i funktionen och kör testet ovan. Vänta 3 minuter innan du provar igen (gränsen gäller din IP-adress).

Om din Netlify-plan har ett tak för antalet regler (Lagom har fem), eller inte godtar en regel, säger driftsättningen eller provet ovan till. Ta då först bort `rateLimit` ur `license-revocations`, sedan ur `verify-purchase` – adressen `path` ska stå kvar, och begränsningen i funktionernas minne gäller alltid. Lägg inga `[[redirects]]` för `/api/` i `netlify.toml`: de skulle peka på `/.netlify/functions/…`, som inte längre finns.

### 7. Webhook (rekommenderad)

I Stripe: **Developers → Webhooks → Add endpoint** (i nyare dashboard under _Workbench_):

- Adress: `https://<din adress>/api/stripe-webhook`
- Händelser:
  - `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` – utfärda licensen
  - `charge.refunded`, `charge.dispute.created` – markera återbetalda och bestridda köp
  - `charge.dispute.funds_withdrawn`, `charge.dispute.closed` – följa upp tvister (en vunnen tvist tar bort spärren)
- Kopiera _Signing secret_ (`whsec_…`) till `STRIPE_WEBHOOK_SECRET`.

Webhooken kontrollerar Stripes signatur (HMAC-SHA256, högst fem minuter gammal), utfärdar licensen för betalda Lagom-köp och sparar den på betalningen – även om kunden stängde fliken. Vid full återbetalning eller tvist skriver den `lagom_status` på betalningen (bara information – spärren räknas fram ur Stripes återbetalningar och tvister, se [spärrlistan](#återbetalda-köp-och-spärrlistan)). Loggen innehåller bara id:n, plan, belopp och status, inga personuppgifter. Testläget och skarpt läge har olika webhooks och olika hemligheter.

Spärren fungerar även utan webhook – verifieringen och spärrlistan läser återbetalningar och tvister direkt från Stripe – men markeringen gör det lätt att se i Stripes dashboard.

### 8. Köpvillkor, ångerrätt och bekräftelsen

Enligt distansavtalslagen (2 kap. 11 § p. 11) gäller ångerrätten inte digitalt innehåll som levereras direkt, **om** kunden uttryckligen har samtyckt till att leveransen börjar direkt, har bekräftat att ångerrätten då går förlorad, och du har skickat en bekräftelse på avtalet på ett varaktigt medium, t.ex. e-post (2 kap. 12 §). Därför:

- **I appen:** köpsidan har en kryssruta för samtycket med länk till köpvillkoren. Appen skickar `consent: true`, och samtycket och tidpunkten sparas i köpets metadata tillsammans med villkorsversionen (`villkor_version`). Servern kräver samtycket: utan `consent: true` skapas inget köp (400 `samtycke-saknas`), inte heller från andra klienter än appen.
- **I Stripe Checkout:** med `TERMS_URL` satt måste kunden även där kryssa i: _"Jag godkänner köpvillkoren och att licensen levereras direkt efter betalningen. Jag förstår att ångerrätten upphör när leveransen har börjat."_ Stripe sparar godkännandet på köpet. Kräver att _Terms of service_ är ifylld i Stripe (steg 1).
- **Bekräftelsen:** Stripe skapar en **faktura** efter köpet och mejlar den med kvittot (kräver _Successful payments_ i steg 1). Fakturan har:
  - fälten **Licens** (planens namn) och **Villkor** (köpvillkorens version),
  - en sidfot med säljarens namn, organisationsnummer, adress, telefon och e-post; _"Licensen är personlig. Årslicensen gäller 365 dagar och förnyas inte."_ (för livstid: _"Livstidslicensen är ett engångsköp som gäller för alltid."_); _"Du samtyckte till omedelbar leverans och att ångerrätten därmed upphörde (2 kap. 11 § distansavtalslagen)."_ och _"Reklamation enligt konsumentköplagen. Tvister: Allmänna reklamationsnämnden, www.arn.se."_
- Betalningens beskrivning innehåller också samtycket.

Köpvillkoren finns i `docs/KOPVILLKOR.md` och publiceras på `/villkor/`. Ange adressen i `TERMS_URL`, `VITE_TERMS_URL` och i Stripe. Byter du villkor: publicera de nya, höj `TERMS_VERSION` och gör ett nytt bygge.

### 9. Kontrollera fakturan och gör ett skarpt testköp

Innan du börjar sälja, i **skarpt läge** med alla uppgifter ifyllda:

1. Köp en Årslicens med ditt eget kort.
2. Kontrollera **mejlet från Stripe**: kvittot och fakturan ska komma, och fakturans sidfot ska visa dina riktiga uppgifter (inga `[Företagsnamn]` eller `[Org.nr]`), samtycket och villkorsversionen.
3. Kontrollera i Stripe vad köpet kostade dig: **Payments → betalningen → avgifterna** (kortavgift och eventuell fakturaavgift).
4. Aktivera nyckeln i appen.
5. Återbetala köpet i Stripe (**Payments → Refund**, hela beloppet). Stripe behåller normalt sin avgift vid en återbetalning, så testet kostar dig några kronor. Kontrollera att tacksidans länk nu svarar "Köpet har återbetalats …" och – inom ett dygn, när appen har hämtat spärrlistan – att appen visar att licensen har återkallats.

---

## Testa med Stripes testläge

1. Använd Stripes **testnycklar** (`sk_test_…`/`rk_test_…`), priser skapade i **testläget** och ett **testnyckelpar** för licenserna – **aldrig** samma `LICENSE_PRIVATE_KEY` som i produktionen. Sätt `VITE_COMMERCE_MODE=live` i förhandsversionen så att hela flödet används. (Förhandsversionen godtar licenser från testkort tack vare `VITE_ACCEPT_TEST_PURCHASES=1` i `netlify.toml`.)
2. Köp med testkort:
   - `4242 4242 4242 4242` – godkänns (valfritt framtida datum, valfri CVC)
   - `4000 0025 0000 3155` – kräver 3D Secure-verifiering
   - `4000 0000 0000 0002` – nekas
   - `4000 0000 0000 0259` – godkänns men bestrids direkt (för att testa spärren)
   - Klarna och Swish visar en testsida där du kan godkänna eller avbryta betalningen.
3. Kontrollera:
   - [ ] Tacksidan visar licensnyckeln och appen visar rätt plan (och slutdatum för årslicens).
   - [ ] Laddar du om tacksidan kommer **samma** nyckel tillbaka.
   - [ ] I Stripe: **Payments → betalningen → Metadata** har `lagom_license`.
   - [ ] I Stripe: **Invoices** har en faktura för köpet med sidfoten och fälten Licens och Villkor. (I testläget mejlar Stripe inte kunden automatiskt – öppna betalningen och välj _Send receipt_ för att se mejlet.)
   - [ ] Avbryter du i Checkout kommer du tillbaka till köpsidan och inget dras.
   - [ ] Webhooken svarar 200 (Stripe visar varje leverans).
   - [ ] Licensen fungerar i flygplansläge.
   - [ ] "Tappat nyckeln?" med köpets e-post och kvittonummer (eller köp-id:t `cs_test_…`) ger samma nyckel. Fakturanumret godtas inte (det är löpande och går att gissa).
   - [ ] Efter en full återbetalning: tacksidan svarar 410, betalningen har `lagom_status = aterbetald` och `/api/license-revocations` har en post till (köp-id:t står där som en hash, se [spärrlistan](#återbetalda-köp-och-spärrlistan)).

**Lokalt:** installera Netlify CLI (`npm install -g netlify-cli`), lägg variablerna i `.env.local` (ignoreras av git) och kör `netlify dev`. Appen och funktionerna nås då på `http://localhost:8888`. Webhooks lokalt: `stripe listen --forward-to localhost:8888/api/stripe-webhook` (Stripe CLI skriver ut en `whsec_…` att använda). Om säkerhetsheadersna i `netlify.toml` stör Vites utvecklingsserver: kör `npm run build` och sedan `netlify dev --dir dist`.

Snabbtest med curl:

```bash
curl -s -X POST https://<din adress>/api/create-checkout \
  -H 'Content-Type: application/json' -d '{"plan":"ar","consent":true}'
# → {"url":"https://checkout.stripe.com/c/pay/cs_test_…"}

curl -s -X POST https://<din adress>/api/verify-purchase \
  -H 'Content-Type: application/json' -d '{"sessionId":"cs_test_…"}'
# → {"licenseKey":"LAGOM1.…","plan":"ar","issuedAt":"…","expiresAt":"…"}

curl -s https://<din adress>/api/license-revocations
# → {"token":"LAGOMREV1.…","issuedAt":…}
```

### Testköp i produktionen – och skarpa köp i förhandsversioner

Ett köp med Stripes testkort (`4242 …`) får aldrig bli en giltig licens i den skarpa appen, inte ens om en förhandsversion av misstag delar `LICENSE_PRIVATE_KEY` med produktionen:

- **Servern** vägrar lämna ut en licens för ett testköp (`livemode: false`) i produktionen (`ej-konfigurerad`, och loggen säger varför) – utom när `LAGOM_ALLOW_TEST_COMMERCE=1` är satt för funktionerna före lanseringen. Omvänt ger ett skarpt köp ingen licens i en förhandsversion eller ett grenbygge.
- **Appen** underkänner i skarpt läge licenser vars köp-id börjar med `cs_test_` (”Det här är en testlicens och gäller inte i den riktiga appen.”). Bara förhandsversioner och grenbyggen godtar dem (`VITE_ACCEPT_TEST_PURCHASES=1` i `netlify.toml`), och byggkontrollen stoppar ett produktionsbygge med den flaggan.
- Använd ändå **olika nyckelpar** för test och skarpt läge (Netlify: _Different value for each deploy context_).

---

## Gå live – checklista

**Företaget och uppgifterna**

- [ ] Enskild firma anmäld hos Skatteverket (F-skatt). Kontrollera om du ska vara momsregistrerad eller momsbefriad (steg 4). Registrering hos Bolagsverket är oftast frivillig för enskild firma – läs mer på verksamt.se.
- [ ] Säljarens uppgifter satta i Netlify med scope **Builds och Functions**: `VITE_SELLER_NAME`, `VITE_SELLER_ADDRESS`, `VITE_SELLER_PHONE`, en riktig `VITE_SUPPORT_EMAIL` (inte `…@example.invalid`) och `VITE_SELLER_VAT` om du är momsregistrerad. `VITE_SELLER_ORGNR` (personnumret för enskild firma) bara om Verksamt eller en jurist säger att det behövs – se rutan i steg 6.

**Stripe (skarpt läge)**

- [ ] Kontot är aktiverat för skarpa betalningar, bankkonto och statement descriptor är klara.
- [ ] **Settings → Business → Public details:** företagsnamn, support-e-post, webbplats, _Privacy policy_ och **Terms of service URL** (köpvillkoren).
- [ ] **Settings → Business → Customer emails:** _Successful payments_ påslaget (kvitto och faktura mejlas).
- [ ] Avgiften för fakturor efter köpet är kontrollerad (steg 1.5).
- [ ] Produkter och priser (349 kr och 699 kr, inkl. moms, engångspris) är skapade i **skarpt läge** → `STRIPE_PRICE_AR` och `STRIPE_PRICE_LIVSTID` för _Production_.
- [ ] Begränsad nyckel `rk_live_…` med behörigheterna i steg 6 → `STRIPE_SECRET_KEY` för _Production_.
- [ ] Webhook skapad i **skarpt läge** med alla händelser i steg 7 (`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.funds_withdrawn`, `charge.dispute.closed`) och egen `STRIPE_WEBHOOK_SECRET`.
- [ ] Adaptive Pricing av; betalsätt påslagna; eventuell Radar-regel för kort utanför Sverige (steg 3).

**Nycklar och bygge**

- [ ] **Nytt skarpt nyckelpar** → `VITE_LICENSE_PUBLIC_KEY` och `LICENSE_PRIVATE_KEY` för _Production_, med säker kopia. (Licenser från testperioden slutar då gälla – så ska det vara.)
- [ ] `VITE_COMMERCE_MODE=live`, `VITE_DISTRIBUTION=web` och `APP_URL` är satta. `LAGOM_ALLOW_TEST_COMMERCE` är **borttagen**, och `VITE_ACCEPT_TEST_PURCHASES` är inte satt för _Production_. Nytt bygge gjort (bygget stoppas om något fattas).
- [ ] Anropsbegränsningen i funktionerna godtogs vid driftsättningen, och `/.netlify/functions/recover-license` ger 404 (se [Anropsbegränsning](#anropsbegränsning)).
- [ ] **Uppdateringsfrågan:** den första versionen med "En ny version av Lagom finns – Uppdatera" tar över direkt från den gamla versionen (`public/sw-overgang.js`). Kontrollera efter driftsättningen att en öppen flik med den gamla versionen laddas om till den nya inom någon minut.

**Villkor och integritet**

- [ ] **Köpvillkor** publicerade (`/villkor/`) och angivna i `TERMS_URL`, `VITE_TERMS_URL` och i Stripe. `TERMS_VERSION` stämmer med versionen i villkoren. De bör innehålla: säljarens namn, adress, telefon och e-post (organisationsnummer om det ska visas); pris inklusive moms; vad licensen ger och hur länge; att årslicensen **inte förnyas automatiskt**; vad livstid betyder (för alltid, felrättningar ingår); att leveransen sker direkt och att ångerrätten då upphör; reklamation och kontakt; att tvister kan prövas av Allmänna reklamationsnämnden (ARN).
- [ ] **Integritetspolicy:** följ checklistan i [`docs/INTEGRITETSPOLICY.md`](INTEGRITETSPOLICY.md) och publicera den (`/integritet/`). Observera att licensnyckeln innehåller köpets id (köp-id). Köp-id:t kan kopplas till betalningen i Stripe och därmed till kunden, så nyckeln räknas som en (pseudonymiserad) personuppgift – även om den inte innehåller namn eller e-post. Spärrlistan innehåller hashar av köp-id för återbetalda köp men inga namn eller e-postadresser.
- [ ] **Bokföring:** Stripes utbetalningar, avgifter och eventuella återbetalningar bokförs; spara underlagen i sju år. Momsen redovisas (om du är momsregistrerad).

**Sista kontrollen**

- [ ] Ett riktigt köp med eget kort enligt [steg 9](#9-kontrollera-fakturan-och-gör-ett-skarpt-testköp): kontroll av mejl, faktura, avgift och licens – och sedan återbetalning i Stripe.

---

## Appbutikerna

Stripe används **inte** i apparna från App Store och Google Play. Där görs köpet i appen (Apple In-App Purchase respektive Google Play Billing) och priset kommer från butiken. Servern vägrar starta ett Stripe-köp från iPhone-appen (403 `ej-i-appen`).

- **iPhone (App Store):** se [`docs/APP-STORE.md`](APP-STORE.md). Licensnycklar kan inte aktiveras i App Store-appen; köp i appen återställs via Apple-ID med _Återställ köp_ på en ny telefon. Den som har köpt på webben och vill använda iPhone-appen får en **erbjudandekod** (offer code) via supporten.
- **Google Play:** se [`docs/GOOGLE-PLAY.md`](GOOGLE-PLAY.md). Play-appen visar webbversionen (TWA); köp görs med Google Play Billing, som kräver `payment=(self)` i `Permissions-Policy` i `netlify.toml`.
- Serverfunktionerna godtar anrop från iPhone-appen (`capacitor://localhost`, se `ALLOWED_NATIVE_ORIGINS`) för t.ex. receptimporten.

---

## Licenserna

**Format:** `LAGOM1.<innehåll>.<signatur>`. Innehållet är base64url-kodad JSON:

```json
{ "v": 1, "id": "cs_live_…", "plan": "ar", "iat": 1790000000, "exp": 1821536000, "kid": "Ab3dE-9x" }
```

`id` är köpets id i Stripe (eller `lic_…` för manuella licenser), `iat` när köpet gjordes, `exp` när en årslicens går ut (saknas för livstid) och `kid` vilken nyckel som signerade (saknas i äldre licenser – de gäller ändå). Inga namn, ingen e-post. Signaturen är ECDSA P-256/SHA-256.

- **Offline:** appen kontrollerar signaturen med den inbyggda publika nyckeln. Den fungerar utan nät – och fortsätter fungera även om servern skulle stängas.
- **Kan inte förfalskas:** utan den privata nyckeln går det inte att skapa en giltig nyckel eller ändra plan eller datum i en befintlig.
- **Samma köp → samma nyckel:** första gången sparas nyckeln på betalningen i Stripe (`lagom_license`) och återanvänds sedan. Byts nyckelparet signeras en ny med samma innehåll. Om tacksidan och webhooken hinner fråga i exakt samma ögonblick kan två nycklar med identiskt innehåll skapas – båda fungerar likadant, och spärrlistan spärrar båda eftersom den använder köp-id:t.
- **Årslicensen** gäller 365 dagar från köpet och förnyas inte. När den har gått ut kan användaren fortfarande se, exportera och radera sin data, och köpa en ny licens när hen vill.

### Byta nyckelpar

Appen kan ha flera publika nycklar (`VITE_LICENSE_PUBLIC_KEYS`, kommaseparerade, den nuvarande först). Så byter du utan att sålda licenser slutar gälla:

1. Skapa ett nytt par med `node scripts/generate-license-keys.mjs`.
2. Sätt `VITE_LICENSE_PUBLIC_KEYS=<ny publik>,<gammal publik>` och bygg om appen (och butiksapparna).
3. Först när de nya apparna är ute: byt `LICENSE_PRIVATE_KEY` till den nya privata nyckeln.
4. Ta **aldrig** bort den gamla publika nyckeln ur listan – då slutar alla licenser som den signerade att gälla.

---

## Återbetalda köp och spärrlistan

En licens från ett köp som har **återbetalats helt** eller **bestridits** (tvist där pengarna har dragits tillbaka från dig) gäller inte:

- `/api/verify-purchase` och `/api/recover-license` lämnar inte ut nyckeln (410 `aterbetald`: _"Köpet har återbetalats och licensen gäller inte längre. Hör av dig om det är fel."_).
- `/api/license-revocations` publicerar en **signerad spärrlista** (`LAGOMREV1.…`, format `v: 2`, signerad med `LICENSE_PRIVATE_KEY`) för återbetalda och bestridda köp, plus `LICENSE_REVOKED_IDS`. Köp-id:n står bara som **hashar** (SHA-256, base64url) – aldrig i klartext, eftersom köp-id:t är det som `/api/verify-purchase` kräver för att lämna ut nyckeln. Adressen svarar bara utan frågeparametrar (annars 400), så att ingen kan förbigå cachen. Ett återbetalt **livstidsköp** står kvar i listan för alltid (annars skulle nyckeln börja gälla igen). **Årslicenser** tas bara med från köp de senaste 400 dagarna – äldre har ändå gått ut. Appen hämtar listan ungefär en gång per dygn när den är online, kontrollerar signaturen och sparar den. En nyckel vars köp-id (eller nyckelhash) finns i listan visas som återkallad; all data finns kvar och kan ses, exporteras och raderas.
- **Ingen databas:** listan räknas fram ur Stripes återbetalningar och tvister. Den cachas i en timme (och funktionen minns den i tio minuter), så det kan ta upp till ett dygn innan en återbetalning når en app som är online.

Regler:

| Situation | Licensen |
| --- | --- |
| Hela beloppet återbetalt (även i flera delar) | Spärrad |
| Delvis återbetalt, t.ex. prisavdrag vid en reklamation | Gäller |
| Tvist med status _needs response_, _under review_, _lost_ eller _prevented_ | Spärrad |
| Förfrågan (_warning_…_) eller vunnen tvist (_won_) | Gäller |
| `lagom_revoked = 1` på betalningen (bara du sätter den) | Lämnas inte ut igen. En nyckel som redan är aktiverad stoppas bara av spärrlistan – som bygger på återbetalningar och tvister, inte på markeringen. Spärrar du utan återbetalning: använd `LICENSE_REVOKED_IDS` (nedan). |
| Köp-id i `LICENSE_REVOKED_IDS` | Spärrad: står i spärrlistan och lämnas inte ut igen av `/api/verify-purchase` eller "Tappat nyckeln?". |
| `lagom_revoked = 0` på betalningen | **Gäller alltid** – ditt undantag, t.ex. om du återbetalar av goodwill och kunden får behålla licensen |

Markeringen sätter du i Stripe under **Payments → betalningen → Metadata**. `lagom_revoked` är **bara för dina manuella beslut** – webhooken rör den aldrig. Webhooken skriver i stället `lagom_status` (`aterbetald`, `bestriden`, `tvist-vunnen`, `tvist-forlorad`, `forfragan-stangd`) som information. Själva spärren räknas alltid fram ur Stripes återbetalningar och tvister, så en händelse som kommer i fel ordning kan varken spärra en vunnen tvist eller häva din spärr.

**Spärra en licens utan återbetalning** (t.ex. en nyckel som har delats öppet på nätet, eller en manuell licens): lägg köp-id:t (`cs_live_…` eller `lic_…`) i `LICENSE_REVOKED_IDS` och driftsätt på nytt. Sätt gärna också `lagom_revoked = 1` på betalningen, så att nyckeln inte lämnas ut igen.

Posterna i listan är hashar av köp-id:t (`purchaseIdHash` i `src/lib/license.ts`), som är samma för alla nycklar som har utfärdats för ett köp. Listan kan också innehålla en nyckelhash: SHA-256 (base64url) av hela nyckelsträngen, samma som `licenseIdOf` i `netlify/lib/licensing.ts` och `licenseKeyHash` i appen. Appar med en äldre version (som bara förstår `v: 1`) behåller sin sparade lista tills de uppdateras.

---

## Support: ny enhet, tappad nyckel, manuell licens, återbetalning

**Ny telefon eller dator.** Licensen gäller på kundens egna enheter (inte i App Store-appen, se [Appbutikerna](#appbutikerna)).

1. Kopiera nyckeln under **Inställningar → Licens** (eller mejla den till dig själv) och klistra in den på samma ställe på den nya enheten.
2. Flytta dagboken med **Inställningar → Data → Säkerhetskopia**: spara på den gamla enheten och återställ på den nya.
3. Har kunden kvar länken till tacksidan ger den samma nyckel igen.

**Kunden har tappat nyckeln.** På webben finns **"Tappat nyckeln?"**: kunden skriver e-postadressen från köpet och kvittonumret (t.ex. `1234-5678` från Stripes kvittomejl) eller köp-id:t (`cs_live_…`), och får samma nyckel igen. Fakturanumret godtas inte – Stripes fakturanummer är löpande och går att gissa (`/api/recover-license`). Fel e-post och fel nummer ger samma svar och samma svarstid, så det går inte att ta reda på vem som har köpt. Hittas inget köp – t.ex. om kunden skrev e-postadressen med andra stora och små bokstäver än vid köpet – kan du hjälpa till: sök upp betalningen i Stripe (t.ex. på kundens e-post) och kopiera `lagom_license` från betalningens metadata. Finns den inte där: ta köpets id (`cs_live_…`) och anropa `/api/verify-purchase` enligt curl-exemplet ovan.

**Utfärda en licens manuellt** (reklamation, presskod, förlängd provperiod):

```bash
export LICENSE_PRIVATE_KEY=…              # den skarpa privata nyckeln
export VITE_LICENSE_PUBLIC_KEY=…          # valfritt: kontrollerar att nyckeln fungerar i appen
node scripts/issue-license.mjs --plan livstid --id arende_123
node scripts/issue-license.mjs --plan ar --from 2026-03-01           # årslicens från ett visst datum
node scripts/issue-license.mjs --plan ar --days 30 --id forlangt_prov
```

Kör skriptet på din egen dator och rensa terminalhistoriken efteråt om du klistrade in nyckeln direkt på kommandoraden.

**Återbetalning** görs i Stripe (**Payments → Refund**). Vid full återbetalning spärras licensen automatiskt (se [spärrlistan](#återbetalda-köp-och-spärrlistan)); vid delvis återbetalning (prisavdrag) gäller den fortfarande. Vill du återbetala men låta kunden behålla licensen: sätt `lagom_revoked = 0` på betalningen (före eller efter återbetalningen).

---

## Begränsningar

Medvetna avvägningar för en app utan konton där all data stannar på enheten:

- **Provperioden** lagras lokalt. Den som rensar webbplatsdata (eller använder privat läge där inget sparas) kan starta om den. Det är priset för att inte kräva konto eller skicka något om användaren till en server. Den **betalda licensen** kan däremot inte förfalskas. Inom appen går provperioden inte att förlänga: radering, exempeldata, ett nytt välkomstflöde och återställning av en säkerhetskopia behåller alltid den tidigaste starten, och en start i framtiden (klockan ställd framåt när profilen skapades) rättas till nu.
- **Klockan.** Provperioden och årslicensen räknas mot enhetens klocka. Den som ställer tillbaka klockan får också dagboken på fel datum, så det är ingen praktisk väg runt spärren.
- **Spärren finns i appen.** Allt ligger lokalt, så den som ändrar i webbläsarens lagring (eller redigerar en säkerhetskopia och läser in den) kan lägga in data utan licens. Import och export spärras medvetet aldrig – användarens data ska alltid gå att flytta.
- **Spärrlistan når bara appar som är online.** En enhet som aldrig kopplar upp sig (eller blockerar anropet) fortsätter att godta en återbetald nyckel. En nyckel som delas vidare fungerar hos andra tills köpet återbetalas eller köp-id:t läggs i `LICENSE_REVOKED_IDS`.
- **Testköp och skarpa licenser måste ha olika nyckelpar.** Signerar servern med det skarpa nyckelparet medan `STRIPE_SECRET_KEY` är en testnyckel, blir köp med Stripes testkort (4242 …) giltiga licenser i den skarpa appen. Använd därför ett eget testnyckelpar för förhandsversioner och Stripes testläge, och skapa det skarpa paret först när du går live (se checklistan).
- **Begränsningen av antal anrop** i funktionerna gäller per funktionsinstans och är ett enkelt skydd. Netlifys rate limiting (se [Anropsbegränsning](#anropsbegränsning)) ger ett hårdare.
- **"Hämta min licensnyckel igen"** hittar köpet på e-postadressen så som den skrevs vid köpet (Stripe jämför exakt). Servern provar både som den skrivs och med små bokstäver; annars hjälper supporten till.
- **Receptimporten** hämtar sidor åt appen. Den godtar bara publika https-adresser (inte interna nät) och ansluter bara till de adresser som dess eget DNS-uppslag har kontrollerat – även efter omdirigeringar – så DNS-rebinding fungerar inte. Den följer högst tre omdirigeringar, väntar högst 5 sekunder, läser högst 2 MB (större sidor läses bara till gränsen) och svarar bara med sidans receptdata (JSON-LD, eller ett JSON-LD-block byggt av sidans mikrodata). Sidor som visar receptet först i webbläsaren (t.ex. Coop) går inte att läsa – där klistrar användaren in ingredienserna i appen.
- **Ingen egen databas.** Köpen finns i Stripe och licensnycklarna i betalningarnas metadata.

---

## API-referens

Alla svar är JSON. Fel har formen `{ "code": "…", "error": "…" }`, där `error` är ett svenskt meddelande som kan visas som det är. Anrop från andra webbplatser än appen (`APP_URL`, `ALLOWED_ORIGINS`, iPhone-appens ursprung i `ALLOWED_NATIVE_ORIGINS` eller samma adress som funktionerna) nekas (403 `fel-ursprung`). Över anropsgränsen: 429 `for-manga` med `Retry-After`. Ett oväntat fel ger 500 `internt-fel` utan detaljer – felmeddelandet finns bara i funktionsloggen. Inga svar cachas, utom spärrlistan.

### `POST /api/create-checkout`

Kropp: `{ "plan": "ar" | "livstid", "consent": true }`. `consent` måste vara exakt `true` (samtycket till omedelbar leverans och att ångerrätten upphör) och sparas i köpets metadata tillsammans med `villkor_version`.

| Status | Kod | När |
| --- | --- | --- |
| 200 | – | `{ "url": "https://checkout.stripe.com/…" }` – skicka kunden dit |
| 400 | `ogiltig-plan`, `ogiltig-begaran` | Okänd plan eller ogiltig JSON |
| 400 | `samtycke-saknas` | `consent: true` saknas – inget köp skapas |
| 403 | `fel-ursprung` | Anrop från en annan webbplats |
| 403 | `ej-i-appen` | Anrop från iPhone-appen – där görs köpet i App Store |
| 413 | `for-stor` | Kroppen är större än 2 kB |
| 429 | `for-manga` | För många försök |
| 502 | `betaltjanst-fel` | Stripe svarar inte – försök igen |
| 503 | `ej-konfigurerad` | Inställningar saknas (även säljarens uppgifter med skarp nyckel) eller priset stämmer inte (se funktionsloggen) |

### `POST /api/verify-purchase`

Kropp: `{ "sessionId": "cs_…" }`.

| Status | Kod | När |
| --- | --- | --- |
| 200 | – | `{ "licenseKey", "plan", "issuedAt", "expiresAt" }` (`expiresAt` är `null` för livstid) |
| 202 | `ej-betald` | `{ "status": "pending", "pending": true }` – betalningen är inte klar, fråga igen om en stund |
| 400 | `ogiltigt-id` | Id:t har fel format |
| 404 | `hittades-inte` | Inget köp med det id:t |
| 410 | `avbruten` | Köpet avbröts eller gick ut |
| 410 | `aterbetald` | Köpet är helt återbetalt eller bestritt |
| 410 | `utgangen` | Årslicensen från köpet har gått ut |
| 422 | `okant-kop` | Köpet gäller inte en Lagom-licens eller beloppet stämmer inte |
| 429, 502, 503 | som ovan | |

### `POST /api/recover-license`

Kropp: `{ "email": "…", "receipt": "…" }` där `receipt` är kvittonumret eller köp-id:t (fakturanumret godtas inte).

| Status | Kod | När |
| --- | --- | --- |
| 200 | – | `{ "licenseKey", "plan", "issuedAt", "expiresAt" }` – samma nyckel som köpet redan har gett |
| 400 | `ogiltig-epost`, `ogiltigt-kvitto` | Uppgifterna ser inte rätt ut |
| 404 | `hittades-inte` | Inget köp med den e-posten och det numret (samma svar och svarstid oavsett vilket som var fel) |
| 410 | `aterbetald`, `utgangen` | Som ovan |
| 429 | `for-manga` | Högst 5 försök per IP-adress och 10 minuter, 10 per e-postadress och timme |
| 502, 503 | som ovan | |

### `GET /api/license-revocations`

| Status | Kod | När |
| --- | --- | --- |
| 200 | – | `{ "token": "LAGOMREV1.<base64url(JSON { v: 1, issuedAt, ids })>.<base64url(signatur)>", "issuedAt": … }`. `Cache-Control: public, max-age=3600`. |
| 502 | `betaltjanst-fel` | Stripe svarar inte – appen behåller sin sparade lista |
| 503 | `ej-konfigurerad` | `STRIPE_SECRET_KEY` eller `LICENSE_PRIVATE_KEY` saknas |

### `POST /api/recipe-fetch`

Kropp: `{ "url": "https://…" }`. Används av receptimporten i appen.

| Status | Kod | När |
| --- | --- | --- |
| 200 | – | `{ "html": "<script type=\"application/ld+json\">…</script>" }` – bara sidans receptdata (JSON-LD, eller ett block byggt av sidans mikrodata) |
| 400 | `ogiltig` | Inte https, fel port, inloggningsuppgifter i adressen eller en intern adress – även efter en omdirigering eller ett nytt DNS-svar |
| 422 | `inget-recept` | Sidan saknar recept (eller är ingen HTML-sida). Stora sidor läses bara till 2 MB. |
| 502 | `hamtning` | Sidan kunde inte hämtas: fel, ogiltigt certifikat, okänd packning, för långsam (över 5 s) eller för många omdirigeringar |
| 429 | `for-manga` | Högst 10 per minut och IP-adress |

### `POST /api/stripe-webhook`

Anropas bara av Stripe. 400 vid ogiltig signatur, 503 om `STRIPE_WEBHOOK_SECRET` saknas, 500 vid tillfälligt fel (Stripe försöker då igen i upp till tre dygn), annars 200.

---

## Felsökning

Titta först i funktionsloggen: **Netlify → Logs → Functions**. Alla rader från Lagom börjar med `[lagom]`.

| Symptom | Trolig orsak |
| --- | --- |
| "Betalningen är inte igång just nu" | Loggen säger vilken variabel som saknas, eller att priset i Stripe inte stämmer med appen. Med skarp nyckel krävs även säljarens uppgifter i scope _Functions_. |
| Fakturan visar `[Företagsnamn]` eller `[Org.nr]` | `VITE_SELLER_*` saknas för funktionerna (scope _Functions_) – bara möjligt med en testnyckel. |
| Ingen faktura eller inget kvitto i mejlet | _Successful payments_ är av under Customer emails, eller testläget (där mejlas inget automatiskt). |
| 403 `fel-ursprung` | Appen körs från en adress som inte är `APP_URL` – lägg till den i `ALLOWED_ORIGINS`. För iPhone-appen: kontrollera `ALLOWED_NATIVE_ORIGINS`. |
| Appen godtar inte nyckeln ("kunde inte verifieras") | Den publika och den privata nyckeln hör inte ihop, eller appen byggdes inte om efter ändringen. Kontrollera med `issue-license.mjs` (steg 5). |
| "Det här är en testlicens" | Appen är byggd i skarpt läge men nyckeln kommer från testläget. |
| Spärrlistan ger 502 | Stripe-nyckeln saknar behörighet (Refunds, Disputes, Charges, Payment Intents, Checkout Sessions: se steg 6) – loggen säger det. |
| En återbetald licens fungerar fortfarande | Appen har inte hämtat spärrlistan ännu (högst en gång per dygn, bara online), eller `lagom_revoked = 0` står på betalningen. |
| "Tappat nyckeln?" hittar inget köp | Annan e-post (eller andra stora/små bokstäver) än vid köpet, eller fel nummer. Be om köp-id:t eller sök i Stripe. |
| Webhooken får 400 | Fel `STRIPE_WEBHOOK_SECRET` (test och skarpt läge har olika) eller en proxy som ändrar kroppen. |
| 429 från `/api/…` direkt | Netlifys anropsbegränsning i `netlify.toml` – vänta en stund. |
| Temat blinkar vid start eller konsolen visar CSP-fel | Temaskriptet i `index.html` har ändrats. `npm test` visar den nya hashen att lägga in i `netlify.toml`. |
| Produktbilder eller streckkoder laddas inte | En ny extern adress har lagts till i koden men inte i `connect-src`/`img-src` i `netlify.toml`. |
