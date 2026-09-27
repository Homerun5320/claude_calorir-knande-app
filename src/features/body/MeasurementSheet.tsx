/**
 * Ark för att registrera kroppsmått: midja, höft, bröst, överarm, lår och fettprocent.
 * Allt är valfritt men minst ett mått krävs. Finns redan mått för datumet fylls de i,
 * så att inget skrivs över av misstag (butiken sparar ett mättillfälle per dag).
 */
import { useRef, useState } from 'react'
import { Check, Ruler } from 'lucide-react'
import { Button, NumberField, Sheet, TextField, toast } from '../../components/ui'
import { formatDayLong } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { useBodyStore } from '../../stores/bodyStore'
import type { ISODate, MeasurementEntry } from '../../types'
import { hasAnyMeasure, latestMeasure, MEASURE_KEYS, MEASURE_META, type MeasureKey } from './bodyLogic'
import { requireAccess } from '../premium/requireAccess'

type Values = Partial<Record<MeasureKey, number | undefined>>

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

function valuesOf(m: MeasurementEntry | undefined): Values {
  const out: Values = {}
  if (!m) return out
  for (const k of MEASURE_KEYS) if (m[k] !== undefined) out[k] = m[k]
  return out
}

function invalidKey(values: Values): MeasureKey | undefined {
  return MEASURE_KEYS.find((k) => {
    const v = values[k]
    return v !== undefined && (v < MEASURE_META[k].min || v > MEASURE_META[k].max)
  })
}

interface MeasurementSheetProps {
  open: boolean
  onClose: () => void
  today: ISODate
}

/** Rendera med en ny `key` varje gång arket öppnas så att formuläret börjar om. */
export function MeasurementSheet({ open, onClose, today }: MeasurementSheetProps) {
  const measurements = useBodyStore((s) => s.measurements)
  const firstField = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState<ISODate>(today)
  const [values, setValues] = useState<Values>(() => valuesOf(measurements.find((m) => m.date === today)))
  const [note, setNote] = useState(() => measurements.find((m) => m.date === today)?.note ?? '')

  const existing = measurements.find((m) => m.date === date)
  const dateValid = ISO_RE.test(date) && date <= today
  const bad = invalidKey(values)
  const valid = dateValid && hasAnyMeasure(values) && bad === undefined

  const changeDate = (next: string) => {
    setDate(next)
    // Hämta in befintliga mått för den dagen så att de inte försvinner vid sparning.
    const match = measurements.find((m) => m.date === next)
    if (match) {
      setValues(valuesOf(match))
      setNote(match.note ?? '')
    }
  }

  const save = () => {
    if (!valid) return
    if (!requireAccess('matt')) {
      onClose()
      return
    }
    const store = useBodyStore.getState()
    const previous = store.measurements.find((m) => m.date === date)
    const clean: Values = {}
    for (const k of MEASURE_KEYS) {
      const v = values[k]
      if (v !== undefined && Number.isFinite(v)) clean[k] = Math.round(v * 10) / 10
    }
    const entry = store.addMeasurement({ date, ...clean, note: note.trim() || undefined })
    onClose()
    toast(previous ? 'Måtten är uppdaterade' : 'Måtten är sparade', {
      tone: 'success',
      action: {
        label: 'Ångra',
        onClick: () => {
          const s = useBodyStore.getState()
          if (previous) {
            const { id: _id, createdAt: _createdAt, ...rest } = previous
            s.addMeasurement(rest)
          } else s.removeMeasurement(entry.id)
        },
      },
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nya mått"
      description="Mät på samma sätt varje gång, gärna på morgonen. Fyll i det du vill – allt är valfritt."
      initialFocusRef={firstField}
      footer={
        <Button fullWidth size="lg" iconLeft={Check} onClick={save} disabled={!valid}>
          {existing ? 'Uppdatera måtten' : 'Spara mått'}
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        noValidate
        className="flex flex-col gap-4"
      >
        <TextField
          type="date"
          label="Datum"
          value={date}
          max={today}
          required
          onValueChange={changeDate}
          error={!dateValid ? 'Välj ett datum som inte ligger i framtiden' : undefined}
          hint={existing ? `Du har redan mått för ${formatDayLong(date, today).toLowerCase()} – de uppdateras.` : undefined}
        />
        <div className="grid grid-cols-2 gap-3">
          {MEASURE_KEYS.map((k, i) => {
            const meta = MEASURE_META[k]
            const v = values[k]
            const prev = latestMeasure(measurements, k)
            const out = v !== undefined && (v < meta.min || v > meta.max)
            return (
              <NumberField
                key={k}
                ref={i === 0 ? firstField : undefined}
                label={meta.label}
                optional
                value={v}
                onChange={(next) => setValues((cur) => ({ ...cur, [k]: next }))}
                suffix={meta.unit}
                step={k === 'bodyFatPct' ? 0.1 : 0.5}
                decimals={1}
                min={0}
                placeholder={prev ? formatNumber(prev.value, 1) : undefined}
                error={out ? `${formatNumber(meta.min)}–${formatNumber(meta.max)} ${meta.unit}` : undefined}
              />
            )
          })}
        </div>
        <TextField label="Anteckning" optional value={note} onValueChange={setNote} placeholder="T.ex. efter träningspasset" maxLength={140} />
        <details className="group rounded-2xl bg-surface-2 px-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <Ruler aria-hidden className="size-4 text-gran" strokeWidth={2.2} />
            Så mäter du
          </summary>
          <ul className="flex flex-col gap-1.5 pb-3 text-[0.8125rem] leading-relaxed text-ink-2">
            {MEASURE_KEYS.map((k) => (
              <li key={k}>
                <span className="font-semibold text-ink">{MEASURE_META[k].label}:</span> {MEASURE_META[k].hint}
              </li>
            ))}
            <li>Använd ett mjukt måttband som ligger an utan att klämma.</li>
          </ul>
        </details>
      </form>
    </Sheet>
  )
}
