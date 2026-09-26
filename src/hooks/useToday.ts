import { useEffect, useState } from 'react'
import { todayISO } from '../lib/dates'

/** Dagens datum som uppdateras vid midnatt (och när appen återfår fokus). */
export function useToday(): string {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const tick = () => setToday((prev) => (prev === todayISO() ? prev : todayISO()))
    const id = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}
