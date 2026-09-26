/**
 * Inställningar (/installningar och /installningar/:section).
 *
 * Indexsidan är en lugn lista i grupper med en kort sammanfattning av varje inställning.
 * Varje sektion är en egen sida med tillbaka-knapp till listan.
 */
import { useState, type ComponentType } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import {
  CalendarHeart,
  Database,
  Dumbbell,
  HardDrive,
  HeartHandshake,
  Info,
  Palette,
  Target,
  UserRound,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { Card, ListGroup, ListRow, PageHeader, type Tone } from '../../components/ui'
import { useTargets } from '../../hooks/useTargets'
import { ageFromBirthYear, relativeDayLabel, toISODate } from '../../lib/dates'
import { MACRO_PRESETS } from '../../lib/energy'
import { formatEnergy, formatNumber } from '../../lib/format'
import { useProfileStore } from '../../stores/profileStore'
import { ACTIVITY_LEVELS, type Profile, type Settings } from '../../types'
import { formatSince } from '../more/moreLogic'
import { SupportSheet } from '../more/SupportSheet'
import { useLastBackup } from './backupStatus'
import { AppearanceSection } from './sections/AppearanceSection'
import { DataSection } from './sections/DataSection'
import { DatabaseSection } from './sections/DatabaseSection'
import { GoalsSection } from './sections/GoalsSection'
import { MealsSection } from './sections/MealsSection'
import { ProfileSection } from './sections/ProfileSection'
import { TrainingSection } from './sections/TrainingSection'
import { overrideCount } from './settingsLogic'

export type SectionId = 'profil' | 'mal' | 'maltider' | 'utseende' | 'traning' | 'data' | 'databas'

interface SectionMeta {
  title: string
  description: string
  icon: LucideIcon
  tone: Tone
  component: ComponentType
}

export const SECTIONS: Record<SectionId, SectionMeta> = {
  profil: { title: 'Profil', description: 'Uppgifterna som dina mål räknas fram ur.', icon: UserRound, tone: 'blabar', component: ProfileSection },
  mal: { title: 'Mål och makron', description: 'Dagsmål, makrofördelning och egna mål.', icon: Target, tone: 'lingon', component: GoalsSection },
  maltider: { title: 'Måltider', description: 'Namn och vilka måltider som visas.', icon: UtensilsCrossed, tone: 'hjortron', component: MealsSection },
  utseende: { title: 'Utseende och visning', description: 'Tema, energienhet och medvetet läge.', icon: Palette, tone: 'vinbar', component: AppearanceSection },
  traning: { title: 'Träning och vatten', description: 'Träningskalorier och glasstorlek.', icon: Dumbbell, tone: 'fjall', component: TrainingSection },
  data: { title: 'Data och säkerhetskopia', description: 'Exportera, importera och radera – allt ligger i din telefon.', icon: HardDrive, tone: 'gran', component: DataSection },
  databas: { title: 'Livsmedelsdatabas', description: 'Vad som finns inbyggt, källor och import.', icon: Database, tone: 'mossa', component: DatabaseSection },
}

function isSection(s: string | undefined): s is SectionId {
  return s !== undefined && Object.prototype.hasOwnProperty.call(SECTIONS, s)
}

export default function SettingsPage() {
  const { section } = useParams()
  if (section === 'om') return <Navigate to="/om" replace />
  if (section !== undefined && !isSection(section)) return <Navigate to="/installningar" replace />
  if (section !== undefined) {
    const meta = SECTIONS[section]
    const Component = meta.component
    return (
      <div className="px-4 pb-8">
        <PageHeader backTo="/installningar" backLabel="Till inställningar" eyebrow="Inställningar" title={meta.title} subtitle={meta.description} />
        <Component />
      </div>
    )
  }
  return <SettingsIndex />
}

// ---------------------------------------------------------------------------
// Sammanfattningar för listan
// ---------------------------------------------------------------------------

export function profileSummary(profile: Profile | null, today: string): string {
  if (!profile) return 'Inte ifylld ännu'
  const parts = [
    profile.sex === 'kvinna' ? 'Kvinna' : 'Man',
    `${ageFromBirthYear(profile.birthYear, today)} år`,
    `${formatNumber(profile.heightCm)} cm`,
    ACTIVITY_LEVELS[profile.activityLevel].label.toLocaleLowerCase('sv-SE'),
  ]
  return parts.join(' · ')
}

export function appearanceSummary(s: Pick<Settings, 'theme' | 'energyUnit' | 'mindfulMode'>): string {
  const theme = s.theme === 'system' ? 'Följer systemet' : s.theme === 'ljust' ? 'Ljust' : 'Mörkt'
  return [theme, s.energyUnit, s.mindfulMode ? 'medvetet läge' : null].filter(Boolean).join(' · ')
}

function SettingsIndex() {
  const profile = useProfileStore((s) => s.profile)
  const settings = useProfileStore((s) => s.settings)
  const { targets } = useTargets()
  const lastBackup = useLastBackup()
  const [support, setSupport] = useState(false)
  const today = toISODate(new Date())

  const preset =
    profile?.macroPreset === 'anpassad' ? 'Egen fördelning' : profile ? MACRO_PRESETS[profile.macroPreset].label : MACRO_PRESETS.nnr.label
  const custom = overrideCount(settings.targetOverrides)
  const goalsSub = settings.mindfulMode
    ? `Mål i bakgrunden · ${preset}`
    : `${formatEnergy(targets.kcal, settings.energyUnit)} per dag · ${preset}${custom > 0 ? ` · ${custom} egna` : ''}`
  const enabledMeals = settings.meals.filter((m) => m.enabled).length
  const backupSub = lastBackup === null ? 'Ingen säkerhetskopia ännu' : `Säkerhetskopierad ${relativeDayLabel(toISODate(new Date(lastBackup)), today).toLocaleLowerCase('sv-SE')}`

  const row = (id: SectionId, subtitle: string) => (
    <ListRow key={id} to={`/installningar/${id}`} leading={SECTIONS[id].icon} leadingTone={SECTIONS[id].tone} title={SECTIONS[id].title} subtitle={subtitle} />
  )

  const initial = profile?.name?.trim().charAt(0).toLocaleUpperCase('sv-SE')

  return (
    <div className="px-4 pb-8">
      <PageHeader title="Inställningar" subtitle="Gör Lagom till din. Allt sparas bara i din telefon." />

      <div className="flex flex-col gap-6">
        <Card to="/installningar/profil" padding="md" aria-label="Öppna profilen">
          <div className="flex items-center gap-4">
            <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-gran-soft font-display text-[1.5rem] font-semibold text-gran">
              {initial || <UserRound className="size-6" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[1.1875rem] font-semibold tracking-tight">{profile?.name ? `Hej, ${profile.name}` : 'Din profil'}</span>
              <span className="mt-0.5 block truncate text-[0.8125rem] text-ink-3">{profileSummary(profile, today)}</span>
              {profile && (
                <span className="mt-1 flex items-center gap-1.5 text-[0.75rem] text-ink-3">
                  <CalendarHeart aria-hidden className="size-3.5" />
                  Med Lagom sedan {formatSince(profile.createdAt, today)}
                </span>
              )}
            </span>
          </div>
        </Card>

        <ListGroup title="Du och dina mål">
          {row('profil', profile ? 'Kön, ålder, längd, vikt och mål' : 'Inte ifylld ännu')}
          {row('mal', goalsSub)}
          {row('maltider', `${enabledMeals} av ${settings.meals.length} visas`)}
        </ListGroup>

        <ListGroup title="Appen">
          {row('utseende', appearanceSummary(settings))}
          {row('traning', `${formatNumber(settings.exerciseAddBackPct)} % av träningen räknas · glas ${formatNumber(settings.waterGlassMl / 100, 1)} dl`)}
        </ListGroup>

        <ListGroup title="Data och integritet" footer="Lagom har ingen server och inga konton. Din data lämnar aldrig telefonen om du inte själv exporterar den.">
          {row('data', backupSub)}
          {row('databas', 'Källor, import och sparade livsmedel')}
        </ListGroup>

        <ListGroup title="Om">
          <ListRow to="/om" leading={Info} title="Om Lagom" subtitle="Källor, licenser och integritet" />
          <ListRow onClick={() => setSupport(true)} leading={HeartHandshake} leadingTone="vinbar" title="Stöd & hjälp" subtitle="1177, Frisk & Fri och Alkoholhjälpen" chevron />
        </ListGroup>
      </div>

      <SupportSheet open={support} onClose={() => setSupport(false)} />
    </div>
  )
}
