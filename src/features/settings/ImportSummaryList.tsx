/**
 * Vad en säkerhetskopia innehåller – visas innan man importerar (Inställningar → Data och
 * välkomstflödet). Skadade delar som hoppas över (se `parseBackup`) nämns lugnt under listan.
 */
import type { ImportSummary } from '../../lib/backup'
import { formatNumber, plural } from '../../lib/format'

export function ImportSummaryList({ summary }: { summary: ImportSummary }) {
  const rows: Array<[string, string]> = [
    ['Dagbok', `${plural(summary.days, 'dag', 'dagar')} · ${plural(summary.entries, 'post', 'poster')}`],
    ['Vikt', plural(summary.weights, 'vägning', 'vägningar')],
    ['Egna livsmedel', formatNumber(summary.customFoods)],
    ['Recept', formatNumber(summary.recipes)],
  ]
  const skipped = summary.skippedDetails ?? []
  return (
    <>
      <dl className="flex flex-col rounded-2xl bg-surface-2 px-4 py-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5 last:border-0">
            <dt className="text-[0.9375rem] text-ink-2">{k}</dt>
            <dd className="text-[0.9375rem] font-semibold tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {(skipped.length > 0 || summary.repaired > 0) && (
        <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-2">
          {skipped.length > 0 && <>En del av filen är skadad och hoppas över: {skipped.join(', ')}. Resten går att importera. </>}
          {summary.repaired > 0 && <>{plural(summary.repaired, 'post', 'poster')} med småfel rättas automatiskt.</>}
        </p>
      )}
    </>
  )
}
