/**
 * Plattform och distribution – var Lagom körs och hur den säljs, samlat på ett ställe.
 *
 * - `DISTRIBUTION` bestäms vid bygget (`VITE_DISTRIBUTION=web | appstore | play`, standard web).
 *   Byggkontrollen (scripts/commerce-guard.ts) stoppar ogiltiga värden.
 * - `RUNTIME` avgörs när appen startar: webbläsare, inbyggd app (Capacitor) eller Googles
 *   TWA-skal (Trusted Web Activity) som visar webbversionen i en Play-app.
 *
 * Regler som följer av det:
 * - Webbköp (Stripe) och kronpriser visas bara när `sellsOnWeb()` – i butiksapparna görs köpet i
 *   App Store eller Google Play, och priset kommer från butiken.
 * - Licensnycklar kan inte aktiveras i App Store-bygget (`allowsLicenseKeyEntry()`); där återställs
 *   köp i appen med "Återställ köp".
 *
 * Filen läser bara globaler och får inte importera andra moduler – den laddas även av
 * serverfunktionerna (via src/lib/license.ts), där `window` och `import.meta.env` saknas.
 */

export type Distribution = 'web' | 'appstore' | 'play'

/** Tolka VITE_DISTRIBUTION. Saknas värdet blir det 'web'; ett okänt värde ger null. */
export function parseDistribution(value: string | undefined): Distribution | null {
  if (value === undefined || value === '') return 'web'
  return value === 'web' || value === 'appstore' || value === 'play' ? value : null
}

// `import.meta.env` finns inte när filen körs utanför Vite (t.ex. i en Netlify-funktion).
const env: Record<string, string | undefined> = (import.meta.env as Record<string, string | undefined> | undefined) ?? {}

/** Sätts av vite.config.ts (`define`); finns inte i testerna eller i serverfunktionerna. */
declare const __LAGOM_DISTRIBUTION__: string | undefined

/**
 * Vilken butik (eller webben) bygget är gjort för. Ogiltiga värden stoppas av byggkontrollen.
 * I bygget är värdet en konstant (`__LAGOM_DISTRIBUTION__`, vite.config.ts), så att kod som bara
 * gäller webben kan tas bort ur butiksappens paket; i testerna läses VITE_DISTRIBUTION.
 */
export const DISTRIBUTION: Distribution =
  (typeof __LAGOM_DISTRIBUTION__ === 'string' ? parseDistribution(__LAGOM_DISTRIBUTION__) : parseDistribution(env.VITE_DISTRIBUTION)) ?? 'web'

/** true i byggen för App Store och Google Play. */
export const IS_STORE_BUILD = DISTRIBUTION !== 'web'

/**
 * Webbförsäljning (Stripe) på eller av: `VITE_WEB_SALES=off` stänger av köp på webben, så att
 * Lagom bara säljs i appbutikerna. Licensnycklar från tidigare webbköp fungerar ändå.
 */
export const WEB_SALES_ENABLED = (env.VITE_WEB_SALES ?? '').trim().toLowerCase() !== 'off'

export type Runtime = 'web' | 'native' | 'twa'

const TWA_SESSION_KEY = 'lagom-twa'

function readSession(win: Window, key: string): string | null {
  try {
    return win.sessionStorage?.getItem(key) ?? null
  } catch {
    // Lagringen kan vara blockerad (t.ex. privat läge eller strikta inställningar).
    return null
  }
}

function writeSession(win: Window, key: string, value: string): void {
  try {
    win.sessionStorage?.setItem(key, value)
  } catch {
    /* ignorera – då känns TWA igen på nytt vid nästa start */
  }
}

/** ?plattform=play i adressen – före hash-delen eller i den (#/?plattform=play). */
function hasPlayParam(win: Window): boolean {
  try {
    const search = win.location?.search ?? ''
    if (new URLSearchParams(search).get('plattform') === 'play') return true
    const hash = win.location?.hash ?? ''
    const q = hash.indexOf('?')
    return q >= 0 && new URLSearchParams(hash.slice(q + 1)).get('plattform') === 'play'
  } catch {
    return false
  }
}

/** Visas sidan som app (utan webbläsarens adressfält)? Så visas en TWA – men inte en vanlig flik. */
function displayedAsApp(win: Window): boolean {
  try {
    if (typeof win.matchMedia !== 'function') return false
    return ['standalone', 'fullscreen', 'minimal-ui'].some((mode) => win.matchMedia(`(display-mode: ${mode})`).matches)
  } catch {
    return false
  }
}

/**
 * Var körs appen just nu?
 * - 'native': inbyggd app via Capacitor (iPhone-appen).
 * - 'twa': Googles Play-skal runt webbversionen. Känns i första hand igen på ?plattform=play i
 *   startadressen (se docs/GOOGLE-PLAY.md), och annars på referrern android-app:// när sidan
 *   samtidigt visas som app. Minns under sessionen, eftersom referrern och parametern kan
 *   försvinna när man navigerar.
 * - 'web': vanlig webbläsare (även installerad på hemskärmen).
 *
 * Medvetet INTE som tecken på TWA:
 * - referrern android-app:// ensam – den får också den som öppnar en länk till Lagom från t.ex.
 *   Gmail eller Google-appen i Chrome, och då skulle webbköpen försvinna för dem,
 * - `getDigitalGoodsService` i window – metoden finns i Chrome på Android och ChromeOS även
 *   utanför en TWA (den kastar först när den anropas).
 */
export function detectRuntime(win: Window | undefined = typeof window === 'undefined' ? undefined : window): Runtime {
  if (!win) return 'web'
  try {
    if ((win as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true) return 'native'
  } catch {
    /* en trasig global räknas som webb */
  }
  let referrer = ''
  try {
    referrer = win.document?.referrer ?? ''
  } catch {
    referrer = ''
  }
  const twa = hasPlayParam(win) || readSession(win, TWA_SESSION_KEY) === '1' || (referrer.startsWith('android-app://') && displayedAsApp(win))
  if (twa) {
    writeSession(win, TWA_SESSION_KEY, '1')
    return 'twa'
  }
  return 'web'
}

/** Avgörs en gång när appen startar. */
export const RUNTIME: Runtime = detectRuntime()

/** Inbyggd app (Capacitor). */
export const isNativeApp = (): boolean => RUNTIME === 'native'

/** Googles Play-skal (TWA) runt webbversionen. */
export const isTwa = (): boolean => RUNTIME === 'twa'

/** Lagom körs som app från en butik (butiksbygge, inbyggd app eller TWA). */
export const isInApp = (): boolean => IS_STORE_BUILD || RUNTIME !== 'web'

/**
 * Körs Lagom som installerad webbapp (hemskärmen)? Då delar den inte lagring med webbläsaren.
 */
export function isStandalone(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const standaloneMedia = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
    return standaloneMedia || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/** iPhone eller iPad (iPadOS kallar sig Macintosh men har pekskärm). */
function isIosUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent ?? ''
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1)
}

/** Safari på iPhone/iPad (inte Chrome, Firefox eller Edge för iOS). */
export function isAppleWebKit(): boolean {
  if (typeof navigator === 'undefined') return false
  return isIosUserAgent() && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent ?? '')
}

/** Den inbyggda appen körs på iOS. */
function isNativeIos(): boolean {
  if (RUNTIME !== 'native') return false
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor
    const platform = cap?.getPlatform?.()
    if (platform) return platform === 'ios'
  } catch {
    /* faller tillbaka på webbläsarens uppgifter */
  }
  return isIosUserAgent()
}

/** iPhone eller iPad – webbläsaren eller den inbyggda appen (t.ex. för "Spara i Filer"). */
export function isIosDevice(): boolean {
  return isNativeIos() || isIosUserAgent()
}

/** Webbköp med Stripe erbjuds här: webbversionen i en vanlig webbläsare, med webbförsäljningen på. */
export function sellsOnWeb(): boolean {
  return !IS_STORE_BUILD && RUNTIME === 'web' && WEB_SALES_ENABLED
}

/**
 * Kan man klistra in en licensnyckel? Inte i App Store-bygget eller den inbyggda iPhone-appen –
 * där gäller bara köp i appen (som återställs via Apple-ID med "Återställ köp").
 */
export function allowsLicenseKeyEntry(): boolean {
  if (DISTRIBUTION === 'appstore') return false
  if (isNativeIos()) return false
  return true
}

/**
 * "Tappat nyckeln?" – hämta en licensnyckel från ett webbköp igen. Bara i webbläsaren, där
 * webbköpen har gjorts; aldrig i butiksapparna.
 */
export function offersLicenseRecovery(): boolean {
  return !isInApp() && allowsLicenseKeyEntry()
}

/** Var datan sparas, för texter som "Din data sparas {storagePlace()}". */
export function storagePlace(): string {
  return isInApp() ? 'i appen på den här enheten' : 'i den här webbläsaren'
}

/** Hur man tillåter kameran igen efter att ha nekat den. */
export function cameraSettingsHint(): string {
  return isInApp() ? 'Tillåt kameran för Lagom i telefonens Inställningar.' : 'Tillåt kameran för Lagom i webbläsarens inställningar.'
}
