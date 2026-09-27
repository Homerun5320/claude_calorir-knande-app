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
 * Den inbyggda katalogen publiceras i två steg: först Lagoms egna livsmedel (snabbt), sedan
 * sammanslaget med Livsmedelsverkets data. Prenumerera med `subscribeBuiltinCatalog` eller
 * använd hookarna i `hooks/useFood.ts`.
 */
import type { Food, Recipe } from '../types'
import { FOOD_CATEGORIES } from '../types'
import { useFoodStore } from '../stores/foodStore'
import { recipeFoodId, recipeToFood } from './recipes'
import { fetchProductByBarcode, normalizeBarcode, searchProducts, type SearchProductsOptions } from './openFoodFacts'

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
  /** Livsmedel för sökning och bläddring (Livsmedelsverkets dubbletter av kurerade Lagom-livsmedel är dolda). */
  foods: Food[]
  /**
   * Alla inbyggda livsmedel per id, även dolda dubbletter – och de inbyggda recepten som
   * livsmedel ('recipe:klassiker-*').
   */
  byId: ReadonlyMap<string, Food>
  /** De svenska klassikerna (inbyggda recept), lösta mot Lagoms livsmedel. Samma lista i båda stegen. */
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

function buildCatalog(
  builtin: Food[],
  lmvFoods: Food[],
  lmv: LmvDatasetMeta | null,
  complete: boolean,
  recipes: Recipe[] = [],
  // Klassikerna som livsmedel: samma objekt som `recipeFood(recipe)` ger, så att en loggad
  // klassiker, sökträffen och detaljsidan pekar på samma livsmedel.
  recipeFoods: Food[] = recipes.map(recipeFood),
): BuiltinCatalog {
  const byId = new Map<string, Food>()
  for (const f of builtin) if (!byId.has(f.id)) byId.set(f.id, f)
  for (const f of recipeFoods) if (!byId.has(f.id)) byId.set(f.id, f)
  if (lmvFoods.length === 0) return { foods: builtin, byId, recipes, recipeFoods, complete, lmv }
  // Kurerade Lagom-livsmedel med känt livsmedelsnummer ersätter Livsmedelsverkets post i sökningen.
  const curated = new Set<number>()
  for (const f of builtin) if (f.lmvNumber !== undefined) curated.add(f.lmvNumber)
  const foods = builtin.slice()
  for (const f of lmvFoods) {
    if (byId.has(f.id)) continue
    byId.set(f.id, f)
    if (f.lmvNumber !== undefined && curated.has(f.lmvNumber)) continue
    foods.push(f)
  }
  return { foods, byId, recipes, recipeFoods, complete, lmv }
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
 * chunkar och publiceras direkt; Livsmedelsverkets fil hämtas parallellt och slås ihop när den är
 * klar. Vid fel publiceras en tom katalog med `error` och nästa anrop försöker igen.
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
    const recipes = (await recipesPromise)?.loadBuiltinRecipes(builtin) ?? []
    const recipeFoods = recipes.map(recipeFood)
    publish(buildCatalog(builtin, [], null, false, recipes, recipeFoods))
    const lmv = await lmvPromise
    const full = buildCatalog(builtin, lmv.foods, lmv.meta, true, recipes, recipeFoods)
    publish(full)
    return full
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

/**
 * Synkront uppslag bland det som redan finns i minnet: användarens livsmedel, den inbyggda
 * katalogen (om den är inläst) och sessionens onlineprodukter.
 */
export function resolveFoodSync(id: string): Food | undefined {
  return findUserFood(useFoodStore.getState(), id) ?? catalog?.byId.get(id) ?? remembered.get(id)
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
  const builtin = cat.byId.get(id) ?? resolveFoodSync(id)
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
