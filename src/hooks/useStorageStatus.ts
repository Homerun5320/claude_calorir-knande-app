import { useSyncExternalStore } from 'react'
import { hasNewerData, hasUnreadableData, isMemoryOnlyStorage, subscribeStorageStatus } from '../stores/storage'

/**
 * true när ändringar just nu inte sparas på enheten (IndexedDB blockerad, full eller långsam,
 * eller sparad data från en nyare version av Lagom). Visa då en lugn uppmaning att exportera en
 * säkerhetskopia.
 */
export function useMemoryOnlyStorage(): boolean {
  return useSyncExternalStore(subscribeStorageStatus, isMemoryOnlyStorage, () => false)
}

/**
 * true när sparad data kommer från en nyare version av Lagom. Den läses inte in och skrivs aldrig
 * över – visa "Din data är från en nyare version av Lagom – uppdatera appen."
 */
export function useHasNewerData(): boolean {
  return useSyncExternalStore(subscribeStorageStatus, hasNewerData, () => false)
}

/**
 * true när sparad data inte går att tolka (t.ex. en trasig månad i dagboken). Den läses inte in och
 * skrivs aldrig över – det är inte webbläsarens fel, så visa en egen text.
 */
export function useHasUnreadableData(): boolean {
  return useSyncExternalStore(subscribeStorageStatus, hasUnreadableData, () => false)
}
