/**
 * Köp i appen i de inbyggda apparna: StoreKit 2 (App Store) och Google Play Billing 9 via
 * `@capgo/native-purchases` – direkt mellan telefonen och butiken, utan egen server och utan
 * extra konto (docs/NATIVE.md §2). Tillägget gör inga egna nätanrop.
 *
 * Laddas bara med `loadNative('purchases')` (src/native/index.ts). `registerNativePurchases()`
 * anropas när appen startar och lämnar implementationen till src/lib/storePurchases.ts, som resten
 * av appen använder (useAccess, premiumsidan, "Återställ köp").
 *
 * Produkterna (samma id i båda butikerna, alla hämtas och köps som `PURCHASE_TYPE.INAPP`):
 * - 'livstid': engångsköp (App Store: non-consumable; Play: engångsprodukt som aldrig förbrukas).
 * - 'ar': ett år som inte förnyas automatiskt (App Store: non-renewing subscription; Play:
 *   engångsprodukt). Butikerna ger inget slutdatum – året räknas från köpdatumet. I App Store kan
 *   ett nytt år köpas i förväg: alla köpta år (StoreKits `Transaction.all`) läggs efter varandra,
 *   så att inga betalda dagar går förlorade (`chainYears`). I Play går en engångsprodukt inte att
 *   köpa igen så länge den ägs, så ett utgånget år förbrukas (consume) först när ett nytt år köps –
 *   till dess syns "Årslicensen har gått ut" (och förnyelse i förväg är spärrad i appen).
 * - 'prov14': provperioden i iPhone-appen (non-consumable för 0 kr, riktlinje 3.1.1). Den räknas
 *   från det tidigaste köpet, så att den inte börjar om efter en ominstallation.
 *
 * Kvittering i Play: ett köp som inte kvitteras (acknowledge) inom 3 dagar återbetalas. Tillägget
 * kvitterar annars själv men stänger butiksanslutningen direkt efteråt (8.8.1), så här kvitteras
 * köpen uttryckligen – direkt efter köpet och vid varje hämtning av köpen (start, när appen
 * återfår fokus, "Återställ köp"). Då kvitteras också ett väntande köp som blev klart senare.
 *
 * Anropen till tillägget görs ett i taget: Android-delen stänger och öppnar butiksanslutningen vid
 * varje anrop, så två samtidiga anrop (t.ex. hämta köpen när appen återfår fokus medan köprutan är
 * öppen) kan tappa svaret på det första.
 *
 * Fel loggas lokalt med `logError(…, 'native:kop')` – utan köp-id, kvitton eller tokens.
 */
import { NativePurchases, PURCHASE_TYPE, type NativePurchasesPlugin, type Product, type Transaction } from '@capgo/native-purchases'
import { planById } from '../config/commerce'
import { refreshStoreEntitlements } from '../hooks/useAccess'
import { logError } from '../lib/errorLog'
import {
  setNativeStorePurchases,
  STORE_PRODUCT_IDS,
  type StoreEntitlement,
  type StoreProduct,
  type StoreProductId,
  type StorePurchaseResult,
  type StorePurchases,
} from '../lib/storePurchases'
import { nativePlatform } from './index'

export type StorePlatform = 'ios' | 'android'

const DAY_MS = 86_400_000

/** Årslicensens längd – samma som i useAccess och på webben (365 dagar). */
export const YEAR_MS = (planById('ar')?.durationDays ?? 365) * DAY_MS

/** Längsta väntan på ett anrop utan köpruta (produkter, köpen, kvittering). */
export const CALL_TIMEOUT_MS = 45_000
/** "Återställ köp" på iPhone kan be om lösenordet till Apple-kontot. */
export const RESTORE_TIMEOUT_MS = 5 * 60_000
/** Köprutan: man kan behöva lägga till ett kort eller godkänna betalningen i banken. */
export const PURCHASE_TIMEOUT_MS = 15 * 60_000

/** Play Billing: `Purchase.PurchaseState` (1 = betalt, 2 = väntar; tillägget skickar dem som text). */
const PLAY_PURCHASED = '1'
const PLAY_PENDING = '2'

/** Ordningen i köppanelen: år, livstid (och provperioden sist). */
const PRODUCT_ORDER: readonly StoreProductId[] = ['ar', 'livstid', 'prov14']

const LOG_CONTEXT = 'native:kop'

function isProductId(value: unknown): value is StoreProductId {
  return typeof value === 'string' && (STORE_PRODUCT_IDS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Hjälpfunktioner (exporterade för testerna)
// ---------------------------------------------------------------------------

/** Vänta högst `ms` på ett anrop till butiken – annars ett fel (kön får inte fastna). */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: butiken svarade inte inom ${Math.round(ms / 1000)} s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Säger telefonen att den saknar uppkoppling? */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function errorCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  return typeof code === 'string' ? code : ''
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  const message = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined
  return typeof message === 'string' ? message : ''
}

/**
 * Vad ett avvisat köp betyder. Tillägget (8.8.1) avvisar med:
 * - iPhone: "User cancelled" (avbrutet), "Transaction pending" ("Be om lov att köpa", SCA …).
 *   "Återställ köp" (AppStore.sync) avvisas med StoreKits egen text på telefonens språk – på en
 *   svensk iPhone t.ex. att åtgärden avbröts.
 * - Android: koden USER_CANCELED (avbrutet), "Purchase is pending" (t.ex. kontantbetalning),
 *   koden ITEM_ALREADY_OWNED (produkten ägs redan, t.ex. köpt på en annan telefon).
 */
export function classifyPurchaseError(error: unknown): 'cancelled' | 'pending' | 'owned' | 'failed' {
  const code = errorCode(error).toUpperCase()
  const message = errorMessage(error)
  if (code === 'USER_CANCELED' || code === 'USER_CANCELLED' || /\buser ?cancel|\bcancell?ed\b|avbr(?:öt|ut|yt|ö)/i.test(message)) return 'cancelled'
  if (/\bpending\b/i.test(message)) return 'pending'
  if (code === 'ITEM_ALREADY_OWNED') return 'owned'
  return 'failed'
}

/**
 * Köpdatumet som epoch-ms, eller null. iPhone ger ISO 8601 i UTC. Play-delen av tillägget (8.8.1)
 * skriver telefonens lokala tid med ett "Z" efter (SimpleDateFormat utan UTC) – den läses därför
 * som lokal tid, annars skulle köpet hamna en till två timmar fel i Sverige.
 */
export function parseStoreDate(value: string | null | undefined, platform: StorePlatform): number | null {
  if (!value) return null
  const text = platform === 'android' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ? value.slice(0, -1) : value
  const ms = Date.parse(text)
  return Number.isFinite(ms) ? ms : null
}

/** Ett köp från butiken som `StoreEntitlement`, eller null om det inte ger tillgång. */
export function toEntitlement(tx: Transaction, platform: StorePlatform): StoreEntitlement | null {
  const product = tx.productIdentifier
  if (!isProductId(product)) return null
  // Play: bara betalda köp (inte väntande). Återbetalda köp försvinner ur listan av sig själva.
  if (platform === 'android' && tx.purchaseState !== PLAY_PURCHASED) return null
  // iPhone: ett återbetalt eller återkallat köp har `revocationDate`.
  if (platform === 'ios' && tx.revocationDate) return null
  let purchasedAt = parseStoreDate(tx.purchaseDate, platform)
  // Provperioden räknas från det ursprungliga köpet, om butiken ger det (den får aldrig börja om).
  const original = product === 'prov14' ? parseStoreDate(tx.originalPurchaseDate, platform) : null
  if (original !== null) purchasedAt = purchasedAt === null ? original : Math.min(purchasedAt, original)
  if (purchasedAt === null) {
    // Utan köpdatum går årets slut (och provperiodens start) inte att räkna ut – hellre inget än
    // ett år som aldrig tar slut. En livstidslicens gäller ändå.
    if (product !== 'livstid') {
      logError(new Error(`Köpet (${product}) saknar ett giltigt köpdatum`), LOG_CONTEXT)
      return null
    }
    purchasedAt = Date.now()
  }
  const source = platform === 'ios' ? 'appstore' : 'play'
  if (product !== 'ar') return { product, purchasedAt, source }
  const expiresAt = parseStoreDate(tx.expirationDate, platform) ?? purchasedAt + YEAR_MS
  return { product, purchasedAt, expiresAt, source }
}

/** Butikens produkter → `StoreProduct` i köppanelens ordning (en rad per produkt). */
export function toStoreProducts(products: readonly Product[]): StoreProduct[] {
  const byId = new Map<StoreProductId, Product>()
  for (const p of products) {
    if (!isProductId(p.identifier)) continue
    const previous = byId.get(p.identifier)
    // Play kan ge en rad per erbjudande för samma produkt – det ordinarie (utan offerId) gäller.
    if (!previous || (previous.offerId && !p.offerId)) byId.set(p.identifier, p)
  }
  return PRODUCT_ORDER.flatMap((id) => {
    const p = byId.get(id)
    return p ? [{ id, title: (p.title ?? '').trim(), displayPrice: (p.priceString ?? '').trim() }] : []
  })
}

/**
 * Slutet på årslicenserna när de läggs efter varandra: varje år börjar när det förra slutar (eller
 * vid köpet, om det förra redan hade gått ut). Ett år som köps i förväg förlänger alltså licensen
 * med ett helt år. undefined utan köp.
 */
export function chainYears(purchases: readonly number[], yearMs: number = YEAR_MS): number | undefined {
  let end: number | undefined
  for (const at of [...purchases].sort((a, b) => a - b)) end = Math.max(at, end ?? at) + yearMs
  return end
}

/**
 * iPhone: `Transaction.currentEntitlements` ger bara det senaste köpet per produkt. Med hela
 * historiken (`Transaction.all`) läggs köpta år efter varandra och provperioden räknas från det
 * första köpet. Bara köp fram till det senaste gällande köpet räknas (samma Apple-konto), och
 * återkallade köp aldrig. `current` är köpen från `currentEntitlements`.
 */
export function withIosHistory(current: readonly StoreEntitlement[], history: readonly Transaction[]): StoreEntitlement[] {
  const earlier = (id: 'ar' | 'prov14', until: number) =>
    history.flatMap((tx) => {
      if (tx.productIdentifier !== id) return []
      const e = toEntitlement(tx, 'ios')
      return e && e.purchasedAt <= until ? [e.purchasedAt] : []
    })
  return current.map((e) => {
    if (e.product === 'ar') {
      const end = chainYears([...earlier('ar', e.purchasedAt).filter((at) => at < e.purchasedAt), e.purchasedAt])
      return end !== undefined && end > (e.expiresAt ?? 0) ? { ...e, expiresAt: end } : e
    }
    if (e.product === 'prov14') {
      const first = Math.min(e.purchasedAt, ...earlier('prov14', e.purchasedAt))
      return first < e.purchasedAt ? { ...e, purchasedAt: first } : e
    }
    return e
  })
}

function isActivePaid(e: StoreEntitlement, id: StoreProductId, now: number): boolean {
  return e.product === id && (e.product === 'livstid' || e.product === 'ar') && (e.expiresAt === undefined || e.expiresAt > now)
}

// ---------------------------------------------------------------------------
// Implementationen
// ---------------------------------------------------------------------------

/** Köp i appen för iPhone eller Android. `plugin` kan bytas ut i testerna. */
export function createNativeStorePurchases(platform: StorePlatform, plugin: NativePurchasesPlugin = NativePurchases): StorePurchases {
  // Ett anrop i taget (se överst i filen).
  let queue: Promise<unknown> = Promise.resolve()
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  async function fetchPurchases(onlyCurrentEntitlements = true): Promise<Transaction[]> {
    // onlyCurrentEntitlements: på iPhone `Transaction.currentEntitlements` – bara det inloggade
    // Apple-kontots gällande köp (inte andra konton som har använt telefonen). false: hela
    // historiken (`Transaction.all`), för att lägga köpta år efter varandra. Play: queryPurchases.
    const { purchases } = await withTimeout(
      plugin.getPurchases({ productType: PURCHASE_TYPE.INAPP, onlyCurrentEntitlements }),
      CALL_TIMEOUT_MS,
      'getPurchases',
    )
    return Array.isArray(purchases) ? purchases : []
  }

  /** Kvittera ett köp i Play. Ett fel loggas – nästa hämtning av köpen försöker igen. */
  async function acknowledge(purchaseToken: string): Promise<void> {
    try {
      await withTimeout(plugin.acknowledgePurchase({ purchaseToken }), CALL_TIMEOUT_MS, 'acknowledgePurchase')
    } catch (error) {
      logError(error, LOG_CONTEXT)
    }
  }

  /** Play: kvittera betalda köp som inte är kvitterade (t.ex. ett väntande köp som blev klart senare). */
  async function acknowledgeAll(purchases: readonly Transaction[]): Promise<void> {
    if (platform !== 'android') return
    for (const tx of purchases) {
      if (tx.purchaseState === PLAY_PURCHASED && tx.isAcknowledged === false && tx.purchaseToken) await acknowledge(tx.purchaseToken)
    }
  }

  /** Köpen som gäller (Play: och kvittera dem som inte är kvitterade). */
  async function readEntitlements(): Promise<StoreEntitlement[]> {
    const purchases = await fetchPurchases()
    await acknowledgeAll(purchases)
    const current = purchases.flatMap((tx) => {
      const e = toEntitlement(tx, platform)
      return e ? [e] : []
    })
    // iPhone: årslicenser som köpts i förväg och provperiodens första köp (se withIosHistory).
    if (platform !== 'ios' || !current.some((e) => e.product === 'ar' || e.product === 'prov14')) return current
    try {
      return withIosHistory(current, await fetchPurchases(false))
    } catch (error) {
      // Historiken gick inte att läsa – det senaste köpet gäller tills nästa hämtning.
      logError(error, LOG_CONTEXT)
      return current
    }
  }

  /**
   * Play: ett nytt år kan köpas först när det förra har förbrukats. Förbrukar utgångna år och
   * returnerar true om ett år fortfarande gäller (då går det inte att köpa ett nytt i Play).
   */
  async function prepareYearOnPlay(): Promise<boolean> {
    const now = Date.now()
    let stillValid = false
    for (const tx of await fetchPurchases()) {
      if (tx.productIdentifier !== 'ar' || tx.purchaseState !== PLAY_PURCHASED) continue
      const e = toEntitlement(tx, 'android')
      if (e?.expiresAt !== undefined && e.expiresAt <= now && tx.purchaseToken) {
        await withTimeout(plugin.consumePurchase({ purchaseToken: tx.purchaseToken }), CALL_TIMEOUT_MS, 'consumePurchase')
      } else {
        stillValid = true
      }
    }
    return stillValid
  }

  /** Resultatet av ett genomfört anrop till köprutan. */
  async function settle(tx: Transaction): Promise<StorePurchaseResult> {
    if (platform === 'ios') return tx.revocationDate ? 'failed' : 'purchased'
    if (tx.purchaseState === PLAY_PENDING) return 'pending'
    if (tx.purchaseState !== PLAY_PURCHASED) {
      logError(new Error(`Köpet har okänt tillstånd i Google Play (${String(tx.purchaseState)})`), LOG_CONTEXT)
      return 'failed'
    }
    if (tx.isAcknowledged !== true && tx.purchaseToken) await acknowledge(tx.purchaseToken)
    return 'purchased'
  }

  /** Produkten ägs redan (Play: ITEM_ALREADY_OWNED) – gäller den, eller väntar den på betalning? */
  async function ownedResult(id: StoreProductId): Promise<StorePurchaseResult | null> {
    const purchases = await fetchPurchases()
    const now = Date.now()
    const owned = purchases.filter((tx) => tx.productIdentifier === id)
    await acknowledgeAll(owned)
    if (
      owned.some((tx) => {
        const e = toEntitlement(tx, platform)
        return e !== null && isActivePaid(e, id, now)
      })
    ) {
      return 'purchased'
    }
    if (platform === 'android' && owned.some((tx) => tx.purchaseState === PLAY_PENDING)) return 'pending'
    return null
  }

  return {
    available: () => true,

    getProducts: () =>
      serial(async () => {
        try {
          const { products } = await withTimeout(
            plugin.getProducts({ productIdentifiers: [...STORE_PRODUCT_IDS], productType: PURCHASE_TYPE.INAPP }),
            CALL_TIMEOUT_MS,
            'getProducts',
          )
          return toStoreProducts(Array.isArray(products) ? products : [])
        } catch (error) {
          logError(error, LOG_CONTEXT)
          throw error
        }
      }),

    purchase: (id) =>
      serial(async (): Promise<StorePurchaseResult> => {
        try {
          if (platform === 'android' && id === 'ar' && (await prepareYearOnPlay())) {
            logError(new Error('Årslicensen från Google Play gäller fortfarande – ett nytt år kan köpas när den har gått ut'), LOG_CONTEXT)
            return 'failed'
          }
          const tx = await withTimeout(
            plugin.purchaseProduct({
              productIdentifier: id,
              productType: PURCHASE_TYPE.INAPP,
              // Android: kvittera själva (se överst i filen). iPhone: tillägget avslutar
              // transaktionen (finish) direkt, som det ska för köp som inte förbrukas.
              ...(platform === 'android' ? { autoAcknowledgePurchases: false } : {}),
            }),
            PURCHASE_TIMEOUT_MS,
            'purchaseProduct',
          )
          return await settle(tx)
        } catch (error) {
          const kind = classifyPurchaseError(error)
          if (kind === 'cancelled' || kind === 'pending') return kind
          if (kind === 'owned') {
            const owned = await ownedResult(id).catch(() => null)
            if (owned) return owned
          }
          logError(error, LOG_CONTEXT)
          return 'failed'
        }
      }),

    restore: () =>
      serial(async () => {
        // iPhone: AppStore.sync() hämtar köpen från Apple (kan be om lösenordet). Play har ingen
        // motsvarighet – köplistan kommer alltid från Google Play.
        let syncError: unknown = null
        if (platform === 'ios') {
          try {
            await withTimeout(plugin.restorePurchases(), RESTORE_TIMEOUT_MS, 'restorePurchases')
          } catch (error) {
            syncError = error
          }
        }
        let list: StoreEntitlement[]
        try {
          list = await readEntitlements()
        } catch (error) {
          logError(error, LOG_CONTEXT)
          throw error
        }
        // Gick synkningen inte att göra utan uppkoppling och inget betalt köp finns på telefonen:
        // säg att återställningen misslyckades i stället för "Inga köp att återställa". Annars (t.ex.
        // när man själv avbröt inloggningen till Apple-kontot, vars felmeddelande är på telefonens
        // språk) räcker köpen som redan finns på telefonen – och svaret blir neutralt.
        const now = Date.now()
        if (syncError !== null && classifyPurchaseError(syncError) !== 'cancelled') {
          logError(syncError, LOG_CONTEXT)
          if (isOffline() && !list.some((e) => isActivePaid(e, e.product, now))) throw syncError
        }
        return list
      }),

    currentEntitlements: () =>
      serial(async () => {
        try {
          return await readEntitlements()
        } catch (error) {
          logError(error, LOG_CONTEXT)
          throw error
        }
      }),
  }
}

let registered = false

/**
 * Koppla in köp i appen – anropas en gång när appen startar (startNative i src/native/init.ts).
 * Kastar aldrig: går köpen inte att starta lämnas null, så att appen direkt visar att köp i appen
 * inte är tillgängliga i stället för att vänta.
 */
export function registerNativePurchases(): void {
  if (registered) return
  try {
    const platform = nativePlatform()
    if (platform === 'web') {
      setNativeStorePurchases(null)
      return
    }
    setNativeStorePurchases(createNativeStorePurchases(platform))
    registered = true
    // Hämta köpen direkt: en hämtning som gav upp innan köpen hann kopplas in (NATIVE_WAIT_MS)
    // skulle annars inte göras om förrän appen återfår fokus.
    void refreshStoreEntitlements({ fresh: true })
    if (platform === 'ios') {
      // Köp som blir klara utanför köprutan: "Be om lov att köpa" som godkänns, köp på en annan
      // enhet med samma Apple-konto och återbetalningar (StoreKit 2 `Transaction.updates`).
      NativePurchases.addListener('transactionUpdated', () => {
        void refreshStoreEntitlements({ fresh: true })
      }).catch((error: unknown) => logError(error, LOG_CONTEXT))
    }
  } catch (error) {
    logError(error, LOG_CONTEXT)
    if (!registered) setNativeStorePurchases(null)
  }
}

/** Endast för tester: glöm att köpen har kopplats in. */
export function resetNativePurchasesForTests(): void {
  registered = false
}
