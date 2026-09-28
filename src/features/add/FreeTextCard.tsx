/**
 * Kortet "Lägg till 3 saker" – visas ovanför sökträffarna när söktexten har flera led
 * ("två ägg och en smörgås med ost"). En rad per tolkat livsmedel med mängd; raden öppnar
 * portionsväljaren och "Byt" visar andra tänkbara livsmedel. Knappen lägger allt i korgen.
 */
import { useMemo, useState } from 'react'
import { Check, HelpCircle, Mic, Search, ShoppingBasket, Sparkles } from 'lucide-react'
import type { Food, UnitKey } from '../../types'
import { Button, Sheet, cx } from '../../components/ui'
import { CategoryIcon, EnergyValue } from '../../components/domain'
import { amountFor, type ParsedItem } from '../../lib/freeText'
import { formatAmount, gramsFor } from '../../lib/units'
import { nutrientsForGrams } from '../../lib/nutrients'
import { PortionSheet } from './PortionSheet'

/** En rad som den visas – med användarens byten och ändrade mängder. */
export interface FreeTextRow {
  item: ParsedItem
  food?: Food
  amount: number
  unit: UnitKey
  grams: number
  /** Användaren har bytt livsmedel eller ändrat mängden – då är tolkningen inte längre osäker. */
  edited: boolean
}

interface Override {
  food?: Food
  amount?: number
  unit?: UnitKey
}

/** Raderna efter användarens ändringar. */
export function freeTextRows(items: readonly ParsedItem[], overrides: Readonly<Record<number, Override>>): FreeTextRow[] {
  return items.map((item, i) => {
    const o = overrides[i]
    const food = o?.food ?? item.food
    if (!food) return { item, amount: item.amount, unit: item.unit, grams: 0, edited: false }
    let amount = item.amount
    let unit = item.unit
    if (o?.amount !== undefined && o.unit !== undefined) {
      amount = o.amount
      unit = o.unit
    } else if (o?.food) {
      // Bytt livsmedel: samma skrivna mängd, räknad för det nya livsmedlet.
      const choice = amountFor(o.food, item.quantity, item.side)
      amount = choice.amount
      unit = choice.unit
    }
    const grams = gramsFor(food, amount, unit)
    return { item, food, amount, unit, grams: Number.isFinite(grams) ? grams : 0, edited: o !== undefined }
  })
}

const sakerLabel = (n: number) => (n === 1 ? '1 sak' : `${n} saker`)

export interface FreeTextCardProps {
  items: readonly ParsedItem[]
  mindful: boolean
  /** Lägg de tolkade raderna i korgen. */
  onAdd: (rows: FreeTextRow[]) => void
  /** Sök på ett enskilt led i stället ("Sök själv"). */
  onSearch: (text: string) => void
}

export function FreeTextCard({ items, mindful, onAdd, onSearch }: FreeTextCardProps) {
  const [overrides, setOverrides] = useState<Record<number, Override>>({})
  const [swap, setSwap] = useState<number | null>(null)
  const [edit, setEdit] = useState<number | null>(null)
  const rows = useMemo(() => freeTextRows(items, overrides), [items, overrides])
  const ready = rows.filter((r) => r.food && r.grams > 0)
  const kcal = useMemo(() => ready.reduce((sum, r) => sum + (nutrientsForGrams(r.food!.nutrients, r.grams).kcal ?? 0), 0), [ready])

  const swapRow = swap !== null ? rows[swap] : undefined
  const swapChoices = useMemo(() => {
    if (!swapRow) return []
    const list: Food[] = []
    const seen = new Set<string>()
    for (const f of [swapRow.item.food, ...swapRow.item.alternatives, swapRow.food]) {
      if (f && !seen.has(f.id)) {
        seen.add(f.id)
        list.push(f)
      }
    }
    return list
  }, [swapRow])
  const editRow = edit !== null ? rows[edit] : undefined

  const setOverride = (i: number, o: Override) => setOverrides((prev) => ({ ...prev, [i]: o }))

  return (
    <section aria-labelledby="fritext-rubrik" className="card p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gran-soft text-gran" aria-hidden>
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="fritext-rubrik" className="font-display text-lg font-semibold leading-tight text-ink">
            Lägg till {sakerLabel(ready.length)}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Så här tolkade Lagom det du skrev
            {!mindful && ready.length > 0 && (
              <>
                {' · ca '}
                <EnergyValue kcal={kcal} unitClassName="" />
              </>
            )}
          </p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-line/70">
        {rows.map((row, i) => {
          const food = row.food
          if (!food) {
            const text = row.item.quantity.name || row.item.raw
            return (
              <li key={i} className="flex min-h-14 items-center gap-3 py-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-3" aria-hidden>
                  <HelpCircle className="size-4" />
                </span>
                <p className="min-w-0 flex-1 text-sm text-ink-2">
                  Hittade inget för <span className="font-semibold text-ink">”{text}”</span>
                </p>
                <Button variant="ghost" size="sm" iconLeft={Search} onClick={() => onSearch(text)} aria-label={`Sök efter ${text}`}>
                  Sök
                </Button>
              </li>
            )
          }
          const amountText = formatAmount(food, row.amount, row.unit, true)
          const unsure = row.item.confidence === 'lag' && !row.edited
          return (
            <li key={i} className="flex items-center gap-2 py-1.5">
              <button
                type="button"
                onClick={() => setEdit(i)}
                aria-label={`${food.name}, ${amountText}${unsure ? ', osäker tolkning' : ''}. Ändra mängd.`}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl text-left transition-colors hover:bg-surface-2"
              >
                <CategoryIcon category={food.category} name={food.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] font-semibold text-ink">{food.name}</span>
                  <span className="block truncate text-xs text-ink-3">
                    {amountText}
                    {row.item.side && ' · tillbehör'}
                    {unsure && <span className="font-semibold text-ink-2"> · kontrollera</span>}
                  </span>
                </span>
              </button>
              <Button variant="soft" size="sm" onClick={() => setSwap(i)} aria-label={`Byt ${food.name} (${row.item.raw})`}>
                Byt
              </Button>
            </li>
          )
        })}
      </ul>

      <Button fullWidth iconLeft={ShoppingBasket} className="mt-3" disabled={ready.length === 0} onClick={() => onAdd(ready)}>
        Lägg {ready.length === 1 ? 'den' : `alla ${ready.length}`} i korgen
      </Button>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-3">
        <Mic className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Tips: använd mikrofonen på tangentbordet och säg vad du åt.
      </p>

      {/* Byt livsmedel */}
      <Sheet open={swapRow !== undefined} onClose={() => setSwap(null)} title={swapRow ? `Byt ut ”${swapRow.item.raw}”` : 'Byt'} description="Välj det som stämmer bäst.">
        {swapRow && swap !== null && (
          <div className="flex flex-col gap-3 pb-2">
            <ul className="flex flex-col gap-1" role="list">
              {swapChoices.map((f) => {
                const selected = f.id === swapRow.food?.id
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        if (f.id === swapRow.item.food?.id) {
                          // Tillbaka till Lagoms tolkning.
                          setOverrides((prev) => {
                            const next = { ...prev }
                            delete next[swap]
                            return next
                          })
                        } else setOverride(swap, { food: f })
                        setSwap(null)
                      }}
                      className={cx(
                        'flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors',
                        selected ? 'bg-gran-soft' : 'hover:bg-surface-2',
                      )}
                    >
                      <CategoryIcon category={f.category} name={f.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{f.name}</span>
                        {f.brand && <span className="block truncate text-xs text-ink-3">{f.brand}</span>}
                      </span>
                      {selected && <Check className="size-4 shrink-0 text-gran" aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ul>
            <Button
              variant="outline"
              iconLeft={Search}
              onClick={() => {
                const text = swapRow.item.quantity.name || swapRow.item.raw
                setSwap(null)
                onSearch(text)
              }}
            >
              Sök själv efter ”{swapRow.item.quantity.name || swapRow.item.raw}”
            </Button>
          </div>
        )}
      </Sheet>

      {/* Ändra mängd */}
      <PortionSheet
        food={editRow?.food ?? null}
        onClose={() => setEdit(null)}
        initialAmount={editRow?.amount}
        initialUnit={editRow?.unit}
        autoFocusAmount={false}
        primary={{
          label: 'Spara ändring',
          icon: Check,
          onClick: (amount, unit) => {
            if (edit !== null && editRow?.food) setOverride(edit, { food: editRow.food, amount, unit })
            setEdit(null)
          },
        }}
      />
    </section>
  )
}
