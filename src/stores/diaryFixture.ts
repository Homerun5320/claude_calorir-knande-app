/**
 * Påhittade men realistiska dagböcker för testerna av dagbokens lagring och för mätningen
 * (`diaryStorage.bench.test.ts`, `diaryMonthStorage.test.ts`). Ingen testfil – bara hjälp till dem.
 *
 * Datan är byggd som i appen: Lagoms kurerade livsmedel (berikade med Livsmedelsverkets värden,
 * som i katalogen), Livsmedelsverkets poster, produkter från Open Food Facts via `mapOffProduct`,
 * egna recept via `recipeToFood`, egna livsmedel och snabbregistreringar. Posterna skapas med
 * `makeFoodEntry`. Slumpen är deterministisk, så datan blir densamma varje körning.
 *
 * Livsmedlen skickas in (`curated`, `lmv`) – modulen laddar inte själv livsmedelsdatabasen.
 */
import type { DayMeta, DiaryEntry, ExerciseEntry, Food, ISODate, MealId, MealTemplate, MeasurementEntry, Recipe, UnitKey, WeightEntry } from '../types'
import { loadBuiltinRecipes } from '../data/recipes'
import { recipeToFood } from '../lib/recipes'
import { mapOffProduct } from '../lib/openFoodFacts'
import { makeFoodEntry } from '../lib/diary'
import { gramsFor } from '../lib/units'
import { addDays, fromISODate } from '../lib/dates'
import { usageFromEntries, type FoodUsage } from './foodStore'

// ---------------------------------------------------------------------------
// Deterministisk slump
// ---------------------------------------------------------------------------

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const int = (r: Rng, min: number, max: number) => min + Math.floor(r() * (max - min + 1))
export const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)]
/** Index 0..n-1 där de första är vanligast (Zipf, s = 1) – som ett personligt matförråd. */
export function zipf(r: Rng, n: number): number {
  let total = 0
  for (let i = 1; i <= n; i++) total += 1 / i
  let x = r() * total
  for (let i = 1; i <= n; i++) {
    x -= 1 / i
    if (x <= 0) return i - 1
  }
  return n - 1
}
export function shuffled<T>(r: Rng, list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz'
/** Samma form som `uid()` i lib/id.ts: prefix + tid i base36 + 8 slumptecken. */
export const makeId = (r: Rng, prefix: string, time: number) => `${prefix}${time.toString(36)}${Array.from({ length: 8 }, () => B36[Math.floor(r() * 36)]).join('')}`

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

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

/** En tid under dagen `date` nära `time` ("HH:MM"), med några minuters slump. */
export function timeOn(date: ISODate, time: string, r: Rng): number {
  const d = fromISODate(date)
  const [hh, mm] = time.split(':').map(Number)
  d.setHours(hh, mm + int(r, 0, 40), int(r, 0, 59), 0)
  return d.getTime()
}

// ---------------------------------------------------------------------------
// En användare
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Antal dagar med loggning, fram till och med `end`. */
  days: number
  seed: number
  /** Sista dagen i dagboken. */
  end: ISODate
  /** Lagoms kurerade livsmedel (gärna berikade med `enrichCuratedFoods`). */
  curated: readonly Food[]
  /** Livsmedelsverkets poster (valfritt – utan dem används de kurerade). */
  lmv?: readonly Food[]
}

export interface FixtureUser {
  diary: { entries: Record<ISODate, DiaryEntry[]>; water: Record<ISODate, number>; exercise: Record<ISODate, ExerciseEntry[]>; days: Record<ISODate, DayMeta> }
  food: {
    customFoods: Record<string, Food>
    recipes: Record<string, Recipe>
    cachedFoods: Record<string, Food>
    favorites: string[]
    usage: Record<string, FoodUsage>
    templates: MealTemplate[]
  }
  body: { weights: WeightEntry[]; measurements: MeasurementEntry[] }
}

/** En användare som loggat varje dag i `days` dagar fram till `end`. */
export function generateUser(opts: GenerateOptions): FixtureUser {
  const { days, seed, end, curated } = opts
  // Utan Livsmedelsverkets poster används de kurerade (då blir slumpen en annan än i mätningen).
  const lmvFoods = opts.lmv && opts.lmv.length > 0 ? opts.lmv : curated
  const r = mulberry32(seed)
  const start = addDays(end, -(days - 1))
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
      const createdAt = timeOn(date, slot.time, r)
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
      const createdAt = timeOn(date, '17:30', r)
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
    const createdAt = timeOn(date, '07:00', r)
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

/** Några nya poster för `today` – varje skrivning i mätningen lägger till en av dem. */
export function sampleEntries(curated: readonly Food[], today: ISODate, count = 12): DiaryEntry[] {
  const r = mulberry32(99)
  return Array.from({ length: count }, (_, i) => {
    const food = curated[zipf(r, 200)]
    const createdAt = timeOn(today, '12:00', r) + i
    const portion = food.portions[0]
    const draft = portion ? makeFoodEntry(food, 1, `portion:${portion.id}`, today, 'lunch') : makeFoodEntry(food, 150, 'g', today, 'lunch')
    return { ...draft, id: makeId(r, 'e_', createdAt), createdAt }
  })
}
