/**
 * Livsmedelsregistret – den enda platsen där Lagom slår upp livsmedel.
 *
 * Källor (i prioritetsordning vid uppslag på id):
 *  1. Användarens egna livsmedel, recept och sparade onlineprodukter (`useFoodStore`).
 *  2. Den inbyggda databasen: Lagoms kurerade livsmedel (lazy chunk `data/foods`),
 *     Livsmedelsverkets import (`public/data/livsmedelsverket.json`, skapas av
 *     `npm run data:lmv`; filen är valfri – saknas den eller är enheten offline ignoreras den)
 *     och de svenska klassikerna (`data/recipes`) som livsmedel 'recipe:klassiker-*', så att en
 *     loggad klassiker hittas igen i Senaste, favoriter, sökningen och på detaljsidan.
 *  3. Ett tillfälligt minne för produkter som hämtats från Open Food Facts under sessionen
 *     (så att en sökträff kan öppnas på detaljsidan utan att sparas permanent).
 *
 * Lagoms kurerade livsmedel kan länkas till Livsmedelsverkets livsmedel med `lmvNumber` (samma
 * livsmedel och tillagning). När båda är inlästa:
 *  - fylls varje näringsämne som saknas i det kurerade livsmedlet i från det länkade
 *    (`enrichCuratedFoods` – definierade värden skrivs aldrig över),
 *  - döljs det länkade Livsmedelsverket-livsmedlet i sökningen och listorna (det kurerade har
 *    svenska portioner och sökord), men det går fortfarande att slå upp på id ('lmv:150') så att
 *    gamla dagboksposter, favoriter och Senaste fungerar.
 *
 * Id:n som tagits bort eller slagits ihop i Lagoms databas har alias (`data/foods/aliases`) till
 * ersättaren. Katalogens `byId` och alla uppslag här följer aliasen, så att gamla favoriter,
 * Senaste, länkar och recept hittar den nya raden (med ersättarens id).
 *
 * Den inbyggda katalogen publiceras normalt en gång, komplett. Dröjer Livsmedelsverkets fil
 * publiceras den i två steg: först Lagoms egna livsmedel (så att sökningen fungerar direkt), sedan
 * berikat och sammanslaget med Livsmedelsverkets data. Prenumerera med `subscribeBuiltinCatalog`
 * eller använd hookarna i `hooks/useFood.ts`.
 */
import type { Food, Nutrients, Recipe } from '../types'
import { FOOD_CATEGORIES } from '../types'
import { useFoodStore } from '../stores/foodStore'
import { NUTRIENT_KEYS, saltFromSodiumMg, sodiumMgFromSalt, type NutrientKey } from './nutrients'
import { recipeFoodId, recipeToFood } from './recipes'
import { fetchProductByBarcode, normalizeBarcode, searchProducts, type SearchProductsOptions } from './openFoodFacts'
import { FOOD_ALIASES, resolveFoodAlias } from '../data/foods/aliases'

// ---------------------------------------------------------------------------
// Användarens livsmedel
// ---------------------------------------------------------------------------

type FoodStoreState = ReturnType<typeof useFoodStore.getState>

/** De delar av livsmedelsbutiken som innehåller livsmedel. */
export type UserFoodSources = Pick<FoodStoreState, 'customFoods' | 'recipes' | 'cachedFoods'>

const recipeFoodCache = new WeakMap<Recipe, Food>()

/** Receptet som livsmedel – memoiserat per receptobjekt (stabil identitet för React). */
export function recipeFood(recipe: Recipe): Food {
  let food = recipeFoodCache.get(recipe)
  if (!food) {
    food = recipeToFood(recipe)
    recipeFoodCache.set(recipe, food)
  }
  return food
}

/** Hitta ett recept på livsmedels-id ('recipe:abc') eller recept-id ('abc'). */
export function findRecipe(recipes: Record<string, Recipe>, id: string): Recipe | undefined {
  const direct = recipes[id]
  if (direct) return direct
  if (id.startsWith('recipe:')) return recipes[id.slice('recipe:'.length)]
  return recipes[recipeFoodId(id)]
}

export interface UserFoodCatalog {
  list: Food[]
  byId: ReadonlyMap<string, Food>
}

let userCache: { custom: unknown; recipes: unknown; cached: unknown; catalog: UserFoodCatalog } | null = null

/**
 * Användarens livsmedel (egna, recept, sparade onlineprodukter) som lista och uppslag.
 * Memoiserat på butikens objekt – samma indata ger samma (identiska) resultat.
 */
export function userFoodCatalog(
  customFoods: FoodStoreState['customFoods'],
  recipes: FoodStoreState['recipes'],
  cachedFoods: FoodStoreState['cachedFoods'],
): UserFoodCatalog {
  if (userCache && userCache.custom === customFoods && userCache.recipes === recipes && userCache.cached === cachedFoods) {
    return userCache.catalog
  }
  const byId = new Map<string, Food>()
  // Senare källor skriver inte över tidigare: egna livsmedel och recept går före sparade kopior.
  const add = (f: Food) => {
    if (!byId.has(f.id)) byId.set(f.id, f)
  }
  Object.values(customFoods).forEach(add)
  Object.values(recipes).forEach((r) => add(recipeFood(r)))
  Object.values(cachedFoods).forEach(add)
  const catalog: UserFoodCatalog = { list: [...byId.values()], byId }
  userCache = { custom: customFoods, recipes, cached: cachedFoods, catalog }
  return catalog
}

/** Alla användarens livsmedel som en lista. */
export function userFoodsFrom(
  customFoods: FoodStoreState['customFoods'],
  recipes: FoodStoreState['recipes'],
  cachedFoods: FoodStoreState['cachedFoods'],
): Food[] {
  return userFoodCatalog(customFoods, recipes, cachedFoods).list
}

/** Alla användarens livsmedel ur butikens tillstånd. */
export function allUserFoods(state: UserFoodSources = useFoodStore.getState()): Food[] {
  return userFoodsFrom(state.customFoods, state.recipes, state.cachedFoods)
}

/** Slå upp ett av användarens livsmedel (eget, recept eller sparat). */
export function findUserFood(state: UserFoodSources, id: string): Food | undefined {
  const custom = state.customFoods[id]
  if (custom) return custom
  const recipe = id.startsWith('recipe:') || state.recipes[id] ? findRecipe(state.recipes, id) : undefined
  if (recipe) return recipeFood(recipe)
  return state.cachedFoods[id]
}

// ---------------------------------------------------------------------------
// Tillfälligt minne för onlineprodukter
// ---------------------------------------------------------------------------

const REMEMBER_MAX = 300
const remembered = new Map<string, Food>()

/**
 * Kom ihåg livsmedel som hämtats online under sessionen (t.ex. sökträffar från Open Food Facts),
 * så att de kan öppnas via id utan att sparas permanent. Spara permanent med
 * `useFoodStore.getState().cacheFood(food)` när användaren loggar livsmedlet.
 */
export function rememberFoods(foods: readonly Food[]): void {
  for (const f of foods) {
    remembered.delete(f.id)
    remembered.set(f.id, f)
  }
  while (remembered.size > REMEMBER_MAX) {
    const oldest = remembered.keys().next().value
    if (oldest === undefined) break
    remembered.delete(oldest)
  }
}

export function getRememberedFood(id: string): Food | undefined {
  return remembered.get(id)
}

// ---------------------------------------------------------------------------
// Inbyggd katalog (Lagom + Livsmedelsverket)
// ---------------------------------------------------------------------------

/** Metadata om Livsmedelsverkets datafil. */
export interface LmvDatasetMeta {
  source?: string
  attribution?: string
  url?: string
  /** Importdatum 'YYYY-MM-DD'. */
  version?: string
  generatedAt?: string
  /** Antal livsmedel i filen. */
  count: number
}

export interface BuiltinCatalog {
  /**
   * Livsmedel för sökning och bläddring: Lagoms kurerade (berikade med Livsmedelsverkets värden)
   * och Livsmedelsverkets övriga. Livsmedelsverkets dubbletter av kurerade livsmedel är dolda.
   */
  foods: Food[]
  /**
   * Alla inbyggda livsmedel per id, även dolda dubbletter – och de inbyggda recepten som
   * livsmedel ('recipe:klassiker-*'). Gamla id:n med alias ger ersättaren (med ersättarens id).
   */
  byId: ReadonlyMap<string, Food>
  /**
   * De svenska klassikerna (inbyggda recept), lösta mot Lagoms (berikade) livsmedel. Stabil
   * referens så länge livsmedlen är desamma – räknas om bara när Livsmedelsverkets data kommer
   * efter att katalogen redan har publicerats.
   */
  recipes: Recipe[]
  /** Klassikerna som livsmedel (`recipeFood`) – för sökning. Ingår inte i `foods`. */
  recipeFoods: Food[]
  /** true när Livsmedelsverkets data har lästs in (eller visat sig saknas). */
  complete: boolean
  lmv: LmvDatasetMeta | null
  /** Felmeddelande om databasen inte kunde läsas in. */
  error?: string
}

/** Relativ sökväg – fungerar oavsett var appen ligger (Vite `base: './'`). */
export const LMV_DATA_PATH = 'data/livsmedelsverket.json'
const LMV_FETCH_TIMEOUT_MS = 20_000
/**
 * Så länge väntar vi på Livsmedelsverkets fil innan Lagoms egna livsmedel publiceras ensamma.
 * Filen ligger i appens förcache och brukar komma långt tidigare – då publiceras katalogen en
 * gång, berikad, och sökindex och klassiker byggs bara en gång.
 */
const LMV_GRACE_MS = 800

let catalog: BuiltinCatalog | null = null
let loading: Promise<BuiltinCatalog> | null = null
const listeners = new Set<() => void>()

function publish(next: BuiltinCatalog): void {
  catalog = next
  for (const l of listeners) l()
}

/** Aktuell katalog, eller null om den inte har lästs in än. */
export function getBuiltinCatalog(): BuiltinCatalog | null {
  return catalog
}

/** Prenumerera på ändringar i den inbyggda katalogen (för `useSyncExternalStore`). */
export function subscribeBuiltinCatalog(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const CATEGORY_SET = new Set<string>(FOOD_CATEGORIES)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Validera ett livsmedel från Livsmedelsverkets datafil. */
function toLmvFood(raw: unknown): Food | null {
  if (!isObject(raw)) return null
  const { id, name, nutrients } = raw
  if (typeof id !== 'string' || !id.startsWith('lmv:') || typeof name !== 'string' || !name.trim() || !isObject(nutrients)) return null
  const clean: Food['nutrients'] = {}
  for (const [k, v] of Object.entries(nutrients)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) clean[k as keyof Food['nutrients']] = v
  }
  const food: Food = {
    ...(raw as unknown as Food),
    id,
    name: name.trim(),
    source: 'livsmedelsverket',
    category: typeof raw.category === 'string' && CATEGORY_SET.has(raw.category) ? (raw.category as Food['category']) : 'ovrigt',
    nutrients: clean,
    portions: Array.isArray(raw.portions) ? (raw.portions as Food['portions']).filter((p) => isObject(p) && typeof p.grams === 'number' && p.grams > 0) : [],
  }
  if (food.lmvNumber === undefined) {
    const n = Number(id.slice(4))
    if (Number.isInteger(n)) food.lmvNumber = n
  }
  return food
}

/**
 * Tolka innehållet i `livsmedelsverket.json` ({ meta, foods } eller en ren lista).
 * Ogiltiga poster hoppas över.
 */
export function parseLmvDataset(json: unknown): { foods: Food[]; meta: LmvDatasetMeta | null } {
  const rawFoods = Array.isArray(json) ? json : isObject(json) && Array.isArray(json.foods) ? json.foods : []
  const foods: Food[] = []
  for (const raw of rawFoods) {
    const f = toLmvFood(raw)
    if (f) foods.push(f)
  }
  let meta: LmvDatasetMeta | null = null
  if (isObject(json) && isObject(json.meta)) {
    const m = json.meta
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
    meta = {
      source: str(m.source),
      attribution: str(m.attribution),
      url: str(m.url),
      version: str(m.version),
      generatedAt: str(m.generatedAt),
      count: foods.length,
    }
  } else if (foods.length > 0) {
    meta = { count: foods.length }
  }
  return { foods, meta }
}

const NO_LMV = { foods: [] as Food[], meta: null }

/** Hämta Livsmedelsverkets datafil. Tyst vid 404, offline, SPA-reserv (HTML) och tidsgräns. */
async function fetchLmvDataset(): Promise<{ foods: Food[]; meta: LmvDatasetMeta | null }> {
  if (typeof fetch !== 'function' || typeof document === 'undefined') return NO_LMV
  let url: string
  try {
    url = new URL(LMV_DATA_PATH, document.baseURI).href
  } catch {
    return NO_LMV
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LMV_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return NO_LMV
    const type = res.headers.get('content-type') ?? ''
    if (type && !type.includes('json')) return NO_LMV
    return parseLmvDataset(await res.json())
  } catch {
    return NO_LMV
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Berikning av kurerade livsmedel med Livsmedelsverkets värden
// ---------------------------------------------------------------------------

const FATTY_ACIDS = ['satFat', 'monoFat', 'polyFat'] as const satisfies readonly NutrientKey[]
const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Håll de ifyllda värdena förenliga med det kurerade livsmedlets egna. Märkesvaror och
 * livsmedel där Lagom medvetet behållit egna värden (t.ex. osaltat) kan skilja sig något från
 * Livsmedelsverkets post – då får ett ifyllt delvärde aldrig bli större än helheten.
 * Bara ifyllda värden (`filled`) justeras.
 */
function reconcile(n: Nutrients, filled: ReadonlySet<NutrientKey>): void {
  // Salt och natrium hänger ihop (salt = natrium × 2,5).
  if (filled.has('salt') && !filled.has('sodium') && n.sodium !== undefined) n.salt = round2(saltFromSodiumMg(n.sodium))
  if (filled.has('sodium') && !filled.has('salt') && n.salt !== undefined) n.sodium = round2(sodiumMgFromSalt(n.salt))
  // Sockerarter ≤ kolhydrater, tillsatt socker ≤ sockerarter.
  if (filled.has('sugars') && n.sugars !== undefined && n.carbs !== undefined && n.sugars > n.carbs) n.sugars = n.carbs
  if (filled.has('addedSugar') && n.addedSugar !== undefined && n.sugars !== undefined && n.addedSugar > n.sugars) n.addedSugar = n.sugars
  // Fettsyrorna ≤ fett: skala ner de ifyllda så att summan ryms.
  if (n.fat !== undefined) {
    let own = 0
    let added = 0
    for (const k of FATTY_ACIDS) {
      const v = n[k]
      if (v === undefined) continue
      if (filled.has(k)) added += v
      else own += v
    }
    if (added > 0 && own + added > n.fat) {
      const factor = Math.max(0, n.fat - own) / added
      for (const k of FATTY_ACIDS) {
        const v = n[k]
        if (v !== undefined && filled.has(k)) n[k] = round2(v * factor)
      }
    }
  }
  if (filled.has('omega3') && n.omega3 !== undefined && n.polyFat !== undefined && n.omega3 > n.polyFat) n.omega3 = n.polyFat
}

/**
 * Ett kurerat livsmedel kompletterat med värden från det länkade Livsmedelsverket-livsmedlet:
 * varje näringsämne som saknas (`undefined`) fylls i, definierade värden skrivs aldrig över.
 * Ren funktion – returnerar samma objekt om inget saknas, annars en ny kopia (originalet ändras inte).
 */
export function enrichFood(food: Food, linked: Food | undefined): Food {
  if (!linked || linked === food) return food
  const filled = new Set<NutrientKey>()
  const nutrients: Nutrients = { ...food.nutrients }
  for (const key of NUTRIENT_KEYS) {
    if (nutrients[key] !== undefined) continue
    const v = linked.nutrients[key]
    if (v === undefined || !Number.isFinite(v) || v < 0) continue
    nutrients[key] = v
    filled.add(key)
  }
  if (filled.size === 0) return food
  reconcile(nutrients, filled)
  return { ...food, nutrients }
}

const enrichCache = new WeakMap<readonly Food[], WeakMap<readonly Food[], Food[]>>()

/**
 * Lagoms kurerade livsmedel berikade med Livsmedelsverkets värden via `lmvNumber` (se `enrichFood`).
 * Memoiserat på listorna – samma indata ger samma (identiska) lista, och indata ändras aldrig.
 * Utan Livsmedelsverkets data (eller utan något att fylla i) returneras `curated` oförändrad.
 */
export function enrichCuratedFoods(curated: Food[], lmvFoods: readonly Food[]): Food[] {
  if (lmvFoods.length === 0) return curated
  let byLmv = enrichCache.get(curated)
  const hit = byLmv?.get(lmvFoods)
  if (hit) return hit
  const lmvByNumber = new Map<number, Food>()
  for (const f of lmvFoods) if (f.lmvNumber !== undefined && !lmvByNumber.has(f.lmvNumber)) lmvByNumber.set(f.lmvNumber, f)
  let changed = false
  const out = curated.map((f) => {
    if (f.lmvNumber === undefined || f.source === 'livsmedelsverket') return f
    const next = enrichFood(f, lmvByNumber.get(f.lmvNumber))
    if (next !== f) changed = true
    return next
  })
  const result = changed ? out : curated
  if (!byLmv) {
    byLmv = new WeakMap()
    enrichCache.set(curated, byLmv)
  }
  byLmv.set(lmvFoods, result)
  return result
}

/**
 * Sätt ihop katalogen. `curated` ska redan vara berikad (`enrichCuratedFoods`). Livsmedelsverkets
 * livsmedel som ett kurerat livsmedel länkar till döljs i `foods` men finns kvar i `byId`.
 */
function buildCatalog(
  curated: Food[],
  lmvFoods: readonly Food[],
  lmv: LmvDatasetMeta | null,
  complete: boolean,
  recipes: Recipe[] = [],
  // Klassikerna som livsmedel: samma objekt som `recipeFood(recipe)` ger, så att en loggad
  // klassiker, sökträffen och detaljsidan pekar på samma livsmedel.
  recipeFoods: Food[] = recipes.map(recipeFood),
): BuiltinCatalog {
  const byId = new Map<string, Food>()
  for (const f of curated) if (!byId.has(f.id)) byId.set(f.id, f)
  for (const f of recipeFoods) if (!byId.has(f.id)) byId.set(f.id, f)
  // Borttagna och sammanslagna id:n pekar på ersättaren.
  for (const [from, alias] of FOOD_ALIASES) {
    const target = byId.has(from) ? undefined : byId.get(alias.to)
    if (target) byId.set(from, target)
  }
  if (lmvFoods.length === 0) return { foods: curated, byId, recipes, recipeFoods, complete, lmv }
  // Kurerade Lagom-livsmedel med känt livsmedelsnummer ersätter Livsmedelsverkets post i sökningen.
  const linked = new Set<number>()
  for (const f of curated) if (f.lmvNumber !== undefined) linked.add(f.lmvNumber)
  const foods = curated.slice()
  for (const f of lmvFoods) {
    if (byId.has(f.id)) continue
    byId.set(f.id, f)
    if (f.lmvNumber !== undefined && linked.has(f.lmvNumber)) continue
    foods.push(f)
  }
  return { foods, byId, recipes, recipeFoods, complete, lmv }
}

/** Värdet om löftet uppfylls inom `ms` millisekunder, annars undefined (löftet får fortsätta). */
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

type RecipesModule = typeof import('../data/recipes')

/** Hämta receptmodulen. Går den inte att läsa in fungerar livsmedlen ändå (utan klassiker). */
function importRecipes(): Promise<RecipesModule | null> {
  return import('../data/recipes').catch((err: unknown) => {
    console.error('Kunde inte läsa in de inbyggda recepten', err)
    return null
  })
}

/**
 * Läs in den inbyggda katalogen (memoiserat). Lagoms databas och klassikerna laddas som separata
 * chunkar och Livsmedelsverkets fil hämtas parallellt. Kommer filen inom en kort stund publiceras
 * katalogen en gång, berikad och komplett; annars publiceras Lagoms egna livsmedel först och
 * katalogen berikas (och klassikerna räknas om) när filen kommer. Saknas filen eller är enheten
 * offline fungerar Lagoms livsmedel ändå. Vid fel publiceras en tom katalog med `error` och nästa
 * anrop försöker igen.
 */
export function loadBuiltinCatalog(): Promise<BuiltinCatalog> {
  if (catalog?.complete && !catalog.error) return Promise.resolve(catalog)
  if (loading) return loading
  const promise = (async (): Promise<BuiltinCatalog> => {
    const lmvPromise = fetchLmvDataset()
    const recipesPromise = importRecipes()
    let builtin: Food[]
    try {
      builtin = (await import('../data/foods/index')).BUILTIN_FOODS
    } catch (err) {
      console.error('Kunde inte läsa in livsmedelsdatabasen', err)
      const failed: BuiltinCatalog = {
        foods: [],
        byId: new Map(),
        recipes: [],
        recipeFoods: [],
        complete: true,
        lmv: null,
        error: 'Livsmedelsdatabasen kunde inte läsas in. Kontrollera uppkopplingen och ladda om sidan.',
      }
      loading = null
      publish(failed)
      return failed
    }
    const recipesModule = await recipesPromise
    // Klassikerna räknas på samma (berikade) livsmedel som katalogen – memoiserat per lista.
    const withRecipes = (foods: Food[], lmvFoods: readonly Food[], meta: LmvDatasetMeta | null, complete: boolean) =>
      buildCatalog(foods, lmvFoods, meta, complete, recipesModule?.loadBuiltinRecipes(foods) ?? [])
    const finish = (lmv: { foods: Food[]; meta: LmvDatasetMeta | null }) => {
      const full = withRecipes(enrichCuratedFoods(builtin, lmv.foods), lmv.foods, lmv.meta, true)
      publish(full)
      return full
    }
    const early = await settleWithin(lmvPromise, LMV_GRACE_MS)
    if (early) return finish(early)
    publish(withRecipes(builtin, [], null, false))
    return finish(await lmvPromise)
  })()
  loading = promise
  return promise
}

/** Lagoms inbyggda livsmedel + Livsmedelsverkets import (memoiserat). */
export async function loadBuiltinFoods(): Promise<Food[]> {
  return (await loadBuiltinCatalog()).foods
}

// ---------------------------------------------------------------------------
// Uppslag
// ---------------------------------------------------------------------------

/** Ett inbyggt livsmedel på id – följer alias för borttagna och sammanslagna id:n. */
export function builtinFood(cat: BuiltinCatalog | null | undefined, id: string): Food | undefined {
  if (!cat) return undefined
  const direct = cat.byId.get(id)
  if (direct) return direct
  const alias = resolveFoodAlias(id)
  return alias ? cat.byId.get(alias.to) : undefined
}

/**
 * Synkront uppslag bland det som redan finns i minnet: användarens livsmedel, den inbyggda
 * katalogen (om den är inläst, även via alias) och sessionens onlineprodukter.
 */
export function resolveFoodSync(id: string): Food | undefined {
  return findUserFood(useFoodStore.getState(), id) ?? builtinFood(catalog, id) ?? remembered.get(id)
}

/**
 * Slå upp ett livsmedel på id. Kontrollerar användarens livsmedel först, sedan den inbyggda
 * databasen. Med `online: true` hämtas okända `off:`-id:n från Open Food Facts (kan kasta
 * `OpenFoodFactsError`).
 */
export async function getFoodById(id: string, opts: { online?: boolean; signal?: AbortSignal } = {}): Promise<Food | undefined> {
  const local = resolveFoodSync(id)
  if (local) return local
  const cat = await loadBuiltinCatalog()
  const builtin = builtinFood(cat, id) ?? resolveFoodSync(id)
  if (builtin) return builtin
  if (opts.online && id.startsWith('off:')) {
    const food = await fetchProductByBarcode(id.slice(4), opts.signal)
    if (food) {
      rememberFoods([food])
      return food
    }
  }
  return undefined
}

const barcodeIndexCache = new WeakMap<BuiltinCatalog, Map<string, Food>>()

function builtinBarcodeIndex(cat: BuiltinCatalog): Map<string, Food> {
  let index = barcodeIndexCache.get(cat)
  if (!index) {
    index = new Map()
    for (const f of cat.byId.values()) if (f.barcode) index.set(f.barcode, f)
    barcodeIndexCache.set(cat, index)
  }
  return index
}

/** UPC-A (12 siffror) och EAN-13 med inledande nolla är samma kod. */
function barcodeVariants(code: string): string[] {
  const c = normalizeBarcode(code)
  if (c.length === 12) return [c, `0${c}`]
  if (c.length === 13 && c.startsWith('0')) return [c, c.slice(1)]
  return [c]
}

/** Leta efter en streckkod bland användarens och de inbyggda livsmedlen (utan nätverk). */
export async function findFoodByBarcode(code: string): Promise<Food | undefined> {
  const variants = barcodeVariants(code)
  const state = useFoodStore.getState()
  for (const v of variants) {
    const hit = state.cachedFoods[`off:${v}`] ?? remembered.get(`off:${v}`)
    if (hit) return hit
  }
  const user = allUserFoods(state).find((f) => f.barcode !== undefined && variants.includes(normalizeBarcode(f.barcode)))
  if (user) return user
  const cat = await loadBuiltinCatalog()
  const index = builtinBarcodeIndex(cat)
  for (const v of variants) {
    const hit = index.get(v)
    if (hit) return hit
  }
  return undefined
}

/**
 * Streckkod → livsmedel: först lokalt (egna, sparade, inbyggda), sedan Open Food Facts.
 * Returnerar null om produkten inte finns. Onlineträffar sparas i sessionens minne.
 *
 * @throws OpenFoodFactsError vid ogiltig streckkod eller nätverksfel (se `OFF_MESSAGES`).
 */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<Food | null> {
  const local = await findFoodByBarcode(code)
  if (local) return local
  const food = await fetchProductByBarcode(code, signal)
  if (food) rememberFoods([food])
  return food
}

/**
 * Sök i Open Food Facts och kom ihåg träffarna så att de kan öppnas via id.
 * Anropa vid uttrycklig sökning, inte för varje tangenttryckning.
 */
export async function searchOnlineFoods(query: string, opts: SearchProductsOptions = {}): Promise<Food[]> {
  const foods = await searchProducts(query, opts)
  rememberFoods(foods)
  return foods
}
