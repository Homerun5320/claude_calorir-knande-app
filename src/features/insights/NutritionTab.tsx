/**
 * Näring – periodens snitt mot NNR 2023, "Håll koll på", dina bästa källor per ämne och en
 * ärlig not om hur fullständiga näringsvärdena är.
 */
import { useMemo, useState } from 'react'
import { CategoryIcon, NutrientTable } from '../../components/domain'
import { Badge, Card, Chip } from '../../components/ui'
import { isAdultReference, nutrientsToWatch, nutrientStatus, STATUS_LABELS, type NutrientStatus } from '../../lib/nnr'
import { formatNumber, formatNutrient } from '../../lib/format'
import { MINERAL_KEYS, NUTRIENTS, VITAMIN_KEYS, type NutrientKey } from '../../lib/nutrients'
import { coverageSummary, coverageText, reliableReferences, topSources, uncertainNutrients } from './aggregate'
import { defaultSourceNutrient, isDarkHalfYear, SOURCE_NUTRIENTS, withSeasonalWatch } from './advice'
import { Callout, InfoNote, NameValueRow, ShareBar, SourceNote } from './ui'
import type { InsightsData } from './useInsights'

const STATUS_TONE: Record<NutrientStatus, 'mossa' | 'sol' | 'hjortron' | 'lingon' | 'neutral'> = {
  okant: 'neutral',
  lagt: 'hjortron',
  nara: 'sol',
  uppnatt: 'mossa',
  over_max: 'hjortron',
  over_ul: 'lingon',
}

export function NutritionTab({ data }: { data: InsightsData }) {
  const { avg, refs, refProfile, today, entries, mindful, summary } = data

  const watch = useMemo(() => {
    const items = nutrientsToWatch({
      sex: refProfile.sex,
      age: refProfile.age,
      lifeStage: refProfile.lifeStage,
      diet: refProfile.diet,
      averages: avg.averages,
      coverage: avg.coverage,
      refs,
    })
    return withSeasonalWatch(items, today, avg.averages, refs).slice(0, 5)
  }, [refProfile, avg.averages, avg.coverage, refs, today])

  const coverage = useMemo(() => coverageSummary(avg.coverage), [avg.coverage])
  // Ingen "Lågt" eller "Bra" för ämnen som saknar värde för en stor del av maten.
  const tableRefs = useMemo(() => reliableReferences(avg.averages, avg.coverage, refs), [avg.averages, avg.coverage, refs])
  const uncertain = useMemo(() => uncertainNutrients(refs, tableRefs, avg.averages), [refs, tableRefs, avg.averages])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="md:col-span-2" title="Näring i snitt" eyebrow={`Per loggad dag · ${summary.loggedDays} ${summary.loggedDays === 1 ? 'dag' : 'dagar'}`}>
        <p className="text-sm leading-relaxed text-ink-2">
          Rekommendationerna gäller genomsnittet över tid – en enskild dag behöver inte nå ända fram.
        </p>
        <InfoNote className="mt-3">{coverageText(coverage)}</InfoNote>
        {!isAdultReference(refProfile.age) && (
          <InfoNote className="mt-2">
            Referensvärdena gäller vuxna. Under 18 år kan behoven skilja sig – på 1177.se finns mer om mat för unga.
          </InfoNote>
        )}
      </Card>

      <WatchCard watch={watch} mindful={mindful} winter={isDarkHalfYear(today)} />
      <SourcesCard entries={entries} initial={defaultSourceNutrient(watch)} mindful={mindful} />

      <div className="md:col-span-2">
        {mindful ? (
          <MindfulNutrients data={data} />
        ) : (
          <Card title="Alla näringsämnen" eyebrow="Snitt per dag mot NNR 2023">
            {/* Täckningen beskrivs ovan (coverageText) – tabellens egen räknare skulle säga emot den. */}
            <NutrientTable nutrients={avg.averages} references={tableRefs} caption="Snitt per dag" showCompleteness={false} />
            {uncertain.length > 0 && (
              <InfoNote className="mt-3">
                {listNames(uncertain)} visas utan omdöme: värdet saknas för mer än hälften av maten du loggat, så snittet är sannolikt för lågt.
              </InfoNote>
            )}
          </Card>
        )}
      </div>
      <SourceNote>
        Källor: Nordiska näringsrekommendationer 2023 (NNR 2023) via Livsmedelsverket, kompletterat med EFSA där NNR saknar
        värde. Näringsvärden från Livsmedelsverkets livsmedelsdatabas och Open Food Facts.
      </SourceNote>
    </div>
  )
}

/** "Fullkorn, vitamin D och jod" */
function listNames(keys: readonly NutrientKey[]): string {
  const names = keys.map((k, i) => {
    const n = NUTRIENTS[k].name
    return i === 0 ? n : n.charAt(0).toLocaleLowerCase('sv-SE') + n.slice(1)
  })
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`
}

function WatchCard({
  watch,
  mindful,
  winter,
}: {
  watch: ReturnType<typeof withSeasonalWatch>
  mindful: boolean
  winter: boolean
}) {
  return (
    <Card title="Håll koll på" eyebrow={winter ? 'Vinterhalvår' : 'För dig just nu'}>
      {watch.length === 0 ? (
        <Callout emoji="🌿">Inget särskilt att hålla koll på just nu – snyggt!</Callout>
      ) : (
        <ul className="space-y-3.5">
          {watch.map((w) => {
            const status = STATUS_LABELS[w.status]
            return (
              <li key={w.key}>
                {/* flex-wrap: vid stor text (200 %) hamnar märket under namnet i stället för utanför kortet. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-words text-sm font-semibold text-ink">{NUTRIENTS[w.key].name}</span>
                  {!mindful && w.percent !== undefined && w.status !== 'okant' && (
                    <span className="text-xs text-ink-3 tabular-nums">{formatNumber(w.percent)}{'\u00a0'}% av RI</span>
                  )}
                  <Badge className="ml-auto" tone={STATUS_TONE[w.status]} dot>
                    {status.short === '–' ? 'Okänt' : status.short}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">{w.reason}</p>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function SourcesCard({ entries, initial, mindful }: { entries: InsightsData['entries']; initial: NutrientKey; mindful: boolean }) {
  const [key, setKey] = useState<NutrientKey>(initial)
  const result = useMemo(() => topSources(entries, key, 5), [entries, key])
  const meta = NUTRIENTS[key]

  return (
    <Card title="Dina bästa källor" eyebrow="Vad som bidragit mest">
      <div role="group" aria-label="Välj näringsämne" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 py-1.5 sm:-mx-5 sm:px-5">
        {SOURCE_NUTRIENTS.map((k) => (
          <Chip key={k} size="sm" selected={k === key} onClick={() => setKey(k)}>
            {NUTRIENTS[k].short}
          </Chip>
        ))}
      </div>
      {result.items.length === 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">
          {result.unknownEntries > 0
            ? `Inget av det du loggat har ett känt värde för ${meta.name.toLowerCase()}.`
            : `Inget loggat innehåller ${meta.name.toLowerCase()} under perioden.`}
        </p>
      ) : (
        <ol className="space-y-3" aria-label={`Största källorna till ${meta.name.toLowerCase()}`}>
          {result.items.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3">
              <CategoryIcon category={s.category} size="sm" />
              <div className="min-w-0 flex-1">
                <NameValueRow
                  name={
                    <>
                      <span className="sr-only">{i + 1}. </span>
                      {s.name}
                    </>
                  }
                  value={!mindful && `${formatNumber(s.share * 100)}\u00a0%`}
                />
                <ShareBar value={s.share} color="var(--lg-gran)" className="mt-1" />
                {!mindful && (
                  <span className="mt-0.5 block text-[11px] text-ink-3">
                    {formatNutrient(key, s.amount)} totalt · {s.count} {s.count === 1 ? 'gång' : 'gånger'}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {result.unknownEntries > 0 && result.items.length > 0 && (
        <InfoNote className="mt-3">
          {result.unknownEntries} {result.unknownEntries === 1 ? 'post saknar' : 'poster saknar'} värde för{' '}
          {meta.name.toLowerCase()} och räknas inte med.
        </InfoNote>
      )}
    </Card>
  )
}

/** Medvetet läge: status per ämne utan siffror. */
function MindfulNutrients({ data }: { data: InsightsData }) {
  const { avg, refs } = data
  const groups: Array<{ title: string; keys: readonly NutrientKey[] }> = [
    { title: 'Makro och fibrer', keys: ['protein', 'fiber', 'wholegrain', 'salt', 'satFat', 'addedSugar'] },
    { title: 'Vitaminer', keys: VITAMIN_KEYS },
    { title: 'Mineraler', keys: MINERAL_KEYS.filter((k) => k !== 'sodium') },
  ]
  return (
    <Card title="Alla näringsämnen" eyebrow="Utan siffror">
      <div className="grid gap-5 sm:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="eyebrow mb-2">{g.title}</h3>
            <ul className="space-y-1.5">
              {g.keys
                .filter((k) => refs[k])
                .map((k) => {
                  const cov = avg.coverage[k]
                  let status = nutrientStatus(avg.averages[k], refs[k])
                  if (cov !== undefined && cov < 0.5 && (status === 'lagt' || status === 'nara')) status = 'okant'
                  return (
                    <li key={k} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
                      <span className="min-w-0 break-words text-ink-2">{NUTRIENTS[k].name}</span>
                      <Badge tone={STATUS_TONE[status]} dot>
                        {status === 'okant' ? 'Okänt' : STATUS_LABELS[status].short}
                      </Badge>
                    </li>
                  )
                })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  )
}
