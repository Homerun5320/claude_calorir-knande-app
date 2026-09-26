import { beforeEach, describe, expect, it } from 'vitest'
import { createBackup, diaryToCsv, parseBackup, restoreBackup, summarizeBackup, wipeAllData, BackupError } from './backup'
import { useDiaryStore } from '../stores/diaryStore'
import { useBodyStore } from '../stores/bodyStore'
import type { Food } from '../types'

const mjolk: Food = {
  id: 'lagom:test-mjolk',
  name: 'Mjölk 1,5 %',
  source: 'lagom',
  category: 'mejeri',
  nutrients: { kcal: 46, protein: 3.5, carbs: 4.8, fat: 1.5 },
  portions: [{ id: 'glas', label: '1 glas (2 dl)', grams: 206 }],
  density: 1.03,
  liquid: true,
}

describe('backup', () => {
  beforeEach(() => wipeAllData())

  it('exporterar och återställer (ersätt)', () => {
    useDiaryStore.getState().addEntry({ kind: 'food', food: mjolk, amount: 1, unit: 'portion:glas', grams: 206, date: '2026-09-20', meal: 'frukost' })
    useBodyStore.getState().logWeight('2026-09-20', 72.4)
    const json = JSON.stringify(createBackup())
    wipeAllData()
    expect(useDiaryStore.getState().entries).toEqual({})
    const parsed = parseBackup(json)
    expect(summarizeBackup(parsed)).toMatchObject({ days: 1, entries: 1, weights: 1 })
    restoreBackup(parsed, 'replace')
    expect(useDiaryStore.getState().entries['2026-09-20']).toHaveLength(1)
    expect(useBodyStore.getState().weights[0].kg).toBe(72.4)
  })

  it('sammanfogar utan dubbletter', () => {
    const e = useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Fika', nutrients: { kcal: 300 }, date: '2026-09-21', meal: 'fika' })
    const backup = parseBackup(JSON.stringify(createBackup()))
    restoreBackup(backup, 'merge')
    expect(useDiaryStore.getState().entries['2026-09-21'].map((x) => x.id)).toEqual([e.id])
  })

  it('avvisar felaktiga filer med svensk text', () => {
    expect(() => parseBackup('inte json')).toThrow(BackupError)
    expect(() => parseBackup('{"format":"annat"}')).toThrow('ingen säkerhetskopia')
  })

  it('skapar CSV med semikolon och decimalkomma', () => {
    useDiaryStore.getState().addEntry({ kind: 'food', food: mjolk, amount: 1, unit: 'portion:glas', grams: 206, date: '2026-09-20', meal: 'frukost' })
    const csv = diaryToCsv(useDiaryStore.getState().entries)
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('Datum;Måltid')
    expect(lines[1]).toContain('Mjölk 1,5 %')
    expect(lines[1]).toContain('94,76') // 46 kcal × 2,06
  })
})
