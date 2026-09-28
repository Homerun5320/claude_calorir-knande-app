/**
 * Livsmedelsverkets livsmedelsdatabas – mappning och klient för det öppna API:t.
 *
 * API (v1): https://dataportal.livsmedelsverket.se/livsmedel/api/v1
 *   GET /livsmedel?offset=&limit=&sprak=1                → { _meta, livsmedel: [{ nummer, namn, … }] }
 *   GET /livsmedel/{nummer}/naringsvarden?sprak=1        → [{ namn, forkortning, euroFIRkod, varde, enhet, viktGram, … }]
 *   GET /livsmedel/{nummer}/klassificeringar?sprak=1     → klassificeringar (form varierar)
 *
 * Mappningen av näringsvärden sker i första hand via EuroFIR-kod (`NUTRIENTS[k].lmvCode`), sedan via
 * Livsmedelsverkets förkortning och sist via det svenska namnet ("Summa mättade fettsyror" …).
 * Enheter normaliseras (g/mg/µg, kcal/kJ) till Lagoms enheter per 100 g.
 *
 * OBS: `scripts/import-livsmedelsverket.mjs` innehåller en fristående JavaScript-kopia av samma
 * mappning (skriptet kan inte importera TypeScript). Ändringar här ska speglas där –
 * `livsmedelsverket.test.ts` kontrollerar att de ger identiskt resultat.
 */
import type { Food, FoodCategory, Nutrients } from '../types'
import { completeNutrients, KJ_PER_KCAL, NUTRIENTS, type NutrientKey } from './nutrients'
import { normalizeSv } from './search'

export const LMV_API_BASE = 'https://dataportal.livsmedelsverket.se/livsmedel/api/v1'
/** Källhänvisning som visas i appen (databasen publiceras under CC BY 4.0 – källan ska anges). */
export const LMV_ATTRIBUTION = 'Källa: Livsmedelsverkets livsmedelsdatabas (CC BY 4.0)'
/** Licensen för Livsmedelsverkets livsmedelsdatabas. */
export const LMV_LICENSE = 'CC BY 4.0'
/**
 * Licenstexten på svenska hos Creative Commons. Bara en länk – appen anropar inte adressen. Skriven
 * med backticks eftersom netlify/tests/netlify-toml.test.ts letar efter API-adresser i
 * apostrofer ('https://…') i den här filen och kräver att de finns i CSP:ns connect-src.
 */
export const LMV_LICENSE_URL = `https://creativecommons.org/licenses/by/4.0/deed.sv`

// ---------------------------------------------------------------------------
// Råformat
// ---------------------------------------------------------------------------

export interface LmvListItem {
  nummer: number
  namn: string
  livsmedelsTypId?: number
  [key: string]: unknown
}

export interface LmvListResponse {
  _meta?: { totalRecords?: number; offset?: number; limit?: number; count?: number }
  livsmedel?: LmvListItem[]
}

export interface LmvNutrientRow {
  namn?: string
  forkortning?: string
  euroFIRkod?: string
  varde?: number | string | null
  enhet?: string
  viktGram?: number
  [key: string]: unknown
}

/** Klassificeringarnas form är inte fast – alla textvärden används som ledtrådar. */
export type LmvClassification = Record<string, unknown>

// ---------------------------------------------------------------------------
// Näringsvärden
// ---------------------------------------------------------------------------

/** Enhet i Livsmedelsverkets data efter tolkning. */
export type LmvUnit = 'kcal' | 'kJ' | 'g' | 'mg' | 'µg'

const MASS_FACTOR: Record<'g' | 'mg' | 'µg', number> = { g: 1, mg: 1e-3, µg: 1e-6 }

/** Prioritet: högre vinner när flera rader ger samma näringsämne. */
const PRIO_CODE = 10
const PRIO_FORK = 8
const PRIO_NAME = 6

/** EuroFIR-koder → näringsämne (utöver `NUTRIENTS[k].lmvCode`). [kod, nyckel, prioritetsjustering] */
const EXTRA_CODES: ReadonlyArray<readonly [string, NutrientKey, number]> = [
  ['NIAEQ', 'niacin', 1], // niacinekvivalenter föredras framför niacin
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

/** Livsmedelsverkets förkortningar (gemener) → näringsämne. */
const FORK_CODES: ReadonlyArray<readonly [string, NutrientKey, number]> = [
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

/** Svenska namn (normaliserade med normalizeSv) → näringsämne. */
const NAME_CODES: ReadonlyArray<readonly [string, NutrientKey, number]> = [
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

const CODE_MAP = new Map<string, readonly [NutrientKey, number]>()
for (const meta of Object.values(NUTRIENTS)) {
  if (meta.lmvCode && meta.lmvCode !== 'ENERC_KCAL') CODE_MAP.set(meta.lmvCode.toUpperCase(), [meta.key, 0])
}
for (const [code, key, adj] of EXTRA_CODES) CODE_MAP.set(code, [key, adj])
const FORK_MAP = new Map<string, readonly [NutrientKey, number]>(FORK_CODES.map(([c, k, a]) => [c, [k, a]]))
const NAME_MAP = new Map<string, readonly [NutrientKey, number]>(NAME_CODES.map(([n, k, a]) => [normalizeSv(n), [k, a]]))

/** Omega-3-fettsyror (ALA, EPA, DPA, DHA) för att räkna fram summan när den saknas. */
const OMEGA3_CODES = new Set(['F18D3N3', 'F20D5N3', 'F22D5N3', 'F22D6N3'])
const OMEGA3_NAMES = [/c\s*18\s*3/, /c\s*20\s*5/, /c\s*22\s*5/, /c\s*22\s*6/]
const OMEGA6_NAME = /\bn\s*6\b|omega\s*6/

/** Tolka ett värde: tal, "1,5", "spår", "<0,1" (→ 0). Negativa/ogiltiga ger undefined. */
export function parseLmvValue(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : undefined
  if (typeof v !== 'string') return undefined
  const s = v.trim().toLowerCase()
  if (!s) return undefined
  if (s.startsWith('spår') || s.startsWith('<')) return 0
  const n = Number(s.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Tolka en enhet: "g", "mg", "µg"/"μg"/"ug", "kcal", "kJ", "%" (= g/100 g). Okänd → undefined. */
export function parseLmvUnit(enhet: unknown): LmvUnit | undefined {
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

/** Avrunda till 4 värdesiffror (håller JSON-filen liten och värdena rimliga). */
export function roundNutrient(v: number): number {
  if (v === 0) return 0
  return Number(v.toPrecision(4))
}

function convert(value: number, from: LmvUnit | undefined, to: NutrientKey): number | undefined {
  const target = NUTRIENTS[to].unit
  if (from === undefined) return value // t.ex. "RE", "NE", "α-TE": anta Lagoms enhet
  if (target === 'kcal') return from === 'kcal' ? value : from === 'kJ' ? value / KJ_PER_KCAL : undefined
  if (from === 'kcal' || from === 'kJ') return undefined
  return (value * MASS_FACTOR[from]) / MASS_FACTOR[target]
}

/**
 * Mappa Livsmedelsverkets näringsrader till Lagoms näringsvärden per 100 g.
 * Okända rader ignoreras; saknade värden förblir okända (inte 0).
 */
export function mapLmvNutrients(rows: readonly LmvNutrientRow[]): Nutrients {
  const best = new Map<NutrientKey, { value: number; prio: number }>()
  const put = (key: NutrientKey, value: number | undefined, prio: number) => {
    if (value === undefined || !Number.isFinite(value) || value < 0) return
    const cur = best.get(key)
    if (!cur || prio > cur.prio) best.set(key, { value, prio })
  }
  let omega3Parts = 0
  let omega3Found = false
  let retinol: number | undefined
  let betaCarotene: number | undefined

  for (const row of rows ?? []) {
    if (!row || typeof row !== 'object') continue
    let value = parseLmvValue(row.varde)
    if (value === undefined) continue
    if (typeof row.viktGram === 'number' && row.viktGram > 0 && row.viktGram !== 100) value = (value * 100) / row.viktGram
    const code = typeof row.euroFIRkod === 'string' ? row.euroFIRkod.trim().toUpperCase() : ''
    const fork = typeof row.forkortning === 'string' ? row.forkortning.trim().toLowerCase() : ''
    const name = typeof row.namn === 'string' ? normalizeSv(row.namn) : ''
    let unit = parseLmvUnit(row.enhet)

    // Energi finns ofta två gånger: en rad i kcal och en i kJ.
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

    let hit: readonly [NutrientKey, number] | undefined
    let prio = 0
    if (code && (hit = CODE_MAP.get(code))) prio = PRIO_CODE
    else if (fork && (hit = FORK_MAP.get(fork) ?? CODE_MAP.get(fork.toUpperCase()))) prio = PRIO_FORK
    else if (name && (hit = NAME_MAP.get(name))) prio = PRIO_NAME
    if (!hit) continue
    const [key, adj] = hit
    put(key, convert(value, unit, key), prio + adj)
  }

  const out: Nutrients = {}
  for (const [key, { value }] of best) out[key] = value
  if (out.omega3 === undefined && omega3Found) out.omega3 = omega3Parts
  // Retinolekvivalenter = retinol + betakaroten / 12 (när summan saknas).
  if (out.vitA === undefined && retinol !== undefined) out.vitA = retinol + (betaCarotene ?? 0) / 12
  const completed = completeNutrients(out)
  const rounded: Nutrients = {}
  for (const key of Object.keys(completed) as NutrientKey[]) {
    const v = completed[key]
    if (v !== undefined && Number.isFinite(v)) rounded[key] = roundNutrient(v)
  }
  return rounded
}

// ---------------------------------------------------------------------------
// Kategori, flytande och densitet
// ---------------------------------------------------------------------------

/**
 * Nyckelord per kategori (i prioritetsordning). Ett ord i namnet matchar om det är lika med
 * nyckelordet, slutar med det (huvudordet i en sammansättning, "hårdost" → "ost") eller börjar med
 * det ("kycklingbröstfilé" → "kyckling"). Längsta nyckelord vinner vid sammansättningar.
 */
export const LMV_CATEGORY_RULES: ReadonlyArray<readonly [FoodCategory, readonly string[]]> = [
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

/** Treställiga nyckelord som också får matcha som huvudord i sammansättningar ("hårdost", "rödlök"). */
const SHORT_HEADS = new Set(['ost', 'öl', 'vin', 'lax', 'ägg', 'bär', 'kål', 'lök', 'ris', 'rom', 'fil', 'sås', 'nöt', 'paj', 'gås'])

/** Allmänna huvudord där förledet avgör djurslaget ("kycklingfärs" är fågel, "fiskbiff" är fisk). */
const GENERIC_HEADS = new Set(['kött', 'färs', 'biff', 'biffar', 'bitar', 'strimlor', 'kotlett'])
/** Ord som gör en köttprodukt vegetarisk ("Vegetarisk korv" → vegoprotein). */
const VEG_MODIFIERS = new Set(['vegetarisk', 'vegetariska', 'vegetariskt', 'vegansk', 'veganska', 'veganskt', 'vego', 'växtbaserad', 'växtbaserade', 'växtbaserat'])
const MEATY: ReadonlySet<FoodCategory> = new Set(['rott_kott', 'chark', 'fagel', 'fisk', 'skaldjur'])

/** Densitet (g/ml) för torrvaror och fetter så att dl/msk/tsk fungerar. Matchas mot namnets första ord. */
export const LMV_DENSITY_RULES: ReadonlyArray<readonly [string, number]> = [
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

/** Ord som visar att en torrvara är tillagad (då gäller inte torrvarans densitet). */
const COOKED_WORDS = new Set(['kokt', 'kokta', 'kokat', 'tillagad', 'tillagat', 'tillagade', 'stekt', 'stekta'])
/** Mejeriprodukter som inte mäts i dl. */
const SOLID_DAIRY_WORDS = /pulver|ost$/

interface Keyword {
  word: string
  cat: FoodCategory
  order: number
}

const KEYWORDS: Keyword[] = []
const EXACT = new Map<string, Keyword>()
LMV_CATEGORY_RULES.forEach(([cat, words], order) => {
  for (const w of words) {
    const word = normalizeSv(w)
    const kw = { word, cat, order }
    KEYWORDS.push(kw)
    if (!EXACT.has(word)) EXACT.set(word, kw)
  }
})

const better = (kw: Keyword, best: Keyword | undefined) =>
  !best || kw.word.length > best.word.length || (kw.word.length === best.word.length && kw.order < best.order)

/** Hitta kategori för ett enskilt (normaliserat) ord, eller undefined. */
function categoryOfToken(token: string): FoodCategory | undefined {
  const exact = EXACT.get(token)
  if (exact) return exact.cat
  // Huvudordet sist i sammansättningen väger tyngst ("hallonsylt" är sylt) …
  let suffix: Keyword | undefined
  for (const kw of KEYWORDS) {
    const w = kw.word
    if (w.length < 4 && !SHORT_HEADS.has(w)) continue
    if (token.length - w.length >= 2 && token.endsWith(w) && better(kw, suffix)) suffix = kw
  }
  if (suffix && !GENERIC_HEADS.has(suffix.word)) return suffix.cat
  // … utom för allmänna huvudord där förledet avgör ("kycklingfärs").
  let prefix: Keyword | undefined
  for (const kw of KEYWORDS) {
    const w = kw.word
    if (w.length < 4) continue
    if (token.length > w.length && token.startsWith(w) && better(kw, prefix)) prefix = kw
  }
  return (prefix ?? suffix)?.cat
}

function categoryOfText(text: string): FoodCategory | undefined {
  const tokens = normalizeSv(text).split(' ').filter((t) => t && !/^\d/.test(t))
  const veg = tokens.some((t) => VEG_MODIFIERS.has(t))
  for (const token of tokens) {
    if (VEG_MODIFIERS.has(token)) continue
    const cat = categoryOfToken(token)
    if (cat) return veg && MEATY.has(cat) ? 'vegoprotein' : cat
  }
  return veg ? 'vegoprotein' : undefined
}

/** Alla textvärden i klassificeringarna (godtycklig form). */
function classificationTexts(classes: readonly LmvClassification[] | undefined): string[] {
  const out: string[] = []
  const walk = (v: unknown, depth: number) => {
    if (depth > 6) return
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1))
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, depth + 1))
  }
  walk(classes ?? [], 0)
  return out
}

const DRINKS: ReadonlySet<FoodCategory> = new Set(['dryck', 'lask_saft', 'juice', 'alkohol', 'vaxtdryck'])

/**
 * Alla mappningstabeller samlade. Testet jämför dem med kopian i
 * `scripts/import-livsmedelsverket.mjs` så att appen och importskriptet inte glider isär.
 */
export const LMV_MAPPING_TABLES = {
  codes: EXTRA_CODES,
  forkortningar: FORK_CODES,
  names: NAME_CODES,
  categoryRules: LMV_CATEGORY_RULES,
  densityRules: LMV_DENSITY_RULES,
  shortHeads: [...SHORT_HEADS],
  genericHeads: [...GENERIC_HEADS],
  vegModifiers: [...VEG_MODIFIERS],
  cookedWords: [...COOKED_WORDS],
  solidDairy: SOLID_DAIRY_WORDS.source,
} as const

export interface LmvCategoryInfo {
  category: FoodCategory
  liquid: boolean
  density?: number
}

/**
 * Kategori, "flytande" och densitet utifrån namnet (Livsmedelsverkets namn börjar med basvaran:
 * "Mjölk fett 3%", "Kyckling bröstfilé rå"), med klassificeringarna som reserv.
 */
export function categorizeLmv(name: string, classes?: readonly LmvClassification[], nutrients: Nutrients = {}): LmvCategoryInfo {
  let category = categoryOfText(name)
  if (!category) {
    for (const text of classificationTexts(classes)) {
      category = categoryOfText(text)
      if (category) break
    }
  }
  category ??= 'ovrigt'
  // Sockerfri läsk räknas som dryck; alkoholhaltiga drycker som alkohol.
  if (category === 'lask_saft' && nutrients.sugars !== undefined && nutrients.sugars < 1) category = 'dryck'
  if ((DRINKS.has(category) || category === 'ovrigt') && (nutrients.alcohol ?? 0) >= 1.5) category = 'alkohol'

  const tokens = normalizeSv(name).split(' ').filter(Boolean)
  const first = tokens[0] ?? ''
  const liquid =
    DRINKS.has(category) ||
    (category === 'mejeri' && !tokens.some((t) => SOLID_DAIRY_WORDS.test(t))) ||
    tokens.some((t) => t.endsWith('soppa'))

  let density: number | undefined
  if (!liquid && !tokens.some((t) => COOKED_WORDS.has(t))) {
    for (const [word, d] of LMV_DENSITY_RULES) {
      const w = normalizeSv(word)
      if (first === w || (first.length - w.length >= 2 && first.endsWith(w))) {
        density = d
        break
      }
    }
  }
  const info: LmvCategoryInfo = { category, liquid }
  if (density !== undefined) info.density = density
  return info
}

/** Snygga till ett namn: "Mjölk fett 3%" → "Mjölk fett 3 %", blanksteg komprimeras. */
export function tidyLmvName(name: string): string {
  const s = String(name ?? '')
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s*%/g, '$1 %')
    .trim()
  return s.charAt(0).toLocaleUpperCase('sv-SE') + s.slice(1)
}

/**
 * Gör om ett livsmedel från Livsmedelsverket till ett Lagom-livsmedel (id `lmv:<nummer>`).
 * Källhänvisningen visas i UI utifrån `source: 'livsmedelsverket'` (se `LMV_ATTRIBUTION`).
 */
export function mapLmvFood(item: LmvListItem, rows: readonly LmvNutrientRow[], classes?: readonly LmvClassification[]): Food {
  const nutrients = mapLmvNutrients(rows)
  const name = tidyLmvName(item.namn)
  const { category, liquid, density } = categorizeLmv(name, classes, nutrients)
  const food: Food = {
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
// Klient
// ---------------------------------------------------------------------------

export type LmvErrorCode = 'offline' | 'timeout' | 'network' | 'server' | 'bad_response'

const LMV_MESSAGES: Record<LmvErrorCode, string> = {
  offline: 'Ingen internetanslutning. Kontrollera uppkopplingen och försök igen.',
  timeout: 'Livsmedelsverket svarar inte just nu. Försök igen om en stund.',
  network: 'Kunde inte nå Livsmedelsverkets databas.',
  server: 'Livsmedelsverkets databas har tillfälliga problem. Försök igen senare.',
  bad_response: 'Oväntat svar från Livsmedelsverkets databas.',
}

export class LivsmedelsverketError extends Error {
  readonly code: LmvErrorCode
  readonly status?: number

  constructor(code: LmvErrorCode, status?: number) {
    super(LMV_MESSAGES[code])
    this.name = 'LivsmedelsverketError'
    this.code = code
    this.status = status
  }
}

const REQUEST_TIMEOUT_MS = 20_000
const MAX_ATTEMPTS = 4

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Avbrutet', 'AbortError'))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(signal?.reason ?? new DOMException('Avbrutet', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Hämta JSON med tidsgräns och upp till fyra försök (exponentiell backoff vid nätverksfel, 429 och 5xx). */
async function lmvFetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Avbrutet', 'AbortError')
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new LivsmedelsverketError('offline')
    const ctrl = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ctrl.abort()
    }, REQUEST_TIMEOUT_MS)
    const onAbort = () => ctrl.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    let retryAfterMs = 0
    try {
      const res = await fetch(`${LMV_API_BASE}${path}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      if (res.ok) return await res.json()
      if (res.status === 429 || res.status >= 500) {
        lastError = new LivsmedelsverketError('server', res.status)
        retryAfterMs = (Number(res.headers.get('retry-after')) || 0) * 1000
      } else {
        throw new LivsmedelsverketError('bad_response', res.status)
      }
    } catch (err) {
      if (signal?.aborted) throw signal.reason ?? err
      if (err instanceof LivsmedelsverketError) throw err
      lastError = new LivsmedelsverketError(timedOut ? 'timeout' : err instanceof SyntaxError ? 'bad_response' : 'network')
      if (err instanceof SyntaxError) throw lastError
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      const backoff = Math.max(retryAfterMs, 500 * 2 ** attempt + Math.random() * 250)
      await sleep(backoff, signal)
    }
  }
  throw lastError
}

/** Hämta hela livsmedelslistan (sidvis). */
export async function fetchLmvFoodList(
  opts: { signal?: AbortSignal; pageSize?: number; onPage?: (fetched: number, total: number) => void } = {},
): Promise<LmvListItem[]> {
  const pageSize = opts.pageSize ?? 500
  const out: LmvListItem[] = []
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const json = (await lmvFetchJson(`/livsmedel?offset=${offset}&limit=${pageSize}&sprak=1`, opts.signal)) as LmvListResponse
    const page = Array.isArray(json?.livsmedel) ? json.livsmedel : null
    if (!page) throw new LivsmedelsverketError('bad_response')
    for (const item of page) {
      if (item && typeof item.nummer === 'number' && typeof item.namn === 'string') out.push(item)
    }
    total = json._meta?.totalRecords ?? (page.length < pageSize ? offset + page.length : Infinity)
    offset += pageSize
    opts.onPage?.(Math.min(offset, total === Infinity ? out.length : total), total === Infinity ? out.length : total)
    if (page.length === 0) break
  }
  return out
}

export async function fetchLmvNutrients(nummer: number, signal?: AbortSignal): Promise<LmvNutrientRow[]> {
  const json = await lmvFetchJson(`/livsmedel/${nummer}/naringsvarden?sprak=1`, signal)
  if (!Array.isArray(json)) throw new LivsmedelsverketError('bad_response')
  return json as LmvNutrientRow[]
}

export async function fetchLmvClassifications(nummer: number, signal?: AbortSignal): Promise<LmvClassification[]> {
  const json = await lmvFetchJson(`/livsmedel/${nummer}/klassificeringar?sprak=1`, signal)
  if (Array.isArray(json)) return json as LmvClassification[]
  return json && typeof json === 'object' ? [json as LmvClassification] : []
}

/** Hämta ett enskilt livsmedel (t.ex. för att uppdatera ett sparat livsmedel). */
export async function fetchLmvFood(item: LmvListItem, opts: { signal?: AbortSignal; includeClassifications?: boolean } = {}): Promise<Food> {
  const [rows, classes] = await Promise.all([
    fetchLmvNutrients(item.nummer, opts.signal),
    opts.includeClassifications ? fetchLmvClassifications(item.nummer, opts.signal).catch(() => []) : Promise.resolve(undefined),
  ])
  return mapLmvFood(item, rows, classes)
}

export interface LmvImportProgress {
  phase: 'lista' | 'naringsvarden'
  done: number
  total: number
  failed: number
}

export interface LmvImportOptions {
  onProgress?: (p: LmvImportProgress) => void
  signal?: AbortSignal
  /** Antal samtidiga anrop (standard 4 – var snäll mot Livsmedelsverkets server). */
  concurrency?: number
  /** Hämta även klassificeringar (dubbelt så många anrop, ger säkrare kategorier). */
  includeClassifications?: boolean
  /** Importera bara de första N livsmedlen (för test). */
  limit?: number
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

/** Kör `fn` över `items` med begränsad samtidighet och ger resultaten i den ordning de blir klara. */
async function* pool<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>): AsyncGenerator<Settled<R>> {
  const inflight = new Map<number, Promise<[number, Settled<R>]>>()
  let next = 0
  const start = (i: number) => {
    inflight.set(
      i,
      fn(items[i]).then(
        (value): [number, Settled<R>] => [i, { ok: true, value }],
        (error: unknown): [number, Settled<R>] => [i, { ok: false, error }],
      ),
    )
  }
  while (next < items.length || inflight.size > 0) {
    while (inflight.size < concurrency && next < items.length) start(next++)
    const [i, result] = await Promise.race(inflight.values())
    inflight.delete(i)
    yield result
  }
}

/**
 * Importera hela livsmedelsdatabasen i appen. Ger livsmedel allteftersom de hämtats; livsmedel
 * som inte gick att hämta (efter omförsök) hoppas över och räknas i `failed`.
 *
 * @example
 * for await (const food of importAll({ onProgress: setProgress, signal })) foods.push(food)
 */
export async function* importAll(opts: LmvImportOptions = {}): AsyncGenerator<Food, void, undefined> {
  const { onProgress, signal, includeClassifications = false } = opts
  const concurrency = Math.max(1, Math.min(8, Math.floor(opts.concurrency ?? 4)))
  onProgress?.({ phase: 'lista', done: 0, total: 0, failed: 0 })
  const list = await fetchLmvFoodList({
    signal,
    onPage: (done, total) => onProgress?.({ phase: 'lista', done, total, failed: 0 }),
  })
  const items = opts.limit !== undefined ? list.slice(0, Math.max(0, opts.limit)) : list
  let done = 0
  let failed = 0
  onProgress?.({ phase: 'naringsvarden', done, total: items.length, failed })
  for await (const result of pool(items, concurrency, (item) => fetchLmvFood(item, { signal, includeClassifications }))) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Avbrutet', 'AbortError')
    if (result.ok) {
      done++
      onProgress?.({ phase: 'naringsvarden', done, total: items.length, failed })
      yield result.value
    } else {
      failed++
      onProgress?.({ phase: 'naringsvarden', done, total: items.length, failed })
    }
  }
}
