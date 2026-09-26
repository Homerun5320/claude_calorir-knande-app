/**
 * Adaptiv energiförbrukning: räknar ut vad kroppen faktiskt gör av med utifrån loggat intag
 * och hur trendvikten förändras – i stället för en statisk formel. Användaren kan låta
 * dagsmålen följa den uppmätta förbrukningen (settings.adaptiveTargets).
 */
import { useMemo, type ReactNode } from 'react'
import { Activity, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card, ProgressBar, Switch, toast } from '../../components/ui'
import { EnergyValue, useEnergyFormatter } from '../../components/domain'
import { adaptiveIntake, computeEnergy, estimateAdaptiveTdee, KCAL_PER_KG } from '../../lib/energy'
import { plural } from '../../lib/format'
import { useTargets } from '../../hooks/useTargets'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import {
  ADAPTIVE_REQUIREMENTS as REQ,
  adaptiveNeeds,
  adaptiveProgress,
  compareTdeeText,
  confidenceLabel,
  formatSignedKg,
  intakeByDay,
  joinSv,
} from './bodyLogic'

const CONFIDENCE_TONE = { hög: 'mossa', medel: 'fjall', låg: 'neutral' } as const

export function AdaptiveEnergyCard({ today, hideNumbers }: { today: ISODate; hideNumbers: boolean }) {
  const profile = useProfileStore((s) => s.profile)
  const adaptiveOn = useProfileStore((s) => s.settings.adaptiveTargets)
  const kcalOverride = useProfileStore((s) => s.settings.targetOverrides.kcal)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const entries = useDiaryStore((s) => s.entries)
  const days = useDiaryStore((s) => s.days)
  const weights = useBodyStore((s) => s.weights)
  const { targets } = useTargets(today)
  const fmtEnergy = useEnergyFormatter()

  // Samma urval som useTargets: räcker de klarmarkerade dagarna används bara de.
  const intake = useMemo(() => adaptiveIntake(intakeByDay(entries), (d) => days[d]?.complete === true, today), [entries, days, today])
  const estimate = useMemo(() => estimateAdaptiveTdee(intake, weights, today), [intake, weights, today])
  const progress = useMemo(() => adaptiveProgress(intake, weights, today), [intake, weights, today])
  const formulaTdee = useMemo(() => {
    if (!profile) return undefined
    const kg = weights.length ? weights[weights.length - 1].kg : profile.startWeightKg
    return computeEnergy(profile, kg, { today }).tdee
  }, [profile, weights, today])

  const toggle = (on: boolean) => {
    updateSettings({ adaptiveTargets: on })
    toast(on ? 'Dina mål följer nu din verkliga förbrukning' : 'Målen räknas från formeln igen', { tone: 'success' })
  }

  const needs = adaptiveNeeds(progress)
  const scale = estimate && formulaTdee ? Math.max(estimate.tdee, formulaTdee) * 1.08 : 1

  const minDay = <EnergyValue kcal={REQ.minDayKcal} unitClassName="" />
  let status: ReactNode
  if (kcalOverride !== undefined) {
    status = (
      <>
        Du har ett eget energimål i{' '}
        <Link to="/installningar" className="font-semibold text-gran underline underline-offset-2">
          inställningarna
        </Link>{' '}
        – det går före både formeln och den adaptiva beräkningen.
      </>
    )
  } else if (!adaptiveOn) {
    status = 'Av: dagsmålet räknas från formeln utifrån din profil. Du kan slå på det när du vill.'
  } else if (!estimate) {
    status = (
      <>
        På: tills det finns tillräckligt med data används formeln.
        {!hideNumbers && <> Dagar under {minDay} räknas som ofullständigt loggade.</>}
      </>
    )
  } else if (hideNumbers) {
    status = 'På: dina dagsmål följer nu din verkliga förbrukning.'
  } else {
    status = (
      <>
        På: ditt dagsmål är nu <EnergyValue kcal={targets.kcal} unitClassName="" className="font-semibold text-ink-2" /> och följer
        din verkliga förbrukning. Dagar under {minDay} räknas inte med.
      </>
    )
  }

  return (
    <Card eyebrow="Adaptiv energi" title="Din verkliga förbrukning" action={<Activity aria-hidden className="size-5 text-gran" strokeWidth={2.2} />}>
      {estimate ? (
        <div>
          {hideNumbers ? (
            <p className="font-display text-xl font-semibold leading-snug text-ink">
              {formulaTdee !== undefined ? compareTdeeText(estimate.tdee, formulaTdee) : 'Lagom har räknat ut din förbrukning.'}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-2">Din uppskattade förbrukning</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <EnergyValue kcal={estimate.tdee} display className="text-[2.5rem] font-medium leading-none text-ink" />
                <span className="text-sm font-medium text-ink-3">/dag</span>
              </p>
            </>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-3">
            <Badge tone={CONFIDENCE_TONE[estimate.confidence]} size="md" dot>
              {confidenceLabel(estimate.confidence)}
            </Badge>
            <span>
              {plural(estimate.loggedDays, 'loggad dag', 'loggade dagar')} · {plural(estimate.weighIns, 'vägning', 'vägningar')}
            </span>
          </p>

          {!hideNumbers && formulaTdee !== undefined && (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-surface-2 p-3.5">
              <ProgressBar
                label="Uppmätt från dina data"
                valueLabel={<EnergyValue kcal={estimate.tdee} />}
                value={estimate.tdee}
                max={scale}
                valueText={`${fmtEnergy(estimate.tdee)} per dag`}
                tone="gran"
                size="sm"
              />
              <ProgressBar
                label="Formel (Mifflin–St Jeor × aktivitet)"
                valueLabel={<EnergyValue kcal={formulaTdee} />}
                value={formulaTdee}
                max={scale}
                valueText={`${fmtEnergy(formulaTdee)} per dag`}
                tone="neutral"
                size="sm"
              />
              <p className="text-[0.8125rem] leading-relaxed text-ink-2">{compareTdeeText(estimate.tdee, formulaTdee)}</p>
            </div>
          )}

          {!hideNumbers && (
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
              Uträknat från ditt snittintag (<EnergyValue kcal={estimate.avgIntake} unitClassName="" />
              /dag) och trendviktens förändring ({formatSignedKg(estimate.weeklyChangeKg, 2)}/vecka) de senaste fyra
              veckorna. 1 kg kroppsvikt motsvarar ungefär <EnergyValue kcal={KCAL_PER_KG} unitClassName="" />.
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="font-display text-lg font-semibold leading-snug text-ink">
            Logga minst {REQ.minLoggedDays} dagar och väg dig {REQ.minWeighIns} gånger
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
            Formler är genomsnitt – din verkliga förbrukning kan skilja flera hundra kalorier. När det finns tillräckligt med data
            från de senaste fyra veckorna räknar Lagom ut vad just din kropp gör av med.
          </p>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-surface-2 p-3.5">
            <ProgressBar
              label="Loggade dagar"
              valueLabel={`${Math.min(progress.loggedDays, REQ.minLoggedDays)} av ${REQ.minLoggedDays}`}
              value={Math.min(progress.loggedDays, REQ.minLoggedDays)}
              max={REQ.minLoggedDays}
              valueText={`${Math.min(progress.loggedDays, REQ.minLoggedDays)} av ${REQ.minLoggedDays}`}
              tone="gran"
              size="sm"
            />
            <ProgressBar
              label="Vägningar"
              valueLabel={`${Math.min(progress.weighIns, REQ.minWeighIns)} av ${REQ.minWeighIns}`}
              value={Math.min(progress.weighIns, REQ.minWeighIns)}
              max={REQ.minWeighIns}
              valueText={`${Math.min(progress.weighIns, REQ.minWeighIns)} av ${REQ.minWeighIns}`}
              tone="fjall"
              size="sm"
            />
            <ProgressBar
              label="Dagar mellan första och senaste vägningen"
              valueLabel={`${Math.min(progress.spanDays, REQ.minSpanDays)} av ${REQ.minSpanDays}`}
              value={Math.min(progress.spanDays, REQ.minSpanDays)}
              max={REQ.minSpanDays}
              valueText={`${Math.min(progress.spanDays, REQ.minSpanDays)} av ${REQ.minSpanDays}`}
              tone="mossa"
              size="sm"
            />
          </div>
          {needs.length > 0 && (
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">Det som saknas: {joinSv(needs)}.</p>
          )}
          {!hideNumbers && formulaTdee !== undefined && (
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-3">
              Tills dess används formeln: <EnergyValue kcal={formulaTdee} unitClassName="" />
              /dag.
            </p>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-line pt-3">
        <Switch
          label="Låt målen följa min verkliga förbrukning"
          description="Dagsmålet räknas då från din uppmätta förbrukning i stället för en fast formel – och justeras av sig självt när kroppen förändras."
          checked={adaptiveOn}
          onChange={toggle}
        />
        <p className="mt-2 flex items-start gap-2 text-[0.8125rem] leading-relaxed text-ink-3">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
          <span>{status}</span>
        </p>
      </div>
    </Card>
  )
}
