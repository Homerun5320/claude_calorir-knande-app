// @vitest-environment node
/**
 * POST /api/recipe-fetch: receptimporten får bara hämta publika https-sidor (SSRF-skydd, även mot
 * DNS-rebinding) och lämnar bara ut sidans receptdata. Hämtningarna går till en lokal https-server
 * med ett eget testcertifikat, och DNS är fejkad – inget riktigt nätverk.
 *
 * Testvärlden: 127.0.0.1 (testservern) räknas som publik via `allowAddress` – alla andra adresser
 * kontrolleras precis som i drift. Testerna för IP-adresser i länken använder den vanliga kontrollen.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import type { TLSSocket } from 'node:tls'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { HandlerDeps } from '../lib/handlers.ts'
import { RateLimiter } from '../lib/http.ts'
import {
  BlockedAddressError,
  RECIPE_MAX_BYTES,
  RECIPE_MAX_JSONLD_BLOCKS,
  extractRecipeJsonLd,
  extractRecipeMicrodata,
  fetchRecipeJsonLd,
  guardedLookup,
  handleRecipeFetch,
  isPublicAddress,
  parseIPv6,
  resolveCheckedAddresses,
  validateRecipeUrl,
  type LookupFn,
  type RecipeFetchOptions,
} from '../lib/recipeFetch.ts'

/**
 * Självsignerat certifikat BARA för testerna, för de påhittade namnen recept.example,
 * www.recept.example och ny.example (giltigt 2020–2120). Nyckeln skyddar ingenting.
 */
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg8ZlpOdwit7om6Znq
XDWwIctD9GCumNqb29s2cdjpl6yhRANCAAQfAt9evSIb6pPx39AuQ7fHIs4m3lxy
Fvk6mjBcUDGv1mVDhD2oHLRnB8k1G5V4kU35phNamRgu4iYmz0FVIl5v
-----END PRIVATE KEY-----`
const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIBkDCCATegAwIBAgICEAAwCgYIKoZIzj0EAwIwGTEXMBUGA1UEAwwOcmVjZXB0
LmV4YW1wbGUwIBcNMjAwMTAxMDAwMDAwWhgPMjEyMDAxMDEwMDAwMDBaMBkxFzAV
BgNVBAMMDnJlY2VwdC5leGFtcGxlMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE
HwLfXr0iG+qT8d/QLkO3xyLOJt5cchb5OpowXFAxr9ZlQ4Q9qBy0ZwfJNRuVeJFN
+aYTWpkYLuImJs9BVSJeb6NtMGswOQYDVR0RBDIwMIIOcmVjZXB0LmV4YW1wbGWC
End3dy5yZWNlcHQuZXhhbXBsZYIKbnkuZXhhbXBsZTAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBR36mGmPcTlWdv4I6O3yD3k7fKsiTAKBggqhkjOPQQDAgNHADBE
AiAZjx6WQqMiBSbylPzQqioEtj0MXxki9pPdepZOUdevvwIge+QWvizMmtx1/g5P
u7uIUMZc0Hh1nj0Stc71nloOnRg=
-----END CERTIFICATE-----`

const APP = 'https://lagom.example'
const LOCAL = '127.0.0.1'
const PUBLIC_V4 = '93.184.216.34'

const RECIPE = { '@context': 'https://schema.org', '@type': 'Recipe', name: 'Pannkakor', recipeYield: '4', recipeIngredient: ['3 dl vetemjöl', '6 dl mjölk', '3 ägg'] }
const PAGE = `<!doctype html><html><head>
<script>window.hemligt = 'spårning'</script>
<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
<script type='application/ld+json'>${JSON.stringify(RECIPE)}</script>
</head><body><h1>Pannkakor</h1><p>Personlig kommentar</p></body></html>`
const RECIPE_BLOCK = `<script type="application/ld+json">${JSON.stringify(RECIPE)}</script>`

// ---------------------------------------------------------------------------
// Testservern och DNS
// ---------------------------------------------------------------------------

type Route = (req: IncomingMessage, res: ServerResponse) => void
interface Seen {
  host?: string
  path?: string
  servername?: string | false | null
}

let server: Server
let port = 0
const routes = new Map<string, Route>()
const seen: Seen[] = []

beforeAll(async () => {
  server = createServer({ key: TEST_KEY, cert: TEST_CERT }, (req, res) => {
    seen.push({ host: req.headers.host, path: req.url, servername: (req.socket as TLSSocket).servername })
    const route = routes.get(`${req.headers.host}${req.url}`)
    if (route) route(req, res)
    else res.writeHead(404, { 'content-type': 'text/plain' }).end('Finns inte')
  })
  await new Promise<void>((resolve) => server.listen(0, LOCAL, resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  routes.clear()
  seen.length = 0
})

/** En sida på testservern: `host/sökväg` → svar. */
function page(key: string, body: string | Buffer, headers: Record<string, string> = {}, status = 200) {
  routes.set(key, (_req, res) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers }).end(body)
  })
}
const moved = (key: string, location: string, extra: Record<string, string | string[]> = {}) =>
  routes.set(key, (_req, res) => {
    res.writeHead(302, { location, ...extra }).end()
  })

/** Fejkad DNS. Ett värde som är en lista av listor ger nya svar för varje uppslag (DNS-rebinding). */
function dns(map: Record<string, string[] | string[][]>): LookupFn & { calls: string[] } {
  const calls: string[] = []
  const counts = new Map<string, number>()
  const fn = async (host: string) => {
    calls.push(host)
    const entry = map[host]
    if (!entry) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
    const i = counts.get(host) ?? 0
    counts.set(host, i + 1)
    const addresses = Array.isArray(entry[0]) ? (entry as string[][])[Math.min(i, entry.length - 1)] : (entry as string[])
    return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  }
  return Object.assign(fn, { calls })
}

/** Testvärlden: testservern (127.0.0.1) räknas som publik, allt annat kontrolleras som vanligt. */
const allowAddress = (address: string) => address === LOCAL || isPublicAddress(address)
const local = (lookup: LookupFn, extra: Partial<RecipeFetchOptions> = {}): RecipeFetchOptions => ({
  lookup,
  allowAddress,
  testServer: { port, ca: TEST_CERT },
  ...extra,
})

const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 10))
  return check()
}

// ---------------------------------------------------------------------------

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
    '0.1.2.3',
    '192.0.0.1',
    '192.0.2.10',
    '198.18.0.1',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '239.255.255.250',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:10.1.2.3',
    '::ffff:169.254.169.254',
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
    'fd00:ec2::254',
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

describe('DNS-uppslaget som anslutningen använder', () => {
  /** Anropa en lookup-funktion för node:net som ett löfte. */
  const call = (lookup: ReturnType<typeof guardedLookup>, host: string, options: { all?: boolean; family?: number } = {}) =>
    new Promise<{ address: unknown; family?: number }>((resolve, reject) => {
      lookup(host, options, (err, address, family) => (err ? reject(err) : resolve({ address, family })))
    })

  it('kontrollerar varje svar för sig – ett nytt, internt svar vid nästa uppslag avvisas', async () => {
    const lookup = dns({ 'recept.example': [[PUBLIC_V4], [LOCAL], ['169.254.169.254']] })
    const guarded = guardedLookup(lookup)
    expect(await call(guarded, 'recept.example')).toEqual({ address: PUBLIC_V4, family: 4 })
    await expect(call(guarded, 'recept.example')).rejects.toBeInstanceOf(BlockedAddressError)
    await expect(call(guarded, 'recept.example', { all: true })).rejects.toBeInstanceOf(BlockedAddressError)
    expect(lookup.calls).toHaveLength(3)
  })

  it('ger anslutningen exakt de kontrollerade adresserna (alla eller en familj)', async () => {
    const guarded = guardedLookup(dns({ 'recept.example': [PUBLIC_V4, '2606:4700::1'] }))
    expect(await call(guarded, 'recept.example', { all: true })).toEqual({
      address: [
        { address: PUBLIC_V4, family: 4 },
        { address: '2606:4700::1', family: 6 },
      ],
      family: undefined,
    })
    expect(await call(guarded, 'recept.example', { family: 6 })).toEqual({ address: '2606:4700::1', family: 6 })
  })

  it('avvisar hela svaret om en enda adress är intern, och skräp från DNS', async () => {
    for (const answer of [[PUBLIC_V4, '10.0.0.1'], ['::ffff:127.0.0.1'], ['fe80::1'], ['0.0.0.0'], ['inte-en-adress']]) {
      await expect(resolveCheckedAddresses('recept.example', dns({ 'recept.example': answer })), answer.join()).rejects.toBeInstanceOf(BlockedAddressError)
    }
    await expect(resolveCheckedAddresses('recept.example', dns({ 'recept.example': [] }))).rejects.toMatchObject({ code: 'ENOTFOUND' })
    // IP-adresser slås inte upp.
    const lookup = dns({})
    expect(await resolveCheckedAddresses('[2606:4700::1111]', lookup)).toEqual([{ address: '2606:4700::1111', family: 6 }])
    await expect(resolveCheckedAddresses('169.254.169.254', lookup)).rejects.toBeInstanceOf(BlockedAddressError)
    expect(lookup.calls).toHaveLength(0)
  })
})

describe('fetchRecipeJsonLd', () => {
  const URL_OK = 'https://recept.example/pannkakor'

  it('lyckad hämtning: bara JSON-LD med recept kommer tillbaka – med Host och SNI för värdnamnet', async () => {
    page('recept.example/pannkakor', PAGE)
    const lookup = dns({ 'recept.example': [LOCAL] })
    const res = await fetchRecipeJsonLd(URL_OK, local(lookup))
    expect(res).toEqual({ html: RECIPE_BLOCK })
    expect((res as { html: string }).html).not.toMatch(/hemligt|Personlig|BreadcrumbList/)
    expect(seen).toEqual([{ host: 'recept.example', path: '/pannkakor', servername: 'recept.example' }])
    // Ett enda uppslag – det som anslutningen använder.
    expect(lookup.calls).toEqual(['recept.example'])
  })

  it('DNS-rebinding: adressen som kontrolleras är den som används – inget andra uppslag', async () => {
    page('recept.example/pannkakor', PAGE)
    // Första svaret är "publikt" (testservern), alla senare pekar mot metadatatjänsten.
    const lookup = dns({ 'recept.example': [[LOCAL], ['169.254.169.254']] })
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup))).toEqual({ html: RECIPE_BLOCK })
    expect(lookup.calls).toHaveLength(1)
    expect(seen).toHaveLength(1)
  })

  it('DNS-rebinding: ett internt svar vid anslutningen stoppas även om ett senare svar vore publikt', async () => {
    page('recept.example/pannkakor', PAGE)
    const lookup = dns({ 'recept.example': [['10.0.0.1'], [LOCAL]] })
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup))).toEqual({ error: 'ogiltig' })
    expect(seen).toHaveLength(0)
  })

  it('DNS-rebinding: varje omdirigering slås upp och kontrolleras på nytt', async () => {
    moved('recept.example/pannkakor', 'https://recept.example/igen')
    page('recept.example/igen', PAGE)
    // Samma värd, men andra uppslaget (vid omdirigeringen) pekar mot ett internt nät.
    const lookup = dns({ 'recept.example': [[LOCAL], ['fd00::5']] })
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup))).toEqual({ error: 'ogiltig' })
    expect(lookup.calls).toHaveLength(2)
    expect(seen.map((s) => s.path)).toEqual(['/pannkakor'])
  })

  it('adressen kontrolleras en gång till när anslutningen är uppe – innan förfrågan skickas', async () => {
    page('recept.example/pannkakor', PAGE)
    // Godtas vid uppslaget men inte vid den andra kontrollen (motpartens faktiska adress).
    let checks = 0
    const flaky = (address: string) => (++checks === 1 ? allowAddress(address) : false)
    expect(await fetchRecipeJsonLd(URL_OK, local(dns({ 'recept.example': [LOCAL] }), { allowAddress: flaky }))).toEqual({ error: 'ogiltig' })
    expect(checks).toBe(2)
    expect(seen).toHaveLength(0)
  })

  it('certifikatet kontrolleras: fel namn eller en okänd utfärdare ger "hamtning"', async () => {
    page('annan.example/', PAGE)
    page('recept.example/pannkakor', PAGE)
    const lookup = dns({ 'annan.example': [LOCAL], 'recept.example': [LOCAL] })
    // Certifikatet gäller inte annan.example.
    expect(await fetchRecipeJsonLd('https://annan.example/', local(lookup))).toEqual({ error: 'hamtning' })
    // Utan testcertifikatet som betrott är servern okänd.
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup, { testServer: { port, ca: '' } }))).toEqual({ error: 'hamtning' })
    expect(seen).toHaveLength(0)
  })

  it('privata adresser avvisas innan något hämtas', async () => {
    page('recept.example/pannkakor', PAGE)
    for (const addresses of [['10.0.0.5'], ['127.0.0.2'], ['169.254.169.254'], ['::1'], ['fd00::5'], ['::ffff:10.0.0.1'], [LOCAL, '192.168.0.10']]) {
      expect(await fetchRecipeJsonLd(URL_OK, local(dns({ 'recept.example': addresses }))), addresses.join()).toEqual({ error: 'ogiltig' })
    }
    expect(seen).toHaveLength(0)
  })

  it('IP-adresser direkt i länken kontrolleras utan DNS', async () => {
    const lookup = dns({})
    for (const url of ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data/', 'https://0x7f000001/', 'https://2130706433/', 'https://[::ffff:7f00:1]/']) {
      // Den vanliga kontrollen (inget undantag för testservern).
      expect(await fetchRecipeJsonLd(url, { lookup, testServer: { port, ca: TEST_CERT } }), url).toEqual({ error: 'ogiltig' })
    }
    expect(lookup.calls).toHaveLength(0)
    expect(seen).toHaveLength(0)
  })

  it('http: och andra scheman avvisas', async () => {
    expect(await fetchRecipeJsonLd('http://recept.example/pannkakor', local(dns({})))).toEqual({ error: 'ogiltig' })
  })

  it('omdirigeringar följs högst tre gånger och varje ny adress kontrolleras', async () => {
    const lookup = dns({ 'recept.example': [LOCAL], 'www.recept.example': [LOCAL], 'intern.example': ['10.1.2.3'] })

    moved('recept.example/pannkakor', 'https://www.recept.example/pannkakor')
    page('www.recept.example/pannkakor', PAGE)
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup))).toEqual({ html: RECIPE_BLOCK })
    expect(seen.map((s) => `${s.host}${s.path}`)).toEqual(['recept.example/pannkakor', 'www.recept.example/pannkakor'])
    expect(seen[1].servername).toBe('www.recept.example')

    moved('recept.example/pannkakor', 'http://www.recept.example/pannkakor')
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup))).toEqual({ error: 'ogiltig' })

    seen.length = 0
    moved('recept.example/pannkakor', 'https://intern.example/admin')
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup))).toEqual({ error: 'ogiltig' })
    expect(seen).toHaveLength(1)

    moved('recept.example/pannkakor', 'https://127.0.0.1/')
    expect(await fetchRecipeJsonLd(URL_OK, { ...local(lookup), allowAddress: isPublicAddress })).toEqual({ error: 'ogiltig' })

    moved('recept.example/pannkakor', 'https://recept.example:8443/')
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup))).toEqual({ error: 'ogiltig' })

    seen.length = 0
    moved('recept.example/pannkakor', '/pannkakor?igen=1')
    moved('recept.example/pannkakor?igen=1', URL_OK)
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup))).toEqual({ error: 'hamtning' })
    expect(seen).toHaveLength(4)
  })

  it('cookies från en omdirigering följer med tillbaka till samma värd – men inte till andra', async () => {
    const lookup = dns({ 'recept.example': [LOCAL], 'www.recept.example': [LOCAL] })
    const cookies: Array<string | undefined> = []
    moved('recept.example/pannkakor', '/pannkakor?kakor=ja', { 'set-cookie': ['samtycke=1; Path=/; HttpOnly', 'sprak=sv'] })
    routes.set('recept.example/pannkakor?kakor=ja', (req, res) => {
      cookies.push(req.headers.cookie)
      res.writeHead(302, { location: 'https://www.recept.example/p' }).end()
    })
    routes.set('www.recept.example/p', (req, res) => {
      cookies.push(req.headers.cookie)
      res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE)
    })
    expect(await fetchRecipeJsonLd(URL_OK, local(lookup))).toEqual({ html: RECIPE_BLOCK })
    expect(cookies).toEqual(['samtycke=1; sprak=sv', undefined])
  })

  it('en stor sida läses bara till gränsen – receptet i början hittas, resten hämtas aldrig', async () => {
    const lookup = dns({ 'recept.example': [LOCAL] })
    let closed = 0
    const endless = (prefix: string): Route => (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write(prefix)
      const chunk = Buffer.alloc(64 * 1024, 0x61)
      const pump = () => {
        while (!res.destroyed && res.write(chunk));
      }
      res.on('drain', pump)
      res.on('close', () => closed++)
      pump()
    }
    routes.set('recept.example/stor', endless(PAGE))
    routes.set('recept.example/tom', endless('<html><body>'))
    const maxBytes = 256 * 1024
    expect(await fetchRecipeJsonLd('https://recept.example/stor', local(lookup, { maxBytes }))).toEqual({ html: RECIPE_BLOCK })
    expect(await fetchRecipeJsonLd('https://recept.example/tom', local(lookup, { maxBytes }))).toEqual({ error: 'inget-recept' })
    // Anslutningen stängs – servern slutar skicka.
    expect(await until(() => closed === 2)).toBe(true)
  })

  it('packade sidor (gzip, brotli) packas upp – och en "zip-bomb" stoppas vid gränsen', async () => {
    const lookup = dns({ 'recept.example': [LOCAL] })
    page('recept.example/gzip', gzipSync(PAGE), { 'content-encoding': 'gzip' })
    page('recept.example/br', brotliCompressSync(PAGE), { 'content-encoding': 'br' })
    page('recept.example/bomb', gzipSync(Buffer.alloc(16 * 1024 * 1024, 0x20)), { 'content-encoding': 'gzip' })
    page('recept.example/okand', PAGE, { 'content-encoding': 'lagom-zip' })
    expect(await fetchRecipeJsonLd('https://recept.example/gzip', local(lookup))).toEqual({ html: RECIPE_BLOCK })
    expect(await fetchRecipeJsonLd('https://recept.example/br', local(lookup))).toEqual({ html: RECIPE_BLOCK })
    const started = Date.now()
    expect(await fetchRecipeJsonLd('https://recept.example/bomb', local(lookup))).toEqual({ error: 'inget-recept' })
    expect(Date.now() - started).toBeLessThan(3000)
    expect(await fetchRecipeJsonLd('https://recept.example/okand', local(lookup))).toEqual({ error: 'hamtning' })
  })

  it('tidsgräns: en server som inte svarar eller skickar för långsamt ger "hamtning"', async () => {
    const lookup = dns({ 'recept.example': [LOCAL] })
    routes.set('recept.example/tyst', () => {})
    routes.set('recept.example/seg', (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.write('<html><head>')
    })
    const started = Date.now()
    expect(await fetchRecipeJsonLd('https://recept.example/tyst', local(lookup, { timeoutMs: 100 }))).toEqual({ error: 'hamtning' })
    expect(await fetchRecipeJsonLd('https://recept.example/seg', local(lookup, { timeoutMs: 100 }))).toEqual({ error: 'hamtning' })
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('tidsgränsen gäller även ett DNS-uppslag som aldrig svarar', async () => {
    page('recept.example/pannkakor', PAGE)
    const stuck: LookupFn = () => new Promise(() => {})
    const started = Date.now()
    expect(await fetchRecipeJsonLd(URL_OK, local(stuck, { timeoutMs: 50 }))).toEqual({ error: 'hamtning' })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(seen).toHaveLength(0)
  })

  it('bara HTML; sidor utan recept och fel ger tydliga koder', async () => {
    const lookup = dns({ 'recept.example': [LOCAL] })
    page('recept.example/pdf', '%PDF', { 'content-type': 'application/pdf' })
    page('recept.example/text', '<html><body>Inget recept här</body></html>')
    page('recept.example/xhtml', PAGE, { 'content-type': 'application/xhtml+xml' })
    expect(await fetchRecipeJsonLd('https://recept.example/pdf', local(lookup))).toEqual({ error: 'inget-recept' })
    expect(await fetchRecipeJsonLd('https://recept.example/text', local(lookup))).toEqual({ error: 'inget-recept' })
    expect(await fetchRecipeJsonLd('https://recept.example/xhtml', local(lookup))).toEqual({ html: RECIPE_BLOCK })
    expect(await fetchRecipeJsonLd('https://recept.example/saknas', local(lookup))).toEqual({ error: 'hamtning' })
    expect(await fetchRecipeJsonLd('https://finns-inte.example/', local(lookup))).toEqual({ error: 'hamtning' })
  })

  it('teckenkodningen från servern eller sidans <meta charset> används', async () => {
    const lookup = dns({ 'recept.example': [LOCAL] })
    // "Smör" i ISO-8859-1: ö är en enda byte (0xF6).
    const latin1 = (s: string) => Buffer.from(s, 'latin1')
    page('recept.example/huvud', latin1('<script type="application/ld+json">{"@type":"Recipe","name":"Smör"}</script>'), { 'content-type': 'text/html; charset=iso-8859-1' })
    page('recept.example/meta', latin1('<html><head><meta charset="windows-1252"><script type="application/ld+json">{"@type":"Recipe","name":"Smör"}</script>'), { 'content-type': 'text/html' })
    expect(await fetchRecipeJsonLd('https://recept.example/huvud', local(lookup))).toMatchObject({ html: expect.stringContaining('"name":"Smör"') })
    expect(await fetchRecipeJsonLd('https://recept.example/meta', local(lookup))).toMatchObject({ html: expect.stringContaining('"name":"Smör"') })
  })

  it('en sida med mikrodata i stället för JSON-LD ger ett JSON-LD-block med receptet', async () => {
    page('recept.example/mikro', MICRODATA_PAGE)
    const res = (await fetchRecipeJsonLd('https://recept.example/mikro', local(dns({ 'recept.example': [LOCAL] })))) as { html: string }
    expect(res.html).toMatch(/^<script type="application\/ld\+json">\{.*\}<\/script>$/)
    expect(JSON.parse(res.html.slice(35, -9))).toMatchObject({ '@type': 'Recipe', name: 'Mormors fiskgratäng' })
  })
})

describe('extractRecipeJsonLd', () => {
  it('tar bara block som nämner Recipe', () => {
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

  it('tar linjär tid även på elaka sidor (ingen ReDoS) – 2 MB på bråkdelen av en sekund', () => {
    const size = RECIPE_MAX_BYTES
    const cases = [
      // Många "<script " utan ">" – gav kvadratisk backtracking med det gamla uttrycket.
      '<script '.repeat(size / 8),
      // Många oavslutade ld+json-block.
      '<script type=application/ld+json>'.repeat(Math.floor(size / 34)),
      // Många taggar med ">" långt bort.
      `${'<script a'.repeat(size / 9)}>`,
    ]
    for (const html of cases) {
      const t0 = performance.now()
      expect(extractRecipeJsonLd(html)).toBe('')
      expect(performance.now() - t0).toBeLessThan(500)
    }
    // Ett vanligt skript före receptet och ett recept efter en lång tagg hittas fortfarande.
    const page = `<script>var s = "<script";</script><script data-x="${'a'.repeat(2000)}" type="application/ld+json">{"@type":"Organization"}</script><script type="application/ld+json">{"@type":"Recipe"}</script>`
    expect(extractRecipeJsonLd(page)).toBe('<script type="application/ld+json">{"@type":"Recipe"}</script>')
  })

  it('skickar högst ett fast antal block – resten av en sida med hundratals recept lämnas', () => {
    const block = (i: number) => `<script type="application/ld+json">{"@type":"Recipe","name":"R${i}"}</script>`
    const html = Array.from({ length: 2_000 }, (_, i) => block(i)).join('\n')
    const out = extractRecipeJsonLd(html)
    expect(out.match(/<script /g)).toHaveLength(RECIPE_MAX_JSONLD_BLOCKS)
    expect(out).toContain('"R0"')
    expect(out).not.toContain(`"R${RECIPE_MAX_JSONLD_BLOCKS}"`)
    // Ett par block är som förr.
    expect(extractRecipeJsonLd(`${block(1)}${block(2)}`).match(/<script /g)).toHaveLength(2)
  })
})

/** Påhittad receptsida med mikrodata (som äldre svenska receptsidor) – innehållet är skrivet för testet. */
const MICRODATA_PAGE = `<!doctype html>
<html lang="sv"><head><title>Mormors fiskgratäng | Exempelköket</title>
<script>var data = '<div itemscope itemtype="https://schema.org/Recipe"><span itemprop="name">Fel</span></div>'</script>
</head><body>
<header itemscope itemtype="https://schema.org/Organization"><span itemprop="name">Exempelköket</span></header>
<article itemscope itemtype="http://schema.org/Recipe">
  <div itemprop="author" itemscope itemtype="https://schema.org/Person"><span itemprop="name">Anna Andersson</span></div>
  <h1 itemprop="name">Mormors <em>fisk</em>gratäng</h1>
  <meta itemprop="recipeYield" content="4 portioner">
  <p>Tid: <time itemprop="totalTime" datetime="PT50M">50 minuter</time></p>
  <!-- <li itemprop="recipeIngredient">bortkommenterad</li> -->
  <div itemprop="nutrition" itemscope itemtype="https://schema.org/NutritionInformation"><span itemprop="name">Näring</span><span itemprop="calories">420 kcal</span></div>
  <h2>Ingredienser</h2>
  <ul>
    <li itemprop="recipeIngredient"><span class="mangd">600</span> <span class="enhet">g</span> torskfilé
    <li itemprop="recipeIngredient">2&nbsp;dl vispgrädde
    <li itemprop="recipeIngredient"><b>1</b> msk <a href="/dijon">dijonsenap</a></li>
    <li><span itemprop="ingredients">½ citron</span></li>
    <li itemprop="recipeIngredient">  salt   och
      peppar  </li>
  </ul>
  <div itemprop="ingredients">1 dl riven ost<br>2 msk smör</div>
  <svg><text itemprop="recipeIngredient">ikon</text></svg>
  <p itemprop="recipeInstructions">Sätt ugnen på 200 grader.
</article>
<footer><span itemprop="recipeIngredient">utanför receptet</span></footer>
</body></html>`

describe('extractRecipeMicrodata', () => {
  const parse = (html: string) => {
    const out = extractRecipeMicrodata(html)
    return out ? (JSON.parse(out.slice('<script type="application/ld+json">'.length, -'</script>'.length)) as Record<string, unknown>) : undefined
  }

  it('läser receptets egna egenskaper – inte författarens namn, näringsvärden eller annat utanför', () => {
    expect(parse(MICRODATA_PAGE)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Mormors fiskgratäng',
      recipeYield: '4 portioner',
      totalTime: 'PT50M',
      recipeIngredient: ['600 g torskfilé', '2&nbsp;dl vispgrädde', '1 msk dijonsenap', '½ citron', 'salt och peppar', '1 dl riven ost', '2 msk smör'],
    })
  })

  it('ger inget när sidan saknar recept i mikrodata', () => {
    expect(extractRecipeMicrodata('<div itemscope itemtype="https://schema.org/Person"><span itemprop="name">A</span></div>')).toBe('')
    expect(extractRecipeMicrodata('<p>schema.org/Recipe itemtype</p>')).toBe('')
    expect(extractRecipeMicrodata('<div itemscope itemtype="https://schema.org/Recipe"></div>')).toBe('')
  })

  it('texten kan aldrig avsluta skriptet i appen', () => {
    const out = extractRecipeMicrodata('<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">&lt;/script&gt;<b>x</b> 1 &lt; 2</h1><span itemprop="name" content="</script><img src=x>">')
    expect(out).not.toMatch(/<\/script>.*<\/script>/)
    expect(out.match(/</g)).toHaveLength(2)
  })

  it('en sida som tar slut inne i receptet ger det som hunnit läsas', () => {
    expect(parse('<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Soppa</h1><ul><li itemprop="recipeIngredient">1 l vatten')).toMatchObject({
      name: 'Soppa',
      recipeIngredient: ['1 l vatten'],
    })
  })

  it('läser högst 200 ingredienser, hur många rader sidan än har', () => {
    const start = '<div itemscope itemtype="https://schema.org/Recipe"><h1 itemprop="name">Många</h1>'
    const asItems = parse(`${start}${'<li itemprop="recipeIngredient">1 dl mjölk'.repeat(60_000)}`)
    expect(asItems?.recipeIngredient).toHaveLength(200)
    // Många rader i en och samma egenskap (<br>) räknas på samma sätt.
    const asBreaks = parse(`${start}<div itemprop="recipeIngredient">${'2 ägg<br>'.repeat(50_000)}</div>`)
    const lines = (asBreaks?.recipeIngredient ?? []) as string[]
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length).toBeLessThanOrEqual(200)
  })

  it('hundratusentals olika taggnamn tar linjär tid', () => {
    const start = '<div itemscope itemtype="https://schema.org/Recipe">'
    const names = Array.from({ length: 150_000 }, (_, i) => `<x${i}></x${i}>`).join('')
    const t0 = performance.now()
    extractRecipeMicrodata(`${start}${names}`)
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  it('tar linjär tid även på elaka sidor', () => {
    const start = '<div itemscope itemtype="https://schema.org/Recipe">'
    const cases = [
      `${start}${'<li itemprop="recipeIngredient">'.repeat(60_000)}`,
      `${start}${'</a>'.repeat(500_000)}`,
      `${start}${'<div>'.repeat(300_000)}`,
      `${start}${'<'.repeat(2_000_000)}`,
      `${start}${'<a b="'.repeat(300_000)}`,
      `${'<p itemtype="'.repeat(150_000)}schema.org/Recipe`,
      `${start}<span itemprop="name">${'x'.repeat(2_000_000)}`,
      `${start}${'<span itemprop="recipeIngredient name">'.repeat(256)}${'x<br>'.repeat(400_000)}`,
      `${start}${'<svg>'.repeat(400_000)}`,
    ]
    for (const html of cases) {
      const t0 = performance.now()
      extractRecipeMicrodata(html)
      expect(performance.now() - t0, html.slice(50, 90)).toBeLessThan(1000)
    }
  })
})

describe('POST /api/recipe-fetch', () => {
  function deps(lookup: LookupFn, limiter = new RateLimiter(1000, 60_000)): HandlerDeps & { recipe: RecipeFetchOptions } {
    return { env: { APP_URL: APP }, recipe: local(lookup), now: () => 0, rateLimiter: limiter, log: { info() {}, warn() {}, error() {} } }
  }
  const post = (body: unknown, origin = APP) =>
    new Request(`${APP}/api/recipe-fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) })

  it('svarar { html } med receptets JSON-LD', async () => {
    page('recept.example/p', PAGE)
    const res = await handleRecipeFetch(post({ url: 'https://recept.example/p' }), deps(dns({ 'recept.example': [LOCAL] })))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as { html: string }
    expect(body.html).toContain('Pannkakor')
  })

  it('svenska felmeddelanden: 400 ogiltig, 422 inget recept, 502 hämtningsfel', async () => {
    page('recept.example/tom', '<html></html>')
    const lookup = dns({ 'recept.example': [LOCAL], 'intern.example': ['10.0.0.1'] })
    const bad = await handleRecipeFetch(post({ url: 'http://recept.example/' }), deps(lookup))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ code: 'ogiltig', error: expect.stringContaining('https://') })
    const internal = await handleRecipeFetch(post({ url: 'https://intern.example/' }), deps(lookup))
    expect(internal.status).toBe(400)
    const none = await handleRecipeFetch(post({ url: 'https://recept.example/tom' }), deps(lookup))
    expect(none.status).toBe(422)
    expect(await none.json()).toEqual({ code: 'inget-recept', error: 'Hittade inget recept på sidan.' })
    const down = await handleRecipeFetch(post({ url: 'https://recept.example/nere' }), deps(lookup))
    expect(down.status).toBe(502)
    expect(await down.json()).toMatchObject({ code: 'hamtning' })
    expect((await handleRecipeFetch(post({ inget: 'url' }), deps(lookup))).status).toBe(400)
  })

  it('appens ursprung (även iPhone-appen) godtas, andra webbplatser nekas', async () => {
    page('recept.example/p', PAGE)
    const d = deps(dns({ 'recept.example': [LOCAL] }))
    expect((await handleRecipeFetch(post({ url: 'https://recept.example/p' }, 'capacitor://localhost'), d)).status).toBe(200)
    const evil = await handleRecipeFetch(post({ url: 'https://recept.example/p' }, 'https://ond.example'), d)
    expect(evil.status).toBe(403)
    expect(await evil.json()).toMatchObject({ code: 'fel-ursprung' })
  })

  it('anrop utan Origin (curl, skript) nekas – funktionen är ingen öppen hämtare', async () => {
    page('recept.example/p', PAGE)
    const req = new Request(`${APP}/api/recipe-fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://recept.example/p' }) })
    const res = await handleRecipeFetch(req, deps(dns({ 'recept.example': [LOCAL] })))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'fel-ursprung' })
    expect(seen).toHaveLength(0)
  })

  it('högst 10 anrop per minut och IP-adress', async () => {
    page('recept.example/p', PAGE)
    const d = deps(dns({ 'recept.example': [LOCAL] }), new RateLimiter(10, 60_000))
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await handleRecipeFetch(post({ url: 'https://recept.example/p' }), d)).status)
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(statuses[10]).toBe(429)
  })

  it('bara POST', async () => {
    expect((await handleRecipeFetch(new Request(`${APP}/api/recipe-fetch`, { headers: { Origin: APP } }), deps(dns({})))).status).toBe(405)
  })
})
