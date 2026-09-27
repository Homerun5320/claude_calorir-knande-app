/**
 * POST /api/verify-purchase – kontrollerar ett betalt köp och lämnar ut licensnyckeln.
 * Kropp: { sessionId: 'cs_…' } → { licenseKey, plan, issuedAt, expiresAt }.
 * Samma köp ger alltid samma nyckel. Logiken finns i netlify/lib/handlers.ts.
 */
import { handleVerifyPurchase, type NetlifyContext } from '../lib/handlers.ts'

export default (req: Request, context?: NetlifyContext): Promise<Response> =>
  handleVerifyPurchase(req, { env: process.env, context })
