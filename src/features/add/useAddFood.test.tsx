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
  useFoodStore.setState({ usage: {}, cachedFoods: {}, templates: [], favorites: [] })
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

  it('ångra återställer användningsstatistiken exakt', () => {
    const before = { count: 3, lastUsed: 1_000, lastAmount: 1, lastUnit: 'portion:st' as const, meals: { frukost: 2, fika: 1 } }
    useFoodStore.setState({ usage: { [bulle.id]: before } })
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.addFood(bulle, 2, 'portion:stor', { ...target, meal: 'fika' })
    })
    expect(useFoodStore.getState().usage[bulle.id]).toMatchObject({ count: 4, lastAmount: 2, lastUnit: 'portion:stor' })
    act(() => useToastStore.getState().toasts.at(-1)?.action?.onClick())
    expect(useFoodStore.getState().usage[bulle.id]).toEqual(before)
  })

  it('ångra tar bort statistik och nysparad onlineprodukt för ett livsmedel som aldrig loggats', () => {
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.addFood(offBar, 1, 'portion:serving', target)
    })
    expect(useFoodStore.getState().cachedFoods[offBar.id]).toBeDefined()
    act(() => useToastStore.getState().toasts.at(-1)?.action?.onClick())
    expect(useFoodStore.getState().usage[offBar.id]).toBeUndefined()
    expect(useFoodStore.getState().cachedFoods[offBar.id]).toBeUndefined()
  })

  it('ångra behåller en nysparad onlineprodukt som hunnit bli favorit', () => {
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.addFood(offBar, 1, 'portion:serving', target)
    })
    const undo = useToastStore.getState().toasts.at(-1)?.action?.onClick
    useFoodStore.getState().toggleFavorite(offBar.id)
    act(() => undo?.())
    expect(useFoodStore.getState().usage[offBar.id]).toBeUndefined()
    expect(useFoodStore.getState().cachedFoods[offBar.id]).toBeDefined()
  })

  it('ångra behåller en redan sparad onlineprodukt', () => {
    useFoodStore.setState({ cachedFoods: { [offBar.id]: offBar } })
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.addFood(offBar, 1, 'portion:serving', target)
    })
    act(() => useToastStore.getState().toasts.at(-1)?.action?.onClick())
    expect(useFoodStore.getState().cachedFoods[offBar.id]).toBeDefined()
  })

  it('ångra räknar bara bort sitt eget tillägg om livsmedlet har loggats igen efteråt', () => {
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.addFood(bulle, 1, 'portion:st', target)
    })
    const firstUndo = useToastStore.getState().toasts.at(-1)?.action?.onClick
    act(() => {
      result.current.addFood(bulle, 3, 'portion:st', { ...target, meal: 'lunch' })
    })
    act(() => firstUndo?.())
    expect(useFoodStore.getState().usage[bulle.id]).toMatchObject({ count: 1, lastAmount: 3, meals: { lunch: 1 } })
    expect(useFoodStore.getState().usage[bulle.id]?.meals.frukost).toBeUndefined()
    // Att ångra två gånger ändrar inget mer.
    act(() => firstUndo?.())
    expect(useFoodStore.getState().usage[bulle.id]).toMatchObject({ count: 1, lastAmount: 3 })
    expect(useDiaryStore.getState().entries[target.date]).toHaveLength(1)
  })

  it('ångra av korgen återställer statistiken även när samma livsmedel finns två gånger', () => {
    const { result } = renderHook(() => useAddFood())
    act(() => {
      result.current.addMany(
        [
          { food: bulle, amount: 1, unit: 'portion:st' },
          { food: bulle, amount: 2, unit: 'portion:st' },
          { food: mjolk, amount: 2, unit: 'dl' },
        ],
        target,
      )
    })
    expect(useFoodStore.getState().usage[bulle.id]?.count).toBe(2)
    act(() => useToastStore.getState().toasts.at(-1)?.action?.onClick())
    expect(useFoodStore.getState().usage).toEqual({})
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
