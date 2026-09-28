/**
 * POST /api/recipe-fetch – hämtar en receptsida och svarar bara med dess JSON-LD.
 * Kropp: { url } → { html }. Skyddad mot anrop till interna adresser (SSRF).
 * Logiken finns i netlify/lib/recipeFetch.ts.
 */
import { withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'
import { handleRecipeFetch } from '../lib/recipeFetch.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('recipe-fetch', () => handleRecipeFetch(req, { env: process.env, context }))

/**
 * Adressen och Netlifys anropsbegränsning: högst 10 hämtningar per minut och IP-adress. Med en egen
 * `path` nås funktionen bara här – inte via /.netlify/functions/recipe-fetch – så gränsen går inte
 * att kringgå. Över gränsen svarar Netlify 429. Objektet läses av Netlify när funktionen byggs och
 * måste vara skrivet rakt av.
 */
export const config = {
  path: '/api/recipe-fetch',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
}
