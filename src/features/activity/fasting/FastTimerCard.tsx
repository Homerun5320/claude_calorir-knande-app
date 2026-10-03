/**
 * Pågående fasta: stor ring med förfluten tid (uppdateras varje sekund medan sidan syns),
 * kvarvarande tid, start och mål, byte av protokoll, ändra starttid, avsluta och avbryt.
 * När målet är nått står det sakligt ("Målet är nått") – ingen grön framgångsfärg, inget beröm.
 */
import { memo, useId } from 'react'
import { Hourglass, Pencil, X } from 'lucide-react'
import { Badge, Button, Card, ProgressRing, SegmentedControl, confirmDialog, toast } from '../../../components/ui'
import { useFastingStore, type FastRecord } from '../../../stores/fastingStore'
import type { ISODate } from '../../../types'
import {
  clockTime,
  dayAndTime,
  endMessage,
  FASTING_PROTOCOLS,
  fastProgress,
  formatFastDuration,
  formatHms,
  isTooShortFast,
  MIN_SAVED_FAST_MS,
  protocolById,
} from '../fastingLogic'
import { useNow } from '../hooks'
import { haptic } from '../../../native'

export interface ActiveFast {
  start: number
  targetHours: number
  protocol: string
}

export interface FastTimerCardProps {
  active: ActiveFast
  today: ISODate
  onEditStart: () => void
  /** Anropas när fastan har avslutats och sparats. */
  onEnded: (rec: FastRecord) => void
}

export const FastTimerCard = memo(function FastTimerCard({ active, today, onEditStart, onEnded }: FastTimerCardProps) {
  const now = useNow(1000)
  const p = fastProgress(active, now)
  const known = protocolById(active.protocol)
  const descriptionId = useId()

  const end = async () => {
    const current = fastProgress(active, Date.now())
    // Nyss startad (t.ex. av misstag): avsluta utan att spara, så att en "0 min"-fasta inte
    // hamnar i historiken och veckans statistik.
    if (isTooShortFast(current.elapsedMs)) {
      const ok = await confirmDialog({
        title: 'Avsluta fastan?',
        message: `Fastan har bara pågått ${formatFastDuration(current.elapsedMs)}. Fastor under ${formatFastDuration(MIN_SAVED_FAST_MS)} sparas inte i historiken.`,
        confirmLabel: 'Avsluta utan att spara',
        cancelLabel: 'Fortsätt fasta',
        icon: Hourglass,
      })
      if (!ok) return
      discard('Fastan är avslutad utan att sparas')
      return
    }
    if (!current.done) {
      const ok = await confirmDialog({
        title: 'Avsluta fastan nu?',
        message: `Du har fastat ${formatFastDuration(current.elapsedMs)} av ${active.targetHours}\u00a0timmar. Det är helt okej att avsluta tidigare – lyssna på kroppen.`,
        confirmLabel: 'Avsluta och spara',
        cancelLabel: 'Fortsätt fasta',
        icon: Hourglass,
      })
      if (!ok) return
    }
    const rec = useFastingStore.getState().endFast()
    if (!rec) return
    // Saklig bekräftelse, ingen "klart"-vibration: en avslutad fasta firas aldrig (varken före eller efter målet).
    haptic('tap')
    toast(endMessage(rec))
    onEnded(rec)
  }

  const cancel = async () => {
    const ok = await confirmDialog({
      title: 'Avbryta utan att spara?',
      message: 'Fastan tas bort och sparas inte i historiken.',
      confirmLabel: 'Avbryt fastan',
      cancelLabel: 'Behåll',
      tone: 'danger',
    })
    if (!ok) return
    discard('Fastan är avbruten')
  }

  /** Ta bort den pågående fastan utan att spara (med Ångra). */
  const discard = (message: string) => {
    const snapshot = { ...active }
    useFastingStore.getState().cancelFast()
    toast(message, {
      action: { label: 'Ångra', onClick: () => useFastingStore.getState().startFast(snapshot.targetHours, snapshot.protocol, snapshot.start) },
    })
  }

  const changeProtocol = (id: string) => {
    const pr = protocolById(id)
    if (pr && pr.id !== active.protocol) useFastingStore.getState().startFast(pr.fastHours, pr.id, active.start)
  }

  return (
    <Card padding="lg" aria-label="Pågående fasta" aria-describedby={descriptionId} as="section">
      {/* Ringens innehåll är presentationellt för skärmläsare (en förloppsindikator har inga läsbara barn) – förklaringen står här. */}
      <p id={descriptionId} className="sr-only">
        Ringen visar hur långt fastan har kommit. I mitten står tiden som har gått och tiden som är kvar till målet. Under ringen står när fastan började och
        när målet nås. Du kan ändra starttiden, byta mål eller avsluta fastan när du vill.
      </p>
      <div className="flex flex-col items-center text-center">
        <Badge tone="blabar" dot>
          {p.done ? 'Målet är nått' : `Fastar · ${active.protocol}`}
        </Badge>

        <ProgressRing
          className="mt-4"
          value={Math.min(p.elapsedMs, p.targetMs)}
          max={p.targetMs}
          size={244}
          thickness={16}
          tone="blabar"
          aria-label="Fastans förlopp"
          valueText={`${formatFastDuration(p.elapsedMs)} av ${active.targetHours}\u00a0timmar`}
        >
          <span className="eyebrow">{p.done ? 'Fastat' : 'Har fastat'}</span>
          {/* Taket i px: ringen är 244 px, så siffrorna får inte växa med rotens teckenstorlek (vid 150 % lade de sig över ringen). */}
          <span className="display-num mt-1.5 font-semibold leading-none text-ink" style={{ fontSize: 'min(2.75rem, 44px)' }}>
            {formatHms(p.elapsedMs)}
          </span>
          <span className="mt-2 text-sm text-ink-2">
            {p.done ? `Målet nåddes ${clockTime(p.goalAt)}` : `${formatFastDuration(p.remainingMs)} kvar`}
          </span>
        </ProgressRing>

        {/* Två kolumner när det får plats, annars en under den andra (stor text). */}
        <dl className="mt-5 grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2 text-left">
          <div className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
            <dt className="eyebrow">Start</dt>
            <dd className="mt-0.5 text-[0.9375rem] font-semibold text-ink first-letter:uppercase">{dayAndTime(active.start, today)}</dd>
          </div>
          <div className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
            <dt className="eyebrow">
              {/* Rubriken skrivs med versaler – enheten ska ändå stå som "h", inte "H". */}
              Mål <span className="normal-case">({active.targetHours}{'\u00a0'}h)</span>
            </dt>
            <dd className="mt-0.5 text-[0.9375rem] font-semibold text-ink first-letter:uppercase">{dayAndTime(p.goalAt, today)}</dd>
          </div>
        </dl>

        {known && (
          <div className="mt-4 w-full">
            <SegmentedControl
              aria-label="Byt mål för fastan"
              size="sm"
              fullWidth
              value={known.id}
              onChange={changeProtocol}
              options={FASTING_PROTOCOLS.map((pr) => ({ value: pr.id, label: pr.id }))}
            />
          </div>
        )}

        <div className="mt-5 flex w-full flex-col gap-2">
          <Button size="lg" fullWidth onClick={() => void end()} variant={p.done ? 'primary' : 'secondary'}>
            {p.done ? 'Avsluta och spara' : 'Avsluta fastan'}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="flex-[1_1_8rem]" iconLeft={Pencil} onClick={onEditStart}>
              Ändra start
            </Button>
            <Button variant="ghost" className="flex-[1_1_8rem]" iconLeft={X} onClick={() => void cancel()}>
              Avbryt
            </Button>
          </div>
        </div>

        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
          Vatten, te och svart kaffe går bra under fastan. Mår du inte bra – ät något, det är inget misslyckande.
        </p>
      </div>
    </Card>
  )
})
