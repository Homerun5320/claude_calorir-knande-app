/**
 * Efter radering: börja om från välkomstflödet. Delas av Inställningar → Data och markeringen
 * för exempeldata ("Börja med min egen profil").
 */
import { CLOUD_ENABLED } from '../../config/cloud'
import { wipeAllData } from '../../lib/backup'
import { clearDemoFlag } from '../../lib/demoFlag'
import { logError } from '../../lib/errorLog'
import { isNative, loadNative } from '../../native'
import { wipeBasket } from '../add/basketStore'
import { clearLastBackup } from './backupStatus'

/**
 * Nollställ det som hör till den raderade datan (exempelmarkering, senaste kopia, utkast och
 * korgen – både i minnet och i sessionStorage, så att den förra profilens varor inte dyker upp i
 * den nya profilens "Lägg till").
 */
export function resetAfterWipe(): void {
  clearDemoFlag()
  clearLastBackup()
  wipeBasket()
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
 * `keepMirror`: raderingen gäller bara exempeldata ("Skapa min egen profil"). Exempeldata speglas
 * aldrig, så en kopia som finns är användarens egen tidigare dagbok – den får ligga kvar och
 * ersätts först när något nytt läggs in. Sätts bara på uttrycklig begäran av den som rensar
 * exempeldata (`wipeAndReset({ keepOwnCopies: true })`), aldrig av att exempeldata råkar vara
 * påslaget: "Radera all data" ska ta bort kopian även då. Widgeten töms alltid: den ska visa det
 * som finns i appen nu, och den fylls igen när något nytt läggs in.
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

/** Webbens runtime-cache för produktbilder (service workern, `runtimeCaching` i vite.config.ts). */
export const OFF_IMAGES_CACHE = 'off-images'

/**
 * Webbens service worker-cache med produktbilder: adresserna innehåller streckkoderna på de varor
 * man har tittat på, så den följer med när allt raderas. Appens egna filer (förcachen) och
 * uppdateringsmarkeringen `lagom-sw-meta` rörs inte – de innehåller inga personuppgifter. Saknas
 * Cache API (apparna, äldre webbläsare, testmiljön) görs ingenting. Kastar aldrig.
 */
export async function clearWebCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    await caches.delete(OFF_IMAGES_CACHE)
  } catch (error) {
    logError(error, 'radera: produktbilder i cachen')
  }
}

/**
 * Radera all data och gör appen redo för en ny profil. Provperiodens start finns kvar, och
 * licensen behålls om inte `removeLicense` anges. Är Lagom Moln påslaget loggas man också ut på
 * den här enheten (se `signOutOfCloud`). Korgen töms, framstegsbilderna raderas (se
 * `deleteProgressPhotos`), produktbilderna i webbens cache tas bort (se `clearWebCaches`), och i
 * apparna tas också kopian på telefonen, exportfilerna, hälsokopplingen och widgetens
 * sammanfattning bort (se `clearNativeCopies`).
 *
 * `keepOwnCopies` är till för den som bara rensar exempeldata ("Skapa min egen profil", "Rensa
 * exempeldata"): exempeldata speglas aldrig och kan inte ha bilder, så en kopia eller bilder som
 * finns är användarens eget och får ligga kvar. Det avgörs av anroparen och aldrig av om
 * exempelmarkeringen råkar vara satt – den som trycker på "Radera all data" medan exempeldata är
 * påslaget har bett om att allt ska bort, även en kopia från en tidigare dagbok. Utan valet
 * raderas allt.
 */
export function wipeAndReset(opts: { removeLicense?: boolean; keepOwnCopies?: boolean } = {}): Promise<void> {
  const { keepOwnCopies = false, ...wipeOpts } = opts
  wipeAllData(wipeOpts)
  resetAfterWipe()
  return Promise.all([
    signOutOfCloud(),
    clearNativeCopies({ keepMirror: keepOwnCopies }),
    keepOwnCopies ? undefined : deleteProgressPhotos(),
    keepOwnCopies ? undefined : clearWebCaches(),
  ]).then(() => undefined)
}
