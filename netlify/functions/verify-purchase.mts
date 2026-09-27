/**
 * POST /api/verify-purchase – kontrollerar ett betalt köp och lämnar ut licensnyckeln.
 * Kropp: { sessionId: 'cs_…' } → { licenseKey, plan, issuedAt, expiresAt }.
 * Samma köp ger alltid samma nyckel. Logiken finns i netlify/lib/handlers.ts.
 */
import { handleVerifyPurchase, withErrorBoundary, type NetlifyContext } from '../lib/handlers.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  withErrorBoundary('verify-purchase', () => handleVerifyPurchase(req, { env: process.env, context }))
