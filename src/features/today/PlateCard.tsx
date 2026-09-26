/**
 * Dagens tallrik – Tallriksmodellen för dagens lunch och middag, med ett vänligt råd.
 */
import { memo, useMemo } from 'react'
import { Leaf } from 'lucide-react'
import { PlateModel } from '../../components/signature'
import { Badge, Card } from '../../components/ui'
import { mealPlate, PLATE_GOOD_SCORE, type PlateVariant } from '../../lib/plate'
import { useDiaryStore } from '../../stores/diaryStore'
import type { DiaryEntry, ISODate } from '../../types'
import { mainMealEntries } from './todayLogic'

const EMPTY_ENTRIES: DiaryEntry[] = []

export interface PlateCardProps {
  today: ISODate
  variant: PlateVariant
}

export const PlateCard = memo(function PlateCard({ today, variant }: PlateCardProps) {
  const entries = useDiaryStore((s) => s.entries[today] ?? EMPTY_ENTRIES)
  const main = useMemo(() => mainMealEntries(entries), [entries])
  const plate = useMemo(() => mealPlate(main, variant), [main, variant])
  const good = plate.hasPlate && plate.score >= PLATE_GOOD_SCORE
  const emptyHint = main.length === 0 ? 'Tallriken fylls när du registrerar lunch eller middag.' : plate.advice

  return (
    <Card
      title="Dagens tallrik"
      eyebrow={variant === 'aktiv' ? 'Tallriksmodellen · aktiv' : 'Tallriksmodellen'}
      action={good ? <Badge tone="mossa" icon={Leaf}>Lagom fördelad</Badge> : undefined}
    >
      <div className="flex flex-col items-center">
        <PlateModel fractions={plate.fractions} ideal={plate.ideal} empty={!plate.hasPlate} size={248} />
        {plate.hasPlate ? (
          <p className="mt-4 w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2">{plate.advice}</p>
        ) : (
          <p className="mt-3 w-full text-center text-[0.8125rem] leading-relaxed text-balance text-ink-3">{emptyHint}</p>
        )}
      </div>
    </Card>
  )
})
