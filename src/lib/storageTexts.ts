/**
 * Texter om att ändringar inte sparas på enheten. Delas av varningen på alla sidor (AppShell) och
 * av Inställningar → Data (DataSection), så att de inte glider isär. I apparna står aldrig
 * "webbläsaren" eller "privat läge" – och aldrig en annan plattforms namn (App Store-riktlinje 2.3.10).
 */
import { isInApp } from '../config/platform'

/**
 * Varför Lagom inte kan spara – blockerad eller full lagring. Inte för sparad data som läses in
 * långsamt (`slowReadText`), kommer från en nyare version eller inte går att tolka: de har egna
 * texter, och då är det inte webbläsarens fel.
 */
export function storageBlockedCause(inApp: boolean = isInApp()): string {
  return inApp
    ? 'Lagom kan inte spara på enheten just nu – t.ex. när lagringen är full.'
    : 'Webbläsaren låter inte Lagom spara – t.ex. i privat läge, när lagringen är full eller när webbplatsdata är avstängd.'
}

/** Hur länge det du gör finns kvar när det inte sparas: tills appen (eller fliken) stängs. */
export function storageMemoryOnlyScope(inApp: boolean = isInApp()): string {
  return `Det du gör finns kvar tills du stänger ${inApp ? 'appen' : 'fliken'}, men inte längre.`
}

/** Rubrik när sparad data läses in långsamt (mer än åtta sekunder). */
export const SLOW_READ_TITLE = 'Din sparade data läses in långsamt'

/**
 * Lugn förklaring när sparad data läses in långsamt: inget är raderat, datan visas när läsningen är
 * klar och det som ändras innan dess sparas inte (nyckeln skrivs aldrig över medan den är oläst).
 */
export function slowReadText(inApp: boolean = isInApp()): string {
  return `Inget är raderat – din sparade data ligger kvar och visas så fort den har lästs in. Vänta en stund eller ${
    inApp ? 'starta om appen' : 'ladda om sidan'
  }. Det du ändrar innan dess sparas inte.`
}
