/**
 * Anteckningar och mående för dagen: fritext som sparas automatiskt, samt humör, energi och
 * hunger på en skala 1–5 (samma skalor som kvällsreflektionen på Idag).
 *
 * Rendera med `key={date}` så att texten nollställs när dagen byts.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check } from 'lucide-react'
import { Card, TextField, cx } from '../../components/ui'
import { useDiaryStore } from '../../stores/diaryStore'
import type { DayMeta, ISODate } from '../../types'
import { DAY_SCALES, normalizeNote, type ScaleDef, type ScaleKey } from './diaryLogic'

const EMPTY_META: DayMeta = {}
/** Hur länge vi väntar efter sista tangenttrycket innan anteckningen sparas. */
export const NOTE_SAVE_DELAY_MS = 600

export function DayNotesCard({ date, planned = false }: { date: ISODate; /** Framtida dag: bara anteckning, inget mående. */ planned?: boolean }) {
  const meta = useDiaryStore((s) => s.days[date] ?? EMPTY_META)
  const setDayMeta = useDiaryStore((s) => s.setDayMeta)
  const [text, setText] = useState(meta.note ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const pending = useRef<string | null>(null)

  // Spara en stund efter att man slutat skriva.
  useEffect(() => {
    const stored = useDiaryStore.getState().days[date]?.note ?? ''
    if (normalizeNote(text) === normalizeNote(stored)) {
      pending.current = null
      return
    }
    pending.current = text
    setStatus('saving')
    const t = window.setTimeout(() => {
      useDiaryStore.getState().setDayMeta(date, { note: normalizeNote(text) })
      pending.current = null
      setStatus('saved')
    }, NOTE_SAVE_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [text, date])

  // Spara direkt om man lämnar dagen innan fördröjningen gått ut.
  useEffect(
    () => () => {
      if (pending.current !== null) useDiaryStore.getState().setDayMeta(date, { note: normalizeNote(pending.current) })
    },
    [date],
  )

  const flush = () => {
    if (pending.current === null) return
    setDayMeta(date, { note: normalizeNote(pending.current) })
    pending.current = null
    setStatus('saved')
  }

  return (
    <Card title={planned ? 'Anteckningar' : 'Anteckningar och mående'} titleAs="h2">
      {!planned && (
        <>
          <p className="-mt-1 mb-4 text-sm leading-relaxed text-ink-2">Inga rätt eller fel – bara en liten stund för dig.</p>
          <div className="mb-5 space-y-4">
            {DAY_SCALES.map((def) => (
              <EmojiScale
                key={def.key}
                def={def}
                value={meta[def.key]}
                onChange={(v) => setDayMeta(date, { [def.key]: v } as Partial<Record<ScaleKey, number | undefined>>)}
              />
            ))}
          </div>
        </>
      )}
      <TextField
        multiline
        minRows={3}
        label="Anteckning"
        labelAction={
          <span className="text-xs text-ink-3" aria-live="polite">
            {status === 'saving' ? 'Sparar …' : status === 'saved' ? (
              <span className="inline-flex items-center gap-1 text-good">
                <Check className="size-3.5" aria-hidden strokeWidth={2.6} />
                Sparat
              </span>
            ) : null}
          </span>
        }
        value={text}
        onValueChange={setText}
        onBlur={flush}
        placeholder={planned ? 'Något att tänka på inför dagen?' : 'Hur kändes dagen? Något du vill minnas?'}
        maxLength={2000}
      />
    </Card>
  )
}

function EmojiScale({ def, value, onChange }: { def: ScaleDef; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const labelId = useId()
  const reduce = useReducedMotion() ?? false
  const chosen = value !== undefined ? def.options[value - 1] : undefined
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span id={labelId} className="text-sm font-semibold text-ink">
          {def.label}
        </span>
        <span className="text-xs text-ink-3" aria-hidden="true">
          {chosen?.word ?? ''}
        </span>
      </div>
      <div role="group" aria-labelledby={labelId} className="grid grid-cols-5 gap-1.5">
        {def.options.map((o, i) => {
          const v = i + 1
          const selected = value === v
          return (
            <motion.button
              key={v}
              type="button"
              aria-pressed={selected}
              aria-label={`${def.label}: ${o.word}`}
              onClick={() => onChange(selected ? undefined : v)}
              whileTap={reduce ? undefined : { scale: 0.9 }}
              className={cx(
                'grid h-12 place-items-center rounded-2xl text-[1.5rem] leading-none transition-[background-color,box-shadow,opacity,filter] duration-200',
                selected
                  ? 'bg-gran-soft ring-2 ring-inset ring-gran'
                  : value !== undefined
                    ? 'bg-surface-2 opacity-60 grayscale-[35%] hover:opacity-100'
                    : 'bg-surface-2 hover:bg-surface-3',
              )}
            >
              <span aria-hidden="true">{o.emoji}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
