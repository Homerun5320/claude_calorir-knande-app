/** Testlivsmedel för flödet "Lägg till mat" (används bara i tester). */
import type { Food } from '../../types'

export const bulle: Food = {
  id: 'lagom:kanelbulle',
  name: 'Kanelbulle',
  source: 'lagom',
  category: 'bakverk',
  nutrients: { kcal: 345, protein: 6.8, carbs: 48, fat: 13.5, fiber: 2.2 },
  portions: [
    { id: 'st', label: '1 st (medel)', grams: 60 },
    { id: 'stor', label: '1 stor kafébulle (ca 110 g)', grams: 110 },
  ],
}

export const mjolk: Food = {
  id: 'lagom:mjolk',
  name: 'Mjölk mellan 1,5 % fett',
  source: 'lagom',
  category: 'mejeri',
  nutrients: { kcal: 46, protein: 3.5, carbs: 4.8, fat: 1.5 },
  portions: [{ id: 'glas', label: '1 glas', grams: 200 }],
  density: 1.03,
  liquid: true,
}

export const havregryn: Food = {
  id: 'lagom:havregryn',
  name: 'Havregryn',
  source: 'lagom',
  category: 'spannmal',
  nutrients: { kcal: 370, protein: 13, carbs: 59, fat: 7, fiber: 10, wholegrain: 100 },
  portions: [],
  density: 0.35,
}

export const lax: Food = {
  id: 'lagom:lax',
  name: 'Lax, ugnsbakad',
  source: 'lagom',
  category: 'fisk',
  nutrients: { kcal: 200, protein: 22, carbs: 0, fat: 12 },
  portions: [{ id: 'bit', label: '1 bit', grams: 125 }],
}

export const offBar: Food = {
  id: 'off:7310865000637',
  name: 'Proteinbar',
  brand: 'Testmärket',
  source: 'openfoodfacts',
  category: 'kosttillskott',
  nutrients: { kcal: 380, protein: 30, carbs: 35, fat: 12 },
  portions: [{ id: 'serving', label: '1 bar (55 g)', grams: 55 }],
  barcode: '7310865000637',
}

export const unknownEnergy: Food = {
  id: 'custom:okand',
  name: 'Okänd sås',
  source: 'custom',
  category: 'sas_krydda',
  nutrients: {},
  portions: [],
}
