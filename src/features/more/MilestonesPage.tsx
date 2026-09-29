/**
 * Milstolpar (/mer/milstolpar) – små glädjeämnen längs vägen: det man har uppnått (med datum) och
 * några som kan komma längre fram, utan förloppsstaplar, räknare eller press. Dagar räknas totalt,
 * aldrig i följd, och inget handlar om vikt eller kalorier – därför fungerar sidan likadant i
 * medvetet läge. Reglaget "Visa milstolpar" döljer dem helt (inget firas, inget visas i Mer).
 *
 * Beräkningen finns i `lib/milestones.ts`, firandet i `useMilestoneCelebration.ts`.
 */
import { motion, useReducedMotion } from 'motion/react'
import {
  Bookmark,
  CalendarCheck,
  CalendarDays,
  Carrot,
  ChefHat,
  Coffee,
  Droplets,
  Footprints,
  Milestone,
  Smile,
  Sprout,
  Trees,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import { Card, PageHeader, SectionTitle, Switch, toneVars, type AccentTone } from '../../components/ui'
import { useToday } from '../../hooks/useToday'
import { formatMilestoneDate, type MilestoneDef, type MilestoneId, type MilestoneStatus } from '../../lib/milestones'
import { useProfileStore } from '../../stores/profileStore'
import { useMilestones } from './useMilestoneCelebration'

/** Ikon och naturfärg per milstolpe. */
const MILESTONE_LOOK: Record<MilestoneId, { icon: LucideIcon; tone: AccentTone }> = {
  'forsta-maltiden': { icon: Utensils, tone: 'gran' },
  'forsta-vattenmalet': { icon: Droplets, tone: 'fjall' },
  'dagar-10': { icon: CalendarCheck, tone: 'mossa' },
  'forsta-receptet': { icon: ChefHat, tone: 'hjortron' },
  'forsta-veckoplaneringen': { icon: CalendarDays, tone: 'mossa' },
  'forsta-fikan': { icon: Coffee, tone: 'sol' },
  'forsta-livsmedlet': { icon: Carrot, tone: 'lingon' },
  'forsta-sparade-maltiden': { icon: Bookmark, tone: 'blabar' },
  'forsta-rorelsen': { icon: Footprints, tone: 'lingon' },
  'forsta-reflektionen': { icon: Smile, tone: 'vinbar' },
  'dagar-50': { icon: Sprout, tone: 'mossa' },
  'dagar-100': { icon: Trees, tone: 'gran' },
}

function AchievedItem({ status, today, index }: { status: MilestoneStatus; today: string; index: number }) {
  const reduce = useReducedMotion()
  const look = MILESTONE_LOOK[status.def.id]
  const Icon = look.icon
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : Math.min(index, 8) * 0.04, type: 'spring', stiffness: 320, damping: 32 }}
      className="card flex items-start gap-3.5 p-4"
    >
      <span style={toneVars(look.tone)} aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-(--tone-soft) text-(--tone)">
        <Icon className="size-[1.3rem]" strokeWidth={2.1} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[1.0625rem] font-semibold leading-snug tracking-tight text-ink">{status.def.title}</h3>
        <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-2">{status.def.description}</p>
        {status.date && (
          <p className="mt-1.5 text-[0.8125rem] text-ink-3">
            <time dateTime={status.date}>{formatMilestoneDate(status.date, today)}</time>
          </p>
        )}
      </div>
    </motion.li>
  )
}

function UpcomingItem({ def }: { def: MilestoneDef }) {
  const Icon = MILESTONE_LOOK[def.id].icon
  return (
    <li className="flex items-start gap-3.5 rounded-card p-4 ring-1 ring-inset ring-line">
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-3">
        <Icon className="size-[1.3rem]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[1.0625rem] font-semibold leading-snug tracking-tight text-ink-2">{def.title}</h3>
        <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-3">{def.description}</p>
      </div>
    </li>
  )
}

export default function MilestonesPage() {
  const today = useToday()
  const hidden = useProfileStore((s) => s.settings.hideMilestones === true)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const { achieved, upcoming } = useMilestones(today)

  return (
    <div className="px-4 pb-8">
      <PageHeader back title="Milstolpar" subtitle="Små glädjeämnen längs vägen – i din egen takt." />

      <div className="flex flex-col gap-6">
        <Card padding="md">
          <Switch
            label="Visa milstolpar"
            description="Firas med en liten notis och konfetti första gången. Stäng av om du hellre är utan."
            checked={!hidden}
            onChange={(on) => updateSettings({ hideMilestones: !on })}
          />
        </Card>

        {hidden ? (
          <Card variant="flat" padding="md">
            <div className="flex items-start gap-3">
              <Milestone aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-3" />
              <p className="text-[0.9375rem] leading-relaxed text-ink-2">
                Milstolparna är dolda. Inget firas och de syns inte under Mer – slå på reglaget om du vill se dem igen.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <section aria-labelledby="milstolpar-uppnadda">
              <SectionTitle id="milstolpar-uppnadda">Uppnådda</SectionTitle>
              {achieved.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {achieved.map((s, i) => (
                    <AchievedItem key={s.def.id} status={s} today={today} index={i} />
                  ))}
                </ul>
              ) : (
                <Card variant="flat" padding="md">
                  <p className="text-[0.9375rem] leading-relaxed text-ink-2">
                    Här samlas små glädjeämnen längs vägen. Den första dyker upp när du loggar din första måltid – när det passar dig.
                  </p>
                </Card>
              )}
            </section>

            {upcoming.length > 0 && (
              <section aria-labelledby="milstolpar-langre-fram">
                <SectionTitle id="milstolpar-langre-fram" description="Inget att jaga – de kommer när de kommer.">
                  Längre fram
                </SectionTitle>
                <ul className="flex flex-col gap-3">
                  {upcoming.map((def) => (
                    <UpcomingItem key={def.id} def={def} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="px-2 text-center text-[0.8125rem] leading-relaxed text-ink-3">
          Lagom firar det du gör – aldrig vikt eller kalorier. Dagar räknas totalt och inte i följd, så det gör ingenting att hoppa över en dag.
        </p>
      </div>
    </div>
  )
}
