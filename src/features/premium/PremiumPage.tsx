/**
 * Lagom Premium (/premium) – status, priser, köp, aktivering av licensnyckel och köpvillkor.
 *
 * Lugn och ärlig: priserna inklusive moms, ingen automatisk förnyelse, ingen nedräkning som
 * stressar. Köpet kräver ett uttryckligt samtycke om att ångerrätten upphör när licensen
 * levereras direkt (distansavtalslagen 2 kap. 11 §).
 *
 * - Testläge: köpknappen utfärdar en testlicens direkt (ingen betalning).
 * - Skarpt läge: POST /api/create-checkout → Stripe Checkout → #/tack?session_id=…
 * - Butiksappar (`!sellsOnWeb()` i en app): inga kronpriser, ingen Stripe – köpet görs i App Store
 *   eller Google Play (`StorePurchasePanel`) och priset visas av butiken.
 * - Webben med webbförsäljningen avstängd: länkar till appbutikerna (`StoreLinksPanel`).
 *
 * Nås även före välkomstflödet och efter provperioden.
 */
import { useState } from 'react'
import { ArrowRight, Download, Sprout, UserRound } from 'lucide-react'
import { Button, Card, PageHeader, Spinner, toast } from '../../components/ui'
import { Confetti } from '../../components/signature'
import { COMMERCE_MODE, PLANS, TRIAL_DAYS, type Plan } from '../../config/commerce'
import { allowsLicenseKeyEntry, isInApp, offersLicenseRecovery, sellsOnWeb } from '../../config/platform'
import { useAccess } from '../../hooks/useAccess'
import { useLicenseStore } from '../../stores/licenseStore'
import { useProfileStore } from '../../stores/profileStore'
import {
  CheckoutSheet,
  FeatureList,
  LicenseActivation,
  LicenseManage,
  LicenseRecovery,
  PlanCard,
  PurchaseSuccess,
  SellerFooter,
  StatusHero,
  StoreLinksPanel,
  StorePurchasePanel,
  TermsContent,
  TestModeBanner,
} from './components'
import { StartOwnProfileButton } from './AccessGate'
import { PURCHASE_ERRORS, PurchaseError, buyInTestMode, createCheckout, plansToOffer, redirectTo } from './premiumLogic'

function SectionHeading({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="font-display text-[1.375rem] font-semibold leading-tight tracking-tight text-ink">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">{subtitle}</p>}
    </div>
  )
}

export default function PremiumPage() {
  const { status, checking, demo } = useAccess()
  const licenseKey = useLicenseStore((s) => s.licenseKey)
  const onboardingDone = useProfileStore((s) => s.settings.onboardingDone)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bought, setBought] = useState<{ key: string; plan: Plan } | null>(null)
  const [burst, setBurst] = useState(0)

  const choose = (p: Plan) => {
    setPlan(p)
    setError(null)
    setSheetOpen(true)
  }

  const confirm = async (p: Plan) => {
    setBusy(true)
    setError(null)
    if (COMMERCE_MODE === 'test') {
      const result = await buyInTestMode(p)
      setBusy(false)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSheetOpen(false)
      setBought({ key: result.key, plan: p })
      setBurst((n) => n + 1)
      toast(`${p.name} aktiverad (testläge)`, { tone: 'success' })
      return
    }
    try {
      const url = await createCheckout(p.id)
      // Knappen fortsätter att visa laddning tills webbläsaren har lämnat sidan.
      redirectTo(url)
    } catch (err) {
      setBusy(false)
      setError(err instanceof PurchaseError ? err.message : PURCHASE_ERRORS.server)
    }
  }

  const web = sellsOnWeb()
  const inApp = isInApp()
  const keyEntry = allowsLicenseKeyEntry()
  const offered = plansToOffer(status, PLANS)
  const licensed = status.kind === 'licensierad'
  // Utan webbköp visas köppanelen så länge det finns något att köpa (inte vid livstidslicens).
  const showStorePanel = !web && offered.length > 0
  const plansTitle = !licensed ? 'Välj din licens' : offered.length === 1 ? 'Vill du ha Lagom för alltid?' : 'Förnya din licens'
  const next = onboardingDone ? (
    <Button to="/" iconRight={ArrowRight}>
      Till Idag
    </Button>
  ) : (
    <Button to="/valkommen" iconRight={ArrowRight}>
      Skapa min profil
    </Button>
  )

  return (
    <div className="px-4 pb-10">
      <PageHeader back title="Lagom Premium" subtitle={`${TRIAL_DAYS} dagar gratis, sedan ett tydligt köp. Ingen reklam och ingen automatisk förnyelse.`} />
      <Confetti fire={burst} fullscreen />

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <TestModeBanner />
          {bought && <PurchaseSuccess licenseKey={bought.key} planName={bought.plan.name} next={next} />}
          {checking ? (
            <Card padding="lg" role="status" aria-busy="true" className="flex items-center gap-3 text-ink-2">
              <Spinner />
              Kontrollerar din licens …
            </Card>
          ) : (
            !bought && (
              <StatusHero
                status={status}
                actions={
                  demo ? (
                    <StartOwnProfileButton confirm fullWidth={false} />
                  ) : status.kind === 'ny' ? (
                    <Button to="/valkommen" iconLeft={UserRound}>
                      Skapa min profil
                    </Button>
                  ) : status.kind === 'utgangen' ? (
                    <Button to="/installningar/data" variant="secondary" iconLeft={Download}>
                      Exportera min data
                    </Button>
                  ) : undefined
                }
              />
            )
          )}
        </div>

        {showStorePanel && (inApp ? <StorePurchasePanel headingId="premium-planer" planIds={offered.map((p) => p.id)} /> : <StoreLinksPanel headingId="premium-planer" />)}

        {web && offered.length > 0 && (
          <section aria-labelledby="premium-planer">
            <SectionHeading
              id="premium-planer"
              title={plansTitle}
              subtitle="Samma Lagom i båda – allt ingår. Priserna är inklusive moms och inget förnyas automatiskt."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {offered.map((p) => (
                <PlanCard key={p.id} plan={p} onChoose={choose} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="premium-ingar">
          <SectionHeading id="premium-ingar" title="Allt ingår" subtitle="Inga nivåer och inga tillägg. Streckkodsläsaren och alla näringsämnen ingår." />
          <FeatureList />
        </section>

        {(keyEntry || licenseKey) && (
          <section aria-labelledby="premium-licens">
            <SectionHeading
              id="premium-licens"
              title={licenseKey ? 'Din licens' : 'Har du redan en licens?'}
              subtitle={
                licenseKey
                  ? keyEntry
                    ? 'Flytta Lagom till en ny enhet genom att klistra in nyckeln där.'
                    : 'Licensnyckeln som är sparad på den här enheten.'
                  : 'Klistra in licensnyckeln från ditt köp – t.ex. för att använda Lagom på en ny telefon.'
              }
            />
            <Card padding="md">
              {licenseKey ? <LicenseManage /> : <LicenseActivation />}
              {offersLicenseRecovery() && (
                <div className="mt-3 border-t border-line pt-2">
                  <LicenseRecovery />
                </div>
              )}
            </Card>
          </section>
        )}

        <section aria-labelledby="premium-villkor">
          <SectionHeading
            id="premium-villkor"
            title="Köpvillkor och integritet"
            subtitle={web ? 'Kort och begripligt – det här gäller när du köper Lagom.' : 'Kort och begripligt – det här gäller när du köper Lagom i appen.'}
          />
          <Card padding="md">
            <TermsContent />
          </Card>
        </section>

        {status.kind !== 'licensierad' && (
          <Card tone="gran" padding="md" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[0.9375rem] leading-relaxed text-ink">Ingen brådska – din data finns kvar oavsett vad du väljer.</p>
            {offered.length > 0 && (
              <Button variant="soft" size="sm" iconLeft={Sprout} onClick={() => document.getElementById('premium-planer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {web ? 'Till priserna' : 'Till köpet'}
              </Button>
            )}
          </Card>
        )}

        {web && <SellerFooter />}
      </div>

      {web && <CheckoutSheet plan={plan} open={sheetOpen} onClose={() => setSheetOpen(false)} onConfirm={confirm} busy={busy} error={error} />}
    </div>
  )
}
