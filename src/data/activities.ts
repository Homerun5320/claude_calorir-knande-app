/**
 * Aktiviteter med MET-värden från 2024 Adult Compendium of Physical Activities
 * (Herrmann S.D. m.fl., Journal of Sport and Health Science 2024;13(1):6–12, pacompendium.com).
 *
 * - MET (metabolic equivalent of task) = energiförbrukning i förhållande till vila, där 1 MET ≈ 1 kcal
 *   per kg kroppsvikt och timme. Värdena gäller vuxna 19–59 år.
 * - `code` är kompendiets femsiffriga aktivitetskod, så att värdet kan spåras. Svenska aktiviteter
 *   som saknas i kompendiet (padel, bandy, kubb) har ett uppskattat värde från närmaste motsvarighet
 *   och en förklaring i `note`.
 * - Hastigheter är omräknade från mph till km/h. Egna hastigheter kan räknas om med
 *   `metForSpeed` i `src/lib/exercise.ts`, som interpolerar kompendiets tabeller.
 * - Energiberäkning (netto, utöver vila) finns i `src/lib/exercise.ts`.
 */

export type ActivityGroup =
  | 'vardag'
  | 'kondition'
  | 'styrka'
  | 'bollsport'
  | 'vinter'
  | 'friluftsliv'
  | 'vatten'
  | 'dans'
  | 'arbete & hem'

export interface Activity {
  /** Stabilt id, t.ex. 'promenad-rask'. Sparas i `ExerciseEntry.activityId`. */
  id: string
  /** Svenskt namn. */
  name: string
  group: ActivityGroup
  /** MET-värde enligt 2024 Adult Compendium. */
  met: number
  emoji: string
  /** Typisk hastighet i km/h (för aktiviteter som definieras av fart). */
  speedKmh?: number
  /** Förtydligande eller hur värdet uppskattats. */
  note?: string
  /** Aktivitetskod i 2024 Adult Compendium. */
  code?: string
  /** Extra sökord, t.ex. ['springa', 'jogga']. */
  synonyms?: string[]
}

export const ACTIVITY_GROUPS: Record<ActivityGroup, { label: string; emoji: string }> = {
  vardag: { label: 'Vardag', emoji: '🚶' },
  kondition: { label: 'Kondition', emoji: '🏃' },
  styrka: { label: 'Styrka & rörlighet', emoji: '🏋️' },
  bollsport: { label: 'Bollsport & racket', emoji: '⚽' },
  vinter: { label: 'Vinter', emoji: '⛷️' },
  friluftsliv: { label: 'Friluftsliv', emoji: '🌲' },
  vatten: { label: 'Vatten', emoji: '🏊' },
  dans: { label: 'Dans', emoji: '💃' },
  'arbete & hem': { label: 'Arbete & hem', emoji: '🏡' },
}

/** Visningsordning för grupperna. */
export const ACTIVITY_GROUP_ORDER: readonly ActivityGroup[] = [
  'vardag',
  'kondition',
  'styrka',
  'bollsport',
  'vinter',
  'friluftsliv',
  'vatten',
  'dans',
  'arbete & hem',
]

/** Löpning per fart: [km/h, MET, kompendiekod]. Tempo i min/km räknas fram i namnet. */
const RUNNING: ReadonlyArray<readonly [number, number, string]> = [
  [8, 8.5, '12030'],
  [9, 9.0, '12045'],
  [10, 9.3, '12050'],
  [11, 10.5, '12060'],
  [12, 11.8, '12080'],
  [13, 12.0, '12090'],
  [14, 12.5, '12100'],
  [15, 14.8, '12115'],
  [16, 14.8, '12120'],
]

/** "6:00" min/km för en fart i km/h. */
function paceLabel(kmh: number): string {
  const totalSeconds = Math.round(3600 / kmh)
  const min = Math.floor(totalSeconds / 60)
  const sec = totalSeconds % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

const RUNNING_ACTIVITIES: Activity[] = RUNNING.map(([kmh, met, code]) => ({
  id: `lopning-${kmh}`,
  name: `Löpning ${kmh} km/h (${paceLabel(kmh)} min/km)`,
  group: 'kondition',
  met,
  emoji: '🏃',
  speedKmh: kmh,
  code,
  synonyms: ['springa', 'löprunda', 'jogga', 'running'],
}))

export const ACTIVITIES: readonly Activity[] = [
  // --- Vardag ----------------------------------------------------------------
  { id: 'promenad-flanera', name: 'Promenad, flanera', group: 'vardag', met: 2.3, emoji: '🚶', speedKmh: 3, code: '17151', note: 'Under 3,2 km/h, t.ex. stadsvandring eller fönstershopping.', synonyms: ['gå', 'strosa', 'promenera'] },
  { id: 'promenad-lugn', name: 'Promenad, lugn', group: 'vardag', met: 2.8, emoji: '🚶', speedKmh: 3.5, code: '17152', note: '3,2–3,9 km/h.', synonyms: ['gå', 'promenera', 'walk'] },
  { id: 'promenad', name: 'Promenad, normal takt', group: 'vardag', met: 3.8, emoji: '🚶', speedKmh: 5, code: '17190', note: '4,5–5,5 km/h.', synonyms: ['gå', 'promenera', 'walk'] },
  { id: 'promenad-rask', name: 'Promenad, rask', group: 'vardag', met: 4.8, emoji: '🚶', speedKmh: 6, code: '17200', note: '5,6–6,3 km/h – lite andfådd men kan prata.', synonyms: ['gå', 'powerwalk', 'raskt'] },
  { id: 'promenad-mycket-rask', name: 'Promenad, mycket rask', group: 'vardag', met: 5.5, emoji: '🚶', speedKmh: 6.7, code: '17220', note: '6,4–7,0 km/h.', synonyms: ['gå', 'powerwalk'] },
  { id: 'promenad-hund', name: 'Promenad med hund', group: 'vardag', met: 3.0, emoji: '🐕', code: '17165', synonyms: ['rasta hunden', 'hundpromenad'] },
  { id: 'promenad-barnvagn', name: 'Promenad med barnvagn', group: 'vardag', met: 3.8, emoji: '👶', speedKmh: 4.5, code: '17100', note: '4,0–5,0 km/h.', synonyms: ['vagnpromenad', 'föräldraledig'] },
  { id: 'ga-till-jobbet', name: 'Gå till jobbet eller skolan', group: 'vardag', met: 4.0, emoji: '🚶', code: '17270', synonyms: ['pendla', 'gå till jobbet'] },
  { id: 'trappor', name: 'Gå i trappor', group: 'vardag', met: 6.8, emoji: '🪜', code: '17131', synonyms: ['trappgång', 'trappa'] },
  { id: 'cykel-pendling', name: 'Cykla till jobbet', group: 'vardag', met: 6.8, emoji: '🚲', code: '01011', note: 'Pendling i eget tempo.', synonyms: ['cykelpendling', 'cykla', 'pendla'] },
  { id: 'cykel-lugn', name: 'Cykling, lugn (under 16 km/h)', group: 'vardag', met: 4.0, emoji: '🚲', speedKmh: 13, code: '01010', synonyms: ['cykla', 'cykeltur'] },
  { id: 'elcykel', name: 'Elcykel', group: 'vardag', met: 4.0, emoji: '🚲', code: '01088', note: 'Med mycket motorhjälp. Med lite hjälp är värdet ungefär 6 MET (kod 01084).', synonyms: ['e-cykel', 'elcykla', 'cykla'] },

  // --- Kondition -------------------------------------------------------------
  { id: 'joggning', name: 'Joggning, eget tempo', group: 'kondition', met: 7.5, emoji: '🏃', code: '12020', synonyms: ['jogga', 'springa', 'löpning'] },
  ...RUNNING_ACTIVITIES,
  { id: 'terranglopning', name: 'Terränglöpning', group: 'kondition', met: 9.3, emoji: '🌲', code: '12140', synonyms: ['trail', 'traillöpning', 'springa i skogen'] },
  { id: 'lopning-barnvagn', name: 'Löpning med barnvagn', group: 'kondition', met: 10.0, emoji: '👶', speedKmh: 8, code: '12593', note: 'Utomhus, ca 8 km/h.', synonyms: ['joggingvagn', 'springa'] },
  { id: 'orientering', name: 'Orientering', group: 'kondition', met: 9.0, emoji: '🧭', code: '15480', synonyms: ['orientera', 'o-ringen', 'karta'] },
  { id: 'stavgang', name: 'Stavgång', group: 'kondition', met: 4.3, emoji: '🚶', speedKmh: 5, code: '17302', note: '4,0–5,6 km/h på plan mark.', synonyms: ['nordic walking', 'stavar'] },
  { id: 'stavgang-rask', name: 'Stavgång, rask', group: 'kondition', met: 5.3, emoji: '🚶', speedKmh: 6.5, code: '17304', note: '5,8–7,1 km/h.', synonyms: ['nordic walking', 'stavar'] },
  { id: 'cykel-16-19', name: 'Cykling 16–19 km/h', group: 'kondition', met: 6.8, emoji: '🚴', speedKmh: 17.5, code: '01020', synonyms: ['cykla', 'landsväg', 'racer'] },
  { id: 'cykel-19-22', name: 'Cykling 19–22 km/h', group: 'kondition', met: 8.0, emoji: '🚴', speedKmh: 20.5, code: '01030', synonyms: ['cykla', 'landsväg', 'racer'] },
  { id: 'cykel-22-26', name: 'Cykling 22–26 km/h', group: 'kondition', met: 10.0, emoji: '🚴', speedKmh: 24, code: '01040', synonyms: ['cykla', 'landsväg', 'racer', 'vätternrundan'] },
  { id: 'cykel-26-30', name: 'Cykling 26–30 km/h', group: 'kondition', met: 12.0, emoji: '🚴', speedKmh: 28, code: '01050', synonyms: ['cykla', 'landsväg', 'racer', 'tävling'] },
  { id: 'mountainbike', name: 'Mountainbike', group: 'kondition', met: 8.5, emoji: '🚵', code: '01009', synonyms: ['mtb', 'terrängcykel', 'cykla i skogen'] },
  { id: 'spinning', name: 'Spinning', group: 'kondition', met: 9.0, emoji: '🚴', code: '01270', note: 'Gruppass på spinningcykel.', synonyms: ['indoor cycling', 'rpm', 'cykelpass'] },
  { id: 'motionscykel', name: 'Motionscykel', group: 'kondition', met: 6.8, emoji: '🚴', code: '01200', synonyms: ['testcykel', 'ergometercykel', 'cykla inne'] },
  { id: 'crosstrainer', name: 'Crosstrainer', group: 'kondition', met: 5.0, emoji: '🏋️', code: '02048', note: 'Måttlig ansträngning.', synonyms: ['elliptical', 'gym'] },
  { id: 'crosstrainer-hard', name: 'Crosstrainer, hårt', group: 'kondition', met: 9.0, emoji: '🏋️', code: '02049', synonyms: ['elliptical', 'gym'] },
  { id: 'roddmaskin', name: 'Roddmaskin', group: 'kondition', met: 5.0, emoji: '🚣', code: '02071', note: 'Under 100 watt, måttlig ansträngning.', synonyms: ['rodd', 'concept2', 'gym'] },
  { id: 'roddmaskin-hard', name: 'Roddmaskin, hårt', group: 'kondition', met: 7.5, emoji: '🚣', code: '02072', note: '100–149 watt.', synonyms: ['rodd', 'concept2', 'gym'] },
  { id: 'trappmaskin', name: 'Trappmaskin', group: 'kondition', met: 9.3, emoji: '🪜', code: '02065', synonyms: ['stairmaster', 'gym'] },
  { id: 'hopprep', name: 'Hopprep', group: 'kondition', met: 11.8, emoji: '🤸', code: '15551', note: 'Måttligt tempo, 100–120 hopp i minuten.', synonyms: ['hoppa hopprep', 'rephopp'] },
  { id: 'jympa', name: 'Jympa/gympa', group: 'kondition', met: 7.3, emoji: '🤸', code: '02000', note: 'Motionsgymnastik till musik i grupp, medelintensivt.', synonyms: ['gympa', 'aerobics', 'friskis', 'gruppträning'] },
  { id: 'jympa-lugn', name: 'Jympa, lugn', group: 'kondition', met: 4.8, emoji: '🤸', code: '02005', note: 'Låg belastning, utan hopp.', synonyms: ['gympa', 'aerobics', 'seniorgympa'] },
  { id: 'hiit', name: 'Intervallträning (HIIT)', group: 'kondition', met: 7.0, emoji: '🔥', code: '02210', note: 'Måttlig ansträngning.', synonyms: ['intervaller', 'hiit', 'tabata'] },
  { id: 'hiit-hard', name: 'Intervallträning, hård (Tabata)', group: 'kondition', met: 11.0, emoji: '🔥', code: '02214', note: 'Burpees, mountain climbers, upphopp.', synonyms: ['intervaller', 'hiit', 'tabata', 'burpees'] },
  { id: 'rullskidor', name: 'Rullskidor', group: 'kondition', met: 6.8, emoji: '🎿', speedKmh: 15, code: '19310', note: '13–17 km/h på plan mark.', synonyms: ['rullskidåkning', 'barmarksträning'] },
  { id: 'inlines', name: 'Inlines', group: 'kondition', met: 7.5, emoji: '🛼', speedKmh: 14.4, code: '15591', note: 'Motionstempo, ca 14 km/h.', synonyms: ['rullskridskor', 'inlineåkning'] },
  { id: 'boxning', name: 'Boxning, säck', group: 'kondition', met: 5.8, emoji: '🥊', code: '15110', synonyms: ['boxas', 'boxningspass'] },
  { id: 'kampsport', name: 'Kampsport (judo, karate m.fl.)', group: 'kondition', met: 10.3, emoji: '🥋', code: '15430', note: 'Måttligt tempo – t.ex. judo, jujutsu, karate, kickboxning, taekwondo.', synonyms: ['judo', 'karate', 'taekwondo', 'kickboxning', 'mma'] },

  // --- Styrka & rörlighet ----------------------------------------------------
  { id: 'styrka-latt', name: 'Styrketräning, lätt–medel', group: 'styrka', met: 3.5, emoji: '🏋️', code: '02054', note: 'Flera övningar, 8–15 repetitioner, vila mellan seten.', synonyms: ['gym', 'styrka', 'vikter', 'maskiner'] },
  { id: 'styrka-bas', name: 'Styrketräning, knäböj och marklyft', group: 'styrka', met: 5.0, emoji: '🏋️', code: '02052', synonyms: ['gym', 'styrka', 'skivstång', 'basövningar'] },
  { id: 'styrka-hard', name: 'Styrketräning, tung', group: 'styrka', met: 6.0, emoji: '🏋️', code: '02050', note: 'Tunga lyft med hög ansträngning, t.ex. styrkelyft eller bodybuilding.', synonyms: ['gym', 'styrka', 'styrkelyft', 'bodybuilding'] },
  { id: 'kroppsvikt', name: 'Kroppsviktsträning', group: 'styrka', met: 3.0, emoji: '💪', code: '02056', note: 'Knäböj, utfall, armhävningar, situps i lugnt tempo.', synonyms: ['armhävningar', 'hemmaträning', 'calisthenics'] },
  { id: 'kroppsvikt-hard', name: 'Kroppsviktsträning, hög intensitet', group: 'styrka', met: 6.5, emoji: '💪', code: '02057', synonyms: ['armhävningar', 'hemmaträning', 'calisthenics'] },
  { id: 'cirkeltraning', name: 'Cirkelträning', group: 'styrka', met: 5.0, emoji: '🔄', code: '02035', note: 'Måttlig ansträngning.', synonyms: ['circuit', 'stationsträning', 'gruppträning'] },
  { id: 'crossfit', name: 'Crossfit/funktionell träning', group: 'styrka', met: 7.5, emoji: '🏋️', code: '02040', note: 'Cirkelträning med kettlebells och kondition, kort vila.', synonyms: ['crossfit', 'wod', 'funktionell'] },
  { id: 'kettlebell', name: 'Kettlebellsvingar', group: 'styrka', met: 9.8, emoji: '🏋️', code: '02058', synonyms: ['kettlebell', 'swing'] },
  { id: 'yoga', name: 'Yoga', group: 'styrka', met: 2.3, emoji: '🧘', code: '02175', synonyms: ['hatha', 'yin', 'yogapass'] },
  { id: 'yoga-power', name: 'Poweryoga', group: 'styrka', met: 4.0, emoji: '🧘', code: '02160', synonyms: ['power yoga', 'ashtanga', 'vinyasa'] },
  { id: 'pilates', name: 'Pilates', group: 'styrka', met: 2.8, emoji: '🧘', code: '02105', synonyms: ['core', 'bålträning'] },
  { id: 'stretching', name: 'Stretching och rörlighet', group: 'styrka', met: 2.3, emoji: '🤸', code: '02101', synonyms: ['töjning', 'rörlighet', 'mobility'] },
  { id: 'klattring-inne', name: 'Klättring, inomhus', group: 'styrka', met: 5.8, emoji: '🧗', code: '15537', note: 'Lätta till medelsvåra leder.', synonyms: ['klättra', 'klätterhall', 'topprep'] },
  { id: 'bouldering', name: 'Bouldering', group: 'styrka', met: 8.8, emoji: '🧗', code: '15534', synonyms: ['klättra', 'boulder', 'klätterhall'] },

  // --- Bollsport & racket ----------------------------------------------------
  { id: 'fotboll', name: 'Fotboll, motion', group: 'bollsport', met: 7.0, emoji: '⚽', code: '15610', synonyms: ['fotboll', 'korpen', 'lira boll'] },
  { id: 'fotboll-match', name: 'Fotboll, match', group: 'bollsport', met: 9.5, emoji: '⚽', code: '15605', synonyms: ['fotbollsmatch', 'soccer'] },
  { id: 'gafotboll', name: 'Gåfotboll', group: 'bollsport', met: 3.5, emoji: '⚽', code: '15615', note: 'Fotboll där man går i stället för springer.', synonyms: ['walking football', 'fotboll'] },
  { id: 'innebandy', name: 'Innebandy', group: 'bollsport', met: 10.5, emoji: '🏑', code: '15205', synonyms: ['floorball', 'klubba'] },
  { id: 'handboll', name: 'Handboll', group: 'bollsport', met: 8.0, emoji: '🤾', code: '15330', synonyms: ['handbollsmatch'] },
  { id: 'basket', name: 'Basket', group: 'bollsport', met: 7.5, emoji: '🏀', code: '15055', synonyms: ['basketboll'] },
  { id: 'volleyboll', name: 'Volleyboll', group: 'bollsport', met: 4.0, emoji: '🏐', code: '15710', synonyms: ['volley'] },
  { id: 'beachvolley', name: 'Beachvolley', group: 'bollsport', met: 8.0, emoji: '🏐', code: '15725', synonyms: ['sandvolleyboll', 'volleyboll'] },
  { id: 'padel', name: 'Padel', group: 'bollsport', met: 6.0, emoji: '🎾', code: '15500', note: 'Uppskattat – kompendiet saknar padel, så värdet för paddleball i motionstempo används.', synonyms: ['padeltennis', 'racket'] },
  { id: 'tennis', name: 'Tennis', group: 'bollsport', met: 6.8, emoji: '🎾', code: '15675', note: 'Allmänt, måttlig ansträngning.', synonyms: ['racket'] },
  { id: 'tennis-singel', name: 'Tennis, singel', group: 'bollsport', met: 8.0, emoji: '🎾', code: '15690', synonyms: ['racket', 'tennismatch'] },
  { id: 'badminton', name: 'Badminton', group: 'bollsport', met: 5.5, emoji: '🏸', code: '15030', note: 'Motion, singel eller dubbel.', synonyms: ['fjäderboll', 'racket'] },
  { id: 'bordtennis', name: 'Bordtennis', group: 'bollsport', met: 4.0, emoji: '🏓', code: '15660', synonyms: ['pingis', 'ping pong'] },
  { id: 'squash', name: 'Squash', group: 'bollsport', met: 7.3, emoji: '🎾', code: '15652', synonyms: ['racket'] },
  { id: 'golf', name: 'Golf, gå och bära bagen', group: 'bollsport', met: 4.3, emoji: '⛳', code: '15265', synonyms: ['golfrunda', 'golfa'] },
  { id: 'golf-vagn', name: 'Golf, gå med vagn', group: 'bollsport', met: 4.5, emoji: '⛳', code: '15285', synonyms: ['golfrunda', 'golfa', 'golfvagn'] },

  // --- Vinter ----------------------------------------------------------------
  { id: 'langd-lugnt', name: 'Längdskidor, mycket lugnt', group: 'vinter', met: 6.8, emoji: '🎿', speedKmh: 4, code: '19080', note: 'Ca 4 km/h, skidvandring.', synonyms: ['skidor', 'längd', 'skidvandring'] },
  { id: 'langd-klassiskt', name: 'Längdskidor, klassiskt', group: 'vinter', met: 8.5, emoji: '🎿', speedKmh: 7, code: '19090', note: '6,4–7,9 km/h, måttlig ansträngning.', synonyms: ['skidor', 'längd', 'klassisk stil'] },
  { id: 'langd-klassiskt-hart', name: 'Längdskidor, klassiskt, hårt', group: 'vinter', met: 11.3, emoji: '🎿', speedKmh: 10, code: '19100', note: '8–12,7 km/h, hög ansträngning.', synonyms: ['skidor', 'längd', 'klassisk stil'] },
  { id: 'langd-skate', name: 'Längdskidor, skate', group: 'vinter', met: 13.3, emoji: '🎿', code: '19135', synonyms: ['skidor', 'längd', 'skejt', 'fristil'] },
  { id: 'vasaloppstempo', name: 'Längdskidor i Vasaloppstempo', group: 'vinter', met: 11.3, emoji: '🎿', speedKmh: 11, code: '19100', note: 'Motionärstempo, ca 8–12 km/h. Elitåkare i tävlingsfart ligger kring 14–16 MET.', synonyms: ['vasaloppet', 'långlopp', 'skidor'] },
  { id: 'utfor', name: 'Utförsåkning', group: 'vinter', met: 6.3, emoji: '⛷️', code: '19160', note: 'Aktiv åktid – räkna inte med tiden i liften.', synonyms: ['slalom', 'alpint', 'skidor', 'backe'] },
  { id: 'utfor-hart', name: 'Utförsåkning, hårt', group: 'vinter', met: 8.0, emoji: '⛷️', code: '19170', note: 'Aktiv åktid.', synonyms: ['slalom', 'alpint', 'skidor', 'offpist'] },
  { id: 'snowboard', name: 'Snowboard', group: 'vinter', met: 7.5, emoji: '🏂', code: '19201', note: 'Aktiv åktid i måttligt tempo.', synonyms: ['bräda', 'snowboarda'] },
  { id: 'langfardsskridskor', name: 'Långfärdsskridskor', group: 'vinter', met: 9.0, emoji: '⛸️', speedKmh: 18, code: '19040', note: 'Över ca 14,5 km/h.', synonyms: ['skridsko', 'naturis', 'långfärd'] },
  { id: 'skridskor', name: 'Skridskor', group: 'vinter', met: 7.0, emoji: '⛸️', code: '19030', synonyms: ['åka skridskor', 'skridsko', 'isbana'] },
  { id: 'ishockey', name: 'Ishockey', group: 'vinter', met: 8.0, emoji: '🏒', code: '15360', synonyms: ['hockey', 'puck'] },
  { id: 'bandy', name: 'Bandy', group: 'vinter', met: 8.0, emoji: '🏒', code: '15360', note: 'Uppskattat utifrån ishockey – kompendiet saknar bandy.', synonyms: ['bandymatch', 'rinkbandy'] },
  { id: 'snoskor', name: 'Snöskor', group: 'vinter', met: 5.3, emoji: '❄️', code: '19190', synonyms: ['snöskovandring', 'trugor'] },
  { id: 'pulka', name: 'Pulka och kälke', group: 'vinter', met: 7.0, emoji: '🛷', code: '19180', note: 'Inklusive att gå uppför backen.', synonyms: ['åka pulka', 'kälke', 'stjärtlapp'] },
  { id: 'isfiske', name: 'Isfiske', group: 'vinter', met: 2.0, emoji: '🎣', code: '19011', synonyms: ['pimpla', 'pimpelfiske', 'fiske'] },

  // --- Friluftsliv -----------------------------------------------------------
  { id: 'vandring', name: 'Vandring i skog och mark', group: 'friluftsliv', met: 5.3, emoji: '🥾', code: '17082', note: 'Normal takt i kuperad terräng, utan packning.', synonyms: ['vandra', 'skogspromenad', 'hike'] },
  { id: 'fjallvandring', name: 'Fjällvandring med packning', group: 'friluftsliv', met: 7.0, emoji: '🏔️', code: '17010', synonyms: ['vandra', 'fjället', 'kungsleden', 'ryggsäck'] },
  { id: 'bar-svamp', name: 'Plocka bär och svamp', group: 'friluftsliv', met: 2.8, emoji: '🍄', code: '04150', note: 'Plocka i naturen med lätt ryggsäck.', synonyms: ['svampplockning', 'bärplockning', 'kantareller', 'blåbär', 'lingon'] },
  { id: 'fiske', name: 'Fiske från land', group: 'friluftsliv', met: 4.0, emoji: '🎣', code: '04020', note: 'Spinnfiske eller flugfiske och gå längs stranden.', synonyms: ['fiska', 'spinnfiske', 'flugfiske', 'mete'] },
  { id: 'jakt-pass', name: 'Jakt, sitta på pass', group: 'friluftsliv', met: 2.5, emoji: '🌲', code: '04085', note: 'Mest stillasittande, t.ex. på älgjakt.', synonyms: ['älgjakt', 'jaga', 'jakttorn'] },
  { id: 'jakt-ga', name: 'Jakt, gå i skogen', group: 'friluftsliv', met: 6.0, emoji: '🌲', code: '04080', note: 'Smygjakt eller drevjakt på klövvilt.', synonyms: ['älgjakt', 'jaga', 'drevjakt'] },
  { id: 'klattring-ute', name: 'Klättring, utomhus', group: 'friluftsliv', met: 8.0, emoji: '🧗', code: '15533', synonyms: ['klippklättring', 'klättra', 'berg'] },
  { id: 'ridning', name: 'Ridning', group: 'friluftsliv', met: 5.5, emoji: '🐎', code: '15370', note: 'Allmänt, blandade gångarter.', synonyms: ['rida', 'häst', 'ridlektion'] },
  { id: 'frisbeegolf', name: 'Frisbeegolf', group: 'friluftsliv', met: 3.8, emoji: '🥏', code: '15252', synonyms: ['discgolf', 'frisbee'] },
  { id: 'kubb', name: 'Kubb', group: 'friluftsliv', met: 3.3, emoji: '🪵', code: '15465', note: 'Uppskattat utifrån boule – kompendiet saknar kubb.', synonyms: ['vikingaschack', 'gräsmattespel'] },

  // --- Vatten ----------------------------------------------------------------
  { id: 'crawl-lugn', name: 'Simning, crawl lugnt', group: 'vatten', met: 5.8, emoji: '🏊', code: '18292', synonyms: ['simma', 'frisim', 'crawl', 'simhall'] },
  { id: 'crawl', name: 'Simning, crawl medel', group: 'vatten', met: 8.0, emoji: '🏊', code: '18290', synonyms: ['simma', 'frisim', 'crawl', 'simhall'] },
  { id: 'crawl-snabb', name: 'Simning, crawl snabbt', group: 'vatten', met: 10.5, emoji: '🏊', code: '18280', synonyms: ['simma', 'frisim', 'crawl', 'simträning'] },
  { id: 'brostsim', name: 'Simning, bröstsim', group: 'vatten', met: 5.3, emoji: '🏊', code: '18265', note: 'Motionstempo.', synonyms: ['simma', 'bröstsim', 'simhall'] },
  { id: 'brostsim-hart', name: 'Simning, bröstsim hårt', group: 'vatten', met: 10.3, emoji: '🏊', code: '18260', note: 'Träningstempo.', synonyms: ['simma', 'bröstsim', 'simträning'] },
  { id: 'ryggsim', name: 'Simning, ryggsim', group: 'vatten', met: 4.8, emoji: '🏊', code: '18255', synonyms: ['simma', 'ryggsim'] },
  { id: 'simning-oppet-vatten', name: 'Simning i sjö eller hav', group: 'vatten', met: 6.0, emoji: '🌊', code: '18300', synonyms: ['simma', 'bada', 'utomhussim', 'open water'] },
  { id: 'vattengympa', name: 'Vattengympa', group: 'vatten', met: 5.5, emoji: '💦', code: '18355', synonyms: ['vattenjympa', 'aquafit', 'vattenträning'] },
  { id: 'kanot', name: 'Kanot, lugnt', group: 'vatten', met: 3.5, emoji: '🛶', code: '18070', note: 'Paddling för nöjes skull.', synonyms: ['paddla', 'kanotpaddling', 'kanottur'] },
  { id: 'kajak', name: 'Kajak', group: 'vatten', met: 5.0, emoji: '🛶', code: '18100', note: 'Måttlig ansträngning.', synonyms: ['paddla', 'kajakpaddling', 'havskajak'] },
  { id: 'sup', name: 'SUP (stand up paddle)', group: 'vatten', met: 6.5, emoji: '🏄', code: '18224', synonyms: ['paddla', 'paddelbräda', 'sup'] },
  { id: 'segling', name: 'Segling', group: 'vatten', met: 3.3, emoji: '⛵', code: '18140', note: 'Fritidssegling.', synonyms: ['segla', 'båt'] },

  // --- Dans ------------------------------------------------------------------
  { id: 'bugg', name: 'Bugg och swing', group: 'dans', met: 6.0, emoji: '💃', code: '03042', note: 'Sällskapsdans i fritidstempo.', synonyms: ['dansa', 'bugga', 'swing', 'lindy hop'] },
  { id: 'dansband', name: 'Dansbandsdans (fox, vals)', group: 'dans', met: 3.0, emoji: '🕺', code: '03040', note: 'Lugn pardans.', synonyms: ['dansa', 'foxtrot', 'vals', 'fotdans', 'pardans'] },
  { id: 'folkdans', name: 'Folkdans och polska', group: 'dans', met: 5.0, emoji: '🌼', code: '03033', note: 'Även dans kring midsommarstången.', synonyms: ['dansa', 'polska', 'hambo', 'midsommar'] },
  { id: 'zumba', name: 'Zumba', group: 'dans', met: 6.5, emoji: '💃', code: '02310', note: 'Gruppass.', synonyms: ['dansa', 'danspass', 'gruppträning'] },
  { id: 'jazzdans', name: 'Jazz- och modern dans', group: 'dans', met: 5.0, emoji: '💃', code: '03010', synonyms: ['dansa', 'jazzdans', 'modern dans', 'balett'] },
  { id: 'dans-intensiv', name: 'Dans, intensivt (klubb, linedance)', group: 'dans', met: 9.8, emoji: '🕺', code: '03031', synonyms: ['dansa', 'klubb', 'disco', 'linedance'] },
  { id: 'salsa', name: 'Salsa', group: 'dans', met: 4.8, emoji: '💃', code: '03090', note: 'Med partner.', synonyms: ['dansa', 'latin'] },

  // --- Arbete & hem ----------------------------------------------------------
  { id: 'stadning', name: 'Städning', group: 'arbete & hem', met: 3.3, emoji: '🧹', code: '05030', note: 'Allmän städning, måttlig ansträngning.', synonyms: ['städa', 'storstädning', 'hushållsarbete'] },
  { id: 'dammsugning', name: 'Dammsugning', group: 'arbete & hem', met: 3.0, emoji: '🧹', code: '05043', synonyms: ['dammsuga', 'städa'] },
  { id: 'fonsterputs', name: 'Putsa fönster', group: 'arbete & hem', met: 3.3, emoji: '🪟', code: '05022', synonyms: ['fönsterputsning', 'städa'] },
  { id: 'handla', name: 'Handla mat', group: 'arbete & hem', met: 3.3, emoji: '🛒', code: '05060', synonyms: ['matinköp', 'affären', 'handla'] },
  { id: 'lek-barn', name: 'Leka med barn', group: 'arbete & hem', met: 3.5, emoji: '🧸', code: '05175', note: 'Aktiva perioder, gå och springa.', synonyms: ['lek', 'barn', 'lekpark'] },
  { id: 'lek-barn-intensivt', name: 'Leka med barn, intensivt', group: 'arbete & hem', met: 5.8, emoji: '🧸', code: '05180', note: 'Aktiva perioder med spring och lek.', synonyms: ['lek', 'barn', 'kull', 'tafatt'] },
  { id: 'flytta', name: 'Flytta och bära möbler', group: 'arbete & hem', met: 5.8, emoji: '📦', code: '05120', synonyms: ['flytt', 'bära', 'lådor'] },
  { id: 'tradgard', name: 'Trädgårdsarbete', group: 'arbete & hem', met: 3.8, emoji: '🌱', code: '08245', note: 'Allmänt, måttlig ansträngning.', synonyms: ['trädgård', 'odla', 'plantera', 'kolonilott'] },
  { id: 'grasklippning', name: 'Gräsklippning', group: 'arbete & hem', met: 5.0, emoji: '🌿', code: '08120', note: 'Gå bakom motorgräsklippare.', synonyms: ['klippa gräset', 'gräsmatta'] },
  { id: 'kratta-lov', name: 'Kratta löv', group: 'arbete & hem', met: 4.0, emoji: '🍂', code: '08160', synonyms: ['kratta', 'löv', 'höststädning'] },
  { id: 'rensa-ogras', name: 'Rensa ogräs', group: 'arbete & hem', met: 3.8, emoji: '🌱', code: '08239', synonyms: ['ogräs', 'rensa', 'trädgård'] },
  { id: 'grava', name: 'Gräva och skotta jord', group: 'arbete & hem', met: 5.0, emoji: '⛏️', code: '08050', synonyms: ['gräva', 'kompost', 'spade'] },
  { id: 'klyva-ved', name: 'Hugga och klyva ved', group: 'arbete & hem', met: 6.5, emoji: '🪓', code: '08020', note: 'Raskt tempo. I lugnare takt ca 4,5 MET (kod 08019).', synonyms: ['vedhuggning', 'ved', 'yxa'] },
  { id: 'bara-ved', name: 'Bära och stapla ved', group: 'arbete & hem', met: 5.5, emoji: '🪵', code: '08010', synonyms: ['ved', 'vedtrave', 'bära'] },
  { id: 'snoskottning', name: 'Skotta snö', group: 'arbete & hem', met: 5.3, emoji: '❄️', code: '19252', note: 'Med handskyffel, måttlig ansträngning.', synonyms: ['snöskottning', 'skotta', 'snö'] },
  { id: 'snoskottning-hard', name: 'Skotta snö, tungt', group: 'arbete & hem', met: 7.5, emoji: '❄️', code: '19254', note: 'Blöt och tung snö eller högt tempo.', synonyms: ['snöskottning', 'skotta', 'snö'] },
  { id: 'mala-huset', name: 'Måla huset utvändigt', group: 'arbete & hem', met: 5.0, emoji: '🖌️', code: '06150', synonyms: ['måla', 'falu rödfärg', 'fasad'] },
]

const BY_ID = new Map(ACTIVITIES.map((a) => [a.id, a]))

/** Hämta en aktivitet via id. */
export function getActivity(id: string): Activity | undefined {
  return BY_ID.get(id)
}

/** Aktiviteter grupperade i visningsordning (tomma grupper utelämnas). */
export function activitiesByGroup(): Array<{ group: ActivityGroup; label: string; emoji: string; activities: Activity[] }> {
  return ACTIVITY_GROUP_ORDER.map((group) => ({
    group,
    ...ACTIVITY_GROUPS[group],
    activities: ACTIVITIES.filter((a) => a.group === group),
  })).filter((g) => g.activities.length > 0)
}

/** Vanliga aktiviteter att visa som snabbval. */
export const POPULAR_ACTIVITY_IDS: readonly string[] = [
  'promenad-rask',
  'promenad-hund',
  'cykel-pendling',
  'lopning-10',
  'styrka-latt',
  'yoga',
  'simning-oppet-vatten',
  'langd-klassiskt',
  'innebandy',
  'padel',
  'tradgard',
  'stadning',
]
