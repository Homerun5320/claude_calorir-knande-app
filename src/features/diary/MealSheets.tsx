/**
 * Måltidens åtgärder i egna ark: "Kopiera till…" och "Spara som måltid".
 */
import { useMemo, useRef, useState } from 'react'
import { BookmarkPlus, Copy } from 'lucide-react'
import { Button, Dialog, Sheet, TextField, toast } from '../../components/ui'
import { uid } from '../../lib/id'
import { addDays } from '../../lib/dates'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import type { DiaryEntry, ISODate, MealConfig, MealId } from '../../types'
import { dayPhrase, mealLabel, newEntryIds, suggestTemplateName, targetPhrase, templateItems } from './diaryLogic'
import { TargetPicker, type Target } from './TargetPicker'
import { requireAccess } from '../premium/requireAccess'

export interface MealSource {
  date: ISODate
  meal: MealId
}

const EMPTY: DiaryEntry[] = []

/** Posterna i en måltid – väljer dagens lista (stabil referens) och filtrerar i useMemo. */
function useMealEntries(source: MealSource | null): DiaryEntry[] {
  const list = useDiaryStore((s) => (source ? (s.entries[source.date] ?? EMPTY) : EMPTY))
  return useMemo(() => (source ? list.filter((e) => e.meal === source.meal) : EMPTY), [list, source])
}

// ---------------------------------------------------------------------------
// Kopiera till …
// ---------------------------------------------------------------------------

export interface CopyMealSheetProps {
  source: MealSource | null
  open: boolean
  onClose: () => void
  today: ISODate
  /** Aktiverade måltider i inställningarnas ordning. */
  meals: readonly MealConfig[]
  allMeals: readonly MealConfig[]
}

export function CopyMealSheet({ source, open, onClose, today, meals, allMeals }: CopyMealSheetProps) {
  if (!source) return null
  return (
    <CopyMealInner
      key={`${source.date}:${source.meal}`}
      source={source}
      open={open}
      onClose={onClose}
      today={today}
      meals={meals}
      allMeals={allMeals}
    />
  )
}

function CopyMealInner({ source, open, onClose, today, meals, allMeals }: CopyMealSheetProps & { source: MealSource }) {
  const entries = useMealEntries(source)
  const [target, setTarget] = useState<Target>(() => ({
    date: source.date === today ? addDays(today, 1) : today,
    meal: meals.some((m) => m.id === source.meal) ? source.meal : (meals[0]?.id ?? source.meal),
  }))
  const name = mealLabel(allMeals, source.meal)
  const count = entries.length

  const copy = () => {
    if (!requireAccess('kopiera')) {
      onClose()
      return
    }
    const store = useDiaryStore.getState()
    const before = store.entries[target.date]
    const n = store.copyMeal(source.date, source.meal, target.date, target.meal)
    onClose()
    if (n === 0) return
    const ids = newEntryIds(before, useDiaryStore.getState().entries[target.date])
    toast(`Kopierat till ${targetPhrase(allMeals, target.meal, target.date, today)}`, {
      tone: 'success',
      action: {
        label: 'Ångra',
        onClick: () => {
          const s = useDiaryStore.getState()
          for (const id of ids) s.removeEntry(target.date, id)
        },
      },
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Kopiera ${name.toLocaleLowerCase('sv-SE')}`}
      description={`${count === 1 ? '1 post' : `${count} poster`} från ${dayPhrase(source.date, today)}`}
      footer={
        <Button size="lg" fullWidth iconLeft={Copy} disabled={count === 0} onClick={copy}>
          Kopiera till {targetPhrase(allMeals, target.meal, target.date, today)}
        </Button>
      }
    >
      <TargetPicker value={target} onChange={setTarget} today={today} meals={meals} />
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Spara som måltid
// ---------------------------------------------------------------------------

export interface SaveTemplateDialogProps {
  source: MealSource | null
  open: boolean
  onClose: () => void
  meals: readonly MealConfig[]
}

export function SaveTemplateDialog({ source, open, onClose, meals }: SaveTemplateDialogProps) {
  if (!source) return null
  return <SaveTemplateInner key={`${source.date}:${source.meal}`} source={source} open={open} onClose={onClose} meals={meals} />
}

function SaveTemplateInner({ source, open, onClose, meals }: SaveTemplateDialogProps & { source: MealSource }) {
  const entries = useMealEntries(source)
  const mealName = mealLabel(meals, source.meal)
  const [name, setName] = useState(() => suggestTemplateName(mealName, entries))
  const inputRef = useRef<HTMLInputElement>(null)
  const items = useMemo(() => templateItems(entries), [entries])
  const quickCount = entries.filter((e) => e.kind === 'quick').length
  const valid = name.trim().length > 0 && items.length > 0

  const save = () => {
    if (!valid) return
    useFoodStore.getState().saveTemplate({
      id: uid('tpl_'),
      name: name.trim(),
      meal: source.meal,
      items,
      createdAt: Date.now(),
    })
    onClose()
    toast(`”${name.trim()}” är sparad – du hittar den under Måltider när du lägger till mat`, { tone: 'success' })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Spara som måltid"
      description={`Lägg till samma ${items.length === 1 ? 'livsmedel' : `${items.length} livsmedel`} med ett tryck nästa gång.`}
      icon={BookmarkPlus}
      align="start"
      initialFocusRef={inputRef}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            Avbryt
          </Button>
          <Button fullWidth disabled={!valid} onClick={save}>
            Spara
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <TextField
          ref={inputRef}
          label="Namn på måltiden"
          value={name}
          onValueChange={setName}
          maxLength={60}
          autoComplete="off"
          hint={quickCount > 0 ? 'Snabbregistreringar sparas inte i måltiden – bara livsmedel.' : undefined}
        />
      </form>
    </Dialog>
  )
}
