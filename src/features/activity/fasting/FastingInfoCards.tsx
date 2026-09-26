/**
 * Informationskort för fastesidan: hälsa och säkerhet, om 5:2 och en varsam spärr för den som
 * är gravid, ammar eller är under 18 år.
 *
 * Evidensläget beskrivs försiktigt: periodisk fasta fungerar ungefär som annan kaloriminskning.
 */
import { memo, type ReactNode } from 'react'
import { Droplet, ExternalLink, HeartHandshake, Scale, ShieldCheck, type LucideIcon } from 'lucide-react'
import { Button, Card } from '../../../components/ui'

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-gran underline-offset-4 hover:underline">
      {children}
      <ExternalLink aria-hidden className="size-3.5" strokeWidth={2.2} />
      <span className="sr-only"> (öppnas i ny flik)</span>
    </a>
  )
}

function Point({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-blabar-soft text-blabar">
        <Icon className="size-[1.125rem]" strokeWidth={2.2} />
      </span>
      <p className="text-[0.875rem] leading-relaxed text-ink-2">{children}</p>
    </li>
  )
}

export const FastingSafetyCard = memo(function FastingSafetyCard() {
  return (
    <Card eyebrow="Hälsa och säkerhet" title="Bra att veta">
      <ul className="flex flex-col gap-3.5">
        <Point icon={ShieldCheck}>
          <strong className="font-semibold text-ink">Fasta passar inte alla.</strong> Det rekommenderas inte om du är gravid eller
          ammar, är under 18 år, har diabetes och tar blodsockersänkande läkemedel (t.ex. insulin), eller har eller har haft en
          ätstörning. Prata med vårdcentralen eller <ExtLink href="https://www.1177.se">1177</ExtLink> först.
        </Point>
        <Point icon={Scale}>
          <strong className="font-semibold text-ink">Ingen mirakelmetod.</strong> I studier ger periodisk fasta ungefär samma resultat
          som att äta lite mindre varje dag. Effekten kommer främst av att man äter mindre totalt – välj det sätt som passar dig.
        </Point>
        <Point icon={Droplet}>
          <strong className="font-semibold text-ink">Lyssna på kroppen.</strong> Drick vatten, te eller svart kaffe under fastan. Blir du
          yr, svag eller mår dåligt – ät något. Det är inget misslyckande.
        </Point>
        <Point icon={HeartHandshake}>
          <strong className="font-semibold text-ink">Tar tankar på mat mycket plats?</strong> Du är inte ensam. Stöd finns hos{' '}
          <ExtLink href="https://www.friskfri.se">Frisk &amp; Fri</ExtLink> och <ExtLink href="https://www.1177.se">1177</ExtLink>.
        </Point>
      </ul>
    </Card>
  )
})

export const FiveTwoCard = memo(function FiveTwoCard({ mindful }: { mindful: boolean }) {
  return (
    <Card variant="flat" eyebrow="Ett annat upplägg" title="Om 5:2">
      <p className="text-[0.875rem] leading-relaxed text-ink-2">
        Vid 5:2 äter man som vanligt fem dagar i veckan och ungefär en fjärdedel av sitt vanliga energibehov
        {mindful ? '' : ' (runt 500–600 kcal)'} två dagar som inte ligger i rad. Lagom har ingen timer för 5:2 – dagboken räcker. Rådgör
        gärna med vården först, och välj hellre ett upplägg som känns hållbart än ett som känns strängt.
      </p>
    </Card>
  )
})

export interface FastingCautionCardProps {
  reason: 'graviditet' | 'ung'
  onShowAnyway: () => void
}

/** Visas i stället för starta-kortet för den som är gravid, ammar eller är under 18 år. */
export const FastingCautionCard = memo(function FastingCautionCard({ reason, onShowAnyway }: FastingCautionCardProps) {
  return (
    <Card tone="blabar" eyebrow="Omtanke" title="Fasta passar inte just nu">
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        {reason === 'graviditet'
          ? 'Under graviditet och amning behöver kroppen jämn tillgång till energi och näring, därför rekommenderas inte fasta. Prata gärna med barnmorskan om du har frågor om maten.'
          : 'När man är under 18 år växer kroppen fortfarande och mår bäst av regelbundna måltider, därför rekommenderas inte fasta. Prata gärna med skolsköterskan eller vårdcentralen om du har frågor.'}
      </p>
      <Button variant="ghost" className="mt-3" onClick={onShowAnyway}>
        Jag fastar av andra skäl – visa timern
      </Button>
    </Card>
  )
})
