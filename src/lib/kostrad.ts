/**
 * Livsmedelsverkets kostråd för vuxna – utvärdering över en period.
 *
 * Bygger på "Livsmedelsverkets generella kostråd för den vuxna befolkningen" (L 2025 nr 04,
 * presenterade 28 april 2025, baserade på NNR 2023). Nytt jämfört med 2015 års råd:
 * - Rött kött och chark högst 350 g/vecka tillagad vikt (tidigare 500 g).
 * - Fullkorn 90 g/dag för alla vuxna (tidigare 70 g för kvinnor).
 * - Baljväxter är ett eget råd ("ofta, gärna varje dag") och ingår inte längre i 500 g frukt och grönt.
 * - Juice räknas inte in i frukt och grönt.
 * - Mejeriprodukter 350–500 ml/dag, gärna magra, osötade och syrade (eller berikade växtbaserade alternativ).
 * - Nötter och frön 2–3 msk (20–30 g) om dagen, fisk 2–3 gånger i veckan (≈ 300–450 g).
 * Fysisk aktivitet följer Folkhälsomyndighetens riktlinjer (2021): minst 150 min/vecka med måttlig
 * intensitet eller 75 min med hög intensitet.
 *
 * Utvärderingen görs över de dagar som har registreringar – oregistrerade dagar straffas inte.
 * Veckoråd (fisk, rött kött, rörelse, alkohol) skalas om till antalet loggade dagar.
 */
import type { DiaryEntry, ExerciseEntry, Food, FoodCategory, ISODate, KostradContrib, Sex } from '../types'
import { entryNutrients } from './diary'
import { moderateEquivalentMinutes } from './exercise'
import { formatNumber } from './format'
import { saltFromSodiumMg, STANDARD_DRINK_G } from './nutrients'

// ---------------------------------------------------------------------------
// Bidrag per livsmedel
// ---------------------------------------------------------------------------

/**
 * Gram per 100 g livsmedel som räknas mot kostråden (inklusive baljväxter och mejeri, som blev
 * egna råd 2025). Samma typ som `KostradContrib` i `types.ts` – namnet finns kvar för bakåtkompatibilitet.
 */
export type KostradContribFull = KostradContrib

/** Kategoriernas schabloner (gram per 100 g). Kategorier som saknas bidrar inte. */
export const CATEGORY_KOSTRAD: Partial<Record<FoodCategory, KostradContribFull>> = {
  gronsaker: { fruktGront: 100 },
  rotfrukter: { fruktGront: 100 },
  frukt: { fruktGront: 100 },
  bar: { fruktGront: 100 },
  // Baljväxter räknas sedan 2025 som ett eget råd, inte som frukt och grönt.
  baljvaxter: { baljvaxter: 100 },
  rott_kott: { rottKott: 100 },
  chark: { rottKott: 100 },
  fisk: { fisk: 100 },
  skaldjur: { fisk: 100 },
  notter_fron: { notter: 100 },
  mejeri: { mejeri: 100 },
  vaxtdryck: { mejeri: 100 },
  // potatis, juice, spannmål m.fl. bidrar inte (juice räknas inte sedan 2025).
}

/** Normalisera namn för nyckelordsmatchning. */
function norm(s: string): string {
  return s.toLowerCase()
}

/** Feta mejeriprodukter som hör till matfett, inte till mejeriråd. */
const FATTY_DAIRY = /grädde|gräddfil|crème|creme|smetana|smör/
/** Ord som visar att köttet är vägt rått. */
const RAW_WORDS = /(^|[\s,(])(rå|råa|rått|okokt|otillagad)([\s,)]|$)/
/** Sojabaserade produkter räknas som baljväxter (sojabönan är en baljväxt). */
const SOY_WORDS = /tofu|soja|tempeh|edamame/

/**
 * Rätter där baljväxterna är huvudingrediensen bland "grönsakerna" (ärtsoppa, dal, linsgryta …).
 * Gröna ärtor, sockerärtor och haricots verts räknas som grönsaker och matchas inte.
 */
const LEGUME_MAIN = /ärtsoppa|linssoppa|bönsoppa|linsgryta|kikärtsgryta|bönsallad|(^|[\s(])dal([\s,)]|$)|bruna bönor|falafel|hummus|bönbiff|linsbiff/
/** Rätter med baljväxter blandade med andra grönsaker (chili, burrito …) – ungefär hälften räknas. */
const LEGUME_MIXED = /chili con carne|chili sin carne|bönchili|bönor|linser|kikärt/
/** Tallrikar med sallad eller grönsaker vid sidan av – även där räknas bara ungefär hälften. */
const WITH_VEGETABLES = /sallad|grönsak/
const NOT_LEGUME = /gröna bönor|haricots|brytbön|sockerärt|gröna ärtor|böngrodd/

/**
 * Livsmedel med egna kostrådsvärden från före 2025 har baljväxterna inräknade i frukt och grönt.
 * Flytta den andelen till baljväxter när namnet tydligt visar en baljväxträtt, så att t.ex.
 * ärtsoppa räknas mot baljväxtrådet i stället för mot 500 g frukt och grönt.
 */
function legumeShareFromName(name: string, contrib: KostradContribFull): KostradContribFull {
  const fg = contrib.fruktGront
  if (fg === undefined || fg <= 0 || NOT_LEGUME.test(name)) return contrib
  const main = LEGUME_MAIN.test(name)
  const share = main && !WITH_VEGETABLES.test(name) ? 1 : main || LEGUME_MIXED.test(name) ? 0.5 : 0
  if (share === 0) return contrib
  const moved = Math.round(fg * share)
  const rest = fg - moved
  const result: KostradContribFull = { ...contrib, baljvaxter: moved }
  if (rest > 0) result.fruktGront = rest
  else delete result.fruktGront
  return result
}

/**
 * Råvikt → tillagad vikt för kött. Rådet gäller tillagad vikt: 350 g tillagat motsvarar ca
 * 400–500 g rått (Livsmedelsverket), dvs. en faktor på ungefär 0,75.
 */
export const RAW_TO_COOKED_MEAT = 0.75

/**
 * Hur många gram per 100 g av livsmedlet som räknas mot respektive kostråd.
 * `food.kostrad` används om det finns (ersätter schablonen helt), annars kategorins schablon
 * justerad med några nyckelord i namnet (rått kött, sojaprodukter, hummus, feta mejeriprodukter).
 */
export function foodKostrad(food: Food): KostradContribFull {
  const name = norm(food.name)
  if (food.kostrad) {
    const override: KostradContribFull = { ...food.kostrad }
    return override.baljvaxter === undefined ? legumeShareFromName(name, override) : override
  }
  const base: KostradContribFull = { ...(CATEGORY_KOSTRAD[food.category] ?? {}) }

  if ((food.category === 'rott_kott' || food.category === 'chark') && RAW_WORDS.test(name)) {
    base.rottKott = (base.rottKott ?? 0) * RAW_TO_COOKED_MEAT
  }
  if ((food.category === 'mejeri' || food.category === 'vaxtdryck') && FATTY_DAIRY.test(name)) {
    delete base.mejeri
  }
  if (food.category === 'vegoprotein' && SOY_WORDS.test(name)) {
    base.baljvaxter = 100
  }
  // Hummus består till ca 60 % av kikärtor, falafel till ca 50 % (Lagoms uppskattning).
  if (/hummus/.test(name) && food.category !== 'baljvaxter') base.baljvaxter = 60
  else if (/falafel/.test(name) && food.category !== 'baljvaxter') base.baljvaxter = 50
  return base
}

// ---------------------------------------------------------------------------
// Resultat
// ---------------------------------------------------------------------------

export type KostradId =
  | 'frukt_gront'
  | 'baljvaxter'
  | 'fullkorn'
  | 'fisk'
  | 'notter'
  | 'mejeri'
  | 'rott_kott'
  | 'salt'
  | 'mattat_fett'
  | 'socker'
  | 'alkohol'
  | 'rorelse'

export type KostradStatus = 'bra' | 'nastan' | 'langt_kvar' | 'over'

export interface KostradResult {
  id: KostradId
  /** Kort rubrik, t.ex. "Fullkorn". */
  title: string
  /** Själva kostrådet på svenska. */
  advice: string
  /** Enhet för `target` och `actual`: 'g/dag', 'g', 'dagar', 'E%', 'standardglas' eller 'min'. */
  unit: string
  /** Mål för perioden (eller per dag om `perDay`). Veckoråd är omskalade till antalet loggade dagar. */
  target: number
  /** Faktiskt värde för perioden (eller genomsnitt per dag om `perDay`). */
  actual: number
  /** true = värdena är genomsnitt per dag. */
  perDay?: boolean
  direction: 'minst' | 'hogst'
  /** 0–1, där 1 = rådet uppfyllt. */
  score: number
  status: KostradStatus
  /** Uppmuntrande tips på svenska. */
  tip: string
  emoji: string
  /** Antal dagar som utvärderingen bygger på. */
  periodDays: number
  /** Ursprungligt veckomål (för veckoråd), t.ex. 350 g rött kött. */
  weeklyTarget?: number
  /**
   * Andel (0–1) av energin från livsmedel där värdet är känt – bara för näringsbaserade råd
   * (fullkorn, salt, mättat fett, socker). Under 0,5 är resultatet osäkert.
   */
  coverage?: number
  /** Källa för rådet. */
  source: string
}

export interface KostradInput {
  entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>
  exerciseByDate: Record<ISODate, readonly ExerciseEntry[] | undefined>
  /** Perioden som ska utvärderas, t.ex. de senaste 7 dagarna. */
  dates: readonly ISODate[]
  /** 2025 års kostråd är desamma för kvinnor och män; fältet finns för framtida könsspecifika råd. */
  sex: Sex
  /** Energimålet. Används inte i dag – energiprocent räknas på faktiskt intag, som i NNR 2023. */
  kcalTarget?: number
}

/** Målnivåer (per dag eller vecka) enligt kostråden. */
export const KOSTRAD_TARGETS = {
  /** g/dag grönsaker, frukt och bär. */
  fruktGrontPerDay: 500,
  /** Minsta mängd tillagade baljväxter för att en dag ska räknas som "baljväxtdag" (Finlands lägre gräns 50 g). */
  baljvaxterDayMinG: 50,
  /** g/dag fullkorn (alla vuxna sedan 2025). */
  fullkornPerDay: 90,
  /** g/vecka fisk och skaldjur (2–3 gånger ≈ 300–450 g). */
  fiskPerWeek: 300,
  /** g/dag nötter och frön (2–3 msk ≈ 20–30 g). */
  notterPerDay: 20,
  /** g/dag mejeriprodukter (350–500 ml). */
  mejeriPerDay: 350,
  mejeriMaxPerDay: 500,
  /** g/vecka rött kött och chark, tillagad vikt. */
  rottKottPerWeek: 350,
  /** g/dag salt. */
  saltPerDay: 6,
  /** E% mättat fett. */
  satFatPct: 10,
  /** E% tillsatt/fritt socker. */
  sugarPct: 10,
  /** Socialstyrelsens gräns för riskbruk: 10 standardglas/vecka. Används för att gradera poängen. */
  alkoholRiskPerWeek: 10,
  /** min/vecka pulshöjande aktivitet med måttlig intensitet. */
  rorelsePerWeek: 150,
} as const

/** MET-gräns för hög intensitet (WHO). En minut med hög intensitet räknas som två med måttlig. */
export const VIGOROUS_MET = 6

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function minStatus(ratio: number): KostradStatus {
  if (ratio >= 1) return 'bra'
  if (ratio >= 0.7) return 'nastan'
  return 'langt_kvar'
}

function maxStatus(actual: number, target: number): KostradStatus {
  if (actual <= target) return 'bra'
  if (actual <= target * 1.15) return 'nastan'
  return 'over'
}

function maxScore(actual: number, target: number): number {
  if (actual <= target) return 1
  if (target <= 0) return 0
  return clamp01(1 - (actual - target) / target)
}

/** Summera ett kostrådsbidrag för en post (bara matposter har gramvikt). */
function contrib(entry: DiaryEntry): KostradContribFull & { grams: number } {
  if (entry.kind !== 'food' || !Number.isFinite(entry.grams) || entry.grams <= 0) return { grams: 0 }
  const c = foodKostrad(entry.food)
  const f = entry.grams / 100
  return {
    grams: entry.grams,
    fruktGront: (c.fruktGront ?? 0) * f,
    baljvaxter: (c.baljvaxter ?? 0) * f,
    rottKott: (c.rottKott ?? 0) * f,
    fisk: (c.fisk ?? 0) * f,
    notter: (c.notter ?? 0) * f,
    mejeri: (c.mejeri ?? 0) * f,
  }
}

const g = (v: number) => formatNumber(v, 0)

/**
 * Utvärdera kostråden över en period. Returnerar en tom lista om inga dagar i perioden har
 * registreringar (varken mat eller träning).
 */
export function evaluateKostrad(input: KostradInput): KostradResult[] {
  const uniqueDates = [...new Set(input.dates)]
  const foodDays = uniqueDates.filter((d) => (input.entriesByDate[d]?.length ?? 0) > 0)
  const activityDays = uniqueDates.filter(
    (d) => (input.entriesByDate[d]?.length ?? 0) > 0 || (input.exerciseByDate[d]?.length ?? 0) > 0,
  )
  if (activityDays.length === 0) return []

  // --- Summering av mat ---------------------------------------------------
  const sum = { fruktGront: 0, rottKott: 0, fisk: 0, notter: 0, mejeri: 0 }
  let legumeDays = 0
  let kcal = 0
  let alcoholG = 0
  const nut = {
    wholegrain: { sum: 0, knownKcal: 0 },
    salt: { sum: 0, knownKcal: 0 },
    satFat: { sum: 0, knownKcal: 0 },
    addedSugar: { sum: 0, knownKcal: 0 },
  }

  for (const date of foodDays) {
    let legumesToday = 0
    for (const entry of input.entriesByDate[date] ?? []) {
      const c = contrib(entry)
      sum.fruktGront += c.fruktGront ?? 0
      sum.rottKott += c.rottKott ?? 0
      sum.fisk += c.fisk ?? 0
      sum.notter += c.notter ?? 0
      sum.mejeri += c.mejeri ?? 0
      legumesToday += c.baljvaxter ?? 0

      const n = entryNutrients(entry)
      const eKcal = n.kcal ?? 0
      kcal += eKcal
      alcoholG += n.alcohol ?? 0
      const salt = n.salt ?? (n.sodium !== undefined ? saltFromSodiumMg(n.sodium) : undefined)
      const values = { wholegrain: n.wholegrain, salt, satFat: n.satFat, addedSugar: n.addedSugar }
      for (const key of Object.keys(nut) as Array<keyof typeof nut>) {
        const v = values[key]
        if (v === undefined || !Number.isFinite(v)) continue
        nut[key].sum += v
        nut[key].knownKcal += eKcal
      }
    }
    if (legumesToday >= KOSTRAD_TARGETS.baljvaxterDayMinG) legumeDays++
  }

  const nFood = foodDays.length
  const nAct = activityDays.length
  const coverageOf = (k: keyof typeof nut) => (kcal > 0 ? clamp01(nut[k].knownKcal / kcal) : 0)
  const results: KostradResult[] = []

  if (nFood > 0) {
    // --- Grönsaker, frukt och bär ------------------------------------------
    {
      const target = KOSTRAD_TARGETS.fruktGrontPerDay
      const actual = sum.fruktGront / nFood
      const ratio = actual / target
      const status = minStatus(ratio)
      results.push({
        id: 'frukt_gront',
        title: 'Grönsaker, frukt och bär',
        advice: 'Ät minst 500 gram grönsaker, frukt och bär om dagen – gärna grova grönsaker som rotfrukter, kål och lök.',
        unit: 'g/dag',
        target,
        actual,
        perDay: true,
        direction: 'minst',
        score: clamp01(ratio),
        status,
        tip:
          status === 'bra'
            ? 'Toppen! Du äter mycket grönsaker, frukt och bär – fortsätt så.'
            : status === 'nastan'
              ? `Du är nära! Ungefär ${g(target - actual)} g till per dag – ett äpple och en näve morötter räcker långt.`
              : 'Fyll halva tallriken med grönsaker och ta frukt eller bär som mellanmål. Frysta grönsaker och bär räknas lika bra. Juice räknas inte.',
        emoji: '🥦',
        periodDays: nFood,
        source: 'Livsmedelsverket 2025',
      })
    }

    // --- Baljväxter --------------------------------------------------------
    {
      const target = nFood
      const actual = legumeDays
      const ratio = actual / target
      const status = minStatus(ratio)
      results.push({
        id: 'baljvaxter',
        title: 'Baljväxter',
        advice: 'Ät bönor, ärter och linser ofta – gärna varje dag.',
        unit: 'dagar',
        target,
        actual,
        direction: 'minst',
        score: clamp01(ratio),
        status,
        tip:
          status === 'bra'
            ? 'Snyggt – baljväxter varje dag du registrerat!'
            : status === 'nastan'
              ? 'Baljväxter de flesta dagar – fint! Röda linser i köttfärssåsen eller kikärtor i salladen är enkla sätt att få med dem oftare.'
              : 'Byt ut en del av köttet mot bönor, linser eller kikärtor – eller ha hummus på mackan. Konserverade baljväxter är lika bra som torkade.',
        emoji: '🫘',
        periodDays: nFood,
        source: 'Livsmedelsverket 2025',
      })
    }

    // --- Fullkorn ----------------------------------------------------------
    {
      const target = KOSTRAD_TARGETS.fullkornPerDay
      const actual = nut.wholegrain.sum / nFood
      const coverage = coverageOf('wholegrain')
      const ratio = actual / target
      const status = minStatus(ratio)
      const uncertain = coverage < 0.5 && status !== 'bra'
      results.push({
        id: 'fullkorn',
        title: 'Fullkorn',
        advice: 'Ät 90 gram fullkorn om dagen – till exempel havregryn, fullkornsbröd, knäckebröd och fullkornspasta.',
        unit: 'g/dag',
        target,
        actual,
        perDay: true,
        direction: 'minst',
        score: clamp01(ratio),
        status,
        tip:
          (status === 'bra'
            ? 'Bra jobbat – du når 90 gram fullkorn om dagen.'
            : status === 'nastan'
              ? 'Nästan där! Byt en vit brödskiva mot fullkornsbröd eller knäckebröd.'
              : 'Havregrynsgröt till frukost, knäckebröd och fullkornspasta eller matvete till middag är enkla sätt att få mer fullkorn.') +
          (uncertain ? ' Fullkornshalten saknas för en del av det du ätit, så siffran kan vara för låg.' : ''),
        emoji: '🌾',
        periodDays: nFood,
        coverage,
        source: 'Livsmedelsverket 2025',
      })
    }

    // --- Fisk och skaldjur -------------------------------------------------
    {
      const weekly = KOSTRAD_TARGETS.fiskPerWeek
      const target = (weekly * nFood) / 7
      const actual = sum.fisk
      const ratio = actual / target
      const status = minStatus(ratio)
      results.push({
        id: 'fisk',
        title: 'Fisk och skaldjur',
        advice: 'Ät fisk och skaldjur 2–3 gånger i veckan, ungefär 300–450 gram. Variera gärna mellan fet och mager fisk.',
        unit: 'g',
        target,
        actual,
        direction: 'minst',
        score: clamp01(ratio),
        status,
        tip:
          status === 'bra'
            ? 'Härligt – du äter fisk och skaldjur som rekommenderat.'
            : status === 'nastan'
              ? 'Nästan! En fiskmåltid till, till exempel lax, sill eller makrill, så är du i mål.'
              : 'Sikta på fisk 2–3 gånger i veckan. Fiskpinnar, tonfisk på burk och sill på knäckebröd räknas också.',
        emoji: '🐟',
        periodDays: nFood,
        weeklyTarget: weekly,
        source: 'Livsmedelsverket 2025',
      })
    }

    // --- Nötter och frön ---------------------------------------------------
    {
      const target = KOSTRAD_TARGETS.notterPerDay
      const actual = sum.notter / nFood
      const ratio = actual / target
      const status = minStatus(ratio)
      results.push({
        id: 'notter',
        title: 'Nötter och frön',
        advice: 'Ät gärna 2–3 matskedar (20–30 gram) osaltade nötter eller frön om dagen.',
        unit: 'g/dag',
        target,
        actual,
        perDay: true,
        direction: 'minst',
        score: clamp01(ratio),
        status,
        tip:
          status === 'bra'
            ? 'Bra – en näve nötter eller frön om dagen är precis lagom.'
            : 'Strö solrosfrön över gröten eller ta en näve osaltade nötter som mellanmål – 2–3 matskedar räcker.',
        emoji: '🥜',
        periodDays: nFood,
        source: 'Livsmedelsverket 2025',
      })
    }

    // --- Mejeriprodukter ---------------------------------------------------
    {
      const target = KOSTRAD_TARGETS.mejeriPerDay
      const actual = sum.mejeri / nFood
      const ratio = actual / target
      const status = minStatus(ratio)
      results.push({
        id: 'mejeri',
        title: 'Mejeriprodukter',
        advice:
          'Ät eller drick 3,5–5 dl mejeriprodukter om dagen – gärna magra, osötade och syrade som fil och yoghurt – eller berikade växtbaserade alternativ.',
        unit: 'g/dag',
        target,
        actual,
        perDay: true,
        direction: 'minst',
        score: clamp01(ratio),
        status,
        tip:
          status === 'bra'
            ? actual > KOSTRAD_TARGETS.mejeriMaxPerDay
              ? 'Du får i dig gott om mejeriprodukter – 3,5–5 dl om dagen räcker gott.'
              : 'Fint – du får i dig mejeriprodukter varje dag. Välj gärna magra och osötade sorter.'
            : 'Ett glas mjölk eller en portion fil eller yoghurt om dagen hjälper dig att nå 3,5–5 dl. Kalciumberikade växtdrycker fungerar också.',
        emoji: '🥛',
        periodDays: nFood,
        source: 'Livsmedelsverket 2025',
      })
    }

    // --- Rött kött och chark -----------------------------------------------
    {
      const weekly = KOSTRAD_TARGETS.rottKottPerWeek
      const target = (weekly * nFood) / 7
      const actual = sum.rottKott
      const status = maxStatus(actual, target)
      results.push({
        id: 'rott_kott',
        title: 'Rött kött och chark',
        advice: 'Ät högst 350 gram rött kött och chark i veckan (tillagad vikt). Chark bör vara en liten del.',
        unit: 'g',
        target,
        actual,
        direction: 'hogst',
        score: maxScore(actual, target),
        status,
        tip:
          status === 'bra'
            ? 'Lagom mängd rött kött och chark – bra för både hälsan och klimatet.'
            : status === 'nastan'
              ? 'Strax över – byt en köttmåltid mot fisk, kyckling eller baljväxter så jämnar det ut sig.'
              : 'Lite mer rött kött och chark än rådet den här perioden. Testa en köttfri dag eller blanda färsen med linser – ett steg i taget räcker.',
        emoji: '🥩',
        periodDays: nFood,
        weeklyTarget: weekly,
        source: 'Livsmedelsverket 2025',
      })
    }

    // --- Salt --------------------------------------------------------------
    {
      const target = KOSTRAD_TARGETS.saltPerDay
      const actual = nut.salt.sum / nFood
      const coverage = coverageOf('salt')
      const status = maxStatus(actual, target)
      results.push({
        id: 'salt',
        title: 'Salt',
        advice: 'Ät högst 6 gram salt om dagen och välj jodberikat salt.',
        unit: 'g/dag',
        target,
        actual,
        perDay: true,
        direction: 'hogst',
        score: maxScore(actual, target),
        status,
        tip:
          status === 'bra'
            ? 'Bra saltnivå! Tänk på att salt du strör på maten sällan kommer med i registreringen.'
            : status === 'nastan'
              ? 'Strax över 6 gram – smaksätt med örter, citron eller peppar i stället för en del av saltet.'
              : 'Mycket av saltet kommer från bröd, ost, chark och färdigmat. Välj gärna nyckelhålsmärkt och smaka av innan du saltar.',
        emoji: '🧂',
        periodDays: nFood,
        coverage,
        source: 'Livsmedelsverket 2025',
      })
    }

    // --- Mättat fett (E%) --------------------------------------------------
    if (kcal > 0) {
      const target = KOSTRAD_TARGETS.satFatPct
      const actual = ((nut.satFat.sum * 9) / kcal) * 100
      const status = maxStatus(actual, target)
      results.push({
        id: 'mattat_fett',
        title: 'Mättat fett',
        advice: 'Välj rapsolja och flytande margarin framför smör – högst 10 % av energin från mättat fett.',
        unit: 'E%',
        target,
        actual,
        perDay: true,
        direction: 'hogst',
        score: maxScore(actual, target),
        status,
        tip:
          status === 'bra'
            ? 'Bra fettbalans – mest omättat fett.'
            : status === 'nastan'
              ? 'Nästan! Byt smör mot flytande margarin eller rapsolja i matlagningen.'
              : 'Byt gärna till rapsolja och flytande margarin, och välj magrare mejeriprodukter och chark oftare.',
        emoji: '🧈',
        periodDays: nFood,
        coverage: coverageOf('satFat'),
        source: 'Livsmedelsverket 2025, NNR 2023',
      })
    }

    // --- Socker (E%) -------------------------------------------------------
    if (kcal > 0) {
      const target = KOSTRAD_TARGETS.sugarPct
      const actual = ((nut.addedSugar.sum * 4) / kcal) * 100
      const coverage = coverageOf('addedSugar')
      const status = maxStatus(actual, target)
      results.push({
        id: 'socker',
        title: 'Socker',
        advice: 'Ät mindre godis, bakverk och glass och drick mindre läsk och saft – högst 10 % av energin från socker.',
        unit: 'E%',
        target,
        actual,
        perDay: true,
        direction: 'hogst',
        score: maxScore(actual, target),
        status,
        tip:
          (status === 'bra'
            ? 'Lagom med socker – fint!'
            : status === 'nastan'
              ? 'Strax över – vatten eller mineralvatten till maten i stället för läsk gör skillnad.'
              : 'Njut av fikat, men låt läsk och godis vara något för ibland. Frukt, bär och osötad yoghurt är goda vardagsval.') +
          (coverage < 0.5 ? ' Tillsatt socker saknas för en del livsmedel, så siffran kan vara för låg.' : ''),
        emoji: '🍬',
        periodDays: nFood,
        coverage,
        source: 'Livsmedelsverket 2025, NNR 2023',
      })
    }

    // --- Alkohol -----------------------------------------------------------
    {
      const drinks = alcoholG / STANDARD_DRINK_G
      const weeklyEquivalent = (drinks * 7) / nFood
      const risk = KOSTRAD_TARGETS.alkoholRiskPerWeek
      const status: KostradStatus = drinks <= 0.05 ? 'bra' : weeklyEquivalent < risk / 2 ? 'nastan' : 'over'
      results.push({
        id: 'alkohol',
        title: 'Alkohol',
        advice: 'Håll igen på alkohol – det finns ingen säker nivå, och ju mindre desto bättre.',
        unit: 'standardglas',
        target: 0,
        actual: drinks,
        direction: 'hogst',
        score: status === 'bra' ? 1 : clamp01(1 - weeklyEquivalent / risk),
        status,
        tip:
          status === 'bra'
            ? 'Ingen alkohol registrerad – bra för både sömn och hälsa.'
            : status === 'nastan'
              ? 'Lite alkohol. Ju mindre desto bättre – alkoholfria alternativ blir allt godare.'
              : 'Även en liten minskning är bra för hälsan. Vill du prata med någon finns Alkoholhjälpen på 020-84 44 48.',
        emoji: '🍷',
        periodDays: nFood,
        source: 'Livsmedelsverket 2025, NNR 2023, Socialstyrelsen',
      })
    }
  }

  // --- Rörelse -------------------------------------------------------------
  {
    // Samma regel som Träningssidan (Folkhälsomyndigheten): hög intensitet räknas dubbelt,
    // lätt aktivitet (under 3 MET, t.ex. stretching) räknas inte.
    let minutes = 0
    for (const date of activityDays) minutes += moderateEquivalentMinutes(input.exerciseByDate[date] ?? [])
    const weekly = KOSTRAD_TARGETS.rorelsePerWeek
    const target = (weekly * nAct) / 7
    const ratio = target > 0 ? minutes / target : 0
    const status = minStatus(ratio)
    results.push({
      id: 'rorelse',
      title: 'Rörelse',
      advice:
        'Rör på dig minst 150 minuter i veckan med måttlig intensitet (eller 75 minuter med hög), och träna musklerna minst två gånger i veckan.',
      unit: 'min',
      target,
      actual: minutes,
      direction: 'minst',
      score: clamp01(ratio),
      status,
      tip:
        status === 'bra'
          ? 'Toppen – du rör på dig som rekommenderat! Minuter med hög intensitet räknas dubbelt.'
          : status === 'nastan'
            ? 'Nästan i mål! En rask promenad till så är du där.'
            : 'All rörelse räknas – promenader, cykling till jobbet och trädgårdsarbete. Sprid gärna ut minuterna över veckan.',
      emoji: '🚶',
      periodDays: nAct,
      weeklyTarget: weekly,
      source: 'Folkhälsomyndigheten 2021',
    })
  }

  return results
}

/**
 * Sammanfattande poäng 0–100 (medelvärdet av alla råds poäng). Råd med låg täckningsgrad
 * (< 50 %) räknas inte, eftersom resultatet då är osäkert.
 */
export function kostradScore(results: readonly KostradResult[]): number {
  const usable = results.filter((r) => r.coverage === undefined || r.coverage >= 0.5)
  if (usable.length === 0) return 0
  return Math.round((usable.reduce((s, r) => s + r.score, 0) / usable.length) * 100)
}
