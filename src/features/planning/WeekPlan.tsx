/**
 * Fliken "Planering": veckans sju dagar (måndag först) med planerade måltider, planerad energi och
 * protein mot dagsmålet i lugn ton, samt "Kopiera förra veckan" och "Töm veckan".
 */
import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Copy, Eraser, Plus } from 'lucide-react'
import type { DiaryEntry, ISODate, Targets } from '../../types'
import { Badge, Button, Card, EmptyState, ProgressBar, confirmDialog, toast } from '../../components/ui'
import { MealIcon, useEnergyFormatter } from '../../components/domain'
import { useProfileStore } from '../../stores/profileStore'
import { usePlanStore } from '../../stores/planStore'
import { addDays, capitalize, formatDayShort } from '../../lib/dates'
import { formatNumber, plural } from '../../lib/format'
import {
  groupByMeal,
  planBalanceText,
  planItemAmountText,
  planItemName,
  planItemNutrients,
  planTotals,
  weekItemCount,
  type PlanItem,
  type RecipeResolver,
} from '../../lib/planning'
import { requireAccess } from '../premium/requireAccess'
import { PlanItemIcon } from './components'
import { weekdayName } from './PlanAddSheet'
import { isPlanItemLogged } from './usePlanning'

export interface WeekPlanProps {
  weekStart: ISODate
  today: ISODate
  days: Array<{ date: ISODate; items: PlanItem[] }>
  /** Målen för ett datum (med veckobudgetens förskjutning för veckodagen). */
  targetsFor: (date: ISODate) => Targets
  resolve: RecipeResolver
  entries: Record<ISODate, DiaryEntry[]>
  onAdd: (date: ISODate) => void
  onEdit: (item: PlanItem) => void
  onLog: (item: PlanItem) => void
}

export function WeekPlan({ weekStart, today, days, targetsFor, resolve, entries, onAdd, onEdit, onLog }: WeekPlanProps) {
  const reduce = useReducedMotion()
  const count = days.reduce((n, d) => n + d.items.length, 0)

  const copyLastWeek = async () => {
    const prev = addDays(weekStart, -7)
    const prevCount = weekItemCount(usePlanStore.getState().items, prev)
    if (prevCount === 0) {
      toast('Förra veckan är tom – det finns inget att kopiera.')
      return
    }
    if (!requireAccess('planera')) return
    if (
      count > 0 &&
      !(await confirmDialog({
        title: 'Lägga till förra veckans plan?',
        message: `Veckan har redan ${plural(count, 'planerad rad', 'planerade rader')}. Förra veckans ${plural(prevCount, 'rad', 'rader')} läggs till utöver dem.`,
        confirmLabel: 'Lägg till',
        icon: Copy,
      }))
    ) {
      return
    }
    const added = usePlanStore.getState().copyWeek(prev, weekStart)
    if (added.length === 0) return
    toast('Förra veckans plan är kopierad', {
      tone: 'success',
      action: {
        label: 'Ångra',
        onClick: () => {
          const { removeItem } = usePlanStore.getState()
          for (const i of added) removeItem(i.date, i.id)
        },
      },
    })
  }

  const clearWeek = async () => {
    const ok = await confirmDialog({
      title: 'Tömma veckan?',
      message: 'Alla planerade måltider den här veckan tas bort. Det du redan har loggat i dagboken och dina egna rader i inköpslistan finns kvar.',
      tone: 'danger',
      confirmLabel: 'Töm veckan',
    })
    if (!ok) return
    const removed = usePlanStore.getState().clearWeek(weekStart)
    if (removed.length === 0) return
    toast('Veckan är tömd', { action: { label: 'Ångra', onClick: () => usePlanStore.getState().restoreItems(removed) } })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" iconLeft={Copy} onClick={() => void copyLastWeek()}>
          Kopiera förra veckan
        </Button>
        <Button size="sm" variant="ghost" iconLeft={Eraser} onClick={() => void clearWeek()} disabled={count === 0}>
          Töm veckan
        </Button>
      </div>

      {count === 0 && (
        <Card variant="flat">
          <EmptyState
            compact
            illustration="plate"
            title="Inget planerat den här veckan"
            text="Välj en dag nedan och planera ett recept, en sparad måltid eller ett livsmedel. Inköpslistan fylls i av sig själv."
          />
        </Card>
      )}

      <ol className="flex flex-col gap-3" aria-label="Veckans dagar">
        {days.map((day, i) => (
          <motion.li
            key={day.date}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : i * 0.03, type: 'spring', stiffness: 320, damping: 32 }}
          >
            <DayCard
              date={day.date}
              today={today}
              items={day.items}
              targets={targetsFor(day.date)}
              resolve={resolve}
              dayEntries={entries[day.date]}
              onAdd={onAdd}
              onEdit={onEdit}
              onLog={onLog}
            />
          </motion.li>
        ))}
      </ol>
    </div>
  )
}

interface DayCardProps {
  date: ISODate
  today: ISODate
  items: PlanItem[]
  targets: Targets
  resolve: RecipeResolver
  dayEntries: DiaryEntry[] | undefined
  onAdd: (date: ISODate) => void
  onEdit: (item: PlanItem) => void
  onLog: (item: PlanItem) => void
}

function DayCard({ date, today, items, targets, resolve, dayEntries, onAdd, onEdit, onLog }: DayCardProps) {
  const meals = useProfileStore((s) => s.settings.meals)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const fmt = useEnergyFormatter()
  const groups = useMemo(() => groupByMeal(items, meals), [items, meals])
  const totals = useMemo(() => planTotals(items, resolve), [items, resolve])
  const isToday = date === today
  const weekday = weekdayName(date)
  const headingId = `plan-dag-${date}`

  return (
    <Card as="section" aria-labelledby={headingId} padding="none" className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="flex flex-wrap items-baseline gap-x-2 font-display text-[1.1875rem] font-semibold tracking-tight text-ink">
            {capitalize(weekday)}{' '}
            <span className="font-sans text-[0.875rem] font-medium tracking-normal text-ink-3">{formatDayShort(date)}</span>
            {isToday && (
              <>
                {' '}
                <Badge tone="gran" size="sm" className="self-center">
                  Idag
                </Badge>
              </>
            )}
          </h2>
          {items.length > 0 && mindful && <p className="mt-0.5 text-[0.8125rem] text-ink-3">{plural(items.length, 'planerad rad', 'planerade rader')}</p>}
        </div>
        <Button size="sm" variant="soft" iconLeft={Plus} onClick={() => requireAccess('planera') && onAdd(date)} aria-label={`Planera ${weekday}`}>
          Planera
        </Button>
      </div>

      {items.length > 0 && !mindful && (
        <div className="mt-3">
          <ProgressBar
            size="sm"
            value={totals.kcal ?? 0}
            max={targets.kcal}
            label={<span className="text-[0.8125rem] font-medium text-ink-2">Planerat</span>}
            valueLabel={
              <span className="tabular-nums">
                {fmt(totals.kcal, false)} / {fmt(targets.kcal)}
              </span>
            }
            valueText={`${fmt(totals.kcal)} planerat av ${fmt(targets.kcal)}`}
          />
          <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-3">
            <span className="tabular-nums">
              Protein {formatNumber(totals.protein, 0)} av {formatNumber(targets.proteinG, 0)} g
            </span>
            {' · '}
            {planBalanceText(totals.kcal, targets.kcal, (k) => fmt(k))}
          </p>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="mt-2 text-[0.875rem] text-ink-3">Inget planerat</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {groups.map((g) => (
            <section key={g.meal} aria-labelledby={`${headingId}-${g.meal}`}>
              <h3 id={`${headingId}-${g.meal}`} className="eyebrow mb-0.5 mt-2 flex items-center gap-1.5 px-1">
                <MealIcon meal={g.meal} size="xs" />
                {g.name}
              </h3>
              <ul className="flex flex-col">
                {g.items.map((item) => (
                  <PlanRow
                    key={item.id}
                    item={item}
                    resolve={resolve}
                    mindful={mindful}
                    logged={isPlanItemLogged(item, dayEntries)}
                    canLog={!(date > today)}
                    onEdit={onEdit}
                    onLog={onLog}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  )
}

interface PlanRowProps {
  item: PlanItem
  resolve: RecipeResolver
  mindful: boolean
  logged: boolean
  canLog: boolean
  onEdit: (item: PlanItem) => void
  onLog: (item: PlanItem) => void
}

function PlanRow({ item, resolve, mindful, logged, canLog, onEdit, onLog }: PlanRowProps) {
  const fmt = useEnergyFormatter()
  const name = planItemName(item, resolve)
  const amount = planItemAmountText(item)
  const kcal = mindful ? undefined : planItemNutrients(item, resolve).kcal
  return (
    <li className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onEdit(item)}
        aria-label={`${name}, ${amount}${kcal !== undefined ? `, ${fmt(kcal)}` : ''}. Ändra`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 py-1.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-3"
      >
        <PlanItemIcon item={item} resolve={resolve} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-medium leading-snug text-ink">{name}</span>
          <span className="line-clamp-2 text-[0.8125rem] leading-snug text-ink-3">
            {kcal !== undefined && (
              <>
                <span className="font-medium tabular-nums text-ink-2">{fmt(kcal)}</span>
                {' · '}
              </>
            )}
            {amount}
          </span>
        </span>
      </button>
      {logged ? (
        <span className="inline-flex h-11 shrink-0 items-center gap-1 px-2 text-[0.8125rem] font-semibold text-good">
          <Check aria-hidden className="size-4" strokeWidth={2.6} />
          Loggad
        </span>
      ) : canLog ? (
        <Button size="sm" variant="secondary" onClick={() => onLog(item)} aria-label={`Logga ${name}`} className="shrink-0">
          Logga
        </Button>
      ) : null}
    </li>
  )
}
