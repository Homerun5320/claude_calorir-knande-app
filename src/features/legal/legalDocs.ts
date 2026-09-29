/**
 * De genererade juridiska filerna: fristående HTML-sidor och Markdown i docs/ med anteckningar till
 * ägaren. legal.test.tsx jämför dem med filerna i repot (`toMatchFileSnapshot`) – ändra texten i
 * legalContent.ts eller här och kör `npx vitest run src/features/legal -u`.
 */
import { PRIVACY_VERSION, STATIC_SELLER, TERMS_VERSION, USER_TERMS_SECTION_IDS, privacySections, termsSections, visibleSections, type LegalSection } from './legalContent'
import { renderLegalHtml, renderLegalMarkdown, type LegalDocSpec } from './legalExport'

/**
 * Anteckningar till ägaren per avsnitt (id). De visas bara i docs/ – därför ligger de här och inte
 * i legalContent.ts, som byggs in i appen.
 */
const PRIVACY_OWNER_NOTES: Readonly<Record<string, string>> = {
  kameran:
    'Android-appen läser streckkoder med ZXing (src/native/barcode.ts, ANDROID_SCANNING_LIBRARY). Byter ni till Google ML Kit skickar det enligt Googles redovisning driftdata till Google (enhet, app, identifierare, prestanda och felkoder) – då måste texten här, Data safety och frågan om samtycke (LEK 9 kap. 28 §) ses över först.',
  halsa:
    'Google granskar texten i Health Connect-deklarationen (Play Console → Appinnehåll → Hälsoappar). Datatyperna här ska stämma med AndroidManifest.xml, Info.plist och motiveringarna i docs/NATIVE.md §6. Ändras de i src/native/health.ts måste policyn uppdateras först.',
  lagringstid: 'Kontrollera hur länge loggar sparas i din Netlify-plan och skriv gärna in tiden här.',
  mottagare:
    'Kontrollera att e-posttjänsten du använder för support har ett personuppgiftsbiträdesavtal (ett privat gratiskonto har det oftast inte) och skriv gärna in dess namn. Netlifys och Stripes avtal (DPA) ingår i deras villkor – spara en kopia. Väljer du RevenueCat för köpen i appen blir RevenueCat också ett biträde – lägg då till det här, i registerförteckningen och i App Privacy/Data safety före inskickningen.',
}

const TERMS_OWNER_NOTES: Readonly<Record<string, string>> = {
  pris: 'Hela köpflödet (den här texten, köpsidan och kvittot) räknar med att firman är momsregistrerad och tar ut 25 % moms. En enskild firma med liten omsättning kan i stället vara momsbefriad (omsättningsgränsen var 120 000 kr per år när reglerna ändrades 2025 – kontrollera hos Skatteverket). Är firman momsbefriad får du inte ta ut moms, och texterna om moms här, på köpsidan och på kvittot måste ändras före lansering. Vid köp i App Store och Google Play sköter butiken momsen.',
  funktion: 'Skriv gärna in lägsta iOS- och Android-version när apparna är byggda (i iPhone-appen står i dag ”en aktuell version av iOS”).',
  uppdateringar: 'Bekräfta svarstiden för supporten.',
  livstid:
    'Ägaren ska bekräfta definitionen av livstid före lansering (beslut 2026-09-28: för alltid, felrättningar ingår, inga löften om nya funktioner). Texten är avsiktligt försiktig och är samma som i köparket och på kvittot (LIFETIME_PROMISE i src/config/commerce.ts) – lova inte mer i butikstexter eller i Stripe.',
  tvister:
    'Du måste informera om ARN (lagen om alternativ tvistlösning i konsumentförhållanden). Att följa ARN:s rekommendationer är frivilligt men förtroendeingivande – bekräfta att du medverkar.',
}

function withOwnerNotes(sections: LegalSection[], notes: Readonly<Record<string, string>>): LegalSection[] {
  return sections.map((s) => (notes[s.id] ? { ...s, ownerNote: notes[s.id] } : s))
}

/** Sökvägar relativt repots rot. */
export const LEGAL_FILES = {
  privacyHtml: 'public/integritet/index.html',
  /**
   * Integritetspolicyn för Android-appen, fristående och utan länkar vidare. Google Play-bygget
   * kopierar den till dist-native/privacypolicy.html (vite.config.ts), som Health Connect visar i
   * appen (@capgo/capacitor-health, scripts/native-config.mjs) – även utan uppkoppling.
   */
  privacyAndroidHtml: 'public/integritet/android/index.html',
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
    sections: withOwnerNotes(privacySections(STATIC_SELLER), PRIVACY_OWNER_NOTES),
  }
}

export function termsDoc(title = 'Köp- och användarvillkor'): LegalDocSpec {
  return {
    title,
    version: TERMS_VERSION,
    description: 'Villkor för köp och användning av Lagom – licenser, pris, ångerrätt, reklamation och användarvillkor.',
    sections: withOwnerNotes(termsSections(STATIC_SELLER), TERMS_OWNER_NOTES),
  }
}

export function privacyHtml(): string {
  return renderLegalHtml(privacyDoc(), [{ href: '../villkor/', label: 'Köp- och användarvillkor' }])
}

/** Integritetspolicyn så som Google Play-appen visar den – utan webbköp och utan länkar vidare. */
export function privacyAndroidDoc(): LegalDocSpec {
  return {
    title: 'Integritetspolicy för Lagom på Android',
    version: PRIVACY_VERSION,
    description: 'Så hanterar Lagom för Android dina uppgifter, även från Health Connect: dagboken stannar på telefonen, ingen reklam och ingen spårning.',
    sections: visibleSections(privacySections(STATIC_SELLER), { platform: 'play', webSales: false, licenseKeys: true }),
  }
}

export function privacyAndroidHtml(): string {
  return renderLegalHtml(privacyAndroidDoc(), [], { standalone: true })
}

export function termsHtml(): string {
  return renderLegalHtml(termsDoc(), [{ href: '../integritet/', label: 'Integritetspolicy' }])
}

// ---------------------------------------------------------------------------
// Anteckningar till ägaren (bara i docs/)
// ---------------------------------------------------------------------------

const SELLER_CHECKLIST = `- [ ] **Företagsnamn** – för enskild firma ditt namn eller det registrerade firmanamnet → \`VITE_SELLER_NAME\`
- [ ] **Organisationsnummer** (frivilligt) – för enskild firma samma som ditt personnummer → \`VITE_SELLER_ORGNR\`. Sätter du det visas det i appen, i villkoren och på varje kvitto. Lämnar du det tomt utelämnas det överallt, och bygget ger bara en varning. Distansavtalslagen (2 kap. 2 §) kräver namn, adress, telefon och e-post; e-handelslagen (8 §) kräver registreringsnummer om firman finns i handelsregistret. Fråga Verksamt eller en jurist vad som gäller för just din firma (se ”Låt en jurist granska”).
- [ ] **Postadress** → \`VITE_SELLER_ADDRESS\`
- [ ] **Telefon** → \`VITE_SELLER_PHONE\`
- [ ] **Momsregistreringsnummer** (om firman är momsregistrerad) → \`VITE_SELLER_VAT\`
- [ ] **E-post för support** – en riktig adress som du läser → \`VITE_SUPPORT_EMAIL\`

Variablerna sätts i Netlify (Site configuration → Environment variables). Appen visar dem automatiskt, och när sajten byggs fylls platshållarna i de fristående sidorna i ([Företagsnamn], [Org.nr], [Adress], [Telefon], [Momsreg.nr], [E-post]). Här i docs står platshållarna kvar. Saknas en obligatorisk uppgift visar appen ”[fylls i av ägaren]”, och bygget för butikerna och för skarpa webbköp stoppas. Organisationsnumret och momsregistreringsnumret är frivilliga – saknas de tas de bort ur texten.`

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
- texten om barn och unga: Lagom är gjord för vuxna och går bara att använda från 18 år (räknat på födelseåret),
- om ditt organisationsnummer (= personnumret för enskild firma) måste visas – distansavtalslagen (2 kap. 2 §) och e-handelslagen (8 §) kräver identitet och kontaktuppgifter, men om personnumret måste stå med för en enskild firma som inte finns i handelsregistret är inte kontrollerat,
- att provperiodens startdatum finns kvar på enheten när användaren raderar sin data (så att provperioden inte börjar om) – är det nödvändig lagring enligt LEK 9 kap. 28 §?

### Ingen samtyckesbanner behövs – så länge det förblir så

All lagring på enheten (tabellen under ”Lagring på din enhet”) är nödvändig för tjänsten användaren själv har begärt. Därför krävs inget samtycke enligt lagen om elektronisk kommunikation (LEK 9 kap. 28 §), och ingen cookie-banner behövs. **Lägger ni till analysverktyg, reklam eller andra tredjepartsskript krävs samtycke först** – och policyn, App Privacy och Data safety ska uppdateras innan ändringen publiceras.

### Appen och den publicerade sidan

- I appen finns policyn på sidan Integritetspolicy (\`#/integritet\`). I apparna från App Store och Google Play visas inte det som bara gäller köp på webben (Stripe) – Apple tillåter inga hänvisningar till andra köpsätt i appen. Den publicerade sidan innehåller allt.
- I iPhone-appen nämns bara iPhone och App Store (Apples riktlinje 2.3.10). Där ett avsnitt har en egen iPhone-text står den nedan under _I iPhone-appen (App Store) står i stället_.
- Det som bara gäller webben är märkt _(bara webben)_ nedan, och det som bara gäller licensnycklar _(inte i iPhone-appen)_.`

const TERMS_PREFACE = `> **Utkast – ska ses över av ägaren.** Villkoren är skrivna för att stämma med hur köpet och appen fungerar i version 1.0. De är inte granskade av en jurist.

### Beslut som texten bygger på (2026-09-28)

- Säljaren är en enskild firma. Lansering bara i Sverige; Lagom är gjord för vuxna (18 år och äldre).
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

I appen finns villkoren på sidan Köp- och användarvillkor (\`#/villkor\`). I apparna från App Store och Google Play visas inte avsnitten som bara gäller köp på webben (pris i kronor, Stripe, ångerrätt vid webbköp) – där sköter butiken köpet. I iPhone-appen nämns bara iPhone och App Store; de texterna står nedan under _I iPhone-appen (App Store) står i stället_. Den publicerade sidan innehåller allt.`

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
