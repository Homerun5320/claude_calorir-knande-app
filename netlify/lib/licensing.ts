/**
 * Utfärdande av licensnycklar på servern. Formatet och signeringen kommer från appens egen
 * src/lib/license.ts, så att servern och appen alltid är överens.
 */
import {
  base64UrlDecode,
  decodeLicense,
  keyId,
  licenseKeyHash,
  looksLikeHash,
  purchaseIdHash,
  signLicense,
  signRevocationList,
  verifyLicense,
  verifyRevocationList,
  type LicensePayload,
} from '../../src/lib/license.ts'
import { SERVER_PLANS, type PlanId } from './plans.ts'

const DAY_SEC = 86_400

/**
 * Licensens innehåll för ett köp. Helt bestämt av köpet (id, plan och tidpunkt) och av vilken
 * nyckel som signerar (`kid`) – samma köp ger alltid samma innehåll, hur många gånger det än
 * verifieras.
 */
export function licensePayloadFor(id: string, plan: PlanId, issuedAtSec: number, kid?: string): LicensePayload {
  const days = SERVER_PLANS[plan].durationDays
  return {
    v: 1,
    id,
    plan,
    iat: issuedAtSec,
    ...(days ? { exp: issuedAtSec + days * DAY_SEC } : {}),
    ...(kid ? { kid } : {}),
  }
}

function base64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const publicKeyCache = new Map<string, Promise<string>>()

/**
 * Den publika nyckeln (SPKI, base64) som hör till en privat nyckel (PKCS#8, base64).
 * Kastar ett fel om den privata nyckeln inte är en giltig ECDSA P-256-nyckel.
 */
export function publicKeyFromPrivate(privateKeyPkcs8Base64: string): Promise<string> {
  let cached = publicKeyCache.get(privateKeyPkcs8Base64)
  if (!cached) {
    cached = (async () => {
      const priv = await crypto.subtle.importKey(
        'pkcs8',
        base64ToBytes(privateKeyPkcs8Base64) as BufferSource,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign'],
      )
      const jwk = await crypto.subtle.exportKey('jwk', priv)
      const pub = await crypto.subtle.importKey(
        'jwk',
        { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true },
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify'],
      )
      return base64(new Uint8Array(await crypto.subtle.exportKey('spki', pub)))
    })()
    // Ett misslyckat försök ska inte fastna i cachen.
    cached.catch(() => publicKeyCache.delete(privateKeyPkcs8Base64))
    publicKeyCache.set(privateKeyPkcs8Base64, cached)
  }
  return cached
}

/**
 * Nyckel-id ("kid") för den publika nyckeln: de första 8 base64url-tecknen av SHA-256 över
 * SPKI-byten. Samma regel som `keyId` i src/lib/license.ts – appen provar då rätt nyckel först
 * när flera publika nycklar är inbyggda (nyckelbyte).
 */
export function licenseKid(publicKeySpkiBase64: string): Promise<string> {
  return keyId(publicKeySpkiBase64)
}

/**
 * Licensens id i spärrlistan, räknat ur själva nyckeln: SHA-256 (base64url) över hela den
 * tvättade nyckelsträngen – samma som `licenseKeyHash` i appen. Fungerar för alla nycklar, även
 * gamla och manuellt utfärdade. Spärrlistan använder i första hand köp-id:t (licensens `id`), som
 * är detsamma för alla nycklar som har utfärdats för ett köp.
 */
export function licenseIdOf(licenseKey: string): Promise<string> {
  return licenseKeyHash(licenseKey)
}

/** Samma köp, plan och datum. `kid` jämförs inte: signaturen kontrolleras ändå mot nuvarande nyckel. */
function samePayload(a: LicensePayload, b: LicensePayload): boolean {
  return a.v === b.v && a.id === b.id && a.plan === b.plan && a.iat === b.iat && a.exp === b.exp && !a.test && !b.test
}

/**
 * true om en tidigare utfärdad nyckel (sparad hos Stripe) gäller för exakt det här köpet och är
 * signerad med den nuvarande nyckeln. Utgångsdatum kontrolleras inte här. Äldre nycklar utan
 * `kid` godtas, så att samma köp fortsätter att ge samma nyckel.
 */
export async function isIssuedLicenseValid(stored: string, expected: LicensePayload, publicKey: string): Promise<boolean> {
  const payload = decodeLicense(stored)
  if (!payload || !samePayload(payload, expected)) return false
  const res = await verifyLicense(stored, { publicKey, mode: 'live', now: expected.iat * 1000 })
  return res.ok
}

/** Skapa och signera licensen för ett köp. */
export async function issueLicense(payload: LicensePayload, privateKeyPkcs8Base64: string): Promise<string> {
  const key = await signLicense(payload, privateKeyPkcs8Base64)
  // Rimlighetskontroll: nyckeln ska gå att läsa tillbaka och signaturen vara 64 byte.
  const sig = key.split('.')[2] ?? ''
  if (!decodeLicense(key) || base64UrlDecode(sig).byteLength !== 64) throw new Error('Licensen kunde inte signeras.')
  return key
}

/**
 * Posterna i den publicerade spärrlistan (v2): köp-id:n som hashar (`purchaseIdHash`) – aldrig i
 * klartext, eftersom köp-id:t är det som verify-purchase kräver för att lämna ut nyckeln. En post
 * som redan är en hash (en nyckelhash från LICENSE_REVOKED_IDS) behålls, och dess egen hash läggs
 * till för säkerhets skull. Sorterade och utan dubbletter.
 */
export async function revocationEntries(ids: readonly string[]): Promise<string[]> {
  const out = new Set<string>()
  for (const id of ids) {
    if (looksLikeHash(id)) out.add(id)
    out.add(await purchaseIdHash(id))
  }
  return [...out].sort()
}

/**
 * Signera spärrlistan "LAGOMREV1.<payload>.<signatur>" (v2, se `revocationEntries`) med
 * licensernas privata nyckel. Listan kontrolleras mot den publika nyckeln innan den lämnas ut.
 */
export async function signRevocations(ids: readonly string[], issuedAtSec: number, privateKeyPkcs8Base64: string): Promise<string> {
  const list = { v: 2 as const, issuedAt: issuedAtSec, ids: await revocationEntries(ids) }
  const token = await signRevocationList(list, privateKeyPkcs8Base64)
  const publicKey = await publicKeyFromPrivate(privateKeyPkcs8Base64)
  if (!(await verifyRevocationList(token, { publicKey }))) throw new Error('Spärrlistan kunde inte signeras.')
  return token
}
