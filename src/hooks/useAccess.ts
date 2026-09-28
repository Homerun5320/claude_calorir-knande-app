/**
 * Tillgång till appen: provperiod, licens eller utgången.
 *
 * Efter provperioden kan man fortfarande se, exportera och radera all sin data – bara ny loggning
 * kräver en licens. Användarens data låses aldrig.
 *
 * Licensen kan komma från en licensnyckel (webbköp) eller från ett köp i appen (App Store,
 * Google Play – se src/lib/storePurchases.ts). En återbetald webblicens i spärrlistan räknas som
 * återkallad (se features/premium/revocations.ts).
 *
 * Exempeldata är skrivskyddad: medan den visas går inget nytt att logga, och provperioden
 * startar inte förrän den egna profilen skapas.
 *
 * - `accessStatus` – ren funktion (testbar utan React).
 * - `currentAccess()` – synkron status ur butikerna, för kod utanför React (t.ex. `requireAccess`).
 * - `useAccess()` – samma status som hook; verifierar licensnyckeln (WebCrypto) och uppdateras
 *   när appen återfår fokus.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ACCEPT_TEST_PURCHASES, COMMERCE_MODE, LICENSE_PUBLIC_KEYS, TRIAL_DAYS, planById, type Plan, type PlanId } from '../config/commerce'
import { allowsLicenseKeyEntry } from '../config/platform'
import { isDemoData } from '../lib/demoFlag'
import { verifyLicense, type LicenseCheck, type LicensePayload } from '../lib/license'
import { getStorePurchases, type StoreEntitlement } from '../lib/storePurchases'
import { useLicenseStore } from '../stores/licenseStore'
import { useProfileStore } from '../stores/profileStore'
import {
  isLicenseRevoked,
  prepareRevocationCheck,
  refreshRevocations,
  revocationVersion,
  subscribeRevocations,
} from '../features/premium/revocations'
import { useDemoData } from './useDemoData'

const DAY_MS = 86_400_000

/** Var licensen kommer ifrån: en licensnyckel (webbköp) eller ett köp i appen. */
export type LicenseSource = 'nyckel' | 'store'

export type AccessStatus =
  | {
      kind: 'licensierad'
      plan: Plan | undefined
      payload: LicensePayload
      expiresAt?: number
      daysLeft?: number
      test: boolean
      /** Saknas = licensnyckel. */
      source?: LicenseSource
    }
  | { kind: 'prov'; daysLeft: number; endsAt: number }
  /**
   * Ny loggning kräver licens. `licenseExpired`: en årslicens har gått ut. `revoked`: licensen har
   * återkallats (t.ex. återbetalat eller bestritt köp). Datan finns alltid kvar.
   */
  | { kind: 'utgangen'; endedAt: number; licenseExpired: boolean; revoked?: boolean }
  /** Ingen profil ännu (välkomstflödet eller exempeldata) – provperioden har inte startat. */
  | { kind: 'ny' }

// ---------------------------------------------------------------------------
// Köp i appen
// ---------------------------------------------------------------------------

/**
 * När ett köp i appen går ut (epoch-ms), eller undefined för livstid. Årslicensen är ett år som
 * inte förnyas automatiskt – i App Store en "non-renewing subscription", som butiken inte ger
 * något slutdatum för. Saknas `expiresAt` räknas året därför från köpet, så att en årslicens
 * aldrig av misstag blir en livstidslicens.
 */
function storeExpiry(e: StoreEntitlement): number | undefined {
  if (e.expiresAt !== undefined) return e.expiresAt
  if (e.product !== 'ar') return undefined
  return e.purchasedAt + (planById('ar')?.durationDays ?? 365) * DAY_MS
}

/** true för ett betalt köp i appen som gäller nu: livstid, eller ett år som inte har gått ut (inte 'prov14'). */
export function isActiveStorePurchase(e: StoreEntitlement, now: number = Date.now()): boolean {
  if (e.product !== 'livstid' && e.product !== 'ar') return false
  const expiresAt = storeExpiry(e)
  return expiresAt === undefined || expiresAt > now
}

/** Ett gällande köp i appen (livstid, eller ett år som inte har gått ut) som licens. */
function storeLicense(entitlements: readonly StoreEntitlement[], now: number): LicenseCheck | null {
  let best: { e: StoreEntitlement; expiresAt: number | undefined } | null = null
  for (const e of entitlements) {
    if (e.product !== 'livstid' && e.product !== 'ar') continue
    const expiresAt = storeExpiry(e)
    if (expiresAt !== undefined && expiresAt <= now) continue
    if (!best || expiresAt === undefined || (best.expiresAt !== undefined && expiresAt > best.expiresAt)) best = { e, expiresAt }
    if (best.expiresAt === undefined) break
  }
  if (!best) return null
  const plan: PlanId = best.e.product === 'livstid' ? 'livstid' : 'ar'
  const payload: LicensePayload = {
    v: 1,
    id: `${best.e.source}:${best.e.product}`,
    plan,
    iat: Math.floor(best.e.purchasedAt / 1000),
    ...(best.expiresAt !== undefined ? { exp: Math.floor(best.expiresAt / 1000) } : {}),
  }
  return { ok: true, payload }
}

/** true om ett köpt år i appen har gått ut (och inget gällande köp finns). */
function storeYearExpired(entitlements: readonly StoreEntitlement[], now: number): boolean {
  return entitlements.some((e) => {
    if (e.product !== 'ar') return false
    const expiresAt = storeExpiry(e)
    return expiresAt !== undefined && expiresAt <= now
  })
}

/** Provperiod köpt i butiken ('prov14'): den tidigaste starten gäller. */
function storeTrialStart(entitlements: readonly StoreEntitlement[]): number | null {
  const starts = entitlements.filter((e) => e.product === 'prov14').map((e) => e.purchasedAt)
  return starts.length > 0 ? Math.min(...starts) : null
}

/** Den licens som räcker längst: livstid före år, sedan senast utgångsdatum. */
function longerLasting(a: Extract<LicenseCheck, { ok: true }>, b: Extract<LicenseCheck, { ok: true }>): boolean {
  if (a.payload.exp === undefined) return true
  if (b.payload.exp === undefined) return false
  return a.payload.exp >= b.payload.exp
}

/** Ren funktion för statusen – testbar utan React. */
export function accessStatus(input: {
  trialStartedAt: number | null
  license: LicenseCheck | null
  now: number
  trialDays?: number
  /** Köp i appen (App Store, Google Play). */
  store?: readonly StoreEntitlement[]
}): AccessStatus {
  const { now } = input
  const store = input.store ?? []
  let license = input.license
  const trialDays = input.trialDays ?? TRIAL_DAYS
  // En licens som var giltig vid kontrollen kan ha gått ut sedan dess (appen har stått öppen).
  if (license?.ok && license.payload.exp !== undefined && license.payload.exp * 1000 <= now) {
    license = { ok: false, reason: 'utgangen' }
  }
  const fromStore = storeLicense(store, now)
  let source: LicenseSource = 'nyckel'
  let valid = license?.ok ? license : null
  if (fromStore?.ok && (!valid || !longerLasting(valid, fromStore))) {
    valid = fromStore
    source = 'store'
  }
  if (valid) {
    const expiresAt = valid.payload.exp !== undefined ? valid.payload.exp * 1000 : undefined
    return {
      kind: 'licensierad',
      plan: planById(valid.payload.plan),
      payload: valid.payload,
      expiresAt,
      daysLeft: expiresAt !== undefined ? Math.max(0, Math.ceil((expiresAt - now) / DAY_MS)) : undefined,
      test: Boolean(valid.payload.test),
      ...(source === 'store' ? { source } : {}),
    }
  }
  const storeStart = storeTrialStart(store)
  const trialStartedAt = storeStart === null ? input.trialStartedAt : Math.min(storeStart, input.trialStartedAt ?? storeStart)
  if (trialStartedAt === null) return { kind: 'ny' }
  // En provstart i framtiden (klockan gick före när profilen skapades och ställdes sedan tillbaka)
  // räknas som nu – provperioden kan aldrig bli längre än `trialDays`. Starten rättas även i
  // butiken (se useAccess), så att den inte fortsätter att flytta fram slutet.
  const endsAt = Math.min(trialStartedAt, now) + trialDays * DAY_MS
  if (now < endsAt) return { kind: 'prov', daysLeft: Math.max(1, Math.ceil((endsAt - now) / DAY_MS)), endsAt }
  const licenseExpired = Boolean(license && !license.ok && license.reason === 'utgangen') || storeYearExpired(store, now)
  const revoked = Boolean(license && !license.ok && license.reason === 'aterkallad')
  return {
    kind: 'utgangen',
    endedAt: licenseExpired || revoked ? now : endsAt,
    licenseExpired,
    ...(revoked ? { revoked: true } : {}),
  }
}

/** true om man får logga ny mat, träning, vikt m.m. */
export function canLog(status: AccessStatus): boolean {
  return status.kind !== 'utgangen'
}

// ---------------------------------------------------------------------------
// Verifierade licensnycklar och köp i appen (delas av alla komponenter, så att statusen inte blinkar)
// ---------------------------------------------------------------------------

const checks = new Map<string, LicenseCheck>()
const pending = new Map<string, Promise<LicenseCheck>>()
const checkListeners = new Set<() => void>()
let checkVersion = 0

const EMPTY_ENTITLEMENTS: readonly StoreEntitlement[] = []
let storeEntitlements: readonly StoreEntitlement[] = EMPTY_ENTITLEMENTS
let storeRefresh: Promise<void> | null = null
/** Har butiken svarat (eller misslyckats) minst en gång sedan start? */
let storeLoaded = false

/**
 * Köpen i appen har inte hämtats än (bara där köp i appen finns). Då räknas tillgången som
 * "kontrolleras", så att den som har köpt Lagom i appen inte ser "Provperioden är slut" en
 * kort stund vid varje start.
 */
function storePending(): boolean {
  if (storeLoaded) return false
  try {
    return getStorePurchases().available()
  } catch {
    return false
  }
}

function notifyChecks(): void {
  checkVersion++
  checkListeners.forEach((l) => l())
}

function subscribeChecks(listener: () => void): () => void {
  checkListeners.add(listener)
  return () => checkListeners.delete(listener)
}

/** Resultatet av en tidigare verifiering av nyckeln, om det finns. */
export function cachedLicenseCheck(key: string): LicenseCheck | undefined {
  return checks.get(key)
}

/** Verifiera en nyckel (med appens publika nycklar och läge) och kom ihåg svaret. */
export function verifyLicenseCached(key: string): Promise<LicenseCheck> {
  const done = checks.get(key)
  if (done) return Promise.resolve(done)
  const running = pending.get(key)
  if (running) return running
  const p = Promise.all([
    verifyLicense(key, { publicKey: LICENSE_PUBLIC_KEYS, mode: COMMERCE_MODE, rejectTestPurchases: !ACCEPT_TEST_PURCHASES }).catch((): LicenseCheck => ({ ok: false, reason: 'signatur' })),
    prepareRevocationCheck(key),
  ]).then(([result]) => {
    checks.set(key, result)
    pending.delete(key)
    notifyChecks()
    return result
  })
  pending.set(key, p)
  return p
}

/** Spara ett färskt verifieringsresultat (t.ex. direkt efter aktivering), så att statusen uppdateras utan fördröjning. */
export function primeLicenseCheck(key: string, result: LicenseCheck): void {
  checks.set(key, result)
  pending.delete(key)
  notifyChecks()
  void prepareRevocationCheck(key)
}

/** Endast för tester: glöm alla verifieringar och köp i appen. */
export function resetLicenseChecks(): void {
  checks.clear()
  pending.clear()
  storeEntitlements = EMPTY_ENTITLEMENTS
  storeRefresh = null
  storeLoaded = false
  notifyChecks()
}

/** Köpen i appen som gäller just nu (senast hämtade). */
export function currentStoreEntitlements(): readonly StoreEntitlement[] {
  return storeEntitlements
}

/**
 * Hämta gällande köp i appen från butiken (vid start, när appen återfår fokus och efter köp eller
 * "Återställ köp"). Webbversionen ger en tom lista – då ändras ingenting.
 */
export function refreshStoreEntitlements(opts: { fresh?: boolean } = {}): Promise<void> {
  if (storeRefresh) {
    // Efter ett köp eller "Återställ köp" kan en hämtning som redan pågår ha startat före köpet
    // (t.ex. när appen återfick fokus efter butikens köpruta) – hämta då en gång till efteråt.
    return opts.fresh ? storeRefresh.then(() => refreshStoreEntitlements()) : storeRefresh
  }
  storeRefresh = (async () => {
    try {
      const list = await getStorePurchases().currentEntitlements()
      const next = list.length === 0 ? EMPTY_ENTITLEMENTS : list
      if (next !== storeEntitlements && !(next.length === 0 && storeEntitlements.length === 0)) {
        storeEntitlements = next
        notifyChecks()
      }
    } catch {
      /* butiken svarar inte – de senast kända köpen gäller */
    } finally {
      storeRefresh = null
      if (!storeLoaded) {
        storeLoaded = true
        notifyChecks()
      }
    }
  })()
  return storeRefresh
}

/**
 * Licensnyckeln som får räknas här. I App Store-bygget (och den inbyggda iPhone-appen) låser
 * licensnycklar aldrig upp något – där gäller bara köp i appen (Apples regler, ägarens beslut om
 * "alternativ A"). En nyckel som ändå har hamnat på enheten ignoreras därför.
 */
function usableLicenseKey(key: string | null): string | null {
  return key && allowsLicenseKeyEntry() ? key : null
}

export interface AccessInfo {
  status: AccessStatus
  /** Får man logga nytt? (true medan en sparad licens verifieras – ingen ska låsas ute i onödan. Aldrig med exempeldata.) */
  canLog: boolean
  /** En sparad licensnyckel verifieras just nu (eller köpen i appen hämtas för första gången). */
  checking: boolean
  /** Appen visar exempeldata – den är skrivskyddad tills den egna profilen skapas. */
  demo: boolean
}

function computeAccess(input: {
  licenseKey: string | null
  trialStartedAt: number | null
  onboardingDone: boolean
  demo: boolean
  store: readonly StoreEntitlement[]
  now: number
}): AccessInfo {
  const { licenseKey, trialStartedAt, onboardingDone, demo, store, now } = input
  let license = licenseKey ? (checks.get(licenseKey) ?? null) : null
  // En återbetald licens i spärrlistan gäller inte längre (datan finns kvar).
  if (license?.ok && licenseKey && isLicenseRevoked(licenseKey, license.payload)) license = { ok: false, reason: 'aterkallad' }
  const keyChecking = Boolean(licenseKey) && license === null
  // Tills provstarten har sparats räknas provperioden från nu – men aldrig med exempeldata:
  // provperioden startar först när den egna profilen skapas.
  const start = trialStartedAt ?? (onboardingDone && !demo ? now : null)
  const status = accessStatus({ trialStartedAt: start, license, now, store })
  // Köpen i appen spelar bara roll när inget annat ger tillgång.
  const checking = keyChecking || (status.kind === 'utgangen' && storePending())
  // Exempeldata är skrivskyddad, oavsett provperiod och licens.
  return { status, canLog: !demo && (checking || canLog(status)), checking, demo }
}

/**
 * Aktuell tillgång, synkront ur butikerna – för kod utanför React. En sparad nyckel som ännu inte
 * har verifierats räknas som "kontrolleras" (loggning tillåten) och verifieras i bakgrunden.
 */
export function currentAccess(now: number = Date.now()): AccessInfo {
  const state = useLicenseStore.getState()
  const trialStartedAt = state.trialStartedAt
  const licenseKey = usableLicenseKey(state.licenseKey)
  if (licenseKey && !checks.has(licenseKey)) void verifyLicenseCached(licenseKey)
  if (storePending()) void refreshStoreEntitlements()
  return computeAccess({
    licenseKey,
    trialStartedAt,
    onboardingDone: useProfileStore.getState().settings.onboardingDone,
    demo: isDemoData(),
    store: storeEntitlements,
    now,
  })
}

/** Verifierad licens (asynkront, WebCrypto) + köp i appen + provperiod → aktuell status. */
export function useAccess(): AccessInfo {
  const licenseKey = usableLicenseKey(useLicenseStore((s) => s.licenseKey))
  const trialStartedAt = useLicenseStore((s) => s.trialStartedAt)
  const onboardingDone = useProfileStore((s) => s.settings.onboardingDone)
  const ensureTrialStarted = useLicenseStore((s) => s.ensureTrialStarted)
  const demo = useDemoData()
  const version = useSyncExternalStore(subscribeChecks, () => checkVersion)
  const revVersion = useSyncExternalStore(subscribeRevocations, revocationVersion)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (licenseKey && !checks.has(licenseKey)) void verifyLicenseCached(licenseKey)
  }, [licenseKey])

  // Provperioden startar när profilen skapas (välkomstflödet anropar ensureTrialStarted).
  // Profiler som skapades innan appen fick provperiod får hela provperioden räknad från nu, så att
  // ingen spärras direkt efter en uppdatering. Exempeldata startar ingen provperiod.
  useEffect(() => {
    if (!onboardingDone || demo || trialStartedAt !== null) return
    ensureTrialStarted(Date.now())
  }, [onboardingDone, demo, trialStartedAt, ensureTrialStarted])

  // En sparad provstart i framtiden rättas till nu (se accessStatus) – annars skulle man kunna
  // ställa fram klockan, skapa profilen och sedan ställa tillbaka klockan för en längre provperiod.
  // (`now` i beroendena: kontrollera igen när appen återfår fokus.)
  useEffect(() => {
    const t = Date.now()
    if (trialStartedAt !== null && trialStartedAt > t) ensureTrialStarted(t)
  }, [trialStartedAt, now, ensureTrialStarted])

  // Köp i appen och spärrlistan: vid start och när appen återfår fokus (spärrlistan högst en
  // gång per dygn, och bara när en licensnyckel finns).
  useEffect(() => {
    void refreshStoreEntitlements()
    if (licenseKey) void refreshRevocations()
  }, [now, licenseKey])

  // Uppdatera "dagar kvar" när appen återfår fokus och en gång i timmen.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = window.setInterval(tick, 3_600_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])

  return useMemo(
    () => computeAccess({ licenseKey, trialStartedAt, onboardingDone, demo, store: storeEntitlements, now }),
    // `version` ändras när en verifiering blir klar eller köpen i appen uppdateras, `revVersion`
    // när spärrlistan uppdateras (resultaten läses ur de delade cacharna).
    [licenseKey, trialStartedAt, onboardingDone, demo, now, version, revVersion],
  )
}
