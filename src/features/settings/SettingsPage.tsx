/**
 * Inställningar (/installningar och /installningar/:section).
 *
 * Indexsidan är en lugn lista i grupper med en kort sammanfattning av varje inställning.
 * Varje sektion är en egen sida med tillbaka-knapp till listan.
 */
import { lazy, Suspense, useState, type ComponentType } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  Bell,
  CalendarHeart,
  Cloud,
  Database,
  Dumbbell,
  HardDrive,
  HeartHandshake,
  HeartPulse,
  Info,
  KeyRound,
  Palette,
  FileText,
  ShieldCheck,
  Target,
  UserRound,
  UtensilsCrossed,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import { Card, ListGroup, ListRow, PageHeader, Spinner, type Tone } from '../../components/ui'
import { useMemoryOnlyStorage } from '../../hooks/useStorageStatus'
import { useTargets } from '../../hooks/useTargets'
import { ageFromBirthYear, relativeDayLabel, toISODate } from '../../lib/dates'
import { MACRO_PRESETS } from '../../lib/energy'
import { formatEnergy, formatNumber } from '../../lib/format'
import { useProfileStore } from '../../stores/profileStore'
import { ACTIVITY_LEVELS, type Profile, type Settings } from '../../types'
import { allergenSummary } from '../../lib/allergens'
import { formatSince } from '../more/moreLogic'
import { SupportSheet } from '../more/SupportSheet'
import { useLastBackup } from './backupStatus'
import { AllergySection } from './sections/AllergySection'
import { AppearanceSection } from './sections/AppearanceSection'
import { DataSection } from './sections/DataSection'
import { DatabaseSection } from './sections/DatabaseSection'
import { GoalsSection } from './sections/GoalsSection'
import { MealsSection } from './sections/MealsSection'
import { ProfileSection } from './sections/ProfileSection'
import { TrainingSection } from './sections/TrainingSection'
import { LicenseSection } from './sections/LicenseSection'
import { useAccess } from '../../hooks/useAccess'
import { premiumStatusLine } from '../premium/TrialBanner'
import { overrideCount } from './settingsLogic'
import { CLOUD_ENABLED } from '../../config/cloud'
import { allowsLicenseKeyEntry } from '../../config/platform'
import { isNative, platform } from '../../native'
import { useCloudStore } from '../../stores/cloudStore'
import type { AppSectionRowsProps } from './sections/AppSectionRows'

/** Lagom Moln laddas bara när funktionen finns i bygget (VITE_SUPABASE_URL) – se docs/BACKEND.md. */
const CloudSection = lazy(() => import('./sections/CloudSection'))

/** Sätts av vite.config.ts (`define`); finns inte i testerna. */
declare const __LAGOM_DISTRIBUTION__: string | undefined

/**
 * true i butiksbyggen. En konstant i bygget (samma mönster som `NATIVE_BUILD` i src/native/index.ts),
 * så att apparnas egna sektioner – Påminnelser och Apple Hälsa/Health Connect – inte följer med i
 * webbygget. I testerna är den true. Sektionerna visas bara i de inbyggda apparna (`isNative()`).
 */
const APP_SECTIONS_BUILD: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ !== 'web' : true
const NoSection: ComponentType = () => null
const NoRows: ComponentType<AppSectionRowsProps> = () => null
const RemindersSection: ComponentType = APP_SECTIONS_BUILD ? lazy(() => import('./sections/RemindersSection')) : NoSection
const HealthSection: ComponentType = APP_SECTIONS_BUILD ? lazy(() => import('./sections/HealthSection')) : NoSection
const AppSectionRows: ComponentType<AppSectionRowsProps> = APP_SECTIONS_BUILD ? lazy(() => import('./sections/AppSectionRows')) : NoRows

export type SectionId = 'profil' | 'mal' | 'maltider' | 'allergier' | 'utseende' | 'traning' | 'paminnelser' | 'halsa' | 'data' | 'databas' | 'licens' | 'moln'

/** Sektioner som bara finns i de inbyggda apparna. */
const APP_ONLY_SECTIONS: readonly string[] = ['paminnelser', 'halsa']

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
  allergier: {
    title: 'Allergier och överkänslighet',
    description: 'Varsamma flaggor för det du inte tål – sparas bara på din enhet.',
    icon: Wheat,
    tone: 'hjortron',
    component: AllergySection,
  },
  utseende: { title: 'Utseende och visning', description: 'Tema, energienhet och medvetet läge.', icon: Palette, tone: 'vinbar', component: AppearanceSection },
  traning: { title: 'Träning och vatten', description: 'Träningskalorier och glasstorlek.', icon: Dumbbell, tone: 'fjall', component: TrainingSection },
  paminnelser: { title: 'Påminnelser', description: 'Frivilliga notiser – allt är avstängt tills du väljer.', icon: Bell, tone: 'sol', component: RemindersSection },
  halsa: {
    title: platform === 'android' ? 'Health Connect' : 'Apple Hälsa',
    description: 'Vikt och steg in, mat och vatten ut – om du vill.',
    icon: HeartPulse,
    tone: 'lingon',
    component: HealthSection,
  },
  data: { title: 'Data och säkerhetskopia', description: 'Exportera, importera och radera – allt ligger på din enhet.', icon: HardDrive, tone: 'gran', component: DataSection },
  databas: { title: 'Livsmedelsdatabas', description: 'Vad som finns inbyggt, källor och import.', icon: Database, tone: 'mossa', component: DatabaseSection },
  licens: {
    title: 'Licens',
    // I iPhone-appen finns inga licensnycklar (alternativ A) – bara köp i appen och Återställ köp.
    description: allowsLicenseKeyEntry() ? 'Provperiod, licensnyckel och köp.' : 'Provperiod, köp och Återställ köp.',
    icon: KeyRound,
    tone: 'sol',
    component: LicenseSection,
  },
  moln: { title: 'Lagom Moln', description: 'Krypterad kopia av din dagbok i molnet.', icon: Cloud, tone: 'fjall', component: CloudSection },
}

function isSection(s: string | undefined): s is SectionId {
  if (s === 'moln' && !CLOUD_ENABLED) return false
  if (s !== undefined && APP_ONLY_SECTIONS.includes(s) && !isNative()) return false
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
        <Suspense
          fallback={
            <div className="flex justify-center py-10" role="status" aria-busy="true">
              <Spinner />
              <span className="sr-only">Laddar …</span>
            </div>
          }
        >
          <Component />
        </Suspense>
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
    `${formatNumber(profile.heightCm)}\u00a0cm`,
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
  const { targets, exerciseAddBack, weeklyPlan } = useTargets()
  const lastBackup = useLastBackup()
  const memoryOnly = useMemoryOnlyStorage()
  const [support, setSupport] = useState(false)
  const cloudSignedIn = useCloudStore((s) => s.session !== null)
  const cloudLastUpload = useCloudStore((s) => s.lastUploadAt)
  const { status, checking } = useAccess()
  const today = toISODate(new Date())

  const preset =
    profile?.macroPreset === 'anpassad' ? 'Egen fördelning' : profile ? MACRO_PRESETS[profile.macroPreset].label : MACRO_PRESETS.nnr.label
  const custom = overrideCount(settings.targetOverrides)
  const goalsSub = settings.mindfulMode
    ? `Mål i bakgrunden · ${preset}`
    : `${formatEnergy(targets.kcal, settings.energyUnit)} per dag${weeklyPlan ? ' i snitt · veckobudget' : ''} · ${preset}${custom > 0 ? ` · ${custom} egna` : ''}`
  const enabledMeals = settings.meals.filter((m) => m.enabled).length
  const backupSub = memoryOnly
    ? 'Sparas inte på enheten just nu – spara en säkerhetskopia'
    : lastBackup === null
      ? 'Ingen säkerhetskopia ännu'
      : `Säkerhetskopierad ${relativeDayLabel(toISODate(new Date(lastBackup)), today).toLocaleLowerCase('sv-SE')}`
  const cloudSub = !cloudSignedIn
    ? 'Av'
    : cloudLastUpload === null
      ? 'Inloggad'
      : `Senaste kopian ${relativeDayLabel(toISODate(new Date(cloudLastUpload)), today).toLocaleLowerCase('sv-SE')}`
  const trainingSub = exerciseAddBack.includedInTarget ? 'Träningen ingår i det adaptiva målet' : `${formatNumber(settings.exerciseAddBackPct)}\u00a0% av träningen räknas`

  const row = (id: SectionId, subtitle: string) => (
    <ListRow key={id} to={`/installningar/${id}`} leading={SECTIONS[id].icon} leadingTone={SECTIONS[id].tone} title={SECTIONS[id].title} subtitle={subtitle} />
  )

  const initial = profile?.name?.trim().charAt(0).toLocaleUpperCase('sv-SE')

  return (
    <div className="px-4 pb-8">
      <PageHeader title="Inställningar" subtitle="Gör Lagom till din. Allt sparas bara på din enhet." />

      <div className="flex flex-col gap-6">
        {/* Ingen aria-label: länkens namn är den synliga texten (namn, sammanfattning, "Med Lagom sedan …"), annars
            hör skärmläsaren inte sammanfattningen och "Tryck Hej Anna" fungerar inte med röststyrning (WCAG 2.5.3). */}
        <Card to="/installningar/profil" padding="md">
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
          {row('allergier', allergenSummary(settings.allergens))}
        </ListGroup>

        <ListGroup title="Appen">
          {row('utseende', appearanceSummary(settings))}
          {row('traning', `${trainingSub} · glas ${formatNumber(settings.waterGlassMl / 100, 1)}\u00a0dl`)}
          {isNative() && (
            <Suspense fallback={null}>
              <AppSectionRows row={row} />
            </Suspense>
          )}
        </ListGroup>

        <ListGroup title="Lagom Premium">{row('licens', checking ? 'Kontrollerar licensen …' : premiumStatusLine(status))}</ListGroup>

        <ListGroup
          title="Data och integritet"
          footer={
            <>
              {CLOUD_ENABLED
                ? 'Din dagbok lämnar bara enheten om du själv exporterar den eller slår på Lagom Moln – då krypteras den först på enheten. '
                : 'Din dagbok lämnar aldrig enheten. '}
              Sökningar och streckkoder skickas till Open Food Facts – läs mer i{' '}
              <Link to="/integritet" className="font-semibold text-gran underline underline-offset-2">
                integritetspolicyn
              </Link>
              .
            </>
          }
        >
          {row('data', backupSub)}
          {CLOUD_ENABLED && row('moln', cloudSub)}
          {row('databas', 'Källor, import och sparade livsmedel')}
        </ListGroup>

        <ListGroup title="Om">
          <ListRow to="/om" leading={Info} title="Om Lagom" subtitle="Källor, licenser och integritet" />
          <ListRow to="/integritet" leading={ShieldCheck} leadingTone="gran" title="Integritetspolicy" subtitle="Vilken data som finns var – och dina rättigheter" />
          <ListRow to="/villkor" leading={FileText} leadingTone="mossa" title="Köp- och användarvillkor" subtitle="Provperiod, licenser och användning" />
          <ListRow onClick={() => setSupport(true)} leading={HeartHandshake} leadingTone="vinbar" title="Stöd & hjälp" subtitle="1177, Frisk & Fri och Alkoholhjälpen" chevron />
        </ListGroup>
      </div>

      <SupportSheet open={support} onClose={() => setSupport(false)} />
    </div>
  )
}
