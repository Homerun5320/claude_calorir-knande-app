/**
 * Veckoplaneringens butik: rader (lägg till, ändra, ta bort, ångra, loggning), kopiera och tömma
 * vecka, inköpslistans bockar och egna rader, radering – och tolerant lagring i IndexedDB.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import { del, get, set } from 'idb-keyval'
import type { Food } from '../types'
import type { NewPlanItem, PlanFoodItem, PlanRecipeItem } from '../lib/planning'
import { MAX_COOK_SERVINGS, MAX_EXTRAS_PER_WEEK, MAX_ITEMS_PER_DAY } from '../lib/planning'
import { PLAN_PERSIST_VERSION, PLAN_STORE_KEY, planHydrated, usePlanStore } from './planStore'

const MONDAY = '2026-09-28'

const lök: Food = {
  id: 'lagom:lok',
  name: 'Lök',
  source: 'lagom',
  category: 'gronsaker',
  nutrients: { kcal: 40 },
  portions: [{ id: 'st', label: '1 st (medel)', grams: 100 }],
}

const recipeDraft = (patch: Partial<PlanRecipeItem> = {}): NewPlanItem => ({
  kind: 'recipe',
  date: MONDAY,
  meal: 'middag',
  recipeId: 'klassiker-kottbullar',
  name: 'Köttbullar',
  servings: 4,
  eat: 1,
  ...patch,
})

const foodDraft = (patch: Partial<PlanFoodItem> = {}): NewPlanItem => ({
  kind: 'food',
  date: MONDAY,
  meal: 'frukost',
  food: lök,
  amount: 1,
  unit: 'portion:st',
  grams: 100,
  ...patch,
})

beforeAll(async () => {
  await waitFor(() => expect(planHydrated()).toBe(true))
})

beforeEach(() => {
  usePlanStore.getState().clearPlan()
})

describe('planerade rader', () => {
  it('lägger till rader med id och tidsstämpel', () => {
    const item = usePlanStore.getState().addItem(recipeDraft())
    expect(item).toMatchObject({ kind: 'recipe', date: MONDAY, recipeId: 'klassiker-kottbullar', servings: 4, eat: 1 })
    expect(item?.id).toMatch(/^p_/)
    expect(usePlanStore.getState().items[MONDAY]).toEqual([item])
  })

  it('håller portionerna inom rimliga gränser', () => {
    const item = usePlanStore.getState().addItem(recipeDraft({ servings: 9999, eat: 0 }))
    expect(item).toMatchObject({ servings: MAX_COOK_SERVINGS, eat: 0.25 })
    usePlanStore.getState().updateItem(MONDAY, item!.id, { servings: Number.NaN, eat: 2 })
    expect(usePlanStore.getState().items[MONDAY][0]).toMatchObject({ servings: MAX_COOK_SERVINGS, eat: 2 })
    // En hel sats pepparkakor (120 st) ryms.
    usePlanStore.getState().updateItem(MONDAY, item!.id, { servings: 120 })
    expect(usePlanStore.getState().items[MONDAY][0]).toMatchObject({ servings: 120 })
  })

  it('tar inte emot fler rader än dagen rymmer', () => {
    const { addItem } = usePlanStore.getState()
    for (let i = 0; i < MAX_ITEMS_PER_DAY; i++) expect(addItem(foodDraft())).not.toBeNull()
    expect(addItem(foodDraft())).toBeNull()
  })

  it('ändrar måltid, portioner och mängd efter radens slag', () => {
    const { addItem, updateItem } = usePlanStore.getState()
    const r = addItem(recipeDraft())!
    const f = addItem(foodDraft())!
    updateItem(MONDAY, r.id, { meal: 'lunch', servings: 2, eat: 1.5, amount: 5 })
    updateItem(MONDAY, f.id, { meal: 'lunch', amount: 2, unit: 'portion:st', grams: 200 })
    const [r2, f2] = usePlanStore.getState().items[MONDAY]
    expect(r2).toMatchObject({ meal: 'lunch', servings: 2, eat: 1.5 })
    expect(r2).not.toHaveProperty('amount')
    expect(f2).toMatchObject({ meal: 'lunch', amount: 2, grams: 200 })
    // En ogiltig mängd ändrar bara måltiden.
    updateItem(MONDAY, f.id, { meal: 'middag', amount: 0, unit: 'g', grams: 0 })
    expect(usePlanStore.getState().items[MONDAY][1]).toMatchObject({ meal: 'middag', amount: 2, grams: 200 })
  })

  it('tar bort och ångrar i samma ordning', () => {
    const { addItem, removeItem, restoreItems } = usePlanStore.getState()
    const a = addItem(recipeDraft())!
    const b = addItem(foodDraft())!
    const removed = removeItem(MONDAY, a.id)
    expect(removed).toEqual(a)
    expect(usePlanStore.getState().items[MONDAY]).toEqual([b])
    expect(usePlanStore.getState().removeItem(MONDAY, 'finns-inte')).toBeUndefined()
    restoreItems([a])
    restoreItems([a]) // ingen dubblett
    expect(usePlanStore.getState().items[MONDAY].map((i) => i.id)).toEqual([a.id, b.id])
    usePlanStore.getState().removeItem(MONDAY, a.id)
    usePlanStore.getState().removeItem(MONDAY, b.id)
    expect(usePlanStore.getState().items[MONDAY]).toBeUndefined()
  })

  it('tar bort flera rader med en enda skrivning och ångrar dem med en', () => {
    const { addItem, removeItems, restoreItems } = usePlanStore.getState()
    const a = addItem(recipeDraft())!
    const b = addItem(foodDraft())!
    const c = addItem(foodDraft({ date: '2026-09-30' }))!
    const d = addItem(foodDraft({ date: '2026-10-01' }))!
    let writes = 0
    const unsubscribe = usePlanStore.subscribe(() => {
      writes++
    })
    try {
      const removed = removeItems([a, b, c, { date: MONDAY, id: a.id }, { date: MONDAY, id: 'finns-inte' }, { date: '2026-12-24', id: d.id }])
      // Varje rad en gång, bara de som fanns på rätt dag – dagar som blir tomma försvinner.
      expect(removed.map((i) => i.id).sort()).toEqual([a.id, b.id, c.id].sort())
      expect(writes).toBe(1)
      expect(Object.keys(usePlanStore.getState().items)).toEqual(['2026-10-01'])
      expect(usePlanStore.getState().items['2026-10-01']).toEqual([d])

      restoreItems(removed)
      expect(writes).toBe(2)
      expect(usePlanStore.getState().items[MONDAY].map((i) => i.id)).toEqual([a.id, b.id])
      expect(usePlanStore.getState().items['2026-09-30']).toEqual([c])
    } finally {
      unsubscribe()
    }
  })

  it('tar bara bort angivna rader på en dag med fler rader', () => {
    const { addItem, removeItems } = usePlanStore.getState()
    const a = addItem(recipeDraft())!
    const b = addItem(foodDraft())!
    const c = addItem(foodDraft())!
    expect(removeItems([{ date: MONDAY, id: b.id }])).toEqual([b])
    expect(usePlanStore.getState().items[MONDAY]).toEqual([a, c])
  })

  it('skriver ingenting när inget tas bort (tom lista eller rader som inte finns)', () => {
    const a = usePlanStore.getState().addItem(recipeDraft())!
    let writes = 0
    const unsubscribe = usePlanStore.subscribe(() => {
      writes++
    })
    try {
      const before = usePlanStore.getState().items
      expect(usePlanStore.getState().removeItems([])).toEqual([])
      expect(usePlanStore.getState().removeItems([{ date: MONDAY, id: 'finns-inte' }, { date: '2026-12-24', id: a.id }])).toEqual([])
      expect(writes).toBe(0)
      expect(usePlanStore.getState().items).toBe(before)
    } finally {
      unsubscribe()
    }
  })

  it('markerar rader som loggade', () => {
    const a = usePlanStore.getState().addItem(recipeDraft())!
    usePlanStore.getState().markLogged(MONDAY, a.id, ['e_1', 'e_2'])
    expect(usePlanStore.getState().items[MONDAY][0].loggedEntryIds).toEqual(['e_1', 'e_2'])
    usePlanStore.getState().markLogged(MONDAY, a.id, [])
    expect(usePlanStore.getState().items[MONDAY][0].loggedEntryIds).toEqual(['e_1', 'e_2'])
  })
})

describe('veckor', () => {
  it('kopierar förra veckan till samma veckodagar', () => {
    const { addItem, copyWeek } = usePlanStore.getState()
    const a = addItem(recipeDraft({ date: '2026-09-21' }))!
    usePlanStore.getState().markLogged('2026-09-21', a.id, ['e_1'])
    addItem(foodDraft({ date: '2026-09-27' }))
    const added = copyWeek('2026-09-21', '2026-10-01')
    expect(added.map((i) => i.date)).toEqual(['2026-09-28', '2026-10-04'])
    expect(added[0].loggedEntryIds).toBeUndefined()
    expect(added[0].id).not.toBe(a.id)
    // Samma vecka eller en tom vecka ger inget.
    expect(copyWeek(MONDAY, MONDAY)).toEqual([])
    expect(copyWeek('2026-09-07', MONDAY)).toEqual([])
  })

  it('tömmer en vecka och kan ångra', () => {
    const { addItem, clearWeek, restoreItems } = usePlanStore.getState()
    addItem(recipeDraft())
    addItem(foodDraft({ date: '2026-10-04' }))
    const other = addItem(foodDraft({ date: '2026-10-05' }))!
    const removed = clearWeek('2026-10-02')
    expect(removed).toHaveLength(2)
    expect(Object.keys(usePlanStore.getState().items)).toEqual(['2026-10-05'])
    restoreItems(removed)
    expect(Object.keys(usePlanStore.getState().items).sort()).toEqual([MONDAY, '2026-10-04', '2026-10-05'])
    expect(usePlanStore.getState().items['2026-10-05']).toEqual([other])
    expect(clearWeek('2026-09-07')).toEqual([])
  })
})

describe('inköpslistan', () => {
  it('bockar av och på per vecka (vilken dag i veckan som helst)', () => {
    const { toggleChecked } = usePlanStore.getState()
    toggleChecked('2026-10-01', 'food:lagom:lok')
    expect(usePlanStore.getState().shopping[MONDAY]).toEqual({ checked: ['food:lagom:lok'], extras: [] })
    toggleChecked(MONDAY, 'food:lagom:lok')
    // Ett tomt veckoläge sparas inte.
    expect(usePlanStore.getState().shopping[MONDAY]).toBeUndefined()
  })

  it('lägger till, bockar, tar bort och ångrar egna rader', () => {
    const s = usePlanStore.getState()
    expect(s.addExtra(MONDAY, '   ')).toBeNull()
    const a = s.addExtra(MONDAY, '  Diskmedel ')!
    const b = s.addExtra(MONDAY, 'Kaffefilter')!
    expect(a.text).toBe('Diskmedel')
    s.toggleExtra(MONDAY, a.id)
    s.toggleChecked(MONDAY, 'food:lagom:lok')
    expect(usePlanStore.getState().shopping[MONDAY].extras.map((e) => e.checked)).toEqual([true, false])
    s.uncheckAll(MONDAY)
    expect(usePlanStore.getState().shopping[MONDAY]).toEqual({ checked: [], extras: [{ ...a, checked: false }, b] })
    const removed = s.removeExtra(MONDAY, a.id)!
    expect(usePlanStore.getState().shopping[MONDAY].extras).toEqual([b])
    s.restoreExtra(MONDAY, removed)
    s.restoreExtra(MONDAY, removed)
    expect(usePlanStore.getState().shopping[MONDAY].extras.map((e) => e.text)).toEqual(['Diskmedel', 'Kaffefilter'])
  })

  it('har ett tak för egna rader', () => {
    const { addExtra } = usePlanStore.getState()
    for (let i = 0; i < MAX_EXTRAS_PER_WEEK; i++) addExtra(MONDAY, `Vara ${i}`)
    expect(addExtra(MONDAY, 'En till')).toBeNull()
  })

  it('raderar allt med clearPlan', () => {
    usePlanStore.getState().addItem(recipeDraft())
    usePlanStore.getState().addExtra(MONDAY, 'Mjöl')
    usePlanStore.getState().clearPlan()
    expect(usePlanStore.getState()).toMatchObject({ items: {}, shopping: {} })
  })
})

describe('lagring', () => {
  it('sparar under nyckeln lagom-plan med version', async () => {
    const item = usePlanStore.getState().addItem(recipeDraft())!
    await waitFor(async () => {
      const raw = await get<string>(PLAN_STORE_KEY)
      expect(raw).toBeTruthy()
      const parsed = JSON.parse(raw as string) as { state: Record<string, unknown>; version: number }
      expect(parsed.version).toBe(PLAN_PERSIST_VERSION)
      expect(Object.keys(parsed.state).sort()).toEqual(['items', 'shopping'])
      expect(parsed.state.items).toEqual({ [MONDAY]: [item] })
    })
  })

  it('läser in skadad data utan att krascha och hoppar över trasiga rader', async () => {
    const good = { id: 'p_ok', date: MONDAY, meal: 'middag', createdAt: 1, kind: 'recipe', recipeId: 'r_1', name: 'Gryta', servings: 2, eat: 1 }
    await set(
      PLAN_STORE_KEY,
      JSON.stringify({
        state: { items: { [MONDAY]: [good, { kind: 'food', id: 'trasig' }, 'skräp'], 'inte-datum': [good] }, shopping: 'fel' },
        version: PLAN_PERSIST_VERSION,
      }),
    )
    await usePlanStore.persist.rehydrate()
    expect(usePlanStore.getState().items).toEqual({ [MONDAY]: [good] })
    expect(usePlanStore.getState().shopping).toEqual({})
    await del(PLAN_STORE_KEY)
  })
})
