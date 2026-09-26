/**
 * Sök i Open Food Facts – bara när användaren ber om det (knapp), aldrig vid varje tangenttryck.
 * Träffarna är användarbidrag och märks tydligt som sådana.
 */
import { useEffect, useRef, useState } from 'react'
import { Globe, RefreshCw, Users, WifiOff } from 'lucide-react'
import type { Food } from '../../types'
import { Button, SkeletonRow } from '../../components/ui'
import { searchOnlineFoods } from '../../lib/foodRepo'
import { OFF_ATTRIBUTION, OFF_MESSAGES, OpenFoodFactsError, isAbortError } from '../../lib/openFoodFacts'
import { AddRow, RowList } from './components'

type OnlineState =
  | { q: string; status: 'loading' }
  | { q: string; status: 'done'; foods: Food[] }
  | { q: string; status: 'error'; message: string; offline: boolean }

export interface OnlineSearchProps {
  query: string
  onPick: (food: Food) => void
  onQuickAdd: (food: Food) => void
  onDetails: (food: Food) => void
  basketCount: (foodId: string) => number
}

export function OnlineSearch({ query, onPick, onQuickAdd, onDetails, basketCount }: OnlineSearchProps) {
  const q = query.trim()
  const [state, setState] = useState<OnlineState | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  // Avbryt en pågående sökning när söktexten ändras eller sidan lämnas.
  useEffect(() => {
    return () => ctrl.current?.abort()
  }, [q])

  const current = state && state.q === q ? state : null

  const run = async () => {
    if (!q) return
    ctrl.current?.abort()
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState({ q, status: 'error', message: OFF_MESSAGES.offline, offline: true })
      return
    }
    const c = new AbortController()
    ctrl.current = c
    setState({ q, status: 'loading' })
    try {
      const foods = await searchOnlineFoods(q, { pageSize: 24, signal: c.signal })
      if (!c.signal.aborted) setState({ q, status: 'done', foods })
    } catch (err) {
      if (isAbortError(err) || c.signal.aborted) return
      const offline = err instanceof OpenFoodFactsError && err.code === 'offline'
      setState({ q, status: 'error', message: err instanceof Error ? err.message : OFF_MESSAGES.network, offline })
    }
  }

  if (!q) return null

  if (!current) {
    return (
      <div className="card flex flex-col items-start gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-hjortron-soft text-hjortron">
            <Globe className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-[0.95rem] font-semibold text-ink">Letar du efter en märkesvara?</p>
            <p className="mt-0.5 text-sm text-ink-2">Sök bland produkter i Open Food Facts. Värdena är användarbidrag – jämför gärna med förpackningen.</p>
          </div>
        </div>
        <Button variant="soft" iconLeft={Globe} onClick={run} fullWidth>
          Sök i Open Food Facts (online)
        </Button>
      </div>
    )
  }

  return (
    <section aria-labelledby="off-heading" aria-busy={current.status === 'loading'}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 id="off-heading" className="eyebrow">
          Från Open Food Facts
        </h2>
        <span className="inline-flex items-center gap-1 text-xs text-ink-3">
          <Users className="size-3.5" aria-hidden />
          Användarbidrag
        </span>
      </div>

      {current.status === 'loading' && (
        <RowList>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="py-2">
              <SkeletonRow />
            </li>
          ))}
        </RowList>
      )}

      {current.status === 'error' && (
        <div role="alert" className="card flex flex-col items-center gap-3 p-5 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-ink-2">
            {current.offline ? <WifiOff className="size-6" aria-hidden /> : <Globe className="size-6" aria-hidden />}
          </span>
          <p className="max-w-xs text-sm text-ink-2">
            {current.offline ? 'Du verkar vara offline. Lagoms egen databas fungerar ändå – sök online när du har uppkoppling igen.' : current.message}
          </p>
          <Button variant="outline" size="sm" iconLeft={RefreshCw} onClick={run}>
            Försök igen
          </Button>
        </div>
      )}

      {current.status === 'done' &&
        (current.foods.length === 0 ? (
          <div className="card p-5 text-center text-sm text-ink-2">Inga produkter med näringsvärden hittades för "{q}" i Open Food Facts.</div>
        ) : (
          <>
            <RowList>
              {current.foods.map((food) => (
                <li key={food.id}>
                  <AddRow food={food} onPick={onPick} onQuickAdd={onQuickAdd} onDetails={onDetails} inBasket={basketCount(food.id)} />
                </li>
              ))}
            </RowList>
            <p className="mt-2 px-1 text-xs text-ink-3">{OFF_ATTRIBUTION}. Kontrollera värdena mot förpackningen innan du litar på dem.</p>
          </>
        ))}
    </section>
  )
}
