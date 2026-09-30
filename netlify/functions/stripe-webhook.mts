/**
 * POST /api/stripe-webhook – händelser från Stripe (checkout.session.completed m.fl.).
 * Signaturen verifieras med STRIPE_WEBHOOK_SECRET. Utfärdar och sparar licensen på betalningen
 * i Stripe, så att den finns kvar även om kunden stängde fliken. Valfri – se docs/BETALNING.md.
 */
import { handleStripeWebhook, withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('stripe-webhook', () => handleStripeWebhook(req, { env: process.env, context }))

/**
 * Adressen: bara /api/stripe-webhook (inte /.netlify/functions/stripe-webhook). Ingen
 * anropsbegränsning – Stripe skickar händelser i klump, och varje anrop kontrolleras med
 * signaturen.
 */
export const config = {
  path: '/api/stripe-webhook',
}
