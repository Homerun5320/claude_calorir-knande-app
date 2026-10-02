/**
 * Kostråd – Livsmedelsverkets kostråd för vuxna utvärderade för perioden, med en mjuk
 * sammanfattande kostrådspoäng (0–100). Bara loggade dagar räknas.
 */
import { useId, useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Badge, Card, ExternalLink, ProgressBar, ProgressRing } from '../../components/ui'
import { evaluateKostrad, isAssessable, isUsable, kostradScore, tooFewDays, type KostradResult } from '../../lib/kostrad'
import { KOSTRAD_STATUS, kostradProgressText, kostradScoreLabel } from './advice'
import { InfoNote, SourceNote } from './ui'
import type { InsightsData } from './useInsights'

/** Kostråden för perioden (delas med rapporten). */
export function usePeriodKostrad(data: InsightsData): KostradResult[] {
  const { entriesByDate, exerciseByDate, period, refProfile, targets } = data
  return useMemo(
    () =>
      evaluateKostrad({
        entriesByDate,
        exerciseByDate,
        dates: period.elapsed,
        sex: refProfile.sex,
        kcalTarget: targets.kcal,
      }),
    [entriesByDate, exerciseByDate, period.elapsed, refProfile.sex, targets.kcal],
  )
}

export function KostradTab({ data }: { data: InsightsData }) {
  const results = usePeriodKostrad(data)
  const listHeadingId = useId()
  const score = useMemo(() => kostradScore(results), [results])
  const reduce = useReducedMotion()
  const { mindful } = data
  const label = kostradScoreLabel(score)
  // Bara bedömda råd räknas: ett osäkert råd (för få kända värden) är varken uppfyllt eller inte.
  const usable = results.filter(isAssessable)
  const met = usable.filter((r) => r.status === 'bra').length
  const uncertainCount = results.length - usable.length
  const days = results[0]?.periodDays ?? 0

  if (results.length === 0) {
    return (
      <Card title="Kostråden" eyebrow="Livsmedelsverket">
        <p className="text-sm leading-relaxed text-ink-2">
          När du har loggat mat eller träning under perioden ser du här hur det går med Livsmedelsverkets kostråd.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <ProgressRing
            value={score}
            max={100}
            size={132}
            thickness={12}
            tone={score >= 60 ? 'mossa' : 'sol'}
            aria-label="Kostrådspoäng"
            valueText={mindful ? label.title : `${score} av 100, ${label.title.toLowerCase()}`}
          >
            {mindful ? (
              <span className="text-4xl" aria-hidden="true">
                🥗
              </span>
            ) : (
              <span className="flex flex-col items-center">
                <span className="display-num text-4xl leading-none text-ink">{score}</span>
                <span className="mt-1 text-xs text-ink-3">av 100</span>
              </span>
            )}
          </ProgressRing>
          <div className="min-w-0">
            {/* Rubriknivå 2 (sidans h1 är "Insikter"): rubrikerna får inte hoppa från h1 till h3. */}
            <h2 className="eyebrow">Kostrådspoäng</h2>
            <p className="mt-1 font-display text-2xl leading-tight font-semibold tracking-tight">{label.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{label.text}</p>
            <p className="mt-2 text-xs text-ink-3">
              {kostradMetText(met, usable.length, uncertainCount)} · baserat på {days} {days === 1 ? 'dag' : 'dagar'}
            </p>
          </div>
        </div>
        <InfoNote className="mt-4">
          Poängen är ett snitt av hur nära du är varje råd. Det är ingen dom – bara en kompass. Veckoråd (fisk, rött kött,
          rörelse) räknas om till antalet loggade dagar.
        </InfoNote>
      </Card>

      <h2 id={listHeadingId} className="sr-only">
        Kostråden
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-labelledby={listHeadingId}>
        {results.map((r, i) => (
          <motion.li
            key={r.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(0.4, i * 0.035) }}
          >
            <KostradCard result={r} mindful={mindful} />
          </motion.li>
        ))}
      </ul>

      <SourceNote>
        Källa: Livsmedelsverkets kostråd för vuxna (2025), baserade på Nordiska näringsrekommendationer 2023. Rörelse:
        Folkhälsomyndighetens riktlinjer (2021).{' '}
        <ExternalLink href="https://www.livsmedelsverket.se">livsmedelsverket.se</ExternalLink>
      </SourceNote>
    </div>
  )
}

/** "2 av 9 bedömda råd uppfyllda · 3 osäkra" – osäkra råd räknas inte in i totalen. */
export function kostradMetText(met: number, assessed: number, uncertain: number): string {
  const base = `${met} av ${assessed} bedömda råd uppfyllda`
  return uncertain > 0 ? `${base} · ${uncertain} ${uncertain === 1 ? 'osäkert' : 'osäkra'}` : base
}

function KostradCard({ result: r, mindful }: { result: KostradResult; mindful: boolean }) {
  const status = KOSTRAD_STATUS[r.status]
  const fewDays = tooFewDays(r)
  const uncertain = !isUsable(r) || fewDays
  const neutralLabel = fewDays ? 'För få dagar' : 'Osäkert'
  return (
    <article className="card h-full p-4" aria-label={r.title}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[1.35rem]" aria-hidden="true">
          {r.emoji}
        </span>
        <div className="min-w-0 flex-1">
          {/* Får brytas: i smala fönster hamnar märket under rubriken i stället för utanför kortet. */}
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
            <h3 className="font-display text-[1.0625rem] leading-snug font-semibold tracking-tight">{r.title}</h3>
            <Badge tone={uncertain ? 'neutral' : status.tone} dot className="shrink-0">
              {uncertain ? neutralLabel : status.label}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{r.advice}</p>
        </div>
      </div>
      <ProgressBar
        className="mt-3"
        value={Math.min(1, r.score)}
        max={1}
        size="sm"
        tone={uncertain ? 'neutral' : status.tone}
        aria-label={`${r.title}: ${uncertain ? neutralLabel : status.label}`}
        valueText={fewDays || mindful ? (uncertain ? neutralLabel : status.label) : `${uncertain ? neutralLabel : status.label}, ${kostradProgressText(r)}`}
      />
      {!mindful && !fewDays && <p className="mt-1.5 text-xs font-medium text-ink-2 tabular-nums">{kostradProgressText(r)}</p>}
      {fewDays ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Ett veckoråd behöver några loggade dagar innan det går att bedöma – logga gärna några dagar till. Rådet räknas inte in i poängen än.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{r.tip}</p>
      )}
      {uncertain && !fewDays && (
        <p className="mt-2 text-xs leading-relaxed text-ink-3">
          Värden saknas för en stor del av maten, så rådet räknas inte in i poängen.
        </p>
      )}
    </article>
  )
}
