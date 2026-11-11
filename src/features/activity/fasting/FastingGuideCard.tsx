/**
 * "Så fungerar fasta i Lagom" – en kort, hopfällbar guide på Fasta-sidan: vad periodisk fasta är,
 * hur man startar och avslutar, vad som sparas, om fastan påverkar dagsmålet och (bara i apparna)
 * påminnelse och widget. Varje fråga är ett inbyggt <details> (tangentbord och skärmläsare utan egen
 * kod) och stängt från början, så att sidan förblir kort.
 *
 * Varje påstående stämmer med koden – ändrar du beteendet, ändra texten (och supportsidan och
 * butiksbeskrivningarna, som återger den):
 * - upplägg 12:12–20:4 (FASTING_PROTOCOLS), starttid högst MAX_FAST_HOURS bakåt, fastor under
 *   MIN_SAVED_FAST_MS sparas inte, avslut före målet ber om bekräftelse (FastTimerCard)
 * - fastan sparas i `lagom-fasting` på enheten och ingår i säkerhetskopian och "Radera all data"
 * - inget i energiberäkningen (lib/energy, useTargets) läser fastan – dagsmålet påverkas inte
 * - Idag visar en pågående fasta som ett kort (ContextCards); påminnelsen "När fastan är klar"
 *   (native/reminders) och hemskärmswidgeten (native/widget, bara Android) finns bara i apparna
 *
 * Ton: sakligt och lugnt, inget beröm, inga löften om hälsa eller vikt, inga energisiffror (alltså
 * samma text i medvetet läge). Där fastan beskrivs för den som är ny står alltid vem den inte
 * rekommenderas för (`NotRecommendedFor`).
 */
import { memo } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Card } from '../../../components/ui'
import { CLOUD_ENABLED } from '../../../config/cloud'
import { storagePlace } from '../../../config/platform'
import { isNative, nativePlatform } from '../../../native'
import { MAX_FAST_HOURS, MIN_SAVED_FAST_MS } from '../fastingLogic'
import { Disclosure } from './Disclosure'
import { NotRecommendedFor, SupportLinks } from './FastingInfoCards'

const MIN_SAVED_MINUTES = Math.round(MIN_SAVED_FAST_MS / 60_000)

export const FastingGuideCard = memo(function FastingGuideCard() {
  const inApp = isNative()
  // Hemskärmswidgeten finns bara i Android-appen (iPhone-widgeten är avstängd tills App Group finns).
  const widget = nativePlatform() === 'android'

  return (
    <Card eyebrow="Om fasta" title="Så fungerar fasta i Lagom">
      <p className="-mt-1 text-[0.875rem] leading-relaxed text-ink-2">Tryck på en rubrik för att läsa mer.</p>

      <div className="mt-3 flex flex-col gap-2">
        <Disclosure summary="Vad är periodisk fasta?">
          <p>
            Du delar dygnet i ett fastefönster, när du inte äter, och ett ätfönster, när du äter som vanligt. Vid 16:8 är det 16{'\u00a0'}timmar utan mat och
            8{'\u00a0'}timmar då du äter. Det är ett sätt att lägga upp dagen – inget du måste göra.
          </p>
          <p className="mt-2">Lagom har fem upplägg, från 12:12 till 20:4. Välj det som känns hållbart – ett kortare ätfönster är inte bättre.</p>
        </Disclosure>

        <Disclosure summary="Så startar och avslutar du">
          <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-ink-3">
            <li>
              Tryck på Starta fastan nu när du slutar äta. Har du redan börjat trycker du på Jag började tidigare och anger när – upp till {MAX_FAST_HOURS}
              {'\u00a0'}timmar bakåt.
            </li>
            <li>
              Under fastan ser du hur länge du har fastat, hur lång tid som är kvar och när målet nås. Du kan ändra starttiden och byta mål medan
              fastan pågår.
            </li>
            <li>När målet är nått fortsätter timern tills du själv avslutar fastan.</li>
            <li>
              Du avslutar när du vill. Före målet ber Lagom bara om en bekräftelse – det är inget misslyckande. En fasta som har varat kortare än{' '}
              {MIN_SAVED_MINUTES}
              {'\u00a0'}minuter sparas inte, och Avbryt tar bort fastan utan att spara den.
            </li>
          </ul>
        </Disclosure>

        <Disclosure summary="Vad sparas?">
          <p>
            När du avslutar en fasta sparas start, slut och upplägg i historiken längre ned. En pågående fasta finns kvar även om du stänger Lagom.
          </p>
          <p className="mt-2">
            Allt sparas {storagePlace()}, tillsammans med resten av din data, och inget skickas någonstans
            {CLOUD_ENABLED ? ' om du inte själv slår på Lagom Moln' : ''}. Fastorna ingår i säkerhetskopian (Inställningar → Data) och tas bort av
            Radera all data.
          </p>
        </Disclosure>

        <Disclosure summary="Påverkar fastan mitt dagsmål?">
          <p>
            Fastan påverkar inte ditt dagsmål, och du loggar maten som vanligt i dagboken. Medan en fasta pågår visas den som ett kort på Idag.
          </p>
        </Disclosure>

        {inApp && (
          <Disclosure summary={widget ? 'Påminnelse och widget' : 'Påminnelse'}>
            <p>
              Slå på När fastan är klar under Inställningar → Påminnelser, så får du en notis när målet nås. Du bestämmer själv – det är helt frivilligt.
            </p>
            {widget && (
              <p className="mt-2">Lägger du till Lagoms widget på hemskärmen kan den också visa en pågående fasta, om widgeten är tillräckligt stor.</p>
            )}
          </Disclosure>
        )}
      </div>

      <div className="mt-4 flex gap-3 rounded-2xl bg-blabar-soft px-3.5 py-3">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-blabar" strokeWidth={2.2} />
        <p className="min-w-0 break-words text-[0.875rem] leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink">Fasta passar inte alla.</strong> <NotRecommendedFor /> <SupportLinks />
        </p>
      </div>
    </Card>
  )
})
