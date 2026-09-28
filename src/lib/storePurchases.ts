/**
 * Köp i appen (App Store och Google Play) – ett litet gränssnitt som resten av appen använder.
 *
 * - Webben (och butiksbygget i en vanlig webbläsare): `webStore` – köp i appen finns inte, listorna
 *   är tomma och appen beter sig precis som förut.
 * - De inbyggda apparna: köpen görs med `@capgo/native-purchases` (StoreKit 2 på iPhone, Play
 *   Billing 9 på Android) i `src/native/purchases.ts`, direkt mellan telefonen och butiken – utan
 *   egen server och utan extra konto (docs/NATIVE.md §2). Den modulen laddas med
 *   `loadNative('purchases')` när appen startar och lämnar sin implementation här med
 *   `setNativeStorePurchases()`. Tills dess ger `getStorePurchases()` ett objekt som väntar på
 *   implementationen (högst `NATIVE_WAIT_MS`), så att köpen som hämtas direkt vid start (useAccess)
 *   inte hinner bli en tom lista och "Provperioden är slut" för den som redan har köpt.
 *
 * Ett tillägg med egen server, som RevenueCat, skulle göra leverantören till personuppgiftsbiträde
 * (köphistorik och användar-id) – då måste integritetspolicyn, registerförteckningen, App Privacy
 * och Data safety ändras före inskickningen (docs/APP-STORE.md §7, docs/GOOGLE-PLAY.md §8).
 *
 * Produkterna i butikerna ska ha samma id som här: 'livstid' (engångsköp), 'ar' (ett år, förnyas
 * inte automatiskt) och 'prov14' (gratis provperiod i App Store, om den används).
 *
 * Filen får inte importera något: vite.config.ts läser `NATIVE_PURCHASES_READY` till
 * byggkontrollen (även när filen typkontrolleras med tsconfig.node.json – därför `globalThis` och
 * inte `window`), och native-koden får aldrig följa med i webbygget.
 */

/**
 * true när köp i appen är inkopplade (`src/native/purchases.ts`). Byggkontrollen
 * (scripts/commerce-guard.ts) stoppar App Store- och Google Play-byggen när den är false – annars
 * kan en app där det inte går att köpa skickas in av misstag.
 *
 * Satt till true när implementationen kopplades in (september 2026). Den är testad med ett mockat
 * tillägg men ännu INTE mot de riktiga butikerna: flaggan räknas som klar först när ägaren har
 * provat köp av 'livstid' och 'ar', ett avbrutet köp, "Återställ köp" och butikens priser på en
 * riktig telefon i TestFlight (sandlåda) och Play-testning (licenstestare). Gör det före första
 * inskickningen – och sätt tillbaka den till false om något inte fungerar.
 * Filen får inte importera något: byggkontrollen läser den.
 */
export const NATIVE_PURCHASES_READY: boolean = true

export type StoreProductId = 'livstid' | 'ar' | 'prov14'

/** Produkterna som finns i butikerna (samma id i App Store Connect och Play Console). */
export const STORE_PRODUCT_IDS: readonly StoreProductId[] = ['livstid', 'ar', 'prov14']

export interface StoreProduct {
  id: StoreProductId
  title: string
  /** Priset som butiken visar, redan formaterat (t.ex. "699,00 kr"). */
  displayPrice: string
}

export interface StoreEntitlement {
  product: StoreProductId
  /** Köptillfället, epoch-ms. */
  purchasedAt: number
  /** Går ut, epoch-ms. Saknas för livstid. */
  expiresAt?: number
  source: 'appstore' | 'play'
}

export type StorePurchaseResult = 'purchased' | 'cancelled' | 'pending' | 'failed'

export interface StorePurchases {
  /** true när köp i appen går att göra här (inbyggd app med IAP-tillägg). */
  available(): boolean
  /** Produkterna med butikens priser. */
  getProducts(): Promise<StoreProduct[]>
  purchase(id: StoreProductId): Promise<StorePurchaseResult>
  /** "Återställ köp": hämta tidigare köp från butiken (t.ex. på en ny telefon). */
  restore(): Promise<StoreEntitlement[]>
  /** De köp som gäller just nu. */
  currentEntitlements(): Promise<StoreEntitlement[]>
}

/** Webbversionen: inga köp i appen. */
const webStore: StorePurchases = {
  available: () => false,
  getProducts: async () => [],
  purchase: async () => 'failed',
  restore: async () => [],
  currentEntitlements: async () => [],
}

// ---------------------------------------------------------------------------
// De inbyggda apparna
// ---------------------------------------------------------------------------

/** Sätts av vite.config.ts (`define`); finns inte i testerna eller när vite.config läser filen. */
declare const __LAGOM_DISTRIBUTION__: string | undefined

/**
 * true i butiksbyggen. En konstant i bygget, så att allt nedan som gäller de inbyggda apparna
 * försvinner ur webbygget. I testerna är den true (utan `define`), så att vägen kan testas.
 */
const STORE_BUILD: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ !== 'web' : true

/**
 * Så länge väntar köpen på den inbyggda implementationen. Den lämnas när appen startar (normalt
 * inom någon sekund); svarar den inte räknas köp i appen som tillfälligt otillgängliga.
 */
export const NATIVE_WAIT_MS = 15_000

/** Körs Lagom som inbyggd app (Capacitor)? Samma kontroll som `detectRuntime` i src/config/platform.ts. */
function runsNatively(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return cap?.isNativePlatform?.() === true
  } catch {
    return false
  }
}

let nativeImpl: StorePurchases | null = null
/** Den inbyggda implementationen gick inte att starta (t.ex. ett trasigt tillägg). */
let nativeFailed = false
const nativeWaiters = new Set<() => void>()

/**
 * Den inbyggda implementationen (från `src/native/purchases.ts` när appen startar), eller null
 * om köp i appen inte gick att starta – då svarar köpen direkt att de inte är tillgängliga i
 * stället för att vänta.
 */
export function setNativeStorePurchases(impl: StorePurchases | null): void {
  nativeImpl = impl
  nativeFailed = impl === null
  const waiters = [...nativeWaiters]
  nativeWaiters.clear()
  for (const wake of waiters) wake()
}

/** Vänta på den inbyggda implementationen (högst `NATIVE_WAIT_MS`). null = inte tillgänglig. */
function nativeReady(): Promise<StorePurchases | null> {
  if (nativeImpl || nativeFailed) return Promise.resolve(nativeImpl)
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer)
      nativeWaiters.delete(wake)
      resolve(nativeImpl)
    }
    const timer = setTimeout(wake, NATIVE_WAIT_MS)
    nativeWaiters.add(wake)
  })
}

async function requireNative(): Promise<StorePurchases> {
  const impl = await nativeReady()
  if (!impl) throw new Error('Köp i appen är inte tillgängliga just nu')
  return impl
}

/**
 * Butiken i de inbyggda apparna – alltid samma objekt (komponenter har den i sina beroenden).
 * Före starten räknas köp i appen som tillgängliga, så att tillgången visas som "kontrolleras" i
 * stället för som utgången medan köpen hämtas.
 */
const nativeStore: StorePurchases = {
  available: () => (nativeImpl ? nativeImpl.available() : !nativeFailed),
  getProducts: async () => (await requireNative()).getProducts(),
  purchase: async (id) => {
    const impl = await nativeReady()
    return impl ? impl.purchase(id) : 'failed'
  },
  restore: async () => (await requireNative()).restore(),
  currentEntitlements: async () => (await requireNative()).currentEntitlements(),
}

let override: StorePurchases | null = null

/** Butiken för den här plattformen. */
export function getStorePurchases(): StorePurchases {
  if (override) return override
  if (STORE_BUILD && runsNatively()) return nativeStore
  return webStore
}

/** Endast för tester: byt ut butiken (null = tillbaka till standard, även för de inbyggda apparna). */
export function setStorePurchasesForTests(impl: StorePurchases | null): void {
  override = impl
  if (impl === null) {
    setNativeStorePurchases(null)
    nativeFailed = false
  }
}
