/**
 * Kvalitetskontroll av den inbyggda livsmedelsdatabasen.
 * Kör: npx vitest run src/data/foods
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_FOOD_FILES, BUILTIN_FOODS } from './index'
import { kcalFromMacros } from '../../lib/nutrients'
import { foodKostrad } from '../../lib/kostrad'
import { FOOD_CATEGORIES, type Food } from '../../types'

const problems = (food: Food): string[] => {
  const n = food.nutrients
  const out: string[] = []
  const kcal = n.kcal ?? NaN
  const calc = kcalFromMacros(n)
  // Atwater-kontroll: angiven energi ska stämma med makronäringsämnena (±12 % eller ±12 kcal).
  if (!(Math.abs(kcal - calc) <= Math.max(12, kcal * 0.12))) {
    out.push(`energi ${kcal} kcal stämmer inte med makron (${calc.toFixed(0)} kcal)`)
  }
  const nonNeg = Object.entries(n).filter(([, v]) => v !== undefined && (v < 0 || !Number.isFinite(v)))
  if (nonNeg.length) out.push(`negativa/ogiltiga värden: ${nonNeg.map(([k]) => k).join(', ')}`)
  const macroSum = (n.protein ?? 0) + (n.carbs ?? 0) + (n.fat ?? 0) + (n.fiber ?? 0) + (n.alcohol ?? 0) + (n.salt ?? 0)
  if (macroSum > 101) out.push(`makrosumma ${macroSum.toFixed(1)} g > 100 g`)
  if (n.sugars !== undefined && n.carbs !== undefined && n.sugars > n.carbs + 0.6) out.push(`socker ${n.sugars} > kolhydrater ${n.carbs}`)
  if (n.addedSugar !== undefined && n.sugars !== undefined && n.addedSugar > n.sugars + 0.6) out.push(`tillsatt socker > sockerarter`)
  const fa = (n.satFat ?? 0) + (n.monoFat ?? 0) + (n.polyFat ?? 0)
  if (n.fat !== undefined && fa > n.fat + 0.6) out.push(`fettsyror ${fa.toFixed(1)} > fett ${n.fat}`)
  if (n.omega3 !== undefined && n.polyFat !== undefined && n.omega3 > n.polyFat + 0.3) out.push(`omega-3 > fleromättat`)
  if (n.wholegrain !== undefined && n.wholegrain > 100) out.push('fullkorn > 100 g')
  if ((n.salt ?? 0) > 40 && food.category !== 'sas_krydda') out.push(`orimligt mycket salt ${n.salt}`)
  // Mikronäringsämnen – grova rimlighetsgränser per 100 g
  const LIMITS: Partial<Record<keyof typeof n, number>> = {
    vitA: 30000, vitD: 60, vitE: 150, vitK: 1500, vitC: 700, thiamin: 30, riboflavin: 30, niacin: 100, vitB6: 30,
    folate: 3000, vitB12: 100, calcium: 3000, iron: 60, magnesium: 1000, potassium: 5000, sodium: 40000,
    phosphorus: 3000, zinc: 80, selenium: 300, iodine: 3000, caffeine: 5000, cholesterol: 3000,
  }
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = n[k as keyof typeof n]
    if (v !== undefined && v > (max as number)) out.push(`${k} ${v} verkar orimligt högt`)
  }
  if (!FOOD_CATEGORIES.includes(food.category)) out.push(`okänd kategori ${food.category}`)
  for (const p of food.portions) {
    if (!(p.grams > 0 && p.grams < 5000)) out.push(`portion ${p.label} har orimlig vikt ${p.grams}`)
    if (!p.label.trim()) out.push('portion utan etikett')
  }
  if (new Set(food.portions.map((p) => p.id)).size !== food.portions.length) out.push('dubbla portion-id')
  if (food.density !== undefined && !(food.density > 0.05 && food.density < 2.5)) out.push(`orimlig densitet ${food.density}`)
  if (food.liquid && food.category !== 'mejeri' && food.density === undefined && (n.fat ?? 0) > 30) out.push('flytande men mycket fett – ange densitet')
  if (!/^lagom:[a-z0-9-]+$/.test(food.id)) out.push(`ogiltigt id ${food.id}`)
  if (!food.name.trim() || food.name !== food.name.trim()) out.push('namn saknas eller har blanksteg i kanterna')
  if (food.plate) {
    const s = food.plate.veg + food.plate.carb + food.plate.protein
    if (s > 1.001) out.push('plate-andelar summerar > 1')
  }
  // Tillagat som standard: omräkningen från rå/okokt vikt ska vara rimlig och namnet ska inte säga "rå".
  const rw = food.rawWeight
  if (rw) {
    // Upp till ca 5 för polenta (1 del majsgryn + 4 delar vatten).
    if (!(rw.factor >= 0.3 && rw.factor <= 6)) out.push(`orimlig rå-faktor ${rw.factor} (gram tillagat per gram rått, 0,3–6)`)
    if (!['ra', 'okokt', 'torkad', 'fryst'].includes(rw.kind)) out.push(`okänt rå-slag ${rw.kind}`)
    if (rw.density !== undefined && !(rw.density > 0.1 && rw.density < 1.5)) out.push(`orimlig densitet för okokt vara ${rw.density}`)
    if (/(^|\s|,)(rå|råa|okokt|okokta)(\s|,|$)/i.test(food.name)) out.push('rawWeight anges på den tillagade raden – namnet ska inte säga rå/okokt')
  }
  // Samlingsvärden: genomsnitt av flera märken – inget varumärke, och förklaringen står i note.
  if (food.isAverage) {
    if (food.brand) out.push('samlingsvärde (avg) ska inte ha brand')
    if (!food.note?.includes('Samlingsvärde')) out.push('samlingsvärde (avg) behöver note som börjar med "Samlingsvärde: …"')
  }
  return out
}

describe('inbyggd livsmedelsdatabas', () => {
  it('består av de registrerade datafilerna, i samma ordning', () => {
    expect(Object.keys(BUILTIN_FOOD_FILES)).toEqual([
      'mejeri-agg',
      'brod-spannmal',
      'kott-fagel-chark',
      'fisk-skaldjur',
      'frukt-gronsaker',
      'fika-sotsaker-snacks',
      'drycker',
      'fett-sas-notter-vego',
      'fardigratter-snabbmat',
      'restauranger',
    ])
    expect(BUILTIN_FOODS.map((f) => f.id)).toEqual(Object.values(BUILTIN_FOOD_FILES).flatMap((foods) => foods.map((f) => f.id)))
  })

  it('har unika id:n', () => {
    const seen = new Map<string, number>()
    for (const f of BUILTIN_FOODS) seen.set(f.id, (seen.get(f.id) ?? 0) + 1)
    const dups = [...seen].filter(([, c]) => c > 1).map(([id]) => id)
    expect(dups).toEqual([])
  })

  it('har unika namn (inom samma varumärke)', () => {
    const seen = new Map<string, number>()
    for (const f of BUILTIN_FOODS) {
      const key = `${f.brand ?? ''}|${f.name.toLowerCase()}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    expect([...seen].filter(([, c]) => c > 1).map(([k]) => k)).toEqual([])
  })

  for (const [file, foods] of Object.entries(BUILTIN_FOOD_FILES)) {
    it(`${file}: alla livsmedel är rimliga`, () => {
      const bad = foods.map((f) => ({ id: f.id, problems: problems(f) })).filter((x) => x.problems.length)
      expect(bad).toEqual([])
    })
  }

  /**
   * Kostråden 2025: baljväxter är ett eget råd och ingår inte i frukt och grönt. Sammansatta rätter
   * med bönor, linser, gula ärtor, kikärtor, falafel, hummus eller soja anger därför sin andel
   * baljväxter i `kostrad` – frukt och grönt är bara grönsaksdelen.
   */
  it('har baljväxtandelen i kostrådsdatan för rätter med baljväxter', () => {
    const LEGUMES = /ärtsoppa|lins|bön|kikärt|falafel|hummus|tofu|edamame|soja-|sojabön|sojaprotein|ärtprotein/
    const NOT_LEGUME = /gröna bönor|haricots|brytbön|sockerärt|gröna ärtor|böngrodd|sojasås/
    const dishes = BUILTIN_FOODS.filter((f) => f.kostrad && (f.category === 'fardigratt' || f.category === 'snabbmat'))
    const legumeDishes = dishes.filter((f) => {
      const text = `${f.name} ${f.note ?? ''}`.toLowerCase().replace(NOT_LEGUME, '')
      return LEGUMES.test(text)
    })
    expect(legumeDishes.map((f) => f.id)).toEqual(
      expect.arrayContaining(['lagom:artsoppa-med-flask', 'lagom:chili-con-carne', 'lagom:dal-linsgryta', 'lagom:falafeltallrik', 'lagom:bonchili']),
    )
    const missing = legumeDishes.filter((f) => !(f.kostrad?.baljvaxter && f.kostrad.baljvaxter > 0)).map((f) => f.id)
    expect(missing).toEqual([])
    for (const f of legumeDishes) {
      // Grönsaksdelen i kostråden och på tallriken ska hänga ihop (±5 g per 100 g).
      if (f.plate && f.kostrad?.fruktGront !== undefined) expect(Math.abs(f.kostrad.fruktGront - f.plate.veg * 100)).toBeLessThanOrEqual(5)
      expect(foodKostrad(f)).toEqual(f.kostrad)
    }
    // Rätter med gröna ärtor räknar dem som grönsaker.
    const wallenbergare = BUILTIN_FOODS.find((f) => f.id === 'lagom:wallenbergare-potatismos-arter')
    expect(wallenbergare?.kostrad?.baljvaxter).toBeUndefined()
  })
})
