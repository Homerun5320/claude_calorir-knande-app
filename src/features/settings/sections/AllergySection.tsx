/**
 * Inställningar → Allergier och överkänslighet.
 *
 * Användaren markerar det hon eller han inte tål: de 14 allergenerna i EU:s allergenlista (bilaga II
 * till förordning 1169/2011, med Livsmedelsverkets benämningar) och laktos. Lagom flaggar sedan
 * varsamt produkter från Open Food Facts som innehåller något av det – i produktdetaljen, i
 * skanningens resultat och i online-sökningen (se `lib/allergens.ts`).
 *
 * Uppgifterna är hälsouppgifter och sparas bara på enheten (`settings.allergens` i lagom-profile).
 * Inget av det skickas till Open Food Facts eller till oss – flaggorna räknas fram på enheten.
 * Att ändra en inställning skapar inget nytt, så det fungerar även med exempeldata.
 */
import { useId, type ReactNode } from 'react'
import { BookOpen, HeartHandshake, Info, Smartphone } from 'lucide-react'
import { Button, Card, ExternalLink, toast } from '../../../components/ui'
import { CLOUD_ENABLED } from '../../../config/cloud'
import { storagePlace } from '../../../config/platform'
import { isNative } from '../../../native'
import {
  ALLERGEN_META,
  EU_ALLERGENS,
  INTOLERANCES,
  LMV_ALLERGY_LABELLING_URL,
  LMV_ALLERGY_URL,
  joinSv,
  sortAllergens,
  toggleAllergen,
} from '../../../lib/allergens'
import { useProfileStore } from '../../../stores/profileStore'
import type { AllergenKey } from '../../../types'
import { Note } from '../../onboarding/AboutFields'

const EMPTY: readonly AllergenKey[] = []

/** "Du har markerat mjölk och nötter." / "Inget markerat ännu." */
export function allergySelectionText(keys: readonly AllergenKey[] | undefined): string {
  const list = sortAllergens(keys ?? EMPTY)
  if (list.length === 0) return 'Inget markerat ännu – då visar Lagom inga allergiflaggor.'
  return `Du har markerat ${joinSv(list.map((k) => ALLERGEN_META[k].name))}.`
}

export function AllergySection() {
  const allergens = useProfileStore((s) => s.settings.allergens ?? EMPTY)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const euId = useId()
  const intoleranceId = useId()

  const toggle = (key: AllergenKey, on: boolean) => {
    updateSettings({ allergens: toggleAllergen(useProfileStore.getState().settings.allergens, key, on) })
  }

  const clearAll = () => {
    const previous = allergens.length > 0 ? [...allergens] : undefined
    updateSettings({ allergens: undefined })
    toast('Allt är avmarkerat', {
      action: previous ? { label: 'Ångra', onClick: () => updateSettings({ allergens: previous }) } : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <Card eyebrow="Varsamma flaggor" title="Så fungerar det">
        <div className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-ink-2">
          <p>
            Markera det du inte tål. När du skannar en streckkod, söker bland märkesvaror eller tittar på en produkt säger Lagom till om produkten innehåller något
            av det – till exempel ”Innehåller mjölk – som du har markerat”.
          </p>
          <Note tone="sol" icon={Info}>
            Lagom kan aldrig lova att något är fritt från allergener. Uppgifterna kommer från Open Food Facts, som byggs av användare, och kan vara ofullständiga
            eller gamla. Lagoms egna livsmedel, Livsmedelsverkets livsmedel, recept, dina egna livsmedel och det som kommer med ett delat recept eller en delad
            måltid har inga uppgifter om allergener. Läs alltid ingrediensförteckningen på förpackningen – innehållet kan ändras.
          </Note>
          <p className="text-[0.875rem] text-ink" role="status" aria-live="polite">
            {allergySelectionText(allergens)}
          </p>
        </div>
      </Card>

      <Card eyebrow="EU:s allergenlista" title="Allergier">
        <fieldset aria-describedby={`${euId}-hint`}>
          <legend className="sr-only">Allergier</legend>
          <p id={`${euId}-hint`} className="mb-2 text-[0.8125rem] leading-snug text-ink-3">
            De 14 ämnen som alltid ska märkas ut på förpackningen, med Livsmedelsverkets namn.
          </p>
          <ul className="-mx-2 flex flex-col">
            {EU_ALLERGENS.map((key) => (
              <AllergenCheckbox key={key} allergen={key} checked={allergens.includes(key)} onChange={(on) => toggle(key, on)} />
            ))}
          </ul>
        </fieldset>
      </Card>

      <Card eyebrow="Intolerans" title="Laktos">
        <fieldset aria-describedby={`${intoleranceId}-hint`}>
          <legend className="sr-only">Intolerans</legend>
          <p id={`${intoleranceId}-hint`} className="mb-2 text-[0.8125rem] leading-snug text-ink-3">
            Laktos är mjölksocker och ingår i mjölk och mjölkprodukter. En produkt som är märkt laktosfri visas som ”Märkt laktosfri enligt Open Food Facts”.
          </p>
          <ul className="-mx-2 flex flex-col">
            {INTOLERANCES.map((key) => (
              <AllergenCheckbox key={key} allergen={key} checked={allergens.includes(key)} onChange={(on) => toggle(key, on)} />
            ))}
          </ul>
        </fieldset>
      </Card>

      <Card eyebrow="Integritet" title="Stannar på din enhet">
        <div className="flex flex-col gap-3 text-[0.9375rem] leading-relaxed text-ink-2">
          <p className="flex items-start gap-2.5">
            <Smartphone aria-hidden className="mt-1 size-4 shrink-0 text-gran" />
            <span>
              Allergier och intoleranser är uppgifter om din hälsa. De sparas bara {storagePlace()} och skickas aldrig till Open Food Facts eller till oss –
              flaggorna räknas fram på enheten. De följer bara med om du själv sparar en säkerhetskopia
              {CLOUD_ENABLED ? ' eller slår på Lagom Moln (krypterat på enheten)' : ''}, och de raderas med ”Radera all data”.
              {isNative() && ' I appen finns de också i den automatiska kopian i appens mapp på telefonen, som inte lämnar telefonen genom Lagom.'}
            </span>
          </p>
          {allergens.length > 0 && (
            <div>
              <Button variant="soft" size="sm" onClick={clearAll}>
                Avmarkera allt
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card eyebrow="Läs mer" title="Allergi och överkänslighet">
        <ul className="flex flex-col">
          <ReadMore href={LMV_ALLERGY_URL}>Livsmedelsverket: Allergi och överkänslighet</ReadMore>
          <ReadMore href={LMV_ALLERGY_LABELLING_URL}>Livsmedelsverket: Allergimärkning och ”kan innehålla spår av”</ReadMore>
        </ul>
        <div className="mt-3">
          <Note tone="mossa" icon={HeartHandshake}>
            Misstänker du att du inte tål något, eller har du fått en kraftig reaktion? Ta kontakt med vården, till exempel via{' '}
            <ExternalLink href="https://www.1177.se" className="font-semibold text-gran underline underline-offset-2">
              1177 Vårdguiden
            </ExternalLink>
            .
          </Note>
        </div>
      </Card>
    </div>
  )
}

export default AllergySection

function AllergenCheckbox({ allergen, checked, onChange }: { allergen: AllergenKey; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId()
  const meta = ALLERGEN_META[allergen]
  const hintId = `${id}-hint`
  return (
    <li className="relative flex min-h-12 items-start gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-surface-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={meta.hint ? hintId : undefined}
        className="relative z-10 mt-0.5 size-5 shrink-0 cursor-pointer accent-gran focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gran"
      />
      <div className="min-w-0">
        {/* Hela raden är tryckyta (etikettens ::after täcker raden). */}
        <label htmlFor={id} className="cursor-pointer text-[0.9375rem] font-medium leading-snug text-ink after:absolute after:inset-0 after:rounded-2xl">
          {meta.label}
        </label>
        {meta.hint && (
          <p id={hintId} className="mt-0.5 text-[0.8125rem] leading-snug text-ink-3">
            {meta.hint}
          </p>
        )}
      </div>
    </li>
  )
}

function ReadMore({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <ExternalLink
        href={href}
        className="flex min-h-11 items-center gap-2.5 rounded-2xl py-2 text-[0.9375rem] font-semibold text-gran underline-offset-4 hover:underline"
      >
        <BookOpen aria-hidden className="size-4 shrink-0" />
        <span>{children}</span>
      </ExternalLink>
    </li>
  )
}
