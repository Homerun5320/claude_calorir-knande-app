/**
 * Redigera en dagbokspost i ett bottenark.
 *
 * - Livsmedel: mängd och enhet med PortionPicker.
 * - Snabbregistrering: namn, energi och makron (tomt fält = okänt, aldrig 0).
 * - Båda: måltid (chips), klockslag, anteckning, "Visa näringsvärden" (livsmedel), "Flytta till annan dag",
 *   "Kopiera till idag" och "Ta bort" (med Ångra).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, Clock, Copy, CopyPlus, Info, Trash2 } from 'lucide-react'
import { Button, Chip, NumberField, Sheet, TextField, cx, toast } from '../../components/ui'
import { MEAL_META } from '../../components/domain'
import { PortionPicker, type PortionSelection } from '../../components/domain/PortionPicker'
import { useDiaryStore } from '../../stores/diaryStore'
import { addDays } from '../../lib/dates'
import { KJ_PER_KCAL } from '../../lib/nutrients'
import type { DiaryEntry, ISODate, MealConfig, MealId } from '../../types'
import {
  dayTitle,
  entryName,
  entryNameInSentence,
  mealLabel,
  neighborEntryId,
  normalizeNote,
  normalizeTime,
  QUICK_EDIT_KEYS,
  quickNutrientsPatch,
  targetPhrase,
  visibleMeals,
  withoutIdentity,
  type QuickEditKey,
} from './diaryLogic'
import { addFoodLink, entryButton, firstAddFoodLink, focusAfterClose } from './focus'
import { TargetPicker, type Target } from './TargetPicker'

export interface EntryTarget {
  date: ISODate
  id: string
}

export interface EntrySheetProps {
  /** Posten som redigeras. Behålls efter stängning så att arket kan animeras ut. */
  target: EntryTarget | null
  /** Räknas upp vid varje öppning – formuläret börjar då om från postens sparade värden. */
  session: number
  open: boolean
  onClose: () => void
  today: ISODate
  meals: readonly MealConfig[]
  mindful: boolean
  energyUnit: 'kcal' | 'kJ'
}

export function EntrySheet({ target, session, open, onClose, today, meals, mindful, energyUnit }: EntrySheetProps) {
  // `find` returnerar ett befintligt objekt (eller undefined) – stabilt för selektorn.
  const live = useDiaryStore((s) => (target ? s.entries[target.date]?.find((e) => e.id === target.id) : undefined))
  // Senast visade post, så att innehållet finns kvar medan arket glider ut.
  const [shown, setShown] = useState<DiaryEntry | undefined>(live)
  if (live && live !== shown) setShown(live)
  const entry = live ?? shown
  if (!entry) return null
  return (
    <EntryEditor
      key={`${entry.id}:${session}`}
      entry={entry}
      open={open && live !== undefined}
      onClose={onClose}
      today={today}
      meals={meals}
      mindful={mindful}
      energyUnit={energyUnit}
    />
  )
}

interface EditorProps {
  entry: DiaryEntry
  open: boolean
  onClose: () => void
  today: ISODate
  meals: readonly MealConfig[]
  mindful: boolean
  energyUnit: 'kcal' | 'kJ'
}

type QuickValues = Record<QuickEditKey, number | undefined>

const QUICK_LABELS: Record<QuickEditKey, string> = {
  kcal: 'Energi',
  protein: 'Protein',
  carbs: 'Kolhydrater',
  fat: 'Fett',
}

function EntryEditor({ entry, open, onClose, today, meals, mindful, energyUnit }: EditorProps) {
  const updateEntry = useDiaryStore((s) => s.updateEntry)
  const navigate = useNavigate()
  const [mode, setMode] = useState<'edit' | 'move'>('edit')
  const [meal, setMeal] = useState<MealId>(entry.meal)
  const [time, setTime] = useState(entry.time ?? '')
  const [note, setNote] = useState(entry.note ?? '')
  const [selection, setSelection] = useState<PortionSelection | null>(
    entry.kind === 'food' ? { amount: entry.amount, unit: entry.unit, grams: entry.grams } : null,
  )
  const [name, setName] = useState(entry.kind === 'quick' ? entry.name : '')
  const [quick, setQuick] = useState<QuickValues>(() => {
    const n = entry.kind === 'quick' ? entry.nutrients : {}
    return { kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat }
  })
  const [moveTarget, setMoveTarget] = useState<Target>({
    date: entry.date === today ? addDays(today, 1) : today,
    meal: entry.meal,
  })

  const mealOptions = visibleMeals(meals as MealConfig[], { [entry.meal]: [entry] })
  const factor = energyUnit === 'kJ' ? KJ_PER_KCAL : 1
  const isToday = entry.date === today

  const selectionValid = (s: PortionSelection | null) => s !== null && Number.isFinite(s.grams) && s.grams > 0
  const canSave = entry.kind === 'food' ? selectionValid(selection) : name.trim().length > 0

  /**
   * När posten försvinner från sin plats (borttagen, flyttad till en annan dag) – ge fokus till
   * grannposten i samma måltid, annars till måltidens "Lägg till i …", så att fokus inte tappas.
   */
  const focusNearby = () => {
    const siblings = (useDiaryStore.getState().entries[entry.date] ?? []).filter((e) => e.meal === entry.meal)
    const neighbor = neighborEntryId(siblings, entry.id)
    const fromMeal = entry.meal
    return () => focusAfterClose(() => entryButton(neighbor, fromMeal), () => addFoodLink(fromMeal), firstAddFoodLink)
  }

  const save = (override?: PortionSelection) => {
    const common = { meal, time: normalizeTime(time), note: normalizeNote(note) }
    if (entry.kind === 'food') {
      const s = override ?? selection
      if (!s || !selectionValid(s)) return
      updateEntry(entry.date, entry.id, { ...common, amount: s.amount, unit: s.unit, grams: s.grams })
    } else {
      const trimmed = name.trim()
      if (!trimmed) return
      updateEntry(entry.date, entry.id, { ...common, name: trimmed, nutrients: quickNutrientsPatch(entry.nutrients, quick) })
    }
    onClose()
    // Ny måltid: raden flyttar – följ med den dit.
    if (meal !== entry.meal) focusAfterClose(() => entryButton(entry.id, meal), () => addFoodLink(meal))
    toast('Ändringen är sparad', { tone: 'success' })
  }

  const remove = () => {
    const refocus = focusNearby()
    const store = useDiaryStore.getState()
    const removed = store.removeEntry(entry.date, entry.id)
    onClose()
    if (removed) {
      refocus()
      toast(`${entryName(removed)} är borttagen`, {
        action: { label: 'Ångra', onClick: () => useDiaryStore.getState().restoreEntry(removed) },
      })
    }
  }

  /** Livsmedlets detaljsida (/livsmedel/:id) – där kan man också lägga till det igen. */
  const showFood = () => {
    if (entry.kind !== 'food') return
    onClose()
    const q = new URLSearchParams({ maltid: entry.meal, datum: entry.date })
    navigate(`/livsmedel/${encodeURIComponent(entry.food.id)}?${q}`)
  }

  const copyToToday = () => {
    const created = useDiaryStore.getState().addEntry({ ...withoutIdentity(entry), date: today, time: undefined })
    onClose()
    toast(isToday ? 'Tillagd en gång till' : 'Kopierad till idag', {
      action: { label: 'Ångra', onClick: () => useDiaryStore.getState().removeEntry(today, created.id) },
    })
  }

  const move = () => {
    const from = { date: entry.date, meal: entry.meal }
    const to = moveTarget
    if (to.date === from.date && to.meal === from.meal) {
      setMode('edit')
      return
    }
    const refocus = focusNearby()
    useDiaryStore.getState().moveEntry(from.date, entry.id, to.date, to.meal)
    onClose()
    // Samma dag: raden finns kvar i den nya måltiden. Annan dag: fokus till grannen här.
    if (to.date === from.date) focusAfterClose(() => entryButton(entry.id, to.meal), () => addFoodLink(to.meal))
    else refocus()
    toast(`Flyttad till ${targetPhrase(meals, to.meal, to.date, today)}`, {
      action: { label: 'Ångra', onClick: () => useDiaryStore.getState().moveEntry(to.date, entry.id, from.date, from.meal) },
    })
  }

  // "Flytta havregrynsgröt" – men märkesvaror och egna namn behåller sin stavning ("Flytta Oatly iKaffe").
  const title = mode === 'move' ? `Flytta ${entryNameInSentence(entry)}` : entryName(entry)
  const description = `${dayTitle(entry.date, today)} · ${mealLabel(meals, entry.meal)}`

  const footer =
    mode === 'move' ? (
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" fullWidth onClick={() => setMode('edit')}>
          Tillbaka
        </Button>
        <Button fullWidth iconLeft={ArrowRightLeft} onClick={move}>
          Flytta
        </Button>
      </div>
    ) : (
      <Button size="lg" fullWidth disabled={!canSave} onClick={() => save()}>
        Spara
      </Button>
    )

  return (
    <Sheet open={open} onClose={onClose} title={title} description={description} footer={footer} width="md">
      {mode === 'move' ? (
        <div className="pb-2">
          <p className="mb-4 text-sm leading-relaxed text-ink-2">Välj vilken dag och måltid posten ska flyttas till.</p>
          <TargetPicker value={moveTarget} onChange={setMoveTarget} today={today} meals={mealOptions} />
        </div>
      ) : (
        <div className="flex flex-col gap-6 pb-2">
          {entry.kind === 'food' ? (
            <PortionPicker
              food={entry.food}
              initialAmount={entry.amount}
              initialUnit={entry.unit}
              onChange={setSelection}
              onConfirm={(amount, unit, grams) => save({ amount, unit, grams })}
              confirmLabel="Spara"
              hideActions
            />
          ) : (
            <div className="flex flex-col gap-4">
              <TextField label="Namn" value={name} onValueChange={setName} autoComplete="off" error={name.trim() ? undefined : 'Ge posten ett namn'} />
              {mindful ? (
                <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2">
                  Energi och makron är dolda i medvetet läge. Du kan ändra dem när medvetet läge är avstängt.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {QUICK_EDIT_KEYS.map((key) => {
                    const isEnergy = key === 'kcal'
                    const raw = quick[key]
                    const shownValue = isEnergy && raw !== undefined ? Math.round(raw * factor) : raw
                    return (
                      <NumberField
                        key={key}
                        label={isEnergy ? `${QUICK_LABELS[key]} (${energyUnit})` : QUICK_LABELS[key]}
                        value={shownValue}
                        onChange={(v) => setQuick((q) => ({ ...q, [key]: v === undefined ? undefined : isEnergy ? v / factor : v }))}
                        min={0}
                        max={isEnergy ? 20000 : 1000}
                        step={isEnergy ? 10 : 1}
                        decimals={isEnergy ? 0 : 1}
                        suffix={isEnergy ? energyUnit : 'g'}
                        placeholder="–"
                      />
                    )
                  })}
                  <p className="col-span-2 -mt-1 text-xs leading-relaxed text-ink-3">Lämna ett fält tomt om värdet är okänt – det räknas då inte som noll.</p>
                </div>
              )}
            </div>
          )}

          <div role="group" aria-label="Måltid">
            <div className="eyebrow mb-2">Måltid</div>
            <div className="flex flex-wrap gap-2">
              {mealOptions.map((m) => (
                <Chip key={m.id} selected={meal === m.id} onClick={() => setMeal(m.id)} icon={MEAL_META[m.id].icon}>
                  {m.name}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
            <TextField type="time" label="Klockslag" optional prefix={Clock} value={time} onValueChange={setTime} />
            <TextField
              multiline
              minRows={2}
              label="Anteckning"
              optional
              value={note}
              onValueChange={setNote}
              placeholder="T.ex. hur det smakade eller var du åt"
              maxLength={500}
            />
          </div>

          <ul className="-mx-2 flex flex-col border-t border-line/70 pt-3">
            {entry.kind === 'food' && <EntryAction icon={Info} label="Visa näringsvärden" onClick={showFood} />}
            <EntryAction icon={ArrowRightLeft} label="Flytta till annan dag" onClick={() => setMode('move')} />
            <EntryAction icon={isToday ? CopyPlus : Copy} label={isToday ? 'Lägg till igen' : 'Kopiera till idag'} onClick={copyToToday} />
            <EntryAction icon={Trash2} label="Ta bort" tone="danger" onClick={remove} />
          </ul>
        </div>
      )}
    </Sheet>
  )
}

function EntryAction({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: typeof Trash2
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cx(
          'flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 text-left text-[0.9375rem] font-semibold transition-colors hover:bg-surface-2',
          tone === 'danger' ? 'text-lingon' : 'text-ink',
        )}
      >
        <span
          aria-hidden
          className={cx('grid size-9 place-items-center rounded-xl', tone === 'danger' ? 'bg-lingon-soft text-lingon' : 'bg-surface-2 text-ink-2')}
        >
          <Icon className="size-[1.125rem]" strokeWidth={2.1} />
        </span>
        {label}
      </button>
    </li>
  )
}
