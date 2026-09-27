/**
 * Utfärdande av licensnycklar på servern. Formatet och signeringen kommer från appens egen
 * src/lib/license.ts, så att servern och appen alltid är överens.
 */
import { base64UrlDecode, decodeLicense, signLicense, verifyLicense, type LicensePayload } from '../../src/lib/license.ts'
import { SERVER_PLANS, type PlanId } from './plans.ts'

const DAY_SEC = 86_400

/**
 * Licensens innehåll för ett köp. Helt bestämt av köpet (id, plan och tidpunkt) – samma köp ger
 * alltid samma licens, hur många gånger det än verifieras.
 */
export function licensePayloadFor(id: string, plan: PlanId, issuedAtSec: number): LicensePayload {
  const days = SERVER_PLANS[plan].durationDays
  return {
    v: 1,
    id,
    plan,
    iat: issuedAtSec,
    ...(days ? { exp: issuedAtSec + days * DAY_SEC } : {}),
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

function samePayload(a: LicensePayload, b: LicensePayload): boolean {
  return a.v === b.v && a.id === b.id && a.plan === b.plan && a.iat === b.iat && a.exp === b.exp && !a.test && !b.test
}

/**
 * true om en tidigare utfärdad nyckel (sparad hos Stripe) gäller för exakt det här köpet och är
 * signerad med den nuvarande nyckeln. Utgångsdatum kontrolleras inte här.
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
