/**
 * Historik över avslutade fastor: längd, tider och protokoll – bara fakta. Inga märken för nådda
 * mål och inga procent av målet: det blir lätt en poängtavla. Ta bort med "Ångra".
 */
import { memo, useState } from 'react'
import { Hourglass, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, IconButton, ListGroup, ListRow, SectionTitle, toast } from '../../../components/ui'
import { useFastingStore, type FastRecord } from '../../../stores/fastingStore'
import type { ISODate } from '../../../types'
import { clockTime, fastDurationMs, formatFastDuration, shortDayAndTime } from '../fastingLogic'
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
              const duration = formatFastDuration(fastDurationMs(rec))
              return (
                <ListRow
                  key={rec.id}
                  leading={Hourglass}
                  leadingTone="blabar"
                  title={duration}
                  subtitle={`${shortDayAndTime(rec.start, today)}–${clockTime(rec.end)}`}
                  value={<span className="text-[0.8125rem] font-medium text-ink-3">{rec.protocol}</span>}
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
