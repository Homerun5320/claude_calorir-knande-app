/**
 * Historik över avslutade fastor: längd, tider, protokoll och om målet nåddes.
 * Ta bort med "Ångra".
 */
import { memo, useState } from 'react'
import { Hourglass, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, ListGroup, ListRow, SectionTitle, toast } from '../../../components/ui'
import { formatPercent } from '../../../lib/format'
import { useFastingStore, type FastRecord } from '../../../stores/fastingStore'
import type { ISODate } from '../../../types'
import { clockTime, fastDurationMs, fastRatio, fastSucceeded, formatFastDuration, shortDayAndTime } from '../fastingLogic'
import { restoreFast } from '../hooks'

const INITIAL_COUNT = 7

export const FastHistory = memo(function FastHistory({ history, today }: { history: readonly FastRecord[]; today: ISODate }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? history : history.slice(0, INITIAL_COUNT)

  const remove = (rec: FastRecord) => {
    useFastingStore.getState().removeFast(rec.id)
    toast('Fastan är borttagen', { action: { label: 'Ångra', onClick: () => restoreFast(rec) } })
  }

  return (
    <section aria-labelledby="fasta-historik">
      <SectionTitle id="fasta-historik">Historik</SectionTitle>
      {history.length === 0 ? (
        <Card>
          <EmptyState
            compact
            illustration="forest"
            title="Ingen fasta ännu"
            text="Avslutade fastor sparas här, så att du kan se hur det känns över tid."
          />
        </Card>
      ) : (
        <>
          <ListGroup>
            {shown.map((rec) => {
              const ok = fastSucceeded(rec)
              const duration = formatFastDuration(fastDurationMs(rec))
              return (
                <ListRow
                  key={rec.id}
                  leading={Hourglass}
                  leadingTone={ok ? 'mossa' : 'blabar'}
                  title={duration}
                  subtitle={`${shortDayAndTime(rec.start, today)}–${clockTime(rec.end)}`}
                  value={ok ? <Badge tone="mossa">Mål nått</Badge> : <span className="text-[0.8125rem] font-medium text-ink-3">{formatPercent(fastRatio(rec) * 100)}</span>}
                  valueSub={ok ? rec.protocol : `av ${rec.protocol}`}
                  action={<IconButton icon={Trash2} size="sm" aria-label={`Ta bort fastan ${duration}`} onClick={() => remove(rec)} />}
                />
              )
            })}
          </ListGroup>
          {history.length > INITIAL_COUNT && (
            <Button variant="ghost" fullWidth className="mt-2" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'Visa färre' : `Visa alla (${history.length})`}
            </Button>
          )}
        </>
      )}
    </section>
  )
})
