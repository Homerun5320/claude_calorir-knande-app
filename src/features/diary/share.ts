/**
 * Dela text med Web Share API – med urklipp som reserv (t.ex. på datorer utan delningsdialog). I de
 * inbyggda apparna används systemets delningsblad (`src/native/files.ts`), eftersom Androids
 * webbvy saknar `navigator.share`.
 */
import { isNative, loadNative } from '../../native'

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

interface ShareEnv {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data?: ShareData) => boolean
  clipboard?: { writeText?: (text: string) => Promise<void> }
}

/** true om felet är att användaren stängde delningsdialogen (AbortError). */
export function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError'
}

/**
 * Dela `text`. Returnerar vad som hände så att anroparen kan visa rätt notis:
 * - 'shared'    – delningsdialogen användes
 * - 'copied'    – texten kopierades till urklipp
 * - 'cancelled' – användaren stängde delningsdialogen
 * - 'failed'    – varken delning eller urklipp fungerade
 */
export async function shareOrCopy(title: string, text: string, env: ShareEnv | undefined = typeof navigator !== 'undefined' ? navigator : undefined): Promise<ShareOutcome> {
  // De inbyggda apparna – bara med standardmiljön: en egen miljö (t.ex. inköpslistans "Kopiera",
  // som bara har urklipp) ska aldrig öppna delningsbladet.
  if (isNative() && typeof navigator !== 'undefined' && env === navigator) {
    const files = await loadNative('files')
    const outcome = files ? await files.shareText(title, text) : 'failed'
    if (outcome !== 'failed') return outcome
    // Annars: försök med urklipp nedan.
  }
  const data: ShareData = { title, text }
  if (env && typeof env.share === 'function' && (typeof env.canShare !== 'function' || env.canShare(data))) {
    try {
      await env.share(data)
      return 'shared'
    } catch (err) {
      if (isAbort(err)) return 'cancelled'
      // Annars: försök med urklipp nedan.
    }
  }
  const write = env?.clipboard?.writeText
  if (typeof write === 'function') {
    try {
      await write.call(env?.clipboard, text)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
  return 'failed'
}
