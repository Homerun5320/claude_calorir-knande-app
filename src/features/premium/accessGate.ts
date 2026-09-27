/**
 * Spärr för NY loggning efter provperioden.
 *
 * Anropa `requireAccess()` precis innan något nytt skapas (mat, snabbregistrering, kopierad
 * måltid/dag, vatten, träning, vikt, mått, fasta, nytt livsmedel/recept). Är provperioden slut
 * och ingen licens finns returneras false och ett lugnt ark förklarar varför – med vägar till
 * priserna och till exporten. Att titta på, ändra, exportera och radera sin data spärras aldrig.
 *
 * ```ts
 * if (!requireAccess('vatten')) return
 * addWater(date, ml)
 * ```
 */
import { create } from 'zustand'
import { currentAccess } from '../../hooks/useAccess'

/** Vad användaren försökte göra – ger arket en träffande mening. */
export type BlockedAction =
  | 'mat'
  | 'snabb'
  | 'recept'
  | 'kopiera'
  | 'vatten'
  | 'traning'
  | 'vikt'
  | 'matt'
  | 'fasta'
  | 'livsmedel'
  | 'skanna'

export const BLOCKED_ACTION_TEXT: Record<BlockedAction, string> = {
  mat: 'logga mat',
  snabb: 'snabbregistrera',
  recept: 'spara nya recept',
  kopiera: 'kopiera måltider',
  vatten: 'fylla på vatten',
  traning: 'logga träning',
  vikt: 'logga vikt',
  matt: 'logga mått',
  fasta: 'starta en fasta',
  livsmedel: 'skapa egna livsmedel',
  skanna: 'skanna streckkoder',
}

interface AccessGateState {
  /** Arket "Provperioden är slut" visas (med vad man försökte göra). */
  blocked: { action?: BlockedAction } | null
  close: () => void
}

export const useAccessGateStore = create<AccessGateState>()((set) => ({
  blocked: null,
  close: () => set({ blocked: null }),
}))

/** true om ny loggning är tillåten just nu (provperiod eller licens). */
export function hasLoggingAccess(): boolean {
  return currentAccess().canLog
}

/**
 * Kontrollera tillgång före ny loggning. Returnerar true om det går bra; annars visas arket
 * "Provperioden är slut" och false returneras.
 */
export function requireAccess(action?: BlockedAction): boolean {
  if (hasLoggingAccess()) return true
  useAccessGateStore.setState({ blocked: { action } })
  return false
}
