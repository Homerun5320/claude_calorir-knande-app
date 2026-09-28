/**
 * Livsmedelssök i React: användarens egna livsmedel, recept och sparade produkter + den
 * inbyggda databasen och de svenska klassikerna, rankat med personlig relevans (användning,
 * senast använd, favoriter och vilken måltid livsmedlet brukar ätas till).
 *
 * Träffarna delas i två grupper:
 * - `results` – huvudträffarna: Lagoms kurerade livsmedel (grova linjer, tillagat som standard och
 *   samlingsvärden), användarens egna, recept och sparade produkter. Livsmedelsverkets poster som
 *   användaren redan har loggat eller sparat som favorit räknas också hit.
 * - `lmvResults` – Livsmedelsverkets övriga poster ('lmv:'), för en egen hopfälld sektion ("Fler från
 *   Livsmedelsverket"). Råa och okokta poster och specialposter (barnmat, välling, inälvor …) visas där
 *   bara om sökningen själv innehåller ordet – se `isHiddenLmvFood`. Hit hör även poster som sparats
 *   i `cachedFoods` (t.ex. av importen i Inställningar) – de blandas inte in bland huvudträffarna.
 *
 * Ord som "rå" och "okokt" behöver inte matcha i huvudsökningen (Lagoms rader anges tillagade och
 * kan vägas råa): "nötfärs rå" hittar Nötfärs.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Food, FoodCategory, MealId } from '../types'
import { useFoodStore, type FoodUsage } from '../stores/foodStore'
import { createSearchIndex, foldSv, normalizeSv, searchFoods, type SearchIndex, type SearchResult } from '../lib/search'
import { userFoodCatalog, type BuiltinCatalog } from '../lib/foodRepo'
import { useBuiltinCatalog, useFoodResolver } from './useFood'

/** Fördröjning innan sökningen körs medan användaren skriver. */
export const SEARCH_DEBOUNCE_MS = 120

const EMPTY_RESULTS: SearchResult[] = []
const EMPTY_FOODS: Food[] = []

/** Sökindex per livsmedelslista – delas mellan alla komponenter och byggs bara en gång. */
const indexCache = new WeakMap<readonly Food[], SearchIndex>()
function indexFor(foods: readonly Food[]): SearchIndex {
  let index = indexCache.get(foods)
  if (!index) {
    index = createSearchIndex(foods)
    indexCache.set(foods, index)
  }
  return index
}

/** Livsmedelsverkets okopplade poster har id 'lmv:<nummer>'. */
export const isLmvFood = (food: Pick<Food, 'id'>): boolean => food.id.startsWith('lmv:')

/** Ord som inte behöver matcha i huvudsökningen – Lagoms rader anges tillagade ("nötfärs rå"). */
const OPTIONAL_QUERY_WORDS: ReadonlySet<string> = new Set(['rå', 'rått', 'råa', 'ra', 'ratt', 'raa', 'okokt', 'okokta'])

/** Användarens sparade livsmedel uppdelade i Livsmedelsverkets poster och övriga (egna, recept, Open Food Facts). */
const userSplitCache = new WeakMap<readonly Food[], { main: readonly Food[]; lmv: readonly Food[] }>()
function splitUserFoods(foods: readonly Food[]): { main: readonly Food[]; lmv: readonly Food[] } {
  let split = userSplitCache.get(foods)
  if (!split) {
    const lmv = foods.filter(isLmvFood)
    split = { main: lmv.length === 0 ? foods : foods.filter((f) => !isLmvFood(f)), lmv: lmv.length === 0 ? EMPTY_FOODS : lmv }
    userSplitCache.set(foods, split)
  }
  return split
}

/** Livsmedelsnummer som ett kurerat Lagom-livsmedel länkar till (den posten ersätts av Lagoms rad). */
const linkedCache = new WeakMap<BuiltinCatalog, ReadonlySet<number>>()
function linkedLmvNumbers(cat: BuiltinCatalog): ReadonlySet<number> {
  let linked = linkedCache.get(cat)
  if (!linked) {
    const set = new Set<number>()
    for (const f of cat.foods) if (f.source === 'lagom' && f.lmvNumber !== undefined) set.add(f.lmvNumber)
    linked = set
    linkedCache.set(cat, linked)
  }
  return linked
}

/**
 * Sparade poster från Livsmedelsverket som inte redan finns i katalogen (t.ex. när datafilen inte
 * kunde läsas in) – utan poster som ett kurerat livsmedel länkar till.
 */
const extraLmvCache = new WeakMap<BuiltinCatalog, WeakMap<readonly Food[], readonly Food[]>>()
function extraLmvFoods(cat: BuiltinCatalog | null, saved: readonly Food[]): readonly Food[] {
  if (!cat || saved.length === 0) return EMPTY_FOODS
  let perCat = extraLmvCache.get(cat)
  if (!perCat) {
    perCat = new WeakMap()
    extraLmvCache.set(cat, perCat)
  }
  let extra = perCat.get(saved)
  if (!extra) {
    const linked = linkedLmvNumbers(cat)
    const list = saved.filter((f) => !cat.byId.has(f.id) && !(f.lmvNumber !== undefined && linked.has(f.lmvNumber)))
    extra = list.length === 0 ? EMPTY_FOODS : list
    perCat.set(saved, extra)
  }
  return extra
}

/** Den inbyggda katalogens sökbara livsmedel uppdelade i Lagoms egna och Livsmedelsverkets övriga. */
const splitCache = new WeakMap<readonly Food[], { main: readonly Food[]; lmv: readonly Food[] }>()
function splitBuiltin(foods: readonly Food[]): { main: readonly Food[]; lmv: readonly Food[] } {
  let split = splitCache.get(foods)
  if (!split) {
    const lmv = foods.filter(isLmvFood)
    // Samma lista (och därmed samma sökindex) när Livsmedelsverkets data saknas.
    split = { main: lmv.length === 0 ? foods : foods.filter((f) => !isLmvFood(f)), lmv }
    splitCache.set(foods, split)
  }
  return split
}

/**
 * Ord i namnet som döljer en post från Livsmedelsverket – om inte sökningen själv innehåller ordet:
 * råa varor och okokt pasta, ris och gryn (Lagoms rader har "g rå" och "g okokt").
 */
const RAW_WORDS = new Set(['rå', 'rått', 'råa', 'okokt', 'okokta'])
const RAW_WORDS_FOLDED = new Set(['ra', 'ratt', 'raa', 'okokt', 'okokta'])
/** Torkade baljväxter (inte torkad frukt eller kryddor) – utom de som är kokta ("Linser torkade kokta"). */
const DRIED_WORDS = new Set(['torkad', 'torkade', 'torr', 'torra'])
const COOKED_WORDS = new Set(['kokt', 'kokta'])
/** Hela ordet eller sist i en sammansättning ("kycklinglever", "oxtunga") – inte "leverpastej", "mager". */
const ORGAN_WORDS = ['lever', 'levrar', 'hjärta', 'hjärtan', 'mage', 'magar', 'njure', 'njurar', 'tunga', 'tungor', 'blod']
/** Ord som slutar som en inälva utan att vara det (desserten "Fromage"). */
const NOT_ORGAN = new Set(['fromage'])
/** Var som helst i namnet ("Havrevälling", "Barnmat klämmis"). */
const SPECIAL_PARTS = ['barnmat', 'modersmjölksersättning', 'välling']

/**
 * true om en post från Livsmedelsverket ska döljas för sökningen: råa varor (" rå"), okokt pasta och
 * okokt ris, torkade baljväxter, barnmat, modersmjölksersättning, välling och inälvor (lever, hjärta,
 * mage, njure, tunga, blod) – utom när sökningen själv innehåller ordet ("kycklinglever", "välling",
 * "lax rå", "pasta okokt", "linser torkade").
 */
export function isHiddenLmvFood(food: Pick<Food, 'name'> & Partial<Pick<Food, 'category'>>, query: string): boolean {
  const name = normalizeSv(food.name)
  const nameTokens = name.split(' ')
  const q = normalizeSv(query)
  const qFolded = foldSv(query)
  const qTokens = q.split(' ')
  const qFoldedTokens = qFolded.split(' ')
  if (nameTokens.some((t) => RAW_WORDS.has(t)) && !qTokens.some((t) => RAW_WORDS.has(t)) && !qFoldedTokens.some((t) => RAW_WORDS_FOLDED.has(t))) {
    return true
  }
  if (
    food.category === 'baljvaxter' &&
    nameTokens.some((t) => DRIED_WORDS.has(t)) &&
    !nameTokens.some((t) => COOKED_WORDS.has(t)) &&
    !qTokens.some((t) => DRIED_WORDS.has(t))
  ) {
    return true
  }
  for (const part of SPECIAL_PARTS) {
    if (name.includes(part) && !q.includes(part) && !qFolded.includes(foldSv(part))) return true
  }
  for (const organ of ORGAN_WORDS) {
    if (nameTokens.some((t) => t.endsWith(organ) && !NOT_ORGAN.has(t)) && !q.includes(organ) && !qFolded.includes(foldSv(organ))) return true
  }
  return false
}

/** Id för Livsmedelsverkets poster som användaren har loggat eller sparat som favorit, som en stabil nyckel. */
function usedLmvKey(usage: Readonly<Record<string, FoodUsage>>, favorites: readonly string[]): string {
  const ids = new Set<string>()
  for (const id of favorites) if (id.startsWith('lmv:')) ids.add(id)
  for (const id of Object.keys(usage)) if (id.startsWith('lmv:')) ids.add(id)
  return [...ids].sort().join('|')
}

/** Livsmedelsverkets sökbara poster per id (för uppslag av använda poster). */
const lmvByIdCache = new WeakMap<readonly Food[], ReadonlyMap<string, Food>>()
function lmvById(foods: readonly Food[]): ReadonlyMap<string, Food> {
  let map = lmvByIdCache.get(foods)
  if (!map) {
    map = new Map(foods.map((f) => [f.id, f]))
    lmvByIdCache.set(foods, map)
  }
  return map
}

/**
 * Sökindex över de använda posterna från Livsmedelsverket (visas bland huvudträffarna). Bara poster
 * som annars hör till sektionen "Fler från Livsmedelsverket" räknas – en post som ett kurerat
 * livsmedel länkar till visas inte, den kurerade raden står redan bland huvudträffarna.
 */
function usedLmvIndex(pools: ReadonlyArray<readonly Food[]>, key: string): SearchIndex | null {
  if (!key) return null
  const foods: Food[] = []
  for (const id of key.split('|')) {
    for (const pool of pools) {
      const f = lmvById(pool).get(id)
      if (f) {
        foods.push(f)
        break
      }
    }
  }
  return foods.length > 0 ? createSearchIndex(foods) : null
}

const DAY_MS = 86_400_000

/**
 * Personlig boost (poäng) för sökresultat – ca 0–220 poäng:
 * - användning: upp till 80 (logaritmiskt, 1 gång ≈ 25, 7 gånger ≈ 75)
 * - senast använd: upp till 40 (halveras ungefär var tionde dag)
 * - måltid: upp till 40 om livsmedlet oftast äts till vald måltid
 * - favorit: 60
 */
export function createUsageBoost(
  usage: Readonly<Record<string, FoodUsage>>,
  favorites: readonly string[],
  meal?: MealId,
  now: number = Date.now(),
): (food: Food) => number {
  const favs = new Set(favorites)
  return (food) => {
    let b = favs.has(food.id) ? 60 : 0
    const u = usage[food.id]
    if (u && u.count > 0) {
      b += Math.min(80, 25 * Math.log2(1 + u.count))
      const days = Math.max(0, (now - u.lastUsed) / DAY_MS)
      b += 40 * Math.exp(-days / 14)
      if (meal) b += 40 * Math.min(1, (u.meals[meal] ?? 0) / u.count)
    }
    return b
  }
}

export interface UseFoodSearchOptions {
  /** Måltiden användaren lägger till i – livsmedel som brukar ätas då rankas högre. */
  meal?: MealId
  /** Max antal träffar (standard 40). */
  limit?: number
  /** Begränsa till kategorier. Med tom sökning listas kategorins livsmedel. */
  categories?: readonly FoodCategory[]
}

export interface UseFoodSearchResult {
  /** Huvudträffarna: Lagoms kurerade livsmedel, egna, recept och sparade produkter. */
  results: SearchResult[]
  /**
   * Livsmedelsverkets övriga poster (id 'lmv:'), utan råa poster och specialposter som sökningen
   * inte frågar efter. Tom vid kategoribläddring och tom sökning.
   */
  lmvResults: SearchResult[]
  /** true medan den inbyggda databasen laddas (användarens egna livsmedel söks ändå). */
  loading: boolean
  /** true medan en ny sökning väntar på att användaren slutar skriva. */
  pending: boolean
}

/**
 * Sök livsmedel medan användaren skriver (fördröjt ~120 ms). Tom sökning ger [] så att UI kan
 * visa senaste och favoriter i stället – utom när `categories` anges (bläddra i kategori, bara
 * huvudträffar). Livsmedelsverkets övriga poster kommer separat i `lmvResults`.
 */
export function useFoodSearch(query: string, opts: UseFoodSearchOptions = {}): UseFoodSearchResult {
  const { meal, limit = 40, categories } = opts
  const q = query.trim()

  // Fördröj sökningen medan användaren skriver – men töm direkt.
  const [debounced, setDebounced] = useState(q)
  useEffect(() => {
    if (q === debounced) return
    if (q === '') {
      setDebounced('')
      return
    }
    const t = setTimeout(() => setDebounced(q), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q, debounced])
  const effective = q === '' ? '' : debounced

  const catalog = useBuiltinCatalog()
  const customFoods = useFoodStore((s) => s.customFoods)
  const recipes = useFoodStore((s) => s.recipes)
  const cachedFoods = useFoodStore((s) => s.cachedFoods)
  const usage = useFoodStore((s) => s.usage)
  const favorites = useFoodStore((s) => s.favorites)

  // Användarens sparade poster från Livsmedelsverket (import i Inställningar) hör till sektionen
  // "Fler från Livsmedelsverket", inte till huvudträffarna.
  const userSplit = useMemo(() => splitUserFoods(userFoodCatalog(customFoods, recipes, cachedFoods).list), [customFoods, recipes, cachedFoods])
  const userIndex = useMemo(() => indexFor(userSplit.main), [userSplit])
  const split = useMemo(() => (catalog ? splitBuiltin(catalog.foods) : null), [catalog])
  const builtinIndex = useMemo(() => (split ? indexFor(split.main) : null), [split])
  const lmvIndex = useMemo(() => (split && split.lmv.length > 0 ? indexFor(split.lmv) : null), [split])
  const extraLmv = useMemo(() => extraLmvFoods(catalog, userSplit.lmv), [catalog, userSplit])
  const extraLmvIndex = useMemo(() => (extraLmv.length > 0 ? indexFor(extraLmv) : null), [extraLmv])
  // Livsmedelsverkets poster som redan används – ett litet eget index, byggs om bara när urvalet ändras.
  const usedKey = useMemo(() => usedLmvKey(usage, favorites), [usage, favorites])
  const usedIndex = useMemo(() => usedLmvIndex(split ? [split.lmv, extraLmv] : [extraLmv], usedKey), [split, extraLmv, usedKey])
  // Klassikerna (recept) söks i ett eget index – samma lista i båda stegen av inläsningen.
  const recipeFoods = catalog?.recipeFoods
  const recipeIndex = useMemo(() => (recipeFoods && recipeFoods.length > 0 ? indexFor(recipeFoods) : null), [recipeFoods])
  const boost = useMemo(() => createUsageBoost(usage, favorites, meal), [usage, favorites, meal])
  // Stabil nyckel så att en ny array med samma kategorier inte ger en ny sökning.
  const catKey = categories && categories.length > 0 ? [...categories].sort().join(',') : ''

  const results = useMemo(() => {
    if (!effective && !catKey) return EMPTY_RESULTS
    const indexes = [userIndex, builtinIndex, recipeIndex, usedIndex].filter((ix): ix is SearchIndex => ix !== null)
    const cats = catKey ? (catKey.split(',') as FoodCategory[]) : undefined
    return searchFoods(indexes, effective, { limit, categories: cats, boost, optionalWords: OPTIONAL_QUERY_WORDS })
  }, [effective, catKey, userIndex, builtinIndex, recipeIndex, usedIndex, limit, boost])

  const lmvResults = useMemo(() => {
    // Kategoribläddring visar bara huvudträffarna.
    const indexes = [lmvIndex, extraLmvIndex].filter((ix): ix is SearchIndex => ix !== null)
    if (!effective || indexes.length === 0) return EMPTY_RESULTS
    const shown = new Set(results.map((r) => r.food.id))
    const cats = catKey ? (catKey.split(',') as FoodCategory[]) : undefined
    // Dolda poster (råa, barnmat …) filtreras bort innan listan kapas, så att de inte tränger undan
    // de synliga. "rå" och "okokt" måste matcha här – de avgör vilka poster som visas.
    const hits = searchFoods(indexes, effective, {
      limit,
      categories: cats,
      boost,
      filter: (f) => !shown.has(f.id) && !isHiddenLmvFood(f, effective),
    })
    return hits.length > 0 ? hits : EMPTY_RESULTS
  }, [effective, catKey, lmvIndex, extraLmvIndex, results, limit, boost])

  const loading = catalog === null && (effective !== '' || catKey !== '')
  const pending = q !== effective
  return useMemo(() => ({ results, lmvResults, loading, pending }), [results, lmvResults, loading, pending])
}

/**
 * Senast använda livsmedel (nyast först). Med `meal` visas först det som ätits till den
 * måltiden, sedan övriga senaste.
 */
export function useRecentFoods(limit = 12, meal?: MealId): Food[] {
  const usage = useFoodStore((s) => s.usage)
  const resolve = useFoodResolver()
  return useMemo(() => {
    const entries = Object.entries(usage).sort((a, b) => b[1].lastUsed - a[1].lastUsed)
    const ordered = meal
      ? [...entries.filter(([, u]) => (u.meals[meal] ?? 0) > 0), ...entries.filter(([, u]) => !((u.meals[meal] ?? 0) > 0))]
      : entries
    const out: Food[] = []
    const seen = new Set<string>()
    for (const [id] of ordered) {
      if (out.length >= limit) break
      // Gamla id:n följer sitt alias – samma livsmedel visas bara en gång.
      const food = resolve(id)
      if (food && !seen.has(food.id)) {
        seen.add(food.id)
        out.push(food)
      }
    }
    return out.length > 0 ? out : EMPTY_FOODS
  }, [usage, resolve, limit, meal])
}

/** Favoriter i den ordning användaren lade till dem (senaste först). */
export function useFavoriteFoods(): Food[] {
  const favorites = useFoodStore((s) => s.favorites)
  const resolve = useFoodResolver()
  return useMemo(() => {
    const out: Food[] = []
    const seen = new Set<string>()
    for (const id of favorites) {
      const food = resolve(id)
      if (food && !seen.has(food.id)) {
        seen.add(food.id)
        out.push(food)
      }
    }
    return out.length > 0 ? out : EMPTY_FOODS
  }, [favorites, resolve])
}
