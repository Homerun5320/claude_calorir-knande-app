/**
 * Inställningar → Påminnelser: frivilliga lokala notiser i apparna för iPhone och Android –
 * måltider (egen tid per måltid), vatten under dagen, när fastan är klar, en säkerhetskopia i
 * veckan och veckans fokus på måndagen.
 *
 * - Allt är avstängt från början. Behörigheten för notiser frågas först när användaren slår på en
 *   påminnelse. Blir svaret nej finns valet kvar, och sidan förklarar var notiserna slås på –
 *   påminnelserna kommer då av sig själva så fort notiser är tillåtna.
 * - Schemaläggningen sköts av src/native/reminders.ts, som lämnar en bro (`useReminderBridge`)
 *   när appen startar. Sidan importerar alltså ingen native-kod.
 * - På webben (och i Googles webbskal) visas bara en kort text om att påminnelser finns i apparna.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { Button, Card, ExternalLink, Select, Spinner, Switch, TextField } from '../../../components/ui'
import { MealIcon } from '../../../components/domain/MealIcon'
import { APPSTORE_URL, PLAY_URL } from '../../../config/commerce'
import { isInApp } from '../../../config/platform'
import { plural } from '../../../lib/format'
import { mealName } from '../../../lib/meals'
import { initNative, isNative } from '../../../native'
import { useProfileStore } from '../../../stores/profileStore'
import {
  activeReminderCount,
  isValidTime,
  useReminderBridge,
  useReminderStore,
  waterHours,
  WATER_EVERY_HOURS,
  WATER_FROM_HOURS,
  WATER_TO_HOURS,
  type ReminderBridge,
  type ReminderPermission,
  type ReminderSettings,
} from '../../../stores/reminderStore'
import type { MealConfig, MealId } from '../../../types'
import { Note } from '../../onboarding/AboutFields'

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------

const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/** "a", "a och b", "a, b och c". */
function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} och ${items[items.length - 1]}`
}

const EVERY_LABELS: Readonly<Record<number, string>> = { 1: 'Varje timme', 2: 'Varannan timme', 3: 'Var tredje timme' }

/** Raden under "Påminnelser" i inställningslistan. */
export function remindersSummary(settings: ReminderSettings, meals: readonly MealConfig[], native: boolean = isNative()): string {
  if (!native) return 'Finns i apparna för iPhone och Android'
  const count = activeReminderCount(settings, meals)
  return count === 0 ? 'Av' : `${plural(count, 'påminnelse', 'påminnelser')} på`
}

// ---------------------------------------------------------------------------
// Sidan
// ---------------------------------------------------------------------------

export function RemindersSection() {
  return isNative() ? <NativeReminders /> : <WebReminders />
}

export default RemindersSection

/** Webben: påminnelser (notiser) finns bara i apparna. */
function WebReminders() {
  const links = isInApp()
    ? []
    : [
        { href: APPSTORE_URL, label: 'Lagom i App Store' },
        { href: PLAY_URL, label: 'Lagom i Google Play' },
      ].filter((l): l is { href: string; label: string } => Boolean(l.href))
  return (
    <Card padding="lg">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gran-soft text-gran">
          <Bell className="size-5" strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[1.25rem] leading-tight font-semibold tracking-tight text-ink">Påminnelser finns i apparna</h2>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
            I Lagoms appar för iPhone och Android kan du slå på frivilliga påminnelser om måltider, vatten, fastan, säkerhetskopian och veckans
            fokus. Webbversionen skickar inga notiser.
          </p>
        </div>
      </div>
      {links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {links.map((l) => (
            <ExternalLink key={l.href} href={l.href} className="inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-semibold text-gran underline underline-offset-2">
              {l.label}
            </ExternalLink>
          ))}
        </div>
      )}
    </Card>
  )
}

/** Apparna: väntar på bron från src/native/reminders.ts (lämnas när appen startar). */
function NativeReminders() {
  const bridge = useReminderBridge((s) => s.bridge)
  const [startFailed, setStartFailed] = useState(false)

  useEffect(() => {
    if (bridge) return
    let alive = true
    // Normalt redan igång (AppShell startar native-delen) – annars väntar vi på starten.
    void initNative().then(() => {
      if (alive && !useReminderBridge.getState().bridge) setStartFailed(true)
    })
    return () => {
      alive = false
    }
  }, [bridge])

  if (bridge) return <ReminderSettingsView bridge={bridge} />
  if (startFailed) {
    return (
      <Card>
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">Påminnelserna gick inte att starta just nu. Stäng appen helt och öppna den igen.</p>
      </Card>
    )
  }
  return (
    <div className="flex justify-center py-10" role="status" aria-busy="true">
      <Spinner />
      <span className="sr-only">Laddar påminnelserna …</span>
    </div>
  )
}

function ReminderSettingsView({ bridge }: { bridge: ReminderBridge }) {
  const mealReminders = useReminderStore((s) => s.meals)
  const water = useReminderStore((s) => s.water)
  const fasting = useReminderStore((s) => s.fasting)
  const backup = useReminderStore((s) => s.backup)
  const focus = useReminderStore((s) => s.focus)
  const setMeal = useReminderStore((s) => s.setMeal)
  const setWater = useReminderStore((s) => s.setWater)
  const setFlag = useReminderStore((s) => s.setFlag)
  const meals = useProfileStore((s) => s.settings.meals)
  const [permission, setPermission] = useState<ReminderPermission | null>(null)
  const [asking, setAsking] = useState(false)

  // Behörigheten kan ändras i telefonens inställningar – läs den igen när appen visas på nytt.
  useEffect(() => {
    let alive = true
    const read = () => {
      void bridge.checkPermission().then((p) => {
        if (alive) setPermission(p)
      })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') read()
    }
    read()
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('resume', read)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('resume', read)
    }
  }, [bridge])

  const count = activeReminderCount({ meals: mealReminders, water, fasting, backup, focus }, meals)

  /** Frågar om lov för notiser – bara när användaren själv slår på något och lov saknas. */
  const askPermission = async () => {
    if (permission === 'granted' || asking) return
    setAsking(true)
    try {
      setPermission(await bridge.requestPermission())
    } finally {
      setAsking(false)
    }
  }
  const whenOn = (on: boolean) => {
    if (on) void askPermission()
  }

  const visibleMeals = meals.filter((m) => m.enabled)

  return (
    <div className="flex flex-col gap-5">
      <p className="px-1 text-[0.9375rem] leading-relaxed text-ink-2">
        Helt frivilligt – slå bara på det som hjälper dig. Påminnelserna skapas här på telefonen och nämner aldrig kalorier eller vikt.
      </p>

      <div aria-live="polite">
        {count > 0 && <PermissionNote permission={permission} asking={asking} platform={bridge.platform} onAsk={() => void askPermission()} />}
      </div>

      <Card eyebrow="Påminnelser" title="Måltider">
        <p className="-mt-1 mb-2 text-[0.875rem] leading-relaxed text-ink-2">En vänlig påminnelse om att logga, när det passar dig. Bara för måltiderna du använder.</p>
        <ul className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line/70">
          {visibleMeals.map((m) => (
            <MealReminderRow
              key={m.id}
              id={m.id}
              name={mealName(meals, m.id)}
              enabled={mealReminders[m.id]?.enabled === true}
              time={mealReminders[m.id]?.time ?? ''}
              onToggle={(on) => {
                setMeal(m.id, { enabled: on })
                whenOn(on)
              }}
              onTime={(time) => setMeal(m.id, { time })}
            />
          ))}
        </ul>
      </Card>

      <Card eyebrow="Påminnelser" title="Vatten">
        <Switch
          label="Påminn om vatten"
          description="Då och då under dagen – en vänlig knuff, inget mer."
          checked={water.enabled}
          onChange={(on) => {
            setWater({ enabled: on })
            whenOn(on)
          }}
        />
        {water.enabled && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Select
              label="Från"
              value={String(water.from)}
              onChange={(v) => setWater({ from: Number(v) })}
              options={WATER_FROM_HOURS.map((h) => ({ value: String(h), label: clock(h) }))}
            />
            <Select
              label="Till"
              value={String(water.to)}
              onChange={(v) => setWater({ to: Number(v) })}
              options={WATER_TO_HOURS.filter((h) => h > water.from).map((h) => ({ value: String(h), label: clock(h) }))}
            />
            <Select
              label="Hur ofta"
              className="col-span-2"
              value={String(water.every)}
              onChange={(v) => setWater({ every: Number(v) })}
              options={WATER_EVERY_HOURS.map((h) => ({ value: String(h), label: EVERY_LABELS[h] ?? `Var ${h}:e timme` }))}
            />
            <p className="col-span-2 text-[0.8125rem] leading-snug text-ink-3">Kl. {listJoin(waterHours(water).map(clock))}.</p>
          </div>
        )}
      </Card>

      <Card eyebrow="Påminnelser" title="Fler påminnelser">
        <div className="flex flex-col gap-3">
          <Switch
            label="När fastan är klar"
            description="En notis när fastetimern når ditt mål."
            checked={fasting}
            onChange={(on) => {
              setFlag('fasting', on)
              whenOn(on)
            }}
          />
          <Switch
            label="Säkerhetskopia"
            description="Söndag kväll, om du inte har sparat någon säkerhetskopia den senaste veckan."
            checked={backup}
            onChange={(on) => {
              setFlag('backup', on)
              whenOn(on)
            }}
          />
          <Switch
            label="Veckans fokus"
            description="En hälsning på måndagsmorgonen om veckans fokus – eller en fråga om du vill välja ett."
            checked={focus}
            onChange={(on) => {
              setFlag('focus', on)
              whenOn(on)
            }}
          />
        </div>
      </Card>

      <p className="px-1 text-[0.8125rem] leading-relaxed text-ink-3">
        Du kan stänga av en påminnelse här när du vill, eller alla notiser från Lagom i telefonens inställningar.
      </p>
    </div>
  )
}

/** Förklaring när notiser inte är tillåtna (eller inte har frågats om) men något är påslaget. */
function PermissionNote({
  permission,
  asking,
  platform,
  onAsk,
}: {
  permission: ReminderPermission | null
  asking: boolean
  platform: 'ios' | 'android'
  onAsk: () => void
}): ReactNode {
  if (permission === 'denied') {
    const where =
      platform === 'android'
        ? 'Öppna telefonens Inställningar, välj Appar → Lagom → Aviseringar och slå på dem.'
        : 'Öppna telefonens Inställningar, leta upp Lagom och slå på Tillåt notiser under Notiser.'
    return (
      <Note tone="sol" icon={BellOff}>
        <p className="font-semibold">Notiser är avstängda för Lagom</p>
        <p className="mt-0.5">{where} Dina val finns kvar här – påminnelserna kommer så fort notiser är tillåtna.</p>
      </Note>
    )
  }
  if (permission === 'prompt') {
    return (
      <Note tone="blabar" icon={BellRing}>
        <p>Lagom behöver lov att visa notiser för att påminnelserna ska synas.</p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={onAsk} disabled={asking}>
          Tillåt notiser
        </Button>
      </Note>
    )
  }
  if (permission === 'unavailable') {
    return (
      <Note tone="sol" icon={BellOff}>
        Påminnelserna går inte att använda just nu. Stäng appen helt och öppna den igen.
      </Note>
    )
  }
  return null
}

function MealReminderRow({
  id,
  name,
  enabled,
  time,
  onToggle,
  onTime,
}: {
  id: MealId
  name: string
  enabled: boolean
  time: string
  onToggle: (on: boolean) => void
  onTime: (time: string) => void
}) {
  // Ett halvt ifyllt klockslag sparas inte – fältet får tillbaka det sparade när det lämnas.
  const [draft, setDraft] = useState(time)
  const [synced, setSynced] = useState(time)
  if (synced !== time) {
    setSynced(time)
    setDraft(time)
  }
  return (
    <li className="flex items-center gap-3 py-2.5">
      <MealIcon meal={id} size="md" className={enabled ? '' : 'opacity-60'} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9375rem] font-medium text-ink">{name}</p>
        {enabled ? (
          <TextField
            type="time"
            label={`Klockslag för ${name}`}
            labelHidden
            value={draft}
            step={300}
            onValueChange={(v) => {
              setDraft(v)
              if (isValidTime(v)) onTime(v)
            }}
            onBlur={() => {
              if (!isValidTime(draft)) setDraft(time)
            }}
            className="mt-1 w-36"
          />
        ) : (
          <p className="text-[0.8125rem] text-ink-3">Av</p>
        )}
      </div>
      <Switch aria-label={`Påminn om ${name}`} checked={enabled} onChange={onToggle} />
    </li>
  )
}
