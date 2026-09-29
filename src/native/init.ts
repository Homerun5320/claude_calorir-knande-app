/**
 * Start av native-funktionerna i de inbyggda apparna. Laddas bara med dynamisk import från
 * `initNative()` i src/native/index.ts – aldrig statiskt från appkoden.
 *
 * Varje funktion (statusfält, tangentbord, bakåtknapp, påminnelser, köp …) ligger i en egen modul
 * under src/native/ och startas härifrån med `loadNative()`, så att modulerna blir egna delar i
 * butiksbygget och ett trasigt tillägg bara stänger av sin egen funktion. Ett fel i en funktion
 * får inte stoppa de andra: det fångas och loggas med `logError`.
 *
 * Ordningen:
 * 1. Systemet (statusfält, tangentbord, bakåtknapp, startskärm) – först, eftersom startskärmen
 *    döljs här och inte får vänta bakom långsamma delar.
 * 2. Köpen – `useAccess` väntar på dem vid start (högst 15 s, se src/lib/storePurchases.ts).
 * 3. Påminnelserna – bron till inställningssidan (RemindersSection väntar på `initNative()`).
 * 4. Apple Hälsa/Health Connect – gör inget när kopplingen är av.
 * 5. Speglingen – väntas inte in: den kan vänta på att användaren svarar på frågan om återställning.
 * 6. Android: kamerans tillfälliga originalbilder (full storlek, med EXIF/GPS) från "Ta en bild"
 *    tas bort vid varje start – även om appen stängdes mitt i eller framstegsbilderna är avstängda.
 */
import { logError } from '../lib/errorLog'
import { setNativeStorePurchases } from '../lib/storePurchases'
import { loadNative, nativePlatform } from './index'

export async function startNative(): Promise<void> {
  try {
    const system = await loadNative('system')
    await system?.initSystem()
  } catch (error) {
    logError(error, 'native:system')
  }

  try {
    const purchases = await loadNative('purchases')
    if (purchases) purchases.registerNativePurchases()
    // Tillägget gick inte att ladda – säg direkt att köp i appen inte är tillgängliga.
    else setNativeStorePurchases(null)
  } catch (error) {
    setNativeStorePurchases(null)
    logError(error, 'native:kop')
  }

  void loadNative('mirror')
    .then((m) => m?.startMirror())
    .catch((error: unknown) => logError(error, 'native:mirror'))

  if (nativePlatform() === 'android') {
    void loadNative('photos')
      .then((m) => m?.clearCameraCaptures())
      .catch((error: unknown) => logError(error, 'native:bilder'))
  }

  await Promise.all([
    loadNative('reminders')
      .then((m) => m?.startReminders())
      .catch((error: unknown) => logError(error, 'native:paminnelser')),
    loadNative('health')
      .then((m) => m?.startHealth())
      .catch((error: unknown) => logError(error, 'native:halsa')),
  ])
}
