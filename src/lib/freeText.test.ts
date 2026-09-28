/**
 * Fritextloggning: dela upp, läs mängder och slå upp livsmedel i Lagoms riktiga databas.
 * Kör: npx vitest run src/lib/freeText.test.ts
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_FOODS } from '../data/foods'
import { STAPLE_FOODS } from '../data/foods/staples'
import type { Food } from '../types'
import { amountFor, parseQuantity, resolveFreeText, splitFreeText, splitFreeTextParts, type FreeTextDeps } from './freeText'
import { createSearchIndex, searchFoods } from './search'
import { formatAmount } from './units'

const index = createSearchIndex(BUILTIN_FOODS)
const OPTIONAL = new Set(['rå', 'rått', 'råa', 'ra', 'ratt', 'raa', 'okokt', 'okokta'])
const search = (q: string): Food[] => searchFoods(index, q, { limit: 8, optionalWords: OPTIONAL, staples: STAPLE_FOODS }).map((r) => r.food)
const deps: FreeTextDeps = { search }

// ---------------------------------------------------------------------------
// Dela upp
// ---------------------------------------------------------------------------

describe('splitFreeText', () => {
  const cases: Array<[string, string[]]> = [
    ['två ägg och en smörgås med ost', ['två ägg', 'en smörgås', 'ost']],
    ['kaffe med mjölk', ['kaffe', 'mjölk']],
    ['3 knäckebröd med smör', ['3 knäckebröd', 'smör']],
    ['lax, potatis och sallad', ['lax', 'potatis', 'sallad']],
    ['ägg + bacon', ['ägg', 'bacon']],
    ['te & kanelbulle', ['te', 'kanelbulle']],
    ['en apelsin samt en kaffe', ['en apelsin', 'en kaffe']],
    ['banan\näpple\n', ['banan', 'äpple']],
    ['yoghurt; müsli', ['yoghurt', 'müsli']],
    ['1,5 dl havregryn', ['1,5 dl havregryn']],
    ['1.5 dl havregryn och ett ägg', ['1.5 dl havregryn', 'ett ägg']],
    ['ägg,bröd', ['ägg', 'bröd']],
    ['ett glas med mjölk', ['ett glas mjölk']],
    ['en skål med yoghurt och en banan', ['en skål yoghurt', 'en banan']],
    ['en och en halv dl mjölk', ['1½ dl mjölk']],
    ['två och en halv dl mjölk och ett ägg', ['2½ dl mjölk', 'ett ägg']],
    ['  gröt med mjölk och sylt.  ', ['gröt', 'mjölk', 'sylt']],
    ['kaffe plus en bulle', ['kaffe', 'en bulle']],
    // Diktering: meningar, "Jag åt …" och måltider är inte mat.
    ['Två ägg. En banan.', ['Två ägg', 'En banan']],
    ['Kaffe! Ett äpple? En bulle', ['Kaffe', 'Ett äpple', 'En bulle']],
    ['Jag åt två ägg och en smörgås med ost.', ['två ägg', 'en smörgås', 'ost']],
    ['Till frukost drack jag en kopp kaffe och åt en banan', ['en kopp kaffe', 'en banan']],
    ['jag har ätit en banan i morse och sen en kopp te', ['en banan', 'en kopp te']],
    ['pasta till middag och en sallad', ['pasta', 'en sallad']],
    ['ca. 100 g ris och kyckling', ['ca. 100 g ris', 'kyckling']],
    // Medan man skriver: bindeordet sist är inget eget led.
    ['två ägg och en smörgås med', ['två ägg', 'en smörgås']],
    ['Jag åt', []],
  ]
  it.each(cases)('%j', (text, expected) => {
    expect(splitFreeText(text)).toEqual(expected)
  })

  it('markerar tillbehör efter "med" – även över "och", men inte efter komma eller "samt"', () => {
    expect(splitFreeTextParts('två ägg och en smörgås med ost')).toEqual([
      { text: 'två ägg', side: false },
      { text: 'en smörgås', side: false },
      { text: 'ost', side: true },
    ])
    expect(splitFreeTextParts('bröd med smör och ost, en kopp kaffe').map((p) => p.side)).toEqual([false, true, true, false])
    expect(splitFreeTextParts('pasta med köttfärssås samt sallad').map((p) => p.side)).toEqual([false, true, false])
    // Ett led med egen mängd efter "och" är något nytt, inte ett tillbehör.
    expect(splitFreeTextParts('smörgås med ost och en kopp kaffe').map((p) => p.side)).toEqual([false, true, false])
    expect(splitFreeTextParts('en ny mening. med ost').map((p) => p.side)).toEqual([false, false])
  })

  it('tom text ger inga led', () => {
    expect(splitFreeText('')).toEqual([])
    expect(splitFreeText(' , och ')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Mängder
// ---------------------------------------------------------------------------

describe('parseQuantity', () => {
  const cases: Array<[string, { amount?: number; unit?: string; name: string; size?: string }]> = [
    ['1 1/2 dl havregryn', { amount: 1.5, unit: 'dl', name: 'havregryn' }],
    ['1/2 avokado', { amount: 0.5, name: 'avokado' }],
    ['½ dl russin', { amount: 0.5, unit: 'dl', name: 'russin' }],
    ['1½ dl mjölk', { amount: 1.5, unit: 'dl', name: 'mjölk' }],
    ['1,5 dl havregryn', { amount: 1.5, unit: 'dl', name: 'havregryn' }],
    ['1.5 dl havregryn', { amount: 1.5, unit: 'dl', name: 'havregryn' }],
    ['100 g kycklingfilé', { amount: 100, unit: 'g', name: 'kycklingfilé' }],
    ['100g kycklingfilé', { amount: 100, unit: 'g', name: 'kycklingfilé' }],
    ['2 hg köttfärs', { amount: 2, unit: 'hg', name: 'köttfärs' }],
    ['0,5 kg potatis', { amount: 0.5, unit: 'kg', name: 'potatis' }],
    ['33 cl öl', { amount: 33, unit: 'cl', name: 'öl' }],
    ['1 l mjölk', { amount: 1, unit: 'l', name: 'mjölk' }],
    ['250 ml juice', { amount: 250, unit: 'ml', name: 'juice' }],
    ['2 msk jordnötssmör', { amount: 2, unit: 'msk', name: 'jordnötssmör' }],
    ['1 tsk honung', { amount: 1, unit: 'tsk', name: 'honung' }],
    ['2 krm salt', { amount: 2, unit: 'krm', name: 'salt' }],
    ['2 st ägg', { amount: 2, unit: 'st', name: 'ägg' }],
    ['två ägg', { amount: 2, name: 'ägg' }],
    ['ett äpple', { amount: 1, name: 'äpple' }],
    ['tolv vindruvor', { amount: 12, name: 'vindruvor' }],
    ['ett par ägg', { amount: 2, name: 'ägg' }],
    ['halv avokado', { amount: 0.5, name: 'avokado' }],
    ['ett halvt äpple', { amount: 0.5, name: 'äpple' }],
    ['en halv banan', { amount: 0.5, name: 'banan' }],
    ['tre skivor bröd', { amount: 3, unit: 'skiva', name: 'bröd' }],
    ['två smörgåsar leverpastej', { amount: 2, unit: 'smörgås', name: 'leverpastej' }],
    ['två smörgåsar', { amount: 2, name: 'smörgåsar' }],
    ['en kopp kaffe', { amount: 1, unit: 'kopp', name: 'kaffe' }],
    ['2 glas juice', { amount: 2, unit: 'glas', name: 'juice' }],
    ['en stor banan', { amount: 1, name: 'banan', size: 'stor' }],
    ['en stor kopp te', { amount: 1, unit: 'kopp', name: 'te', size: 'stor' }],
    ['2 dl av mjölken', { amount: 2, unit: 'dl', name: 'mjölken' }],
    ['mellanmjölk 2 dl', { amount: 2, unit: 'dl', name: 'mellanmjölk' }],
    ['kyckling 150 g', { amount: 150, unit: 'g', name: 'kyckling' }],
    ['Mjölk 1,5 %', { name: 'Mjölk 1,5 %' }],
    ['kaffe', { name: 'kaffe' }],
    ['sex pepparkakor', { amount: 6, name: 'pepparkakor' }],
    ['ca 2 dl mjölk', { amount: 2, unit: 'dl', name: 'mjölk' }],
    ['ca. 100 g ris', { amount: 100, unit: 'g', name: 'ris' }],
    ['ungefär en halv banan', { amount: 0.5, name: 'banan' }],
    ['2 st', { amount: 2, unit: 'st', name: '' }],
  ]
  it.each(cases)('%j', (segment, expected) => {
    const q = parseQuantity(segment)
    expect(q.amount).toBe(expected.amount)
    expect(q.unit).toBe(expected.unit)
    expect(q.name).toBe(expected.name)
    expect(q.size).toBe(expected.size)
    expect(q.raw).toBe(segment)
  })

  it('är snabb – långt under 5 ms för en mening', () => {
    const text = 'två ägg och en smörgås med ost, 1 1/2 dl havregryn med mjölk samt en kopp kaffe'
    const t0 = performance.now()
    for (let i = 0; i < 200; i++) splitFreeTextParts(text).forEach((p) => parseQuantity(p.text))
    expect((performance.now() - t0) / 200).toBeLessThan(5)
  })
})

// ---------------------------------------------------------------------------
// Uppslag i Lagoms databas
// ---------------------------------------------------------------------------

function summary(text: string, d: FreeTextDeps = deps) {
  return resolveFreeText(text, d).map((i) => ({ id: i.food?.id, amount: i.amount, unit: i.unit, side: i.side, confidence: i.confidence }))
}

describe('resolveFreeText', () => {
  it('"två ägg och en smörgås med ost" blir två rader – osten ingår redan i "Smörgås med ost"', () => {
    const items = resolveFreeText('två ägg och en smörgås med ost', deps)
    expect(items.map((i) => i.food?.id)).toEqual(['lagom:agg-ratt', 'lagom:smorgas-grovt-ost'])
    expect(items[0]).toMatchObject({ amount: 2, unit: 'portion:st', grams: 100, confidence: 'hog', side: false })
    expect(items[1]).toMatchObject({ amount: 1, unit: 'portion:st', raw: 'en smörgås med ost', side: false, confidence: 'hog' })
    expect(formatAmount(items[0].food!, items[0].amount, items[0].unit, true)).toBe('2 ägg (M, utan skal, 100 g)')
    expect(items[0].alternatives.length).toBeGreaterThan(0)
    expect(items[0].alternatives.some((f) => f.id === items[0].food?.id)).toBe(false)
  })

  it('tillbehör som inte ingår i ett livsmedel får en standardmängd', () => {
    const items = resolveFreeText('tre knäckebröd med smör och ost', deps)
    expect(items.map((i) => i.food?.id)).toEqual(['lagom:knackebrod-wasa-husman', 'lagom:smor-normalsaltat-82', 'lagom:hushallsost-26'])
    expect(items[0]).toMatchObject({ amount: 3, unit: 'portion:skiva', side: false })
    expect(items[1]).toMatchObject({ amount: 1, unit: 'tsk', side: true })
    expect(items[1].grams).toBeCloseTo(4.6, 1)
    // Tillbehöret får en skiva ost.
    expect(items[2]).toMatchObject({ amount: 1, unit: 'portion:skiva', grams: 10, side: true })
  })

  const cases: Array<[string, Array<{ id: string; amount: number; unit: string; side?: boolean }>]> = [
    ['1 1/2 dl havregryn', [{ id: 'lagom:havregryn', amount: 1.5, unit: 'dl' }]],
    ['ett äpple', [{ id: 'lagom:apple-med-skal', amount: 1, unit: 'portion:st' }]],
    ['halv avokado', [{ id: 'lagom:avokado', amount: 0.5, unit: 'portion:st' }]],
    ['2 st ägg', [{ id: 'lagom:agg-ratt', amount: 2, unit: 'portion:st' }]],
    ['100 g kycklingfilé', [{ id: 'lagom:kycklingfile-stekt', amount: 100, unit: 'g' }]],
    [
      '3 knäckebröd med smör',
      [
        { id: 'lagom:knackebrod-wasa-husman', amount: 3, unit: 'portion:skiva' },
        { id: 'lagom:smor-normalsaltat-82', amount: 1, unit: 'tsk', side: true },
      ],
    ],
    [
      'gröt med mjölk och sylt',
      [
        { id: 'lagom:havregrynsgrot-vatten', amount: 1, unit: 'portion:portion' },
        { id: 'lagom:mjolk-standard-3', amount: 1, unit: 'dl', side: true },
        { id: 'lagom:jordgubbssylt', amount: 1, unit: 'msk', side: true },
      ],
    ],
    ['ett glas mjölk', [{ id: 'lagom:mjolk-standard-3', amount: 1, unit: 'portion:glas' }]],
    ['ett glas med mjölk', [{ id: 'lagom:mjolk-standard-3', amount: 1, unit: 'portion:glas' }]],
    ['en kopp kaffe', [{ id: 'lagom:kaffe-bryggt', amount: 1, unit: 'portion:kopp' }]],
    ['en stor banan', [{ id: 'lagom:banan', amount: 1, unit: 'portion:stor' }]],
    ['en liten banan', [{ id: 'lagom:banan', amount: 1, unit: 'portion:liten' }]],
    ['ett par ägg', [{ id: 'lagom:agg-ratt', amount: 2, unit: 'portion:st' }]],
    ['en och en halv dl mjölk', [{ id: 'lagom:mjolk-standard-3', amount: 1.5, unit: 'dl' }]],
    ['2 hg köttfärs', [{ id: 'lagom:notfars-12-stekt', amount: 200, unit: 'g' }]],
    ['0,5 kg potatis', [{ id: 'lagom:potatis-kokt-skalad', amount: 500, unit: 'g' }]],
    ['3 potatisar', [{ id: 'lagom:potatis-kokt-skalad', amount: 3, unit: 'portion:st' }]],
    ['fyra köttbullar', [{ id: 'lagom:kottbullar-fardiga', amount: 4, unit: 'portion:st' }]],
    ['tre pannkakor med sylt', [{ id: 'lagom:pannkakor-tunna', amount: 3, unit: 'portion:st' }, { id: 'lagom:jordgubbssylt', amount: 1, unit: 'msk', side: true }]],
    ['två skivor bröd', [{ id: 'lagom:fullkornsbrod', amount: 2, unit: 'portion:skiva' }]],
    ['2 msk jordnötssmör', [{ id: 'lagom:jordnotssmor-100', amount: 2, unit: 'msk' }]],
    ['en burk tonfisk', [{ id: 'lagom:tonfisk-vatten', amount: 1, unit: 'portion:burk' }]],
    ['mellanmjölk 2 dl', [{ id: 'lagom:mjolk-mellan-1-5', amount: 2, unit: 'dl' }]],
    ['en skål yoghurt', [{ id: 'lagom:yoghurt-naturell-3', amount: 2, unit: 'dl' }]],
    // "Korv med bröd" finns som livsmedel – två korvar med bröd är två sådana, inte korv + en brödskiva.
    ['två korvar med bröd', [{ id: 'lagom:varmkorv-med-brod', amount: 2, unit: 'portion:st' }]],
    ['två korvar och bröd', [{ id: 'lagom:grillkorv', amount: 2, unit: 'portion:st' }, { id: 'lagom:fullkornsbrod', amount: 1, unit: 'portion:skiva' }]],
    ['korv med bröd och en öl', [{ id: 'lagom:varmkorv-med-brod', amount: 1, unit: 'portion:st' }, { id: 'lagom:ol-starkol-lager-5', amount: 1, unit: 'portion:burk' }]],
    [
      'en smörgås med leverpastej och gurka',
      [
        { id: 'lagom:smorgas-leverpastej', amount: 1, unit: 'portion:st' },
        { id: 'lagom:gurka', amount: 1, unit: 'portion:skiva', side: true },
      ],
    ],
    ['sallad med fetaost', [{ id: 'lagom:sallad-blandad', amount: 1, unit: 'portion:nave' }, { id: 'lagom:fetaost', amount: 1, unit: 'portion:portion', side: true }]],
    ['en påse chips', [{ id: 'lagom:chips-lattsaltade', amount: 1, unit: 'portion:pase' }]],
    ['33 cl öl', [{ id: 'lagom:ol-starkol-lager-5', amount: 33, unit: 'cl' }]],
    [
      'lax, potatis och sallad',
      [
        { id: 'lagom:lax-odlad-ugnsbakad', amount: 1, unit: 'portion:portion' },
        { id: 'lagom:potatis-kokt-skalad', amount: 1, unit: 'portion:st' },
        { id: 'lagom:sallad-blandad', amount: 1, unit: 'portion:nave' },
      ],
    ],
    ['en apelsin samt en kaffe', [{ id: 'lagom:apelsin', amount: 1, unit: 'portion:st' }, { id: 'lagom:kaffe-bryggt', amount: 1, unit: 'portion:kopp' }]],
  ]
  it.each(cases)('%j', (text, expected) => {
    const got = summary(text)
    expect(got).toHaveLength(expected.length)
    expected.forEach((e, i) => {
      expect(got[i]).toMatchObject({ id: e.id, amount: e.amount, unit: e.unit, side: e.side ?? false })
    })
  })

  it('delar inte ett livsmedel vars namn innehåller "med" eller "och"', () => {
    expect(summary('kaffe med mjölk')).toEqual([expect.objectContaining({ id: 'lagom:kaffe-med-mjolk', amount: 1, side: false })])
    expect(summary('köttbullar med potatismos och gräddsås')).toEqual([
      expect.objectContaining({ id: 'lagom:kottbullar-potatismos-grasas-lingon' }),
    ])
  })

  it('räknar inte "tolv vindruvor" som 12 dl', () => {
    const [item] = resolveFreeText('tolv vindruvor', deps)
    expect(item.food?.id).toBe('lagom:vindruvor')
    expect(item.grams).toBeLessThan(150)
  })

  it('förstår dikterad text', () => {
    expect(summary('Jag åt två ägg. Sen drack jag en kopp kaffe.')).toEqual([
      expect.objectContaining({ id: 'lagom:agg-ratt', amount: 2, unit: 'portion:st', confidence: 'hog' }),
      expect.objectContaining({ id: 'lagom:kaffe-bryggt', amount: 1, unit: 'portion:kopp', confidence: 'hog', side: false }),
    ])
    expect(summary('Kaffe med mjölk och en kanelbulle')).toEqual([
      expect.objectContaining({ id: 'lagom:kaffe-med-mjolk', side: false }),
      expect.objectContaining({ id: 'lagom:kanelbulle-bageri', side: false }),
    ])
  })

  it('bara en mängd ("2 st") söker inte fram något livsmedel', () => {
    const items = resolveFreeText('ägg och 2 st', deps)
    expect(items).toHaveLength(2)
    expect(items[1].food).toBeUndefined()
    expect(items[1]).toMatchObject({ raw: '2 st', grams: 0, confidence: 'lag' })
  })

  it('ett okänt ord ger en rad utan livsmedel och låg säkerhet', () => {
    const items = resolveFreeText('två ägg och zzqqxxvv', deps)
    expect(items).toHaveLength(2)
    expect(items[1]).toMatchObject({ raw: 'zzqqxxvv', grams: 0, confidence: 'lag' })
    expect(items[1].food).toBeUndefined()
  })

  it('en enhet som livsmedlet saknar ger låg säkerhet men en användbar mängd', () => {
    // Kanelbulle har ingen volym – "2 dl" räknas grovt om till gram.
    const [item] = resolveFreeText('2 dl kanelbulle', deps)
    expect(item.food?.id).toBe('lagom:kanelbulle-bageri')
    expect(item.confidence).toBe('lag')
    expect(item.unit).toBe('g')
    expect(item.grams).toBeGreaterThan(0)
  })

  it('personlig relevans lyfter det man brukar äta bland de närmaste träffarna', () => {
    const plain = resolveFreeText('ägg och mjölk', deps)
    expect(plain[1].food?.id).toBe('lagom:mjolk-standard-3')
    const withUsage = resolveFreeText('ägg och mjölk', {
      search,
      usageBoost: (id) => (id === 'lagom:mjolk-mellan-1-5' ? 120 : 0),
    })
    expect(withUsage[1].food?.id).toBe('lagom:mjolk-mellan-1-5')
  })

  it('senast använda mängd används när ingen mängd angavs', () => {
    const items = resolveFreeText('kaffe och en banan', {
      search,
      lastUsed: (food) => (food.id === 'lagom:kaffe-bryggt' ? { amount: 2, unit: 'portion:kopp' } : undefined),
    })
    expect(items[0]).toMatchObject({ amount: 2, unit: 'portion:kopp' })
    expect(items[1]).toMatchObject({ amount: 1, unit: 'portion:st' })
  })

  it('amountFor räknar om samma mängd när livsmedlet byts', () => {
    const q = parseQuantity('2 dl filmjölk')
    const yoghurt = BUILTIN_FOODS.find((f) => f.id === 'lagom:yoghurt-naturell-3')!
    expect(amountFor(yoghurt, q)).toEqual({ amount: 2, unit: 'dl', ok: true })
  })

  it('tom text ger inga rader', () => {
    expect(resolveFreeText('   ', deps)).toEqual([])
  })
})
