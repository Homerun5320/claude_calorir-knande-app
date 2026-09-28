#!/usr/bin/env node
/**
 * Kontrollerar att Android-appen fungerar på telefoner med 16 KB minnessidor (krav i Google Play
 * för nya appar och uppdateringar som riktar sig till Android 15+).
 *
 *   node scripts/check-android-16kb.mjs android/app/build/outputs/apk/debug/app-debug.apk
 *   node scripts/check-android-16kb.mjs android/app/build/outputs/bundle/release/app-release.aab
 *
 * För varje inbyggt bibliotek (lib/<abi>/*.so) i paketet:
 * - 64-bitars bibliotek (arm64-v8a, x86_64) måste ha LOAD-segment justerade till minst 16 KB
 *   (ELF p_align ≥ 2^14). Det avgörs när biblioteket byggs – står ett tillägg här behövs en nyare
 *   version av det (t.ex. ML Kit i streckkodsläsaren).
 * - I en APK måste okomprimerade bibliotek ligga på en 16 KB-gräns i zip-filen (sköts av Android
 *   Gradle Plugin 8.5.1+ med useLegacyPackaging = false). I en AAB gör Google Play det själv.
 *
 * Skriptet behöver inga paket (zip och ELF läses direkt) och avslutar med kod 1 vid fel.
 */
import { readFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

export const PAGE_16K = 16 * 1024
/** ABI:er där 16 KB krävs (32-bitars bibliotek körs aldrig med 16 KB-sidor). */
const ABI_64 = new Set(['arm64-v8a', 'x86_64'])

/**
 * Posterna i en zip-fil (centralkatalogen).
 * @param {Buffer} zip
 * @returns {Array<{ name: string, method: number, compressedSize: number, dataOffset: number }>}
 */
export function zipEntries(zip) {
  // End of central directory: signaturen 0x06054b50, sökt bakifrån (efter den kan en kommentar ligga).
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Filen är ingen zip-fil (APK/AAB).')
  const count = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16)
  const entries = []
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Trasig centralkatalog i zip-filen.')
    const method = zip.readUInt16LE(p + 10)
    const compressedSize = zip.readUInt32LE(p + 20)
    const nameLength = zip.readUInt16LE(p + 28)
    const extraLength = zip.readUInt16LE(p + 30)
    const commentLength = zip.readUInt16LE(p + 32)
    const localOffset = zip.readUInt32LE(p + 42)
    const name = zip.toString('utf8', p + 46, p + 46 + nameLength)
    // Den lokala rubriken kan ha ett annat extrafält (zipalign fyller ut där) – läs längderna där.
    const localName = zip.readUInt16LE(localOffset + 26)
    const localExtra = zip.readUInt16LE(localOffset + 28)
    entries.push({ name, method, compressedSize, dataOffset: localOffset + 30 + localName + localExtra })
    p += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/**
 * Minsta justeringen (p_align) bland LOAD-segmenten i ett ELF-bibliotek, eller null om filen inte
 * är ELF.
 * @param {Buffer} elf
 */
export function minLoadAlignment(elf) {
  if (elf.length < 52 || elf.readUInt32BE(0) !== 0x7f454c46) return null
  const is64 = elf[4] === 2
  const le = elf[5] === 1
  const u16 = (o) => (le ? elf.readUInt16LE(o) : elf.readUInt16BE(o))
  const u32 = (o) => (le ? elf.readUInt32LE(o) : elf.readUInt32BE(o))
  const u64 = (o) => Number(le ? elf.readBigUInt64LE(o) : elf.readBigUInt64BE(o))
  const phoff = is64 ? u64(0x20) : u32(0x1c)
  const phentsize = u16(is64 ? 0x36 : 0x2a)
  const phnum = u16(is64 ? 0x38 : 0x2c)
  let min = Infinity
  for (let i = 0; i < phnum; i++) {
    const h = phoff + i * phentsize
    if (u32(h) !== 1) continue // PT_LOAD
    const align = is64 ? u64(h + 0x30) : u32(h + 0x1c)
    min = Math.min(min, align)
  }
  return Number.isFinite(min) ? min : null
}

/**
 * Kontrollera ett paket. Returnerar felen (tom lista = godkänt) och en rad per bibliotek.
 * @param {Buffer} zip
 * @param {{ apk: boolean }} options
 */
export function check16kb(zip, { apk }) {
  const errors = []
  const lines = []
  for (const entry of zipEntries(zip)) {
    const m = /(?:^|\/)lib\/([^/]+)\/([^/]+\.so)$/.exec(entry.name)
    if (!m) continue
    const [, abi, file] = m
    const raw = zip.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
    const elf = entry.method === 0 ? raw : entry.method === 8 ? inflateRawSync(raw) : null
    if (!elf) {
      errors.push(`${entry.name}: okänd komprimering (${entry.method}).`)
      continue
    }
    const align = minLoadAlignment(elf)
    const needs16k = ABI_64.has(abi)
    const elfOk = !needs16k || (align !== null && align >= PAGE_16K)
    const zipOk = !apk || entry.method !== 0 || entry.dataOffset % PAGE_16K === 0
    lines.push(`${elfOk && zipOk ? '✓' : '✗'} ${abi}/${file}  ELF-justering ${align === null ? '?' : `${align / 1024} KB`}${apk ? (entry.method === 0 ? `, zip-justering ${entry.dataOffset % PAGE_16K === 0 ? '16 KB' : 'fel'}` : ', komprimerad') : ''}`)
    if (!elfOk) errors.push(`${abi}/${file}: LOAD-segmenten är justerade till ${align === null ? 'okänt' : `${align} byte`} – 16 KB krävs. Uppdatera tillägget som har med biblioteket.`)
    if (!zipOk) errors.push(`${abi}/${file}: ligger inte på en 16 KB-gräns i APK:n – kontrollera useLegacyPackaging = false och Android Gradle Plugin 8.5.1+.`)
    if (apk && entry.method !== 0 && needs16k) errors.push(`${abi}/${file}: är komprimerad i APK:n – sätt useLegacyPackaging = false (android/app/build.gradle).`)
  }
  return { errors, lines }
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Användning: node scripts/check-android-16kb.mjs <app.apk | app.aab>')
    process.exitCode = 1
    return
  }
  const { errors, lines } = check16kb(await readFile(file), { apk: file.endsWith('.apk') })
  for (const line of lines) console.log(line)
  if (lines.length === 0) console.log('Inga inbyggda bibliotek (.so) i paketet.')
  if (errors.length > 0) {
    console.error(`\n16 KB-kontrollen misslyckades:\n- ${errors.join('\n- ')}`)
    process.exitCode = 1
  } else {
    console.log('\n✓ Alla inbyggda bibliotek klarar 16 KB-sidor.')
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
