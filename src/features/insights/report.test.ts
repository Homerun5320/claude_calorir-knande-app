import { makePeriod } from './period'
import { buildReport, shareText, type ReportInput } from './report'
import { macroVerdicts } from './aggregate'

const TODAY = '2026-09-26'

function input(over: Partial<ReportInput> = {}): ReportInput {
  const averages = { kcal: 1850, protein: 85, fat: 70, carbs: 210, fiber: 24 }
  return {
    period: makePeriod('vecka', 0, TODAY),
    summary: { elapsedDays: 6, loggedDays: 5, avgKcal: 1850, avgBudget: 2000, nearBudgetDays: 3, totalKcal: 9250 },
    averages,
    targets: { kcal: 2000, proteinG: 90, fiberG: 25 },
    verdicts: macroVerdicts(averages),
    unit: 'kcal',
    mindful: false,
    kostradScore: 72,
    climateKgPerDay: 2.14,
    ...over,
  }
}

describe('veckorapport', () => {
  it('sammanfattar veckan med svenska siffror', () => {
    const r = buildReport(input())
    expect(r.title).toBe('Lagom – vecka 39')
    expect(r.text).toContain('21–27 sep')
    expect(r.text).toContain('Loggade dagar: 5 av 6 dagar')
    expect(r.text).toMatch(/1\s850 kcal/)
    expect(r.text).toContain('Kostrådspoäng: 72 av 100')
    expect(r.text).toContain('2,1 kg CO₂e')
  })

  it('med veckobudget är målet veckans snitt', () => {
    expect(buildReport(input({ weeklyBudget: true })).text).toMatch(/\(mål i snitt 2\s000 kcal med veckobudget\)/)
    expect(buildReport(input()).text).toMatch(/\(mål 2\s000 kcal\)/)
  })

  it('använder kJ när användaren valt det', () => {
    expect(buildReport(input({ unit: 'kJ' })).text).toMatch(/7\s740 kJ/)
  })

  it('visar inga energisiffror i medvetet läge', () => {
    const r = buildReport(input({ mindful: true }))
    expect(r.text).not.toMatch(/kcal|kJ|CO₂e/)
    expect(r.text).toContain('Snittdagen: lagom')
    expect(r.text).not.toContain('72')
  })

  it('är vänlig när inget är loggat', () => {
    const r = buildReport(input({ summary: { elapsedDays: 6, loggedDays: 0, nearBudgetDays: 0, totalKcal: 0 } }))
    expect(r.text).toContain('en ny chans väntar')
  })
})

describe('shareText', () => {
  it('använder delningsdialogen när den finns', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    expect(await shareText('T', 'text', { share })).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'text' })
  })

  it('kopierar till urklipp som reserv och hanterar avbrott', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await shareText('T', 'text', { clipboard: { writeText } })).toBe('copied')
    const abort = Object.assign(new Error('avbrutet'), { name: 'AbortError' })
    expect(await shareText('T', 'text', { share: vi.fn().mockRejectedValue(abort), clipboard: { writeText } })).toBe('cancelled')
    expect(await shareText('T', 'text', {})).toBe('failed')
  })
})
