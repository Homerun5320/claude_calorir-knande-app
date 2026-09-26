/**
 * En måltid i dagboken: rubrik med energi och små makroprickar, "+" och "⋯", och posterna
 * som FoodRow. Tomma måltider blir en enda lugn rad med en "+".
 *
 * I medvetet läge visas inga energisiffror – bara vad och hur mycket (portioner).
 */
import { memo, useId } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { MoreHorizontal, Plus } from 'lucide-react'
import { IconButton, cx } from '../../components/ui'
import { CategoryIcon, EnergyValue, FoodRow, MealIcon, entryToRow } from '../../components/domain'
import { formatEnergy, formatNumber } from '../../lib/format'
import type { DiaryEntry, ISODate, MealConfig, MealId, Nutrients } from '../../types'
import { addFoodHref, entryAmountText, entryName, mealAriaSummary, mealMacroDots, shortFoodName } from './diaryLogic'

export interface MealSectionProps {
  meal: MealConfig
  entries: readonly DiaryEntry[]
  totals: Nutrients
  date: ISODate
  mindful: boolean
  energyUnit: 'kcal' | 'kJ'
  onOpenEntry: (entry: DiaryEntry) => void
  onOpenMenu: (meal: MealId) => void
}

const DOT_CLASS = { protein: 'bg-protein', carbs: 'bg-carbs', fat: 'bg-fat' } as const

export const MealSection = memo(function MealSection({
  meal,
  entries,
  totals,
  date,
  mindful,
  energyUnit,
  onOpenEntry,
  onOpenMenu,
}: MealSectionProps) {
  const headingId = useId()
  const reduce = useReducedMotion() ?? false
  const lower = meal.name.toLocaleLowerCase('sv-SE')
  const empty = entries.length === 0
  const dots = mealMacroDots(totals)
  const names = entries.map((e) => shortFoodName(entryName(e))).join(', ')

  return (
    <section aria-labelledby={headingId} className={cx('card', empty ? 'px-4 py-3' : 'p-4')}>
      <div className="flex items-center gap-2">
        <MealIcon meal={meal.id} size={empty ? 'sm' : 'md'} />
        <div className="ml-1 mr-1 min-w-0 flex-1">
          <h2 id={headingId} className="font-display text-[1.0625rem] font-semibold leading-tight text-ink">
            {meal.name}
          </h2>
          <p className="sr-only">{mealAriaSummary(meal.name, entries, energyUnit, mindful)}</p>
          {empty ? (
            <p className="mt-0.5 text-xs text-ink-3">Inget registrerat ännu</p>
          ) : mindful ? (
            <p className="mt-0.5 truncate text-xs text-ink-3" aria-hidden>
              {names}
            </p>
          ) : (
            <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-xs text-ink-3 tabular-nums" aria-hidden>
              <EnergyValue kcal={totals.kcal} className="font-semibold text-ink-2" />
              {dots.map((d) => (
                <span key={d.key} className="inline-flex items-center gap-[3px] text-[11px]" title={`${d.label} ${formatNumber(d.grams)} g`}>
                  <span className={cx('size-1.5 rounded-full', DOT_CLASS[d.key])} />
                  {formatNumber(d.grams, d.grams < 10 ? 1 : 0)}
                </span>
              ))}
            </div>
          )}
        </div>
        <Link
          to={addFoodHref(meal.id, date)}
          aria-label={`Lägg till i ${lower}`}
          title={`Lägg till i ${lower}`}
          className="relative grid size-9 shrink-0 place-items-center rounded-full bg-gran-soft text-gran transition-transform after:absolute after:-inset-1 after:rounded-full hover:bg-[color-mix(in_oklab,var(--lg-gran-soft)_82%,var(--lg-gran))] active:scale-95"
        >
          <Plus className="size-[1.125rem]" strokeWidth={2.4} aria-hidden />
        </Link>
        {!empty && (
          <IconButton icon={MoreHorizontal} size="sm" aria-label={`Fler val för ${lower}`} onClick={() => onOpenMenu(meal.id)} />
        )}
      </div>

      {!empty && (
        <ul className="mt-2 divide-y divide-line/60">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.li
                key={entry.id}
                layout={reduce ? false : 'position'}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                className="overflow-hidden"
              >
                {mindful ? (
                  <MindfulEntryRow entry={entry} onOpen={onOpenEntry} />
                ) : (
                  <EntryRow entry={entry} onOpen={onOpenEntry} energyUnit={energyUnit} />
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
})

/** Tid och anteckning läggs till efter mängden: "2 dl (76 g) · 07:45". */
function subtitleFor(entry: DiaryEntry, base: string | undefined): string {
  return [base, entry.time, entry.note ? 'anteckning' : undefined].filter(Boolean).join(' · ')
}

const EntryRow = memo(function EntryRow({
  entry,
  onOpen,
  energyUnit,
}: {
  entry: DiaryEntry
  onOpen: (e: DiaryEntry) => void
  energyUnit: 'kcal' | 'kJ'
}) {
  const row = entryToRow(entry)
  const amountText = subtitleFor(entry, row.amountText)
  const energy = row.kcal !== undefined ? formatEnergy(row.kcal, energyUnit) : 'energi okänd'
  return (
    <FoodRow {...row} amountText={amountText} onClick={() => onOpen(entry)} actionLabel={`Ändra ${row.name}, ${amountText}, ${energy}`} />
  )
})

/** Rad utan energisiffror för medvetet läge: vad och hur mycket. */
const MindfulEntryRow = memo(function MindfulEntryRow({ entry, onOpen }: { entry: DiaryEntry; onOpen: (e: DiaryEntry) => void }) {
  const name = entryName(entry)
  const amount = subtitleFor(entry, entry.kind === 'food' ? entryAmountText(entry) : undefined)
  const category = entry.kind === 'food' ? entry.food.category : (entry.category ?? 'ovrigt')
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      aria-label={`Ändra ${name}${amount ? `, ${amount}` : ''}`}
      className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-surface-2/70 active:bg-surface-2"
    >
      <CategoryIcon category={category} size="md" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[0.95rem] font-medium leading-snug text-ink" lang="sv">
          {name}
        </span>
        {amount && <span className="mt-0.5 block truncate text-xs text-ink-3">{amount}</span>}
      </span>
    </button>
  )
})
