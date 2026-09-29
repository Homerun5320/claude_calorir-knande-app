/**
 * Köp i appen (StoreKit 2 / Google Play Billing via @capgo/native-purchases) med ett mockat
 * tillägg: produkter och priser, köp (genomfört, avbrutet, väntande, fel), kvittering i Play,
 * årslicensen, "Återställ köp", ett anrop i taget – och inkopplingen i src/lib/storePurchases.ts.
 */
import type { Transaction } from '@capgo/native-purchases'
import { getStorePurchases, NATIVE_WAIT_MS, setNativeStorePurchases, setStorePurchasesForTests, type StorePurchases } from '../lib/storePurchases'
import {
  CALL_TIMEOUT_MS,
  chainYears,
  classifyPurchaseError,
  createNativeStorePurchases,
  parseStoreDate,
  registerNativePurchases,
  resetNativePurchasesForTests,
  YEAR_MS,
} from './purchases'

const mocks = vi.hoisted(() => ({
  native: false,
  logError: vi.fn(),
  refresh: vi.fn(async () => {}),
  plugin: {
    getProducts: vi.fn(),
    purchaseProduct: vi.fn(),
    getPurchases: vi.fn(),
    restorePurchases: vi.fn(),
    acknowledgePurchase: vi.fn(),
    consumePurchase: vi.fn(),
    addListener: vi.fn(),
  },
}))

vi.mock('@capgo/native-purchases', () => ({ NativePurchases: mocks.plugin, PURCHASE_TYPE: { INAPP: 'inapp', SUBS: 'subs' } }))
vi.mock('../config/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/platform')>()),
  isNativeApp: () => mocks.native,
}))
vi.mock('../lib/errorLog', () => ({ logError: mocks.logError }))
vi.mock('../hooks/useAccess', () => ({ refreshStoreEntitlements: mocks.refresh }))

const DAY_MS = 86_400_000

/** En transaktion som tillägget ger den (fälten som inte anges saknas). */
function tx(fields: Partial<Transaction> & { productIdentifier: string }): Transaction {
  return { transactionId: 't1', purchaseDate: '2026-01-10T08:00:00Z', willCancel: null, ...fields } as Transaction
}

/** Köp i Play: betalt ('1') och kvitterat om inget annat anges. */
function playTx(fields: Partial<Transaction> & { productIdentifier: string }): Transaction {
  return tx({ purchaseState: '1', isAcknowledged: true, purchaseToken: `token-${fields.productIdentifier}`, ...fields })
}

function capacitorError(message: string, code?: string): Error {
  return Object.assign(new Error(message), code ? { code } : {})
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mocks.plugin.getProducts.mockResolvedValue({ products: [] })
  mocks.plugin.getPurchases.mockResolvedValue({ purchases: [] })
  mocks.plugin.restorePurchases.mockResolvedValue(undefined)
  mocks.plugin.acknowledgePurchase.mockResolvedValue(undefined)
  mocks.plugin.consumePurchase.mockResolvedValue(undefined)
  mocks.plugin.addListener.mockResolvedValue({ remove: async () => {} })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const fn of Object.values(mocks.plugin)) fn.mockReset()
  mocks.logError.mockReset()
  mocks.refresh.mockReset()
  mocks.native = false
  setStorePurchasesForTests(null)
  resetNativePurchasesForTests()
})

describe('produkter och priser', () => {
  it('hämtar alla tre produkterna som engångsköp och visar butikens pris', async () => {
    mocks.plugin.getProducts.mockResolvedValue({
      products: [
        { identifier: 'livstid', title: ' Livstidslicens ', priceString: '699,00 kr' },
        { identifier: 'okand', title: 'Något annat', priceString: '1 kr' },
        { identifier: 'ar', title: 'Årslicens', priceString: '349,00 kr' },
      ],
    })
    const store = createNativeStorePurchases('ios')
    expect(store.available()).toBe(true)
    await expect(store.getProducts()).resolves.toEqual([
      { id: 'ar', title: 'Årslicens', displayPrice: '349,00 kr' },
      { id: 'livstid', title: 'Livstidslicens', displayPrice: '699,00 kr' },
    ])
    expect(mocks.plugin.getProducts).toHaveBeenCalledWith({ productIdentifiers: ['livstid', 'ar', 'prov14'], productType: 'inapp' })
  })

  it('Play: en rad per produkt – det ordinarie erbjudandet gäller', async () => {
    mocks.plugin.getProducts.mockResolvedValue({
      products: [
        { identifier: 'livstid', title: 'Livstidslicens', priceString: '499,00 kr', offerId: 'rea' },
        { identifier: 'livstid', title: 'Livstidslicens', priceString: '699,00 kr', offerId: null },
      ],
    })
    await expect(createNativeStorePurchases('android').getProducts()).resolves.toEqual([{ id: 'livstid', title: 'Livstidslicens', displayPrice: '699,00 kr' }])
  })

  it('ett fel från butiken kastas vidare och loggas', async () => {
    mocks.plugin.getProducts.mockRejectedValue(new Error('Product not found'))
    await expect(createNativeStorePurchases('android').getProducts()).rejects.toThrow('Product not found')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:kop')
  })
})

describe('köp på iPhone (StoreKit 2)', () => {
  it('ett genomfört köp – engångsköp utan isConsumable, tillägget avslutar transaktionen', async () => {
    mocks.plugin.purchaseProduct.mockResolvedValue(tx({ productIdentifier: 'livstid' }))
    await expect(createNativeStorePurchases('ios').purchase('livstid')).resolves.toBe('purchased')
    expect(mocks.plugin.purchaseProduct).toHaveBeenCalledWith({ productIdentifier: 'livstid', productType: 'inapp' })
    expect(mocks.plugin.acknowledgePurchase).not.toHaveBeenCalled()
  })

  it('avbrutet och väntande ("Be om lov att köpa") är inga fel', async () => {
    const store = createNativeStorePurchases('ios')
    mocks.plugin.purchaseProduct.mockRejectedValueOnce(capacitorError('User cancelled'))
    await expect(store.purchase('ar')).resolves.toBe('cancelled')
    mocks.plugin.purchaseProduct.mockRejectedValueOnce(capacitorError('Transaction pending'))
    await expect(store.purchase('ar')).resolves.toBe('pending')
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('andra fel ger "failed" och loggas', async () => {
    mocks.plugin.purchaseProduct.mockRejectedValue(capacitorError('Cannot find product for id ar'))
    await expect(createNativeStorePurchases('ios').purchase('ar')).resolves.toBe('failed')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:kop')
  })
})

describe('köp i Google Play', () => {
  it('kvitterar köpet själv (inom 3 dagar) i stället för tilläggets automatiska kvittering', async () => {
    mocks.plugin.purchaseProduct.mockResolvedValue(playTx({ productIdentifier: 'livstid', isAcknowledged: false, purchaseToken: 'abc' }))
    await expect(createNativeStorePurchases('android').purchase('livstid')).resolves.toBe('purchased')
    expect(mocks.plugin.purchaseProduct).toHaveBeenCalledWith({ productIdentifier: 'livstid', productType: 'inapp', autoAcknowledgePurchases: false })
    expect(mocks.plugin.purchaseProduct.mock.calls[0][0]).not.toHaveProperty('isConsumable')
    expect(mocks.plugin.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: 'abc' })
  })

  it('en misslyckad kvittering loggas, men köpet är genomfört (nästa hämtning kvitterar)', async () => {
    mocks.plugin.purchaseProduct.mockResolvedValue(playTx({ productIdentifier: 'livstid', isAcknowledged: false }))
    mocks.plugin.acknowledgePurchase.mockRejectedValue(new Error('Failed to acknowledge purchase: SERVICE_UNAVAILABLE'))
    await expect(createNativeStorePurchases('android').purchase('livstid')).resolves.toBe('purchased')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:kop')
  })

  it('avbrutet (USER_CANCELED) och väntande betalning', async () => {
    const store = createNativeStorePurchases('android')
    mocks.plugin.purchaseProduct.mockRejectedValueOnce(capacitorError('Purchase is not purchased', 'USER_CANCELED'))
    await expect(store.purchase('livstid')).resolves.toBe('cancelled')
    mocks.plugin.purchaseProduct.mockRejectedValueOnce(capacitorError('Purchase is pending'))
    await expect(store.purchase('livstid')).resolves.toBe('pending')
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('redan ägd produkt (ITEM_ALREADY_OWNED): gäller den räknas köpet som genomfört', async () => {
    const store = createNativeStorePurchases('android')
    mocks.plugin.purchaseProduct.mockRejectedValue(capacitorError('Purchase is not purchased', 'ITEM_ALREADY_OWNED'))
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [playTx({ productIdentifier: 'livstid', isAcknowledged: false, purchaseToken: 'gammal' })] })
    await expect(store.purchase('livstid')).resolves.toBe('purchased')
    expect(mocks.plugin.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: 'gammal' })
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [playTx({ productIdentifier: 'livstid', purchaseState: '2' })] })
    await expect(store.purchase('livstid')).resolves.toBe('pending')
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [] })
    await expect(store.purchase('livstid')).resolves.toBe('failed')
  })

  it('årslicensen: ett utgånget år förbrukas först, så att ett nytt kan köpas', async () => {
    const old = new Date(Date.now() - 400 * DAY_MS)
    const local = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:00:00Z`
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [playTx({ productIdentifier: 'ar', purchaseDate: local(old), purchaseToken: 'fjol' })] })
    mocks.plugin.purchaseProduct.mockResolvedValue(playTx({ productIdentifier: 'ar' }))
    await expect(createNativeStorePurchases('android').purchase('ar')).resolves.toBe('purchased')
    expect(mocks.plugin.consumePurchase).toHaveBeenCalledWith({ purchaseToken: 'fjol' })
    expect(mocks.plugin.consumePurchase.mock.invocationCallOrder[0]).toBeLessThan(mocks.plugin.purchaseProduct.mock.invocationCallOrder[0])
  })

  it('årslicensen: ett år som gäller förbrukas aldrig (då går inget nytt år att köpa i Play)', async () => {
    const recent = new Date(Date.now() - 10 * DAY_MS).toISOString().slice(0, 19) + 'Z'
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [playTx({ productIdentifier: 'ar', purchaseDate: recent })] })
    await expect(createNativeStorePurchases('android').purchase('ar')).resolves.toBe('failed')
    expect(mocks.plugin.consumePurchase).not.toHaveBeenCalled()
    expect(mocks.plugin.purchaseProduct).not.toHaveBeenCalled()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:kop')
  })

  it('livstid köps utan att något förbrukas', async () => {
    mocks.plugin.purchaseProduct.mockResolvedValue(playTx({ productIdentifier: 'livstid' }))
    await createNativeStorePurchases('android').purchase('livstid')
    expect(mocks.plugin.getPurchases).not.toHaveBeenCalled()
    expect(mocks.plugin.consumePurchase).not.toHaveBeenCalled()
  })
})

describe('gällande köp', () => {
  it('iPhone: currentEntitlements, årets slut räknas från köpet och återbetalda köp räknas inte', async () => {
    mocks.plugin.getPurchases.mockResolvedValue({
      purchases: [
        tx({ productIdentifier: 'livstid', purchaseDate: '2025-03-01T12:00:00Z', ownershipType: 'familyShared' }),
        tx({ productIdentifier: 'ar', purchaseDate: '2026-01-10T08:00:00Z' }),
        tx({ productIdentifier: 'prov14', purchaseDate: '2026-01-01T09:30:00Z' }),
        tx({ productIdentifier: 'ar', purchaseDate: '2026-02-01T08:00:00Z', revocationDate: '2026-02-03T08:00:00Z' }),
        tx({ productIdentifier: 'okand' }),
      ],
    })
    const list = await createNativeStorePurchases('ios').currentEntitlements()
    expect(mocks.plugin.getPurchases).toHaveBeenCalledWith({ productType: 'inapp', onlyCurrentEntitlements: true })
    const bought = Date.UTC(2026, 0, 10, 8)
    expect(list).toEqual([
      { product: 'livstid', purchasedAt: Date.UTC(2025, 2, 1, 12), source: 'appstore' },
      { product: 'ar', purchasedAt: bought, expiresAt: bought + 365 * DAY_MS, source: 'appstore' },
      { product: 'prov14', purchasedAt: Date.UTC(2026, 0, 1, 9, 30), source: 'appstore' },
    ])
    expect(YEAR_MS).toBe(365 * DAY_MS)
  })

  it('iPhone: ett år som köps i förväg läggs efter det som gäller (hela historiken, utan återkallade köp)', async () => {
    const current = [tx({ productIdentifier: 'ar', transactionId: 't3', purchaseDate: '2026-12-20T08:00:00Z' })]
    const history = [
      tx({ productIdentifier: 'ar', transactionId: 't1', purchaseDate: '2026-01-10T08:00:00Z' }),
      tx({ productIdentifier: 'ar', transactionId: 't2', purchaseDate: '2026-06-01T08:00:00Z', revocationDate: '2026-06-02T08:00:00Z' }),
      ...current,
    ]
    mocks.plugin.getPurchases.mockImplementation(async ({ onlyCurrentEntitlements }: { onlyCurrentEntitlements: boolean }) => ({
      purchases: onlyCurrentEntitlements ? current : history,
    }))
    const list = await createNativeStorePurchases('ios').currentEntitlements()
    expect(mocks.plugin.getPurchases).toHaveBeenCalledWith({ productType: 'inapp', onlyCurrentEntitlements: false })
    // Förnyad 21 dagar före slutet: det nya året börjar när det första slutar – inga dagar försvinner.
    const first = Date.UTC(2026, 0, 10, 8)
    expect(list).toEqual([{ product: 'ar', purchasedAt: Date.UTC(2026, 11, 20, 8), expiresAt: first + 2 * YEAR_MS, source: 'appstore' }])
  })

  it('iPhone: provperioden räknas från det första köpet, och utan historik gäller det senaste köpet', async () => {
    const current = [tx({ productIdentifier: 'prov14', purchaseDate: '2026-03-01T08:00:00Z' })]
    mocks.plugin.getPurchases.mockImplementation(async ({ onlyCurrentEntitlements }: { onlyCurrentEntitlements: boolean }) => ({
      purchases: onlyCurrentEntitlements ? current : [tx({ productIdentifier: 'prov14', purchaseDate: '2026-02-01T08:00:00Z' }), ...current],
    }))
    await expect(createNativeStorePurchases('ios').currentEntitlements()).resolves.toEqual([
      { product: 'prov14', purchasedAt: Date.UTC(2026, 1, 1, 8), source: 'appstore' },
    ])
    mocks.plugin.getPurchases.mockImplementation(async ({ onlyCurrentEntitlements }: { onlyCurrentEntitlements: boolean }) => {
      if (!onlyCurrentEntitlements) throw new Error('historiken svarar inte')
      return { purchases: current }
    })
    await expect(createNativeStorePurchases('ios').currentEntitlements()).resolves.toEqual([
      { product: 'prov14', purchasedAt: Date.UTC(2026, 2, 1, 8), source: 'appstore' },
    ])
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:kop')
  })

  it('Play: historiken hämtas inte (där går ett år inte att köpa i förväg)', async () => {
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [playTx({ productIdentifier: 'ar' })] })
    await createNativeStorePurchases('android').currentEntitlements()
    expect(mocks.plugin.getPurchases).toHaveBeenCalledTimes(1)
  })

  it('Play: bara betalda köp, lokal tid i köpdatumet och okvitterade köp kvitteras', async () => {
    mocks.plugin.getPurchases.mockResolvedValue({
      purchases: [
        playTx({ productIdentifier: 'ar', purchaseDate: '2026-01-10T08:00:00Z', isAcknowledged: false, purchaseToken: 'senare' }),
        playTx({ productIdentifier: 'livstid', purchaseState: '2', isAcknowledged: false, purchaseToken: 'vantar' }),
      ],
    })
    const list = await createNativeStorePurchases('android').currentEntitlements()
    const bought = new Date(2026, 0, 10, 8).getTime()
    expect(list).toEqual([{ product: 'ar', purchasedAt: bought, expiresAt: bought + 365 * DAY_MS, source: 'play' }])
    expect(mocks.plugin.acknowledgePurchase).toHaveBeenCalledTimes(1)
    expect(mocks.plugin.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: 'senare' })
  })

  it('ett år utan giltigt köpdatum räknas inte (det får aldrig bli livstid), en livstidslicens gäller ändå', async () => {
    mocks.plugin.getPurchases.mockResolvedValue({
      purchases: [tx({ productIdentifier: 'ar', purchaseDate: 'okänt' }), tx({ productIdentifier: 'livstid', purchaseDate: '' })],
    })
    const list = await createNativeStorePurchases('ios').currentEntitlements()
    expect(list.map((e) => e.product)).toEqual(['livstid'])
    expect(list[0].expiresAt).toBeUndefined()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:kop')
  })

  it('ett fel från butiken kastas vidare (useAccess behåller då de senast kända köpen)', async () => {
    mocks.plugin.getPurchases.mockRejectedValue(capacitorError('Failed to query purchases: inapp: SERVICE_UNAVAILABLE', 'QUERY_PURCHASES_FAILED'))
    await expect(createNativeStorePurchases('android').currentEntitlements()).rejects.toThrow('SERVICE_UNAVAILABLE')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:kop')
  })
})

describe('Återställ köp', () => {
  it('iPhone: synkar med App Store (AppStore.sync) och hämtar sedan köpen', async () => {
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [tx({ productIdentifier: 'livstid' })] })
    const list = await createNativeStorePurchases('ios').restore()
    expect(list).toEqual([expect.objectContaining({ product: 'livstid', source: 'appstore' })])
    expect(mocks.plugin.restorePurchases.mock.invocationCallOrder[0]).toBeLessThan(mocks.plugin.getPurchases.mock.invocationCallOrder[0])
  })

  it('iPhone: utan uppkoppling och utan köp på telefonen misslyckas återställningen', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    mocks.plugin.restorePurchases.mockRejectedValue(new Error('The Internet connection appears to be offline.'))
    await expect(createNativeStorePurchases('ios').restore()).rejects.toThrow('offline')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:kop')
  })

  it('iPhone: ett annat fel från synkningen (t.ex. en avbruten inloggning på svenska) ger ett neutralt svar', async () => {
    mocks.plugin.restorePurchases.mockRejectedValueOnce(new Error('Åtgärden kunde inte slutföras.'))
    await expect(createNativeStorePurchases('ios').restore()).resolves.toEqual([])
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:kop')
    mocks.logError.mockReset()
    mocks.plugin.restorePurchases.mockRejectedValueOnce(new Error('Användaren avbröt åtgärden.'))
    await expect(createNativeStorePurchases('ios').restore()).resolves.toEqual([])
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('iPhone: köp som redan finns på telefonen räcker när synkningen inte gick, eller avbröts', async () => {
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [tx({ productIdentifier: 'livstid' })] })
    mocks.plugin.restorePurchases.mockRejectedValueOnce(new Error('offline'))
    await expect(createNativeStorePurchases('ios').restore()).resolves.toHaveLength(1)
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [] })
    mocks.plugin.restorePurchases.mockRejectedValueOnce(capacitorError('User cancelled'))
    await expect(createNativeStorePurchases('ios').restore()).resolves.toEqual([])
  })

  it('Play: köplistan kommer från Google Play och okvitterade köp kvitteras', async () => {
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [playTx({ productIdentifier: 'livstid', isAcknowledged: false, purchaseToken: 'x' })] })
    await expect(createNativeStorePurchases('android').restore()).resolves.toEqual([expect.objectContaining({ product: 'livstid', source: 'play' })])
    expect(mocks.plugin.restorePurchases).not.toHaveBeenCalled()
    expect(mocks.plugin.acknowledgePurchase).toHaveBeenCalledWith({ purchaseToken: 'x' })
  })
})

describe('ett anrop i taget', () => {
  it('köpen hämtas först när köprutan är klar (Play stänger anslutningen vid varje anrop)', async () => {
    const store = createNativeStorePurchases('android')
    const sheet = deferred<Transaction>()
    mocks.plugin.purchaseProduct.mockReturnValue(sheet.promise)
    const buying = store.purchase('livstid')
    const reading = store.currentEntitlements()
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.plugin.purchaseProduct).toHaveBeenCalledTimes(1)
    expect(mocks.plugin.getPurchases).not.toHaveBeenCalled()
    sheet.resolve(playTx({ productIdentifier: 'livstid' }))
    await expect(buying).resolves.toBe('purchased')
    await expect(reading).resolves.toEqual([])
    expect(mocks.plugin.getPurchases).toHaveBeenCalledTimes(1)
  })

  it('ett anrop som aldrig svarar ger ett fel efter en stund, och kön fortsätter', async () => {
    vi.useFakeTimers()
    const store = createNativeStorePurchases('android')
    mocks.plugin.getPurchases.mockReturnValueOnce(new Promise(() => {}))
    const stuck = store.currentEntitlements()
    const check = expect(stuck).rejects.toThrow('butiken svarade inte')
    await vi.advanceTimersByTimeAsync(CALL_TIMEOUT_MS)
    await check
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [playTx({ productIdentifier: 'livstid' })] })
    await expect(store.currentEntitlements()).resolves.toHaveLength(1)
  })
})

describe('hjälpfunktioner', () => {
  it('känner igen avbrutna, väntande och redan ägda köp', () => {
    expect(classifyPurchaseError(capacitorError('User cancelled'))).toBe('cancelled')
    expect(classifyPurchaseError(capacitorError('Purchase is not purchased', 'USER_CANCELED'))).toBe('cancelled')
    expect(classifyPurchaseError(capacitorError('Transaction pending'))).toBe('pending')
    expect(classifyPurchaseError(capacitorError('Purchase is pending'))).toBe('pending')
    expect(classifyPurchaseError(capacitorError('Purchase is not purchased', 'ITEM_ALREADY_OWNED'))).toBe('owned')
    expect(classifyPurchaseError(capacitorError('Billing is not available on this device.', 'BILLING_SETUP_FAILED'))).toBe('failed')
    expect(classifyPurchaseError('konstigt')).toBe('failed')
    expect(classifyPurchaseError(null)).toBe('failed')
  })

  it('årslicenser läggs efter varandra – ett utgånget år förlänger inget', () => {
    const y = 100
    expect(chainYears([], y)).toBeUndefined()
    expect(chainYears([0], y)).toBe(100)
    expect(chainYears([80, 0], y)).toBe(200) // förnyat i förväg: slutet flyttas ett helt år
    expect(chainYears([0, 150], y)).toBe(250) // köpt efter att det förra gick ut: räknas från köpet
    expect(chainYears([0, 50, 60], y)).toBe(300)
  })

  it('köpdatum: UTC på iPhone, lokal tid från Play-delen', () => {
    expect(parseStoreDate('2026-06-01T10:00:00Z', 'ios')).toBe(Date.UTC(2026, 5, 1, 10))
    expect(parseStoreDate('2026-06-01T10:00:00Z', 'android')).toBe(new Date(2026, 5, 1, 10).getTime())
    expect(parseStoreDate('2026-06-01T10:00:00.000+02:00', 'android')).toBe(Date.UTC(2026, 5, 1, 8))
    expect(parseStoreDate(undefined, 'ios')).toBeNull()
    expect(parseStoreDate('inte ett datum', 'ios')).toBeNull()
  })
})

describe('inkopplingen i src/lib/storePurchases.ts', () => {
  function nativeIos() {
    mocks.native = true
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'ios' })
  }

  it('webben: inga köp i appen, och inget kopplas in', async () => {
    registerNativePurchases()
    const store = getStorePurchases()
    expect(store.available()).toBe(false)
    await expect(store.currentEntitlements()).resolves.toEqual([])
    expect(mocks.plugin.addListener).not.toHaveBeenCalled()
  })

  it('i appen väntar köpen på inkopplingen vid start, så att ingen ser "Provperioden är slut" i onödan', async () => {
    nativeIos()
    mocks.plugin.getPurchases.mockResolvedValue({ purchases: [tx({ productIdentifier: 'livstid' })] })
    const store = getStorePurchases()
    expect(getStorePurchases()).toBe(store) // samma objekt hela tiden
    expect(store.available()).toBe(true) // "kontrolleras" medan köpen hämtas
    const early = store.currentEntitlements()
    registerNativePurchases()
    await expect(early).resolves.toEqual([expect.objectContaining({ product: 'livstid', source: 'appstore' })])
    expect(getStorePurchases()).toBe(store)
  })

  it('iPhone: köp som blir klara utanför köprutan uppdaterar tillgången', async () => {
    nativeIos()
    registerNativePurchases()
    registerNativePurchases()
    expect(mocks.plugin.addListener).toHaveBeenCalledTimes(1)
    expect(mocks.plugin.addListener).toHaveBeenCalledWith('transactionUpdated', expect.any(Function))
    const onUpdate = mocks.plugin.addListener.mock.calls[0][1] as () => void
    onUpdate()
    expect(mocks.refresh).toHaveBeenCalledWith({ fresh: true })
  })

  it('köpen hämtas direkt när de kopplas in (även om en tidigare hämtning redan har gett upp)', () => {
    nativeIos()
    registerNativePurchases()
    expect(mocks.refresh).toHaveBeenCalledWith({ fresh: true })
  })

  it('kopplas köpen aldrig in blir de otillgängliga efter en stund', async () => {
    vi.useFakeTimers()
    nativeIos()
    const store = getStorePurchases()
    const entitlements = store.currentEntitlements()
    const check = expect(entitlements).rejects.toThrow('inte tillgängliga')
    const purchase = store.purchase('livstid')
    await vi.advanceTimersByTimeAsync(NATIVE_WAIT_MS)
    await check
    await expect(purchase).resolves.toBe('failed')
  })

  it('går köpen inte att starta svarar butiken direkt att köp inte är tillgängliga', async () => {
    nativeIos()
    const store = getStorePurchases()
    setNativeStorePurchases(null)
    expect(store.available()).toBe(false)
    await expect(store.getProducts()).rejects.toThrow('inte tillgängliga')
    await expect(store.restore()).rejects.toThrow('inte tillgängliga')
    await expect(store.purchase('ar')).resolves.toBe('failed')
  })

  it('en inkopplad implementation används direkt', async () => {
    nativeIos()
    const impl: StorePurchases = {
      available: () => true,
      getProducts: async () => [{ id: 'ar', title: 'Årslicens', displayPrice: '349,00 kr' }],
      purchase: async () => 'purchased',
      restore: async () => [],
      currentEntitlements: async () => [],
    }
    setNativeStorePurchases(impl)
    await expect(getStorePurchases().getProducts()).resolves.toEqual([{ id: 'ar', title: 'Årslicens', displayPrice: '349,00 kr' }])
    await expect(getStorePurchases().purchase('ar')).resolves.toBe('purchased')
  })
})
