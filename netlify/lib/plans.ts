/**
 * Planerna som servern säljer.
 *
 * Appens planer finns i src/config/commerce.ts, men den filen läser `import.meta.env` och kan
 * därför inte laddas i en serverfunktion. Värdena upprepas här och testet
 * netlify/tests/plans.test.ts kontrollerar att de är identiska – ändrar du ett pris i appen
 * misslyckas testerna tills du ändrar här också (och i Stripe, om du använder pris-id:n).
 */

export type PlanId = 'ar' | 'livstid'

export interface ServerPlan {
  id: PlanId
  /** Samma namn som i appen, visas i Stripe Checkout och på kvittot. */
  name: string
  /** Pris i hela kronor inklusive 25 % moms. */
  priceKr: number
  /**
   * Tidigare priser (hela kronor) som fortfarande godtas när ett köp verifieras eller en nyckel
   * hämtas igen – köp som gjordes före en prisändring, även med prisläget utan pris-id (price_data).
   * Nya köp görs alltid till `priceKr`.
   */
  legacyPriceKr: readonly number[]
  /** Licensens giltighet i dagar, undefined = för alltid. */
  durationDays?: number
  /** Miljövariabeln med Stripe-pris-id(n) för planen. */
  priceEnv: 'STRIPE_PRICE_AR' | 'STRIPE_PRICE_LIVSTID'
  /** Text ovanför betalknappen i Stripe Checkout. */
  checkoutNote: string
}

export const CURRENCY = 'sek'

/**
 * Livstidslicensens löfte – kopior av LIFETIME_PROMISE och LIFETIME_SHORT i src/config/commerce.ts
 * (testet kontrollerar att de är lika). Lova aldrig mer än så i Stripe-texterna.
 */
export const LIFETIME_PROMISE =
  'Livstidslicensen gäller för alltid – ingen tidsgräns och ingen årsavgift. Felrättningar ingår så länge vi ger ut Lagom; nya funktioner kan komma men utlovas inte. Om Lagom läggs ned fortsätter din version att fungera på din enhet så länge enheten stöder den.'
export const LIFETIME_SHORT = 'För alltid – felrättningar ingår'

export const SERVER_PLANS: Record<PlanId, ServerPlan> = {
  ar: {
    id: 'ar',
    name: 'Årslicens',
    priceKr: 349,
    legacyPriceKr: [299],
    durationDays: 365,
    priceEnv: 'STRIPE_PRICE_AR',
    checkoutNote:
      'Årslicensen gäller i 365 dagar och förnyas inte automatiskt – inga fler dragningar görs. Licensnyckeln visas direkt efter betalningen.',
  },
  livstid: {
    id: 'livstid',
    name: 'Livstidslicens',
    priceKr: 699,
    legacyPriceKr: [599],
    priceEnv: 'STRIPE_PRICE_LIVSTID',
    // Försiktigt löfte (ägarens beslut 2026-09-28): licensen gäller för alltid och felrättningar
    // ingår – nya funktioner eller alla framtida uppdateringar utlovas inte. Samma korta form som
    // i appen (LIFETIME_SHORT).
    checkoutNote: `Engångsköp – inga fler dragningar görs. Licensen gäller ${LIFETIME_SHORT.toLocaleLowerCase('sv-SE')}. Licensnyckeln visas direkt efter betalningen.`,
  },
}

export function isPlanId(value: unknown): value is PlanId {
  return value === 'ar' || value === 'livstid'
}

/** Priset i öre (Stripes minsta valutaenhet för SEK). */
export function priceInOre(plan: ServerPlan): number {
  return plan.priceKr * 100
}

/** Alla belopp i öre som godtas för planen när ett köp verifieras: dagens pris och tidigare priser. */
export function acceptedAmountsInOre(plan: ServerPlan): number[] {
  return [plan.priceKr, ...plan.legacyPriceKr].map((kr) => kr * 100)
}
