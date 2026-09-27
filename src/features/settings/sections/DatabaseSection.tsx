/**
 * Inställningar → Livsmedelsdatabas: vad som finns inbyggt, källor, import av hela
 * Livsmedelsverkets databas och rensning av sparade onlinelivsmedel.
 */
import { useMemo } from 'react'
import { BadgeCheck, Barcode, CloudDownload, Database, ExternalLink, Landmark, Trash, TriangleAlert, X } from 'lucide-react'
import { Badge, Button, Card, ListGroup, ListRow, ProgressBar, Skeleton, confirmDialog, toast } from '../../../components/ui'
import { useBuiltinCatalog } from '../../../hooks/useFood'
import { formatDayLong } from '../../../lib/dates'
import { formatNumber, plural } from '../../../lib/format'
import { LMV_ATTRIBUTION } from '../../../lib/livsmedelsverket'
import { useFoodStore } from '../../../stores/foodStore'
import { cachedFoodStats, pruneCachedFoods } from '../settingsLogic'
import { useLmvImport } from '../useLmvImport'

export function DatabaseSection() {
  return (
    <div className="flex flex-col gap-5">
      <BuiltinCard />
      <UserFoodsCard />
      <LmvImportCard />
      <SourcesCard />
    </div>
  )
}

function BuiltinCard() {
  const catalog = useBuiltinCatalog()
  const counts = useMemo(() => {
    if (!catalog) return null
    let lagom = 0
    let lmv = 0
    for (const f of catalog.foods) {
      if (f.source === 'lagom') lagom++
      else if (f.source === 'livsmedelsverket') lmv++
    }
    return { total: catalog.foods.length, lagom, lmv }
  }, [catalog])

  return (
    <Card eyebrow="Inbyggt" title="Lagoms livsmedelsdatabas">
      {!catalog || !counts ? (
        <div aria-busy="true" aria-label="Läser in databasen" className="flex flex-col gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : catalog.error ? (
        <p className="text-[0.9375rem] text-ink-2">{catalog.error}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="display-num text-[2.5rem] font-semibold leading-none text-gran">{formatNumber(counts.total)}</span>
            <span className="text-[0.9375rem] text-ink-2">livsmedel att söka bland</span>
          </div>
          <ul className="mt-4 flex flex-col gap-2.5 text-[0.9375rem] leading-relaxed text-ink-2">
            <li className="flex gap-3">
              <BadgeCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-mossa" />
              <span>
                <strong className="font-semibold text-ink">{formatNumber(counts.lagom)} granskade svenska livsmedel</strong> – namn och näringsvärden per
                100{'\u00a0'}g från Livsmedelsverket, kvalitetskontrollerade och med svenska portioner och mått.
              </span>
            </li>
            {counts.lmv > 0 && (
              <li className="flex gap-3">
                <Landmark aria-hidden className="mt-0.5 size-5 shrink-0 text-blabar" />
                <span>
                  <strong className="font-semibold text-ink">{formatNumber(counts.lmv)} från Livsmedelsverkets databas</strong>
                  {catalog.lmv?.version ? ` (hämtad ${formatDayLong(catalog.lmv.version)})` : ''}.
                </span>
              </li>
            )}
            <li className="flex gap-3">
              <Barcode aria-hidden className="mt-0.5 size-5 shrink-0 text-hjortron" />
              <span>Produkter med streckkod hämtas från Open Food Facts när du skannar eller söker – och märks tydligt.</span>
            </li>
          </ul>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">Saknas ett värde visas ”–”, aldrig 0. Okänt är inte samma sak som ingenting.</p>
        </>
      )}
    </Card>
  )
}

function UserFoodsCard() {
  const customCount = useFoodStore((s) => Object.keys(s.customFoods).length)
  const recipeCount = useFoodStore((s) => Object.keys(s.recipes).length)
  const cached = useFoodStore((s) => s.cachedFoods)
  const stats = useMemo(() => cachedFoodStats(cached), [cached])

  const clear = async () => {
    const ok = await confirmDialog({
      title: 'Rensa sparade onlinelivsmedel?',
      message: 'Produkter från Open Food Facts och Livsmedelsverket som sparats för offlinebruk tas bort. Favoriter behålls och dagboken påverkas inte.',
      confirmLabel: 'Rensa',
      tone: 'danger',
    })
    if (!ok) return
    const s = useFoodStore.getState()
    const before = s.cachedFoods
    const next = pruneCachedFoods(before, 'all', new Set(s.favorites))
    useFoodStore.setState({ cachedFoods: next })
    const removed = Object.keys(before).length - Object.keys(next).length
    toast(`${plural(removed, 'livsmedel', 'livsmedel')} rensade`, {
      action: { label: 'Ångra', onClick: () => useFoodStore.setState({ cachedFoods: before }) },
    })
  }

  return (
    <ListGroup
      title="Dina livsmedel"
      footer="Onlinelivsmedel sparas i appen när du loggar dem, så att de fungerar även utan uppkoppling."
    >
      <ListRow leading="🥫" title="Egna livsmedel" value={formatNumber(customCount)} dense />
      <ListRow leading="🍲" title="Egna recept" value={formatNumber(recipeCount)} to="/recept" dense />
      <ListRow leading="🔎" title="Sparade från Open Food Facts" value={formatNumber(stats.openfoodfacts)} dense />
      <ListRow leading="🏛️" title="Sparade från Livsmedelsverket" value={formatNumber(stats.livsmedelsverket)} dense />
      {stats.total > 0 && (
        <div className="px-2 py-2">
          <Button variant="ghost" size="sm" iconLeft={Trash} onClick={clear}>
            Rensa sparade onlinelivsmedel
          </Button>
        </div>
      )}
    </ListGroup>
  )
}

function LmvImportCard() {
  const imp = useLmvImport()
  const running = imp.status === 'running'
  const p = imp.progress
  const phaseText =
    !p || p.phase === 'lista'
      ? `Hämtar listan över livsmedel${p && p.total > 0 ? ` (${formatNumber(p.done)} av ${formatNumber(p.total)})` : '…'}`
      : `Hämtar näringsvärden: ${formatNumber(p.done)} av ${formatNumber(p.total)}`

  return (
    <Card eyebrow="Livsmedelsverket" title="Hämta hela databasen">
      <p className="-mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
        Livsmedelsverkets öppna databas har cirka 2{'\u00a0'}600 livsmedel med ett 50-tal näringsämnen. Importen tar några minuter och sparas på din enhet, så att
        allt går att söka även offline.
      </p>

      {running && p && (
        <div className="mt-4" aria-live="polite">
          <ProgressBar
            value={p.phase === 'lista' ? 0 : p.done + p.failed}
            max={Math.max(1, p.total)}
            label={phaseText}
            valueLabel={p.phase === 'naringsvarden' && p.total > 0 ? `${formatNumber(((p.done + p.failed) / p.total) * 100)}\u00a0%` : undefined}
            size="sm"
            animate={false}
          />
          {p.failed > 0 && <p className="mt-1.5 text-[0.8125rem] text-ink-3">{plural(p.failed, 'livsmedel', 'livsmedel')} gick inte att hämta och hoppas över.</p>}
        </div>
      )}

      {imp.status === 'done' && (
        <p role="status" className="mt-4 rounded-2xl bg-mossa-soft p-3.5 text-[0.9375rem] text-ink">
          Klart! {plural(imp.saved, 'livsmedel', 'livsmedel')} från Livsmedelsverket är sparade och sökbara.
          {p && p.failed > 0 ? ` ${formatNumber(p.failed)} kunde inte hämtas – försök gärna igen senare.` : ''}
        </p>
      )}
      {imp.status === 'cancelled' && (
        <p role="status" className="mt-4 rounded-2xl bg-surface-2 p-3.5 text-[0.9375rem] text-ink-2">
          Importen avbröts. {imp.saved > 0 ? `${plural(imp.saved, 'livsmedel', 'livsmedel')} hann sparas.` : 'Inget sparades.'}
        </p>
      )}
      {imp.status === 'error' && (
        <div role="alert" className="mt-4 rounded-2xl bg-hjortron-soft p-3.5 text-[0.9375rem] leading-relaxed text-ink">
          <p className="flex items-start gap-2 font-semibold">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-hjortron" />
            {imp.likelyBlocked ? 'Webbläsaren fick inte kontakt med Livsmedelsverket.' : imp.error}
          </p>
          {imp.likelyBlocked && (
            <p className="mt-1.5 text-ink-2">
              Oftast beror det på att tjänsten inte tillåter anrop direkt från webbläsare (CORS). Den som driftar Lagom kan i stället hämta databasen en gång
              med skriptet <code className="rounded bg-surface px-1 py-0.5 text-[0.8125rem]">scripts/import-livsmedelsverket.mjs</code> (
              <code className="rounded bg-surface px-1 py-0.5 text-[0.8125rem]">npm run data:lmv</code>) – då följer den med appen automatiskt.
            </p>
          )}
          {imp.saved > 0 && <p className="mt-1.5 text-ink-2">{plural(imp.saved, 'livsmedel', 'livsmedel')} hann sparas innan felet.</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {running ? (
          <Button variant="secondary" iconLeft={X} onClick={imp.cancel}>
            Avbryt
          </Button>
        ) : (
          <Button variant={imp.status === 'done' ? 'secondary' : 'primary'} iconLeft={CloudDownload} onClick={() => void imp.start()}>
            {imp.status === 'idle' ? 'Hämta från Livsmedelsverket' : 'Hämta igen'}
          </Button>
        )}
      </div>
      <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
        Stanna på sidan medan importen pågår. Anropen görs direkt från din enhet till Livsmedelsverket – inget passerar någon annan server.
      </p>
    </Card>
  )
}

const SOURCES: ReadonlyArray<{ title: string; text: string; href: string; badge?: string }> = [
  { title: 'Livsmedelsverkets livsmedelsdatabas', text: LMV_ATTRIBUTION.replace('Källa: ', 'Namn och näringsvärden per 100\u00a0g – '), href: 'https://soknaringsinnehall.livsmedelsverket.se/' },
  { title: 'Open Food Facts', text: 'Streckkoder och produkter, öppna data under ODbL. Användarbidrag – jämför gärna med förpackningen.', href: 'https://se.openfoodfacts.org/', badge: 'ODbL' },
  { title: 'Nordiska näringsrekommendationer 2023', text: 'Referensvärden för vitaminer, mineraler och makron.', href: 'https://www.norden.org/en/publication/nordic-nutrition-recommendations-2023' },
]

function SourcesCard() {
  return (
    <ListGroup title="Källor">
      {SOURCES.map((s) => (
        <a
          key={s.title}
          href={s.href}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[3.75rem] items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2"
        >
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-2">
            <Database className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[0.9375rem] font-medium text-ink">
              {s.title}
              {s.badge && <Badge>{s.badge}</Badge>}
            </span>
            <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">{s.text}</span>
          </span>
          <ExternalLink aria-hidden className="size-4 shrink-0 text-ink-3" />
          <span className="sr-only">(öppnas i ny flik)</span>
        </a>
      ))}
    </ListGroup>
  )
}
