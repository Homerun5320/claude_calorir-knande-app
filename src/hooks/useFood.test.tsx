/**
 * Hookarna för livsmedel: en loggad eller favoritmarkerad svensk klassiker ('recipe:klassiker-*')
 * ska synas i Senaste, bland favoriterna, i sökningen och på detaljsidan (`useFood`).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFood, useFoodResolver } from './useFood'
import { useFavoriteFoods, useFoodSearch, useRecentFoods } from './useFoodSearch'
import { loadBuiltinCatalog } from '../lib/foodRepo'
import { useFoodStore } from '../stores/foodStore'

const ID = 'recipe:klassiker-pannkakor'

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await loadBuiltinCatalog()
})

beforeEach(() => {
  useFoodStore.getState().clearFoods()
})

describe('inbyggda recept i hookarna', () => {
  it('useFood hittar en klassiker på id (detaljsidan)', () => {
    const { result } = renderHook(() => useFood(ID))
    expect(result.current).toMatchObject({ loading: false, food: { id: ID, name: 'Pannkakor', source: 'recipe' } })
    expect(result.current.error).toBeUndefined()
  })

  it('useFoodResolver slår upp klassiker och vanliga livsmedel', () => {
    const { result } = renderHook(() => useFoodResolver())
    expect(result.current(ID)?.name).toBe('Pannkakor')
    expect(result.current('lagom:kanelbulle-bageri')?.name).toBe('Kanelbulle')
  })

  it('visar en loggad klassiker under Senaste och bland favoriterna', () => {
    useFoodStore.getState().recordUsage(ID, 1, 'portion:portion', 'middag')
    useFoodStore.getState().toggleFavorite(ID)
    const recent = renderHook(() => useRecentFoods(12, 'middag'))
    expect(recent.result.current.map((f) => f.id)).toEqual([ID])
    const favorites = renderHook(() => useFavoriteFoods())
    expect(favorites.result.current.map((f) => f.id)).toEqual([ID])
  })

  it('hittar klassikerna i sökningen', async () => {
    const { result } = renderHook(() => useFoodSearch('pannkakor'))
    await waitFor(() => expect(result.current.results.map((r) => r.food.id)).toContain(ID))
    // Vanliga livsmedel finns kvar bland träffarna.
    expect(result.current.results.some((r) => r.food.source === 'lagom')).toBe(true)
  })
})
