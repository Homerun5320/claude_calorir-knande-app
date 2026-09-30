import { useSyncExternalStore } from 'react'
import { isDemoData, subscribeDemoFlag } from '../lib/demoFlag'

/** true medan appen visar exempeldata (uppdateras när exemplet läggs in eller rensas). */
export function useDemoData(): boolean {
  return useSyncExternalStore(subscribeDemoFlag, isDemoData, () => false)
}
