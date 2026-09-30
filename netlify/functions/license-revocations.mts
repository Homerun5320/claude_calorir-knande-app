/**
 * GET /api/license-revocations – signerad spärrlista över återbetalda och bestridda webbköp.
 * Svar: { token: "LAGOMREV1.…", issuedAt }. Får cachas en timme.
 * Logiken finns i netlify/lib/revocations.ts. Se docs/BETALNING.md.
 */
import { withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'
import { handleLicenseRevocations } from '../lib/revocations.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('license-revocations', () => handleLicenseRevocations(req, { env: process.env, context }))

/**
 * Adressen och Netlifys anropsbegränsning: högst 60 per minut och IP-adress (svaret cachas i en
 * timme, så appen frågar sällan). Med en egen `path` nås funktionen bara här – inte via
 * /.netlify/functions/license-revocations – så gränsen går inte att kringgå. Över gränsen svarar
 * Netlify 429. Objektet läses av Netlify när funktionen byggs och måste vara skrivet rakt av.
 */
export const config = {
  path: '/api/license-revocations',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
