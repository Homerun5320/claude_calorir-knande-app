/**
 * Efter radering: börja om från välkomstflödet. Delas av Inställningar → Data och markeringen
 * för exempeldata ("Börja med min egen profil").
 */
import { CLOUD_ENABLED } from '../../config/cloud'
import { wipeAllData } from '../../lib/backup'
import { clearDemoFlag } from '../../lib/demoFlag'
import { logError } from '../../lib/errorLog'
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
 * Logga ut från Lagom Moln på den här enheten: sessionen spärras hos servern (om den går att nå)
 * och inloggningen och den upplåsta datanyckeln glöms. Annars kunde nästa person som använder
 * enheten (t.ex. en såld eller lånad telefon) öppna den förra ägarens molnkopia – eller få sin egen
 * dagbok uppladdad till den förra ägarens konto. Kopian i molnet raderas inte.
 */
export async function signOutOfCloud(): Promise<void> {
  if (!CLOUD_ENABLED) return
  try {
    // Molnkoden laddas bara med dynamisk import (se src/lib/cloud).
    const { signOut } = await import('../../lib/cloud/supabaseAuth')
    await signOut()
  } catch (error) {
    logError(error, 'radera: utloggning från Lagom Moln')
  }
}

/**
 * Radera all data och gör appen redo för en ny profil. Provperiodens start finns kvar, och
 * licensen behålls om inte `removeLicense` anges. Är Lagom Moln påslaget loggas man också ut på
 * den här enheten (se `signOutOfCloud`).
 */
export function wipeAndReset(opts: { removeLicense?: boolean } = {}): Promise<void> {
  wipeAllData(opts)
  resetAfterWipe()
  return signOutOfCloud()
}
