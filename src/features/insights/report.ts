/**
 * "Dela veckorapport" – en kort textsammanfattning av perioden som kan delas via
 * delningsdialogen (Web Share API) eller kopieras till urklipp.
 *
 * I medvetet läge innehåller rapporten inga energisiffror, bara kvalitativa beskrivningar.
 */
import type { Nutrients } from '../../types'
import { formatEnergy, formatNumber, formatNutrient } from '../../lib/format'
import { mindfulAverageLabel, type DaysSummary, type MacroVerdict } from './aggregate'
import type { Period } from './period'

export interface ReportInput {
  period: Period
  summary: DaysSummary
  averages: Nutrients
  targets: { kcal: number; proteinG: number; fiberG: number }
  verdicts: readonly MacroVerdict[]
  unit: 'kcal' | 'kJ'
  mindful: boolean
  /** Kostrådspoäng 0–100 (utelämnas om inga kostråd kunde bedömas). */
  kostradScore?: number
  /** kg CO2e per loggad dag (utelämnas om klimat är avstängt). */
  climateKgPerDay?: number
  /** Valfri rad med en höjdpunkt, t.ex. "Fredagsmys syns på fredagar". */
  highlight?: string
}

export interface Report {
  title: string
  text: string
}

function scoreWord(score: number): string {
  if (score >= 80) return 'riktigt fint'
  if (score >= 60) return 'på god väg'
  if (score >= 40) return 'en bit på väg'
  return 'varje steg räknas'
}

/** Bygg rapporttexten. */
export function buildReport(input: ReportInput): Report {
  const { period, summary, averages, targets, verdicts, unit, mindful } = input
  const title = `Lagom – ${period.phrase}`
  const lines: string[] = [`🌿 ${title} (${period.range})`]

  const days = `${summary.loggedDays} av ${summary.elapsedDays} ${summary.elapsedDays === 1 ? 'dag' : 'dagar'}`
  lines.push(`Loggade dagar: ${days}`)

  if (summary.loggedDays === 0) {
    lines.push('', 'Inget loggat ännu – en ny chans väntar.')
  } else {
    lines.push('')
    if (mindful) {
      const ratio = summary.avgKcal !== undefined && summary.avgBudget ? summary.avgKcal / summary.avgBudget : undefined
      lines.push(`Snittdagen: ${mindfulAverageLabel(ratio).title.toLowerCase()}`)
      const inRange = verdicts.filter((v) => v.status === 'inom').map((v) => v.label.toLowerCase())
      if (inRange.length > 0) lines.push(`Inom NNR:s intervall: ${inRange.join(', ')}`)
    } else {
      lines.push(`Energi: i snitt ${formatEnergy(summary.avgKcal, unit)} per dag (mål ${formatEnergy(targets.kcal, unit)})`)
      lines.push(
        `Protein: ${formatNutrient('protein', averages.protein)} · Fibrer: ${formatNutrient('fiber', averages.fiber)} per dag`,
      )
      if (verdicts.length > 0) {
        lines.push(`Energifördelning: ${verdicts.map((v) => `${v.label.toLowerCase()} ${formatNumber(v.pct)} %`).join(' · ')}`)
      }
    }
    if (input.kostradScore !== undefined) {
      lines.push(
        mindful
          ? `Kostråden: ${scoreWord(input.kostradScore)}`
          : `Kostrådspoäng: ${formatNumber(input.kostradScore)} av 100 (${scoreWord(input.kostradScore)})`,
      )
    }
    if (input.climateKgPerDay !== undefined && !mindful) {
      lines.push(`Klimat: ${formatNumber(input.climateKgPerDay, 1)} kg CO₂e per dag`)
    }
    if (input.highlight) lines.push('', input.highlight)
  }

  lines.push('', 'Skapad med Lagom – svensk kalori- och näringsdagbok.')
  return { title, text: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Delning
// ---------------------------------------------------------------------------

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

export interface ShareEnv {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data?: ShareData) => boolean
  clipboard?: { writeText?: (text: string) => Promise<void> }
}

function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}

/**
 * Dela text med delningsdialogen, eller kopiera till urklipp om dialogen saknas.
 * Returnerar vad som hände så att rätt notis kan visas.
 */
export async function shareText(
  title: string,
  text: string,
  env: ShareEnv | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): Promise<ShareOutcome> {
  const data: ShareData = { title, text }
  if (env && typeof env.share === 'function' && (typeof env.canShare !== 'function' || env.canShare(data))) {
    try {
      await env.share(data)
      return 'shared'
    } catch (err) {
      if (isAbort(err)) return 'cancelled'
    }
  }
  const clipboard = env?.clipboard
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
  return 'failed'
}
