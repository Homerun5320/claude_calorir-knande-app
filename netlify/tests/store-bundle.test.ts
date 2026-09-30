// @vitest-environment node
/**
 * Webbköpen får inte följa med i butiksapparna: riktiga byggen av webbdelen för App Store och
 * Google Play (med testvärden, som i CI) får inte innehålla koden för Stripe Checkout, tacksidan
 * eller "Tappat nyckeln?" – och App Store-bygget inte heller aktiveringen av licensnycklar eller
 * spärrlistan. Koden tas bort med byggkonstanter (WEB_PURCHASES_BUILD och KEY_ENTRY_BUILD i
 * src/config/platform.ts), och vite.config.ts stoppar ett butiksbygge där den har kommit tillbaka.
 *
 * Röstsökningen (src/lib/voiceSearch.ts) finns inte heller i butiksbyggena – apparna har ingen
 * röstsökning, och koden för taligenkänningen tas bort med VOICE_SEARCH_BUILD på samma sätt.
 *
 * Webbygget byggs också: där ska alla spår finnas, annars kontrollerar testet ingenting.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { VOICE_SEARCH_MARKERS, WEB_PURCHASE_MARKERS, findVoiceSearchCode, findWebPurchaseCode, type BundleFile } from '../../scripts/commerce-guard.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'lagom-butiksbygge-'))

afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

/** Samma testvärden som butiksbyggena i .github/workflows/ci.yml. */
const STORE_ENV = {
  VITE_API_BASE: 'https://lagom.invalid',
  VITE_SELLER_NAME: 'Testbygge',
  VITE_SELLER_ADDRESS: 'Testgatan 1, 123 45 Teststad',
  VITE_SELLER_PHONE: '000-000 00 00',
  VITE_SUPPORT_EMAIL: 'ci@users.noreply.github.com',
  LAGOM_ALLOW_STORE_WITHOUT_IAP: '1',
}

/** Bygg webbdelen med `vite build` i en egen process (inga VITE_-variabler från omgivningen). */
function build(distribution: 'web' | 'appstore' | 'play'): { outDir: string; code: number | null; log: string } {
  const outDir = join(work, distribution)
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? tmpdir(), NODE_ENV: 'production' }
  if (distribution !== 'web') Object.assign(env, STORE_ENV, { VITE_DISTRIBUTION: distribution })
  const res = spawnSync(process.execPath, [`${root}node_modules/vite/bin/vite.js`, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: root,
    encoding: 'utf8',
    env,
    timeout: 170_000,
  })
  return { outDir, code: res.status, log: `${res.stdout ?? ''}\n${res.stderr ?? ''}` }
}

/**
 * Röstsökningens spår som finns i bygget (VOICE_SEARCH_MARKERS i scripts/commerce-guard.ts – samma
 * som byggkontrollen i vite.config.ts letar efter). Finns bara i webbygget (VOICE_SEARCH_BUILD).
 */
function voiceSearchTraces(files: readonly BundleFile[]): string[] {
  return findVoiceSearchCode(files, 'appstore')
}

/** Alla JavaScript- och HTML-filer i bygget. */
function bundleFiles(dir: string): BundleFile[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.(?:js|mjs|html)$/.test(name))
    .map((name) => ({ name: relative(dir, join(dir, name)), code: readFileSync(join(dir, name), 'utf8') }))
}

describe('butiksbyggena utan webbköp och röstsökning', () => {
  it('App Store: ingen Stripe Checkout, ingen tacksida, ingen "Tappat nyckeln?", ingen aktivering av licensnycklar och ingen röstsökning', { timeout: 180_000 }, () => {
    const res = build('appstore')
    expect(res.code, res.log).toBe(0)
    const files = bundleFiles(res.outDir)
    expect(files.some((f) => f.name === 'index.html')).toBe(true)
    expect(findWebPurchaseCode(files, 'appstore')).toEqual([])
    expect(voiceSearchTraces(files)).toEqual([])
  })

  it('Google Play: ingen Stripe Checkout, ingen tacksida, ingen "Tappat nyckeln?" och ingen röstsökning (licensnycklar går att aktivera)', { timeout: 180_000 }, () => {
    const res = build('play')
    expect(res.code, res.log).toBe(0)
    const files = bundleFiles(res.outDir)
    expect(findWebPurchaseCode(files, 'play')).toEqual([])
    expect(voiceSearchTraces(files)).toEqual([])
    // Aktiveringen av licensnycklar och spärrlistan finns kvar i Google Play-appen.
    const all = files.map((f) => f.code).join('\n')
    expect(all).toContain('Klistra in hela nyckeln')
    expect(all).toContain('/api/license-revocations')
  })

  it('webbygget har kvar alla webbköp och röstsökningen – annars är kontrollen tom', { timeout: 180_000 }, () => {
    const res = build('web')
    expect(res.code, res.log).toBe(0)
    const files = bundleFiles(res.outDir)
    const all = files.map((f) => f.code).join('\n')
    for (const marker of WEB_PURCHASE_MARKERS) expect(all, `"${marker.text}" (${marker.what}) finns inte i webbygget`).toContain(marker.text)
    for (const marker of VOICE_SEARCH_MARKERS) expect(all, `"${marker}" (röstsökningen) finns inte i webbygget`).toContain(marker)
    expect(voiceSearchTraces(files).length).toBeGreaterThanOrEqual(VOICE_SEARCH_MARKERS.length)
    // Samma kontroll som i vite.config.ts hittar dem när de ligger i ett butiksbygge.
    const found = findWebPurchaseCode([{ name: 'webb.js', code: all }], 'appstore')
    expect(found).toHaveLength(WEB_PURCHASE_MARKERS.length)
  })
})

describe('vite.config.ts', () => {
  it('kontrollerar varje butiksbygge med findWebPurchaseCode', () => {
    const config = readFileSync(`${root}vite.config.ts`, 'utf8')
    expect(config).toMatch(/findWebPurchaseCode\(files, distribution\)/)
    expect(config).toMatch(/findVoiceSearchCode\(files, distribution\)/)
    expect(config).toMatch(/\.\.\.\(IS_STORE \? \[[^\]]*storeBundleGuard\(env\.VITE_DISTRIBUTION\)[^\]]*\] : \[\]\)/)
  })
})
