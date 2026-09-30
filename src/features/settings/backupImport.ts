/**
 * Import av säkerhetskopia från gränssnittet (Inställningar → Data och välkomstflödet).
 *
 * - `backupDateLabel`: när kopian skapades, eller "okänt datum" om filen saknar ett giltigt datum.
 * - `restoreBackupSafely`: återställer och rullar tillbaka allt om något går fel på vägen, så att
 *   "Ingen data har ändrats" verkligen stämmer.
 */
import { restoreBackup, type BackupFile } from '../../lib/backup'
import { MONTHS } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { usePlanStore } from '../../stores/planStore'

/** "20 september 2026" för kopians exportdatum, eller "okänt datum" om det saknas eller är ogiltigt. */
export function backupDateLabel(exportedAt: unknown): string {
  if (typeof exportedAt !== 'string' && typeof exportedAt !== 'number') return 'okänt datum'
  const d = new Date(exportedAt)
  if (Number.isNaN(d.getTime())) return 'okänt datum'
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

type Snapshot = [
  ReturnType<typeof useProfileStore.getState>,
  ReturnType<typeof useDiaryStore.getState>,
  ReturnType<typeof useFoodStore.getState>,
  ReturnType<typeof useBodyStore.getState>,
  ReturnType<typeof useFastingStore.getState>,
  ReturnType<typeof useLicenseStore.getState>,
  ReturnType<typeof usePlanStore.getState>,
]

function snapshot(): Snapshot {
  return [
    useProfileStore.getState(),
    useDiaryStore.getState(),
    useFoodStore.getState(),
    useBodyStore.getState(),
    useFastingStore.getState(),
    useLicenseStore.getState(),
    usePlanStore.getState(),
  ]
}

function rollback([profile, diary, food, body, fasting, license, plan]: Snapshot): void {
  useProfileStore.setState(profile, true)
  useDiaryStore.setState(diary, true)
  useFoodStore.setState(food, true)
  useBodyStore.setState(body, true)
  useFastingStore.setState(fasting, true)
  useLicenseStore.setState(license, true)
  usePlanStore.setState(plan, true)
}

/**
 * Återställ från säkerhetskopian. Om något kastar på vägen (t.ex. en skadad fil där bara vissa
 * delar hunnit läsas in) återställs alla butiker till läget före importen och felet kastas vidare.
 */
export function restoreBackupSafely(backup: BackupFile, mode: 'merge' | 'replace'): void {
  const before = snapshot()
  try {
    restoreBackup(backup, mode)
  } catch (err) {
    rollback(before)
    throw err
  }
}
