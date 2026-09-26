/**
 * Starta en fasta: välj protokoll (12:12–20:4), se dygnets fördelning och när målet nås,
 * och starta nu – eller ange att du började tidigare.
 */
import { memo } from 'react'
import { History, Play } from 'lucide-react'
import { Button, Card, SegmentedControl, toast } from '../../../components/ui'
import { useFastingStore } from '../../../stores/fastingStore'
import type { ISODate } from '../../../types'
import { dayAndTime, DEFAULT_PROTOCOL_ID, FASTING_PROTOCOLS, protocolById, type FastingProtocol } from '../fastingLogic'
import { useNow } from '../hooks'

export interface StartFastCardProps {
  protocolId: string
  onProtocol: (id: string) => void
  onStartEarlier: () => void
  today: ISODate
}

export const StartFastCard = memo(function StartFastCard({ protocolId, onProtocol, onStartEarlier, today }: StartFastCardProps) {
  const now = useNow(30_000)
  const protocol = protocolById(protocolId) ?? (protocolById(DEFAULT_PROTOCOL_ID) as FastingProtocol)

  const start = () => {
    useFastingStore.getState().startFast(protocol.fastHours, protocol.id)
    toast(`Fastan har börjat – ${protocol.id}`, { tone: 'success' })
  }

  return (
    <Card eyebrow="Ingen pågående fasta" title="Starta en fasta">
      <SegmentedControl
        aria-label="Välj upplägg"
        fullWidth
        value={protocol.id}
        onChange={onProtocol}
        options={FASTING_PROTOCOLS.map((p) => ({ value: p.id, label: p.id }))}
      />

      <div className="mt-4">
        <p className="font-display text-lg font-semibold leading-snug text-ink">
          {protocol.id} · {protocol.title}
        </p>
        <p className="mt-0.5 text-[0.875rem] leading-relaxed text-ink-2">{protocol.description}</p>
      </div>

      <DayBar protocol={protocol} />

      <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-2">
        Börjar du nu är målet nått <strong className="font-semibold text-ink">{dayAndTime(now + protocol.fastHours * 3_600_000, today)}</strong>.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <Button size="lg" fullWidth iconLeft={Play} onClick={start}>
          Starta fastan nu
        </Button>
        <Button variant="ghost" fullWidth iconLeft={History} onClick={onStartEarlier}>
          Jag började tidigare …
        </Button>
      </div>
    </Card>
  )
})

/** Dygnets 24 timmar: fasta och ätfönster. */
function DayBar({ protocol }: { protocol: FastingProtocol }) {
  const fastPct = (protocol.fastHours / 24) * 100
  return (
    <div className="mt-4" role="img" aria-label={`Dygnet: ${protocol.fastHours} timmar fasta och ${protocol.eatHours} timmar ätfönster`}>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-l-full bg-blabar transition-[width] duration-500 ease-spring" style={{ width: `${fastPct}%` }} />
        <div className="h-full flex-1 rounded-r-full bg-hjortron-soft ring-1 ring-inset ring-hjortron/30" />
      </div>
      <div className="mt-1.5 flex justify-between text-xs font-medium">
        <span className="text-blabar">Fasta {protocol.fastHours} h</span>
        <span className="text-ink-2">Ätfönster {protocol.eatHours} h</span>
      </div>
    </div>
  )
}
