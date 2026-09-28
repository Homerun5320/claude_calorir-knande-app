/**
 * Tester för den lokala felloggen: ringbuffert, rensning av siffror och citerad text, sidan utan
 * id:n och att allt fungerar tyst när lagringen kastar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearErrorLog,
  ERROR_LOG_KEY,
  ERROR_LOG_MAX,
  formatErrorReport,
  logError,
  readErrorLog,
  routeFromHash,
  sanitizeErrorText,
  STACK_MAX_CHARS,
} from './errorLog'

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('logError', () => {
  it('sparar fel med tid, sida, version och plattform', () => {
    window.location.hash = '#/dagbok'
    logError(new TypeError('e is not iterable'), 'route')
    const [entry] = readErrorLog()
    expect(entry.message).toBe('route: TypeError: e is not iterable')
    expect(entry.route).toBe('/dagbok')
    expect(entry.version).toBe('0.0.0-dev')
    expect(entry.platform).toBe('web')
    expect(Number.isNaN(Date.parse(entry.at))).toBe(false)
  })

  it('är en ringbuffert med högst 20 poster – de äldsta försvinner', () => {
    for (let i = 0; i < 25; i++) logError(new Error(`Fel nummer ${'x'.repeat(i + 1)}`))
    const log = readErrorLog()
    expect(log).toHaveLength(ERROR_LOG_MAX)
    expect(log[0].message).toBe(`Error: Fel nummer ${'x'.repeat(6)}`)
    expect(log[log.length - 1].message).toBe(`Error: Fel nummer ${'x'.repeat(25)}`)
  })

  it('sparar inte samma fel om och om igen (t.ex. i en renderingsslinga)', () => {
    for (let i = 0; i < 5; i++) logError(new Error('Samma fel'))
    expect(readErrorLog()).toHaveLength(1)
  })

  it('ersätter siffror och citerad text så att inga livsmedel eller värden sparas', () => {
    logError(new Error('Kunde inte spara "Kycklingbröst" 150 g (1,5 port) den 2026-09-20'))
    const [entry] = readErrorLog()
    expect(entry.message).toBe('Error: Kunde inte spara ”…” # g (# port) den #-#-#')
    expect(entry.message).not.toMatch(/\d|Kyckling/)
  })

  it('rensar felmeddelandet även i stacken och kortar den', () => {
    const err = new Error('Okänt livsmedel "Lingonsylt" 42 kcal')
    err.stack = `Error: Okänt livsmedel "Lingonsylt" 42 kcal\n${'    at foo (https://lagom.app/assets/index-abc.js:12:34)\n'.repeat(40)}`
    logError(err)
    const [entry] = readErrorLog()
    expect(entry.stack).toBeDefined()
    expect(entry.stack!.length).toBeLessThanOrEqual(STACK_MAX_CHARS)
    expect(entry.stack).not.toContain('Lingonsylt')
    expect(entry.stack).not.toContain('42 kcal')
    // Rader och kolumner behövs för felsökningen.
    expect(entry.stack).toContain('index-abc.js:12:34')
  })

  it('klarar strängar, objekt och undefined', () => {
    logError('Något hände')
    logError({ message: 'Objektfel' })
    logError(undefined, 'promise')
    expect(readErrorLog().map((e) => e.message)).toEqual(['Något hände', 'Objektfel', 'promise: Okänt fel'])
  })

  it('struntar i webbläsarens brus', () => {
    logError(new Error('ResizeObserver loop completed with undelivered notifications.'))
    logError('Script error.')
    expect(readErrorLog()).toEqual([])
  })

  it('fungerar tyst när localStorage kastar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blockerad', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blockerad', 'SecurityError')
    })
    expect(() => logError(new Error('x'))).not.toThrow()
    expect(readErrorLog()).toEqual([])
    expect(() => clearErrorLog()).not.toThrow()
    expect(formatErrorReport()).toContain('Inga fel har loggats.')
  })

  it('läser inte in trasig eller främmande data', () => {
    localStorage.setItem(ERROR_LOG_KEY, '{inte json')
    expect(readErrorLog()).toEqual([])
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify([{ at: 'x', message: 'ok', route: '/' }, { nope: true }, 42]))
    expect(readErrorLog()).toEqual([{ at: 'x', message: 'ok', route: '/', version: '?', platform: '?' }])
  })
})

describe('sidan (route)', () => {
  it('tar bort query, id:n och datum', () => {
    expect(routeFromHash('')).toBe('/')
    expect(routeFromHash('#/')).toBe('/')
    expect(routeFromHash('#/lagg-till?maltid=frukost&datum=2026-09-20')).toBe('/lagg-till')
    expect(routeFromHash('#/dagbok/2026-09-20')).toBe('/dagbok/…')
    expect(routeFromHash('#/livsmedel/lagom:kycklingbrost/redigera')).toBe('/livsmedel/…/redigera')
    expect(routeFromHash('#/recept/r_8f2k1')).toBe('/recept/…')
    expect(routeFromHash('#/installningar/data')).toBe('/installningar/data')
  })
})

describe('sanitizeErrorText', () => {
  it('rör inte apostrofer inne i ord', () => {
    expect(sanitizeErrorText("can't access property 'kcal', x is undefined")).toBe("can't access property ”…”, x is undefined")
    expect(sanitizeErrorText('Värdet ”Havregryn” och «Mjölk»')).toBe('Värdet ”…” och ”…”')
  })
})

describe('formatErrorReport', () => {
  it('ger en läsbar rapport med version, plattform och de nyaste felen först', () => {
    window.location.hash = '#/insikter'
    logError(new Error('Första felet'))
    logError(new Error('Andra felet'), 'global')
    const report = formatErrorReport()
    expect(report).toMatch(/^Lagom – felrapport\nVersion: 0\.0\.0-dev \(bygge lokal\)\nPlattform: web/)
    expect(report).toContain('2 fel (nyaste först):')
    expect(report.indexOf('Andra felet')).toBeLessThan(report.indexOf('Första felet'))
    expect(report).toContain('/insikter')
  })

  it('säger till när loggen är tom och efter rensning', () => {
    logError(new Error('Något'))
    clearErrorLog()
    expect(readErrorLog()).toEqual([])
    expect(formatErrorReport()).toContain('Inga fel har loggats.')
  })
})
