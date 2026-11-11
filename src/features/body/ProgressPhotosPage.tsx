/**
 * Framstegsbilder (/vikt/bilder): rutnät efter datum, jämförelse av två bilder sida vid sida, en
 * bild i taget i ett ark, radering av en eller alla bilder – och ingen delning ut ur appen.
 *
 * - Av som standard (`settings.progressPhotos`). När funktionen är av visas förklaringen och ett
 *   val att slå på den – och, om bilder finns kvar, att radera dem.
 * - Medvetet läge döljer alltid bilderna (det går bara att radera dem). Exempeldata visar inga bilder.
 * - `requireAccess('bild')` före en ny bild. Att titta på och radera bilderna spärras aldrig.
 * - Vid lågt BMI eller för lite energi (`usePhotosPaused`) erbjuds inga nya bilder – bara en varsam
 *   rad med vägarna till stöd. Att titta på och radera går som vanligt.
 * - Bilderna finns bara på enheten (src/lib/progressPhotos.ts) och följer inte med i säkerhetskopian.
 * - Objekt-URL:er släpps när bilden inte längre visas.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Camera, Check, EyeOff, GitCompareArrows, ImageOff, ImagePlus, Trash2 } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Select, Sheet, Skeleton, TextField, confirmDialog, toast, useMediaQuery } from '../../components/ui'
import { storagePlace } from '../../config/platform'
import { useDemoData } from '../../hooks/useDemoData'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useToday } from '../../hooks/useToday'
import { capitalize, diffDays, formatDayLong, formatDayShort, fromISODate, isValidISODate, MONTHS } from '../../lib/dates'
import { formatNumber, plural } from '../../lib/format'
import {
  addProgressPhoto,
  clearCameraCaptures,
  deleteAllProgressPhotos,
  deleteProgressPhoto,
  listProgressPhotos,
  loadProgressPhoto,
  prepareProgressPhoto,
  storeProgressPhoto,
  type PhotoSize,
  type PreparedPhoto,
  type ProgressPhotoMeta,
} from '../../lib/progressPhotos'
import { haptic } from '../../native'
import { useHydrated } from '../../stores/hydration'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import { PhotoCareNote, PhotoPrivacyList, PhotosPausedNote, ProgressPhotosIntro, requirePhotoAccess, usePhotosPaused } from './ProgressPhotosCard'

export default function ProgressPhotosPage() {
  useDocumentTitle('Framstegsbilder')
  const hydrated = useHydrated()
  if (!hydrated) return <PhotosSkeleton />
  return <PhotosContent />
}

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------

/** Laddar bildlistan. `photos` är null tills den är läst; `reload()` läser om den. */
function usePhotoList(skip: boolean) {
  const [photos, setPhotos] = useState<ProgressPhotoMeta[] | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (skip) return
    let active = true
    void listProgressPhotos().then((list) => {
      if (active) setPhotos(list)
    })
    return () => {
      active = false
    }
  }, [skip, version])
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { photos: skip ? [] : photos, reload }
}

/**
 * En objekt-URL för en sparad bild. URL:en släpps när komponenten försvinner eller bilden byts.
 * `missing` är true om bilden inte gick att läsa.
 */
function usePhotoUrl(id: string, size: PhotoSize): { url: string | null; missing: boolean } {
  const key = `${size}:${id}`
  const [state, setState] = useState<{ key: string; url: string | null; missing: boolean } | null>(null)
  useEffect(() => {
    let active = true
    let url: string | null = null
    void loadProgressPhoto(id, size).then((blob) => {
      if (!active) return
      if (!blob) {
        setState({ key, url: null, missing: true })
        return
      }
      url = URL.createObjectURL(blob)
      setState({ key, url, missing: false })
    })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id, size, key])
  return state?.key === key ? { url: state.url, missing: state.missing } : { url: null, missing: false }
}

/** En objekt-URL för en Blob som finns i minnet (förhandsvisningen), släpps automatiskt. */
function useBlobUrl(blob: Blob | null): string | null {
  const [state, setState] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setState({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return blob && state?.blob === blob ? state.url : null
}

/** "September 2026" */
function monthLabel(date: ISODate): string {
  const d = fromISODate(date)
  return `${capitalize(MONTHS[d.getMonth()])} ${d.getFullYear()}`
}

/** Bilderna grupperade per månad, nyaste först. */
function groupByMonth(photos: readonly ProgressPhotoMeta[]): { key: string; label: string; photos: ProgressPhotoMeta[] }[] {
  const groups: { key: string; label: string; photos: ProgressPhotoMeta[] }[] = []
  for (const p of photos) {
    const key = p.date.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.photos.push(p)
    else groups.push({ key, label: monthLabel(p.date), photos: [p] })
  }
  return groups
}

/** "7 veckor", "12 dagar" eller "samma dag" mellan två datum. */
export function timeBetween(a: ISODate, b: ISODate): string {
  const days = Math.abs(diffDays(a, b))
  if (days === 0) return 'Samma dag'
  if (days >= 14) {
    const weeks = Math.round(days / 7)
    return `${plural(weeks, 'vecka', 'veckor')} emellan`
  }
  return `${plural(days, 'dag', 'dagar')} emellan`
}

const photoAlt = (p: ProgressPhotoMeta, today: ISODate) => `Framstegsbild från ${formatDayLong(p.date, today).toLowerCase()}`

// ---------------------------------------------------------------------------
// Sidan
// ---------------------------------------------------------------------------

function PhotosContent() {
  const today = useToday()
  const enabled = useProfileStore((s) => s.settings.progressPhotos === true)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const demo = useDemoData()
  const { photos, reload } = usePhotoList(demo)

  return (
    <div className="px-4 pb-8">
      <PageHeader
        back
        backTo="/vikt"
        backLabel="Vikt & mått"
        title="Framstegsbilder"
        subtitle={`Bara ${storagePlace()} – aldrig i säkerhetskopian eller molnet.`}
      />
      {mindful ? (
        <MindfulContent photos={photos} onDeleted={reload} />
      ) : !enabled ? (
        <DisabledContent photos={photos} onDeleted={reload} />
      ) : (
        <EnabledContent photos={photos} reload={reload} today={today} demo={demo} />
      )}
    </div>
  )
}

/** Medvetet läge: bilderna visas inte, men går alltid att radera. */
function MindfulContent({ photos, onDeleted }: { photos: ProgressPhotoMeta[] | null; onDeleted: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Card padding="none">
        <EmptyState
          titleAs="h2"
          illustration={
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-vinbar-soft text-vinbar">
              <EyeOff className="size-7" strokeWidth={2} aria-hidden />
            </span>
          }
          title="Bilderna vilar i medvetet läge"
          text="I medvetet läge visar Lagom inga framstegsbilder. Vill du se dem igen stänger du av medvetet läge under Inställningar → Utseende och visning."
          action={
            <Button to="/installningar/utseende" variant="soft">
              Till inställningarna
            </Button>
          }
        />
      </Card>
      {photos !== null && photos.length > 0 && <DeleteAllCard count={photos.length} onDeleted={onDeleted} />}
      <PhotoCareNote />
    </div>
  )
}

/** Funktionen är av: förklaringen, och radering om bilder finns kvar sedan tidigare. */
function DisabledContent({ photos, onDeleted }: { photos: ProgressPhotoMeta[] | null; onDeleted: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Card title="Så fungerar det" eyebrow="Valfritt">
        <ProgressPhotosIntro />
      </Card>
      {photos !== null && photos.length > 0 && <DeleteAllCard count={photos.length} onDeleted={onDeleted} />}
    </div>
  )
}

function DeleteAllCard({ count, onDeleted }: { count: number; onDeleted: () => void }) {
  return (
    <Card title="Sparade bilder" titleAs="h2">
      <p className="text-[0.875rem] leading-relaxed text-ink-2">
        Det finns {plural(count, 'sparad bild', 'sparade bilder')} {storagePlace()}. De visas inte nu, men ligger kvar tills du raderar dem.
      </p>
      <div className="mt-3">
        <DeleteAllButton count={count} onDeleted={onDeleted} />
      </div>
    </Card>
  )
}

function DeleteAllButton({ count, onDeleted }: { count: number; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Radera alla bilder?',
      message: `${count === 1 ? 'Bilden' : `Alla ${formatNumber(count)} bilder`} tas bort ${storagePlace()}. Det går inte att ångra.`,
      tone: 'danger',
      confirmLabel: 'Radera alla',
      icon: Trash2,
    })
    if (!ok) return
    setBusy(true)
    const done = await deleteAllProgressPhotos()
    setBusy(false)
    onDeleted()
    if (done) toast(count === 1 ? 'Bilden är raderad' : 'Alla bilder är raderade')
    else toast('Alla bilder gick inte att radera. Försök igen om en stund.', { tone: 'error' })
  }
  return (
    <Button variant="outline" iconLeft={Trash2} onClick={remove} loading={busy}>
      Radera alla bilder
    </Button>
  )
}

function EnabledContent({
  photos,
  reload,
  today,
  demo,
}: {
  photos: ProgressPhotoMeta[] | null
  reload: () => void
  today: ISODate
  demo: boolean
}) {
  const [viewing, setViewing] = useState<ProgressPhotoMeta | null>(null)
  const groups = useMemo(() => groupByMonth(photos ?? []), [photos])
  const paused = usePhotosPaused()

  // Städa bort originalbilder som kameran kan ha lämnat kvar (Android-appen, t.ex. om appen stängdes
  // mitt i en bild). No-op på webben.
  useEffect(() => {
    void clearCameraCaptures()
  }, [])

  const turnOff = () => {
    useProfileStore.getState().updateSettings({ progressPhotos: false })
    toast(photos && photos.length > 0 ? 'Framstegsbilder är avstängda. Bilderna finns kvar tills du raderar dem.' : 'Framstegsbilder är avstängda')
  }

  return (
    <div className="flex flex-col gap-4">
      {paused ? <PhotosPausedNote /> : <AddPhoto today={today} onSaved={reload} />}

      {demo && (
        <p className="rounded-2xl bg-surface-2 p-3.5 text-[0.8125rem] leading-relaxed text-ink-2">
          Exempeldata visar inga bilder. Framstegsbilder sparas bara för din egen profil.
        </p>
      )}

      {photos === null ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="status" aria-busy="true">
          <span className="sr-only">Laddar bilderna …</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-2xl" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        paused ? null : (
          <Card padding="none">
            <EmptyState
              titleAs="h2"
              illustration={
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-gran-soft text-gran">
                  <Camera className="size-7" strokeWidth={2} aria-hidden />
                </span>
              }
              title="Inga bilder ännu"
              text="Tips: ta bilden på samma plats, i samma ljus och med liknande kläder varje gång – till exempel en gång i månaden. Då blir jämförelsen rättvis."
            />
          </Card>
        )
      ) : (
        <>
          {photos.length >= 2 && (
            // Ny nyckel när den äldsta eller nyaste bilden ändras – då börjar jämförelsen om med dem.
            <CompareCard key={`${photos[photos.length - 1].id}-${photos[0].id}`} photos={photos} today={today} />
          )}
          <section aria-labelledby="alla-bilder" className="flex flex-col gap-3">
            <h2 id="alla-bilder" className="font-display text-xl text-ink">
              Alla bilder
            </h2>
            {groups.map((g) => (
              <div key={g.key}>
                <h3 className="eyebrow mb-2 text-ink-3">{g.label}</h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {g.photos.map((p) => (
                    <li key={p.id}>
                      <PhotoThumb photo={p} today={today} onOpen={() => setViewing(p)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}

      <Card title="Om bilderna" titleAs="h2">
        <PhotoPrivacyList />
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
          Säkerhetskopian under Inställningar → Data innehåller inte bilderna – de finns bara här.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {photos !== null && photos.length > 0 && <DeleteAllButton count={photos.length} onDeleted={reload} />}
          <Button variant="ghost" onClick={turnOff}>
            Stäng av framstegsbilder
          </Button>
        </div>
      </Card>

      {!paused && <PhotoCareNote />}

      <PhotoViewer
        photo={viewing}
        today={today}
        onClose={() => setViewing(null)}
        onDeleted={() => {
          setViewing(null)
          reload()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lägga till en bild
// ---------------------------------------------------------------------------

/**
 * "Ta en bild" (kameran, bara på pekskärmar) och "Välj en bild" (bildbiblioteket eller filer).
 * Den valda filen skalas ned direkt; originalet sparas aldrig. `capture` behövs för kameran i
 * Android-appen, som annars bara visar filväljaren – på iPhone ger även "Välj en bild" kameran.
 */
function AddPhoto({ today, onSaved }: { today: ISODate; onSaved: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const touch = useMediaQuery('(pointer: coarse)')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PreparedPhoto | null>(null)

  const pick = (input: HTMLInputElement | null) => {
    if (busy || !requirePhotoAccess()) return
    input?.click()
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Töm fältet så att samma bild kan väljas igen.
    e.target.value = ''
    if (!file) return
    setBusy(true)
    const photo = await prepareProgressPhoto(file)
    // Originalet behövs inte längre – ta bort kamerans tillfälliga fil (Android-appen).
    void clearCameraCaptures()
    setBusy(false)
    if (!photo) {
      toast('Bilden gick inte att läsa. Prova en annan bild, till exempel en JPEG.', { tone: 'error' })
      return
    }
    setPending(photo)
  }

  const fileInput = (ref: typeof cameraRef, camera: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      capture={camera ? true : undefined}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => void onFile(e)}
      data-testid={camera ? 'bild-kamera' : 'bild-fil'}
    />
  )

  return (
    <>
      {touch && fileInput(cameraRef, true)}
      {fileInput(libraryRef, false)}
      <div className={touch ? 'grid grid-cols-2 gap-2' : ''}>
        {touch && (
          <Button variant="primary" size="lg" iconLeft={Camera} onClick={() => pick(cameraRef.current)} disabled={busy} fullWidth>
            Ta en bild
          </Button>
        )}
        <Button
          variant={touch ? 'soft' : 'primary'}
          size="lg"
          iconLeft={busy ? undefined : ImagePlus}
          loading={busy}
          onClick={() => pick(libraryRef.current)}
          fullWidth
        >
          {busy ? 'Förbereder …' : 'Välj en bild'}
        </Button>
      </div>
      <AddPhotoSheet
        photo={pending}
        today={today}
        onClose={() => setPending(null)}
        onSaved={() => {
          setPending(null)
          onSaved()
        }}
      />
    </>
  )
}

function AddPhotoSheet({
  photo,
  today,
  onClose,
  onSaved,
}: {
  photo: PreparedPhoto | null
  today: ISODate
  onClose: () => void
  onSaved: () => void
}) {
  // Förhandsvisningen använder miniatyren (mindre minne); URL:en släpps när arket stängs.
  const preview = useBlobUrl(photo?.thumb ?? null)
  const [date, setDate] = useState<string>(today)
  const [saving, setSaving] = useState(false)
  // Nytt datum (idag) varje gång en ny bild väljs.
  const [shownFor, setShownFor] = useState<PreparedPhoto | null>(null)
  if (photo !== shownFor) {
    setShownFor(photo)
    setDate(today)
  }
  const dateValid = isValidISODate(date) && date <= today

  const save = async () => {
    if (!photo || !dateValid || saving) return
    if (!requirePhotoAccess()) return
    setSaving(true)
    const meta = await addProgressPhoto(photo, date as ISODate)
    setSaving(false)
    if (!meta) {
      toast('Bilden kunde inte sparas. Det kan vara fullt på enheten – försök igen om en stund.', { tone: 'error' })
      return
    }
    haptic('success')
    toast('Bilden är sparad')
    onSaved()
  }

  return (
    <Sheet
      open={photo !== null}
      onClose={onClose}
      title="Spara bilden"
      description={`Bilden sparas bara ${storagePlace()}. Platsuppgifter och annan information i bildfilen tas bort.`}
      footer={
        <Button fullWidth size="lg" iconLeft={Check} onClick={() => void save()} disabled={!dateValid} loading={saving}>
          Spara bilden
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="mx-auto w-full max-w-[16rem] overflow-hidden rounded-2xl bg-surface-2">
          {preview ? (
            <img src={preview} alt="Förhandsvisning av bilden" className="h-auto w-full" />
          ) : (
            <Skeleton className="aspect-[3/4] w-full" />
          )}
        </div>
        <TextField
          type="date"
          label="Datum"
          value={date}
          max={today}
          required
          onValueChange={setDate}
          error={!dateValid ? 'Välj ett datum som inte ligger i framtiden' : undefined}
        />
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Rutnätet, arket med en bild och jämförelsen
// ---------------------------------------------------------------------------

function PhotoThumb({ photo, today, onOpen }: { photo: ProgressPhotoMeta; today: ISODate; onOpen: () => void }) {
  const { url, missing } = usePhotoUrl(photo.id, 'thumb')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Visa bilden från ${formatDayLong(photo.date, today).toLowerCase()}`}
      className="group flex w-full flex-col gap-1 rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gran"
    >
      <span className="block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface-2">
        {url ? (
          <img src={url} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : missing ? (
          <span className="grid size-full place-items-center text-ink-3">
            <ImageOff className="size-6" aria-hidden />
          </span>
        ) : (
          <Skeleton className="size-full rounded-none" />
        )}
      </span>
      <span className="px-1 text-[0.75rem] text-ink-2">{formatDayShort(photo.date)}</span>
    </button>
  )
}

function FullPhoto({ photo, today, className = '' }: { photo: ProgressPhotoMeta; today: ISODate; className?: string }) {
  const { url, missing } = usePhotoUrl(photo.id, 'full')
  if (url) return <img src={url} alt={photoAlt(photo, today)} className={`w-full object-contain ${className}`} />
  if (missing) {
    return (
      <div className={`grid w-full place-items-center gap-2 bg-surface-2 p-6 text-center text-[0.8125rem] text-ink-3 ${className}`}>
        <ImageOff className="size-6" aria-hidden />
        Bilden gick inte att läsa.
      </div>
    )
  }
  return <Skeleton className={`aspect-[3/4] w-full ${className}`} />
}

function PhotoViewer({
  photo,
  today,
  onClose,
  onDeleted,
}: {
  photo: ProgressPhotoMeta | null
  today: ISODate
  onClose: () => void
  onDeleted: () => void
}) {
  // Behåll den senaste bilden medan arket glider ut.
  const [shown, setShown] = useState<ProgressPhotoMeta | null>(photo)
  if (photo && photo !== shown) setShown(photo)
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    if (!shown) return
    const ok = await confirmDialog({
      title: 'Radera bilden?',
      message: `Bilden från ${formatDayLong(shown.date, today).toLowerCase()} tas bort ${storagePlace()}.`,
      tone: 'danger',
      confirmLabel: 'Radera',
      icon: Trash2,
    })
    if (!ok) return
    setBusy(true)
    // Behåll bilden i minnet en stund så att raderingen kan ångras.
    const [full, thumb] = await Promise.all([loadProgressPhoto(shown.id, 'full'), loadProgressPhoto(shown.id, 'thumb')])
    const done = await deleteProgressPhoto(shown.id)
    setBusy(false)
    if (!done) {
      toast('Bilden gick inte att radera. Försök igen om en stund.', { tone: 'error' })
      return
    }
    const meta = shown
    onDeleted()
    toast('Bilden är raderad', {
      action:
        full && thumb
          ? {
              label: 'Ångra',
              onClick: () => {
                void storeProgressPhoto(meta, full, thumb).then((ok) => {
                  if (ok) onDeleted()
                  else toast('Bilden gick inte att återställa.', { tone: 'error' })
                })
              },
            }
          : undefined,
    })
  }

  return (
    <Sheet
      open={photo !== null}
      onClose={onClose}
      title={shown ? formatDayLong(shown.date, today) : 'Bild'}
      size="tall"
      footer={
        <Button fullWidth variant="outline" iconLeft={Trash2} onClick={() => void remove()} loading={busy}>
          Radera bilden
        </Button>
      }
    >
      {shown && (
        <div className="overflow-hidden rounded-2xl bg-surface-2">
          <FullPhoto photo={shown} today={today} className="max-h-[65vh]" />
        </div>
      )}
    </Sheet>
  )
}

function CompareCard({ photos, today }: { photos: readonly ProgressPhotoMeta[]; today: ISODate }) {
  // Standard: den äldsta och den nyaste bilden.
  const oldest = photos[photos.length - 1]
  const newest = photos[0]
  const [fromId, setFromId] = useState(oldest.id)
  const [toId, setToId] = useState(newest.id)
  const from = photos.find((p) => p.id === fromId) ?? oldest
  const to = photos.find((p) => p.id === toId) ?? newest

  const options = useMemo(() => {
    const perDate = new Map<string, number>()
    // Bilderna i datumordning (äldst först) i listorna; samma dag numreras.
    return [...photos].reverse().map((p) => {
      const n = (perDate.get(p.date) ?? 0) + 1
      perDate.set(p.date, n)
      // Kort datum ("10 aug", med år om det inte är i år) – får plats i två listor bredvid varandra på 375 px.
      const year = p.date.slice(0, 4)
      const label = year === today.slice(0, 4) ? formatDayShort(p.date) : `${formatDayShort(p.date)} ${year}`
      return { value: p.id, label: n > 1 ? `${label} (${n})` : label }
    })
  }, [photos, today])

  return (
    <Card title="Jämför" eyebrow="Sida vid sida" titleAs="h2" action={<GitCompareArrows aria-hidden className="size-5 text-ink-3" />}>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Från" value={from.id} options={options} onChange={setFromId} />
        <Select label="Till" value={to.id} options={options} onChange={setToId} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[from, to].map((p, i) => (
          <figure key={`${i}-${p.id}`} className="flex flex-col gap-1">
            <div className="overflow-hidden rounded-2xl bg-surface-2">
              <FullPhoto photo={p} today={today} className="aspect-[3/4]" />
            </div>
            <figcaption className="px-1 text-[0.75rem] text-ink-2">{formatDayShort(p.date)}</figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-2 text-[0.8125rem] text-ink-3">{timeBetween(from.date, to.date)}</p>
    </Card>
  )
}

function PhotosSkeleton() {
  return (
    <div className="px-4 pt-safe" role="status" aria-busy="true">
      <span className="sr-only">Laddar framstegsbilder …</span>
      <div className="pb-4 pt-[4.25rem]">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-3 h-4 w-64" />
      </div>
      <Skeleton className="h-14 w-full rounded-[1.25rem]" />
    </div>
  )
}
