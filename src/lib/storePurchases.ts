/**
 * Köp i appen (App Store och Google Play) – ett litet gränssnitt som resten av appen använder.
 *
 * Val av tillägg: helst ett som talar direkt med StoreKit 2 och Play Billing utan egen server
 * (t.ex. cordova-plugin-purchase). Ett tillägg med egen server, som RevenueCat, gör leverantören
 * till personuppgiftsbiträde (köphistorik och användar-id) – då måste integritetspolicyn,
 * registerförteckningen, App Privacy och Data safety ändras före inskickningen
 * (docs/APP-STORE.md §7, docs/GOOGLE-PLAY.md §8).
 *
 * I dag finns bara webbversionen: den säger att köp i appen inte är tillgängliga och returnerar
 * tomma listor, så att appen beter sig precis som förut. När Capacitor installeras ersätts
 * `webStore` av en implementation med ett IAP-tillägg (StoreKit 2 på iPhone, Play Billing på
 * Android) – resten av appen behöver då inte ändras.
 *
 * Produkterna i butikerna ska ha samma id som här: 'livstid' (engångsköp), 'ar' (ett år, förnyas
 * inte automatiskt) och 'prov14' (gratis provperiod i butiken, om den används).
 */

/**
 * true när en riktig implementation av köp i appen (StoreKit 2 på iPhone, Play Billing på
 * Android) är inkopplad i `getStorePurchases` nedan. Byggkontrollen (scripts/commerce-guard.ts)
 * stoppar App Store- och Google Play-byggen så länge den är false – annars kan en app där det inte
 * går att köpa skickas in av misstag. Sätt den till true först när köp, "Återställ köp" och
 * butikens priser fungerar på en riktig telefon (TestFlight eller Play-testning).
 * Filen får inte importera något: byggkontrollen läser den.
 */
export const NATIVE_PURCHASES_READY: boolean = false

export type StoreProductId = 'livstid' | 'ar' | 'prov14'

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

let override: StorePurchases | null = null

/** Butiken för den här plattformen. */
export function getStorePurchases(): StorePurchases {
  return override ?? webStore
}

/** Endast för tester: byt ut butiken (null = tillbaka till standard). */
export function setStorePurchasesForTests(impl: StorePurchases | null): void {
  override = impl
}
