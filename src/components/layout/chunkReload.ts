/**
 * Omladdning när en koddel inte kunde hämtas – vanligt direkt efter en uppdatering, när en gammal
 * flik frågar efter filnamn som inte längre finns. Används av felsidan (RouteError) och av
 * `vite:preloadError` i main.tsx.
 *
 * Skydd mot omladdningsslinga: högst en automatisk omladdning per 30 sekunder, med en flagga i
 * sessionStorage (`lagom-chunk-reload`, nämnd i integritetspolicyn).
 */

export const CHUNK_RELOAD_KEY = 'lagom-chunk-reload'
/** Ladda inte om automatiskt oftare än så här. */
export const CHUNK_RELOAD_GUARD_MS = 30_000

/** Felet beror på att en koddel inte kunde hämtas (vanligt direkt efter en uppdatering). */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS/i.test(message)
}

/**
 * Ladda om sidan en gång. Returnerar true om en omladdning startades, false om det nyss har
 * gjorts (eller om sessionStorage inte går att använda – då vågar vi inte, av rädsla för en slinga).
 */
export function reloadOnce(win: Window = window): boolean {
  try {
    const last = Number(win.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)
    if (Date.now() - last < CHUNK_RELOAD_GUARD_MS) return false
    win.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  win.location.reload()
  return true
}
