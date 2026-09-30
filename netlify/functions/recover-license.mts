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
 * Adressen och Netlifys anropsbegränsning: högst 5 försök per 3 minuter och IP-adress (Netlifys
 * längsta fönster är 180 sekunder), räknat i Netlifys nätverk och därför över alla kopior av
 * funktionen. I funktionen gäller dessutom 5 per 10 minuter och IP-adress och 10 per timme och
 * e-postadress, och varje svar utan licens tar minst 1,5 sekunder. En gräns för hela webbplatsen
 * (`aggregateBy: ['domain']` ensamt) finns bara i Netlifys Enterprise-plan med High-Performance
 * Edge och används därför inte. Med en egen `path` nås funktionen bara här – inte via
 * /.netlify/functions/recover-license – så gränsen går inte att kringgå. Över gränsen svarar
 * Netlify 429. Objektet läses av Netlify när funktionen byggs och måste vara skrivet rakt av.
 */
export const config = {
  path: '/api/recover-license',
  rateLimit: { windowLimit: 5, windowSize: 180, aggregateBy: ['ip', 'domain'] },
}
