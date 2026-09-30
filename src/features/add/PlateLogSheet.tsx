/**
 * "Logga med tallriken" – ett ark för mat som inte går att väga. Välj tallrik, hur stor del av den
 * som är grönsaker, kolhydrater och protein, vad delarna består av, hur mycket som ligger på och
 * ev. sås. Tallriken visar balansen och Lagom uppskattar energin som ett intervall (i medvetet läge
 * bara balansen). "Lägg i korgen" lägger delarna med anteckningen "Uppskattat med tallriken".
 *
 * Antagandena bakom gramvikterna finns i `plateLog.ts`.
 */
import { useId, useMemo, useState, type ReactNode } from 'react'
import { ShoppingBasket } from 'lucide-react'
import { Button, SegmentedControl, Sheet, Spinner, cx, toast } from '../../components/ui'
import { PlateModel, fractionWords } from '../../components/signature'
import { useFoodResolver } from '../../hooks/useFood'
import { useProfileStore } from '../../stores/profileStore'
import { formatEnergy, formatGrams, formatNumber } from '../../lib/format'
import { requireAccess } from '../premium/requireAccess'
import { useBasketStore } from './basketStore'
import { countLabel } from './addLogic'
import {
  DEFAULT_PLATE,
  PLATE_CHOICES,
  PLATE_FILL,
  PLATE_NOTE,
  PLATE_SHARES,
  PLATE_TYPES,
  SAUCE_CHOICES,
  SAUCE_DL,
  estimatePlate,
  plateFractions,
  type PlateFill,
  type PlateInput,
  type PlatePartKey,
  type PlateType,
} from './plateLog'

const PARTS: ReadonlyArray<{ key: PlatePartKey; label: string }> = [
  { key: 'veg', label: 'Grönsaker' },
  { key: 'carb', label: 'Kolhydrater' },
  { key: 'protein', label: 'Protein' },
]

const PLATE_TYPE_KEYS = Object.keys(PLATE_TYPES) as PlateType[]
const FILL_KEYS = Object.keys(PLATE_FILL) as PlateFill[]
/** Andelarna som värden i SegmentedControl (index – bråken är inga bra nycklar). */
const SHARE_INDEX = PLATE_SHARES.map((_, i) => i)

function shareIndex(v: number): number {
  let best = 0
  PLATE_SHARES.forEach((s, i) => {
    if (Math.abs(s.value - v) < Math.abs(PLATE_SHARES[best].value - v)) best = i
  })
  return best
}

const dlLabel = (dl: number) => `${dl === 0.5 ? '½' : dl === 1.5 ? '1½' : formatNumber(dl, 1)} dl`

export interface PlateLogSheetProps {
  open: boolean
  onClose: () => void
  /** Efter att delarna har lagts i korgen. */
  onAdded?: (count: number) => void
}

export function PlateLogSheet({ open, onClose, onAdded }: PlateLogSheetProps) {
  const [input, setInput] = useState<PlateInput>(DEFAULT_PLATE)
  const resolve = useFoodResolver()
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const energyUnit = useProfileStore((s) => s.settings.energyUnit)
  const estimate = useMemo(() => estimatePlate(input, resolve), [input, resolve])
  const fractions = useMemo(() => plateFractions(input.shares), [input.shares])
  const empty = fractions.veg + fractions.carb + fractions.protein < 0.01
  // Livsmedlen kommer från den inbyggda databasen, som kan behöva läsas in först.
  const loading = !resolve(PLATE_CHOICES.carb[0].foodId)

  const set = <K extends keyof PlateInput>(key: K, value: PlateInput[K]) => setInput((prev) => ({ ...prev, [key]: value }))

  const add = () => {
    if (!requireAccess('mat')) return
    const basketAdd = useBasketStore.getState().add
    let n = 0
    for (const item of estimate.items) {
      const added =
        item.dl !== undefined ? basketAdd(item.food, item.dl, 'dl', 'plate', PLATE_NOTE) : basketAdd(item.food, item.grams, 'g', 'plate', PLATE_NOTE)
      if (added) n++
    }
    if (n === 0) return
    toast(`Tallriken ligger i korgen – ${countLabel(n)}`, { tone: 'success' })
    onAdded?.(n)
    onClose()
  }

  const balance = PARTS.filter((p) => fractions[p.key] > 0)
    .map((p) => `${p.label.toLocaleLowerCase('sv-SE')} ${fractionWords(fractions[p.key])}`)
    .join(', ')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Logga med tallriken"
      description="För mat som inte går att väga – en uppskattning räcker gott."
      size="tall"
      footer={
        <Button size="lg" fullWidth iconLeft={ShoppingBasket} disabled={estimate.items.length === 0} onClick={add}>
          Lägg i korgen
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Field label="Tallrik">
          {(id) => (
            <SegmentedControl<PlateType>
              aria-labelledby={id}
              fullWidth
              size="sm"
              value={input.plate}
              onChange={(v) => set('plate', v)}
              options={PLATE_TYPE_KEYS.map((k) => ({ value: k, label: PLATE_TYPES[k].label, 'aria-label': PLATE_TYPES[k].long }))}
            />
          )}
        </Field>

        {/* Förhandsvisning */}
        <div className="flex flex-col items-center gap-2 rounded-3xl bg-surface-2 px-3 py-4">
          <PlateModel fractions={fractions} size={200} showLabels={false} empty={empty} />
          <p className="text-center text-sm text-ink" aria-live="polite">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-ink-3">
                <Spinner className="size-4" /> Läser in livsmedlen …
              </span>
            ) : empty ? (
              'Välj hur stor del av tallriken som är grönsaker, kolhydrater och protein.'
            ) : mindful ? (
              <>Balansen: {balance}.</>
            ) : (
              <>
                <span className="font-display text-xl font-semibold">
                  Ungefär {formatEnergy(estimate.kcalLow, energyUnit, false)}–{formatEnergy(estimate.kcalHigh, energyUnit)}
                </span>
                <span className="mt-0.5 block text-xs text-ink-3">En uppskattning – det gör inget om den inte är exakt.</span>
              </>
            )}
          </p>
        </div>

        {PARTS.map((part) => (
          <Field key={part.key} label={part.label}>
            {(id) => (
              <div className="flex flex-col gap-2">
                <SegmentedControl<number>
                  aria-labelledby={id}
                  fullWidth
                  size="sm"
                  value={shareIndex(input.shares[part.key])}
                  onChange={(i) => set('shares', { ...input.shares, [part.key]: PLATE_SHARES[i].value })}
                  options={SHARE_INDEX.map((i) => ({ value: i, label: PLATE_SHARES[i].label, 'aria-label': `${part.label}: ${PLATE_SHARES[i].long}` }))}
                />
                {input.shares[part.key] > 0 && (
                  <ChoiceGroup
                    label={`${part.label} – vad ligger på tallriken?`}
                    value={input.choices[part.key]}
                    options={PLATE_CHOICES[part.key].map((c) => ({ value: c.id, label: c.label }))}
                    onChange={(v) => set('choices', { ...input.choices, [part.key]: v })}
                  />
                )}
              </div>
            )}
          </Field>
        ))}

        <Field label="Hur mycket ligger på?">
          {(id) => (
            <SegmentedControl<PlateFill>
              aria-labelledby={id}
              fullWidth
              size="sm"
              value={input.fill}
              onChange={(v) => set('fill', v)}
              options={FILL_KEYS.map((k) => ({ value: k, label: PLATE_FILL[k].label }))}
            />
          )}
        </Field>

        <Field label="Sås">
          {() => (
            <div className="flex flex-col gap-2">
              <ChoiceGroup
                label="Sås"
                value={input.sauce?.id ?? 'ingen'}
                options={[{ value: 'ingen', label: 'Ingen' }, ...SAUCE_CHOICES.map((c) => ({ value: c.id, label: c.label }))]}
                onChange={(v) => set('sauce', v === 'ingen' ? undefined : { id: v, dl: input.sauce?.dl ?? 1 })}
              />
              {input.sauce && (
                <SegmentedControl<number>
                  aria-label="Mängd sås"
                  fullWidth
                  size="sm"
                  value={input.sauce.dl}
                  onChange={(dl) => set('sauce', input.sauce ? { ...input.sauce, dl } : undefined)}
                  options={SAUCE_DL.map((dl) => ({ value: dl, label: dlLabel(dl) }))}
                />
              )}
            </div>
          )}
        </Field>

        {estimate.items.length > 0 && (
          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-sm">
            <p className="font-semibold text-ink">Det här läggs i korgen</p>
            <ul className="mt-1.5 flex flex-col gap-1 text-ink-2">
              {estimate.items.map((item) => (
                <li key={item.part} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{item.food.name}</span>
                  <span className="shrink-0 tabular-nums">{item.dl !== undefined ? dlLabel(item.dl) : formatGrams(item.grams)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-ink-3">Med anteckningen ”{PLATE_NOTE}”. Du kan ändra mängderna i korgen.</p>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/** Rubrik + innehåll; rubrikens id går att koppla till en grupp. */
function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <div id={id} className="eyebrow mb-2">
        {label}
      </div>
      {children(id)}
    </div>
  )
}

/** Knappar där ett alternativ är valt (aria-pressed). Minst 44 px höga. */
function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-colors',
              selected ? 'bg-gran text-on-gran ring-gran' : 'bg-surface text-ink ring-line hover:bg-surface-2',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
