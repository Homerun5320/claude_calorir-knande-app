/**
 * De genererade juridiska filerna: fristående HTML-sidor och Markdown i docs/ med anteckningar till
 * ägaren. legal.test.tsx jämför dem med filerna i repot (`toMatchFileSnapshot`) – ändra texten i
 * legalContent.ts eller här och kör `npx vitest run src/features/legal -u`.
 */
import { PRIVACY_VERSION, STATIC_SELLER, TERMS_VERSION, USER_TERMS_SECTION_IDS, privacySections, termsSections } from './legalContent'
import { renderLegalHtml, renderLegalMarkdown, type LegalDocSpec } from './legalExport'

/** Sökvägar relativt repots rot. */
export const LEGAL_FILES = {
  privacyHtml: 'public/integritet/index.html',
  termsHtml: 'public/villkor/index.html',
  privacyMd: 'docs/INTEGRITETSPOLICY.md',
  termsMd: 'docs/KOPVILLKOR.md',
  userTermsMd: 'docs/ANVANDARVILLKOR.md',
} as const

export function privacyDoc(title = 'Integritetspolicy'): LegalDocSpec {
  return {
    title,
    version: PRIVACY_VERSION,
    description: 'Så hanterar Lagom dina uppgifter: dagboken stannar på din enhet, ingen reklam och ingen spårning.',
    sections: privacySections(STATIC_SELLER),
  }
}

export function termsDoc(title = 'Köp- och användarvillkor'): LegalDocSpec {
  return {
    title,
    version: TERMS_VERSION,
    description: 'Villkor för köp och användning av Lagom – licenser, pris, ångerrätt, reklamation och användarvillkor.',
    sections: termsSections(STATIC_SELLER),
  }
}

export function privacyHtml(): string {
  return renderLegalHtml(privacyDoc(), [{ href: '../villkor/', label: 'Köp- och användarvillkor' }])
}

export function termsHtml(): string {
  return renderLegalHtml(termsDoc(), [{ href: '../integritet/', label: 'Integritetspolicy' }])
}

// ---------------------------------------------------------------------------
// Anteckningar till ägaren (bara i docs/)
// ---------------------------------------------------------------------------

const SELLER_CHECKLIST = `- [ ] **Företagsnamn** – för enskild firma ditt namn eller det registrerade firmanamnet → \`VITE_SELLER_NAME\`
- [ ] **Organisationsnummer** – för enskild firma samma som ditt personnummer → \`VITE_SELLER_ORGNR\`
- [ ] **Postadress** → \`VITE_SELLER_ADDRESS\`
- [ ] **Telefon** → \`VITE_SELLER_PHONE\`
- [ ] **Momsregistreringsnummer** (om firman är momsregistrerad) → \`VITE_SELLER_VAT\`
- [ ] **E-post för support** – en riktig adress som du läser → \`VITE_SUPPORT_EMAIL\`

Variablerna sätts i Netlify (Site configuration → Environment variables). Appen visar dem automatiskt, och när sajten byggs fylls platshållarna i de fristående sidorna i ([Företagsnamn], [Org.nr], [Adress], [Telefon], [Momsreg.nr], [E-post]). Här i docs står platshållarna kvar. Saknas en uppgift visar appen ”[fylls i av ägaren]”, och bygget för butikerna och för skarpa webbköp stoppas.`

const PRIVACY_PREFACE = `> **Utkast – ska ses över av ägaren.** Texten är skriven för att stämma med hur Lagom fungerar i version 1.0: dagboken finns bara på enheten, det finns inga konton, ingen reklam och ingen analys. Den är inte granskad av en jurist.

### Att fylla i av ägaren

${SELLER_CHECKLIST}

- [ ] Lägg in adressen till den publicerade sidan – till exempel \`https://<din domän>/integritet/\` – i **App Store Connect** (App Privacy → Privacy Policy URL), i **Play Console** (Policy → App content → Privacy policy) och i **Stripe** (Settings → Business → Public details).
- [ ] Kontrollera hur länge Netlify sparar loggar i din plan.
- [ ] Använd en e-posttjänst för supporten som har ett personuppgiftsbiträdesavtal, och spara Netlifys och Stripes avtal (DPA).
- [ ] Svara i App Privacy (App Store Connect) och Data safety (Play Console) så att svaren stämmer med policyn.
- [ ] Gå igenom punkterna märkta **Till ägaren** nedan.

### Låt en jurist granska

Policyn är ett juridiskt dokument. Be gärna om en engångsgranskning – till exempel hos en juristbyrå för småföretag – särskilt av:

- rättslig grund och lagringstider (bokföring, support och loggar),
- Stripes roll – både personuppgiftsbiträde och självständigt ansvarig – och överföringarna till USA (EU–US Data Privacy Framework har överklagats; standardavtalsklausulerna är reserven),
- texten om barn och unga: Lagom riktar sig till vuxna men går att använda från 13 år med extra skydd,
- om ditt organisationsnummer (= personnumret för enskild firma) måste visas.

### Ingen samtyckesbanner behövs – så länge det förblir så

All lagring på enheten (tabellen under ”Lagring på din enhet”) är nödvändig för tjänsten användaren själv har begärt. Därför krävs inget samtycke enligt lagen om elektronisk kommunikation (LEK 9 kap. 28 §), och ingen cookie-banner behövs. **Lägger ni till analysverktyg, reklam eller andra tredjepartsskript krävs samtycke först** – och policyn, App Privacy och Data safety ska uppdateras innan ändringen publiceras.

### Appen och den publicerade sidan

- I appen finns policyn på sidan Integritetspolicy (\`#/integritet\`). I apparna från App Store och Google Play visas inte det som bara gäller köp på webben (Stripe) – Apple tillåter inga hänvisningar till andra köpsätt i appen. Den publicerade sidan innehåller allt.
- Det som bara gäller webben är märkt _(bara webben)_ nedan.`

const TERMS_PREFACE = `> **Utkast – ska ses över av ägaren.** Villkoren är skrivna för att stämma med hur köpet och appen fungerar i version 1.0. De är inte granskade av en jurist.

### Beslut som texten bygger på (2026-09-28)

- Säljaren är en enskild firma. Lansering bara i Sverige; Lagom riktar sig till vuxna.
- Priser på webben: Årslicens 349 kr och Livstidslicens 699 kr inklusive 25 % moms (\`src/config/commerce.ts\`). I butikerna sätts priset i App Store Connect och Play Console.
- Livstid betyder för alltid. Felrättningar ingår – nya funktioner utlovas inte.
- I apparna från App Store och Google Play görs köpet bara som köp i appen, och köp återställs med Återställ köp. I App Store-appen kan inga licensnycklar aktiveras.
- Provperioden (14 dagar) startar först när den egna profilen skapas.
- Licenser från återbetalda webbköp spärras (spärrlista).

### Att fylla i av ägaren

${SELLER_CHECKLIST}

- [ ] Ta reda på om firman ska vara momsregistrerad eller momsbefriad (fråga Skatteverket). Texterna förutsätter 25 % moms – se **Till ägaren** under ”Pris och betalning”. Utan momsregistrering finns inget momsregistreringsnummer att fylla i.
- [ ] Sätt \`VITE_TERMS_URL\` till \`https://<din domän>/villkor/\`, så att köpsidan och Stripe länkar till villkoren.
- [ ] Välj Apples standard-EULA i App Store Connect (se docs/ANVANDARVILLKOR.md).
- [ ] Gå igenom punkterna märkta **Till ägaren** nedan (livstid, svarstid och ARN).

### Låt en jurist granska

- Ångerrätten för digitalt innehåll (samtycke och bekräftelse på varaktigt medium) och den nya ångerfunktionen för avtal online som EU-direktiv 2023/2673 kräver från 19 juni 2026 – det är inte kontrollerat hur den ska se ut när ångerrätten redan har upphört.
- Ansvarsbegränsningen – den får inte inskränka tvingande konsumentregler.
- Definitionen av livstid.
- Informationen enligt e-handelslagen 10 § (stegen, arkivering, rätta inmatningsfel, språk) och säljaruppgifterna före köpet (distansavtalslagen 2 kap. 2 §).
- Köp av minderåriga (föräldrabalken 9 kap.).

### Appen och den publicerade sidan

I appen finns villkoren på sidan Köp- och användarvillkor (\`#/villkor\`). I apparna från App Store och Google Play visas inte avsnitten som bara gäller köp på webben (pris i kronor, Stripe, ångerrätt vid webbköp) – där sköter butiken köpet. Den publicerade sidan innehåller allt.`

const USER_TERMS_PREFACE = `> **Utkast – ska ses över av ägaren.** Användarvillkoren är samma text som avsnitten om användning i [köp- och användarvillkoren](KOPVILLKOR.md) och gäller alla som använder Lagom – även under provperioden och utan köp.

### App Store: välj Apples standard-EULA

I App Store Connect (App Information → License Agreement) väljer du **Apples standard-EULA** (Licensed Application End User License Agreement). Då gäller Apples villkor för själva appen, och villkoren här kompletterar dem. Vill du i stället ha en egen EULA måste den innehålla Apples minimivillkor (Apple Developer Program License Agreement, Schedule 1, Exhibit B) – gör inte det utan jurist.

### Google Play

Google Play kräver ingen EULA. Länka gärna till villkoren (\`https://<din domän>/villkor/\`) i butikstexten.`

export function privacyMarkdown(): string {
  return renderLegalMarkdown(privacyDoc('Integritetspolicy för Lagom'), PRIVACY_PREFACE)
}

export function termsMarkdown(): string {
  return renderLegalMarkdown(termsDoc('Köp- och användarvillkor för Lagom'), TERMS_PREFACE)
}

export function userTermsMarkdown(): string {
  const doc = termsDoc('Användarvillkor för Lagom')
  const sections = USER_TERMS_SECTION_IDS.map((id) => doc.sections.find((s) => s.id === id)).filter((s) => s !== undefined)
  return renderLegalMarkdown({ ...doc, sections }, USER_TERMS_PREFACE)
}
