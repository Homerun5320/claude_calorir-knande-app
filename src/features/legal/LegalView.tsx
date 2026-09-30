/**
 * Gemensam vy för de juridiska sidorna (integritetspolicy och villkor): sidhuvud med versionsdatum,
 * ett kort per avsnitt och länkar vidare. Texterna finns i legalContent.ts.
 */
import { Fragment, useId } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ExternalLink, PageHeader } from '../../components/ui'
import { INTERNAL_LINKS, formatLegalDate, parseInline, type LegalSection } from './legalContent'
import type { ISODate } from '../../types'

const LINK = 'font-semibold text-gran underline underline-offset-2'

/** Löptext med länkar (`[text](adress)`). Interna länkar går via routern. */
export function LegalText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) => {
        if (!part.href) return <Fragment key={i}>{part.text}</Fragment>
        const internal = INTERNAL_LINKS[part.href]
        if (internal) {
          return (
            <Link key={i} to={internal} className={LINK}>
              {part.text}
            </Link>
          )
        }
        return (
          <ExternalLink key={i} href={part.href} className={LINK}>
            {part.text}
          </ExternalLink>
        )
      })}
    </>
  )
}

function Paragraphs({ list }: { list: readonly string[] | undefined }) {
  if (!list || list.length === 0) return null
  return (
    <>
      {list.map((t) => (
        <p key={t} className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
          <LegalText text={t} />
        </p>
      ))}
    </>
  )
}

/**
 * Tabellen (lagringen på enheten) som kort per rad – fem kolumner får inte plats på en telefon.
 * Varje rad blir en rubrik och en beskrivningslista, så att skärmläsare läser kolumnnamnen.
 */
function TableCards({ columns, rows }: { columns: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row[0]} className="rounded-2xl bg-surface-2 p-3.5">
          <h3 className="text-[0.9375rem] font-semibold leading-snug text-ink">{row[0]}</h3>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[0.8125rem] leading-snug sm:grid-cols-[auto_1fr]">
            {columns.slice(1).map((col, i) => (
              <div key={col} className="contents">
                <dt className="font-semibold text-ink-3">{col}</dt>
                <dd className="-mt-1 text-ink-2 sm:mt-0">{row[i + 1]}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  )
}

export function LegalSectionCard({ section }: { section: LegalSection }) {
  const headingId = useId()
  const items = [...(section.items ?? []), ...(section.webItems ?? []), ...(section.keyItems ?? [])]
  return (
    <section aria-labelledby={headingId} className="card p-5">
      <h2 id={headingId} className="font-display text-[1.1875rem] font-semibold leading-snug tracking-tight text-ink">
        {section.heading}
      </h2>
      <Paragraphs list={section.paragraphs} />
      <Paragraphs list={section.webParagraphs} />
      {section.steps && section.steps.length > 0 && (
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[0.9375rem] leading-relaxed text-ink-2 marker:font-semibold marker:text-gran">
          {section.steps.map((t) => (
            <li key={t}>
              <LegalText text={t} />
            </li>
          ))}
        </ol>
      )}
      {items.length > 0 && (
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[0.9375rem] leading-relaxed text-ink-2 marker:text-ink-3">
          {items.map((t) => (
            <li key={t}>
              <LegalText text={t} />
            </li>
          ))}
        </ul>
      )}
      {section.table && <TableCards columns={section.table.columns} rows={section.table.rows} />}
      <Paragraphs list={section.closing} />
    </section>
  )
}

export interface LegalDocumentProps {
  title: string
  version: ISODate
  intro?: string
  sections: readonly LegalSection[]
  /** Länkar längst ned, t.ex. till de andra villkoren. */
  related: ReadonlyArray<{ to: string; label: string }>
}

export function LegalDocument({ title, version, intro, sections, related }: LegalDocumentProps) {
  return (
    <div className="px-4 pb-10">
      <PageHeader back title={title} compactTitle={title} subtitle={`Version ${version} · gäller från ${formatLegalDate(version)}`} />
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {intro && <p className="px-1 text-[0.9375rem] leading-relaxed text-ink-2">{intro}</p>}
        {sections.map((s) => (
          <LegalSectionCard key={s.id} section={s} />
        ))}
        <nav aria-label="Mer att läsa" className="card flex flex-col p-1.5">
          {related.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-[0.9375rem] font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              {r.label}
              <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
