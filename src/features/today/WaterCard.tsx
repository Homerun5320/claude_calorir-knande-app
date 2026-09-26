/**
 * Vatten idag – tryck på glasen för att fylla på eller tömma.
 */
import { memo, useCallback } from 'react'
import { WaterGlasses } from '../../components/domain'
import { Card } from '../../components/ui'
import { useDiaryStore } from '../../stores/diaryStore'
import type { ISODate } from '../../types'

export interface WaterCardProps {
  today: ISODate
  targetMl: number
  glassMl: number
}

export const WaterCard = memo(function WaterCard({ today, targetMl, glassMl }: WaterCardProps) {
  const ml = useDiaryStore((s) => s.water[today] ?? 0)
  const addWater = useDiaryStore((s) => s.addWater)
  const onAdd = useCallback((v: number) => addWater(today, v), [addWater, today])
  const onRemove = useCallback((v: number) => addWater(today, -v), [addWater, today])

  return (
    <Card title="Vatten" eyebrow="Idag" tone="fjall">
      <WaterGlasses ml={ml} targetMl={targetMl} glassMl={glassMl} onAdd={onAdd} onRemove={onRemove} />
    </Card>
  )
})
