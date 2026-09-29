/**
 * Milstolpar – små glädjeämnen längs vägen som firar att man använder Lagom.
 *
 * Grundregler (testas i milestones.test.ts):
 * - Bara engagemang: första måltiden, första egna receptet, dagar i dagboken räknat TOTALT … Aldrig
 *   dagar i följd, aldrig vikt, aldrig kalorier, underskott eller "perfekta dagar", aldrig något som
 *   kan gå förlorat och aldrig räknare som manar till mer loggning.
 * - Allt beräknas ur det som redan finns i butikerna (dagboken, recept, egna livsmedel,
 *   veckoplaneringen, vatten). Det enda som sparas är vilka milstolpar som redan har firats
 *   (`settings.milestonesSeen`) och om de ska döljas (`settings.hideMilestones`).
 * - Ingen milstolpe för fasta: att fira att man har avstått från mat kan vara en risk för den som
 *   har eller har haft en ätstörning (och fastan är inte till för graviditet, amning eller under 18 år).
 * - Varje milstolpe firas en gång. Första gången (t.ex. efter en uppdatering med befintlig historik)
 *   markeras allt som redan är uppnått som sett utan firande – och kommer många på en gång (en
 *   återställd säkerhetskopia, en import) firas de inte heller, så att det aldrig blir en ström av notiser.
 *
 * Rena funktioner utan React och utan butiker – kroken som firar finns i
 * `features/more/useMilestoneCelebration.ts` och sidan i `features/more/MilestonesPage.tsx`.
 */
import type { DayMeta, DiaryEntry, ExerciseEntry, ISODate, Profile, Targets } from '../types'
import { MONTHS, fromISODate, isValidISODate, toISODate } from './dates'
import { waterTargetMl } from './energy'

export const MILESTONE_IDS = [
  'forsta-maltiden',
  'forsta-vattenmalet',
  'dagar-10',
  'forsta-receptet',
  'forsta-veckoplaneringen',
  'forsta-fikan',
  'forsta-livsmedlet',
  'forsta-sparade-maltiden',
  'forsta-rorelsen',
  'forsta-reflektionen',
  'dagar-50',
  'dagar-100',
] as const
export type MilestoneId = (typeof MILESTONE_IDS)[number]

export interface MilestoneDef {
  id: MilestoneId
  /** Kort rubrik, t.ex. "Första måltiden loggad". */
  title: string
  /** En mening om vad milstolpen betyder (visas på sidan Milstolpar). */
  description: string
  /** Varm rad i notisen när milstolpen firas. */
  cheer: string
}

/** Alla milstolpar i den ordning de föreslås under "Längre fram". */
export const MILESTONES: readonly MilestoneDef[] = [
  {
    id: 'forsta-maltiden',
    title: 'Första måltiden loggad',
    description: 'Starten på din dagbok – en måltid i taget.',
    cheer: 'Välkommen igång!',
  },
  {
    id: 'forsta-vattenmalet',
    title: 'Första gången du nådde ditt vattenmål',
    description: 'En dag med gott om vatten – kroppen tackar.',
    cheer: 'Skönt för kroppen!',
  },
  {
    id: 'dagar-10',
    title: '10 dagar i dagboken',
    description: 'Tio dagar med anteckningar, räknat totalt – när det passar dig.',
    cheer: 'I din egen takt – fint!',
  },
  {
    id: 'forsta-receptet',
    title: 'Första egna receptet',
    description: 'Ett eget recept sparat – dina favoriter samlade på ett ställe.',
    cheer: 'Smaklig måltid!',
  },
  {
    id: 'forsta-veckoplaneringen',
    title: 'Första veckoplaneringen',
    description: 'En måltid planerad i förväg – lite mindre att fundera på i vardagen.',
    cheer: 'Skönt att ha en plan.',
  },
  {
    id: 'forsta-fikan',
    title: 'Första fikan i dagboken',
    description: 'Fika hör till – det finns alltid plats för den.',
    cheer: 'Fika hör till!',
  },
  {
    id: 'forsta-livsmedlet',
    title: 'Första egna livsmedlet',
    description: 'Något som saknades finns nu i din egen lista.',
    cheer: 'Nu finns det med.',
  },
  {
    id: 'forsta-sparade-maltiden',
    title: 'Första sparade måltiden',
    description: 'En favoritmåltid som går att lägga till med ett tryck.',
    cheer: 'Smidigt nästa gång.',
  },
  {
    id: 'forsta-rorelsen',
    title: 'Första rörelsen loggad',
    description: 'Promenad, padel eller skidor – all rörelse är värd att notera.',
    cheer: 'All rörelse är värd något.',
  },
  {
    id: 'forsta-reflektionen',
    title: 'Första dagsreflektionen',
    description: 'Du noterade hur dagen kändes – mat är mer än siffror.',
    cheer: 'Att känna efter hör till.',
  },
  {
    id: 'dagar-50',
    title: '50 dagar i dagboken',
    description: 'Femtio dagar med anteckningar, räknat totalt.',
    cheer: 'Vilken resa – i din egen takt.',
  },
  {
    id: 'dagar-100',
    title: '100 dagar i dagboken',
    description: 'Hundra dagar med anteckningar, räknat totalt.',
    cheer: 'Tack för att Lagom får följa med.',
  },
]

const BY_ID: ReadonlyMap<string, MilestoneDef> = new Map(MILESTONES.map((m) => [m.id, m]))

/** Milstolpen med id:t, eller undefined för okända (t.ex. från en nyare version). */
export function milestoneById(id: string): MilestoneDef | undefined {
  return BY_ID.get(id)
}

/** Milstolparna för dagar i dagboken – räknas totalt, aldrig i följd. */
const DAY_COUNTS: ReadonlyArray<readonly [MilestoneId, number]> = [
  ['dagar-10', 10],
  ['dagar-50', 50],
  ['dagar-100', 100],
]

/** Det milstolparna beräknas från. Allt är valfritt att fylla i – saknad data ger inga milstolpar. */
export interface MilestoneInput {
  entries?: Readonly<Record<ISODate, readonly DiaryEntry[] | undefined>>
  /** Vatten i ml per dag. */
  water?: Readonly<Record<ISODate, number | undefined>>
  exercise?: Readonly<Record<ISODate, readonly ExerciseEntry[] | undefined>>
  days?: Readonly<Record<ISODate, DayMeta | undefined>>
  /** Egna recept (inbyggda klassiker räknas inte). */
  recipes?: Readonly<Record<string, { createdAt?: number; builtin?: boolean } | undefined>>
  customFoods?: Readonly<Record<string, { createdAt?: number } | undefined>>
  /** Sparade måltider. */
  templates?: ReadonlyArray<{ createdAt?: number }>
  /** Veckoplaneringens rader per dag. */
  planItems?: Readonly<Record<ISODate, ReadonlyArray<{ createdAt?: number }> | undefined>>
  /** Dagens vattenmål i ml (0 = inget mål). */
  waterGoalMl?: number
}

export interface MilestoneStatus {
  def: MilestoneDef
  achieved: boolean
  /** När milstolpen nåddes enligt datan – saknas om det inte går att veta. */
  date?: ISODate
}

const isArrayWithItems = (v: unknown): v is readonly unknown[] => Array.isArray(v) && v.length > 0
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Giltiga datumnycklar i stigande ordning där `has(värde)` är sant. */
function datesWhere<T>(map: Readonly<Record<string, T>> | undefined, has: (value: T) => boolean): ISODate[] {
  if (!isRecord(map)) return []
  return Object.keys(map)
    .filter((d) => isValidISODate(d) && has(map[d]))
    .sort()
}

/** Ett datum som ännu inte har varit visas som idag. */
const notAfter = (date: ISODate, today: ISODate): ISODate => (date > today ? today : date)

/** Tidigaste giltiga tidsstämpeln som lokalt datum (aldrig efter idag). */
function earliestStamp(stamps: ReadonlyArray<number | undefined>, today: ISODate): ISODate | undefined {
  let min = Infinity
  for (const s of stamps) if (typeof s === 'number' && Number.isFinite(s) && s > 0 && s < min) min = s
  return min === Infinity ? undefined : notAfter(toISODate(new Date(min)), today)
}

/** Status för en "första gången"-milstolpe utifrån sparade saker (recept, livsmedel …) och deras tidsstämplar. */
function firstByStamp(def: MilestoneDef, stamps: ReadonlyArray<number | undefined>, today: ISODate): MilestoneStatus {
  if (stamps.length === 0) return { def, achieved: false }
  return { def, achieved: true, date: earliestStamp(stamps, today) }
}

/** Status för en "första gången"-milstolpe utifrån datum i stigande ordning. */
function firstByDate(def: MilestoneDef, dates: readonly ISODate[], today: ISODate): MilestoneStatus {
  return dates.length > 0 ? { def, achieved: true, date: notAfter(dates[0], today) } : { def, achieved: false }
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const hasText = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

/** `createdAt` för de poster som är objekt (skadade poster hoppas över). */
function stampsOf(list: readonly unknown[]): Array<number | undefined> {
  return list.filter(isRecord).map((x) => (isNumber(x.createdAt) ? x.createdAt : undefined))
}

/** Värdena i en post-karta (tom om den inte är ett objekt). */
const valuesOf = (map: unknown): unknown[] => (isRecord(map) ? Object.values(map) : [])

/**
 * Alla milstolpar med status, i samma ordning som `MILESTONES`. Tål skadad data (t.ex. från en
 * gammal säkerhetskopia) – det som inte går att tolka räknas inte.
 */
export function computeMilestones(input: MilestoneInput, today: ISODate): MilestoneStatus[] {
  const logged = datesWhere(input.entries, isArrayWithItems)
  // Dagar räknas totalt (inte i följd) och bara dagar som har varit.
  const pastLogged = logged.filter((d) => d <= today)
  const fika = datesWhere(input.entries, (list) => Array.isArray(list) && list.some((e: unknown) => isRecord(e) && e.meal === 'fika'))
  const goal = isNumber(input.waterGoalMl) ? input.waterGoalMl : 0
  const waterDays = goal > 0 ? datesWhere(input.water, (ml) => isNumber(ml) && ml >= goal) : []
  const moved = datesWhere(input.exercise, isArrayWithItems)
  const reflected = datesWhere(input.days, (m) => isRecord(m) && (isNumber(m.mood) || isNumber(m.energy) || isNumber(m.hunger) || hasText(m.note)))
  const recipes = valuesOf(input.recipes).filter((r) => isRecord(r) && r.builtin !== true)
  const planned = valuesOf(input.planItems).flatMap((list) => (Array.isArray(list) ? (list as unknown[]) : []))
  const templates = Array.isArray(input.templates) ? (input.templates as unknown[]) : []

  return MILESTONES.map((def): MilestoneStatus => {
    switch (def.id) {
      case 'forsta-maltiden':
        return firstByDate(def, logged, today)
      case 'forsta-fikan':
        return firstByDate(def, fika, today)
      case 'forsta-vattenmalet':
        return firstByDate(def, waterDays, today)
      case 'forsta-rorelsen':
        return firstByDate(def, moved, today)
      case 'forsta-reflektionen':
        return firstByDate(def, reflected, today)
      case 'forsta-receptet':
        return firstByStamp(def, stampsOf(recipes), today)
      case 'forsta-livsmedlet':
        return firstByStamp(def, stampsOf(valuesOf(input.customFoods)), today)
      case 'forsta-sparade-maltiden':
        return firstByStamp(def, stampsOf(templates), today)
      case 'forsta-veckoplaneringen':
        return firstByStamp(def, stampsOf(planned), today)
      case 'dagar-10':
      case 'dagar-50':
      case 'dagar-100': {
        const n = DAY_COUNTS.find(([id]) => id === def.id)?.[1] ?? Infinity
        return pastLogged.length >= n ? { def, achieved: true, date: pastLogged[n - 1] } : { def, achieved: false }
      }
    }
  })
}

/** Id:n för de uppnådda milstolparna. */
export function achievedIds(statuses: readonly MilestoneStatus[]): MilestoneId[] {
  return statuses.filter((s) => s.achieved).map((s) => s.def.id)
}

/** Vattenmålet (ml) på samma sätt som dagsmålen: ett eget mål går före det beräknade. */
export function waterGoalMl(profile: Pick<Profile, 'sex' | 'lifeStage'> | null | undefined, overrides?: Partial<Targets>): number {
  const own = overrides?.waterMl
  if (typeof own === 'number' && Number.isFinite(own) && own >= 0) return own
  return profile ? waterTargetMl(profile.sex, profile.lifeStage) : 0
}

// ---------------------------------------------------------------------------
// Firande
// ---------------------------------------------------------------------------

/**
 * Fler än så många nya milstolpar på en gång firas inte – då har data kommit in i klump (en
 * återställd säkerhetskopia, en import, en inläsning som blev klar sent), inte genom något man
 * just gjorde. De markeras som sedda i stället.
 */
export const MAX_CELEBRATED_AT_ONCE = 2

export interface CelebrationPlan {
  /** Ny lista för `settings.milestonesSeen`, eller null om inget behöver sparas. */
  seen: string[] | null
  /** Milstolparna att fira nu (tom = inget firande). */
  celebrate: MilestoneDef[]
}

/**
 * Vad som ska firas och sparas, utifrån de uppnådda milstolparna och de redan sedda.
 * - `seen` saknas (första gången, t.ex. efter en uppdatering eller en återställd säkerhetskopia
 *   utan listan): allt som redan är uppnått markeras som sett utan firande.
 * - Dolda milstolpar: nya markeras som sedda utan firande, så att inget firas i efterhand när de
 *   visas igen.
 * - Fler än `MAX_CELEBRATED_AT_ONCE` nya på en gång: markeras som sedda utan firande.
 * Okända id:n i `seen` (t.ex. från en nyare version) behålls.
 */
export function planCelebration(
  achieved: readonly string[],
  seen: readonly string[] | undefined,
  opts: { hidden?: boolean } = {},
): CelebrationPlan {
  if (!Array.isArray(seen)) return { seen: [...new Set(achieved)], celebrate: [] }
  const known = new Set(seen)
  const fresh = [...new Set(achieved)].filter((id) => !known.has(id))
  if (fresh.length === 0) return { seen: null, celebrate: [] }
  const next = [...seen, ...fresh]
  if (opts.hidden || fresh.length > MAX_CELEBRATED_AT_ONCE) return { seen: next, celebrate: [] }
  const celebrate = fresh.map(milestoneById).filter((m): m is MilestoneDef => m !== undefined)
  return { seen: next, celebrate }
}

const lowerFirst = (s: string) => (/^\d/.test(s) ? s : s.charAt(0).toLocaleLowerCase('sv-SE') + s.slice(1))

/** Texten i notisen: "Ny milstolpe: Första måltiden loggad. Välkommen igång!" */
export function celebrationText(milestones: readonly MilestoneDef[]): string {
  if (milestones.length === 0) return ''
  if (milestones.length === 1) return `Ny milstolpe: ${milestones[0].title}. ${milestones[0].cheer}`
  const titles = milestones.map((m, i) => (i === 0 ? m.title : lowerFirst(m.title)))
  const list = `${titles.slice(0, -1).join(', ')} och ${titles[titles.length - 1]}`
  return `${milestones.length === 2 ? 'Två nya milstolpar' : 'Nya milstolpar'}: ${list}.`
}

// ---------------------------------------------------------------------------
// Översikt för sidan och Mer
// ---------------------------------------------------------------------------

export interface MilestoneOverview {
  /** Uppnådda, senast uppnådda först (utan känt datum sist). */
  achieved: MilestoneStatus[]
  /** Några som kan komma längre fram – utan förlopp och utan press. */
  upcoming: MilestoneDef[]
  /** Den senast uppnådda, eller undefined. */
  latest?: MilestoneStatus
}

export interface OverviewOptions {
  /** Redan firade (`settings.milestonesSeen`) – visas som uppnådda även om datan har ändrats sedan. */
  seen?: readonly string[]
  /** Fika är en påslagen måltid – annars föreslås fikan inte. */
  fikaEnabled?: boolean
  /** Högst så många förslag under "Längre fram" (standard 3). */
  upcomingLimit?: number
}

/**
 * Uppnådda och kommande milstolpar. En milstolpe som en gång har firats förblir uppnådd (inget
 * kan gå förlorat, även om t.ex. receptet tas bort) – då utan datum om datan inte längre visar det.
 * Kommande: bara nästa antal dagar (inte alla på en gång), fikan bara när måltiden finns.
 */
export function milestoneOverview(statuses: readonly MilestoneStatus[], opts: OverviewOptions = {}): MilestoneOverview {
  const seen = new Set(Array.isArray(opts.seen) ? opts.seen : [])
  const order = new Map(MILESTONES.map((m, i) => [m.id, i]))
  const achieved = statuses
    .filter((s) => s.achieved || seen.has(s.def.id))
    .map((s) => (s.achieved ? s : { def: s.def, achieved: true }))
    .sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1
      if (a.date && !b.date) return -1
      if (!a.date && b.date) return 1
      return (order.get(a.def.id) ?? 0) - (order.get(b.def.id) ?? 0)
    })
  const done = new Set(achieved.map((s) => s.def.id))
  const nextDayCount = DAY_COUNTS.find(([id]) => !done.has(id))?.[0]
  const upcoming = MILESTONES.filter((m) => {
    if (done.has(m.id)) return false
    if (m.id === 'forsta-fikan') return opts.fikaEnabled !== false
    if (DAY_COUNTS.some(([id]) => id === m.id)) return m.id === nextDayCount
    return true
  }).slice(0, Math.max(0, opts.upcomingLimit ?? 3))
  return { achieved, upcoming, latest: achieved[0] }
}

/** "12 september" (+ år om annat än i år). */
export function formatMilestoneDate(date: ISODate, today: ISODate): string {
  const d = fromISODate(date)
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === fromISODate(today).getFullYear() ? base : `${base} ${d.getFullYear()}`
}
