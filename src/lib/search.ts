/**
 * Lagoms livsmedelssök – snabb, svensk och förlåtande.
 *
 * Normalisering
 * - Gemener, blanksteg komprimeras, skiljetecken och "%" tas bort. Decimaltal behålls med
 *   decimalkomma: "Mjölk 1,5%" och "mjölk 1.5" blir båda "mjölk 1,5".
 * - Å, ä och ö är egna bokstäver. Varje ord har dessutom en ASCII-vikt variant så att
 *   "kottbullar" hittar "Köttbullar" och "mjolk" hittar "Mjölk". Innehåller sökordet å/ä/ö
 *   jämförs bokstäverna exakt – "kål" ger alltså inte "kalkon".
 * - Andra diakritiska tecken tas bort ("filé" = "file", "müsli" = "musli"); æ/ø räknas som ä/ö.
 *
 * Matchning per sökord
 * - exakt ord, början av ord ("kyck" → "Kyckling"),
 * - svenska sammansättningar: huvudordet sist ("ost" → "Prästost", "filé" → "Kycklingbröstfilé")
 *   och delar inuti ("bröst" → "Kycklingbröstfilé") – men inte ord som bara råkar sluta likadant
 *   ("Ankbröst" och "Råkost" är ingen ost, "Kapris" och "Polkagris" inget ris, se `FALSE_HEADS`),
 * - lätt stamning av böjningsformer ("köttbulle" ↔ "köttbullar", "tomater" ↔ "tomat"),
 * - synonymer (`food.synonyms`) och varumärke,
 * - stavfel med Damerau–Levenshtein: högst 1 fel för ord med minst 4 tecken, 2 från 8 tecken.
 *   Stavfelstolerans används bara när sökordet inte redan ger tydliga träffar (mindre brus).
 * - valfria ord (`SearchOptions.optionalWords`, t.ex. "rå" i huvudsökningen) behöver inte matcha:
 *   "nötfärs rå" söker som "nötfärs".
 *
 * Rankning (nivåer ligger ca 200 poäng isär, se `SEARCH_TIERS`)
 *   exakt namn > namnet börjar med sökningen > alla ord finns i namnet > synonym/varumärke > stavfel.
 * Inom en nivå vinner bättre ordträffar, korta "basala" namn ("Mjölk 3 %" före "Mjölkchoklad"),
 * träff på namnets första ord, svenska källor (Lagom/Livsmedelsverket) före Open Food Facts samt
 * en valfri boost (användning, favoriter, måltid) som läggs till poängen.
 *
 * Prestanda: ett inverterat index över unika ord gör att en sökning bland ~3 000 livsmedel tar
 * någon millisekund. Indexet är oföränderligt – bygg ett nytt när listan ändras.
 */
import type { Food, FoodCategory, FoodSource } from '../types'

// ---------------------------------------------------------------------------
// Publika typer
// ---------------------------------------------------------------------------

/**
 * Hur ett livsmedel matchade: hela namnet ('exact'), namnets början ('prefix'), alla ord i namnet
 * ('token', även huvudord i sammansättningar), via synonym/varumärke ('synonym') eller med
 * stavfel/delvis ('fuzzy').
 */
export type MatchKind = 'exact' | 'prefix' | 'token' | 'synonym' | 'fuzzy'

export interface SearchResult {
  food: Food
  /** Relevanspoäng, högre är bättre. */
  score: number
  /** Hur livsmedlet matchade (för t.ex. förklarande UI eller analys). */
  matched: MatchKind
}

export interface SearchOptions {
  /** Max antal träffar (standard 50). */
  limit?: number
  /** Begränsa till dessa kategorier. Med tom sökning listas kategorins livsmedel (bläddring). */
  categories?: readonly FoodCategory[]
  /**
   * Extra poäng per livsmedel, t.ex. för användning, favoriter och måltid. Nivåerna ligger ca 200
   * poäng isär, så en boost på 0–250 flyttar ett livsmedel inom och ibland mellan närliggande nivåer.
   */
  boost?: (food: Food) => number
  /** Ta bara med livsmedel där funktionen ger true – filtreras innan listan kapas vid `limit`. */
  filter?: (food: Food) => boolean
  /**
   * Ord i sökningen som inte behöver matcha (normaliserade, med och utan å/ä/ö), t.ex. "rå" när
   * alla rader anges tillagade. Består sökningen bara av sådana ord söks de ändå.
   */
  optionalWords?: ReadonlySet<string>
}

/** Oföränderligt sökindex. Skapas med `createSearchIndex`. */
export interface SearchIndex {
  readonly foods: readonly Food[]
  readonly size: number
}

/** Baspoäng per träffnivå. */
export const SEARCH_TIERS = {
  exact: 1000,
  /** Namnet börjar med sökningen och följs av ordgräns ("Mjölk 3 %") eller en böjning ("Tomater"). */
  prefix: 800,
  /** Namnets första ord är en sammansättning med sökordet som huvudord ("Prästost" för "ost"). */
  head: 720,
  /** Namnet börjar med sökningen som förled i en sammansättning ("Mjölkchoklad", "Kycklingfärs"). */
  prefixInWord: 700,
  /** Namnet börjar med sökningen men resten är för kort för att vara ett eget ord ("Ostron" för "ost"). */
  prefixShort: 650,
  /** Hela sökningen är exakt en av livsmedlets synonymer (och finns inte i namnet). */
  synonymExact: 650,
  token: 600,
  synonym: 400,
  fuzzy: 200,
  /** Delvis träff (minst hälften av orden) – visas bara när det finns få fullständiga träffar. */
  partial: 0,
} as const

/**
 * Extra poäng när hela sökningen är exakt en av livsmedlets synonymer men namnet också matchar
 * (t.ex. "kyckling" → Kycklingbröst, "fil" → Filmjölk). Avgör ordningen inom en nivå, så att
 * vardagsbegreppet kommer före sammansättningar och rätter ("Grillkyckling", "Kycklingwrap").
 */
const SYNONYM_EXACT_BONUS = 40

// ---------------------------------------------------------------------------
// Normalisering
// ---------------------------------------------------------------------------

/** Behåll a/o + ring/trema (å, ä, ö), ta bort alla andra kombinerande diakritiska tecken. */
const COMBINING = /([ao])([̈̊])|[̀-ͯ]/g
const DECIMAL = /(\d)[.,](?=\d)/g
const APOSTROPHES = /['’´`]/g
const NON_WORD = /[^\p{L}\p{N}\uE000]+/gu
const SPECIAL_RE = /[æøßœ]/g
const SPECIAL: Record<string, string> = { æ: 'ä', ø: 'ö', ß: 'ss', œ: 'oe' }
const FOLD_RE = /[åäö]/g
const FOLD: Record<string, string> = { å: 'a', ä: 'a', ö: 'o' }
const HAS_SV = /[åäö]/

/**
 * Normalisera svensk text för sökning: gemener, inga skiljetecken eller "%", ett blanksteg mellan
 * orden och decimalkomma i tal. Å/ä/ö behålls, andra accenter tas bort.
 *
 * @example normalizeSv('  Mjölk, mellan 1.5% ') // 'mjölk mellan 1,5'
 */
export function normalizeSv(input: string): string {
  if (!input) return ''
  let s = input.normalize('NFKC').toLowerCase()
  s = s.replace(SPECIAL_RE, (c) => SPECIAL[c] ?? c)
  s = s
    .normalize('NFD')
    .replace(COMBINING, (_m: string, base?: string, mark?: string) => (base ? base + mark : ''))
    .normalize('NFC')
  s = s.replace(DECIMAL, '$1\uE000').replace(APOSTROPHES, '').replace(NON_WORD, ' ').replace(/\uE000/g, ',')
  return s.trim()
}

function foldNormalized(s: string): string {
  return s.replace(FOLD_RE, (c) => FOLD[c] ?? c)
}

/**
 * ASCII-vikt variant av `normalizeSv`: å/ä → a, ö → o.
 *
 * @example foldSv('Köttbullar') // 'kottbullar'
 */
export function foldSv(input: string): string {
  return foldNormalized(normalizeSv(input))
}

// ---------------------------------------------------------------------------
// Lätt svensk stamning
// ---------------------------------------------------------------------------

/** Oregelbundna pluralformer (med och utan å/ä/ö). */
const IRREGULAR: Record<string, string> = {}
for (const [plural, singular] of [
  ['morötter', 'morot'],
  ['nötter', 'nöt'],
  ['rötter', 'rot'],
  ['fötter', 'fot'],
  ['getter', 'get'],
] as const) {
  IRREGULAR[plural] = singular
  IRREGULAR[foldNormalized(plural)] = foldNormalized(singular)
}

/** Böjningsändelser, längst först. [ändelse, minsta längd på det som blir kvar]. */
const STEM_SUFFIXES: ReadonlyArray<readonly [string, number]> = [
  ['arnas', 3],
  ['ernas', 3],
  ['ornas', 3],
  ['arna', 3],
  ['erna', 3],
  ['orna', 3],
  ['ena', 3],
  ['ar', 3],
  ['er', 3],
  ['or', 3],
  ['en', 3],
  ['et', 3],
  ['na', 3],
  ['e', 3],
  ['a', 3],
]

/**
 * Mycket lätt stamning av ett normaliserat ord så att vanliga böjningsformer möts:
 * "köttbulle"/"köttbullar" → "köttbull", "tomater"/"tomat" → "tomat", "räka"/"räkor" → "räk".
 */
export function stemSv(token: string): string {
  const irregular = IRREGULAR[token]
  if (irregular) return irregular
  if (token.length < 4 || /\d/.test(token)) return token
  for (const [suffix, minRest] of STEM_SUFFIXES) {
    if (token.length - suffix.length >= minRest && token.endsWith(suffix)) return token.slice(0, -suffix.length)
  }
  return token
}

// ---------------------------------------------------------------------------
// Hjälpfunktioner för stavfel
// ---------------------------------------------------------------------------

/** Bitmask över vilka bokstäver ett ord innehåller (a–z, å, ä, ö, siffror, övrigt). */
function letterMask(s: string): number {
  let m = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 97 && c <= 122) m |= 1 << (c - 97)
    else if (c === 229) m |= 1 << 26 // å
    else if (c === 228) m |= 1 << 27 // ä
    else if (c === 246) m |= 1 << 28 // ö
    else if (c >= 48 && c <= 57) m |= 1 << 29
    else m |= 1 << 30
  }
  return m
}

function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

const MAX_FUZZY_LEN = 48
const OSA_ROWS = [
  new Int32Array(MAX_FUZZY_LEN + 1),
  new Int32Array(MAX_FUZZY_LEN + 1),
  new Int32Array(MAX_FUZZY_LEN + 1),
] as const
/** Minsta avstånd mellan `a` och någon början av `b` från senaste `osaDistance`-anropet. */
let lastPrefixDistance = 0

/**
 * Damerau–Levenshtein (optimal string alignment) med tidigt avbrott när avståndet överstiger `max`.
 * Sätter även `lastPrefixDistance` = minsta avstånd mellan `a` och någon början av `b`
 * (för stavfel medan man skriver: "kycklng" ≈ "kycklingbröstfile").
 */
function osaDistance(a: string, b: string, max: number): number {
  const m = a.length
  const n = b.length
  let [prev2, prev, cur] = OSA_ROWS as readonly Int32Array[]
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    let rowMin = i
    const ai = a.charCodeAt(i - 1)
    const aPrev = i > 1 ? a.charCodeAt(i - 2) : -1
    for (let j = 1; j <= n; j++) {
      const bj = b.charCodeAt(j - 1)
      let v = prev[j - 1] + (ai === bj ? 0 : 1)
      const del = prev[j] + 1
      if (del < v) v = del
      const ins = cur[j - 1] + 1
      if (ins < v) v = ins
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && aPrev === bj) {
        const tr = prev2[j - 2] + 1
        if (tr < v) v = tr
      }
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) {
      lastPrefixDistance = max + 1
      return max + 1
    }
    const t = prev2
    prev2 = prev
    prev = cur
    cur = t
  }
  let prefixMin = prev[n]
  for (let j = 0; j < n; j++) if (prev[j] < prefixMin) prefixMin = prev[j]
  lastPrefixDistance = prefixMin
  return prev[n]
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

const FIELD_NAME = 0
const FIELD_COMPACT = 1
const FIELD_SYNONYM = 2
const FIELD_BRAND = 3
/** Vikt per fält: namn, namn utan mellanslag, synonym, varumärke. */
const FIELD_WEIGHT = [1, 0.9, 0.8, 0.75] as const

/** Max antal (icke-stopp)ord i en sökning som räknas. */
const MAX_Q = 8

const SOURCE_BONUS: Record<FoodSource, number> = {
  lagom: 8,
  custom: 7,
  recipe: 7,
  livsmedelsverket: 6,
  openfoodfacts: 0,
}

/** Småord som inte behöver matcha ("kaffe med mjölk"). */
const STOPWORDS = new Set(['med', 'och', 'i', 'på', 'av', 'till', 'en', 'ett', 'a', 'la', 'the', 'and', 'with', 'of'])

interface VocabEntry {
  /** Normaliserat ord (med å/ä/ö). */
  t: string
  /** ASCII-vikt ord. */
  f: string
  st: string
  sf: string
  maskT: number
  maskF: number
  hasSv: boolean
  /** (dokument << 3) | (fält << 1) | (första ordet i namnet ? 1 : 0) */
  postings: Int32Array
}

interface Doc {
  food: Food
  name: string
  nameF: string
  syn: string[]
  synF: string[]
  lenCompact: number
  sourceBonus: number
}

interface Hit {
  e: VocabEntry
  score: number
  fuzzy: boolean
  /** Träffens typ enligt `lastDirectKind` (0 för stavfel). */
  kind: number
}

/** Flaggor per dokument för namnets första ord (första sökordet). */
const FIRST_ANY = 1
const FIRST_HEAD = 2
const FIRST_WORD = 4

interface IndexData {
  docs: Doc[]
  vocab: VocabEntry[]
  cache: Map<string, Hit[]>
  nameBest: Float32Array | null
  anyBest: Float32Array | null
  fuzzBest: Float32Array | null
  firstHit: Uint8Array | null
  mark: Uint32Array | null
  epoch: number
}

const INTERNAL = new WeakMap<SearchIndex, IndexData>()
const TOKEN_CACHE_MAX = 256

/**
 * Bygg ett sökindex. Tar ca 10–30 ms för några tusen livsmedel – memoisera resultatet
 * (t.ex. per lista) i stället för att bygga om vid varje sökning.
 */
export function createSearchIndex(foods: readonly Food[]): SearchIndex {
  const docs: Doc[] = []
  const builders = new Map<string, number[]>()

  const add = (token: string, doc: number, field: number, first: boolean, seen: Set<string>) => {
    if (!token) return
    const key = `${field}|${token}`
    if (seen.has(key)) return
    seen.add(key)
    let list = builders.get(token)
    if (!list) {
      list = []
      builders.set(token, list)
    }
    list.push((doc << 3) | (field << 1) | (first ? 1 : 0))
  }

  for (let i = 0; i < foods.length; i++) {
    const food = foods[i]
    const seen = new Set<string>()
    const name = normalizeSv(food.name)
    const tokens = name ? name.split(' ') : []
    tokens.forEach((t, pos) => add(t, i, FIELD_NAME, pos === 0, seen))
    // "Coca-Cola" → även "cocacola", "Kyckling filé" → även "kycklingfile".
    if (tokens.length >= 2 && tokens.length <= 5) add(tokens.join(''), i, FIELD_COMPACT, false, seen)

    const syn: string[] = []
    for (const s of food.synonyms ?? []) {
      const ns = normalizeSv(s)
      if (!ns) continue
      syn.push(ns)
      for (const t of ns.split(' ')) add(t, i, FIELD_SYNONYM, false, seen)
    }
    if (food.brand) {
      for (const t of normalizeSv(food.brand).split(' ')) add(t, i, FIELD_BRAND, false, seen)
    }
    docs.push({
      food,
      name,
      nameF: foldNormalized(name),
      syn,
      synF: syn.map(foldNormalized),
      lenCompact: Math.max(1, name.replace(/ /g, '').length),
      sourceBonus: SOURCE_BONUS[food.source] ?? 0,
    })
  }

  const vocab: VocabEntry[] = []
  for (const [t, list] of builders) {
    const f = foldNormalized(t)
    vocab.push({
      t,
      f,
      st: stemSv(t),
      sf: stemSv(f),
      maskT: letterMask(t),
      maskF: letterMask(f),
      hasSv: t !== f,
      postings: Int32Array.from(list),
    })
  }

  const index: SearchIndex = Object.freeze({ foods, size: foods.length })
  INTERNAL.set(index, {
    docs,
    vocab,
    cache: new Map(),
    nameBest: null,
    anyBest: null,
    fuzzBest: null,
    firstHit: null,
    mark: null,
    epoch: 0,
  })
  return index
}

// ---------------------------------------------------------------------------
// Sökning
// ---------------------------------------------------------------------------

interface QueryToken {
  q: string
  sv: boolean
  stem: string
  mask: number
  /** Tillåtet antal stavfel. */
  k: number
}

interface ParsedQuery {
  norm: string
  fold: string
  sv: boolean
  required: QueryToken[]
  qLen: number
}

function parseQuery(query: string, optionalWords?: ReadonlySet<string>): ParsedQuery | null {
  let norm = normalizeSv(query)
  if (!norm) return null
  if (optionalWords && optionalWords.size > 0) {
    // Valfria ord tas bort helt ("lax rå" söker som "lax", även exakt namn och början av namnet).
    const kept = norm.split(' ').filter((t) => !optionalWords.has(t) && !optionalWords.has(foldNormalized(t)))
    if (kept.length > 0) norm = kept.join(' ')
  }
  const all = [...new Set(norm.split(' '))]
  let required = all.filter((t) => !STOPWORDS.has(t))
  if (required.length === 0) required = all
  required = required.slice(0, MAX_Q)
  return {
    norm,
    fold: foldNormalized(norm),
    sv: HAS_SV.test(norm),
    required: required.map((q) => ({
      q,
      sv: HAS_SV.test(q),
      stem: stemSv(q),
      mask: letterMask(q),
      k: q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0,
    })),
    qLen: required.reduce((s, t) => s + t.length, 0),
  }
}

/**
 * Ord som slutar som ett kort livsmedelsord utan att vara en sammansättning med det: "bröst" och
 * "kost" slutar på "ost", "pålägg", "fläsklägg" och "skägg" på "ägg", "gris", "kapris" och
 * "sparris" på "ris", "svin" på "vin". Ett sökord räknas inte som huvudord i ett ord som slutar så
 * – "Ankbröst" och "Råkost" är ingen ost, "Kycklingpålägg" inget ägg och "Polkagris" inget ris
 * (men "Vaktelägg" är ett ägg och "Fullkornsris" ett ris).
 */
const FALSE_HEADS = ['bröst', 'kost', 'frost', 'pålägg', 'fläsklägg', 'lammlägg', 'kalvlägg', 'skägg', 'gris', 'kapris', 'sparris', 'svin']
const FALSE_HEADS_FOLDED = FALSE_HEADS.map(foldNormalized)

function isFalseHead(word: string, q: string, sv: boolean): boolean {
  for (const head of sv ? FALSE_HEADS : FALSE_HEADS_FOLDED) {
    if (head.length > q.length && head.endsWith(q) && word.endsWith(head)) return true
  }
  return false
}

/** Typ av senaste träff i `directScore`: 0 ingen, 1 exakt/stam, 2 början, 3 huvudord, 4 inuti. */
let lastDirectKind = 0

/** Poäng (0–1) för en icke-stavfelsträff mellan sökord och indexord, 0 om ingen träff. */
function directScore(qt: QueryToken, e: VocabEntry): number {
  const t = qt.sv ? e.t : e.f
  const q = qt.q
  // Sökord utan å/ä/ö som bara matchar via ASCII-vikning får ett litet avdrag.
  const fp = !qt.sv && e.hasSv ? 0.97 : 1
  lastDirectKind = 1
  if (t === q) return fp
  const ql = q.length
  const tl = t.length
  // Böjningsform av samma ord: "tomater" ↔ "tomat", "köttbulle" ↔ "köttbullar".
  if (ql >= 4 && tl >= 4) {
    const st = qt.sv ? e.st : e.sf
    if (st === qt.stem && st.length >= 3) return 0.92 * fp
  }
  lastDirectKind = 2
  if (tl > ql && t.startsWith(q)) return (0.74 + 0.2 * (ql / tl)) * fp
  if (ql >= 3) {
    lastDirectKind = 3
    // Huvudordet i en sammansättning: "ost" i "prästost", "filé" i "kycklingbröstfilé".
    const falseHead = isFalseHead(t, q, qt.sv)
    if (!falseHead && t.endsWith(q) && tl - ql >= (ql === 3 ? 3 : 2)) return 0.72 * fp
    if (ql >= 4) {
      const st = qt.sv ? e.st : e.sf
      const qs = qt.stem
      if (!falseHead && qs.length >= 3 && st.length - qs.length >= 2 && st.endsWith(qs)) return 0.66 * fp
      lastDirectKind = 4
      // Del inuti en sammansättning: "bröst" i "kycklingbröstfilé".
      if (t.indexOf(q, 2) >= 2) return 0.55 * fp
    }
  }
  lastDirectKind = 0
  return 0
}

/** Poäng (0–1) för en stavfelsträff, 0 om ingen. */
function fuzzyScore(qt: QueryToken, e: VocabEntry): number {
  const t = qt.sv ? e.t : e.f
  const q = qt.q
  const k = qt.k
  const ql = q.length
  const tl = t.length
  if (tl > MAX_FUZZY_LEN || ql > MAX_FUZZY_LEN) return 0
  // Stavfel i första bokstaven är ovanliga – kräv samma början (minskar brus som "semla" → "hemlagad").
  if (q.charCodeAt(0) !== t.charCodeAt(0)) return 0
  const fullPossible = Math.abs(tl - ql) <= k
  const prefixPossible = tl > ql
  if (!fullPossible && !prefixPossible) return 0
  // Varje bokstav i sökordet som helt saknas i ordet kräver minst en redigering.
  if (popcount(qt.mask & ~(qt.sv ? e.maskT : e.maskF)) > k) return 0
  const fp = !qt.sv && e.hasSv ? 0.97 : 1
  const d = osaDistance(q, t, k)
  if (fullPossible && d <= k) return (0.6 - 0.12 * d) * fp
  if (prefixPossible && lastPrefixDistance <= k) return (0.42 - 0.1 * lastPrefixDistance) * fp
  return 0
}

function tokenHits(data: IndexData, qt: QueryToken): Hit[] {
  const key = `${qt.sv ? 1 : 0}|${qt.q}`
  const cached = data.cache.get(key)
  if (cached) return cached
  const hits: Hit[] = []
  let strong = false
  const vocab = data.vocab
  const direct = new Uint8Array(vocab.length)
  for (let i = 0; i < vocab.length; i++) {
    const s = directScore(qt, vocab[i])
    if (s > 0) {
      hits.push({ e: vocab[i], score: s, fuzzy: false, kind: lastDirectKind })
      direct[i] = 1
      if (s >= 0.9) strong = true
    }
  }
  // Stavfelstolerans bara när sökordet inte redan ger tydliga träffar.
  if (qt.k > 0 && !strong && hits.length < 5) {
    for (let i = 0; i < vocab.length; i++) {
      if (direct[i]) continue
      const s = fuzzyScore(qt, vocab[i])
      if (s > 0) hits.push({ e: vocab[i], score: s, fuzzy: true, kind: 0 })
    }
  }
  if (data.cache.size >= TOKEN_CACHE_MAX) data.cache.clear()
  data.cache.set(key, hits)
  return hits
}

function ensureBuffers(data: IndexData): void {
  if (data.mark) return
  const n = Math.max(1, data.docs.length)
  data.nameBest = new Float32Array(n * MAX_Q)
  data.anyBest = new Float32Array(n * MAX_Q)
  data.fuzzBest = new Float32Array(n * MAX_Q)
  data.firstHit = new Uint8Array(n)
  data.mark = new Uint32Array(n)
  data.epoch = 0
}

/**
 * Nivå när namnet börjar med sökningen: ordgräns eller böjning → prefix; resten av ordet är minst
 * fyra tecken (troligen en sammansättning, "Kycklingfärs") → förled; annars sannolikt ett annat
 * ord ("Ostron" för "ost") → lägre.
 */
function prefixTier(name: string, query: string, last: QueryToken): number {
  const next = name.charCodeAt(query.length)
  if (Number.isNaN(next) || next === 32) return SEARCH_TIERS.prefix
  const end = name.indexOf(' ', query.length)
  const wordEnd = end < 0 ? name.length : end
  const word = name.slice(name.lastIndexOf(' ', query.length - 1) + 1, wordEnd)
  if (last.q.length >= 4 && stemSv(word) === last.stem) return SEARCH_TIERS.prefix
  return wordEnd - query.length >= 4 ? SEARCH_TIERS.prefixInWord : SEARCH_TIERS.prefixShort
}

interface OneSearch {
  full: SearchResult[]
  partial: SearchResult[]
  /** Hela sökningen är exakt namnet eller en synonym för något livsmedel ("red bull"). */
  whole: boolean
}

function searchOne(data: IndexData, pq: ParsedQuery, opts: SearchOptions, limit: number): OneSearch {
  ensureBuffers(data)
  const nameBest = data.nameBest!
  const anyBest = data.anyBest!
  const fuzzBest = data.fuzzBest!
  const firstHit = data.firstHit!
  const mark = data.mark!
  if (data.epoch >= 0xfffffff0) {
    mark.fill(0)
    data.epoch = 0
  }
  const epoch = ++data.epoch
  const nq = pq.required.length
  const touched: number[] = []

  for (let qi = 0; qi < nq; qi++) {
    const hits = tokenHits(data, pq.required[qi])
    for (const h of hits) {
      const post = h.e.postings
      for (let p = 0; p < post.length; p++) {
        const code = post[p]
        const d = code >>> 3
        const field = (code >>> 1) & 3
        if (mark[d] !== epoch) {
          mark[d] = epoch
          const base = d * MAX_Q
          for (let j = 0; j < nq; j++) {
            nameBest[base + j] = 0
            anyBest[base + j] = 0
            fuzzBest[base + j] = 0
          }
          firstHit[d] = 0
          touched.push(d)
        }
        const s = h.score * FIELD_WEIGHT[field]
        const slot = d * MAX_Q + qi
        if (h.fuzzy) {
          if (s > fuzzBest[slot]) fuzzBest[slot] = s
        } else {
          if (s > anyBest[slot]) anyBest[slot] = s
          if (field <= FIELD_COMPACT && s > nameBest[slot]) nameBest[slot] = s
          if (qi === 0 && field === FIELD_NAME && (code & 1) === 1) {
            firstHit[d] |= FIRST_ANY | (h.kind === 3 ? FIRST_HEAD : 0) | (h.kind === 1 ? FIRST_WORD : 0)
          }
        }
      }
    }
  }

  const catSet = opts.categories && opts.categories.length > 0 ? new Set<FoodCategory>(opts.categories) : null
  const qStr = pq.sv ? pq.norm : pq.fold
  const full: SearchResult[] = []
  const partial: SearchResult[] = []
  let whole = false

  for (const d of touched) {
    const doc = data.docs[d]
    if (catSet && !catSet.has(doc.food.category)) continue
    if (opts.filter && !opts.filter(doc.food)) continue
    const base = d * MAX_Q
    let nameAll = true
    let anyAll = true
    let matched = 0
    let qName = 0
    let qAny = 0
    let qLoose = 0
    let exactWords = 0
    for (let qi = 0; qi < nq; qi++) {
      const n = nameBest[base + qi]
      const a = anyBest[base + qi]
      const f = fuzzBest[base + qi]
      if (n <= 0) nameAll = false
      if (a <= 0) anyAll = false
      const loose = a > f ? a : f
      if (loose > 0) matched++
      qName += n
      qAny += a
      qLoose += loose
      if (n >= 0.9) exactWords++
    }

    let tier: number
    let kind: MatchKind
    let quality: number
    const synExact = (pq.sv ? doc.syn : doc.synF).includes(qStr)
    if (nameAll) {
      const nm = pq.sv ? doc.name : doc.nameF
      quality = qName / nq
      if (nm === qStr) {
        tier = SEARCH_TIERS.exact
        kind = 'exact'
        quality = 1
        whole = true
      } else if (nm.startsWith(qStr)) {
        tier = prefixTier(nm, qStr, pq.required[nq - 1])
        kind = 'prefix'
      } else if (nq === 1 && (firstHit[d] & FIRST_WORD) !== 0) {
        // Namnets första ord är en böjning av sökordet: "köttbulle" → "Köttbullar, stekta".
        tier = SEARCH_TIERS.prefix
        kind = 'prefix'
      } else {
        // Ensamt sökord som är huvudord i namnets första ord: "Prästost" är en ost.
        tier = nq === 1 && (firstHit[d] & FIRST_HEAD) !== 0 ? SEARCH_TIERS.head : SEARCH_TIERS.token
        kind = 'token'
      }
    } else if (anyAll) {
      if (synExact) whole = true
      tier = synExact ? SEARCH_TIERS.synonymExact : SEARCH_TIERS.synonym
      kind = 'synonym'
      quality = qAny / nq
    } else if (matched === nq) {
      tier = SEARCH_TIERS.fuzzy
      kind = 'fuzzy'
      quality = qLoose / nq
    } else if (nq >= 2 && matched * 2 >= nq) {
      tier = SEARCH_TIERS.partial
      kind = 'fuzzy'
      quality = qLoose / nq
    } else continue

    const shortness = Math.min(1, pq.qLen / doc.lenCompact)
    let score =
      tier + 70 * quality + 45 * shortness + 25 * (exactWords / nq) + (firstHit[d] !== 0 ? 20 : 0) + doc.sourceBonus
    if (synExact && tier > SEARCH_TIERS.synonymExact && tier < SEARCH_TIERS.exact) score += SYNONYM_EXACT_BONUS
    if (tier === SEARCH_TIERS.partial) score *= matched / nq
    if (opts.boost) {
      const b = opts.boost(doc.food)
      if (Number.isFinite(b)) score += b
    }
    const result: SearchResult = { food: doc.food, score, matched: kind }
    if (tier === SEARCH_TIERS.partial) partial.push(result)
    else full.push(result)
  }

  full.sort(compareResults)
  partial.sort(compareResults)
  return { full: full.length > limit ? full.slice(0, limit) : full, partial: partial.length > limit ? partial.slice(0, limit) : partial, whole }
}

/**
 * Fullständiga träffar, kompletterade med delvisa (minst hälften av orden) när de fullständiga är
 * få – men inte när hela sökningen redan är namnet eller en synonym för något ("red bull",
 * "coca cola"): då är övriga delträffar ("Rödkål", "Kanelbulle") bara brus.
 */
function withPartial(one: OneSearch, limit: number): SearchResult[] {
  const { full, partial } = one
  if (!one.whole && full.length < Math.min(limit, 8) && partial.length > 0) return [...full, ...partial.slice(0, limit - full.length)]
  return full.length > limit ? full.slice(0, limit) : full
}

function compareResults(a: SearchResult, b: SearchResult): number {
  return b.score - a.score || a.food.name.length - b.food.name.length || (a.food.name < b.food.name ? -1 : a.food.name > b.food.name ? 1 : 0)
}

const collator = new Intl.Collator('sv-SE', { sensitivity: 'base', numeric: true })

/** Tom sökning med kategorifilter: lista kategorins livsmedel (boost först, sedan i bokstavsordning). */
function browse(data: IndexData, opts: SearchOptions, limit: number): SearchResult[] {
  const cats = new Set<FoodCategory>(opts.categories)
  const out: SearchResult[] = []
  for (const doc of data.docs) {
    if (!cats.has(doc.food.category)) continue
    if (opts.filter && !opts.filter(doc.food)) continue
    let score = doc.sourceBonus
    if (opts.boost) {
      const b = opts.boost(doc.food)
      if (Number.isFinite(b)) score += b
    }
    out.push({ food: doc.food, score, matched: 'token' })
  }
  out.sort((a, b) => b.score - a.score || collator.compare(a.food.name, b.food.name))
  return out.slice(0, limit)
}

function dataOf(index: SearchIndex): IndexData {
  const data = INTERNAL.get(index)
  if (!data) throw new Error('Ogiltigt sökindex – skapa det med createSearchIndex().')
  return data
}

function isIndexList(x: SearchIndex | readonly SearchIndex[]): x is readonly SearchIndex[] {
  return Array.isArray(x)
}

/**
 * Sök bland livsmedel. Tar ett index eller flera (t.ex. användarens egna + den inbyggda databasen);
 * vid flera index slås träffarna ihop och dubbletter (samma id) tas bort.
 *
 * Tom sökning ger `[]` – utom när `categories` anges, då listas kategorins livsmedel.
 */
export function searchFoods(
  index: SearchIndex | readonly SearchIndex[],
  query: string,
  opts: SearchOptions = {},
): SearchResult[] {
  const limit = Math.max(1, Math.floor(opts.limit ?? 50))
  const indexes = isIndexList(index) ? index : [index]
  const pq = parseQuery(query, opts.optionalWords)
  if (!pq) {
    if (!(opts.categories && opts.categories.length > 0)) return []
    if (indexes.length === 1) return browse(dataOf(indexes[0]), opts, limit)
    const merged = mergeBest(indexes.map((ix) => browse(dataOf(ix), opts, limit)))
    return merged.sort((a, b) => b.score - a.score || collator.compare(a.food.name, b.food.name)).slice(0, limit)
  }

  if (indexes.length === 1) return withPartial(searchOne(dataOf(indexes[0]), pq, opts, limit), limit)

  // Flera index: slå ihop fullständiga och delvisa träffar var för sig.
  const runs = indexes.map((ix) => searchOne(dataOf(ix), pq, opts, limit))
  const full = mergeBest(runs.map((r) => r.full))
  const fullIds = new Set(full.map((r) => r.food.id))
  const partial = mergeBest(runs.map((r) => r.partial)).filter((r) => !fullIds.has(r.food.id))
  return withPartial({ full: full.sort(compareResults), partial: partial.sort(compareResults), whole: runs.some((r) => r.whole) }, limit)
}

/** Slå ihop träfflistor – dubbletter (samma id) behåller bästa poängen. */
function mergeBest(lists: readonly SearchResult[][]): SearchResult[] {
  const best = new Map<string, SearchResult>()
  for (const list of lists) {
    for (const r of list) {
      const prev = best.get(r.food.id)
      if (!prev || r.score > prev.score) best.set(r.food.id, r)
    }
  }
  return [...best.values()]
}

// ---------------------------------------------------------------------------
// Markering av träffar i UI
// ---------------------------------------------------------------------------

export interface HighlightPart {
  text: string
  match: boolean
}

const charKeyCache = new Map<string, string>()

/** Ett tecken → ett jämförelsetecken (samma längd som originalet, så index kan återanvändas). */
function charKey(c: string, fold: boolean): string {
  const cacheKey = fold ? `f${c}` : c
  const hit = charKeyCache.get(cacheKey)
  if (hit !== undefined) return hit
  let out: string
  const lower = c.toLowerCase()
  if (lower === 'å' || lower === 'ä' || lower === 'ö') out = fold ? FOLD[lower] : lower
  else if (lower === 'æ') out = fold ? 'a' : 'ä'
  else if (lower === 'ø') out = fold ? 'o' : 'ö'
  else if (lower === 'ß') out = 's'
  else if (c === '.' || c === ',') out = ','
  else {
    const base = lower.normalize('NFD').charAt(0)
    out = /[\p{L}\p{N}]/u.test(base) ? base : ' '
  }
  if (out.length !== 1) out = ' '
  charKeyCache.set(cacheKey, out)
  return out
}

/**
 * Dela upp en text i delar som matchar respektive inte matchar sökningen – för att markera
 * träffar i resultatlistan ("Kyckling**bröst**filé"). Tål saknade å/ä/ö och accenter.
 */
export function highlightSv(text: string, query: string): HighlightPart[] {
  const norm = normalizeSv(query)
  if (!text) return []
  if (!norm) return [{ text, match: false }]
  const fold = !HAS_SV.test(norm)
  let key = ''
  for (let i = 0; i < text.length; i++) key += charKey(text.charAt(i), fold)
  const marks = new Uint8Array(text.length)
  const isWordChar = (ch: string) => ch !== ' ' && ch !== ','

  for (const tok of new Set(norm.split(' '))) {
    if (STOPWORDS.has(tok) && norm.includes(' ')) continue
    const variants = [tok]
    const st = stemSv(tok)
    if (st !== tok && st.length >= 3) variants.push(st)
    for (const v of variants) {
      let found = false
      let i = key.indexOf(v)
      while (i !== -1) {
        if (v.length >= 3 || i === 0 || !isWordChar(key.charAt(i - 1))) {
          marks.fill(1, i, i + v.length)
          found = true
        }
        i = key.indexOf(v, i + 1)
      }
      if (found) break
    }
  }

  const parts: HighlightPart[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      parts.push({ text: text.slice(start, i), match: marks[start] === 1 })
      start = i
    }
  }
  return parts
}
