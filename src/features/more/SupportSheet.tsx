/**
 * Stöd & hjälp – varma, tydliga vägar till hjälp för den som mår dåligt kring mat, vikt eller alkohol.
 */
import { ExternalLink, HeartHandshake, Phone } from 'lucide-react'
import { Sheet, toneVars, type Tone } from '../../components/ui'

export interface SupportResource {
  id: string
  name: string
  description: string
  href: string
  linkLabel: string
  phone?: { label: string; tel: string }
  emoji: string
  tone: Tone
}

/** Kontrollerade länkar (september 2026). */
export const SUPPORT_RESOURCES: readonly SupportResource[] = [
  {
    id: '1177',
    name: '1177 Vårdguiden',
    description: 'Råd om hälsa och vård dygnet runt. Här hittar du också information om ätstörningar och hur du får kontakt med vården.',
    href: 'https://www.1177.se',
    linkLabel: '1177.se',
    phone: { label: 'Ring 1177', tel: '1177' },
    emoji: '🩺',
    tone: 'fjall',
  },
  {
    id: 'friskfri',
    name: 'Frisk & Fri – Riksföreningen mot ätstörningar',
    description: 'Stöd för dig som har en ätstörning och för anhöriga – bland annat chatt, telefontider, mentorer och stödgrupper. Du kan vara anonym.',
    href: 'https://www.friskfri.se',
    linkLabel: 'friskfri.se',
    emoji: '💚',
    tone: 'mossa',
  },
  {
    id: 'alkoholhjalpen',
    name: 'Alkoholhjälpen',
    description: 'Anonymt och kostnadsfritt stöd via telefon och nätet för dig över 18 år som vill förändra dina alkoholvanor – och för anhöriga.',
    href: 'https://alkoholhjalpen.se',
    linkLabel: 'alkoholhjalpen.se',
    phone: { label: 'Ring 020-84 44 48', tel: '020844448' },
    emoji: '🫶',
    tone: 'vinbar',
  },
]

export function SupportResourceList({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex flex-col gap-3 ${className}`}>
      {SUPPORT_RESOURCES.map((r) => (
        <li key={r.id} style={toneVars(r.tone)} className="rounded-[1.25rem] bg-(--tone-soft) p-4">
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface text-[1.375rem] leading-none">
              {r.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold leading-snug text-ink">{r.name}</h3>
              <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">{r.description}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={r.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-surface px-4 text-[0.875rem] font-semibold text-ink shadow-card transition-colors hover:bg-surface-2"
            >
              {r.linkLabel}
              <ExternalLink aria-hidden className="size-4 text-ink-3" />
              <span className="sr-only">(öppnas i ny flik)</span>
            </a>
            {r.phone && (
              <a
                href={`tel:${r.phone.tel}`}
                className="inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-[0.875rem] font-semibold text-(--tone-ink) ring-1 ring-inset ring-(--tone)/30 transition-colors hover:bg-surface/60"
              >
                <Phone aria-hidden className="size-4" />
                {r.phone.label}
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function SupportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Stöd & hjälp" description="Du är inte ensam – och det finns hjälp att få.">
      <div className="flex items-start gap-3 rounded-[1.25rem] bg-surface-2 p-4">
        <HeartHandshake aria-hidden className="mt-0.5 size-5 shrink-0 text-vinbar" />
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">
          Mat ska ge energi och glädje. Om tankar på mat, vikt eller kropp tar mycket plats, om du äter för lite eller känner att du tappar kontrollen – prata
          med någon. Det är ett styrketecken att söka stöd.
        </p>
      </div>
      <SupportResourceList className="mt-4" />
      <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-3">
        Vid akut fara för liv eller hälsa – ring <a href="tel:112" className="font-semibold text-ink-2 underline underline-offset-2">112</a>.
      </p>
    </Sheet>
  )
}
