#!/usr/bin/env node
/**
 * Importerar hela Livsmedelsverkets livsmedelsdatabas till public/data/livsmedelsverket.json.
 *
 *   npm run data:lmv
 *   node scripts/import-livsmedelsverket.mjs [--limit=50] [--concurrency=4] [--page-size=500]
 *                                            [--out=public/data/livsmedelsverket.json] [--with-classes]
 *                                            [--base-url=https://…/api/v1]
 *
 * Kräver Node 22+ och internetanslutning. Inga beroenden.
 *
 * Skriptet går sidvis igenom API:t (https://dataportal.livsmedelsverket.se/livsmedel/api/v1),
 * hämtar näringsvärden för varje livsmedel med högst 4 samtidiga anrop, gör omförsök med
 * exponentiell backoff (och respekterar Retry-After) och skriver en kompakt JSON-fil:
 *
 *   { "meta": { source, attribution, version, generatedAt, count, … }, "foods": [Food, …] }
 *
 * Appen läser filen lazy via src/lib/foodRepo.ts (livsmedlen får källan "livsmedelsverket").
 *
 * OBS: Mappningen nedan är en fristående JavaScript-kopia av src/lib/livsmedelsverket.ts och
 * normalizeSv i src/lib/search.ts (Node kan inte importera appens TypeScript). Håll dem i synk –
 * src/lib/livsmedelsverket.test.ts jämför tabeller och resultat mellan kopiorna.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const API_BASE = 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1'
export const ATTRIBUTION = 'Källa: Livsmedelsverkets livsmedelsdatabas'
const USER_AGENT = 'Lagom-livsmedelsimport/1.0 (Node.js; engångsimport av öppna data)'
const KJ_PER_KCAL = 4.184

// ---------------------------------------------------------------------------
// Normalisering – kopia av normalizeSv (src/lib/search.ts)
// ---------------------------------------------------------------------------

const COMBINING = /([ao])([̈̊])|[̀-ͯ]/g
const DECIMAL = /(\d)[.,](?=\d)/g
const APOSTROPHES = /['’´`]/g
const NON_WORD = /[^\p{L}\p{N}\uE000]+/gu
const SPECIAL_RE = /[æøßœ]/g
const SPECIAL = { æ: 'ä', ø: 'ö', ß: 'ss', œ: 'oe' }

/** @param {string} input */
export function normalizeSv(input) {
  if (!input) return ''
  let s = input.normalize('NFKC').toLowerCase()
  s = s.replace(SPECIAL_RE, (c) => SPECIAL[c] ?? c)
  s = s
    .normalize('NFD')
    .replace(COMBINING, (_m, base, mark) => (base ? base + mark : ''))
    .normalize('NFC')
  s = s.replace(DECIMAL, '$1\uE000').replace(APOSTROPHES, '').replace(NON_WORD, ' ').replace(/\uE000/g, ',')
  return s.trim()
}

// ---------------------------------------------------------------------------
// Näringsämnen – kopia av NUTRIENTS (enheter, lmvCode) och mapLmvNutrients
// ---------------------------------------------------------------------------

/** Lagoms enhet per näringsämne (src/lib/nutrients.ts). */
export const NUTRIENT_UNITS = {
  kcal: 'kcal', protein: 'g', carbs: 'g', sugars: 'g', addedSugar: 'g', fiber: 'g', wholegrain: 'g', fat: 'g',
  satFat: 'g', monoFat: 'g', polyFat: 'g', omega3: 'g', cholesterol: 'mg', salt: 'g', alcohol: 'g', caffeine: 'mg',
  vitA: 'µg', vitD: 'µg', vitE: 'mg', vitK: 'µg', vitC: 'mg', thiamin: 'mg', riboflavin: 'mg', niacin: 'mg',
  vitB6: 'mg', folate: 'µg', vitB12: 'µg', calcium: 'mg', iron: 'mg', magnesium: 'mg', potassium: 'mg',
  sodium: 'mg', phosphorus: 'mg', zinc: 'mg', selenium: 'µg', iodine: 'µg',
}

/** EuroFIR-koder från NUTRIENTS[k].lmvCode (utom energi som hanteras separat). */
export const LMV_CODES = {
  PROT: 'protein', CHO: 'carbs', SUGAR: 'sugars', SUGAR_ADDED: 'addedSugar', FIBT: 'fiber', WHOLEGRAIN: 'wholegrain',
  FAT: 'fat', FASAT: 'satFat', FAMS: 'monoFat', FAPU: 'polyFat', CHORL: 'cholesterol', NACL: 'salt', ALC: 'alcohol',
  VITA: 'vitA', VITD: 'vitD', VITE: 'vitE', VITK: 'vitK', VITC: 'vitC', THIA: 'thiamin', RIBF: 'riboflavin',
  NIA: 'niacin', VITB6: 'vitB6', FOL: 'folate', VITB12: 'vitB12', CA: 'calcium', FE: 'iron', MG: 'magnesium',
  K: 'potassium', NA: 'sodium', P: 'phosphorus', ZN: 'zinc', SE: 'selenium', ID: 'iodine',
}

/** @type {ReadonlyArray<readonly [string, string, number]>} */
const EXTRA_CODES = [
  ['NIAEQ', 'niacin', 1],
  ['CHOAVL', 'carbs', 0],
  ['FIBTG', 'fiber', 0],
  ['FAPUN3', 'omega3', 0],
  ['CHOLE', 'cholesterol', 0],
  ['TOCPHA', 'vitE', -1],
  ['VITK1', 'vitK', -1],
  ['FOLFD', 'folate', -1],
  ['CAFFN', 'caffeine', 0],
  ['SUGAR_ADDED', 'addedSugar', 0],
  ['WHOLEGRAIN', 'wholegrain', 0],
]

/** @type {ReadonlyArray<readonly [string, string, number]>} */
const FORK_CODES = [
  ['prot', 'protein', 0],
  ['kolh', 'carbs', 0],
  ['fett', 'fat', 0],
  ['fibe', 'fiber', 0],
  ['sock', 'sugars', 0],
  ['mfet', 'satFat', 0],
  ['mone', 'monoFat', 0],
  ['pole', 'polyFat', 0],
  ['chol', 'cholesterol', 0],
  ['nacl', 'salt', 0],
  ['alko', 'alcohol', 0],
  ['fullk/tot', 'wholegrain', 0],
  ['fullk', 'wholegrain', 0],
  ['na', 'sodium', 0],
  ['ca', 'calcium', 0],
  ['fe', 'iron', 0],
  ['mg', 'magnesium', 0],
  ['k', 'potassium', 0],
  ['p', 'phosphorus', 0],
  ['zn', 'zinc', 0],
  ['se', 'selenium', 0],
  ['i', 'iodine', 0],
  ['vita', 'vitA', 0],
  ['vitd', 'vitD', 0],
  ['vite', 'vitE', 0],
  ['vitk', 'vitK', 0],
  ['vitc', 'vitC', 0],
  ['tiam', 'thiamin', 0],
  ['ribo', 'riboflavin', 0],
  ['ne', 'niacin', 1],
  ['niac', 'niacin', 0],
  ['vitb6', 'vitB6', 0],
  ['fola', 'folate', 0],
  ['vitb12', 'vitB12', 0],
]

/** @type {ReadonlyArray<readonly [string, string, number]>} */
const NAME_CODES = [
  ['Protein', 'protein', 0],
  ['Kolhydrater, tillgängliga', 'carbs', 0],
  ['Kolhydrater', 'carbs', -1],
  ['Fett, totalt', 'fat', 0],
  ['Fett', 'fat', -1],
  ['Summa mättade fettsyror', 'satFat', 0],
  ['Summa enkelomättade fettsyror', 'monoFat', 0],
  ['Summa fleromättade fettsyror', 'polyFat', 0],
  ['Summa omega-3', 'omega3', 0],
  ['Summa omega-3-fettsyror', 'omega3', 0],
  ['Summa n-3 fettsyror', 'omega3', 0],
  ['Omega-3-fettsyror, totalt', 'omega3', 0],
  ['Kolesterol', 'cholesterol', 0],
  ['Fibrer', 'fiber', 0],
  ['Kostfiber', 'fiber', 0],
  ['Sockerarter, totalt', 'sugars', 0],
  ['Sockerarter', 'sugars', -1],
  ['Summa sockerarter', 'sugars', 0],
  ['Mono/disackarider', 'sugars', -1],
  ['Mono- och disackarider', 'sugars', -1],
  ['Tillsatt socker', 'addedSugar', 0],
  ['Fullkorn totalt', 'wholegrain', 0],
  ['Fullkorn, totalt', 'wholegrain', 0],
  ['Fullkorn', 'wholegrain', -1],
  ['Salt, NaCl', 'salt', 0],
  ['Salt', 'salt', -1],
  ['Natrium, Na', 'sodium', 0],
  ['Natrium', 'sodium', -1],
  ['Kalcium, Ca', 'calcium', 0],
  ['Kalcium', 'calcium', -1],
  ['Järn, Fe', 'iron', 0],
  ['Järn', 'iron', -1],
  ['Magnesium, Mg', 'magnesium', 0],
  ['Magnesium', 'magnesium', -1],
  ['Kalium, K', 'potassium', 0],
  ['Kalium', 'potassium', -1],
  ['Fosfor, P', 'phosphorus', 0],
  ['Fosfor', 'phosphorus', -1],
  ['Zink, Zn', 'zinc', 0],
  ['Zink', 'zinc', -1],
  ['Selen, Se', 'selenium', 0],
  ['Selen', 'selenium', -1],
  ['Jod, I', 'iodine', 0],
  ['Jod', 'iodine', -1],
  ['Retinolekvivalenter', 'vitA', 0],
  ['Vitamin A', 'vitA', -1],
  ['Vitamin D', 'vitD', 0],
  ['Vitamin E', 'vitE', 0],
  ['Vitamin K', 'vitK', 0],
  ['Vitamin K1', 'vitK', -1],
  ['Vitamin C', 'vitC', 0],
  ['Askorbinsyra', 'vitC', -1],
  ['Tiamin', 'thiamin', 0],
  ['Vitamin B1', 'thiamin', -1],
  ['Riboflavin', 'riboflavin', 0],
  ['Vitamin B2', 'riboflavin', -1],
  ['Niacinekvivalenter', 'niacin', 1],
  ['Niacin', 'niacin', 0],
  ['Vitamin B3', 'niacin', -1],
  ['Vitamin B6', 'vitB6', 0],
  ['Folat, totalt', 'folate', 0],
  ['Folat', 'folate', -1],
  ['Vitamin B12', 'vitB12', 0],
  ['Alkohol', 'alcohol', 0],
  ['Koffein', 'caffeine', 0],
]

const PRIO_CODE = 10
const PRIO_FORK = 8
const PRIO_NAME = 6
const MASS_FACTOR = { g: 1, mg: 1e-3, µg: 1e-6 }

const CODE_MAP = new Map(Object.entries(LMV_CODES).map(([code, key]) => [code, [key, 0]]))
for (const [code, key, adj] of EXTRA_CODES) CODE_MAP.set(code, [key, adj])
const FORK_MAP = new Map(FORK_CODES.map(([c, k, a]) => [c, [k, a]]))
const NAME_MAP = new Map(NAME_CODES.map(([n, k, a]) => [normalizeSv(n), [k, a]]))

const OMEGA3_CODES = new Set(['F18D3N3', 'F20D5N3', 'F22D5N3', 'F22D6N3'])
const OMEGA3_NAMES = [/c\s*18\s*3/, /c\s*20\s*5/, /c\s*22\s*5/, /c\s*22\s*6/]
const OMEGA6_NAME = /\bn\s*6\b|omega\s*6/

/** @param {unknown} v */
export function parseValue(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : undefined
  if (typeof v !== 'string') return undefined
  const s = v.trim().toLowerCase()
  if (!s) return undefined
  if (s.startsWith('spår') || s.startsWith('<')) return 0
  const n = Number(s.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** @param {unknown} enhet */
export function parseUnit(enhet) {
  if (typeof enhet !== 'string') return undefined
  const u = enhet.trim().toLowerCase().replace('μ', 'µ')
  if (!u) return undefined
  if (u.startsWith('kcal')) return 'kcal'
  if (u.startsWith('kj')) return 'kJ'
  if (u.startsWith('µg') || u.startsWith('ug') || u.startsWith('mcg') || u.startsWith('mikrog')) return 'µg'
  if (u.startsWith('mg')) return 'mg'
  if (u.startsWith('g') || u === '%') return 'g'
  return undefined
}

/** @param {number} v */
export function roundNutrient(v) {
  if (v === 0) return 0
  return Number(v.toPrecision(4))
}

function convert(value, from, key) {
  const target = NUTRIENT_UNITS[key]
  if (from === undefined) return value
  if (target === 'kcal') return from === 'kcal' ? value : from === 'kJ' ? value / KJ_PER_KCAL : undefined
  if (from === 'kcal' || from === 'kJ') return undefined
  return (value * MASS_FACTOR[from]) / MASS_FACTOR[target]
}

/** Kopia av completeNutrients (src/lib/nutrients.ts). */
function completeNutrients(n) {
  const out = { ...n }
  if (out.salt === undefined && out.sodium !== undefined) out.salt = (out.sodium * 2.5) / 1000
  if (out.sodium === undefined && out.salt !== undefined) out.sodium = (out.salt * 1000) / 2.5
  if (out.kcal === undefined && (out.protein !== undefined || out.carbs !== undefined || out.fat !== undefined)) {
    out.kcal = (out.protein ?? 0) * 4 + (out.carbs ?? 0) * 4 + (out.fat ?? 0) * 9 + (out.fiber ?? 0) * 2 + (out.alcohol ?? 0) * 7
  }
  return out
}

/**
 * Livsmedelsverkets näringsrader → näringsvärden per 100 g (kopia av mapLmvNutrients).
 * @param {ReadonlyArray<Record<string, unknown>>} rows
 */
export function mapNutrients(rows) {
  const best = new Map()
  const put = (key, value, prio) => {
    if (value === undefined || !Number.isFinite(value) || value < 0) return
    const cur = best.get(key)
    if (!cur || prio > cur.prio) best.set(key, { value, prio })
  }
  let omega3Parts = 0
  let omega3Found = false
  let retinol
  let betaCarotene

  for (const row of rows ?? []) {
    if (!row || typeof row !== 'object') continue
    let value = parseValue(row.varde)
    if (value === undefined) continue
    if (typeof row.viktGram === 'number' && row.viktGram > 0 && row.viktGram !== 100) value = (value * 100) / row.viktGram
    const code = typeof row.euroFIRkod === 'string' ? row.euroFIRkod.trim().toUpperCase() : ''
    const fork = typeof row.forkortning === 'string' ? row.forkortning.trim().toLowerCase() : ''
    const name = typeof row.namn === 'string' ? normalizeSv(row.namn) : ''
    let unit = parseUnit(row.enhet)

    if (code === 'ENERC' || code === 'ENERC_KCAL' || code === 'ENERC_KJ' || fork === 'ener' || name.startsWith('energi')) {
      if (unit === undefined) unit = code === 'ENERC_KJ' || /\bkj\b/.test(name) ? 'kJ' : /\bkcal\b/.test(name) || code === 'ENERC_KCAL' ? 'kcal' : undefined
      if (unit === 'kcal') put('kcal', value, PRIO_CODE)
      else if (unit === 'kJ') put('kcal', value / KJ_PER_KCAL, PRIO_CODE - 5)
      continue
    }
    if (OMEGA3_CODES.has(code) || (OMEGA3_NAMES.some((re) => re.test(name)) && !OMEGA6_NAME.test(name))) {
      const g = convert(value, unit, 'omega3')
      if (g !== undefined) {
        omega3Parts += g
        omega3Found = true
      }
      continue
    }
    if (code === 'RETOL' || name === 'retinol') {
      retinol = convert(value, unit, 'vitA')
      continue
    }
    if (code === 'CARTB' || /karoten/.test(name)) {
      betaCarotene = convert(value, unit, 'vitA')
      continue
    }

    let hit
    let prio = 0
    if (code && (hit = CODE_MAP.get(code))) prio = PRIO_CODE
    else if (fork && (hit = FORK_MAP.get(fork) ?? CODE_MAP.get(fork.toUpperCase()))) prio = PRIO_FORK
    else if (name && (hit = NAME_MAP.get(name))) prio = PRIO_NAME
    if (!hit) continue
    const [key, adj] = hit
    put(key, convert(value, unit, key), prio + adj)
  }

  const out = {}
  for (const [key, { value }] of best) out[key] = value
  if (out.omega3 === undefined && omega3Found) out.omega3 = omega3Parts
  if (out.vitA === undefined && retinol !== undefined) out.vitA = retinol + (betaCarotene ?? 0) / 12
  const completed = completeNutrients(out)
  const rounded = {}
  for (const key of Object.keys(completed)) {
    const v = completed[key]
    if (v !== undefined && Number.isFinite(v)) rounded[key] = roundNutrient(v)
  }
  return rounded
}

// ---------------------------------------------------------------------------
// Kategori, flytande och densitet – kopia av categorizeLmv
// ---------------------------------------------------------------------------

/** @type {ReadonlyArray<readonly [string, readonly string[]]>} */
const CATEGORY_RULES = [
  ['kosttillskott', ['proteinpulver', 'proteinbar', 'proteindryck', 'kosttillskott', 'måltidsersättning']],
  ['alkohol', ['öl', 'starköl', 'lättöl', 'folköl', 'mellanöl', 'vin', 'rödvin', 'vitvin', 'rosévin', 'mousserande', 'champagne', 'cava', 'prosecco', 'cider', 'sprit', 'vodka', 'whisky', 'likör', 'brännvin', 'snaps', 'glögg', 'konjak', 'cognac', 'portvin', 'sherry', 'vermouth', 'punsch']],
  ['vaxtdryck', ['havredryck', 'sojadryck', 'mandeldryck', 'risdryck', 'kokosdryck', 'ärtdryck', 'växtdryck', 'havremjölk', 'sojamjölk', 'mandelmjölk']],
  ['juice', ['juice', 'nektar', 'smoothie', 'äppelmust']],
  ['lask_saft', ['läsk', 'läskedryck', 'cola', 'sockerdricka', 'lemonad', 'saft', 'energidryck', 'sportdryck', 'julmust', 'påskmust', 'must', 'tonic', 'fruktdryck']],
  ['dryck', ['kaffe', 'espresso', 'te', 'örtte', 'vatten', 'mineralvatten', 'bordsvatten']],
  ['ost', ['ost', 'hårdost', 'mjukost', 'färskost', 'dessertost', 'keso', 'cottage', 'halloumi', 'mozzarella', 'parmesan', 'fetaost', 'feta', 'brie', 'camembert', 'chevre', 'gorgonzola', 'ricotta', 'mascarpone', 'messmör', 'mesost', 'grevé']],
  ['fett_olja', ['smör', 'margarin', 'olja', 'matfett', 'bregott', 'ister', 'flott', 'kokosfett', 'kokosmjölk', 'kokosgrädde', 'smörgåsmargarin', 'bordsmargarin']],
  ['glass_dessert', ['glass', 'sorbet', 'pudding', 'kräm', 'mousse', 'pannacotta', 'dessert', 'blåbärssoppa', 'nyponsoppa', 'fruktsoppa']],
  ['mejeri', ['mjölk', 'standardmjölk', 'mellanmjölk', 'lättmjölk', 'minimjölk', 'fil', 'filmjölk', 'yoghurt', 'yogurt', 'kvarg', 'grädde', 'vispgrädde', 'matlagningsgrädde', 'gräddfil', 'creme', 'kefir', 'ymer', 'kesella', 'kärnmjölk', 'mjölkdryck', 'smetana', 'skyr', 'välling']],
  ['agg', ['ägg', 'äggula', 'äggvita', 'hönsägg']],
  ['vegoprotein', ['tofu', 'sojafärs', 'quorn', 'tempeh', 'seitan', 'vegofärs', 'sojabitar', 'vegobiff', 'sojaprotein', 'ärtprotein', 'oumph', 'vegokorv', 'vegoburgare']],
  ['chark', ['korv', 'falukorv', 'prinskorv', 'fläskkorv', 'grillkorv', 'chorizo', 'salami', 'skinka', 'bacon', 'kassler', 'leverpastej', 'pastej', 'medwurst', 'isterband', 'blodpudding', 'sylta', 'pålägg', 'prosciutto', 'serranoskinka']],
  ['fagel', ['kyckling', 'kalkon', 'anka', 'ankbröst', 'gås', 'höna', 'fågel', 'vaktel']],
  ['skaldjur', ['räkor', 'räka', 'kräftor', 'kräfta', 'havskräfta', 'havskräftor', 'hummer', 'krabba', 'musslor', 'mussla', 'blåmusslor', 'ostron', 'bläckfisk', 'skaldjur', 'kammussla', 'kräftstjärtar', 'scampi', 'calamares']],
  ['fisk', ['fisk', 'lax', 'laxfile', 'torsk', 'sill', 'strömming', 'makrill', 'tonfisk', 'sej', 'kolja', 'abborre', 'gädda', 'gös', 'röding', 'rödspätta', 'sardin', 'sardiner', 'ansjovis', 'sik', 'siklöja', 'löjrom', 'rom', 'kaviar', 'lutfisk', 'fiskpinnar', 'surströmming', 'gravlax', 'hälleflundra', 'sjötunga', 'piggvar', 'tilapia', 'pangasius', 'lodda', 'fiskbullar', 'matjessill']],
  ['rott_kott', ['nötkött', 'nöt', 'fläsk', 'fläskkött', 'lamm', 'lammkött', 'kalv', 'kalvkött', 'älg', 'älgkött', 'ren', 'renkött', 'rådjur', 'vildsvin', 'hjort', 'viltkött', 'blandfärs', 'köttfärs', 'nötfärs', 'fläskfärs', 'färs', 'entrecote', 'biff', 'oxfile', 'rostbiff', 'högrev', 'fransyska', 'kotlett', 'fläskkotlett', 'karré', 'fläskkarré', 'fläskfile', 'fläsklägg', 'revbensspjäll', 'sidfläsk', 'lever', 'njure', 'hjärta', 'tunga', 'kött', 'lövbiff', 'grytbitar', 'innanlår', 'ytterlår', 'renskav']],
  ['baljvaxter', ['bönor', 'böna', 'linser', 'lins', 'kikärtor', 'kikärta', 'ärtor', 'ärter', 'sojabönor', 'edamame', 'hummus', 'mungbönor', 'kidneybönor']],
  ['snacks', ['chips', 'potatischips', 'tortillachips', 'popcorn', 'ostbågar', 'ostkrokar', 'snacks', 'riskaka', 'riskakor', 'majskrokar', 'saltstänger', 'nötmix']],
  ['rotfrukter', ['morot', 'morötter', 'rödbeta', 'rödbetor', 'palsternacka', 'kålrot', 'rotselleri', 'jordärtskocka', 'rotfrukter', 'sötpotatis', 'pepparrot', 'rättika', 'persiljerot']],
  ['potatis', ['potatis', 'färskpotatis', 'potatismos', 'pommes', 'rösti', 'klyftpotatis']],
  ['bar', ['bär', 'jordgubbar', 'jordgubbe', 'hallon', 'blåbär', 'lingon', 'björnbär', 'vinbär', 'krusbär', 'hjortron', 'tranbär', 'havtorn', 'aronia', 'smultron']],
  ['frukt', ['frukt', 'äpple', 'äpplen', 'äppel', 'päron', 'banan', 'bananer', 'apelsin', 'citron', 'lime', 'clementin', 'mandarin', 'kiwi', 'ananas', 'mango', 'druvor', 'vindruvor', 'melon', 'vattenmelon', 'honungsmelon', 'persika', 'nektarin', 'plommon', 'aprikos', 'fikon', 'dadlar', 'russin', 'avokado', 'grapefrukt', 'granatäpple', 'papaya', 'passionsfrukt', 'fruktsallad', 'katrinplommon', 'sviskon', 'rabarber']],
  ['gronsaker', ['grönsaker', 'tomat', 'tomater', 'gurka', 'sallad', 'isbergssallad', 'spenat', 'broccoli', 'blomkål', 'kål', 'vitkål', 'rödkål', 'grönkål', 'brysselkål', 'savojkål', 'lök', 'rödlök', 'vitlök', 'purjolök', 'schalottenlök', 'salladslök', 'paprika', 'zucchini', 'squash', 'aubergine', 'svamp', 'champinjoner', 'champinjon', 'kantareller', 'kantarell', 'karljohan', 'majs', 'sparris', 'rädisa', 'rädisor', 'selleri', 'blekselleri', 'fänkål', 'oliver', 'kronärtskocka', 'pumpa', 'sockerärtor', 'haricots', 'rucola', 'ruccola', 'mangold', 'groddar', 'grönsaksblandning', 'wokgrönsaker', 'majskorn']],
  ['notter_fron', ['nötter', 'mandel', 'mandlar', 'hasselnötter', 'hasselnöt', 'valnötter', 'valnöt', 'cashewnötter', 'cashew', 'pistaschnötter', 'pistage', 'jordnötter', 'jordnöt', 'pinjenötter', 'paranötter', 'pekannötter', 'macadamia', 'frön', 'fröer', 'solrosfrön', 'pumpafrön', 'sesamfrön', 'sesamfrö', 'linfrö', 'chiafrön', 'hampafrön', 'jordnötssmör', 'nötsmör', 'mandelsmör', 'tahini', 'kokos', 'kokosflingor', 'kokosnöt']],
  ['pasta_ris', ['pasta', 'spagetti', 'spaghetti', 'makaroner', 'penne', 'fusilli', 'tagliatelle', 'lasagneplattor', 'nudlar', 'äggnudlar', 'risnudlar', 'ris', 'jasminris', 'basmatiris', 'fullkornsris', 'råris', 'risgryn', 'couscous', 'bulgur', 'matvete', 'quinoa', 'orzo', 'gnocchi', 'tortellini', 'vildris']],
  ['brod', ['bröd', 'knäckebröd', 'limpa', 'baguette', 'fralla', 'frallor', 'tunnbröd', 'tortilla', 'tortillabröd', 'pitabröd', 'rågbröd', 'surdegsbröd', 'polarbröd', 'skorpor', 'skorpa', 'toast', 'toastbröd', 'ciabatta', 'bagel', 'kavring', 'hamburgerbröd', 'korvbröd', 'tekaka', 'hönökaka', 'rostbröd']],
  ['spannmal', ['havregryn', 'gryn', 'flingor', 'cornflakes', 'musli', 'granola', 'mjöl', 'vetemjöl', 'rågmjöl', 'havre', 'råg', 'korn', 'vete', 'gröt', 'havregrynsgröt', 'vetekli', 'havrekli', 'mannagryn', 'frukostflingor', 'dinkel', 'vetegroddar', 'potatismjöl', 'majsstärkelse']],
  ['sotsaker', ['socker', 'strösocker', 'florsocker', 'farinsocker', 'godis', 'lösgodis', 'choklad', 'mjölkchoklad', 'chokladkaka', 'kola', 'karamell', 'karameller', 'lakrits', 'marmelad', 'sylt', 'honung', 'sirap', 'gelé', 'geléhallon', 'nougat', 'marsipan', 'praliner', 'kakao']],
  ['bakverk', ['bulle', 'bullar', 'kanelbulle', 'kardemummabulle', 'vetebulle', 'kaka', 'kakor', 'småkakor', 'tårta', 'bakelse', 'muffins', 'muffin', 'sockerkaka', 'kex', 'wienerbröd', 'croissant', 'munk', 'munkar', 'våffla', 'våfflor', 'kladdkaka', 'semla', 'chokladboll', 'biskvi', 'mazarin', 'dammsugare', 'prinsesstårta', 'kanelsnäcka', 'kardemummakrans', 'rulltårta', 'pepparkaka', 'pepparkakor', 'lussekatt', 'cupcake', 'brownie', 'cookie', 'scones', 'paj', 'smulpaj', 'vetebröd', 'kaffebröd', 'smördeg', 'mördeg', 'kringla', 'rån', 'drömmar']],
  ['sas_krydda', ['sås', 'dressing', 'ketchup', 'senap', 'majonnäs', 'majonäs', 'remoulad', 'buljong', 'fond', 'salt', 'peppar', 'krydda', 'kryddor', 'kryddblandning', 'vinäger', 'vinägrett', 'pesto', 'tzatziki', 'aioli', 'bearnaise', 'hollandaise', 'salsa', 'chutney', 'sambal', 'sojasås', 'sriracha', 'tabasco', 'curry', 'kanel', 'kardemumma', 'oregano', 'basilika', 'persilja', 'dill', 'gräslök', 'ingefära', 'tomatpuré', 'dipp', 'tapenade', 'ajvar', 'bakpulver', 'jäst', 'sky', 'pepparkorn']],
  ['snabbmat', ['hamburgare', 'pizza', 'kebab', 'falafel', 'nuggets', 'kycklingnuggets', 'tacos', 'burrito', 'sushi', 'vårrulle', 'vårrullar', 'pirog', 'piroger', 'gyros', 'shawarma', 'hotdog']],
  ['fardigratt', ['soppa', 'gryta', 'lasagne', 'pannkaka', 'pannkakor', 'pytt', 'pyttipanna', 'köttbullar', 'köttbulle', 'kåldolmar', 'pastasallad', 'potatissallad', 'kycklingsallad', 'caesarsallad', 'tonfisksallad', 'räksallad', 'gratäng', 'låda', 'risotto', 'wok', 'färdigrätt', 'ärtsoppa', 'pölsa', 'stuvning', 'kalops', 'stroganoff', 'korvstroganoff', 'chili', 'smörgås', 'smörgåstårta', 'macka', 'mackor', 'omelett', 'äggröra', 'raggmunk', 'kroppkakor', 'palt', 'köttfärssås', 'bolognese', 'quiche', 'skinkpaj', 'ostpaj', 'laxpaj', 'broccolipaj', 'västerbottenpaj', 'fiskgratäng', 'laxpudding', 'fiskpudding', 'biffar', 'järpar', 'frikadeller', 'dolmar', 'fläskpannkaka', 'janssons', 'dillkött']],
]

const SHORT_HEADS = new Set(['ost', 'öl', 'vin', 'lax', 'ägg', 'bär', 'kål', 'lök', 'ris', 'rom', 'fil', 'sås', 'nöt', 'paj', 'gås'])
const GENERIC_HEADS = new Set(['kött', 'färs', 'biff', 'biffar', 'bitar', 'strimlor', 'kotlett'])
const VEG_MODIFIERS = new Set(['vegetarisk', 'vegetariska', 'vegetariskt', 'vegansk', 'veganska', 'veganskt', 'vego', 'växtbaserad', 'växtbaserade', 'växtbaserat'])
const MEATY = new Set(['rott_kott', 'chark', 'fagel', 'fisk', 'skaldjur'])

/** @type {ReadonlyArray<readonly [string, number]>} */
const DENSITY_RULES = [
  ['olja', 0.92],
  ['smör', 0.9],
  ['margarin', 0.9],
  ['honung', 1.4],
  ['sirap', 1.35],
  ['potatismjöl', 0.8],
  ['mjöl', 0.6],
  ['havregryn', 0.35],
  ['florsocker', 0.6],
  ['socker', 0.85],
  ['salt', 1.2],
  ['ris', 0.85],
  ['kakao', 0.4],
]

const COOKED_WORDS = new Set(['kokt', 'kokta', 'kokat', 'tillagad', 'tillagat', 'tillagade', 'stekt', 'stekta'])
const SOLID_DAIRY_WORDS = /pulver|ost$/
const DRINKS = new Set(['dryck', 'lask_saft', 'juice', 'alkohol', 'vaxtdryck'])

/** Alla tabeller – jämförs med LMV_MAPPING_TABLES i src/lib/livsmedelsverket.ts av testet. */
export const MAPPING_TABLES = {
  codes: EXTRA_CODES,
  forkortningar: FORK_CODES,
  names: NAME_CODES,
  categoryRules: CATEGORY_RULES,
  densityRules: DENSITY_RULES,
  shortHeads: [...SHORT_HEADS],
  genericHeads: [...GENERIC_HEADS],
  vegModifiers: [...VEG_MODIFIERS],
  cookedWords: [...COOKED_WORDS],
  solidDairy: SOLID_DAIRY_WORDS.source,
}

const KEYWORDS = []
const EXACT = new Map()
CATEGORY_RULES.forEach(([cat, words], order) => {
  for (const w of words) {
    const word = normalizeSv(w)
    const kw = { word, cat, order }
    KEYWORDS.push(kw)
    if (!EXACT.has(word)) EXACT.set(word, kw)
  }
})

const better = (kw, best) =>
  !best || kw.word.length > best.word.length || (kw.word.length === best.word.length && kw.order < best.order)

function categoryOfToken(token) {
  const exact = EXACT.get(token)
  if (exact) return exact.cat
  let suffix
  for (const kw of KEYWORDS) {
    const w = kw.word
    if (w.length < 4 && !SHORT_HEADS.has(w)) continue
    if (token.length - w.length >= 2 && token.endsWith(w) && better(kw, suffix)) suffix = kw
  }
  if (suffix && !GENERIC_HEADS.has(suffix.word)) return suffix.cat
  let prefix
  for (const kw of KEYWORDS) {
    const w = kw.word
    if (w.length < 4) continue
    if (token.length > w.length && token.startsWith(w) && better(kw, prefix)) prefix = kw
  }
  return (prefix ?? suffix)?.cat
}

function categoryOfText(text) {
  const tokens = normalizeSv(text).split(' ').filter((t) => t && !/^\d/.test(t))
  const veg = tokens.some((t) => VEG_MODIFIERS.has(t))
  for (const token of tokens) {
    if (VEG_MODIFIERS.has(token)) continue
    const cat = categoryOfToken(token)
    if (cat) return veg && MEATY.has(cat) ? 'vegoprotein' : cat
  }
  return veg ? 'vegoprotein' : undefined
}

function classificationTexts(classes) {
  const out = []
  const walk = (v, depth) => {
    if (depth > 6) return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1))
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, depth + 1))
  }
  walk(classes ?? [], 0)
  return out
}

/**
 * @param {string} name
 * @param {unknown[] | undefined} classes
 * @param {Record<string, number>} nutrients
 */
export function categorize(name, classes, nutrients = {}) {
  let category = categoryOfText(name)
  if (!category) {
    for (const text of classificationTexts(classes)) {
      category = categoryOfText(text)
      if (category) break
    }
  }
  category ??= 'ovrigt'
  if (category === 'lask_saft' && nutrients.sugars !== undefined && nutrients.sugars < 1) category = 'dryck'
  if ((DRINKS.has(category) || category === 'ovrigt') && (nutrients.alcohol ?? 0) >= 1.5) category = 'alkohol'

  const tokens = normalizeSv(name).split(' ').filter(Boolean)
  const first = tokens[0] ?? ''
  const liquid =
    DRINKS.has(category) ||
    (category === 'mejeri' && !tokens.some((t) => SOLID_DAIRY_WORDS.test(t))) ||
    tokens.some((t) => t.endsWith('soppa'))

  let density
  if (!liquid && !tokens.some((t) => COOKED_WORDS.has(t))) {
    for (const [word, d] of DENSITY_RULES) {
      const w = normalizeSv(word)
      if (first === w || (first.length - w.length >= 2 && first.endsWith(w))) {
        density = d
        break
      }
    }
  }
  const info = { category, liquid }
  if (density !== undefined) info.density = density
  return info
}

/** @param {string} name */
export function tidyName(name) {
  const s = String(name ?? '')
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s*%/g, '$1 %')
    .trim()
  return s.charAt(0).toLocaleUpperCase('sv-SE') + s.slice(1)
}

/**
 * Ett livsmedel från API:t → Lagoms Food-format (kopia av mapLmvFood).
 * @param {{ nummer: number, namn: string }} item
 * @param {ReadonlyArray<Record<string, unknown>>} rows
 * @param {unknown[]} [classes]
 */
export function mapFood(item, rows, classes) {
  const nutrients = mapNutrients(rows)
  const name = tidyName(item.namn)
  const { category, liquid, density } = categorize(name, classes, nutrients)
  const food = {
    id: `lmv:${item.nummer}`,
    name,
    source: 'livsmedelsverket',
    category,
    nutrients,
    portions: [],
    lmvNumber: item.nummer,
  }
  if (liquid) food.liquid = true
  if (density !== undefined) food.density = density
  return food
}

// ---------------------------------------------------------------------------
// Nätverk
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} för ${url}`)
    this.status = status
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Hämta JSON med tidsgräns och omförsök (exponentiell backoff, respekterar Retry-After).
 * 4xx-fel (utom 429) görs inga omförsök för.
 */
async function fetchJson(baseUrl, path, { attempts = 5, timeoutMs = 30_000 } = {}) {
  const url = `${baseUrl}${path}`
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let retryAfterMs = 0
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return await res.json()
      if (res.status !== 429 && res.status < 500) throw new HttpError(res.status, url)
      lastError = new HttpError(res.status, url)
      retryAfterMs = (Number(res.headers.get('retry-after')) || 0) * 1000
    } catch (err) {
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err
      lastError = err
    }
    if (attempt < attempts) await sleep(Math.max(retryAfterMs, 1000 * 2 ** (attempt - 1) + Math.random() * 500))
  }
  throw lastError
}

async function fetchList(baseUrl, pageSize, onPage) {
  const out = []
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const json = await fetchJson(baseUrl, `/livsmedel?offset=${offset}&limit=${pageSize}&sprak=1`)
    const page = Array.isArray(json?.livsmedel) ? json.livsmedel : null
    if (!page) throw new Error('Oväntat svar från /livsmedel – fältet "livsmedel" saknas.')
    for (const item of page) if (item && typeof item.nummer === 'number' && typeof item.namn === 'string') out.push(item)
    total = json._meta?.totalRecords ?? (page.length < pageSize ? offset + page.length : Infinity)
    offset += pageSize
    onPage?.(out.length, Number.isFinite(total) ? total : out.length)
    if (page.length === 0) break
  }
  return out
}

/** Kör `fn` över `items` med högst `concurrency` samtidiga anrop. */
async function runPool(items, concurrency, fn) {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

// ---------------------------------------------------------------------------
// Körning
// ---------------------------------------------------------------------------

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_OUT = resolve(ROOT, 'public/data/livsmedelsverket.json')

function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function progressBar(done, total, width = 28) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0
  const filled = Math.round(ratio * width)
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${String(Math.round(ratio * 100)).padStart(3)} %`
}

/**
 * Kör importen.
 * @param {{ baseUrl?: string, out?: string, concurrency?: number, pageSize?: number, limit?: number,
 *           withClasses?: boolean, delayMs?: number, log?: (msg: string) => void, progress?: boolean }} [opts]
 * @returns {Promise<{ count: number, failed: number[], out: string }>}
 */
export async function run(opts = {}) {
  const baseUrl = (opts.baseUrl ?? API_BASE).replace(/\/+$/, '')
  const out = resolve(opts.out ?? DEFAULT_OUT)
  const concurrency = Math.max(1, Math.min(8, opts.concurrency ?? 4))
  const pageSize = Math.max(1, opts.pageSize ?? 500)
  const delayMs = Math.max(0, opts.delayMs ?? 25)
  const log = opts.log ?? ((msg) => console.log(msg))
  const tty = opts.progress ?? Boolean(process.stdout.isTTY)
  const started = Date.now()

  log(`Hämtar livsmedelslistan från ${baseUrl} …`)
  const list = await fetchList(baseUrl, pageSize, (n, total) => {
    if (tty) process.stdout.write(`\r  Lista: ${n} av ${total} livsmedel`)
  })
  if (tty) process.stdout.write('\n')
  const items = opts.limit !== undefined ? list.slice(0, Math.max(0, opts.limit)) : list
  log(`Hittade ${list.length} livsmedel${items.length !== list.length ? ` – importerar de första ${items.length}` : ''}.`)
  log(`Hämtar näringsvärden (${concurrency} samtidiga anrop${opts.withClasses ? ', med klassificeringar' : ''}) …`)

  const foods = []
  const failed = []
  let otherBasis = 0
  let done = 0
  const report = () => {
    if (tty) process.stdout.write(`\r  ${progressBar(done, items.length)}  ${done}/${items.length}${failed.length ? `  · ${failed.length} misslyckade` : ''}`)
    else if (done % 250 === 0 || done === items.length) log(`  ${done}/${items.length} klara${failed.length ? `, ${failed.length} misslyckade` : ''}`)
  }

  await runPool(items, concurrency, async (item) => {
    try {
      const rows = await fetchJson(baseUrl, `/livsmedel/${item.nummer}/naringsvarden?sprak=1`)
      if (!Array.isArray(rows)) throw new Error('Oväntat svar från /naringsvarden')
      if (rows.some((r) => typeof r?.viktGram === 'number' && r.viktGram > 0 && r.viktGram !== 100)) otherBasis++
      let classes
      if (opts.withClasses) {
        try {
          const json = await fetchJson(baseUrl, `/livsmedel/${item.nummer}/klassificeringar?sprak=1`)
          classes = Array.isArray(json) ? json : json && typeof json === 'object' ? [json] : []
        } catch {
          classes = undefined
        }
      }
      foods.push(mapFood(item, rows, classes))
    } catch (err) {
      failed.push(item.nummer)
      if (!tty) log(`  Misslyckades: ${item.nummer} ${item.namn} (${err instanceof Error ? err.message : String(err)})`)
    } finally {
      done++
      report()
      if (delayMs) await sleep(delayMs)
    }
  })
  if (tty) process.stdout.write('\n')

  foods.sort((a, b) => a.lmvNumber - b.lmvNumber)
  failed.sort((a, b) => a - b)
  const meta = {
    source: 'Livsmedelsverkets livsmedelsdatabas',
    attribution: ATTRIBUTION,
    url: 'https://soknaringsinnehall.livsmedelsverket.se/',
    api: baseUrl,
    version: localDate(),
    generatedAt: new Date().toISOString(),
    count: foods.length,
    total: list.length,
    partial: items.length !== list.length || failed.length > 0,
    failed,
    schema: 1,
    generator: 'scripts/import-livsmedelsverket.mjs',
  }
  // En rad per livsmedel: kompakt men läsbara diffar i git.
  const body = `{"meta":${JSON.stringify(meta)},\n"foods":[\n${foods.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`
  await mkdir(dirname(out), { recursive: true })
  const tmp = `${out}.tmp`
  await writeFile(tmp, body, 'utf8')
  await rename(tmp, out)

  const secs = ((Date.now() - started) / 1000).toFixed(0)
  log(`Klart på ${secs} s: ${foods.length} livsmedel skrivna till ${out} (${(Buffer.byteLength(body) / 1024).toFixed(0)} kB).`)
  if (otherBasis) log(`Obs: ${otherBasis} livsmedel hade värden per annan vikt än 100 g (viktGram) och har räknats om till per 100 g – stickprova gärna.`)
  if (failed.length) log(`Varning: ${failed.length} livsmedel kunde inte hämtas: ${failed.slice(0, 20).join(', ')}${failed.length > 20 ? ' …' : ''}. Kör skriptet igen för att försöka på nytt.`)
  log(ATTRIBUTION)
  return { count: foods.length, failed, out }
}

function parseArgs(argv) {
  const opts = {}
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=')
    if (key === 'help' || key === 'h') opts.help = true
    else if (key === 'limit') opts.limit = Number(value)
    else if (key === 'concurrency') opts.concurrency = Number(value)
    else if (key === 'page-size') opts.pageSize = Number(value)
    else if (key === 'out') opts.out = value
    else if (key === 'base-url') opts.baseUrl = value
    else if (key === 'delay') opts.delayMs = Number(value)
    else if (key === 'with-classes') opts.withClasses = true
    else throw new Error(`Okänd flagga: ${arg} (se --help)`)
  }
  for (const k of ['limit', 'concurrency', 'pageSize', 'delayMs']) {
    if (opts[k] !== undefined && !(Number.isFinite(opts[k]) && opts[k] >= 0)) throw new Error(`Ogiltigt värde för ${k}`)
  }
  return opts
}

const HELP = `Importera Livsmedelsverkets livsmedelsdatabas till public/data/livsmedelsverket.json

Användning: node scripts/import-livsmedelsverket.mjs [flaggor]

  --limit=N          importera bara de första N livsmedlen (för test)
  --concurrency=N    antal samtidiga anrop (standard 4, max 8)
  --page-size=N      antal livsmedel per listsida (standard 500)
  --delay=MS         paus efter varje livsmedel per arbetare (standard 25 ms)
  --with-classes     hämta även klassificeringar (dubbelt så många anrop)
  --out=SÖKVÄG       utfil (standard public/data/livsmedelsverket.json)
  --base-url=URL     annan API-adress (t.ex. en lokal spegel)
`

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  try {
    const opts = parseArgs(process.argv.slice(2))
    if (opts.help) {
      console.log(HELP)
    } else {
      await run(opts)
    }
  } catch (err) {
    console.error(`\nImporten misslyckades: ${err instanceof Error ? err.message : String(err)}`)
    if (err?.cause) console.error(`Orsak: ${err.cause?.message ?? err.cause}`)
    process.exitCode = 1
  }
}
