/**
 * POST /api/recover-license – hämta licensnyckeln för ett webbköp igen.
 * Kropp: { email, receipt } → { licenseKey, plan, issuedAt, expiresAt }.
 * Fel e-post och fel kvittonummer ger samma svar. Logiken finns i netlify/lib/recover.ts.
 */
import { withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'
import { handleRecoverLicense } from '../lib/recover.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('recover-license', () => handleRecoverLicense(req, { env: process.env, context }))

/**
 * Adressen och Netlifys anropsbegränsning: högst 20 försök per 3 minuter för hela webbplatsen –
 * utöver gränserna per IP-adress och e-postadress i funktionen – så att ingen kan prova sig fram
 * från många adresser. Med en egen `path` nås funktionen bara här – inte via
 * /.netlify/functions/recover-license – så gränsen går inte att kringgå. Över gränsen svarar
 * Netlify 429. Objektet läses av Netlify när funktionen byggs och måste vara skrivet rakt av.
 */
export const config = {
  path: '/api/recover-license',
  rateLimit: { windowLimit: 20, windowSize: 180, aggregateBy: ['domain'] },
}
