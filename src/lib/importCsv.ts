/**
 * Import från andra appar: CSV-filer och zip-filer med CSV (t.ex. MyFitnessPals export).
 *
 * - CSV-tolken klarar citattecken, radbrytningar i citat, komma, semikolon eller tabb som
 *   avgränsare och både decimalkomma och decimalpunkt (`parseSwedishNumber`).
 * - Kolumnerna mappas automatiskt från rubrikerna – MyFitnessPals ("Date", "Meal", "Calories",
 *   "Fat (g)", "Carbohydrates (g)", "Protein (g)", "Weight") och allmänna svenska och engelska
 *   ("Datum", "Vikt", "Midja" …).
 * - Mat blir en snabbregistrering per datum och måltid ("Importerat från MyFitnessPal – Lunch").
 *   Ett näringsämne som saknas lämnas okänt (undefined), aldrig 0.
 * - Varje post får ett id som räknas fram ur innehållet (en hash), så att samma fil kan importeras
 *   igen utan dubbletter. En måltids id bygger på datum och måltid: en nyare export av samma dag
 *   uppdaterar den importerade måltiden i stället för att lägga till den en gång till.
 * - Datum tolkas som lokala kalenderdagar – aldrig via UTC.
 */
import type { ISODate, MealId, MeasurementEntry, NutrientKey, Nutrients, QuickEntry, WeightEntry } from '../types'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { isValidISODate, todayISO } from './dates'
import { parseSwedishNumber } from './format'
import { decodeText, looksLikeZip, unzip } from './unzip'

export class ImportCsvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportCsvError'
  }
}

export interface CsvImport {
  /** Varifrån datan kommer, t.ex. "MyFitnessPal" eller "annan app". */
  source: string
  weights: WeightEntry[]
  measurements: MeasurementEntry[]
  /** En snabbregistrering per datum och måltid. */
  quick: QuickEntry[]
  /** Rader som inte gick att läsa (datum saknas, orimliga värden …). */
  skipped: number
}

/** Största fil som läses in (byte). */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024
/** Största sammanlagda uppackade storlek för CSV-filerna i en zip-fil (byte). */
export const MAX_UNZIPPED_BYTES = 100 * 1024 * 1024

const MFP = 'MyFitnessPal'
const OTHER = 'annan app'
const LB_TO_KG = 0.45359237
const IN_TO_CM = 2.54

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export type Delimiter = ',' | ';' | '\t'

/** Gissa avgränsaren från första raden (räknar bara tecken utanför citattecken). */
export function detectDelimiter(text: string): Delimiter {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && (ch === ',' || ch === ';' || ch === '\t')) counts[ch]++
  }
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t'] && counts[';'] > 0) return ';'
  if (counts['\t'] > counts[',']) return '\t'
  return ','
}

/**
 * Tolka CSV till rader och celler. Citattecken skyddar avgränsare och radbrytningar, och "" är
 * ett citattecken i en citerad cell. Helt tomma rader tas bort.
 */
export function parseCsv(text: string, delimiter: Delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^\uFEFF/, '')
  const pushRow = () => {
    row.push(cell)
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
    cell = ''
  }
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell.trim() === '') {
      cell = ''
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      pushRow()
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) pushRow()
  return rows
}

// ---------------------------------------------------------------------------
// Kolumner
// ---------------------------------------------------------------------------

type Field =
  | 'date'
  | 'meal'
  | 'kcal'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'satFat'
  | 'fiber'
  | 'sugars'
  | 'salt'
  | 'sodium'
  | 'weight'
  | 'waist'
  | 'hip'
  | 'bodyFat'

const FIELD_NAMES: Record<Field, readonly string[]> = {
  date: ['date', 'datum', 'dag', 'day'],
  meal: ['meal', 'måltid', 'maltid', 'meal name'],
  kcal: ['calories', 'kalorier', 'energi', 'energy', 'kcal', 'energi kcal'],
  protein: ['protein', 'proteiner'],
  carbs: ['carbohydrates', 'carbohydrate', 'carbs', 'kolhydrater'],
  fat: ['fat', 'fett', 'total fat'],
  satFat: ['saturated fat', 'mättat fett', 'mattat fett', 'mättade fetter', 'mättade fettsyror'],
  fiber: ['fiber', 'fibre', 'fibrer', 'kostfiber', 'dietary fiber'],
  sugars: ['sugar', 'sugars', 'socker', 'sockerarter'],
  salt: ['salt'],
  sodium: ['sodium', 'natrium'],
  weight: ['weight', 'vikt', 'body weight', 'kroppsvikt'],
  waist: ['waist', 'midja', 'midjemått', 'midjematt'],
  hip: ['hip', 'hips', 'höft', 'höfter', 'höftmått', 'hoft'],
  bodyFat: ['body fat', 'body fat %', 'body fat percentage', 'fettprocent', 'kroppsfett', 'kroppsfett %'],
}

const NAME_TO_FIELD = new Map<string, Field>()
for (const [field, names] of Object.entries(FIELD_NAMES) as [Field, readonly string[]][]) {
  for (const n of names) NAME_TO_FIELD.set(n, field)
}

interface Column {
  field: Field
  index: number
  /** Enheten i rubriken, t.ex. "g", "kg", "lbs", "mg", "kj". */
  unit: string
}

/** "Fat (g)" → { base: "fat", unit: "g" }; "Vikt [kg]" → { base: "vikt", unit: "kg" }. */
function splitHeader(raw: string): { base: string; unit: string } {
  const h = raw.replace(/^\uFEFF/, '').trim().toLocaleLowerCase('sv-SE').replace(/\s+/g, ' ')
  const m = /^(.*?)\s*[([]\s*([^)\]]*?)\s*[)\]]\s*$/.exec(h)
  if (m) return { base: m[1].replace(/[:,]$/, '').trim(), unit: m[2] }
  const comma = /^(.*?),\s*(kg|lbs?|cm|in|g|mg|kcal|kj|%)$/.exec(h)
  if (comma) return { base: comma[1].trim(), unit: comma[2] }
  return { base: h, unit: '' }
}

function mapColumns(header: string[]): Column[] {
  const columns: Column[] = []
  const seen = new Set<Field>()
  header.forEach((raw, index) => {
    const { base, unit } = splitHeader(raw)
    const field = NAME_TO_FIELD.get(base) ?? (unit === '%' && /^(body fat|kroppsfett|fett)$/.test(base) ? 'bodyFat' : undefined)
    if (!field || seen.has(field)) return
    seen.add(field)
    columns.push({ field, index, unit })
  })
  return columns
}

/** MyFitnessPals export: kolumnerna "Date", "Meal", "Calories" och makron med "(g)". */
function isMyFitnessPal(header: string[], fileName = ''): boolean {
  if (/nutrition-summary|measurement-summary|exercise-summary|myfitnesspal/i.test(fileName)) return true
  const h = new Set(header.map((c) => c.replace(/^\uFEFF/, '').trim().toLowerCase()))
  return h.has('date') && h.has('meal') && h.has('calories') && (h.has('fat (g)') || h.has('protein (g)') || h.has('carbohydrates (g)'))
}

// ---------------------------------------------------------------------------
// Värden
// ---------------------------------------------------------------------------

interface ParsedNumber {
  value: number
  /** Enhet direkt efter talet i cellen, t.ex. "kg" i "74,5 kg". */
  unit: string
}

/** Tolka en cell som tal. Tomt, "-" eller text ger undefined (okänt – aldrig 0). */
export function parseNumberCell(raw: string, delimiter: Delimiter = ';'): ParsedNumber | undefined {
  const s = raw.trim()
  if (s === '' || /^[-–—]$/.test(s)) return undefined
  const m = /^([-−–]?[\d\s  .,]*\d)\s*([a-zA-Z%]*)$/.exec(s)
  if (!m) return undefined
  let num = m[1]
  // "1,234.5" i en kommaseparerad (engelsk) fil: kommat är tusentalsavgränsare.
  if (delimiter === ',' && /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(num)) num = num.replace(/,/g, '')
  // "1.234,5": punkten är tusentalsavgränsare.
  else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(num)) num = num.replace(/\./g, '')
  const value = parseSwedishNumber(num)
  return Number.isFinite(value) ? { value, unit: m[2].toLowerCase() } : undefined
}

type DateOrder = 'dmy' | 'mdy'

/**
 * Välj ordning för datum som "01/09/2026": dag först (europeiskt) om inget värde i kolumnen
 * visar motsatsen (en första siffra som bara kan vara en dag, eller en andra som bara kan vara det).
 */
function detectDateOrder(values: string[]): DateOrder {
  for (const v of values) {
    const m = /^(\d{1,2})[./-](\d{1,2})[./-]\d{4}/.exec(v.trim())
    if (!m) continue
    if (Number(m[1]) > 12) return 'dmy'
    if (Number(m[2]) > 12) return 'mdy'
  }
  return 'dmy'
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Tolka ett datum som lokal kalenderdag. Tid efter datumet ignoreras (ingen omräkning via UTC). */
export function parseDateCell(raw: string, order: DateOrder = 'dmy'): ISODate | null {
  const s = raw.trim()
  let y: number, mo: number, d: number
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/.exec(s)
  if (m) {
    y = Number(m[1])
    mo = Number(m[2])
    d = Number(m[3])
  } else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:$|[T\s])/.exec(s))) {
    y = Number(m[3])
    mo = Number(order === 'dmy' ? m[2] : m[1])
    d = Number(order === 'dmy' ? m[1] : m[2])
  } else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) {
    y = Number(m[1])
    mo = Number(m[2])
    d = Number(m[3])
  } else return null
  const iso = `${y}-${pad(mo)}-${pad(d)}`
  return y >= 1900 && isValidISODate(iso) ? iso : null
}

// ---------------------------------------------------------------------------
// Måltider och id
// ---------------------------------------------------------------------------

/** Måltidens namn i filen → Lagoms måltid. Okända måltider (t.ex. "Meal 5") blir mellanmål. */
export function mealFromLabel(label: string): MealId {
  const l = label.trim().toLocaleLowerCase('sv-SE')
  if (/^(breakfast|frukost|morning)/.test(l)) return 'frukost'
  if (/^(lunch|lunsch)/.test(l)) return 'lunch'
  if (/^(dinner|middag)/.test(l)) return 'middag'
  if (l.startsWith('fika')) return 'fika'
  if (/^(supper|kvällsmat|kvallsmat|evening)/.test(l)) return 'kvallsmat'
  return 'mellanmal'
}

/** Snabb 53-bitars hash (cyrb53) som id-underlag – samma innehåll ger alltid samma id. */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * Id för en importerad måltid. Bygger på datum och måltid – inte på värdena – så att en nyare
 * export där måltiden har ändrats (t.ex. en dag som bara var halvloggad förra gången) ersätter den
 * importerade måltiden i stället för att räknas två gånger.
 */
export function quickImportId(date: ISODate, label: string): string {
  return `imp_${contentHash(`${date}|${label.trim().toLocaleLowerCase('sv-SE')}`)}`
}

const round = (v: number, decimals = 1) => {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

// ---------------------------------------------------------------------------
// Tolkning av en fil
// ---------------------------------------------------------------------------

const FOOD_FIELDS = ['protein', 'carbs', 'fat', 'satFat', 'fiber', 'sugars', 'salt'] as const satisfies readonly NutrientKey[]
const MAX_GRAMS = 5000
const MAX_KCAL = 20_000

interface MealGroup {
  date: ISODate
  label: string
  rows: Nutrients[]
}

export interface ParseOptions {
  fileName?: string
  /** Tvinga källan (t.ex. när en zip-fil från MyFitnessPal innehåller flera CSV-filer). */
  source?: string
  /** Dagens datum – senare datum hoppas över. */
  today?: ISODate
  /** Tidpunkt för `createdAt`. */
  now?: number
}

/** Ett mått i centimeter; tum räknas om. */
function toCm(n: ParsedNumber | undefined, headerUnit: string): number | undefined {
  if (!n) return undefined
  const inches = /^(in|inch|inches|tum)$/.test(n.unit || headerUnit)
  const cm = round(inches ? n.value * IN_TO_CM : n.value)
  return cm >= 30 && cm <= 250 ? cm : undefined
}

function toKg(n: ParsedNumber | undefined, headerUnit: string): number | undefined {
  if (!n) return undefined
  const pounds = /^(lb|lbs|pound|pounds)$/.test(n.unit || headerUnit)
  const kg = round(pounds ? n.value * LB_TO_KG : n.value, 2)
  return kg >= 20 && kg <= 400 ? kg : undefined
}

function measurementId(m: Omit<MeasurementEntry, 'id' | 'createdAt'>): string {
  return `imp_m_${contentHash(`${m.date}|${m.waistCm ?? ''}|${m.hipCm ?? ''}|${m.bodyFatPct ?? ''}`)}`
}

/**
 * Tolka en CSV-fil från en annan app. Kastar `ImportCsvError` om filen saknar datum eller inte har
 * någon kolumn som Lagom känner igen.
 */
export function parseCsvImport(text: string, opts: ParseOptions = {}): CsvImport {
  const today = opts.today ?? todayISO()
  const now = opts.now ?? Date.now()
  const delimiter = detectDelimiter(text.replace(/^\uFEFF/, ''))
  const rows = parseCsv(text, delimiter)
  if (rows.length === 0) throw new ImportCsvError('Filen är tom.')
  const [header, ...data] = rows
  const columns = mapColumns(header)
  const col = (f: Field) => columns.find((c) => c.field === f)
  const dateCol = col('date')
  const known = columns.filter((c) => c.field !== 'date' && c.field !== 'meal')
  if (!dateCol || known.length === 0) {
    throw new ImportCsvError(
      dateCol
        ? 'Hittade inga kolumner som Lagom känner igen (t.ex. Calories, Kalorier, Weight eller Vikt).'
        : 'Hittade ingen datumkolumn (Date eller Datum) i filen.',
    )
  }
  const source = opts.source ?? (isMyFitnessPal(header, opts.fileName) ? MFP : OTHER)
  const order = detectDateOrder(data.map((r) => r[dateCol.index] ?? ''))
  const num = (row: string[], f: Field) => {
    const c = col(f)
    return c ? parseNumberCell(row[c.index] ?? '', delimiter) : undefined
  }

  const weights = new Map<ISODate, number>()
  const measurements = new Map<ISODate, Omit<MeasurementEntry, 'id' | 'createdAt'>>()
  const groups = new Map<string, MealGroup>()
  let skipped = 0

  for (const row of data) {
    const date = parseDateCell(row[dateCol.index] ?? '', order)
    if (!date || date > today) {
      skipped++
      continue
    }
    let used = false

    // Vikt
    const weightCol = col('weight')
    const kg = weightCol ? toKg(num(row, 'weight'), weightCol.unit) : undefined
    if (kg !== undefined) {
      weights.set(date, kg)
      used = true
    }

    // Kroppsmått
    const waist = toCm(num(row, 'waist'), col('waist')?.unit ?? '')
    const hip = toCm(num(row, 'hip'), col('hip')?.unit ?? '')
    const fatPct = num(row, 'bodyFat')?.value
    const bodyFat = fatPct !== undefined && fatPct >= 2 && fatPct <= 75 ? round(fatPct) : undefined
    if (waist !== undefined || hip !== undefined || bodyFat !== undefined) {
      const m = measurements.get(date) ?? { date }
      if (waist !== undefined) m.waistCm = waist
      if (hip !== undefined) m.hipCm = hip
      if (bodyFat !== undefined) m.bodyFatPct = bodyFat
      measurements.set(date, m)
      used = true
    }

    // Mat: kräver energi. Övriga näringsämnen är okända om de saknas.
    const kcalCol = col('kcal')
    const energy = num(row, 'kcal')
    if (kcalCol && energy) {
      const kcal = /^kj$/.test(energy.unit || kcalCol.unit) ? energy.value / 4.184 : energy.value
      if (kcal >= 0 && kcal <= MAX_KCAL) {
        const nutrients: Nutrients = { kcal }
        for (const f of FOOD_FIELDS) {
          const v = num(row, f)?.value
          if (v !== undefined && v >= 0 && v <= MAX_GRAMS) nutrients[f] = v
        }
        // Natrium (mg) → salt (g): salt = natrium × 2,5.
        const sodium = num(row, 'sodium')
        if (nutrients.salt === undefined && sodium && sodium.value >= 0) {
          const mg = (sodium.unit || col('sodium')?.unit) === 'g' ? sodium.value * 1000 : sodium.value
          if (mg <= 100_000) nutrients.salt = (mg * 2.5) / 1000
        }
        const mealCol = col('meal')
        const label = (mealCol ? (row[mealCol.index] ?? '').trim() : '') || 'Dagssumma'
        const key = `${date}|${label.toLocaleLowerCase('sv-SE')}`
        const group = groups.get(key) ?? { date, label, rows: [] }
        group.rows.push(nutrients)
        groups.set(key, group)
        used = true
      }
    }

    if (!used) skipped++
  }

  const quick: QuickEntry[] = []
  let seq = 0
  for (const g of groups.values()) {
    const nutrients: Nutrients = { kcal: round(g.rows.reduce((s, r) => s + (r.kcal ?? 0), 0)) }
    for (const f of FOOD_FIELDS) {
      // Bara om varje rad har värdet – annars är summan okänd.
      if (g.rows.every((r) => r[f] !== undefined)) nutrients[f] = round(g.rows.reduce((s, r) => s + (r[f] ?? 0), 0), f === 'salt' ? 2 : 1)
    }
    // Tomma måltider (0 kcal och inget annat) tas inte med.
    if (!nutrients.kcal && FOOD_FIELDS.every((f) => !nutrients[f])) continue
    quick.push({
      id: quickImportId(g.date, g.label),
      kind: 'quick',
      date: g.date,
      meal: mealFromLabel(g.label),
      name: `Från ${source}`,
      note: `Importerat från ${source} – ${g.label}`,
      nutrients,
      createdAt: now + seq++,
    })
  }

  return {
    source,
    weights: [...weights.entries()]
      .map(([date, kg]): WeightEntry => ({ id: `imp_w_${contentHash(`${date}|${kg}`)}`, date, kg, createdAt: now }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    measurements: [...measurements.values()]
      .map((m): MeasurementEntry => ({ ...m, id: measurementId(m), createdAt: now }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    quick: quick.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    skipped,
  }
}

/** Slå ihop resultat från flera filer (t.ex. i en zip) – senare vikter och mått vinner per dag. */
export function combineImports(list: readonly CsvImport[]): CsvImport {
  const weights = new Map<ISODate, WeightEntry>()
  const measurements = new Map<ISODate, MeasurementEntry>()
  const quick = new Map<string, QuickEntry>()
  let skipped = 0
  for (const r of list) {
    for (const w of r.weights) weights.set(w.date, w)
    for (const m of r.measurements) measurements.set(m.date, { ...measurements.get(m.date), ...m })
    for (const q of r.quick) if (!quick.has(q.id)) quick.set(q.id, q)
    skipped += r.skipped
  }
  return {
    source: list.some((r) => r.source === MFP) ? MFP : (list[0]?.source ?? OTHER),
    weights: [...weights.values()].sort((a, b) => a.date.localeCompare(b.date)),
    measurements: [...measurements.values()]
      .map((m): MeasurementEntry => ({ ...m, id: measurementId(m) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    quick: [...quick.values()].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    skipped,
  }
}

/**
 * Läs en vald fil: en CSV-fil eller en zip-fil med CSV-filer (MyFitnessPals export). Kastar
 * `ImportCsvError` eller `UnzipError` med ett svenskt felmeddelande.
 */
export async function readImportFile(file: { name: string; size?: number; arrayBuffer(): Promise<ArrayBuffer> }, opts: Omit<ParseOptions, 'fileName'> = {}): Promise<CsvImport> {
  if ((file.size ?? 0) > MAX_IMPORT_BYTES) throw new ImportCsvError('Filen är för stor för att läsas in.')
  const buffer = await file.arrayBuffer()
  if (!looksLikeZip(buffer) && !/\.zip$/i.test(file.name)) {
    return parseCsvImport(decodeText(new Uint8Array(buffer)), { ...opts, fileName: file.name })
  }
  const entries = (await unzip(buffer)).filter((e) => /\.(csv|txt)$/i.test(e.name) && !/(^|\/)(__MACOSX\/|\._)/.test(e.name))
  if (entries.length === 0) throw new ImportCsvError('Zip-filen innehåller inga CSV-filer.')
  // Skydd mot "zip-bomber": den uppackade storleken står i zip-filen och kontrolleras vid uppackningen.
  if (entries.reduce((sum, e) => sum + e.size, 0) > MAX_UNZIPPED_BYTES) throw new ImportCsvError('Filen är för stor för att läsas in.')
  const source = entries.some((e) => /nutrition-summary|measurement-summary|exercise-summary|myfitnesspal/i.test(e.name)) || /myfitnesspal/i.test(file.name) ? MFP : opts.source
  const results: CsvImport[] = []
  for (const entry of entries) {
    try {
      results.push(parseCsvImport(await entry.text(), { ...opts, source, fileName: entry.name }))
    } catch (e) {
      // En fil utan kolumner som Lagom känner igen (t.ex. träning) hoppas över.
      if (!(e instanceof ImportCsvError)) throw e
    }
  }
  if (results.length === 0) throw new ImportCsvError('Hittade inga kolumner som Lagom känner igen i zip-filen (t.ex. Calories, Kalorier, Weight eller Vikt).')
  return combineImports(results)
}

// ---------------------------------------------------------------------------
// Betalväggen och import till butikerna
// ---------------------------------------------------------------------------

export interface ImportAccess {
  /** Provperiodens första dag (lokal), eller null om den inte har startat. */
  trialStart: ISODate | null
  /** Får man logga nytt just nu (`currentAccess().canLog`)? */
  canLog: boolean
}

/**
 * Tillämpa betalväggen: allt daterat före provperiodens start importeras alltid (det är historik
 * från den andra appen). Från och med provstarten importeras bara om man får logga – annars hoppas
 * de dagarna över. Returnerar vad som återstår och hur många dagar som hoppades över.
 */
export function gateImport(data: CsvImport, access: ImportAccess): { data: CsvImport; blockedDays: number } {
  if (access.canLog) return { data, blockedDays: 0 }
  const blocked = new Set<ISODate>()
  const allowed = <T extends { date: ISODate }>(list: readonly T[]) =>
    list.filter((x) => {
      const ok = access.trialStart !== null && x.date < access.trialStart
      if (!ok) blocked.add(x.date)
      return ok
    })
  const next: CsvImport = { ...data, weights: allowed(data.weights), measurements: allowed(data.measurements), quick: allowed(data.quick) }
  return { data: next, blockedDays: blocked.size }
}

export interface ImportCounts {
  entries: number
  weights: number
  measurements: number
  /** Importerade måltider som fanns sedan tidigare import men med andra värden – nu uppdaterade. */
  updated: number
  /** Poster som redan fanns (samma import tidigare, eller egen vikt/mått samma dag). */
  duplicates: number
}

/** Samma näringsvärden (avrundat), så att en oförändrad måltid inte räknas som uppdaterad. */
function sameNutrients(a: Nutrients, b: Nutrients): boolean {
  const same = (x: number | undefined, y: number | undefined) => (x === undefined || y === undefined ? x === y : Math.abs(x - y) < 0.005)
  return same(a.kcal, b.kcal) && FOOD_FIELDS.every((f) => same(a[f], b[f]))
}

/** Antal olika dagar med mat i importen. */
export function importDays(data: CsvImport): number {
  return new Set(data.quick.map((q) => q.date)).size
}

/**
 * Lägg in importen i dagboken och kroppsbutiken.
 * - En måltid som redan har importerats (samma datum och måltid, samma id) läggs aldrig till en
 *   gång till. Har värdena ändrats (en nyare export) uppdateras den importerade måltiden.
 * - Det användaren själv har loggat ändras aldrig: en egen vikt eller ett eget mått samma dag
 *   behålls, och egna poster i dagboken rörs inte.
 */
export function applyImport(data: CsvImport): ImportCounts {
  const counts: ImportCounts = { entries: 0, weights: 0, measurements: 0, updated: 0, duplicates: 0 }

  const diary = useDiaryStore.getState()
  const entries = { ...diary.entries }
  for (const q of data.quick) {
    const list = entries[q.date] ?? []
    const index = list.findIndex((e) => e.id === q.id)
    if (index < 0) {
      entries[q.date] = [...list, q]
      counts.entries++
      continue
    }
    const existing = list[index]
    if (existing.kind !== 'quick' || sameNutrients(existing.nutrients, q.nutrients)) {
      counts.duplicates++
      continue
    }
    // Samma måltid med nya värden: ersätt den importerade posten (behåll dess plats och tid).
    const next: QuickEntry = { ...q, createdAt: existing.createdAt, ...(existing.time ? { time: existing.time } : {}) }
    entries[q.date] = list.map((e, i) => (i === index ? next : e))
    counts.updated++
  }
  if (counts.entries > 0 || counts.updated > 0) useDiaryStore.setState({ entries })

  const body = useBodyStore.getState()
  const weightDates = new Set(body.weights.map((w) => w.date))
  const newWeights = data.weights.filter((w) => {
    if (weightDates.has(w.date)) {
      counts.duplicates++
      return false
    }
    return true
  })
  const measurementDates = new Set(body.measurements.map((m) => m.date))
  const newMeasurements = data.measurements.filter((m) => {
    if (measurementDates.has(m.date)) {
      counts.duplicates++
      return false
    }
    return true
  })
  counts.weights = newWeights.length
  counts.measurements = newMeasurements.length
  if (newWeights.length > 0 || newMeasurements.length > 0) {
    const byDate = <T extends { date: ISODate }>(a: T, b: T) => a.date.localeCompare(b.date)
    useBodyStore.setState({
      weights: [...body.weights, ...newWeights].sort(byDate),
      measurements: [...body.measurements, ...newMeasurements].sort(byDate),
    })
  }
  return counts
}
