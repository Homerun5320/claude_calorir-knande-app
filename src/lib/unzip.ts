/**
 * Liten zip-läsare för import från andra appar (t.ex. MyFitnessPals export, som är en zip med
 * CSV-filer). Inga beroenden: centralkatalogen läses med DataView och packade poster packas upp
 * med webbläsarens `DecompressionStream('deflate-raw')`.
 *
 * Stöder de två vanligaste packningarna: 0 (lagrad) och 8 (deflate). Krypterade, trasiga och
 * orimligt stora filer ger ett begripligt fel på svenska (`UnzipError`).
 */

export class UnzipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnzipError'
  }
}

export interface ZipEntry {
  /** Sökväg inne i zip-filen, t.ex. "Nutrition-Summary-2026.csv" eller "mapp/fil.csv". */
  name: string
  /** Uppackad storlek i byte (enligt zip-filen). */
  size: number
  /** Packa upp och avkoda posten som text (UTF-8, med Windows-1252 som reserv). */
  text(): Promise<string>
}

/** Största tillåtna uppackade storlek per post – skydd mot "zip-bomber". */
export const MAX_ENTRY_BYTES = 50 * 1024 * 1024
/** Högst så här många poster läses. */
const MAX_ENTRIES = 1000

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

const BROKEN = 'Zip-filen är trasig eller ofullständig. Prova att ladda ned exporten igen.'

// ---------------------------------------------------------------------------
// CRC-32 (för att upptäcka trasiga filer)
// ---------------------------------------------------------------------------

let crcTable: Uint32Array | null = null

function table(): Uint32Array {
  if (crcTable) return crcTable
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  crcTable = t
  return t
}

/** CRC-32 enligt zip-standarden. */
export function crc32(bytes: Uint8Array): number {
  const t = table()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Avkoda text från en fil: UTF-8 (med eller utan BOM), och Windows-1252 som reserv – den
 * kodningen använder äldre svenska Excel-versioner när de sparar CSV.
 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '')
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(bytes)
    } catch {
      return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
    }
  }
}

// ---------------------------------------------------------------------------
// Uppackning
// ---------------------------------------------------------------------------

async function inflateRaw(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new UnzipError('Den här webbläsaren kan inte packa upp zip-filer. Packa upp filen på datorn och välj CSV-filen i stället.')
  }
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  })
  const reader = source.pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      // Packa aldrig upp mer än posten säger – och aldrig mer än gränsen.
      if (total > Math.min(expectedSize, MAX_ENTRY_BYTES)) {
        void reader.cancel().catch(() => {})
        throw new UnzipError(BROKEN)
      }
      chunks.push(value)
    }
  } catch (e) {
    if (e instanceof UnzipError) throw e
    throw new UnzipError(BROKEN)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/** Hitta "End of Central Directory" (sist i filen, före en eventuell kommentar). */
function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) return i
  }
  return -1
}

/**
 * Läs innehållsförteckningen i en zip-fil. Posterna packas upp först när `text()` anropas.
 * Mappar hoppas över. Kastar `UnzipError` för krypterade, trasiga eller för stora filer.
 */
export async function unzip(data: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(data)
  const bytes = new Uint8Array(data)
  if (view.byteLength < 22) throw new UnzipError('Filen är ingen zip-fil.')
  const eocd = findEocd(view)
  if (eocd < 0) throw new UnzipError(view.getUint32(0, true) === SIG_LOCAL ? BROKEN : 'Filen är ingen zip-fil.')

  const count = view.getUint16(eocd + 10, true)
  const dirSize = view.getUint32(eocd + 12, true)
  const dirOffset = view.getUint32(eocd + 16, true)
  if (count === 0xffff || dirOffset === 0xffffffff || dirSize === 0xffffffff) {
    throw new UnzipError('Zip-filen är för stor för Lagom. Packa upp den på datorn och välj CSV-filen i stället.')
  }
  if (count > MAX_ENTRIES) throw new UnzipError('Zip-filen innehåller för många filer.')
  if (dirOffset + dirSize > eocd) throw new UnzipError(BROKEN)

  const nameDecoder = new TextDecoder('utf-8')
  const entries: ZipEntry[] = []
  let p = dirOffset
  for (let i = 0; i < count; i++) {
    if (p + 46 > eocd || view.getUint32(p, true) !== SIG_CENTRAL) throw new UnzipError(BROKEN)
    const flags = view.getUint16(p + 8, true)
    const method = view.getUint16(p + 10, true)
    const crc = view.getUint32(p + 16, true)
    const compressedSize = view.getUint32(p + 20, true)
    const size = view.getUint32(p + 24, true)
    const nameLength = view.getUint16(p + 28, true)
    const extraLength = view.getUint16(p + 30, true)
    const commentLength = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    if (p + 46 + nameLength > eocd) throw new UnzipError(BROKEN)
    const name = nameDecoder.decode(bytes.subarray(p + 46, p + 46 + nameLength))
    p += 46 + nameLength + extraLength + commentLength

    if (name.endsWith('/')) continue // mapp
    if (flags & 0x1) {
      throw new UnzipError('Zip-filen är krypterad (lösenordsskyddad). Packa upp den på datorn och välj CSV-filen i stället.')
    }
    if (size > MAX_ENTRY_BYTES) throw new UnzipError('En fil i zip-filen är för stor för att läsas in.')

    // Den lokala rubriken kan ha ett annat extrafält än centralkatalogen – läs längderna där.
    if (localOffset + 30 > dirOffset || view.getUint32(localOffset, true) !== SIG_LOCAL) throw new UnzipError(BROKEN)
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const end = start + compressedSize
    if (end > dirOffset) throw new UnzipError(BROKEN)

    entries.push({
      name,
      size,
      async text() {
        const raw = bytes.subarray(start, end)
        let out: Uint8Array
        if (method === 0) out = raw
        else if (method === 8) out = await inflateRaw(raw, size)
        else throw new UnzipError('Zip-filen är packad på ett sätt som Lagom inte kan läsa. Packa upp den på datorn och välj CSV-filen i stället.')
        if (out.length !== size || crc32(out) !== crc) throw new UnzipError(BROKEN)
        return decodeText(out)
      },
    })
  }
  return entries
}

/** true om filens första byte ser ut som en zip-fil ("PK\x03\x04" eller en tom zip). */
export function looksLikeZip(data: ArrayBuffer): boolean {
  if (data.byteLength < 4) return false
  const sig = new DataView(data).getUint32(0, true)
  return sig === SIG_LOCAL || sig === SIG_EOCD
}
