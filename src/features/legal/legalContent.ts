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
 * stycken om licensnycklar bara där nycklar kan aktiveras, i iPhone-appen (App Store) texten
 * i `appStore` – Apple godkänner inga omnämnanden av andra plattformar eller köpsätt i appen
 * (riktlinje 2.3.10 och 3.1.1) – och i Google Play-appen texten i `play` (inga webbköp,
 * webbläsare eller service worker, ägarens beslut: bara köp i appen i butiksapparna). Play-texten
 * finns också som fristående sida för Health Connect (public/integritet/android/, se legalDocs.ts).
 * Anteckningarna till ägaren finns i legalDocs.ts, så att de inte byggs in i appen.
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

/** Texten i iPhone-appen (App Store) eller Google Play-appen. Fälten som anges ersätter avsnittets vanliga fält. */
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
  /** Texten i Google Play-appen: inga webbköp, webbläsare eller service worker. */
  play?: LegalVariant
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
  const variant = (v: LegalVariant | undefined): LegalVariant | undefined =>
    v && {
      heading: v.heading === undefined ? undefined : fill(v.heading, seller),
      paragraphs: all(v.paragraphs),
      items: all(v.items),
      table: fillTable(v.table, seller),
      closing: all(v.closing),
    }
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
    appStore: variant(s.appStore),
    play: variant(s.play),
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
 * - i iPhone-appen ersätts texten av `appStore`-varianten och i Google Play-appen av `play`.
 */
export function visibleSections(sections: readonly LegalSection[], ctx: LegalContext): LegalSection[] {
  return sections
    .filter((s) => ctx.webSales || !s.webOnly)
    .map((s) => {
      const v = ctx.platform === 'appstore' ? s.appStore : ctx.platform === 'play' ? s.play : undefined
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
        play: undefined,
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

/** Påminnelser (bara i apparna): lokala notiser som telefonen själv visar. */
const REMINDER_ROW = [
  'Påminnelser du själv har slagit på (text och klockslag) – bara i apparna',
  'Telefonens notissystem',
  'Så att påminnelsen kan visas i tid, även när appen är stängd',
  'Tills du stänger av påminnelsen',
  'Inställningar → Påminnelser, eller Inställningar → Data → Radera all data',
]

const REMINDER_ROW_IOS = [
  'Påminnelser du själv har slagit på (text och klockslag)',
  'Telefonens notissystem',
  'Så att påminnelsen kan visas i tid, även när appen är stängd',
  'Tills du stänger av påminnelsen',
  'Inställningar → Påminnelser, eller Inställningar → Data → Radera all data',
]

/** Den automatiska kopian på telefonen (src/native/mirror.ts) – bara i apparna. */
const MIRROR_ROW = [
  'Automatisk kopia av dagboken, med samma innehåll som en säkerhetskopia – bara i apparna',
  'En fil i appens egen mapp på telefonen (lagom-spegling.json) – på iPhone utanför telefonens säkerhetskopia',
  'Så att dagboken inte försvinner om telefonen rensar appens lagring',
  'Uppdateras högst 30 sekunder efter en ändring och när du lämnar appen. Finns tills du raderar din data eller avinstallerar appen',
  'Inställningar → Data → Radera all data, eller avinstallera appen',
]

const MIRROR_ROW_IOS = [
  'Automatisk kopia av dagboken, med samma innehåll som en säkerhetskopia',
  'En fil i appens egen mapp på din iPhone (lagom-spegling.json), som inte följer med i telefonens säkerhetskopia',
  'Så att dagboken inte försvinner om iOS rensar appens lagring',
  'Uppdateras högst 30 sekunder efter en ändring och när du lämnar appen. Finns tills du raderar din data eller avinstallerar appen',
  'Inställningar → Data → Radera all data, eller avinstallera appen',
]

/** Framstegsbilder (src/lib/progressPhotos.ts, src/native/photos.ts) – bara om man slår på dem. */
const PHOTOS_ROW = [
  'Framstegsbilder som du själv har tagit eller valt – nedskalade och utan platsuppgifter eller annan information från bildfilen. Bara om du slår på framstegsbilder',
  'På webben: IndexedDB-databasen lagom-bilder, skild från dagboken. I apparna: filer i appens egen mapp på telefonen (mappen framsteg) – på iPhone utanför telefonens säkerhetskopia',
  'Så att du kan se och jämföra dina bilder över tid. De följer inte med i säkerhetskopian eller i den automatiska kopian, och skickas aldrig till oss',
  'Tills du raderar dem',
  'Vikt & mått → Framstegsbilder → Radera alla bilder (eller en bild i taget), Inställningar → Data → Radera all data, eller rensa webbplatsens data eller avinstallera appen',
]

const PHOTOS_ROW_PLAY = [
  'Framstegsbilder som du själv har tagit eller valt – nedskalade och utan platsuppgifter eller annan information från bildfilen. Bara om du slår på framstegsbilder',
  'Filer i appens egen mapp på telefonen (mappen framsteg). När du tar en bild med kameran skriver kameraappen först en tillfällig originalbild – med de platsuppgifter kameran eventuellt lägger till – i appens mapp på telefonens lagringsutrymme. Den tas bort så snart bilden har skalats ned, och annars nästa gång du öppnar appen eller Framstegsbilder, eller raderar all data',
  'Så att du kan se och jämföra dina bilder över tid. De följer inte med i säkerhetskopian, i den automatiska kopian eller i Googles säkerhetskopia i molnet, och skickas aldrig till oss. De kan flyttas med när du för över allt direkt till en ny telefon',
  'Tills du raderar dem eller avinstallerar appen',
  'Vikt & mått → Framstegsbilder → Radera alla bilder (eller en bild i taget), Inställningar → Data → Radera all data, eller avinstallera appen',
]

const PHOTOS_ROW_IOS = [
  'Framstegsbilder som du själv har tagit eller valt – nedskalade och utan platsuppgifter eller annan information från bildfilen. Bara om du slår på framstegsbilder',
  'Filer i appens egen mapp på din iPhone (mappen framsteg), som inte följer med i telefonens säkerhetskopia',
  'Så att du kan se och jämföra dina bilder över tid. De följer inte med i Lagoms säkerhetskopia, i den automatiska kopian eller till iCloud, och skickas aldrig till oss',
  'Tills du raderar dem eller avinstallerar appen',
  'Vikt & mått → Framstegsbilder → Radera alla bilder (eller en bild i taget), Inställningar → Data → Radera all data, eller avinstallera appen',
]

/** Allergier och intoleranser (settings.allergens i lagom-profile, src/lib/allergens.ts). */
const ALLERGY_ROW = [
  'Allergier och intoleranser som du markerar (uppgifter om hälsa)',
  'IndexedDB (lagom-profile, bland inställningarna)',
  'För att varsamt flagga produkter från Open Food Facts som innehåller det du har markerat – det räknas fram på enheten',
  'Tills du avmarkerar dem eller raderar all data',
  'Inställningar → Allergier och överkänslighet, eller Inställningar → Data → Radera all data',
]

/** Exportfiler som delas med telefonens delningsblad (src/native/files.ts) – bara i apparna. */
const EXPORT_ROW = [
  'Den senaste filen du har exporterat eller delat (säkerhetskopia, CSV eller ett delat recept eller en delad måltid) – bara i apparna',
  'Appens cache (mappen delning)',
  'Så att filen kan sparas eller delas med telefonens delningsblad',
  'Tills nästa export, tills du raderar din data eller tills telefonen rensar cachen',
  'Inställningar → Data → Radera all data, eller avinstallera appen',
]

const EXPORT_ROW_IOS = [
  'Den senaste filen du har exporterat eller delat (säkerhetskopia, CSV eller ett delat recept eller en delad måltid)',
  'Appens cache (mappen delning)',
  'Så att filen kan sparas eller delas, till exempel med Spara i Filer',
  'Tills nästa export, tills du raderar din data eller tills iOS rensar cachen',
  'Inställningar → Data → Radera all data, eller avinstallera appen',
]

/** Kopplingen till Apple Hälsa/Health Connect (src/native/health.ts) – bara i apparna. */
const HEALTH_ROW = [
  'Kopplingen till Apple Hälsa eller Health Connect: vad du har valt att hämta och skicka, när den senast synkade och en liten logg (id för hämtade vikter samt de senaste dagarnas ifyllda steg och skickade summor), så att inget hämtas eller skickas två gånger',
  'localStorage (lagom-health)',
  'Så att kopplingen fungerar utan dubbletter – bara i apparna och bara om du slår på den',
  'Tills du kopplar från, raderar din data eller avinstallerar appen. Loggen sparar bara de senaste dagarna (hämtade vikter högst 400 dagar)',
  'Inställningar → Data → Radera all data, eller avinstallera appen',
]

const HEALTH_ROW_IOS = [
  'Kopplingen till Apple Hälsa: vad du har valt att hämta och skicka, när den senast synkade och en liten logg (id för hämtade vikter samt de senaste dagarnas ifyllda steg och skickade summor), så att inget hämtas eller skickas två gånger',
  'localStorage (lagom-health)',
  'Så att kopplingen fungerar utan dubbletter – bara om du slår på den',
  'Tills du kopplar från, raderar din data eller avinstallerar appen. Loggen sparar bara de senaste dagarna (hämtade vikter högst 400 dagar)',
  'Inställningar → Data → Radera all data, eller avinstallera appen',
]

/** De senast kända köpen i appen (STORE_CACHE_KEY i src/hooks/useAccess.ts) – bara i apparna. */
const STORE_CACHE_ROW = [
  'Köp i appen som gäller: vilken licens (eller provperiod), köpdatum och slutdatum – bara i apparna',
  'localStorage (lagom-butikskop)',
  'Så att Lagom är upplåst även när butiken inte svarar, till exempel utan uppkoppling',
  'Tills butiken svarar med nya uppgifter – ett återbetalt köp försvinner då även här',
  'Avinstallera appen',
]

const STORE_CACHE_ROW_IOS = [
  'Köp i App Store som gäller: vilken licens eller provperiod, köpdatum och slutdatum',
  'localStorage (lagom-butikskop)',
  'Så att Lagom är upplåst även när App Store inte svarar, till exempel utan uppkoppling',
  'Tills App Store svarar med nya uppgifter – ett återbetalt köp försvinner då även här',
  'Avinstallera appen',
]

/** Lagringstiderna som gäller överallt (avsnittet "Hur länge vi sparar"). */
const RETENTION_ITEMS = [
  'Bokföringsunderlag, till exempel kvitton och utbetalningsrapporter: så länge bokföringslagen kräver (7 kap. 2 §) – i dag till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades.',
  'Supportmejl: i 24 månader efter vår senaste kontakt, om de inte behövs längre för en pågående reklamation eller för bokföringen.',
  'Serverloggar hos Netlify: enligt Netlifys lagringstid för loggar.',
  'Anropsbegränsning: Netlify och våra funktioner använder IP-adressen bara en kort stund – några minuter – för att begränsa missbruk.',
  'Din dagbok: tills du själv raderar den – vi har ingen kopia.',
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

/** Framstegsbilder med kameran (webben och standardtexten). */
const PHOTOS_CAMERA_TEXT =
  'Har du slagit på framstegsbilder kan du också ta en bild med kameran eller välja en bild. Bara den bild du själv tar eller väljer används – den skalas ned, rensas från platsuppgifter och annan information från bildfilen och sparas bara på din enhet (se ”Din dagbok finns bara på din enhet”).'

/**
 * "Fyll i från förpackningen" (src/lib/nutritionLabel.ts): telefonens egen textigenkänning ger
 * bara text, som tolkas på enheten och inte sparas. Ingen egen kamera- eller OCR-kod i Lagom.
 * Webben och Android lovar inget om själva textigenkänningen – på Android kan den vara t.ex.
 * Google Lens, som Lagom inte kan gå i god för. Live Text på iPhone arbetar på telefonen.
 */
const LABEL_TEXT_WEB =
  'Du kan också fylla i ett eget livsmedel från förpackningen genom att läsa av näringsdeklarationen med telefonens egen textigenkänning (till exempel Skanna text på iPhone) eller klistra in texten. Textigenkänningen är telefonens egen funktion och ingen del av Lagom – Lagom får bara texten, som tolkas direkt på enheten och inte sparas. Bara de värden du själv väljer att spara hamnar i det egna livsmedlet.'
const LABEL_TEXT_IOS =
  'Du kan också fylla i ett eget livsmedel från förpackningen genom att välja Skanna text i textrutan eller klistra in texten från näringsdeklarationen. Textigenkänningen sköts av din iPhone och Lagom får bara texten, som tolkas direkt på telefonen och inte sparas – bara de värden du själv väljer att spara hamnar i det egna livsmedlet.'
const LABEL_TEXT_PLAY =
  'Du kan också fylla i ett eget livsmedel från förpackningen genom att kopiera texten i näringsdeklarationen med telefonens textigenkänning och klistra in den. Textigenkänningen är telefonens egen funktion och ingen del av Lagom – Lagom får bara texten, som tolkas direkt på telefonen och inte sparas. Bara de värden du själv väljer att spara hamnar i det egna livsmedlet.'

/** Delade recept och måltider (src/lib/shareLink.ts) – samma text överallt, den nämner ingen plattform. */
const SHARE_TEXT =
  'Du kan dela ett eget recept eller en sparad måltid som länk eller fil. Då följer bara det du har valt med: namn, ingredienser eller livsmedel och mängder och – för recept – portioner, emoji, tid, märkningar, instruktioner och länk till källan. För livsmedel som inte finns i Lagoms egen lista (egna livsmedel och produkter från Open Food Facts eller Livsmedelsverket) följer även märke, kategori, näringsvärden per 100 g och portioner med. Ingenting ur din dagbok, din profil, dina mål eller dina allergiinställningar följer med, och inte heller uppgifter om allergener.'

const SHARE_LINK_TEXT =
  'Receptet ligger i själva länken, efter tecknet #. Den delen skickas inte till Lagoms webbplats när länken öppnas – webbplatsen tar bara emot en vanlig sidvisning. Länken går däremot genom den app du själv skickar den med, till exempel e-post eller en meddelandeapp, och alla som har länken kan se innehållet. Detsamma gäller en fil som du delar.'

const SHARE_RECEIVE_TEXT =
  'Det som delas med dig visas först på skärmen. Det sparas bland dina recept, sparade måltider och egna livsmedel på enheten bara om du väljer Spara.'

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
      'Det gäller även uppgifter om hälsa, till exempel vikt, graviditet, amning och allergier eller intoleranser som du markerar. De lämnar aldrig enheten om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.',
      'Allergier och intoleranser som du markerar under Inställningar → Allergier och överkänslighet sparas bara bland inställningarna på din enhet. Lagom använder dem bara för att, på enheten, flagga produkter från Open Food Facts som innehåller något av det du har markerat. De skickas aldrig till Open Food Facts eller till oss – sökningar och streckkoder skickas som vanligt, utan uppgifter om dina allergier.',
      'Framstegsbilder är avstängda tills du själv slår på dem. Bilderna sparas då bara på din enhet – nedskalade och utan platsuppgifter eller annan information från bildfilen – och följer aldrig med i säkerhetskopian, den automatiska kopian eller till oss. Du kan radera en bild eller alla när du vill.',
      'Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort enheten eller rensar webbläsaren försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.',
      'I apparna för iPhone och Android sparar Lagom dessutom en automatisk kopia av dagboken i appens egen mapp på telefonen, så att inget försvinner om telefonen rensar appens lagring. Kopian lämnar inte telefonen genom Lagom, och på iPhone följer den inte med i telefonens säkerhetskopia. På iPhone kan telefonens egen säkerhetskopia (iCloud eller en dator) ta med appens övriga data, som allt annat på telefonen – den sköts av Apple och ditt Apple-konto, inte av oss. På Android följer appens data inte med i Googles säkerhetskopia i molnet, men kan flyttas med när du för över allt direkt till en ny telefon.',
    ],
    appStore: {
      paragraphs: [
        'Allt du fyller i och loggar – profil och mål, mat och dryck, vikt och mått, träning, fasta, recept, veckoplanering och anteckningar – sparas bara i appen på din iPhone. Lagom har inga konton och ingen server med dagböcker. Vi kan inte se, läsa eller återställa din data.',
        'Det gäller även uppgifter om hälsa, till exempel vikt, graviditet, amning och allergier eller intoleranser som du markerar. De lämnar aldrig telefonen om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.',
        'Allergier och intoleranser som du markerar under Inställningar → Allergier och överkänslighet sparas bara bland inställningarna i appen på din iPhone. Lagom använder dem bara för att, på telefonen, flagga produkter från Open Food Facts som innehåller något av det du har markerat. De skickas aldrig till Open Food Facts eller till oss – sökningar och streckkoder skickas som vanligt, utan uppgifter om dina allergier.',
        'Framstegsbilder är avstängda tills du själv slår på dem. Bilderna sparas då bara i appen på din iPhone – nedskalade och utan platsuppgifter eller annan information från bildfilen – i en mapp som inte följer med i telefonens säkerhetskopia, och aldrig i Lagoms säkerhetskopia, den automatiska kopian eller till oss. Du kan radera en bild eller alla när du vill.',
        'Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort telefonen eller tar bort appen försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.',
        'Lagom sparar dessutom en automatisk kopia av dagboken i appens egen mapp på din iPhone, så att inget försvinner om iOS rensar appens lagring. Kopian lämnar inte telefonen genom Lagom och följer inte med i telefonens säkerhetskopia. Din iPhones egen säkerhetskopia (iCloud eller en dator) kan ta med appens övriga data, som allt annat på telefonen – den sköts av Apple och ditt Apple-konto, inte av oss.',
      ],
    },
    play: {
      paragraphs: [
        'Allt du fyller i och loggar – profil och mål, mat och dryck, vikt och mått, träning, fasta, recept, veckoplanering och anteckningar – sparas bara i appen på din telefon. Lagom har inga konton och ingen server med dagböcker. Vi kan inte se, läsa eller återställa din data.',
        'Det gäller även uppgifter om hälsa, till exempel vikt, graviditet, amning och allergier eller intoleranser som du markerar. De lämnar aldrig telefonen om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.',
        'Allergier och intoleranser som du markerar under Inställningar → Allergier och överkänslighet sparas bara bland inställningarna i appen på din telefon. Lagom använder dem bara för att, på telefonen, flagga produkter från Open Food Facts som innehåller något av det du har markerat. De skickas aldrig till Open Food Facts eller till oss – sökningar och streckkoder skickas som vanligt, utan uppgifter om dina allergier.',
        'Framstegsbilder är avstängda tills du själv slår på dem. Bilderna sparas då bara i appen på din telefon – nedskalade och utan platsuppgifter eller annan information från bildfilen – och följer aldrig med i säkerhetskopian, den automatiska kopian eller till oss. Du kan radera en bild eller alla när du vill.',
        'Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort telefonen eller tar bort appen försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.',
        'Lagom sparar dessutom en automatisk kopia av dagboken i appens egen mapp på telefonen, så att inget försvinner om telefonen rensar appens lagring. Kopian lämnar inte telefonen genom Lagom. Appens data följer inte med i Googles säkerhetskopia i molnet, men kan flyttas med när du för över allt direkt till en ny telefon.',
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
          'Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering, påminnelser och inställningar',
          'IndexedDB',
          'Det är själva dagboken – appen fungerar inte utan den',
          'Tills du raderar den',
          'Inställningar → Data → Radera all data',
        ],
        ALLERGY_ROW,
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
        STORE_CACHE_ROW,
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
        HEALTH_ROW,
        MIRROR_ROW,
        PHOTOS_ROW,
        EXPORT_ROW,
        REMINDER_ROW,
        [
          'Korgen när du lägger till flera livsmedel, utkastet i välkomstflödet, om appen startats från Google Play och när appen senast laddades om efter en uppdatering',
          'sessionStorage (lagom-korg, lagom-onboarding, lagom-twa, lagom-chunk-reload)',
          'Så att inget försvinner om sidan laddas om – och så att appen inte laddas om gång på gång efter en uppdatering',
          'Tills du stänger fliken eller appen',
          'Stäng fliken eller appen',
        ],
        [
          'Appens filer, Livsmedelsverkets databas och produktbilder du har visat (på webben – apparna har sina filer med sig)',
          'Service workerns cache',
          'Så att appen startar snabbt och fungerar utan uppkoppling',
          'Tills en ny version ersätter filerna. Produktbilder högst 60 dagar',
          'Rensa webbplatsens data i webbläsaren eller avinstallera appen',
        ],
      ],
    },
    closing: ['Allt rensas också om du tar bort webbplatsens data i webbläsarens inställningar eller avinstallerar appen.'],
    play: {
      paragraphs: [
        'Lagom sparar det som behövs för att appen ska fungera i appens lagring på telefonen: IndexedDB, localStorage, sessionStorage och en cache för bilder. Inget av det används för reklam eller spårning, och inget skickas till oss. All lagring är nödvändig för tjänsten du har bett om, så Lagom behöver inte fråga om samtycke.',
      ],
      table: {
        columns: STORAGE_COLUMNS,
        rows: [
          [
            'Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering, påminnelser och inställningar',
            'IndexedDB',
            'Det är själva dagboken – appen fungerar inte utan den',
            'Tills du raderar den',
            'Inställningar → Data → Radera all data',
          ],
          ALLERGY_ROW,
          [
            'Licens och när provperioden startade',
            'IndexedDB',
            'För att veta om Lagom är upplåst',
            'Tills du tar bort den. Provperiodens startdatum finns kvar när du raderar din data, så att provperioden inte börjar om',
            'Licensen: Inställningar → Data → Radera all data med valet Ta även bort licensen. Provperiodens startdatum: avinstallera appen',
          ],
          [
            'Spärrlistan: licens-id för licenser som har återkallats, till exempel för att köpet har återbetalats eller bestridits',
            'localStorage (lagom-sparrlista)',
            'Så att en återkallad licens slutar gälla även utan uppkoppling',
            'Tills en nyare lista hämtas',
            'Avinstallera appen',
          ],
          STORE_CACHE_ROW,
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
          HEALTH_ROW,
          MIRROR_ROW,
          PHOTOS_ROW_PLAY,
          EXPORT_ROW,
          REMINDER_ROW,
          [
            'Korgen när du lägger till flera livsmedel, utkastet i välkomstflödet och när appen senast laddades om efter en uppdatering',
            'sessionStorage (lagom-korg, lagom-onboarding, lagom-chunk-reload)',
            'Så att inget försvinner om appen laddas om',
            'Tills du stänger appen',
            'Stäng appen',
          ],
          ['Produktbilder du har visat', 'Appens cache', 'Så att bilderna visas snabbt', 'Tills Android rensar cachen', 'Avinstallera appen'],
        ],
      },
      closing: ['Allt rensas också om du avinstallerar appen.'],
    },
    appStore: {
      paragraphs: [
        'Lagom sparar det som behövs för att appen ska fungera i appens lagring på din iPhone: IndexedDB, localStorage, sessionStorage och en cache för bilder. Inget av det används för reklam eller spårning, och inget skickas till oss. All lagring är nödvändig för tjänsten du har bett om, så Lagom behöver inte fråga om samtycke.',
      ],
      table: {
        columns: STORAGE_COLUMNS,
        rows: [
          [
            'Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering, påminnelser och inställningar',
            'IndexedDB',
            'Det är själva dagboken – appen fungerar inte utan den',
            'Tills du raderar den',
            'Inställningar → Data → Radera all data',
          ],
          ALLERGY_ROW,
          STORE_CACHE_ROW_IOS,
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
          HEALTH_ROW_IOS,
          MIRROR_ROW_IOS,
          PHOTOS_ROW_IOS,
          EXPORT_ROW_IOS,
          REMINDER_ROW_IOS,
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
      'Netlify, vårt webbhotell: när du öppnar Lagom på webben hämtas appen därifrån, och där körs också våra serverfunktioner – för köp på webben, för spärrlistan över återkallade licenser och för receptimport. Apparna för iPhone och Android har sina filer med sig och anropar bara serverfunktionerna. Netlify sparar IP-adressen en kort tid i sina loggar, och Netlify och våra funktioner använder den en kort stund för att begränsa missbruk.',
      OFF_ITEM,
      LMV_ITEM,
      RECIPE_ITEM,
      'App Store och Google Play: när du köper i appen, trycker på Återställ köp eller öppnar appen (för att se vilka köp som gäller) kontaktar appen butiken via din telefon.',
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
        'App Store: när du köper i appen, trycker på Återställ köp eller öppnar appen (för att se vilka köp som gäller) kontaktar appen App Store via din telefon.',
      ],
    },
    play: {
      items: [
        'Netlify, vårt webbhotell: där körs våra serverfunktioner – för spärrlistan över återkallade licenser och för receptimport. Android-appen har sina filer med sig och anropar bara serverfunktionerna. Netlify sparar IP-adressen en kort tid i sina loggar, och Netlify och våra funktioner använder den en kort stund för att begränsa missbruk.',
        OFF_ITEM,
        LMV_ITEM,
        RECIPE_ITEM,
        'Google Play: när du köper i appen, trycker på Återställ köp eller öppnar appen (för att se vilka köp som gäller) kontaktar appen Google Play via din telefon.',
      ],
    },
  },
  {
    id: 'dela',
    heading: 'Dela recept och sparade måltider',
    paragraphs: [SHARE_TEXT, SHARE_LINK_TEXT, SHARE_RECEIVE_TEXT],
  },
  {
    id: 'kameran',
    heading: 'Kameran',
    paragraphs: [
      'Lagom använder kameran när du skannar en streckkod. Bilden analyseras direkt på enheten och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i enhetens eller webbläsarens inställningar.',
      'I apparna används telefonens egen streckkodsläsare: Apples inbyggda bildanalys på iPhone och den öppna läsaren ZXing, som ingår i appen, på Android. Båda läser koden på telefonen och skickar ingenting vidare.',
      LABEL_TEXT_WEB,
      PHOTOS_CAMERA_TEXT,
    ],
    appStore: {
      paragraphs: [
        'Lagom använder kameran när du skannar en streckkod. Bilden analyseras direkt på telefonen med Apples inbyggda bildanalys och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i telefonens Inställningar.',
        LABEL_TEXT_IOS,
        'Har du slagit på framstegsbilder kan du också ta en bild med kameran eller välja en bild. Bara den bild du själv tar eller väljer används – den skalas ned, rensas från platsuppgifter och annan information från bildfilen och sparas bara i appen på din iPhone (se ”Din dagbok finns bara på din enhet”).',
      ],
    },
    play: {
      paragraphs: [
        'Lagom använder kameran när du skannar en streckkod. Bilden analyseras direkt på telefonen med den öppna läsaren ZXing, som ingår i appen, och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i telefonens inställningar.',
        LABEL_TEXT_PLAY,
        'Har du slagit på framstegsbilder kan du också ta en bild med kameran eller välja en bild. Bara den bild du själv tar eller väljer används – den skalas ned, rensas från platsuppgifter och annan information från bildfilen och sparas bara i appen på din telefon (se ”Din dagbok finns bara på din enhet”).',
      ],
    },
  },
  {
    // Röstsökningen (src/lib/voiceSearch.ts): bara taligenkänning på enheten, bara på webben och aldrig i Safari.
    id: 'mikrofonen',
    heading: 'Mikrofonen och röstsökning',
    paragraphs: [
      'Röstsökningen är valfri. I webbläsare som kan tolka tal direkt på enheten (till exempel nyare versioner av Chrome) finns en mikrofonknapp i sökfältet. Webbläsaren frågar om lov att använda mikrofonen först när du trycker på knappen.',
      'Rösten tolkas helt på din enhet av webbläsarens inbyggda taligenkänning: Lagom kräver igenkänning på enheten och använder aldrig en taltjänst på nätet. Ljudet skickas inte till Lagom eller någon annan, och ingenting sparas. Den tolkade texten hamnar i sökfältet och används som om du hade skrivit den – en sökning i Open Food Facts görs bara om du själv trycker på Sök i Open Food Facts.',
      'Saknar enheten svensk taligenkänning kan du välja att låta webbläsaren hämta den en gång. Nedladdningen sköts av webbläsaren (i Chrome från Google), och Lagom skickar inga uppgifter i samband med den. Röstsökningen finns inte i Safari, i andra webbläsare på iPhone och iPad eller i apparna.',
    ],
    appStore: {
      heading: 'Mikrofonen',
      paragraphs: ['Lagom använder inte mikrofonen i appen på din iPhone – där finns ingen röstsökning.'],
    },
    play: {
      heading: 'Mikrofonen',
      paragraphs: ['Lagom använder inte mikrofonen i appen på din telefon – där finns ingen röstsökning.'],
    },
  },
  {
    id: 'halsa',
    heading: 'Apple Hälsa och Health Connect',
    paragraphs: [
      'I apparna för iPhone och Android kan du koppla Lagom till Apple Hälsa (iPhone) eller Health Connect (Android). Kopplingen är avstängd från början, och du väljer själv vad Lagom får läsa och skriva – telefonen frågar om lov för varje datatyp.',
      'Lagom kan läsa din vikt (nya vägningar hamnar i viktkurvan) och dina steg (fylls i under Träning). Lagom kan skriva energi från det du äter och dricker, vatten och vikter som du loggar i Lagom. Mat och vatten skickas dagen efter, när dagen är avslutad.',
      'Allt läses och skrivs direkt på telefonen. Uppgifterna från Apple Hälsa och Health Connect skickas aldrig till oss eller någon annan, används inte för reklam eller marknadsföring och delas inte vidare. Det som hämtas sparas i din dagbok på telefonen, som allt annat du loggar. Det Lagom har skickat till Apple Hälsa eller Health Connect finns kvar där om du kopplar från – där kan du ta bort det.',
      'Lagoms användning av uppgifter från Health Connect följer Health Connects behörighetspolicy, inklusive kraven på begränsad användning.',
      'Du kan när som helst stänga av kopplingen i Lagom (Inställningar → Apple Hälsa eller Health Connect) och ta tillbaka behörigheterna i Hälsa-appen (din profilbild → Appar → Lagom) eller i Health Connect (Appbehörigheter → Lagom).',
    ],
    appStore: {
      heading: 'Apple Hälsa',
      paragraphs: [
        'Du kan koppla Lagom till Apple Hälsa. Kopplingen är avstängd från början, och du väljer själv vad Lagom får läsa och skriva – din iPhone frågar om lov för varje datatyp.',
        'Lagom kan läsa din vikt (nya vägningar hamnar i viktkurvan) och dina steg (fylls i under Träning). Lagom kan skriva energi från det du äter och dricker, vatten och vikter som du loggar i Lagom. Mat och vatten skickas dagen efter, när dagen är avslutad.',
        'Allt läses och skrivs direkt på din iPhone. Uppgifterna från Apple Hälsa skickas aldrig till oss eller någon annan, används inte för reklam eller marknadsföring och delas inte vidare. Det som hämtas sparas i din dagbok på telefonen, som allt annat du loggar. Det Lagom har skickat till Apple Hälsa finns kvar där om du kopplar från – du tar bort det i Hälsa-appen.',
        'Du kan när som helst stänga av kopplingen i Lagom (Inställningar → Apple Hälsa) och ta tillbaka behörigheterna i Hälsa-appen: tryck på din profilbild och välj Appar → Lagom.',
      ],
    },
  },
  {
    id: 'paminnelser',
    heading: 'Påminnelser',
    paragraphs: [
      'I apparna för iPhone och Android kan du slå på påminnelser, till exempel om måltider, vatten eller säkerhetskopian. Allt är avstängt från början, och telefonen frågar om lov att visa notiser först när du slår på en påminnelse.',
      'Påminnelserna schemaläggs i telefonens eget notissystem och visas av telefonen, även när appen är stängd. Inget skickas via internet, och texterna nämner aldrig kalorier eller vikt. Du stänger av dem under Inställningar → Påminnelser eller i telefonens inställningar för notiser.',
    ],
    appStore: {
      paragraphs: [
        'Du kan slå på påminnelser, till exempel om måltider, vatten eller säkerhetskopian. Allt är avstängt från början, och din iPhone frågar om lov att visa notiser först när du slår på en påminnelse.',
        'Påminnelserna schemaläggs i telefonens eget notissystem och visas av telefonen, även när appen är stängd. Inget skickas via internet, och texterna nämner aldrig kalorier eller vikt. Du stänger av dem under Inställningar → Påminnelser eller under Inställningar → Notiser på din iPhone.',
      ],
    },
  },
  {
    id: 'kop',
    heading: 'När du köper',
    paragraphs: [
      'I App Store och Google Play sköter Apple respektive Google betalningen. Köpet görs i butikens eget köpfönster, direkt mellan telefonen och butiken – det går inte via oss eller någon annan tjänst. Appen får bara en bekräftelse på köpet – vilken licens och när – aldrig ditt namn, din e-post eller dina betalningsuppgifter. Bekräftelsen hämtas från butiken när appen startar, och den senast hämtade (vilken licens, köpdatum och slutdatum) sparas bara på telefonen, så att Lagom fungerar även utan uppkoppling. I iPhone-appen startas provperioden med ett gratis köp i App Store på samma sätt. Apple och Google ansvarar själva för sin behandling.',
    ],
    webParagraphs: [
      'På webben sköter Stripe betalningen. Stripe behandlar din e-postadress, ditt namn, land, betalkortsuppgifter (eller uppgifter för det betalsätt du väljer) och köp-id. Väljer du Klarna, Swish, Apple Pay eller Google Pay behandlar de också dina uppgifter enligt sina villkor. Vi ser köpet i Stripe – e-post, namn, land, belopp, licens och köp-id – men aldrig dina kortuppgifter. Vid köpet sparas köp-id, licenstyp och när du samtyckte till omedelbar leverans på köpet hos Stripe – vi har ingen egen databas – så att vi kan utfärda licensen, hjälpa dig om du tappar nyckeln, spärra licensen om köpet återbetalas och sköta bokföringen.',
      'Licensnyckeln innehåller inte ditt namn eller din e-post – bara licenstyp, datum och ett köp-id som vi kan koppla till betalningen om du behöver hjälp.',
      'Tappar du nyckeln kan du be om den igen med din e-post och ditt kvittonummer (eller köp-id). Uppgifterna skickas via vår serverfunktion till Stripe för att hitta köpet och sparas inte hos oss.',
    ],
    appStore: {
      paragraphs: [
        'I App Store sköter Apple betalningen. Köpet görs i App Stores eget köpfönster, direkt mellan telefonen och Apple – det går inte via oss eller någon annan tjänst. Appen får bara en bekräftelse på köpet – vilken licens eller provperiod och när – aldrig ditt namn, din e-post eller dina betalningsuppgifter. Provperioden startas på samma sätt, med ett gratis köp i App Store. Bekräftelsen hämtas från App Store när appen startar, och den senast hämtade (vilken licens eller provperiod, köpdatum och slutdatum) sparas bara på telefonen, så att Lagom fungerar även utan uppkoppling. Apple ansvarar själv för sin behandling.',
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
    appStore: {
      items: [
        'Avtal (artikel 6.1 b): för att ge dig de funktioner du ber om, till exempel sökning, streckkodsläsning och receptimport, och för att hjälpa dig med köp i appen.',
        'Rättslig förpliktelse (artikel 6.1 c): för att bokföra försäljningen i App Store enligt bokföringslagen.',
        'Berättigat intresse (artikel 6.1 f): för säkerhet, för att begränsa missbruk av våra serverfunktioner och för att kunna svara när du kontaktar oss. Du kan invända mot sådan behandling (se ”Dina rättigheter”).',
      ],
    },
  },
  {
    id: 'lagringstid',
    heading: 'Hur länge vi sparar',
    paragraphs: [],
    items: [
      ...RETENTION_ITEMS,
      'Uppgifter från Apple Hälsa eller Health Connect: bara på telefonen, i din dagbok, tills du raderar dem.',
    ],
    webItems: ['Köp på webben: uppgifterna om köpet finns kvar hos Stripe lika länge som bokföringsunderlaget. Stripe sparar också uppgifter enligt sina egna regler.'],
    closing: ['Apple och Google sparar uppgifter om köp i butikerna enligt sina egna regler.'],
    appStore: {
      items: [
        ...RETENTION_ITEMS,
        'Uppgifter från Apple Hälsa: bara på din iPhone, i din dagbok, tills du raderar dem.',
      ],
      closing: ['Apple sparar uppgifter om köp i App Store enligt sina egna regler.'],
    },
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
      play: {
        paragraphs: [
          'Lagom fungerar på Android-telefoner med en aktuell version av Android. Appen fungerar utan uppkoppling; sökning online, streckkoder, köp och receptimport kräver uppkoppling.',
          'Din data sparas i appen på din telefon och synkas inte mellan enheter. Du flyttar den med en säkerhetskopia (Inställningar → Data).',
          'Köp i Google Play följer ditt Google-konto – på en ny telefon trycker du på Återställ köp. Har du en licensnyckel klistrar du in den under Inställningar → Licens.',
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
        'Provperioden startar när du skapar din egen profil – inte när du tittar på exempeldata. Den gäller en gång per enhet och börjar inte om om du raderar din data. I iPhone-appen startas den i stället med ett gratis köp i App Store och följer ditt Apple-konto.',
        'Efter provperioden kan du fortfarande se, exportera och radera allt – att logga nytt kräver ett köp.',
      ],
      appStore: {
        paragraphs: [
          `De första ${TRIAL_DAYS} dagarna är gratis och allt är öppet. Inget dras automatiskt när provperioden tar slut.`,
          'Du startar provperioden med ett gratis köp i App Store när du har skapat din egen profil – att titta på exempeldata startar ingen provperiod. Provperioden följer ditt Apple-konto, gäller en gång och börjar inte om om du raderar din data eller installerar om appen.',
          'Efter provperioden kan du fortfarande se, exportera och radera allt – att logga nytt kräver ett köp.',
        ],
      },
    },
    {
      id: 'butikerna',
      heading: 'Köp i App Store och Google Play',
      paragraphs: [
        'Köper du Lagom i App Store eller Google Play sköter butiken betalningen, kvittot och eventuell återbetalning enligt sina villkor, och priset visas i butiken. Återbetalning begär du hos Apple på [reportaproblem.apple.com](https://reportaproblem.apple.com) eller i Google Play.',
        'Köpet följer ditt Apple- eller Google-konto. På en ny telefon trycker du på Återställ köp i Lagom.',
        'Köper du en ny årslicens i App Store innan den förra har gått ut börjar det nya året när det förra slutar. I Google Play kan en ny årslicens köpas när den förra har gått ut.',
        APPLE_EULA_TEXT,
      ],
      appStore: {
        heading: 'Köp i App Store',
        paragraphs: [
          'Köper du Lagom i App Store sköter Apple betalningen, kvittot och eventuell återbetalning enligt sina villkor, och priset visas i App Store. Återbetalning begär du hos Apple på [reportaproblem.apple.com](https://reportaproblem.apple.com).',
          'Köpet följer ditt Apple-konto. På en ny iPhone trycker du på Återställ köp i Lagom.',
          'Köper du en ny årslicens innan den förra har gått ut börjar det nya året när det förra slutar – inga betalda dagar går förlorade.',
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
