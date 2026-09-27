import { useSyncExternalStore } from 'react'
import { isMemoryOnlyStorage, subscribeStorageStatus } from '../stores/storage'

/**
 * true när ändringar just nu inte sparas på enheten (IndexedDB blockerad, full eller långsam).
 * Visa då en lugn uppmaning att exportera en säkerhetskopia.
 */
export function useMemoryOnlyStorage(): boolean {
  return useSyncExternalStore(subscribeStorageStatus, isMemoryOnlyStorage, () => false)
}
