/**
 * Svenska köksmått och omräkning till gram.
 *
 * Svenska recept anger ofta torra varor i volym ("2 dl havregryn"). Med livsmedlets
 * densitet (g/ml) kan Lagom räkna om volym till vikt korrekt.
 *
 * Kött, fågel, fisk, pasta, ris, gryn och torkade baljväxter anges tillagade. Har livsmedlet
 * `rawWeight` kan mängden ändå anges i rå/okokt vikt – 'g-ra' ("g rå", "g okokt") och, med
 * densitet för den okokta varan, 'dl-ra' ("dl okokt") – och Lagom räknar om till tillagad vikt.
 */
import type { Food, RawUnit, RawWeight, UnitKey, VolumeUnit } from '../types'
import { formatNumber } from './format'

/** De fält i ett livsmedel som behövs för att räkna om mängder till gram. */
export type UnitFood = Pick<Food, 'portions' | 'density' | 'liquid' | 'rawWeight'>

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
  // Generiska etiketter – `unitLabel` anger rätt ord för livsmedlet ("g okokt", "g torkad", "g fryst").
  'g-ra': { short: 'g rå', long: 'gram rå vikt' },
  'dl-ra': { short: 'dl okokt', long: 'deciliter okokt' },
}

/** Vad den otillagade varan kallas: "rå", "okokt", "torkad", "fryst". */
export const RAW_KIND_LABELS: Record<RawWeight['kind'], string> = {
  ra: 'rå',
  okokt: 'okokt',
  torkad: 'torkad',
  fryst: 'fryst',
}

/** Samma ord i neutrum ("väg rått", "väg torkat") – "okokt" och "fryst" böjs inte. */
const RAW_KIND_NEUTER: Record<RawWeight['kind'], string> = {
  ra: 'rått',
  okokt: 'okokt',
  torkad: 'torkat',
  fryst: 'fryst',
}

/** true för enheter i rå/okokt vikt ('g-ra', 'dl-ra'). */
export function isRawUnit(unit: UnitKey): unit is RawUnit {
  return unit === 'g-ra' || unit === 'dl-ra'
}

/** Ordet för den otillagade varan för ett livsmedel ("rå", "okokt", "torkad", "fryst"). */
export function rawKindLabel(food: Pick<Food, 'rawWeight'>, unit: RawUnit = 'g-ra'): string {
  const kind = food.rawWeight?.kind
  if (kind) return RAW_KIND_LABELS[kind]
  return unit === 'dl-ra' ? 'okokt' : 'rå'
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

/** Giltig omräkning från rå/okokt vikt, annars undefined. */
function rawWeightOf(food: Pick<Food, 'rawWeight'>): RawWeight | undefined {
  const rw = food.rawWeight
  return rw && Number.isFinite(rw.factor) && rw.factor > 0 ? rw : undefined
}

/** Densitet (g/ml) för den okokta varan, om den är känd. */
function rawDensityOf(food: Pick<Food, 'rawWeight'>): number | undefined {
  const d = rawWeightOf(food)?.density
  return d !== undefined && Number.isFinite(d) && d > 0 ? d : undefined
}

/**
 * Vilka enheter som går att använda för ett livsmedel (portioner först). Med `rawWeight` kommer
 * "g rå/okokt" direkt efter gram, och "dl okokt" efter den när den okokta varans densitet är känd.
 */
export function availableUnits(food: UnitFood): UnitKey[] {
  const units: UnitKey[] = food.portions.map((p) => `portion:${p.id}` as const)
  units.push('g')
  if (rawWeightOf(food)) {
    units.push('g-ra')
    if (rawDensityOf(food) !== undefined) units.push('dl-ra')
  }
  if (densityOf(food) !== undefined) {
    if (food.liquid) units.push('dl', 'cl', 'ml', 'msk', 'tsk', 'l')
    else units.push('dl', 'msk', 'tsk', 'krm')
  }
  return units
}

/** Förvald enhet: första portionen, annars dl för drycker, annars gram. */
export function defaultUnit(food: UnitFood): UnitKey {
  if (food.portions.length > 0) return `portion:${food.portions[0].id}`
  if (food.liquid) return 'dl'
  return 'g'
}

/** Förvald mängd för en enhet. */
export function defaultAmount(unit: UnitKey): number {
  if (unit === 'g' || unit === 'g-ra') return 100
  if (unit === 'ml') return 200
  if (unit === 'cl') return 33
  if (unit === 'dl') return 2
  return 1
}

/**
 * Gram för en mängd i en viss enhet. Returnerar NaN om enheten inte kan räknas om
 * (t.ex. volym utan densitet eller okänd portion).
 */
export function gramsFor(food: UnitFood, amount: number, unit: UnitKey): number {
  if (!Number.isFinite(amount) || amount < 0) return Number.NaN
  if (unit === 'g') return amount
  if (unit === 'kg') return amount * 1000
  if (isRawUnit(unit)) {
    const raw = rawGramsFor(food, amount, unit)
    const rw = rawWeightOf(food)
    return rw && Number.isFinite(raw) ? raw * rw.factor : Number.NaN
  }
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

/**
 * Vikten i gram av den RÅA/OKOKTA varan för en mängd i 'g-ra' eller 'dl-ra' ("1 dl okokt ris" →
 * 85 g). NaN för andra enheter och när omräkningen saknas.
 */
export function rawGramsFor(food: Pick<Food, 'rawWeight'>, amount: number, unit: UnitKey): number {
  if (!Number.isFinite(amount) || amount < 0 || !rawWeightOf(food)) return Number.NaN
  if (unit === 'g-ra') return amount
  if (unit === 'dl-ra') {
    const d = rawDensityOf(food)
    return d === undefined ? Number.NaN : amount * VOLUME_ML.dl * d
  }
  return Number.NaN
}

/** Kort etikett för en enhet, t.ex. "dl", "skiva", "g rå" eller "dl okokt". */
export function unitLabel(food: Pick<Food, 'portions' | 'rawWeight'>, unit: UnitKey): string {
  if (isPortionUnit(unit)) {
    const id = unit.slice('portion:'.length)
    return food.portions.find((p) => p.id === id)?.label ?? 'portion'
  }
  if (isRawUnit(unit)) return `${unit === 'dl-ra' ? 'dl' : 'g'} ${rawKindLabel(food, unit)}`
  return UNIT_LABELS[unit as keyof typeof UNIT_LABELS]?.short ?? unit
}

/**
 * Hjälptext för rå/okokt vikt: "Väg rått – Lagom räknar om till tillagad vikt (1 g rå ≈ 0,75 g
 * tillagat)." Tom sträng när livsmedlet saknar omräkning.
 */
export function rawWeightHint(food: Pick<Food, 'rawWeight'>, unit: RawUnit = 'g-ra'): string {
  const rw = rawWeightOf(food)
  if (!rw) return ''
  const kind = RAW_KIND_LABELS[rw.kind]
  const verb = `${unit === 'dl-ra' ? 'Mät' : 'Väg'} ${RAW_KIND_NEUTER[rw.kind]}`
  const cooked = (g: number) => `${formatNumber(g, g < 10 ? 2 : 0)} g tillagat`
  if (unit === 'dl-ra') {
    const perDl = gramsFor({ portions: [], rawWeight: rw }, 1, 'dl-ra')
    if (Number.isFinite(perDl)) return `${verb} – Lagom räknar om till tillagad vikt (1 dl ${kind} ≈ ${cooked(perDl)}).`
  }
  return `${verb} – Lagom räknar om till tillagad vikt (1 g ${kind} ≈ ${cooked(rw.factor)}).`
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
 * Läsbar mängd: "2 dl", "1 st (medel)", "150 g", "2 skivor", "150 g rå". Med `withGrams` visas
 * vikten inom parentes – "2 dl (76 g)", "1 glas (2 dl, 206 g)", "150 g rå (113 g tillagat)" – men
 * aldrig två gånger.
 */
export function formatAmount(food: UnitFood, amount: number, unit: UnitKey, withGrams = false): string {
  const amt = formatNumber(amount, amount < 10 ? 2 : 0)
  if (unit === 'g') return `${amt} g`
  const grams = gramsFor(food, amount, unit)
  if (isPortionUnit(unit)) return formatPortionAmount(unitLabel(food, unit), amount, withGrams ? grams : undefined)
  if (isRawUnit(unit)) {
    // "150 g rå (113 g tillagat)", "100 g torkad (230 g tillagat)", "1 dl okokt (230 g tillagat)".
    const head = `${amt} ${unitLabel(food, unit)}`
    return withGrams && Number.isFinite(grams) ? `${head} (${formatNumber(grams, 0)} g tillagat)` : head
  }
  const tail = withGrams && Number.isFinite(grams) ? ` (${formatNumber(grams, 0)} g)` : ''
  return `${amt} ${unitLabel(food, unit)}${tail}`
}
