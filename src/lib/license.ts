/**
 * Licensnycklar som kan verifieras offline.
 *
 * Format: "LAGOM1.<payload>.<signatur>" där payload är base64url-kodad JSON och signaturen är
 * ECDSA P-256/SHA-256 (IEEE P1363, 64 byte) över strängen "LAGOM1.<payload>", base64url-kodad.
 * Servern (netlify/functions) signerar med den privata nyckeln; appen verifierar med den publika
 * nyckeln i VITE_LICENSE_PUBLIC_KEY. Ingen personlig information lagras i nyckeln.
 */
import type { PlanId } from '../config/commerce'

export const LICENSE_PREFIX = 'LAGOM1'

export interface LicensePayload {
  /** Formatversion */
  v: 1
  /** Unikt licens-id, t.ex. Stripe-sessionens id eller 'lic_…'. */
  id: string
  plan: PlanId
  /** Utfärdad, epoch-sekunder. */
  iat: number
  /** Går ut, epoch-sekunder. Saknas för livstidslicens. */
  exp?: number
  /** true för testlicenser (godtas bara i testläge). */
  test?: boolean
}

export type LicenseCheck =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: 'format' | 'signatur' | 'utgangen' | 'testlicens' | 'ingen-nyckel' }

export const LICENSE_ERRORS: Record<Exclude<LicenseCheck, { ok: true }>['reason'], string> = {
  format: 'Det där ser inte ut som en licensnyckel från Lagom. Kopiera hela nyckeln, den börjar med LAGOM1.',
  signatur: 'Licensnyckeln kunde inte verifieras. Kontrollera att hela nyckeln kom med.',
  utgangen: 'Licensen har gått ut. Du kan förnya den på köpsidan.',
  testlicens: 'Det här är en testlicens och gäller inte i den riktiga appen.',
  'ingen-nyckel': 'Appen saknar nyckel för att kontrollera licenser. Kontakta supporten.',
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

export function base64UrlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function base64Decode(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Tvätta inklistrad text: ta bort mellanslag/radbrytningar och eventuella citattecken. */
export function normalizeLicenseKey(input: string): string {
  return input.replace(/[\s"'“”‘’]+/g, '')
}

/** Läs payload utan att verifiera signaturen (för visning). */
export function decodeLicense(key: string): LicensePayload | null {
  const parts = normalizeLicenseKey(key).split('.')
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return null
  try {
    const payload = JSON.parse(dec.decode(base64UrlDecode(parts[1]))) as LicensePayload
    if (payload.v !== 1 || typeof payload.id !== 'string' || (payload.plan !== 'ar' && payload.plan !== 'livstid') || !Number.isFinite(payload.iat)) {
      return null
    }
    if (payload.exp !== undefined && !Number.isFinite(payload.exp)) return null
    return payload
  } catch {
    return null
  }
}

async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  const der = base64Decode(spkiBase64)
  return crypto.subtle.importKey('spki', der as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
}

/**
 * Verifiera en licensnyckel. `now` i epoch-ms. I testläge godtas testlicenser utan signatur
 * (signaturdelen är då "test").
 */
export async function verifyLicense(
  key: string,
  opts: { publicKey: string; mode: 'test' | 'live'; now?: number },
): Promise<LicenseCheck> {
  const clean = normalizeLicenseKey(key)
  const payload = decodeLicense(clean)
  if (!payload) return { ok: false, reason: 'format' }
  const [prefix, body, sig] = clean.split('.')
  const now = opts.now ?? Date.now()

  if (payload.test) {
    if (opts.mode !== 'test') return { ok: false, reason: 'testlicens' }
  } else {
    if (!opts.publicKey) return { ok: false, reason: 'ingen-nyckel' }
    try {
      const pub = await importPublicKey(opts.publicKey)
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pub,
        base64UrlDecode(sig) as BufferSource,
        enc.encode(`${prefix}.${body}`) as BufferSource,
      )
      if (!valid) return { ok: false, reason: 'signatur' }
    } catch {
      return { ok: false, reason: 'signatur' }
    }
  }
  if (payload.exp !== undefined && payload.exp * 1000 <= now) return { ok: false, reason: 'utgangen' }
  return { ok: true, payload }
}

/** Skapa en osignerad testlicens (bara giltig i testläge). */
export function createTestLicense(plan: PlanId, durationDays: number | undefined, now = Date.now()): string {
  const iat = Math.floor(now / 1000)
  const payload: LicensePayload = {
    v: 1,
    id: `test_${iat.toString(36)}`,
    plan,
    iat,
    ...(durationDays ? { exp: iat + durationDays * 86_400 } : {}),
    test: true,
  }
  return `${LICENSE_PREFIX}.${base64UrlEncode(enc.encode(JSON.stringify(payload)))}.test`
}

/**
 * Signera en licens med en privat nyckel (PKCS#8, base64). Används av serverfunktionen och
 * skripten – och av testerna. Fungerar både i webbläsare och Node 22 (WebCrypto).
 */
export async function signLicense(payload: LicensePayload, privateKeyPkcs8Base64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    base64Decode(privateKeyPkcs8Base64) as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const body = base64UrlEncode(enc.encode(JSON.stringify(payload)))
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${LICENSE_PREFIX}.${body}`) as BufferSource),
  )
  return `${LICENSE_PREFIX}.${body}.${base64UrlEncode(sig)}`
}
