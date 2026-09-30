import { describe, expect, it } from 'vitest'
import type { DiaryEntry, Food, FoodCategory, FoodEntry, Nutrients, QuickEntry } from '../types'
import { NUTRIENTS } from './nutrients'
import {
  AGE_BANDS,
  LOW_THRESHOLD,
  REFERENCE_KCAL,
  STATUS_LABELS,
  ageBand,
  isAdultReference,
  nutrientStatus,
  nutrientsToWatch,
  percentOfReference,
  periodAverages,
  referenceIntakes,
  type NutrientStatus,
  type ReferenceValue,
} from './nnr'

// ---------------------------------------------------------------------------
// Fixturer
// ---------------------------------------------------------------------------

let seq = 0
function food(name: string, category: FoodCategory, nutrients: Nutrients): Food {
  return { id: `test:${name}`, name, source: 'custom', category, nutrients, portions: [] }
}
function entry(f: Food, grams: number, date: string): FoodEntry {
  return { id: `e${++seq}`, kind: 'food', food: f, amount: grams, unit: 'g', grams, date, meal: 'lunch', createdAt: 0 }
}
function quick(nutrients: Nutrients, date: string): QuickEntry {
  return { id: `q${++seq}`, kind: 'quick', name: 'Snabbpost', nutrients, date, meal: 'middag', createdAt: 0 }
}

const woman30 = { sex: 'kvinna' as const, age: 30, lifeStage: 'ingen' as const }
const man30 = { sex: 'man' as const, age: 30, lifeStage: 'ingen' as const }

// ---------------------------------------------------------------------------
// Åldersgrupper
// ---------------------------------------------------------------------------

describe('ageBand', () => {
  it('delar in vuxna i Lagoms åldersgrupper', () => {
    expect(ageBand(18)).toBe('18–24')
    expect(ageBand(24)).toBe('18–24')
    expect(ageBand(25)).toBe('25–50')
    expect(ageBand(50)).toBe('25–50')
    expect(ageBand(51)).toBe('51–64')
    expect(ageBand(64)).toBe('51–64')
    expect(ageBand(65)).toBe('65–74')
    expect(ageBand(74)).toBe('65–74')
    expect(ageBand(75)).toBe('75+')
    expect(ageBand(99)).toBe('75+')
    expect(AGE_BANDS).toHaveLength(5)
  })

  it('markerar att värdena gäller vuxna', () => {
    expect(isAdultReference(17)).toBe(false)
    expect(isAdultReference(18)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Referensvärden
// ---------------------------------------------------------------------------

describe('referenceIntakes', () => {
  it('ger NNR 2023-värden för en kvinna 30 år', () => {
    const r = referenceIntakes(woman30)
    expect(r.vitD?.ri).toBe(10)
    expect(r.vitD?.ul).toBe(100)
    expect(r.iron?.ri).toBe(15)
    expect(r.calcium?.ri).toBe(950)
    expect(r.folate?.ri).toBe(330)
    expect(r.vitB12?.ri).toBe(4)
    expect(r.vitC?.ri).toBe(95)
    expect(r.vitA?.ri).toBe(700)
    expect(r.vitE?.ri).toBe(10)
    expect(r.vitK?.ri).toBe(65)
    expect(r.thiamin?.ri).toBe(0.9)
    expect(r.riboflavin?.ri).toBe(1.6)
    expect(r.niacin?.ri).toBe(14)
    expect(r.vitB6?.ri).toBe(1.4)
    expect(r.iodine?.ri).toBe(150)
    expect(r.selenium?.ri).toBe(75)
    expect(r.zinc?.ri).toBe(10)
    expect(r.magnesium?.ri).toBe(300)
    expect(r.potassium?.ri).toBe(3500)
    expect(r.phosphorus?.ri).toBe(520)
    expect(r.fiber?.ri).toBe(25)
    expect(r.wholegrain?.ri).toBe(90)
  })

  it('ger NNR 2023-värden för en man 30 år', () => {
    const r = referenceIntakes(man30)
    expect(r.iron?.ri).toBe(9)
    expect(r.fiber?.ri).toBe(35)
    expect(r.vitC?.ri).toBe(110)
    expect(r.vitA?.ri).toBe(800)
    expect(r.vitE?.ri).toBe(11)
    expect(r.vitK?.ri).toBe(75)
    expect(r.thiamin?.ri).toBe(1.1)
    expect(r.niacin?.ri).toBe(18)
    expect(r.vitB6?.ri).toBe(1.6)
    expect(r.zinc?.ri).toBe(13)
    expect(r.selenium?.ri).toBe(90)
    expect(r.magnesium?.ri).toBe(350)
    // Fullkorn är 90 g för alla vuxna sedan kostråden 2025.
    expect(r.wholegrain?.ri).toBe(90)
  })

  it('har max- och UL-värden', () => {
    const r = referenceIntakes(woman30)
    expect(r.salt).toMatchObject({ kind: 'max', max: 6 })
    expect(r.sodium).toMatchObject({ kind: 'max', max: 2300 })
    expect(r.caffeine).toMatchObject({ kind: 'max', max: 400 })
    expect(r.alcohol).toMatchObject({ kind: 'max', max: 0 })
    expect(r.calcium?.ul).toBe(2500)
    expect(r.iron?.ul).toBe(40)
    expect(r.zinc?.ul).toBe(25)
    expect(r.selenium?.ul).toBe(255)
    expect(r.iodine?.ul).toBe(600)
    expect(r.vitB6?.ul).toBe(12)
    expect(r.vitE?.ul).toBe(300)
    // UL för folsyra, magnesium och retinol gäller tillskott/förformat retinol – inte totalt intag.
    expect(r.folate?.ul).toBeUndefined()
    expect(r.magnesium?.ul).toBeUndefined()
    expect(r.vitA?.ul).toBeUndefined()
  })

  it('ändrar värden efter ålder', () => {
    expect(referenceIntakes({ ...woman30, age: 20 }).calcium?.ri).toBe(1000)
    expect(referenceIntakes({ ...woman30, age: 25 }).calcium?.ri).toBe(950)
    expect(referenceIntakes({ ...woman30, age: 55 }).iron?.ri).toBe(9)
    expect(referenceIntakes({ ...woman30, age: 74 }).vitD?.ri).toBe(10)
    expect(referenceIntakes({ ...woman30, age: 75 }).vitD?.ri).toBe(20)
    expect(referenceIntakes({ ...man30, age: 80 }).vitD?.ri).toBe(20)
  })

  it('behandlar personer under 18 som 18–24 år', () => {
    expect(referenceIntakes({ ...woman30, age: 16 }).calcium?.ri).toBe(1000)
  })

  it('räknar protein från kroppsvikt (0,83 g/kg, 1,2 g/kg från 65 år)', () => {
    expect(referenceIntakes({ ...woman30, weightKg: 70 }).protein?.ri).toBe(58)
    expect(referenceIntakes({ ...man30, age: 70, weightKg: 70 }).protein?.ri).toBe(84)
    expect(referenceIntakes(woman30).protein).toBeUndefined()
  })

  it('ger värden för graviditet', () => {
    const r = referenceIntakes({ ...woman30, lifeStage: 'gravid', weightKg: 70 })
    expect(r.folate).toMatchObject({ ri: 600, kind: 'ai' })
    expect(r.vitC?.ri).toBe(105)
    expect(r.vitB12?.ri).toBe(4.5)
    expect(r.iodine?.ri).toBe(200)
    expect(r.vitA?.ri).toBe(800)
    expect(r.caffeine?.max).toBe(200)
    expect(r.protein?.ri).toBe(67) // 58,1 + 9
    expect(r.alcohol?.note).toMatch(/avstå/i)
    expect(r.vitA?.note).toMatch(/lever/i)
    // Leverpastej går bra enligt Livsmedelsverket – bara lever och leverrätter ska undvikas.
    expect(r.vitA?.note).toMatch(/leverpastej och leverkorv går bra/)
  })

  it('ger värden för amning', () => {
    const r = referenceIntakes({ ...woman30, lifeStage: 'ammar' })
    expect(r.folate?.ri).toBe(500)
    expect(r.vitC?.ri).toBe(155)
    expect(r.vitB12?.ri).toBe(5.5)
    expect(r.vitA?.ri).toBe(1100)
    expect(r.iodine?.ri).toBe(200)
    expect(r.selenium?.ri).toBe(85)
    expect(r.caffeine?.max).toBe(200)
  })

  it('behåller järnbehovet 15 mg för gravida även efter 50', () => {
    expect(referenceIntakes({ ...woman30, age: 52, lifeStage: 'gravid' }).iron?.ri).toBe(15)
  })

  it('ignorerar livsstadium för män', () => {
    const r = referenceIntakes({ ...man30, lifeStage: 'gravid' })
    expect(r.vitC?.ri).toBe(110)
    expect(r.caffeine?.max).toBe(400)
  })

  it('räknar E%-värden från energin', () => {
    const r = referenceIntakes({ ...woman30, kcal: 2000 })
    expect(r.satFat?.max).toBeCloseTo(22.2, 1)
    expect(r.addedSugar?.max).toBe(50)
    expect(r.omega3?.ri).toBeCloseTo(2.22, 2)
    expect(r.polyFat?.ri).toBeCloseTo(11.1, 1)
    expect(r.polyFat?.max).toBeCloseTo(22.2, 1)
    expect(r.monoFat?.ri).toBeCloseTo(22.2, 1)
    expect(r.monoFat?.max).toBeCloseTo(44.4, 1)
  })

  it('använder NNR:s referensenergi när energi saknas', () => {
    expect(REFERENCE_KCAL).toEqual({ kvinna: 2150, man: 2700 })
    expect(referenceIntakes(woman30).addedSugar?.max).toBeCloseTo(53.8, 1)
    expect(referenceIntakes(man30).satFat?.max).toBeCloseTo(30, 1)
    expect(referenceIntakes({ ...man30, kcal: 0 }).satFat?.max).toBeCloseTo(30, 1)
  })

  it('har korrekt nyckel, enhet, källa och svensk förklaring för varje värde', () => {
    for (const profile of [woman30, man30, { ...woman30, lifeStage: 'gravid' as const, weightKg: 65 }]) {
      const r = referenceIntakes(profile)
      for (const [key, ref] of Object.entries(r)) {
        expect(ref.key).toBe(key)
        expect(ref.unit).toBe(NUTRIENTS[ref.key].unit)
        expect(ref.source.length).toBeGreaterThan(0)
        expect(ref.note?.length ?? 0).toBeGreaterThan(0)
        expect(ref.ri !== undefined || ref.max !== undefined).toBe(true)
        if (ref.ri !== undefined) expect(ref.ri).toBeGreaterThan(0)
        if (ref.ul !== undefined && ref.ri !== undefined) expect(ref.ul).toBeGreaterThan(ref.ri)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Status och procent
// ---------------------------------------------------------------------------

describe('nutrientStatus', () => {
  const ri: ReferenceValue = { key: 'iron', ri: 10, ul: 40, unit: 'mg', kind: 'ri', source: 'test' }
  const salt: ReferenceValue = { key: 'salt', max: 6, unit: 'g', kind: 'max', source: 'test' }
  const range: ReferenceValue = { key: 'polyFat', ri: 10, max: 20, unit: 'g', kind: 'ri', source: 'test' }
  const alcohol: ReferenceValue = { key: 'alcohol', max: 0, unit: 'g', kind: 'max', source: 'test' }

  it('är okänt utan värde eller referens', () => {
    expect(nutrientStatus(undefined, ri)).toBe('okant')
    expect(nutrientStatus(5, undefined)).toBe('okant')
    expect(nutrientStatus(Number.NaN, ri)).toBe('okant')
  })

  it('graderar mot RI', () => {
    expect(nutrientStatus(0, ri)).toBe('lagt')
    expect(nutrientStatus(7.9, ri)).toBe('lagt')
    expect(nutrientStatus(10 * LOW_THRESHOLD, ri)).toBe('nara')
    expect(nutrientStatus(9.99, ri)).toBe('nara')
    expect(nutrientStatus(10, ri)).toBe('uppnatt')
    expect(nutrientStatus(40, ri)).toBe('uppnatt')
    expect(nutrientStatus(40.1, ri)).toBe('over_ul')
  })

  it('hanterar maxvärden', () => {
    expect(nutrientStatus(5, salt)).toBe('uppnatt')
    expect(nutrientStatus(6, salt)).toBe('uppnatt')
    expect(nutrientStatus(6.5, salt)).toBe('over_max')
    expect(nutrientStatus(0, alcohol)).toBe('uppnatt')
    expect(nutrientStatus(12, alcohol)).toBe('over_max')
  })

  it('hanterar intervall (RI + max)', () => {
    expect(nutrientStatus(5, range)).toBe('lagt')
    expect(nutrientStatus(15, range)).toBe('uppnatt')
    expect(nutrientStatus(25, range)).toBe('over_max')
  })

  it('har svenska etiketter och designtokens för alla statusar', () => {
    const all: NutrientStatus[] = ['okant', 'lagt', 'nara', 'uppnatt', 'over_max', 'over_ul']
    for (const s of all) {
      expect(STATUS_LABELS[s].label.length).toBeGreaterThan(0)
      expect(['mossa', 'sol', 'hjortron', 'lingon', 'ink-3']).toContain(STATUS_LABELS[s].tone)
    }
    expect(STATUS_LABELS.uppnatt.tone).toBe('mossa')
    expect(STATUS_LABELS.lagt.tone).toBe('hjortron')
    expect(STATUS_LABELS.over_ul.tone).toBe('lingon')
    expect(STATUS_LABELS.lagt.label).toBe('Lågt')
  })
})

describe('percentOfReference', () => {
  it('räknar procent av RI eller max', () => {
    const ri: ReferenceValue = { key: 'vitD', ri: 10, unit: 'µg', kind: 'ri', source: 'test' }
    const salt: ReferenceValue = { key: 'salt', max: 6, unit: 'g', kind: 'max', source: 'test' }
    expect(percentOfReference(5, ri)).toBe(50)
    expect(percentOfReference(15, ri)).toBe(150)
    expect(percentOfReference(3, salt)).toBe(50)
  })

  it('är odefinierat utan jämförelsevärde', () => {
    const alcohol: ReferenceValue = { key: 'alcohol', max: 0, unit: 'g', kind: 'max', source: 'test' }
    expect(percentOfReference(12, alcohol)).toBeUndefined()
    expect(percentOfReference(undefined, alcohol)).toBeUndefined()
    expect(percentOfReference(5, undefined)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------

describe('periodAverages', () => {
  const lax = food('Lax', 'fisk', { kcal: 200, protein: 20, vitD: 10, sodium: 400 })
  const brod = food('Bröd', 'brod', { kcal: 250, protein: 8, salt: 1 })

  it('räknar snitt över loggade dagar och hoppar över tomma dagar', () => {
    const byDate: Record<string, DiaryEntry[]> = {
      '2026-09-21': [entry(lax, 100, '2026-09-21')],
      '2026-09-22': [entry(lax, 200, '2026-09-22')],
      '2026-09-23': [],
    }
    const r = periodAverages(byDate, ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'])
    expect(r.loggedDays).toBe(2)
    expect(r.averages.vitD).toBeCloseTo(15)
    expect(r.averages.kcal).toBeCloseTo(300)
    // Salt härleds från natrium: 400 mg/100 g × 3 = 1 200 mg → 3 g salt totalt → 1,5 g/dag.
    expect(r.averages.salt).toBeCloseTo(1.5)
    expect(r.coverage.vitD).toBe(1)
  })

  it('räknar täckningsgrad som andel av energin där värdet är känt', () => {
    const byDate = { '2026-09-21': [entry(lax, 100, '2026-09-21'), entry(brod, 120, '2026-09-21')] }
    const r = periodAverages(byDate, ['2026-09-21'])
    // Lax 200 kcal med D-vitamin, bröd 300 kcal utan.
    expect(r.coverage.vitD).toBeCloseTo(0.4)
    expect(r.averages.vitD).toBeCloseTo(10)
    expect(r.averages.iron).toBeUndefined()
  })

  it('tar med snabbposter och räknar dubbletter i datumlistan en gång', () => {
    const byDate = { '2026-09-21': [quick({ kcal: 500, iron: 3 }, '2026-09-21')] }
    const r = periodAverages(byDate, ['2026-09-21', '2026-09-21'])
    expect(r.loggedDays).toBe(1)
    expect(r.averages.iron).toBe(3)
  })

  it('ger tomt resultat utan registreringar', () => {
    const r = periodAverages({}, ['2026-09-21'])
    expect(r).toEqual({ averages: {}, loggedDays: 0, coverage: {} })
  })
})

describe('nutrientsToWatch', () => {
  const adequateWoman: Nutrients = {
    vitD: 12,
    iodine: 160,
    iron: 16,
    folate: 400,
    vitB12: 5,
    calcium: 1000,
    selenium: 80,
    zinc: 11,
  }

  it('lyfter järn och folat för kvinnor i fertil ålder när intaget är lågt', () => {
    const items = nutrientsToWatch({ ...woman30, averages: { ...adequateWoman, iron: 8, folate: 200 } })
    const keys = items.map((i) => i.key)
    expect(keys).toContain('iron')
    expect(keys).toContain('folate')
    const iron = items.find((i) => i.key === 'iron')!
    expect(iron.status).toBe('lagt')
    expect(iron.percent).toBeCloseTo((8 / 15) * 100)
    expect(iron.reason).toMatch(/järn/i)
  })

  it('tar inte med ämnen som uppnås', () => {
    const items = nutrientsToWatch({ ...woman30, averages: adequateWoman })
    expect(items.map((i) => i.key)).not.toContain('iron')
    expect(items.map((i) => i.key)).not.toContain('vitD')
  })

  it('tar alltid med B12 vid vegankost', () => {
    const items = nutrientsToWatch({ ...man30, diet: 'vegan', averages: { vitB12: 10 } })
    const b12 = items.find((i) => i.key === 'vitB12')
    expect(b12).toBeDefined()
    expect(b12!.priority).toBe(1)
    expect(b12!.reason).toMatch(/tillskott/i)
    expect(items[0].priority).toBe(1)
  })

  it('lyfter inte järn för män med lågt men okänt värde', () => {
    const items = nutrientsToWatch({ ...man30, averages: {} })
    expect(items.map((i) => i.key)).not.toContain('iron')
    // D-vitamin och jod är generellt viktiga i Sverige och visas som okända.
    const vitD = items.find((i) => i.key === 'vitD')
    expect(vitD?.status).toBe('okant')
  })

  it('visar osäkra låga värden som okända', () => {
    const items = nutrientsToWatch({ ...woman30, averages: { vitD: 2 }, coverage: { vitD: 0.2 } })
    const vitD = items.find((i) => i.key === 'vitD')
    expect(vitD?.status).toBe('okant')
    expect(vitD?.reason).toMatch(/saknar värde/)
  })

  it('lyfter intag över UL med högsta prioritet', () => {
    const items = nutrientsToWatch({ ...man30, averages: { vitD: 150 } })
    expect(items[0]).toMatchObject({ key: 'vitD', status: 'over_ul', priority: 1 })
  })

  it('lyfter andra tydligt låga ämnen med lägre prioritet', () => {
    const items = nutrientsToWatch({ ...man30, averages: { vitC: 30, vitD: 12, iodine: 200 }, coverage: { vitC: 0.9 } })
    const c = items.find((i) => i.key === 'vitC')
    expect(c).toMatchObject({ status: 'lagt', priority: 3 })
    expect(c!.reason).toMatch(/vitamin c/i)
  })

  it('flaggar inte ämnen med adekvat intag (AI) som låga', () => {
    // Under AI går inte att tolka som för lite (NNR 2023) – kalium, magnesium och vitamin E ska inte bli "Lågt".
    const items = nutrientsToWatch({
      ...man30,
      averages: { potassium: 1500, magnesium: 150, vitE: 4, vitC: 30 },
      coverage: { potassium: 0.9, magnesium: 0.9, vitE: 0.9, vitC: 0.9 },
    })
    const keys = items.map((i) => i.key)
    expect(keys).not.toContain('potassium')
    expect(keys).not.toContain('magnesium')
    expect(keys).not.toContain('vitE')
    expect(keys).toContain('vitC')
  })

  it('prioriterar D-vitamin från 75 år', () => {
    const items = nutrientsToWatch({ sex: 'man', age: 80, lifeStage: 'ingen', averages: { vitD: 12 } })
    expect(items.find((i) => i.key === 'vitD')).toMatchObject({ status: 'lagt', priority: 1 })
  })

  it('sorterar på prioritet och sedan lägst procent', () => {
    const items = nutrientsToWatch({ ...woman30, diet: 'vegan', averages: { iron: 5, folate: 100, vitD: 2, iodine: 50 } })
    for (let i = 1; i < items.length; i++) {
      expect(items[i].priority).toBeGreaterThanOrEqual(items[i - 1].priority)
    }
  })
})
