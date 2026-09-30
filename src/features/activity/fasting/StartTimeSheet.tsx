/**
 * Ange eller ändra när fastan började – "Jag började igår 20:00".
 * Arket monteras om vid varje öppning (nyckel i föräldern) så att fälten börjar från rätt värde.
 */
import { useId, useState } from 'react'
import { Button, SegmentedControl, Sheet, TextField } from '../../../components/ui'
import type { ISODate } from '../../../types'
import {
  dayAndTime,
  formatFastDuration,
  guessStartDay,
  resolveStartTime,
  START_DAYS,
  startParts,
  validateStart,
  type StartDay,
} from '../fastingLogic'
import { useNow } from '../hooks'

export interface StartTimeSheetProps {
  open: boolean
  onClose: () => void
  /** 'edit' ändrar en pågående fasta, 'new' startar en ny med en tidigare starttid. */
  mode: 'edit' | 'new'
  /** Nuvarande starttid (vid ändring). */
  initialStart?: number
  /** Målet i timmar – för förhandsvisningen. */
  targetHours: number
  today: ISODate
  onSave: (startMs: number) => void
}

const DEFAULT_NEW_TIME = '20:00'

export function StartTimeSheet({ open, onClose, mode, initialStart, targetHours, today, onSave }: StartTimeSheetProps) {
  const now = useNow(30_000, open)
  const [initial] = useState(() =>
    initialStart !== undefined ? startParts(initialStart) : { day: guessStartDay(DEFAULT_NEW_TIME), time: DEFAULT_NEW_TIME },
  )
  const [day, setDay] = useState<StartDay>(initial.day)
  const [time, setTime] = useState(initial.time)
  const dayLabelId = useId()

  const startMs = resolveStartTime(time, day, new Date(now))
  const error = validateStart(startMs, now)

  const save = () => {
    if (error || startMs === null) return
    onSave(Math.min(startMs, Date.now()))
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Ändra starttid' : 'När började du?'}
      description={mode === 'edit' ? 'Justera om du glömde att starta i tid.' : 'Till exempel: igår 20:00, efter kvällsmaten.'}
      width="sm"
      footer={
        <Button fullWidth size="lg" onClick={save} disabled={error !== null}>
          {mode === 'edit' ? 'Spara starttid' : 'Starta med den tiden'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div>
          <p id={dayLabelId} className="mb-1.5 text-sm font-medium text-ink-2">
            Dag
          </p>
          <SegmentedControl
            aria-labelledby={dayLabelId}
            fullWidth
            value={day}
            onChange={setDay}
            options={START_DAYS.map((d) => ({ value: d.value, label: d.label }))}
          />
        </div>
        <TextField
          label="Klockslag"
          type="time"
          value={time}
          onValueChange={setTime}
          step={300}
          error={time && error ? error : undefined}
          hint={!time ? 'Ange ett klockslag, t.ex. 20:00.' : undefined}
        />
        {startMs !== null && error === null && (
          <div className="rounded-2xl bg-blabar-soft px-4 py-3 text-[0.875rem] leading-relaxed text-ink" aria-live="polite">
            <p>
              Du har fastat <strong className="font-semibold">{formatFastDuration(now - startMs)}</strong> sedan {dayAndTime(startMs, today)}.
            </p>
            <p className="mt-0.5 text-ink-2">
              Målet på {targetHours}{'\u00a0'}h nås {dayAndTime(startMs + targetHours * 3_600_000, today)}.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  )
}
