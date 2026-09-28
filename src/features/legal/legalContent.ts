/**
 * Integritetspolicy och köp- och användarvillkor – all text på ett ställe.
 *
 * Samma text finns på tre ställen till:
 * - appens sidor /integritet och /villkor (PrivacyPage, TermsPage),
 * - de fristående sidorna public/integritet/index.html och public/villkor/index.html (för App Store
 *   Connect, Play Console och Stripe – fungerar utan JavaScript),
 * - docs/INTEGRITETSPOLICY.md, docs/KOPVILLKOR.md och docs/ANVANDARVILLKOR.md (med anteckningar
 *   till ägaren).
 * De statiska filerna skrivs av legalExport.ts, och legal.test.tsx kontrollerar att de stämmer med
 * texten här. Ändra alltså bara här och kör sedan `npx vitest run src/features/legal -u`.
 *
 * Säljarens uppgifter kommer från VITE_SELLER_*-variablerna (src/config/commerce.ts). Saknas de visas
 * "[fylls i av ägaren]" i appen; i de statiska filerna står platshållare som [Företagsnamn].
 *
 * Plattformar: de publicerade sidorna (webbplatsen) visar hela texten. I appen väljer
 * `visibleSections` det som gäller där: webbköpens stycken bara när Lagom säljs på webben,
 * stycken om licensnycklar bara där nycklar kan aktiveras, och i iPhone-appen (App Store) texten
 * i `appStore` – Apple godkänner inga omnämnanden av andra plattformar eller köpsätt i appen
 * (riktlinje 2.3.10 och 3.1.1). Anteckningarna till ägaren finns i legalDocs.ts, så att de inte
 * byggs in i appen.
 *
 * Små märkningar i texterna:
 * - `[text](adress)` blir en länk. `lagom:villkor` och `lagom:integritet` pekar på den andra sidan.
 * - `{namn}`, `{orgnr}`, `{adress}`, `{telefon}`, `{moms}` och `{epost}` ersätts med säljarens uppgifter.
 */
import { LIFETIME_PROMISE, PLANS, SELLER_ADDRESS, SELLER_NAME, SELLER_ORGNR, SELLER_PHONE, SELLER_VAT, SUPPORT_EMAIL, TRIAL_DAYS } from '../../config/commerce'
import { allowsLicenseKeyEntry, isInApp, sellsOnWeb } from '../../config/platform'
import { isExampleEmail } from '../../lib/placeholderEmail'
import { MONTHS, fromISODate } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import type { ISODate } from '../../types'
import { STATIC_PLACEHOLDERS } from './staticSeller'

/** Integritetspolicyns version (datumet då den börjar gälla). */
export const PRIVACY_VERSION: ISODate = '2026-10-01'
/** Köp- och användarvillkorens version. */
export const TERMS_VERSION: ISODate = '2026-10-01'

export interface LegalTable {
  columns: string[]
  rows: string[][]
}

/** Texten i iPhone-appen (App Store). Fälten som anges ersätter avsnittets vanliga fält. */
export interface LegalVariant {
  heading?: string
  paragraphs?: string[]
  items?: string[]
  table?: LegalTable
  closing?: string[]
}

export interface LegalSection {
  id: string
  heading: string
  paragraphs: string[]
  /** Stycken som bara gäller köp på webben (Stripe). Visas inte i butiksapparna. */
  webParagraphs?: string[]
  /** Numrerade steg efter styckena. */
  steps?: string[]
  /** Punktlista efter styckena. */
  items?: string[]
  /** Punkter som bara gäller köp på webben. */
  webItems?: string[]
  /**
   * Punkter om licensnycklar (t.ex. spärrlistan). Visas bara där nycklar kan aktiveras – inte i
   * iPhone-appen.
   */
  keyItems?: string[]
  table?: LegalTable
  /** Stycken efter listan eller tabellen. */
  closing?: string[]
  /**
   * Hela avsnittet gäller bara köp på webben. I butiksapparna visas det inte – där sköter App
   * Store och Google Play köpet, och Apple tillåter inga hänvisningar till andra köpsätt.
   */
  webOnly?: boolean
  /** Texten i iPhone-appen, där bara iPhone och App Store får nämnas. */
  appStore?: LegalVariant
  /** Anteckning till ägaren. Sätts bara av legalDocs.ts (docs/), aldrig i appen. */
  ownerNote?: string
}

/** Var texten visas i appen: på webben, i iPhone-appen (App Store) eller i Google Play-appen. */
export type LegalPlatform = 'web' | 'appstore' | 'play'

export interface LegalContext {
  platform: LegalPlatform
  /** Lagom säljs på webben här (Stripe) – `sellsOnWeb()`. */
  webSales: boolean
  /** Licensnycklar kan aktiveras här – `allowsLicenseKeyEntry()`. */
  licenseKeys: boolean
}

/** Plattformen där appen körs just nu (ändras inte medan appen körs). */
export function legalContextHere(): LegalContext {
  const licenseKeys = allowsLicenseKeyEntry()
  // Licensnycklar går inte att aktivera just i iPhone-appen (App Store-bygget eller inbyggd iOS).
  const platform: LegalPlatform = !licenseKeys ? 'appstore' : isInApp() ? 'play' : 'web'
  return { platform, webSales: sellsOnWeb(), licenseKeys }
}

// ---------------------------------------------------------------------------
// Säljarens uppgifter
// ---------------------------------------------------------------------------

export interface SellerInfo {
  name: string
  /**
   * Organisationsnummer (för enskild firma personnumret) – '' när det inte ska visas (då
   * utelämnas det, se `ORGNR_PHRASE`). Frivilligt: byggkontrollen varnar bara.
   */
  orgNr: string
  address: string
  phone: string
  /** Momsregistreringsnummer – '' när firman inte är momsregistrerad (då utelämnas meningen). */
  vat: string
  email: string
}

/** Visas i appen när en uppgift saknas (bygget för butikerna och skarpa webbköp stoppas då). */
export const OWNER_PLACEHOLDER = '[fylls i av ägaren]'

const env = import.meta.env as Record<string, string | undefined>


/** Säljarens uppgifter i appen, med platshållare för det som saknas. */
export function appSeller(): SellerInfo {
  const or = (value: string) => value.trim() || OWNER_PLACEHOLDER
  return {
    // SELLER_NAME faller tillbaka på "Lagom", som inte är ett företag – visa platshållaren i stället.
    name: (env.VITE_SELLER_NAME ?? '').trim() ? SELLER_NAME : OWNER_PLACEHOLDER,
    // Frivilligt – saknas det utelämnas det (ingen platshållare).
    orgNr: SELLER_ORGNR.trim(),
    address: or(SELLER_ADDRESS),
    phone: or(SELLER_PHONE),
    // Frivilligt: en momsbefriad firma har inget momsregistreringsnummer (byggkontrollen kräver det inte).
    vat: SELLER_VAT.trim(),
    // Supportadressen är en platshållare tills VITE_SUPPORT_EMAIL är en riktig adress.
    email: isExampleEmail(SUPPORT_EMAIL) ? OWNER_PLACEHOLDER : SUPPORT_EMAIL,
  }
}

/**
 * Platshållarna i de fristående sidorna och i docs/. På de publicerade sidorna fylls de i vid bygget
 * från VITE_SELLER_*-variablerna (se staticSeller.ts).
 */
export const STATIC_SELLER: SellerInfo = { ...STATIC_PLACEHOLDERS }

/** Meningen med momsregistreringsnumret – tas bort när numret saknas. */
export const VAT_SENTENCE = ' Momsregistreringsnummer: {moms}.'

/** Organisationsnumret inuti en mening – tas bort när det saknas. */
export const ORGNR_PHRASE = ', organisationsnummer {orgnr}'

function fill(text: string, seller: SellerInfo): string {
  const withoutVat = seller.vat ? text : text.replaceAll(VAT_SENTENCE, '')
  return (seller.orgNr ? withoutVat : withoutVat.replaceAll(ORGNR_PHRASE, ''))
    .replaceAll('{namn}', seller.name)
    .replaceAll('{orgnr}', seller.orgNr)
    .replaceAll('{adress}', seller.address)
    .replaceAll('{telefon}', seller.phone)
    .replaceAll('{moms}', seller.vat)
    .replaceAll('{epost}', seller.email)
}

function fillTable(table: LegalTable | undefined, seller: SellerInfo): LegalTable | undefined {
  return table && { columns: table.columns.map((t) => fill(t, seller)), rows: table.rows.map((r) => r.map((t) => fill(t, seller))) }
}

function fillSection(s: LegalSection, seller: SellerInfo): LegalSection {
  const all = (list: string[] | undefined) => list?.map((t) => fill(t, seller))
  const v = s.appStore
  return {
    ...s,
    heading: fill(s.heading, seller),
    paragraphs: s.paragraphs.map((t) => fill(t, seller)),
    webParagraphs: all(s.webParagraphs),
    steps: all(s.steps),
    items: all(s.items),
    webItems: all(s.webItems),
    keyItems: all(s.keyItems),
    closing: all(s.closing),
    table: fillTable(s.table, seller),
    appStore: v && {
      heading: v.heading === undefined ? undefined : fill(v.heading, seller),
      paragraphs: all(v.paragraphs),
      items: all(v.items),
      table: fillTable(v.table, seller),
      closing: all(v.closing),
    },
  }
}

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------

/** '2026-10-01' → "1 oktober 2026". */
export function formatLegalDate(date: ISODate): string {
  const d = fromISODate(date)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function priceOf(id: 'ar' | 'livstid'): string {
  const plan = PLANS.find((p) => p.id === id)
  return plan ? `${formatNumber(plan.priceKr)} kr` : OWNER_PLACEHOLDER
}

/**
 * Avsnitten som visas i appen på en viss plattform:
 * - där webbköp inte erbjuds (butiksapparna, eller webben med webbförsäljningen avstängd) tas
 *   avsnitt och stycken om Stripe och webbpriser bort,
 * - stycken om licensnycklar visas bara där nycklar kan aktiveras,
 * - i iPhone-appen ersätts texten av `appStore`-varianten.
 */
export function visibleSections(sections: readonly LegalSection[], ctx: LegalContext): LegalSection[] {
  return sections
    .filter((s) => ctx.webSales || !s.webOnly)
    .map((s) => {
      const v = ctx.platform === 'appstore' ? s.appStore : undefined
      return {
        ...s,
        heading: v?.heading ?? s.heading,
        paragraphs: v?.paragraphs ?? s.paragraphs,
        items: v?.items ?? s.items,
        table: v?.table ?? s.table,
        closing: v?.closing ?? s.closing,
        webParagraphs: ctx.webSales ? s.webParagraphs : undefined,
        webItems: ctx.webSales ? s.webItems : undefined,
        keyItems: ctx.licenseKeys ? s.keyItems : undefined,
        appStore: undefined,
        ownerNote: undefined,
      }
    })
}

export type InlinePart = { text: string; href?: undefined } | { text: string; href: string }

/** Delar upp en text i vanlig text och länkar (`[text](adress)`). */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: m[1], href: m[2] })
    last = start + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/** Texten utan länkmärkning – så som den läses. */
export function plainText(text: string): string {
  return parseInline(text)
    .map((p) => p.text)
    .join('')
}

/** Interna länkar (`lagom:…`) → sökväg i appen. */
export const INTERNAL_LINKS: Readonly<Record<string, string>> = {
  'lagom:villkor': '/villkor',
  'lagom:integritet': '/integritet',
}

// ---------------------------------------------------------------------------
// Integritetspolicy
// ---------------------------------------------------------------------------

const CONTROLLER_TEXT = `Personuppgiftsansvarig är {namn} (enskild firma${ORGNR_PHRASE}), {adress}. Du når oss på {epost}.`

const STORAGE_COLUMNS = ['Vad', 'Var', 'Varför', 'Hur länge', 'Så rensar du']

const DEMO_ROW = [
  'Markering att exempeldata visas',
  'localStorage (lagom-demo)',
  'Så att appen vet att det är exempeldata',
  'Tills du börjar med din egen profil',
  'Börja med din egen profil, eller Inställningar → Data → Radera all data',
]

const BACKUP_ROW = [
  'När du senast sparade en säkerhetskopia',
  'localStorage (lagom-last-backup)',
  'För att påminna dig om att spara en ny',
  'Tills du raderar din data',
  'Inställningar → Data → Radera all data',
]

const ERROR_LOG_ROW = [
  'Fellogg: högst 20 korta felbeskrivningar, utan livsmedel och värden',
  'localStorage (lagom-error-log)',
  'För felsökning – den skickas bara om du själv mejlar den till oss',
  'De 20 senaste felen',
  'Om Lagom → Felsökning → Rensa felloggen',
]

const TRANSFER_TEXT =
  'Våra biträden kan föra över uppgifter till USA. Det sker med stöd av EU–US Data Privacy Framework (för certifierade företag) och EU-kommissionens standardavtalsklausuler.'

/** Åldersgränsen (ägarens beslut 2026-09-28: målgruppen är vuxna, 18 år och äldre). */
const AGE_TEXT =
  'Lagom är gjord för vuxna, 18 år och äldre, och går inte att använda om du är yngre. Funderar du på mat och vikt – prata gärna med en vuxen, skolsköterskan eller [1177](https://www.1177.se).'

const OFF_ITEM =
  'Open Food Facts: när du söker efter livsmedel online, skannar en streckkod, öppnar en produkt från Open Food Facts som inte är sparad på enheten eller visar en produktbild skickas sökordet eller streckkoden dit, och bilden hämtas från deras server. Open Food Facts är en ideell förening i Frankrike och ansvarar själv för sin behandling – läs deras [integritetspolicy](https://world.openfoodfacts.org/privacy).'

const LMV_ITEM =
  'Livsmedelsverket: bara om du själv väljer att hämta hela databasen under Inställningar → Livsmedelsdatabas. Då anropas Livsmedelsverkets öppna API direkt från din enhet.'

const RECIPE_ITEM =
  'Receptimport: om du hämtar ett recept från en webbadress skickas adressen till vår serverfunktion, som hämtar receptet åt dig. Adressen sparas inte – går hämtningen inte att göra loggas bara webbplatsens namn, för felsökning.'

const PRIVACY_TEMPLATE: LegalSection[] = [
  {
    id: 'ansvarig',
    heading: 'Vem ansvarar för dina uppgifter',
    paragraphs: [
      'Lagom är en svensk kalori- och näringsdagbok. Den här policyn gäller Lagom på webben och i App Store och Google Play. Den förklarar vilka uppgifter som behandlas, varför, och vad du själv kan göra.',
      CONTROLLER_TEXT,
      'Kort sagt: din dagbok stannar på din enhet. Vi behandlar bara de uppgifter som behövs när du köper en licens, när du kontaktar oss och när appen hämtas från vår server eller anropar våra serverfunktioner, till exempel vid receptimport.',
    ],
    appStore: {
      paragraphs: [
        'Lagom är en svensk kalori- och näringsdagbok. Den här policyn gäller Lagom för iPhone. Den förklarar vilka uppgifter som behandlas, varför, och vad du själv kan göra.',
        CONTROLLER_TEXT,
        'Kort sagt: din dagbok stannar på din iPhone. Vi behandlar bara de uppgifter som behövs när du kontaktar oss och när appen anropar våra serverfunktioner, till exempel vid receptimport.',
      ],
    },
  },
  {
    id: 'dagbok',
    heading: 'Din dagbok finns bara på din enhet',
    paragraphs: [
      'Allt du fyller i och loggar – profil och mål, mat och dryck, vikt och mått, träning, fasta, recept, veckoplanering och anteckningar – sparas bara på din enhet, i webbläsaren eller i appen. Lagom har inga konton och ingen server med dagböcker. Vi kan inte se, läsa eller återställa din data.',
      'Det gäller även uppgifter om hälsa, till exempel vikt, graviditet och amning. De lämnar aldrig enheten om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.',
      'Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort enheten eller rensar webbläsaren försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.',
    ],
    appStore: {
      paragraphs: [
        'Allt du fyller i och loggar – profil och mål, mat och dryck, vikt och mått, träning, fasta, recept, veckoplanering och anteckningar – sparas bara i appen på din iPhone. Lagom har inga konton och ingen server med dagböcker. Vi kan inte se, läsa eller återställa din data.',
        'Det gäller även uppgifter om hälsa, till exempel vikt, graviditet och amning. De lämnar aldrig telefonen om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.',
        'Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort telefonen eller tar bort appen försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.',
      ],
    },
  },
  {
    id: 'lagring',
    heading: 'Lagring på din enhet',
    paragraphs: [
      'Lagom sparar det som behövs för att appen ska fungera i enhetens lagring: IndexedDB, localStorage, sessionStorage och service workerns cache. Inget av det används för reklam eller spårning, och inget skickas till oss. All lagring är nödvändig för tjänsten du har bett om, så Lagom behöver inte fråga om samtycke till kakor.',
    ],
    table: {
      columns: STORAGE_COLUMNS,
      rows: [
        [
          'Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering och inställningar',
          'IndexedDB',
          'Det är själva dagboken – appen fungerar inte utan den',
          'Tills du raderar den',
          'Inställningar → Data → Radera all data',
        ],
        [
          'Licens och när provperioden startade',
          'IndexedDB',
          'För att veta om Lagom är upplåst',
          'Tills du tar bort den. Provperiodens startdatum finns kvar när du raderar din data, så att provperioden inte börjar om',
          'Licensen: Inställningar → Data → Radera all data med valet Ta även bort licensen. Provperiodens startdatum: rensa webbplatsens data eller avinstallera appen',
        ],
        [
          'Spärrlistan: licens-id för licenser som har återkallats, till exempel för att köpet har återbetalats eller bestridits',
          'localStorage (lagom-sparrlista)',
          'Så att en återkallad licens slutar gälla även utan uppkoppling',
          'Tills en nyare lista hämtas',
          'Rensa webbplatsens data eller avinstallera appen',
        ],
        [
          'Tema (ljust eller mörkt)',
          'localStorage (lagom-theme)',
          'Så att appen startar i rätt färger utan att blinka',
          'Tills du byter tema',
          'Inställningar → Utseende och visning, eller rensa webbplatsens data',
        ],
        ['Små visningsval, till exempel dolda tips och pausad animation', 'localStorage', 'Så att appen minns dina val', 'Tills du ändrar dem', 'Rensa webbplatsens data'],
        [
          'När varje del av dagboken senast sparades – bara en slumpad tidsstämpel, ingen data',
          'localStorage (lagom-sparad:…)',
          'Så att flera öppna flikar med Lagom inte skriver över varandras ändringar',
          'Tills du rensar webbplatsens data',
          'Rensa webbplatsens data eller avinstallera appen',
        ],
        DEMO_ROW,
        BACKUP_ROW,
        ERROR_LOG_ROW,
        [
          'Korgen när du lägger till flera livsmedel, utkastet i välkomstflödet, om appen startats från Google Play och när appen senast laddades om efter en uppdatering',
          'sessionStorage (lagom-korg, lagom-onboarding, lagom-twa, lagom-chunk-reload)',
          'Så att inget försvinner om sidan laddas om – och så att appen inte laddas om gång på gång efter en uppdatering',
          'Tills du stänger fliken eller appen',
          'Stäng fliken eller appen',
        ],
        [
          'Appens filer, Livsmedelsverkets databas och produktbilder du har visat',
          'Service workerns cache',
          'Så att appen startar snabbt och fungerar utan uppkoppling',
          'Tills en ny version ersätter filerna. Produktbilder högst 60 dagar',
          'Rensa webbplatsens data i webbläsaren eller avinstallera appen',
        ],
      ],
    },
    closing: ['Allt rensas också om du tar bort webbplatsens data i webbläsarens inställningar eller avinstallerar appen.'],
    appStore: {
      paragraphs: [
        'Lagom sparar det som behövs för att appen ska fungera i appens lagring på din iPhone: IndexedDB, localStorage, sessionStorage och en cache för bilder. Inget av det används för reklam eller spårning, och inget skickas till oss. All lagring är nödvändig för tjänsten du har bett om, så Lagom behöver inte fråga om samtycke.',
      ],
      table: {
        columns: STORAGE_COLUMNS,
        rows: [
          [
            'Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering och inställningar',
            'IndexedDB',
            'Det är själva dagboken – appen fungerar inte utan den',
            'Tills du raderar den',
            'Inställningar → Data → Radera all data',
          ],
          [
            'När provperioden startade',
            'IndexedDB',
            'För att veta hur länge provperioden gäller. Köp i appen hämtas från App Store och sparas inte av Lagom',
            'Tills du avinstallerar appen. Startdatumet finns kvar när du raderar din data, så att provperioden inte börjar om',
            'Avinstallera appen',
          ],
          ['Tema (ljust eller mörkt)', 'localStorage (lagom-theme)', 'Så att appen startar i rätt färger utan att blinka', 'Tills du byter tema', 'Inställningar → Utseende och visning'],
          ['Små visningsval, till exempel dolda tips och pausad animation', 'localStorage', 'Så att appen minns dina val', 'Tills du ändrar dem', 'Avinstallera appen'],
          [
            'När varje del av dagboken senast sparades – bara en slumpad tidsstämpel, ingen data',
            'localStorage (lagom-sparad:…)',
            'Så att en äldre kopia av dagboken aldrig skriver över en nyare',
            'Tills du avinstallerar appen',
            'Avinstallera appen',
          ],
          DEMO_ROW,
          BACKUP_ROW,
          ERROR_LOG_ROW,
          [
            'Korgen när du lägger till flera livsmedel, utkastet i välkomstflödet och när appen senast laddades om efter en uppdatering',
            'sessionStorage (lagom-korg, lagom-onboarding, lagom-chunk-reload)',
            'Så att inget försvinner om appen laddas om',
            'Tills du stänger appen',
            'Stäng appen',
          ],
          ['Produktbilder du har visat', 'Appens cache', 'Så att bilderna visas snabbt', 'Tills iOS rensar cachen', 'Avinstallera appen'],
        ],
      },
      closing: ['Allt rensas också om du avinstallerar appen.'],
    },
  },
  {
    id: 'tjanster',
    heading: 'Tjänster som appen kontaktar',
    paragraphs: [
      'För att appen ska fungera kontaktar den några tjänster på internet. Varje gång det sker ser mottagaren din IP-adress – så fungerar internet. Din dagbok, ditt namn och din e-post skickas aldrig med.',
    ],
    items: [
      'Netlify, vårt webbhotell: när du öppnar Lagom på webben eller i Google Play-appen hämtas appen därifrån, och där körs också våra serverfunktioner – för köp, för spärrlistan över återkallade licenser och för receptimport. Netlify sparar IP-adressen en kort tid i sina loggar, och Netlify och våra funktioner använder den en kort stund för att begränsa missbruk.',
      OFF_ITEM,
      LMV_ITEM,
      RECIPE_ITEM,
      'App Store och Google Play: när du köper i appen eller trycker på Återställ köp kontaktar appen butiken via din telefon.',
    ],
    webItems: ['Stripe: när du köper en licens på webben (se ”När du köper”).'],
    keyItems: [
      'Spärrlistan: har du aktiverat en licensnyckel hämtar appen ungefär en gång per dygn en lista över licenser som har återkallats, till exempel för att köpet har återbetalats eller bestridits. Inget om dig skickas med – kontrollen görs på enheten.',
    ],
    appStore: {
      items: [
        'Netlify, vårt webbhotell: där körs våra serverfunktioner. iPhone-appen anropar dem bara när du hämtar ett recept från en webbadress. Netlify sparar IP-adressen en kort tid i sina loggar, och Netlify och våra funktioner använder den en kort stund för att begränsa missbruk.',
        OFF_ITEM,
        LMV_ITEM,
        RECIPE_ITEM,
        'App Store: när du köper i appen eller trycker på Återställ köp kontaktar appen App Store via din telefon.',
      ],
    },
  },
  {
    id: 'kameran',
    heading: 'Kameran',
    paragraphs: [
      'Lagom använder kameran bara när du skannar en streckkod. Bilden analyseras direkt på enheten och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i enhetens eller webbläsarens inställningar.',
    ],
    appStore: {
      paragraphs: [
        'Lagom använder kameran bara när du skannar en streckkod. Bilden analyseras direkt på telefonen och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i telefonens Inställningar.',
      ],
    },
  },
  {
    id: 'kop',
    heading: 'När du köper',
    paragraphs: [
      'I App Store och Google Play sköter Apple respektive Google betalningen. Appen får bara en bekräftelse på köpet – vilken licens och när – aldrig ditt namn, din e-post eller dina betalningsuppgifter. Apple och Google ansvarar själva för sin behandling.',
    ],
    webParagraphs: [
      'På webben sköter Stripe betalningen. Stripe behandlar din e-postadress, ditt namn, land, betalkortsuppgifter (eller uppgifter för det betalsätt du väljer) och köp-id. Väljer du Klarna, Swish, Apple Pay eller Google Pay behandlar de också dina uppgifter enligt sina villkor. Vi ser köpet i Stripe – e-post, namn, land, belopp, licens och köp-id – men aldrig dina kortuppgifter. Vid köpet sparas köp-id, licenstyp och när du samtyckte till omedelbar leverans på köpet hos Stripe – vi har ingen egen databas – så att vi kan utfärda licensen, hjälpa dig om du tappar nyckeln, spärra licensen om köpet återbetalas och sköta bokföringen.',
      'Licensnyckeln innehåller inte ditt namn eller din e-post – bara licenstyp, datum och ett köp-id som vi kan koppla till betalningen om du behöver hjälp.',
      'Tappar du nyckeln kan du be om den igen med din e-post och ditt kvittonummer (eller köp-id). Uppgifterna skickas via vår serverfunktion till Stripe för att hitta köpet och sparas inte hos oss.',
    ],
    appStore: {
      paragraphs: [
        'I App Store sköter Apple betalningen. Appen får bara en bekräftelse på köpet – vilken licens och när – aldrig ditt namn, din e-post eller dina betalningsuppgifter. Apple ansvarar själv för sin behandling.',
      ],
    },
  },
  {
    id: 'rattslig-grund',
    heading: 'Varför vi får behandla uppgifterna',
    paragraphs: ['Vi behandlar bara personuppgifter när dataskyddsförordningen (GDPR) ger stöd för det:'],
    items: [
      'Avtal (artikel 6.1 b): för att sälja och leverera licensen, hjälpa dig med köpet och ge dig de funktioner du ber om, till exempel sökning och streckkodsläsning.',
      'Rättslig förpliktelse (artikel 6.1 c): för att bokföra köpet enligt bokföringslagen.',
      'Berättigat intresse (artikel 6.1 f): för säkerhet, för att begränsa missbruk av våra serverfunktioner, för spärrlistan över återkallade licenser och för att kunna svara när du kontaktar oss. Du kan invända mot sådan behandling (se ”Dina rättigheter”).',
    ],
  },
  {
    id: 'lagringstid',
    heading: 'Hur länge vi sparar',
    paragraphs: [],
    items: [
      'Bokföringsunderlag, till exempel kvitton och utbetalningsrapporter: så länge bokföringslagen kräver (7 kap. 2 §) – i dag till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades.',
      'Supportmejl: i 24 månader efter vår senaste kontakt, om de inte behövs längre för en pågående reklamation eller för bokföringen.',
      'Serverloggar hos Netlify: enligt Netlifys lagringstid för loggar.',
      'Anropsbegränsning: Netlify och våra funktioner använder IP-adressen bara en kort stund – några minuter – för att begränsa missbruk.',
      'Din dagbok: tills du själv raderar den – vi har ingen kopia.',
    ],
    webItems: ['Köp på webben: uppgifterna om köpet finns kvar hos Stripe lika länge som bokföringsunderlaget. Stripe sparar också uppgifter enligt sina egna regler.'],
    closing: ['Apple och Google sparar uppgifter om köp i butikerna enligt sina egna regler.'],
    appStore: { closing: ['Apple sparar uppgifter om köp i App Store enligt sina egna regler.'] },
  },
  {
    id: 'mottagare',
    heading: 'Mottagare och överföringar utanför EU',
    paragraphs: [
      'Vi säljer aldrig uppgifter och lämnar inte ut dem till någon annan, om vi inte måste enligt lag. De här tar emot uppgifter för vår räkning som personuppgiftsbiträden:',
    ],
    items: ['Netlify, Inc. (USA) – webbhotell och serverfunktioner.', 'Vår e-posttjänst – när du mejlar oss.'],
    webItems: [
      'Stripe (Stripe Payments Europe Ltd, Irland) – betalningar på webben. Stripe är vårt personuppgiftsbiträde för själva betalningen, men självständigt personuppgiftsansvarig för till exempel bedrägerikontroll och lagkrav.',
    ],
    closing: [TRANSFER_TEXT, 'Apple, Google, Open Food Facts och Livsmedelsverket är själva ansvariga för den behandling de gör när du använder deras tjänster.'],
    appStore: {
      closing: [TRANSFER_TEXT, 'Apple, Open Food Facts och Livsmedelsverket är själva ansvariga för den behandling de gör när du använder deras tjänster.'],
    },
  },
  {
    id: 'barn',
    heading: 'Barn och unga',
    paragraphs: [
      AGE_TEXT,
      'Vi samlar inte in uppgifter om barn. Din dagbok stannar på enheten oavsett ålder – vi får inga uppgifter om dig när du använder appen.',
    ],
  },
  {
    id: 'ingen-sparning',
    heading: 'Ingen reklam, ingen spårning',
    paragraphs: [
      'Lagom visar ingen reklam och innehåller inga analysverktyg, spårningspixlar, reklam-id eller andra tredjepartsskript. Vi bygger inga profiler om dig, fattar inga automatiska beslut och säljer aldrig uppgifter.',
      'Skulle vi någon gång vilja lägga till något sådant frågar vi om ditt samtycke först och uppdaterar den här policyn.',
    ],
  },
  {
    id: 'rattigheter',
    heading: 'Dina rättigheter',
    paragraphs: ['Du har rätt att:'],
    items: [
      'Få veta vilka uppgifter vi har om dig och få en kopia (registerutdrag).',
      'Få felaktiga uppgifter rättade.',
      'Få uppgifter raderade – bokföringsunderlag måste vi dock spara så länge lagen kräver.',
      'Få ut dina uppgifter i ett maskinläsbart format (dataportabilitet). Din dagbok exporterar du själv under Inställningar → Data.',
      'Invända mot behandling som bygger på vårt berättigade intresse, och begära att behandlingen begränsas.',
    ],
    closing: [
      'Din dagbok raderar du själv under Inställningar → Data – vi har ingen kopia. För uppgifter om köp och support: mejla {epost}. Vi svarar inom en månad.',
      'Tycker du att vi behandlar uppgifter fel kan du klaga hos Integritetsskyddsmyndigheten (IMY), [imy.se](https://www.imy.se).',
    ],
  },
  {
    id: 'andringar',
    heading: 'Ändringar i policyn',
    paragraphs: [
      'Vi uppdaterar policyn när Lagom ändras, till exempel om en ny tjänst kopplas in. Datumet överst visar vilken version som gäller. Om större ändringar berättar vi i appen innan de börjar gälla.',
    ],
  },
  {
    id: 'kontakt',
    heading: 'Kontakt',
    paragraphs: [
      'Frågor om integritet och dina uppgifter: {epost}.',
      'Post: {namn}, {adress}.',
      'Läs också [köp- och användarvillkoren](lagom:villkor).',
    ],
  },
]

/** Integritetspolicyn med säljarens uppgifter ifyllda. */
export function privacySections(seller: SellerInfo): LegalSection[] {
  return PRIVACY_TEMPLATE.map((s) => fillSection(s, seller))
}

/** Integritetspolicyn i appen (uppgifter från VITE_SELLER_*, annars platshållare). */
export const PRIVACY_SECTIONS: LegalSection[] = privacySections(appSeller())

// ---------------------------------------------------------------------------
// Köp- och användarvillkor
// ---------------------------------------------------------------------------

const MEDICAL_TEXT =
  'Inte medicinsk rådgivning: Lagom ger allmän information om mat och näring och är inte en medicinteknisk produkt. Mål och beräkningar är uppskattningar och ersätter inte råd från vården. Rådgör med vården om du har en sjukdom, är gravid eller ammar, eller funderar på att ändra din vikt – kontakta [1177](https://www.1177.se) vid frågor om hälsa. Tänker du mycket på mat och vikt finns stöd hos [Frisk & Fri](https://www.friskfri.se).'

const APPLE_EULA_TEXT =
  'För köp i App Store gäller även Apples [standardvillkor för appar](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/). Din rätt att reklamera enligt konsumentköplagen påverkas inte.'

/** Användarvillkoren efter punkten om rätten att använda appen (samma på alla plattformar). */
const USER_TERMS_ITEMS = [
  MEDICAL_TEXT,
  'Innehåll från andra: näringsvärden kommer från Livsmedelsverket, Open Food Facts och andra källor och kan innehålla fel. Jämför gärna med förpackningen.',
  'Din data: du ansvarar själv för din dagbok och för att spara säkerhetskopior. Vi har ingen kopia och kan inte återställa data som försvunnit från din enhet.',
  'Ansvarsbegränsning: i den utsträckning lagen tillåter ansvarar vi inte för indirekta skador, till exempel förlorad data eller beslut du fattar utifrån appens uppskattningar. Begränsningen inskränker aldrig dina rättigheter enligt tvingande konsumentlagstiftning.',
]

function termsTemplate(): LegalSection[] {
  return [
    {
      id: 'saljare',
      heading: 'Säljare',
      paragraphs: [
        `Lagom säljs av {namn} (enskild firma${ORGNR_PHRASE}).`,
        'Adress: {adress}. Telefon: {telefon}. E-post: {epost}. Momsregistreringsnummer: {moms}.',
        'Villkoren gäller när du köper en licens och när du använder Lagom. Hur vi hanterar personuppgifter står i [integritetspolicyn](lagom:integritet).',
      ],
    },
    {
      id: 'vad-du-koper',
      heading: 'Vad du köper',
      paragraphs: ['En personlig licens som låser upp allt i Lagom – inga tillägg och ingen reklam. Det finns två licenser:'],
      items: [
        'Årslicens: gäller i 365 dagar från köpet och förnyas inte automatiskt – inget dras igen. När året är slut väljer du själv om du vill köpa en ny.',
        'Livstidslicens: ett engångsköp utan årsavgift som gäller för alltid (se ”Livstidslicensen”).',
      ],
      closing: [
        'Licensen är personlig. Du får använda den på dina egna enheter men inte dela den med andra eller sälja den vidare.',
        'Din data låses aldrig: även utan giltig licens kan du se, exportera och radera allt.',
      ],
    },
    {
      id: 'pris',
      heading: 'Pris och betalning',
      webOnly: true,
      paragraphs: [
        `Årslicensen kostar ${priceOf('ar')} och livstidslicensen ${priceOf('livstid')}. Priserna är i svenska kronor inklusive 25 % moms, och inga andra avgifter tillkommer.`,
        'Betalningen sköts av Stripe. Du betalar med kort eller något av de andra betalsätt som visas hos Stripe. Vi ser eller sparar aldrig dina kortuppgifter.',
      ],
    },
    {
      id: 'kopet',
      heading: 'Så går köpet till',
      webOnly: true,
      paragraphs: ['Så här köper du en licens på webben:'],
      steps: [
        'Välj licens under Lagom Premium.',
        'Läs sammanfattningen och köpvillkoren och kryssa i att du vill ha licensen levererad direkt (och att ångerrätten då upphör).',
        'Betala hos Stripe, där du också godkänner köpvillkoren. Innan du betalar kan du se och rätta dina uppgifter, till exempel e-post och kortnummer – eller gå tillbaka och välja en annan licens.',
        'När betalningen är klar visas licensnyckeln, och den aktiveras på enheten.',
      ],
      closing: [
        'Avtalet ingås på svenska. Köpet sparas hos Stripe och i vår bokföring. En bekräftelse med kvitto, de viktigaste villkoren och villkorens version skickas till den e-post du anger hos Stripe, och hela villkoren finns alltid på den här sidan med versionsdatum.',
      ],
    },
    {
      id: 'angerratt',
      heading: 'Leverans och ångerrätt',
      webOnly: true,
      paragraphs: [
        'Licensen levereras direkt när betalningen är klar.',
        'Vid köp på distans har du normalt 14 dagars ångerrätt. För digitalt innehåll som levereras direkt upphör ångerrätten när leveransen har påbörjats, om du uttryckligen har samtyckt till det och bekräftat att ångerrätten därmed upphör (2 kap. 11 § lagen om distansavtal och avtal utanför affärslokaler). Det gör du i rutan före betalningen, och en bekräftelse skickas till din e-post.',
        'Din rätt att reklamera fel påverkas inte (se ”Fel och reklamation”).',
      ],
    },
    {
      id: 'funktion',
      heading: 'Funktion och kompatibilitet',
      paragraphs: [
        'Lagom fungerar i aktuella versioner av Safari, Chrome, Edge och Firefox, som installerad webbapp och som app från App Store (iPhone) och Google Play. Appen fungerar utan uppkoppling; sökning online, streckkoder, köp och receptimport kräver uppkoppling.',
        'Din data sparas i den webbläsare eller app där du använder Lagom och synkas inte mellan enheter. Du flyttar den med en säkerhetskopia (Inställningar → Data).',
        'Köp i App Store eller Google Play följer ditt Apple- eller Google-konto – på en ny enhet trycker du på Återställ köp.',
      ],
      webParagraphs: ['En licensnyckel från ett köp på webben klistrar du in under Inställningar → Licens på varje enhet där du vill använda den.'],
      appStore: {
        paragraphs: [
          'Lagom fungerar på iPhone med en aktuell version av iOS. Appen fungerar utan uppkoppling; sökning online, streckkoder, köp och receptimport kräver uppkoppling.',
          'Din data sparas i appen på din iPhone och synkas inte mellan enheter. Du flyttar den med en säkerhetskopia (Inställningar → Data).',
          'Köp i App Store följer ditt Apple-konto – på en ny iPhone trycker du på Återställ köp.',
        ],
      },
    },
    {
      id: 'reklamation',
      heading: 'Fel och reklamation',
      paragraphs: [
        'Om Lagom inte fungerar som vi har lovat har du rätt att reklamera enligt konsumentköplagen (2022:260), som också gäller digitalt innehåll. Kontakta oss på {epost} och beskriv felet inom skälig tid efter att du märkt det – inom två månader räknas alltid som i tid.',
        'I första hand rättar vi felet. Går det inte har du rätt till prisavdrag eller att häva köpet och få pengarna tillbaka.',
        'Har du köpt i App Store eller Google Play kan du också begära återbetalning hos butiken enligt dess villkor.',
      ],
      appStore: {
        paragraphs: [
          'Om Lagom inte fungerar som vi har lovat har du rätt att reklamera enligt konsumentköplagen (2022:260), som också gäller digitalt innehåll. Kontakta oss på {epost} och beskriv felet inom skälig tid efter att du märkt det – inom två månader räknas alltid som i tid.',
          'I första hand rättar vi felet. Går det inte har du rätt till prisavdrag eller att häva köpet och få pengarna tillbaka.',
          'Har du köpt i App Store kan du också begära återbetalning hos Apple på [reportaproblem.apple.com](https://reportaproblem.apple.com).',
        ],
      },
    },
    {
      id: 'uppdateringar',
      heading: 'Uppdateringar och support',
      paragraphs: [
        'Vi ger ut de uppdateringar som behövs för att Lagom ska fortsätta fungera som utlovat, även säkerhetsuppdateringar, under den tid du rimligen kan förvänta dig. Felrättningar ingår i båda licenserna medan licensen gäller – för livstidslicensen så länge vi ger ut Lagom. Nya funktioner kan komma, men de ingår inte i det du köper och utlovas inte.',
        'Support ges på svenska via e-post: {epost}. Vi svarar så snart vi kan, normalt inom några arbetsdagar.',
      ],
    },
    {
      id: 'livstid',
      heading: 'Livstidslicensen',
      paragraphs: [LIFETIME_PROMISE, 'Du betalar en gång, och du kan alltid exportera din data.'],
    },
    {
      id: 'provperiod',
      heading: 'Provperioden',
      paragraphs: [
        `De första ${TRIAL_DAYS} dagarna är gratis och allt är öppet. Inget kort behövs, och inget dras automatiskt när provperioden tar slut.`,
        'Provperioden startar när du skapar din egen profil – inte när du tittar på exempeldata. Den gäller en gång per enhet och börjar inte om om du raderar din data.',
        'Efter provperioden kan du fortfarande se, exportera och radera allt – att logga nytt kräver ett köp.',
      ],
    },
    {
      id: 'butikerna',
      heading: 'Köp i App Store och Google Play',
      paragraphs: [
        'Köper du Lagom i App Store eller Google Play sköter butiken betalningen, kvittot och eventuell återbetalning enligt sina villkor, och priset visas i butiken. Återbetalning begär du hos Apple på [reportaproblem.apple.com](https://reportaproblem.apple.com) eller i Google Play.',
        'Köpet följer ditt Apple- eller Google-konto. På en ny telefon trycker du på Återställ köp i Lagom.',
        APPLE_EULA_TEXT,
      ],
      appStore: {
        heading: 'Köp i App Store',
        paragraphs: [
          'Köper du Lagom i App Store sköter Apple betalningen, kvittot och eventuell återbetalning enligt sina villkor, och priset visas i App Store. Återbetalning begär du hos Apple på [reportaproblem.apple.com](https://reportaproblem.apple.com).',
          'Köpet följer ditt Apple-konto. På en ny iPhone trycker du på Återställ köp i Lagom.',
          APPLE_EULA_TEXT,
        ],
      },
    },
    {
      id: 'anvandarvillkor',
      heading: 'Användarvillkor',
      paragraphs: ['Villkoren gäller all användning av Lagom, även under provperioden och utan köp.'],
      items: [
        'Rätt att använda appen: du får använda Lagom för ditt eget, privata bruk. Du får inte kopiera, sälja eller sprida appen eller licensnycklar, kringgå licenskontrollen eller använda appen på ett sätt som skadar den eller andra.',
        ...USER_TERMS_ITEMS,
      ],
      appStore: {
        items: [
          'Rätt att använda appen: du får använda Lagom för ditt eget, privata bruk. Du får inte kopiera, sälja eller sprida appen, kringgå licenskontrollen eller använda appen på ett sätt som skadar den eller andra.',
          ...USER_TERMS_ITEMS,
        ],
      },
    },
    {
      id: 'minderariga',
      heading: 'Minderåriga',
      paragraphs: [AGE_TEXT, 'Lagom föreslår aldrig viktnedgång (kaloriunderskott) för den som kan vara under 18 år.'],
    },
    {
      id: 'tvister',
      heading: 'Tvister',
      paragraphs: [
        'Är du inte nöjd – kontakta oss först på {epost}, så försöker vi lösa det.',
        'Blir vi inte överens kan du vända dig till Allmänna reklamationsnämnden (ARN), [www.arn.se](https://www.arn.se). Vi medverkar i ARN:s handläggning.',
        'Svensk lag gäller. En tvist kan också prövas av allmän domstol.',
      ],
    },
    {
      id: 'andringar',
      heading: 'Ändringar i villkoren',
      paragraphs: [
        'Villkoren har ett versionsdatum överst. Ändrar vi dem gäller den nya versionen för nya köp och för användning efter att ändringen börjat gälla – om större ändringar berättar vi i appen i förväg. En ändring gäller aldrig till din nackdel för en licens du redan har köpt.',
      ],
    },
  ]
}

/** Köp- och användarvillkoren med säljarens uppgifter ifyllda. */
export function termsSections(seller: SellerInfo): LegalSection[] {
  return termsTemplate().map((s) => fillSection(s, seller))
}

/** Köp- och användarvillkoren i appen. */
export const TERMS_SECTIONS: LegalSection[] = termsSections(appSeller())

/** Avsnitten som utgör användarvillkoren (docs/ANVANDARVILLKOR.md). */
export const USER_TERMS_SECTION_IDS: readonly string[] = ['anvandarvillkor', 'uppdateringar', 'minderariga', 'andringar', 'tvister']
