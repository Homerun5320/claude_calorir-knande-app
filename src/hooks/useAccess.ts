/**
 * Tillgång till appen: provperiod, licens eller utgången.
 *
 * Efter provperioden kan man fortfarande se, exportera och radera all sin data – bara ny loggning
 * kräver en licens. Användarens data låses aldrig.
 */
import { useEffect, useMemo, useState } from 'react'
import { COMMERCE_MODE, LICENSE_PUBLIC_KEY, TRIAL_DAYS, planById, type Plan } from '../config/commerce'
import { verifyLicense, type LicenseCheck, type LicensePayload } from '../lib/license'
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
  const { trialStartedAt, license, now } = input
  const trialDays = input.trialDays ?? TRIAL_DAYS
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
  return { kind: 'utgangen', endedAt: license && !license.ok && license.reason === 'utgangen' ? now : endsAt, licenseExpired: Boolean(license && !license.ok && license.reason === 'utgangen') }
}

/** true om man får logga ny mat, träning, vikt m.m. */
export function canLog(status: AccessStatus): boolean {
  return status.kind !== 'utgangen'
}

/** Verifierad licens (asynkront, WebCrypto) + provperiod → aktuell status. */
export function useAccess(): { status: AccessStatus; canLog: boolean; checking: boolean } {
  const licenseKey = useLicenseStore((s) => s.licenseKey)
  const trialStartedAt = useLicenseStore((s) => s.trialStartedAt)
  const onboardingDone = useProfileStore((s) => s.settings.onboardingDone)
  const profileCreatedAt = useProfileStore((s) => s.profile?.createdAt)
  const ensureTrialStarted = useLicenseStore((s) => s.ensureTrialStarted)
  const [check, setCheck] = useState<{ key: string; result: LicenseCheck } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!licenseKey) return
    let cancelled = false
    void verifyLicense(licenseKey, { publicKey: LICENSE_PUBLIC_KEY, mode: COMMERCE_MODE }).then((result) => {
      if (!cancelled) setCheck({ key: licenseKey, result })
    })
    return () => {
      cancelled = true
    }
  }, [licenseKey])

  // Provperioden startar när profilen skapas (även för profiler från tidigare versioner).
  useEffect(() => {
    if (onboardingDone && trialStartedAt === null) ensureTrialStarted(profileCreatedAt && profileCreatedAt > 0 ? profileCreatedAt : Date.now())
  }, [onboardingDone, trialStartedAt, profileCreatedAt, ensureTrialStarted])

  // Uppdatera "dagar kvar" när appen återfår fokus och en gång i timmen.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = window.setInterval(tick, 3_600_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const checking = Boolean(licenseKey) && check?.key !== licenseKey
  const license = licenseKey && check?.key === licenseKey ? check.result : null

  return useMemo(() => {
    // Tills effekten ovan har sparat starten räknas provperioden från nu.
    const start = trialStartedAt ?? (onboardingDone ? now : null)
    const status = accessStatus({ trialStartedAt: start, license, now })
    // Under verifiering av en sparad licens: lås inte användaren ute.
    const allowed = checking || canLog(status)
    return { status, canLog: allowed, checking }
  }, [trialStartedAt, onboardingDone, license, now, checking])
}
