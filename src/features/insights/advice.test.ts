import { referenceIntakes, type WatchItem } from '../../lib/nnr'
import type { KostradResult } from '../../lib/kostrad'
import { defaultSourceNutrient, isDarkHalfYear, kostradProgressText, kostradScoreLabel, withSeasonalWatch } from './advice'

const refs = referenceIntakes({ sex: 'kvinna', age: 35, lifeStage: 'ingen', weightKg: 65 })

function result(over: Partial<KostradResult>): KostradResult {
  return {
    id: 'frukt_gront',
    title: 'Frukt och grönt',
    advice: '',
    unit: 'g/dag',
    target: 500,
    actual: 320,
    perDay: true,
    direction: 'minst',
    score: 0.64,
    status: 'langt_kvar',
    tip: '',
    emoji: '🥦',
    periodDays: 7,
    source: '',
    ...over,
  }
}

describe('Håll koll på under vinterhalvåret', () => {
  it('vet när det är mörkt halvår', () => {
    expect(isDarkHalfYear('2026-10-01')).toBe(true)
    expect(isDarkHalfYear('2026-03-31')).toBe(true)
    expect(isDarkHalfYear('2026-09-26')).toBe(false)
  })

  it('lyfter vitamin D först under vintern', () => {
    const items: WatchItem[] = [
      { key: 'iron', status: 'lagt', percent: 60, priority: 2, reason: 'Järn.' },
      { key: 'vitD', status: 'lagt', percent: 40, priority: 2, reason: 'D-vitamin.' },
    ]
    const winter = withSeasonalWatch(items, '2026-12-01', { vitD: 4 }, refs)
    expect(winter[0].key).toBe('vitD')
    expect(winter[0].reason).toMatch(/^Under vinterhalvåret/)
    expect(withSeasonalWatch(items, '2026-07-01', { vitD: 4 }, refs)).toEqual(items)
    // Nämner texten redan vintern upprepas det inte.
    const already = withSeasonalWatch([{ ...items[1], reason: 'Solen räcker inte under vinterhalvåret.' }], '2026-12-01', {}, refs)
    expect(already[0].reason).toBe('Solen räcker inte under vinterhalvåret.')
    expect(already[0].priority).toBe(1)
  })

  it('påminner vänligt när vitamin D redan räcker', () => {
    const winter = withSeasonalWatch([], '2026-11-15', { vitD: 20 }, refs)
    expect(winter).toHaveLength(1)
    expect(winter[0].status).toBe('uppnatt')
    expect(winter[0].reason).toMatch(/ligger bra till/)
  })

  it('väljer förvalt ämne för källor', () => {
    expect(defaultSourceNutrient([{ key: 'iodine', status: 'okant', priority: 3, reason: '' }])).toBe('iodine')
    expect(defaultSourceNutrient([])).toBe('protein')
  })
})

describe('kostrådstexter', () => {
  it('beskriver framsteg per dag, per vecka och i dagar', () => {
    expect(kostradProgressText(result({}))).toBe('320\u00a0g/dag – mål 500\u00a0g/dag')
    expect(kostradProgressText(result({ id: 'salt', unit: 'g/dag', direction: 'hogst', target: 6, actual: 7.24 }))).toBe(
      '7,2\u00a0g/dag – högst 6\u00a0g/dag',
    )
    // 28 dagar, 600 g fisk → 150 g per vecka
    expect(kostradProgressText(result({ id: 'fisk', unit: 'g', perDay: false, target: 1200, actual: 600, weeklyTarget: 300, periodDays: 28 }))).toBe(
      '150\u00a0g per vecka – mål 300\u00a0g',
    )
    expect(kostradProgressText(result({ id: 'baljvaxter', unit: 'dagar', perDay: false, target: 5, actual: 2 }))).toBe('2 av 5 dagar')
    // Singular när målet är en dag.
    expect(kostradProgressText(result({ id: 'baljvaxter', unit: 'dagar', perDay: false, target: 1, actual: 0 }))).toBe('0 av 1 dag')
    expect(kostradProgressText(result({ id: 'alkohol', unit: 'standardglas', target: 0, actual: 0 }))).toBe('Inga standardglas')
    expect(kostradProgressText(result({ id: 'alkohol', unit: 'standardglas', target: 0, actual: 3, periodDays: 14 }))).toBe(
      '1,5 standardglas per vecka',
    )
    expect(kostradProgressText(result({ id: 'mattat_fett', unit: 'E%', direction: 'hogst', target: 10, actual: 13.4 }))).toBe(
      '13\u00a0E% – högst 10\u00a0E%',
    )
  })

  it('ger uppmuntrande poängetiketter', () => {
    expect(kostradScoreLabel(85).title).toBe('Riktigt fint')
    expect(kostradScoreLabel(10).title).toBe('Varje steg räknas')
  })
})
