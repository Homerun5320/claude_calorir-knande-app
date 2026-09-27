/**
 * Inställningar → Licens: provperiod eller licens, aktivering av en licensnyckel (t.ex. på en ny
 * telefon), visa/kopiera nyckeln, ta bort den från enheten och vägen till köpsidan.
 */
import { ArrowRight, Download } from 'lucide-react'
import { Button, Card, Spinner } from '../../../components/ui'
import { useAccess } from '../../../hooks/useAccess'
import { useLicenseStore } from '../../../stores/licenseStore'
import { LicenseActivation, LicenseManage, StatusHero, TestModeBanner } from '../../premium/components'

export function LicenseSection() {
  const { status, checking } = useAccess()
  const licenseKey = useLicenseStore((s) => s.licenseKey)
  const lifetime = status.kind === 'licensierad' && status.expiresAt === undefined

  return (
    <div className="flex flex-col gap-5">
      <TestModeBanner />
      {checking ? (
        <Card padding="lg" role="status" aria-busy="true" className="flex items-center gap-3 text-ink-2">
          <Spinner />
          Kontrollerar din licens …
        </Card>
      ) : (
        <StatusHero
          status={status}
          actions={
            lifetime ? undefined : (
              <>
                <Button to="/premium" iconRight={ArrowRight}>
                  {status.kind === 'licensierad' ? 'Förnya eller uppgradera' : 'Se priser och köp'}
                </Button>
                {status.kind === 'utgangen' && (
                  <Button to="/installningar/data" variant="secondary" iconLeft={Download}>
                    Exportera min data
                  </Button>
                )}
              </>
            )
          }
        />
      )}

      {licenseKey ? (
        <Card eyebrow="Licensnyckel" title="Din nyckel">
          <p className="-mt-1 mb-4 text-[0.9375rem] leading-relaxed text-ink-2">
            Nyckeln är ditt kvitto i appen. Klistra in den på en ny enhet för att flytta Lagom dit – inget konto behövs.
          </p>
          <LicenseManage />
        </Card>
      ) : null}

      <Card eyebrow="Aktivera" title={licenseKey ? 'Byt licensnyckel' : 'Har du en licensnyckel?'}>
        <p className="-mt-1 mb-4 text-[0.9375rem] leading-relaxed text-ink-2">
          Klistra in nyckeln du fick vid köpet, t.ex. från din lösenordshanterare eller ett mejl till dig själv.
        </p>
        <LicenseActivation />
      </Card>

      <p className="px-1 text-[0.8125rem] leading-relaxed text-ink-3">
        Oavsett licens kan du alltid se, exportera och radera all din data. Köpvillkoren finns på sidan Lagom Premium.
      </p>
    </div>
  )
}
