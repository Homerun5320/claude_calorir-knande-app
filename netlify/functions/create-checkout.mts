/**
 * POST /api/create-checkout – startar ett köp i Stripe Checkout.
 * Kropp: { plan: 'ar' | 'livstid', consent: true } → { url } (skicka kunden dit). Utan samtycket → 400.
 * Logiken finns i netlify/lib/handlers.ts. Se docs/BETALNING.md.
 */
import { handleCreateCheckout, withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('create-checkout', () => handleCreateCheckout(req, { env: process.env, context }))

/**
 * Adressen och Netlifys anropsbegränsning: högst 10 köpstarter per minut och IP-adress. Med en egen
 * `path` nås funktionen bara här – inte via /.netlify/functions/create-checkout – så gränsen går
 * inte att kringgå. Över gränsen svarar Netlify 429. Objektet läses av Netlify när funktionen byggs
 * och måste vara skrivet rakt av.
 */
export const config = {
  path: '/api/create-checkout',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
