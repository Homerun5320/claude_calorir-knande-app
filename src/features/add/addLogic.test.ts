import { describe, expect, it } from 'vitest'
import type { FoodUsage } from '../../stores/foodStore'
import { DEFAULT_MEALS } from '../../stores/profileStore'
import {
  addPageHref,
  barcodeVariants,
  findByBarcode,
  decodeFoodId,
  foodClimateLevel,
  foodDetailHref,
  isISODate,
  itemTotals,
  kostradContributions,
  mealSuggestions,
  newFoodHref,
  novaInfo,
  nutriScoreInfo,
  parseAddParams,
  quickNutrients,
  scanHref,
  sourceMeta,
} from './addLogic'
import { bulle, havregryn, lax, mjolk, unknownEnergy } from './testFoods'

describe('parseAddParams', () => {
  const today = '2026-09-26'
  const morning = new Date(2026, 8, 26, 7, 30)

  it('läser måltid, datum och flik från adressen', () => {
    const p = new URLSearchParams('maltid=middag&datum=2026-09-20&flik=favoriter')
    expect(parseAddParams(p, DEFAULT_MEALS, today, morning)).toEqual({ date: '2026-09-20', meal: 'middag', tab: 'favoriter' })
  })

  it('faller tillbaka på dagens datum, måltid efter klockslag och fliken Senaste', () => {
    const p = new URLSearchParams('maltid=brunch&datum=2026-02-30&flik=okand')
    expect(parseAddParams(p, DEFAULT_MEALS, today, morning)).toEqual({ date: today, meal: 'frukost', tab: 'senaste' })
  })
})

describe('isISODate och decodeFoodId', () => {
  it('godkänner bara riktiga kalenderdagar', () => {
    expect(isISODate('2026-09-26')).toBe(true)
    expect(isISODate('2026-02-29')).toBe(false)
    expect(isISODate('26/9')).toBe(false)
    expect(isISODate(null)).toBe(false)
  })

  it('avkodar id:n från adressen och tål redan avkodade', () => {
    expect(decodeFoodId('lagom%3Akanelbulle')).toBe('lagom:kanelbulle')
    expect(decodeFoodId('lagom:kanelbulle')).toBe('lagom:kanelbulle')
    expect(decodeFoodId('%E0%A4%A')).toBe('%E0%A4%A')
    expect(decodeFoodId(undefined)).toBe('')
  })
})

describe('streckkoder', () => {
  it('hittar livsmedel på streckkod, även UPC-A som EAN-13', () => {
    const foods = [
      { id: 'a', barcode: '7310865000637' },
      { id: 'b', barcode: '012345678905' },
    ]
    expect(findByBarcode(foods, '7310 8650 0063 7')?.id).toBe('a')
    expect(findByBarcode(foods, '0012345678905')?.id).toBe('b')
    expect(findByBarcode(foods, '12345670')).toBeUndefined()
    expect(barcodeVariants('012345678905')).toEqual(['012345678905', '0012345678905'])
  })
})

describe('länkar', () => {
  it('bygger länkar med svenska parametrar', () => {
    expect(addPageHref({ meal: 'lunch', date: '2026-09-26' })).toBe('/lagg-till?maltid=lunch&datum=2026-09-26')
    expect(scanHref({ meal: 'fika' })).toBe('/skanna?maltid=fika')
    expect(foodDetailHref('lagom:kanelbulle', { meal: 'fika' })).toBe('/livsmedel/lagom%3Akanelbulle?maltid=fika')
    expect(newFoodHref({ barcode: '7310865000632' })).toBe('/nytt-livsmedel?streckkod=7310865000632')
    expect(newFoodHref()).toBe('/nytt-livsmedel')
  })
})

describe('itemTotals (korgsummor)', () => {
  it('summerar energi och makron för korgens varor', () => {
    const t = itemTotals([
      { food: bulle, grams: 60 },
      { food: mjolk, grams: 206 },
    ])
    expect(t.count).toBe(2)
    expect(t.grams).toBe(266)
    expect(t.kcal).toBeCloseTo(345 * 0.6 + 46 * 2.06, 5)
    expect(t.nutrients.protein).toBeCloseTo(6.8 * 0.6 + 3.5 * 2.06, 5)
    expect(t.unknownEnergy).toBe(0)
  })

  it('räknar okänd energi som okänd, inte som noll', () => {
    const t = itemTotals([{ food: unknownEnergy, grams: 50 }])
    expect(t.kcal).toBeUndefined()
    expect(t.unknownEnergy).toBe(1)
  })

  it('hoppar över varor utan giltig vikt', () => {
    const t = itemTotals([
      { food: bulle, grams: Number.NaN },
      { food: bulle, grams: 100 },
    ])
    expect(t.kcal).toBe(345)
    expect(t.unknownEnergy).toBe(1)
  })
})

describe('mealSuggestions', () => {
  const now = Date.UTC(2026, 8, 26)
  const day = 86_400_000
  const u = (count: number, meals: FoodUsage['meals'], daysAgo = 1): FoodUsage => ({
    count,
    lastUsed: now - daysAgo * day,
    lastAmount: 1,
    lastUnit: 'g',
    meals,
  })

  it('föreslår det man brukar äta till måltiden, oftast först', () => {
    const usage = {
      'lagom:havregryn': u(10, { frukost: 9, mellanmal: 1 }),
      'lagom:mjolk': u(6, { frukost: 4, lunch: 2 }),
      'lagom:lax': u(5, { middag: 5 }),
      'lagom:kanelbulle': u(1, { frukost: 1 }),
    }
    expect(mealSuggestions(usage, 'frukost', 8, now)).toEqual(['lagom:havregryn', 'lagom:mjolk'])
    expect(mealSuggestions(usage, 'middag', 8, now)).toEqual(['lagom:lax'])
  })

  it('kräver att livsmedlet ätits till måltiden en rimlig andel av gångerna', () => {
    const usage = { 'lagom:mjolk': u(20, { frukost: 2, lunch: 18 }) }
    expect(mealSuggestions(usage, 'frukost', 8, now)).toEqual([])
  })

  it('låter nyligen använda gå före gamla vanor', () => {
    const usage = {
      a: u(4, { fika: 4 }, 200),
      b: u(3, { fika: 3 }, 1),
    }
    expect(mealSuggestions(usage, 'fika', 8, now)[0]).toBe('b')
  })
})

describe('quickNutrients', () => {
  it('lagrar energin i kcal och lämnar tomma makron okända', () => {
    expect(quickNutrients({ energy: 600, protein: 25 }, 'kcal')).toEqual({ kcal: 600, protein: 25 })
  })

  it('räknar om kJ till kcal', () => {
    expect(quickNutrients({ energy: 4184 }, 'kJ')?.kcal).toBeCloseTo(1000, 6)
  })

  it('kräver energi', () => {
    expect(quickNutrients({ energy: undefined, protein: 10 }, 'kcal')).toBeNull()
  })
})

describe('kostradContributions', () => {
  it('visar hur en portion bidrar till fiskrådet', () => {
    const list = kostradContributions(lax, 125)
    expect(list).toHaveLength(1)
    expect(list[0].key).toBe('fisk')
    expect(list[0].grams).toBeCloseTo(125)
    expect(list[0].text).toContain('125 g av 300–450 g i veckan')
  })

  it('räknar fullkorn från näringsvärdet', () => {
    const list = kostradContributions(havregryn, 40)
    expect(list.find((c) => c.key === 'fullkorn')?.grams).toBeCloseTo(40)
  })

  it('ger inget för livsmedel utan koppling till kostråden', () => {
    expect(kostradContributions(bulle, 60)).toEqual([])
    expect(kostradContributions(lax, 0)).toEqual([])
  })
})

describe('etiketter och nivåer', () => {
  it('klassar klimatpåverkan per kg', () => {
    expect(foodClimateLevel(0.8).level).toBe('lag')
    expect(foodClimateLevel(4).level).toBe('medel')
    expect(foodClimateLevel(26).level).toBe('hog')
  })

  it('tolkar Nutri-Score och NOVA', () => {
    expect(nutriScoreInfo('b')).toEqual({ grade: 'B', tone: 'gran' })
    expect(nutriScoreInfo('x')).toBeNull()
    expect(novaInfo(4)?.label).toBe('Ultraprocessat')
    expect(novaInfo(7)).toBeNull()
  })

  it('markerar Open Food Facts som användarbidrag', () => {
    expect(sourceMeta('openfoodfacts').crowdSourced).toBe(true)
    expect(sourceMeta('lagom').crowdSourced).toBe(false)
    expect(sourceMeta('livsmedelsverket').short).toBe('LMV')
  })
})
