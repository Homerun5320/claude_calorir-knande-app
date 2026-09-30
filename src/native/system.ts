/**
 * Systemfälten, tangentbordet, startskärmen, Androids bakåtknapp och länkar ut ur appen i de
 * inbyggda apparna (Capacitor). Laddas bara via `loadNative('system')` (src/native/index.ts) och
 * startas en gång med `initSystem()` från `startNative()` (src/native/init.ts) – aldrig på webben.
 *
 * - Statusfältet (och Androids navigeringsfält) följer appens tema – klassen `dark` på <html>, som
 *   `useTheme` sätter – även när man har valt ett annat tema än telefonens. Webbvyn går kant till
 *   kant under statusfältet (overlay); marginalerna kommer från var(--sa-*) i src/index.css.
 * - Startskärmen döljs när appen är redo: `initNative()` anropas av AppShell, som bara ritas när
 *   butikerna har lästs in (`Gate` i src/App.tsx väntar på `useHydrated`). Startskärmens egen
 *   tidsgräns (`launchShowDuration` i capacitor.config.ts) är reserven om skriptet aldrig kommer
 *   hit.
 * - Tangentbordet (iPhone): hela webbvyn krymper när det visas (`resize: 'native'`), och raden
 *   ovanför tangentbordet med pilar och "Klar" visas – sifferfältens tangentbord (inputmode
 *   decimal) har annars ingen knapp som stänger det. Tangentbordet följer appens tema. Medan
 *   tangentbordet är uppe har <html> klassen `keyboard-open` (båda plattformarna).
 * - Androids bakåtknapp och bakåtgest: stänger först ett öppet ark eller en dialog – samma väg som
 *   webbläsarens bakåtknapp (components/ui/modalHistory.ts), eller Escape för en dialog utan egen
 *   historikpost – går annars bakåt, och på startsidan minimeras appen i stället för att stängas.
 * - Länkar: externa länkar (`ExternalLink`, `target="_blank"`) och mailto:/tel: öppnar Capacitor
 *   redan i telefonens webbläsare eller e-postapp – de lämnas orörda. Här tas bara länkar med ny
 *   flik till appens egna sidor om (t.ex. "#/villkor" i köparket): i appen finns ingen ny flik,
 *   och på iPhone skulle länken inte göra något alls. De öppnas på webbplatsen (VITE_API_BASE)
 *   när sidan finns där, annars inne i appen.
 * - <html> får klassen `native-app` (NATIVE_APP_CLASS): src/index.css stänger då av menyn med
 *   "Spara bild" när man håller fingret på en bild (`-webkit-touch-callout: none`).
 * - Inget här kastar: fel loggas med `logError(error, 'native:<del>')` och appen fungerar vidare.
 */
import { App } from '@capacitor/app'
import { SystemBars, SystemBarsStyle, type PluginListenerHandle } from '@capacitor/core'
import { Keyboard, KeyboardResize, KeyboardStyle } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { hasModalEntries } from '../components/ui/modalHistory'
import { API_BASE } from '../config/commerce'
import { logError } from '../lib/errorLog'
import { nativePlatform, type NativePlatform } from './index'

/** Sammanhangen i den lokala felloggen, en per del. */
export const SYSTEM_LOG = {
  bars: 'native:statusfalt',
  keyboard: 'native:tangentbord',
  splash: 'native:startskarm',
  back: 'native:bakatknapp',
  links: 'native:lankar',
} as const

/** Klassen på <html> medan tangentbordet är uppe (t.ex. för att dölja bottennavigeringen). */
export const KEYBOARD_OPEN_CLASS = 'keyboard-open'

/** Klassen på <html> i de inbyggda apparna (se src/index.css). */
export const NATIVE_APP_CLASS = 'native-app'

/** Startsidan (Idag). Bakåt härifrån minimerar appen. */
export const HOME_ROUTE = '/'

/**
 * Sidor som appen kan börja på utan historik bakom sig: bakåt minimerar appen där i stället för
 * att hoppa till startsidan (välkomstflödet – dit skickar `Gate` den som saknar profil).
 */
export const ROOT_ROUTES: readonly string[] = [HOME_ROUTE, '/valkommen']

/**
 * Appens egna sidor som också finns som vanliga webbsidor på webbplatsen (public/…, skapas från
 * src/features/legal/legalContent.ts). En länk med ny flik dit öppnas i telefonens webbläsare, så
 * att arket med länken finns kvar i appen.
 */
export const SITE_PAGES: Readonly<Record<string, string>> = {
  '/villkor': '/villkor/',
  '/integritet': '/integritet/',
}

let started = false
let handles: PluginListenerHandle[] = []
let cleanups: Array<() => void> = []

/** Kör ett anrop till ett tillägg; ett fel (även ett som kastas direkt) loggas. Kastar aldrig. */
async function attempt(context: string, call: () => unknown): Promise<boolean> {
  try {
    await call()
    return true
  } catch (error) {
    logError(error, context)
    return false
  }
}

/** Registrera en lyssnare hos ett tillägg – tas bort igen om modulen hann stoppas under tiden. */
async function listen(context: string, add: () => Promise<PluginListenerHandle>): Promise<void> {
  try {
    const handle = await add()
    if (started) handles.push(handle)
    else void handle.remove()
  } catch (error) {
    logError(error, context)
  }
}

// ---------------------------------------------------------------------------
// Statusfält och tema
// ---------------------------------------------------------------------------

/** Appens tema just nu: `useTheme` sätter klassen `dark` på <html> (även i läget "system"). */
export function appIsDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

/**
 * Systemfältens (och på iPhone tangentbordets) stil efter appens tema. Mörkt tema = ljus text i
 * statusfältet. Både SystemBars (Capacitors kärna: statusfältet och Androids navigeringsfält) och
 * StatusBar-tillägget får samma stil – båda lägger tillbaka sin senaste stil när telefonens
 * ljusa/mörka läge ändras, och ska då inte gå isär.
 */
export async function applyTheme(dark: boolean, os: NativePlatform = nativePlatform()): Promise<void> {
  await Promise.all([
    attempt(SYSTEM_LOG.bars, () => SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })),
    attempt(SYSTEM_LOG.bars, () => StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })),
    // Tangentbordets stil finns bara på iPhone (Android följer telefonens tema).
    os === 'ios' ? attempt(SYSTEM_LOG.keyboard, () => Keyboard.setStyle({ style: dark ? KeyboardStyle.Dark : KeyboardStyle.Light })) : undefined,
  ])
}

/** Sätt stilen nu och följ sedan temat (klassen på <html>) så länge appen körs. */
async function startBars(os: NativePlatform): Promise<void> {
  try {
    if (os === 'ios') {
      // Webbvyn under statusfältet (samma som capacitor.config.ts) – sidorna räknar med var(--sa-top).
      // På Android sköts det av konfigurationen och SystemBars (kant till kant, --safe-area-inset-*);
      // från Android 15 går det inte att ändra.
      await attempt(SYSTEM_LOG.bars, () => StatusBar.setOverlaysWebView({ overlay: true }))
    }
    const root = document.documentElement
    let applied: boolean | null = null
    let queue: Promise<void> = Promise.resolve()
    const sync = (): Promise<void> => {
      const dark = appIsDark()
      if (dark === applied) return queue
      applied = dark
      // I tur och ordning, så att den senaste stilen vinner om temat byts snabbt.
      queue = queue.then(() => applyTheme(dark, os))
      return queue
    }
    // Klasslistan ändras också av annat (t.ex. has-bottom-nav) – bara ett nytt tema anropar telefonen.
    const observer = new MutationObserver(() => void sync())
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    cleanups.push(() => observer.disconnect())
    await sync()
  } catch (error) {
    logError(error, SYSTEM_LOG.bars)
  }
}

// ---------------------------------------------------------------------------
// Startskärmen
// ---------------------------------------------------------------------------

/** Dölj startskärmen (gör inget om den redan är borta). */
export async function hideSplash(): Promise<void> {
  await attempt(SYSTEM_LOG.splash, () => SplashScreen.hide())
}

// ---------------------------------------------------------------------------
// Tangentbordet
// ---------------------------------------------------------------------------

async function startKeyboard(os: NativePlatform): Promise<void> {
  try {
    if (os === 'ios') {
      // Samma som capacitor.config.ts – webbvyn krymper, så att fältet och knapparna syns.
      await attempt(SYSTEM_LOG.keyboard, () => Keyboard.setResizeMode({ mode: KeyboardResize.Native }))
      // Tillägget döljer raden med "Klar" som standard – då går sifferfältens tangentbord inte att
      // stänga. Safari visar den, så appen gör likadant.
      await attempt(SYSTEM_LOG.keyboard, () => Keyboard.setAccessoryBarVisible({ isVisible: true }))
    }
    const root = document.documentElement
    await listen(SYSTEM_LOG.keyboard, () => Keyboard.addListener('keyboardWillShow', () => root.classList.add(KEYBOARD_OPEN_CLASS)))
    await listen(SYSTEM_LOG.keyboard, () => Keyboard.addListener('keyboardWillHide', () => root.classList.remove(KEYBOARD_OPEN_CLASS)))
    cleanups.push(() => root.classList.remove(KEYBOARD_OPEN_CLASS))
  } catch (error) {
    logError(error, SYSTEM_LOG.keyboard)
  }
}

// ---------------------------------------------------------------------------
// Androids bakåtknapp
// ---------------------------------------------------------------------------

/** Sidans väg i hash-routern: "/dagbok" för "#/dagbok?datum=…", "/" utan hash. */
export function currentRoute(hash: string = window.location.hash): string {
  const path = hash.replace(/^#/, '').split(/[?#]/)[0].replace(/\/+$/, '')
  return path === '' ? HOME_ROUTE : path
}

/**
 * Stäng den översta modalen, om någon är öppen. Ett ark eller en dialog med egen historikpost
 * stängs med ett steg bakåt – precis som webbläsarens bakåtknapp (modalHistory.ts). En dialog
 * utan egen post (t.ex. en fristående bekräftelse) får Escape, som den själv stänger på om den går
 * att stänga. Sant om det fanns en modal – då ska bakåtknappen inte göra något mer, inte heller
 * när modalen inte går att stänga.
 */
export function closeTopModal(): boolean {
  if (hasModalEntries()) {
    window.history.back()
    return true
  }
  if (!document.querySelector('[aria-modal="true"]')) return false
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
  return true
}

function minimize(): void {
  // Appen ligger kvar i bakgrunden, som när man trycker på hemknappen – den stängs inte.
  void attempt(SYSTEM_LOG.back, () => App.minimizeApp())
}

/**
 * Androids bakåtknapp (och bakåtgest). `canGoBack` kommer från webbvyn: finns det en sida bakom
 * den här i historiken?
 */
export function handleBackButton(canGoBack: boolean): void {
  try {
    if (closeTopModal()) return
    const route = currentRoute()
    if (route === HOME_ROUTE) {
      minimize()
      return
    }
    if (canGoBack) {
      // Som webbläsarens bakåtknapp – routern frågar själv om osparade ändringar.
      window.history.back()
      return
    }
    if (ROOT_ROUTES.includes(route)) {
      minimize()
      return
    }
    // Ingen historik bakom en undersida (t.ex. efter en omdirigering): till startsidan först.
    window.location.replace(`#${HOME_ROUTE}`)
  } catch (error) {
    logError(error, SYSTEM_LOG.back)
  }
}

async function startBackButton(): Promise<void> {
  // En egen lyssnare stänger av Capacitors standard (webbvyn bakåt, annars ingenting).
  await listen(SYSTEM_LOG.back, () => App.addListener('backButton', ({ canGoBack }) => handleBackButton(canGoBack)))
}

// ---------------------------------------------------------------------------
// Länkar med ny flik till appens egna sidor
// ---------------------------------------------------------------------------

/** Webbplatsens adress (VITE_API_BASE, alltid satt i butiksbyggena) – bara en https-adress. */
export function siteBase(base: string = API_BASE): string | null {
  return /^https:\/\/[^/]+/i.test(base) ? base.replace(/\/+$/, '') : null
}

/** Vart en länk med ny flik ska: ut ur appen, till en sida i appen, eller ingenstans. */
export type AppLinkTarget = { open: string } | { navigate: string } | { stay: true }

/**
 * Leder länken till appen själv (samma ursprung som webbvyn, t.ex. capacitor://localhost)? Då
 * finns ingen ny flik att öppna den i. null = en annan webbplats eller mailto:/tel: – det sköter
 * Capacitor (telefonens webbläsare eller e-postapp).
 */
export function appLinkTarget(url: URL, base: string | null = siteBase()): AppLinkTarget | null {
  if (url.protocol !== window.location.protocol || url.host !== window.location.host) return null
  if (url.hash.startsWith('#/')) {
    const page = SITE_PAGES[currentRoute(url.hash)]
    return page && base ? { open: `${base}${page}` } : { navigate: url.hash }
  }
  // En fil i appen (t.ex. licenstexterna) finns också på webbplatsen. Utan webbplats stannar vi
  // kvar – annars skulle webbvyn lämna appen.
  return base ? { open: `${base}${url.pathname}${url.search}` } : { stay: true }
}

/** Öppna en adress i telefonens webbläsare – samma väg som en vanlig länk med ny flik. */
export function openOutsideApp(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.click()
}

/** Klick på en länk med ny flik (lyssnar på document, efter appens egna klickhanterare). */
export function onLinkClick(event: MouseEvent): void {
  try {
    if (event.defaultPrevented || event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a[href]')
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target !== '_blank') return
    const where = appLinkTarget(new URL(anchor.href))
    if (!where) return
    event.preventDefault()
    if ('open' in where) openOutsideApp(where.open)
    else if ('navigate' in where) window.location.hash = where.navigate
  } catch (error) {
    logError(error, SYSTEM_LOG.links)
  }
}

function startLinks(): void {
  document.addEventListener('click', onLinkClick)
  cleanups.push(() => document.removeEventListener('click', onLinkClick))
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * Starta systemfälten, tangentbordet, bakåtknappen och länkhanteringen och dölj startskärmen – en
 * gång, från `startNative()`. No-op på webben. Kastar aldrig.
 */
export async function initSystem(): Promise<void> {
  if (started) return
  const os = nativePlatform()
  if (os === 'web') return
  started = true
  document.documentElement.classList.add(NATIVE_APP_CLASS)
  cleanups.push(() => document.documentElement.classList.remove(NATIVE_APP_CLASS))
  try {
    startLinks()
  } catch (error) {
    logError(error, SYSTEM_LOG.links)
  }
  const rest = Promise.all([startKeyboard(os), os === 'android' ? startBackButton() : undefined])
  // Rätt stil på statusfältet innan startskärmen försvinner, så att det inte blinkar.
  await startBars(os)
  await hideSplash()
  await rest
}

/** Endast för tester: ta bort lyssnarna och glöm att modulen har startats. */
export function resetSystemForTests(): void {
  started = false
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  handles.forEach((handle) => void handle.remove())
  handles = []
}
