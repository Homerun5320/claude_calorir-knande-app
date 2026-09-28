// @vitest-environment node
/**
 * POST /api/recipe-fetch: receptimporten får bara hämta publika https-sidor (SSRF-skydd) och
 * lämnar bara ut sidans JSON-LD. Fejkad DNS och fetch – inget nätverk.
 */
import { describe, expect, it } from 'vitest'
import type { HandlerDeps } from '../lib/handlers.ts'
import { RateLimiter } from '../lib/http.ts'
import {
  RECIPE_MAX_BYTES,
  extractRecipeJsonLd,
  fetchRecipeJsonLd,
  handleRecipeFetch,
  isPublicAddress,
  parseIPv6,
  validateRecipeUrl,
  type LookupFn,
} from '../lib/recipeFetch.ts'
import type { FetchLike } from '../lib/stripe.ts'

const APP = 'https://lagom.example'
const PUBLIC_V4 = '93.184.216.34'

const RECIPE = { '@context': 'https://schema.org', '@type': 'Recipe', name: 'Pannkakor', recipeYield: '4', recipeIngredient: ['3 dl vetemjöl', '6 dl mjölk', '3 ägg'] }
const PAGE = `<!doctype html><html><head>
<script>window.hemligt = 'spårning'</script>
<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
<script type='application/ld+json'>${JSON.stringify(RECIPE)}</script>
</head><body><h1>Pannkakor</h1><p>Personlig kommentar</p></body></html>`

function dns(map: Record<string, string[]>): LookupFn & { calls: string[] } {
  const calls: string[] = []
  const fn = async (host: string) => {
    calls.push(host)
    const addresses = map[host]
    if (!addresses) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  }
  return Object.assign(fn, { calls })
}

interface FakePage {
  status?: number
  headers?: Record<string, string>
  body?: string | ReadableStream<Uint8Array>
}

function pages(map: Record<string, FakePage | ((init?: RequestInit) => Promise<Response>)>): FetchLike & { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init })
    const page = map[url]
    if (!page) throw new TypeError('fetch failed')
    if (typeof page === 'function') return page(init)
    return new Response(page.body ?? '', { status: page.status ?? 200, headers: { 'content-type': 'text/html; charset=utf-8', ...page.headers } })
  }
  return Object.assign(fn, { calls })
}

describe('adresser', () => {
  it('bara https, standardporten och inga inloggningsuppgifter', () => {
    expect(validateRecipeUrl('https://www.ica.se/recept/pannkakor-1234/')?.href).toBe('https://www.ica.se/recept/pannkakor-1234/')
    expect(validateRecipeUrl('https://www.ica.se:443/recept/#steg')?.href).toBe('https://www.ica.se/recept/')
    for (const bad of [
      'http://www.ica.se/recept/',
      'ftp://www.ica.se/',
      'file:///etc/passwd',
      'https://anv:losen@www.ica.se/',
      'https://anv@www.ica.se/',
      'https://www.ica.se:8443/',
      'javascript:alert(1)',
      'inte en adress',
      `https://www.ica.se/${'a'.repeat(2100)}`,
      42,
      undefined,
    ]) {
      expect(validateRecipeUrl(bad), String(bad).slice(0, 40)).toBeNull()
    }
  })

  it.each([
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '127.0.0.1',
    '127.1.2.3',
    '169.254.169.254',
    '100.64.0.1',
    '100.127.255.255',
    '0.0.0.0',
    '192.0.0.1',
    '192.0.2.10',
    '198.18.0.1',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:10.1.2.3',
    '::ffff:a9fe:a9fe',
    '::127.0.0.1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0',
    'ff02::1',
    '64:ff9b::a00:1',
    '100::1',
    '2001:db8::1',
    '2001::1',
    '2002:a00:1::1',
    'inte-en-ip',
  ])('%s är inte publik', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each([PUBLIC_V4, '8.8.8.8', '172.32.0.1', '100.128.0.1', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450:4001:81c::2004', '::ffff:8.8.8.8'])('%s är publik', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it('parseIPv6 hanterar förkortningar och inbäddad IPv4', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(parseIPv6('[2001:db8::8:800:200c:417a]')).toEqual([0x2001, 0xdb8, 0, 0, 8, 0x800, 0x200c, 0x417a])
    expect(parseIPv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x102, 0x304])
    expect(parseIPv6('1::2::3')).toBeNull()
    expect(parseIPv6('12345::')).toBeNull()
  })
})

describe('fetchRecipeJsonLd', () => {
  const URL_OK = 'https://recept.example/pannkakor'

  it('lyckad hämtning: bara JSON-LD med recept kommer tillbaka', async () => {
    const lookup = dns({ 'recept.example': [PUBLIC_V4, '2606:4700::1'] })
    const fetch = pages({ [URL_OK]: { body: PAGE } })
    const res = await fetchRecipeJsonLd(URL_OK, { fetch, lookup })
    expect('html' in res).toBe(true)
    const html = (res as { html: string }).html
    expect(html).toBe(`<script type="application/ld+json">${JSON.stringify(RECIPE)}</script>`)
    expect(html).not.toMatch(/hemligt|Personlig|BreadcrumbList/)
    expect(fetch.calls[0].init?.redirect).toBe('manual')
    expect(fetch.calls[0].init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('privata adresser avvisas innan något hämtas', async () => {
    for (const addresses of [['10.0.0.5'], ['127.0.0.1'], ['169.254.169.254'], ['::1'], ['fd00::5'], [PUBLIC_V4, '192.168.0.10']]) {
      const fetch = pages({})
      expect(await fetchRecipeJsonLd(URL_OK, { fetch, lookup: dns({ 'recept.example': addresses }) })).toEqual({ error: 'ogiltig' })
      expect(fetch.calls).toHaveLength(0)
    }
  })

  it('IP-adresser direkt i länken kontrolleras utan DNS', async () => {
    const lookup = dns({})
    for (const url of ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data/', 'https://0x7f000001/', 'https://2130706433/']) {
      expect(await fetchRecipeJsonLd(url, { fetch: pages({}), lookup }), url).toEqual({ error: 'ogiltig' })
    }
    expect(lookup.calls).toHaveLength(0)
  })

  it('http: och andra scheman avvisas', async () => {
    expect(await fetchRecipeJsonLd('http://recept.example/pannkakor', { fetch: pages({}), lookup: dns({}) })).toEqual({ error: 'ogiltig' })
  })

  it('omdirigeringar följs högst tre gånger och varje ny adress kontrolleras', async () => {
    const lookup = dns({ 'recept.example': [PUBLIC_V4], 'www.recept.example': [PUBLIC_V4], 'intern.example': ['10.1.2.3'] })
    const moved = (location: string): FakePage => ({ status: 301, headers: { location }, body: '' })

    const ok = pages({ [URL_OK]: moved('https://www.recept.example/pannkakor'), 'https://www.recept.example/pannkakor': { body: PAGE } })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: ok, lookup })).toHaveProperty('html')
    expect(ok.calls.map((c) => c.url)).toEqual([URL_OK, 'https://www.recept.example/pannkakor'])

    const toHttp = pages({ [URL_OK]: moved('http://www.recept.example/pannkakor') })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: toHttp, lookup })).toEqual({ error: 'ogiltig' })

    const toInternal = pages({ [URL_OK]: moved('https://intern.example/admin') })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: toInternal, lookup })).toEqual({ error: 'ogiltig' })
    expect(toInternal.calls).toHaveLength(1)

    const toLoopback = pages({ [URL_OK]: moved('https://127.0.0.1/') })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: toLoopback, lookup })).toEqual({ error: 'ogiltig' })

    const loop = pages({ [URL_OK]: moved('/pannkakor?igen=1'), 'https://recept.example/pannkakor?igen=1': moved(URL_OK) })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: loop, lookup })).toEqual({ error: 'hamtning' })
    expect(loop.calls).toHaveLength(4)
  })

  it('för stor sida avbryts – både enligt Content-Length och medan den läses', async () => {
    const lookup = dns({ 'recept.example': [PUBLIC_V4] })
    const declared = pages({ [URL_OK]: { headers: { 'content-length': String(RECIPE_MAX_BYTES + 1) }, body: PAGE } })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: declared, lookup })).toEqual({ error: 'hamtning' })

    let sent = 0
    let cancelled = false
    const chunk = new Uint8Array(64 * 1024).fill(0x61)
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength
        controller.enqueue(chunk)
      },
      cancel() {
        cancelled = true
      },
    })
    const streamed = pages({ [URL_OK]: { body: endless } })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: streamed, lookup })).toEqual({ error: 'hamtning' })
    expect(cancelled).toBe(true)
    expect(sent).toBeLessThanOrEqual(RECIPE_MAX_BYTES + 2 * chunk.byteLength)
  })

  it('tidsgräns: en server som inte svarar eller skickar för långsamt ger "hamtning"', async () => {
    const lookup = dns({ 'recept.example': [PUBLIC_V4] })
    const hanging = pages({
      [URL_OK]: (init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    })
    const started = Date.now()
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: hanging, lookup, timeoutMs: 50 })).toEqual({ error: 'hamtning' })
    expect(Date.now() - started).toBeLessThan(2000)

    const slowBody = new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => {}) })
    const slow = pages({ [URL_OK]: { body: slowBody } })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: slow, lookup, timeoutMs: 50 })).toEqual({ error: 'hamtning' })
  })

  it('tidsgränsen gäller även ett DNS-uppslag som aldrig svarar', async () => {
    const stuck: LookupFn = () => new Promise(() => {})
    const fetch = pages({ [URL_OK]: { body: PAGE } })
    const started = Date.now()
    expect(await fetchRecipeJsonLd(URL_OK, { fetch, lookup: stuck, timeoutMs: 50 })).toEqual({ error: 'hamtning' })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(fetch.calls).toHaveLength(0)
  })

  it('bara text/html; sidor utan recept och fel ger tydliga koder', async () => {
    const lookup = dns({ 'recept.example': [PUBLIC_V4] })
    const pdf = pages({ [URL_OK]: { headers: { 'content-type': 'application/pdf' }, body: '%PDF' } })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: pdf, lookup })).toEqual({ error: 'inget-recept' })
    const plain = pages({ [URL_OK]: { body: '<html><body>Inget recept här</body></html>' } })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: plain, lookup })).toEqual({ error: 'inget-recept' })
    const missing = pages({ [URL_OK]: { status: 404, body: 'Finns inte' } })
    expect(await fetchRecipeJsonLd(URL_OK, { fetch: missing, lookup })).toEqual({ error: 'hamtning' })
    expect(await fetchRecipeJsonLd('https://finns-inte.example/', { fetch: pages({}), lookup })).toEqual({ error: 'hamtning' })
  })

  it('teckenkodningen från servern används', async () => {
    const lookup = dns({ 'recept.example': [PUBLIC_V4] })
    // "Smör" i ISO-8859-1: ö är en enda byte (0xF6).
    const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
    const latin1 = new Uint8Array([...ascii('<script type="application/ld+json">{"@type":"Recipe","name":"Sm'), 0xf6, ...ascii('r"}</script>')])
    const fetch = pages({ [URL_OK]: () => Promise.resolve(new Response(latin1, { headers: { 'content-type': 'text/html; charset=iso-8859-1' } })) })
    const res = (await fetchRecipeJsonLd(URL_OK, { fetch, lookup })) as { html: string }
    expect(res.html).toContain('"name":"Smör"')
  })

  it('extractRecipeJsonLd tar bara block som nämner Recipe', () => {
    expect(extractRecipeJsonLd(PAGE)).toContain('"@type":"Recipe"')
    expect(extractRecipeJsonLd('<script type="application/ld+json">{"@type":"Organization"}</script>')).toBe('')
    expect(extractRecipeJsonLd('<SCRIPT TYPE="application/ld+json">{"@graph":[{"@type":"Recipe"}]}</SCRIPT >')).toContain('@graph')
  })

  it('blocket slutar där webbläsaren avslutar skriptet – resten av sidan följer aldrig med', () => {
    // "</script foo>" avslutar skriptet i en webbläsare. Utan det här skulle sidans övriga HTML
    // (och ett nytt <script>) hamna i svaret till appen.
    const html = '<script type="application/ld+json">{"@type":"Recipe","name":"A"}</script foo><p>Personligt</p><script>alert(1)</script>'
    const out = extractRecipeJsonLd(html)
    expect(out).toBe('<script type="application/ld+json">{"@type":"Recipe","name":"A"}</script>')
    expect(out).not.toContain('Personligt')
    expect(extractRecipeJsonLd('<script type="application/ld+json">{"@type":"Recipe"}</script/>')).toContain('"Recipe"')
    // "</scripts>" avslutar inte skriptet.
    expect(extractRecipeJsonLd('<script type="application/ld+json">{"@type":"Recipe","t":"</scripts>"}</script>')).toContain('</scripts>')
  })
})

describe('POST /api/recipe-fetch', () => {
  function deps(fetch: FetchLike, lookup: LookupFn, limiter = new RateLimiter(1000, 60_000)): HandlerDeps & { lookup: LookupFn } {
    return { env: { APP_URL: APP }, fetch, lookup, now: () => 0, rateLimiter: limiter, log: { info() {}, warn() {}, error() {} } }
  }
  const post = (body: unknown, origin = APP) =>
    new Request(`${APP}/api/recipe-fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) })

  it('svarar { html } med receptets JSON-LD', async () => {
    const d = deps(pages({ 'https://recept.example/p': { body: PAGE } }), dns({ 'recept.example': [PUBLIC_V4] }))
    const res = await handleRecipeFetch(post({ url: 'https://recept.example/p' }), d)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as { html: string }
    expect(body.html).toContain('Pannkakor')
  })

  it('svenska felmeddelanden: 400 ogiltig, 422 inget recept, 502 hämtningsfel', async () => {
    const lookup = dns({ 'recept.example': [PUBLIC_V4], 'intern.example': ['10.0.0.1'] })
    const fetch = pages({ 'https://recept.example/tom': { body: '<html></html>' } })
    const bad = await handleRecipeFetch(post({ url: 'http://recept.example/' }), deps(fetch, lookup))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ code: 'ogiltig', error: expect.stringContaining('https://') })
    const internal = await handleRecipeFetch(post({ url: 'https://intern.example/' }), deps(fetch, lookup))
    expect(internal.status).toBe(400)
    const none = await handleRecipeFetch(post({ url: 'https://recept.example/tom' }), deps(fetch, lookup))
    expect(none.status).toBe(422)
    expect(await none.json()).toEqual({ code: 'inget-recept', error: 'Hittade inget recept på sidan.' })
    const down = await handleRecipeFetch(post({ url: 'https://recept.example/nere' }), deps(fetch, lookup))
    expect(down.status).toBe(502)
    expect(await down.json()).toMatchObject({ code: 'hamtning' })
    expect((await handleRecipeFetch(post({ inget: 'url' }), deps(fetch, lookup))).status).toBe(400)
  })

  it('appens ursprung (även iPhone-appen) godtas, andra webbplatser nekas', async () => {
    const d = deps(pages({ 'https://recept.example/p': { body: PAGE } }), dns({ 'recept.example': [PUBLIC_V4] }))
    expect((await handleRecipeFetch(post({ url: 'https://recept.example/p' }, 'capacitor://localhost'), d)).status).toBe(200)
    const evil = await handleRecipeFetch(post({ url: 'https://recept.example/p' }, 'https://ond.example'), d)
    expect(evil.status).toBe(403)
    expect(await evil.json()).toMatchObject({ code: 'fel-ursprung' })
  })

  it('högst 10 anrop per minut och IP-adress', async () => {
    const d = deps(pages({ 'https://recept.example/p': { body: PAGE } }), dns({ 'recept.example': [PUBLIC_V4] }), new RateLimiter(10, 60_000))
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await handleRecipeFetch(post({ url: 'https://recept.example/p' }), d)).status)
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(statuses[10]).toBe(429)
  })

  it('bara POST', async () => {
    const d = deps(pages({}), dns({}))
    expect((await handleRecipeFetch(new Request(`${APP}/api/recipe-fetch`, { headers: { Origin: APP } }), d)).status).toBe(405)
  })
})
