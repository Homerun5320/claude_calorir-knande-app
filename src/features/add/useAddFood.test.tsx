import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAddFood } from './useAddFood'
import { useBasketStore } from './basketStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { useToastStore } from '../../components/ui/toast'
import { bulle, mjolk, offBar } from './testFoods'
import type { FoodEntry } from '../../types'

const target = { date: '2026-09-26', meal: 'frukost' as const }

function reset() {
  useDiaryStore.setState({ entries: {} })
  useFoodStore.setState({ usage: {}, cachedFoods: {}, templates: [] })
  useToastStore.setState({ toasts: [] })
  useBasketStore.setState({ items: [] })
}

describe('useAddFood', () => {
  beforeEach(reset)

  it('lägger till en post, minns mängden och visar "Tillagt i Frukost" med ångra', () => {
    const { result } = renderHook(() => useAddFood())
    let entry: ReturnType<typeof result.current.addFood> = null
    act(() => {
      entry = result.current.addFood(bulle, 2, 'portion:st', target)
    })
    const list = useDiaryStore.getState().entries[target.date]
    expect(list).toHaveLength(1)
    const e = list[0] as FoodEntry
    expect(e).toMatchObject({ kind: 'food', amount: 2, unit: 'portion:st', grams: 120, meal: 'frukost' })
    expect(e.food.id).toBe(bulle.id)
    expect(entry).not.toBeNull()

    expect(useFoodStore.getState().usage[bulle.id]).toMatchObject({ count: 1, lastAmount: 2, lastUnit: 'portion:st', meals: { frukost: 1 } })
    // Inbyggda livsmedel sparas inte som kopia.
    expect(useFoodStore.getState().cachedFoods[bulle.id]).toBeUndefined()

    const t = useToastStore.getState().toasts.at(-1)
    expect(t?.message).toBe('Tillagt i Frukost')
    act(() => t?.action?.onClick())
    expect(useDiaryStore.getState().entries[target.date]).toBeUndefined()
  })

  it('sparar produkter från Open Food Facts för offlinebruk', () => {
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.addFood(offBar, 1, 'portion:serving', target)
    })
    expect(useFoodStore.getState().cachedFoods[offBar.id]?.name).toBe('Proteinbar')
  })

  it('vägrar en mängd som inte kan räknas om till gram', () => {
    const { result } = renderHook(() => useAddFood())
    let entry: ReturnType<typeof result.current.addFood> = null
    act(() => {
      entry = result.current.addFood(bulle, 2, 'dl', target)
    })
    expect(entry).toBeNull()
    expect(useDiaryStore.getState().entries[target.date]).toBeUndefined()
    expect(useToastStore.getState().toasts.at(-1)?.tone).toBe('error')
  })

  it('lägger till hela korgen på en gång och kan ångra allt', () => {
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.addMany(
        [
          { food: bulle, amount: 1, unit: 'portion:st' },
          { food: mjolk, amount: 2, unit: 'dl' },
        ],
        target,
      )
    })
    expect(useDiaryStore.getState().entries[target.date]).toHaveLength(2)
    const t = useToastStore.getState().toasts.at(-1)
    expect(t?.message).toBe('2 livsmedel tillagda i Frukost')
    act(() => t?.action?.onClick())
    expect(useDiaryStore.getState().entries[target.date]).toBeUndefined()
  })

  it('snabbregistrerar med okända makron som okända', () => {
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.addQuick('  ', { kcal: 650, protein: undefined }, { ...target, meal: 'lunch' })
    })
    const e = useDiaryStore.getState().entries[target.date][0]
    expect(e).toMatchObject({ kind: 'quick', name: 'Snabbregistrering', nutrients: { kcal: 650 }, meal: 'lunch' })
    expect('protein' in (e.kind === 'quick' ? e.nutrients : {})).toBe(false)
  })

  it('sparar och använder en måltid', () => {
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.saveTemplate('Min frukost', [
        { food: bulle, amount: 1, unit: 'portion:st' },
        { food: mjolk, amount: 2, unit: 'dl' },
      ], 'frukost')
    })
    const [tpl] = useFoodStore.getState().templates
    expect(tpl).toMatchObject({ name: 'Min frukost', meal: 'frukost' })
    expect(tpl.items.map((i) => Math.round(i.grams))).toEqual([60, 206])
    act(() => {
      result.current.addTemplate(tpl, { ...target, meal: 'fika' })
    })
    expect(useDiaryStore.getState().entries[target.date]).toHaveLength(2)
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Min frukost tillagd i Fika')
  })
})

describe('korgen', () => {
  beforeEach(reset)

  it('lägger till, ändrar och tar bort varor', () => {
    const s = useBasketStore.getState()
    const item = s.add(bulle, 1, 'portion:st', 'search')
    expect(item?.grams).toBe(60)
    expect(s.add(bulle, 1, 'dl')).toBeNull()
    useBasketStore.getState().update(item!.key, 2, 'portion:stor')
    expect(useBasketStore.getState().items[0]).toMatchObject({ amount: 2, unit: 'portion:stor', grams: 220 })
    // Ogiltig ändring ignoreras.
    useBasketStore.getState().update(item!.key, 1, 'dl')
    expect(useBasketStore.getState().items[0].grams).toBe(220)
    useBasketStore.getState().add(mjolk, 2, 'dl', 'suggestion')
    useBasketStore.getState().removeFood(bulle.id)
    expect(useBasketStore.getState().items.map((i) => i.food.id)).toEqual([mjolk.id])
    useBasketStore.getState().clear()
    expect(useBasketStore.getState().items).toEqual([])
  })
})
