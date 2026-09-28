/**
 * Tack för ditt köp (/tack?session_id=…) – hit skickar Stripe Checkout tillbaka köparen.
 *
 * Hämtar licensnyckeln (POST /api/verify-purchase { sessionId } → { licenseKey }), verifierar den
 * lokalt och sparar den på enheten. Visar nyckeln med kopiera-knapp och råd om att spara den.
 * Klarar att betalningen inte är klar än (försöker igen automatiskt), fel och att man är offline.
 * Fungerar med hash-routing (#/tack?session_id=…) och nås även före välkomstflödet.
 *
 * Finns redan en giltig licens på enheten som är minst lika bra (t.ex. en livstidslicens) byts den
 * inte ut automatiskt – då får man välja. Annars skulle en länk med någon annans köp-id kunna byta
 * ut ens licens.
 *
 * I butiksapparna finns inga webbköp – där skickas man vidare till köpsidan.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Clock, Mail, RefreshCw, WifiOff } from 'lucide-react'
import { Button, Card, PageHeader, Spinner } from '../../components/ui'
import { Confetti } from '../../components/signature'
import { SUPPORT_EMAIL, planById } from '../../config/commerce'
import { isInApp, isStandalone } from '../../config/platform'
import { decodeLicense } from '../../lib/license'
import { useAccess, verifyLicenseCached } from '../../hooks/useAccess'
import { useLicenseStore } from '../../stores/licenseStore'
import { useProfileStore } from '../../stores/profileStore'
import { LicenseKeyBox, PurchaseSuccess, SAVE_KEY_ADVICE } from './components'
import { PURCHASE_ERRORS, PurchaseError, activateLicense, sessionIdFrom, verifyPurchase, type PurchaseErrorCode } from './premiumLogic'
import { isLicenseRevoked, prepareRevocationCheck } from './revocations'

/** Hur många gånger vi frågar igen automatiskt medan betalningen behandlas, och hur tätt. */
export const PENDING_RETRIES = 5
export const PENDING_DELAY_MS = 3000

type State =
  | { kind: 'working' }
  | { kind: 'pending'; tries: number }
  | { kind: 'ok'; key: string }
  /** En giltig licens som är minst lika bra finns redan – fråga innan den byts ut. */
  | { kind: 'choose'; key: string; busy?: boolean; error?: string }
  /** Den befintliga licensen behölls. */
  | { kind: 'kept'; key: string }
  | { kind: 'error'; code: PurchaseErrorCode | 'license'; message: string; key?: string }
  | { kind: 'missing' }

/** Enhetens licensnyckel om den gäller (verifierad, inte utgången och inte återkallad), annars null. */
async function validCurrentLicense(): Promise<string | null> {
  const key = useLicenseStore.getState().licenseKey
  if (!key) return null
  const check = await verifyLicenseCached(key).catch(() => null)
  if (!check?.ok) return null
  await prepareRevocationCheck(key)
  return isLicenseRevoked(key, check.payload) ? null : key
}

/** Licensens giltighet utan att verifiera signaturen: utgångstid i ms, Infinity för livstid, -1 = oläsbar. */
function licenseReach(key: string | null): number {
  const payload = key ? decodeLicense(key) : null
  if (!payload) return -1
  return payload.exp === undefined ? Number.POSITIVE_INFINITY : payload.exp * 1000
}

/**
 * true om den nya nyckeln inte ska aktiveras utan att fråga: enheten har redan en giltig licens
 * för ett annat köp som gäller minst lika länge. En uppgradering (årslicens → livstid) eller en
 * förnyelse (senare utgång) aktiveras direkt.
 */
export function askBeforeReplacing(currentKey: string | null, currentValid: boolean, newKey: string): boolean {
  if (!currentKey || !currentValid || currentKey === newKey) return false
  if (decodeLicense(currentKey)?.id === decodeLicense(newKey)?.id) return false
  return licenseReach(newKey) <= licenseReach(currentKey)
}

function supportMailto(sessionId: string | null): string {
  const body = `Hej!\n\nJag har köpt Lagom men fick ingen licens.\n\nBetalningens id: ${sessionId ?? 'saknas'}\n`
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Hjälp med mitt köp av Lagom')}&body=${encodeURIComponent(body)}`
}

export default function ThankYouPage() {
  // Stripe skickar aldrig tillbaka någon till en butiksapp. (När webbförsäljningen är avstängd på
  // webben visas sidan ändå, så att ett köp som påbörjades innan dess kan hämtas.)
  if (isInApp()) return <Navigate to="/premium" replace />
  return <ThankYouContent />
}

function ThankYouContent() {
  const [params] = useSearchParams()
  const sessionId = sessionIdFrom(params)
  const onboardingDone = useProfileStore((s) => s.settings.onboardingDone)
  const licenseKey = useLicenseStore((s) => s.licenseKey)
  const { status } = useAccess()
  const [state, setState] = useState<State>(() => (sessionId ? { kind: 'working' } : { kind: 'missing' }))
  const run = useRef(0)

  const check = useCallback(
    async (tries = 0) => {
      if (!sessionId) return
      const id = ++run.current
      setState(tries > 0 ? { kind: 'pending', tries } : { kind: 'working' })
      try {
        const result = await verifyPurchase(sessionId)
        if (id !== run.current) return
        if (result.kind === 'pending') {
          setState({ kind: 'pending', tries: tries + 1 })
          return
        }
        const current = await validCurrentLicense()
        if (id !== run.current) return
        if (askBeforeReplacing(current, current !== null, result.licenseKey)) {
          setState({ kind: 'choose', key: result.licenseKey })
          return
        }
        const activated = await activateLicense(result.licenseKey)
        if (id !== run.current) return
        setState(activated.ok ? { kind: 'ok', key: activated.key } : { kind: 'error', code: 'license', message: activated.message, key: result.licenseKey })
      } catch (err) {
        if (id !== run.current) return
        const e = err instanceof PurchaseError ? err : new PurchaseError('server', PURCHASE_ERRORS.server)
        setState({ kind: 'error', code: e.code, message: e.message })
      }
    },
    [sessionId],
  )

  useEffect(() => {
    void check()
    return () => {
      run.current++
    }
  }, [check])

  // Betalningen behandlas: fråga igen automatiskt ett par gånger.
  const pendingTries = state.kind === 'pending' ? state.tries : 0
  useEffect(() => {
    if (pendingTries === 0 || pendingTries > PENDING_RETRIES) return
    const t = window.setTimeout(() => void check(pendingTries), PENDING_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [pendingTries, check])

  // Offline: försök igen så fort uppkopplingen är tillbaka.
  const offline = state.kind === 'error' && state.code === 'offline'
  useEffect(() => {
    if (!offline) return
    const retry = () => void check()
    window.addEventListener('online', retry)
    // Uppkopplingen kan ha kommit tillbaka innan lyssnaren hann registreras – då kommer inget
    // 'online'-event, så kontrollera direkt.
    if (typeof navigator !== 'undefined' && navigator.onLine) retry()
    return () => window.removeEventListener('online', retry)
  }, [offline, check])

  const next = onboardingDone ? (
    <Button to="/" iconRight={ArrowRight}>
      Till Idag
    </Button>
  ) : (
    <Button to="/valkommen" iconRight={ArrowRight}>
      Skapa min profil
    </Button>
  )

  const okKey = state.kind === 'ok' ? state.key : null
  const plan = okKey ? planById(decodeLicense(okKey)?.plan) : undefined

  const replace = async (key: string) => {
    setState({ kind: 'choose', key, busy: true })
    const activated = await activateLicense(key)
    setState(activated.ok ? { kind: 'ok', key: activated.key } : { kind: 'choose', key, error: activated.message })
  }
  const planName = (key: string | null) => planById(key ? decodeLicense(key)?.plan : undefined)?.name.toLocaleLowerCase('sv-SE') ?? 'licens'

  return (
    <div className="px-4 pb-10">
      <PageHeader title={state.kind === 'ok' ? 'Tack för ditt köp!' : 'Ditt köp'} backTo="/premium" backLabel="Till Lagom Premium" />
      <Confetti fire={state.kind === 'ok'} fullscreen />

      <div className="flex max-w-xl flex-col gap-4">
        {state.kind === 'ok' && (
          <>
            <PurchaseSuccess licenseKey={state.key} planName={plan?.name} next={next} />
            {!isInApp() && !isStandalone() && (
              <p role="note" className="rounded-2xl bg-surface-2 px-4 py-3 text-[0.875rem] leading-relaxed text-ink-2">
                Har du Lagom på hemskärmen? Webbläsaren och appen sparar data var för sig – öppna appen och klistra in nyckeln under Inställningar →
                Licens.
              </p>
            )}
          </>
        )}

        {state.kind === 'choose' && (
          <Card padding="lg" tone="sol">
            <h2 className="font-display text-[1.25rem] font-semibold tracking-tight text-ink">Du har redan en licens</h2>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
              På den här enheten finns redan en {planName(licenseKey)} som gäller minst lika länge som den nya ({planName(state.key)}). Vill du byta?
            </p>
            {state.error && (
              <p role="alert" className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
                {state.error}
              </p>
            )}
            <div className="mt-4">
              <LicenseKeyBox licenseKey={state.key} intro="Spara den nya nyckeln – du kan använda den på en annan enhet." />
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => setState({ kind: 'kept', key: state.key })} disabled={state.busy}>
                Behåll min nuvarande licens
              </Button>
              <Button variant="secondary" loading={state.busy} onClick={() => void replace(state.key)}>
                Byt till den nya licensen
              </Button>
            </div>
          </Card>
        )}

        {state.kind === 'kept' && (
          <Card padding="lg">
            <h2 className="font-display text-[1.25rem] font-semibold tracking-tight text-ink">Din nuvarande licens gäller som förut</h2>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">Den nya nyckeln är inte aktiverad här. Spara den om du vill använda den på en annan enhet.</p>
            <div className="mt-4">
              <LicenseKeyBox licenseKey={state.key} intro={SAVE_KEY_ADVICE} />
            </div>
            <div className="mt-5">{next}</div>
          </Card>
        )}

        {state.kind === 'working' && (
          <Card padding="lg" role="status" aria-busy="true" className="flex items-center gap-3">
            <Spinner className="size-5 text-gran" />
            <p className="text-[0.9375rem] text-ink-2">Vi hämtar din licens …</p>
          </Card>
        )}

        {state.kind === 'pending' && (
          <Card padding="lg" tone="fjall" role="status">
            <div className="flex items-start gap-3">
              <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-2" />
              <div className="min-w-0">
                <h2 className="font-display text-[1.25rem] font-semibold tracking-tight text-ink">Betalningen behandlas</h2>
                <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
                  {state.tries > PENDING_RETRIES
                    ? 'Det tar lite längre tid än vanligt. Kontrollera igen om en stund – köpet försvinner inte, och du kan alltid mejla oss.'
                    : 'Det kan ta en liten stund innan betalningen är klar. Vi kontrollerar igen automatiskt.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" iconLeft={RefreshCw} onClick={() => void check(0)}>
                    Kontrollera igen
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {state.kind === 'error' && (
          <Card padding="lg" tone="sol">
            <div className="flex items-start gap-3">
              {state.code === 'offline' ? (
                <WifiOff aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-2" />
              ) : (
                <Mail aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-2" />
              )}
              <div className="min-w-0">
                <h2 className="font-display text-[1.25rem] font-semibold tracking-tight text-ink">
                  {state.code === 'offline' ? 'Ingen uppkoppling' : 'Licensen kunde inte hämtas'}
                </h2>
                <p role="alert" className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
                  {state.message}
                </p>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">
                  Har du betalat? Då finns betalningen hos Stripe – försök igen om en stund, eller mejla oss kvittot så skickar vi licensen.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" iconLeft={RefreshCw} onClick={() => void check(0)}>
                    Försök igen
                  </Button>
                  <a
                    href={supportMailto(sessionId)}
                    className="relative inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[0.8125rem] font-semibold text-ink-2 transition-colors after:absolute after:inset-x-0 after:-inset-y-1 hover:bg-surface-2 hover:text-ink"
                  >
                    <Mail aria-hidden className="size-4" />
                    Mejla supporten
                  </a>
                </div>
                {state.key && (
                  <div className="mt-4">
                    <LicenseKeyBox licenseKey={state.key} intro="Spara nyckeln nedan och skicka den till supporten, så hjälper vi dig." />
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {state.kind === 'missing' &&
          (licenseKey && status.kind === 'licensierad' ? (
            <PurchaseSuccess licenseKey={licenseKey} planName={status.plan?.name} next={next} />
          ) : (
            <Card padding="lg">
              <h2 className="font-display text-[1.25rem] font-semibold tracking-tight text-ink">Vi hittar inget köp i adressen</h2>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
                Kom du hit från betalningen men ser inte din licens? Mejla oss med kvittot så hjälper vi dig. Har du redan en licensnyckel kan du klistra
                in den på köpsidan.
              </p>
              {licenseKey && <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">{SAVE_KEY_ADVICE}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button to="/premium" variant="secondary">
                  Till Lagom Premium
                </Button>
                <a
                  href={supportMailto(null)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-2xl px-4 text-[0.9375rem] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Mail aria-hidden className="size-4" />
                  Mejla supporten
                </a>
              </div>
            </Card>
          ))}
      </div>
    </div>
  )
}
