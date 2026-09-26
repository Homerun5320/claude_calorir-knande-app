/**
 * När gjordes senaste säkerhetskopian? Sparas per enhet i localStorage (en bekvämlighet – om
 * värdet saknas visas bara en mjuk påminnelse). Används av Inställningar → Data och Mer-sidan.
 */
import { useSyncExternalStore } from 'react'

export const LAST_BACKUP_KEY = 'lagom-last-backup'
/** Påminn om säkerhetskopia efter så här många dagar. */
export const BACKUP_REMINDER_DAYS = 30

const listeners = new Set<() => void>()

export function readLastBackup(): number | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY)
    const n = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function write(value: number | null) {
  try {
    if (value === null) localStorage.removeItem(LAST_BACKUP_KEY)
    else localStorage.setItem(LAST_BACKUP_KEY, String(value))
  } catch {
    /* lagring blockerad – ingen fara */
  }
  listeners.forEach((l) => l())
}

export function markBackupNow(now: number = Date.now()): void {
  write(now)
}

export function clearLastBackup(): void {
  write(null)
}

/** true om det är dags att påminna om en säkerhetskopia. */
export function backupDue(last: number | null, now: number, hasData: boolean, days = BACKUP_REMINDER_DAYS): boolean {
  if (!hasData) return false
  if (last === null) return true
  return now - last > days * 86_400_000
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === LAST_BACKUP_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Tidpunkt (ms) för senaste säkerhetskopian på den här enheten, eller null. */
export function useLastBackup(): number | null {
  return useSyncExternalStore(subscribe, readLastBackup, () => null)
}
