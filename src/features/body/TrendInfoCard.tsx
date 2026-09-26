/**
 * "Varför trendvikt?" – förklarar att vikten svänger naturligt från dag till dag och att
 * Lagom därför visar trenden. Minskar stressen kring daglig vägning.
 */
import { CalendarDays, Droplets, HeartHandshake, Plus, Sunrise } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Card } from '../../components/ui'

/** Dekorativ minigraf: spretiga vägningar och en lugn trendlinje. */
function TrendArt() {
  const dots = [
    [8, 30], [22, 20], [36, 34], [50, 22], [64, 28], [78, 16], [92, 30], [106, 22], [120, 26], [134, 14], [148, 24], [162, 18],
  ]
  return (
    <svg viewBox="0 0 170 48" className="h-12 w-full max-w-[13rem]" aria-hidden="true">
      <path
        d="M8 28 C 40 26, 60 25, 90 23 S 140 20, 162 19"
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        className="stroke-gran"
      />
      {dots.map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={3} className="fill-ink-3" opacity={0.7} />
      ))}
    </svg>
  )
}

function Tip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-surface/70 text-blabar">
        {icon}
      </span>
      <span className="text-sm leading-relaxed text-ink-2">{children}</span>
    </li>
  )
}

export function TrendInfoCard() {
  return (
    <Card tone="blabar" eyebrow="Bra att veta" title="Varför trendvikt?">
      <TrendArt />
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink">
        Vikten kan svänga 1–2 kg från en dag till nästa – av vätska, salt, kolhydrater, mat i magen, träning och hormoner. Det
        är inte fett som kommer och går.
      </p>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
        Därför visar Lagom en <strong className="font-semibold text-ink">trendvikt</strong> där varje ny vägning bara väger in
        lite. En tung morgon blir aldrig ett bakslag – det är riktningen över veckor som räknas.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        <Tip icon={<Sunrise className="size-4" strokeWidth={2.2} />}>
          Väg dig på morgonen, efter toabesök och före frukost – samma förutsättningar varje gång.
        </Tip>
        <Tip icon={<CalendarDays className="size-4" strokeWidth={2.2} />}>
          Du behöver inte väga dig varje dag. Två–tre gånger i veckan räcker för en tydlig trend.
        </Tip>
        <Tip icon={<Droplets className="size-4" strokeWidth={2.2} />}>
          Salt mat, mycket kolhydrater eller ett hårt träningspass kan ge några hekto extra vätska dagen efter. Det går över.
        </Tip>
        <Tip icon={<HeartHandshake className="size-4" strokeWidth={2.2} />}>
          Känns vägningen jobbig? Ta gärna en paus, eller slå på{' '}
          <Link to="/installningar" className="font-semibold text-(--tone-ink) underline underline-offset-2">
            medvetet läge
          </Link>{' '}
          så döljs siffrorna.
        </Tip>
      </ul>

      <details className="group mt-4 rounded-2xl bg-surface/60 px-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          Så räknas trenden
          <Plus aria-hidden className="size-4 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-45" strokeWidth={2.4} />
        </summary>
        <p className="pb-3 text-sm leading-relaxed text-ink-2">
          Trendvikten är ett exponentiellt glidande medelvärde: varje dag flyttas trenden en tiondel av vägen mot dagens vikt.
          Dagar utan vägning fylls i jämnt mellan mätningarna. Metoden kommer från boken <em>The Hacker’s Diet</em> och används
          i många viktappar.
        </p>
      </details>
    </Card>
  )
}
