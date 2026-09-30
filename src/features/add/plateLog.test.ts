import { describe, expect, it } from 'vitest'
import { BUILTIN_FOODS } from '../../data/foods'
import type { Food } from '../../types'
import { DEFAULT_PLATE, PLATE_CHOICES, SAUCE_CHOICES, estimatePlate, plateFractions, type PlateInput } from './plateLog'

const byId = new Map(BUILTIN_FOODS.map((f) => [f.id, f]))
const resolve = (id: string): Food | undefined => byId.get(id)

const gramsOf = (input: PlateInput) => Object.fromEntries(estimatePlate(input, resolve).items.map((i) => [i.part, i.grams]))

describe('plateLog', () => {
  it('alla val pekar på kurerade livsmedel', () => {
    for (const list of [...Object.values(PLATE_CHOICES), SAUCE_CHOICES]) {
      for (const c of list) expect(byId.has(c.foodId), c.foodId).toBe(true)
    }
  })

  it('en vanlig middagstallrik blir en rimlig portion', () => {
    const input: PlateInput = { ...DEFAULT_PLATE, shares: { veg: 1 / 2, carb: 1 / 3, protein: 1 / 4 } }
    const est = estimatePlate(input, resolve)
    expect(est.items.map((i) => i.food.id)).toEqual(['lagom:gronsaker-frysta', 'lagom:potatis-kokt-skalad', 'lagom:kycklingfile-stekt'])
    expect(gramsOf(input)).toEqual({ veg: 140, carb: 155, protein: 125 })
    const total = est.items.reduce((s, i) => s + i.grams, 0)
    expect(total).toBeGreaterThan(380)
    expect(total).toBeLessThan(480)
    // ±25 %, avrundat till tiotal.
    expect(est.kcal).toBeGreaterThan(350)
    expect(est.kcal).toBeLessThan(550)
    expect(est.kcalLow).toBe(Math.round((est.kcal * 0.75) / 10) * 10)
    expect(est.kcalHigh).toBe(Math.round((est.kcal * 1.25) / 10) * 10)
  })

  it('fyllnadsgraden skalar mängden: lite 0,6 – normal 1 – mycket 1,4', () => {
    const base = { ...DEFAULT_PLATE, shares: { veg: 0, carb: 1 / 2, protein: 0 } }
    expect(gramsOf({ ...base, fill: 'lite' }).carb).toBe(150)
    expect(gramsOf({ ...base, fill: 'normal' }).carb).toBe(250)
    expect(gramsOf({ ...base, fill: 'mycket' }).carb).toBe(350)
  })

  it('tallrikstypen påverkar referensvikten', () => {
    const base = { ...DEFAULT_PLATE, shares: { veg: 0, carb: 1 / 2, protein: 0 } }
    expect(gramsOf({ ...base, plate: 'skal' }).carb).toBeLessThan(gramsOf({ ...base, plate: 'flat' }).carb)
    expect(gramsOf({ ...base, plate: 'djup' }).carb).toBeGreaterThan(gramsOf({ ...base, plate: 'flat' }).carb)
  })

  it('valet inom en del ger olika vikt för samma yta', () => {
    const base: PlateInput = { ...DEFAULT_PLATE, shares: { veg: 1 / 2, carb: 0, protein: 0 } }
    expect(gramsOf({ ...base, choices: { ...base.choices, veg: 'sallad' } }).veg).toBeLessThan(gramsOf({ ...base, choices: { ...base.choices, veg: 'rotfrukter' } }).veg)
  })

  it('sås läggs till i dl', () => {
    const est = estimatePlate({ ...DEFAULT_PLATE, sauce: { id: 'graddsas', dl: 1 } }, resolve)
    const sauce = est.items.find((i) => i.part === 'sauce')
    expect(sauce).toMatchObject({ dl: 1 })
    expect(sauce?.food.id).toBe('lagom:gradsas-brunsas-tillagad')
    expect(sauce?.grams).toBeCloseTo(103, 0)
    const without = estimatePlate(DEFAULT_PLATE, resolve)
    expect(est.kcal).toBeGreaterThan(without.kcal)
  })

  it('andelar över en hel tallrik skalas ned, tomma delar hoppas över', () => {
    expect(plateFractions({ veg: 1 / 2, carb: 1 / 2, protein: 1 / 2 })).toEqual({ veg: 1 / 3, carb: 1 / 3, protein: 1 / 3 })
    expect(plateFractions({ veg: 0.25, carb: 0.25, protein: 0 })).toEqual({ veg: 0.25, carb: 0.25, protein: 0 })
    const est = estimatePlate({ ...DEFAULT_PLATE, shares: { veg: 0, carb: 0, protein: 0 } }, resolve)
    expect(est.items).toEqual([])
    expect(est).toMatchObject({ kcal: 0, kcalLow: 0, kcalHigh: 0 })
  })

  it('livsmedel som saknas hoppas över i stället för att krascha', () => {
    const est = estimatePlate(DEFAULT_PLATE, () => undefined)
    expect(est.items).toEqual([])
  })
})
