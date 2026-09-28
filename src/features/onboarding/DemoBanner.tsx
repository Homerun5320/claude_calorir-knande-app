/**
 * Tydlig markering när appen visar exempeldata (Idag och Dagbok). Exemplets profil har inget
 * namn – och den här rutan finns kvar tills man börjar med sin egen profil. Exempeldatan startar
 * ingen provperiod; den startar när den egna profilen skapas.
 */
import { useNavigate } from 'react-router-dom'
import { Sparkles, UserRound } from 'lucide-react'
import { Button, confirmDialog, cx } from '../../components/ui'
import { useDemoData } from '../../hooks/useDemoData'
import { wipeAndReset } from '../settings/wipe'

export function DemoBanner({ className }: { className?: string }) {
  const demo = useDemoData()
  const navigate = useNavigate()
  if (!demo) return null

  const start = async () => {
    const ok = await confirmDialog({
      title: 'Börja med din egen profil?',
      message: 'Exempeldatan tas bort och du svarar på några snabba frågor om dig – det tar under en minut.',
      confirmLabel: 'Börja',
      icon: UserRound,
    })
    if (!ok) return
    wipeAndReset()
    navigate('/valkommen', { replace: true })
  }

  return (
    <div role="note" aria-label="Exempeldata" className={cx('flex flex-col gap-3 rounded-card bg-hjortron-soft p-4 sm:flex-row sm:items-center', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-hjortron" />
        <div className="min-w-0">
          <p className="font-semibold text-ink">Du tittar på exempeldata</p>
          <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-2">
            Allt här är påhittat, så att du kan se hur Lagom fungerar – titta runt så mycket du vill. Din egen profil börjar tom, och provperioden startar
            först när du skapar den.
          </p>
        </div>
      </div>
      <Button size="sm" iconLeft={UserRound} onClick={start} className="self-start sm:self-center">
        Börja med min egen profil
      </Button>
    </div>
  )
}
