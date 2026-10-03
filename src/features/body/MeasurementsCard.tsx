/**
 * Kroppsmått: senaste värdet per mått med förändring och en liten kurva, samt en
 * historiktabell över alla mättillfällen (med borttagning och Ångra).
 */
import { useMemo, useState } from 'react'
import { ChevronDown, Plus, Ruler, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, IconButton, confirmDialog, cx, toast } from '../../components/ui'
import { Sparkline } from '../../components/charts'
import { formatDayLong, formatDayShort } from '../../lib/dates'
import { formatNumber } from '../../lib/format'
import { useBodyStore } from '../../stores/bodyStore'
import type { ISODate, MeasurementEntry } from '../../types'
import {
  formatMeasure,
  formatSigned,
  latestMeasure,
  measurementRows,
  measureSeries,
  MEASURE_META,
  usedMeasureKeys,
  type MeasureKey,
} from './bodyLogic'

const TABLE_PREVIEW = 4

interface MeasurementsCardProps {
  today: ISODate
  onAdd: () => void
}

export function MeasurementsCard({ today, onAdd }: MeasurementsCardProps) {
  const measurements = useBodyStore((s) => s.measurements)
  const keys = useMemo(() => usedMeasureKeys(measurements), [measurements])
  const rows = useMemo(() => measurementRows(measurements), [measurements])
  const [showAll, setShowAll] = useState(false)

  const remove = async (entry: MeasurementEntry) => {
    const ok = await confirmDialog({
      title: 'Ta bort mätningen?',
      message: `Alla mått från ${formatDayLong(entry.date, today).toLowerCase()} tas bort.`,
      tone: 'danger',
      confirmLabel: 'Ta bort',
      icon: Trash2,
    })
    if (!ok) return
    useBodyStore.getState().removeMeasurement(entry.id)
    toast('Mätningen är borttagen', {
      action: {
        label: 'Ångra',
        onClick: () => {
          const { id: _id, createdAt: _createdAt, ...rest } = entry
          useBodyStore.getState().addMeasurement(rest)
        },
      },
    })
  }

  const addButton = (
    <Button variant="soft" size="sm" iconLeft={Plus} onClick={onAdd}>
      Lägg till
    </Button>
  )

  if (keys.length === 0) {
    return (
      <Card title="Kroppsmått" action={addButton}>
        <EmptyState
          compact
          illustration={
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-gran-soft text-gran">
              <Ruler className="size-7" strokeWidth={2} aria-hidden />
            </span>
          }
          title="Inga mått ännu"
          text="Midjemåttet kan säga mer än vågen – särskilt om du tränar styrka. Mät gärna en gång i månaden."
          action={
            <Button variant="primary" iconLeft={Ruler} onClick={onAdd}>
              Mät nu
            </Button>
          }
        />
      </Card>
    )
  }

  const visibleRows = showAll ? rows : rows.slice(0, TABLE_PREVIEW)

  return (
    <Card title="Kroppsmått" action={addButton}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {keys.map((k) => (
          <MeasureTile key={k} measureKey={k} list={measurements} />
        ))}
      </ul>

      <h3 className="eyebrow mb-2 mt-5 px-1">Alla mätningar</h3>
      {/* En riktig kant (inte inset-ring) – den klistrade datumkolumnen målar annars över ramen. `relative` gör att
          de dolda texterna för skärmläsare (sr-only, absolut placerade) klipps av rullningsytan i stället för att skjuta ut sidan. */}
      <div className="relative overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-max border-collapse text-left text-sm tabular-nums">
          <caption className="sr-only">Kroppsmått per mättillfälle, nyaste först, med förändring mot föregående mätning</caption>
          <thead>
            <tr className="text-xs text-ink-3">
              <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2.5 font-semibold">
                Datum
              </th>
              {keys.map((k) => (
                <th key={k} scope="col" className="px-3 py-2.5 text-right font-semibold">
                  {MEASURE_META[k].label}
                </th>
              ))}
              <th scope="col" className="px-2 py-2.5">
                <span className="sr-only">Åtgärder</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ entry, changes }) => (
              <tr key={entry.id} className="border-t border-line/70">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-ink">
                  <span className="block whitespace-nowrap">{formatDayShort(entry.date)}</span>
                  {entry.note && <span className="block max-w-[8rem] truncate text-xs font-normal text-ink-3">{entry.note}</span>}
                </th>
                {keys.map((k) => {
                  const v = entry[k]
                  const c = changes[k]
                  return (
                    <td key={k} className="px-3 py-2 text-right align-top">
                      <span className="block whitespace-nowrap text-ink">{v !== undefined ? formatMeasure(k, v) : '–'}</span>
                      {c !== undefined && (
                        <span className="block whitespace-nowrap text-xs text-ink-3">
                          {formatSigned(c)}
                          <span className="sr-only"> {MEASURE_META[k].unit} sedan förra</span>
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className="px-1 py-1 text-right align-middle">
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    aria-label={`Ta bort mätningen ${formatDayShort(entry.date)}`}
                    onClick={() => void remove(entry)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > TABLE_PREVIEW && (
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          className="mt-2"
          iconRight={<ChevronDown aria-hidden className={cx('size-4 transition-transform', showAll && 'rotate-180')} />}
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
        >
          {showAll ? 'Visa färre' : `Visa alla ${rows.length} mätningar`}
        </Button>
      )}
    </Card>
  )
}

function MeasureTile({ measureKey, list }: { measureKey: MeasureKey; list: readonly MeasurementEntry[] }) {
  const meta = MEASURE_META[measureKey]
  const latest = latestMeasure(list, measureKey)
  const values = useMemo(() => measureSeries(list, measureKey).map((p) => p.value), [list, measureKey])
  if (!latest) return null
  return (
    <li className="flex min-w-0 flex-col rounded-2xl bg-surface-2 p-3">
      <span className="eyebrow truncate">{meta.label}</span>
      <span className="mt-1 flex items-baseline gap-1">
        <span className="display-num text-[1.625rem] font-medium leading-none text-ink">{formatNumber(latest.value, 1)}</span>
        <span className="text-xs font-medium text-ink-3">{meta.unit}</span>
      </span>
      <span className="mt-1 min-h-4 text-xs tabular-nums text-ink-3">
        {latest.change !== undefined ? `${formatSigned(latest.change)} ${meta.unit} sedan förra` : `Mätt ${formatDayShort(latest.date)}`}
      </span>
      {values.length >= 2 && (
        <Sparkline
          values={values}
          width={120}
          height={28}
          color="var(--lg-blabar)"
          className="mt-2 max-w-full"
          ariaLabel={`${meta.label} över ${values.length} mätningar, från ${formatMeasure(measureKey, values[0])} till ${formatMeasure(
            measureKey,
            values[values.length - 1],
          )}`}
        />
      )}
    </li>
  )
}
