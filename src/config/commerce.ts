/**
 * Affärsmodell: provperiod och licenser.
 *
 * Allt som rör pris, provperiod och betalning ställs in här och via miljövariabler
 * (se docs/BETALNING.md). Priserna anges i hela kronor inklusive 25 % moms.
 */

export type PlanId = 'ar' | 'livstid'

export interface Plan {
  id: PlanId
  name: string
  /** Pris i kronor inkl. moms. */
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
    priceKr: 299,
    period: 'för ett år · förnyas inte automatiskt',
    durationDays: 365,
    perks: ['Allt i Lagom i 12 månader', 'Ingen prenumeration att komma ihåg att säga upp', 'Motsvarar 25 kr i månaden'],
  },
  {
    id: 'livstid',
    name: 'Livstidslicens',
    priceKr: 599,
    period: 'engångsköp · för alltid',
    featured: true,
    perks: ['Allt i Lagom – för alltid', 'Alla framtida uppdateringar ingår', 'Betala en gång, klart'],
  },
]

/**
 * 'test': ingen riktig betalning – köpknappen utfärdar en testlicens direkt (för utveckling och förhandsvisning).
 * 'live': betalning via Stripe och signerade licensnycklar. Kräver VITE_LICENSE_PUBLIC_KEY.
 */
export type CommerceMode = 'test' | 'live'

const env = import.meta.env as Record<string, string | undefined>

export const COMMERCE_MODE: CommerceMode = env.VITE_COMMERCE_MODE === 'live' && env.VITE_LICENSE_PUBLIC_KEY ? 'live' : 'test'

/** Publik nyckel (SPKI, base64) för ECDSA P-256 som verifierar licensnycklar. */
export const LICENSE_PUBLIC_KEY = env.VITE_LICENSE_PUBLIC_KEY ?? ''

/**
 * Bas-URL till serverfunktionerna (Netlify Functions). Tom sträng = samma ursprung som appen.
 * Sätt t.ex. till https://lagom.netlify.app när appen körs från en annan adress.
 */
export const API_BASE = (env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/** E-post för kundsupport och frågor om köp. */
export const SUPPORT_EMAIL = env.VITE_SUPPORT_EMAIL ?? 'support@lagom-appen.se'

/** Säljarens namn som visas vid köp (krävs enligt distansavtalslagen). */
export const SELLER_NAME = env.VITE_SELLER_NAME ?? 'Lagom'

/**
 * Valfri adress till de fullständiga köpvillkoren (med organisationsnummer och adress), t.ex. en
 * sida på webbplatsen. Köpsidan länkar dit när den är satt; sammanfattningen visas alltid i appen.
 */
export const TERMS_URL = (env.VITE_TERMS_URL ?? '').trim()

export function planById(id: string | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
