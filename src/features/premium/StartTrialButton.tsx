/**
 * "Starta 14 dagar gratis" – iPhone-appen startar provperioden med ett gratis köp i App Store
 * ('prov14', Apples riktlinje 3.1.1). Egen liten fil, eftersom spärrdialogen (som alltid laddas)
 * använder den. Visas bara när statusen är 'ejstartad' (se `trialViaStore()` i config/platform.ts).
 */
import { useState } from 'react'
import { Sprout } from 'lucide-react'
import { Button, toast } from '../../components/ui'
import { TRIAL_DAYS } from '../../config/commerce'
import { haptic } from '../../native'
import { startStoreTrial, type StoreTrialResult } from './premiumLogic'

/** Visa resultatet av ett försök att starta provperioden. */
export function announceTrialResult(result: StoreTrialResult): void {
  switch (result) {
    case 'started':
      haptic('success')
      toast(`Provperioden har startat – allt i Lagom är öppet i ${TRIAL_DAYS} dagar.`, { tone: 'success' })
      return
    case 'licensed':
      toast('Du har redan en licens – allt i Lagom är öppet.', { tone: 'success' })
      return
    case 'used':
      toast('Provperioden har redan använts med det här Apple-kontot. Din data finns kvar – för att logga nytt behöver du en licens.')
      return
    case 'pending':
      toast('Köpet väntar på godkännande i App Store. Provperioden startar när det är klart.')
      return
    case 'failed':
      toast('Provperioden kunde inte startas just nu. Försök igen om en stund.', { tone: 'error' })
      return
    case 'cancelled':
      return
  }
}

export function StartTrialButton({
  fullWidth,
  size = 'md',
  onDone,
}: {
  fullWidth?: boolean
  size?: 'sm' | 'md'
  /** Efter ett försök (t.ex. för att stänga spärrdialogen när provperioden har startat). */
  onDone?: (result: StoreTrialResult) => void
}) {
  const [busy, setBusy] = useState(false)
  const start = async () => {
    if (busy) return
    setBusy(true)
    const result = await startStoreTrial()
    setBusy(false)
    announceTrialResult(result)
    onDone?.(result)
  }
  return (
    <Button fullWidth={fullWidth} size={size} iconLeft={Sprout} loading={busy} onClick={() => void start()}>
      Starta {TRIAL_DAYS} dagar gratis
    </Button>
  )
}
