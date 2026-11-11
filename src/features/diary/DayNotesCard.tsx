/**
 * Anteckningar och mående för dagen: fritext som sparas automatiskt, samt humör, energi och
 * hunger på en skala 1–5 (samma skalor som kvällsreflektionen på Idag).
 *
 * Anteckningen sparas en stund efter att man slutat skriva (`useDeferredSave`), direkt när fältet
 * lämnas, när dagen byts, när sidan lämnas (omladdning, en annan adress) och när sidan eller appen
 * göms – inte vid varje tangenttryck, eftersom varje sparning skriver om hela dagboken.
 *
 * Rendera med `key={date}` så att texten nollställs när dagen byts.
 */
import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check } from 'lucide-react'
import { Card, TextField, cx } from '../../components/ui'
import { SAVE_DELAY_MS, useDeferredSave } from '../../hooks/useDeferredSave'
import { useDiaryStore } from '../../stores/diaryStore'
import type { DayMeta, ISODate } from '../../types'
import { DAY_SCALES, normalizeNote, type ScaleDef, type ScaleKey } from './diaryLogic'

const EMPTY_META: DayMeta = {}
/** Hur länge vi väntar efter sista tangenttrycket innan anteckningen sparas. */
export const NOTE_SAVE_DELAY_MS = SAVE_DELAY_MS

const readNote = (date: ISODate) => normalizeNote(useDiaryStore.getState().days[date]?.note)
const saveNote = (note: string | undefined, date: ISODate) => useDiaryStore.getState().setDayMeta(date, { note })

export function DayNotesCard({ date, planned = false }: { date: ISODate; /** Framtida dag: bara anteckning, inget mående. */ planned?: boolean }) {
  const meta = useDiaryStore((s) => s.days[date] ?? EMPTY_META)
  const setDayMeta = useDiaryStore((s) => s.setDayMeta)
  const [text, setText] = useState(meta.note ?? '')
  // Har anteckningen ändrats sedan kortet visades? Då visas "Sparat" när inget väntar längre.
  const [edited, setEdited] = useState(false)
  const saver = useDeferredSave<string | undefined>({ key: date, read: readNote, save: saveNote, delay: NOTE_SAVE_DELAY_MS })
  const status: 'idle' | 'saving' | 'saved' = saver.pending ? 'saving' : edited ? 'saved' : 'idle'

  const onTextChange = (value: string) => {
    setText(value)
    if (saver.schedule(normalizeNote(value))) setEdited(true)
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
        onValueChange={onTextChange}
        onBlur={saver.flush}
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
  // @container + @max-[15rem]: fem knappar bredvid varandra är för trångt för emojin vid stor text (200 %) – den krymper då.
  // rem i en containerfråga följer rotens teckenstorlek; vid normal text (≈ 20 rem) ändras inget.
  return (
    <div className="@container">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span id={labelId} className="min-w-0 break-words text-sm font-semibold text-ink">
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
                'grid h-12 place-items-center rounded-2xl text-[1.5rem] leading-none @max-[15rem]:text-[1.125rem] transition-[background-color,box-shadow,opacity,filter] duration-200',
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
