/**
 * Exempeldata: en realistisk svensk vecka (gröt, knäckebröd, köttbullar, ärtsoppa på torsdag,
 * fredagstacos, fika …) så att man kan utforska Lagom utan att först mata in egna uppgifter.
 * Tydligt markerad som exempel och kan rensas i Inställningar.
 */
import type { DiaryEntry, Food, ISODate, MealId, Profile, UnitKey } from '../types'
import { addDays, todayISO, weekdayIndex } from './dates'
import { makeFoodEntry } from './diary'
import { uid } from './id'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useProfileStore } from '../stores/profileStore'
import { useFoodStore, usageFromEntries } from '../stores/foodStore'

export const DEMO_FLAG_KEY = 'lagom-demo'

export const DEMO_PROFILE: Omit<Profile, 'createdAt'> = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1991,
  heightCm: 168,
  startWeightKg: 71.8,
  activityLevel: 'latt',
  goal: 'ga_ner',
  weeklyRateKg: 0.25,
  targetWeightKg: 67,
  lifeStage: 'ingen',
  diet: 'flexitarian',
  macroPreset: 'nnr',
}

/** [livsmedels-id (utan 'lagom:'), antal portioner (första portionen) eller gram med suffix 'g', måltid, tid] */
type Item = [string, number | `${number}g`, MealId, string]

const FRUKOST_A: Item[] = [
  ['havregrynsgrot-mellanmjolk', 1, 'frukost', '07:10'],
  ['lingon-rarorda', '30g', 'frukost', '07:10'],
  ['kaffe-bryggt', 1, 'frukost', '07:15'],
]
const FRUKOST_B: Item[] = [
  ['knackebrod-wasa-husman', 2, 'frukost', '07:05'],
  ['bregott-normalsaltat-75', '8g', 'frukost', '07:05'],
  ['hushallsost-26', '20g', 'frukost', '07:05'],
  ['filmjolk-3', '200g', 'frukost', '07:05'],
  ['musli-osotad', '40g', 'frukost', '07:05'],
  ['kaffe-bryggt', 1, 'frukost', '07:20'],
]
const FIKA: Item[] = [
  ['kanelbulle-bageri', 1, 'fika', '15:00'],
  ['kaffe-med-mjolk', 1, 'fika', '15:00'],
]
const FIKA_LATT: Item[] = [
  ['apple-med-skal', 1, 'fika', '15:10'],
  ['kaffe-bryggt', 1, 'fika', '15:10'],
]

/** Luncher och middagar per veckodag (mån = 0). */
const DAYS: Array<{ lunch: Item[]; middag: Item[]; extra?: Item[] }> = [
  {
    lunch: [['kycklinggryta-gradde-ris', 1, 'lunch', '12:00'], ['sallad-blandad', '60g', 'lunch', '12:00']],
    middag: [['lax-potatis-hollandaise', 1, 'middag', '18:15'], ['broccoli', '80g', 'middag', '18:15']],
  },
  {
    lunch: [['smorgas-agg-kaviar', 2, 'lunch', '12:10'], ['tomatsoppa', 1, 'lunch', '12:10']],
    middag: [['spagetti-kottfarssas', 1, 'middag', '18:00'], ['gurka', '60g', 'middag', '18:00']],
  },
  {
    lunch: [['pasta-pesto', 1, 'lunch', '11:50'], ['sallad-blandad', '50g', 'lunch', '11:50']],
    middag: [['kottbullar-potatismos-grasas-lingon', 1, 'middag', '18:00'], ['gurka', '50g', 'middag', '18:00']],
  },
  {
    // Torsdag: ärtsoppa och pannkakor
    lunch: [['artsoppa-med-flask', 1, 'lunch', '12:00'], ['pannkakor-tunna', 2, 'lunch', '12:15'], ['jordgubbssylt', '30g', 'lunch', '12:15']],
    middag: [['pytt-i-panna-agg-rodbetor', 1, 'middag', '18:30']],
  },
  {
    lunch: [['kycklingwok-ris', 1, 'lunch', '12:00']],
    // Fredagsmys
    middag: [['tacos-fredagstacos', 1, 'middag', '18:30']],
    extra: [['chips-lattsaltade', '40g', 'kvallsmat', '21:00']],
  },
  {
    lunch: [['raksmorgas', 1, 'lunch', '13:00']],
    middag: [['laxpudding-smor', 1, 'middag', '18:00'], ['vin-vitt-torrt', '150g', 'middag', '18:00']],
    extra: [['chokladboll', 1, 'fika', '15:30']],
  },
  {
    lunch: [['smorgas-grovt-ost', 2, 'lunch', '12:30'], ['yoghurt-naturell-3', '150g', 'lunch', '12:30'], ['blabar-skogs', '50g', 'lunch', '12:30']],
    middag: [['kycklingfile-klyftpotatis-tzatziki', 1, 'middag', '18:00'], ['paprika-rod', '60g', 'middag', '18:00']],
  },
]

/** Enkel deterministisk "slump" så att exemplet ser likadant ut varje gång. */
function noise(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453
  return x - Math.floor(x) - 0.5
}

function resolveItem(foods: Map<string, Food>, item: Item, date: ISODate): Omit<DiaryEntry, 'id' | 'createdAt'> | null {
  const [slug, qty, meal, time] = item
  const food = foods.get(`lagom:${slug}`)
  if (!food) return null
  let amount: number
  let unit: UnitKey
  if (typeof qty === 'string') {
    amount = Number.parseFloat(qty)
    unit = 'g'
  } else if (food.portions.length) {
    amount = qty
    unit = `portion:${food.portions[0].id}`
  } else {
    amount = qty * 100
    unit = 'g'
  }
  return makeFoodEntry(food, amount, unit, date, meal, time)
}

/**
 * Fyll appen med exempeldata för de senaste `days` dagarna. Ersätter befintlig data.
 * `now` styr hur mycket av idag som redan är loggat.
 */
export async function seedDemoData(opts: { now?: Date; days?: number } = {}): Promise<void> {
  const now = opts.now ?? new Date()
  const today = todayISO(now)
  const days = opts.days ?? 14
  const { loadBuiltinFoods } = await import('./foodRepo')
  const foods = new Map((await loadBuiltinFoods()).map((f) => [f.id, f]))

  // Profil och inställningar
  useProfileStore.setState((s) => ({
    profile: { ...DEMO_PROFILE, createdAt: now.getTime() - days * 86_400_000 },
    settings: { ...s.settings, onboardingDone: true },
  }))

  // Dagbok
  const entries: Record<ISODate, DiaryEntry[]> = {}
  const water: Record<ISODate, number> = {}
  const exercise: ReturnType<typeof useDiaryStore.getState>['exercise'] = {}
  // Visa alltid minst frukost och lunch för idag, även tidigt på dagen (det är exempeldata).
  const hour = Math.max(12.5, now.getHours() + now.getMinutes() / 60)
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const wd = weekdayIndex(date)
    const plan = DAYS[wd]
    const items: Item[] = [
      ...(i % 2 === 0 ? FRUKOST_A : FRUKOST_B),
      ...plan.lunch,
      ...(wd === 2 || wd === 5 ? FIKA : FIKA_LATT),
      ...plan.middag,
      ...(plan.extra ?? []),
    ]
    const isToday = i === 0
    const list: DiaryEntry[] = []
    let k = 0
    for (const item of items) {
      if (isToday) {
        const [hh, mm] = item[3].split(':').map(Number)
        if (hh + mm / 60 > hour) continue
      }
      const e = resolveItem(foods, item, date)
      if (e) list.push({ ...e, id: uid('e_'), createdAt: now.getTime() - i * 86_400_000 + k++ } as DiaryEntry)
    }
    if (list.length) entries[date] = list
    water[date] = isToday ? Math.min(1500, Math.max(250, Math.round(hour - 6) * 125)) : 1250 + Math.round(noise(i) * 4) * 250
    if (wd === 1 || wd === 3) {
      exercise[date] = [{ id: uid('x_'), date, activityId: 'promenad-rask', name: 'Promenad, rask', minutes: 40, kcal: 180, met: 4.8, createdAt: now.getTime() }]
    } else if (wd === 5) {
      exercise[date] = [{ id: uid('x_'), date, activityId: 'lopning-10', name: 'Löpning 10 km/h (6:00 min/km)', minutes: 35, kcal: 340, met: 9.3, distanceKm: 5.8, createdAt: now.getTime() }]
    }
  }
  const daysMeta = Object.fromEntries(
    Object.keys(entries)
      .filter((d) => d !== today)
      .map((d, idx) => [d, { complete: true, mood: 3 + (idx % 3 === 0 ? 1 : 0), energy: 3 + (idx % 4 === 0 ? 1 : 0) }]),
  )
  useDiaryStore.setState({ entries, water, exercise, days: daysMeta })

  // Vikt: långsam nedgång med vardagligt brus, vägning de flesta morgnar
  const weights = []
  for (let i = 45; i >= 0; i--) {
    if (i % 3 === 1 && i > 3) continue
    const date = addDays(today, -i)
    const kg = Math.round((DEMO_PROFILE.startWeightKg - (45 - i) * 0.035 + noise(i + 3) * 0.9) * 10) / 10
    weights.push({ id: uid('w_'), date, kg, createdAt: now.getTime() })
  }
  useBodyStore.setState({ weights, measurements: [{ id: uid('m_'), date: addDays(today, -30), waistCm: 82, hipCm: 101, createdAt: now.getTime() }, { id: uid('m_'), date: addDays(today, -2), waistCm: 80, hipCm: 100, createdAt: now.getTime() }] })

  // Favoriter och "Senaste" (samma statistik som när man loggar själv)
  useFoodStore.setState({
    favorites: ['lagom:havregrynsgrot-mellanmjolk', 'lagom:knackebrod-wasa-husman', 'lagom:kanelbulle-bageri', 'lagom:kaffe-bryggt'],
    usage: usageFromEntries(entries),
  })

  try {
    localStorage.setItem(DEMO_FLAG_KEY, '1')
  } catch {
    /* lagring kan vara blockerad */
  }
}

/** true om appen just nu visar exempeldata. */
export function isDemoData(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function clearDemoFlag(): void {
  try {
    localStorage.removeItem(DEMO_FLAG_KEY)
  } catch {
    /* ignorera */
  }
}
