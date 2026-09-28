/**
 * Lagom Moln – en frivillig, krypterad molnkopia av dagboken. AVSTÄNGD som standard.
 *
 * Funktionen slås på först när bygget har både `VITE_SUPABASE_URL` (https://<ref>.supabase.co)
 * och `VITE_SUPABASE_PUBLISHABLE_KEY` (en publik nyckel som börjar med `sb_publishable_`). Saknas
 * någon av dem – eller ser de fel ut – är `CLOUD_ENABLED` false och appen fungerar precis som
 * vanligt, helt utan konto och server. Se docs/BACKEND.md och docs/DPIA-SYNK.md innan den slås på.
 *
 * Den här filen får importeras statiskt (den är liten och innehåller ingen molnkod). Allt i
 * src/lib/cloud och Inställningar → Lagom Moln laddas bara med dynamisk import när
 * `CLOUD_ENABLED` är true.
 *
 * En hemlig nyckel (`sb_secret_…` eller en gammal service_role-nyckel) får ALDRIG ligga i en
 * VITE_-variabel – den hamnar då i appen och ger full åtkomst till databasen. En sådan nyckel
 * godtas inte här (molnet förblir avstängt).
 */

export interface CloudConfig {
  /** Projektets adress utan avslutande snedstreck, t.ex. https://abcd.supabase.co. '' om den saknas. */
  url: string
  /** Den publika nyckeln (`sb_publishable_…`). '' om den saknas. */
  publishableKey: string
  /** true när både adressen och den publika nyckeln är giltiga. */
  enabled: boolean
}

/**
 * Tolka miljövariablerna. Exporteras för tester – appen använder konstanterna nedan.
 *
 * `allowLocalHttp` (bara i utvecklingsläget, `npm run dev`) godtar även http://localhost och
 * http://127.0.0.1, så att den lokala Supabase-stacken (`npx supabase start`) kan provas.
 */
export function parseCloudConfig(env: Readonly<Record<string, string | undefined>>, opts: { allowLocalHttp?: boolean } = {}): CloudConfig {
  const url = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
  const publishableKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
  const local = opts.allowLocalHttp === true && /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(url)
  const urlOk = local || /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(url)
  const keyOk = /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)
  return { url, publishableKey, enabled: urlOk && keyOk }
}

const config = parseCloudConfig(import.meta.env as Record<string, string | undefined>, { allowLocalHttp: import.meta.env.DEV })

/** Supabase-projektets adress utan avslutande snedstreck ('' när Lagom Moln är avstängt). */
export const SUPABASE_URL = config.enabled ? config.url : ''

/**
 * Den publika nyckeln (`sb_publishable_…`, '' när Lagom Moln är avstängt). Den får synas i appen –
 * skyddet ligger i databasens radskydd (RLS) och i att allt innehåll är krypterat på enheten.
 */
export const SUPABASE_PUBLISHABLE_KEY = config.enabled ? config.publishableKey : ''

/** true när Lagom Moln finns i den här versionen av appen. */
export const CLOUD_ENABLED = config.enabled
