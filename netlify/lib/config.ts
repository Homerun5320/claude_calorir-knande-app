/**
 * Serverns inställningar från miljövariabler (Netlify → Site configuration → Environment variables).
 * Se docs/BETALNING.md och .env.example. Inga hemligheter loggas – bara namnen på det som saknas.
 */
import { SERVER_PLANS, type PlanId } from './plans.ts'

export type Env = Record<string, string | undefined>

/**
 * Säljarens uppgifter (distansavtalslagen). Läses ur samma VITE_SELLER_*-variabler som appen, så
 * att fakturan från Stripe och köpsidan i appen alltid visar samma sak. '' = saknas.
 */
export interface SellerInfo {
  /** VITE_SELLER_NAME – firmanamnet eller, för enskild firma, ditt namn. */
  name: string
  /** VITE_SELLER_ORGNR – organisationsnummer (för enskild firma personnumret). */
  orgnr: string
  /** VITE_SELLER_ADDRESS – postadress. */
  address: string
  /** VITE_SELLER_PHONE – telefonnummer. */
  phone: string
  /** VITE_SUPPORT_EMAIL – e-post för frågor om köp ('' om den bara är ett exempel). */
  email: string
  /** VITE_SELLER_VAT – momsregistreringsnummer (frivilligt, en momsbefriad firma har inget). */
  vat: string
}

/** Platshållare när en uppgift saknas – samma som i de fristående villkorssidorna. */
export const SELLER_PLACEHOLDERS: Readonly<Record<Exclude<keyof SellerInfo, 'vat'>, string>> = {
  name: '[Företagsnamn]',
  orgnr: '[Org.nr]',
  address: '[Adress]',
  phone: '[Telefon]',
  email: '[E-post]',
}

/** Miljövariabeln bakom varje obligatorisk uppgift. */
const SELLER_ENV: ReadonlyArray<{ field: Exclude<keyof SellerInfo, 'vat'>; env: string }> = [
  { field: 'name', env: 'VITE_SELLER_NAME' },
  { field: 'orgnr', env: 'VITE_SELLER_ORGNR' },
  { field: 'address', env: 'VITE_SELLER_ADDRESS' },
  { field: 'phone', env: 'VITE_SELLER_PHONE' },
  { field: 'email', env: 'VITE_SUPPORT_EMAIL' },
]

/** Köpvillkorens version när TERMS_VERSION saknas. */
export const DEFAULT_TERMS_VERSION = '2026-10-01'

/**
 * Ursprung som iPhone-appen (Capacitor) anropar funktionerna från. På iOS är det
 * capacitor://localhost, på Android https://localhost.
 */
export const DEFAULT_NATIVE_ORIGINS: readonly string[] = ['capacitor://localhost', 'https://localhost']

/** Bara exakt de här formerna godtas som appens ursprung – aldrig en riktig webbadress. */
const NATIVE_ORIGIN_RE = /^(capacitor|https):\/\/localhost$/

export interface ServerConfig {
  /** Stripes hemliga nyckel (sk_… eller begränsad rk_…). */
  stripeSecretKey: string
  /**
   * Stripe-pris-id per plan. Det första används för nya köp; alla godtas när ett köp verifieras
   * (så att äldre köp fortfarande fungerar om du byter pris). Tom lista = priset skickas från koden.
   */
  priceIds: Record<PlanId, string[]>
  /** Privat nyckel (PKCS#8, base64) som signerar licenser. */
  licensePrivateKey: string
  /** Appens publika adress utan avslutande snedstreck, t.ex. https://lagom.netlify.app. */
  appUrl: string
  /** Fler adresser (utöver APP_URL) som får anropa funktionerna, t.ex. en egen domän. */
  allowedOrigins: string[]
  /**
   * Ursprung för den inbyggda appen (ALLOWED_NATIVE_ORIGINS), t.ex. capacitor://localhost. Jämförs
   * exakt; kunden skickas aldrig tillbaka till dem (tillbaka-adressen är alltid APP_URL).
   */
  nativeOrigins: string[]
  /** Hemligheten för Stripe-webhooken (whsec_…). */
  webhookSecret: string
  /** Köpvillkor. Om satt måste kunden kryssa i att hen godkänner dem i Stripe Checkout. */
  termsUrl: string
  /** Köpvillkorens version (TERMS_VERSION), sparas på köpet och står på fakturan. */
  termsVersion: string
  /** Stripe Tax (kräver att Stripe Tax är aktiverat i Stripe). */
  automaticTax: boolean
  /** Säljarens uppgifter till fakturan (VITE_SELLER_* och VITE_SUPPORT_EMAIL). */
  seller: SellerInfo
  /**
   * Licenser som spärras utan återbetalning (LICENSE_REVOKED_IDS): köp-id (licensens `id`) eller
   * nyckelhashar. Läggs till i spärrlistan.
   */
  revokedIds: string[]
}

function clean(value: string | undefined): string {
  return (value ?? '').trim()
}

function list(value: string | undefined): string[] {
  return clean(value)
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Normalisera en adress: bara http(s), inga avslutande snedstreck, ingen fråga/fragment. */
export function normalizeAppUrl(value: string | undefined): string {
  const raw = clean(value)
  if (!raw) return ''
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function isOn(value: string | undefined): boolean {
  return ['1', 'true', 'on', 'ja', 'yes'].includes(clean(value).toLowerCase())
}

function isOff(value: string | undefined): boolean {
  return ['0', 'false', 'off', 'av', 'nej', 'no', 'none', 'ingen'].includes(clean(value).toLowerCase())
}

/**
 * ALLOWED_NATIVE_ORIGINS: tomt = standard (capacitor://localhost och https://localhost),
 * "off" = inga. Annat än exakt capacitor://localhost eller https://localhost ignoreras.
 */
export function readNativeOrigins(value: string | undefined): string[] {
  if (!clean(value)) return [...DEFAULT_NATIVE_ORIGINS]
  if (isOff(value)) return []
  return [...new Set(list(value).filter((o) => NATIVE_ORIGIN_RE.test(o)))]
}

/** TERMS_VERSION: kort och utan konstiga tecken (den står på fakturan). Annars standardversionen. */
function readTermsVersion(value: string | undefined): string {
  const v = clean(value)
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(v) ? v : DEFAULT_TERMS_VERSION
}

/**
 * true om adressen bara är ett exempel och inte kan ta emot post: domänen example.* (t.ex.
 * example.se, example.com) eller .invalid, .test, .localhost. Samma regel som byggkontrollen
 * (`isExampleEmail` i scripts/commerce-guard.ts).
 */
export function isPlaceholderEmail(email: string): boolean {
  const e = email.trim().toLowerCase()
  if (!e) return true
  const labels = (e.split('@').pop() ?? '').split('.')
  return labels.includes('example') || ['invalid', 'test', 'localhost'].includes(labels[labels.length - 1] ?? '')
}

/**
 * true om värdet är en platshållare från en mall, t.ex. "[Företagsnamn]" eller "hej@<din domän>"
 * (samma regel som byggkontrollen). Räknas som saknat, så att skarpa köp aldrig får en sådan faktura.
 */
export function isTemplatePlaceholder(value: string): boolean {
  return /[[\]<>]/.test(value)
}

/** Värdet, eller '' om det saknas eller bara är en platshållare från en mall. */
function sellerValue(value: string | undefined): string {
  const v = clean(value)
  return isTemplatePlaceholder(v) ? '' : v
}

function readSeller(env: Env): SellerInfo {
  const email = sellerValue(env.VITE_SUPPORT_EMAIL)
  return {
    name: sellerValue(env.VITE_SELLER_NAME),
    orgnr: sellerValue(env.VITE_SELLER_ORGNR),
    address: sellerValue(env.VITE_SELLER_ADDRESS),
    phone: sellerValue(env.VITE_SELLER_PHONE),
    email: isPlaceholderEmail(email) ? '' : email,
    vat: sellerValue(env.VITE_SELLER_VAT),
  }
}

/**
 * Läs inställningarna. `siteUrl` är Netlifys egen adress för webbplatsen (används om APP_URL saknas).
 */
export function readConfig(env: Env, siteUrl?: string): ServerConfig {
  return {
    stripeSecretKey: clean(env.STRIPE_SECRET_KEY),
    priceIds: {
      ar: list(env[SERVER_PLANS.ar.priceEnv]),
      livstid: list(env[SERVER_PLANS.livstid.priceEnv]),
    },
    licensePrivateKey: clean(env.LICENSE_PRIVATE_KEY).replace(/\s+/g, ''),
    appUrl: normalizeAppUrl(env.APP_URL) || normalizeAppUrl(siteUrl),
    allowedOrigins: list(env.ALLOWED_ORIGINS).map(normalizeAppUrl).filter(Boolean),
    nativeOrigins: readNativeOrigins(env.ALLOWED_NATIVE_ORIGINS),
    webhookSecret: clean(env.STRIPE_WEBHOOK_SECRET),
    termsUrl: normalizeTermsUrl(env.TERMS_URL),
    termsVersion: readTermsVersion(env.TERMS_VERSION),
    automaticTax: isOn(env.STRIPE_AUTOMATIC_TAX),
    seller: readSeller(env),
    revokedIds: [...new Set(list(env.LICENSE_REVOKED_IDS).filter((id) => /^[A-Za-z0-9_-]{4,200}$/.test(id)))],
  }
}

function normalizeTermsUrl(value: string | undefined): string {
  const raw = clean(value)
  if (!raw) return ''
  try {
    const u = new URL(raw)
    // Parenteser kodas så att adressen fungerar i en Markdown-länk i Stripe Checkout.
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href.replace(/\(/g, '%28').replace(/\)/g, '%29') : ''
  } catch {
    return ''
  }
}

/** true när Stripe-nyckeln är skarp (riktiga pengar). */
export function isLiveStripeKey(cfg: Pick<ServerConfig, 'stripeSecretKey'>): boolean {
  return /^(sk|rk)_live_/.test(cfg.stripeSecretKey)
}

/**
 * Säljarens uppgifter att visa på fakturan. Det som saknas blir en tydlig platshållare – det går
 * bara i testläge, eftersom skarpa köp stoppas av `missingConfig(cfg, ['seller'])`.
 */
export function sellerForDisplay(seller: SellerInfo): SellerInfo {
  return {
    name: seller.name || SELLER_PLACEHOLDERS.name,
    orgnr: seller.orgnr || SELLER_PLACEHOLDERS.orgnr,
    address: seller.address || SELLER_PLACEHOLDERS.address,
    phone: seller.phone || SELLER_PLACEHOLDERS.phone,
    email: seller.email || SELLER_PLACEHOLDERS.email,
    vat: seller.vat,
  }
}

/**
 * - 'stripe', 'license', 'webhook': nycklarna.
 * - 'seller': säljarens uppgifter – krävs bara med en skarp Stripe-nyckel (i testläge används
 *   platshållare, så att allt kan provas innan företagsuppgifterna finns).
 */
export type Requirement = 'stripe' | 'license' | 'webhook' | 'seller'

/** Namnen på miljövariabler som saknas eller är felaktiga för en viss funktion. */
export function missingConfig(cfg: ServerConfig, needs: Requirement[]): string[] {
  const missing: string[] = []
  if (needs.includes('stripe') && !/^(sk|rk)_(test|live)_\w+$/.test(cfg.stripeSecretKey)) missing.push('STRIPE_SECRET_KEY')
  if (needs.includes('license') && !/^[A-Za-z0-9+/]+={0,2}$/.test(cfg.licensePrivateKey)) missing.push('LICENSE_PRIVATE_KEY')
  if (needs.includes('webhook') && !cfg.webhookSecret.startsWith('whsec_')) missing.push('STRIPE_WEBHOOK_SECRET')
  if (needs.includes('seller') && isLiveStripeKey(cfg)) {
    for (const { field, env } of SELLER_ENV) if (!cfg.seller[field]) missing.push(env)
  }
  return missing
}
