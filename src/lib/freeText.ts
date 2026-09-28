/**
 * Fritextloggning – "två ägg och en smörgås med ost" blir tre rader att lägga i korgen.
 *
 * Tre steg, alla rena och synkrona (en mening tolkas på långt under 5 ms):
 * 1. `splitFreeText` delar texten på " och ", " med ", " samt ", " plus ", komma, +, &, semikolon,
 *    radbrytning och meningsslut ("Två ägg. En banan."). Det som står efter "med" är ett tillbehör
 *    ("smörgås med ost" → ost på smörgåsen), och tillbehören fortsätter över "och" ("med ost och
 *    skinka") fram till nästa komma, mening eller "samt" – eller ett led med egen mängd ("… och en
 *    kopp kaffe"). Decimalkomma ("1,5 dl") och "en och en halv" delar inte, och "ett glas med mjölk"
 *    hålls ihop. Dikterade inledningar ("Jag åt …", "Till frukost drack jag …") tas bort.
 * 2. `parseQuantity` läser mängden i början av ett led: talord (en, ett, två … tolv, halv/halvt,
 *    "ett par" = 2), siffror och bråk ("1/2", "1 1/2", "½", "1,5"), enheter (g, hg, kg, ml, cl, dl,
 *    l, msk, tsk, krm, st) och portionsord ("skivor", "smörgåsar", "glas" … från `PORTION_PLURALS`).
 *    "ca", "cirka" och "ungefär" före mängden hoppas över. Används även för ingrediensrader i recept.
 * 3. `resolveFreeText` letar upp livsmedlet för varje led (via en sökfunktion, t.ex. Lagoms
 *    `searchFoods`) och räknar ut mängd, enhet och gram. Tillbehör utan mängd får en lagom
 *    standardmängd (ost 1 skiva, smör 1 tsk, sylt 1 msk, mjölk 1 dl).
 *
 * Är hela texten namnet på ett livsmedel ("Kaffe med mjölk", "Köttbullar med potatismos och
 * gräddsås") blir det en enda rad – då delas ingenting. Detsamma gäller ett led med tillbehör som
 * tillsammans är ett livsmedel: "två ägg och en smörgås med ost" blir Ägg + Smörgås med ost (osten
 * ingår redan), "två korvar med bröd" blir 2 × Korv med bröd.
 */
import type { Food, UnitKey, VolumeUnit } from '../types'
import { parseSwedishNumber } from './format'
import { foldSv, stemSv } from './search'
import { PORTION_PLURALS, VOLUME_ML, availableUnits, defaultAmount, defaultUnit, gramsFor, isPortionUnit, isVolumeUnit } from './units'

// ---------------------------------------------------------------------------
// 1. Dela upp texten
// ---------------------------------------------------------------------------

export interface FreeTextPart {
  /** Ledet som det skrevs (utan avgränsare). */
  text: string
  /** Tillbehör – stod efter "med" ("smörgås med ost" → ost). */
  side: boolean
}

/** Talord 1–12 (även "ett"). */
const NUMBER_WORDS: Record<string, number> = {
  en: 1,
  ett: 1,
  två: 2,
  tva: 2,
  tre: 3,
  fyra: 4,
  fem: 5,
  sex: 6,
  sju: 7,
  åtta: 8,
  atta: 8,
  nio: 9,
  tio: 10,
  elva: 11,
  tolv: 12,
}

const HALF_WORDS = new Set(['halv', 'halvt', 'halva'])

/** "en och en halv", "två och en halv", "1 och en halv" → "1½", "2½" (innan texten delas på "och"). */
const AND_A_HALF = /(^|[\s,+&;])(\d+|en|ett|två|tva|tre|fyra|fem|sex|sju|åtta|atta|nio|tio|elva|tolv)\s+och\s+(?:en\s+|ett\s+)?(?:halv|halvt|halva)(?=\s|$)/giu

/**
 * Avgränsare: komma (inte decimalkomma), +, &, semikolon, radbrytning, punkt/utropstecken/
 * frågetecken mellan meningar (inte efter förkortningar som "ca."), "och", "samt", "plus", "med".
 * Fångas så att "med" (tillbehör) går att känna igen.
 */
const SEPARATOR = /(\s*(?:,(?!\d)|(?<!\d),|\+|&|;|\r?\n|(?<!(?:^|[\s(])(?:ca|st|m|u|el|resp|t\.ex|bl\.a|kl))[.!?](?=\s))\s*|\s+(?:och|samt|plus|med)\s+)/iu

/** Bindeord som blir kvar ensamma vid kanterna (" , och "). */
const CONNECTORS = new Set(['och', 'med', 'samt', 'plus'])

/** Måltider och tider i dikterad text ("till frukost", "i morse"). */
const MEAL_WORDS = '(?:frukost|lunch|middag|kvällsmat|mellanmål|fika|efterrätt|dessert)(?:en)?'
/** Bindeord och "sen", "också" … först i ett led. */
const LEAD_CONNECTOR = /^(?:(?:och|med|samt|plus|sen|sedan|så|också|även|dessutom)\s+)+/iu
/** "Till frukost …", "I morse …". */
const LEAD_MEAL = new RegExp(`^(?:(?:till|på|som|under)\\s+${MEAL_WORDS}|i\\s+(?:morse|kväll|går))(?:\\s+|$)`, 'iu')
/** "Jag åt …", "Jag har druckit …", "Åt jag …", "Drack …". */
const LEAD_VERB = /^(?:(?:jag|vi)\s+)?(?:(?:har|hade)\s+)?(?:åt|ätit|äter|drack|druckit|dricker|tog|fick|käkade|käkat)(?:\s+(?:jag|vi))?(?:\s+(?:upp|in))?(?:\s+|$)/iu
/** "… till middag", "… i dag", och bindeord sist ("två ägg och" medan man skriver). */
const TRAIL_FILLER = new RegExp(`\\s+(?:(?:till|på|som|under)\\s+${MEAL_WORDS}|i\\s*dag|i\\s*morse|i\\s*kväll|nyss|och|med|samt|plus)$`, 'iu')

/**
 * Ta bort det som inte är mat i ett dikterat led: "Jag åt två ägg" → "två ägg", "Till frukost
 * drack jag en kopp kaffe" → "en kopp kaffe", "och sen en banan" → "en banan".
 */
function stripFiller(text: string): string {
  let t = text.trim()
  for (let i = 0; i < 3; i++) {
    const before = t
    t = t.replace(LEAD_CONNECTOR, '').replace(LEAD_MEAL, '').replace(LEAD_VERB, '').replace(TRAIL_FILLER, '').trim()
    if (t === before) break
  }
  return t
}

/** Kärl och förpackningar som kan stå före "med": "ett glas med mjölk", "en skål med yoghurt". */
const VESSEL_WORDS = new Set(['glas', 'kopp', 'koppar', 'mugg', 'muggar', 'skål', 'skålar', 'tallrik', 'tallrikar', 'burk', 'burkar', 'påse', 'påsar', 'portion', 'portioner', 'bägare', 'flaska', 'flaskor', 'kanna', 'handfull', 'näve'])

/** Ledet är bara en mängd i ett kärl ("ett glas", "2 dl") – då hör det ihop med ledet efter "med". */
function isOnlyQuantity(text: string): boolean {
  const q = parseQuantity(text)
  if (q.name === '' && q.unit !== undefined) return true
  const word = q.name.toLocaleLowerCase('sv-SE')
  return q.amount !== undefined && q.unit === undefined && VESSEL_WORDS.has(word)
}

/** Egen nyckel i ett uppslag (inte ärvd från Object.prototype). */
function has<T extends object>(obj: T, key: string): key is Extract<keyof T, string> {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

/**
 * Dela en fritext i led med information om vilka som är tillbehör.
 *
 * @example splitFreeTextParts('två ägg och en smörgås med ost')
 * // [{ text: 'två ägg', side: false }, { text: 'en smörgås', side: false }, { text: 'ost', side: true }]
 */
export function splitFreeTextParts(text: string): FreeTextPart[] {
  const prepared = text.replace(AND_A_HALF, (_m, pre: string, num: string) => {
    const n = /^\d+$/.test(num) ? num : String(NUMBER_WORDS[num.toLocaleLowerCase('sv-SE')] ?? 1)
    return `${pre}${n}½`
  })
  const pieces = prepared.split(SEPARATOR)
  const parts: FreeTextPart[] = []
  let side = false
  let pendingWith = false
  let lastSep = ''
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]
    if (i % 2 === 1) {
      // Avgränsare
      const sep = piece.trim().toLocaleLowerCase('sv-SE')
      lastSep = sep
      if (sep === 'med') pendingWith = true
      else if (sep !== 'och') side = false
      continue
    }
    const t = stripFiller(piece.trim().replace(/[.!?]+$/u, ''))
    if (!t || CONNECTORS.has(t.toLocaleLowerCase('sv-SE'))) continue
    if (pendingWith) {
      pendingWith = false
      const prev = parts[parts.length - 1]
      // "ett glas med mjölk" – mängden före "med" hör till ledet efter.
      if (prev && isOnlyQuantity(prev.text)) {
        prev.text = `${prev.text} ${t}`
        continue
      }
      if (prev) side = true
    } else if (side && lastSep === 'och' && parseQuantity(t).amount !== undefined) {
      // "smörgås med ost och en kopp kaffe" – ett nytt led med egen mängd är inget tillbehör.
      side = false
    }
    parts.push({ text: t, side })
  }
  return parts
}

/** Dela en fritext i led: "två ägg och en smörgås med ost" → ["två ägg", "en smörgås", "ost"]. */
export function splitFreeText(text: string): string[] {
  return splitFreeTextParts(text).map((p) => p.text)
}

// ---------------------------------------------------------------------------
// 2. Läs mängden
// ---------------------------------------------------------------------------

export interface ParsedQuantity {
  /** Antal/mängd, om det angavs. */
  amount?: number
  /**
   * Enheten som den skrevs, i grundform: 'g', 'hg', 'kg', 'ml', 'cl', 'dl', 'l', 'msk', 'tsk',
   * 'krm', 'st' eller ett portionsord i singular ("skiva", "smörgås", "glas").
   */
  unit?: string
  /** Resten – livsmedlet ("ägg", "kycklingfilé"). */
  name: string
  /** Ledet som det skrevs. */
  raw: string
  /** Storleksord före namnet eller portionen ("en stor banan" → 'stor'). */
  size?: 'liten' | 'stor' | 'medel'
}

/** Måttenheter → grundform. */
const MEASURE_WORDS: Record<string, string> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  hg: 'hg',
  hekto: 'hg',
  kg: 'kg',
  kilo: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  cl: 'cl',
  centiliter: 'cl',
  dl: 'dl',
  deciliter: 'dl',
  l: 'l',
  liter: 'l',
  msk: 'msk',
  matsked: 'msk',
  matskedar: 'msk',
  tsk: 'tsk',
  tesked: 'tsk',
  teskedar: 'tsk',
  krm: 'krm',
  kryddmått: 'krm',
  st: 'st',
  stk: 'st',
  styck: 'st',
  stycken: 'st',
}

/** Portionsord som också är livsmedel – blir aldrig en enhet ("två ägg", "en pizza"). */
const FOOD_NOUNS = new Set([
  'ägg',
  'äggula',
  'äggvita',
  'tortilla',
  'bulle',
  'biff',
  'korv',
  'muffins',
  'kanelbulle',
  'pizza',
  'bar',
  'kaka',
  'drink',
  'hekto',
  'st',
  'dl',
  'cl',
  'msk',
  'tsk',
  'krm',
])

/** Portionsord (singular och plural) → singular. */
const PORTION_WORDS: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const [one, many] of Object.entries(PORTION_PLURALS)) {
    if (FOOD_NOUNS.has(one)) continue
    out[one] = one
    out[many] = one
  }
  // Vanliga ord som inte finns bland portionsetiketterna.
  for (const [w, one] of [
    ['mugg', 'mugg'],
    ['muggar', 'mugg'],
    ['näve', 'näve'],
    ['nävar', 'näve'],
    ['nypa', 'nypa'],
    ['klyftor', 'klyfta'],
    ['portionen', 'portion'],
  ] as const) {
    out[w] = one
  }
  return out
})()

const SIZE_WORDS: Record<string, ParsedQuantity['size']> = {
  liten: 'liten',
  litet: 'liten',
  lilla: 'liten',
  små: 'liten',
  stor: 'stor',
  stort: 'stor',
  stora: 'stor',
  medelstor: 'medel',
  medelstort: 'medel',
  medelstora: 'medel',
}

/** Tal i början: "1 1/2", "1/2", "1½", "½", "1,5", "100" – även direkt följt av enhet ("100g"). */
const LEADING_NUMBER = /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+\s*[½¼¾⅓⅔]|[½¼¾⅓⅔]|\d+(?:[.,]\d+)?)(?=\s|$|\p{L})/u

/** Mängd med enhet sist i ledet ("mellanmjölk 2 dl"). */
const TRAILING_QUANTITY = /\s+(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d*[½¼¾]|\d+(?:[.,]\d+)?)\s*(g|gram|hg|kg|ml|cl|dl|l|liter|msk|tsk|krm|st)$/iu

/**
 * Läs mängd, enhet och namn ur ett led.
 *
 * @example parseQuantity('1 1/2 dl havregryn') // { amount: 1.5, unit: 'dl', name: 'havregryn', raw: '1 1/2 dl havregryn' }
 * @example parseQuantity('två skivor bröd')    // { amount: 2, unit: 'skiva', name: 'bröd', raw: 'två skivor bröd' }
 * @example parseQuantity('halv avokado')       // { amount: 0.5, name: 'avokado', raw: 'halv avokado' }
 */
export function parseQuantity(segment: string): ParsedQuantity {
  const raw = segment.trim()
  // "ca 2 dl mjölk", "ungefär 100 g ris" – ungefärligheten spelar ingen roll för mängden.
  let rest = raw
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/u, '')
    .replace(/^(?:ca\.?|cirka|ungefär|runt|drygt|knappt)\s+(?=[\d½¼¾⅓⅔]|en\s|ett\s|två\s|tre\s|fyra\s|fem\s|sex\s|halv)/iu, '')
    .trim()
  let amount: number | undefined
  let unit: string | undefined
  let size: ParsedQuantity['size']

  const lower = () => rest.toLocaleLowerCase('sv-SE')
  const dropWords = (n: number) => {
    rest = rest.split(' ').slice(n).join(' ')
  }

  // Siffror och bråk.
  const num = LEADING_NUMBER.exec(rest)
  if (num) {
    const value = parseSwedishNumber(num[1])
    if (Number.isFinite(value) && value > 0) {
      amount = value
      rest = rest.slice(num[0].length).trim()
    }
  }

  // Talord: "ett par", "en halv", "ett halvt", "halv", "två" …
  if (amount === undefined) {
    const words = lower().split(' ')
    if (words[0] === 'ett' && words[1] === 'par' && words.length > 2) {
      amount = 2
      dropWords(2)
    } else if ((words[0] === 'en' || words[0] === 'ett') && words[1] !== undefined && HALF_WORDS.has(words[1])) {
      amount = 0.5
      dropWords(2)
    } else if (HALF_WORDS.has(words[0]) && words.length > 1) {
      amount = 0.5
      dropWords(1)
    } else if (has(NUMBER_WORDS, words[0]) && words.length > 1) {
      amount = NUMBER_WORDS[words[0]]
      dropWords(1)
      // "två halva" – sällsynt, men blir rätt.
      const next = lower().split(' ')[0]
      if (HALF_WORDS.has(next) && lower().split(' ').length > 1) {
        amount = amount / 2
        dropWords(1)
      }
    }
  }

  // Storleksord före enheten: "en stor kopp kaffe".
  const readSize = () => {
    const w = lower().split(' ')
    if (w.length > 1 && has(SIZE_WORDS, w[0])) {
      size = SIZE_WORDS[w[0]]
      dropWords(1)
    }
  }
  readSize()

  // Enhet: måttenhet (även direkt efter talet: "100g") eller portionsord följt av ett namn.
  const words = lower().split(' ')
  const first = words[0] ?? ''
  if (has(MEASURE_WORDS, first)) {
    unit = MEASURE_WORDS[first]
    dropWords(1)
  } else if (has(PORTION_WORDS, first) && words.length > 1) {
    unit = PORTION_WORDS[first]
    dropWords(1)
  }

  // Mängden sist: "mellanmjölk 2 dl", "ägg 2 st", "kyckling 150 g".
  if (amount === undefined && unit === undefined) {
    const tail = TRAILING_QUANTITY.exec(rest)
    if (tail) {
      const value = parseSwedishNumber(tail[1])
      if (Number.isFinite(value) && value > 0) {
        amount = value
        unit = MEASURE_WORDS[tail[2].toLocaleLowerCase('sv-SE')]
        rest = rest.slice(0, tail.index).trim()
      }
    }
  }

  // "2 dl av mjölken", "en skiva av brödet".
  if (unit && /^av\s/iu.test(rest)) rest = rest.replace(/^av\s+/iu, '')
  // Storleksord efter enheten: "1 st stor banan".
  if (!size) readSize()

  return { amount, unit, name: rest.trim(), raw, ...(size ? { size } : {}) }
}

// ---------------------------------------------------------------------------
// 3. Slå upp livsmedel och räkna ut mängden
// ---------------------------------------------------------------------------

export interface ParsedItem {
  /** Ledet som det skrevs. */
  raw: string
  /** Bästa träffen – saknas när inget hittades. */
  food?: Food
  /** Andra tänkbara livsmedel (för "Byt"). */
  alternatives: Food[]
  amount: number
  unit: UnitKey
  /** Vikt i gram (0 när livsmedlet saknas eller mängden inte går att räkna om). */
  grams: number
  /** 'hog' när namnet och mängden tolkades säkert, annars 'lag' – då bör användaren titta en gång till. */
  confidence: 'hog' | 'lag'
  /** Tillbehör ("med ost"). */
  side: boolean
  /** Den tolkade mängden – behövs för att räkna om när livsmedlet byts. */
  quantity: ParsedQuantity
}

export interface FreeTextDeps {
  /** Sökning – träffarna i relevansordning (t.ex. `searchFoods(...).map((r) => r.food)`). */
  search: (query: string) => Food[]
  /** Personlig relevans (användning, favoriter) – lyfter livsmedel man brukar äta bland de närmaste träffarna. */
  usageBoost?: (id: string) => number
  /** Senast använda mängd för ett livsmedel – används när ingen mängd angavs. */
  lastUsed?: (food: Food) => { amount: number; unit: UnitKey } | undefined
}

/** Standardmängder för tillbehör utan mängd ("smörgås med ost"). Gram används när enheten saknas. */
const SIDE_DEFAULTS: ReadonlyArray<{ test: RegExp; amount: number; unit: string; grams?: number }> = [
  { test: /(^|\s)(smör|bregott|margarin|lätt ?margarin|matfett|flora)$/u, amount: 1, unit: 'tsk', grams: 5 },
  { test: /(sylt|marmelad|lingon|lingonsylt|äppelmos)$/u, amount: 1, unit: 'msk', grams: 20 },
  { test: /(mjölk|havredryck|mjölkdryck|sojadryck|mandeldryck|havremjölk)$/u, amount: 1, unit: 'dl', grams: 100 },
  // Ost utan skivor (fetaost, mjukost) får livsmedlets vanliga portion i stället.
  { test: /ost$/u, amount: 1, unit: 'skiva' },
]

/** Vanliga kärl utan egen portion hos livsmedlet → volym (dl). */
const VESSEL_DL: Record<string, number> = { glas: 2, kopp: 1.5, mugg: 2.5, skål: 2, tallrik: 3 }

const normalize = (s: string): string => foldSv(s)

/** Livsmedlets namn (och med `synonyms` även en synonym) är exakt sökningen. */
function sameName(food: Food, name: string, synonyms = true): boolean {
  const n = normalize(name)
  if (!n) return false
  if (normalize(food.name) === n) return true
  return synonyms && (food.synonyms ?? []).some((s) => normalize(s) === n)
}

/** Portionsetiketter som är mått eller kärl, inte en styck ("1 dl", "1 portion", "1 näve"). */
const MEASURE_LABEL = /^(på\s+)?(1|en|ett)?\s*(dl|cl|ml|l|msk|tsk|krm|g|portion|liten portion|stor portion|förpackning|paket|påse|burk|näve|handfull|skål|glas|kopp|mugg|klick|nypa|tallrik|skopa|bägare)\b/iu

/** Portionen "1 st", om livsmedlet har en. */
function stUnit(food: Food): UnitKey | undefined {
  const st = food.portions.find((p) => p.id === 'st' || /^\s*1\s+st\b/iu.test(p.label))
  return st ? `portion:${st.id}` : undefined
}

/** Portionen för en styck ("1 st", "1 ägg", "1 köttbulle", "1 skiva"), om livsmedlet har en. */
function pieceUnit(food: Food): UnitKey | undefined {
  const st = food.portions.find((p) => p.id === 'st' || /^\s*1\s+st\b/iu.test(p.label))
  const piece = st ?? food.portions.find((p) => !MEASURE_LABEL.test(p.label.trim()) && sizeOf(p.id, p.label) === undefined)
  return piece ? `portion:${piece.id}` : undefined
}

/** Alla sökord finns (som ord eller ordbörjan, i grundform) i namnet eller synonymerna. */
function coversQuery(food: Food, name: string): boolean {
  const words = normalize(name).split(' ').filter(Boolean)
  if (words.length === 0) return false
  const hay = [food.name, ...(food.synonyms ?? []), food.brand ?? '']
    .map(normalize)
    .join(' ')
    .split(' ')
    .filter(Boolean)
  return words.every((w) => {
    const stem = stemSv(w)
    return hay.some((h) => h === w || h.startsWith(stem) || stemSv(h) === stem || (w.length >= 4 && h.endsWith(w)))
  })
}

/** Går enheten att använda och räkna om för livsmedlet? */
function usable(food: Food, unit: UnitKey): boolean {
  return (unit === 'g' || availableUnits(food).includes(unit)) && Number.isFinite(gramsFor(food, 1, unit))
}

/** Förvald enhet som går att räkna om (annars gram). */
function safeDefault(food: Food): UnitKey {
  const unit = defaultUnit(food)
  return usable(food, unit) ? unit : 'g'
}

/** Portionens substantiv utan antal, vikt och storleksord: "1 stor kafébulle (ca 110 g)" → "stor kafébulle". */
function portionText(label: string): string {
  return label
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*(på\s+)?(1|en|ett)\s+/iu, '')
    .trim()
    .toLocaleLowerCase('sv-SE')
}

/** Portion som passar ett portionsord ("skiva", "glas", "st") och ev. storlek. */
function portionFor(food: Food, word: string, size?: ParsedQuantity['size']): UnitKey | undefined {
  const plural = has(PORTION_PLURALS, word) ? PORTION_PLURALS[word] : undefined
  const matches = food.portions.filter((p) => {
    if (p.id === word) return true
    const text = portionText(p.label)
    const nouns = text.split(/\s+/)
    return nouns.some((n) => n === word || (plural !== undefined && n === plural) || (word.length >= 4 && n.endsWith(word)))
  })
  if (word === 'st' && matches.length === 0) {
    // "2 st ägg": portionen för en styck ("1 ägg (M)").
    const piece = pieceUnit(food)
    const p = piece ? food.portions.find((x) => `portion:${x.id}` === piece) : undefined
    if (p) matches.push(p)
  }
  if (word === 'portion' && matches.length === 0 && food.portions[0]) matches.push(food.portions[0])
  if (matches.length === 0) return undefined
  const sized = size ? matches.find((p) => sizeOf(p.id, p.label) === size) : undefined
  const plain = matches.find((p) => sizeOf(p.id, p.label) === undefined)
  const pick = sized ?? plain ?? matches[0]
  return `portion:${pick.id}`
}

/** Portionen med rätt storlek ("en stor banan" → "1 stor"), om livsmedlet har en sådan. */
function portionBySize(food: Food, size: NonNullable<ParsedQuantity['size']>): UnitKey | undefined {
  const p = food.portions.find((x) => sizeOf(x.id, x.label) === size)
  return p ? `portion:${p.id}` : undefined
}

function sizeOf(id: string, label: string): ParsedQuantity['size'] {
  const t = `${id} ${label}`.toLocaleLowerCase('sv-SE')
  if (/liten|litet|små/u.test(t)) return 'liten'
  if (/medelstor|medel/u.test(t)) return 'medel'
  if (/(^|[\s-])stor|stort|stora/u.test(t)) return 'stor'
  return undefined
}

interface AmountChoice {
  amount: number
  unit: UnitKey
  /** false när mängden gissades (enheten fanns inte för livsmedlet). */
  ok: boolean
}

/** Enhet för ett skrivet ord ('dl', 'skiva', 'st' …), om livsmedlet har den. */
function unitForWord(food: Food, word: string, size?: ParsedQuantity['size']): UnitKey | undefined {
  if (word === 'g') return 'g'
  if (has(VOLUME_ML, word)) {
    const unit: VolumeUnit = word
    if (usable(food, unit)) return unit
    // Portionen heter ibland "1 msk" – använd den när volymen saknas.
    return portionFor(food, word)
  }
  return portionFor(food, word, size)
}

/**
 * Mängd och enhet för ett livsmedel utifrån det som skrevs. Exporteras så att "Byt" kan räkna om
 * samma mängd för ett annat livsmedel.
 */
export function amountFor(food: Food, q: ParsedQuantity, side = false, lastUsed?: FreeTextDeps['lastUsed']): AmountChoice {
  let amount = q.amount
  let word = q.unit
  if (word === 'hg') {
    amount = (amount ?? 1) * 100
    word = 'g'
  } else if (word === 'kg') {
    amount = (amount ?? 1) * 1000
    word = 'g'
  }

  if (word) {
    const unit = unitForWord(food, word, q.size)
    if (unit) return { amount: amount ?? defaultAmount(unit), unit, ok: true }
    // "ett glas juice" utan glasportion: 2 dl.
    if (has(VESSEL_DL, word) && usable(food, 'dl')) return { amount: (amount ?? 1) * VESSEL_DL[word], unit: 'dl', ok: true }
    // Volym utan densitet, okänd portion …: räkna om via ml ≈ g om det är en volym, annars förvalt.
    if (has(VOLUME_ML, word)) {
      const ml = (amount ?? 1) * VOLUME_ML[word]
      return { amount: Math.round(ml), unit: 'g', ok: false }
    }
    const fallback = safeDefault(food)
    return { amount: amount ?? defaultAmount(fallback), unit: fallback, ok: false }
  }

  if (amount === undefined && side) {
    const n = food.name.toLocaleLowerCase('sv-SE').trim()
    const q2 = q.name.toLocaleLowerCase('sv-SE').trim()
    const d = SIDE_DEFAULTS.find((x) => x.test.test(q2) || x.test.test(n))
    if (d) {
      const unit = unitForWord(food, d.unit)
      if (unit) return { amount: d.amount, unit, ok: true }
      if (d.grams !== undefined) return { amount: d.grams, unit: 'g', ok: true }
    }
  }

  if (amount === undefined && lastUsed) {
    const last = lastUsed(food)
    if (last && last.amount > 0 && usable(food, last.unit) && !q.size) return { amount: last.amount, unit: last.unit, ok: true }
  }

  const sized = q.size ? portionBySize(food, q.size) : undefined
  if (amount === undefined) {
    const unit = sized ?? safeDefault(food)
    return { amount: defaultAmount(unit), unit, ok: true }
  }
  // Antal utan enhet: "fyra köttbullar" → 4 × "1 köttbulle", "3 potatisar" → 3 × "1 st".
  const piece = sized ?? pieceUnit(food)
  if (piece) return { amount, unit: piece, ok: true }
  const unit = safeDefault(food)
  if (isPortionUnit(unit)) {
    const label = food.portions.find((p) => `portion:${p.id}` === unit)?.label ?? ''
    // "2 kaffe" → 2 koppar, "2 pasta" → 2 portioner – men "tolv vindruvor" är inte 12 dl.
    if (/^(på\s+)?(1|en|ett)?\s*(dl|cl|ml|l|msk|tsk|krm|g|näve|handfull|nypa|klick)\b/iu.test(label.trim())) {
      return { amount: defaultAmount(unit), unit, ok: false }
    }
    return { amount, unit, ok: true }
  }
  // Antal utan portion: 2 × standardmängden (2 × 100 g), men osäkert.
  if (isVolumeUnit(unit) || unit === 'g') return { amount: amount * defaultAmount(unit), unit, ok: false }
  return { amount, unit, ok: false }
}

/**
 * Välj bland de närmaste träffarna – exakt namn först, annars sökordningen med personlig relevans.
 * Vid ett antal utan enhet ("två korvar") går ett livsmedel som kan räknas i styck före.
 */
function pickFood(results: readonly Food[], name: string, usageBoost?: (id: string) => number, counted = false): Food | undefined {
  const top = results.slice(0, 6)
  const exactName = top.find((f) => sameName(f, name, false))
  if (exactName) return exactName
  if (counted && top[0] && !stUnit(top[0])) {
    const countable = top.slice(1, 3).find((f) => stUnit(f) !== undefined)
    if (countable) return countable
  }
  if (!usageBoost || top.length < 2) return top.find((f) => sameName(f, name)) ?? top[0]
  let best = top[0]
  let bestScore = -Infinity
  top.forEach((f, i) => {
    // Sökordningen väger tyngst och en exakt synonym ger lite extra; användning kan lyfta ett
    // livsmedel några platser ("mjölk" → mellanmjölken man brukar dricka).
    const score = (top.length - i) * 30 + (sameName(f, name) ? 40 : 0) + Math.min(90, Math.max(0, usageBoost(f.id)))
    if (score > bestScore) {
      best = f
      bestScore = score
    }
  })
  return best
}

function resolvePart(part: FreeTextPart, deps: FreeTextDeps): ParsedItem {
  const quantity = parseQuantity(part.text)
  // Bara en mängd ("2 st", "3 dl") – inget att söka på.
  const name = quantity.name
  const results = name ? deps.search(name) : []
  const food = pickFood(results, name, deps.usageBoost, quantity.amount !== undefined && quantity.unit === undefined)
  const alternatives = results.filter((f) => f.id !== food?.id).slice(0, 6)
  if (!food) {
    return {
      raw: part.text,
      alternatives,
      amount: quantity.amount ?? 1,
      unit: 'g',
      grams: 0,
      confidence: 'lag',
      side: part.side,
      quantity,
    }
  }
  const choice = amountFor(food, quantity, part.side, deps.lastUsed)
  const grams = gramsFor(food, choice.amount, choice.unit)
  const certain = choice.ok && Number.isFinite(grams) && grams > 0 && (sameName(food, name) || coversQuery(food, name))
  return {
    raw: part.text,
    food,
    alternatives,
    amount: choice.amount,
    unit: choice.unit,
    grams: Number.isFinite(grams) ? grams : 0,
    confidence: certain ? 'hog' : 'lag',
    side: part.side,
    quantity,
  }
}

/** En hel rätt som ett livsmedel ("Korv med bröd", "Kaffe med mjölk") med den skrivna mängden. */
function dishItem(food: Food, quantity: ParsedQuantity, results: readonly Food[], deps: FreeTextDeps): ParsedItem {
  const choice = amountFor(food, quantity, false, deps.lastUsed)
  const grams = gramsFor(food, choice.amount, choice.unit)
  return {
    raw: quantity.raw,
    food,
    alternatives: results.filter((f) => f.id !== food.id).slice(0, 6),
    amount: choice.amount,
    unit: choice.unit,
    grams: Number.isFinite(grams) ? grams : 0,
    confidence: choice.ok && Number.isFinite(grams) && grams > 0 ? 'hog' : 'lag',
    side: false,
    quantity,
  }
}

/** Plural → singular för portionsord och räknebara livsmedel ("smörgåsar" → "smörgås", "korvar" → "korv"). */
const SINGULAR: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const [one, many] of Object.entries(PORTION_PLURALS)) out[many] = one
  for (const [w, one] of Object.entries(PORTION_WORDS)) if (w !== one) out[w] = one
  return out
})()

/** Namnet som skrivet och med första ordet i singular: "smörgåsar" → ["smörgåsar", "smörgås"]. */
function nameVariants(name: string): string[] {
  const [first, ...rest] = name.split(' ')
  const lower = first.toLocaleLowerCase('sv-SE')
  if (!has(SINGULAR, lower)) return [name]
  return [name, [SINGULAR[lower], ...rest].join(' ')]
}

/**
 * Ett led med tillbehör som tillsammans är ett livsmedel i databasen: "två korvar med bröd" →
 * 2 × Korv med bröd, "en smörgås med ost" → Smörgås med ost (inte smörgås + en extra skiva ost).
 * Provar först alla tillbehör ("köttbullar med potatismos och gräddsås"), sedan färre. Bara exakta
 * namn räknas – en synonym som "knäckebröd med smör" slår inte ihop två saker. Tillbehör med egen
 * mängd ("med 1 dl müsli") blir egna rader.
 */
function resolveDish(parts: readonly FreeTextPart[], start: number, deps: FreeTextDeps): { item: ParsedItem; end: number } | undefined {
  let end = start
  while (end + 1 < parts.length && parts[end + 1].side) end++
  if (end === start) return undefined
  const main = parseQuantity(parts[start].text)
  if (!main.name) return undefined
  for (let k = end; k > start; k--) {
    const sides = parts.slice(start + 1, k + 1)
    const measured = sides.some((p) => {
      const q = parseQuantity(p.text)
      return q.amount !== undefined || q.unit !== undefined
    })
    if (measured) continue
    const tail = sides.map((p) => p.text).join(' och ')
    for (const base of nameVariants(main.name)) {
      const name = `${base} med ${tail}`
      const results = deps.search(name)
      const food = results.slice(0, 6).find((f) => sameName(f, name, false))
      if (food) {
        const quantity: ParsedQuantity = { ...main, name, raw: `${parts[start].text} med ${tail}` }
        return { item: dishItem(food, quantity, results, deps), end: k }
      }
    }
  }
  return undefined
}

/**
 * Tolka en fritext till livsmedel med mängder.
 *
 * ```ts
 * resolveFreeText('två ägg och en smörgås med ost', { search: (q) => searchFoods(index, q).map((r) => r.food) })
 * // → Ägg 2 st, Smörgås med ost 1 st
 * resolveFreeText('tre knäckebröd med smör och ost', deps)
 * // → Knäckebröd 3 skivor, Smör 1 tsk (tillbehör), Ost 1 skiva (tillbehör)
 * ```
 */
export function resolveFreeText(text: string, deps: FreeTextDeps): ParsedItem[] {
  const parts = splitFreeTextParts(text)
  if (parts.length === 0) return []
  if (parts.length > 1) {
    // Hela texten är ett livsmedel ("Kaffe med mjölk", "Ägg och bacon") – dela inte.
    const whole = parseQuantity(parts.map((p, i) => (i === 0 ? p.text : `${p.side && !parts[i - 1].side ? 'med' : 'och'} ${p.text}`)).join(' '))
    if (whole.name) {
      const results = deps.search(whole.name)
      // Bara namnet – en synonym som "knäckebröd med smör" ska inte slå ihop två saker.
      const exact = results.slice(0, 6).find((f) => sameName(f, whole.name, false))
      if (exact) return [dishItem(exact, whole, results, deps)]
    }
  }
  const items: ParsedItem[] = []
  for (let i = 0; i < parts.length; i++) {
    const dish = parts[i].side ? undefined : resolveDish(parts, i, deps)
    if (dish) {
      items.push(dish.item)
      i = dish.end
    } else {
      items.push(resolvePart(parts[i], deps))
    }
  }
  return items
}
