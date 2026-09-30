/**
 * Energiförbrukning vid träning och vardagsrörelse.
 *
 * Nettoprincipen – varför vi drar bort 1 MET
 * ------------------------------------------
 * Dagens energimål (BMR × PAL i `energy.ts`) innehåller redan den energi kroppen gör av med i vila,
 * även under den tid man tränar. Ett MET-värde beskriver den *totala* förbrukningen, inklusive
 * vilan (1 MET). Om hela MET-värdet räknades som "extra" skulle vilan räknas två gånger, och
 * träningskalorierna bli för höga – ett vanligt problem i kaloriappar. Lagom räknar därför
 * nettoförbrukningen:
 *
 *   nettokcal = (MET − 1) × kcal per MET-timme × timmar
 *
 * där en MET-timme är ≈ 1 kcal per kg kroppsvikt (standarddefinitionen 3,5 ml O₂/kg/min). Om man
 * känner sin egen vilometabolism (t.ex. BMR från Mifflin–St Jeor i `energy.ts`) kan den användas i
 * stället – det motsvarar kompendiets "korrigerade MET" och ger bättre träffsäkerhet för personer
 * vars vilometabolism avviker från standardvärdet (ofta kvinnor, äldre och personer med högre vikt).
 *
 * Steg och PAL
 * ------------
 * PAL-nivån i profilen omfattar redan vardagens vanliga rörelse. Loggade steg bör därför helst
 * räknas *utöver* en baslinje för aktivitetsnivån (se `STEP_BASELINE` och `stepsKcalAboveBaseline`),
 * annars räknas vardagspromenaderna två gånger.
 *
 * "Promenadminuter"
 * -----------------
 * `minutesForKcal` och `activityEquivalents` omvandlar energi till aktivitetsminuter, t.ex.
 * "En kanelbulle ≈ 45 min rask promenad". Det är tänkt som en neutral, frivillig jämförelse som
 * användaren själv slår på – aldrig som en uppmaning att "bränna bort" mat.
 */
import type { ActivityLevel, ExerciseEntry } from '../types'
import { ACTIVITIES, getActivity, type Activity } from '../data/activities'
import { formatDuration } from './format'

// ---------------------------------------------------------------------------
// Grundformler
// ---------------------------------------------------------------------------

/** kcal per kg och timme vid 1 MET (standarddefinition). */
export const KCAL_PER_KG_PER_MET_HOUR = 1

/** kcal per MET-timme – personligt om vilometabolismen är känd, annars kroppsvikten. */
function kcalPerMetHour(weightKg: number, restingKcalPerDay?: number): number {
  if (restingKcalPerDay !== undefined && Number.isFinite(restingKcalPerDay) && restingKcalPerDay > 0) {
    return restingKcalPerDay / 24
  }
  return Math.max(0, weightKg) * KCAL_PER_KG_PER_MET_HOUR
}

/**
 * Nettoförbrukning i kcal utöver vila: (MET − 1) × vikt × timmar.
 * @param met MET-värde för aktiviteten (värden ≤ 1 ger 0)
 * @param weightKg kroppsvikt i kg
 * @param minutes aktiv tid i minuter
 * @param restingKcalPerDay valfri personlig vilometabolism (kcal/dygn, t.ex. BMR) i stället för standard-MET
 * @returns kcal (ej avrundat, aldrig negativt)
 */
export function exerciseKcal(met: number, weightKg: number, minutes: number, restingKcalPerDay?: number): number {
  if (!Number.isFinite(met) || !Number.isFinite(weightKg) || !Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.max(0, met - 1) * kcalPerMetHour(weightKg, restingKcalPerDay) * (minutes / 60)
}

/**
 * Minuter av en aktivitet som motsvarar en viss energimängd (netto).
 * Returnerar `Infinity` för aktiviteter på ≤ 1 MET och 0 för 0 kcal.
 */
export function minutesForKcal(kcal: number, met: number, weightKg: number, restingKcalPerDay?: number): number {
  if (!Number.isFinite(kcal) || kcal <= 0) return 0
  const perMinute = (Math.max(0, met - 1) * kcalPerMetHour(weightKg, restingKcalPerDay)) / 60
  return perMinute > 0 ? kcal / perMinute : Number.POSITIVE_INFINITY
}

// ---------------------------------------------------------------------------
// Intensitet (FYSS/WHO)
// ---------------------------------------------------------------------------

export type Intensity = 'lätt' | 'måttlig' | 'hög'

/** Intensitet enligt WHO/FYSS: lätt < 3 MET, måttlig 3–5,9 MET, hög ≥ 6 MET. */
export function metIntensity(met: number): Intensity {
  if (met >= 6) return 'hög'
  if (met >= 3) return 'måttlig'
  return 'lätt'
}

/** WHO och Folkhälsomyndigheten: minst 150 minuter måttlig (eller 75 minuter hög) intensitet per vecka. */
export const WEEKLY_ACTIVE_MINUTES_GOAL = 150

/**
 * Aktiva minuter omräknade till måttlig intensitet: minuter med hög intensitet räknas dubbelt,
 * lätt intensitet räknas inte. Poster utan MET-värde slås upp via `activityId`.
 */
export function moderateEquivalentMinutes(entries: ReadonlyArray<Pick<ExerciseEntry, 'minutes' | 'met' | 'activityId'>>): number {
  let total = 0
  for (const e of entries) {
    const met = e.met ?? getActivity(e.activityId)?.met
    if (met === undefined || !(e.minutes > 0)) continue
    const intensity = metIntensity(met)
    if (intensity === 'hög') total += e.minutes * 2
    else if (intensity === 'måttlig') total += e.minutes
  }
  return total
}

// ---------------------------------------------------------------------------
// Steg
// ---------------------------------------------------------------------------

/**
 * Nettokostnad för gång på plan mark i normal takt, kcal per kg och km.
 * Från kompendiets 3,8 MET vid ca 5 km/h (kod 17190): (3,8 − 1) / 5 ≈ 0,56.
 */
export const NET_WALKING_KCAL_PER_KG_KM = 0.56

/** Standardsteglängd i meter när längden är okänd (vuxen, ca 170 cm). */
export const DEFAULT_STRIDE_M = 0.7

/** Steglängd i meter utifrån längd – vanlig tumregel: ca 41 % av kroppslängden. */
export function strideLengthM(heightCm?: number): number {
  if (heightCm === undefined || !Number.isFinite(heightCm) || heightCm < 100 || heightCm > 230) return DEFAULT_STRIDE_M
  return (heightCm * 0.414) / 100
}

/** Ungefärlig sträcka i km för ett antal steg. */
export function stepsToKm(steps: number, heightCm?: number): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0
  return (steps * strideLengthM(heightCm)) / 1000
}

/**
 * Nettoenergi (utöver vila) för ett antal steg i normal gångtakt.
 * Ungefär 0,0004 kcal per steg och kg (70 kg, 170 cm: 10 000 steg ≈ 275 kcal netto).
 * Vanliga tumregler på ~0,0005 kcal/steg/kg avser bruttoförbrukning inklusive vila.
 */
export function stepsToKcal(steps: number, weightKg: number, heightCm?: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0
  return stepsToKm(steps, heightCm) * weightKg * NET_WALKING_KCAL_PER_KG_KM
}

/**
 * Ungefärligt antal steg per dag som redan ingår i respektive PAL-nivå, baserat på
 * Tudor-Locke & Bassetts stegindelning (< 5 000 stillasittande, 7 500 lätt aktiv,
 * 10 000 aktiv, 12 500 mycket aktiv).
 */
export const STEP_BASELINE: Record<ActivityLevel, number> = {
  stillasittande: 5000,
  latt: 7500,
  aktiv: 10000,
  mycket_aktiv: 12500,
}

/** Nettoenergi för steg utöver det som redan ingår i PAL-nivån (0 om under baslinjen). */
export function stepsKcalAboveBaseline(steps: number, weightKg: number, level: ActivityLevel, heightCm?: number): number {
  return stepsToKcal(Math.max(0, steps - STEP_BASELINE[level]), weightKg, heightCm)
}

// ---------------------------------------------------------------------------
// MET från fart (interpolerat ur kompendiet)
// ---------------------------------------------------------------------------

export type SpeedActivity = 'gang' | 'lopning' | 'cykling'

/** Stödpunkter [km/h, MET] – mittpunkter i kompendiets hastighetsintervall. */
const SPEED_TABLES: Record<SpeedActivity, ReadonlyArray<readonly [number, number]>> = {
  // 17151, 17152, 17170, 17190, 17200, 17220, 17230, 17231
  gang: [
    [2.5, 2.3],
    [3.5, 2.8],
    [4.0, 3.0],
    [5.0, 3.8],
    [6.0, 4.8],
    [6.7, 5.5],
    [7.6, 7.0],
    [8.5, 8.5],
  ],
  // 12028, 12029, 12030, 12045, 12050, 12060, 12070, 12080, 12090, 12100, 12110, 12115, 12120, 12130, 12132, 12134, 12135
  lopning: [
    [6.6, 6.5],
    [7.3, 7.8],
    [8.2, 8.5],
    [9.1, 9.0],
    [9.9, 9.3],
    [10.8, 10.5],
    [11.3, 11.0],
    [12.1, 11.8],
    [12.9, 12.0],
    [13.8, 12.5],
    [14.5, 13.0],
    [15.2, 14.8],
    [16.1, 14.8],
    [17.7, 16.8],
    [19.3, 18.5],
    [20.9, 19.8],
    [22.5, 23.0],
  ],
  // 01018, 01019, 01020, 01030, 01040, 01050, 01060
  cykling: [
    [8.9, 3.5],
    [15.1, 5.8],
    [17.6, 6.8],
    [20.8, 8.0],
    [24.1, 10.0],
    [28.2, 12.0],
    [34.0, 16.8],
  ],
}

/**
 * MET-värde för en given fart (km/h), linjärt interpolerat mellan kompendiets värden.
 * Farter utanför tabellen avgränsas till närmaste ändpunkt.
 */
export function metForSpeed(kind: SpeedActivity, kmh: number): number {
  const table = SPEED_TABLES[kind]
  if (!Number.isFinite(kmh) || kmh <= table[0][0]) return table[0][1]
  const last = table[table.length - 1]
  if (kmh >= last[0]) return last[1]
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]
    if (kmh <= x1) {
      const [x0, y0] = table[i - 1]
      const met = y0 + ((kmh - x0) / (x1 - x0)) * (y1 - y0)
      return Math.round(met * 10) / 10
    }
  }
  return last[1]
}

/** Fart i km/h från sträcka och tid. */
export function speedKmh(distanceKm: number, minutes: number): number {
  return minutes > 0 && distanceKm > 0 ? distanceKm / (minutes / 60) : 0
}

/** Tempo "5:30" min/km från sträcka och tid, eller null om det inte går att räkna. */
export function paceMinPerKm(distanceKm: number, minutes: number): string | null {
  if (!(distanceKm > 0) || !(minutes > 0)) return null
  const totalSeconds = Math.round((minutes * 60) / distanceKm)
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Sök
// ---------------------------------------------------------------------------

/** Gemener, blanksteg komprimerade, diakritiska tecken borttagna (å/ä → a, ö → o). */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface IndexedActivity {
  activity: Activity
  order: number
  name: string
  nameWords: string[]
  synonyms: string[]
}

let index: IndexedActivity[] | null = null
function getIndex(): IndexedActivity[] {
  index ??= ACTIVITIES.map((activity, order) => {
    const name = fold(activity.name)
    return {
      activity,
      order,
      name,
      nameWords: name.split(' '),
      synonyms: (activity.synonyms ?? []).map(fold),
    }
  })
  return index
}

function tokenScore(token: string, a: IndexedActivity): number {
  if (a.nameWords.includes(token)) return 60
  if (a.nameWords.some((w) => w.startsWith(token))) return 45
  if (a.synonyms.some((s) => s === token || s.split(' ').includes(token))) return 40
  if (a.synonyms.some((s) => s.startsWith(token) || s.split(' ').some((w) => w.startsWith(token)))) return 30
  // Svenska sammansättningar: "skidor" hittar "Längdskidor", "sim" hittar "Bröstsim".
  if (token.length >= 3 && (a.name.includes(token) || a.synonyms.some((s) => s.includes(token)))) return 20
  return 0
}

/**
 * Enkel och förlåtande aktivitetssökning på namn och synonymer ("springa", "skidor", "pingis").
 * Alla sökord måste matcha. Tom sökning returnerar alla aktiviteter i listans ordning.
 */
export function searchActivities(query: string, limit = 50): Activity[] {
  const q = fold(query)
  if (!q) return ACTIVITIES.slice(0, limit)
  const tokens = q.split(' ')
  const hits: Array<{ a: IndexedActivity; score: number }> = []
  for (const a of getIndex()) {
    let score = 0
    let ok = true
    for (const t of tokens) {
      const s = tokenScore(t, a)
      if (s === 0) {
        ok = false
        break
      }
      score += s
    }
    if (!ok) continue
    if (a.name === q) score += 100
    else if (a.name.startsWith(q)) score += 50
    hits.push({ a, score })
  }
  hits.sort((x, y) => y.score - x.score || x.a.order - y.a.order)
  return hits.slice(0, limit).map((h) => h.a.activity)
}

// ---------------------------------------------------------------------------
// Neutrala jämförelser ("promenadminuter")
// ---------------------------------------------------------------------------

/** Standardaktiviteter för jämförelser: rask promenad, cykling till jobbet och lugn simning. */
export const DEFAULT_EQUIVALENT_ACTIVITY_IDS: readonly string[] = ['promenad-rask', 'cykel-pendling', 'crawl-lugn']

export interface ActivityEquivalent {
  activity: Activity
  /** Avrundat till närmaste 5 minuter (minst 5). */
  minutes: number
  /** T.ex. "45 min rask promenad". */
  label: string
}

/** Kort beskrivning för jämförelser: "rask promenad", "cykling till jobbet". */
const EQUIVALENT_PHRASES: Record<string, string> = {
  'promenad-rask': 'rask promenad',
  promenad: 'promenad',
  'promenad-hund': 'promenad med hunden',
  'cykel-pendling': 'cykling till jobbet',
  'crawl-lugn': 'lugn simning',
  'lopning-10': 'löpning i 10 km/h',
  joggning: 'joggning',
  tradgard: 'trädgårdsarbete',
  stadning: 'städning',
  'langd-klassiskt': 'längdskidor',
}

/**
 * Omvandlar en energimängd till minuter av några vardagsaktiviteter, t.ex. för en frivillig
 * "promenadminuter"-vy: "En kanelbulle ≈ 45 min rask promenad". Aktiviteter som inte finns
 * eller har ≤ 1 MET hoppas över.
 */
export function activityEquivalents(
  kcal: number,
  weightKg: number,
  activityIds: readonly string[] = DEFAULT_EQUIVALENT_ACTIVITY_IDS,
  restingKcalPerDay?: number,
): ActivityEquivalent[] {
  const out: ActivityEquivalent[] = []
  if (!(kcal > 0) || !(weightKg > 0)) return out
  for (const id of activityIds) {
    const activity = getActivity(id)
    if (!activity || activity.met <= 1) continue
    const raw = minutesForKcal(kcal, activity.met, weightKg, restingKcalPerDay)
    const minutes = Math.max(5, Math.round(raw / 5) * 5)
    const phrase = EQUIVALENT_PHRASES[id] ?? activity.name.toLowerCase()
    out.push({ activity, minutes, label: `${formatDuration(minutes)} ${phrase}` })
  }
  return out
}
