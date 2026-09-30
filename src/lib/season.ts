/**
 * Årstider, solens gång och säsongens råvaror i Sverige.
 *
 * - Årstid: kalenderbaserad (meteorologisk) indelning – vinter dec–feb, vår mars–maj,
 *   sommar juni–aug, höst sep–nov. SMHI definierar årstiderna utifrån dygnsmedeltemperaturen,
 *   vilket gör att t.ex. vintern kommer tidigare i Norrland; för appens tema och tips räcker
 *   den enkla kalenderindelningen.
 * - Solens upp- och nedgång: NOAA:s solberäkningar (Solar Calculator, baserad på Jean Meeus
 *   "Astronomical Algorithms"). Soluppgång/solnedgång avser när solens övre kant är vid horisonten
 *   med normal ljusbrytning (zenitvinkel 90,833°). Noggrannheten är ungefär en minut på
 *   svenska breddgrader. Midnattssol och polarnatt hanteras.
 * - Säsongens råvaror: svenska grönsaker, frukt, bär, svamp och fisk/skaldjur per månad, sammanställt
 *   från säsongskalendrar (bl.a. ICA, Martin & Servera, Äkta vara) och Havs- och vattenmyndighetens
 *   fiskeregler. Lagrade svenska råvaror (rotfrukter, kål, äpplen) räknas under vintern.
 */
import type { ISODate } from '../types'
import { fromISODate } from './dates'

// ---------------------------------------------------------------------------
// Årstider
// ---------------------------------------------------------------------------

export type Season = 'vinter' | 'var' | 'sommar' | 'host'

export interface SeasonInfo {
  label: string
  emoji: string
  /** Månader (1–12) som ingår. */
  months: readonly number[]
  /** Kort stämningsrad för t.ex. dagens rubrik. */
  tagline: string
}

export const SEASONS: Record<Season, SeasonInfo> = {
  vinter: { label: 'Vinter', emoji: '❄️', months: [12, 1, 2], tagline: 'Mörka kvällar, varma soppor och ljus i fönstren' },
  var: { label: 'Vår', emoji: '🌱', months: [3, 4, 5], tagline: 'Ljuset återvänder och det första gröna tittar fram' },
  sommar: { label: 'Sommar', emoji: '☀️', months: [6, 7, 8], tagline: 'Ljusa nätter, färskpotatis och bär i skogen' },
  host: { label: 'Höst', emoji: '🍂', months: [9, 10, 11], tagline: 'Skördetid med svamp, äpplen och rotfrukter' },
}

/** Ordning från årets början (januari ligger i vintern). */
export const SEASON_ORDER: readonly Season[] = ['vinter', 'var', 'sommar', 'host']

function toDate(date: Date | ISODate): Date {
  return typeof date === 'string' ? fromISODate(date) : date
}

/** Årstiden för ett datum (lokal kalenderdag). */
export function swedishSeason(date: Date | ISODate = new Date()): Season {
  const m = toDate(date).getMonth() + 1
  if (m === 12 || m <= 2) return 'vinter'
  if (m <= 5) return 'var'
  if (m <= 8) return 'sommar'
  return 'host'
}

/** "Vinter", "Vår", "Sommar" eller "Höst". */
export function seasonLabel(season: Season): string {
  return SEASONS[season].label
}

// ---------------------------------------------------------------------------
// Orter
// ---------------------------------------------------------------------------

export interface City {
  id: string
  name: string
  /** Latitud i grader (norr positiv). */
  lat: number
  /** Longitud i grader (öster positiv). */
  lon: number
}

/** Förinställda orter från söder till norr. Stockholm är standard i appen. */
export const SWEDISH_CITIES: readonly City[] = [
  { id: 'malmo', name: 'Malmö', lat: 55.605, lon: 13.0038 },
  { id: 'goteborg', name: 'Göteborg', lat: 57.7089, lon: 11.9746 },
  { id: 'visby', name: 'Visby', lat: 57.6348, lon: 18.2948 },
  { id: 'stockholm', name: 'Stockholm', lat: 59.3293, lon: 18.0686 },
  { id: 'uppsala', name: 'Uppsala', lat: 59.8586, lon: 17.6389 },
  { id: 'ostersund', name: 'Östersund', lat: 63.1792, lon: 14.6357 },
  { id: 'umea', name: 'Umeå', lat: 63.8258, lon: 20.263 },
  { id: 'lulea', name: 'Luleå', lat: 65.5848, lon: 22.1547 },
  { id: 'kiruna', name: 'Kiruna', lat: 67.8558, lon: 20.2253 },
]

export const DEFAULT_LAT = 59.33
export const DEFAULT_LON = 18.07

/** Hämta en förinställd ort via id, t.ex. 'kiruna'. */
export function cityById(id: string): City | undefined {
  return SWEDISH_CITIES.find((c) => c.id === id)
}

// ---------------------------------------------------------------------------
// Solberäkningar (NOAA)
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180
const sinD = (deg: number) => Math.sin(deg * RAD)
const cosD = (deg: number) => Math.cos(deg * RAD)
const tanD = (deg: number) => Math.tan(deg * RAD)

/** Juliansk dag vid 00.00 UT för ett kalenderdatum (månad 1–12). */
function julianDay(year: number, month: number, day: number): number {
  let y = year
  let m = month
  if (m <= 2) {
    y -= 1
    m += 12
  }
  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5
}

/** Julianska sekel sedan J2000.0. */
const julianCentury = (jd: number) => (jd - 2451545) / 36525

function geomMeanLongSun(t: number): number {
  const l0 = 280.46646 + t * (36000.76983 + t * 0.0003032)
  return ((l0 % 360) + 360) % 360
}

const geomMeanAnomalySun = (t: number) => 357.52911 + t * (35999.05029 - 0.0001537 * t)
const eccentricityEarthOrbit = (t: number) => 0.016708634 - t * (0.000042037 + 0.0000001267 * t)

function sunEqOfCenter(t: number): number {
  const m = geomMeanAnomalySun(t)
  return sinD(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) + sinD(2 * m) * (0.019993 - 0.000101 * t) + sinD(3 * m) * 0.000289
}

function sunApparentLong(t: number): number {
  const trueLong = geomMeanLongSun(t) + sunEqOfCenter(t)
  const omega = 125.04 - 1934.136 * t
  return trueLong - 0.00569 - 0.00478 * sinD(omega)
}

function obliquityCorrection(t: number): number {
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))
  const e0 = 23 + (26 + seconds / 60) / 60
  const omega = 125.04 - 1934.136 * t
  return e0 + 0.00256 * cosD(omega)
}

/** Solens deklination i grader. */
function sunDeclination(t: number): number {
  return Math.asin(sinD(obliquityCorrection(t)) * sinD(sunApparentLong(t))) / RAD
}

/** Tidsekvationen i minuter (skillnaden mellan sann och medelsoltid). */
function equationOfTime(t: number): number {
  const epsilon = obliquityCorrection(t)
  const l0 = geomMeanLongSun(t)
  const e = eccentricityEarthOrbit(t)
  const m = geomMeanAnomalySun(t)
  const y = tanD(epsilon / 2) ** 2
  const eTime =
    y * sinD(2 * l0) -
    2 * e * sinD(m) +
    4 * e * y * sinD(m) * cosD(2 * l0) -
    0.5 * y * y * sinD(4 * l0) -
    1.25 * e * e * sinD(2 * m)
  return (4 * eTime) / RAD
}

/** Zenitvinkel för soluppgång/solnedgång: övre kanten vid horisonten inklusive ljusbrytning. */
const SUNRISE_ZENITH = 90.833

type RiseSet = number | 'polarnatt' | 'midnattssol'

/** Minuter efter 00.00 UT för soluppgång (rise) eller solnedgång, eller polart läge. */
function riseSetUtcMinutes(rise: boolean, jd: number, lat: number, lon: number): RiseSet {
  const t = julianCentury(jd)
  const eq = equationOfTime(t)
  const decl = sunDeclination(t)
  const haArg = cosD(SUNRISE_ZENITH) / (cosD(lat) * cosD(decl)) - tanD(lat) * tanD(decl)
  if (haArg > 1) return 'polarnatt'
  if (haArg < -1) return 'midnattssol'
  const ha = (Math.acos(haArg) / RAD) * (rise ? 1 : -1)
  return 720 - 4 * (lon + ha) - eq
}

export type PolarState = 'midnattssol' | 'polarnatt'

export interface SunTimes {
  /** Soluppgång, eller null vid midnattssol/polarnatt. */
  sunrise: Date | null
  /** Solnedgång, eller null vid midnattssol/polarnatt. */
  sunset: Date | null
  /** Sann middag – solen står som högst. */
  solarNoon: Date
  /** Timmar med solen över horisonten (24 vid midnattssol, 0 vid polarnatt). */
  daylightHours: number
  polar: PolarState | null
}

/**
 * Soluppgång, solnedgång och dagsljus för en kalenderdag på en plats.
 * `date` tolkas som lokal kalenderdag (ett `Date` tas som sitt lokala datum).
 * Tiderna returneras som `Date` (absolut tidpunkt) och visas i enhetens tidszon.
 */
export function sunTimes(date: Date | ISODate = new Date(), lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON): SunTimes {
  const d = toDate(date)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  const jd0 = julianDay(year, month, day)
  const utcMidnight = Date.UTC(year, month - 1, day)
  const at = (minutes: number) => new Date(utcMidnight + Math.round(minutes * 60_000))

  // Sann middag (två iterationer räcker gott).
  let noonMin = 720 - 4 * lon - equationOfTime(julianCentury(jd0 + 0.5 - lon / 360))
  noonMin = 720 - 4 * lon - equationOfTime(julianCentury(jd0 + noonMin / 1440))
  const solarNoon = at(noonMin)

  // Polart läge avgörs vid dagens högsta (eller lägsta) solstånd.
  const declNoon = sunDeclination(julianCentury(jd0 + noonMin / 1440))
  const haArg = cosD(SUNRISE_ZENITH) / (cosD(lat) * cosD(declNoon)) - tanD(lat) * tanD(declNoon)
  if (haArg > 1) return { sunrise: null, sunset: null, solarNoon, daylightHours: 0, polar: 'polarnatt' }
  if (haArg < -1) return { sunrise: null, sunset: null, solarNoon, daylightHours: 24, polar: 'midnattssol' }

  const refine = (rise: boolean): number | null => {
    const first = riseSetUtcMinutes(rise, jd0, lat, lon)
    if (typeof first !== 'number') return null
    const second = riseSetUtcMinutes(rise, jd0 + first / 1440, lat, lon)
    return typeof second === 'number' ? second : first
  }
  const riseMin = refine(true)
  const setMin = refine(false)
  if (riseMin === null || setMin === null) {
    // Gränsfall precis vid polarnattens/midnattssolens början – bedöm utifrån middagen.
    const polar: PolarState = declNoon * lat > 0 ? 'midnattssol' : 'polarnatt'
    return { sunrise: null, sunset: null, solarNoon, daylightHours: polar === 'midnattssol' ? 24 : 0, polar }
  }
  const sunrise = at(riseMin)
  const sunset = at(setMin)
  return {
    sunrise,
    sunset,
    solarNoon,
    daylightHours: Math.max(0, (sunset.getTime() - sunrise.getTime()) / 3_600_000),
    polar: null,
  }
}

/**
 * Solens höjd över horisonten i grader vid en viss tidpunkt (utan ljusbrytning).
 * Negativt värde = solen är under horisonten.
 */
export function sunAltitude(time: Date = new Date(), lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON): number {
  return solarPosition(time, lat, lon).altitude
}

function solarPosition(time: Date, lat: number, lon: number): { altitude: number; hourAngle: number } {
  const jd = time.getTime() / 86_400_000 + 2440587.5
  const t = julianCentury(jd)
  const decl = sunDeclination(t)
  const eq = equationOfTime(t)
  const utcMinutes = time.getUTCHours() * 60 + time.getUTCMinutes() + time.getUTCSeconds() / 60
  const trueSolarTime = (((utcMinutes + eq + 4 * lon) % 1440) + 1440) % 1440
  let hourAngle = trueSolarTime / 4 - 180
  if (hourAngle < -180) hourAngle += 360
  const cosZenith = sinD(lat) * sinD(decl) + cosD(lat) * cosD(decl) * cosD(hourAngle)
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith))) / RAD
  return { altitude: 90 - zenith, hourAngle }
}

// ---------------------------------------------------------------------------
// Himlens fas (för säsongsillustrationen)
// ---------------------------------------------------------------------------

export type SkyPhase = 'natt' | 'gryning' | 'dag' | 'skymning'

export const SKY_PHASE_LABELS: Record<SkyPhase, string> = {
  natt: 'Natt',
  gryning: 'Gryning',
  dag: 'Dag',
  skymning: 'Skymning',
}

/** Under denna solhöjd (grader) är det natt – slutet på den borgerliga skymningen. */
export const NIGHT_ALTITUDE = -6
/** Över denna solhöjd är det fullt dagsljus; mellan gränserna är det gryning eller skymning. */
export const DAY_ALTITUDE = 3

/**
 * Himlens fas vid en tidpunkt: 'natt' (solen lägre än 6° under horisonten), 'gryning'/'skymning'
 * (lågt stående sol före/efter sann middag) eller 'dag'. Under polarnatten blir det gryning
 * och skymning mitt på dagen, och under midnattssolen blir det aldrig natt – precis som i verkligheten.
 */
export function skyPhase(now: Date = new Date(), lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON): SkyPhase {
  const { altitude, hourAngle } = solarPosition(now, lat, lon)
  if (altitude < NIGHT_ALTITUDE) return 'natt'
  if (altitude < DAY_ALTITUDE) return hourAngle < 0 ? 'gryning' : 'skymning'
  return 'dag'
}

// ---------------------------------------------------------------------------
// Säsongens råvaror
// ---------------------------------------------------------------------------

export type ProduceKind = 'grönsak' | 'frukt' | 'bär' | 'svamp' | 'fisk'

export interface Produce {
  name: string
  emoji: string
  kind: ProduceKind
}

type P = Produce
const g = (name: string, emoji: string): P => ({ name, emoji, kind: 'grönsak' })
const f = (name: string, emoji: string): P => ({ name, emoji, kind: 'frukt' })
const b = (name: string, emoji: string): P => ({ name, emoji, kind: 'bär' })
const s = (name: string, emoji = '🍄'): P => ({ name, emoji, kind: 'svamp' })
const fi = (name: string, emoji: string): P => ({ name, emoji, kind: 'fisk' })

// Återkommande råvaror
const VITKAL = g('Vitkål', '🥬')
const RODKAL = g('Rödkål', '🥬')
const GRONKAL = g('Grönkål', '🥬')
const BRYSSELKAL = g('Brysselkål', '🥬')
const MOROT = g('Morötter', '🥕')
const KALROT = g('Kålrot', '🥕')
const PALSTERNACKA = g('Palsternacka', '🥕')
const RODBETA = g('Rödbetor', '🥕')
const ROTSELLERI = g('Rotselleri', '🥕')
const JORDARTSKOCKA = g('Jordärtskocka', '🥔')
const LOK = g('Gul lök', '🧅')
const PURJO = g('Purjolök', '🧅')
const POTATIS = g('Potatis', '🥔')
const FARSKPOTATIS = g('Färskpotatis', '🥔')
const GURKA = g('Gurka (växthus)', '🥒')
const TOMAT = g('Tomater', '🍅')
const RABARBER = g('Rabarber', '🌱')
const SPARRIS = g('Sparris', '🌱')
const RAMSLOK = g('Ramslök', '🌿')
const NASSLOR = g('Nässlor', '🌿')
const RADISOR = g('Rädisor', '🔴')
const SPENAT = g('Spenat', '🥬')
const SALLAD = g('Sallad', '🥬')
const SOCKERARTOR = g('Sockerärtor', '🫛')
const ARTOR = g('Gröna ärtor', '🫛')
const BONOR = g('Haricots verts', '🫛')
const SPETSKAL = g('Spetskål', '🥬')
const BLOMKAL = g('Blomkål', '🥦')
const BROCCOLI = g('Broccoli', '🥦')
const ZUCCHINI = g('Zucchini', '🥒')
const MAJS = g('Majs', '🌽')
const PUMPA = g('Pumpa', '🎃')
const DILL = g('Dill', '🌿')

const APPLE = f('Äpplen', '🍎')
const APPLE_LAGRAT = f('Äpplen (lagrade)', '🍎')
const PARON = f('Päron', '🍐')
const PLOMMON = f('Plommon', '🟣')
const KORSBAR = f('Körsbär', '🍒')

const JORDGUBBAR = b('Jordgubbar', '🍓')
const SMULTRON = b('Smultron', '🍓')
const HALLON = b('Hallon', '🔴')
const BLABAR = b('Blåbär', '🫐')
const VINBAR = b('Vinbär', '🍇')
const KRUSBAR = b('Krusbär', '🟢')
const HJORTRON = b('Hjortron', '🟠')
const LINGON = b('Lingon', '🔴')
const BJORNBAR = b('Björnbär', '🫐')
const HAVTORN = b('Havtorn', '🟠')
const TRANBAR = b('Tranbär', '🔴')

const KANTARELL = s('Kantareller')
const KARLJOHAN = s('Karljohansvamp')
const TRATTKANTARELL = s('Trattkantareller')
const CHAMPINJON = s('Champinjoner (odlade)')

const STROMMING = fi('Strömming', '🐟')
const SILL = fi('Sill', '🐟')
const MAKRILL = fi('Makrill', '🐟')
const KRAFTOR = fi('Kräftor', '🦞')
const HUMMER = fi('Hummer', '🦞')
const OSTRON = fi('Ostron', '🦪')
const MUSSLOR = fi('Blåmusslor', '🦪')
const LOJROM = fi('Löjrom', '🟠')
const RAKOR = fi('Räkor', '🦐')
const SURSTROMMING = fi('Surströmming', '🐟')

/** Vinterns lagerråvaror (svenska, lagrade). */
const WINTER_STORAGE: readonly P[] = [VITKAL, RODKAL, MOROT, KALROT, PALSTERNACKA, RODBETA, ROTSELLERI, LOK, POTATIS, APPLE_LAGRAT, CHAMPINJON]

const PRODUCE_BY_MONTH: Record<number, readonly P[]> = {
  1: [...WINTER_STORAGE, GRONKAL, JORDARTSKOCKA, PURJO, SILL, STROMMING, OSTRON, MUSSLOR, RAKOR],
  2: [...WINTER_STORAGE, JORDARTSKOCKA, PURJO, SILL, STROMMING, OSTRON, MUSSLOR, RAKOR],
  3: [...WINTER_STORAGE, GURKA, SILL, STROMMING, OSTRON, MUSSLOR, RAKOR],
  4: [VITKAL, MOROT, RODBETA, LOK, POTATIS, APPLE_LAGRAT, CHAMPINJON, GURKA, TOMAT, RABARBER, RAMSLOK, NASSLOR, SALLAD, STROMMING, SILL, OSTRON, MUSSLOR, RAKOR],
  5: [RABARBER, SPARRIS, RAMSLOK, NASSLOR, RADISOR, SPENAT, SALLAD, GURKA, TOMAT, POTATIS, CHAMPINJON, STROMMING, MAKRILL, RAKOR],
  6: [FARSKPOTATIS, SPARRIS, RABARBER, RADISOR, SPENAT, SALLAD, SPETSKAL, SOCKERARTOR, DILL, GURKA, TOMAT, JORDGUBBAR, STROMMING, MAKRILL, RAKOR],
  7: [FARSKPOTATIS, SOCKERARTOR, ARTOR, SPETSKAL, BLOMKAL, BROCCOLI, ZUCCHINI, MOROT, GURKA, TOMAT, DILL, KORSBAR, JORDGUBBAR, SMULTRON, HALLON, BLABAR, VINBAR, KRUSBAR, HJORTRON, KANTARELL, MAKRILL, STROMMING, RAKOR, MUSSLOR],
  8: [POTATIS, MAJS, BLOMKAL, BROCCOLI, BONOR, ZUCCHINI, TOMAT, GURKA, MOROT, RODBETA, LOK, APPLE, PARON, PLOMMON, BLABAR, HALLON, BJORNBAR, HJORTRON, LINGON, KANTARELL, KARLJOHAN, KRAFTOR, SURSTROMMING, MAKRILL, STROMMING, MUSSLOR, RAKOR],
  9: [POTATIS, MAJS, BLOMKAL, BROCCOLI, VITKAL, RODKAL, BRYSSELKAL, PURJO, PUMPA, ZUCCHINI, MOROT, KALROT, PALSTERNACKA, RODBETA, TOMAT, APPLE, PARON, PLOMMON, LINGON, HAVTORN, TRANBAR, BLABAR, KANTARELL, KARLJOHAN, TRATTKANTARELL, HUMMER, LOJROM, KRAFTOR, MAKRILL, STROMMING, OSTRON, MUSSLOR, RAKOR],
  10: [POTATIS, VITKAL, RODKAL, GRONKAL, BRYSSELKAL, PURJO, PUMPA, MOROT, KALROT, PALSTERNACKA, RODBETA, ROTSELLERI, JORDARTSKOCKA, APPLE, PARON, LINGON, TRANBAR, TRATTKANTARELL, HUMMER, LOJROM, OSTRON, MUSSLOR, SILL, RAKOR],
  11: [POTATIS, VITKAL, RODKAL, GRONKAL, BRYSSELKAL, PURJO, MOROT, KALROT, PALSTERNACKA, RODBETA, ROTSELLERI, JORDARTSKOCKA, APPLE, TRATTKANTARELL, CHAMPINJON, HUMMER, OSTRON, MUSSLOR, SILL, RAKOR],
  12: [...WINTER_STORAGE, GRONKAL, BRYSSELKAL, JORDARTSKOCKA, PURJO, SILL, HUMMER, OSTRON, MUSSLOR, RAKOR],
}

/**
 * Svenska råvaror i säsong en viss månad (1 = januari … 12 = december), i ordningen
 * grönsaker, frukt, bär, svamp, fisk och skaldjur. Månader utanför 1–12 räknas om (13 → 1, 0 → 12).
 * Returnerar en ny array med nya objekt.
 */
export function seasonalProduce(month: number): Produce[] {
  const m = ((((Math.round(month) - 1) % 12) + 12) % 12) + 1
  const order: Record<ProduceKind, number> = { grönsak: 0, frukt: 1, bär: 2, svamp: 3, fisk: 4 }
  return PRODUCE_BY_MONTH[m]
    .map((p, i) => ({ p, i }))
    .sort((x, y) => order[x.p.kind] - order[y.p.kind] || x.i - y.i)
    .map(({ p }) => ({ ...p }))
}

/** Säsongens råvaror för ett datum (bekvämlighetsfunktion). */
export function seasonalProduceFor(date: Date | ISODate = new Date()): Produce[] {
  return seasonalProduce(toDate(date).getMonth() + 1)
}
