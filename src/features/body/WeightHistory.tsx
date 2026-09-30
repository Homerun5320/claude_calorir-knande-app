/**
 * Alla vägningar grupperade per månad (nyaste först) med snitt per månad, skillnad mot
 * föregående vägning och borttagning med bekräftelse + Ångra.
 */
import { useMemo, useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Button, IconButton, ListGroup, ListRow, SectionTitle, confirmDialog, toast } from '../../components/ui'
import { formatDayLong, relativeDayLabel } from '../../lib/dates'
import { formatKg, plural } from '../../lib/format'
import { useBodyStore } from '../../stores/bodyStore'
import type { ISODate, WeightEntry } from '../../types'
import { formatSignedKg, groupWeightsByMonth, weighInDiffs } from './bodyLogic'

const MONTHS_STEP = 3

export function WeightHistory({ weights, today }: { weights: readonly WeightEntry[]; today: ISODate }) {
  const groups = useMemo(() => groupWeightsByMonth(weights, today), [weights, today])
  const diffs = useMemo(() => weighInDiffs(weights), [weights])
  const [visible, setVisible] = useState(MONTHS_STEP)

  if (groups.length === 0) return null

  const remove = async (entry: WeightEntry) => {
    const ok = await confirmDialog({
      title: 'Ta bort vägningen?',
      message: `${formatKg(entry.kg)} från ${formatDayLong(entry.date, today).toLowerCase()} tas bort från historiken.`,
      tone: 'danger',
      confirmLabel: 'Ta bort',
      icon: Trash2,
    })
    if (!ok) return
    useBodyStore.getState().removeWeight(entry.id)
    toast('Vägningen är borttagen', {
      action: {
        label: 'Ångra',
        onClick: () => useBodyStore.getState().logWeight(entry.date, entry.kg, entry.note),
      },
    })
  }

  const shown = groups.slice(0, visible)
  const hiddenCount = groups.length - shown.length

  return (
    <section aria-labelledby="weight-history-title">
      <SectionTitle id="weight-history-title" variant="display" description={plural(weights.length, 'vägning', 'vägningar') + ' totalt'}>
        Historik
      </SectionTitle>
      <div className="flex flex-col gap-5">
        {shown.map((g) => (
          <div key={g.key}>
            <h3 className="mb-2 flex items-baseline justify-between gap-3 px-4">
              <span className="eyebrow">{g.label}</span>
              <span className="text-xs tabular-nums text-ink-3">
                snitt {formatKg(g.averageKg)}
                {g.changeKg !== undefined && ` · ${formatSignedKg(g.changeKg)}`}
              </span>
            </h3>
            <ListGroup>
              {g.entries.map((w) => {
                const diff = diffs.get(w.id)
                const day = relativeDayLabel(w.date, today)
                return (
                  <ListRow
                    key={w.id}
                    dense
                    title={day}
                    subtitle={w.note}
                    value={formatKg(w.kg)}
                    valueSub={diff !== undefined ? formatSignedKg(diff) : 'Första'}
                    action={
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        aria-label={`Ta bort vägningen ${day.toLowerCase()}, ${formatKg(w.kg)}`}
                        onClick={() => void remove(w)}
                      />
                    }
                  />
                )
              })}
            </ListGroup>
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <Button variant="ghost" fullWidth className="mt-3" iconRight={ChevronDown} onClick={() => setVisible((v) => v + MONTHS_STEP)}>
          Visa äldre ({plural(hiddenCount, 'månad', 'månader')} till)
        </Button>
      )}
    </section>
  )
}
