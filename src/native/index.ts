/**
 * De inbyggda apparna (Capacitor, App Store och Google Play) – den enda ingången från resten av
 * appen till native-koden.
 *
 * Regler (se även "Native-appar" i CLAUDE.md; native.test.ts kontrollerar dem):
 * - Appkoden importerar bara den här filen, och den här filen importerar inget från `@capacitor/*`
 *   eller tilläggen statiskt.
 * - Varje funktion (delning, haptik, påminnelser, köp …) ligger i en egen modul under
 *   `src/native/` som får importera `@capacitor/*` statiskt. Modulen registreras i `MODULES` nedan
 *   och laddas med `loadNative()`, som ger null på webben:
 *
 *     const files = await loadNative('files')
 *     if (files) return files.saveFile(filename, content, mime)
 *     // … webbens väg som förut
 *
 * - Därför måste alla dynamiska importer av native-moduler stå här, i samma fil som
 *   `NATIVE_BUILD`: Vite tar bara bort en dynamisk import ur webbygget när villkoret är en
 *   konstant i samma modul. Står importen någon annanstans följer native-koden med i `dist/` och i
 *   service workerns cache (kontrollerat med ett provbygge).
 * - Allt är no-op på webben och i testerna (om inte plattformen mockas), och får aldrig kasta: fel
 *   loggas med `logError` och appen fortsätter som på webben.
 */
import { isNativeApp } from '../config/platform'
import { logError } from '../lib/errorLog'

/** Sätts av vite.config.ts (`define`); finns inte i testerna. */
declare const __LAGOM_DISTRIBUTION__: string | undefined

/**
 * true i butiksbyggen (VITE_DISTRIBUTION=appstore|play) – bara där kan native-koden behövas. En
 * konstant i bygget, så att `loadNative()` och modulerna i `MODULES` försvinner ur webbygget.
 * I testerna (där `define` saknas) är den true, så att native-vägarna kan testas med mockar.
 */
export const NATIVE_BUILD: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ !== 'web' : true

/**
 * Native-modulerna. Lägg till en rad per funktion (`namn: () => import('./fil')`) – bara här,
 * aldrig en dynamisk import av src/native/* någon annanstans.
 */
const MODULES = {
  /** Start av native-funktionerna (initNative). */
  init: () => import('./init'),
  /** Systemfält, tangentbord, startskärm, bakåtknapp och länkar ut ur appen. */
  system: () => import('./system'),
  /** Köp i appen (StoreKit 2 / Play Billing) – kopplas in i src/lib/storePurchases.ts. */
  purchases: () => import('./purchases'),
  /** Export och delning (filer via delningsbladet, text). */
  files: () => import('./files'),
  /** Lokal spegling av all data (skydd mot att systemet rensar webbvyns lagring). */
  mirror: () => import('./mirror'),
  /** Lokala påminnelser (startas från init.ts; inställningssidan använder bron i stores/reminderStore.ts). */
  reminders: () => import('./reminders'),
  /** Haptik: tap() och success() – använd `haptic()` nedan. */
  haptics: () => import('./haptics'),
  /** Streckkodsläsaren (ZXing på Android, Vision på iPhone) – ScanPage. */
  barcode: () => import('./barcode'),
  /** Apple Hälsa och Health Connect (Inställningar → Apple Hälsa/Health Connect). */
  health: () => import('./health'),
  /** Framstegsbilder: filer i appens egen mapp (src/lib/progressPhotos.ts, /vikt/bilder). */
  photos: () => import('./photos'),
}

export type NativeModuleName = keyof typeof MODULES
export type NativeModule<K extends NativeModuleName> = Awaited<ReturnType<(typeof MODULES)[K]>>

export type NativePlatform = 'ios' | 'android' | 'web'

interface CapacitorGlobal {
  getPlatform?: () => string
}

/**
 * Körs Lagom som inbyggd app (Capacitor) just nu? Capacitor lägger `window.Capacitor` före
 * appens skript, så svaret är känt direkt när appen startar (`detectRuntime` i
 * src/config/platform.ts). Butiksbygget i en vanlig webbläsare (skärmdumpsskriptet,
 * `vite preview`) är inte native.
 */
export function isNative(): boolean {
  return NATIVE_BUILD && isNativeApp()
}

/** 'ios' eller 'android' i de inbyggda apparna, annars 'web' (även butiksbygget i en webbläsare). */
export function nativePlatform(): NativePlatform {
  if (!isNative()) return 'web'
  try {
    const value = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.getPlatform?.()
    return value === 'ios' || value === 'android' ? value : 'web'
  } catch {
    return 'web'
  }
}

/** Plattformen, avgjord när appen startar. */
export const platform: NativePlatform = nativePlatform()

/**
 * Ladda en native-modul – null på webben (och om modulen inte går att ladda, t.ex. ett trasigt
 * tillägg; felet loggas då). Anropas där webbens väg annars tas, se exemplet överst.
 */
export async function loadNative<K extends NativeModuleName>(name: K): Promise<NativeModule<K> | null> {
  // Kontrollen av konstanten måste stå först och här – då tar Vite bort MODULES ur webbygget.
  if (!NATIVE_BUILD) return null
  if (!isNative()) return null
  try {
    return (await MODULES[name]()) as NativeModule<K>
  } catch (error) {
    logError(error, `native:${name}`)
    return null
  }
}

/**
 * Haptisk återkoppling i apparna – no-op på webben, med "Minska rörelse" och om det inte går.
 * Väntar inte och kastar aldrig: `haptic('success')` när något har loggats, `haptic('tap')` för
 * små val.
 */
export function haptic(kind: 'tap' | 'success'): void {
  if (!NATIVE_BUILD) return
  if (!isNative()) return
  void loadNative('haptics').then((h) => h?.[kind]())
}

let started: Promise<void> | null = null

/**
 * Startar native-funktionerna en gång (AppShell anropar den när appen har ritats). No-op på
 * webben. Kastar aldrig – ett fel loggas lokalt och appen fungerar vidare som på webben.
 */
export function initNative(): Promise<void> {
  if (!NATIVE_BUILD) return Promise.resolve()
  if (!isNative()) return Promise.resolve()
  started ??= loadNative('init')
    .then((init) => init?.startNative())
    .catch((error: unknown) => {
      logError(error, 'native:init')
    })
  return started
}

/** Endast för tester: glöm att initNative() har körts. */
export function resetNativeForTests(): void {
  started = null
}
