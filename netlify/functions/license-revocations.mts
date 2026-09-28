/**
 * GET /api/license-revocations – signerad spärrlista över återbetalda och bestridda webbköp.
 * Svar: { token: "LAGOMREV1.…", issuedAt }. Får cachas en timme.
 * Logiken finns i netlify/lib/revocations.ts. Se docs/BETALNING.md.
 */
import { withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'
import { handleLicenseRevocations } from '../lib/revocations.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('license-revocations', () => handleLicenseRevocations(req, { env: process.env, context }))
