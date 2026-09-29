/**
 * Lagom Premium – ren logik för köp, aktivering och statustexter (testbar utan React).
 *
 * Köp på webben (bara när `sellsOnWeb()`): `createCheckout` → POST /api/create-checkout { plan }
 * → { url } → Stripe Checkout → tillbaka till #/tack?session_id=… → `verifyPurchase` → POST
 * /api/verify-purchase { sessionId } → { licenseKey } → nyckeln verifieras lokalt (ECDSA) och sparas.
 *
 * Köp i butiksapparna: `buyInStore` / `restoreStorePurchases` via src/lib/storePurchases.ts –
 * priset kommer från butiken och inga Stripe-anrop görs.
 *
 * Webbköpen (Stripe, tacksidan, testköpen och "Tappat nyckeln?") tas bort ur butiksbyggena med
 * konstanten `WEB_PURCHASES` nedan, och aktiveringen av licensnycklar ur App Store-bygget med
 * `KEY_ENTRY` (se WEB_PURCHASES_BUILD i src/config/platform.ts).
 */
import {
  ACCEPT_TEST_PURCHASES,
  API_BASE,
  COMMERCE_MODE,
  LICENSE_PUBLIC_KEYS,
  LIFETIME_SHORT,
  PLANS,
  SUPPORT_EMAIL,
  TRIAL_DAYS,
  WEB_CHECKOUT_ENABLED,
  type Plan,
  type PlanId,
} from '../../config/commerce'
import {
  DISTRIBUTION,
  IS_STORE_BUILD,
  KEY_ENTRY_BUILD,
  WEB_PURCHASES_BUILD,
  allowsLicenseKeyEntry,
  isAppleWebKit,
  isInApp,
  isTwa,
  sellsOnWeb,
  trialViaStore,
  type Distribution,
} from '../../config/platform'
import { LICENSE_ERRORS, LICENSE_PREFIX, createTestLicense, normalizeLicenseKey, verifyLicense, type LicensePayload } from '../../lib/license'
import { getStorePurchases, type StoreProduct, type StoreProductId, type StorePurchaseResult } from '../../lib/storePurchases'
import { MONTHS } from '../../lib/dates'
import { formatNumber, plural } from '../../lib/format'
import type { Tone } from '../../components/ui'
import { currentAccess, isActiveStorePurchase, primeLicenseCheck, refreshStoreEntitlements, type AccessStatus } from '../../hooks/useAccess'
import { useLicenseStore } from '../../stores/licenseStore'
import { isLicenseRevoked, prepareRevocationCheck, refreshRevocations } from './revocations'

/** Sätts av vite.config.ts (`define`); finns inte i testerna. */
declare const __LAGOM_DISTRIBUTION__: string | undefined

/**
 * Webbköpen finns i bygget (bara webbygget). En konstant i samma modul som villkoren, så att
 * Stripe-anropen, tacksidans anrop och "Tappat nyckeln?" inte följer med i butiksapparna.
 */
const WEB_PURCHASES: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ === 'web' : WEB_PURCHASES_BUILD

/** Licensnycklar kan aktiveras i bygget (webben och Google Play, inte App Store). */
const KEY_ENTRY: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ !== 'appstore' : KEY_ENTRY_BUILD

// ---------------------------------------------------------------------------
// Formatering
// ---------------------------------------------------------------------------

/** 699 → "699 kr" (hela kronor, fast mellanslag). */
export function formatPrice(kr: number): string {
  return `${formatNumber(kr)} kr`
}

/** Epoch-ms → "27 september 2027". */
export function formatLongDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const kronorFormat = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 119.8 → "119,80 kr" (med ören, t.ex. momsen). */
export function formatKronor(kr: number): string {
  return `${kronorFormat.format(kr)}\u00a0kr`
}

/** "11 dagar" / "1 dag". */
export function daysText(n: number): string {
  return plural(n, 'dag', 'dagar')
}

/** "349 kr/år eller 699 kr för alltid" – planerna i en mening (webbpriser). */
export function priceSummary(plans: readonly Plan[] = PLANS): string {
  return plans.map((p) => `${formatPrice(p.priceKr)}${p.durationDays ? '/år' : ' för alltid'}`).join(' eller ')
}

// ---------------------------------------------------------------------------
// Butikens priser (köp i appen)
// ---------------------------------------------------------------------------

/** Priserna som butiken visar (redan formaterade, t.ex. "349,00 kr") – aldrig hårdkodade i appen. */
let storePrices: Partial<Record<PlanId, string>> = {}
let storePriceVersion = 0
const storePriceListeners = new Set<() => void>()
let storePriceLoading: Promise<void> | null = null

export function subscribeStorePrices(listener: () => void): () => void {
  storePriceListeners.add(listener)
  return () => storePriceListeners.delete(listener)
}

/** Ändras när butikens priser har hämtats – för useSyncExternalStore. */
export function storePricesVersion(): number {
  return storePriceVersion
}

/** Kom ihåg butikens priser (från `getProducts`), så att texterna före provperioden kan visa dem. */
export function rememberStorePrices(products: readonly StoreProduct[]): void {
  const next: Partial<Record<PlanId, string>> = {}
  for (const p of products) if ((p.id === 'ar' || p.id === 'livstid') && p.displayPrice.trim()) next[p.id] = p.displayPrice.trim()
  if (next.ar === storePrices.ar && next.livstid === storePrices.livstid) return
  storePrices = next
  storePriceVersion++
  storePriceListeners.forEach((l) => l())
}

/** Hämta butikens priser i en app med köp i appen (en gång i taget). Kastar aldrig. */
export function loadStorePrices(): Promise<void> {
  const store = getStorePurchases()
  if (!isInApp() || !store.available()) return Promise.resolve()
  storePriceLoading ??= store
    .getProducts()
    .then(rememberStorePrices, () => undefined)
    .finally(() => {
      storePriceLoading = null
    })
  return storePriceLoading
}

/** Endast för tester: glöm butikens priser. */
export function resetStorePricesForTests(): void {
  storePrices = {}
  storePriceVersion++
}

/**
 * Priserna i en mening där de får visas: kronpriserna när Lagom säljs på webben. I en app visas
 * butikens priser när de har hämtats (Apple kräver att priserna efter en provperiod syns innan
 * den startar, riktlinje 3.1.1) – annars att priserna visas i butiken före köpet.
 */
export function priceSummaryText(): string {
  if (WEB_PURCHASES && sellsOnWeb()) return priceSummary()
  if (!isInApp()) return 'årslicens eller livstidslicens i appbutikerna'
  const { ar, livstid } = storePrices
  if (ar && livstid) return `årslicens (${ar}) eller livstidslicens (${livstid}) som köp i appen`
  return `årslicens eller livstidslicens som köp i appen (priserna visas i ${storeName()} innan du köper)`
}

/** Butiken som säljer Lagom här: App Store eller Google Play. */
export function storeName(): 'App Store' | 'Google Play' {
  if (DISTRIBUTION === 'appstore') return 'App Store'
  if (DISTRIBUTION === 'play' || isTwa()) return 'Google Play'
  return isAppleWebKit() ? 'App Store' : 'Google Play'
}

/** Kontot som köp i appen följer: "Apple-konto" eller "Google-konto". */
export function storeAccountName(): string {
  return storeName() === 'App Store' ? 'Apple-konto' : 'Google-konto'
}

/** Pris per månad för en årslicens, avrundat ("25 kr/mån"). */
export function perMonthText(plan: Plan): string | null {
  if (!plan.durationDays) return null
  return `${formatNumber(Math.round((plan.priceKr / plan.durationDays) * 30.4))} kr/mån`
}

// ---------------------------------------------------------------------------
// Statustexter
// ---------------------------------------------------------------------------

export interface StatusSummary {
  /** Kort etikett, t.ex. "Provperiod" eller "Livstidslicens". */
  label: string
  title: string
  text: string
  tone: Tone
}

/**
 * iPhone-appen: provperioden startas med ett gratis köp i App Store (riktlinje 3.1.1) – texten före
 * start säger hur länge den gäller, vad som sedan kräver köp och vad det kostar.
 */
export function storeTrialText(): string {
  return `Provperioden startar när du trycker på Starta: ett gratis köp i App Store som gäller en gång per Apple-konto. Allt i Lagom är öppet i ${TRIAL_DAYS} dagar. Sedan kan du fortfarande se, exportera och radera din data – för att logga nytt behöver du en licens: ${priceSummaryText()}, utan automatisk förnyelse. Inget dras automatiskt.`
}

export function statusSummary(status: AccessStatus): StatusSummary {
  switch (status.kind) {
    case 'ny':
      return {
        label: 'Provperiod',
        title: `Prova gratis i ${TRIAL_DAYS} dagar`,
        text: trialViaStore()
          ? 'Skapa din profil först. Sedan startar du provperioden med ett gratis köp i App Store – inget dras automatiskt.'
          : 'Inget kort behövs. Skapa din profil och börja logga direkt – provperioden startar när profilen är klar.',
        tone: 'gran',
      }
    case 'ejstartad':
      return {
        label: 'Provperiod',
        title: `Starta ${TRIAL_DAYS} dagar gratis`,
        text: storeTrialText(),
        tone: 'gran',
      }
    case 'prov':
      return {
        label: 'Provperiod',
        title: `${daysText(status.daysLeft)} kvar av provperioden`,
        text: `Allt i Lagom är öppet till ${formatLongDate(status.endsAt)}. Inget dras automatiskt – du väljer själv om och när du vill köpa.`,
        tone: 'gran',
      }
    case 'utgangen':
      if (status.revoked) {
        return {
          label: 'Licensen har återkallats',
          title: 'Licensen har återkallats – din data finns kvar',
          text: `${LICENSE_ERRORS.aterkallad} Du kan fortfarande se, exportera och radera allt.`,
          tone: 'sol',
        }
      }
      return status.licenseExpired
        ? {
            label: 'Licensen har gått ut',
            title: 'Årslicensen har gått ut – din data finns kvar',
            text: 'Du kan fortfarande se, exportera och radera allt. För att logga nytt behöver du en ny licens.',
            tone: 'sol',
          }
        : {
            label: 'Provperioden är slut',
            title: 'Provperioden är slut – din data finns kvar',
            text: 'Du kan fortfarande se, exportera och radera allt. För att logga nytt behöver du en licens.',
            tone: 'sol',
          }
    case 'licensierad': {
      const name = status.plan?.name ?? 'Licens'
      if (status.expiresAt === undefined) {
        return { label: name, title: 'Lagom är ditt – för alltid', text: `${LIFETIME_SHORT}. Tack för att du stödjer Lagom!`, tone: 'mossa' }
      }
      return {
        label: name,
        title: `Giltig till ${formatLongDate(status.expiresAt)}`,
        text: `${daysText(status.daysLeft ?? 0)} kvar. Licensen förnyas inte automatiskt – du väljer själv om du vill fortsätta.`,
        tone: 'mossa',
      }
    }
  }
}

/**
 * Hur provperioden visas på Idag: inget (licens/ny), ett litet chip, ett tydligare kort de sista
 * tre dagarna, eller ett kort när den är slut.
 */
export type TrialBannerLevel = 'none' | 'chip' | 'soon' | 'expired' | 'start'

export const TRIAL_SOON_DAYS = 3

export function trialBannerLevel(status: AccessStatus): TrialBannerLevel {
  if (status.kind === 'prov') return status.daysLeft <= TRIAL_SOON_DAYS ? 'soon' : 'chip'
  if (status.kind === 'utgangen') return 'expired'
  // iPhone-appen: provperioden väntar på att startas (köpet 'prov14').
  if (status.kind === 'ejstartad') return 'start'
  return 'none'
}

/**
 * Kan årslicensen inte förnyas i förväg här? I Google Play går en engångsprodukt som ägs inte att
 * köpa igen, och ett år som fortfarande gäller förbrukas aldrig (src/native/purchases.ts) – annars
 * skulle det raderas. Årslicensen från Play kan därför förnyas först när den har gått ut.
 *
 * I App Store går det: ett år som köps i förväg läggs efter det som gäller (purchases.ts räknar
 * ihop alla köpta år), så inga betalda dagar går förlorade.
 */
export function renewalBlockedInStore(status: AccessStatus, distribution: Distribution = DISTRIBUTION): boolean {
  return distribution === 'play' && status.kind === 'licensierad' && status.source === 'store' && status.plan?.id === 'ar'
}

/** Texten i köppanelen när årslicensen från Play inte kan förnyas i förväg (se `renewalBlockedInStore`). */
export const PLAY_RENEWAL_NOTE = 'Årslicensen kan förnyas här när den har gått ut.'

/** Texten i köppanelen i iPhone-appen när årslicensen snart går ut: ett nytt år läggs efter det nuvarande. */
export const APPSTORE_RENEWAL_NOTE = 'Förnyar du nu börjar det nya året när det nuvarande tar slut – inga dagar går förlorade.'

/**
 * Noten om förnyelse i köppanelen när en årslicens köpt i appen har högst 30 dagar kvar: i Play att
 * den kan förnyas när den har gått ut, i App Store att ett nytt år läggs efter det nuvarande.
 */
export function storeRenewalNote(status: AccessStatus, distribution: Distribution = DISTRIBUTION): string | undefined {
  if (status.kind !== 'licensierad' || status.source !== 'store' || status.plan?.id !== 'ar' || (status.daysLeft ?? Infinity) > 30) return undefined
  if (renewalBlockedInStore(status, distribution)) return PLAY_RENEWAL_NOTE
  return distribution === 'appstore' ? APPSTORE_RENEWAL_NOTE : undefined
}

/**
 * Planer som är värda att visa: inga vid livstidslicens, bara livstid vid en färsk årslicens (och
 * vid en årslicens från Google Play som fortfarande gäller, se `renewalBlockedInStore`).
 */
export function plansToOffer(status: AccessStatus, plans: readonly Plan[], distribution: Distribution = DISTRIBUTION): Plan[] {
  if (status.kind !== 'licensierad') return [...plans]
  if (status.expiresAt === undefined) return []
  // Mindre än en månad kvar: erbjud förnyelse också – utom där butiken inte tillåter det.
  if ((status.daysLeft ?? 0) <= 30 && !renewalBlockedInStore(status, distribution)) return [...plans]
  return plans.filter((p) => !p.durationDays)
}

// ---------------------------------------------------------------------------
// Aktivering av licensnyckel
// ---------------------------------------------------------------------------

export type ActivationResult = { ok: true; key: string; payload: LicensePayload } | { ok: false; message: string }

/** Hur länge aktiveringen väntar på en färsk spärrlista innan den använder den sparade. */
const REVOCATION_WAIT_MS = 5000

/** Vänta på `p`, men högst `ms` millisekunder (ger då undefined). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Verifiera en inklistrad nyckel och spara den på enheten om den är giltig. Spärrlistan hämtas
 * samtidigt (när appen är online), så att en återbetald licens inte går att aktivera.
 */
/** App Store-bygget: licensnycklar låser inte upp något där (bara köp i appen gäller). */
export const KEY_ENTRY_DISABLED = 'Licensnycklar kan inte aktiveras i den här versionen av Lagom. Har du köpt Lagom i appen? Tryck på Återställ köp.'

export async function activateLicense(input: string, now: number = Date.now()): Promise<ActivationResult> {
  if (!KEY_ENTRY || !allowsLicenseKeyEntry()) return { ok: false, message: KEY_ENTRY_DISABLED }
  const key = normalizeLicenseKey(input)
  if (!key) return { ok: false, message: 'Klistra in din licensnyckel först.' }
  const [result] = await Promise.all([
    verifyLicense(key, { publicKey: LICENSE_PUBLIC_KEYS, mode: COMMERCE_MODE, now, rejectTestPurchases: !ACCEPT_TEST_PURCHASES }),
    withTimeout(refreshRevocations({ force: true }), REVOCATION_WAIT_MS),
  ])
  if (!result.ok) return { ok: false, message: LICENSE_ERRORS[result.reason] }
  await prepareRevocationCheck(key)
  if (isLicenseRevoked(key, result.payload)) return { ok: false, message: LICENSE_ERRORS.aterkallad }
  primeLicenseCheck(key, result)
  useLicenseStore.getState().setLicense(key)
  return { ok: true, key, payload: result.payload }
}

/** Testläge: utfärda en osignerad testlicens direkt (ingen betalning). Aldrig i butiksappar. */
export async function buyInTestMode(plan: Plan, now: number = Date.now()): Promise<ActivationResult> {
  if (!WEB_PURCHASES || IS_STORE_BUILD || !WEB_CHECKOUT_ENABLED) return { ok: false, message: 'Testköp är avstängda i den här versionen.' }
  return activateLicense(createTestLicense(plan.id, plan.durationDays, now), now)
}

// ---------------------------------------------------------------------------
// Köp i appen (App Store, Google Play)
// ---------------------------------------------------------------------------

/** Köp en produkt i butiken. Vid ett genomfört köp uppdateras tillgången direkt. */
export async function buyInStore(id: StoreProductId): Promise<StorePurchaseResult> {
  let result: StorePurchaseResult
  try {
    result = await getStorePurchases().purchase(id)
  } catch {
    return 'failed'
  }
  if (result === 'purchased') await refreshStoreEntitlements({ fresh: true })
  return result
}

/**
 * "Återställ köp": hämta tidigare köp i appen från butiken (t.ex. på en ny telefon). `paid` är
 * antalet betalda köp som gäller nu – utgångna årslicenser och provperioden ('prov14') räknas
 * inte; `trial` är true om en provperiod ('prov14') fanns bland köpen och fortfarande pågår. Kastar
 * om butiken inte svarar.
 */
export async function restoreStorePurchases(): Promise<{ paid: number; trial: boolean }> {
  const restored = await getStorePurchases().restore()
  await refreshStoreEntitlements({ fresh: true })
  const now = Date.now()
  const trial = restored.some((e) => e.product === 'prov14') && currentAccess(now).status.kind === 'prov'
  return { paid: restored.filter((e) => isActiveStorePurchase(e, now)).length, trial }
}

export type StoreTrialResult = 'started' | 'used' | 'licensed' | 'cancelled' | 'pending' | 'failed'

/**
 * iPhone-appen: starta provperioden med det gratis köpet 'prov14' i App Store. 'used' = köpet fanns
 * redan och provperioden är slut (den gäller en gång per Apple-konto), 'licensed' = en licens gäller
 * redan. Kastar aldrig.
 */
export async function startStoreTrial(): Promise<StoreTrialResult> {
  const result = await buyInStore('prov14')
  if (result !== 'purchased') return result
  const { status } = currentAccess()
  if (status.kind === 'prov') return 'started'
  if (status.kind === 'licensierad') return 'licensed'
  // Köpet gick igenom men syns inte bland köpen än – eller så har provperioden redan använts.
  return status.kind === 'utgangen' ? 'used' : 'failed'
}

// ---------------------------------------------------------------------------
// Serveranrop (skarpt läge)
// ---------------------------------------------------------------------------

export type PurchaseErrorCode = 'offline' | 'server' | 'not-found' | 'invalid' | 'rate-limit'

export class PurchaseError extends Error {
  code: PurchaseErrorCode
  constructor(code: PurchaseErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export const PURCHASE_ERRORS: Record<PurchaseErrorCode, string> = {
  offline: 'Du verkar vara offline. Anslut till internet och försök igen.',
  server: `Det gick inte att nå betaltjänsten just nu. Försök igen om en stund – eller mejla ${SUPPORT_EMAIL} om det fortsätter.`,
  'not-found': `Vi hittar inget genomfört köp för den här betalningen. Har pengar dragits från ditt konto? Mejla ${SUPPORT_EMAIL} så löser vi det.`,
  invalid: `Svaret från betaltjänsten gick inte att läsa. Försök igen – eller mejla ${SUPPORT_EMAIL} om det fortsätter.`,
  'rate-limit': `Du har försökt många gånger på kort tid. Vänta en stund och försök igen – eller mejla ${SUPPORT_EMAIL} så hjälper vi dig.`,
}

/** Webbköp är avstängda här (butiksapp eller webbförsäljningen av) – inga Stripe-anrop görs. */
const WEB_CHECKOUT_DISABLED = 'Köp via webben är avstängda i den här versionen av Lagom.'

const REQUEST_TIMEOUT_MS = 20_000

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> | null }> {
  if (isOffline()) throw new PurchaseError('offline', PURCHASE_ERRORS.offline)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    // Nätverksfel eller tidsgräns: oftast ingen uppkoppling.
    throw new PurchaseError(isOffline() ? 'offline' : 'server', isOffline() ? PURCHASE_ERRORS.offline : PURCHASE_ERRORS.server)
  } finally {
    clearTimeout(timer)
  }
  let json: Record<string, unknown> | null = null
  try {
    const parsed: unknown = await res.json()
    json = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    json = null
  }
  return { status: res.status, json }
}

/**
 * Serverns eget meddelande (`{ code, error }`, svensk text som kan visas direkt) – om det finns
 * och ser rimligt ut. Annars appens eget.
 */
function serverMessage(json: Record<string, unknown> | null, fallback: string): string {
  const msg = json?.error
  return typeof msg === 'string' && msg.trim().length > 0 && msg.length <= 400 ? msg.trim() : fallback
}

/**
 * Skapa en Stripe Checkout-session för planen. Returnerar adressen att skicka användaren till.
 * `consent: true` = köparen har kryssat i samtycket om direkt leverans och att ångerrätten då
 * upphör (servern sparar samtycket och tidpunkten på köpet).
 */
export async function createCheckout(plan: PlanId): Promise<string> {
  if (!WEB_PURCHASES || !WEB_CHECKOUT_ENABLED) throw new PurchaseError('invalid', WEB_CHECKOUT_DISABLED)
  const { status, json } = await postJson('/api/create-checkout', { plan, consent: true })
  if (status < 200 || status >= 300) throw new PurchaseError('server', serverMessage(json, PURCHASE_ERRORS.server))
  const url = json?.url
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new PurchaseError('invalid', PURCHASE_ERRORS.invalid)
  return url
}

export type VerifyPurchaseResult = { kind: 'ok'; licenseKey: string } | { kind: 'pending' }

/** Hämta licensnyckeln för en genomförd betalning. "pending" = betalningen är inte klar ännu. */
export async function verifyPurchase(sessionId: string): Promise<VerifyPurchaseResult> {
  if (!WEB_PURCHASES) throw new PurchaseError('invalid', WEB_CHECKOUT_DISABLED)
  const { status, json } = await postJson('/api/verify-purchase', { sessionId })
  if (status === 202 || json?.status === 'pending' || json?.pending === true) return { kind: 'pending' }
  // Tillfälliga fel (serverfel, för många försök) går att försöka igen – övriga gäller själva köpet.
  if (status >= 500 || status === 429) throw new PurchaseError('server', serverMessage(json, PURCHASE_ERRORS.server))
  if (status < 200 || status >= 300) throw new PurchaseError('not-found', serverMessage(json, PURCHASE_ERRORS['not-found']))
  const key = json?.licenseKey
  if (typeof key !== 'string' || !key) throw new PurchaseError('invalid', PURCHASE_ERRORS.invalid)
  return { kind: 'ok', licenseKey: key }
}

/** Lämna appen för betalningen (egen funktion så att testerna kan fånga den). */
export function redirectTo(url: string): void {
  if (!WEB_PURCHASES || !WEB_CHECKOUT_ENABLED) throw new PurchaseError('invalid', WEB_CHECKOUT_DISABLED)
  window.location.assign(url)
}

// ---------------------------------------------------------------------------
// "Tappat nyckeln?" – hämta licensnyckeln från ett webbköp igen
// ---------------------------------------------------------------------------

export const RECOVER_ERRORS = {
  email: 'Skriv e-postadressen du använde vid köpet.',
  receipt: 'Skriv kvittonumret eller ordernumret från kvittot.',
  'not-found': `Vi hittar inget köp med den e-postadressen och det numret. Kontrollera att det är samma e-post som vid köpet och numret från kvittot från Stripe – eller mejla ${SUPPORT_EMAIL} så hjälper vi dig.`,
  server: `Det gick inte att hämta licensen just nu. Försök igen om en stund – eller mejla ${SUPPORT_EMAIL} om det fortsätter.`,
} as const

/** Enkel rimlighetskontroll av en e-postadress (servern kontrollerar på riktigt). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/**
 * Hämta licensnyckeln för ett webbköp igen: POST /api/recover-license { email, receipt } →
 * { key }. Kastar `PurchaseError` med ett svenskt meddelande (offline, för många försök, inget
 * köp hittades eller serverfel).
 */
export async function recoverLicense(email: string, receipt: string): Promise<string> {
  if (!WEB_PURCHASES) throw new PurchaseError('invalid', WEB_CHECKOUT_DISABLED)
  const { status, json } = await postJson('/api/recover-license', { email: email.trim(), receipt: receipt.trim() })
  if (status === 429) throw new PurchaseError('rate-limit', PURCHASE_ERRORS['rate-limit'])
  if (status >= 500) throw new PurchaseError('server', serverMessage(json, RECOVER_ERRORS.server))
  if (status < 200 || status >= 300) throw new PurchaseError('not-found', serverMessage(json, RECOVER_ERRORS['not-found']))
  const key = typeof json?.key === 'string' ? json.key : json?.licenseKey
  if (typeof key !== 'string' || !normalizeLicenseKey(key).startsWith(`${LICENSE_PREFIX}.`)) throw new PurchaseError('invalid', PURCHASE_ERRORS.invalid)
  return normalizeLicenseKey(key)
}

/** Session-id från adressen – i hash-delen (#/tack?session_id=…) eller, som reserv, före den. */
export function sessionIdFrom(hashSearch: URLSearchParams, locationSearch: string = typeof window !== 'undefined' ? window.location.search : ''): string | null {
  if (!WEB_PURCHASES) return null
  const fromHash = hashSearch.get('session_id')
  if (fromHash) return fromHash
  try {
    return new URLSearchParams(locationSearch).get('session_id')
  } catch {
    return null
  }
}

/** mailto-länk för att skicka nyckeln till sig själv. */
export function licenseMailto(key: string): string {
  const subject = 'Min licensnyckel till Lagom'
  const body = `Här är min licensnyckel till Lagom. Klistra in den under Inställningar → Licens på en ny enhet.\n\n${key}\n`
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Kopiera text till urklipp. Returnerar false om webbläsaren inte tillåter det. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* faller tillbaka nedan */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand?.('copy') ?? false
    ta.remove()
    return ok
  } catch {
    return false
  }
}
