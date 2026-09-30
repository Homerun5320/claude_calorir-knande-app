/**
 * Lokal fellogg – de senaste felen sparas på enheten, så att användaren själv kan skicka en
 * felrapport till supporten (Om Lagom → Felsökning). Inget skickas automatiskt.
 *
 * - Ringbuffert med högst 20 poster i localStorage (`lagom-error-log`).
 * - Inga livsmedel eller värden sparas: siffror i felmeddelandet blir "#" och citerad text blir
 *   ”…”. Sidan sparas utan query och utan id:n/datum ("/livsmedel/…/redigera").
 * - Stackspårningen kortas till 800 tecken (felmeddelandet i den rensas på samma sätt).
 * - Fungerar tyst utan lagring (privat läge, blockerad eller full lagring) och kastar aldrig –
 *   funktionerna anropas från felhanterare.
 */
import { RUNTIME } from '../config/platform'

export interface ErrorLogEntry {
  /** Tidpunkt (ISO 8601). */
  at: string
  /** Rensat felmeddelande, ev. med sammanhang först ("route: TypeError: …"). */
  message: string
  /** Rensad och kortad stackspårning. */
  stack?: string
  /** Sidan där felet inträffade, t.ex. "/dagbok/…". */
  route: string
  version: string
  platform: string
}

export const ERROR_LOG_KEY = 'lagom-error-log'
/** Högst så många poster sparas – de äldsta försvinner först. */
export const ERROR_LOG_MAX = 20
export const STACK_MAX_CHARS = 800
export const MESSAGE_MAX_CHARS = 300
/** Samma fel på samma sida inom den här tiden sparas bara en gång (t.ex. vid en renderingsslinga). */
const REPEAT_WINDOW_MS = 2000

const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'
const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'lokal'

/**
 * Brus som inte säger något om Lagom: webbläsarens ResizeObserver-varning och "Script error."
 * (fel från andra ursprung, t.ex. tillägg, utan detaljer).
 */
const IGNORED = /ResizeObserver loop|^Script error\.?$/i

/** Citerad text i alla vanliga citattecken. Enkla citattecken räknas bara efter ett icke-ord ("can't" rörs inte). */
const QUOTED = /"[^"\n]*"|“[^”\n]*”|”[^”\n]*”|„[^”“\n]*[”“]|«[^»\n]*»|‘[^’\n]*’|`[^`\n]*`|(?<![\p{L}\p{N}])'[^'\n]*'/gu
/** Tal, även med decimaler eller tusentalsavgränsare ("1,5", "2026-09-20" blir "#-#-#"). */
const NUMBERS = /\d+(?:[.,:  ]\d+)*/g

/** Ta bort sådant som kan avslöja vad användaren har ätit eller loggat. */
export function sanitizeErrorText(text: string): string {
  return text.replace(QUOTED, '”…”').replace(NUMBERS, '#')
}

/** Ett sidsegment som är en vanlig sökvägsdel (inte ett id, ett datum eller ett namn). */
const PLAIN_SEGMENT = /^[a-zåäö]+(?:-[a-zåäö]+)*$/

/**
 * Sidan från adressens hash-del, utan query och utan id:n: "#/livsmedel/lagom:gurka?x=1" →
 * "/livsmedel/…". Tom hash blir "/".
 */
export function routeFromHash(hash: string): string {
  const path = hash.replace(/^#/, '').split('?')[0] || '/'
  const segments = path.split('/').map((seg, i) => {
    if (i === 0 || seg === '') return seg
    return PLAIN_SEGMENT.test(seg) && seg.length <= 24 ? seg : '…'
  })
  const route = segments.join('/')
  return route.startsWith('/') ? route : `/${route}`
}

function currentRoute(): string {
  try {
    return routeFromHash(typeof location === 'undefined' ? '' : location.hash)
  } catch {
    return '/'
  }
}

function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    const message = error.message ? `${error.name}: ${error.message}` : error.name
    return { message, stack: typeof error.stack === 'string' ? error.stack : undefined }
  }
  if (typeof error === 'string') return { message: error }
  if (error && typeof error === 'object') {
    const e = error as { name?: unknown; message?: unknown; stack?: unknown }
    if (typeof e.message === 'string') {
      const message = typeof e.name === 'string' && e.name ? `${e.name}: ${e.message}` : e.message
      return { message, stack: typeof e.stack === 'string' ? e.stack : undefined }
    }
  }
  if (error === undefined || error === null) return { message: 'Okänt fel' }
  try {
    return { message: String(error) }
  } catch {
    return { message: 'Okänt fel' }
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Rensa stacken: meddelandet på första raden (V8 upprepar det där) rensas som meddelandet, och
 * texten kortas. Rader och kolumner i filnamnen behålls – de behövs för felsökningen.
 */
function cleanStack(stack: string, rawMessage: string, cleanMessage: string): string {
  let out = rawMessage ? stack.split(rawMessage).join(cleanMessage) : stack
  // Citerad text kan finnas kvar i andra rader (t.ex. när meddelandet var flerradigt).
  out = out.replace(QUOTED, '”…”')
  return truncate(out, STACK_MAX_CHARS)
}

function isEntry(value: unknown): value is ErrorLogEntry {
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  return typeof e.at === 'string' && typeof e.message === 'string' && typeof e.route === 'string'
}

/** De sparade felen, äldst först. Tom lista om inget finns eller om lagringen inte går att läsa. */
export function readErrorLog(): ErrorLogEntry[] {
  try {
    const raw = localStorage.getItem(ERROR_LOG_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).map((e) => ({
      at: e.at,
      message: e.message,
      ...(typeof e.stack === 'string' ? { stack: e.stack } : {}),
      route: e.route,
      version: typeof e.version === 'string' ? e.version : '?',
      platform: typeof e.platform === 'string' ? e.platform : '?',
    }))
  } catch {
    return []
  }
}

/**
 * Spara ett fel i felloggen. `context` berättar var felet fångades (t.ex. 'route', 'global',
 * 'promise'). Kastar aldrig.
 */
export function logError(error: unknown, context?: string): void {
  try {
    const { message: rawMessage, stack } = describeError(error)
    if (IGNORED.test(rawMessage.trim())) return
    const cleanMessage = truncate(sanitizeErrorText(rawMessage), MESSAGE_MAX_CHARS)
    const message = context ? `${sanitizeErrorText(context)}: ${cleanMessage}` : cleanMessage
    const entry: ErrorLogEntry = {
      at: new Date().toISOString(),
      message,
      ...(stack ? { stack: cleanStack(stack, rawMessage, sanitizeErrorText(rawMessage)) } : {}),
      route: currentRoute(),
      version: APP_VERSION,
      platform: RUNTIME,
    }
    const list = readErrorLog()
    const last = list[list.length - 1]
    if (last && last.message === entry.message && last.route === entry.route && Date.parse(entry.at) - Date.parse(last.at) < REPEAT_WINDOW_MS) {
      return
    }
    list.push(entry)
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(list.slice(-ERROR_LOG_MAX)))
  } catch {
    // Ingen lagring (privat läge, blockerad eller full) – felet loggas inte, och det är okej.
  }
}

/** "2026-09-28T08:15:02.000Z" → "2026-09-28 10:15" (lokal tid). */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Så många rader av varje stack tas med i rapporten (hela finns kvar i loggen). */
const REPORT_STACK_LINES = 4

/**
 * Felrapporten som text – för "Kopiera felrapport" och "Mejla supporten". Nyaste felet först,
 * med appens version, bygge och plattform överst.
 */
export function formatErrorReport(): string {
  const entries = readErrorLog()
  const lines = [
    'Lagom – felrapport',
    `Version: ${APP_VERSION} (bygge ${BUILD_ID})`,
    `Plattform: ${RUNTIME}`,
    `Skapad: ${formatTime(new Date().toISOString())}`,
    '',
  ]
  if (entries.length === 0) {
    lines.push('Inga fel har loggats.')
    return lines.join('\n')
  }
  lines.push(`${entries.length} fel (nyaste först):`)
  entries
    .slice()
    .reverse()
    .forEach((e, i) => {
      lines.push('', `${i + 1}. ${formatTime(e.at)} · ${e.route} · ${e.platform} · v${e.version}`, `   ${e.message}`)
      if (e.stack) {
        // Första raden i en V8-stack upprepar meddelandet – hoppa över den.
        const stackLines = e.stack
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !e.message.endsWith(l))
          .slice(0, REPORT_STACK_LINES)
        for (const l of stackLines) lines.push(`   ${l}`)
      }
    })
  return lines.join('\n')
}

/** Töm felloggen. */
export function clearErrorLog(): void {
  try {
    localStorage.removeItem(ERROR_LOG_KEY)
  } catch {
    /* ingen lagring – inget att rensa */
  }
}
