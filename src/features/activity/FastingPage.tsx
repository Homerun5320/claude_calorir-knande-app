/**
 * Fasta – /fasta. Periodisk fasta i egen takt: 12:12, 14:10, 16:8, 18:6 och 20:4.
 *
 *  1. Pågående fasta: stor ring med live-timer (varje sekund, bara medan sidan syns), start/mål,
 *     ändra starttid, byt mål, avsluta (bekräftelse om det är före målet) eller avbryt.
 *     Annars: välj protokoll och starta nu eller "Jag började tidigare".
 *  2. Veckans fasta – summering utan streaks.
 *  3. Historik med längd och om målet nåddes.
 *  4. Om 5:2 samt hälsa och säkerhet (graviditet/amning, diabetes med läkemedel, ätstörning).
 */
import { useCallback, useState } from 'react'
import { PageHeader, toast } from '../../components/ui'
import { Confetti } from '../../components/signature'
import { useToday } from '../../hooks/useToday'
import { youngestAge } from '../../lib/energy'
import { useFastingStore, type FastRecord } from '../../stores/fastingStore'
import { useProfileStore } from '../../stores/profileStore'
import { DEFAULT_PROTOCOL_ID, fastSucceeded, lastProtocolId, protocolById } from './fastingLogic'
import { FastHistory } from './fasting/FastHistory'
import { FastingCautionCard, FastingSafetyCard, FiveTwoCard } from './fasting/FastingInfoCards'
import { FastingWeekCard } from './fasting/FastingWeekCard'
import { FastTimerCard } from './fasting/FastTimerCard'
import { StartFastCard } from './fasting/StartFastCard'
import { StartTimeSheet } from './fasting/StartTimeSheet'
import { requireAccess } from '../premium/requireAccess'

interface SheetState {
  open: boolean
  key: number
  mode: 'edit' | 'new'
}

export default function FastingPage() {
  const today = useToday()
  const active = useFastingStore((s) => s.active)
  const history = useFastingStore((s) => s.history)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const lifeStage = useProfileStore((s) => s.profile?.lifeStage)
  const birthYear = useProfileStore((s) => s.profile?.birthYear)

  const [protocolId, setProtocolId] = useState(() => lastProtocolId(useFastingStore.getState().history))
  const [showAnyway, setShowAnyway] = useState(false)
  const [celebrate, setCelebrate] = useState(0)
  const [sheet, setSheet] = useState<SheetState>({ open: false, key: 0, mode: 'new' })

  const openSheet = useCallback((mode: 'edit' | 'new') => setSheet((s) => ({ open: true, key: s.key + 1, mode })), [])
  const closeSheet = useCallback(() => setSheet((s) => ({ ...s, open: false })), [])
  const onEnded = useCallback((rec: FastRecord) => {
    if (protocolById(rec.protocol)) setProtocolId(rec.protocol)
    // En liten fest i skogens färger när målet nåddes.
    if (fastSucceeded(rec)) setCelebrate((n) => n + 1)
  }, [])

  const caution: 'graviditet' | 'ung' | null =
    lifeStage === 'gravid' || lifeStage === 'ammar' ? 'graviditet' : birthYear !== undefined && youngestAge(birthYear, today) < 18 ? 'ung' : null

  const protocol = protocolById(protocolId) ?? protocolById(DEFAULT_PROTOCOL_ID)
  const sheetTarget = sheet.mode === 'edit' && active ? active.targetHours : (protocol?.fastHours ?? 16)

  const saveStart = (startMs: number) => {
    const store = useFastingStore.getState()
    if (sheet.mode === 'edit' && store.active) {
      store.startFast(store.active.targetHours, store.active.protocol, startMs)
      toast('Starttiden är ändrad', { tone: 'success' })
    } else if (protocol) {
      if (!requireAccess('fasta')) {
        closeSheet()
        return
      }
      store.startFast(protocol.fastHours, protocol.id, startMs)
      toast(`Fastan har börjat – ${protocol.id}`, { tone: 'success' })
    }
    closeSheet()
  }

  return (
    <div className="px-4 pb-8">
      <PageHeader title="Fasta" subtitle="Periodisk fasta i din egen takt – om det passar dig." />

      <div className="flex flex-col gap-4">
        {active ? (
          <FastTimerCard active={active} today={today} onEditStart={() => openSheet('edit')} onEnded={onEnded} />
        ) : caution && !showAnyway ? (
          <FastingCautionCard reason={caution} onShowAnyway={() => setShowAnyway(true)} />
        ) : (
          <StartFastCard protocolId={protocolId} onProtocol={setProtocolId} onStartEarlier={() => requireAccess('fasta') && openSheet('new')} today={today} />
        )}
        <FastingWeekCard history={history} today={today} />
        <FastHistory history={history} today={today} />
        <FiveTwoCard mindful={mindful} />
        <FastingSafetyCard />
      </div>

      <StartTimeSheet
        key={sheet.key}
        open={sheet.open}
        onClose={closeSheet}
        mode={sheet.mode}
        initialStart={sheet.mode === 'edit' ? active?.start : undefined}
        targetHours={sheetTarget}
        today={today}
        onSave={saveStart}
      />
      <Confetti fire={celebrate} fullscreen />
    </div>
  )
}
