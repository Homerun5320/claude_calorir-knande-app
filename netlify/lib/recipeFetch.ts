/**
 * POST /api/recipe-fetch – hämtar en receptsida åt appen och lämnar bara ut sidans receptdata.
 *
 * Kropp: { url } → { html: '<script type="application/ld+json">…</script>…' }
 * Fel: { code, error } där code är 'ogiltig' (400), 'inget-recept' (422) eller 'hamtning' (502).
 *
 * Receptdata är sidans JSON-LD-block som nämner "Recipe" (ICA, Arla, Köket.se, matkassarna …). En sida
 * som i stället märker upp receptet med mikrodata (itemprop="recipeIngredient" …) får ett eget
 * JSON-LD-block med namn, portioner, tider och ingredienser. Resten av sidan skickas aldrig vidare.
 *
 * Funktionen hämtar en adress som användaren har valt, och måste därför skyddas mot att
 * användas för att nå Netlifys interna nät (SSRF):
 * - bara https:, standardporten och inga användarnamn eller lösenord i adressen,
 * - varje anslutning (även efter en omdirigering) görs med node:https och ett eget DNS-uppslag
 *   (`guardedLookup`). Uppslaget kontrollerar ALLA adresser och ger anslutningen just de adresser som
 *   kontrollerades – privata, loopback-, länklokala, CGNAT-, multicast- och reserverade IPv4/IPv6-
 *   adresser (även IPv4-mappade och metadataadressen 169.254.169.254) avvisas. Det finns inget andra
 *   uppslag som en DNS-server kan svara annorlunda på (DNS-rebinding), och adressen kontrolleras en
 *   gång till när anslutningen är uppe, innan något skickas. IP-adresser i länken kontrolleras direkt,
 * - värdnamnet följer med som Host och SNI, och certifikatet kontrolleras mot det (vanlig TLS),
 * - omdirigeringar följs inte automatiskt: högst tre, och varje ny adress kontrolleras på samma sätt,
 * - högst 5 sekunder totalt (även DNS-uppslaget) och högst 2 MB (efter uppackning) läses, bara HTML.
 *   En större sida läses bara till 2 MB – receptdata ligger nästan alltid i början av sidan.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import type { IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { pipeline, type Readable } from 'node:stream'
import { createBrotliDecompress, createUnzip } from 'node:zlib'
import { prepareRequest, type HandlerDeps } from './handlers.ts'
import { RateLimiter, errorResponse, json, readJsonObject } from './http.ts'

export type RecipeFetchError = 'inget-recept' | 'hamtning' | 'ogiltig'
export type RecipeFetchResult = { html: string } | { error: RecipeFetchError }

/** DNS-uppslag som ger alla adresser för ett värdnamn. */
export type LookupFn = (hostname: string) => Promise<ReadonlyArray<{ address: string; family: number }>>

export const RECIPE_TIMEOUT_MS = 5000
export const RECIPE_MAX_BYTES = 2 * 1024 * 1024
export const RECIPE_MAX_REDIRECTS = 3
/** Högsta storlek på svaret till appen (alla JSON-LD-block tillsammans). */
export const RECIPE_MAX_JSONLD_CHARS = 1024 * 1024
const MAX_URL_LENGTH = 2048
/** Stora cookies och säkerhetshuvuden förekommer – Nodes standard (16 KB) räcker inte alltid. */
const MAX_HEADER_BYTES = 64 * 1024

const defaultLookup: LookupFn = (hostname) => dnsLookup(hostname, { all: true, verbatim: true })

// ---------------------------------------------------------------------------
// Adresser
// ---------------------------------------------------------------------------

/**
 * Tolka och kontrollera en adress: bara https:, standardporten, inga inloggningsuppgifter och
 * högst 2 048 tecken. null = ogiltig.
 */
export function validateRecipeUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || text.length > MAX_URL_LENGTH) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  // URL tar bort :443, så en tom port betyder standardporten.
  if (url.port !== '') return null
  if (!url.hostname) return null
  url.hash = ''
  return url
}

function parseIPv4(text: string): number[] | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  const out: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    out.push(n)
  }
  return out
}

function isPublicIPv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false // 0.0.0.0/8 "den här datorn", privat, loopback
  if (a === 100 && b >= 64 && b <= 127) return false // 100.64.0.0/10, operatörs-NAT (CGNAT)
  if (a === 169 && b === 254) return false // 169.254.0.0/16, länklokal (bl.a. molnens metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return false // 172.16.0.0/12
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 88 && c === 99) return false // 192.88.99.0/24
  if (a === 192 && b === 168) return false // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return false // 198.18.0.0/15, testnät
  if (a === 198 && b === 51 && c === 100) return false // 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return false // 203.0.113.0/24
  if (a >= 224) return false // multicast, reserverat och broadcast
  return true
}

/** IPv6-adressen som åtta 16-bitarsgrupper, eller null. */
export function parseIPv6(input: string): number[] | null {
  let s = input.toLowerCase()
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
  const zone = s.indexOf('%')
  if (zone >= 0) s = s.slice(0, zone)
  // En inbäddad IPv4-adress på slutet (::ffff:1.2.3.4) blir två hexgrupper.
  const lastColon = s.lastIndexOf(':')
  if (lastColon >= 0 && s.slice(lastColon + 1).includes('.')) {
    const v4 = parseIPv4(s.slice(lastColon + 1))
    if (!v4) return null
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (halves.length === 2 && fill < 1) return null
  const groups = [...head, ...Array.from({ length: fill }, () => '0'), ...tail]
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.map((g) => parseInt(g, 16))
}

function isPublicIPv6(g: number[]): boolean {
  // IPv4-mappad (::ffff:a.b.c.d): kontrollera IPv4-adressen.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return isPublicIPv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff])
  }
  const [a, b] = g
  // Bara globala unicastadresser (2000::/3). Det utesluter ::, ::1, fc00::/7, fe80::/10,
  // ff00::/8, 64:ff9b::/96, 100::/64 och IPv4-kompatibla adresser.
  if ((a & 0xe000) !== 0x2000) return false
  if (a === 0x2001 && b < 0x0200) return false // 2001::/23, IETF (bl.a. Teredo)
  if (a === 0x2001 && b === 0x0db8) return false // 2001:db8::/32, dokumentation
  if (a === 0x2002) return false // 2002::/16, 6to4 (bär en IPv4-adress)
  if (a === 0x3fff && b < 0x1000) return false // 3fff::/20, dokumentation
  return true
}

/** true om adressen (IPv4 eller IPv6) är en publik adress på internet. */
export function isPublicAddress(address: string): boolean {
  const v4 = parseIPv4(address)
  if (v4) return isPublicIPv4(v4)
  const v6 = parseIPv6(address)
  return v6 ? isPublicIPv6(v6) : false
}

/** Adressen får inte användas (intern, privat, reserverad …) – ger felkoden 'ogiltig'. */
export class BlockedAddressError extends Error {
  readonly code = 'ERR_LAGOM_BLOCKED_ADDRESS'
  constructor(hostname: string) {
    super(`Adressen för ${hostname} är inte publik`)
    this.name = 'BlockedAddressError'
  }
}

function notFound(hostname: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`Hittade ingen adress för ${hostname}`), { code: 'ENOTFOUND', hostname })
}

const bareHost = (hostname: string) => (hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname)

export interface CheckedAddress {
  address: string
  family: 4 | 6
}

/**
 * Slå upp värdnamnet och kontrollera VARJE adress. Kastar `BlockedAddressError` om någon adress inte
 * får användas – en DNS-server som blandar publika och interna adresser avvisas helt.
 */
export async function resolveCheckedAddresses(hostname: string, lookup: LookupFn, allow: (address: string) => boolean = isPublicAddress): Promise<CheckedAddress[]> {
  const host = bareHost(hostname)
  const literal = isIP(host)
  if (literal === 4 || literal === 6) {
    if (!allow(host)) throw new BlockedAddressError(host)
    return [{ address: host, family: literal }]
  }
  const answer = await lookup(host)
  const out: CheckedAddress[] = []
  for (const a of answer) {
    // Familjen räknas fram ur adressen – svaret från DNS litas inte på.
    const family = typeof a?.address === 'string' ? isIP(a.address) : 0
    if ((family !== 4 && family !== 6) || !allow(a.address)) throw new BlockedAddressError(host)
    out.push({ address: a.address, family })
  }
  if (out.length === 0) throw notFound(host)
  return out
}

/**
 * Ett DNS-uppslag för node:net/node:tls (`lookup`-alternativet). Anslutningen går bara till de
 * adresser som det här uppslaget har kontrollerat – det finns inget andra uppslag att lura.
 * Klarar både ett svar (`all: false`) och alla adresser (`all: true`, Happy Eyeballs i Node 20+).
 */
export function guardedLookup(lookup: LookupFn, allow: (address: string) => boolean = isPublicAddress): LookupFunction {
  return (hostname, options, callback) => {
    resolveCheckedAddresses(hostname, lookup, allow).then(
      (addresses) => {
        const wanted = options.family === 4 || options.family === 'IPv4' ? 4 : options.family === 6 || options.family === 'IPv6' ? 6 : 0
        const usable = wanted ? addresses.filter((a) => a.family === wanted) : addresses
        if (usable.length === 0) callback(notFound(hostname), options.all ? [] : '', 0)
        else if (options.all) callback(null, usable.map((a) => ({ address: a.address, family: a.family })))
        else callback(null, usable[0].address, usable[0].family)
      },
      (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error))
        callback(err as NodeJS.ErrnoException, options.all ? [] : '', 0)
      },
    )
  }
}

// ---------------------------------------------------------------------------
// Hämtningen
// ---------------------------------------------------------------------------

interface Transport {
  lookup: LookupFunction
  allow: (address: string) => boolean
  /** Bara i testerna: port och certifikat för en lokal testserver. */
  port?: number
  ca?: string
}

const REQUEST_HEADERS = {
  Accept: 'text/html,application/xhtml+xml;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.5',
  'User-Agent': 'Mozilla/5.0 (compatible; LagomReceptimport/1.0)',
}

/**
 * Öppna en GET-förfrågan och vänta på svarshuvudena. Anslutningen använder bara adresser från
 * `transport.lookup`; efter anslutningen kontrolleras motpartens adress en gång till innan TLS och
 * HTTP-förfrågan går iväg. Host och SNI är länkens värdnamn och certifikatet kontrolleras mot det.
 */
function openPage(url: URL, transport: Transport, signal: AbortSignal, cookie: string | undefined): Promise<IncomingMessage> {
  const host = bareHost(url.hostname)
  const literal = isIP(host) !== 0
  // Node slår inte upp IP-adresser – de kontrolleras här i stället.
  if (literal && !transport.allow(host)) return Promise.reject(new BlockedAddressError(host))
  return new Promise<IncomingMessage>((resolve, reject) => {
    const req = httpsRequest({
      host,
      port: transport.port ?? 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { ...REQUEST_HEADERS, Host: url.host, ...(cookie ? { Cookie: cookie } : {}) },
      // SNI och certifikatkontroll mot värdnamnet (en IP-adress skickas aldrig som SNI).
      servername: literal ? undefined : host,
      rejectUnauthorized: true,
      ca: transport.ca,
      lookup: transport.lookup,
      // En ny anslutning varje gång – ingen återanvändning mellan värdar eller omdirigeringar.
      agent: false,
      signal,
      maxHeaderSize: MAX_HEADER_BYTES,
    })
    req.once('socket', (socket) => {
      socket.once('connect', () => {
        const remote = socket.remoteAddress
        if (!remote || !transport.allow(remote)) socket.destroy(new BlockedAddressError(host))
      })
    })
    req.once('response', resolve)
    // Fel efter svaret (t.ex. när tidsgränsen stänger anslutningen) får aldrig bli ohanterade.
    req.on('error', reject)
    req.end()
  })
}

class BadEncodingError extends Error {}

/** Svarskroppen uppackad (gzip, deflate eller brotli). */
function decodedBody(res: IncomingMessage): Readable {
  const encoding = String(res.headers['content-encoding'] ?? '')
    .trim()
    .toLowerCase()
  if (encoding === '' || encoding === 'identity') return res
  const decoder = encoding === 'gzip' || encoding === 'x-gzip' || encoding === 'deflate' ? createUnzip() : encoding === 'br' ? createBrotliDecompress() : null
  if (!decoder) throw new BadEncodingError(encoding)
  pipeline(res, decoder, () => {})
  return decoder
}

/**
 * Läs högst `maxBytes` (efter uppackning) och avbryt sedan. Även en "zip-bomb" stoppas här – gränsen
 * gäller det uppackade. En större sida tolkas bara så långt den lästs.
 */
async function readUpTo(body: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    const room = maxBytes - size
    if (buf.byteLength >= room) {
      chunks.push(buf.subarray(0, room))
      size += room
      break
    }
    chunks.push(buf)
    size += buf.byteLength
  }
  // Resten av sidan läses aldrig – anslutningen stängs.
  body.destroy()
  return Buffer.concat(chunks, size)
}

/** Teckenkodningen: BOM, sedan serverns Content-Type och sist sidans <meta charset>. */
function decode(bytes: Uint8Array, contentType: string): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  const candidates = [/charset\s*=\s*["']?([\w:.-]+)/i.exec(contentType)?.[1], sniffMetaCharset(bytes)]
  for (const charset of candidates) {
    if (!charset) continue
    try {
      return new TextDecoder(charset).decode(bytes)
    } catch {
      /* okänd teckenkodning – prova nästa */
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}

/** <meta charset="…"> eller <meta http-equiv="Content-Type" content="…; charset=…"> i början av sidan. */
function sniffMetaCharset(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  return /<meta\b[^>]{0,200}?charset\s*=\s*["']?([\w:.-]+)/i.exec(head)?.[1]
}

/** Ett löfte som avvisas när signalen avbryts (tidsgränsen). */
function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason)
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

/**
 * Cookies från omdirigeringarna, bara under den här hämtningen och bara till samma värd (vissa sidor
 * sätter en cookie och skickar tillbaka besökaren). Ingenting sparas efteråt.
 */
class RedirectCookies {
  private readonly byHost = new Map<string, Map<string, string>>()

  store(hostname: string, setCookie: string[] | undefined): void {
    for (const line of setCookie ?? []) {
      const pair = line.split(';', 1)[0].trim()
      const eq = pair.indexOf('=')
      if (eq <= 0 || pair.length > 1024) continue
      const jar = this.byHost.get(hostname) ?? new Map<string, string>()
      if (jar.size >= 20) continue
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
      this.byHost.set(hostname, jar)
    }
  }

  header(hostname: string): string | undefined {
    const jar = this.byHost.get(hostname)
    if (!jar || jar.size === 0) return undefined
    const value = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    return /^[\x20-\x7e]*$/.test(value) && value.length <= 4096 ? value : undefined
  }
}

export interface RecipeFetchOptions {
  lookup?: LookupFn
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** Bara i testerna: vilka adresser som godtas (standard: bara publika). */
  allowAddress?: (address: string) => boolean
  /** Bara i testerna: ansluta till en lokal testserver (port) och lita på dess certifikat (ca). */
  testServer?: { port: number; ca: string }
}

/** Hämta en receptsida och returnera dess receptdata (se filens inledning för skydden). */
export async function fetchRecipeJsonLd(rawUrl: unknown, opts: RecipeFetchOptions = {}): Promise<RecipeFetchResult> {
  let url = validateRecipeUrl(rawUrl)
  if (!url) return { error: 'ogiltig' }
  const allow = opts.allowAddress ?? isPublicAddress
  const transport: Transport = {
    lookup: guardedLookup(opts.lookup ?? defaultLookup, allow),
    allow,
    port: opts.testServer?.port,
    ca: opts.testServer?.ca,
  }
  const maxBytes = opts.maxBytes ?? RECIPE_MAX_BYTES
  const maxRedirects = opts.maxRedirects ?? RECIPE_MAX_REDIRECTS
  const signal = AbortSignal.timeout(opts.timeoutMs ?? RECIPE_TIMEOUT_MS)
  const cookies = new RedirectCookies()
  // Ett gemensamt löfte för tidsgränsen (en lyssnare, i stället för en per steg).
  const timedOut = whenAborted(signal)
  timedOut.catch(() => {})
  let current: IncomingMessage | undefined

  try {
    for (let redirects = 0; ; redirects++) {
      // Tidsgränsen gäller även DNS-uppslaget och anslutningen.
      const res = await Promise.race([openPage(url, transport, signal, cookies.header(url.hostname)), timedOut])
      current = res
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && status !== 304) {
        cookies.store(url.hostname, res.headers['set-cookie'])
        const location = res.headers.location
        res.destroy()
        if (!location || redirects >= maxRedirects) return { error: 'hamtning' }
        let next: URL | null
        try {
          next = validateRecipeUrl(new URL(location, url).href)
        } catch {
          next = null
        }
        if (!next) return { error: 'ogiltig' }
        url = next
        continue
      }
      if (status < 200 || status >= 300) return { error: 'hamtning' }
      const type = String(res.headers['content-type'] ?? '')
      if (!/^\s*(?:text\/html|application\/xhtml\+xml)\b/i.test(type)) return { error: 'inget-recept' }
      // Tidsgränsen gäller även en sida som skickas långsamt.
      const bytes = await Promise.race([readUpTo(decodedBody(res), maxBytes), timedOut])
      const html = recipeData(decode(bytes, type))
      return html ? { html } : { error: 'inget-recept' }
    }
  } catch (error) {
    // En intern adress (även bakom en omdirigering eller ett nytt DNS-svar) ger 'ogiltig';
    // nätverksfel, TLS-fel (fel certifikat), okänd packning och tidsgränsen ger 'hamtning'.
    return { error: error instanceof BlockedAddressError ? 'ogiltig' : 'hamtning' }
  } finally {
    // Stäng anslutningen – resten av sidan behövs inte.
    current?.destroy()
  }
}

/** Receptdata i sidan: JSON-LD-blocken, och ett block byggt av mikrodata om sidan har sådan. */
export function recipeData(html: string): string {
  const ld = extractRecipeJsonLd(html)
  const md = extractRecipeMicrodata(html)
  if (!md || ld.length + md.length > RECIPE_MAX_JSONLD_CHARS) return ld
  return ld ? `${ld}\n${md}` : md
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

/**
 * Plocka ut sidans JSON-LD-block som nämner "Recipe". Returnerar dem som
 * <script type="application/ld+json">…</script>, eller '' om det inte finns något recept.
 */
export function extractRecipeJsonLd(html: string): string {
  // En linjär skanner i stället för ett enda reguljärt uttryck: ett uttryck med [^>]* före
  // type-attributet backar kvadratiskt på sidor med många "<script" utan ">" (ReDoS) – och
  // tidsgränsen stoppar inte synkron kod. Varje tecken läses här högst ett par gånger.
  // Blocket slutar där webbläsaren avslutar det: vid första "</script" följt av mellanslag, "/" eller
  // ">" (även "</script foo>"). Då kan innehållet aldrig avsluta skriptet i förtid i appen.
  const open = /<script\b/gi
  const close = /<\/script[\s/>]/gi
  const blocks: string[] = []
  let total = 0
  let pos = 0
  for (;;) {
    open.lastIndex = pos
    const start = open.exec(html)?.index
    if (start === undefined) break
    const end = html.indexOf('>', start)
    if (end < 0) break
    pos = end + 1
    // Orimligt långa taggar hoppas över – då blir uttrycket nedan alltid billigt.
    if (end - start > MAX_SCRIPT_TAG_CHARS) continue
    if (!LD_JSON_TYPE.test(html.slice(start, end))) continue
    close.lastIndex = end + 1
    const stop = close.exec(html)?.index
    if (stop === undefined) break
    pos = stop + '</script'.length
    const content = html.slice(end + 1, stop).trim()
    if (!content || !/recipe/i.test(content)) continue
    if (total + content.length > RECIPE_MAX_JSONLD_CHARS) break
    total += content.length
    blocks.push(`<script type="application/ld+json">${content}</script>`)
  }
  return blocks.join('\n')
}

/** Högsta längd på en <script …>-tagg som undersöks (attributen, inte innehållet). */
const MAX_SCRIPT_TAG_CHARS = 1024
const LD_JSON_TYPE = /\btype\s*=\s*["']?application\/ld\+json/i

// ---------------------------------------------------------------------------
// Mikrodata (itemscope itemtype="https://schema.org/Recipe")
// ---------------------------------------------------------------------------

/** Egenskaperna som läses, med namnen i JSON-LD ("ingredients" och "yield" är äldre namn). */
const MICRODATA_PROPS: ReadonlyMap<string, MicrodataKey> = new Map([
  ['name', 'name'],
  ['recipeyield', 'recipeYield'],
  ['yield', 'recipeYield'],
  ['totaltime', 'totalTime'],
  ['preptime', 'prepTime'],
  ['cooktime', 'cookTime'],
  ['recipeingredient', 'recipeIngredient'],
  ['ingredients', 'recipeIngredient'],
  ['url', 'url'],
])
type MicrodataKey = 'name' | 'recipeYield' | 'totalTime' | 'prepTime' | 'cookTime' | 'recipeIngredient' | 'url'

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
/** Element vars innehåll inte är vanlig text (hoppas över i sin helhet). */
const SKIPPED_ELEMENTS = new Set(['script', 'style', 'template', 'textarea', 'title', 'noscript', 'svg', 'math', 'iframe', 'select'])
/** Element som avslutar ett öppet <p> (förenklat, som webbläsarens parser). */
const CLOSES_P = new Set(['p', 'div', 'ul', 'ol', 'dl', 'table', 'section', 'article', 'aside', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'form', 'figure', 'hr'])
const MAX_TAG_CHARS = 4096
const MAX_DEPTH = 256
const MAX_VALUE_CHARS = 1000
const MAX_INGREDIENTS = 200
/** Högst så många egenskaper läses samtidigt (nästlade itemprop) – håller skannern linjär. */
const MAX_OPEN_CAPTURES = 8
/** Sluttaggarna för SKIPPED_ELEMENTS (skapas en gång). */
const SKIP_CLOSE = new Map<string, RegExp>()

interface Capture {
  keys: MicrodataKey[]
  parts: string[]
  size: number
}

interface Frame {
  name: string
  scope: boolean
  capture?: Capture
}

function parseAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g
  // Hoppa över taggnamnet.
  re.lastIndex = /^<\/?[a-zA-Z][^\s/>]*/.exec(tag)?.[0].length ?? 1
  for (let m = re.exec(tag); m; m = re.exec(tag)) {
    const name = m[1].toLowerCase()
    if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

const isRecipeItemtype = (value: string | undefined) => !!value && value.split(/\s+/).some((t) => /^https?:\/\/schema\.org\/Recipe\/?$/i.test(t))

/**
 * Receptet i sidans mikrodata som ett JSON-LD-block, eller ''. Läser det första elementet med
 * itemscope och itemtype schema.org/Recipe: name, recipeYield, totalTime, prepTime, cookTime, url och
 * recipeIngredient (även de äldre namnen ingredients och yield). Egenskaper i nästlade objekt
 * (författare, näringsvärden, betyg) räknas inte. En linjär skanner utan DOM: varje tecken läses
 * högst ett par gånger, och taggar som inte stängs avslutas som i en webbläsare (li, p, td …).
 */
export function extractRecipeMicrodata(html: string): string {
  if (!/itemtype/i.test(html) || !/schema\.org\/Recipe/i.test(html)) return ''
  const n = html.length
  const stack: Frame[] = []
  const openNames = new Map<string, number>()
  const captures: Capture[] = []
  const values: Partial<Record<Exclude<MicrodataKey, 'recipeIngredient'>, string>> = {}
  const ingredients: string[] = []
  /** Antal öppna nästlade itemscope inuti receptet. */
  let nested = 0
  let inRecipe = false
  let done = false
  let gtCache = -1
  let pos = 0

  const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_VALUE_CHARS)
  const setValue = (keys: MicrodataKey[], raw: string) => {
    for (const key of keys) {
      if (key === 'recipeIngredient') {
        for (const line of raw.split('\n')) {
          const text = oneLine(line)
          if (text && ingredients.length < MAX_INGREDIENTS) ingredients.push(text)
        }
      } else if (values[key] === undefined) {
        const text = oneLine(raw)
        if (text) values[key] = text
      }
    }
  }
  /** Text läggs till med radbrytningar som mellanslag – bara <br> ger en ny rad (en ny ingrediens). */
  const addText = (raw: string) => {
    const text = raw === '\n' ? raw : raw.replace(/\s+/g, ' ')
    for (const c of captures) {
      if (c.size >= MAX_VALUE_CHARS * 4) continue
      c.parts.push(text)
      c.size += text.length
    }
  }
  const pop = () => {
    const frame = stack.pop()
    if (!frame) return
    openNames.set(frame.name, (openNames.get(frame.name) ?? 1) - 1)
    if (frame.scope && stack.length > 0) nested--
    if (frame.capture) {
      captures.splice(captures.indexOf(frame.capture), 1)
      setValue(frame.capture.keys, frame.capture.parts.join(''))
    }
    if (stack.length === 0) done = true
  }
  /** Stäng element uppifrån till och med det översta med namnet – men inte förbi `stopAt`. */
  const closeTo = (name: string, stopAt: ReadonlySet<string> = EMPTY_SET): boolean => {
    if (!(openNames.get(name) ?? 0)) return false
    for (let i = stack.length - 1; i >= 1; i--) {
      if (stack[i].name === name) {
        while (stack.length > i) pop()
        return true
      }
      if (stopAt.has(stack[i].name)) return false
    }
    return false
  }

  while (pos < n && !done) {
    const lt = html.indexOf('<', pos)
    if (lt < 0) {
      if (inRecipe && captures.length) addText(html.slice(pos))
      break
    }
    if (lt > pos && inRecipe && captures.length) addText(html.slice(pos, lt))
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      pos = end < 0 ? n : end + 3
      continue
    }
    const closing = html.charCodeAt(lt + 1) === 47 // "/"
    const nameMatch = TAG_NAME.exec(html.slice(lt + (closing ? 2 : 1), lt + (closing ? 2 : 1) + 64))
    if (!nameMatch) {
      // "<!doctype", "<?xml" eller ett ensamt "<" i texten.
      if (html.charCodeAt(lt + 1) === 33 || html.charCodeAt(lt + 1) === 63) {
        const end = html.indexOf('>', lt)
        pos = end < 0 ? n : end + 1
      } else {
        if (inRecipe && captures.length) addText('<')
        pos = lt + 1
      }
      continue
    }
    if (gtCache < lt) gtCache = html.indexOf('>', lt)
    if (gtCache < 0) break
    const gt = gtCache
    pos = gt + 1
    const name = nameMatch[0].toLowerCase()
    const tag = gt - lt <= MAX_TAG_CHARS ? html.slice(lt, gt + 1) : `<${closing ? '/' : ''}${name}>`

    if (closing) {
      if (!inRecipe) continue
      if (name === 'br') {
        addText('\n')
        continue
      }
      if (stack.length > 0 && stack[0].name === name && (openNames.get(name) ?? 0) === 1) {
        while (stack.length > 0) pop()
        continue
      }
      closeTo(name)
      if (captures.length && !INLINE.has(name)) addText(' ')
      continue
    }

    if (SKIPPED_ELEMENTS.has(name) && !tag.endsWith('/>')) {
      const close = SKIP_CLOSE.get(name) ?? new RegExp(`</${name}[\\s/>]`, 'gi')
      SKIP_CLOSE.set(name, close)
      close.lastIndex = pos
      const m = close.exec(html)
      if (!m) break
      pos = m.index + m[0].length
      continue
    }

    const hasItem = tag.length > 8 && /\bitem(?:scope|prop|type)\b/i.test(tag)
    const attrs = hasItem ? parseAttributes(tag) : undefined

    if (!inRecipe) {
      if (attrs?.has('itemscope') && isRecipeItemtype(attrs.get('itemtype')) && !VOID_ELEMENTS.has(name)) {
        inRecipe = true
        stack.push({ name, scope: true })
        openNames.set(name, 1)
      }
      continue
    }

    // Underförstådda sluttaggar: ett nytt <li> avslutar det förra osv.
    if (name === 'li') closeTo('li', LIST_BOUNDARY)
    else if (name === 'dt' || name === 'dd') {
      if (!closeTo('dd', DL_BOUNDARY)) closeTo('dt', DL_BOUNDARY)
    } else if (name === 'tr') closeTo('tr', TABLE_BOUNDARY)
    else if (name === 'td' || name === 'th') {
      if (!closeTo('td', ROW_BOUNDARY)) closeTo('th', ROW_BOUNDARY)
    }
    else if (name === 'option') closeTo('option')
    if (CLOSES_P.has(name) && stack.length > 1 && stack[stack.length - 1].name === 'p') pop()

    if (name === 'br') {
      addText('\n')
      continue
    }
    if (captures.length && !INLINE.has(name)) addText(' ')

    const scope = !!attrs?.has('itemscope')
    const props = nested === 0 && attrs?.get('itemprop')
    let capture: Capture | undefined
    if (attrs && props && !scope) {
      const keys = [...new Set(props.split(/\s+/).map((p) => MICRODATA_PROPS.get(p.toLowerCase())).filter((k): k is MicrodataKey => !!k))]
      if (keys.length > 0) {
        const direct = attributeValue(name, attrs, keys)
        if (direct !== undefined) setValue(keys, direct)
        else if (!VOID_ELEMENTS.has(name) && captures.length < MAX_OPEN_CAPTURES) capture = { keys, parts: [], size: 0 }
      }
    }
    if (VOID_ELEMENTS.has(name) || tag.endsWith('/>') || stack.length >= MAX_DEPTH) continue
    stack.push({ name, scope, capture })
    openNames.set(name, (openNames.get(name) ?? 0) + 1)
    if (scope) nested++
    if (capture) captures.push(capture)
  }
  // Sidan tog slut (eller trunkerades) inne i receptet: ta med det som hittills lästs.
  while (stack.length > 0) pop()

  if (!values.name && ingredients.length === 0) return ''
  const recipe: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'Recipe', ...values }
  if (ingredients.length > 0) recipe.recipeIngredient = ingredients
  // "<" skrivs som \u003c så att ingenting i texten kan avsluta skriptet i appen.
  return `<script type="application/ld+json">${JSON.stringify(recipe).replace(/</g, '\\u003c')}</script>`
}

const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9:-]*/
const EMPTY_SET: ReadonlySet<string> = new Set()
const LIST_BOUNDARY: ReadonlySet<string> = new Set(['ul', 'ol', 'menu'])
const DL_BOUNDARY: ReadonlySet<string> = new Set(['dl'])
const TABLE_BOUNDARY: ReadonlySet<string> = new Set(['table', 'tbody', 'thead', 'tfoot'])
const ROW_BOUNDARY: ReadonlySet<string> = new Set(['tr', 'table'])
/** Element i löptext som inte skiljer ord åt ("<b>2</b> dl"). */
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'font'])

/** Värdet i ett attribut (meta content, time datetime, länkens href …) – eller undefined för elementets text. */
function attributeValue(name: string, attrs: Map<string, string>, keys: MicrodataKey[]): string | undefined {
  if (attrs.has('content')) return attrs.get('content')
  if (name === 'meta') return ''
  if (keys.includes('url') && (name === 'a' || name === 'link' || name === 'area')) return attrs.get('href') ?? ''
  if (name === 'link') return attrs.get('href') ?? ''
  if (name === 'time' && attrs.has('datetime')) return attrs.get('datetime')
  if ((name === 'data' || name === 'meter') && attrs.has('value')) return attrs.get('value')
  if (name === 'img' || name === 'source' || name === 'audio' || name === 'video' || name === 'embed' || name === 'iframe') return attrs.get('src') ?? ''
  return undefined
}

// ---------------------------------------------------------------------------
// Serverfunktionen
// ---------------------------------------------------------------------------

const recipeLimiter = new RateLimiter(10, 60_000)
const MAX_BODY_BYTES = 4 * 1024

export const RECIPE_ERRORS: Record<RecipeFetchError, { status: number; message: string }> = {
  ogiltig: { status: 400, message: 'Länken går inte att hämta. Klistra in hela adressen till receptet – den börjar med https://' },
  'inget-recept': { status: 422, message: 'Hittade inget recept på sidan.' },
  hamtning: { status: 502, message: 'Kunde inte hämta sidan. Kontrollera länken och försök igen om en stund.' },
}

/**
 * `recipe` används bara i testerna (fejkad DNS och en lokal testserver). `deps.fetch` används aldrig
 * här – sidor hämtas bara med den skyddade anslutningen ovan.
 */
export type RecipeFetchDeps = HandlerDeps & { recipe?: RecipeFetchOptions }

export async function handleRecipeFetch(req: Request, deps: RecipeFetchDeps): Promise<Response> {
  const prep = prepareRequest(req, deps, {
    limiter: recipeLimiter,
    needs: [],
    notConfigured: RECIPE_ERRORS.hamtning.message,
    forbidden: 'Den här webbplatsen får inte använda Lagoms receptimport.',
    // Bara appen (webben eller den inbyggda appen) får använda funktionen – aldrig som öppen
    // hämtare för skript och curl utan Origin.
    requireOrigin: true,
  })
  if (!prep.ok) return prep.response
  const { origin, log } = prep
  const h = origin.headers

  const body = await readJsonObject(req, MAX_BODY_BYTES, h)
  if (!body.ok) return body.response
  const result = await fetchRecipeJsonLd(body.value.url, deps.recipe)
  if ('html' in result) return json(200, { html: result.html }, h)
  const e = RECIPE_ERRORS[result.error]
  // Bara värdnamnet loggas – aldrig hela adressen (den kan innehålla personliga parametrar).
  if (result.error !== 'inget-recept') log.info('Receptsidan kunde inte hämtas', { orsak: result.error, vard: hostOf(body.value.url) })
  return errorResponse(e.status, result.error, e.message, h)
}

function hostOf(value: unknown): string | undefined {
  try {
    return typeof value === 'string' ? new URL(value).hostname : undefined
  } catch {
    return undefined
  }
}
