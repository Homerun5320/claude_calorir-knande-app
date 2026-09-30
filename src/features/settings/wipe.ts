/**
 * Efter radering: börja om från välkomstflödet. Delas av Inställningar → Data och markeringen
 * för exempeldata ("Börja med min egen profil").
 */
import { CLOUD_ENABLED } from '../../config/cloud'
import { wipeAllData } from '../../lib/backup'
import { clearDemoFlag, isDemoData } from '../../lib/demoFlag'
import { logError } from '../../lib/errorLog'
import { isNative, loadNative } from '../../native'
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
 * De inbyggda apparna: ta bort det som ligger utanför butikerna – den automatiska kopian
 * (`lagom-spegling.json`), exportfiler i cachen, kopplingen till Apple Hälsa/Health Connect
 * (`lagom-health`) och hemskärmswidgetens sammanfattning (SharedPreferences "lagom-widget" på
 * Android). "Radera all data" får inte kunna ta tillbaka något. No-op på webben; kastar aldrig.
 *
 * `keepMirror`: raderingen gällde bara exempeldata ("Skapa min egen profil"). Exempeldata speglas
 * aldrig, så en kopia som finns är användarens egen tidigare dagbok – den får ligga kvar och
 * ersätts först när något nytt läggs in. Widgeten töms alltid: den ska visa det som finns i appen
 * nu, och den fylls igen när något nytt läggs in.
 */
export async function clearNativeCopies(opts: { keepMirror?: boolean } = {}): Promise<void> {
  if (!isNative()) return
  try {
    const [mirror, files, health, widget] = await Promise.all([
      opts.keepMirror ? null : loadNative('mirror'),
      loadNative('files'),
      loadNative('health'),
      loadNative('widget'),
    ])
    health?.resetHealth()
    await Promise.all([mirror?.deleteMirror(), files?.clearExportCache(), widget?.clearWidget()])
  } catch (error) {
    logError(error, 'radera: kopior i appen')
  }
}

/**
 * Framstegsbilderna: webbens databas `lagom-bilder` och filerna i apparna (med Android-kamerans
 * tillfälliga original). De ligger utanför `STORE_KEYS` och raderas därför här. Laddas med dynamisk
 * import så att bildkoden inte följer med i huvudpaketet. Kastar aldrig.
 */
export async function deleteProgressPhotos(): Promise<void> {
  try {
    const { deleteAllProgressPhotos } = await import('../../lib/progressPhotos')
    await deleteAllProgressPhotos()
  } catch (error) {
    logError(error, 'radera: framstegsbilder')
  }
}

/**
 * Radera all data och gör appen redo för en ny profil. Provperiodens start finns kvar, och
 * licensen behålls om inte `removeLicense` anges. Är Lagom Moln påslaget loggas man också ut på
 * den här enheten (se `signOutOfCloud`). Framstegsbilderna raderas (se `deleteProgressPhotos`), och
 * i apparna tas också kopian på telefonen, exportfilerna, hälsokopplingen och widgetens
 * sammanfattning bort (se `clearNativeCopies`) – kopian och bilderna dock inte när det bara var
 * exempeldata som raderades: exempeldata speglas aldrig och kan inte ha bilder, så det som finns
 * är användarens eget.
 */
export function wipeAndReset(opts: { removeLicense?: boolean } = {}): Promise<void> {
  const demo = isDemoData()
  wipeAllData(opts)
  resetAfterWipe()
  return Promise.all([signOutOfCloud(), clearNativeCopies({ keepMirror: demo }), demo ? undefined : deleteProgressPhotos()]).then(() => undefined)
}
