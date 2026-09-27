/**
 * Svenska köksmått och omräkning till gram.
 *
 * Svenska recept anger ofta torra varor i volym ("2 dl havregryn"). Med livsmedlets
 * densitet (g/ml) kan Lagom räkna om volym till vikt korrekt.
 */
import type { Food, UnitKey, VolumeUnit } from '../types'
import { formatNumber } from './format'

export const VOLUME_ML: Record<VolumeUnit, number> = {
  krm: 1,
  tsk: 5,
  msk: 15,
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1000,
}

export const UNIT_LABELS: Record<Exclude<UnitKey, `portion:${string}`>, { short: string; long: string }> = {
  g: { short: 'g', long: 'gram' },
  kg: { short: 'kg', long: 'kilogram' },
  krm: { short: 'krm', long: 'kryddmått' },
  tsk: { short: 'tsk', long: 'tesked' },
  msk: { short: 'msk', long: 'matsked' },
  ml: { short: 'ml', long: 'milliliter' },
  cl: { short: 'cl', long: 'centiliter' },
  dl: { short: 'dl', long: 'deciliter' },
  l: { short: 'l', long: 'liter' },
}

export function isVolumeUnit(unit: UnitKey): unit is VolumeUnit {
  return unit in VOLUME_ML
}

export function isPortionUnit(unit: UnitKey): unit is `portion:${string}` {
  return unit.startsWith('portion:')
}

/** Densitet i g/ml. Flytande utan angiven densitet antas väga 1 g/ml. */
export function densityOf(food: Pick<Food, 'density' | 'liquid'>): number | undefined {
  if (food.density && food.density > 0) return food.density
  if (food.liquid) return 1
  return undefined
}

/** Vilka enheter som går att använda för ett livsmedel (portioner först). */
export function availableUnits(food: Pick<Food, 'portions' | 'density' | 'liquid'>): UnitKey[] {
  const units: UnitKey[] = food.portions.map((p) => `portion:${p.id}` as const)
  units.push('g')
  if (densityOf(food) !== undefined) {
    if (food.liquid) units.push('dl', 'cl', 'ml', 'msk', 'tsk', 'l')
    else units.push('dl', 'msk', 'tsk', 'krm')
  }
  return units
}

/** Förvald enhet: första portionen, annars dl för drycker, annars gram. */
export function defaultUnit(food: Pick<Food, 'portions' | 'density' | 'liquid'>): UnitKey {
  if (food.portions.length > 0) return `portion:${food.portions[0].id}`
  if (food.liquid) return 'dl'
  return 'g'
}

/** Förvald mängd för en enhet. */
export function defaultAmount(unit: UnitKey): number {
  if (unit === 'g') return 100
  if (unit === 'ml') return 200
  if (unit === 'cl') return 33
  if (unit === 'dl') return 2
  return 1
}

/**
 * Gram för en mängd i en viss enhet. Returnerar NaN om enheten inte kan räknas om
 * (t.ex. volym utan densitet eller okänd portion).
 */
export function gramsFor(food: Pick<Food, 'portions' | 'density' | 'liquid'>, amount: number, unit: UnitKey): number {
  if (!Number.isFinite(amount) || amount < 0) return Number.NaN
  if (unit === 'g') return amount
  if (unit === 'kg') return amount * 1000
  if (isVolumeUnit(unit)) {
    const d = densityOf(food)
    return d === undefined ? Number.NaN : amount * VOLUME_ML[unit] * d
  }
  if (isPortionUnit(unit)) {
    const id = unit.slice('portion:'.length)
    const p = food.portions.find((x) => x.id === id)
    return p ? amount * p.grams : Number.NaN
  }
  return Number.NaN
}

/** Kort etikett för en enhet, t.ex. "dl" eller "skiva". */
export function unitLabel(food: Pick<Food, 'portions'>, unit: UnitKey): string {
  if (isPortionUnit(unit)) {
    const id = unit.slice('portion:'.length)
    return food.portions.find((p) => p.id === id)?.label ?? 'portion'
  }
  return UNIT_LABELS[unit as keyof typeof UNIT_LABELS]?.short ?? unit
}

/** Pluralformer för vanliga portionsord i livsmedelsdatabasen ("skiva" → "skivor"). */
export const PORTION_PLURALS: Record<string, string> = {
  st: 'st',
  ägg: 'ägg',
  äggula: 'äggulor',
  äggvita: 'äggvitor',
  klyfta: 'klyftor',
  förpackning: 'förpackningar',
  portion: 'portioner',
  tortilla: 'tortillas',
  platta: 'plattor',
  påse: 'påsar',
  tärning: 'tärningar',
  knippe: 'knippen',
  skiva: 'skivor',
  burk: 'burkar',
  bit: 'bitar',
  kaka: 'kakor',
  stjälk: 'stjälkar',
  klick: 'klickar',
  filé: 'filéer',
  kruka: 'krukor',
  ask: 'askar',
  huvud: 'huvuden',
  kvist: 'kvistar',
  nypa: 'nypor',
  kopp: 'koppar',
  flaska: 'flaskor',
  paket: 'paket',
  tub: 'tuber',
  kula: 'kulor',
  skopa: 'skopor',
  handfull: 'handfullar',
  näve: 'nävar',
  blad: 'blad',
  bukett: 'buketter',
  ring: 'ringar',
  rad: 'rader',
  glas: 'glas',
  smörgås: 'smörgåsar',
  macka: 'mackor',
  tallrik: 'tallrikar',
  skål: 'skålar',
  bägare: 'bägare',
  slev: 'slevar',
  kanna: 'kannor',
  drink: 'drinkar',
  skvätt: 'skvättar',
  hekto: 'hekto',
  bulle: 'bullar',
  biff: 'biffar',
  korv: 'korvar',
  muffins: 'muffins',
  kanelbulle: 'kanelbullar',
  pizza: 'pizzor',
  bar: 'bars',
  dl: 'dl',
  cl: 'cl',
  msk: 'msk',
  tsk: 'tsk',
  krm: 'krm',
}

/** Adjektiv i portionsetiketter ("1 liten burk", "1 st medelstor") och deras pluralform. */
const ADJECTIVE_PLURALS: Record<string, string> = {
  hel: 'hela',
  helt: 'hela',
  halv: 'halva',
  liten: 'små',
  litet: 'små',
  stor: 'stora',
  stort: 'stora',
  medelstor: 'medelstora',
  medelstort: 'medelstora',
}

/** Portionsord i plural – även sammansättningar ("hamburgerbiff" → "hamburgerbiffar"). */
function pluralNoun(noun: string): string | undefined {
  const lower = noun.toLocaleLowerCase('sv-SE')
  if (lower in PORTION_PLURALS) return PORTION_PLURALS[lower]
  if (lower.includes('/')) {
    const parts = lower.split('/').map(pluralNoun)
    return parts.every((x) => x !== undefined) ? parts.join('/') : undefined
  }
  // Sammansättning: böj efterledet (minst tre bokstäver, så att "st" inte matchar vad som helst).
  const tail = Object.keys(PORTION_PLURALS)
    .filter((k) => k.length >= 3 && lower.length > k.length && lower.endsWith(k))
    .sort((a, b) => b.length - a.length)[0]
  return tail ? lower.slice(0, -tail.length) + PORTION_PLURALS[tail] : undefined
}

/** Portionsord med adjektiv i plural: "liten portion" → "små portioner". undefined om ordet är okänt. */
function pluralPhrase(phrase: string): string | undefined {
  const words = phrase.split(/\s+/)
  const nounIndex = words.findIndex((w) => !(w.toLocaleLowerCase('sv-SE') in ADJECTIVE_PLURALS))
  if (nounIndex < 0) return undefined
  const noun = pluralNoun(words[nounIndex])
  if (noun === undefined) return undefined
  return words
    .map((w, i) => (i === nounIndex ? noun : (ADJECTIVE_PLURALS[w.toLocaleLowerCase('sv-SE')] ?? w)))
    .join(' ')
}

/** Antal portioner i välbekant form: 0,5 → "½", 1,5 → "1½", 0,4 → "0,4". */
function formatCount(value: number): string {
  const whole = Math.floor(value + 1e-9)
  const rest = value - whole
  const glyph = Math.abs(rest - 0.25) < 1e-6 ? '¼' : Math.abs(rest - 0.5) < 1e-6 ? '½' : Math.abs(rest - 0.75) < 1e-6 ? '¾' : ''
  if (glyph) return whole > 0 ? `${whole}${glyph}` : glyph
  return formatNumber(value, 2)
}

/** Etiketten anger redan vikten ("1 smörgås (ca 62 g)", "1 portion (8 st, ca 160 g)"). */
const WEIGHT_IN_TEXT = /\d\s*k?g\b/i
/** Ett mått som gäller EN portion ("ca 62 g", "1,5 dl", "8 st", "1/8 pizza") – stämmer inte för flera. */
const PER_PORTION_MEASURE = /^(ca\s+)?[\d½¼¾]/i

/**
 * Läsbar mängd för en portion utan upprepningar:
 * - `1 × "1 glas (2 dl)"` → "1 glas (2 dl, 206 g)"
 * - `1 × "1 smörgås (ca 62 g)"` → "1 smörgås (ca 62 g)" (vikten står redan i etiketten)
 * - `2 × "1 smörgås (ca 62 g)"` → "2 smörgåsar (124 g)"
 * - `2 × "1 portion (okokt, 0,75 dl)"` → "2 portioner (okokt, 150 g)"
 * - `1 × "på 1 smörgås (5 g)"` → "på 1 smörgås (5 g)" (inget "1 " framför)
 * - `2 × "på 1 smörgås (5 g)"` → "2 × på 1 smörgås (10 g)"
 */
export function formatPortionAmount(label: string, amount: number, grams?: number): string {
  const trimmed = label.trim() || 'portion'
  const paren = trimmed.match(/^(.*?)\s*\(([^()]*)\)$/)
  const head = paren ? paren[1] : trimmed
  // Dela bara på ", " – decimalkomma ("1,5 dl") har inget mellanslag efter kommat.
  let notes = paren ? paren[2].split(/,\s+/).map((x) => x.trim()).filter(Boolean) : []
  const gramsText = grams !== undefined && Number.isFinite(grams) ? `${formatNumber(grams, grams < 10 ? 1 : 0)} g` : undefined
  const single = Math.abs(amount - 1) < 1e-9

  let text: string
  if (single) {
    text = head
  } else {
    // Måtten i etiketten gäller en portion – ersätts av den totala vikten.
    notes = notes.filter((n) => !PER_PORTION_MEASURE.test(n))
    const one = head.match(/^(?:1|en|ett)\s+(.+)$/i)
    const qty = formatCount(amount)
    if (one && amount < 1) text = `${qty} ${one[1]}`
    else if (one) {
      const many = pluralPhrase(one[1])
      text = many ? `${qty} ${many}` : `${qty} × ${one[1]}`
    } else text = `${qty} × ${head}`
  }
  if (gramsText && !(single && notes.some((n) => WEIGHT_IN_TEXT.test(n)))) notes.push(gramsText)
  return notes.length > 0 ? `${text} (${notes.join(', ')})` : text
}

/**
 * Läsbar mängd: "2 dl", "1 st (medel)", "150 g", "2 skivor". Med `withGrams` visas vikten inom
 * parentes – "2 dl (76 g)", "1 glas (2 dl, 206 g)" – men aldrig två gånger.
 */
export function formatAmount(
  food: Pick<Food, 'portions' | 'density' | 'liquid'>,
  amount: number,
  unit: UnitKey,
  withGrams = false,
): string {
  const amt = formatNumber(amount, amount < 10 ? 2 : 0)
  if (unit === 'g') return `${amt} g`
  const grams = gramsFor(food, amount, unit)
  if (isPortionUnit(unit)) return formatPortionAmount(unitLabel(food, unit), amount, withGrams ? grams : undefined)
  const tail = withGrams && Number.isFinite(grams) ? ` (${formatNumber(grams, 0)} g)` : ''
  return `${amt} ${unitLabel(food, unit)}${tail}`
}
