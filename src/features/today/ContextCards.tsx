/**
 * Sammanhangskort – dyker bara upp när de är relevanta idag:
 * pågående fasta, dagens träning, koffein (om något registrerats) och alkohol i veckan.
 *
 * Tonen är neutral och omtänksam – inga varningsfärger, bara lugn information.
 */
import { memo, useMemo, type ReactNode } from 'react'
import { Coffee, Dumbbell, Hourglass, Wine, type LucideIcon } from 'lucide-react'
import { EnergyValue } from '../../components/domain'
import { Card, ProgressBar, ProgressRing, toneVars, type Tone } from '../../components/ui'
import { useDay } from '../../hooks/useDay'
import { dateRange, startOfWeek } from '../../lib/dates'
import { formatDuration, formatNumber, formatNutrient } from '../../lib/format'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import type { ExerciseEntry, ISODate } from '../../types'
import { useClock } from './hooks'
import { alcoholDrinks, CAFFEINE_TEXT, caffeineLevel, contextCards, fastProgress } from './todayLogic'

interface TileProps {
  to: string
  tone: Tone
  icon: LucideIcon
  eyebrow: string
  /** Visuellt innehåll till vänster i stället för ikonen (t.ex. en förloppsring). */
  visual?: ReactNode
  children: ReactNode
}

function Tile({ to, tone, icon: Icon, eyebrow, visual, children }: TileProps) {
  return (
    <Card to={to} padding="none" className="p-3.5">
      <span className="flex items-center gap-3.5">
        {visual ?? (
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-(--tone-soft) text-(--tone)" style={toneVars(tone)} aria-hidden="true">
            <Icon className="size-[1.375rem]" strokeWidth={2.2} />
          </span>
        )}
        <span className="block min-w-0 flex-1">
          <span className="eyebrow block">{eyebrow}</span>
          {children}
        </span>
      </span>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Fasta
// ---------------------------------------------------------------------------

function FastTile({ active }: { active: { start: number; targetHours: number; protocol: string } }) {
  // Egen klocka – bara den här rutan renderas om varje halvminut.
  const now = useClock(30_000)
  const p = fastProgress(active, now.getTime())
  return (
    <Tile
      to="/fasta"
      tone="blabar"
      icon={Hourglass}
      eyebrow={`Fasta · ${active.protocol}`}
      visual={
        <ProgressRing
          value={Math.min(p.elapsedMin, p.targetMin)}
          max={p.targetMin}
          size={48}
          thickness={5}
          tone={p.done ? 'mossa' : 'blabar'}
          aria-label="Fastans förlopp"
          valueText={`${formatDuration(p.elapsedMin)} av ${formatDuration(p.targetMin)}`}
        >
          <Hourglass className={`size-4 ${p.done ? 'text-mossa' : 'text-blabar'}`} strokeWidth={2.4} aria-hidden="true" />
        </ProgressRing>
      }
    >
      <span className="mt-0.5 block font-display text-lg leading-tight font-semibold text-ink tabular-nums">
        {formatDuration(p.elapsedMin)}
        <span className="font-sans text-sm font-normal text-ink-3"> av {formatDuration(p.targetMin)}</span>
      </span>
      <span className="mt-0.5 block text-[0.8125rem] text-ink-2">
        {p.done ? 'Målet är nått – avsluta när det känns rätt.' : `${formatDuration(p.remainingMin)} kvar`}
      </span>
    </Tile>
  )
}

// ---------------------------------------------------------------------------
// Träning
// ---------------------------------------------------------------------------

function ExerciseTile({ list, kcal, addBackPct, mindful }: { list: readonly ExerciseEntry[]; kcal: number; addBackPct: number; mindful: boolean }) {
  const minutes = list.reduce((s, x) => s + (Number.isFinite(x.minutes) ? x.minutes : 0), 0)
  const names = [...new Set(list.map((x) => x.name))]
  const added = (kcal * Math.max(0, Math.min(100, addBackPct))) / 100
  return (
    <Tile to="/traning" tone="mossa" icon={Dumbbell} eyebrow="Träning idag">
      <span className="mt-0.5 block truncate font-display text-lg leading-tight font-semibold text-ink">
        {names.slice(0, 2).join(' och ')}
        {names.length > 2 ? ` +${names.length - 2}` : ''}
      </span>
      <span className="mt-0.5 block text-[0.8125rem] text-ink-2">
        {formatDuration(minutes)}
        {!mindful && kcal > 0 && (
          <>
            {' · '}
            <EnergyValue kcal={kcal} unitClassName="" />
            {added > 0 && (
              <span className="text-ink-3">
                {' '}
                (<EnergyValue kcal={added} unitClassName="" /> till budgeten)
              </span>
            )}
          </>
        )}
      </span>
    </Tile>
  )
}

// ---------------------------------------------------------------------------
// Koffein och alkohol
// ---------------------------------------------------------------------------

function CaffeineTile({ mg, maxMg, mindful }: { mg: number; maxMg: number; mindful: boolean }) {
  const level = caffeineLevel(mg, maxMg)
  return (
    <Tile to="/dryck" tone="hjortron" icon={Coffee} eyebrow="Koffein idag">
      {!mindful && (
        <span className="mt-0.5 block font-display text-lg leading-tight font-semibold text-ink tabular-nums">
          {formatNutrient('caffeine', mg)}
          <span className="font-sans text-sm font-normal text-ink-3"> av {formatNumber(maxMg)} mg</span>
        </span>
      )}
      <ProgressBar value={mg} max={maxMg} tone="hjortron" size="xs" aria-label="Koffein mot dagens riktmärke" className="my-1.5" />
      <span className="block text-[0.8125rem] leading-snug text-ink-2">{CAFFEINE_TEXT[level]}</span>
    </Tile>
  )
}

function AlcoholTile({ drinks, mindful }: { drinks: number; mindful: boolean }) {
  return (
    <Tile to="/dryck" tone="vinbar" icon={Wine} eyebrow="Alkohol i veckan">
      <span className="mt-0.5 block font-display text-lg leading-tight font-semibold text-ink tabular-nums">
        {mindful ? 'Registrerat i veckan' : `${formatNumber(drinks, 1)} standardglas`}
      </span>
      <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-2">
        Ju mindre alkohol, desto bättre för sömn och återhämtning.
      </span>
    </Tile>
  )
}

// ---------------------------------------------------------------------------
// Samlingen
// ---------------------------------------------------------------------------

export interface ContextCardsProps {
  today: ISODate
  caffeineMaxMg: number
  addBackPct: number
  mindful: boolean
}

export const ContextCards = memo(function ContextCards({ today, caffeineMaxMg, addBackPct, mindful }: ContextCardsProps) {
  const active = useFastingStore((s) => s.active)
  const day = useDay(today)
  const entries = useDiaryStore((s) => s.entries)
  const drinks = useMemo(() => alcoholDrinks(entries, dateRange(startOfWeek(today), today)), [entries, today])
  const caffeineMg = day.totals.caffeine

  const cards = contextCards({ fasting: active !== null, exerciseCount: day.exercise.length, caffeineMg, alcoholDrinksWeek: drinks })
  if (cards.length === 0) return null

  return (
    <section aria-label="Just nu" className="space-y-2.5">
      {cards.map((id) => {
        switch (id) {
          case 'fasta':
            return active ? <FastTile key={id} active={active} /> : null
          case 'traning':
            return <ExerciseTile key={id} list={day.exercise} kcal={day.exerciseKcal} addBackPct={addBackPct} mindful={mindful} />
          case 'koffein':
            return <CaffeineTile key={id} mg={caffeineMg ?? 0} maxMg={caffeineMaxMg > 0 ? caffeineMaxMg : 400} mindful={mindful} />
          case 'alkohol':
            return <AlcoholTile key={id} drinks={drinks} mindful={mindful} />
        }
      })}
    </section>
  )
})
