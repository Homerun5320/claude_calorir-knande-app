/**
 * Kvällsreflektion – humör, energi och hunger på en skala 1–5 (emoji), och möjligheten att
 * markera dagen som klar (används av den adaptiva energiberäkningen). Visas efter klockan 18,
 * i medvetet läge eller när dagen redan har reflekterats.
 */
import { memo, useId, useState } from 'react'
import { CircleCheck, RotateCcw } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Confetti } from '../../components/signature'
import { Button, Card, toast } from '../../components/ui'
import { useDiaryStore } from '../../stores/diaryStore'
import type { DayMeta, ISODate } from '../../types'
import { useClock } from './hooks'
import { showEveningCheckIn } from './todayLogic'

const EMPTY_META: DayMeta = {}

type ScaleKey = 'mood' | 'energy' | 'hunger'

interface ScaleDef {
  key: ScaleKey
  label: string
  options: ReadonlyArray<{ emoji: string; word: string }>
}

const SCALES: readonly ScaleDef[] = [
  {
    key: 'mood',
    label: 'Humör',
    options: [
      { emoji: '😞', word: 'Tungt' },
      { emoji: '😕', word: 'Sådär' },
      { emoji: '😐', word: 'Okej' },
      { emoji: '🙂', word: 'Bra' },
      { emoji: '😄', word: 'Toppen' },
    ],
  },
  {
    key: 'energy',
    label: 'Energi',
    options: [
      { emoji: '🪫', word: 'Helt slut' },
      { emoji: '😴', word: 'Trött' },
      { emoji: '😐', word: 'Okej' },
      { emoji: '🙂', word: 'Pigg' },
      { emoji: '⚡', word: 'Full av energi' },
    ],
  },
  {
    key: 'hunger',
    label: 'Hunger',
    options: [
      { emoji: '😌', word: 'Knappt hungrig' },
      { emoji: '🙂', word: 'Lite hungrig' },
      { emoji: '😊', word: 'Lagom' },
      { emoji: '😋', word: 'Ganska hungrig' },
      { emoji: '🍽️', word: 'Mycket hungrig' },
    ],
  },
]

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
              className={`grid h-12 place-items-center rounded-2xl text-[1.5rem] leading-none transition-[background-color,box-shadow,opacity,filter] duration-200 ${
                selected
                  ? 'bg-gran-soft ring-2 ring-gran ring-inset'
                  : value !== undefined
                    ? 'bg-surface-2 opacity-60 grayscale-[35%] hover:opacity-100'
                    : 'bg-surface-2 hover:bg-surface-3'
              }`}
            >
              <span aria-hidden="true">{o.emoji}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

export const EveningCheckIn = memo(function EveningCheckIn({ today, mindful }: { today: ISODate; mindful: boolean }) {
  const now = useClock(60_000)
  const meta = useDiaryStore((s) => s.days[today] ?? EMPTY_META)
  const setDayMeta = useDiaryStore((s) => s.setDayMeta)
  const [burst, setBurst] = useState(0)

  if (!showEveningCheckIn(now, mindful, meta)) return null

  const complete = meta.complete === true
  const setValue = (key: ScaleKey, v: number | undefined) => setDayMeta(today, { [key]: v })

  const markComplete = () => {
    setDayMeta(today, { complete: true })
    setBurst((n) => n + 1)
    toast('Dagen är klar – tack för att du tog en stund för dig själv', {
      tone: 'success',
      action: { label: 'Ångra', onClick: () => useDiaryStore.getState().setDayMeta(today, { complete: false }) },
    })
  }

  return (
    <Card title="Hur har dagen varit?" eyebrow="Kvällsreflektion">
      <p className="-mt-1 mb-4 text-sm leading-relaxed text-ink-2">Inga rätt eller fel – bara en liten stund för dig.</p>
      <div className="space-y-4">
        {SCALES.map((def) => (
          <EmojiScale key={def.key} def={def} value={meta[def.key]} onChange={(v) => setValue(def.key, v)} />
        ))}
      </div>

      <div className="relative mt-5">
        {complete ? (
          <div className="flex items-center gap-3 rounded-2xl bg-mossa-soft px-4 py-3">
            <CircleCheck className="size-5 shrink-0 text-good" strokeWidth={2.4} aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm font-semibold text-ink">Dagen är markerad som klar</p>
            <Button variant="ghost" size="sm" iconLeft={RotateCcw} onClick={() => setDayMeta(today, { complete: false })}>
              Öppna igen
            </Button>
          </div>
        ) : (
          <>
            <Button variant="soft" fullWidth iconLeft={CircleCheck} onClick={markComplete}>
              Markera dagen som klar
            </Button>
            <p className="mt-2 text-center text-xs leading-relaxed text-ink-3">
              Klara dagar hjälper Lagom att räkna ut din förbrukning mer exakt.
            </p>
          </>
        )}
        <Confetti fire={burst} count={36} origin={{ x: 0.5, y: 0.6 }} />
      </div>
    </Card>
  )
})
