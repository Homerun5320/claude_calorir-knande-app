/**
 * POST /api/create-checkout – startar ett köp i Stripe Checkout.
 * Kropp: { plan: 'ar' | 'livstid', consent: true } → { url } (skicka kunden dit). Utan samtycket → 400.
 * Logiken finns i netlify/lib/handlers.ts. Se docs/BETALNING.md.
 */
import { handleCreateCheckout, withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('create-checkout', () => handleCreateCheckout(req, { env: process.env, context }))
