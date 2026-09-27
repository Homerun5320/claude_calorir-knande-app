import { createBackup, type BackupFile } from '../../lib/backup'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { backupDateLabel, restoreBackupSafely } from './backupImport'

describe('backupDateLabel', () => {
  it('visar datumet på svenska, eller "okänt datum"', () => {
    expect(backupDateLabel(new Date(2026, 8, 20, 12).toISOString())).toBe('20 september 2026')
    expect(backupDateLabel(undefined)).toBe('okänt datum')
    expect(backupDateLabel('igår')).toBe('okänt datum')
    expect(backupDateLabel({})).toBe('okänt datum')
  })
})

describe('restoreBackupSafely', () => {
  beforeEach(() => {
    useDiaryStore.getState().clearDiary()
    useFoodStore.getState().clearFoods()
    useBodyStore.setState({ weights: [{ id: 'w1', date: '2026-09-01', kg: 70, createdAt: 0 }], measurements: [] })
    useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS } })
  })

  it('återställer som vanligt när filen är hel', () => {
    const backup = createBackup()
    useBodyStore.setState({ weights: [], measurements: [] })
    restoreBackupSafely(backup, 'replace')
    expect(useBodyStore.getState().weights).toHaveLength(1)
  })

  it('rullar tillbaka allt om importen kastar halvvägs', () => {
    const diaryBefore = useDiaryStore.getState().entries
    const weightsBefore = useBodyStore.getState().weights
    const broken = {
      ...createBackup(),
      data: {
        ...createBackup().data,
        diary: { entries: { '2026-09-02': [{ id: 'q1', kind: 'quick', date: '2026-09-02', meal: 'lunch', name: 'Soppa', nutrients: { kcal: 300 }, createdAt: 0 }] } },
        body: { weights: 'trasig' },
      },
    } as unknown as BackupFile
    expect(() => restoreBackupSafely(broken, 'merge')).toThrow()
    expect(useDiaryStore.getState().entries).toBe(diaryBefore)
    expect(useBodyStore.getState().weights).toBe(weightsBefore)
  })
})
