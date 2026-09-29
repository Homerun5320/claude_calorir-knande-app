/**
 * "Återställ köp" – hämtar tidigare köp i appen från App Store eller Google Play (t.ex. på en ny
 * telefon med samma konto). Egen liten fil, eftersom spärrdialogen (som alltid laddas) använder den.
 */
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, toast } from '../../components/ui'
import { restoreStorePurchases } from './premiumLogic'

export function RestorePurchasesButton({
  variant = 'secondary',
  size = 'md',
  fullWidth,
}: {
  variant?: 'secondary' | 'ghost' | 'soft'
  size?: 'sm' | 'md'
  fullWidth?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const restore = async () => {
    if (busy) return
    setBusy(true)
    try {
      const { paid, trial } = await restoreStorePurchases()
      if (paid > 0) toast('Dina köp är återställda – tack!', { tone: 'success' })
      else if (trial) toast('Din provperiod är återställd.', { tone: 'success' })
      else toast('Inga köp att återställa')
    } catch {
      toast('Köpen kunde inte återställas just nu. Kontrollera uppkopplingen och försök igen.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant={variant} size={size} fullWidth={fullWidth} iconLeft={RotateCcw} loading={busy} onClick={() => void restore()}>
      Återställ köp
    </Button>
  )
}
