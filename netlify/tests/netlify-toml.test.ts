// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const toml = readFileSync(`${root}netlify.toml`, 'utf8')
const csp = /Content-Security-Policy = "([^"]+)"/.exec(toml)?.[1] ?? ''

function directive(name: string): string[] {
  const d = csp
    .split(';')
    .map((s) => s.trim().split(/\s+/))
    .find((parts) => parts[0] === name)
  return d ? d.slice(1) : []
}

describe('netlify.toml', () => {
  it('bygger appen till dist och paketerar funktionerna', () => {
    expect(toml).toMatch(/command = "npm run build"/)
    expect(toml).toMatch(/publish = "dist"/)
    expect(toml).toMatch(/directory = "netlify\/functions"/)
  })

  it('varje fil i netlify/functions är en funktion (inga tester eller hjälpfiler där)', () => {
    const files = readdirSync(`${root}netlify/functions`)
    expect(files.sort()).toEqual([
      'create-checkout.mts',
      'license-revocations.mts',
      'recipe-fetch.mts',
      'recover-license.mts',
      'stripe-webhook.mts',
      'verify-purchase.mts',
    ])
  })

  it('varje funktion har en egen adress under /api/ – och de publika en anropsbegränsning som inte går att kringgå', () => {
    // Med `path` i funktionens config nås den inte via /.netlify/functions/<namn>, där en
    // [[redirects]]-regel med rate_limit inte gäller.
    const limited: Record<string, { windowLimit: number; aggregateBy: string[] }> = {
      'create-checkout': { windowLimit: 10, aggregateBy: ['ip', 'domain'] },
      'verify-purchase': { windowLimit: 30, aggregateBy: ['ip', 'domain'] },
      'recover-license': { windowLimit: 20, aggregateBy: ['domain'] },
      'recipe-fetch': { windowLimit: 10, aggregateBy: ['ip', 'domain'] },
      'license-revocations': { windowLimit: 60, aggregateBy: ['ip', 'domain'] },
    }
    for (const file of readdirSync(`${root}netlify/functions`)) {
      const name = file.replace(/\.mts$/, '')
      const source = readFileSync(`${root}netlify/functions/${file}`, 'utf8')
      const config = /export const config = (\{[\s\S]*?\n\})/.exec(source)?.[1]
      expect(config, `${file} saknar export const config`).toBeDefined()
      expect(config).toContain(`path: '/api/${name}'`)
      const want = limited[name]
      if (!want) {
        expect(name).toBe('stripe-webhook')
        expect(config).not.toContain('rateLimit')
        continue
      }
      const rate = /rateLimit: \{ windowLimit: (\d+), windowSize: (\d+), aggregateBy: \[([^\]]*)\] \}/.exec(config ?? '')
      expect(rate, `${file}: rateLimit saknas eller är skriven på ett annat sätt`).not.toBeNull()
      expect(Number(rate?.[1])).toBe(want.windowLimit)
      // Netlify godtar fönster på 1–180 sekunder.
      expect(Number(rate?.[2])).toBeGreaterThanOrEqual(1)
      expect(Number(rate?.[2])).toBeLessThanOrEqual(180)
      expect(rate?.[3].split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual(want.aggregateBy)
    }
    // Inga omskrivningar till /.netlify/functions – de skulle peka på adresser som inte finns.
    expect(toml).not.toMatch(/^\s*to = "\/\.netlify\/functions/m)
  })

  it('Play Billing i TWA-appen kräver Payment Request: payment=(self)', () => {
    expect(toml).toMatch(/payment=\(self\)/)
    expect(toml).not.toMatch(/payment=\(\)/)
  })

  it('/.well-known/assetlinks.json skickas som application/json (Digital Asset Links för Google Play)', () => {
    expect(toml).toMatch(/for = "\/\.well-known\/assetlinks\.json"\s+\[headers\.values\][^[]*Content-Type = "application\/json/)
  })

  it('CSP tillåter temaskriptet i index.html via hash', () => {
    const html = readFileSync(`${root}index.html`, 'utf8')
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    for (const script of inline) {
      const hash = `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`
      expect(directive('script-src'), `Inline-skriptet i index.html har ändrats. Uppdatera script-src i netlify.toml till ${hash}`).toContain(hash)
    }
    expect(directive('script-src')).not.toContain("'unsafe-inline'")
    expect(directive('script-src')).not.toContain("'unsafe-eval'")
  })

  it('CSP släpper bara igenom det appen behöver', () => {
    expect(directive('default-src')).toEqual(["'self'"])
    expect(directive('frame-ancestors')).toEqual(["'none'"])
    expect(directive('object-src')).toEqual(["'none'"])
    expect(directive('connect-src')).toEqual(expect.arrayContaining(["'self'", 'https://*.openfoodfacts.org', 'https://dataportal.livsmedelsverket.se']))
    expect(directive('img-src')).toEqual(expect.arrayContaining(["'self'", 'https://*.openfoodfacts.org']))
    expect(directive('form-action')).toContain('https://checkout.stripe.com')
    // Kameran behövs för streckkodsläsaren.
    expect(toml).toMatch(/Permissions-Policy = "camera=\(self\)/)
  })

  it('externa adresser som appen anropar finns med i connect-src', () => {
    // Om någon lägger till ett nytt API i koden måste CSP:n följa med.
    const sources = ['src/lib/openFoodFacts.ts', 'src/lib/livsmedelsverket.ts'].map((f) => readFileSync(`${root}${f}`, 'utf8')).join('\n')
    const hosts = new Set([...sources.matchAll(/'https:\/\/([a-z0-9.-]+)\//g)].map((m) => m[1]))
    expect(hosts.size).toBeGreaterThanOrEqual(2)
    const allowed = directive('connect-src')
    for (const host of hosts) {
      const ok = allowed.some((src) => src === `https://${host}` || (src.startsWith('https://*.') && host.endsWith(src.slice('https://*'.length))))
      expect(ok, `${host} saknas i connect-src i netlify.toml`).toBe(true)
    }
  })

  it('filer med hash i namnet cachas länge, service workern aldrig', () => {
    expect(toml).toMatch(/for = "\/assets\/\*"\s+\[headers\.values\]\s+Cache-Control = "public, max-age=31536000, immutable"/)
    expect(toml).toMatch(/for = "\/sw\.js"\s+\[headers\.values\]\s+Cache-Control = "public, max-age=0, must-revalidate"/)
  })
})
