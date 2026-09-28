/**
 * Lagom Moln – kryptering på enheten (end-to-end). Bara WebCrypto och CompressionStream, inga paket.
 *
 * Så fungerar valvet:
 * - En slumpad datanyckel (DEK, 32 byte) skapas på enheten och lämnar den aldrig okrypterad.
 * - DEK slås in (AES-256-GCM) två gånger och sparas i molnet så:
 *   1. under KEK1 = PBKDF2-SHA256(lösenfrasen i NFKC, slumpat salt, 600 000 varv),
 *   2. under KEK2 = HKDF-SHA256(återställningsnyckeln, 256 slumpade bitar som visas en gång).
 *   Båda inslagningarna är bundna till användarens id (AAD), så ett valv kan inte flyttas mellan konton.
 * - Ur DEK härleds med HKDF en AES-256-GCM-nyckel för innehållet och en HMAC-SHA256-nyckel för
 *   postnamnen. Nycklarna är icke-exporterbara; DEK och andra nyckelbuffertar nollställs direkt.
 * - Varje post: JSON → gzip → AES-256-GCM med slumpad 96-bitars IV och AAD
 *   "lagom-item/v1|<användar-id>|<post-id>" → "v1.<iv>.<chiffertext>" (base64url). En post som
 *   flyttas till ett annat post-id eller konto går inte att öppna.
 * - Post-id:t är en HMAC av ett logiskt namn (t.ex. "backup"), så servern ser aldrig vad posten är.
 *
 * Servern (Supabase) ser alltså bara e-postadressen, krypterade klumpar, storlekar och tider.
 * Utan lösenfrasen eller återställningsnyckeln går datan inte att läsa – inte ens för oss.
 */
import { base64UrlDecode, base64UrlEncode } from '../license'

/** Antal PBKDF2-varv i nya valv (OWASP:s rekommendation för PBKDF2-HMAC-SHA256). */
export const PBKDF2_ITERATIONS = 600_000
/** Valvets format. Höj bara tillsammans med en migrering av gamla valv. */
export const VAULT_FORMAT = 1

/** Lägsta och högsta antal varv som godtas (lågt tak i tester, skydd mot orimliga värden från servern). */
const MIN_ITERATIONS = 1_000
const MAX_ITERATIONS = 10_000_000
/** Längsta tillåtna upppackade post (skydd mot "zip-bomber"). */
const MAX_PLAINTEXT_BYTES = 64 * 1024 * 1024
/** Antal byte i återställningsnyckeln (256 bitar). */
const RECOVERY_BYTES = 32
/** Crockford-base32: inga I, L, O eller U. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** 32 byte = 256 bitar → 52 tecken à 5 bitar. */
const RECOVERY_CHARS = Math.ceil((RECOVERY_BYTES * 8) / 5)

export interface KdfParams {
  alg: 'PBKDF2-SHA256'
  iter: number
  /** Saltet, base64url. */
  salt: string
}

/** Det som sparas i molnet (tabellen vaults). Innehåller inga nycklar i klartext. */
export interface VaultRecord {
  format: 1
  kdf: KdfParams
  /** DEK inslagen under lösenfrasens nyckel ("v1.<iv>.<ct>"). */
  wrappedKeyPassphrase: string
  /** DEK inslagen under återställningsnyckeln ("v1.<iv>.<ct>"). */
  wrappedKeyRecovery: string
}

/** Upplåst valv: icke-exporterbara nycklar som bara finns på enheten. */
export interface UnlockedVault {
  /** AES-256-GCM för postinnehåll. */
  dataKey: CryptoKey
  /** HMAC-SHA256 för post-id:n. */
  idKey: CryptoKey
}

export type VaultErrorCode = 'fel-losenfras' | 'fel-format' | 'skadad'

const VAULT_MESSAGES: Record<VaultErrorCode, string> = {
  'fel-losenfras': 'Lösenfrasen stämmer inte. Kontrollera stavningen och försök igen.',
  'fel-format': 'Molnkopian har ett format som den här versionen av Lagom inte känner igen. Uppdatera appen och försök igen.',
  skadad: 'Datan i molnet gick inte att läsa. Den kan vara skadad.',
}

/** Fel från valvet, med svensk text som kan visas direkt. */
export class VaultError extends Error {
  readonly code: VaultErrorCode
  constructor(code: VaultErrorCode, message: string = VAULT_MESSAGES[code]) {
    super(message)
    this.name = 'VaultError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------

const subtle = (): SubtleCrypto => globalThis.crypto.subtle
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

/** En egen kopia med en vanlig ArrayBuffer (WebCrypto godtar inte delade buffertar). */
function own(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return out
}

function utf8(text: string): Uint8Array<ArrayBuffer> {
  return own(encoder.encode(text))
}

function random(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

function decodeB64(text: string, code: VaultErrorCode): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new VaultError(code)
  try {
    return own(base64UrlDecode(text))
  } catch {
    throw new VaultError(code)
  }
}

function checkIterations(iter: unknown): number {
  if (typeof iter !== 'number' || !Number.isInteger(iter) || iter < MIN_ITERATIONS || iter > MAX_ITERATIONS) {
    throw new VaultError('fel-format')
  }
  return iter
}

/** Förseglad klump: "v1.<iv>.<chiffertext>" med AES-256-GCM. */
async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>, aad: string): Promise<string> {
  const iv = random(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad) }, key, plain)
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ct))}`
}

/** Öppna en förseglad klump. Ett misslyckat öppnande ger `failCode`. */
async function unseal(key: CryptoKey, sealed: unknown, aad: string, failCode: VaultErrorCode): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof sealed !== 'string') throw new VaultError('fel-format')
  const parts = sealed.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') throw new VaultError('fel-format')
  const iv = decodeB64(parts[1], 'skadad')
  const ct = decodeB64(parts[2], 'skadad')
  // 16 byte autentiseringstagg är minsta möjliga chiffertext.
  if (iv.byteLength !== 12 || ct.byteLength < 16) throw new VaultError('skadad')
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad) }, key, ct))
  } catch {
    throw new VaultError(failCode)
  }
}

const wrapAad = (purpose: 'losenfras' | 'aterstallning', userId: string) => `lagom-vault/v1|${purpose}|${userId}`
const itemAad = (userId: string, itemId: string) => `lagom-item/v1|${userId}|${itemId}`

async function passphraseKek(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const pw = utf8(passphrase.normalize('NFKC'))
  try {
    const base = await subtle().importKey('raw', pw, 'PBKDF2', false, ['deriveKey'])
    return await subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ])
  } finally {
    pw.fill(0)
  }
}

async function recoveryKek(recovery: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', recovery, 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8('lagom-vault/v1/aterstallning') }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** Härled innehålls- och id-nyckeln ur DEK. */
async function deriveKeys(dek: Uint8Array<ArrayBuffer>): Promise<UnlockedVault> {
  const base = await subtle().importKey('raw', dek, 'HKDF', false, ['deriveKey'])
  const salt = utf8('lagom-vault/v1')
  const dataKey = await subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: utf8('lagom-data/v1') }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  const idKey = await subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8('lagom-id/v1') },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  )
  return { dataKey, idKey }
}

/** Kontrollera ett valv som lästs från servern (som inte är betrodd). */
function checkRecord(record: VaultRecord): { salt: Uint8Array<ArrayBuffer>; iter: number } {
  const r = record as Partial<VaultRecord> | null
  if (!r || r.format !== VAULT_FORMAT || !r.kdf || r.kdf.alg !== 'PBKDF2-SHA256') throw new VaultError('fel-format')
  if (typeof r.wrappedKeyPassphrase !== 'string' || typeof r.wrappedKeyRecovery !== 'string') throw new VaultError('fel-format')
  const iter = checkIterations(r.kdf.iter)
  if (typeof r.kdf.salt !== 'string') throw new VaultError('fel-format')
  const salt = decodeB64(r.kdf.salt, 'fel-format')
  if (salt.byteLength < 16) throw new VaultError('fel-format')
  return { salt, iter }
}

async function openDek(dek: Uint8Array<ArrayBuffer>): Promise<UnlockedVault> {
  try {
    if (dek.byteLength !== 32) throw new VaultError('skadad')
    return await deriveKeys(dek)
  } finally {
    dek.fill(0)
  }
}

// ---------------------------------------------------------------------------
// Skapa och låsa upp
// ---------------------------------------------------------------------------

/**
 * Skapa ett nytt valv. `recoveryKey` visas för användaren EN gång och sparas aldrig – varken på
 * enheten eller i molnet. `iterations` ändras bara i tester.
 */
export async function createVault(
  passphrase: string,
  userId: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<{ record: VaultRecord; recoveryKey: string; unlocked: UnlockedVault }> {
  checkIterations(iterations)
  const dek = random(32)
  const recovery = random(RECOVERY_BYTES)
  const salt = random(16)
  try {
    const kek1 = await passphraseKek(passphrase, salt, iterations)
    const kek2 = await recoveryKek(recovery, salt)
    const record: VaultRecord = {
      format: VAULT_FORMAT,
      kdf: { alg: 'PBKDF2-SHA256', iter: iterations, salt: base64UrlEncode(salt) },
      wrappedKeyPassphrase: await seal(kek1, dek, wrapAad('losenfras', userId)),
      wrappedKeyRecovery: await seal(kek2, dek, wrapAad('aterstallning', userId)),
    }
    const unlocked = await deriveKeys(dek)
    return { record, recoveryKey: formatRecoveryKey(recovery), unlocked }
  } finally {
    dek.fill(0)
    recovery.fill(0)
  }
}

/** Lås upp med lösenfrasen. Fel lösenfras (eller fel konto) ger VaultError 'fel-losenfras'. */
export async function unlockWithPassphrase(record: VaultRecord, passphrase: string, userId: string): Promise<UnlockedVault> {
  const { salt, iter } = checkRecord(record)
  const kek = await passphraseKek(passphrase, salt, iter)
  return openDek(await unseal(kek, record.wrappedKeyPassphrase, wrapAad('losenfras', userId), 'fel-losenfras'))
}

/** Lås upp med återställningsnyckeln (när lösenfrasen är glömd). */
export async function unlockWithRecoveryKey(record: VaultRecord, recoveryKey: string, userId: string): Promise<UnlockedVault> {
  const { salt } = checkRecord(record)
  const recovery = parseRecoveryKey(recoveryKey)
  try {
    return await openDek(await unsealWithRecovery(record, recovery, salt, userId))
  } finally {
    recovery.fill(0)
  }
}

/** DEK ur inslagningen med återställningsnyckeln. Fel nyckel (eller fel konto) ger 'fel-losenfras' med egen text. */
async function unsealWithRecovery(
  record: VaultRecord,
  recovery: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  userId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const kek = await recoveryKek(recovery, salt)
  try {
    return await unseal(kek, record.wrappedKeyRecovery, wrapAad('aterstallning', userId), 'fel-losenfras')
  } catch (e) {
    if (e instanceof VaultError && e.code === 'fel-losenfras') {
      throw new VaultError('fel-losenfras', 'Återställningsnyckeln stämmer inte. Kontrollera att du har skrivit av den rätt.')
    }
    throw e
  }
}

/**
 * Glömd lösenfras: sätt en ny med hjälp av återställningsnyckeln. Samma datanyckel slås in under
 * den nya lösenfrasen, så all data i molnet går fortfarande att läsa och återställningsnyckeln
 * fortsätter att gälla.
 */
export async function rewrapWithRecovery(
  record: VaultRecord,
  recoveryKey: string,
  newPassphrase: string,
  userId: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<VaultRecord> {
  const { salt } = checkRecord(record)
  const recovery = parseRecoveryKey(recoveryKey)
  try {
    const dek = await unsealWithRecovery(record, recovery, salt, userId)
    return await rewrap(record, dek, newPassphrase, userId, iterations)
  } finally {
    recovery.fill(0)
  }
}

async function rewrap(record: VaultRecord, dek: Uint8Array<ArrayBuffer>, newPassphrase: string, userId: string, iterations: number): Promise<VaultRecord> {
  try {
    if (dek.byteLength !== 32) throw new VaultError('skadad')
    checkIterations(iterations)
    // Saltet behålls: det används också när nyckeln härleds ur återställningsnyckeln.
    const salt = decodeB64(record.kdf.salt, 'fel-format')
    const kek = await passphraseKek(newPassphrase, salt, iterations)
    return {
      ...record,
      kdf: { ...record.kdf, iter: iterations },
      wrappedKeyPassphrase: await seal(kek, dek, wrapAad('losenfras', userId)),
    }
  } finally {
    dek.fill(0)
  }
}

// ---------------------------------------------------------------------------
// Poster
// ---------------------------------------------------------------------------

/** Postens id i molnet: HMAC av det logiska namnet, 24 byte → 32 tecken base64url. */
export async function itemId(unlocked: UnlockedVault, logicalKey: string): Promise<string> {
  const mac = new Uint8Array(await subtle().sign('HMAC', unlocked.idKey, utf8(`lagom-item-id/v1|${logicalKey}`)))
  return base64UrlEncode(mac.subarray(0, 24))
}

/** Kryptera ett värde (JSON → gzip → AES-GCM). Returnerar "v1.<iv>.<chiffertext>". */
export async function encryptItem(unlocked: UnlockedVault, userId: string, id: string, value: unknown): Promise<string> {
  const json = JSON.stringify(value)
  if (typeof json !== 'string') throw new TypeError('Värdet går inte att spara som JSON.')
  const packed = await transform(utf8(json), new CompressionStream('gzip'))
  return seal(unlocked.dataKey, packed, itemAad(userId, id))
}

/**
 * Dekryptera en post. Fel nyckel, fel konto, fel post-id eller ändrad chiffertext ger
 * VaultError 'skadad'; ett okänt format ger 'fel-format'.
 */
export async function decryptItem<T>(unlocked: UnlockedVault, userId: string, id: string, payload: string): Promise<T> {
  const packed = await unseal(unlocked.dataKey, payload, itemAad(userId, id), 'skadad')
  let text: string
  try {
    text = decoder.decode(await transform(packed, new DecompressionStream('gzip')))
  } catch {
    throw new VaultError('skadad')
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new VaultError('skadad')
  }
}

/**
 * Kör bytes genom en (de)komprimeringsström. jsdom (och äldre webbläsare) saknar
 * Blob.prototype.stream, så strömmen byggs för hand.
 */
async function transform(data: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  })
  const reader = source.pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_PLAINTEXT_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new VaultError('skadad')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

// ---------------------------------------------------------------------------
// Återställningsnyckeln
// ---------------------------------------------------------------------------

/** 32 byte som Crockford-base32 i grupper om fyra: "ABCD-EFGH-…" (52 tecken, 13 grupper). */
export function formatRecoveryKey(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31]
  return out.match(/.{1,4}/g)?.join('-') ?? ''
}

/**
 * Tolka en inskriven återställningsnyckel. Tål gemener, mellanslag och bindestreck, och läser O som
 * 0 och I/L som 1 (Crockford). Kastar VaultError 'fel-format' om nyckeln har fel längd eller tecken.
 */
export function parseRecoveryKey(input: string): Uint8Array<ArrayBuffer> {
  const clean = input
    .toUpperCase()
    .replace(/[\s -]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (clean.length !== RECOVERY_CHARS || [...clean].some((c) => !CROCKFORD.includes(c))) {
    throw new VaultError('fel-format', 'Återställningsnyckeln ska ha 52 tecken i 13 grupper om fyra. Kontrollera att du har fått med allt.')
  }
  const out = new Uint8Array(RECOVERY_BYTES)
  let bits = 0
  let value = 0
  let i = 0
  for (const c of clean) {
    value = (value << 5) | CROCKFORD.indexOf(c)
    bits += 5
    if (bits >= 8) {
      if (i < RECOVERY_BYTES) out[i++] = (value >>> (bits - 8)) & 255
      bits -= 8
    }
    value &= (1 << bits) - 1
  }
  return out
}
