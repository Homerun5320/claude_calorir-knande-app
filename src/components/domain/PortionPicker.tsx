/**
 * PortionPicker – välj mängd och enhet för ett livsmedel. Hjärtat i Lagoms loggning.
 *
 * - Stor siffra i Fraunces (NumberField lg) som tar emot "1,5", "½" och "1 1/2".
 * - Enhetschips från `availableUnits(food)` med gramvikt: "1 st (medel) · 60 g", "dl · 40 g", "g".
 *   Tillagade livsmedel med `rawWeight` får även "g rå"/"g okokt" (och "dl okokt") med en kort
 *   hjälptext om omräkningen till tillagad vikt.
 * - Snabbval ½ · 1 · 1½ · 2 (portioner/mått) eller 50–200 g.
 * - Direkt förhandsvisning av energi och makron för den valda mängden, med energifördelning.
 * - Varnar om mängden inte kan räknas om till gram (t.ex. volym utan densitet).
 * - Kommer ihåg senast använda mängd och enhet för livsmedlet (`useFoodStore().usage`).
 * - Respekterar medvetet läge (inga siffror, bara ord) och vald energienhet (kcal/kJ).
 *
 * ```tsx
 * <PortionPicker
 *   key={food.id}                     // ny komponent per livsmedel – återställer valet
 *   food={food}
 *   onConfirm={(amount, unit, grams) => addFood(food, amount, unit, { date, meal })}
 *   confirmLabel="Lägg till i frukost"
 * />
 *
 * // Redigera en befintlig post (t.ex. i dagboken eller receptredigeraren):
 * <PortionPicker food={entry.food} initialAmount={entry.amount} initialUnit={entry.unit}
 *   confirmLabel="Spara" onConfirm={(amount, unit, grams) => update({ amount, unit, grams })} />
 * ```
 *
 * Komponenten har eget tillstånd som initieras en gång – ge den `key={food.id}` om livsmedlet
 * kan bytas medan den är monterad. Hjälpfunktionerna längre ned är rena och exporteras för
 * återanvändning och tester.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { AlertTriangle, Scale } from 'lucide-react'
import type { Food, Nutrients, UnitKey } from '../../types'
import { useFoodStore, type FoodUsage } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import {
  UNIT_LABELS,
  availableUnits,
  defaultAmount,
  defaultUnit,
  gramsFor,
  isPortionUnit,
  isRawUnit,
  isVolumeUnit,
  rawKindLabel,
  rawWeightHint,
  unitLabel,
  type UnitFood,
} from '../../lib/units'
import { energyDistribution, nutrientsForGrams } from '../../lib/nutrients'
import { formatNumber } from '../../lib/format'
import { Button, cx, type IconLike } from '../ui/Button'
import { Chip } from '../ui/Chip'
import { NumberField } from '../ui/NumberField'
import { EnergyValue, useEnergyFormatter } from './EnergyValue'

// ---------------------------------------------------------------------------
// Rena hjälpfunktioner
// ---------------------------------------------------------------------------

type PortionFood = UnitFood

/** En vald mängd. `grams` är NaN om enheten inte kan räknas om. */
export interface PortionSelection {
  amount: number
  unit: UnitKey
  grams: number
}

/** Snabbvalens multiplar. */
export const QUICK_MULTIPLIERS = [0.5, 1, 1.5, 2] as const

/** true om enheten finns för livsmedlet och går att räkna om till gram. */
export function isUsableUnit(food: PortionFood, unit: UnitKey | undefined): unit is UnitKey {
  if (!unit) return false
  return availableUnits(food).includes(unit) && Number.isFinite(gramsFor(food, 1, unit))
}

/** Livsmedlets förvalda enhet – men gram om den förvalda inte går att räkna om. */
export function safeDefaultUnit(food: PortionFood): UnitKey {
  const unit = defaultUnit(food)
  return isUsableUnit(food, unit) ? unit : 'g'
}

const validAmount = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0

/**
 * Startvärde för väljaren:
 * 1. `initialUnit` (+ `initialAmount`, annars enhetens standardmängd) om enheten går att använda.
 * 2. `initialAmount` utan enhet tolkas i livsmedlets förvalda enhet.
 * 3. Senast använda mängd och enhet för livsmedlet.
 * 4. Livsmedlets förvalda portion (t.ex. "1 st"), 2 dl för drycker, annars 100 g.
 */
export function initialSelection(
  food: PortionFood,
  opts: { amount?: number; unit?: UnitKey; usage?: Pick<FoodUsage, 'lastAmount' | 'lastUnit'> } = {},
): PortionSelection {
  let unit: UnitKey
  let amount: number
  if (isUsableUnit(food, opts.unit)) {
    unit = opts.unit
    amount = validAmount(opts.amount) ? opts.amount : defaultAmount(unit)
  } else if (validAmount(opts.amount)) {
    unit = safeDefaultUnit(food)
    amount = opts.amount
  } else if (opts.usage && isUsableUnit(food, opts.usage.lastUnit) && validAmount(opts.usage.lastAmount)) {
    unit = opts.usage.lastUnit
    amount = opts.usage.lastAmount
  } else {
    unit = safeDefaultUnit(food)
    amount = defaultAmount(unit)
  }
  return { amount, unit, grams: gramsFor(food, amount, unit) }
}

const round = (v: number, decimals: number) => Number(v.toFixed(decimals))

/** Enheter där mängden anges exakt (inte i jämna portioner): gram, gram rå och ml. */
const isExactUnit = (unit: UnitKey) => unit === 'g' || unit === 'g-ra' || unit === 'ml'

/**
 * Ny mängd när enheten byts. Gram (även rå vikt) och ml behåller vikten ("1 st (60 g)" → 60 g,
 * 113 g tillagat → 151 g rå). Andra enheter
 * behåller vikten om den blir ett jämnt antal (hela, halva eller kvarts), annars enhetens
 * standardmängd – hellre "1 dl" än "1,37 dl".
 */
export function amountForUnitChange(food: PortionFood, amount: number, from: UnitKey, to: UnitKey): number {
  const grams = gramsFor(food, amount, from)
  const perUnit = gramsFor(food, 1, to)
  if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(perUnit) || perUnit <= 0) return defaultAmount(to)
  const exact = grams / perUnit
  if (isExactUnit(to)) return Math.max(1, round(exact, exact >= 20 ? 0 : 1))
  const quarter = Math.round(exact * 4) / 4
  if (quarter > 0 && Math.abs(exact - quarter) / exact <= 0.04) return quarter
  return defaultAmount(to)
}

/** Basen som snabbvalen multipliceras med: 100 g/ml (även rå vikt), 10 cl, annars 1 (portion, dl, msk …). */
export function multiplierBase(unit: UnitKey): number {
  if (isExactUnit(unit)) return 100
  if (unit === 'cl') return 10
  return 1
}

/** Steglängd för −/+ och piltangenter. */
export function unitStep(unit: UnitKey): number {
  if (unit === 'g' || unit === 'g-ra') return 10
  if (unit === 'ml') return 50
  if (unit === 'cl') return 5
  if (unit === 'l' || unit === 'kg') return 0.25
  return 0.5
}

/** Mängd i välbekant form: 0,5 → "½", 1,5 → "1½", 2 → "2", 0,4 → "0,4". */
export function formatFraction(value: number): string {
  if (!Number.isFinite(value)) return '–'
  const whole = Math.floor(value + 1e-9)
  const rest = value - whole
  const glyph = Math.abs(rest - 0.25) < 1e-6 ? '¼' : Math.abs(rest - 0.5) < 1e-6 ? '½' : Math.abs(rest - 0.75) < 1e-6 ? '¾' : ''
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph
  return formatNumber(value, 2)
}

/** Portionens substantiv: "1 st (medel)" → "st", "1 skiva" → "skiva", "Hela receptet" → "hela receptet". */
export function portionNoun(label: string): string {
  return label
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^\s*(1|en|ett)\s+/i, '')
    .trim()
    .toLocaleLowerCase('sv-SE')
}

/** Kort enhet efter den stora siffran: "g", "dl", "st", "skiva", "g rå" – eller "×" för långa portionsnamn. */
export function amountSuffix(food: Pick<Food, 'portions' | 'rawWeight'>, unit: UnitKey): string {
  if (isPortionUnit(unit)) {
    const noun = portionNoun(unitLabel(food, unit))
    return noun && noun.length <= 9 ? noun : '×'
  }
  if (isRawUnit(unit)) return unitLabel(food, unit)
  return UNIT_LABELS[unit as keyof typeof UNIT_LABELS]?.short ?? unit
}

/** Etikett och gramvikt för en enhetschip: { label: "1 st (medel)", detail: "60 g" }. */
export function unitChipLabel(food: PortionFood, unit: UnitKey): { label: string; detail?: string } {
  const grams = gramsFor(food, 1, unit)
  const g = Number.isFinite(grams) ? `${formatNumber(grams, grams < 10 ? 1 : 0)} g` : undefined
  if (isPortionUnit(unit)) {
    const label = unitLabel(food as Pick<Food, 'portions'>, unit)
    // Etiketten innehåller redan vikten ("1 st (ca 80 g)") – upprepa den inte.
    return { label, detail: /\d\s*(g|ml)\b/i.test(label) ? undefined : g }
  }
  if (unit === 'g') return { label: 'g' }
  // "g rå" behöver ingen vikt (hjälptexten förklarar omräkningen); "dl okokt · 230 g tillagat"
  // anger den tillagade vikten som 1 dl okokt vara ger.
  if (unit === 'g-ra') return { label: unitLabel(food, unit) }
  if (unit === 'dl-ra') return { label: unitLabel(food, unit), detail: g && `${g} tillagat` }
  const short = UNIT_LABELS[unit as keyof typeof UNIT_LABELS]?.short ?? unit
  if (isVolumeUnit(unit) && food.liquid) return { label: short }
  // Tillagat som standard: "dl tillagat · 70 g" bredvid "dl okokt · 230 g tillagat".
  const label = isVolumeUnit(unit) && food.rawWeight ? `${short} tillagat` : short
  return { label, detail: g }
}

/**
 * Snabbvalens mängder och etiketter för en enhet. Rå/okokt vikt visas kort ("50 g", "1 dl") –
 * enheten syns redan efter siffran; skärmläsare får hela enheten via `rawKindLabel`.
 */
export function quickChoices(unit: UnitKey): Array<{ amount: number; label: string }> {
  const base = multiplierBase(unit)
  return QUICK_MULTIPLIERS.map((m) => {
    const amount = m * base
    if (isPortionUnit(unit)) return { amount, label: formatFraction(amount) }
    const short = unit === 'g-ra' ? 'g' : unit === 'dl-ra' ? 'dl' : (UNIT_LABELS[unit as keyof typeof UNIT_LABELS]?.short ?? unit)
    return { amount, label: `${base === 1 ? formatFraction(amount) : formatNumber(amount)} ${short}` }
  })
}

/** Ord i stället för siffror i medvetet läge. Neutralt – aldrig värderande. */
export function mindfulPortionLabel(kcal: number | undefined): string {
  if (kcal === undefined || !Number.isFinite(kcal)) return 'Energivärde saknas'
  if (kcal < 60) return 'Ett litet tilltugg'
  if (kcal < 200) return 'En lätt portion'
  if (kcal < 450) return 'En lagom portion'
  if (kcal < 750) return 'En rejäl portion'
  return 'En stor måltid'
}

/**
 * Liten hjälprad under siffran: "≈ 60 g", "1 stor kafébulle (ca 110 g)" eller – i gram –
 * "≈ 1½ × 1 st (medel)" när vikten motsvarar ett jämnt antal portioner.
 */
export function amountHint(food: PortionFood, amount: number, unit: UnitKey): string {
  if (!(amount > 0)) return ''
  if (unit === 'g') {
    const p = food.portions[0]
    if (!p || !(p.grams > 0)) return ''
    const ratio = amount / p.grams
    const q = Math.round(ratio * 4) / 4
    return q > 0 && Math.abs(ratio - q) / ratio <= 0.05 ? `≈ ${formatFraction(q)} × ${p.label}` : ''
  }
  const grams = gramsFor(food, amount, unit)
  if (!Number.isFinite(grams)) return ''
  const g = `≈ ${formatNumber(grams, grams < 10 ? 1 : 0)} g`
  if (isRawUnit(unit)) return `${g} tillagat`
  if (isPortionUnit(unit) && amountSuffix(food as Pick<Food, 'portions'>, unit) === '×') {
    const label = unitLabel(food as Pick<Food, 'portions'>, unit)
    return amount === 1 && /\d\s*(g|ml)\b/i.test(label) ? label : `${label} · ${g}`
  }
  return g
}

/** Näringsvärden för ett val (tomt om vikten är okänd). */
export function selectionNutrients(food: Pick<Food, 'nutrients'>, grams: number): Nutrients {
  return Number.isFinite(grams) && grams >= 0 ? nutrientsForGrams(food.nutrients, grams) : {}
}

// ---------------------------------------------------------------------------
// Komponent
// ---------------------------------------------------------------------------

export interface PortionPickerProps {
  food: Food
  /** Startmängd. Utan värde används senast använda mängd eller livsmedlets förvalda portion. */
  initialAmount?: number
  /** Startenhet (t.ex. från en befintlig dagbokspost). */
  initialUnit?: UnitKey
  /** Anropas med mängd, enhet och uträknad vikt i gram när användaren bekräftar. */
  onConfirm: (amount: number, unit: UnitKey, grams: number) => void
  /** Text på bekräftelseknappen (standard "Lägg till"). */
  confirmLabel?: string
  /** Ikon på bekräftelseknappen. */
  confirmIcon?: IconLike
  /** Visa makron och energifördelning (standard true). Energin visas alltid. */
  showNutrients?: boolean
  /** Valfri andra knapp under bekräftelsen, t.ex. "Lägg i korgen". */
  secondaryLabel?: string
  secondaryIcon?: IconLike
  onSecondary?: (amount: number, unit: UnitKey, grams: number) => void
  /** Anropas vid varje ändring (även direkt vid start) – för förhandsvisningar utanför väljaren. */
  onChange?: (selection: PortionSelection) => void
  /** Dölj knapparna, t.ex. när föräldern har egen sidfot. Enter i fältet bekräftar ändå. */
  hideActions?: boolean
  /** Visar laddning på bekräftelseknappen. */
  busy?: boolean
  /** Fokusera siffran direkt (bra på desktop, undvik på mobil där tangentbordet fälls upp). */
  autoFocus?: boolean
  /**
   * Ref till mängdfältet – t.ex. som `initialFocusRef` i ett ark, där modalen annars flyttar
   * fokus till panelen efter `autoFocus`.
   */
  amountRef?: Ref<HTMLInputElement>
  /** Extra innehåll mellan förhandsvisningen och knapparna. */
  children?: ReactNode
  className?: string
}

const MACROS = [
  { key: 'protein', label: 'Protein', dot: 'bg-protein', bar: 'bg-lingon' },
  { key: 'carbs', label: 'Kolhydrater', dot: 'bg-carbs', bar: 'bg-hjortron' },
  { key: 'fat', label: 'Fett', dot: 'bg-fat', bar: 'bg-blabar' },
] as const

export function PortionPicker({
  food,
  initialAmount,
  initialUnit,
  onConfirm,
  confirmLabel = 'Lägg till',
  confirmIcon,
  showNutrients = true,
  secondaryLabel,
  secondaryIcon,
  onSecondary,
  onChange,
  hideActions = false,
  busy = false,
  autoFocus = false,
  amountRef,
  children,
  className,
}: PortionPickerProps) {
  const usage = useFoodStore((s) => s.usage[food.id])
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const formatEnergyIn = useEnergyFormatter()
  const unitsId = useId()
  const quickId = useId()

  // Startvärdet räknas ut en gång – senare ändringar i användningsstatistiken ska inte hoppa i fältet.
  const [initial] = useState(() => initialSelection(food, { amount: initialAmount, unit: initialUnit, usage }))
  const [amount, setAmount] = useState<number | undefined>(initial.amount)
  const [unit, setUnit] = useState<UnitKey>(initial.unit)

  const units = useMemo(() => {
    const list = availableUnits(food)
    // En sparad enhet som inte längre finns (t.ex. borttagen portion) visas ändå så att valet syns.
    return list.includes(unit) ? list : [unit, ...list]
  }, [food, unit])

  const grams = amount === undefined ? Number.NaN : gramsFor(food, amount, unit)
  const gramsKnown = Number.isFinite(grams)
  const valid = gramsKnown && grams > 0
  const n = useMemo(() => selectionNutrients(food, grams), [food, grams])
  const dist = useMemo(() => energyDistribution(n), [n])
  const kcalKnown = n.kcal !== undefined
  const liquid = food.liquid === true

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    onChangeRef.current?.({ amount: amount ?? 0, unit, grams })
  }, [amount, unit, grams])

  const changeUnit = (next: UnitKey) => {
    if (next === unit) return
    setAmount((cur) => (cur !== undefined && cur > 0 ? amountForUnitChange(food, cur, unit, next) : defaultAmount(next)))
    setUnit(next)
  }

  const confirm = (e?: FormEvent) => {
    e?.preventDefault()
    if (!valid || amount === undefined || busy) return
    onConfirm(amount, unit, grams)
  }

  const quick = quickChoices(unit)
  const suffix = amountSuffix(food, unit)
  const hint = amount !== undefined ? amountHint(food, amount, unit) : ''
  const rawHint = isRawUnit(unit) ? rawWeightHint(food, unit) : ''
  const liveSummary = !valid
    ? ''
    : mindful
      ? mindfulPortionLabel(n.kcal)
      : [hint, kcalKnown ? formatEnergyIn(n.kcal) : 'energi okänd'].filter(Boolean).join(', ')
  const macroKnown = MACROS.some((m) => n[m.key] !== undefined)
  const distTotal = dist.protein + dist.carbs + dist.fat + dist.alcohol

  return (
    <form onSubmit={confirm} className={cx('flex flex-col gap-5', className)} noValidate>
      {/* Mängd */}
      <div>
        <NumberField
          size="lg"
          label="Mängd"
          labelHidden
          value={amount}
          onChange={setAmount}
          min={0}
          max={isExactUnit(unit) ? 10000 : 1000}
          step={unitStep(unit)}
          decimals={2}
          suffix={suffix}
          autoFocus={autoFocus}
          ref={amountRef}
          placeholder="0"
        />
        <p className="mt-2 min-h-5 text-center text-sm text-ink-3 tabular-nums">{hint}</p>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {liveSummary}
        </span>
      </div>

      {/* Snabbval */}
      <div role="group" aria-labelledby={quickId} className="flex flex-col items-center gap-2">
        <span id={quickId} className="sr-only">
          Snabbval
        </span>
        <div className="flex flex-wrap justify-center gap-2">
          {quick.map((q) => (
            <Chip
              key={q.label}
              size="sm"
              selected={amount !== undefined && Math.abs(amount - q.amount) < 1e-9}
              onClick={() => setAmount(q.amount)}
              aria-label={isPortionUnit(unit) ? `${q.label} × ${unitLabel(food, unit)}` : isRawUnit(unit) ? `${q.label} ${rawKindLabel(food, unit)}` : q.label}
              className="min-w-12 justify-center"
            >
              {q.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Enheter */}
      <div role="group" aria-labelledby={unitsId}>
        <div id={unitsId} className="eyebrow mb-2">
          Enhet
        </div>
        <div className="flex flex-wrap gap-2">
          {units.map((u) => {
            const chip = unitChipLabel(food, u)
            return (
              <Chip key={u} selected={u === unit} onClick={() => changeUnit(u)} className="max-w-full">
                <span className="truncate">{chip.label}</span>
                {chip.detail && <span className={cx('font-medium', u === unit ? 'opacity-75' : 'text-ink-3')}>· {chip.detail}</span>}
              </Chip>
            )
          })}
        </div>
      </div>

      {rawHint && (
        <p className="-mt-2 flex items-start gap-2 text-sm text-ink-2">
          <Scale className="mt-0.5 size-4 shrink-0 text-gran" aria-hidden />
          <span>{rawHint}</span>
        </p>
      )}

      {amount !== undefined && !gramsKnown && (
        <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-hjortron-soft px-4 py-3 text-sm text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-hjortron" aria-hidden />
          <span>Den här enheten går inte att räkna om till gram för livsmedlet. Välj gram eller en portion i stället.</span>
        </div>
      )}

      {/* Förhandsvisning */}
      <div className="rounded-3xl bg-surface-2 p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow">{mindful ? 'Portionen' : 'Energi'}</div>
            {mindful ? (
              <div className="mt-1 font-display text-2xl font-semibold leading-tight text-ink">{mindfulPortionLabel(valid ? n.kcal : undefined)}</div>
            ) : (
              <div className="mt-0.5 text-4xl font-semibold text-ink">
                <EnergyValue kcal={valid && kcalKnown ? n.kcal : undefined} display />
              </div>
            )}
            {!kcalKnown && valid && <p className="mt-1 text-xs text-ink-3">Energivärde saknas för det här livsmedlet.</p>}
            {!mindful && kcalKnown && food.nutrients.kcal !== undefined && (
              <p className="mt-1 text-xs text-ink-3">
                <EnergyValue kcal={food.nutrients.kcal} unitClassName="" /> per {liquid ? '100\u00A0ml' : '100\u00A0g'}
              </p>
            )}
          </div>
          {showNutrients && !mindful && (
            <dl className="grid shrink-0 grid-cols-[auto_auto] items-baseline gap-x-2.5 gap-y-1 text-sm">
              {MACROS.map((m) => (
                <div key={m.key} className="contents">
                  <dt className="flex items-center gap-1.5 text-ink-2">
                    <span aria-hidden className={cx('size-2 rounded-full', m.dot)} />
                    {m.label}
                  </dt>
                  <dd className="text-right font-semibold text-ink tabular-nums">
                    {valid && n[m.key] !== undefined ? `${formatNumber(n[m.key], (n[m.key] ?? 0) < 10 ? 1 : 0)} g` : '–'}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {showNutrients && macroKnown && valid && distTotal > 0 && (
          <div className="mt-4">
            <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={distributionLabel(dist)}>
              {MACROS.map((m) =>
                dist[m.key] > 0 ? <span key={m.key} className={cx('h-full rounded-full', m.bar)} style={{ width: `${dist[m.key]}%` }} /> : null,
              )}
              {dist.alcohol > 0 && <span className="h-full rounded-full bg-vinbar" style={{ width: `${dist.alcohol}%` }} />}
            </div>
            {!mindful && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3" aria-hidden>
                {MACROS.map((m) => (
                  <span key={m.key} className="tabular-nums">
                    {m.label} {formatNumber(dist[m.key])}{'\u00A0'}E%
                  </span>
                ))}
                {dist.alcohol > 0 && <span className="tabular-nums">Alkohol {formatNumber(dist.alcohol)}{'\u00A0'}E%</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {children}

      {!hideActions && (
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" fullWidth disabled={!valid} loading={busy} iconLeft={confirmIcon}>
            {confirmLabel}
          </Button>
          {secondaryLabel && onSecondary && (
            <Button
              variant="soft"
              size="lg"
              fullWidth
              disabled={!valid || busy}
              iconLeft={secondaryIcon}
              onClick={() => {
                if (valid && amount !== undefined) onSecondary(amount, unit, grams)
              }}
            >
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </form>
  )
}

function distributionLabel(d: { protein: number; carbs: number; fat: number; alcohol: number }): string {
  const parts = [
    `protein ${formatNumber(d.protein)} %`,
    `kolhydrater ${formatNumber(d.carbs)} %`,
    `fett ${formatNumber(d.fat)} %`,
  ]
  if (d.alcohol > 0) parts.push(`alkohol ${formatNumber(d.alcohol)} %`)
  return `Energifördelning: ${parts.join(', ')}`
}
