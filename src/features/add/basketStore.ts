/**
 * Korgen – livsmedel som samlas ihop innan de läggs till i dagboken i ett svep.
 *
 * Delas mellan sidan "Lägg till" och streckkodsläsaren (skanna flera varor i rad). Sparas i
 * sessionStorage så att korgen överlever en omladdning av appen, men inte längre än fliken lever.
 */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Food, UnitKey } from '../../types'
import { gramsFor } from '../../lib/units'
import { uid } from '../../lib/id'

export interface BasketItem {
  key: string
  food: Food
  amount: number
  unit: UnitKey
  grams: number
  /** Hur varan hamnade i korgen – förslag kan tas bort med ett nytt tryck. */
  origin?: 'suggestion' | 'search' | 'scan' | 'template' | 'text' | 'plate'
  /** Anteckning som följer med till dagboken, t.ex. "Uppskattat med tallriken". */
  note?: string
}

interface BasketState {
  items: BasketItem[]
  /** Lägg till en vara. Returnerar null om mängden inte kan räknas om till gram. */
  add: (food: Food, amount: number, unit: UnitKey, origin?: BasketItem['origin'], note?: string) => BasketItem | null
  /** Ändra mängd/enhet för en vara. */
  update: (key: string, amount: number, unit: UnitKey) => void
  remove: (key: string) => void
  /** Ta bort alla varor av ett visst livsmedel. */
  removeFood: (foodId: string) => void
  clear: () => void
}

/** sessionStorage när den finns (inte i t.ex. privat läge i vissa webbläsare). */
function sessionStore(): Storage {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage
  } catch {
    /* blockerad lagring */
  }
  const mem = new Map<string, string>()
  return {
    get length() {
      return mem.size
    },
    clear: () => mem.clear(),
    getItem: (k) => mem.get(k) ?? null,
    key: (i) => [...mem.keys()][i] ?? null,
    removeItem: (k) => void mem.delete(k),
    setItem: (k, v) => void mem.set(k, v),
  }
}

export const useBasketStore = create<BasketState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (food, amount, unit, origin, note) => {
        const grams = gramsFor(food, amount, unit)
        if (!Number.isFinite(grams) || grams <= 0) return null
        const item: BasketItem = { key: uid('k_'), food, amount, unit, grams, origin, ...(note ? { note } : {}) }
        set({ items: [...get().items, item] })
        return item
      },
      update: (key, amount, unit) => {
        set({
          items: get().items.map((i) => {
            if (i.key !== key) return i
            const grams = gramsFor(i.food, amount, unit)
            return Number.isFinite(grams) && grams > 0 ? { ...i, amount, unit, grams } : i
          }),
        })
      },
      remove: (key) => set({ items: get().items.filter((i) => i.key !== key) }),
      removeFood: (foodId) => set({ items: get().items.filter((i) => i.food.id !== foodId) }),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'lagom-korg',
      version: 1,
      storage: createJSONStorage(sessionStore),
      partialize: (s) => ({ items: s.items }),
    },
  ),
)

/**
 * Töm korgen helt – både i minnet och ur sessionStorage (`lagom-korg`). Används av "Radera all
 * data": korgen håller hela livsmedelsposter (även egna livsmedel) och anteckningar, och annars
 * hamnade den förra profilens varor i den nya profilens "Lägg till". Kastar aldrig.
 */
export function wipeBasket(): void {
  try {
    useBasketStore.getState().clear()
    useBasketStore.persist.clearStorage()
  } catch {
    /* blockerad lagring – minnet är redan tömt */
  }
}
