/**
 * POST /api/recover-license – hämta licensnyckeln för ett webbköp igen.
 * Kropp: { email, receipt } → { licenseKey, plan, issuedAt, expiresAt }.
 * Fel e-post och fel kvittonummer ger samma svar. Logiken finns i netlify/lib/recover.ts.
 */
import { withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'
import { handleRecoverLicense } from '../lib/recover.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('recover-license', () => handleRecoverLicense(req, { env: process.env, context }))
