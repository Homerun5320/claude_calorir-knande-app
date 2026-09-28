import { describe, expect, it } from 'vitest'
import { gramsFor, formatAmount } from '../lib/units'
import { nutrientsForGrams, NUTRIENT_KEYS } from '../lib/nutrients'
import {
  SUPPLEMENT_LIMIT_NOTE,
  SUPPLEMENT_TEMPLATES,
  isSupplementFood,
  nutrientListText,
  overUpperLimit,
  supplementAmounts,
  supplementFood,
  supplementName,
  supplementTemplate,
} from './supplements'

const tmpl = (id: string) => {
  const t = supplementTemplate(id)
  if (!t) throw new Error(`Mallen ${id} saknas`)
  return t
}

describe('SUPPLEMENT_TEMPLATES', () => {
  it('har mallarna för D-vitamin, B12, folsyra, järn, jod, omega-3 och multivitamin', () => {
    expect(SUPPLEMENT_TEMPLATES.map((t) => t.id)).toEqual(['d-vitamin', 'b12', 'folsyra', 'jarn', 'jod', 'omega-3', 'multivitamin'])
    for (const t of SUPPLEMENT_TEMPLATES) {
      expect(t.nutrients.length).toBeGreaterThan(0)
      for (const n of t.nutrients) {
        expect(NUTRIENT_KEYS).toContain(n.key)
        expect(n.amount).toBeGreaterThan(0)
      }
      expect(t.note).toMatch(/\.$/)
    }
  })

  it('har förvalda styrkor enligt Livsmedelsverket', () => {
    expect(tmpl('d-vitamin').nutrients[0]).toEqual({ key: 'vitD', amount: 10 })
    expect(tmpl('b12').nutrients[0]).toEqual({ key: 'vitB12', amount: 25 })
    expect(tmpl('b12').note).toMatch(/För dig som äter veganskt: minst 4 µg per dag enligt Livsmedelsverket/)
    expect(tmpl('folsyra').nutrients[0]).toEqual({ key: 'folate', amount: 400 })
    expect(supplementTemplate('finns-inte')).toBeUndefined()
  })
})

describe('supplementFood', () => {
  it('skapar ett eget livsmedel med portionen "1 tablett", energi 0 och okända övriga ämnen', () => {
    const f = supplementFood(tmpl('d-vitamin'), 20, { id: 'custom:test', now: 5 })
    expect(f).toMatchObject({ id: 'custom:test', name: 'D-vitamin 20 µg', source: 'custom', category: 'kosttillskott', createdAt: 5 })
    expect(f.portions).toEqual([{ id: 'tablett', label: '1 tablett', grams: 1 }])
    expect(f.nutrients.kcal).toBe(0)
    // Okända värden är undefined – inte 0.
    expect(f.nutrients.protein).toBeUndefined()
    expect(f.nutrients.vitB12).toBeUndefined()
    // En tablett ger styrkan.
    const grams = gramsFor(f, 1, 'portion:tablett')
    expect(grams).toBe(1)
    expect(nutrientsForGrams(f.nutrients, grams).vitD).toBeCloseTo(20)
    expect(formatAmount(f, 1, 'portion:tablett')).toMatch(/1 tablett/)
    expect(isSupplementFood(f)).toBe(true)
  })

  it('använder den förvalda styrkan och kapslar för omega-3', () => {
    const f = supplementFood(tmpl('omega-3'))
    expect(f.id).toMatch(/^custom:/)
    expect(f.name).toBe('Omega-3 0,3 g')
    expect(f.portions[0]).toEqual({ id: 'kapsel', label: '1 kapsel', grams: 1 })
    expect(nutrientsForGrams(f.nutrients, 1).omega3).toBeCloseTo(0.3)
  })

  it('tar egna mängder per näringsämne för multivitamin och hoppar över ogiltiga', () => {
    const t = tmpl('multivitamin')
    const amounts = supplementAmounts(t, { vitD: 20, iron: Number.NaN })
    expect(amounts.vitD).toBe(20)
    expect(amounts.iron).toBe(7) // förvalt värde när det inmatade är ogiltigt
    expect(supplementName(t)).toBe('Multivitamin')
    const f = supplementFood(t, { vitD: 20 }, { name: '  Min multi  ' })
    expect(f.name).toBe('Min multi')
    expect(nutrientsForGrams(f.nutrients, 1).vitD).toBeCloseTo(20)
    expect(f.nutrients.vitA).toBeUndefined()
  })
})

describe('övre gränser', () => {
  it('flaggar mängder över gränsen i NNR – utan röda ord', () => {
    expect(overUpperLimit({ vitD: 100 })).toEqual([])
    expect(overUpperLimit({ vitD: 125, iron: 100, vitB12: 1000 })).toEqual(['vitD', 'iron'])
    expect(SUPPLEMENT_LIMIT_NOTE).toBe('Stäm av doseringen med apoteket eller vården.')
  })

  it('räknar upp näringsämnena på svenska', () => {
    expect(nutrientListText([])).toBe('')
    expect(nutrientListText(['vitD'])).toBe('vitamin D')
    expect(nutrientListText(['vitD', 'iron'])).toBe('vitamin D och järn')
    expect(nutrientListText(['vitD', 'iron', 'zinc'])).toBe('vitamin D, järn och zink')
  })

  it('är inte kosttillskott för inbyggda livsmedel eller andra kategorier', () => {
    expect(isSupplementFood({ id: 'lagom:proteinpulver', source: 'lagom', category: 'kosttillskott' })).toBe(false)
    expect(isSupplementFood({ id: 'custom:abc', source: 'custom', category: 'ovrigt' })).toBe(false)
  })
})
