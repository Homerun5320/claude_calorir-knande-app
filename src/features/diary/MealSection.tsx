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
import { addFoodHref, entryAmountText, entryName, entrySubtitle, mealAriaSummary, mealMacroDots, shortFoodName } from './diaryLogic'
import { addFoodLinkId } from './focus'

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
    // @container + @max-[14rem]: vid stor text (200 %) är kortet för smalt för ikon, namn och två knappar på en rad – ikonen döljs och
    // namnet får en egen rad ovanför knapparna. rem i en containerfråga följer rotens teckenstorlek; vid normal text (kortet ≈ 20 rem
    // brett, ≈ 16 rem på en 320 px-telefon) ändras inget.
    <section aria-labelledby={headingId} className={cx('card @container', empty ? 'px-4 py-3' : 'p-4')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="contents @max-[14rem]:hidden">
          <MealIcon meal={meal.id} size={empty ? 'sm' : 'md'} />
        </span>
        <div className="ml-1 mr-1 min-w-0 flex-1 @max-[14rem]:ml-0 @max-[14rem]:basis-full">
          {/* h3: måltiderna ligger under sidans (dolda) rubrik "Måltider" (h2). */}
          <h3 id={headingId} className="font-display text-[1.0625rem] font-semibold leading-tight text-ink">
            {meal.name}
          </h3>
          <p className="sr-only">{mealAriaSummary(meal.name, entries, energyUnit, mindful)}</p>
          {empty ? (
            <p className="mt-0.5 text-xs text-ink-3">Inget loggat ännu</p>
          ) : mindful ? (
            <p className="mt-0.5 truncate text-xs text-ink-3" aria-hidden>
              {names}
            </p>
          ) : (
            // Radbryts hellre än att klippa bort ett makro på smala skärmar.
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-3 tabular-nums" aria-hidden>
              <EnergyValue kcal={totals.kcal} className="font-semibold text-ink-2" />
              {/* Bokstaven (P/K/F) bär betydelsen – färgpricken är bara ett extra stöd (WCAG 1.4.1). */}
              {dots.map((d) => (
                <span
                  key={d.key}
                  className="inline-flex items-center gap-[2px] whitespace-nowrap text-[11px]"
                  title={`${d.label} ${formatNumber(d.grams)}\u00a0g`}
                >
                  <span className={cx('size-1.5 rounded-full', DOT_CLASS[d.key])} />
                  <span>
                    <span className="font-semibold text-ink-2">{d.short}</span>
                    {'\u2009'}
                    {formatNumber(d.grams, d.grams < 10 ? 1 : 0)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
        <Link
          id={addFoodLinkId(meal.id)}
          to={addFoodHref(meal.id, date)}
          aria-label={`Lägg till i ${lower}`}
          title={`Lägg till i ${lower}`}
          className="relative grid size-9 shrink-0 place-items-center rounded-full bg-gran-soft text-gran transition-transform after:absolute after:-inset-1 after:rounded-full hover:bg-[color-mix(in_oklab,var(--lg-gran-soft)_82%,var(--lg-gran))] active:scale-95 @max-[14rem]:ml-auto"
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
                data-entry-id={entry.id}
                data-meal={meal.id}
                layout={reduce ? false : 'position'}
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                // Klipp bara medan raden fälls ihop – annars skulle fokusringen och
                // hovringsytan (som sticker ut lite utanför raden) klippas bort.
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, overflow: 'hidden' }}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
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
  const amountText = entrySubtitle(entry, row.amountText)
  const energy = row.kcal !== undefined ? formatEnergy(row.kcal, energyUnit) : 'energi okänd'
  return (
    <FoodRow {...row} amountText={amountText} onClick={() => onOpen(entry)} actionLabel={`Ändra ${row.name}, ${amountText}, ${energy}`} />
  )
})

/** Rad utan energisiffror för medvetet läge: vad och hur mycket. */
const MindfulEntryRow = memo(function MindfulEntryRow({ entry, onOpen }: { entry: DiaryEntry; onOpen: (e: DiaryEntry) => void }) {
  const name = entryName(entry)
  const amount = entrySubtitle(entry, entry.kind === 'food' ? entryAmountText(entry) : undefined)
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
        {amount && <span className="mt-0.5 block line-clamp-2 break-words text-xs text-ink-3">{amount}</span>}
      </span>
    </button>
  )
})
