/**
 * Start av native-funktionerna i de inbyggda apparna. Laddas bara med dynamisk import från
 * `initNative()` i src/native/index.ts – aldrig statiskt från appkoden.
 *
 * Här får `@capacitor/*` och tilläggen importeras statiskt. Varje funktion (statusfält,
 * tangentbord, bakåtknapp, påminnelser, köp …) läggs i en egen modul under src/native/ och startas
 * härifrån. Ett fel i en funktion får inte stoppa de andra: fånga det och logga med `logError`.
 */
export async function startNative(): Promise<void> {
  // Tom tills vidare – funktionerna läggs till här.
}
