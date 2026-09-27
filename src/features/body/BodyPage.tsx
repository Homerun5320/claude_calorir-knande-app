/**
 * Vikt & mått (/vikt).
 *
 * Visar trendvikten i stället för dag-till-dag-svängningar, en lugn prognos mot målet,
 * viktkurva, nyckeltal (BMI, midjemått), adaptiv energiförbrukning, kroppsmått och historik.
 * Medvetet läge döljer siffrorna (kan visas på begäran) och tonen är aldrig dömande.
 */
import { useMemo, useState } from 'react'
import { HeartHandshake, Target } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { useToday } from '../../hooks/useToday'
import { useBodyStore } from '../../stores/bodyStore'
import { useHydrated } from '../../stores/hydration'
import { useProfileStore } from '../../stores/profileStore'
import { AdaptiveEnergyCard } from './AdaptiveEnergyCard'
import { BodyStats } from './BodyStats'
import { bodyOverview, latestMeasure } from './bodyLogic'
import { LogWeightCard } from './LogWeightCard'
import { MeasurementsCard } from './MeasurementsCard'
import { MeasurementSheet } from './MeasurementSheet'
import { Reveal } from './parts'
import { TrendInfoCard } from './TrendInfoCard'
import { WeightChartCard } from './WeightChartCard'
import { MindfulHero, WeightHero } from './WeightHero'
import { WeightHistory } from './WeightHistory'

export default function BodyPage() {
  const hydrated = useHydrated()
  if (!hydrated) return <BodySkeleton />
  return <BodyContent />
}

function BodyContent() {
  const today = useToday()
  const weights = useBodyStore((s) => s.weights)
  const measurements = useBodyStore((s) => s.measurements)
  const profile = useProfileStore((s) => s.profile)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)

  const [revealed, setRevealed] = useState(false)
  const hideNumbers = mindful && !revealed

  // Måttarket får en ny nyckel vid varje öppning så att formuläret börjar om.
  const [measureOpen, setMeasureOpen] = useState(false)
  const [measureKey, setMeasureKey] = useState(0)
  const openMeasure = () => {
    setMeasureKey((k) => k + 1)
    setMeasureOpen(true)
  }

  const overview = useMemo(() => bodyOverview(weights, profile, today), [weights, profile, today])
  const waist = useMemo(() => latestMeasure(measurements, 'waistCm'), [measurements])
  const hasWeights = overview.sorted.length > 0
  const targetKg = profile?.targetWeightKg

  return (
    <div className="px-4 pb-8">
      <PageHeader
        back
        title="Vikt & mått"
        actions={
          <Button to="/installningar/profil" variant="ghost" size="sm" iconLeft={Target} aria-label="Mål och profil">
            Mål
          </Button>
        }
        subtitle={hideNumbers ? 'Riktningen över tid – utan siffror.' : 'Trenden säger mer än enskilda dagar.'}
      />

      <div className="flex flex-col gap-4">
        {!hasWeights && (
          <Reveal>
            <Card padding="none">
              <EmptyState
                illustration="forest"
                titleAs="h2"
                title="Ingen vägning ännu"
                text="Logga din första vikt här nedanför. Efter några vägningar ritar Lagom din trendkurva – lugnt och utan dagliga svängningar."
              />
            </Card>
          </Reveal>
        )}

        {hasWeights && (
          <Reveal>
            {hideNumbers ? (
              <MindfulHero overview={overview} onReveal={() => setRevealed(true)} />
            ) : (
              <WeightHero overview={overview} goal={profile?.goal} targetKg={targetKg} today={today} />
            )}
          </Reveal>
        )}

        <Reveal delay={0.04}>
          <LogWeightCard today={today} first={!hasWeights} hideNumbers={hideNumbers} />
        </Reveal>

        {hasWeights && !hideNumbers && (
          <Reveal delay={0.08}>
            <WeightChartCard weights={overview.sorted} points={overview.points} targetKg={targetKg} today={today} />
          </Reveal>
        )}

        <Reveal delay={0.12}>
          <TrendInfoCard />
        </Reveal>

        {hasWeights && !hideNumbers && (
          <Reveal delay={0.16}>
            <BodyStats
              overview={overview}
              heightCm={profile?.heightCm}
              lifeStage={profile?.lifeStage}
              goal={profile?.goal}
              plannedRateKg={profile?.weeklyRateKg}
              waist={waist}
              onMeasureWaist={openMeasure}
            />
          </Reveal>
        )}

        <Reveal delay={0.2}>
          <AdaptiveEnergyCard today={today} hideNumbers={hideNumbers} />
        </Reveal>

        {!hideNumbers && (
          <Reveal delay={0.24}>
            <MeasurementsCard today={today} onAdd={openMeasure} />
          </Reveal>
        )}

        {hasWeights && !hideNumbers && (
          <Reveal delay={0.28} className="mt-2">
            <WeightHistory weights={overview.sorted} today={today} />
          </Reveal>
        )}

        <SupportNote />
      </div>

      <MeasurementSheet key={measureKey} open={measureOpen} onClose={() => setMeasureOpen(false)} today={today} />
    </div>
  )
}

/** Varm påminnelse om stöd vid oro kring mat, vikt och kropp. */
function SupportNote() {
  return (
    <aside className="mt-2 flex items-start gap-3 rounded-[var(--radius-card)] bg-surface-2 p-4 text-[0.8125rem] leading-relaxed text-ink-2">
      <HeartHandshake aria-hidden className="mt-0.5 size-5 shrink-0 text-lingon" strokeWidth={2} />
      <p>
        Din vikt är bara en del av hälsan – sömn, rörelse, glädje och gemenskap räknas lika mycket. Känns tankar kring mat,
        vikt eller kropp tunga? Du är inte ensam. Läs mer och få stöd hos{' '}
        <a href="https://www.1177.se/" target="_blank" rel="noreferrer" className="font-semibold text-gran underline underline-offset-2">
          1177
        </a>{' '}
        eller{' '}
        <a href="https://www.friskfri.se" target="_blank" rel="noreferrer" className="font-semibold text-gran underline underline-offset-2">
          Frisk &amp; Fri
        </a>
        .
      </p>
    </aside>
  )
}

function BodySkeleton() {
  return (
    <div className="px-4 pt-safe" aria-busy="true" aria-label="Laddar vikt och mått">
      <div className="pb-4 pt-[4.25rem]">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-3 h-4 w-64" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-56 w-full rounded-[1.5rem]" />
        <Skeleton className="h-72 w-full rounded-[1.5rem]" />
        <Skeleton className="h-64 w-full rounded-[1.5rem]" />
      </div>
    </div>
  )
}
