// @vitest-environment node
/**
 * Butiksverktygen: generatorn för Digital Asset Links (scripts/generate-assetlinks.mjs),
 * kontroller av den incheckade butiksgrafiken i store-assets/ (storlek, färgtyp och filstorlek
 * enligt App Store Connects och Play Consoles krav) och den fristående supportsidan, som anges
 * som Support-URL i butikerna.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { AssetLinksError, buildAssetLinks, RELATION, splitFingerprints } from '../../scripts/generate-assetlinks.mjs'
import { PNG_RGB, PNG_RGBA, pngInfo, TARGETS } from '../../scripts/generate-icons.mjs'
import { FEATURE_GRAPHIC, jpegSize } from '../../scripts/generate-store-graphics.mjs'
import { DEVICES, EXCLUDED_ROUTES, PAGES } from '../../scripts/app-store-screenshots.mjs'
import { fillSellerPlaceholders, missingSellerPlaceholders } from '../../src/features/legal/staticSeller.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))

/** Ett giltigt fingeravtryck: 32 par hexsiffror. */
const fp = (byte: string) => Array.from({ length: 32 }, () => byte).join(':')
const PLAY_SIGNING = fp('AB')
const UPLOAD_KEY = fp('0f')

function problemsOf(fn: () => unknown): string[] {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(AssetLinksError)
    return (err as AssetLinksError & { problems: string[] }).problems
  }
  throw new Error('Förväntade ett fel')
}

describe('buildAssetLinks', () => {
  it('bygger en giltig assetlinks.json med båda fingeravtrycken', () => {
    expect(buildAssetLinks('se.exempel.lagom', [PLAY_SIGNING, UPLOAD_KEY])).toEqual([
      {
        relation: [RELATION],
        target: {
          namespace: 'android_app',
          package_name: 'se.exempel.lagom',
          // Gemener blir versaler, som i Play Console.
          sha256_cert_fingerprints: [PLAY_SIGNING, UPLOAD_KEY.toUpperCase()],
        },
      },
    ])
    expect(RELATION).toBe('delegate_permission/common.handle_all_urls')
  })

  it('tar bort dubbletter, tomma poster och ett inledande "SHA256:"', () => {
    const [statement] = buildAssetLinks(' se.exempel.lagom ', [PLAY_SIGNING, '', `SHA256: ${PLAY_SIGNING.toLowerCase()}`])
    expect(statement.target.package_name).toBe('se.exempel.lagom')
    expect(statement.target.sha256_cert_fingerprints).toEqual([PLAY_SIGNING])
  })

  it('delar upp ANDROID_SHA256 på kommatecken och mellanslag', () => {
    expect(splitFingerprints(`${PLAY_SIGNING}, ${UPLOAD_KEY}\n`)).toEqual([PLAY_SIGNING, UPLOAD_KEY])
    expect(splitFingerprints(undefined)).toEqual([])
  })

  it.each([
    ['', /ANDROID_PACKAGE saknas/],
    ['lagom', /omvänd domän/],
    ['se.exempel.lågom', /inga å\/ä\/ö/],
    ['se.1lagom.app', /börja med en bokstav/],
    ['se.exempel-lagom.app', /bindestreck/],
    [`se.${'a'.repeat(150)}`, /högst 150/],
  ])('avvisar paketnamnet "%s"', (pkg, message) => {
    const problems = problemsOf(() => buildAssetLinks(pkg, [PLAY_SIGNING]))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(message)
  })

  it('avvisar ogiltiga fingeravtryck med en förklaring på svenska', () => {
    const sha1 = Array.from({ length: 20 }, () => 'AA').join(':')
    const problems = problemsOf(() => buildAssetLinks('se.exempel.lagom', [sha1, 'AB:CD:EF', fp('GG'), PLAY_SIGNING.replaceAll(':', '')]))
    expect(problems).toHaveLength(4)
    expect(problems[0]).toMatch(/SHA-1/)
    expect(problems[1]).toMatch(/32 par hexsiffror.*3 delar/)
    expect(problems[2]).toMatch(/Fingeravtryck 3.*ogiltigt/)
    expect(problems[3]).toMatch(/Fingeravtryck 4.*ogiltigt/)
  })

  it('kräver minst ett fingeravtryck och rapporterar alla problem på en gång', () => {
    const problems = problemsOf(() => buildAssetLinks('', []))
    expect(problems).toEqual([expect.stringMatching(/ANDROID_PACKAGE saknas/), expect.stringMatching(/ANDROID_SHA256 saknas/)])
  })
})

describe('scripts/generate-assetlinks.mjs som kommando', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lagom-assetlinks-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  function run(env: Record<string, string>) {
    const out = join(dir, '.well-known', 'assetlinks.json')
    const res = spawnSync(process.execPath, [`${root}scripts/generate-assetlinks.mjs`, `--out=${out}`], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', ...env },
      timeout: 20_000,
    })
    return { code: res.status, out: res.stdout, err: res.stderr, file: out }
  }

  it('skriver filen från miljövariablerna', () => {
    const res = run({ ANDROID_PACKAGE: 'se.exempel.lagom', ANDROID_SHA256: `${PLAY_SIGNING},${UPLOAD_KEY}` })
    expect(res.code).toBe(0)
    const json = JSON.parse(readFileSync(res.file, 'utf8'))
    expect(json[0].target.sha256_cert_fingerprints).toHaveLength(2)
    expect(res.out).toMatch(/se\.exempel\.lagom med 2 fingeravtryck/)
  })

  it('avslutar med fel och skriver ingen fil när värdena är ogiltiga', () => {
    rmSync(join(dir, '.well-known'), { recursive: true, force: true })
    const res = run({ ANDROID_PACKAGE: 'lagom', ANDROID_SHA256: 'AB:CD' })
    expect(res.code).toBe(1)
    expect(res.err).toMatch(/assetlinks\.json kunde inte skapas/)
    expect(res.err).toMatch(/omvänd domän/)
    expect(existsSync(res.file)).toBe(false)
  })
})

describe('butiksgrafiken i store-assets/', () => {
  const read = (file: string) => readFileSync(join(root, 'store-assets', file))

  it('App Store-ikonen är 1 024 × 1 024 px utan alfakanal (RGB)', () => {
    const target = TARGETS.find((t) => t.file === 'app-store-icon-1024.png')!
    expect(target).toMatchObject({ size: 1024, variant: 'fullbleed', dir: 'store', colorType: PNG_RGB })
    expect(pngInfo(read(target.file))).toMatchObject({ width: 1024, height: 1024, colorType: PNG_RGB })
  })

  it('Google Play-ikonen är 512 × 512 px, 32-bitars (RGBA) och under 1 024 KB', () => {
    const target = TARGETS.find((t) => t.file === 'google-play-icon-512.png')!
    const png = read(target.file)
    expect(pngInfo(png)).toMatchObject({ width: 512, height: 512, bitDepth: 8, colorType: PNG_RGBA })
    expect(png.byteLength).toBeLessThan(1024 * 1024)
  })

  it('funktionsgrafiken är en JPEG på 1 024 × 500 px', () => {
    expect(jpegSize(read(FEATURE_GRAPHIC.file))).toEqual({ width: 1024, height: 500 })
  })

  it('butiksikonerna ligger inte i public/ (de skulle hamna i webbappens cache)', () => {
    for (const t of TARGETS.filter((x) => x.dir === 'store')) expect(existsSync(join(root, 'public', t.file))).toBe(false)
  })

  it('skärmdumparna har rätt storlekar och visar varken alkohol eller priser', () => {
    expect(DEVICES.apple.width * DEVICES.apple.scale).toBe(1320)
    expect(DEVICES.apple.height * DEVICES.apple.scale).toBe(2868)
    expect(DEVICES.play.width * DEVICES.play.scale).toBe(1080)
    expect(DEVICES.play.height * DEVICES.play.scale).toBe(1920)
    for (const p of PAGES) {
      for (const excluded of EXCLUDED_ROUTES) expect(p.route.startsWith(excluded)).toBe(false)
    }
  })
})

describe('supportsidan (public/support/index.html)', () => {
  const html = readFileSync(join(root, 'public', 'support', 'index.html'), 'utf8')

  it('är fristående, på svenska och utan JavaScript', () => {
    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toContain('<html lang="sv">')
    expect(html).toContain('name="viewport"')
    expect(html).not.toMatch(/<script\b/i)
    expect(html).toMatch(/prefers-color-scheme: dark/)
  })

  it('svarar på de vanliga frågorna och länkar till integritetspolicyn och villkoren', () => {
    for (const heading of [
      'Jag har bytt telefon',
      'Återställ köp i App Store eller Google Play',
      'Hur exporterar jag min data?',
      'Hur raderar jag allt?',
      'Vad händer när provperioden är slut?',
      'Jag har tappat min licensnyckel',
    ]) {
      expect(html).toContain(`>${heading}</h2>`)
    }
    expect(html).toContain('href="../integritet/"')
    expect(html).toContain('href="../villkor/"')
  })

  it('har inga utfyllnadstexter och får supportadressen när sidan byggs', () => {
    expect(html).not.toMatch(/lorem|ipsum|TODO|FIXME/i)
    expect(missingSellerPlaceholders(html)).toEqual(['[E-post]'])
    const filled = fillSellerPlaceholders(html, { VITE_SUPPORT_EMAIL: 'hej@lagom.se' })
    expect(missingSellerPlaceholders(filled)).toEqual([])
    expect(filled).toContain('<a href="mailto:hej@lagom.se">hej@lagom.se</a>')
  })

  it('länkar aldrig till köp', () => {
    expect(html).not.toMatch(/checkout|stripe|\/premium|köp licens/i)
  })
})
