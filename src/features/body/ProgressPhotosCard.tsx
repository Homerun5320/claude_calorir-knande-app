/**
 * Framstegsbilder på "Vikt & mått": en lugn förklaring och ett val att slå på funktionen, eller –
 * när den är på – en kort rad om bilderna och en väg till sidan med bilderna (/vikt/bilder).
 *
 * Kortet visar aldrig själva bilderna, döljs helt i medvetet läge och finns aldrig på Idag.
 * Exempeldata visar inga bilder. Se src/lib/progressPhotos.ts för lagringen.
 *
 * Vid lågt BMI, eller när de dagar som markerats som klara ligger under energigolvet, erbjuder
 * Lagom inte att slå på bilderna eller lägga till nya (`usePhotosPaused`) – då är risken för
 * kroppskontroll störst. Att titta på och radera bilderna går som vanligt.
 */
import { useEffect, useMemo, useState } from 'react'
import { Camera, ChevronRight, CloudOff, HardDrive, Trash2, EyeOff } from 'lucide-react'
import { Button, Card, toast } from '../../components/ui'
import { storagePlace } from '../../config/platform'
import { useDemoData } from '../../hooks/useDemoData'
import { useTargets } from '../../hooks/useTargets'
import { useToday } from '../../hooks/useToday'
import { formatDayShort } from '../../lib/dates'
import { MIN_KCAL } from '../../lib/energy'
import { plural } from '../../lib/format'
import { listProgressPhotos, type ProgressPhotoMeta } from '../../lib/progressPhotos'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import { requireAccess } from '../premium/requireAccess'
import { CareNote } from '../today/CareNote'
import { lowIntakeAverage } from '../today/todayLogic'

/** Sidan med bilderna. */
export const PROGRESS_PHOTOS_PATH = '/vikt/bilder'

/** Spärren före en ny bild (arket: "För att spara framstegsbilder …"). */
export function requirePhotoAccess(): boolean {
  return requireAccess('bild')
}

/** Slå på framstegsbilder (bara en inställning – inget sparas förrän du själv lägger till en bild). */
export function enableProgressPhotos(): void {
  useProfileStore.getState().updateSettings({ progressPhotos: true })
  toast('Framstegsbilder är på')
}

/**
 * true när Lagom inte ska erbjuda nya framstegsbilder: vikten ligger under hälsosamt BMI (samma
 * bedömning som golvet för egna mål, oavsett valt mål) eller de dagar som markerats som klara ligger
 * i snitt under energigolvet. Att titta på och radera bilderna påverkas inte.
 */
export function usePhotosPaused(): boolean {
  const today = useToday()
  const { energy } = useTargets(today)
  const entries = useDiaryStore((s) => s.entries)
  const days = useDiaryStore((s) => s.days)
  const sex = useProfileStore((s) => s.profile?.sex ?? 'kvinna')
  const lowIntake = useMemo(() => lowIntakeAverage(today, entries, days, MIN_KCAL[sex]) !== undefined, [today, entries, days, sex])
  return energy?.goalPause === 'lowBmi' || energy?.overrideFloor.reason === 'lagtBmi' || lowIntake
}

/** Texten när nya bilder inte erbjuds (följs av vägarna till stöd). */
export const PHOTOS_PAUSED_TEXT = 'Just nu lägger Lagom inte till framstegsbilder – fokusera gärna på hur du mår och vad kroppen orkar.'

/** Den varsamma raden i stället för "Slå på" och "Lägg till en bild" när bilderna vilar. */
export function PhotosPausedNote({ className }: { className?: string }) {
  return <CareNote className={className}>{PHOTOS_PAUSED_TEXT}</CareNote>
}

/** Punkterna om var bilderna finns – samma på kortet och på sidan. */
export function PhotoPrivacyList({ className = '' }: { className?: string }) {
  const items = [
    { icon: HardDrive, text: `Bilderna sparas bara ${storagePlace()}.` },
    { icon: CloudOff, text: 'De följer inte med i säkerhetskopian eller till molnet, Lagom har ingen delningsknapp för dem och skickar dem aldrig någonstans.' },
    { icon: Trash2, text: 'Du kan radera en bild eller alla när du vill.' },
    { icon: EyeOff, text: 'De visas aldrig på Idag och döljs i medvetet läge.' },
  ]
  return (
    <ul className={`flex flex-col gap-2.5 ${className}`}>
      {items.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-2.5 text-[0.875rem] leading-relaxed text-ink-2">
          <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-gran" strokeWidth={2} />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  )
}

/** Den varsamma raden om stöd (återanvänder CareNote från Idag). */
export function PhotoCareNote({ className }: { className?: string }) {
  return <CareNote className={className}>Ta bara bilder om det känns bra – kroppen är så mycket mer än hur den ser ut.</CareNote>
}

/**
 * Förklaringen och knappen "Slå på" – på kortet och på sidan när funktionen är av. När bilderna
 * vilar (`usePhotosPaused`) visas ingen knapp, bara den varsamma raden med vägarna till stöd.
 */
export function ProgressPhotosIntro({ onEnable = enableProgressPhotos }: { onEnable?: () => void }) {
  const paused = usePhotosPaused()
  if (paused) return <PhotosPausedNote />
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        Ibland syns förändringar i spegeln eller i hur kläderna sitter innan de syns på vågen. Vill du kan du ta en bild
        då och då och jämföra två bilder sida vid sida.
      </p>
      <PhotoPrivacyList />
      <div>
        <Button variant="soft" iconLeft={Camera} onClick={onEnable}>
          Slå på framstegsbilder
        </Button>
      </div>
      <PhotoCareNote />
    </div>
  )
}

/** Sammanfattningen när funktionen är på: antal bilder och när den senaste togs. */
function summary(photos: readonly ProgressPhotoMeta[] | null): string {
  if (photos === null) return 'Läser bilderna …'
  if (photos.length === 0) return `Inga bilder ännu. De sparas bara ${storagePlace()} – inte i säkerhetskopian eller molnet.`
  return `${plural(photos.length, 'bild', 'bilder')}, den senaste från ${formatDayShort(photos[0].date)}. Bara ${storagePlace()}.`
}

function EnabledContent() {
  const demo = useDemoData()
  const paused = usePhotosPaused()
  const [photos, setPhotos] = useState<ProgressPhotoMeta[] | null>(null)

  useEffect(() => {
    // Exempeldata visar inga bilder.
    if (demo) return
    let active = true
    void listProgressPhotos().then((list) => {
      if (active) setPhotos(list)
    })
    return () => {
      active = false
    }
  }, [demo])

  const shown = demo ? [] : photos
  const empty = shown !== null && shown.length === 0
  if (paused) {
    return (
      <div className="flex flex-col gap-3">
        <PhotosPausedNote />
        {shown !== null && shown.length > 0 && (
          <div>
            <Button to={PROGRESS_PHOTOS_PATH} variant="ghost" iconRight={ChevronRight}>
              Visa eller radera bilderna
            </Button>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.875rem] leading-relaxed text-ink-2">{summary(shown)}</p>
      <div>
        <Button to={PROGRESS_PHOTOS_PATH} variant="soft" iconLeft={Camera} iconRight={ChevronRight}>
          {empty ? 'Lägg till en bild' : 'Visa och jämför'}
        </Button>
      </div>
    </div>
  )
}

/**
 * Kortet på "Vikt & mått". Visas inte i medvetet läge (BodyPage döljer det också).
 */
export function ProgressPhotosCard() {
  const enabled = useProfileStore((s) => s.settings.progressPhotos === true)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  if (mindful) return null
  return (
    <Card eyebrow={enabled ? 'Bara på den här enheten' : 'Valfritt'} title="Framstegsbilder">
      {enabled ? <EnabledContent /> : <ProgressPhotosIntro />}
    </Card>
  )
}
