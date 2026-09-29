/**
 * Tolken för näringsdeklarationer som text. Etiketterna är påhittade men följer hur riktiga
 * förpackningar ser ut – och hur texten blir när telefonens textigenkänning läser av dem.
 */
import { describe, expect, it } from 'vitest'
import { LABEL_NUTRIENTS, labelValueCount, parseNutritionLabel, type NutritionLabelResult } from './nutritionLabel'

/** De vanliga värdena i många av exemplen (en müslibar-liknande produkt per 100 g). */
const BASE = { kcal: 370, fat: 12, satFat: 3.5, carbs: 55, sugars: 20, fiber: 6, protein: 8, salt: 0.5 }

function per100(r: NutritionLabelResult) {
  expect(r.per100).toBeDefined()
  return r.per100!.nutrients
}

describe('svenska etiketter', () => {
  it('en kolumn per 100 g, rad för rad', () => {
    const r = parseNutritionLabel(`Näringsvärde per 100 g
Energi 1550 kJ / 370 kcal
Fett 12 g
varav mättat fett 3,5 g
Kolhydrat 55 g
varav sockerarter 20 g
Fiber 6 g
Protein 8 g
Salt 0,5 g`)
    expect(r.column).toEqual({ kind: 'per100', unit: 'g' })
    expect(per100(r)).toEqual(BASE)
    expect(r.stated).toMatchObject({ kJ: 1550, kcal: 370 })
    expect(r.warnings).toEqual([])
    expect(r.unparsed).toEqual([])
    expect(labelValueCount(r)).toBe(8)
  })

  it('tabell med per 100 g, per portion och %RI – energin på två rader', () => {
    const r = parseNutritionLabel(`Näringsvärde        Per 100 g     Per portion (30 g)   %RI*
Energi              1550 kJ       465 kJ               6 %
                    370 kcal      111 kcal
Fett                12 g          3,6 g                5 %
varav mättat fett   3,5 g         1,1 g                5 %
Kolhydrat           55 g          17 g                 6 %
varav sockerarter   20 g          6,0 g                7 %
Fiber               6,0 g         1,8 g
Protein             8,0 g         2,4 g                5 %
Salt                0,50 g        0,15 g               3 %
*Referensintag för en genomsnittlig vuxen (8 400 kJ/2 000 kcal)`)
    expect(r.column).toEqual({ kind: 'per100', unit: 'g' })
    expect(per100(r)).toEqual(BASE)
    expect(r.stated.kJ).toBe(1550)
    // Portionen i kolumnrubriken följer med så att den kan sparas som mått.
    expect(r.portion).toEqual({ grams: 30, label: '1 portion' })
    expect(r.warnings).toEqual([])
    expect(r.unparsed).toEqual([])
  })

  it('löptext med kommatecken (små förpackningar)', () => {
    const r = parseNutritionLabel(
      'Näringsvärde per 100 g: Energi 1550 kJ/370 kcal, fett 12 g, varav mättat fett 3,5 g, kolhydrat 55 g, varav sockerarter 20 g, fiber 6 g, protein 8 g, salt 0,5 g.',
    )
    expect(per100(r)).toEqual(BASE)
    expect(r.warnings).toEqual([])
  })

  it('portionskolumnen först och per 100 g sist – väljer ändå per 100 g', () => {
    const r = parseNutritionLabel(`Näringsinnehåll   per portion (40 g)   per 100 g
Energi   760 kJ / 182 kcal   1900 kJ / 455 kcal
Fett   8,4 g   21 g
varav mättat fett   2,0 g   5,0 g
Kolhydrat   20 g   50 g
varav sockerarter   12 g   30 g
Fiber   2,4 g   6,0 g
Protein   4,0 g   10 g
Salt   0,12 g   0,30 g`)
    expect(r.column).toEqual({ kind: 'per100', unit: 'g' })
    expect(per100(r)).toEqual({ kcal: 455, fat: 21, satFat: 5, carbs: 50, sugars: 30, fiber: 6, protein: 10, salt: 0.3 })
    expect(r.portion).toEqual({ grams: 40, label: '1 portion' })
  })

  it('hoppar över ingredienslistan (där salt och socker också står)', () => {
    const r = parseNutritionLabel(`Ingredienser: HAVREGRYN (60 %), socker, rapsolja,
salt, arom. Kan innehålla spår av nötter.
Näringsvärde per 100 g
Energi 1650 kJ / 392 kcal
Fett 14 g
varav mättat fett 1,2 g
Kolhydrat 55 g
varav sockerarter 18 g
Fiber 7,5 g
Protein 9,0 g
Salt 0,4 g
Förvaras torrt.`)
    expect(per100(r)).toEqual({ kcal: 392, fat: 14, satFat: 1.2, carbs: 55, sugars: 18, fiber: 7.5, protein: 9, salt: 0.4 })
    expect(r.unparsed).toEqual([])
  })
})

describe('nordiska och engelska etiketter', () => {
  it('flerspråkig etikett med namnen efter varandra (sv/no/da/fi)', () => {
    const r = parseNutritionLabel(`Näringsvärde/Næringsinnhold/Næringsindhold/Ravintosisältö per/pr./100 g
Energi/Energia 1550 kJ/370 kcal
Fett/Fedt/Rasva 12 g
varav mättat fett/hvorav mettede fettsyrer/heraf mættede fedtsyrer/josta tyydyttynyttä rasvaa 3,5 g
Kolhydrat/Karbohydrat/Kulhydrat/Hiilihydraatit 55 g
varav sockerarter/hvorav sukkerarter/heraf sukkerarter/josta sokereita 20 g
Fiber/Kostfiber/Kostfibre/Ravintokuitu 6 g
Protein/Proteiini 8 g
Salt/Suola 0,5 g`)
    expect(r.column).toEqual({ kind: 'per100', unit: 'g' })
    expect(per100(r)).toEqual(BASE)
    expect(r.warnings).toEqual([])
  })

  it('norska med enkel- och fleromättat fett', () => {
    const r = parseNutritionLabel(
      'Næringsinnhold per 100 g: Energi 1550 kJ / 370 kcal, Fett 12 g, hvorav mettede fettsyrer 3,5 g, enumettede fettsyrer 5,5 g, flerumettede fettsyrer 2,5 g, Karbohydrat 55 g, hvorav sukkerarter 20 g, Kostfiber 6 g, Protein 8 g, Salt 0,5 g',
    )
    expect(per100(r)).toEqual({ ...BASE, monoFat: 5.5, polyFat: 2.5 })
  })

  it('danska med "pr. 100 g" och punkt som tusentalsavgränsare', () => {
    const r = parseNutritionLabel(`Næringsindhold pr. 100 g
Energi 1.550 kJ / 370 kcal
Fedt 12 g
heraf mættede fedtsyrer 3,5 g
Kulhydrat 55 g
heraf sukkerarter 20 g
Kostfibre 6 g
Protein 8 g
Salt 0,5 g`)
    expect(r.stated.kJ).toBe(1550)
    expect(per100(r)).toEqual(BASE)
  })

  it('finska med böjda former och "100 g:ssa"', () => {
    const r = parseNutritionLabel(
      'Ravintoarvo 100 g:ssa: Energiaa 1550 kJ/370 kcal, Rasvaa 12 g, josta tyydyttynyttä rasvaa 3,5 g, Hiilihydraatteja 55 g, josta sokereita 20 g, Ravintokuitua 6 g, Proteiinia 8 g, Suolaa 0,5 g',
    )
    expect(r.column).toEqual({ kind: 'per100', unit: 'g' })
    expect(per100(r)).toEqual(BASE)
  })

  it('engelska med punkt som decimaltecken och portionskolumn', () => {
    const r = parseNutritionLabel(`Typical values   per 100g   per 30g serving   %RI*
Energy 1550kJ/370kcal 465kJ/111kcal 6%
Fat 12g 3.6g 5%
of which saturates 3.5g 1.1g 5%
Carbohydrate 55g 17g 6%
of which sugars 20g 6.0g 7%
Fibre 6.0g 1.8g
Protein 8.0g 2.4g 5%
Salt 0.50g 0.15g 3%
*Reference intake of an average adult (8400kJ/2000kcal)`)
    expect(per100(r)).toEqual(BASE)
    expect(r.portion?.grams).toBe(30)
    expect(r.unparsed).toEqual([])
  })

  it('olika värden på olika språk ger en varning – det första används', () => {
    const r = parseNutritionLabel(`Per 100 g
Energi 1550 kJ/370 kcal
Fett 12 g
Fedt 13 g
Protein 8 g
Kolhydrat 55 g`)
    expect(per100(r).fat).toBe(12)
    expect(r.warnings.join(' ')).toMatch(/olika värden för fett/)
  })
})

describe('fel från textigenkänning', () => {
  it('O ↔ 0, l ↔ 1 och enheten fastklistrad', () => {
    const r = parseNutritionLabel(`Näringsvärde per 1OO g
Energi 155O kJ/37O kcaI
Fett l2g
varav mättat fett 3,5g
Kolhydrat 55 g
varav sockerarter 2O g
Fiber 6g
Protein 8 g
Salt O,5 g`)
    expect(r.column).toEqual({ kind: 'per100', unit: 'g' })
    expect(per100(r)).toEqual(BASE)
  })

  it('radbrytningar mitt i ord, tal och namn', () => {
    const r = parseNutritionLabel(`Näringsvärde per 100 g
Energi 1550
kJ / 370 kcal
Fett 12 g
varav mättat
fett 3,5 g
Kolhydra-
ter 55 g
varav sockerarter 20 g
Fiber 6 g
Protein 8,
0 g
Salt 0,5 g`)
    expect(per100(r)).toEqual(BASE)
  })

  it('tabell som lästs kolumn för kolumn (alla namn först, sedan värdena)', () => {
    const r = parseNutritionLabel(`Näringsvärde
Energi
Fett
varav mättat fett
Kolhydrat
varav sockerarter
Fiber
Protein
Salt
Per 100 g
1550 kJ / 370 kcal
12 g
3,5 g
55 g
20 g
6 g
8 g
0,5 g
Per portion (30 g)
465 kJ / 111 kcal
3,6 g
1,1 g
17 g
6,0 g
1,8 g
2,4 g
0,15 g`)
    expect(r.column).toEqual({ kind: 'per100', unit: 'g' })
    expect(per100(r)).toEqual(BASE)
    expect(r.portion?.grams).toBe(30)
    expect(r.warnings.join(' ')).toMatch(/kolumn för kolumn/)
  })

  it('kolumnvis med enheten i namnen ("Energi kJ" / "Energi kcal")', () => {
    const r = parseNutritionLabel(`Per 100 g
Energi kJ
Energi kcal
Fett g
Protein g
1550
370
12
8`)
    expect(r.stated).toMatchObject({ kJ: 1550, kcal: 370 })
    expect(per100(r)).toMatchObject({ fat: 12, protein: 8 })
  })

  it('namn och värde på varannan rad', () => {
    const r = parseNutritionLabel(`per 100 g
Energi
1550 kJ
370 kcal
Fett
12 g
varav mättat fett
3,5 g
Kolhydrat
55 g
varav sockerarter
20 g
Fiber
6 g
Protein
8 g
Salt
0,5 g`)
    expect(per100(r)).toEqual(BASE)
    expect(r.warnings).toEqual([])
  })

  it('tabellstreck mellan kolumnerna', () => {
    const r = parseNutritionLabel(`| Näringsvärde | per 100 g | per portion (30 g) | %RI |
| Energi | 1550 kJ/370 kcal | 465 kJ/111 kcal | 6 % |
| Fett | 12 g | 3,6 g | 5 % |
| Protein | 8 g | 2,4 g | 5 % |
| Kolhydrat | 55 g | 17 g | 6 % |
| Salt | 0,5 g | 0,15 g | 3 % |`)
    expect(per100(r)).toMatchObject({ kcal: 370, fat: 12, protein: 8, carbs: 55, salt: 0.5 })
  })
})

describe('energi', () => {
  it('bara kJ – räknar om till kcal (÷ 4,184) och säger det', () => {
    const r = parseNutritionLabel(`Näringsvärde per 100 g
Energi 1550 kJ
Fett 12 g
Kolhydrat 55 g
Protein 8 g`)
    expect(r.stated.kJ).toBe(1550)
    expect(r.stated.kcal).toBeUndefined()
    expect(per100(r).kcal).toBeCloseTo(370.5, 1)
    expect(r.notes.join(' ')).toMatch(/bara i kJ/)
  })

  it('"kJ 1550 kcal 370" – enheten före talet', () => {
    const r = parseNutritionLabel('Per 100 g: Energi kJ 1550 kcal 370, Fett g 12, Kolhydrat g 55, Protein g 8')
    expect(r.stated).toMatchObject({ kJ: 1550, kcal: 370 })
    expect(per100(r)).toMatchObject({ fat: 12, carbs: 55, protein: 8 })
  })

  it('energin på två rader med enheten i namnet', () => {
    const r = parseNutritionLabel(`Per 100 g
Energi (kJ) 1550
Energi (kcal) 370
Fett (g) 12
Protein (g) 8`)
    expect(r.stated).toMatchObject({ kJ: 1550, kcal: 370 })
    expect(per100(r)).toMatchObject({ fat: 12, protein: 8 })
  })

  it('"kJ/kcal 1550/370" och "1 550 kJ" med mellanslag', () => {
    expect(parseNutritionLabel('Per 100 g\nEnergi kJ/kcal 1550/370\nFett 12 g').stated).toMatchObject({ kJ: 1550, kcal: 370 })
    expect(parseNutritionLabel('Per 100 g\nEnergi 1 550 kJ / 370 kcal\nFett 12 g').stated).toMatchObject({ kJ: 1550, kcal: 370 })
  })

  it('energi utan enhet: kJ och kcal skiljs åt med kvoten 4,184', () => {
    const r = parseNutritionLabel('Per 100 g\nEnergi 1550 / 370\nFett 12 g\nKolhydrat 55 g\nProtein 8 g')
    expect(r.stated).toMatchObject({ kJ: 1550, kcal: 370 })
  })

  it('energi utan enhet och bara ett tal: jämför med makronäringsämnena och varnar', () => {
    const r = parseNutritionLabel('Per 100 g\nEnergi 370\nFett 12 g\nKolhydrat 55 g\nProtein 8 g')
    expect(r.stated.kcal).toBe(370)
    expect(r.warnings.join(' ')).toMatch(/utan enhet/)
    const kj = parseNutritionLabel('Per 100 g\nEnergi 380\nFett 1 g\nKolhydrat 15 g\nProtein 5 g')
    expect(kj.stated.kJ).toBe(380)
  })

  it('varnar när energin inte stämmer med makronäringsämnena (±15 %)', () => {
    const r = parseNutritionLabel('Per 100 g: Energi 1550 kJ/370 kcal, Fett 30 g, Kolhydrat 55 g, Protein 8 g')
    expect(r.warnings.join(' ')).toMatch(/Energin stämmer inte med fett, kolhydrater och protein/)
  })

  it('räknar polyoler med 2,4 kcal/g (sockerfritt tuggummi)', () => {
    const r = parseNutritionLabel(
      'Näringsvärde per 100 g: Energi 640 kJ/155 kcal, Fett 0 g, varav mättat fett 0 g, Kolhydrat 62 g, varav sockerarter 0 g, varav polyoler 60 g, Protein 0 g, Salt 0 g',
    )
    expect(r.warnings).toEqual([])
    expect(per100(r).carbs).toBe(62)
    expect(r.notes.join(' ')).toMatch(/Polyoler har inga egna fält/)
  })

  it('varnar när kJ och kcal inte stämmer med varandra', () => {
    const r = parseNutritionLabel('Per 100 g: Energi 1950 kJ/370 kcal, Fett 12 g, Kolhydrat 55 g, Protein 8 g')
    expect(r.warnings.join(' ')).toMatch(/kJ och kcal stämmer inte/)
    expect(per100(r).kcal).toBe(370)
  })

  it('hoppar över fotnoten om referensintag', () => {
    const r = parseNutritionLabel(`Näringsvärde per 100 g
Energi 1550 kJ/370 kcal
Fett 12 g
*Referensintag för en genomsnittlig vuxen
(8 400 kJ/2 000 kcal)`)
    expect(r.stated).toMatchObject({ kJ: 1550, kcal: 370 })
    expect(r.unparsed).toEqual([])
  })
})

describe('per portion', () => {
  it('bara per portion med vikt – räknar om till per 100 g och säger det', () => {
    const r = parseNutritionLabel(
      'Per portion (40 g): Energi 836 kJ/200 kcal, Fett 8 g, varav mättat fett 2 g, Kolhydrat 18 g, varav sockerarter 9 g, Fiber 2 g, Protein 16 g, Salt 0,3 g',
    )
    expect(r.column).toEqual({ kind: 'portion', unit: 'g', amount: 40, label: '1 portion' })
    expect(r.stated.nutrients).toMatchObject({ kcal: 200, protein: 16 })
    expect(per100(r)).toEqual({ kcal: 500, fat: 20, satFat: 5, carbs: 45, sugars: 22.5, fiber: 5, protein: 40, salt: 0.75 })
    expect(r.per100?.kJ).toBe(2090)
    expect(r.portion).toEqual({ grams: 40, label: '1 portion' })
  })

  it('portionens vikt i en fotnot', () => {
    const r = parseNutritionLabel(`Näringsvärde per bar*
Energi 836 kJ / 200 kcal
Fett 8 g
Kolhydrat 18 g
Protein 16 g
*1 bar = 40 g`)
    expect(r.column).toMatchObject({ kind: 'portion', amount: 40, label: '1 bar' })
    expect(per100(r)).toMatchObject({ kcal: 500, protein: 40 })
  })

  it('per portion utan vikt – inga värden per 100 g, men en varning', () => {
    const r = parseNutritionLabel('Per portion: Energi 200 kcal, Fett 8 g, Kolhydrat 18 g, Protein 16 g')
    expect(r.column).toEqual({ kind: 'portion', unit: 'g', label: '1 portion' })
    expect(r.per100).toBeUndefined()
    expect(r.stated.nutrients).toMatchObject({ kcal: 200, fat: 8, protein: 16 })
    expect(r.warnings.join(' ')).toMatch(/portionens vikt står inte/)
  })
})

describe('små mängder, flytande och övriga näringsämnen', () => {
  it('"<0,5 g" och "spår" blir 0 (försumbar mängd) – med en upplysning', () => {
    const r = parseNutritionLabel(`Näringsvärde per 100 ml
Energi 8 kJ / 2 kcal
Fett <0,5 g
varav mättat fett < 0,1 g
Kolhydrat 0,3 g
varav sockerarter 0,3 g
Protein <0,5 g
Salt spår`)
    expect(r.column).toEqual({ kind: 'per100', unit: 'ml' })
    expect(r.unit).toBe('ml')
    expect(per100(r)).toEqual({ kcal: 2, fat: 0, satFat: 0, carbs: 0.3, sugars: 0.3, protein: 0, salt: 0 })
    expect(r.notes.join(' ')).toMatch(/försumbar mängd/)
    // En upplysning, inget att kontrollera.
    expect(r.notes.join(' ')).toMatch(/per 100\u00a0ml – livsmedlet markeras som flytande/)
    expect(r.warnings).toEqual([])
  })

  it('"<3 g" är en övre gräns, inte 0 – fylls inte i och sägs', () => {
    const r = parseNutritionLabel(`Näringsvärde per 100 g
Energi 1550 kJ/370 kcal
Fett <1 g
varav mättat fett <0,1 g
Kolhydrat 70 g
Fiber <3 g
Protein 8 g
Salt <0,01 g`)
    const n = per100(r)
    // Under EU:s gränser för "0 g"/"<…": försumbart.
    expect(n).toMatchObject({ satFat: 0, salt: 0, carbs: 70, protein: 8 })
    // Över gränserna: okänt.
    expect(n.fat).toBeUndefined()
    expect(n.fiber).toBeUndefined()
    expect(r.unparsed).toEqual(expect.arrayContaining(['Fett <1 g', 'Fiber <3 g']))
    expect(r.warnings.join(' ')).toMatch(/Fett \(<1\u00a0g\) och fibrer \(<3\u00a0g\) stod bara som en övre gräns/)
    expect(r.notes.join(' ')).toMatch(/Mättat fett och salt stod som ”<…”/)
  })

  it('vitaminer i internationella enheter (IE/IU) räknas inte om', () => {
    const r = parseNutritionLabel('Per 100 ml\nEnergi 197 kJ/47 kcal\nFett 1,5 g\nVitamin D 400 IE\nVitamin A 800 IU\nKalcium 120 mg')
    expect(per100(r)).toEqual({ kcal: 47, fat: 1.5, calcium: 120 })
    expect(r.unparsed).toEqual(expect.arrayContaining(['Vitamin D 400 IE', 'Vitamin A 800 IU']))
    expect(r.warnings.join(' ')).toMatch(/internationella enheter.*40\u00a0IE 1\u00a0µg/)
  })

  it('havredryck per 100 ml med vitaminer och mineraler', () => {
    const r = parseNutritionLabel(`Näringsvärde per 100 ml
Energi 197 kJ / 47 kcal
Fett 1,5 g
varav mättat fett 0,2 g
Kolhydrat 6,7 g
varav sockerarter 4,1 g
Fiber 0,8 g
Protein 1,0 g
Salt 0,10 g
Vitamin D 1,1 µg 22 %*
Riboflavin 0,21 mg 15 %*
Vitamin B12 0,38 µg 15 %*
Kalcium 120 mg 15 %*
Jod 22,5 μg 15 %*
*% av referensintaget`)
    expect(r.unit).toBe('ml')
    expect(per100(r)).toEqual({
      kcal: 47,
      fat: 1.5,
      satFat: 0.2,
      carbs: 6.7,
      sugars: 4.1,
      fiber: 0.8,
      protein: 1,
      salt: 0.1,
      vitD: 1.1,
      riboflavin: 0.21,
      vitB12: 0.38,
      calcium: 120,
      iodine: 22.5,
    })
  })

  it('natrium anges bara när etiketten säger natrium – salt blir salt', () => {
    const salt = parseNutritionLabel('Per 100 g: Energi 400 kJ/95 kcal, Fett 5 g, Kolhydrat 10 g, Protein 2 g, Salt 1,2 g')
    expect(per100(salt).salt).toBe(1.2)
    expect(per100(salt).sodium).toBeUndefined()
    const sodium = parseNutritionLabel('Per 100 g: Energi 400 kJ/95 kcal, Fett 5 g, Kolhydrat 10 g, Protein 2 g, Natrium 0,48 g')
    expect(per100(sodium).sodium).toBe(480)
    expect(per100(sodium).salt).toBeUndefined()
  })

  it('okänt är undefined, aldrig 0', () => {
    const r = parseNutritionLabel('Per 100 g\nEnergi 1550 kJ/370 kcal\nFett 12 g\nProtein 8 g')
    const n = per100(r)
    expect(n.carbs).toBeUndefined()
    expect(n.fiber).toBeUndefined()
    expect(n.salt).toBeUndefined()
    expect('carbs' in n).toBe(false)
  })

  it('stoppar omöjliga värden (mer än 100 g per 100 g)', () => {
    const r = parseNutritionLabel('Per 100 g\nEnergi 1550 kJ/370 kcal\nFett 120 g\nProtein 8 g')
    expect(per100(r).fat).toBeUndefined()
    expect(r.unparsed).toContain('Fett 120 g')
  })

  it('ett omöjligt värde i produktnamnet tar inte över tabellens värde', () => {
    const r = parseNutritionLabel('Näringsvärde per 100 g\nProtein Pudding 200 g\nEnergi 300 kJ/71 kcal\nFett 1,5 g\nKolhydrat 6 g\nProtein 10 g')
    expect(per100(r).protein).toBe(10)
    expect(r.unparsed).toContain('Protein Pudding 200 g')
    expect(r.warnings).toEqual([])
  })

  it('varnar när delmängderna är större än helheten', () => {
    const r = parseNutritionLabel('Per 100 g: Energi 1550 kJ/370 kcal, Fett 3,5 g, varav mättat fett 12 g, Kolhydrat 20 g, varav sockerarter 55 g, Protein 8 g')
    expect(r.warnings.join(' ')).toMatch(/Mättat fett är mer än fettet/)
    expect(r.warnings.join(' ')).toMatch(/Sockerarterna är fler än kolhydraterna/)
  })
})

describe('fler fall från verkligheten', () => {
  it('flera rader ihopslagna på en rad', () => {
    const r = parseNutritionLabel(
      'Per 100 g\nEnergi 1550 kJ/370 kcal Fett 12 g varav mättat fett 3,5 g Kolhydrat 55 g varav sockerarter 20 g Fiber 6 g Protein 8 g Salt 0,5 g',
    )
    expect(per100(r)).toEqual(BASE)
  })

  it('rubriken på flera rader, som Live Text ofta läser den', () => {
    const r = parseNutritionLabel(`Näringsvärde
per 100 g
per portion
(30 g)
%RI*
Energi 1550 kJ 465 kJ 6%
370 kcal 111 kcal
Fett 12 g 3,6 g 5%
Protein 8 g 2,4 g 5%`)
    expect(per100(r)).toEqual({ kcal: 370, fat: 12, protein: 8 })
    expect(r.portion).toEqual({ grams: 30, label: '1 portion' })
  })

  it('löptext med portionen först och per 100 g sedan', () => {
    const r = parseNutritionLabel('Per portion (30 g): energi 465 kJ/111 kcal, fett 3,6 g, protein 2,4 g. Per 100 g: energi 1550 kJ/370 kcal, fett 12 g, protein 8 g.')
    expect(r.column).toEqual({ kind: 'per100', unit: 'g' })
    expect(per100(r)).toEqual({ kcal: 370, fat: 12, protein: 8 })
  })

  it('portionsstorlek och antal före tabellen blir inte kolumner', () => {
    const r = parseNutritionLabel(`Förpackningen innehåller 21 st
Portionsstorlek: 30 g
Näringsvärde per 100 g per portion %RI
Energi 1550 kJ/370 kcal 465 kJ/111 kcal 6 %
Fett 12 g 3,6 g 5 %
Protein 8 g 2,4 g 5 %`)
    expect(per100(r)).toEqual({ kcal: 370, fat: 12, protein: 8 })
    expect(r.portion).toEqual({ grams: 30, label: '1 portion' })
  })

  it('hoppar över tillagningsråd med salt och mängder', () => {
    const r = parseNutritionLabel(`Näringsvärde per 100 g
Energi 1550 kJ/370 kcal
Fett 12 g
Protein 8 g
Tillagning: Koka upp 5 dl vatten med 1 tsk salt. Tillsätt 100 g pasta.`)
    expect(per100(r)).toEqual({ kcal: 370, fat: 12, protein: 8 })
    expect(r.unparsed).toEqual([])
  })

  it('energidryck med koffein per 100 ml', () => {
    const r = parseNutritionLabel(
      'Näringsvärde per 100 ml: Energi 197 kJ/46 kcal, Fett 0 g, varav mättat fett 0 g, Kolhydrat 11 g, varav sockerarter 11 g, Protein 0 g, Salt 0,1 g. Koffein 32 mg/100 ml.',
    )
    expect(per100(r)).toMatchObject({ kcal: 46, carbs: 11, caffeine: 32 })
    expect(r.unit).toBe('ml')
  })

  it('rapsolja på engelska med enkel- och fleromättat fett och omega-3', () => {
    const r = parseNutritionLabel(
      'Per 100g: Energy 3700kJ/900kcal, Fat 100g, of which saturates 7g, mono-unsaturates 62g, polyunsaturates 29g, omega-3 fatty acids 9g, Carbohydrate 0g, Protein 0g, Salt 0g',
    )
    expect(per100(r)).toEqual({ kcal: 900, fat: 100, satFat: 7, monoFat: 62, polyFat: 29, omega3: 9, carbs: 0, protein: 0, salt: 0 })
    expect(r.warnings).toEqual([])
  })

  it('"kca1" och "KJ" från textigenkänningen', () => {
    expect(parseNutritionLabel('Per 100 g\nEnergi 1550 KJ / 370 kca1\nFett 12 g').stated).toMatchObject({ kJ: 1550, kcal: 370 })
  })

  it('stärkelse och polyoler känns igen men fylls inte i', () => {
    const r = parseNutritionLabel('Per 100 g: Energi 1500 kJ/355 kcal, Fett 2 g, Kolhydrat 70 g, varav sockerarter 3 g, varav stärkelse 65 g, Fiber 6 g, Protein 10 g, Salt 1 g')
    expect(per100(r).carbs).toBe(70)
    expect(Object.keys(per100(r))).not.toContain('starch')
    expect(r.notes.join(' ')).toMatch(/Stärkelse har inga egna fält/)
  })

  it('tål en tabell där bara %RI-kolumnen kom med', () => {
    const r = parseNutritionLabel('%RI*\nEnergi\nFett\n6 %\n465 kJ\n5 %')
    expect(r.column).toBeNull()
    expect(labelValueCount(r)).toBe(0)
  })

  it('tål långa och konstiga texter', () => {
    const noise = 'åäö 123 %%% <<< --- /// ((( kJ kcal g '.repeat(200)
    expect(() => parseNutritionLabel(noise)).not.toThrow()
    const r = parseNutritionLabel(`${noise}\nNäringsvärde per 100 g\nEnergi 1550 kJ/370 kcal\nFett 12 g`)
    expect(r.stated.kcal).toBe(370)
  })
})

describe('det som inte går att tolka', () => {
  it('text utan näringsvärden ger inget resultat', () => {
    for (const text of ['', '   ', 'Hej! Det här är ingen etikett.', 'Bäst före 2026-12-01', 'Ingredienser: vetemjöl, socker, salt']) {
      const r = parseNutritionLabel(text)
      expect(r.column).toBeNull()
      expect(r.per100).toBeUndefined()
      expect(r.stated.nutrients).toEqual({})
      expect(labelValueCount(r)).toBe(0)
    }
  })

  it('saknade värden och rader som inte känns igen listas', () => {
    const r = parseNutritionLabel(`Näringsvärde per 100 g
Energi 270 kJ / 64 kcal
Fett 3,0 g
Kolhydrat 4,7 g
varav laktos 4,7 g
Fiber
Protein 3,4 g
Salt 0,1 g`)
    expect(r.unparsed).toContain('varav laktos 4,7 g')
    expect(r.unparsed).toContain('Fibrer – inget värde hittades')
    expect(per100(r).fiber).toBeUndefined()
  })

  it('alla värden som tolken kan ge har ett känt näringsämne', () => {
    expect(LABEL_NUTRIENTS).toContain('salt')
    expect(LABEL_NUTRIENTS).not.toContain('kcal')
  })
})

describe('påståenden, rubriker och kolumner som ser likadana ut', () => {
  const SYLT = `Näringsvärde per 100 g
Energi 870 kJ / 205 kcal
Fett 0 g
varav mättat fett 0 g
Kolhydrat 50 g
varav sockerarter 50 g
Protein 0,4 g
Salt 0 g`
  const SYLT_VALUES = { kcal: 205, fat: 0, satFat: 0, carbs: 50, sugars: 50, protein: 0.4, salt: 0 }
  const CLAIM = 'Tillverkad av 45 g bär per 100 g. Total sockerhalt 50 g per 100 g.'

  it('"Tillverkad av 45 g bär per 100 g" är ingen portionskolumn – före, i och efter tabellen', () => {
    const lines = SYLT.split('\n')
    const variants = [
      `Ingredienser: jordgubbar, socker, vatten, förtjockningsmedel (pektin).\n${CLAIM}\n${SYLT}`,
      [...lines.slice(0, 4), CLAIM, ...lines.slice(4)].join('\n'),
      `${SYLT}\n${CLAIM}`,
    ]
    for (const text of variants) {
      const r = parseNutritionLabel(text)
      expect(r.column).toEqual({ kind: 'per100', unit: 'g' })
      expect(per100(r)).toEqual(SYLT_VALUES)
      expect(r.portion).toBeUndefined()
      expect(r.warnings).toEqual([])
    }
  })

  it('korv: "Framställd av 70 g kött per 100 g korv" på samma rad som tabellen', () => {
    const r = parseNutritionLabel(
      'Framställd av 70 g kött per 100 g korv. Näringsvärde per 100 g: Energi 1000 kJ/240 kcal, Fett 20 g, varav mättat fett 8 g, Kolhydrat 4 g, Protein 11 g, Salt 2 g',
    )
    expect(per100(r)).toEqual({ kcal: 240, fat: 20, satFat: 8, carbs: 4, protein: 11, salt: 2 })
    expect(r.portion).toBeUndefined()
    expect(r.warnings).toEqual([])
  })

  it('påståenden på norska, finska och engelska', () => {
    const tail = 'Energi 870 kJ/205 kcal, Fett 0 g, Kolhydrat 50 g, Protein 0,4 g, Salt 0 g'
    for (const claim of [
      'Fremstilt av 45 g bær pr. 100 g. Totalt sukkerinnhold 50 g pr. 100 g.',
      'Valmistettu 45 g:sta marjoja 100 g:aan.',
      'Prepared with 45 g of fruit per 100 g. Total sugar content 50 g per 100 g.',
    ]) {
      const r = parseNutritionLabel(`${claim}\nNäringsvärde per 100 g: ${tail}`)
      expect(per100(r)).toEqual({ kcal: 205, fat: 0, carbs: 50, protein: 0.4, salt: 0 })
      expect(r.portion).toBeUndefined()
    }
  })

  it('en naken mängd blir bara en kolumn i något som ser ut som en rubrik', () => {
    for (const header of ['Näringsvärde 100 g 30 g', 'per 100 g / 30 g']) {
      const r = parseNutritionLabel(`${header}\nEnergi 1550 kJ/370 kcal 465 kJ/111 kcal\nFett 12 g 3,6 g`)
      expect(per100(r)).toEqual({ kcal: 370, fat: 12 })
      expect(r.portion).toEqual({ grams: 30, label: '1 portion' })
    }
  })

  it('kolumnvis tabell med produktnamn och påståenden före "Näringsvärde"', () => {
    const r = parseNutritionLabel(`Protein Pudding Choklad
Rik på protein!
Källa till fiber
Näringsvärde
Energi
Fett
Kolhydrat
Protein
Salt
Per 100 g
300 kJ / 71 kcal
1,5 g
6 g
10 g
0,2 g`)
    expect(per100(r)).toEqual({ kcal: 71, fat: 1.5, carbs: 6, protein: 10, salt: 0.2 })
    expect(r.unparsed).toEqual([])
  })

  it('kolumnvis utan rubrikord: enheterna avgör var tabellens namn börjar', () => {
    const r = parseNutritionLabel(`Protein Pudding Choklad
Källa till fiber
Energi
Fett
Kolhydrat
Protein
Salt
Per 100 g
300 kJ / 71 kcal
1,5 g
6 g
10 g
0,2 g`)
    expect(per100(r)).toEqual({ kcal: 71, fat: 1.5, carbs: 6, protein: 10, salt: 0.2 })
    expect(r.warnings.join(' ')).toMatch(/kolumn för kolumn/)
  })

  it('kolumnvis: ett värde som inte passar något namn fylls inte i', () => {
    const r = parseNutritionLabel('Per 100 g\nFett\nProtein\n1550 kJ\n12 g\n8 g')
    expect(per100(r)).toEqual({ fat: 12, protein: 8 })
    expect(r.unparsed).toContain('1550 kJ')
  })

  it('två kolumner per 100 (pulver/tillagad, okokt/kokt): den första används och det sägs', () => {
    const pulver = parseNutritionLabel(`Näringsvärde per 100 g pulver per 100 ml tillagad
Energi 1600 kJ/380 kcal 280 kJ/67 kcal
Fett 5 g 0,9 g
Kolhydrat 70 g 12 g
Protein 10 g 1,8 g`)
    expect(pulver.column).toEqual({ kind: 'per100', unit: 'g', qualifier: 'pulver' })
    expect(per100(pulver)).toEqual({ kcal: 380, fat: 5, carbs: 70, protein: 10 })
    expect(pulver.warnings.join(' ')).toMatch(/flera kolumner per 100 \(per 100\u00a0g pulver och per 100\u00a0ml tillagad\) – Lagom använde den första, per 100\u00a0g pulver/)

    const pasta = parseNutritionLabel(`Näringsvärde per 100 g okokt per 100 g kokt
Energi 1500 kJ/355 kcal 580 kJ/137 kcal
Fett 1,5 g 0,6 g
Kolhydrat 70 g 27 g
Protein 12 g 4,6 g`)
    expect(per100(pasta)).toEqual({ kcal: 355, fat: 1.5, carbs: 70, protein: 12 })
    const w = pasta.warnings.join(' ')
    expect(w).toMatch(/per 100\u00a0g okokt och per 100\u00a0g kokt/)
    expect(w).not.toMatch(/fler värden än kolumnrubrikerna/)
  })

  it('samma kolumn på flera språk slås fortfarande ihop', () => {
    const r = parseNutritionLabel('Näringsvärde per 100 g pulver / pr. 100 g pulver\nEnergi 1600 kJ/380 kcal\nFett 5 g')
    expect(per100(r)).toEqual({ kcal: 380, fat: 5 })
    expect(r.warnings).toEqual([])
  })
})

describe('fler fel från textigenkänning', () => {
  it('"varavmättat fett" och "varavsockerarter" utan mellanslag', () => {
    const r = parseNutritionLabel('Per 100 g\nEnergi 1550 kJ/370 kcal\nFett 12 g\nvaravmättat fett 3,5 g\nKolhydrat 55 g\nvaravsockerarter 20 g\nProtein 8 g')
    expect(per100(r)).toEqual({ kcal: 370, fat: 12, satFat: 3.5, carbs: 55, sugars: 20, protein: 8 })
    expect(r.warnings).toEqual([])
    expect(r.unparsed).toEqual([])
  })

  it('ett delat tal ("Fett 1 2 g") nämns i varningen', () => {
    const r = parseNutritionLabel('Per 100 g\nEnergi 1550 kJ/370 kcal\nFett 1 2 g\nKolhydrat 55 g\nProtein 8 g')
    expect(r.warnings.join(' ')).toMatch(/Fett hade fler värden än kolumnrubrikerna/)
  })

  it('"1,550 kJ" med engelskt tusentalskomma', () => {
    const r = parseNutritionLabel('Per 100 g\nEnergi 1,550 kJ\nFett 12 g\nKolhydrat 55 g\nProtein 8 g')
    expect(r.stated.kJ).toBe(1550)
    expect(per100(r).kcal).toBeCloseTo(370.5, 1)
    expect(r.warnings).toEqual([])
  })
})
