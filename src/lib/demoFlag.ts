/**
 * Markeringen "appen visar exempeldata" – liten och fristående, så att hela exempelveckan
 * (`demo.ts`) kan laddas först när någon väljer att utforska.
 *
 * Markeringen ligger i localStorage. Ändringar i samma flik meddelas via `subscribeDemoFlag`,
 * ändringar i andra flikar via `storage`-händelsen.
 */

export const DEMO_FLAG_KEY = 'lagom-demo'

const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((l) => l())
}

/** true om appen just nu visar exempeldata. */
export function isDemoData(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function setDemoFlag(): void {
  try {
    localStorage.setItem(DEMO_FLAG_KEY, '1')
  } catch {
    /* lagring kan vara blockerad */
  }
  notify()
}

export function clearDemoFlag(): void {
  try {
    localStorage.removeItem(DEMO_FLAG_KEY)
  } catch {
    /* ignorera */
  }
  notify()
}

/** Lyssna på ändringar av markeringen (i den här fliken och i andra). */
export function subscribeDemoFlag(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === DEMO_FLAG_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
