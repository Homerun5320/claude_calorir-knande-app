/**
 * Mätning av dagbokens lagring – underlaget till docs/LAGRING.md (checklistepunkten
 * "dagbok-en-nyckel"). Ingen kontroll av appens beteende: filen hoppas över i den vanliga
 * testsviten och laddar inget förrän den körs.
 *
 *   LAGOM_MEASURE_STORAGE=1 npx vitest run src/stores/diaryStorage.bench.test.ts
 *
 * Med LAGOM_MEASURE_OUT=<mapp> sparas även dagböckerna (exakt den sträng som butiken skriver till
 * IndexedDB), säkerhetskopiorna och resultaten som JSON. `scripts/measure-diary-storage.mjs` bygger
 * dem själv på det sättet och mäter sedan i Chromium (riktig IndexedDB och CPU-strypning).
 *
 * Datan är påhittad men byggd som i appen: Lagoms kurerade livsmedel (berikade med
 * Livsmedelsverkets värden, som i katalogen), Livsmedelsverkets poster, produkter från Open Food
 * Facts via `mapOffProduct`, egna recept via `recipeToFood`, egna livsmedel och snabbregistreringar.
 * Posterna skapas med `makeFoodEntry` och läggs i `useDiaryStore` med dess riktiga lagring
 * (fake-indexeddb i Node). Slumpen är deterministisk, så datan blir densamma varje körning; bara
 * tiderna varierar. Tiderna här är från Node – de som gäller för telefoner kommer från Chromium.
 */
import { describe, expect, it } from 'vitest'
import type { DayMeta, DiaryEntry, ExerciseEntry, Food, ISODate, MealId, MealTemplate, MeasurementEntry, Recipe, UnitKey, WeightEntry } from '../types'

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const RUN = env.LAGOM_MEASURE_STORAGE === '1'
const OUT = env.LAGOM_MEASURE_OUT?.trim() || undefined

/** Sista dagen i den påhittade dagboken (dagen före "idag" i mätningen). */
const END: ISODate = '2026-09-28'
/** Dagen som de nya posterna i mätningen loggas på. */
const TODAY: ISODate = '2026-09-29'
const YEARS = [1, 2, 3] as const
const RUNS = 7

// Node-moduler laddas dynamiskt (appens tsconfig har inte Node-typerna).
interface NodeFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>
  writeFile(path: string, data: string, encoding: 'utf8'): Promise<void>
  mkdir(path: string, opts: { recursive: boolean }): Promise<unknown>
}
interface NodePath {
  join(...parts: string[]): string
}
interface NodeZlib {
  gzipSync(data: string | Uint8Array): { byteLength: number }
}
const nodeModule = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>
const cwd = (): string => (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? '.'

// ---------------------------------------------------------------------------
// Deterministisk slump
// ---------------------------------------------------------------------------

type Rng = () => number

function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const int = (r: Rng, min: number, max: number) => min + Math.floor(r() * (max - min + 1))
const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)]
/** Index 0..n-1 där de första är vanligast (Zipf, s = 1) – som ett personligt matförråd. */
function zipf(r: Rng, n: number): number {
  let total = 0
  for (let i = 1; i <= n; i++) total += 1 / i
  let x = r() * total
  for (let i = 1; i <= n; i++) {
    x -= 1 / i
    if (x <= 0) return i - 1
  }
  return n - 1
}
function shuffled<T>(r: Rng, list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz'
/** Samma form som `uid()` i lib/id.ts: prefix + tid i base36 + 8 slumptecken. */
const makeId = (r: Rng, prefix: string, time: number) => `${prefix}${time.toString(36)}${Array.from({ length: 8 }, () => B36[Math.floor(r() * 36)]).join('')}`

// ---------------------------------------------------------------------------
// Påhittat innehåll (Open Food Facts-produkter, egna livsmedel, anteckningar)
// ---------------------------------------------------------------------------

const OFF_NAMES = [
  'Havregurt naturell', 'Proteinbar choklad & jordnöt', 'Knäckebröd råg', 'Kvarg vanilj', 'Müsli med bär och nötter', 'Havredryck barista',
  'Hummus original', 'Fiskpinnar', 'Vegobullar', 'Energidryck sockerfri', 'Mörk choklad 70 %', 'Fullkornspasta penne', 'Grekisk yoghurt 10 %',
  'Frukostflingor fullkorn', 'Linssoppa med tomat', 'Proteinpudding choklad', 'Laxfilé naturell', 'Tortillabröd fullkorn', 'Pesto genovese',
  'Nötmix osaltad', 'Glass vanilj', 'Mineralvatten citron', 'Chips havssalt', 'Kycklingkorv', 'Ris- och majskakor',
]
const OFF_BRANDS = ['Oatly', 'Arla', 'Wasa', 'Felix', 'Findus', 'Pågen', 'Risenta', 'Garant', 'ICA', 'Coop', 'Estrella', 'Marabou', 'Semper', 'Skånemejerier', 'Barilla']
const OFF_CATEGORIES = [
  ['en:dairies', 'en:yogurts'], ['en:snacks', 'en:protein-bars'], ['en:cereals-and-potatoes', 'en:breads', 'en:crispbreads'], ['en:plant-based-milk-alternatives', 'en:oat-based-drinks'],
  ['en:spreads', 'en:hummus'], ['en:frozen-foods', 'en:fish-sticks'], ['en:meat-alternatives'], ['en:energy-drinks'], ['en:chocolates', 'en:dark-chocolates'], ['en:pastas'],
  ['en:breakfast-cereals'], ['en:soups'], ['en:desserts'], ['en:fishes'], ['en:sauces', 'en:pestos'], ['en:nuts'], ['en:ice-creams'], ['en:waters'], ['en:chips-and-fries'], ['en:sausages'],
]
const INGREDIENTS = [
  'vatten', 'havre (10 %)', 'rapsolja', 'socker', 'salt', 'MJÖLK', 'VETEMJÖL', 'emulgeringsmedel (solroslecitin)', 'surhetsreglerande medel (kaliumfosfater)',
  'kalciumkarbonat', 'vitaminer (D2, riboflavin, B12)', 'jäst', 'arom', 'stabiliseringsmedel (pektin)', 'kakao', 'havssalt', 'förtjockningsmedel (guarkärnmjöl)',
  'naturlig vaniljarom', 'fullkornsrågmjöl (60 %)', 'VETEGLUTEN', 'JORDNÖTTER (15 %)', 'mjölkproteinkoncentrat', 'glukossirap', 'kakaosmör', 'HASSELNÖTTER',
  'tomat (35 %)', 'röda linser', 'lök', 'vitlök', 'kryddor', 'citronsaft', 'ÄGG', 'SOJAPROTEIN', 'ärtprotein', 'fiberrik havrekli', 'druvsocker', 'kokosfett',
  'mjölksyrabakterier', 'LAX (98 %)', 'potatisstärkelse', 'basilika (30 %)', 'CASHEWNÖTTER', 'parmesanost (MJÖLK)', 'olivolja', 'svartpeppar', 'sötningsmedel (sukralos)',
]
const ALLERGEN_TAGS = ['en:milk', 'en:gluten', 'en:nuts', 'en:peanuts', 'en:eggs', 'en:soybeans', 'en:fish', 'en:sesame-seeds']
const LABEL_TAGS = ['en:keyhole', 'en:organic', 'en:krav', 'sv:fran-sverige', 'en:vegan', 'en:gluten-free', 'en:lactose-free', 'en:whole-grain']
const QUANTITIES = ['500 g', '1 l', '4 x 125 g', '330 ml', '200 g', '1,5 l', '60 g', '400 g', '250 g', '6 x 40 g']
const CUSTOM_NAMES = [
  'Mormors köttsoppa', 'Jobbets sallad', 'Pappas pannkakor', 'Hemmagjord granola', 'Proteinshake med banan', 'Grönsakssoppa (egen)', 'Lunchlåda kyckling och ris',
  'Kanelbullar (hembakade)', 'Overnight oats', 'Kycklinggryta (matlåda)', 'Smoothie bär', 'Tacos (fredag)',
]
const QUICK_NAMES = ['Lunch på jobbet', 'Middag hos vänner', 'Restaurang', 'Glass', 'Kaffe med mjölk', 'Smakbitar', 'Buffé', 'Frukost på hotellet', 'Fika på stan', 'Snabbmat']
const ENTRY_NOTES = ['Halv portion', 'Med extra sås', 'Delade med barnen', 'Hemlagad', 'På tåget', 'Åt ute', 'Rester från igår', 'Uppskattat']
const DAY_NOTES = [
  'Sov dåligt men kändes okej ändå.', 'Lång promenad med hunden efter jobbet, skönt väder.', 'Stressig dag på jobbet – åt snabbt till lunch.',
  'Middag hos mamma, svårt att väga allt så jag uppskattade.', 'Kände mig pigg hela dagen. Mer grönsaker till lunch funkade bra.',
  'Fika på jobbet, någon fyllde år.', 'Tränade på morgonen och var hungrig hela eftermiddagen.', 'Lugn söndag, lagade mat för hela veckan.',
]
const ACTIVITIES = [
  { activityId: 'promenad-rask', name: 'Promenad, rask', met: 4.8, km: 5.5 },
  { activityId: 'lopning-10', name: 'Löpning 10 km/h (6:00 min/km)', met: 9.3, km: 10 },
  { activityId: 'cykling-mattlig', name: 'Cykling, måttlig', met: 6.8, km: 18 },
  { activityId: 'styrketraning', name: 'Styrketräning', met: 5, km: 0 },
  { activityId: 'yoga', name: 'Yoga', met: 2.5, km: 0 },
] as const

/** Måltiderna en dag i ordning; en dag med n poster använder de n första. */
const SLOTS: ReadonlyArray<readonly [MealId, string]> = [
  ['frukost', '07:15'], ['frukost', '07:15'], ['lunch', '12:00'], ['middag', '18:00'], ['middag', '18:00'], ['fika', '15:00'], ['lunch', '12:00'], ['kvallsmat', '21:00'],
]

function ingredientText(r: Rng): string {
  const target = int(r, 120, 600)
  const parts: string[] = []
  let len = 0
  while (len < target) {
    const p = pick(r, INGREDIENTS)
    parts.push(p)
    len += p.length + 2
  }
  return parts.join(', ')
}

// ---------------------------------------------------------------------------
// Mätverktyg
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function timeSync(fn: () => unknown, runs = RUNS): number {
  const out: number[] = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    fn()
    out.push(performance.now() - t0)
  }
  return round(median(out))
}

async function timeAsync(fn: () => Promise<unknown>, runs = RUNS): Promise<number> {
  const out: number[] = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    await fn()
    out.push(performance.now() - t0)
  }
  return round(median(out))
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const utf8 = (s: string) => new TextEncoder().encode(s).byteLength
/** V8 lagrar en sträng med två byte per tecken så fort ett tecken ligger över U+00FF (t.ex. "–"). */
function twoByte(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0xff) return true
  return false
}
const kb = (bytes: number) => round(bytes / 1024, 0)
const mb = (bytes: number) => round(bytes / 1024 / 1024, 2)

// ---------------------------------------------------------------------------
// Mätningen
// ---------------------------------------------------------------------------

describe.skipIf(!RUN)('dagbokens lagring (mätning till docs/LAGRING.md)', () => {
  it('mäter storlek, tolkning och skrivning för 1, 2 och 3 års dagbok', async () => {
    const fs = await nodeModule<NodeFs>('node:fs/promises')
    const path = await nodeModule<NodePath>('node:path')
    const zlib = await nodeModule<NodeZlib>('node:zlib')
    const { BUILTIN_FOODS } = await import('../data/foods/index')
    const { enrichCuratedFoods } = await import('../lib/foodRepo')
    const { loadBuiltinRecipes } = await import('../data/recipes')
    const { recipeToFood } = await import('../lib/recipes')
    const { mapOffProduct } = await import('../lib/openFoodFacts')
    const { makeFoodEntry } = await import('../lib/diary')
    const { gramsFor } = await import('../lib/units')
    const { addDays, fromISODate } = await import('../lib/dates')
    const { useDiaryStore } = await import('./diaryStore')
    const { useFoodStore, usageFromEntries } = await import('./foodStore')
    const { useBodyStore } = await import('./bodyStore')
    const storage = await import('./storage')
    const { createBackup, parseBackup } = await import('../lib/backup')
    const { demoFoodIds } = await import('../lib/demo')
    const idb = await import('idb-keyval')

    const lmvText = await fs.readFile(path.join(cwd(), 'public', 'data', 'livsmedelsverket.json'), 'utf8')
    const lmvFoods = (JSON.parse(lmvText) as { foods: Food[] }).foods
    const curated = enrichCuratedFoods(BUILTIN_FOODS, lmvFoods)
    // Kalibrering: hur stor är en ögonblicksbild i genomsnitt – hela databasen och exempeldatans
    // vardagsmat – jämfört med det påhittade förrådet nedan?
    const avgChars = (foods: readonly Food[]) => Math.round(foods.reduce((s, f) => s + JSON.stringify(f).length, 0) / Math.max(1, foods.length))
    const curatedById = new Map(curated.map((f) => [f.id, f]))
    const demoFoods = demoFoodIds().flatMap((id) => curatedById.get(id) ?? [])
    const calibration = { allCurated: avgChars(curated), demoFoods: avgChars(demoFoods), demoFoodCount: demoFoods.length, lmv: avgChars(lmvFoods) }

    const at = (date: ISODate, time: string, r: Rng) => {
      const d = fromISODate(date)
      const [hh, mm] = time.split(':').map(Number)
      d.setHours(hh, mm + int(r, 0, 40), int(r, 0, 59), 0)
      return d.getTime()
    }

    /** En användare som loggat varje dag i `days` dagar fram till END. */
    function generate(days: number, seed: number) {
      const r = mulberry32(seed)
      const start = addDays(END, -(days - 1))
      const startTime = fromISODate(start).getTime()

      // Ett personligt förråd: ~150 kurerade livsmedel, där ett trettiotal står för det mesta.
      const repertoire = shuffled(r, curated).slice(0, 150)
      const lmvPicks = shuffled(r, lmvFoods).slice(0, 15)

      // Skannade produkter: en ny ungefär var 25:e dag.
      const offCount = Math.max(6, Math.round(days / 25))
      const offFoods: Food[] = []
      for (let k = 0; k < offCount; k++) {
        const cats = pick(r, OFF_CATEGORIES)
        const kcal = int(r, 20, 550)
        const food = mapOffProduct({
          code: String(7310000000000 + k * 7919 + seed),
          product_name_sv: `${pick(r, OFF_NAMES)}${k >= OFF_NAMES.length ? ` ${k}` : ''}`,
          brands: pick(r, OFF_BRANDS),
          quantity: pick(r, QUANTITIES),
          serving_size: r() < 0.6 ? '30 g' : undefined,
          serving_quantity: r() < 0.6 ? 30 : undefined,
          nutriments: {
            'energy-kcal_100g': kcal,
            proteins_100g: round(r() * 25),
            carbohydrates_100g: round(r() * 60),
            sugars_100g: round(r() * 20),
            fat_100g: round(r() * 30),
            'saturated-fat_100g': round(r() * 10),
            fiber_100g: round(r() * 8),
            salt_100g: round(r() * 2, 2),
          },
          nutriscore_grade: pick(r, ['a', 'b', 'c', 'd', 'e']),
          nova_group: int(r, 1, 4),
          ingredients_text_sv: ingredientText(r),
          allergens_tags: shuffled(r, ALLERGEN_TAGS).slice(0, int(r, 0, 3)),
          traces_tags: shuffled(r, ALLERGEN_TAGS).slice(0, int(r, 0, 2)),
          labels_tags: shuffled(r, LABEL_TAGS).slice(0, int(r, 0, 2)),
          categories_tags: cats,
          image_front_small_url: `https://images.openfoodfacts.org/images/products/731/000/${String(k).padStart(3, '0')}/${seed}/front_sv.${int(r, 3, 40)}.200.jpg`,
          origins: r() < 0.3 ? 'Sverige' : undefined,
        })
        if (food) offFoods.push(food)
      }

      // Egna livsmedel och egna recept (kopior av inbyggda klassiker).
      const customFoods: Record<string, Food> = {}
      for (const name of CUSTOM_NAMES.slice(0, 10)) {
        const created = startTime + int(r, 0, days - 1) * 86_400_000
        const food: Food = {
          id: makeId(r, 'custom:', created),
          name,
          source: 'custom',
          category: pick(r, ['fardigratt', 'brod', 'mejeri', 'ovrigt'] as const),
          nutrients: { kcal: int(r, 60, 400), protein: round(r() * 20), carbs: round(r() * 40), fat: round(r() * 20), fiber: round(r() * 6), salt: round(r() * 1.5, 2) },
          portions: [{ id: 'portion', label: '1 portion', grams: int(r, 150, 450) }],
          createdAt: created,
          updatedAt: created,
        }
        if (r() < 0.4) food.note = 'Uppskattat från receptet på förpackningen.'
        customFoods[food.id] = food
      }
      const recipes: Record<string, Recipe> = {}
      for (const base of shuffled(r, loadBuiltinRecipes(curated)).slice(0, 8)) {
        const created = startTime + int(r, 0, days - 1) * 86_400_000
        const recipe: Recipe = { ...base, id: makeId(r, 'r_', created), name: `${base.name} (min variant)`, builtin: undefined, createdAt: created, updatedAt: created }
        recipes[recipe.id] = recipe
      }
      const recipeFoods = Object.values(recipes).map(recipeToFood)
      const customList = Object.values(customFoods)

      const amountFor = (food: Food): { amount: number; unit: UnitKey } => {
        if (food.portions.length > 0 && r() < 0.65) {
          const p = food.portions[zipf(r, food.portions.length)]
          return { amount: pick(r, [1, 1, 1, 2, 0.5, 1.5]), unit: `portion:${p.id}` }
        }
        if (food.rawWeight && r() < 0.15) return { amount: 5 * int(r, 12, 40), unit: 'g-ra' }
        if ((food.liquid || food.density) && r() < 0.4) return { amount: pick(r, [1, 1.5, 2, 2.5, 3]), unit: 'dl' }
        return { amount: 5 * int(r, 4, 60), unit: 'g' }
      }

      const entries: Record<ISODate, DiaryEntry[]> = {}
      const water: Record<ISODate, number> = {}
      const exercise: Record<ISODate, ExerciseEntry[]> = {}
      const dayMeta: Record<ISODate, DayMeta> = {}
      const usedOff = new Set<string>()

      for (let i = 0; i < days; i++) {
        const date = addDays(start, i)
        const n = int(r, 5, 8)
        const list: DiaryEntry[] = []
        // Produkter som redan har skannats (en ny ungefär var 25:e dag).
        const offAvailable = Math.min(offFoods.length, 1 + Math.floor((i / days) * offFoods.length))
        const slots = SLOTS.slice(0, n)
          .map((s, k) => ({ meal: s[0], time: s[1], k }))
          .sort((a, b) => a.time.localeCompare(b.time) || a.k - b.k)
        for (const slot of slots) {
          const createdAt = at(date, slot.time, r)
          const time = r() < 0.25 ? slot.time : undefined
          const x = r()
          if (x < 0.05) {
            const kcal = int(r, 60, 900)
            const nutrients = r() < 0.5 ? { kcal } : { kcal, protein: round(kcal * 0.05), carbs: round(kcal * 0.1), fat: round(kcal * 0.04) }
            list.push({ kind: 'quick', id: makeId(r, 'e_', createdAt), createdAt, date, meal: slot.meal, name: pick(r, QUICK_NAMES), nutrients, ...(time ? { time } : {}) })
            continue
          }
          let food: Food
          if (x < 0.8) food = repertoire[zipf(r, repertoire.length)]
          else if (x < 0.9) food = offFoods[zipf(r, offAvailable)]
          else if (x < 0.95) food = recipeFoods[zipf(r, recipeFoods.length)]
          else if (x < 0.98) food = customList[zipf(r, customList.length)]
          else food = lmvPicks[zipf(r, lmvPicks.length)]
          if (food.source === 'openfoodfacts') usedOff.add(food.id)
          let { amount, unit } = amountFor(food)
          const g = gramsFor(food, amount, unit)
          if (!Number.isFinite(g) || g <= 0) ({ amount, unit } = { amount: 5 * int(r, 4, 60), unit: 'g' })
          const draft = makeFoodEntry(food, amount, unit, date, slot.meal, time)
          const entry: DiaryEntry = { ...draft, id: makeId(r, 'e_', createdAt), createdAt }
          if (r() < 0.03) entry.note = pick(r, ENTRY_NOTES)
          list.push(entry)
        }
        entries[date] = list

        if (r() < 0.85) water[date] = 250 * int(r, 3, 10)
        if (r() < 0.35) {
          const a = pick(r, ACTIVITIES)
          const minutes = 5 * int(r, 4, 18)
          const createdAt = at(date, '17:30', r)
          const x: ExerciseEntry = { id: makeId(r, 'x_', createdAt), date, activityId: a.activityId, name: a.name, minutes, kcal: Math.round(a.met * 75 * (minutes / 60)), met: a.met, createdAt }
          if (a.km > 0) x.distanceKm = round((a.km * minutes) / 60, 2)
          if (r() < 0.05) x.note = 'Med kollegorna'
          exercise[date] = [x]
        }
        const meta: DayMeta = {}
        if (r() < 0.6) meta.steps = int(r, 2500, 16000)
        if (r() < 0.5) meta.complete = true
        if (r() < 0.2) {
          meta.mood = int(r, 1, 5)
          meta.energy = int(r, 1, 5)
          meta.hunger = int(r, 1, 5)
        }
        if (r() < 0.1) meta.sleepHours = pick(r, [6, 6.5, 7, 7.5, 8, 8.5])
        if (r() < 0.08) meta.note = pick(r, DAY_NOTES)
        if (Object.keys(meta).length > 0) dayMeta[date] = meta
      }

      // Kroppen: vägning varannan dag, mått en gång i månaden.
      const weights: WeightEntry[] = []
      const measurements: MeasurementEntry[] = []
      for (let i = 0; i < days; i += 2) {
        const date = addDays(start, i)
        const createdAt = at(date, '07:00', r)
        weights.push({ id: makeId(r, 'w_', createdAt), date, kg: round(82 - i * 0.004 + (r() - 0.5) * 1.2), createdAt })
        if (i % 30 === 0) measurements.push({ id: makeId(r, 'm_', createdAt), date, waistCm: int(r, 80, 95), hipCm: int(r, 95, 110), createdAt })
      }

      // Livsmedelsbutiken: cache för skannade produkter, favoriter, statistik och sparade måltider.
      const cachedFoods = Object.fromEntries(offFoods.filter((f) => usedOff.has(f.id)).map((f) => [f.id, f]))
      const favorites = repertoire.slice(0, 20).map((f) => f.id)
      const templates: MealTemplate[] = []
      for (let t = 0; t < 5; t++) {
        const createdAt = startTime + int(r, 0, days - 1) * 86_400_000
        const items = Array.from({ length: int(r, 2, 4) }, () => {
          const f = repertoire[zipf(r, 40)]
          const { amount, unit } = amountFor(f)
          return { food: f, amount, unit, grams: gramsFor(f, amount, unit) || 100 }
        })
        templates.push({ id: makeId(r, 't_', createdAt), name: `Min frukost ${t + 1}`, meal: 'frukost', items, createdAt })
      }

      return {
        diary: { entries, water, exercise, days: dayMeta },
        food: { customFoods, recipes, cachedFoods, favorites, usage: usageFromEntries(entries), templates },
        body: { weights, measurements },
      }
    }

    /** Några nya poster för "idag" – varje skrivning i mätningen lägger till en av dem. */
    function samples(): DiaryEntry[] {
      const r = mulberry32(99)
      return Array.from({ length: 12 }, (_, i) => {
        const food = curated[zipf(r, 200)]
        const createdAt = at(TODAY, '12:00', r) + i
        const portion = food.portions[0]
        const draft = portion ? makeFoodEntry(food, 1, `portion:${portion.id}`, TODAY, 'lunch') : makeFoodEntry(food, 150, 'g', TODAY, 'lunch')
        return { ...draft, id: makeId(r, 'e_', createdAt), createdAt }
      })
    }

    const diaryKey = storage.STORE_KEYS.diary
    const version = storage.PERSIST_VERSIONS[diaryKey]
    const persistedOf = () => JSON.stringify({ state: useDiaryStore.getState(), version })
    const setStateAsync = (patch: Partial<ReturnType<typeof useDiaryStore.getState>>) =>
      // persist-mellanvaran returnerar skrivningens löfte (typerna säger void).
      useDiaryStore.setState(patch) as unknown as Promise<void>

    const newEntries = samples()
    const results: Record<string, unknown>[] = []
    if (OUT) await fs.mkdir(OUT, { recursive: true })

    for (const years of YEARS) {
      const days = Math.round(years * 365.25)
      const data = generate(days, 20260929 + years)

      // Tom butik med riktig lagring (fake-indexeddb): läs in (inget sparat) och skriv sedan allt.
      storage.resetStorageStateForTests()
      await idb.clear()
      await useDiaryStore.persist.rehydrate()
      await useFoodStore.persist.rehydrate()
      await useBodyStore.persist.rehydrate()
      await setStateAsync(data.diary)
      useFoodStore.setState(data.food)
      useBodyStore.setState(data.body)

      const text = persistedOf()
      // Samma sträng som butiken själv skrev till IndexedDB.
      expect(await idb.get(diaryKey)).toBe(text)
      expect(storage.isMemoryOnlyStorage()).toBe(false)

      const entryLists = Object.values(data.diary.entries)
      const entryCount = entryLists.reduce((s, l) => s + l.length, 0)
      const foodEntries = entryLists.flat().filter((e) => e.kind === 'food')

      // Vad består dagboken av? Ögonblicksbilderna av livsmedlen jämfört med resten.
      let snapshotChars = 0
      const fieldChars: Record<string, number> = {}
      const unique = new Map<string, string>()
      for (const e of foodEntries) {
        const json = JSON.stringify(e.food)
        snapshotChars += json.length
        unique.set(json, e.food.id)
        for (const [k, v] of Object.entries(e.food)) {
          if (v !== undefined) fieldChars[k] = (fieldChars[k] ?? 0) + JSON.stringify(v).length + k.length + 4
        }
      }
      const uniqueChars = [...unique.keys()].reduce((s, j) => s + j.length, 0)
      const bySource: Record<string, { n: number; chars: number }> = {}
      for (const e of foodEntries) {
        const b = (bySource[e.food.source] ??= { n: 0, chars: 0 })
        b.n++
        b.chars += JSON.stringify(e.food).length
      }
      const avgBySource = Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, { entries: v.n, avgChars: Math.round(v.chars / v.n) }]))
      // Om varje post bara pekade på en ögonblicksbild ({"ref":"<id>#<n>"}) som sparas en gång.
      const refChars = foodEntries.reduce((s, e) => s + `{"ref":"${e.food.id}#1"}`.length, 0)
      const dedupedChars = text.length - snapshotChars + refChars + uniqueChars

      const month = END.slice(0, 7)
      const inMonth = <T>(rec: Record<ISODate, T>) => Object.fromEntries(Object.entries(rec).filter(([d]) => d.startsWith(month)))
      const monthObj = { entries: inMonth(data.diary.entries), water: inMonth(data.diary.water), exercise: inMonth(data.diary.exercise), days: inMonth(data.diary.days) }
      const monthText = JSON.stringify({ state: monthObj, version })

      // Tider i Node (V8 på byggdatorn – se Chromium-mätningen för telefoner).
      const obj = JSON.parse(text) as unknown
      const stringifyMs = timeSync(() => JSON.stringify(obj))
      const parseMs = timeSync(() => JSON.parse(text))
      const monthStringifyMs = timeSync(() => JSON.stringify({ state: monthObj, version }))

      // Start: läs in dagboken från IndexedDB (tolka hela strängen). Efteråt består butiken av
      // tolkade objekt, precis som i appen efter en start.
      const hydrateMs = await timeAsync(async () => {
        await useDiaryStore.persist.rehydrate()
      }, 5)

      // En loggning genom butiken: set() → JSON.stringify av hela dagboken → IndexedDB.
      const syncMs: number[] = []
      const totalMs: number[] = []
      for (let i = 0; i < RUNS; i++) {
        const entry = newEntries[i]
        const cur = useDiaryStore.getState().entries
        const t0 = performance.now()
        const p = setStateAsync({ entries: { ...cur, [TODAY]: [...(cur[TODAY] ?? []), entry] } })
        syncMs.push(performance.now() - t0)
        await p
        totalMs.push(performance.now() - t0)
      }
      expect(storage.isMemoryOnlyStorage()).toBe(false)
      await useDiaryStore.persist.rehydrate()
      expect(useDiaryStore.getState().entries[TODAY]).toHaveLength(RUNS)
      // Ta bort mätposterna igen (utan att mäta skrivningen).
      const { [TODAY]: _added, ...withoutToday } = useDiaryStore.getState().entries
      await setStateAsync({ entries: withoutToday })

      // Säkerhetskopian och speglingen (samma innehåll: createBackup).
      const backup = createBackup()
      const backupCompact = JSON.stringify(backup)
      const backupExport = JSON.stringify(backup, null, 1)
      // Android: Capacitor skickar anropet som JSON (win.androidBridge.postMessage(JSON.stringify(data))).
      const envelope = () => JSON.stringify({ callbackId: '12345678', pluginId: 'Filesystem', methodName: 'writeFile', options: { path: 'lagom-spegling.tmp', data: backupCompact, directory: 'DATA', encoding: 'utf8', recursive: true } })
      const envelopeText = envelope()
      const mirrorMs = timeSync(() => JSON.stringify(createBackup()), 5)
      const exportMs = timeSync(() => JSON.stringify(createBackup(), null, 1), 5)
      const envelopeMs = timeSync(envelope, 5)
      const parseBackupMs = timeSync(() => parseBackup(backupCompact), 3)
      const foodText = JSON.stringify({ state: useFoodStore.getState(), version: storage.PERSIST_VERSIONS[storage.STORE_KEYS.food] })

      const result = {
        years,
        days,
        entries: entryCount,
        foodEntries: foodEntries.length,
        uniqueSnapshots: unique.size,
        avgSnapshotChars: Math.round(snapshotChars / foodEntries.length),
        avgBySource,
        calibration,
        diary: { chars: text.length, utf8: utf8(text), twoByte: twoByte(text), gzip: zlib.gzipSync(text).byteLength, perDay: Math.round(utf8(text) / days), perEntry: Math.round(utf8(text) / entryCount) },
        snapshots: { chars: snapshotChars, share: round(snapshotChars / text.length, 3), fields: Object.fromEntries(Object.entries(fieldChars).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, round(v / text.length, 3)])) },
        deduped: { chars: dedupedChars, share: round(dedupedChars / text.length, 3) },
        month: { month, chars: monthText.length, utf8: utf8(monthText), stringifyMs: monthStringifyMs },
        foodStore: { chars: foodText.length, utf8: utf8(foodText) },
        backup: { compactUtf8: utf8(backupCompact), exportUtf8: utf8(backupExport), envelopeChars: envelopeText.length, gzip: zlib.gzipSync(backupCompact).byteLength },
        node: {
          stringifyMs,
          parseMs,
          writeSyncMs: round(median(syncMs)),
          writeTotalMs: round(median(totalMs)),
          hydrateMs,
          mirrorMs,
          exportMs,
          envelopeMs,
          parseBackupMs,
        },
      }
      results.push(result)

      console.log(
        `\n${years} år (${days} dagar, ${entryCount} poster, ${unique.size} olika ögonblicksbilder)\n` +
          `  dagboken: ${mb(result.diary.utf8)} MB (${result.diary.perDay} B/dag, ${result.diary.perEntry} B/post, gzip ${mb(result.diary.gzip)} MB, tvåbytessträng: ${result.diary.twoByte ? 'ja' : 'nej'})\n` +
          `  ögonblicksbilder: ${Math.round(result.snapshots.share * 100)} % av dagboken, i snitt ${result.avgSnapshotChars} tecken (hela databasen ${calibration.allCurated}, exempeldatans vardagsmat ${calibration.demoFoods}); utan dubbletter ${mb(dedupedChars)} MB\n` +
          `  fält: ${Object.entries(result.snapshots.fields).slice(0, 8).map(([k, v]) => `${k} ${Math.round(v * 100)} %`).join(', ')}\n` +
          `  månad ${month}: ${kb(result.month.utf8)} kB · livsmedelsbutiken: ${kb(result.foodStore.utf8)} kB\n` +
          `  säkerhetskopia: ${mb(result.backup.compactUtf8)} MB kompakt (spegling), ${mb(result.backup.exportUtf8)} MB export, gzip ${mb(result.backup.gzip)} MB\n` +
          `  Node: stringify ${stringifyMs} ms, parse ${parseMs} ms, skrivning ${result.node.writeSyncMs} ms synkront / ${result.node.writeTotalMs} ms klart, inläsning ${hydrateMs} ms\n` +
          `        spegling ${mirrorMs} ms (+ Android-bryggan ${envelopeMs} ms), export ${exportMs} ms, parseBackup ${parseBackupMs} ms`,
      )

      if (OUT) {
        await fs.writeFile(path.join(OUT, `diary-${years}y.json`), text, 'utf8')
        await fs.writeFile(path.join(OUT, `month-${years}y.json`), monthText, 'utf8')
        await fs.writeFile(path.join(OUT, `backup-${years}y.json`), backupCompact, 'utf8')
      }
    }

    if (OUT) {
      await fs.writeFile(path.join(OUT, 'samples.json'), JSON.stringify({ today: TODAY, entries: newEntries }), 'utf8')
      await fs.writeFile(path.join(OUT, 'node-results.json'), JSON.stringify(results, null, 2), 'utf8')
    }
    storage.resetStorageStateForTests()
    await idb.clear()
  }, 600_000)
})
