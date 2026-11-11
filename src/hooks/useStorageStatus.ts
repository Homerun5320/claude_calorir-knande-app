import { useSyncExternalStore } from 'react'
import { hasNewerData, hasSlowReads, hasUnreadableData, isMemoryOnlyStorage, subscribeStorageStatus } from '../stores/storage'

/**
 * true när ändringar just nu inte sparas på enheten (IndexedDB blockerad eller full, sparad data
 * som läses in långsamt eller kommer från en nyare version av Lagom, eller sparad data som inte går
 * att tolka). Visa då en lugn förklaring – orsaken skiljer sig (`useHasNewerData`,
 * `useHasUnreadableData`, `useHasSlowReads`, annars blockerad eller full lagring).
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

/**
 * true när sparad data fortfarande läses in efter mer än åtta sekunder (stor dagbok på en äldre
 * telefon, hängande webbvy). Inget är raderat och datan visas när läsningen är klar – skriv inte
 * att webbläsaren spärrar lagringen, och erbjud ingen säkerhetskopia som låtsas vara hel.
 */
export function useHasSlowReads(): boolean {
  return useSyncExternalStore(subscribeStorageStatus, hasSlowReads, () => false)
}
