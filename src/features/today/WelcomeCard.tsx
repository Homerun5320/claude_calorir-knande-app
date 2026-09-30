/**
 * Välkomstkortet – visas första dagen, innan något har registrerats i dagboken.
 * En stor knapp för första måltiden och två vägar vidare: streckkod och svenska klassiker.
 */
import { memo } from 'react'
import { Link } from 'react-router-dom'
import { ChefHat, ChevronRight, Plus, ScanBarcode, type LucideIcon } from 'lucide-react'
import { Button, Card } from '../../components/ui'
import { mealForTime } from '../../lib/meals'
import type { ISODate, MealConfig } from '../../types'

function Shortcut({ to, icon: Icon, title, text }: { to: string; icon: LucideIcon; title: string; text: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-11 items-center gap-3 rounded-2xl bg-surface/70 p-3 ring-1 ring-line/70 transition-colors ring-inset hover:bg-surface"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gran-soft text-gran" aria-hidden="true">
        <Icon className="size-5" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs leading-snug text-ink-3">{text}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
    </Link>
  )
}

export const WelcomeCard = memo(function WelcomeCard({ today, meals }: { today: ISODate; meals: MealConfig[] }) {
  const meal = mealForTime(meals)
  return (
    <Card tone="gran" padding="lg" eyebrow="Välkommen" title="Din första dag med Lagom">
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        Skriv upp det du äter – så noga som känns lagom för dig. Allt stannar på din enhet, och du kan när som helst ändra dina
        mål.
      </p>
      <Button to={`/lagg-till?maltid=${meal}&datum=${today}`} size="lg" fullWidth iconLeft={Plus} className="mt-5">
        Lägg till din första måltid
      </Button>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Shortcut to="/skanna" icon={ScanBarcode} title="Skanna en streckkod" text="Hämta näringsvärden direkt från förpackningen" />
        <Shortcut to="/recept" icon={ChefHat} title="Utforska svenska klassiker" text="Köttbullar, pyttipanna, kanelbullar och mer" />
      </div>
    </Card>
  )
})
