import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import {
  applyImport,
  combineImports,
  detectDelimiter,
  gateImport,
  ImportCsvError,
  importDays,
  MAX_UNZIPPED_BYTES,
  mealFromLabel,
  parseCsv,
  parseCsvImport,
  parseDateCell,
  parseNumberCell,
  readImportFile,
} from './importCsv'
import { crc32 } from './unzip'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'

const TODAY = '2026-09-28'
const NOW = new Date(2026, 8, 28, 12).getTime()
const opts = { today: TODAY, now: NOW }

/** MyFitnessPals "Nutrition-Summary" (förkortad – de riktiga filerna har fler kolumner). */
const MFP_NUTRITION = [
  'Date,Meal,Calories,Fat (g),Saturated Fat,Polyunsaturated Fat,Cholesterol,Sodium (mg),Carbohydrates (g),Fiber,Sugar,Protein (g),Vitamin A,Note',
  '2026-09-01,Breakfast,412.5,12.1,3.2,1.1,20,380,55.2,6.1,12,18.4,4,',
  '2026-09-01,Lunch,650,20,6,2,55,900,70,8,5,40,10,"Soppa, bröd"',
  '2026-09-01,Snacks,180,,,,,,22,,,4,,',
  '2026-09-02,Dinner,"1,120",40,12,4,110,1500,110,9,14,62,15,',
  '2026-09-02,Meal 5,0,0,0,0,0,0,0,0,0,0,0,',
].join('\r\n')

const MFP_MEASUREMENTS = ['Date,Weight', '2026-09-01,74.5', '2026-09-08,74.1', '2026-09-08,73.9'].join('\n')

describe('CSV-tolken', () => {
  it('hanterar citattecken, radbrytningar i citat och tomma rader', () => {
    expect(parseCsv('a,b,c\n"1,5","sa ""hej""",x\n\n"rad\nett",2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1,5', 'sa "hej"', 'x'],
      ['rad\nett', '2', '3'],
    ])
    expect(parseCsv('Datum;Vikt\r\n2026-09-01;74,5\r\n')).toEqual([
      ['Datum', 'Vikt'],
      ['2026-09-01', '74,5'],
    ])
  })

  it('gissar avgränsaren', () => {
    expect(detectDelimiter('Datum;Vikt;Midja\n1,2;3')).toBe(';')
    expect(detectDelimiter('Date,Meal,Calories')).toBe(',')
    expect(detectDelimiter('Date\tWeight')).toBe('\t')
    expect(detectDelimiter('"Datum, dag";Vikt')).toBe(';')
  })

  it('tolkar tal med decimalkomma, decimalpunkt och enheter – okänt blir undefined', () => {
    expect(parseNumberCell('74,5')?.value).toBe(74.5)
    expect(parseNumberCell('74.5')?.value).toBe(74.5)
    expect(parseNumberCell('1 234,5')?.value).toBe(1234.5)
    expect(parseNumberCell('1.234,5')?.value).toBe(1234.5)
    expect(parseNumberCell('1,120', ',')?.value).toBe(1120)
    expect(parseNumberCell('74,5 kg')).toEqual({ value: 74.5, unit: 'kg' })
    expect(parseNumberCell('')).toBeUndefined()
    expect(parseNumberCell('-')).toBeUndefined()
    expect(parseNumberCell('okänt')).toBeUndefined()
  })

  it('tolkar datum som lokala kalenderdagar', () => {
    expect(parseDateCell('2026-09-01')).toBe('2026-09-01')
    expect(parseDateCell('2026-09-01 23:30:00')).toBe('2026-09-01')
    // Ingen omräkning via UTC – datumet i filen gäller.
    expect(parseDateCell('2026-09-01T23:30:00Z')).toBe('2026-09-01')
    expect(parseDateCell('2026/9/1')).toBe('2026-09-01')
    expect(parseDateCell('01.09.2026')).toBe('2026-09-01')
    expect(parseDateCell('09/01/2026', 'mdy')).toBe('2026-09-01')
    expect(parseDateCell('20260901')).toBe('2026-09-01')
    expect(parseDateCell('2026-02-30')).toBeNull()
    expect(parseDateCell('igår')).toBeNull()
  })

  it('känner igen måltider', () => {
    expect(mealFromLabel('Breakfast')).toBe('frukost')
    expect(mealFromLabel('Lunch')).toBe('lunch')
    expect(mealFromLabel('Dinner')).toBe('middag')
    expect(mealFromLabel('Snacks')).toBe('mellanmal')
    expect(mealFromLabel('Kvällsmat')).toBe('kvallsmat')
    expect(mealFromLabel('Meal 5')).toBe('mellanmal')
  })
})

describe('import från MyFitnessPal', () => {
  it('mappar rubrikerna och gör en snabbregistrering per datum och måltid', () => {
    const r = parseCsvImport(MFP_NUTRITION, { ...opts, fileName: 'Nutrition-Summary-2026-09-01-to-2026-09-02.csv' })
    expect(r.source).toBe('MyFitnessPal')
    // Måltiden med 0 kcal och inga näringsämnen tas inte med.
    expect(r.quick).toHaveLength(4)
    const [breakfast, lunch, snacks, dinner] = r.quick
    expect(breakfast).toMatchObject({
      kind: 'quick',
      date: '2026-09-01',
      meal: 'frukost',
      name: 'Från MyFitnessPal',
      note: 'Importerat från MyFitnessPal – Breakfast',
      nutrients: { kcal: 412.5, fat: 12.1, satFat: 3.2, carbs: 55.2, fiber: 6.1, sugars: 12, protein: 18.4, salt: 0.95 },
    })
    expect(lunch.note).toBe('Importerat från MyFitnessPal – Lunch')
    expect(lunch.meal).toBe('lunch')
    // Tomma celler är okända – aldrig 0.
    expect(snacks.nutrients).toEqual({ kcal: 180, carbs: 22, protein: 4 })
    expect(snacks.nutrients.fat).toBeUndefined()
    // Tusentalsavgränsare i en kommaseparerad fil.
    expect(dinner).toMatchObject({ date: '2026-09-02', meal: 'middag', nutrients: { kcal: 1120 } })
    expect(r.skipped).toBe(0)
    expect(importDays(r)).toBe(2)
  })

  it('läser vikter – senaste värdet samma dag gäller', () => {
    const r = parseCsvImport(MFP_MEASUREMENTS, opts)
    expect(r.weights.map((w) => [w.date, w.kg])).toEqual([
      ['2026-09-01', 74.5],
      ['2026-09-08', 73.9],
    ])
    expect(r.quick).toEqual([])
  })

  it('räknar om pund och tum när rubriken säger det', () => {
    const r = parseCsvImport('Date,Weight (lbs),Waist (in)\n2026-09-01,165,32\n', opts)
    expect(r.weights[0].kg).toBeCloseTo(74.84, 2)
    expect(r.measurements[0].waistCm).toBeCloseTo(81.3, 1)
  })

  it('läser en zip-fil med flera CSV-filer och hoppar över okända filer', async () => {
    const zip = buildStoredZip({
      'Nutrition-Summary-2026-09-01-to-2026-09-02.csv': MFP_NUTRITION,
      'Measurement-Summary-2026-09-01-to-2026-09-08.csv': MFP_MEASUREMENTS,
      'Exercise-Summary-2026-09-01-to-2026-09-08.csv': 'Date,Exercise,Type,Exercise Calories,Exercise Minutes\n2026-09-01,Walking,Cardio,120,30\n',
      '__MACOSX/._Nutrition-Summary.csv': 'skräp',
    })
    const r = await readImportFile({ name: 'File-Export-2026-09-28.zip', arrayBuffer: async () => zip }, opts)
    expect(r.source).toBe('MyFitnessPal')
    expect(r.quick).toHaveLength(4)
    expect(r.weights).toHaveLength(2)
  })
})

describe('allmänna CSV-filer', () => {
  it('svenska rubriker, semikolon och decimalkomma', () => {
    const csv = ['Datum;Vikt (kg);Midja (cm);Kalorier;Protein (g)', '2026-09-01;74,5;86,5;2 150;95,5', '2026-09-02;74,2;;1 980;', '2026-09-03;;;;'].join('\n')
    const r = parseCsvImport(csv, opts)
    expect(r.source).toBe('annan app')
    expect(r.weights.map((w) => w.kg)).toEqual([74.5, 74.2])
    expect(r.measurements).toHaveLength(1)
    expect(r.measurements[0]).toMatchObject({ date: '2026-09-01', waistCm: 86.5 })
    expect(r.quick.map((q) => q.nutrients)).toEqual([{ kcal: 2150, protein: 95.5 }, { kcal: 1980 }])
    expect(r.quick[0]).toMatchObject({ meal: 'mellanmal', note: 'Importerat från annan app – Dagssumma' })
    // Raden utan några värden hoppas över.
    expect(r.skipped).toBe(1)
  })

  it('hoppar över trasiga datum, framtida datum och orimliga värden', () => {
    const csv = ['Date,Weight', 'igår,70', '2026-10-01,70', '2026-09-01,7', '2026-09-02,71'].join('\n')
    const r = parseCsvImport(csv, opts)
    expect(r.weights.map((w) => w.date)).toEqual(['2026-09-02'])
    expect(r.skipped).toBe(3)
  })

  it('europeiska och amerikanska datum med snedstreck', () => {
    expect(parseCsvImport('Date,Weight\n13/09/2026,70\n01/09/2026,71\n', opts).weights.map((w) => w.date)).toEqual(['2026-09-01', '2026-09-13'])
    expect(parseCsvImport('Date,Weight\n09/13/2026,70\n09/01/2026,71\n', opts).weights.map((w) => w.date)).toEqual(['2026-09-01', '2026-09-13'])
  })

  it('ger ett svenskt fel när filen inte går att använda', () => {
    expect(() => parseCsvImport('', opts)).toThrow(ImportCsvError)
    expect(() => parseCsvImport('Namn,Ålder\nAnna,30\n', opts)).toThrow('Hittade ingen datumkolumn (Date eller Datum) i filen.')
    expect(() => parseCsvImport('Datum,Humör\n2026-09-01,glad\n', opts)).toThrow(/Hittade inga kolumner/)
  })
})

describe('dubbletter', () => {
  beforeAll(async () => {
    await waitFor(() => expect(useDiaryStore.persist.hasHydrated() && useBodyStore.persist.hasHydrated()).toBe(true))
  })
  beforeEach(() => {
    useDiaryStore.getState().clearDiary()
    useBodyStore.getState().clearBody()
  })

  it('samma fil två gånger ger inga dubbletter', () => {
    const r = combineImports([parseCsvImport(MFP_NUTRITION, opts), parseCsvImport(MFP_MEASUREMENTS, opts)])
    expect(applyImport(r)).toEqual({ entries: 4, weights: 2, measurements: 0, updated: 0, duplicates: 0 })
    // En ny tolkning av samma fil (senare tidpunkt) ger samma id:n.
    const again = combineImports([parseCsvImport(MFP_NUTRITION, { ...opts, now: NOW + 60_000 }), parseCsvImport(MFP_MEASUREMENTS, opts)])
    expect(again.quick.map((q) => q.id)).toEqual(r.quick.map((q) => q.id))
    expect(applyImport(again)).toEqual({ entries: 0, weights: 0, measurements: 0, updated: 0, duplicates: 6 })
    expect(useDiaryStore.getState().entries['2026-09-01']).toHaveLength(3)
    expect(useBodyStore.getState().weights).toHaveLength(2)
  })

  it('en egen vikt samma dag behålls', () => {
    useBodyStore.getState().logWeight('2026-09-01', 75)
    const counts = applyImport(parseCsvImport(MFP_MEASUREMENTS, opts))
    expect(counts).toMatchObject({ weights: 1, duplicates: 1 })
    expect(useBodyStore.getState().weights.map((w) => [w.date, w.kg])).toEqual([
      ['2026-09-01', 75],
      ['2026-09-08', 73.9],
    ])
  })

  it('en nyare export uppdaterar en importerad måltid – den räknas aldrig två gånger', () => {
    applyImport(parseCsvImport('Date,Meal,Calories\n2026-09-01,Lunch,500\n2026-09-01,Dinner,700\n', opts))
    const [lunch] = useDiaryStore.getState().entries['2026-09-01']
    // Nästa export: lunchen blev komplett, middagen är oförändrad och en ny dag har tillkommit.
    const counts = applyImport(
      parseCsvImport('Date,Meal,Calories,Protein (g)\n2026-09-01,lunch,550,30\n2026-09-01,Dinner,700,\n2026-09-02,Lunch,600,25\n', { ...opts, now: NOW + 86_400_000 }),
    )
    expect(counts).toMatchObject({ entries: 1, updated: 1, duplicates: 1 })
    const day = useDiaryStore.getState().entries['2026-09-01']
    expect(day).toHaveLength(2)
    expect(day[0]).toMatchObject({ id: lunch.id, createdAt: lunch.createdAt, nutrients: { kcal: 550, protein: 30 } })
    expect(day[1].kind === 'quick' && day[1].nutrients).toEqual({ kcal: 700 })
  })

  it('egna poster i dagboken rörs aldrig', () => {
    useDiaryStore.getState().addEntry({ kind: 'quick', date: '2026-09-01', meal: 'lunch', name: 'Egen lunch', nutrients: { kcal: 480 } })
    const counts = applyImport(parseCsvImport('Date,Meal,Calories\n2026-09-01,Lunch,500\n', opts))
    expect(counts).toMatchObject({ entries: 1, updated: 0, duplicates: 0 })
    expect(useDiaryStore.getState().entries['2026-09-01'].map((e) => (e.kind === 'quick' ? e.name : ''))).toEqual(['Egen lunch', 'Från annan app'])
  })

  it('stora zip-filer stoppas innan de packas upp', async () => {
    const zip = buildStoredZip({ 'a.csv': 'Date,Weight\n2026-09-01,70\n', 'b.csv': 'Date,Weight\n2026-09-02,71\n', 'c.csv': 'Date,Weight\n2026-09-03,72\n' })
    // Varje fil säger sig vara under gränsen per fil, men tillsammans är de för stora.
    const view = new DataView(zip)
    const eocd = zip.byteLength - 22
    let p = view.getUint32(eocd + 16, true)
    for (let i = 0; i < 3; i++) {
      view.setUint32(p + 24, Math.ceil(MAX_UNZIPPED_BYTES / 3) + 1, true)
      p += 46 + view.getUint16(p + 28, true)
    }
    await expect(readImportFile({ name: 'export.zip', arrayBuffer: async () => zip }, opts)).rejects.toThrow('Filen är för stor för att läsas in.')
  })
})

describe('betalväggen', () => {
  const data = parseCsvImport(
    ['Date,Meal,Calories,Weight', '2026-08-30,Lunch,600,75', '2026-08-31,Lunch,700,', '2026-09-01,Lunch,650,74.8', '2026-09-02,Lunch,620,74.6'].join('\n'),
    opts,
  )

  it('importerar allt när man får logga', () => {
    const { data: out, blockedDays } = gateImport(data, { trialStart: '2026-09-01', canLog: true })
    expect(out).toBe(data)
    expect(blockedDays).toBe(0)
  })

  it('utan licens: bara det som är daterat före provperiodens start', () => {
    const { data: out, blockedDays } = gateImport(data, { trialStart: '2026-09-01', canLog: false })
    expect(out.quick.map((q) => q.date)).toEqual(['2026-08-30', '2026-08-31'])
    // Vikt och mått före provstarten importeras alltid.
    expect(out.weights.map((w) => w.date)).toEqual(['2026-08-30'])
    expect(blockedDays).toBe(2)
  })

  it('utan provstart (t.ex. exempeldata) och utan loggning importeras inget', () => {
    const { data: out, blockedDays } = gateImport(data, { trialStart: null, canLog: false })
    expect(out.quick).toEqual([])
    expect(out.weights).toEqual([])
    expect(blockedDays).toBe(4)
  })
})

/** En zip-fil med lagrade (opackade) poster. */
function buildStoredZip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const [fileName, text] of Object.entries(files)) {
    const name = enc.encode(fileName)
    const data = enc.encode(text)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(6, 0x800, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    parts.push(new Uint8Array(local.buffer), name, data)
    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(8, 0x800, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, data.length, true)
    dir.setUint32(24, data.length, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), name)
    offset += 30 + name.length + data.length
  }
  const size = central.reduce((s, c) => s + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, Object.keys(files).length, true)
  end.setUint16(10, Object.keys(files).length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0))
  let p = 0
  for (const c of all) {
    out.set(c, p)
    p += c.length
  }
  return out.buffer
}
