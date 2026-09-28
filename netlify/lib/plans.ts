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
  /** Licensens giltighet i dagar, undefined = för alltid. */
  durationDays?: number
  /** Miljövariabeln med Stripe-pris-id(n) för planen. */
  priceEnv: 'STRIPE_PRICE_AR' | 'STRIPE_PRICE_LIVSTID'
  /** Text ovanför betalknappen i Stripe Checkout. */
  checkoutNote: string
}

export const CURRENCY = 'sek'

export const SERVER_PLANS: Record<PlanId, ServerPlan> = {
  ar: {
    id: 'ar',
    name: 'Årslicens',
    priceKr: 349,
    durationDays: 365,
    priceEnv: 'STRIPE_PRICE_AR',
    checkoutNote:
      'Årslicensen gäller i 365 dagar och förnyas inte automatiskt – inga fler dragningar görs. Licensnyckeln visas direkt efter betalningen.',
  },
  livstid: {
    id: 'livstid',
    name: 'Livstidslicens',
    priceKr: 699,
    priceEnv: 'STRIPE_PRICE_LIVSTID',
    // Försiktigt löfte (ägarens beslut 2026-09-28): licensen gäller för alltid och felrättningar
    // ingår – nya funktioner eller alla framtida uppdateringar utlovas inte.
    checkoutNote:
      'Engångsköp – inga fler dragningar görs. Licensen gäller för alltid och felrättningar ingår. Licensnyckeln visas direkt efter betalningen.',
  },
}

export function isPlanId(value: unknown): value is PlanId {
  return value === 'ar' || value === 'livstid'
}

/** Priset i öre (Stripes minsta valutaenhet för SEK). */
export function priceInOre(plan: ServerPlan): number {
  return plan.priceKr * 100
}
