/**
 * Import av Livsmedelsverkets livsmedelsdatabas direkt i appen, med förlopp och avbryt.
 * Livsmedlen sparas bland sparade onlinelivsmedel (`cachedFoods`) i omgångar så att inget går
 * förlorat om man avbryter halvvägs, och blir sökbara direkt.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { LivsmedelsverketError, importAll, type LmvImportProgress } from '../../lib/livsmedelsverket'
import { useFoodStore } from '../../stores/foodStore'
import type { Food } from '../../types'
import { mergeImportedFoods } from './settingsLogic'

export type LmvImportStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error'

export interface LmvImportState {
  status: LmvImportStatus
  progress: LmvImportProgress | null
  /** Antal livsmedel som sparats under den här körningen. */
  saved: number
  error?: string
  /** true om felet troligen beror på att tjänsten inte tillåter anrop från webbläsare (CORS). */
  likelyBlocked?: boolean
}

const FLUSH_EVERY = 150

function flush(batch: Food[]) {
  if (batch.length === 0) return
  const foods = batch.splice(0, batch.length)
  useFoodStore.setState((s) => ({ cachedFoods: mergeImportedFoods(s.cachedFoods, foods) }))
}

export function useLmvImport() {
  const [state, setState] = useState<LmvImportState>({ status: 'idle', progress: null, saved: 0 })
  const ctrlRef = useRef<AbortController | null>(null)

  // Avbryt om sidan lämnas mitt i en import.
  useEffect(() => () => ctrlRef.current?.abort(), [])

  const start = useCallback(async () => {
    if (ctrlRef.current) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const batch: Food[] = []
    let saved = 0
    setState({ status: 'running', progress: { phase: 'lista', done: 0, total: 0, failed: 0 }, saved: 0 })
    try {
      for await (const food of importAll({
        signal: ctrl.signal,
        onProgress: (progress) => setState((s) => ({ ...s, progress })),
      })) {
        batch.push(food)
        saved++
        if (batch.length >= FLUSH_EVERY) {
          flush(batch)
          setState((s) => ({ ...s, saved }))
        }
      }
      flush(batch)
      setState((s) => ({ ...s, status: 'done', saved }))
    } catch (err) {
      flush(batch)
      if (ctrl.signal.aborted) {
        setState((s) => ({ ...s, status: 'cancelled', saved }))
      } else {
        const code = err instanceof LivsmedelsverketError ? err.code : 'network'
        setState((s) => ({
          ...s,
          status: 'error',
          saved,
          error: err instanceof LivsmedelsverketError ? err.message : 'Importen avbröts av ett oväntat fel.',
          // "network" utan svar alls är typiskt för CORS-blockering i webbläsaren.
          likelyBlocked: code === 'network' && saved === 0,
        }))
      }
    } finally {
      ctrlRef.current = null
    }
  }, [])

  const cancel = useCallback(() => ctrlRef.current?.abort(), [])

  const reset = useCallback(() => setState({ status: 'idle', progress: null, saved: 0 }), [])

  return { ...state, start, cancel, reset }
}
