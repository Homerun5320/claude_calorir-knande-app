/**
 * När gjordes senaste säkerhetskopian? Sparas per enhet i localStorage (en bekvämlighet – om
 * värdet saknas visas bara en mjuk påminnelse). Används av Inställningar → Data och Mer-sidan.
 *
 * I Safari på iPhone/iPad (i webbläsaren, inte som hemskärmsapp) påminner Lagom oftare: Safari
 * kan rensa data för webbplatser man inte besökt på sju dagar, om lagringen inte är beständig.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { isAppleWebKit, isInApp, isStandalone } from '../../config/platform'
import { useDemoData } from '../../hooks/useDemoData'

export const LAST_BACKUP_KEY = 'lagom-last-backup'
/** Påminn om säkerhetskopia efter så här många dagar. */
export const BACKUP_REMINDER_DAYS = 30
/** Påminnelse i Safari i webbläsaren när lagringen inte är beständig (Safaris 7-dagarsrensning). */
export const SAFARI_BACKUP_REMINDER_DAYS = 7

/** Det som avgör hur ofta Lagom påminner om en säkerhetskopia. */
export interface BackupRisk {
  /** Safari på iPhone/iPad i webbläsaren – inte som hemskärmsapp och inte i butiksapparna. */
  safariTab: boolean
  /** Är lagringen beständig (`navigator.storage.persisted()`)? null = okänt eller inte svarat än. */
  persisted: boolean | null
}

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

/**
 * Hur många dagar mellan påminnelserna: 7 i Safari i webbläsaren när lagringen inte är beständig
 * (då kan Safari rensa datan efter en vecka utan besök), annars 30.
 */
export function backupReminderDays(risk: BackupRisk): number {
  return risk.safariTab && risk.persisted !== true ? SAFARI_BACKUP_REMINDER_DAYS : BACKUP_REMINDER_DAYS
}

/**
 * true om det är dags att påminna om en säkerhetskopia. Ren funktion: det fjärde argumentet är
 * antingen antal dagar eller läget (`BackupRisk`) som avgör det – se `backupReminderDays`.
 */
export function backupDue(last: number | null, now: number, hasData: boolean, days: number | BackupRisk = BACKUP_REMINDER_DAYS): boolean {
  if (!hasData) return false
  if (last === null) return true
  const limit = typeof days === 'number' ? days : backupReminderDays(days)
  return now - last > limit * 86_400_000
}

/** Safari på iPhone/iPad i webbläsaren (inte hemskärmsapp, inte butiksapp). */
export function isSafariBrowserTab(): boolean {
  return isAppleWebKit() && !isStandalone() && !isInApp()
}

/** Fråga webbläsaren om lagringen är beständig. null om den inte vet eller inte stöder frågan. */
async function readPersisted(): Promise<boolean | null> {
  try {
    const p = navigator.storage?.persisted?.()
    return p ? await p : null
  } catch {
    return null
  }
}

/**
 * Webbläsarens senaste svar, så att nästa sida börjar med det i stället för "okänt" (annars kan
 * påminnelsen blinka till innan svaret kommer).
 */
let lastPersisted: boolean | null = null

/** Är lagringen beständig? null tills webbläsaren har svarat (eller om den inte stöder frågan). */
export function usePersistedStorage(): boolean | null {
  const [persisted, setPersisted] = useState<boolean | null>(() => lastPersisted)
  useEffect(() => {
    let alive = true
    void readPersisted().then((v) => {
      lastPersisted = v
      if (alive) setPersisted(v)
    })
    return () => {
      alive = false
    }
  }, [])
  return persisted
}

/**
 * true om det är dags att påminna om en säkerhetskopia på den här enheten (för Mer-sidan m.fl.):
 * senaste kopian, lagringens beständighet och om Lagom körs i Safari i webbläsaren.
 */
export function useBackupDue(hasData: boolean, now: number = Date.now()): boolean {
  const last = useLastBackup()
  const persisted = usePersistedStorage()
  // Exempeldata är påhittad – ingen påminnelse om att säkerhetskopiera den.
  const demo = useDemoData()
  return backupDue(last, now, hasData && !demo, { safariTab: isSafariBrowserTab(), persisted })
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
