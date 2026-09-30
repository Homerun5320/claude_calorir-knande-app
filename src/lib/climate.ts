/**
 * Matens klimatavtryck i kg koldioxidekvivalenter (kg CO2e).
 *
 * Schablonerna per kategori bygger i första hand på RISE Klimatdatabas för livsmedel ("Öppna listan",
 * v 2.1, 2022): klimatavtryck per kg livsmedel från odling/uppfödning till och med industrins grind,
 * inklusive transport till Sverige för importerade varor – men utan förpackning, butik, matlagning
 * och svinn. Där RISE inte ger ett direkt kategorivärde används en uppskattning, tydligt markerad
 * "Lagoms uppskattning". Alla värden är ungefärliga: livscykelanalys är ingen exakt vetenskap, och
 * samma livsmedel kan skilja sig mycket mellan producenter.
 *
 * Referensnivåer:
 * - Naturvårdsverket: svenska hushålls konsumtion av mat och dryck ger ca 1,7 ton CO2e per person
 *   och år, dvs. ca 4,7 kg per dag (inklusive hela kedjan, så inte helt jämförbart med RISE-värdena).
 * - WWF One Planet Plate: en klimatbudget för mat på ca 11 kg CO2e per person och vecka (≈ 1,6 kg/dag)
 *   i linje med 1,5-gradersmålet; högst 0,5 kg per lunch eller middag.
 */
import type { DiaryEntry, Food, FoodCategory } from '../types'
import { formatNumber } from './format'

// ---------------------------------------------------------------------------
// Schabloner
// ---------------------------------------------------------------------------

export interface ClimateFactor {
  /** kg CO2e per kg livsmedel. */
  kgPerKg: number
  /** Källa eller "Lagoms uppskattning". */
  source: string
}

/** Källans fullständiga namn (samma som under Om Lagom). */
export const RISE_SOURCE = 'Öppna listan – ett utdrag från RISE klimatdatabas för livsmedel v 2.1 (2022)'
const RISE = RISE_SOURCE
const EST = 'Lagoms uppskattning'

/** Klimatschablon per kategori (kg CO2e per kg ätlig vara, som den registreras). */
export const CATEGORY_CO2E: Record<FoodCategory, ClimateFactor> = {
  gronsaker: { kgPerKg: 0.6, source: `${EST} (frilandsgrönsaker ca 0,1–0,5, växthus och import högre)` },
  rotfrukter: { kgPerKg: 0.15, source: `${EST} (morot, rödbeta och kålrot odlas på friland i Sverige)` },
  potatis: { kgPerKg: 0.1, source: RISE },
  frukt: { kgPerKg: 0.5, source: EST },
  bar: { kgPerKg: 0.7, source: EST },
  // RISE: torkade bruna bönor 0,5, torkade linser 0,3 kg/kg. Tillagade/konserverade väger ca 2,5 gånger mer.
  baljvaxter: { kgPerKg: 0.4, source: `${EST} utifrån ${RISE}` },
  notter_fron: { kgPerKg: 1.5, source: EST },
  spannmal: { kgPerKg: 0.6, source: EST },
  brod: { kgPerKg: 0.7, source: `${RISE}: mjukt vetebröd` },
  // RISE: okokt spagetti 0,8 kg/kg. Ris har betydligt högre avtryck (se nyckelord nedan).
  pasta_ris: { kgPerKg: 0.8, source: `${RISE}: spagetti, okokt` },
  mejeri: { kgPerKg: 1.3, source: `${EST} (RISE: mjölk 0,9–1,3 kg/kg)` },
  ost: { kgPerKg: 11, source: RISE },
  agg: { kgPerKg: 1.4, source: RISE },
  // Viktat snitt av svensk konsumtion av nöt (28) och fläsk (4,4) – nyckelord förfinar per djurslag.
  rott_kott: { kgPerKg: 14, source: `${EST} utifrån ${RISE}` },
  chark: { kgPerKg: 6, source: `${EST} (mest fläskbaserad)` },
  fagel: { kgPerKg: 3.3, source: `${RISE}: kyckling` },
  fisk: { kgPerKg: 2.5, source: `${EST} (RISE: laxfilé 2,3)` },
  skaldjur: { kgPerKg: 7, source: `${RISE}: räkor utan skal` },
  vegoprotein: { kgPerKg: 1.5, source: EST },
  vaxtdryck: { kgPerKg: 0.4, source: EST },
  // Rapsolja och margarin dominerar; smör (7 kg/kg enligt RISE) fångas med nyckelord.
  fett_olja: { kgPerKg: 1.5, source: `${EST} (RISE: margarin 1,1, smör 7)` },
  sas_krydda: { kgPerKg: 1.2, source: EST },
  sotsaker: { kgPerKg: 2, source: `${EST} (RISE: socker 0,6)` },
  bakverk: { kgPerKg: 1.5, source: EST },
  glass_dessert: { kgPerKg: 2, source: EST },
  snacks: { kgPerKg: 1.8, source: EST },
  dryck: { kgPerKg: 0.2, source: `${RISE}: bryggt kaffe 0,2 kg/l` },
  lask_saft: { kgPerKg: 0.2, source: `${EST} (RISE: läsk ca 0,1 kg/l)` },
  juice: { kgPerKg: 0.6, source: `${RISE}: apelsinjuice` },
  alkohol: { kgPerKg: 0.9, source: `${EST} (RISE: öl 0,6 kg/l; vin och sprit högre)` },
  fardigratt: { kgPerKg: 2.5, source: EST },
  snabbmat: { kgPerKg: 4, source: EST },
  kosttillskott: { kgPerKg: 4, source: EST },
  ovrigt: { kgPerKg: 1.5, source: EST },
}

/** Hamburgare av nötkött (inte kyckling-, fisk- eller vegoburgare). */
const BEEF_BURGER = /(^|[^a-zåäö])(hamburgare|cheeseburgare|nötburgare|hamburger)/
/** Vilt från jakt. */
const GAME = /älg|rådjur|hjort|vildsvin|vilt/
const LAMB = /lamm|fårkött|fårstek|fårfärs/
const BEEF = /nöt|biff|oxfilé|entrecôte|entrecote|högrev|rostbiff|fransyska|kalv/
const PORK = /fläsk|bacon|skinka|kotlett|karré|revbensspjäll|kassler|isterband/
const RICE = /(^|[^a-zåäö])ris([^a-zåäö]|$)|jasminris|basmatiris|risotto|fullkornsris|råris/

/**
 * Förfining utifrån namnet när kategorin rymmer livsmedel med mycket olika avtryck
 * (t.ex. nötfärs 28 kg/kg mot fläskfärs 4,4 kg/kg). Första träffen gäller.
 */
export const NAME_CO2E_RULES: ReadonlyArray<{ pattern: RegExp; categories?: readonly FoodCategory[]; kgPerKg: number; source: string }> = [
  // Vilt först, så att t.ex. "älgkalv" inte räknas som nötkött.
  { pattern: GAME, categories: ['rott_kott', 'chark'], kgPerKg: 1.5, source: `${EST} (vilt från jakt saknar foder- och djurhållningsutsläpp)` },
  { pattern: /blandfärs/, categories: ['rott_kott'], kgPerKg: 16, source: `${EST} (hälften nöt, hälften fläsk enligt ${RISE})` },
  // Värdet för svenskt lammkött kommer från en äldre version av RISE klimatdatabas och har inte
  // kunnat stämmas av mot Öppna listan v 2.1 – därför redovisas det som Lagoms uppskattning.
  { pattern: LAMB, categories: ['rott_kott', 'chark'], kgPerKg: 21, source: `${EST} (svenskt lammkött)` },
  { pattern: BEEF, categories: ['rott_kott', 'chark'], kgPerKg: 28, source: `${RISE}: nötkött` },
  // Sammansatta rätter och hamburgare med nöt- eller lammkött: ungefär en tredjedel kött per vikt.
  { pattern: BEEF_BURGER, categories: ['snabbmat', 'fardigratt'], kgPerKg: 10, source: `${EST} (ca en tredjedel nötkött)` },
  { pattern: new RegExp(`${BEEF.source}|${LAMB.source}|blandfärs`), categories: ['fardigratt'], kgPerKg: 8, source: `${EST} (ca en tredjedel nöt- eller lammkött)` },
  { pattern: PORK, categories: ['rott_kott', 'chark'], kgPerKg: 4.4, source: `${RISE}: fläskkött` },
  { pattern: /kyckling|kalkon/, categories: ['fagel', 'chark'], kgPerKg: 3.3, source: `${RISE}: kyckling` },
  { pattern: /lax/, categories: ['fisk'], kgPerKg: 2.3, source: `${RISE}: laxfilé` },
  { pattern: /mussl/, categories: ['skaldjur'], kgPerKg: 0.3, source: `${EST} (odlade musslor har mycket lågt avtryck)` },
  { pattern: /smör/, categories: ['fett_olja'], kgPerKg: 7, source: `${RISE}: smör` },
  { pattern: /margarin/, categories: ['fett_olja'], kgPerKg: 1.1, source: `${RISE}: margarin` },
  { pattern: RICE, categories: ['pasta_ris'], kgPerKg: 3.1, source: `${RISE}: jasminris, okokt` },
  { pattern: /grädde/, categories: ['mejeri'], kgPerKg: 4, source: `${EST} (grädde kräver mycket mjölk)` },
]

/** Kokta/tillagade gryn, pasta och baljväxter har tagit upp vatten (ca 2,5 gånger torrvikten). */
const COOKED = /\bkokt|\btillagad|\bkonserverad|\bi burk/
const COOKED_FACTOR = 0.4

/** Klimatfaktor med källa för ett livsmedel. Okänd kategori ger schablonen för "Övrigt". */
export function foodClimateFactor(food: Food): ClimateFactor {
  if (food.co2e !== undefined && Number.isFinite(food.co2e) && food.co2e >= 0) {
    return { kgPerKg: food.co2e, source: food.source === 'openfoodfacts' ? 'Open Food Facts' : 'Livsmedlets eget värde' }
  }
  const name = typeof food.name === 'string' ? food.name.toLowerCase() : ''
  // En sparad ögonblicksbild kan ha en kategori som inte längre finns – använd då "Övrigt".
  let factor: ClimateFactor = Object.hasOwn(CATEGORY_CO2E, food.category) ? CATEGORY_CO2E[food.category] : CATEGORY_CO2E.ovrigt
  for (const rule of NAME_CO2E_RULES) {
    if (rule.categories && !rule.categories.includes(food.category)) continue
    if (rule.pattern.test(name)) {
      factor = { kgPerKg: rule.kgPerKg, source: rule.source }
      break
    }
  }
  // Torrvaruvärden (pasta, ris, gryn) räknas om när varan är kokt: med livsmedlets egen omräkning
  // från okokt vikt (`rawWeight`, t.ex. "Pasta" ×2,5) eller, för äldre namn, när namnet säger "kokt".
  if (food.category === 'pasta_ris' || food.category === 'spannmal') {
    const rw = food.rawWeight
    if (rw && rw.kind !== 'ra' && Number.isFinite(rw.factor) && rw.factor > 1) {
      factor = { kgPerKg: factor.kgPerKg / rw.factor, source: `${factor.source}, omräknat till kokt vikt` }
    } else if (COOKED.test(name)) {
      factor = { kgPerKg: factor.kgPerKg * COOKED_FACTOR, source: `${factor.source}, omräknat till kokt vikt` }
    }
  }
  return factor
}

/** kg CO2e per kg livsmedel: eget värde, annars schablon (kategori + nyckelord i namnet). */
export function foodCo2e(food: Food): number {
  return foodClimateFactor(food).kgPerKg
}

/** kg CO2e för en dagbokspost. Snabbposter saknar vikt och räknas som 0 (okänt). */
export function entryCo2e(entry: DiaryEntry): number {
  if (entry.kind !== 'food' || !Number.isFinite(entry.grams) || entry.grams <= 0) return 0
  return (foodCo2e(entry.food) * entry.grams) / 1000
}

/** Summa kg CO2e för en dag (eller valfria poster). */
export function dayCo2e(entries: readonly DiaryEntry[]): number {
  return entries.reduce((s, e) => s + entryCo2e(e), 0)
}

export interface DayClimate {
  /** kg CO2e. */
  kg: number
  /** Antal poster som inte kunde beräknas (snabbposter utan vikt). */
  unknownEntries: number
  /** kg CO2e per kategori, största först. */
  byCategory: Array<{ category: FoodCategory; kg: number }>
}

/** Detaljerad klimatsumma med fördelning per kategori. */
export function dayClimate(entries: readonly DiaryEntry[]): DayClimate {
  const byCat = new Map<FoodCategory, number>()
  let kg = 0
  let unknownEntries = 0
  for (const e of entries) {
    if (e.kind !== 'food' || !Number.isFinite(e.grams) || e.grams <= 0) {
      if (e.kind === 'quick') unknownEntries++
      continue
    }
    const v = entryCo2e(e)
    kg += v
    byCat.set(e.food.category, (byCat.get(e.food.category) ?? 0) + v)
  }
  const byCategory = [...byCat.entries()].map(([category, v]) => ({ category, kg: v })).sort((a, b) => b.kg - a.kg)
  return { kg, unknownEntries, byCategory }
}

// ---------------------------------------------------------------------------
// Referenser och jämförelser
// ---------------------------------------------------------------------------

export const CLIMATE_REFERENCE = {
  /**
   * Genomsnittlig svensk: ca 1 700 kg CO2e per person och år från mat och dryck (Naturvårdsverket,
   * konsumtionsbaserade utsläpp) ≈ 4,7 kg per dag. Omfattar hela kedjan inklusive butik och svinn,
   * medan Lagoms schabloner slutar vid industrins grind – jämförelsen blir därför något till din fördel.
   */
  averageSwedeKgPerDay: 4.7,
  averageSwedeKgPerYear: 1700,
  /**
   * Referensnivå: WWF One Planet Plate – ca 11 kg CO2e per person och vecka för mat, i linje med
   * 1,5-gradersmålet, ≈ 1,6 kg per dag (0,4 kg frukost + 2 × 0,5 kg lunch/middag + 0,2 kg mellanmål).
   */
  klimatsmartKgPerDay: 1.6,
  klimatsmartKgPerWeek: 11,
  /** One Planet Plate: högst 0,5 kg CO2e per lunch eller middag. */
  onePlanetMealKg: 0.5,
  source: 'Naturvårdsverket; WWF One Planet Plate',
} as const

/**
 * Genomsnittlig personbil i trafik i Sverige 2023: 126 g CO2 per km (Trafikverket, "Vägtrafikens
 * utsläpp 2023"; avgasutsläpp för hela personbilsflottan).
 */
export const CAR_KG_CO2E_PER_KM = 0.126

export interface Co2eEquivalents {
  /** Kilometer med en genomsnittlig svensk personbil. */
  carKm: number
  /** Andel av en genomsnittlig svensks dagliga matutsläpp (1 = en hel dag). */
  averageDayShare: number
  /** Antal One Planet Plate-måltider (0,5 kg) som mängden motsvarar. */
  onePlanetMeals: number
}

/** Gör kg CO2e begripligt: bilkilometer, andel av en genomsnittlig dag och måltider i nivå med referensen. */
export function co2eEquivalents(kg: number): Co2eEquivalents {
  const v = Number.isFinite(kg) && kg > 0 ? kg : 0
  return {
    carKm: v / CAR_KG_CO2E_PER_KM,
    averageDayShare: v / CLIMATE_REFERENCE.averageSwedeKgPerDay,
    onePlanetMeals: v / CLIMATE_REFERENCE.onePlanetMealKg,
  }
}

export type ClimateLevel = 'lag' | 'medel' | 'hog'

export interface ClimateRating {
  level: ClimateLevel
  label: string
  description: string
  /** Designtoken för färg. */
  tone: 'mossa' | 'sol' | 'hjortron'
}

/** Gränser för klimatbetyget per dag (kg CO2e). */
export const CLIMATE_THRESHOLDS = {
  /** Upp till 25 % över One Planet Plate-nivån räknas som låg klimatpåverkan. */
  lag: CLIMATE_REFERENCE.klimatsmartKgPerDay * 1.25,
  /** Över en genomsnittlig svensks nivå räknas som hög. */
  hog: CLIMATE_REFERENCE.averageSwedeKgPerDay,
} as const

/** Klimatbetyg för en dag. Neutral ton – aldrig skuld. */
export function climateRating(kgPerDay: number): ClimateRating {
  const kg = Number.isFinite(kgPerDay) ? Math.max(0, kgPerDay) : 0
  if (kg <= CLIMATE_THRESHOLDS.lag) {
    return {
      level: 'lag',
      label: 'Låg klimatpåverkan',
      description: 'I nivå med WWF:s referensnivå – snyggt!',
      tone: 'mossa',
    }
  }
  if (kg <= CLIMATE_THRESHOLDS.hog) {
    return {
      level: 'medel',
      label: 'Medelhög klimatpåverkan',
      description: 'Lägre än en genomsnittlig svensk. Små byten kan ta dig ännu längre.',
      tone: 'sol',
    }
  }
  return {
    level: 'hog',
    label: 'Hög klimatpåverkan',
    description: 'Högre än en genomsnittlig svensk dag. Kött från idisslare och ost väger tyngst – se tipsen nedan.',
    tone: 'hjortron',
  }
}

// ---------------------------------------------------------------------------
// Bytesförslag
// ---------------------------------------------------------------------------

export interface SwapSuggestion {
  /** Stabilt id för regeln, t.ex. 'notkott'. */
  id: string
  /** Poster som förslaget gäller. */
  entryIds: string[]
  /** Svensk text, t.ex. "Byt nötfärs mot kycklingfärs eller bönor – sparar ca 3,1 kg CO2e". */
  text: string
  /** Uppskattad besparing i kg CO2e. */
  savingKg: number
  /** Vad som byts ut respektive föreslås. */
  from: string
  to: string
}

interface SwapRule {
  id: string
  /** Matchar en post om kategorin stämmer och (om angivet) namnet matchar. */
  categories: readonly FoodCategory[]
  pattern?: RegExp
  /** Namn som aldrig ska matcha (t.ex. kycklingkorv för chark-regeln). */
  exclude?: RegExp
  from: string
  to: string
  /** Klimatfaktor för alternativet (kg CO2e per kg). */
  toKgPerKg: number
}

/**
 * Byten med stor effekt och bibehållen näring, i prioritetsordning. Första matchande regel gäller per post.
 * Alternativens faktorer är försiktiga ungefärliga snitt av de föreslagna alternativen (RISE/Lagoms
 * uppskattning), så att besparingen hellre underskattas än överskattas.
 */
const SWAP_RULES: readonly SwapRule[] = [
  { id: 'notfars', categories: ['rott_kott'], pattern: /nötfärs|blandfärs/, from: 'nötfärsen', to: 'kycklingfärs, sojafärs eller linser', toKgPerKg: 2 },
  { id: 'lamm', categories: ['rott_kott'], pattern: LAMB, from: 'lammköttet', to: 'kyckling eller fisk', toKgPerKg: 3 },
  { id: 'notkott', categories: ['rott_kott'], pattern: BEEF, exclude: GAME, from: 'nötköttet', to: 'kyckling, fisk eller bönor', toKgPerKg: 2.5 },
  { id: 'hamburgare', categories: ['snabbmat', 'fardigratt'], pattern: BEEF_BURGER, from: 'hamburgaren', to: 'en kyckling- eller vegoburgare', toKgPerKg: 3 },
  { id: 'ost', categories: ['ost'], from: 'en del av osten', to: 'hummus, bönröra eller ägg', toKgPerKg: 1.2 },
  { id: 'rakor', categories: ['skaldjur'], pattern: /räk|scampi/, from: 'räkorna', to: 'musslor eller svensk fisk', toKgPerKg: 1.5 },
  { id: 'smor', categories: ['fett_olja'], pattern: /smör/, from: 'smöret', to: 'rapsolja eller flytande margarin', toKgPerKg: 1.3 },
  { id: 'gradde', categories: ['mejeri'], pattern: /grädde/, from: 'grädden', to: 'havrebaserad matlagningsgrädde eller mjölk', toKgPerKg: 1 },
  { id: 'ris', categories: ['pasta_ris'], pattern: RICE, from: 'riset', to: 'potatis, matvete eller bulgur', toKgPerKg: 0.3 },
  { id: 'chark', categories: ['chark'], exclude: /kyckling|kalkon|vego|soja/, from: 'charken', to: 'kycklingpålägg, hummus eller ägg', toKgPerKg: 2 },
  { id: 'rott_kott', categories: ['rott_kott'], exclude: GAME, from: 'köttet', to: 'kyckling eller baljväxter', toKgPerKg: 2 },
]

/** Minsta besparing (kg CO2e) för att ett förslag ska visas. */
export const MIN_SWAP_SAVING_KG = 0.1

/**
 * Konkreta bytesförslag för de poster som har störst klimatavtryck, största besparing först.
 * Besparingen räknas som (postens faktor − alternativets faktor) × vikt.
 */
export function swapSuggestions(entries: readonly DiaryEntry[], limit = 3): SwapSuggestion[] {
  const byRule = new Map<string, SwapSuggestion>()
  for (const e of entries) {
    if (e.kind !== 'food' || !Number.isFinite(e.grams) || e.grams <= 0) continue
    const name = e.food.name.toLowerCase()
    const rule = SWAP_RULES.find(
      (r) => r.categories.includes(e.food.category) && (!r.pattern || r.pattern.test(name)) && !r.exclude?.test(name),
    )
    if (!rule) continue
    const saving = ((foodCo2e(e.food) - rule.toKgPerKg) * e.grams) / 1000
    if (saving <= 0) continue
    const cur = byRule.get(rule.id)
    if (cur) {
      cur.savingKg += saving
      cur.entryIds.push(e.id)
    } else {
      byRule.set(rule.id, { id: rule.id, entryIds: [e.id], text: '', savingKg: saving, from: rule.from, to: rule.to })
    }
  }
  return [...byRule.values()]
    .filter((s) => s.savingKg >= MIN_SWAP_SAVING_KG)
    .sort((a, b) => b.savingKg - a.savingKg)
    .slice(0, Math.max(0, limit))
    .map((s) => ({
      ...s,
      text: `Byt ${s.from} mot ${s.to} – sparar ca ${formatNumber(s.savingKg, 1)} kg CO2e`,
    }))
}
