/**
 * Tolka en näringsdeklaration som text – "Fyll i från förpackningen".
 *
 * Texten kommer från telefonens egen textigenkänning (Live Text/"Skanna text" på iPhone, kamerans
 * textigenkänning eller Google Lens på Android) eller klistras in. Inget skickas någonstans och
 * inget sparas – det här är en ren funktion utan sidoeffekter.
 *
 * Tolkar EU:s näringsdeklaration enligt förordning (EU) nr 1169/2011 bilaga XV – Energi (kJ/kcal),
 * Fett, varav mättat/enkelomättat/fleromättat fett, Kolhydrat, varav sockerarter/polyoler/stärkelse,
 * Fiber, Protein och Salt – samt vitaminer och mineraler. Förutom svenska känns de språk igen som
 * brukar stå på nordiska flerspråkiga förpackningar: norska, danska, finska och engelska.
 *
 * - Kolumner: "per 100 g"/"per 100 ml"/"100 g"/"100 g:ssa", "per portion (30 g)", "%RI"/"% av RI".
 *   Kolumnen per 100 g (100 ml) väljs alltid – finns flera ("per 100 g pulver / per 100 ml
 *   tillagad") den första, med en varning. Per portion används bara när ingen 100-kolumn finns;
 *   står portionens vikt finns värdena också omräknade till per 100 g (`per100`).
 * - Tal med decimalkomma eller punkt, "<0,5 g" och "spår" (en försumbar mängd enligt EU:s
 *   vägledning → 0; "<3 g" är däremot okänt), "1550 kJ/370 kcal" på en eller två rader,
 *   "kJ 1550 kcal 370", energi bara i kJ (÷ 4,184) och "1 550 kJ"/"1.550 kJ"/"1,550 kJ".
 *   Internationella enheter (IE/IU) räknas inte om.
 * - Vanliga fel från textigenkänning: O ↔ 0, l/I ↔ 1, enheten fastklistrad ("12g"), "varavmättat",
 *   radbrytningar mitt i ord och tal, och tabeller som lästs kolumn för kolumn (alla namn först,
 *   sedan värdena – enheterna måste passa namnen).
 * - Ingredienslistan, fotnoten om referensintag och påståenden som "Tillverkad av 45 g bär per
 *   100 g" hoppas över.
 * - Salt blir `salt` (g). Natrium anges bara om etiketten säger natrium.
 * - Okänt är `undefined`, aldrig 0.
 */
import type { NutrientKey, Nutrients } from '../types'
import { KJ_PER_KCAL, NUTRIENTS } from './nutrients'
import { formatNumber } from './format'

// ---------------------------------------------------------------------------
// Publika typer
// ---------------------------------------------------------------------------

export type LabelUnit = 'g' | 'ml'

/** Kolumnen som värdena hämtades från. */
export type LabelColumn =
  | {
      kind: 'per100'
      unit: LabelUnit
      /** Texten sa inte vad värdena gäller – de har tolkats som per 100 g. */
      assumed?: boolean
      /** Ordet som skiljer kolumnen från en annan per 100, t.ex. "pulver", "okokt" eller "tillagad". */
      qualifier?: string
    }
  | {
      kind: 'portion'
      unit: LabelUnit
      /** Portionens vikt i g (eller volym i ml) – saknas om den inte står i texten. */
      amount?: number
      /** T.ex. "1 portion", "1 bar". */
      label: string
    }

export interface LabelValues {
  /** Näringsvärden (kcal räknas fram ur kJ om bara kJ står). Bara det som stod på etiketten. */
  nutrients: Nutrients
  /** Energi i kJ som den stod. */
  kJ?: number
  /** Energi i kcal som den stod. */
  kcal?: number
}

export interface NutritionLabelResult {
  /** Kolumnen som användes – null om inga näringsvärden hittades. */
  column: LabelColumn | null
  /** 'ml' när värdena gäller per 100 ml (flytande). */
  unit: LabelUnit
  /** Värdena i den använda kolumnen. */
  stated: LabelValues
  /** Värdena per 100 g (ml). Saknas bara när värdena gäller per portion och vikten inte står. */
  per100?: LabelValues
  /** Portionen från kolumnrubriken, t.ex. { grams: 30, label: '1 portion' }. */
  portion?: { grams: number; label: string }
  /** Delar av texten som såg ut att höra till tabellen men inte gick att tolka. */
  unparsed: string[]
  /** Saker att kontrollera (rimlighetskontroller, osäkra tolkningar). */
  warnings: string[]
  /** Upplysningar (omräkningar, "<0,5 g" → 0 …). */
  notes: string[]
}

/** Näringsämnen som tolken kan fylla i, i näringsdeklarationens ordning. */
export const LABEL_NUTRIENTS = [
  'fat',
  'satFat',
  'monoFat',
  'polyFat',
  'carbs',
  'sugars',
  'addedSugar',
  'fiber',
  'protein',
  'salt',
  'sodium',
  'omega3',
  'cholesterol',
  'caffeine',
  'vitA',
  'vitD',
  'vitE',
  'vitK',
  'vitC',
  'thiamin',
  'riboflavin',
  'niacin',
  'vitB6',
  'folate',
  'vitB12',
  'calcium',
  'iron',
  'magnesium',
  'potassium',
  'phosphorus',
  'zinc',
  'selenium',
  'iodine',
] as const satisfies readonly NutrientKey[]

type LabelNutrient = (typeof LABEL_NUTRIENTS)[number]

// ---------------------------------------------------------------------------
// Interna typer
// ---------------------------------------------------------------------------

/** Rader som känns igen men inte har egna fält i Lagom. */
type IgnoredKey = 'polyols' | 'starch' | 'unsat' | 'trans'
type RowKey = LabelNutrient | IgnoredKey | 'energy'
type ObsKey = LabelNutrient | IgnoredKey | 'kJ' | 'kcal' | 'energy?'

/** 'IU' = internationella enheter (IE/IU) – räknas inte om. */
type Unit = 'kJ' | 'kcal' | 'g' | 'mg' | 'µg' | 'ml' | 'dl' | 'cl' | 'IU'

/** Vad som skiljer två kolumner per 100 åt: torr vara/pulver, tillagad/spädd eller avrunnen vikt. */
type QualifierKind = 'dry' | 'prepared' | 'drained'

type Col =
  | { kind: 'per100'; unit: LabelUnit; assumed?: boolean; qualifier?: string; qkind?: QualifierKind }
  | { kind: 'portion'; unit: LabelUnit; amount?: number; label: string }
  | { kind: 'ri' }

interface Obs {
  key: ObsKey
  col: Col
  value: number
  /** "<0,5 g" */
  lt?: boolean
  /** "spår" */
  trace?: boolean
  /** "<3 g" – en gräns över det EU räknar som försumbart: okänt värde upp till `value`. */
  bound?: boolean
  seq: number
  raw: string
}

type Atom =
  | { t: 'num'; v: number; raw: string }
  | { t: 'unit'; u: Unit }
  | { t: 'pct' }
  | { t: 'lt' }
  | { t: 'trace' }
  | { t: 'dash' }
  | { t: 'word' }

interface Tok {
  value?: number
  raw?: string
  unit?: Unit
  lt?: boolean
  trace?: boolean
  pct?: boolean
}

const ASSUMED_COL: Col = { kind: 'per100', unit: 'g', assumed: true }

const IGNORED_NAMES: Record<IgnoredKey, string> = {
  polyols: 'polyoler',
  starch: 'stärkelse',
  unsat: 'omättat fett',
  trans: 'transfett',
}

// ---------------------------------------------------------------------------
// Namn på näringsämnen (sv, no, da, fi, en – och lite tyska)
// ---------------------------------------------------------------------------

const NUM = String.raw`\d+(?:[.,]\d+)?`
/** Ett efterföljande ord för fett: "mättat fett", "mettede fettsyrer", "tyydyttynyttä rasvaa" … */
const FAT_TAIL = String.raw`(?:[\s-]+(?:fett\p{L}*|fedt\p{L}*|rasv\p{L}*|fat(?:ty)?(?:\s+acids)?))?`
const VIT = String.raw`(?:vitamin|vitamiini|vit\.?)\s?-?\s?`

/**
 * Namnen i prioritetsordning – de specifika först, så att "enkelomättat" inte blir "mättat",
 * "mono-unsaturates" inte "saturates" och "mättat fett" inte "fett".
 */
const NAME_DEFS: ReadonlyArray<readonly [RowKey, string]> = [
  ['energy', String.raw`energi(?:a|aa|värde|innhold|indhold)?|energy|energie|brennwert`],
  ['addedSugar', String.raw`tillsatt\s+socker|tilsatt?\s+sukker|added\s+sugars?|lisätty\p{L}*\s+soker\p{L}*`],
  ['monoFat', String.raw`(?:enkel-?\s?omättad?|en-?\s?umett|enkelt?-?\s?umætt|mono-?\s?umætt|kertatyydyttymät|mono-?\s?unsaturat|einfach\s+ungesättigt)\p{L}*${FAT_TAIL}`],
  ['polyFat', String.raw`(?:fler-?\s?omättad?|fler-?\s?umett|fler-?\s?umætt|poly-?\s?umætt|monityydyttymät|poly-?\s?unsaturat|mehrfach\s+ungesättigt)\p{L}*${FAT_TAIL}`],
  ['trans', String.raw`trans-?\s?(?:fett|fedt|fat|rasv)\p{L}*`],
  ['unsat', String.raw`(?:omättad?|umett|umætt|tyydyttymät|unsaturat|ungesättigt)\p{L}*${FAT_TAIL}`],
  ['satFat', String.raw`(?:mättad?|mett(?:ede|et|a)|mætt(?:ede|et)|tyydyttyn|saturat|gesättigt)\p{L}*${FAT_TAIL}`],
  ['omega3', String.raw`omega-?\s?3(?:[\s-]*(?:fett\p{L}*|fedt\p{L}*|fatty\s+acids|rasvahap\p{L}*))?`],
  ['cholesterol', String.raw`kolesterol\p{L}*|cholesterol`],
  ['fat', String.raw`fett|fedt|rasva(?:a|t)?|rasvoja|total\s+fat|fat`],
  ['polyols', String.raw`polyol\p{L}*`],
  ['starch', String.raw`stärkelse|stivelse|tärkkelys\p{L}*|starch|stärke`],
  ['sugars', String.raw`sockerart(?:er)?|socker|sukkerart(?:er)?|sukker|sokeri(?:a|t|ta)?|sokereita|sugars?|zucker`],
  ['carbs', String.raw`kolhydrat(?:er)?|karbohydrat(?:er)?|kulhydrat(?:er)?|hiilihydraat\p{L}*|carbohydrates?|kohlenhydrate`],
  ['fiber', String.raw`(?:kost|dietary\s+)?fib(?:er|rer|re|res)|(?:ravinto)?kuitu(?:a|ja)?|ballaststoffe`],
  ['protein', String.raw`protein(?:er|s)?|proteiini(?:a|t)?|eiweiß|eiweiss`],
  ['salt', String.raw`salt|suola(?:a)?|salz`],
  ['sodium', String.raw`natrium|sodium`],
  ['caffeine', String.raw`koffein|caffeine|kofeiini(?:a)?`],
  ['vitB12', String.raw`${VIT}B\s?12|B\s?12-vitamin\p{L}*|kobalamin|cobalamin`],
  ['vitB6', String.raw`${VIT}B\s?6|B\s?6-vitamin\p{L}*`],
  ['thiamin', String.raw`${VIT}B\s?1(?!\d)|tiamin|thiamine?|tiamiini`],
  ['riboflavin', String.raw`${VIT}B\s?2|riboflavin|riboflaviini`],
  ['niacin', String.raw`${VIT}B\s?3|niacin|niasiini`],
  ['folate', String.raw`folat|folsyra|folsyre|folic\s+acid|folate|folaatti|foolihappo`],
  ['vitA', String.raw`${VIT}A|A-vitamin\p{L}*`],
  ['vitD', String.raw`${VIT}D\d?|D-vitamin\p{L}*`],
  ['vitE', String.raw`${VIT}E|E-vitamin\p{L}*`],
  ['vitK', String.raw`${VIT}K\d?|K-vitamin\p{L}*`],
  ['vitC', String.raw`${VIT}C|C-vitamin\p{L}*|askorbinsyra`],
  ['calcium', String.raw`kalcium|calcium|kalsium\p{L}*`],
  ['iron', String.raw`järn|jern|iron|rauta(?:a)?`],
  ['magnesium', String.raw`magnesium\p{L}*`],
  ['potassium', String.raw`kalium\p{L}*|potassium`],
  ['phosphorus', String.raw`fosfor\p{L}*|phosphorus`],
  ['zinc', String.raw`zink|sink(?:ki)?|zinc`],
  ['selenium', String.raw`selen|selenium|seleeni`],
  ['iodine', String.raw`jodi?|iodine`],
]

const NAME_RES: ReadonlyArray<readonly [RowKey, RegExp]> = NAME_DEFS.map(
  ([key, src]) => [key, new RegExp(String.raw`(?<![\p{L}\d])(?:${src})(?![\p{L}])`, 'giu')] as const,
)

interface NameHit {
  key: RowKey
  start: number
  end: number
}

/** Alla namn i texten, utan överlapp (de specifika namnen vinner). */
function findNames(s: string): NameHit[] {
  const hits: NameHit[] = []
  for (const [key, re] of NAME_RES) {
    for (const m of s.matchAll(re)) {
      const start = m.index
      const end = start + m[0].length
      if (end === start || hits.some((h) => start < h.end && end > h.start)) continue
      hits.push({ key, start, end })
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

// ---------------------------------------------------------------------------
// Kolumnrubriker
// ---------------------------------------------------------------------------

const PORTION_WORDS = String.raw`portion\p{L}*|porsjon\p{L}*|annos\p{L}*|serving|bar|skiva|skive|stycke|stk\.?|st\.?|kaka|kex|glas|burk|flaska|påse|bit`
const RI_SRC = String.raw`(?<!\d\s*)%\s*(?:av\s+|of\s+)?(?:dagligt\s+)?(?:RI|DI|GDA|RDI|referens\p{L}*|reference\p{L}*|referanse\p{L}*|saanti\p{L}*|vertailu\p{L}*)|(?<![\p{L}])(?:RI|GDA)\s*%|(?<![\p{L}])RI\*|(?<!\d\s*)%\s*\**`
const P100_SRC = String.raw`(?:(?:per|pr\.?|i)\s*|\/\s*)?(?<![\d.,])100\s*(?<u100>ml|g|gram|gr)(?![\p{L}])(?::?\s*ssa)?`

const DESC_RE = new RegExp(
  [
    `(?<ri>${RI_SRC})`,
    `(?<p100>${P100_SRC})`,
    String.raw`(?<por>(?:(?<![\p{L}])(?:per|pr\.?)|\/|(?<![\d.,])1)\s*(?<pw>${PORTION_WORDS})(?![\p{L}])(?:\s*[(=:]?\s*(?<pn>${NUM})\s*(?<pu>g|ml|dl|cl)(?![\p{L}])\)?)?|(?<pw2>${PORTION_WORDS})(?![\p{L}])\s*[(=:]\s*(?<pn2>${NUM})\s*(?<pu2>g|ml|dl|cl)(?![\p{L}])\)?)`,
    String.raw`(?<amt>(?:(?:per|pr\.?)\s*|\/\s*)?(?<![\d.,])(?<an>${NUM})\s*(?<au>g|ml|dl|cl)(?![\p{L}]))`,
  ].join('|'),
  'giu',
)

/** Kolumnbeskrivningar i en rad som står i näringsraderna och inte ska läsas som värden. */
const STRIP_RE = new RegExp(
  String.raw`(?:(?:per|pr\.?)\s*|\/\s*)(?<![\d.,])100\s*(?:ml|g)(?![\p{L}])(?::?\s*ssa)?|(?<![\d.,])100\s*(?:ml|g):?\s*ssa|(?:per|pr\.?)\s*(?:${PORTION_WORDS})(?![\p{L}])(?:\s*\(?\s*${NUM}\s*(?:g|ml|dl|cl)\s*\)?)?`,
  'giu',
)

const HEADER_WORD_RE =
  /näringsvärde\p{L}*|näringsdeklaration|näringsinnehåll|næringsinnhold|næringsindhold|næringsdeklarasjon|næringsværdi|ravintoarvo\p{L}*|ravintosisältö|nutrition\p{L}*|typical\s+values|genomsnittligt?\s+(?:innehåll|näringsvärde)/iu
const PORTION_WORD_RE = new RegExp(String.raw`(?<![\p{L}])(?:${PORTION_WORDS})(?![\p{L}])`, 'iu')

/**
 * Ord som skiljer två kolumner per 100 åt ("per 100 g pulver / per 100 ml tillagad",
 * "per 100 g okokt / per 100 g kokt"). Två kolumner av samma slag slås ihop (samma kolumn på
 * flera språk), olika slag hålls isär.
 */
const QUALIFIER_DEFS: ReadonlyArray<readonly [QualifierKind, string]> = [
  ['drained', String.raw`avrunn\p{L}*|avrent\p{L}*|drænet|drained|valutettu\p{L}*`],
  ['dry', String.raw`pulver\p{L}*|torr\p{L}*|tørr\p{L}*|okokt\p{L}*|ukokt\p{L}*|ukogt|outspädd|koncentrat|as\s+sold|uncooked|dry|powder|jauhe\p{L}*|kuiva\p{L}*|keittämät\p{L}*|trocken`],
  [
    'prepared',
    String.raw`tillag\p{L}*|tillred\p{L}*|tilbered\p{L}*|beredd\p{L}*|färdig\p{L}*|drickfärdig|drikkeklar|utspädd|spädd|fortyndet|kokt|kogt|as\s+prepared|prepared|cooked|keitetty\p{L}*|valmi\p{L}*|zubereitet`,
  ],
]
const QUALIFIER_RES = QUALIFIER_DEFS.map(([kind, src]) => [kind, new RegExp(String.raw`(?<![\p{L}])(?:${src})(?![\p{L}])`, 'iu')] as const)

function findQualifier(s: string): { kind: QualifierKind; word: string; index: number } | undefined {
  let best: { kind: QualifierKind; word: string; index: number } | undefined
  for (const [kind, re] of QUALIFIER_RES) {
    const m = re.exec(s)
    if (m && (best === undefined || m.index < best.index)) best = { kind, word: m[0].toLowerCase().replace(/\s+/g, ' '), index: m.index }
  }
  return best
}

/**
 * Påståenden om innehållet som ser ut som kolumnrubriker men inte är det – de hoppas över:
 * "Tillverkad av 45 g bär per 100 g", "Framställd av 70 g kött per 100 g korv",
 * "Valmistettu 45 g:sta marjoja 100 g:aan", "Total sockerhalt 50 g per 100 g", "Fruktmängd 45 %".
 */
const CLAIM_WORD = String.raw`(?!(?:per|pr|och|og|and|ja|${PORTION_WORDS})(?![\p{L}]))\p{L}[\p{L}-]*`
const CLAIM_RE = new RegExp(
  [
    String.raw`(?<![\d.,]|(?:per|pr\.?|\/|\()\s*)(?!100(?![\d.,]))${NUM}\s*(?:g|ml)(?::\s*sta)?(?![\p{L}])\s+(?:${CLAIM_WORD}\s+){1,4}(?:(?:(?:per|pr\.?)\s*|\/\s*)100\s*(?:g|ml)(?![\p{L}])|100\s*(?:g|ml):\s*(?:aan|ään))`,
    // Sammansatta ord ("sockerhalt", "bærinnhold") känns aldrig igen som näringsämnen – bara "… content" står isär.
    String.raw`(?:(?<![\p{L}])\p{L}*(?:halt|mängd|innhold|indhold|gehalt|pitoisuus)|(?:fruit|berry|meat|fish|sugar|cocoa|juice|vegetable)\s+content)\s*:?\s*(?:ca\.?\s*|minst\s*|min\.?\s*)?${NUM}\s*(?:g|ml|%)(?![\p{L}])(?:\s*(?:(?:per|pr\.?)\s*|\/\s*)100\s*(?:g|ml)(?![\p{L}]))?`,
  ].join('|'),
  'giu',
)

/** Ta bort påståenden om innehållet ur ett segment (rubriker som "Næringsinnhold 100 g" lämnas kvar). */
function stripClaims(seg: string): string {
  return seg.replace(CLAIM_RE, (m) => (HEADER_WORD_RE.test(m) ? m : ' ')).trim()
}
/** Ingredienslistan och tillagnings-/förvaringsråd – där står också "salt", "socker" och mängder. */
const INGREDIENTS_RE =
  /(?<![\p{L}])(?:ingredienser|ingredients|ainesosat|zutaten|tillagning|tillredning|bruksanvisning|tilberedning|tilberedelse|valmistusohje|valmistus|preparation|förvaring|oppbevaring|opbevaring|säilytys)(?![\p{L}])/iu
const FOOTER_RE = /genomsnittlig\s+vuxen|average\s+adult|gjennomsnittlig\s+voksen|gennemsnitlig\s+voksen|keskivertoaikuis|keskimääräi\p{L}*\s+aikuis|^\s*\*/iu
const REF_WORD_RE = /referensintag\p{L}*|reference\s+intakes?|referanseinntak|referenceindtag|saantisuositu\p{L}*|vertailuarvo\p{L}*/iu
const P100_RE = new RegExp(P100_SRC, 'iu')
const ENERGY_START_RE = /^\s*(?:energi(?:a|aa)?|energy)(?![\p{L}])/iu
const NUMBER_WITH_UNIT_RE = /\d\s*(?:g|mg|[µμu]g|mcg|kJ|kcal)(?![\p{L}])/iu

const PORTION_INFO_RE = new RegExp(
  String.raw`(?:portionsstorlek|portionsstørrelse|porsjonsstørrelse|annoskoko|serving\s+size|(?<![\p{L}])(?:1\s*)?(?:portion(?:er|en)?|porsjon(?:er|en)?|annos|serving|bar|skiva|kaka|kex|glas|stycke|st))\s*(?:=|:|à|á|är|er|on|is|motsvarar|tilsvarer|vastaa)\s*(?:ca\.?\s*|n\.?\s*|ungefär\s*)?(${NUM})\s*(g|ml|dl|cl)(?![\p{L}])`,
  'iu',
)

function toAmount(n: string, unit: string): { amount: number; unit: LabelUnit } {
  const v = parseNum(n)
  const u = unit.toLowerCase()
  if (u === 'dl') return { amount: v * 100, unit: 'ml' }
  if (u === 'cl') return { amount: v * 10, unit: 'ml' }
  return { amount: v, unit: u === 'ml' ? 'ml' : 'g' }
}

function portionLabel(word: string | undefined): string {
  const w = (word ?? '').toLowerCase()
  if (w === 'bar') return '1 bar'
  if (w === 'skiva' || w === 'skive') return '1 skiva'
  if (w.startsWith('st')) return '1 st'
  for (const x of ['kaka', 'kex', 'glas', 'burk', 'flaska', 'påse', 'bit']) if (w === x) return `1 ${x}`
  return '1 portion'
}

/** Portionens vikt om den står någon annanstans, t.ex. "1 portion = 30 g" i en fotnot. */
function findPortionInfo(text: string): { amount: number; unit: LabelUnit } | undefined {
  const m = PORTION_INFO_RE.exec(text)
  if (!m) return undefined
  const a = toAmount(m[1], m[2])
  return a.amount > 0 ? a : undefined
}

/**
 * Kolumnrubrikerna i en text. En naken mängd ("30 g") räknas bara som kolumn i en rubrik som
 * fortsätter (`allowBare`, t.ex. "(30 g)" på raden efter "per portion") eller tillsammans med en
 * annan rubrik i ett segment som ser ut som en rubrik – inte i "45 g bär per 100 g".
 */
function parseDescriptors(s: string, allowBare: boolean): Col[] {
  const found: Array<{ col: Col; bare: boolean; start: number; end: number }> = []
  for (const m of s.matchAll(DESC_RE)) {
    const g = m.groups ?? {}
    const at = { start: m.index, end: m.index + m[0].length }
    if (g.ri) found.push({ col: { kind: 'ri' }, bare: false, ...at })
    else if (g.p100) found.push({ col: { kind: 'per100', unit: g.u100.toLowerCase() === 'ml' ? 'ml' : 'g' }, bare: false, ...at })
    else if (g.por) {
      const n = g.pn ?? g.pn2
      const u = g.pu ?? g.pu2
      const label = portionLabel(g.pw ?? g.pw2)
      if (n && u) {
        const a = toAmount(n, u)
        found.push({ col: a.amount === 100 ? { kind: 'per100', unit: a.unit } : { kind: 'portion', ...a, label }, bare: false, ...at })
      } else found.push({ col: { kind: 'portion', unit: 'g', label }, bare: false, ...at })
    } else if (g.amt) {
      const a = toAmount(g.an, g.au)
      const prefixed = /^\s*(?:per|pr|\/)/i.test(g.amt)
      if (a.amount > 0) found.push({ col: a.amount === 100 ? { kind: 'per100', unit: a.unit } : { kind: 'portion', ...a, label: '1 portion' }, bare: !prefixed, ...at })
    }
  }

  // "per 100 g pulver / per 100 ml tillagad" (ordet efter) eller "Pulver per 100 g / Tillagad per 100 ml" (ordet före).
  const firstPer100 = found.findIndex((f) => f.col.kind === 'per100')
  if (firstPer100 !== -1) {
    const before = (i: number) => s.slice(i === 0 ? 0 : found[i - 1].end, found[i].start)
    const after = (i: number) => s.slice(found[i].end, found[i + 1]?.start ?? s.length)
    const wordBefore = findQualifier(before(firstPer100)) !== undefined
    found.forEach((f, i) => {
      if (f.col.kind !== 'per100') return
      const q = findQualifier(wordBefore ? before(i) : after(i))
      if (q) f.col = { ...f.col, qualifier: q.word, qkind: q.kind }
    })
  }

  const hasOther = found.some((f) => !f.bare)
  const onlyDescriptors = !/[\p{L}\d]/u.test(s.replace(DESC_RE, ' '))
  const headerLike = hasOther && (HEADER_WORD_RE.test(s) || PORTION_WORD_RE.test(s) || onlyDescriptors)
  return found.filter((f) => !f.bare || allowBare || headerLike).map((f) => f.col)
}

/** Slå ihop intilliggande rubriker för samma kolumn ("per 100 g / pr. 100 g / 100 g:ssa"). */
function mergeCols(list: Col[]): Col[] {
  const out: Col[] = []
  for (const c of list) {
    const prev = out[out.length - 1]
    if (prev?.kind === 'ri' && c.kind === 'ri') continue
    if (prev?.kind === 'per100' && c.kind === 'per100' && prev.unit === c.unit && prev.qkind === c.qkind) continue
    if (prev?.kind === 'portion' && c.kind === 'portion' && (prev.amount === undefined || c.amount === undefined || prev.amount === c.amount)) {
      out[out.length - 1] = {
        kind: 'portion',
        amount: prev.amount ?? c.amount,
        unit: prev.amount !== undefined ? prev.unit : c.unit,
        label: prev.label !== '1 portion' ? prev.label : c.label,
      }
      continue
    }
    out.push(c)
  }
  return out
}

function colId(c: Col): string {
  if (c.kind === 'ri') return 'ri'
  if (c.kind === 'per100') return `100${c.unit}${c.qkind ? `:${c.qkind}` : ''}${c.assumed ? '?' : ''}`
  return `p${c.amount ?? '?'}${c.unit}`
}

/** "per 100 g pulver", "per 100 ml" */
function describeCol(c: Extract<Col, { kind: 'per100' }>): string {
  return `per 100 ${c.unit}${c.qualifier ? ` ${c.qualifier}` : ''}`
}

// ---------------------------------------------------------------------------
// Förbehandling: OCR-fel, radbrytningar och segment
// ---------------------------------------------------------------------------

function parseNum(raw: string): number {
  return Number(raw.replace(',', '.'))
}

/** "l2g" → "12g", "O,5" → "0,5", "37O" → "370" – bara i ord som i övrigt är ett tal. */
function fixNumericWord(w: string): string {
  const m = /^(<?)([\dOoIl|]+(?:[.,][\dOoIl|]+)?)(kJ|kcal|mg|[µμu]g|mcg|g|ml|%)?([*,;.:]*)$/.exec(w)
  if (!m || !/\d/.test(m[2])) return w
  return m[1] + m[2].replace(/[Oo]/g, '0').replace(/[Il|]/g, '1') + (m[3] ?? '') + m[4]
}

function fixLine(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  // "varavmättat fett", "varavsockerarter" – textigenkänningen tappar ofta mellanslaget efter "varav".
  s = s.replace(/(?<![\p{L}])(varav|hvorav|heraf|josta)(\p{L}+)/giu, (m, a: string, b: string) =>
    findNames(b).some((h) => h.start === 0) ? `${a} ${b}` : m,
  )
  // "KJ", "kj", "k J" → kJ; "Kcal", "kcaI", "kca1" → kcal
  s = s.replace(/(?<![\p{L}])k\s?(?:ca[l1I|]|j)(?![\p{L}])/giu, (m) => (/j$/i.test(m) ? 'kJ' : 'kcal'))
  s = s.replace(/[^\s/()]+/g, fixNumericWord)
  // "1 550 kJ" → "1550 kJ" (tusentalsavgränsare)
  s = s.replace(/(?<![\d.,])(\d{1,2}) (\d{3})(?=\s?kJ(?![\p{L}]))/gu, (m, a: string, b: string) => (Number(a + b) < 4000 ? a + b : m))
  // Tabellstreck mellan kolumner
  s = s.replace(/(^|\s)\|(?=\s|$)/g, '$1').replace(/\s+/g, ' ')
  return s.trim()
}

const UNIT_START_RE = /^(?:kJ|kcal|mg|[µμu]g|mcg|g|ml)(?![\p{L}])/iu

/** Slå ihop rader som textigenkänningen har brutit mitt i ett ord, ett tal eller ett namn. */
function joinLines(prev: string, next: string): string | null {
  if (/\p{L}-$/u.test(prev) && /^\p{Ll}/u.test(next)) return prev.slice(0, -1) + next
  if (/\d[.,]$/.test(prev) && /^\d/.test(next)) return prev + next
  if (prev.endsWith('/') || next.startsWith('/')) return `${prev} ${next}`
  if (/\d$/.test(prev) && UNIT_START_RE.test(next)) return `${prev} ${next}`
  if (!/\d/.test(prev)) {
    const joined = `${prev} ${next}`
    if (findNames(joined).some((h) => h.start < prev.length && h.end > prev.length + 1)) return joined
  }
  return null
}

function prepareLines(text: string): string[] {
  const norm = text
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u2009\u202f\t]/g, ' ')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/≤/g, '<')
    .replace(/&lt;/g, '<')
  const out: string[] = []
  for (const raw of norm.split('\n')) {
    const line = fixLine(raw)
    if (!line) continue
    const prev = out[out.length - 1]
    const joined = prev === undefined ? null : joinLines(prev, line)
    if (joined !== null) out[out.length - 1] = joined
    else out.push(line)
  }
  return out
}

/** Dela en rad i segment: "Energi 1550 kJ, fett 12 g, varav …" och ";", "•". */
function splitSegments(line: string): string[] {
  return line
    .split(/\s*(?:;|•|·|,(?=\s*\p{L})|\.\s+(?=\p{Lu}))\s*/u)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Värden
// ---------------------------------------------------------------------------

const ATOM_RE =
  /(<)|(\d+(?:[.,]\d+)?)|(kJ|kcal)(?![\p{L}])|(mg|[µμu]g|mcg|gram|gr|g|ml|dl|cl|IU|IE|I\.\s?U\.|I\.\s?E\.)(?![\p{L}])|(%)|(spår|spor|traces?|sp\.)(?![\p{L}])|(?<![\p{L}\d])(-{1,3})(?![\p{L}\d])|(\p{L}+)/giu
const LT_WORDS = new Set(['under', 'mindre', 'less', 'below', 'alle'])

function unitOf(s: string): Unit {
  const u = s.toLowerCase()
  if (u === 'kj') return 'kJ'
  if (u === 'kcal') return 'kcal'
  if (u === 'mg') return 'mg'
  if (u === 'ml') return 'ml'
  if (u === 'dl') return 'dl'
  if (u === 'cl') return 'cl'
  if (u === 'g' || u === 'gram' || u === 'gr') return 'g'
  if (u.startsWith('i')) return 'IU'
  return 'µg'
}

function atomize(s: string): Atom[] {
  const out: Atom[] = []
  for (const m of s.matchAll(ATOM_RE)) {
    if (m[1]) out.push({ t: 'lt' })
    else if (m[2]) out.push({ t: 'num', v: parseNum(m[2]), raw: m[2] })
    else if (m[3] || m[4]) out.push({ t: 'unit', u: unitOf(m[3] ?? m[4]) })
    else if (m[5]) out.push({ t: 'pct' })
    else if (m[6]) out.push({ t: 'trace' })
    else if (m[7]) out.push({ t: 'dash' })
    else out.push(LT_WORDS.has(m[8].toLowerCase()) ? { t: 'lt' } : { t: 'word' })
  }
  return out
}

const isEnergyUnit = (u: Unit | undefined): u is 'kJ' | 'kcal' => u === 'kJ' || u === 'kcal'
const isValueAtom = (a: Atom) => a.t === 'num' || a.t === 'trace'

function isValueOnly(atoms: Atom[]): boolean {
  return atoms.length > 0 && atoms.every((a) => a.t !== 'word') && atoms.some((a) => isValueAtom(a) || a.t === 'dash')
}

/** Vad ett värde utan namn kan vara: energi (kJ/kcal), en vikt (g/mg/µg) eller okänt. */
function valueKind(atoms: Atom[]): 'energy' | 'mass' | 'unknown' {
  if (atoms.some((a) => a.t === 'unit' && isEnergyUnit(a.u))) return 'energy'
  if (atoms.some((a) => a.t === 'unit' && (a.u === 'g' || a.u === 'mg' || a.u === 'µg'))) return 'mass'
  return 'unknown'
}

/** Passar värdet namnet? kJ/kcal bara till energin, gram aldrig till energin. */
function fitsLabel(label: { key: RowKey; units: Unit[] }, kind: 'energy' | 'mass' | 'unknown'): boolean {
  if (kind === 'unknown') return true
  const energy = label.key === 'energy' || label.units.some(isEnergyUnit)
  return kind === 'energy' ? energy : !energy
}

/**
 * Sätt ihop tal och enheter. Enheten står oftast efter talet ("1550 kJ"), men ibland före
 * ("kJ 1550 kcal 370"), före alla tal ("kJ/kcal 1550/370") eller efter alla tal ("1550/370 kJ/kcal").
 * Enheter före första talet blir `hints` – standardenheten för tal utan enhet.
 */
function assemble(atoms: Atom[], energy: boolean): { tokens: Tok[]; hints: Unit[] } {
  const a = atoms.filter((x) => x.t !== 'word' && x.t !== 'dash')
  const tokens: Tok[] = []
  const first = a.findIndex(isValueAtom)
  if (first === -1) return { tokens, hints: [] }
  const hints: Unit[] = []
  let start = 0
  while (start < first && a[start].t !== 'lt') {
    const x = a[start]
    if (x.t === 'unit') hints.push(x.u)
    start++
  }

  // "kJ 1550 kcal 370"
  let lastNum = -1
  let lastEnergyUnit = -1
  a.forEach((x, i) => {
    if (x.t === 'num') lastNum = i
    if (x.t === 'unit' && isEnergyUnit(x.u)) lastEnergyUnit = i
  })
  if (energy && hints.length === 1 && isEnergyUnit(hints[0]) && lastEnergyUnit > first && lastEnergyUnit < lastNum) {
    let pending: Unit | undefined
    let lt = false
    for (const x of a) {
      if (x.t === 'unit') pending = x.u
      else if (x.t === 'lt') lt = true
      else if (x.t === 'pct') {
        const last = tokens[tokens.length - 1]
        if (last) tokens[tokens.length - 1] = { value: last.value, raw: last.raw, pct: true }
      } else if (x.t === 'num') {
        tokens.push({ value: x.v, raw: x.raw, unit: pending, lt })
        pending = undefined
        lt = false
      }
    }
    return { tokens, hints: [] }
  }

  // "1550/370 kJ/kcal"
  const body = a.slice(start)
  let k = 0
  while (body[k]?.t === 'num') k++
  if (k >= 2 && body.length === 2 * k && body.slice(k).every((x) => x.t === 'unit')) {
    for (let i = 0; i < k; i++) {
      const n = body[i] as Extract<Atom, { t: 'num' }>
      const u = body[k + i] as Extract<Atom, { t: 'unit' }>
      tokens.push({ value: n.v, raw: n.raw, unit: u.u })
    }
    return { tokens, hints }
  }

  let lt = false
  for (let j = start; j < a.length; j++) {
    const x = a[j]
    const next = a[j + 1]
    if (x.t === 'lt') lt = true
    else if (x.t === 'num') {
      if (next?.t === 'unit') {
        tokens.push({ value: x.v, raw: x.raw, unit: next.u, lt })
        j++
      } else if (next?.t === 'pct') {
        tokens.push({ value: x.v, raw: x.raw, pct: true })
        j++
      } else tokens.push({ value: x.v, raw: x.raw, lt })
      lt = false
    } else if (x.t === 'trace') {
      tokens.push({ value: 0, trace: true, unit: next?.t === 'unit' ? next.u : undefined })
      if (next?.t === 'unit') j++
    }
  }
  return { tokens, hints }
}

const MASS_FACTOR: Partial<Record<Unit, number>> = { g: 1, mg: 1e-3, 'µg': 1e-6 }

function targetUnit(key: LabelNutrient | IgnoredKey): 'g' | 'mg' | 'µg' {
  if (key === 'polyols' || key === 'starch' || key === 'unsat' || key === 'trans') return 'g'
  return NUTRIENTS[key].unit as 'g' | 'mg' | 'µg'
}

/** Räkna om till näringsämnets enhet (g, mg eller µg). undefined om enheten inte är en vikt. */
function convertUnit(key: LabelNutrient | IgnoredKey, value: number, unit: Unit | undefined): number | undefined {
  const target = targetUnit(key)
  // Natrium utan enhet: små tal är gram ("0,4"), stora milligram ("400").
  const from: Unit = unit ?? (key === 'sodium' ? (value < 20 ? 'g' : 'mg') : target)
  const f = MASS_FACTOR[from]
  const t = MASS_FACTOR[target]
  if (f === undefined || t === undefined) return undefined
  return round((value * f) / t, 6)
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

function decimalsFor(key: ObsKey): number {
  if (key === 'kJ') return 0
  if (key === 'kcal') return 1
  if (key === 'energy?') return 1
  const u = targetUnit(key)
  return u === 'g' ? 2 : u === 'mg' ? 1 : 2
}

function ratioOk(a: number, b: number): boolean {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return lo > 0 && hi / lo >= 3.9 && hi / lo <= 4.5
}

/**
 * Den största gränsen i "<X" som betyder en försumbar mängd (i näringsämnets enhet). EU:s vägledning
 * om avrundning låter förpackningen skriva "0 g" eller "<0,5 g" för fett, kolhydrat, sockerarter,
 * protein och fiber under 0,5 g, "<0,1 g" för fettsyrorna under 0,1 g och "<0,01 g" för salt under
 * 0,0125 g (natrium under 0,005 g). "<3 g" är däremot en okänd mängd upp till 3 g.
 */
function negligibleLimit(key: ObsKey): number {
  switch (key) {
    case 'kJ':
      return 4
    case 'kcal':
    case 'energy?':
      return 1
    case 'fat':
    case 'carbs':
    case 'sugars':
    case 'addedSugar':
    case 'fiber':
    case 'protein':
    case 'polyols':
    case 'starch':
      return 0.5
    case 'satFat':
    case 'monoFat':
    case 'polyFat':
    case 'unsat':
    case 'trans':
    case 'omega3':
      return 0.1
    case 'salt':
      return 0.0125
    case 'sodium':
      // mg – "<0,01 g"
      return 10
    default:
      return 0
  }
}

/** "1,550 kJ" (engelskt tusentalskomma) och "1.550 kJ" (danska/norska): energin anges alltid i hela tal. */
const ENERGY_THOUSANDS_RE = /^[1-9]\d?[.,]\d{3}$/

// ---------------------------------------------------------------------------
// Svenska namn i meddelanden
// ---------------------------------------------------------------------------

function nameOf(key: RowKey | ObsKey): string {
  if (key === 'energy' || key === 'kJ' || key === 'kcal' || key === 'energy?') return 'energi'
  if (key in IGNORED_NAMES) return IGNORED_NAMES[key as IgnoredKey]
  const name = NUTRIENTS[key as LabelNutrient].name
  return name.charAt(0).toLowerCase() + name.slice(1)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "fett, salt och protein" */
function listNames(names: string[]): string {
  const u = [...new Set(names)]
  if (u.length <= 1) return u.join('')
  return `${u.slice(0, -1).join(', ')} och ${u[u.length - 1]}`
}

// ---------------------------------------------------------------------------
// Tolken
// ---------------------------------------------------------------------------

/** Tolka en näringsdeklaration som text. Tål tom och helt irrelevant text. */
export function parseNutritionLabel(input: string): NutritionLabelResult {
  const lines = prepareLines(input ?? '')
  const portionInfo = findPortionInfo(lines.join('\n'))
  const segments = lines.flatMap(splitSegments)

  let columns: Col[] = []
  /** Portionskolumner som rader har lästs in med – portionen kan sparas som mått. */
  const usedPortions: Array<Extract<Col, { kind: 'portion' }>> = []
  let headerOpen = false
  let skipIngredients = false
  let afterFooter = false
  /** Namn utan värde, i ordning – för tabeller som lästs kolumn för kolumn. `units`: "Energi (kJ)". */
  let labelOrder: Array<{ key: RowKey; seq: number; units: Unit[] }> = []
  let pairIndex = 0
  let pairsInBlock = 0
  let columnWise = false
  let lastRowKey: RowKey | null = null
  let lastEnergyCols: Col[] | null = null
  const obs: Obs[] = []
  let labelOnly: Array<{ key: RowKey; seq: number }> = []
  const candidates: Array<{ seq: number; text: string; value: boolean }> = []
  const extraValues = new Set<RowKey>()
  const fewerValues = new Set<RowKey>()
  /** Rader i internationella enheter (IE/IU) – räknas inte om. */
  const iuRows: Array<{ key: RowKey; col: Col; raw: string }> = []
  let firstTableSeq = Number.POSITIVE_INFINITY

  const fillPortion = (c: Col): Col => (c.kind === 'portion' && c.amount === undefined && portionInfo ? { ...c, ...portionInfo } : c)

  /**
   * Namn utan värde som inte hör till tabellen – produktnamn och påståenden som "Protein Pudding" eller
   * "Källa till fiber" – tas bort, så att de varken paras ihop med tabellens värden eller listas som
   * "inget värde hittades".
   */
  const dropUnpairedLabels = (from: number, count: number, beforeSeq: number) => {
    const stray = new Set(labelOrder.splice(from, count).map((d) => d.key))
    labelOnly = labelOnly.filter((l) => !(stray.has(l.key) && l.seq < beforeSeq))
  }

  let headerTouched = false
  const applyHeader = (s: string, seq: number) => {
    headerTouched = true
    firstTableSeq = Math.min(firstTableSeq, seq)
    const titled = HEADER_WORD_RE.test(s)
    if (titled) {
      // "Näringsvärde": en ny tabell börjar här.
      dropUnpairedLabels(pairIndex, labelOrder.length - pairIndex, seq)
      labelOrder = []
      pairIndex = 0
      pairsInBlock = 0
    }
    const desc = parseDescriptors(s, headerOpen)
    if (desc.length === 0) return
    if (!headerOpen || titled) {
      columns = []
      // En ny kolumn i en tabell som lästs kolumn för kolumn: para ihop värdena med namnen igen.
      if (columnWise && pairsInBlock > 0) {
        pairIndex = 0
        pairsInBlock = 0
      }
    }
    columns = mergeCols([...columns, ...desc]).map(fillPortion)
    headerOpen = true
  }

  const dataIndexes = (cols: Col[]) => cols.flatMap((c, i) => (c.kind === 'ri' ? [] : [i]))

  const push = (key: ObsKey, col: Col, tok: Tok, value: number, seq: number, raw: string) => {
    if (col.kind === 'ri') return
    // "<3 g" är inte försumbart – ett okänt värde upp till gränsen.
    if (tok.lt && value > negligibleLimit(key) + 1e-9) {
      obs.push({ key, col, value, bound: true, seq, raw })
      return
    }
    obs.push({ key, col, value: tok.lt || tok.trace ? 0 : value, lt: tok.lt, trace: tok.trace, seq, raw })
  }

  const recordEnergy = (tokens: Tok[], hints: Unit[], cols: Col[], seq: number, raw: string) => {
    const idx = dataIndexes(cols)
    const kj = tokens.filter((t) => t.unit === 'kJ')
    const kcal = tokens.filter((t) => t.unit === 'kcal')
    const unknown: Tok[] = []
    const bare = tokens.filter((t) => t.unit === undefined && !t.pct && !t.trace && t.value !== undefined)
    if (kj.length === 0 && kcal.length === 0 && bare.length > 0) {
      const eh = hints.filter(isEnergyUnit)
      if (eh.length > 0) bare.forEach((t, i) => (eh[i % eh.length] === 'kJ' ? kj : kcal).push(t))
      else {
        for (let i = 0; i < bare.length; ) {
          const a = bare[i].value ?? 0
          const b = bare[i + 1]?.value
          if (b !== undefined && ratioOk(a, b)) {
            ;(a > b ? kj : kcal).push(bare[i])
            ;(a > b ? kcal : kj).push(bare[i + 1])
            i += 2
          } else {
            // Mer än 950 kan inte vara kcal per 100 g.
            if (a > 950) kj.push(bare[i])
            else unknown.push(bare[i])
            i++
          }
        }
      }
    }
    const put = (list: Tok[], key: ObsKey) => {
      if (list.length > idx.length) extraValues.add('energy')
      if (list.length > 0 && list.length < idx.length) fewerValues.add('energy')
      list.slice(0, idx.length).forEach((t, i) => {
        let v = t.value ?? 0
        // "1.550 kJ" (danska och norska förpackningar) och "1,550 kJ" (engelska) – tusentalsavgränsare.
        if ((key === 'kJ' || key === 'kcal') && t.raw && ENERGY_THOUSANDS_RE.test(t.raw)) v = Number(t.raw.replace(/[.,]/, ''))
        push(key, cols[idx[i]], t, v, seq, raw)
      })
    }
    put(kj, 'kJ')
    put(kcal, 'kcal')
    if (kj.length === 0 && kcal.length === 0) put(unknown, 'energy?')
  }

  const recordNutrient = (key: LabelNutrient | IgnoredKey, tokens: Tok[], hints: Unit[], cols: Col[], seq: number, raw: string) => {
    const idx = dataIndexes(cols)
    const riCount = cols.length - idx.length
    const vals = tokens.filter((t) => !t.pct && !isEnergyUnit(t.unit))
    const defaultUnit = hints.find((u) => MASS_FACTOR[u] !== undefined)
    let pairs: Array<[Tok, Col]>
    if (!tokens.some((t) => t.pct) && riCount > 0 && vals.length === cols.length) {
      // %RI utan procenttecken: värdena står i samma ordning som kolumnerna.
      pairs = vals.map((t, i) => [t, cols[i]])
    } else {
      pairs = vals.slice(0, idx.length).map((t, i) => [t, cols[idx[i]]])
      if (vals.length > idx.length) extraValues.add(key)
      if (vals.length > 0 && vals.length < idx.length) fewerValues.add(key)
    }
    for (const [t, col] of pairs) {
      if (t.value === undefined) continue
      const unit = t.unit ?? defaultUnit
      // "Vitamin D 400 IE" – internationella enheter räknas inte om (för D-vitamin är 40 IE 1 µg).
      if (unit === 'IU') {
        if (col.kind !== 'ri') iuRows.push({ key, col, raw })
        continue
      }
      const v = convertUnit(key, t.value, unit)
      if (v === undefined) {
        candidates.push({ seq, text: raw, value: false })
        continue
      }
      push(key, col, t, v, seq, raw)
    }
  }

  const recordRow = (key: RowKey, atoms: Atom[], seq: number, raw: string) => {
    headerOpen = false
    firstTableSeq = Math.min(firstTableSeq, seq)
    lastRowKey = key
    const cols = columns.length > 0 ? columns : [ASSUMED_COL]
    for (const c of cols) {
      if (c.kind === 'portion' && !usedPortions.some((p) => colId(p) === colId(c) && p.label === c.label)) usedPortions.push(c)
    }
    const { tokens, hints } = assemble(atoms, key === 'energy')
    if (key === 'energy') {
      recordEnergy(tokens, hints, cols, seq, raw)
      lastEnergyCols = cols
    } else recordNutrient(key, tokens, hints, cols, seq, raw)
  }

  const handleRow = (key: RowKey, tail: string, seq: number, raw: string) => {
    const atoms = atomize(tail.replace(STRIP_RE, ' '))
    if (!atoms.some(isValueAtom)) {
      headerOpen = false
      firstTableSeq = Math.min(firstTableSeq, seq)
      lastRowKey = key
      // "Fiber –": uttryckligen utan värde.
      if (atoms.some((a) => a.t === 'dash')) return
      labelOnly.push({ key, seq })
      const units = atoms.flatMap((a) => (a.t === 'unit' ? [a.u] : []))
      const last = labelOrder[labelOrder.length - 1]
      // Samma namn på flera språk, rad för rad ("Fett" / "Fedt" / "Rasva"): en rad i tabellen –
      // men "Energi kJ" och "Energi kcal" är två.
      const same = last && last.key === key && labelOrder.length > pairIndex && last.units.join() === units.join()
      if (!same) labelOrder.push({ key, seq, units })
      return
    }
    recordRow(key, atoms, seq, raw)
  }

  const handleValueOnly = (atoms: Atom[], text: string, seq: number) => {
    // "370 kcal" på raden efter "Energi 1550 kJ"
    const onlyEnergy = atoms.some((a) => a.t === 'unit' && isEnergyUnit(a.u)) && atoms.every((a) => a.t !== 'unit' || isEnergyUnit(a.u))
    const energyCols = lastEnergyCols
    const firstData = energyCols ? dataIndexes(energyCols)[0] : undefined
    if (onlyEnergy && lastRowKey === 'energy' && energyCols && firstData !== undefined) {
      const cols = energyCols
      const { tokens } = assemble(atoms, true)
      const id = colId(cols[firstData])
      const has = (k: ObsKey) => obs.some((o) => o.key === k && colId(o.col) === id)
      if (!tokens.some((t) => (t.unit === 'kJ' && has('kJ')) || (t.unit === 'kcal' && has('kcal')))) {
        recordEnergy(tokens, [], cols, seq, text)
        return
      }
    }
    if (pairIndex < labelOrder.length) {
      if (labelOrder.length - pairIndex > 1) columnWise = true
      // Enheten måste passa namnet: kJ/kcal bara till energin och gram aldrig till energin. Passar
      // den inte står namn utan värde före tabellen (t.ex. "Protein Pudding") – hoppa över dem.
      const kind = valueKind(atoms)
      let j = pairIndex
      while (j < labelOrder.length && !fitsLabel(labelOrder[j], kind)) j++
      if (j === labelOrder.length) {
        // Inget namn passar – fyll hellre inte i än fyll i fel.
        candidates.push({ seq, text, value: true })
        return
      }
      if (j > pairIndex) dropUnpairedLabels(pairIndex, j - pairIndex, labelOrder[j].seq)
      const { key, units } = labelOrder[pairIndex]
      pairIndex++
      pairsInBlock++
      // Enheten från namnet ("Energi kJ") gäller värdet.
      recordRow(key, [...units.map((u): Atom => ({ t: 'unit', u })), ...atoms], seq, text)
      return
    }
    candidates.push({ seq, text, value: true })
  }

  const handleSegment = (text: string, seq: number) => {
    // "Tillverkad av 45 g bär per 100 g" är ingen kolumnrubrik – och inga värden.
    const seg = stripClaims(text)
    if (seg !== text && !/[\p{L}\d]/u.test(seg)) return
    if (skipIngredients) {
      if (!(HEADER_WORD_RE.test(seg) || ENERGY_START_RE.test(seg) || P100_RE.test(seg))) return
      skipIngredients = false
    }
    if (INGREDIENTS_RE.test(seg)) {
      skipIngredients = true
      return
    }
    if (FOOTER_RE.test(seg) || (REF_WORD_RE.test(seg) && !seg.includes('%'))) {
      afterFooter = true
      return
    }
    const followsFooter = afterFooter
    afterFooter = false

    const hits = findNames(seg)
    if (hits.length === 0) {
      const atoms = atomize(seg)
      const valueOnly = isValueOnly(atoms)
      // "(30 g)" på raden efter "per portion"
      if (valueOnly && headerOpen && /^\(.*\)$/.test(seg)) return applyHeader(seg, seq)
      // "1 portion = 30 g", "Portionsstorlek: 30 g" – redan inläst som portionens vikt.
      if (PORTION_INFO_RE.test(seg) && parseDescriptors(seg, false).every((c) => c.kind === 'portion')) return
      if (HEADER_WORD_RE.test(seg) || parseDescriptors(seg, false).length > 0) return applyHeader(seg, seq)
      if (valueOnly) {
        if (!followsFooter) handleValueOnly(atoms, seg, seq)
        return
      }
      if (NUMBER_WITH_UNIT_RE.test(seg)) candidates.push({ seq, text: seg, value: false })
      return
    }

    const prefix = seg.slice(0, hits[0].start)
    if (HEADER_WORD_RE.test(prefix) || parseDescriptors(prefix, false).length > 0) applyHeader(prefix, seq)

    // Samma näringsämne på flera språk ("Fett/Fedt/Rasva 12 g") är en rad.
    const groups: NameHit[] = []
    for (const h of hits) {
      const prev = groups[groups.length - 1]
      if (prev && prev.key === h.key && !/\d/.test(seg.slice(prev.end, h.start))) prev.end = h.end
      else groups.push({ ...h })
    }
    groups.forEach((g, i) => handleRow(g.key, seg.slice(g.end, groups[i + 1]?.start ?? seg.length), seq, seg))
  }

  segments.forEach((seg, seq) => {
    headerTouched = false
    handleSegment(seg, seq)
    // Rubriker som står på flera rader i följd hör ihop – annars börjar nästa rubrik om.
    if (!headerTouched) headerOpen = false
  })

  return finish()

  // -------------------------------------------------------------------------

  function finish(): NutritionLabelResult {
    const warnings: string[] = []
    const notes: string[] = []
    const unparsed: string[] = []

    // Kolumnen: per 100 g/ml före allt annat, sedan en portion med känd vikt.
    const seen: Col[] = []
    for (const o of obs) if (!seen.some((c) => colId(c) === colId(o.col))) seen.push(o.col)
    const chosen =
      seen.find((c) => c.kind === 'per100' && !c.assumed) ??
      seen.find((c) => c.kind === 'per100') ??
      seen.find((c) => c.kind === 'portion' && c.amount !== undefined) ??
      seen.find((c) => c.kind === 'portion') ??
      null

    // Rimliga gränser för kolumnen: högst 100 g per 100 g, högst 950 kcal per 100 g. Omöjliga värden
    // (t.ex. "Protein Pudding 200 g" i produktnamnet) sorteras bort innan det första värdet väljs.
    const basisAmount = chosen?.kind === 'portion' ? (chosen.amount ?? 2000) : 100
    const impossible = (o: Obs) =>
      o.key === 'kJ'
        ? o.value > 40 * basisAmount
        : o.key === 'kcal' || o.key === 'energy?'
          ? o.value > 9.5 * basisAmount
          : targetUnit(o.key) === 'g' && o.value > basisAmount + 0.5

    const values = new Map<ObsKey, Obs>()
    const conflicts: ObsKey[] = []
    const bounds: Obs[] = []
    if (chosen) {
      for (const o of obs) {
        if (colId(o.col) !== colId(chosen)) continue
        if (o.bound) {
          bounds.push(o)
          continue
        }
        if (impossible(o)) {
          unparsed.push(o.raw)
          continue
        }
        const prev = values.get(o.key)
        if (!prev) values.set(o.key, o)
        else if (Math.abs(prev.value - o.value) > Math.max(0.05, prev.value * 0.02) && !conflicts.includes(o.key)) conflicts.push(o.key)
      }
    }

    const get = (k: ObsKey) => values.get(k)?.value
    const expected = expectedKcal(get)
    let kJ = get('kJ')
    let kcal = get('kcal')
    const unknownEnergy = get('energy?')
    if (kJ === undefined && kcal === undefined && unknownEnergy !== undefined) {
      // Energi utan enhet: jämför med makronäringsämnena.
      const asKcal = expected === undefined || Math.abs(unknownEnergy - expected) <= Math.abs(unknownEnergy / KJ_PER_KCAL - expected)
      if (asKcal) kcal = unknownEnergy
      else kJ = unknownEnergy
      warnings.push(`Energin stod utan enhet – Lagom har tolkat ${formatNumber(unknownEnergy)} som ${asKcal ? 'kcal' : 'kJ'}. Jämför med förpackningen.`)
    }

    const nutrients: Nutrients = {}
    for (const key of LABEL_NUTRIENTS) {
      const v = get(key)
      if (v !== undefined) nutrients[key] = v
    }
    const kcalValue = kcal ?? (kJ !== undefined ? round(kJ / KJ_PER_KCAL, 1) : undefined)
    if (kcalValue !== undefined) nutrients.kcal = kcalValue
    const stated: LabelValues = { nutrients, kJ, kcal }
    const found = Object.keys(nutrients).length

    // Portionen i kolumnrubriken (så att den kan sparas som mått) – bara från kolumner som rader
    // lästes in med, inte från "45 g bär per 100 g" eller en rubrik utan värden.
    const portionCol = [chosen, ...usedPortions].find((c): c is Extract<Col, { kind: 'portion' }> => c?.kind === 'portion' && c.amount !== undefined && c.amount > 0)
    const portion = portionCol?.amount !== undefined ? { grams: portionCol.amount, label: portionCol.label } : undefined

    let column: LabelColumn | null = null
    let per100: LabelValues | undefined
    let unit: LabelUnit = 'g'
    if (chosen && chosen.kind !== 'ri' && found > 0) {
      column =
        chosen.kind === 'per100'
          ? { kind: 'per100', unit: chosen.unit, ...(chosen.assumed ? { assumed: true } : {}), ...(chosen.qualifier ? { qualifier: chosen.qualifier } : {}) }
          : { ...chosen }
      unit = chosen.unit
      if (chosen.kind === 'per100') per100 = stated
      else if (chosen.amount !== undefined && chosen.amount > 0) {
        const f = 100 / chosen.amount
        const scaled: Nutrients = {}
        for (const [k, v] of Object.entries(nutrients)) scaled[k as NutrientKey] = round(v * f, decimalsFor(k as ObsKey))
        per100 = {
          nutrients: scaled,
          kJ: kJ !== undefined ? round(kJ * f, 0) : undefined,
          kcal: kcal !== undefined ? round(kcal * f, 1) : undefined,
        }
      } else {
        warnings.push('Värdena gäller per portion, men portionens vikt står inte i texten. Fyll i hur mycket en portion väger, så räknar Lagom om till per 100\u00a0g.')
      }
    }

    if (found > 0) {
      if (column?.kind === 'per100' && column.assumed) {
        warnings.push('Texten säger inte om värdena gäller per 100\u00a0g – Lagom har tolkat dem så. Jämför med förpackningen.')
      }
      if (unit === 'ml') {
        notes.push(
          column?.kind === 'portion' ? 'Portionen anges i ml – livsmedlet markeras som flytande.' : 'Värdena gäller per 100\u00a0ml – livsmedlet markeras som flytande.',
        )
      }
      // "per 100 g pulver / per 100 ml tillagad", "per 100 g okokt / per 100 g kokt": ofta 3–6 gånger olika energi.
      const per100Cols = seen.filter((c): c is Extract<Col, { kind: 'per100' }> => c.kind === 'per100' && !c.assumed)
      if (per100Cols.length > 1 && chosen?.kind === 'per100') {
        warnings.push(
          `Förpackningen har flera kolumner per 100 (${listNames(per100Cols.map(describeCol))}) – Lagom använde den första, ${describeCol(chosen)}. Kontrollera att det är den du vill spara.`,
        )
      }
      const hasValue = (k: RowKey) => values.has(k as ObsKey) || (k === 'energy' && (kJ !== undefined || kcal !== undefined))
      const extra = [...extraValues].filter(hasValue)
      const extraNames = extra.length <= 3 ? capitalize(listNames(extra.map(nameOf))) : undefined
      if (extra.length > 0 && column?.kind === 'per100' && column.assumed) {
        warnings.push(
          `${extraNames ?? 'Några rader'} hade flera värden men texten saknade kolumnrubriker – Lagom använde det första värdet (brukar vara per 100\u00a0g).`,
        )
      } else if (extra.length > 0) {
        warnings.push(`${extraNames ?? 'Flera rader'} hade fler värden än kolumnrubrikerna – kontrollera att rätt värde användes.`)
      }
      const fewer = [...fewerValues].filter(hasValue)
      if (fewer.length > 0) warnings.push(`${capitalize(listNames(fewer.map(nameOf)))} hade färre värden än kolumnerna – kontrollera ${fewer.length === 1 ? 'värdet' : 'värdena'}.`)
      if (columnWise) warnings.push('Tabellen lästes kolumn för kolumn – kontrollera att varje värde hamnat på rätt rad.')
      if (conflicts.length > 0) {
        warnings.push(`Förpackningen anger olika värden för ${listNames(conflicts.map(nameOf))} – Lagom använde det första.`)
      }

      // Rimlighetskontroller
      if (kJ !== undefined && kcal !== undefined && Math.abs(kJ / KJ_PER_KCAL - kcal) > Math.max(2, kcal * 0.05)) {
        warnings.push(
          `Energin i kJ och kcal stämmer inte med varandra (${formatNumber(kJ)}\u00a0kJ är ungefär ${formatNumber(kJ / KJ_PER_KCAL)}\u00a0kcal) – Lagom använde kcal-värdet.`,
        )
      }
      if (kcalValue !== undefined && expected !== undefined) {
        const tolerance = Math.max(10 * (basisAmount / 100), 0.15 * Math.max(kcalValue, expected))
        if (Math.abs(kcalValue - expected) > tolerance) {
          warnings.push(
            `Energin stämmer inte med fett, kolhydrater och protein – de ger ungefär ${formatNumber(expected)}\u00a0kcal. Kontrollera att siffrorna lästes av rätt.`,
          )
        }
      }
      const fat = get('fat')
      const carbs = get('carbs')
      const sat = get('satFat')
      const sugars = get('sugars')
      if (sat !== undefined && fat !== undefined && sat > fat + 0.05) warnings.push('Mättat fett är mer än fettet totalt – kontrollera värdena.')
      const fatParts = (sat ?? 0) + (get('monoFat') ?? 0) + (get('polyFat') ?? 0)
      if (fat !== undefined && fatParts > fat * 1.05 + 0.2 && !(sat !== undefined && sat > fat + 0.05)) {
        warnings.push('Fettsyrorna blir tillsammans mer än fettet totalt – kontrollera värdena.')
      }
      if (sugars !== undefined && carbs !== undefined && sugars > carbs + 0.05) warnings.push('Sockerarterna är fler än kolhydraterna – kontrollera värdena.')
      const mass = (get('protein') ?? 0) + (carbs ?? 0) + (fat ?? 0) + (get('fiber') ?? 0) + (get('salt') ?? 0)
      if (mass > basisAmount * 1.01 + 0.5) {
        warnings.push(`Näringsämnena blir tillsammans ${formatNumber(mass, 1)}\u00a0g – mer än hela mängden. Kontrollera värdena.`)
      }

      // Upplysningar
      if (kJ !== undefined && kcal === undefined) {
        notes.push(`Energin stod bara i kJ – ${formatNumber(kJ)}\u00a0kJ är ungefär ${formatNumber(kJ / KJ_PER_KCAL)}\u00a0kcal (kJ\u00a0÷\u00a04,184).`)
      }
      const approx = [...values.values()].filter((o) => o.lt || o.trace)
      if (approx.length > 0) {
        const names = approx.map((o) => nameOf(o.key))
        notes.push(
          `${capitalize(listNames(names))} stod som ”<…” eller ”spår” och fylls i som 0 – det betyder en försumbar mängd enligt EU:s regler.`,
        )
      }
      const ignored = (Object.keys(IGNORED_NAMES) as IgnoredKey[]).filter((k) => values.has(k))
      if (ignored.length > 0) {
        const names = ignored.map((k) => IGNORED_NAMES[k])
        notes.push(`${capitalize(listNames(names))} har inga egna fält i Lagom och fylls inte i.`)
      }
    }

    // "<3 g": en övre gräns, inget värde.
    const energyFound = kJ !== undefined || kcal !== undefined
    const openBounds = bounds.filter((o) =>
      o.key === 'kJ' || o.key === 'kcal' || o.key === 'energy?' ? !energyFound : !values.has(o.key) && !(o.key in IGNORED_NAMES),
    )
    if (openBounds.length > 0) {
      const items: string[] = []
      for (const o of openBounds) {
        unparsed.push(o.raw)
        const unitText = o.key === 'kJ' || o.key === 'kcal' ? o.key : o.key === 'energy?' ? '' : targetUnit(o.key)
        const item = `${nameOf(o.key)} (<${formatNumber(o.value, 3)}${unitText ? `\u00a0${unitText}` : ''})`
        if (!items.some((i) => i.startsWith(`${nameOf(o.key)} `))) items.push(item)
      }
      warnings.push(
        `${capitalize(listNames(items))} stod bara som en övre gräns – det kan vara allt upp till gränsen, så Lagom fyller inte i ${items.length === 1 ? 'det' : 'dem'}. Fyll i själv om du vet mer.`,
      )
    }

    // "Vitamin D 400 IE"
    const iu = chosen ? iuRows.filter((r) => colId(r.col) === colId(chosen) && !values.has(r.key as ObsKey)) : []
    if (iu.length > 0) {
      for (const r of iu) unparsed.push(r.raw)
      const keys = [...new Set(iu.map((r) => r.key))]
      warnings.push(
        `${capitalize(listNames(keys.map(nameOf)))} stod i internationella enheter (IE) – Lagom räknar inte om ${keys.length === 1 ? 'det' : 'dem'}. Fyll i själv i ${keys.map((k) => (k === 'energy' || k in IGNORED_NAMES ? 'g' : NUTRIENTS[k as LabelNutrient].unit)).includes('mg') ? 'mg eller µg' : 'µg'}${keys.includes('vitD') ? ' (för D-vitamin är 40\u00a0IE 1\u00a0µg)' : ''}.`,
      )
    }

    // Det som inte gick att tolka
    const lastObsSeq = obs.reduce((m, o) => Math.max(m, o.seq), Number.NEGATIVE_INFINITY)
    for (const { key, seq } of labelOnly) {
      const has = key === 'energy' ? kcalValue !== undefined : values.has(key)
      // Bara rader i själva tabellen – inte "1 tsk salt" i en text efteråt.
      if (!has && seq < lastObsSeq && !(key in IGNORED_NAMES)) unparsed.push(`${capitalize(nameOf(key))} – inget värde hittades`)
    }
    for (const c of candidates) {
      const inside = c.seq > firstTableSeq && c.seq < lastObsSeq
      if (inside || (c.value && columnWise) || (c.value && c.seq >= firstTableSeq && found === 0)) unparsed.push(c.text)
    }

    return {
      column,
      unit,
      stated,
      per100,
      portion,
      unparsed: [...new Set(unparsed)].slice(0, 12),
      warnings: [...new Set(warnings)],
      notes: [...new Set(notes)],
    }
  }
}

/** Energi från makronäringsämnena (kcal): protein och kolhydrater 4, fett 9, fiber 2, polyoler 2,4. */
function expectedKcal(get: (k: ObsKey) => number | undefined): number | undefined {
  const protein = get('protein')
  const carbs = get('carbs')
  const fat = get('fat')
  if (protein === undefined || carbs === undefined || fat === undefined) return undefined
  const polyols = Math.min(get('polyols') ?? 0, carbs)
  return 4 * protein + 4 * (carbs - polyols) + 2.4 * polyols + 9 * fat + 2 * (get('fiber') ?? 0)
}

/** Antal näringsvärden (inklusive energi) i resultatet. */
export function labelValueCount(result: NutritionLabelResult): number {
  return Object.keys(result.stated.nutrients).length
}
