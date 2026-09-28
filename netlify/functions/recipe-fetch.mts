/**
 * POST /api/recipe-fetch – hämtar en receptsida och svarar bara med dess JSON-LD.
 * Kropp: { url } → { html }. Skyddad mot anrop till interna adresser (SSRF).
 * Logiken finns i netlify/lib/recipeFetch.ts.
 */
import { withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'
import { handleRecipeFetch } from '../lib/recipeFetch.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('recipe-fetch', () => handleRecipeFetch(req, { env: process.env, context }))
