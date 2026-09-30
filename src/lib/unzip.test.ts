import { describe, expect, it } from 'vitest'
import { crc32, decodeText, looksLikeZip, unzip, UnzipError } from './unzip'

const utf8 = (s: string) => new TextEncoder().encode(s)

interface TestFile {
  name: string
  content: Uint8Array
  /** Packad data (standard: lagrad). */
  data?: Uint8Array
  method?: number
  flags?: number
  crc?: number
}

/** Bygg en liten zip-fil i minnet (lokala rubriker, centralkatalog och EOCD). */
function buildZip(files: TestFile[]): ArrayBuffer {
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = utf8(f.name)
    const data = f.data ?? f.content
    const crc = f.crc ?? crc32(f.content)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, (f.flags ?? 0) | 0x800, true)
    local.setUint16(8, f.method ?? 0, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, f.content.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, data)

    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint16(8, (f.flags ?? 0) | 0x800, true)
    dir.setUint16(10, f.method ?? 0, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, data.length, true)
    dir.setUint32(24, f.content.length, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), name)
    offset += 30 + name.length + data.length
  }
  const dirSize = central.reduce((s, c) => s + c.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, files.length, true)
  eocd.setUint16(10, files.length, true)
  eocd.setUint32(12, dirSize, true)
  eocd.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(eocd.buffer)]
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0))
  let p = 0
  for (const c of all) {
    out.set(c, p)
    p += c.length
  }
  return out.buffer
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes)
      c.close()
    },
  }).pipeThrough(new CompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0))
  let p = 0
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  return out
}

const hasStreams = typeof DecompressionStream !== 'undefined' && typeof CompressionStream !== 'undefined'

describe('unzip', () => {
  it('läser lagrade poster och hoppar över mappar', async () => {
    const zip = buildZip([
      { name: 'export/', content: new Uint8Array() },
      { name: 'export/Nutrition-Summary.csv', content: utf8('Date,Meal,Calories\n2026-09-01,Lunch,650\n') },
      { name: 'export/Måtten.csv', content: utf8('\uFEFFDatum;Vikt\n2026-09-01;74,5\n') },
    ])
    expect(looksLikeZip(zip)).toBe(true)
    const entries = await unzip(zip)
    expect(entries.map((e) => e.name)).toEqual(['export/Nutrition-Summary.csv', 'export/Måtten.csv'])
    expect(await entries[0].text()).toBe('Date,Meal,Calories\n2026-09-01,Lunch,650\n')
    // BOM tas bort.
    expect(await entries[1].text()).toBe('Datum;Vikt\n2026-09-01;74,5\n')
  })

  it.skipIf(!hasStreams)('packar upp deflate-poster', async () => {
    const text = 'Date,Meal,Calories\n' + Array.from({ length: 200 }, (_, i) => `2026-09-${String((i % 28) + 1).padStart(2, '0')},Lunch,${500 + i}`).join('\n')
    const content = utf8(text)
    const zip = buildZip([{ name: 'data.csv', content, data: await deflateRaw(content), method: 8 }])
    const [entry] = await unzip(zip)
    expect(await entry.text()).toBe(text)
  })

  it('ger svenska fel för krypterade, trasiga och okända filer', async () => {
    const content = utf8('hemligt')
    await expect(unzip(buildZip([{ name: 'a.csv', content, flags: 0x1 }]))).rejects.toThrow(/krypterad/)
    await expect(unzip(utf8('inte en zip-fil alls, bara text').buffer)).rejects.toThrow('Filen är ingen zip-fil.')
    await expect(unzip(new ArrayBuffer(4))).rejects.toBeInstanceOf(UnzipError)

    // Avklippt fil: centralkatalogen saknas.
    const whole = new Uint8Array(buildZip([{ name: 'a.csv', content: utf8('Date,Weight\n2026-09-01,70\n') }]))
    await expect(unzip(whole.slice(0, 40).buffer)).rejects.toThrow(/trasig/)

    // Fel kontrollsumma upptäcks när posten läses.
    const [bad] = await unzip(buildZip([{ name: 'a.csv', content, crc: 1234 }]))
    await expect(bad.text()).rejects.toThrow(/trasig/)

    // Okänd packning (t.ex. bzip2).
    const [odd] = await unzip(buildZip([{ name: 'a.csv', content, method: 12 }]))
    await expect(odd.text()).rejects.toThrow(/packad på ett sätt/)
  })

  it('beräknar CRC-32 enligt standarden', () => {
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('avkodar UTF-8 och faller tillbaka på Windows-1252', () => {
    expect(decodeText(utf8('\uFEFFMåltid'))).toBe('Måltid')
    // "Måltid" i Windows-1252 (å = 0xE5) är ogiltig UTF-8.
    expect(decodeText(new Uint8Array([0x4d, 0xe5, 0x6c, 0x74, 0x69, 0x64]))).toBe('Måltid')
    expect(looksLikeZip(utf8('Date,Weight').buffer)).toBe(false)
  })
})
