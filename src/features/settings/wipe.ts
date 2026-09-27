/**
 * Efter radering: börja om från välkomstflödet. Delas av Inställningar → Data och markeringen
 * för exempeldata ("Börja med min egen profil").
 */
import { wipeAllData } from '../../lib/backup'
import { clearDemoFlag } from '../../lib/demoFlag'
import { clearLastBackup } from './backupStatus'

/** Nollställ det som hör till den raderade datan (exempelmarkering, senaste kopia, utkast). */
export function resetAfterWipe(): void {
  clearDemoFlag()
  clearLastBackup()
  try {
    sessionStorage.removeItem('lagom-onboarding')
  } catch {
    /* ignorera */
  }
}

/**
 * Radera all data och gör appen redo för en ny profil. Provperiodens start finns kvar, och
 * licensen behålls om inte `removeLicense` anges.
 */
export function wipeAndReset(opts: { removeLicense?: boolean } = {}): void {
  wipeAllData(opts)
  resetAfterWipe()
}
