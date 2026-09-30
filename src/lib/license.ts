/**
 * Licensnycklar som kan verifieras offline.
 *
 * Format: "LAGOM1.<payload>.<signatur>" där payload är base64url-kodad JSON och signaturen är
 * ECDSA P-256/SHA-256 (IEEE P1363, 64 byte) över strängen "LAGOM1.<payload>", base64url-kodad.
 * Servern (netlify/functions) signerar med den privata nyckeln; appen verifierar med de publika
 * nycklarna i VITE_LICENSE_PUBLIC_KEYS (eller VITE_LICENSE_PUBLIC_KEY). Licensnyckeln innehåller
 * inte ditt namn eller din e-post – bara licenstyp, datum och ett köp-id som vi kan koppla till
 * betalningen om du behöver hjälp.
 *
 * Spärrlistan för återbetalda licenser har samma uppbyggnad: "LAGOMREV1.<payload>.<signatur>"
 * (se `verifyRevocationList`).
 */
import type { PlanId } from '../config/commerce'
import { IS_STORE_BUILD } from '../config/platform'

export const LICENSE_PREFIX = 'LAGOM1'

export interface LicensePayload {
  /** Formatversion */
  v: 1
  /**
   * Unikt köp-id, t.ex. Stripe-sessionens id eller 'lic_…' – inget namn och ingen e-post, men
   * vi kan koppla det till betalningen om du behöver hjälp. Används också i spärrlistan.
   */
  id: string
  plan: PlanId
  /** Utfärdad, epoch-sekunder. */
  iat: number
  /** Går ut, epoch-sekunder. Saknas för livstidslicens. */
  exp?: number
  /** true för testlicenser (godtas bara i testläge). */
  test?: boolean
  /** Vilken nyckel som signerade licensen (`keyId` av den publika nyckeln). Saknas i äldre licenser. */
  kid?: string
}

export type LicenseCheck =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: 'format' | 'signatur' | 'utgangen' | 'testlicens' | 'ingen-nyckel' | 'aterkallad' }

export type LicenseFailure = Exclude<LicenseCheck, { ok: true }>['reason']

export const LICENSE_ERRORS: Record<LicenseFailure, string> = {
  format: 'Det där ser inte ut som en licensnyckel från Lagom. Kopiera hela nyckeln, den börjar med LAGOM1.',
  signatur: 'Licensnyckeln kunde inte verifieras. Kontrollera att hela nyckeln kom med.',
  utgangen: 'Licensen har gått ut. Du kan förnya den på köpsidan.',
  testlicens: 'Det här är en testlicens och gäller inte i den riktiga appen.',
  'ingen-nyckel': 'Appen saknar nyckel för att kontrollera licenser. Kontakta supporten.',
  aterkallad: 'Licensen har återkallats, till exempel för att köpet har återbetalats eller bestridits. Tror du att det är fel? Mejla oss, så reder vi ut det.',
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
    if (payload.kid !== undefined && typeof payload.kid !== 'string') return null
    return payload
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Publika nycklar
// ---------------------------------------------------------------------------

const importedKeys = new Map<string, Promise<CryptoKey>>()

function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  let p = importedKeys.get(spkiBase64)
  if (!p) {
    p = crypto.subtle.importKey('spki', base64Decode(spkiBase64) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    // En trasig nyckel ska inte fastna i cachen.
    p.catch(() => importedKeys.delete(spkiBase64))
    importedKeys.set(spkiBase64, p)
  }
  return p
}

const keyIds = new Map<string, Promise<string>>()

/**
 * Nyckelns id ("kid"): de första 8 tecknen av SHA-256 över SPKI-byten, base64url-kodat. Servern
 * skriver samma id i licensen, så att appen vet vilken nyckel som ska provas först.
 */
export function keyId(spkiBase64: string): Promise<string> {
  let p = keyIds.get(spkiBase64)
  if (!p) {
    p = (async () => {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', base64Decode(spkiBase64) as BufferSource))
      return base64UrlEncode(digest).slice(0, 8)
    })()
    p.catch(() => keyIds.delete(spkiBase64))
    keyIds.set(spkiBase64, p)
  }
  return p
}

function keyList(publicKey: string | readonly string[]): string[] {
  const list = typeof publicKey === 'string' ? [publicKey] : [...publicKey]
  return list.map((k) => k.trim()).filter((k) => k.length > 0)
}

/** Nycklarna i den ordning de ska provas: den med rätt kid först, sedan resten i tur och ordning. */
async function orderedKeys(keys: string[], kid: string | undefined): Promise<string[]> {
  if (!kid || keys.length < 2) return keys
  const ids = await Promise.all(keys.map((k) => keyId(k).catch(() => '')))
  const first = keys.filter((_, i) => ids[i] === kid)
  return [...first, ...keys.filter((_, i) => ids[i] !== kid)]
}

/** true om signaturen (base64url) stämmer för meddelandet med någon av nycklarna. */
async function verifyWithAny(keys: string[], kid: string | undefined, message: string, sigBase64Url: string): Promise<boolean> {
  let sig: Uint8Array
  try {
    sig = base64UrlDecode(sigBase64Url)
  } catch {
    return false
  }
  for (const k of await orderedKeys(keys, kid)) {
    try {
      const pub = await importPublicKey(k)
      if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig as BufferSource, enc.encode(message) as BufferSource)) return true
    } catch {
      /* fel nyckelformat – prova nästa */
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Verifiering
// ---------------------------------------------------------------------------

/**
 * Verifiera en licensnyckel. `now` i epoch-ms. `publicKey` kan vara en nyckel eller flera
 * (nyckelbyte): nyckeln vars kid stämmer provas först, sedan alla i tur och ordning.
 * I testläge godtas testlicenser utan signatur (signaturdelen är då "test").
 */
export async function verifyLicense(
  key: string,
  opts: {
    publicKey: string | readonly string[]
    mode: 'test' | 'live'
    now?: number
    /**
     * Underkänn licenser från köp med Stripes testkort (köp-id cs_test_…) i skarpt läge. Appen
     * sätter den (utom i förhandsversioner, VITE_ACCEPT_TEST_PURCHASES=1), så att ett testköp i
     * en förhandsversion som delar nyckel med produktionen aldrig blir en giltig licens där.
     */
    rejectTestPurchases?: boolean
  },
): Promise<LicenseCheck> {
  const clean = normalizeLicenseKey(key)
  const payload = decodeLicense(clean)
  if (!payload) return { ok: false, reason: 'format' }
  const [prefix, body, sig] = clean.split('.')
  const now = opts.now ?? Date.now()
  // Butiksappar verifierar alltid som i skarpt läge: ett butiksbygge som av misstag byggts i
  // testläge får aldrig godta osignerade testnycklar (som vem som helst kan skriva själv).
  const mode = IS_STORE_BUILD ? 'live' : opts.mode

  if (payload.test) {
    if (mode !== 'test') return { ok: false, reason: 'testlicens' }
  } else {
    if (mode === 'live' && opts.rejectTestPurchases && payload.id.startsWith('cs_test_')) return { ok: false, reason: 'testlicens' }
    const keys = keyList(opts.publicKey)
    if (keys.length === 0) return { ok: false, reason: 'ingen-nyckel' }
    if (!(await verifyWithAny(keys, payload.kid, `${prefix}.${body}`, sig))) return { ok: false, reason: 'signatur' }
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

async function importPrivateKey(privateKeyPkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', base64Decode(privateKeyPkcs8Base64) as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

async function signText(message: string, privateKeyPkcs8Base64: string): Promise<string> {
  const key = await importPrivateKey(privateKeyPkcs8Base64)
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(message) as BufferSource)))
}

/**
 * Signera en licens med en privat nyckel (PKCS#8, base64). Används av serverfunktionen och
 * skripten – och av testerna. Fungerar både i webbläsare och Node 22 (WebCrypto).
 */
export async function signLicense(payload: LicensePayload, privateKeyPkcs8Base64: string): Promise<string> {
  const body = base64UrlEncode(enc.encode(JSON.stringify(payload)))
  return `${LICENSE_PREFIX}.${body}.${await signText(`${LICENSE_PREFIX}.${body}`, privateKeyPkcs8Base64)}`
}

// ---------------------------------------------------------------------------
// Spärrlista för återbetalda licenser
// ---------------------------------------------------------------------------

export const REVOCATION_PREFIX = 'LAGOMREV1'

/**
 * Spärrlistan för licenser som inte längre gäller.
 * - v: 2 (nuvarande): `ids` är hashar – köp-id:ts hash (`purchaseIdHash`) eller nyckelns hash
 *   (`licenseKeyHash`). Köp-id:t står aldrig i klartext: det är just det som verify-purchase
 *   kräver för att lämna ut nyckeln, och listan är publik.
 * - v: 1 (äldre): köp-id (licensens `id`) i klartext eller nyckelhashar. Godtas fortfarande.
 */
export interface RevocationList {
  v: 1 | 2
  /** När listan utfärdades (serverns tidsstämpel). En äldre lista ersätter aldrig en nyare. */
  issuedAt: number
  ids: string[]
}

function parseRevocationPayload(body: string): RevocationList | null {
  try {
    const data = JSON.parse(dec.decode(base64UrlDecode(body))) as Partial<RevocationList>
    if ((data.v !== 1 && data.v !== 2) || typeof data.issuedAt !== 'number' || !Number.isFinite(data.issuedAt) || !Array.isArray(data.ids)) return null
    if (!data.ids.every((id) => typeof id === 'string')) return null
    return { v: data.v, issuedAt: data.issuedAt, ids: data.ids }
  } catch {
    return null
  }
}

/**
 * Läs en spärrlista utan att kontrollera signaturen – bara för en lista som redan har verifierats
 * och sparats (appen kontrollerar signaturen igen vid start, se features/premium/revocations.ts).
 */
export function decodeRevocationList(token: string): RevocationList | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts[0] !== REVOCATION_PREFIX) return null
  return parseRevocationPayload(parts[1])
}

/**
 * Verifiera en spärrlista "LAGOMREV1.<payload>.<signatur>" med licensernas publika nycklar.
 * payload = JSON { v, issuedAt, ids } base64url-kodat (v 1 eller 2, se `RevocationList`). Signaturen (ECDSA P-256/SHA-256)
 * godtas över payload-strängen – eller, som för licenserna, över "LAGOMREV1.<payload>".
 * Returnerar listan, eller null om den är trasig eller inte är signerad av oss.
 */
export async function verifyRevocationList(token: string, opts: { publicKey: string | readonly string[] }): Promise<RevocationList | null> {
  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts[0] !== REVOCATION_PREFIX) return null
  const [prefix, body, sig] = parts
  const list = parseRevocationPayload(body)
  if (!list) return null
  const keys = keyList(opts.publicKey)
  if (keys.length === 0) return null
  if (await verifyWithAny(keys, undefined, body, sig)) return list
  if (await verifyWithAny(keys, undefined, `${prefix}.${body}`, sig)) return list
  return null
}

/** Signera en spärrlista (för servern, supportskript och tester). Signaturen är över payload-strängen. */
export async function signRevocationList(list: RevocationList, privateKeyPkcs8Base64: string): Promise<string> {
  const body = base64UrlEncode(enc.encode(JSON.stringify({ v: list.v, issuedAt: list.issuedAt, ids: list.ids })))
  return `${REVOCATION_PREFIX}.${body}.${await signText(body, privateKeyPkcs8Base64)}`
}

/**
 * Nyckelns hash (SHA-256 över hela den tvättade nyckelsträngen, base64url). Spärrlistan kan
 * ange antingen köp-id:ts hash (`purchaseIdHash`) eller den här hashen.
 */
export async function licenseKeyHash(key: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(normalizeLicenseKey(key)) as BufferSource))
  return base64UrlEncode(digest)
}

/** Köp-id:ts hash i spärrlistan (v2): SHA-256 över id:t (licensens `id`), base64url. */
export async function purchaseIdHash(id: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(id) as BufferSource))
  return base64UrlEncode(digest)
}

/** true om texten ser ut som en SHA-256-hash i base64url (43 tecken) – t.ex. en nyckelhash. */
export function looksLikeHash(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}
