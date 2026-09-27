/**
 * Dagens summering överst i dagboken: ätit / budget / kvar, en lugn stapel, makron,
 * träning och vatten i miniformat samt märken för "Planerat" och "Dagen markerad som klar".
 *
 * Medvetet läge: inga siffror – ett varmt ord, dagens tallrik och makrostaplar utan tal.
 */
import { memo, useMemo, type ReactNode } from 'react'
import { CalendarClock, CircleCheck, Droplet, Dumbbell } from 'lucide-react'
import { Badge, ProgressBar, cx } from '../../components/ui'
import { EnergyValue, MacroBars, formatLiters } from '../../components/domain'
import { PlateModel } from '../../components/signature'
import { formatDuration, formatEnergy } from '../../lib/format'
import { mealPlate } from '../../lib/plate'
import type { DiaryEntry, ExerciseEntry, Nutrients, Targets } from '../../types'
import { balanceNote, dayBalance, mindfulDayLabel, type DayKind } from './diaryLogic'

export interface DaySummaryCardProps {
  kind: DayKind
  entries: readonly DiaryEntry[]
  totals: Nutrients
  exercise: readonly ExerciseEntry[]
  waterMl: number
  targets: Targets
  /** Dagens budget: mål + den andel av träningen som läggs tillbaka. */
  budget: number
  mindful: boolean
  energyUnit: 'kcal' | 'kJ'
  showFiber: boolean
  complete: boolean
  /** Scrolla till en sektion längre ned. */
  onJump: (section: 'traning' | 'vatten') => void
}

export const DaySummaryCard = memo(function DaySummaryCard({
  kind,
  entries,
  totals,
  exercise,
  waterMl,
  targets,
  budget,
  mindful,
  energyUnit,
  showFiber,
  complete,
  onJump,
}: DaySummaryCardProps) {
  const balance = dayBalance(totals.kcal, budget, energyUnit)
  const exerciseAdded = Math.max(0, Math.round(budget - targets.kcal))
  const minutes = exercise.reduce((s, x) => s + (x.minutes || 0), 0)
  const plate = useMemo(() => (mindful ? mealPlate(entries) : null), [mindful, entries])
  const future = kind === 'future'
  const over = balance.over > 0 && balance.status !== 'lagom'

  return (
    <section aria-label="Dagens summering" className="card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-auto">{future ? 'Planering' : 'Dagens summering'}</span>
        {future && (
          <Badge tone="blabar" icon={CalendarClock}>
            Planerat
          </Badge>
        )}
        {complete && (
          <Badge tone="mossa" icon={CircleCheck}>
            Dagen markerad som klar
          </Badge>
        )}
      </div>

      {mindful && plate ? (
        <MindfulSummary ratio={balance.ratio} empty={entries.length === 0} plate={plate} future={future} />
      ) : (
        <>
          <div className="grid grid-cols-3 divide-x divide-line/70 text-center">
            <SummaryStat label={future ? 'Planerat' : 'Ätit'} kcal={balance.eaten} unit={energyUnit} strong />
            <SummaryStat label="Budget" kcal={balance.budget} unit={energyUnit} />
            <SummaryStat
              label={over ? 'Över' : 'Kvar'}
              kcal={over ? balance.over : balance.remaining}
              unit={energyUnit}
              tone={over ? 'text-hjortron' : balance.status === 'lagom' ? 'text-good' : undefined}
            />
          </div>
          <ProgressBar
            className="mt-4"
            size="sm"
            tone="gran"
            overTone="hjortron"
            value={balance.eaten}
            max={balance.budget}
            aria-label="Energi mot dagens budget"
            valueText={`${formatEnergy(balance.eaten, energyUnit)} av ${formatEnergy(balance.budget, energyUnit)}`}
          />
          <p className="mt-2.5 text-sm leading-snug text-ink-2" aria-live="polite">
            {balanceNote(balance.status, kind)}
          </p>
        </>
      )}

      <MacroBars
        className="mt-5"
        totals={totals}
        targets={targets}
        showFiber={showFiber}
        variant="compact"
        hideNumbers={mindful}
      />

      {/* En planerad dag har varken vatten eller träning att visa – om inte ett pass redan ligger där. */}
      {(!future || exercise.length > 0) && (
        <div className={cx('mt-5 grid gap-2', future ? 'grid-cols-1' : 'grid-cols-2')}>
          <MiniStat
            icon={<Dumbbell className="size-3.5" aria-hidden />}
            tint="bg-mossa-soft text-mossa"
            label="Träning"
            value={minutes > 0 ? formatDuration(minutes) : 'Ingen ännu'}
            sub={!mindful && exerciseAdded > 0 ? `+${formatEnergy(exerciseAdded, energyUnit)} i budgeten` : undefined}
            onClick={() => onJump('traning')}
          />
          {!future && (
            <MiniStat
              icon={<Droplet className="size-3.5" aria-hidden />}
              tint="bg-fjall-soft text-fjall"
              label="Vatten"
              value={formatLiters(waterMl)}
              sub={`av ${formatLiters(targets.waterMl)}`}
              onClick={() => onJump('vatten')}
            />
          )}
        </div>
      )}
    </section>
  )
})

function SummaryStat({ label, kcal, unit, strong, tone }: { label: string; kcal: number; unit: 'kcal' | 'kJ'; strong?: boolean; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center px-1">
      <span className="eyebrow">{label}</span>
      <EnergyValue
        kcal={kcal}
        showUnit={false}
        display
        className={cx('mt-1 text-[1.625rem] font-semibold leading-none', tone ?? (strong ? 'text-ink' : 'text-ink-2'))}
      />
      <span className="mt-1 text-[11px] font-medium text-ink-3">{unit}</span>
    </div>
  )
}

function MiniStat({
  icon,
  tint,
  label,
  value,
  sub,
  onClick,
}: {
  icon: ReactNode
  tint: string
  label: string
  value: string
  sub?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 min-w-0 flex-col items-start rounded-2xl bg-surface-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-3"
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className={cx('grid size-6 shrink-0 place-items-center rounded-lg', tint)}>
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</span>
      </span>
      <span className="mt-1 block max-w-full truncate text-[0.9375rem] font-semibold text-ink tabular-nums">{value}</span>
      {sub && <span className="block max-w-full text-[11px] leading-snug text-ink-3 tabular-nums">{sub}</span>}
    </button>
  )
}

function MindfulSummary({
  ratio,
  empty,
  plate,
  future,
}: {
  ratio: number
  empty: boolean
  plate: ReturnType<typeof mealPlate>
  future: boolean
}) {
  const label = mindfulDayLabel(empty ? 0 : ratio)
  return (
    <div className="flex flex-col items-center text-center">
      <p className="font-display text-[1.75rem] font-semibold leading-tight text-ink">{future && empty ? 'Inget planerat ännu' : label.title}</p>
      <p className="mt-1 text-sm text-ink-2">{future && empty ? 'Lägg gärna in något i förväg' : label.hint}</p>
      <PlateModel className="mt-4" fractions={plate.fractions} empty={!plate.hasPlate} size={236} />
      <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-ink-2">{plate.advice}</p>
    </div>
  )
}
