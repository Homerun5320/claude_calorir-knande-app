/**
 * Serverns inställningar från miljövariabler (Netlify → Site configuration → Environment variables).
 * Se docs/BETALNING.md och .env.example. Inga hemligheter loggas – bara namnen på det som saknas.
 */
import { SERVER_PLANS, type PlanId } from './plans.ts'

export type Env = Record<string, string | undefined>

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
  /** Hemligheten för Stripe-webhooken (whsec_…). */
  webhookSecret: string
  /** Köpvillkor. Om satt måste kunden kryssa i att hen godkänner dem i Stripe Checkout. */
  termsUrl: string
  /** Stripe Tax (kräver att Stripe Tax är aktiverat i Stripe). */
  automaticTax: boolean
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
    webhookSecret: clean(env.STRIPE_WEBHOOK_SECRET),
    termsUrl: normalizeTermsUrl(env.TERMS_URL),
    automaticTax: isOn(env.STRIPE_AUTOMATIC_TAX),
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

export type Requirement = 'stripe' | 'license' | 'webhook'

/** Namnen på miljövariabler som saknas eller är felaktiga för en viss funktion. */
export function missingConfig(cfg: ServerConfig, needs: Requirement[]): string[] {
  const missing: string[] = []
  if (needs.includes('stripe') && !/^(sk|rk)_(test|live)_\w+$/.test(cfg.stripeSecretKey)) missing.push('STRIPE_SECRET_KEY')
  if (needs.includes('license') && !/^[A-Za-z0-9+/]+={0,2}$/.test(cfg.licensePrivateKey)) missing.push('LICENSE_PRIVATE_KEY')
  if (needs.includes('webhook') && !cfg.webhookSecret.startsWith('whsec_')) missing.push('STRIPE_WEBHOOK_SECRET')
  return missing
}
