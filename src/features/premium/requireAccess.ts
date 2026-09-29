/**
 * Spärr för NY loggning efter provperioden – och i exempelläget.
 *
 * Anropa `requireAccess()` precis innan något nytt skapas (mat, snabbregistrering, kopierad
 * måltid/dag, vatten, dryck, träning, vikt, mått, fasta, nytt livsmedel/recept, framstegsbild). Är provperioden
 * slut och ingen licens finns returneras false och ett lugnt ark förklarar varför – med vägar
 * till priserna och till exporten. Att titta på, ändra, exportera och radera sin data spärras
 * aldrig.
 *
 * Med exempeldata returneras också false: exemplet är skrivskyddat, och arket förklarar i stället
 * att man skapar sin egen profil för att börja logga (provperioden startar då).
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
  | 'dryck'
  | 'traning'
  | 'vikt'
  | 'matt'
  | 'fasta'
  | 'livsmedel'
  | 'skanna'
  | 'planera'
  | 'bild'

export const BLOCKED_ACTION_TEXT: Record<BlockedAction, string> = {
  mat: 'logga mat',
  snabb: 'snabbregistrera',
  recept: 'spara nya recept',
  kopiera: 'kopiera måltider',
  vatten: 'fylla på vatten',
  dryck: 'logga dryck',
  traning: 'logga träning',
  vikt: 'logga vikt',
  matt: 'logga mått',
  fasta: 'starta en fasta',
  livsmedel: 'skapa egna livsmedel',
  skanna: 'skanna streckkoder',
  planera: 'planera måltider',
  bild: 'spara framstegsbilder',
}

interface AccessGateState {
  /**
   * Arket visas (med vad man försökte göra). `demo: true` = exempeldata visas; arket förklarar då
   * hur man börjar med sin egen profil i stället för att visa priserna.
   */
  blocked: { action?: BlockedAction; demo?: true } | null
  close: () => void
}

export const useAccessGateStore = create<AccessGateState>()((set) => ({
  blocked: null,
  close: () => set({ blocked: null }),
}))

/** true om ny loggning är tillåten just nu (provperiod eller licens, och inte exempeldata). */
export function hasLoggingAccess(): boolean {
  return currentAccess().canLog
}

/**
 * Kontrollera tillgång före ny loggning. Returnerar true om det går bra; annars visas arket
 * "Provperioden är slut" (eller "Det här är exempeldata") och false returneras.
 */
export function requireAccess(action?: BlockedAction): boolean {
  const access = currentAccess()
  if (access.canLog) return true
  useAccessGateStore.setState({ blocked: access.demo ? { action, demo: true } : { action } })
  return false
}
