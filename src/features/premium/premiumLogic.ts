/**
 * Lagom Premium – ren logik för köp, aktivering och statustexter (testbar utan React).
 *
 * Köp i skarpt läge: `startCheckout` → POST /api/create-checkout { plan } → { url } → Stripe
 * Checkout → tillbaka till #/tack?session_id=… → `verifyPurchase` → POST /api/verify-purchase
 * { sessionId } → { licenseKey } → nyckeln verifieras lokalt (ECDSA) och sparas.
 */
import { API_BASE, COMMERCE_MODE, LICENSE_PUBLIC_KEY, SUPPORT_EMAIL, TRIAL_DAYS, type Plan, type PlanId } from '../../config/commerce'
import { LICENSE_ERRORS, createTestLicense, normalizeLicenseKey, verifyLicense, type LicensePayload } from '../../lib/license'
import { MONTHS } from '../../lib/dates'
import { formatNumber, plural } from '../../lib/format'
import type { Tone } from '../../components/ui'
import { primeLicenseCheck, type AccessStatus } from '../../hooks/useAccess'
import { useLicenseStore } from '../../stores/licenseStore'

// ---------------------------------------------------------------------------
// Formatering
// ---------------------------------------------------------------------------

/** 599 → "599 kr" (hela kronor, fast mellanslag). */
export function formatPrice(kr: number): string {
  return `${formatNumber(kr)} kr`
}

/** Epoch-ms → "27 september 2027". */
export function formatLongDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "11 dagar" / "1 dag". */
export function daysText(n: number): string {
  return plural(n, 'dag', 'dagar')
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

export function statusSummary(status: AccessStatus): StatusSummary {
  switch (status.kind) {
    case 'ny':
      return {
        label: 'Provperiod',
        title: `Prova gratis i ${TRIAL_DAYS} dagar`,
        text: 'Inget kort behövs. Skapa din profil och börja logga direkt – provperioden startar när profilen är klar.',
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
        return { label: name, title: `${name} – Lagom är ditt`, text: 'Gäller för alltid, med alla framtida uppdateringar. Tack för att du stödjer Lagom!', tone: 'mossa' }
      }
      return {
        label: name,
        title: `${name} – giltig till ${formatLongDate(status.expiresAt)}`,
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
export type TrialBannerLevel = 'none' | 'chip' | 'soon' | 'expired'

export const TRIAL_SOON_DAYS = 3

export function trialBannerLevel(status: AccessStatus): TrialBannerLevel {
  if (status.kind === 'prov') return status.daysLeft <= TRIAL_SOON_DAYS ? 'soon' : 'chip'
  if (status.kind === 'utgangen') return 'expired'
  return 'none'
}

/** Planer som är värda att visa: inga vid livstidslicens, bara livstid vid en färsk årslicens. */
export function plansToOffer(status: AccessStatus, plans: readonly Plan[]): Plan[] {
  if (status.kind !== 'licensierad') return [...plans]
  if (status.expiresAt === undefined) return []
  // Mindre än en månad kvar: erbjud förnyelse också.
  if ((status.daysLeft ?? 0) <= 30) return [...plans]
  return plans.filter((p) => !p.durationDays)
}

// ---------------------------------------------------------------------------
// Aktivering av licensnyckel
// ---------------------------------------------------------------------------

export type ActivationResult = { ok: true; key: string; payload: LicensePayload } | { ok: false; message: string }

/** Verifiera en inklistrad nyckel och spara den på enheten om den är giltig. */
export async function activateLicense(input: string, now: number = Date.now()): Promise<ActivationResult> {
  const key = normalizeLicenseKey(input)
  if (!key) return { ok: false, message: 'Klistra in din licensnyckel först.' }
  const result = await verifyLicense(key, { publicKey: LICENSE_PUBLIC_KEY, mode: COMMERCE_MODE, now })
  if (!result.ok) return { ok: false, message: LICENSE_ERRORS[result.reason] }
  primeLicenseCheck(key, result)
  useLicenseStore.getState().setLicense(key)
  return { ok: true, key, payload: result.payload }
}

/** Testläge: utfärda en osignerad testlicens direkt (ingen betalning). */
export async function buyInTestMode(plan: Plan, now: number = Date.now()): Promise<ActivationResult> {
  return activateLicense(createTestLicense(plan.id, plan.durationDays, now), now)
}

// ---------------------------------------------------------------------------
// Serveranrop (skarpt läge)
// ---------------------------------------------------------------------------

export type PurchaseErrorCode = 'offline' | 'server' | 'not-found' | 'invalid'

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
}

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

/** Skapa en Stripe Checkout-session för planen. Returnerar adressen att skicka användaren till. */
export async function createCheckout(plan: PlanId): Promise<string> {
  const { status, json } = await postJson('/api/create-checkout', { plan })
  if (status < 200 || status >= 300) throw new PurchaseError('server', PURCHASE_ERRORS.server)
  const url = json?.url
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw new PurchaseError('invalid', PURCHASE_ERRORS.invalid)
  return url
}

export type VerifyPurchaseResult = { kind: 'ok'; licenseKey: string } | { kind: 'pending' }

/** Hämta licensnyckeln för en genomförd betalning. "pending" = betalningen är inte klar ännu. */
export async function verifyPurchase(sessionId: string): Promise<VerifyPurchaseResult> {
  const { status, json } = await postJson('/api/verify-purchase', { sessionId })
  if (status === 202 || json?.status === 'pending' || json?.pending === true) return { kind: 'pending' }
  if (status >= 500) throw new PurchaseError('server', PURCHASE_ERRORS.server)
  if (status < 200 || status >= 300) throw new PurchaseError('not-found', PURCHASE_ERRORS['not-found'])
  const key = json?.licenseKey
  if (typeof key !== 'string' || !key) throw new PurchaseError('invalid', PURCHASE_ERRORS.invalid)
  return { kind: 'ok', licenseKey: key }
}

/** Lämna appen för betalningen (egen funktion så att testerna kan fånga den). */
export function redirectTo(url: string): void {
  window.location.assign(url)
}

/** Session-id från adressen – i hash-delen (#/tack?session_id=…) eller, som reserv, före den. */
export function sessionIdFrom(hashSearch: URLSearchParams, locationSearch: string = typeof window !== 'undefined' ? window.location.search : ''): string | null {
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
