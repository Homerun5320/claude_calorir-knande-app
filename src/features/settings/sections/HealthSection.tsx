/**
 * Inställningar → Apple Hälsa (iPhone) / Health Connect (Android): en frivillig koppling som är
 * avstängd från början.
 *
 * - Användaren väljer per datatyp vad Lagom får hämta (vikt, steg) och skicka (energi från
 *   måltider, vatten, vikt). Behörigheten frågas först när kopplingen slås på – eller när en
 *   datatyp slås på medan den är på – och systemets eget ark låter användaren välja bort enskilda delar.
 * - Steg fylls i under Träning; steg utöver vardagen lägger användaren själv till. Aktiv energi
 *   läses inte (den skulle bara kunna visas som en siffra – behörigheterna hålls minimala).
 * - Mat och vatten skickas för avslutade dagar (i går och bakåt), inte för dagen som pågår.
 * - Allt läses och skrivs på telefonen. Sidan säger det, och länkar till integritetspolicyn.
 * - Logiken finns i src/native/health.ts och laddas med `loadNative('health')` – sidan importerar
 *   ingen native-kod. På webben (och i Googles webbskal) visas bara att funktionen finns i apparna.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, HeartPulse, RefreshCw, Settings2, Unplug } from 'lucide-react'
import { Button, Card, confirmDialog, ExternalLink, Spinner, Stat, Switch, toast } from '../../../components/ui'
import { APPSTORE_URL, PLAY_URL } from '../../../config/commerce'
import { isInApp } from '../../../config/platform'
import { nowTime, relativeDayLabel, todayISO, toISODate } from '../../../lib/dates'
import { formatNumber, plural } from '../../../lib/format'
import { isNative, loadNative, nativePlatform, type NativeModule, type NativePlatform } from '../../../native'
import { Note } from '../../onboarding/AboutFields'

type HealthApi = NativeModule<'health'>
type HealthSnapshot = ReturnType<HealthApi['getHealthSnapshot']>
type HealthChoice = keyof HealthSnapshot['choices']
type HealthAvailability = Awaited<ReturnType<HealthApi['checkHealthAvailability']>>
type HealthSummary = NonNullable<HealthSnapshot['lastResult']>

/** Health Connect i Google Play (Android 9–13 har det som en egen app). */
export const HEALTH_CONNECT_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata'

// ---------------------------------------------------------------------------
// Texter
// ---------------------------------------------------------------------------

/** "Apple Hälsa" på iPhone, "Health Connect" på Android – rubriken i inställningslistan. */
export function healthServiceName(platform: NativePlatform = nativePlatform()): string {
  if (platform === 'ios') return 'Apple Hälsa'
  if (platform === 'android') return 'Health Connect'
  return 'Apple Hälsa och Health Connect'
}

/** "a", "a och b", "a, b och c" (eller med "eller"). */
function listJoin(items: readonly string[], word = 'och'): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`
}

/** Notisen efter en synk – antal, aldrig kalorier eller vikter. */
export function healthSyncText(summary: Pick<HealthSummary, 'weights' | 'stepDays' | 'kcal' | 'waterMl' | 'sentWeights'>): string {
  const parts: string[] = []
  if (summary.weights > 0) parts.push(plural(summary.weights, 'ny vikt', 'nya vikter'))
  if (summary.stepDays > 0) parts.push(plural(summary.stepDays, 'dag med steg', 'dagar med steg'))
  if (summary.kcal > 0 || summary.waterMl > 0 || summary.sentWeights > 0) parts.push('det senaste från dagboken')
  return parts.length === 0 ? 'Synkat – allt var redan uppdaterat' : `Synkat: ${listJoin(parts)}`
}

interface ChoiceRow {
  choice: HealthChoice
  label: string
  /** Kort namn i meningen om saknad behörighet ("Lagom får inte läsa vikt …"). */
  short: string
  description: (name: string) => string
}

const READ_ROWS: readonly ChoiceRow[] = [
  {
    choice: 'readWeight',
    label: 'Vikt',
    short: 'vikt',
    description: () => 'Nya vägningar, till exempel från en smart våg, hamnar i din viktkurva – en per dag. En vikt du själv har loggat i Lagom skrivs aldrig över.',
  },
  {
    choice: 'readSteps',
    label: 'Steg',
    short: 'steg',
    description: () => 'Dagens steg fylls i under Träning. Steg utöver din vanliga vardag kan du lägga till som aktivitet – de räknas inte in av sig själva.',
  },
]

const WRITE_ROWS: readonly ChoiceRow[] = [
  { choice: 'writeEnergy', label: 'Energi från måltider', short: 'energi', description: () => 'Summan av det du äter och dricker i dagboken.' },
  { choice: 'writeWater', label: 'Vatten', short: 'vatten', description: () => 'Glasen du fyller på i Lagom.' },
  {
    choice: 'writeWeight',
    label: 'Vikt från Lagom',
    short: 'vikt',
    description: (name) => `Vikter du själv loggar i Lagom – inte de som har hämtats från ${name}.`,
  },
]

const ROWS = [...READ_ROWS, ...WRITE_ROWS]
const isRead = (choice: HealthChoice) => READ_ROWS.some((r) => r.choice === choice)

/** "Lagom får inte läsa vikt eller steg och inte skriva vatten." */
export function missingText(missing: readonly HealthChoice[]): string {
  const shortOf = (c: HealthChoice) => ROWS.find((r) => r.choice === c)?.short ?? c
  const reads = missing.filter(isRead).map(shortOf)
  const writes = missing.filter((c) => !isRead(c)).map(shortOf)
  const parts = [reads.length > 0 ? `läsa ${listJoin(reads, 'eller')}` : '', writes.length > 0 ? `skriva ${listJoin(writes, 'eller')}` : ''].filter(Boolean)
  return `Lagom får inte ${parts.join(' och inte ')}.`
}

/** Vägen till Lagoms behörigheter i Hälsa-appen (appen kan inte öppna den direkt på iPhone). */
const IOS_PATH_TAIL = 'tryck på din profilbild uppe till höger och välj Appar → Lagom'
const IOS_SETTINGS_PATH = `Öppna Hälsa-appen, ${IOS_PATH_TAIL}.`

/** Raden i inställningslistan: "Av", "På" eller "På · synkad idag". */
export function healthRowText(snap: Pick<HealthSnapshot, 'enabled' | 'lastSync'>, today: string = todayISO()): string {
  if (!snap.enabled) return 'Av'
  if (snap.lastSync === null) return 'På'
  return `På · synkad ${relativeDayLabel(toISODate(new Date(snap.lastSync)), today).toLocaleLowerCase('sv-SE')}`
}

/**
 * Undertexten för raden i inställningslistan (SettingsPage). Laddar kopplingen bara i apparna och
 * följer den; på webben "Finns i apparna för iPhone och Android".
 */
export function useHealthRowSubtitle(): string {
  const [text, setText] = useState(() => (isNative() ? '' : 'Finns i apparna för iPhone och Android'))
  useEffect(() => {
    if (!isNative()) return
    let alive = true
    let unsubscribe: (() => void) | undefined
    void loadNative('health').then((api) => {
      if (!alive || !api) return
      const update = () => setText(healthRowText(api.getHealthSnapshot()))
      update()
      unsubscribe = api.subscribeHealth(update)
    })
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])
  return text
}

// ---------------------------------------------------------------------------
// Sidan
// ---------------------------------------------------------------------------

export function HealthSection() {
  return isNative() ? <NativeHealth /> : <WebHealth />
}

export default HealthSection

/** Webben: kopplingen finns bara i apparna. */
function WebHealth() {
  const links = isInApp()
    ? []
    : [
        { href: APPSTORE_URL, label: 'Lagom i App Store' },
        { href: PLAY_URL, label: 'Lagom i Google Play' },
      ].filter((l): l is { href: string; label: string } => Boolean(l.href))
  return (
    <Card padding="lg">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-lingon-soft text-lingon">
          <HeartPulse className="size-5" strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[1.25rem] leading-tight font-semibold tracking-tight text-ink">Apple Hälsa och Health Connect finns i apparna</h2>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
            I Lagoms appar för iPhone och Android kan du, om du vill, hämta vikt och steg från Apple Hälsa eller Health Connect och skicka det du äter och
            dricker dit. Webbversionen kan inte nå hälsodata på telefonen.
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

/** Apparna: laddar kopplingen (src/native/health.ts). */
function NativeHealth() {
  // undefined = laddas, null = gick inte att ladda.
  const [api, setApi] = useState<HealthApi | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void loadNative('health').then((m) => {
      if (alive) setApi(m)
    })
    return () => {
      alive = false
    }
  }, [])

  if (api === undefined) {
    return (
      <div className="flex justify-center py-10" role="status" aria-busy="true">
        <Spinner />
        <span className="sr-only">Laddar …</span>
      </div>
    )
  }
  if (api === null) {
    return (
      <Card>
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">Kopplingen gick inte att starta just nu. Stäng appen helt och öppna den igen.</p>
      </Card>
    )
  }
  return <HealthView api={api} />
}

function HealthView({ api }: { api: HealthApi }) {
  const snap = useSyncExternalStore(api.subscribeHealth, api.getHealthSnapshot)
  const platform = nativePlatform() === 'android' ? 'android' : 'ios'
  const name = healthServiceName(platform)
  const [availability, setAvailability] = useState<HealthAvailability | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [notice, setNotice] = useState<ReactNode>(null)

  // Tillgängligheten kan ändras medan appen är i bakgrunden (t.ex. Health Connect installeras).
  useEffect(() => {
    let alive = true
    const check = () => {
      void api.checkHealthAvailability().then((a) => {
        if (alive) setAvailability(a)
      })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api])

  const unavailable = availability === 'saknas' || availability === 'uppdatera' ? availability : null
  const anyChosen = ROWS.some((r) => snap.choices[r.choice])

  const connect = async () => {
    if (connecting) return
    setConnecting(true)
    setNotice(null)
    try {
      const result = await api.connectHealth()
      if (result.ok) {
        toast(`Kopplat till ${name}`, { tone: 'success' })
        return
      }
      if (result.reason === 'saknas' || result.reason === 'uppdatera') setAvailability(result.reason)
      else if (result.reason === 'nekad') {
        setNotice(
          <Note tone="sol">
            Lagom fick inte lov att läsa eller skriva något, så kopplingen är avstängd.{' '}
            {platform === 'ios'
              ? `Vill du ändra dig: ${IOS_SETTINGS_PATH}`
              : 'Vill du ändra dig: tryck på Koppla till Health Connect igen, eller ge lov under Öppna Health Connect nedan.'}
          </Note>,
        )
      } else if (result.reason === 'fel') {
        setNotice(<Note tone="sol">Det gick inte att koppla till {name} just nu. Försök igen om en stund.</Note>)
      }
    } finally {
      setConnecting(false)
    }
  }

  const toggle = async (choice: HealthChoice, on: boolean) => {
    const result = await api.setHealthChoice(choice, on)
    if (!result.ok && result.reason === 'fel') toast('Det gick inte att fråga om lov just nu – försök igen om en stund', { tone: 'error' })
  }

  const syncNow = async () => {
    const summary = await api.syncHealth()
    if (summary) toast(healthSyncText(summary), { tone: 'success' })
  }

  const disconnect = async () => {
    const ok = await confirmDialog({
      title: `Koppla från ${name}?`,
      message: `Lagom slutar hämta från och skicka till ${name}. Det som redan har hämtats finns kvar i Lagom, och det som har skickats finns kvar i ${name}.`,
      confirmLabel: 'Koppla från',
    })
    if (!ok) return
    api.disconnectHealth()
    toast(`Lagom är inte längre kopplad till ${name}`)
  }

  const openSettings = async () => {
    const opened = await api.openHealthSettings()
    if (!opened) toast('Health Connect gick inte att öppna – leta upp det i telefonens Inställningar', { tone: 'error' })
  }

  const choiceSwitch = (row: ChoiceRow) => (
    <Switch
      key={row.choice}
      label={row.label}
      description={row.description(name)}
      checked={snap.choices[row.choice]}
      onChange={(on) => void toggle(row.choice, on)}
    />
  )

  return (
    <div className="flex flex-col gap-5">
      <p className="px-1 text-[0.9375rem] leading-relaxed text-ink-2">
        Helt frivilligt och avstängt från början. Välj vad Lagom får hämta från och skicka till {name}. Allt sker här på telefonen – ingenting skickas
        till oss eller någon annan.
      </p>

      <div aria-live="polite" className="flex flex-col gap-3 empty:-mt-5">
        {unavailable && <AvailabilityNote availability={unavailable} platform={platform} />}
        {!unavailable && snap.enabled && <ProblemNote problem={snap.problem} name={name} />}
        {!unavailable && snap.enabled && snap.missing.length > 0 && (
          <MissingNote missing={snap.missing} platform={platform} onAsk={() => void api.requestMissingHealthAccess()} onOpen={() => void openSettings()} />
        )}
        {notice}
      </div>

      {snap.enabled && (
        <Card padding="lg">
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mossa-soft text-mossa">
              <CheckCircle2 className="size-5" strokeWidth={2.1} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[1.25rem] leading-tight font-semibold tracking-tight text-ink">Kopplad till {name}</h2>
              <p className="mt-1 text-[0.875rem] leading-snug text-ink-2">{syncLine(snap)}</p>
            </div>
          </div>
          {snap.today?.steps !== undefined && (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-2">
                <Stat size="sm" label="Steg idag" value={formatNumber(snap.today.steps)} />
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" iconLeft={RefreshCw} loading={snap.syncing} onClick={() => void syncNow()}>
              Synka nu
            </Button>
            <Button variant="ghost" iconLeft={Unplug} onClick={() => void disconnect()}>
              Koppla från
            </Button>
          </div>
        </Card>
      )}

      <Card eyebrow="Hämta" title={`Från ${name}`}>
        <div className="flex flex-col gap-3">{READ_ROWS.map(choiceSwitch)}</div>
      </Card>

      <Card eyebrow="Skicka" title={`Till ${name}`}>
        <div className="flex flex-col gap-3">{WRITE_ROWS.map(choiceSwitch)}</div>
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
          Mat och vatten skickas dagen efter, när dagen är avslutad, och vikter för den senaste veckan – men inget från tiden före kopplingen.
          Tar du bort något i efterhand ligger det kvar i {name}, där du kan ändra det.
        </p>
      </Card>

      {!snap.enabled && (
        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth iconLeft={HeartPulse} loading={connecting} disabled={!anyChosen || unavailable !== null} onClick={() => void connect()}>
            Koppla till {name}
          </Button>
          <p className="px-1 text-[0.8125rem] leading-relaxed text-ink-3">
            {anyChosen
              ? `${platform === 'ios' ? 'Din iPhone' : 'Health Connect'} frågar sedan vad Lagom får läsa och skriva – där kan du välja bort enskilda delar också.`
              : 'Välj minst en sak att hämta eller skicka.'}
          </p>
        </div>
      )}

      <Card eyebrow="Integritet" title="Din data stannar på telefonen">
        <p className="text-[0.875rem] leading-relaxed text-ink-2">
          Lagom läser och skriver direkt i {name} här på telefonen. Det som hämtas sparas i din dagbok som allt annat – Lagom har ingen server med
          hälsodata och delar inget vidare.{' '}
          <Link to="/integritet" className="font-semibold text-gran underline underline-offset-2">
            Läs mer i integritetspolicyn
          </Link>
          .
        </p>
        {platform === 'ios' ? (
          <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-2">
            Vad Lagom får läsa och skriva ändrar du i Hälsa-appen: {IOS_PATH_TAIL}. Hämtas inget? Kontrollera att Lagom får läsa där – av
            integritetsskäl kan appen inte se det själv.
          </p>
        ) : (
          <>
            <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-2">
              I Health Connect ser och ändrar du vad Lagom får läsa och skriva, och kan ta bort det som har sparats där.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" iconLeft={Settings2} onClick={() => void openSettings()}>
              Öppna Health Connect
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}

/** "Senast synkad idag kl. 14:32". */
function syncLine(snap: HealthSnapshot): string {
  if (snap.syncing) return 'Synkar …'
  if (snap.lastSync === null) return 'Inte synkad ännu.'
  const d = new Date(snap.lastSync)
  return `Senast synkad ${relativeDayLabel(toISODate(d), todayISO()).toLocaleLowerCase('sv-SE')} kl. ${nowTime(d)}.`
}

function AvailabilityNote({ availability, platform }: { availability: 'saknas' | 'uppdatera'; platform: 'ios' | 'android' }) {
  if (availability === 'uppdatera') {
    return (
      <Note tone="sol">
        <p className="font-semibold">Health Connect behöver installeras eller uppdateras</p>
        <p className="mt-0.5">På Android 13 och äldre är Health Connect en egen app. Installera eller uppdatera den och kom sedan tillbaka hit.</p>
        <ExternalLink href={HEALTH_CONNECT_PLAY_URL} className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-gran underline underline-offset-2">
          Health Connect i Google Play
        </ExternalLink>
      </Note>
    )
  }
  return (
    <Note tone="sol">
      {platform === 'ios'
        ? 'Apple Hälsa finns inte på den här enheten.'
        : 'Health Connect finns inte på den här telefonen – det kräver Android 9 eller senare.'}
    </Note>
  )
}

function ProblemNote({ problem, name }: { problem: HealthSnapshot['problem']; name: string }): ReactNode {
  if (problem === 'fel') {
    return <Note tone="sol">Senaste synken gick inte hela vägen. Lagom försöker igen nästa gång du öppnar appen, eller tryck på Synka nu.</Note>
  }
  if (problem === 'provperiod') {
    return (
      <Note tone="blabar">
        Nya vikter hämtas bara under provperioden eller med en licens. Steg och det du skickar till {name} fungerar som vanligt.{' '}
        <Link to="/installningar/licens" className="font-semibold text-gran underline underline-offset-2">
          Till Licens
        </Link>
      </Note>
    )
  }
  if (problem === 'exempel') {
    return <Note tone="blabar">Exempeldata synkas inte. Kopplingen börjar när du har skapat din egen profil.</Note>
  }
  return null
}

function MissingNote({
  missing,
  platform,
  onAsk,
  onOpen,
}: {
  missing: readonly HealthChoice[]
  platform: 'ios' | 'android'
  onAsk: () => void
  onOpen: () => void
}) {
  return (
    <Note tone="sol">
      <p>{missingText(missing)}</p>
      {platform === 'ios' ? (
        <p className="mt-0.5">{IOS_SETTINGS_PATH} Slå på det du vill, eller stäng av valet här.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onAsk}>
            Ge lov
          </Button>
          <Button size="sm" variant="ghost" iconLeft={Settings2} onClick={onOpen}>
            Öppna Health Connect
          </Button>
        </div>
      )}
    </Note>
  )
}
