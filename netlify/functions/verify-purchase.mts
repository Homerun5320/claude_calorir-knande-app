/**
 * POST /api/verify-purchase – kontrollerar ett betalt köp och lämnar ut licensnyckeln.
 * Kropp: { sessionId: 'cs_…' } → { licenseKey, plan, issuedAt, expiresAt }.
 * Samma köp ger alltid samma nyckel. Logiken finns i netlify/lib/handlers.ts.
 */
import { handleVerifyPurchase, withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('verify-purchase', () => handleVerifyPurchase(req, { env: process.env, context }))

/**
 * Adressen och Netlifys anropsbegränsning: högst 30 per minut och IP-adress (tacksidan frågar flera
 * gånger medan betalningen blir klar). Med en egen `path` nås funktionen bara här – inte via
 * /.netlify/functions/verify-purchase – så gränsen går inte att kringgå. Över gränsen svarar
 * Netlify 429. Objektet läses av Netlify när funktionen byggs och måste vara skrivet rakt av.
 */
export const config = {
  path: '/api/verify-purchase',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
