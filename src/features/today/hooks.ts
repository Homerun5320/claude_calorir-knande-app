/**
 * Små hookar för Idag-skärmen.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ISODate } from '../../types'

/**
 * Aktuell tid som uppdateras med ett intervall (och när appen blir synlig igen).
 * Används bara i de komponenter som behöver klockan, så att inte hela sidan renderas om.
 */
export function useClock(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = window.setInterval(tick, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])
  return now
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* privat läge eller blockerad lagring – då gäller valet bara tills sidan laddas om */
  }
}

/**
 * Något som kan döljas för en dag (t.ex. dagens tips). Valet sparas lokalt i webbläsaren
 * och gäller bara den angivna dagen – imorgon visas det igen.
 * Returnerar [dolt, dölj, visa igen].
 */
export function useDismissedForDay(key: string, day: ISODate): [boolean, () => void, () => void] {
  const [stored, setStored] = useState(() => readStorage(key))
  const dismiss = useCallback(() => {
    writeStorage(key, day)
    setStored(day)
  }, [key, day])
  const restore = useCallback(() => {
    writeStorage(key, null)
    setStored(null)
  }, [key])
  return [stored === day, dismiss, restore]
}
