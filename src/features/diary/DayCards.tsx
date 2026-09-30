/**
 * Små kort för dagboken: tom dag (med "Kopiera gårdagen") och "Markera dagen som klar".
 */
import { memo, useRef, useState } from 'react'
import { CircleCheck, CopyPlus, Plus, RotateCcw } from 'lucide-react'
import { Button, EmptyState, toast } from '../../components/ui'
import { Confetti } from '../../components/signature'
import { addDays, formatDayShort } from '../../lib/dates'
import { useDiaryStore } from '../../stores/diaryStore'
import type { ISODate, MealId } from '../../types'
import { addFoodHref, newEntryIds, type DayKind } from './diaryLogic'
import { firstAddFoodLink, firstEntryButton, focusAfterRender } from './focus'
import { requireAccess } from '../premium/requireAccess'

// ---------------------------------------------------------------------------
// Tom dag
// ---------------------------------------------------------------------------

const EMPTY_TEXT: Record<DayKind, { title: string; text: string }> = {
  today: { title: 'Inget loggat ännu', text: 'Börja med det du ätit senast – det behöver inte vara perfekt, ungefär räcker gott.' },
  past: { title: 'Den här dagen är tom', text: 'Vill du fylla i i efterhand? Ungefärliga mängder räcker fint.' },
  future: { title: 'Planera dagen', text: 'Lägg in måltider i förväg – då är det lätt att se hur dagen blir.' },
}

/** Kopierar föregående dag till `date` och visar en ångra-notis. Returnerar antal poster. */
export function copyPreviousDay(date: ISODate): number {
  if (!requireAccess('kopiera')) return 0
  const from = addDays(date, -1)
  const before = useDiaryStore.getState().entries[date]
  const n = useDiaryStore.getState().copyDay(from, date)
  if (n === 0) return 0
  const ids = newEntryIds(before, useDiaryStore.getState().entries[date])
  toast(n === 1 ? '1 post kopierad' : `${n} poster kopierade`, {
    tone: 'success',
    action: {
      label: 'Ångra',
      onClick: () => {
        useDiaryStore.getState().removeEntries(ids.map((id) => ({ date, id })))
      },
    },
  })
  return n
}

export interface EmptyDayCardProps {
  date: ISODate
  today: ISODate
  kind: DayKind
  defaultMeal: MealId
}

export const EmptyDayCard = memo(function EmptyDayCard({ date, today, kind, defaultMeal }: EmptyDayCardProps) {
  const prev = addDays(date, -1)
  const prevCount = useDiaryStore((s) => s.entries[prev]?.length ?? 0)
  const copy = EMPTY_TEXT[kind]
  const copyLabel = date === today ? 'Kopiera gårdagen' : `Kopiera från ${formatDayShort(prev)}`
  return (
    <div className="card">
      <EmptyState
        illustration={kind === 'future' ? 'forest' : 'plate'}
        title={copy.title}
        text={copy.text}
        titleAs="h2"
        action={
          <>
            <Button iconLeft={Plus} to={addFoodHref(defaultMeal, date)}>
              Lägg till mat
            </Button>
            {prevCount > 0 && (
              <Button
                variant="soft"
                iconLeft={CopyPlus}
                onClick={() => {
                  // Kortet försvinner när dagen fylls – ge fokus till den första kopierade posten.
                  if (copyPreviousDay(date) > 0) focusAfterRender(firstEntryButton, firstAddFoodLink)
                }}
              >
                {copyLabel}
              </Button>
            )}
          </>
        }
      />
    </div>
  )
})

// ---------------------------------------------------------------------------
// Markera dagen som klar
// ---------------------------------------------------------------------------

export function toggleDayComplete(date: ISODate, complete: boolean): void {
  useDiaryStore.getState().setDayMeta(date, { complete })
  if (complete) {
    toast('Dagen markerad som klar – tack för att du tog en stund för dig själv', {
      tone: 'success',
      action: { label: 'Ångra', onClick: () => useDiaryStore.getState().setDayMeta(date, { complete: false }) },
    })
  } else {
    toast('Dagen är öppnad igen')
  }
}

export const CompleteDayCard = memo(function CompleteDayCard({ date, complete }: { date: ISODate; complete: boolean }) {
  const [burst, setBurst] = useState(0)
  // "Markera dagen som klar" och "Öppna igen" byter plats – fokus följer med till den nya knappen.
  const toggleRef = useRef<HTMLButtonElement>(null)
  const toggle = (next: boolean) => {
    toggleDayComplete(date, next)
    if (next) setBurst((n) => n + 1)
    focusAfterRender(() => toggleRef.current)
  }
  return (
    <div className="relative">
      {complete ? (
        <div className="flex items-center gap-3 rounded-card bg-mossa-soft px-4 py-3.5">
          <CircleCheck className="size-5 shrink-0 text-good" strokeWidth={2.4} aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-semibold text-ink">Dagen markerad som klar</p>
          <Button ref={toggleRef} variant="ghost" size="sm" iconLeft={RotateCcw} onClick={() => toggle(false)}>
            Öppna igen
          </Button>
        </div>
      ) : (
        <div className="rounded-card bg-surface-2 p-4 text-center">
          <p className="font-display text-lg font-semibold text-ink">Har du fått med allt?</p>
          <p className="mx-auto mt-1 max-w-[36ch] text-sm leading-relaxed text-ink-2">
            Klara dagar hjälper Lagom att räkna ut din förbrukning mer exakt. Det gör inget om något saknas.
          </p>
          <Button ref={toggleRef} className="mt-3" variant="soft" iconLeft={CircleCheck} onClick={() => toggle(true)}>
            Markera dagen som klar
          </Button>
        </div>
      )}
      <Confetti fire={burst} count={30} origin={{ x: 0.5, y: 0.7 }} />
    </div>
  )
})
