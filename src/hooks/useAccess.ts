/**
 * Tillgång till appen: provperiod, licens eller utgången.
 *
 * Efter provperioden kan man fortfarande se, exportera och radera all sin data – bara ny loggning
 * kräver en licens. Användarens data låses aldrig.
 *
 * - `accessStatus` – ren funktion (testbar utan React).
 * - `currentAccess()` – synkron status ur butikerna, för kod utanför React (t.ex. `requireAccess`).
 * - `useAccess()` – samma status som hook; verifierar licensnyckeln (WebCrypto) och uppdateras
 *   när appen återfår fokus.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { COMMERCE_MODE, LICENSE_PUBLIC_KEY, TRIAL_DAYS, planById, type Plan } from '../config/commerce'
import { verifyLicense, type LicenseCheck, type LicensePayload } from '../lib/license'
import { isDemoData } from '../lib/demoFlag'
import { useLicenseStore } from '../stores/licenseStore'
import { useProfileStore } from '../stores/profileStore'

const DAY_MS = 86_400_000

export type AccessStatus =
  | { kind: 'licensierad'; plan: Plan | undefined; payload: LicensePayload; expiresAt?: number; daysLeft?: number; test: boolean }
  | { kind: 'prov'; daysLeft: number; endsAt: number }
  | { kind: 'utgangen'; endedAt: number; licenseExpired: boolean }
  /** Ingen profil ännu (välkomstflödet) – provperioden har inte startat. */
  | { kind: 'ny' }

/** Ren funktion för statusen – testbar utan React. */
export function accessStatus(input: {
  trialStartedAt: number | null
  license: LicenseCheck | null
  now: number
  trialDays?: number
}): AccessStatus {
  const { trialStartedAt, now } = input
  let license = input.license
  const trialDays = input.trialDays ?? TRIAL_DAYS
  // En licens som var giltig vid kontrollen kan ha gått ut sedan dess (appen har stått öppen).
  if (license?.ok && license.payload.exp !== undefined && license.payload.exp * 1000 <= now) {
    license = { ok: false, reason: 'utgangen' }
  }
  if (license?.ok) {
    const expiresAt = license.payload.exp !== undefined ? license.payload.exp * 1000 : undefined
    return {
      kind: 'licensierad',
      plan: planById(license.payload.plan),
      payload: license.payload,
      expiresAt,
      daysLeft: expiresAt !== undefined ? Math.max(0, Math.ceil((expiresAt - now) / DAY_MS)) : undefined,
      test: Boolean(license.payload.test),
    }
  }
  if (trialStartedAt === null) return { kind: 'ny' }
  const endsAt = trialStartedAt + trialDays * DAY_MS
  if (now < endsAt) return { kind: 'prov', daysLeft: Math.max(1, Math.ceil((endsAt - now) / DAY_MS)), endsAt }
  const licenseExpired = Boolean(license && !license.ok && license.reason === 'utgangen')
  return { kind: 'utgangen', endedAt: licenseExpired ? now : endsAt, licenseExpired }
}

/** true om man får logga ny mat, träning, vikt m.m. */
export function canLog(status: AccessStatus): boolean {
  return status.kind !== 'utgangen'
}

// ---------------------------------------------------------------------------
// Verifierade licensnycklar (delas av alla komponenter, så att statusen inte blinkar)
// ---------------------------------------------------------------------------

const checks = new Map<string, LicenseCheck>()
const pending = new Map<string, Promise<LicenseCheck>>()
const checkListeners = new Set<() => void>()
let checkVersion = 0

function subscribeChecks(listener: () => void): () => void {
  checkListeners.add(listener)
  return () => checkListeners.delete(listener)
}

/** Resultatet av en tidigare verifiering av nyckeln, om det finns. */
export function cachedLicenseCheck(key: string): LicenseCheck | undefined {
  return checks.get(key)
}

/** Verifiera en nyckel (med appens publika nyckel och läge) och kom ihåg svaret. */
export function verifyLicenseCached(key: string): Promise<LicenseCheck> {
  const done = checks.get(key)
  if (done) return Promise.resolve(done)
  const running = pending.get(key)
  if (running) return running
  const p = verifyLicense(key, { publicKey: LICENSE_PUBLIC_KEY, mode: COMMERCE_MODE })
    .catch((): LicenseCheck => ({ ok: false, reason: 'signatur' }))
    .then((result) => {
      checks.set(key, result)
      pending.delete(key)
      checkVersion++
      checkListeners.forEach((l) => l())
      return result
    })
  pending.set(key, p)
  return p
}

/** Spara ett färskt verifieringsresultat (t.ex. direkt efter aktivering), så att statusen uppdateras utan fördröjning. */
export function primeLicenseCheck(key: string, result: LicenseCheck): void {
  checks.set(key, result)
  pending.delete(key)
  checkVersion++
  checkListeners.forEach((l) => l())
}

/** Endast för tester: glöm alla verifieringar. */
export function resetLicenseChecks(): void {
  checks.clear()
  pending.clear()
  checkVersion++
  checkListeners.forEach((l) => l())
}

export interface AccessInfo {
  status: AccessStatus
  /** Får man logga nytt? (true medan en sparad licens verifieras – ingen ska låsas ute i onödan.) */
  canLog: boolean
  /** En sparad licensnyckel verifieras just nu. */
  checking: boolean
}

function computeAccess(input: {
  licenseKey: string | null
  trialStartedAt: number | null
  onboardingDone: boolean
  now: number
}): AccessInfo {
  const { licenseKey, trialStartedAt, onboardingDone, now } = input
  const license = licenseKey ? (checks.get(licenseKey) ?? null) : null
  const checking = Boolean(licenseKey) && license === null
  // Tills provstarten har sparats räknas provperioden från nu.
  const start = trialStartedAt ?? (onboardingDone ? now : null)
  const status = accessStatus({ trialStartedAt: start, license, now })
  return { status, canLog: checking || canLog(status), checking }
}

/**
 * Aktuell tillgång, synkront ur butikerna – för kod utanför React. En sparad nyckel som ännu inte
 * har verifierats räknas som "kontrolleras" (loggning tillåten) och verifieras i bakgrunden.
 */
export function currentAccess(now: number = Date.now()): AccessInfo {
  const { licenseKey, trialStartedAt } = useLicenseStore.getState()
  if (licenseKey && !checks.has(licenseKey)) void verifyLicenseCached(licenseKey)
  return computeAccess({ licenseKey, trialStartedAt, onboardingDone: useProfileStore.getState().settings.onboardingDone, now })
}

/** Verifierad licens (asynkront, WebCrypto) + provperiod → aktuell status. */
export function useAccess(): AccessInfo {
  const licenseKey = useLicenseStore((s) => s.licenseKey)
  const trialStartedAt = useLicenseStore((s) => s.trialStartedAt)
  const onboardingDone = useProfileStore((s) => s.settings.onboardingDone)
  const profileCreatedAt = useProfileStore((s) => s.profile?.createdAt)
  const ensureTrialStarted = useLicenseStore((s) => s.ensureTrialStarted)
  const version = useSyncExternalStore(subscribeChecks, () => checkVersion)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (licenseKey && !checks.has(licenseKey)) void verifyLicenseCached(licenseKey)
  }, [licenseKey])

  // Provperioden startar när profilen skapas (även för profiler från tidigare versioner).
  // Exempeldatans profil är bakdaterad – då räknas provperioden från nu, inte från exemplets start.
  useEffect(() => {
    if (!onboardingDone || trialStartedAt !== null) return
    const created = profileCreatedAt && profileCreatedAt > 0 && profileCreatedAt <= Date.now() && !isDemoData() ? profileCreatedAt : Date.now()
    ensureTrialStarted(created)
  }, [onboardingDone, trialStartedAt, profileCreatedAt, ensureTrialStarted])

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
    () => computeAccess({ licenseKey, trialStartedAt, onboardingDone, now }),
    // `version` ändras när en verifiering blir klar (resultatet läses ur den delade cachen).
    [licenseKey, trialStartedAt, onboardingDone, now, version],
  )
}
