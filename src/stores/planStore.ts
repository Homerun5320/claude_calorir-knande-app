/**
 * Veckoplaneringen: planerade måltider per dag och inköpslistans bockar och egna rader per vecka.
 *
 * Sparas som övriga butiker i IndexedDB (`idbStorage` – tolerant: minnesläge när lagringen inte
 * fungerar, skriver aldrig över data som inte har lästs in). Vid varje inläsning kontrolleras datan
 * (`sanitizePlanData`), så att skadade rader hoppas över i stället för att få sidan att krascha.
 *
 * Logiken (veckor, inköpslista, energi) ligger i `lib/planning.ts`.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ISODate, MealId, UnitKey } from '../types'
import { uid } from '../lib/id'
import {
  MAX_COOK_SERVINGS,
  MAX_EAT_SERVINGS,
  MAX_EXTRAS_PER_WEEK,
  MAX_ITEMS_PER_DAY,
  cleanExtraText,
  sanitizePlanData,
  shiftWeekItems,
  weekDates,
  weekStartOf,
  type NewPlanItem,
  type PlanData,
  type PlanItem,
  type ShoppingExtra,
  type WeekShopping,
} from '../lib/planning'
import { idbStorage, PERSIST_VERSIONS, STORE_KEYS } from './storage'

/**
 * Nyckeln i IndexedDB – registrerad som `STORE_KEYS.plan` i storage.ts, så att säkerhetskopian,
 * raderingen och skyddet mot data från nyare versioner omfattar planen.
 */
export const PLAN_STORE_KEY = STORE_KEYS.plan
/**
 * Det sparade formatets version (`PERSIST_VERSIONS` i storage.ts) – höj den där och lägg till en
 * migrering i `migrate` när formatet ändras.
 */
export const PLAN_PERSIST_VERSION = PERSIST_VERSIONS[STORE_KEYS.plan]

/** Det som går att ändra på en planerad rad (gäller bara rader av rätt slag). */
export interface PlanItemPatch {
  meal?: MealId
  /** Recept: portioner att laga. */
  servings?: number
  /** Recept: portioner du äter. */
  eat?: number
  /** Livsmedel: mängd, enhet och vikt. */
  amount?: number
  unit?: UnitKey
  grams?: number
}

export interface PlanState extends PlanData {
  /** Lägg till en planerad rad. Returnerar raden (med id), eller null om dagen är full. */
  addItem: (item: NewPlanItem) => PlanItem | null
  updateItem: (date: ISODate, id: string, patch: PlanItemPatch) => void
  /** Ta bort och returnera raden (för ångra). */
  removeItem: (date: ISODate, id: string) => PlanItem | undefined
  /**
   * Ta bort flera rader (dag och id) med en enda skrivning – varje `set()` skriver om hela butiken,
   * så anropa aldrig `removeItem` i en slinga. Rader som inte finns hoppas över, och finns ingen
   * kvar att ta bort skrivs inget. Returnerar de borttagna raderna (för ångra).
   */
  removeItems: (refs: ReadonlyArray<Pick<PlanItem, 'date' | 'id'>>) => PlanItem[]
  /** Lägg tillbaka borttagna rader (ångra) – rader som redan finns hoppas över. */
  restoreItems: (items: readonly PlanItem[]) => void
  /** Markera raden som loggad med dagbokspostens id:n. */
  markLogged: (date: ISODate, id: string, entryIds: readonly string[]) => void
  /** Kopiera en veckas rader till en annan vecka (läggs till). Returnerar de nya raderna. */
  copyWeek: (fromWeekStart: ISODate, toWeekStart: ISODate) => PlanItem[]
  /** Töm en vecka. Returnerar de borttagna raderna (för ångra). */
  clearWeek: (weekStart: ISODate) => PlanItem[]

  toggleChecked: (weekStart: ISODate, key: string) => void
  /** Ta bort alla bockar i veckans lista (även på egna rader). Returnerar läget före (för ångra). */
  uncheckAll: (weekStart: ISODate) => WeekShopping
  /**
   * Lägg tillbaka bockarna från ett tidigare läge (ångra "Ta bort bockarna"). Egna rader som har
   * tagits bort under tiden kommer inte tillbaka.
   */
  restoreChecks: (weekStart: ISODate, before: WeekShopping) => void
  /** Lägg till en egen rad. null om texten är tom eller listan är full. */
  addExtra: (weekStart: ISODate, text: string) => ShoppingExtra | null
  toggleExtra: (weekStart: ISODate, id: string) => void
  /** Ta bort och returnera en egen rad (för ångra). */
  removeExtra: (weekStart: ISODate, id: string) => ShoppingExtra | undefined
  /** Lägg tillbaka en borttagen egen rad (ångra). */
  restoreExtra: (weekStart: ISODate, extra: ShoppingExtra) => void

  /** Radera all planering (används av "Radera all data"). */
  clearPlan: () => void
}

const EMPTY_WEEK: WeekShopping = { checked: [], extras: [] }

let lastStamp = 0
/**
 * Tidsstämpel som alltid ökar inom sessionen – rader som läggs till samma millisekund får ändå
 * en bestämd ordning, så att "Ångra" lägger tillbaka dem på rätt plats.
 */
function nextStamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

const finiteOr = (v: number | undefined, fallback: number) => (v !== undefined && Number.isFinite(v) ? v : fallback)

/** Talet inom gränserna, annars reserven. */
function within(v: number | undefined, min: number, max: number, fallback: number): number {
  return v !== undefined && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}

/** Rader med rimliga portioner (skydd mot t.ex. NaN från ett trasigt fält). */
function normalize(item: PlanItem): PlanItem {
  if (item.kind !== 'recipe') return item
  return { ...item, servings: within(item.servings, 0, MAX_COOK_SERVINGS, 1), eat: within(item.eat, 0.25, MAX_EAT_SERVINGS, 1) }
}

function withItems(map: Record<ISODate, PlanItem[]>, date: ISODate, list: PlanItem[]): Record<ISODate, PlanItem[]> {
  const next = { ...map }
  if (list.length > 0) next[date] = list
  else delete next[date]
  return next
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => {
      const setWeek = (weekStart: ISODate, update: (week: WeekShopping) => WeekShopping) => {
        const key = weekStartOf(weekStart)
        const cur = get().shopping[key] ?? EMPTY_WEEK
        const next = update(cur)
        if (next === cur) return
        const shopping = { ...get().shopping }
        if (next.checked.length === 0 && next.extras.length === 0) delete shopping[key]
        else shopping[key] = next
        set({ shopping })
      }

      return {
        items: {},
        shopping: {},

        addItem: (draft) => {
          const list = get().items[draft.date] ?? []
          if (list.length >= MAX_ITEMS_PER_DAY) return null
          const item = normalize({ ...draft, id: uid('p_'), createdAt: nextStamp() } as PlanItem)
          set({ items: withItems(get().items, item.date, [...list, item]) })
          return item
        },

        updateItem: (date, id, patch) => {
          const list = get().items[date]
          if (!list?.some((i) => i.id === id)) return
          const next = list.map((i): PlanItem => {
            if (i.id !== id) return i
            const meal = patch.meal ?? i.meal
            if (i.kind === 'recipe') {
              return normalize({ ...i, meal, servings: finiteOr(patch.servings, i.servings), eat: finiteOr(patch.eat, i.eat) })
            }
            if (i.kind === 'food') {
              const ok = patch.amount !== undefined && patch.unit !== undefined && patch.grams !== undefined && patch.grams > 0 && patch.amount > 0
              return ok ? { ...i, meal, amount: patch.amount as number, unit: patch.unit as UnitKey, grams: patch.grams as number } : { ...i, meal }
            }
            return { ...i, meal }
          })
          set({ items: { ...get().items, [date]: next } })
        },

        removeItem: (date, id) => {
          const list = get().items[date]
          const found = list?.find((i) => i.id === id)
          if (!list || !found) return undefined
          set({ items: withItems(get().items, date, list.filter((i) => i.id !== id)) })
          return found
        },

        removeItems: (refs) => {
          if (refs.length === 0) return []
          const wanted = new Set(refs.map((r) => `${r.date}|${r.id}`))
          let items = get().items
          const removed: PlanItem[] = []
          for (const date of new Set(refs.map((r) => r.date))) {
            const list = items[date]
            if (!list) continue
            const hit = list.filter((i) => wanted.has(`${date}|${i.id}`))
            if (hit.length === 0) continue
            removed.push(...hit)
            items = withItems(items, date, list.filter((i) => !hit.includes(i)))
          }
          if (removed.length === 0) return []
          set({ items })
          return removed
        },

        restoreItems: (restore) => {
          if (restore.length === 0) return
          let items = get().items
          for (const item of restore) {
            const list = items[item.date] ?? []
            if (list.some((i) => i.id === item.id)) continue
            items = withItems(items, item.date, [...list, item].sort((a, b) => a.createdAt - b.createdAt))
          }
          set({ items })
        },

        markLogged: (date, id, entryIds) => {
          const list = get().items[date]
          if (!list?.some((i) => i.id === id) || entryIds.length === 0) return
          set({ items: { ...get().items, [date]: list.map((i) => (i.id === id ? { ...i, loggedEntryIds: [...entryIds] } : i)) } })
        },

        copyWeek: (fromWeekStart, toWeekStart) => {
          const from = weekStartOf(fromWeekStart)
          const to = weekStartOf(toWeekStart)
          if (from === to) return []
          const copies = shiftWeekItems(get().items, from, to, () => uid('p_'), nextStamp())
          if (copies.length === 0) return []
          let items = get().items
          const added: PlanItem[] = []
          for (const item of copies) {
            const list = items[item.date] ?? []
            if (list.length >= MAX_ITEMS_PER_DAY) continue
            items = withItems(items, item.date, [...list, item])
            added.push(item)
          }
          set({ items })
          return added
        },

        clearWeek: (weekStart) => {
          const dates = weekDates(weekStartOf(weekStart))
          const removed = dates.flatMap((d) => get().items[d] ?? [])
          if (removed.length === 0) return []
          const items = { ...get().items }
          for (const d of dates) delete items[d]
          set({ items })
          return removed
        },

        toggleChecked: (weekStart, key) =>
          setWeek(weekStart, (w) => ({ ...w, checked: w.checked.includes(key) ? w.checked.filter((k) => k !== key) : [...w.checked, key] })),

        uncheckAll: (weekStart) => {
          const before = get().shopping[weekStartOf(weekStart)] ?? EMPTY_WEEK
          setWeek(weekStart, (w) =>
            w.checked.length === 0 && !w.extras.some((e) => e.checked) ? w : { checked: [], extras: w.extras.map((e) => (e.checked ? { ...e, checked: false } : e)) },
          )
          return before
        },

        restoreChecks: (weekStart, before) => {
          const checkedExtras = new Set(before.extras.filter((e) => e.checked).map((e) => e.id))
          setWeek(weekStart, (w) => ({
            checked: [...new Set([...w.checked, ...before.checked])],
            extras: w.extras.map((e) => (checkedExtras.has(e.id) && !e.checked ? { ...e, checked: true } : e)),
          }))
        },

        addExtra: (weekStart, text) => {
          const clean = cleanExtraText(text)
          const key = weekStartOf(weekStart)
          if (!clean || (get().shopping[key]?.extras.length ?? 0) >= MAX_EXTRAS_PER_WEEK) return null
          const extra: ShoppingExtra = { id: uid('x_'), text: clean, checked: false, createdAt: nextStamp() }
          setWeek(key, (w) => ({ ...w, extras: [...w.extras, extra] }))
          return extra
        },

        toggleExtra: (weekStart, id) =>
          setWeek(weekStart, (w) =>
            w.extras.some((e) => e.id === id) ? { ...w, extras: w.extras.map((e) => (e.id === id ? { ...e, checked: !e.checked } : e)) } : w,
          ),

        removeExtra: (weekStart, id) => {
          const found = get().shopping[weekStartOf(weekStart)]?.extras.find((e) => e.id === id)
          if (!found) return undefined
          setWeek(weekStart, (w) => ({ ...w, extras: w.extras.filter((e) => e.id !== id) }))
          return found
        },

        restoreExtra: (weekStart, extra) =>
          setWeek(weekStart, (w) =>
            w.extras.some((e) => e.id === extra.id) ? w : { ...w, extras: [...w.extras, extra].sort((a, b) => a.createdAt - b.createdAt) },
          ),

        clearPlan: () => set({ items: {}, shopping: {} }),
      }
    },
    {
      name: PLAN_STORE_KEY,
      storage: idbStorage,
      version: PLAN_PERSIST_VERSION,
      partialize: (s) => ({ items: s.items, shopping: s.shopping }),
      // Framtida migreringar läggs här – kasta aldrig fel, skyddet mot nyare data ligger i storage.ts.
      migrate: (persisted) => persisted as PlanState,
      // Datan kontrolleras vid varje inläsning: skadade rader hoppas över, så att sidan aldrig
      // kraschar. Kontrollen kastar inte – men skulle den ändå göra det behålls den sparade datan.
      merge: (persisted, current) => {
        try {
          const { data } = sanitizePlanData(persisted)
          return { ...current, ...data }
        } catch (err) {
          if (import.meta.env.DEV) console.warn('Kunde inte läsa veckoplaneringen', err)
          return { ...current, ...(persisted as Partial<PlanData> | undefined) }
        }
      },
    },
  ),
)

/** true när planeringen har lästs in från IndexedDB. */
export function planHydrated(): boolean {
  return usePlanStore.persist.hasHydrated()
}
