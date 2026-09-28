/**
 * POST /api/recipe-fetch – hämtar en receptsida åt appen och lämnar bara ut sidans JSON-LD.
 *
 * Kropp: { url } → { html: '<script type="application/ld+json">…</script>…' }
 * Fel: { code, error } där code är 'ogiltig' (400), 'inget-recept' (422) eller 'hamtning' (502).
 *
 * Funktionen hämtar en adress som användaren har valt, och måste därför skyddas mot att
 * användas för att nå Netlifys interna nät (SSRF):
 * - bara https:, standardporten och inga användarnamn eller lösenord i adressen,
 * - värdnamnet slås upp i DNS och ALLA adresser måste vara publika – privata, loopback-,
 *   länklokala och reserverade IPv4/IPv6-adresser avvisas,
 * - omdirigeringar följs inte automatiskt: högst tre, och varje ny adress kontrolleras på samma sätt,
 * - högst 5 sekunder totalt (även DNS-uppslaget) och högst 2 MB, bara text/html,
 * - svaret innehåller bara JSON-LD-block som nämner "Recipe" – aldrig resten av sidan.
 * Kvarstående risk: fetch slår upp namnet igen när den ansluter. En DNS-server som byter svar
 * mellan uppslagen kan därför i teorin peka om anslutningen. Porten är ändå alltid 443, och TLS
 * kräver ett giltigt certifikat för just det värdnamnet – en intern tjänst har inget sådant – och
 * svaret måste vara en HTML-sida med recept.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { prepareRequest, type HandlerDeps } from './handlers.ts'
import { RateLimiter, errorResponse, json, readJsonObject } from './http.ts'
import type { FetchLike } from './stripe.ts'

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
  if (a === 0 || a === 10 || a === 127) return false // "den här datorn", privat, loopback
  if (a === 100 && b >= 64 && b <= 127) return false // 100.64.0.0/10, operatörs-NAT
  if (a === 169 && b === 254) return false // 169.254.0.0/16, länklokal (bl.a. molnens metadata)
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

type HostCheck = 'ok' | 'ogiltig' | 'hamtning'

/** Slå upp värdnamnet och kontrollera att alla adresser är publika. */
async function checkHost(hostname: string, lookup: LookupFn): Promise<HostCheck> {
  const bare = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  if (isIP(bare)) return isPublicAddress(bare) ? 'ok' : 'ogiltig'
  let addresses: ReadonlyArray<{ address: string }>
  try {
    addresses = await lookup(bare)
  } catch {
    return 'hamtning'
  }
  if (addresses.length === 0) return 'hamtning'
  return addresses.every((a) => isPublicAddress(a.address)) ? 'ok' : 'ogiltig'
}

// ---------------------------------------------------------------------------
// Sidan
// ---------------------------------------------------------------------------

/** Läs kroppen men avbryt när den blir större än `maxBytes`. null = för stor. */
async function readLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1]
  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes)
    } catch {
      /* okänd teckenkodning – prova UTF-8 */
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}

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

/** Ett löfte som avvisas när signalen avbryts (tidsgränsen). */
function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal.aborted) reject(signal.reason)
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

async function discard(res: Response): Promise<void> {
  await res.body?.cancel().catch(() => {})
}

export interface RecipeFetchOptions {
  fetch?: FetchLike
  lookup?: LookupFn
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
}

/** Hämta en receptsida och returnera dess JSON-LD (se filens inledning för skydden). */
export async function fetchRecipeJsonLd(rawUrl: unknown, opts: RecipeFetchOptions = {}): Promise<RecipeFetchResult> {
  let url = validateRecipeUrl(rawUrl)
  if (!url) return { error: 'ogiltig' }
  const doFetch = opts.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init))
  const lookup = opts.lookup ?? defaultLookup
  const maxBytes = opts.maxBytes ?? RECIPE_MAX_BYTES
  const maxRedirects = opts.maxRedirects ?? RECIPE_MAX_REDIRECTS
  const signal = AbortSignal.timeout(opts.timeoutMs ?? RECIPE_TIMEOUT_MS)

  try {
    for (let redirects = 0; ; redirects++) {
      // Tidsgränsen gäller även DNS-uppslaget.
      const host = await Promise.race([checkHost(url.hostname, lookup), whenAborted(signal)])
      if (host !== 'ok') return { error: host }
      if (signal.aborted) return { error: 'hamtning' }
      const res = await doFetch(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9',
          'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.5',
          'User-Agent': 'Mozilla/5.0 (compatible; LagomReceptimport/1.0)',
        },
      })
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        await discard(res)
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
      if (!res.ok) {
        await discard(res)
        return { error: 'hamtning' }
      }
      const type = res.headers.get('content-type') ?? ''
      if (!/^\s*text\/html\b/i.test(type)) {
        await discard(res)
        return { error: 'inget-recept' }
      }
      const declared = Number(res.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > maxBytes) {
        await discard(res)
        return { error: 'hamtning' }
      }
      // Tidsgränsen gäller även en sida som skickas långsamt.
      const bytes = await Promise.race([readLimited(res.body, maxBytes), whenAborted(signal)])
      if (!bytes) return { error: 'hamtning' }
      const html = extractRecipeJsonLd(decode(bytes, type))
      return html ? { html } : { error: 'inget-recept' }
    }
  } catch {
    // Nätverksfel, TLS-fel eller tidsgränsen.
    return { error: 'hamtning' }
  }
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

export type RecipeFetchDeps = HandlerDeps & { lookup?: LookupFn }

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
  const result = await fetchRecipeJsonLd(body.value.url, { fetch: deps.fetch, lookup: deps.lookup })
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
