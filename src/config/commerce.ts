/**
 * Affärsmodell: provperiod och licenser.
 *
 * Allt som rör pris, provperiod och betalning ställs in här och via miljövariabler
 * (se docs/BETALNING.md). Priserna anges i hela kronor inklusive 25 % moms och gäller köp på
 * webben. I butiksapparna (App Store, Google Play) kommer priset från butiken – kronpriserna här
 * visas bara när `sellsOnWeb()` (se src/config/platform.ts).
 */
import { sellsOnWeb } from './platform'

export type PlanId = 'ar' | 'livstid'

export interface Plan {
  id: PlanId
  name: string
  /** Pris i kronor inkl. moms (webbköp). */
  priceKr: number
  /** Kort beskrivning under priset. */
  period: string
  /** Licensens giltighet i dagar, undefined = för alltid. */
  durationDays?: number
  /** Lyfts fram som rekommenderat val. */
  featured?: boolean
  perks: string[]
}

/** Antal dagar med full tillgång innan köp krävs. */
export const TRIAL_DAYS = 14

export const PLANS: Plan[] = [
  {
    id: 'ar',
    name: 'Årslicens',
    priceKr: 349,
    period: 'för ett år · förnyas inte automatiskt',
    durationDays: 365,
    perks: ['Allt i Lagom i 12 månader', 'Ingen prenumeration att komma ihåg att säga upp', 'Motsvarar 29 kr i månaden'],
  },
  {
    // Livstid = för alltid (ägarens beslut 2026-09-28). Löftet är försiktigt: Lagom fortsätter att
    // fungera och felrättningar ingår – nya funktioner utlovas inte. Den slutliga definitionen
    // beslutas av ägaren och skrivs i docs/KOPVILLKOR.md.
    id: 'livstid',
    name: 'Livstidslicens',
    priceKr: 699,
    period: 'engångsköp · ingen prenumeration',
    featured: true,
    perks: ['Allt i Lagom – för alltid på dina enheter', 'Felrättningar ingår', 'Betala en gång, klart'],
  },
]

/**
 * 'test': ingen riktig betalning – köpknappen utfärdar en testlicens direkt (för utveckling och förhandsvisning).
 * 'live': betalning via Stripe och signerade licensnycklar. Kräver minst en publik licensnyckel.
 * Butiksbyggen verifierar alltid licenser som i skarpt läge (se src/lib/license.ts).
 */
export type CommerceMode = 'test' | 'live'

const env = import.meta.env as Record<string, string | undefined>

/** Trimmad miljövariabel, '' om den saknas. */
function envText(name: string): string {
  return (env[name] ?? '').trim()
}

/**
 * Publika nycklar (SPKI, base64) för ECDSA P-256 som verifierar licensnycklar. Flera nycklar gör
 * det möjligt att byta nyckel utan att gamla licenser slutar gälla: `VITE_LICENSE_PUBLIC_KEYS`
 * (kommaseparerad, den nuvarande först) eller annars `VITE_LICENSE_PUBLIC_KEY`.
 */
export const LICENSE_PUBLIC_KEYS: string[] = (envText('VITE_LICENSE_PUBLIC_KEYS') || envText('VITE_LICENSE_PUBLIC_KEY'))
  .split(',')
  .map((k) => k.trim())
  .filter((k) => k.length > 0)

/** Den nuvarande publika nyckeln (den första). */
export const LICENSE_PUBLIC_KEY = LICENSE_PUBLIC_KEYS[0] ?? ''

export const COMMERCE_MODE: CommerceMode = env.VITE_COMMERCE_MODE === 'live' && LICENSE_PUBLIC_KEYS.length > 0 ? 'live' : 'test'

/** Stripe-köp på webben är möjliga här (inte i butiksapparna eller när webbförsäljningen är av). */
export const WEB_CHECKOUT_ENABLED = sellsOnWeb()

/**
 * Bas-URL till serverfunktionerna (Netlify Functions). Tom sträng = samma ursprung som appen.
 * Sätt t.ex. till https://lagom.netlify.app när appen körs från en annan adress (alltid i
 * butiksapparna).
 */
export const API_BASE = (env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/**
 * E-post för kundsupport och frågor om köp. Standardvärdet är en platshållare (.invalid kan
 * aldrig ta emot post) – skarpa byggen och butiksbyggen stoppas tills VITE_SUPPORT_EMAIL är en
 * riktig adress.
 */
export const SUPPORT_EMAIL = envText('VITE_SUPPORT_EMAIL') || 'support@example.invalid'

/** Säljarens namn som visas vid köp (krävs enligt distansavtalslagen). */
export const SELLER_NAME = envText('VITE_SELLER_NAME') || 'Lagom'

/**
 * Säljarens uppgifter (distansavtalslagen): organisationsnummer (för enskild firma
 * personnumret), postadress, telefon och momsregistreringsnummer. '' om de saknas – då visas de
 * inte, och skarpa byggen och butiksbyggen stoppas av byggkontrollen.
 */
export const SELLER_ORGNR = envText('VITE_SELLER_ORGNR')
export const SELLER_ADDRESS = envText('VITE_SELLER_ADDRESS')
export const SELLER_PHONE = envText('VITE_SELLER_PHONE')
export const SELLER_VAT = envText('VITE_SELLER_VAT')

/**
 * Valfri adress till de fullständiga köpvillkoren (med organisationsnummer och adress), t.ex. en
 * sida på webbplatsen. Köpsidan länkar dit när den är satt; sammanfattningen visas alltid i appen.
 */
export const TERMS_URL = envText('VITE_TERMS_URL')

/**
 * Länkar till Lagom i appbutikerna. Visas på köpsidan när webbförsäljningen är avstängd
 * (`VITE_WEB_SALES=off`); en länk som saknas visas inte.
 */
export const APPSTORE_URL = envText('VITE_APPSTORE_URL')
export const PLAY_URL = envText('VITE_PLAY_URL')

export function planById(id: string | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
