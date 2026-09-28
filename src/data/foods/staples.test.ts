/**
 * Tester för basvarorna per sökord. Kör: npx vitest run src/data/foods/staples.test.ts
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_FOODS } from './index'
import { FOOD_ALIASES } from './aliases'
import { STAPLE_FOODS } from './staples'
import { isCompositeFood, normalizeSv } from '../../lib/search'

const byId = new Map(BUILTIN_FOODS.map((f) => [f.id, f]))

/** Vardagliga sökord som ägaren vill ska ge basvaran först. */
const REQUIRED_WORDS = [
  'kyckling', 'kött', 'nöt', 'nötkött', 'färs', 'gris', 'fläsk', 'lamm', 'korv', 'pålägg', 'fisk', 'lax', 'torsk',
  'räkor', 'ägg', 'mjölk', 'fil', 'filmjölk', 'yoghurt', 'kvarg', 'ost', 'smör', 'grädde', 'bröd', 'knäckebröd',
  'gröt', 'havregryn', 'flingor', 'pasta', 'ris', 'potatis', 'bönor', 'linser', 'kikärtor', 'tofu', 'havredryck',
  'äpple', 'banan', 'apelsin', 'bär', 'tomat', 'gurka', 'sallad', 'morot', 'lök', 'broccoli', 'avokado', 'nötter',
  'kaffe', 'te', 'juice', 'öl', 'vin', 'läsk', 'choklad', 'godis', 'glass', 'bulle', 'kaka',
]

describe('STAPLE_FOODS', () => {
  it('täcker alla vardagliga sökord', () => {
    for (const word of REQUIRED_WORDS) expect(STAPLE_FOODS[word]?.length, word).toBeGreaterThan(0)
  })

  it('har normaliserade sökord (gemener, med å/ä/ö)', () => {
    for (const word of Object.keys(STAPLE_FOODS)) expect(normalizeSv(word), word).toBe(word)
  })

  it('pekar bara på dagens livsmedel – inga borttagna id:n och inga dubbletter', () => {
    for (const [word, ids] of Object.entries(STAPLE_FOODS)) {
      expect(new Set(ids).size, word).toBe(ids.length)
      for (const id of ids) {
        expect(byId.has(id), `${word}: ${id}`).toBe(true)
        expect(FOOD_ALIASES.has(id), `${word}: ${id} är ett alias`).toBe(false)
      }
    }
  })

  it('innehåller grundläggande livsmedel, inte sammansatta rätter', () => {
    for (const [word, ids] of Object.entries(STAPLE_FOODS)) {
      for (const id of ids) expect(isCompositeFood(byId.get(id)!), `${word}: ${id}`).toBe(false)
    }
  })

  it('har alla kycklingens basvaror (fågel och chark med kyckling i namnet)', () => {
    const chicken = BUILTIN_FOODS.filter((f) => /kyckling|chicken/i.test(f.name) && !isCompositeFood(f)).map((f) => f.id)
    expect([...STAPLE_FOODS.kyckling].sort()).toEqual(chicken.sort())
    expect(STAPLE_FOODS.kyckling[0]).toBe('lagom:kycklingfile-stekt')
  })
})
