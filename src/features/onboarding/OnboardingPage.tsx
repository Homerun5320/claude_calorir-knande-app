/**
 * Välkomstflödet (/valkommen) – lugnt, snabbt (under en minut) och en fråga per steg.
 *
 * 0 Välkommen → 1 Mål → 2 Om dig → 3 Vardagsaktivitet → 4 Takt & målvikt (vid gå ner/upp)
 * → 5 Kost → 6 Sammanfattning. Varje steg är en egen post i historiken (`?steg=om-dig`), så att
 * webbläsarens och Androids bakåt går ett steg bakåt i stället för att stänga appen. Utkastet
 * sparas i sessionStorage så att inget försvinner om sidan laddas om. Enter går vidare.
 *
 * Från välkomststeget kan man också återställa en säkerhetskopia (t.ex. vid byte av telefon). I
 * apparna från App Store och Google Play förklaras flytten från webben steg för steg – datan i
 * webbläsaren följer inte med till appen av sig själv.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArchiveRestore, ArrowRight, ChevronLeft, Check, Sparkles } from 'lucide-react'
import { Button, IconButton, Sheet, confirmDialog, toast, cx } from '../../components/ui'
import { PageFallback } from '../../components/layout/AppShell'
import { useToday } from '../../hooks/useToday'
import { BackupError, parseBackup, requestPersistentStorage, summarizeBackup, type BackupFile, type ImportSummary } from '../../lib/backup'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { useHydrated } from '../../stores/hydration'
import { useProfileStore } from '../../stores/profileStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { isInApp } from '../../config/platform'
import { backupDateLabel, restoreBackupSafely } from '../settings/backupImport'
import { ImportSummaryList } from '../settings/ImportSummaryList'
import { focusFirstInvalid } from './focusFirstInvalid'
import {
  buildProfile,
  canContinue,
  emptyDraft,
  hasErrors,
  reviveDraft,
  stepsFor,
  validateAbout,
  type OnboardingStep,
  type ProfileDraft,
  type ProfileField,
} from './profileLogic'
import { AboutStep, ActivityStep, DietStep, GoalStep, RateStep, SummaryStep, WelcomeStep } from './OnboardingSteps'

const SESSION_KEY = 'lagom-onboarding'
/** Sökparametern som bär aktuellt steg, t.ex. #/valkommen?steg=om-dig. */
export const STEP_PARAM = 'steg'
const ALL_STEPS: readonly OnboardingStep[] = ['valkommen', 'mal', 'om-dig', 'aktivitet', 'takt', 'kost', 'sammanfattning']

interface Saved {
  draft: ProfileDraft
}

function loadSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { draft?: unknown }
    return { draft: reviveDraft(parsed.draft) }
  } catch {
    return null
  }
}

function save(s: Saved | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* privat läge – utkastet lever bara i minnet */
  }
}

function parseStep(value: string | null): OnboardingStep {
  return ALL_STEPS.includes(value as OnboardingStep) ? (value as OnboardingStep) : 'valkommen'
}

/** Hur många steg i välkomstflödet som ligger före den här historikposten (0 = välkomststeget). */
function useStepDepth(): number {
  const state = useLocation().state as { onboardingDepth?: unknown } | null
  const depth = state?.onboardingDepth
  return typeof depth === 'number' && Number.isInteger(depth) && depth > 0 ? depth : 0
}

export default function OnboardingPage() {
  const hydrated = useHydrated()
  const done = useProfileStore((s) => s.settings.onboardingDone && s.profile !== null)
  const depth = useStepDepth()
  // När flödet är klart backar vi först ur stegens historikposter (så att bakåt från Idag inte
  // landar i välkomstflödet igen) och går sedan till startsidan.
  const [leaving, setLeaving] = useState(false)
  const waitForHistory = done && leaving && depth > 0
  useEffect(() => {
    if (!waitForHistory) return
    // Skyddsnät om historiken inte skulle backa – gå till startsidan ändå.
    const t = window.setTimeout(() => setLeaving(false), 1000)
    return () => window.clearTimeout(t)
  }, [waitForHistory])
  if (!hydrated) return <PageFallback />
  if (done) return waitForHistory ? <PageFallback /> : <Navigate to="/" replace />
  return <OnboardingFlow onLeaving={() => setLeaving(true)} />
}

/**
 * "Steg 2" eller "Steg 4 av 6". Antalet steg avgörs först av målet och uppgifterna om dig (t.ex.
 * blir det inget taktsteg vid graviditet eller under 18 år) – innan dess visas inget totalantal,
 * så att räknaren inte ser ut att hoppa från "1 av 6" till "2 av 5".
 */
export function stepText(steps: readonly OnboardingStep[], current: number): string {
  // Välkomststeget räknas inte.
  const known = current >= steps.indexOf('aktivitet')
  return known ? `Steg ${current} av ${steps.length - 1}` : `Steg ${current}`
}

function ProgressDots({ steps, current }: { steps: readonly OnboardingStep[]; current: number }) {
  const reduce = useReducedMotion()
  // Välkomststeget räknas inte.
  const total = steps.length - 1
  const index = current - 1
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-label="Förlopp" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-valuetext={stepText(steps, current)}>
      {Array.from({ length: total }, (_, i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={false}
          animate={{ width: i === index ? 22 : 8 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
          className={cx('block h-2 rounded-full transition-colors duration-300', i <= index ? 'bg-gran' : 'bg-surface-3')}
        />
      ))}
    </div>
  )
}

/**
 * Stegen för att flytta sin data från en annan enhet (visas i apparna). Neutralt formulerat – i
 * iPhone-appen nämns inte webbversionen (docs/APP-STORE.md §4), och i Play-appen (TWA) kan
 * lagringen delas med Chrome på samma telefon, så påståenden om webbläsaren undviks.
 */
export const WEB_MOVE_STEPS = [
  // Samma namn som i appen: avsnittet "Data och säkerhetskopia" och knappen "Spara säkerhetskopia".
  'Öppna Lagom på den andra enheten och välj Inställningar → Data och säkerhetskopia → Spara säkerhetskopia.',
  'Spara filen i Filer eller skicka den till dig själv.',
  'Välj Återställ från säkerhetskopia här.',
] as const

/** I apparna: så flyttar man sin data från en annan enhet. */
function WebMoveCard({ onRestore }: { onRestore: () => void }) {
  return (
    <section aria-labelledby="flytta-fran-webben" className="card mx-auto mt-5 w-[calc(100%-2rem)] max-w-[30rem] p-4">
      <h2 id="flytta-fran-webben" className="font-display text-[1.125rem] font-semibold tracking-tight text-ink">
        Har du använt Lagom på en annan enhet?
      </h2>
      <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">Din data följer inte med av sig själv. Så flyttar du den:</p>
      <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-[0.875rem] leading-relaxed text-ink-2 marker:font-semibold marker:text-gran">
        {WEB_MOVE_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Button type="button" variant="secondary" size="sm" iconLeft={ArchiveRestore} className="mt-3" onClick={onRestore}>
        Återställ från säkerhetskopia
      </Button>
    </section>
  )
}

function OnboardingFlow({ onLeaving }: { onLeaving: () => void }) {
  const navigate = useNavigate()
  const today = useToday()
  const reduce = useReducedMotion()
  const setProfile = useProfileStore((s) => s.setProfile)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const logWeight = useBodyStore((s) => s.logWeight)
  const [searchParams, setSearchParams] = useSearchParams()
  const depth = useStepDepth()

  const [initial] = useState(loadSaved)
  const [draft, setDraft] = useState<ProfileDraft>(() => initial?.draft ?? emptyDraft())
  const [touched, setTouched] = useState<Partial<Record<ProfileField, boolean>>>({})
  const [attempted, setAttempted] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)

  const rawStep = searchParams.get(STEP_PARAM)
  const requested = parseStep(rawStep)
  const steps = useMemo(() => stepsFor(draft, today), [draft, today])
  // Om ett steg försvinner (takt när målet ändras till att behålla vikten) – gå vidare till kost.
  const found = steps.indexOf(requested)
  let index = found !== -1 ? found : requested === 'takt' ? steps.indexOf('kost') : 0
  // Hoppa aldrig förbi ett steg som inte är klart (t.ex. en direktlänk eller ett utkast som
  // försvunnit när webbläsaren stängt appen).
  for (let i = 1; i < index; i++) {
    if (!canContinue(steps[i], draft, today)) {
      index = i
      break
    }
  }
  const current = steps[index]

  // Riktning för animationen, fokus på rubriken och nollställda fel när steget byts.
  const [shown, setShown] = useState({ index, moved: false, direction: 1 as 1 | -1 })
  if (shown.index !== index) {
    setShown({ index, moved: true, direction: index > shown.index ? 1 : -1 })
    setAttempted(false)
  }
  const { direction, moved } = shown

  useEffect(() => {
    if (moved) window.scrollTo({ top: 0 })
  }, [current, moved])

  // Håll adressen i takt med steget som faktiskt visas.
  useEffect(() => {
    if (rawStep === (current === 'valkommen' ? null : current)) return
    setSearchParams(current === 'valkommen' ? {} : { [STEP_PARAM]: current }, { replace: true, state: depth > 0 ? { onboardingDepth: depth } : null })
  }, [rawStep, current, depth, setSearchParams])

  useEffect(() => {
    save({ draft })
  }, [draft])

  const errors = useMemo(() => validateAbout(draft, today), [draft, today])
  const visibleErrors: Partial<Record<ProfileField, boolean>> = attempted
    ? { sex: true, birthYear: true, heightCm: true, weightKg: true, targetWeightKg: true }
    : touched

  const onChange = useCallback((patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch })), [])
  const onBlurField = useCallback((f: ProfileField) => setTouched((t) => (t[f] ? t : { ...t, [f]: true })), [])

  /** Nästa steg blir en ny post i historiken – då går bakåt i webbläsaren ett steg tillbaka. */
  const goForward = () => {
    setSearchParams({ [STEP_PARAM]: steps[index + 1] }, { state: { onboardingDepth: depth + 1 } })
  }

  const finish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      const profile = buildProfile(draft, { today })
      if (depth > 0) {
        onLeaving()
        navigate(-depth)
      }
      // Provperioden startar när den första profilen är klar (en tidigare start gäller om den finns).
      useLicenseStore.getState().ensureTrialStarted()
      setProfile(profile)
      logWeight(today, Math.round((draft.weightKg as number) * 10) / 10)
      updateSettings({ onboardingDone: true, mindfulMode: draft.goalChoice === 'medvetet' })
      save(null)
      // Be webbläsaren skydda datan mot automatisk rensning (väntar inte på svaret).
      void requestPersistentStorage()
      toast(draft.name.trim() ? `Välkommen, ${draft.name.trim()}!` : 'Välkommen till Lagom!', { tone: 'success' })
      if (depth === 0) navigate('/', { replace: true })
    } catch {
      setFinishing(false)
      toast('Något saknas i profilen – gå tillbaka och kontrollera uppgifterna.', { tone: 'error' })
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!canContinue(current, draft, today)) {
      setAttempted(true)
      if (current === 'om-dig' && hasErrors(errors)) {
        // Flytta fokus till första felaktiga fält (även radiogruppen för kön).
        window.requestAnimationFrame(() => focusFirstInvalid())
      }
      return
    }
    if (current === 'sammanfattning') void finish()
    else goForward()
  }

  const back = () => {
    if (index === 0) return
    // Samma sak som webbläsarens bakåt när föregående steg ligger i historiken.
    if (depth > 0) navigate(-1)
    else setSearchParams(index - 1 === 0 ? {} : { [STEP_PARAM]: steps[index - 1] }, { replace: true })
  }

  const exploreDemo = async () => {
    setDemoLoading(true)
    try {
      const { seedDemoData } = await import('../../lib/demo')
      // Exempeldata startar ingen provperiod – den startar först när den egna profilen skapas
      // (`finish`). Exempeldatan går att titta på men inte att logga i.
      await seedDemoData()
      save(null)
      toast('Exempeldata är inlagd – titta runt så mycket du vill. Tryck på ”Börja med min egen profil” när du vill börja logga; då startar provperioden.', {
        tone: 'success',
      })
      navigate('/', { replace: true })
    } catch {
      setDemoLoading(false)
      toast('Exempeldatan kunde inte läsas in. Försök igen.', { tone: 'error' })
    }
  }

  // --- Återställ från säkerhetskopia (ny telefon) ---
  const fileRef = useRef<HTMLInputElement>(null)
  const [restore, setRestore] = useState<{ backup: BackupFile; summary: ImportSummary; fileName: string } | null>(null)
  const [restoring, setRestoring] = useState(false)

  const onRestoreFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // samma fil ska kunna väljas igen
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      setRestore({ backup, summary: summarizeBackup(backup), fileName: file.name })
    } catch (err) {
      toast(err instanceof BackupError ? err.message : 'Filen kunde inte läsas.', { tone: 'error' })
    }
  }

  const confirmRestore = async () => {
    if (!restore || restoring) return
    // Välkomstflödet betyder oftast en tom app – men fråga hellre en gång för mycket än att skriva över.
    const hasData =
      Object.values(useDiaryStore.getState().entries).some((l) => l.length > 0) ||
      useBodyStore.getState().weights.length > 0 ||
      Object.keys(useFoodStore.getState().customFoods).length > 0 ||
      Object.keys(useFoodStore.getState().recipes).length > 0
    if (hasData) {
      const ok = await confirmDialog({
        title: 'Ersätta det som finns?',
        message: 'Det finns redan data i appen. Den ersätts med innehållet i säkerhetskopian.',
        confirmLabel: 'Ersätt och återställ',
        tone: 'danger',
        icon: ArchiveRestore,
      })
      if (!ok) return
    }
    setRestoring(true)
    try {
      const { clearDemoFlag } = await import('../../lib/demo')
      restoreBackupSafely(restore.backup, 'replace')
      const restoredProfile = useProfileStore.getState().profile !== null
      updateSettings({ onboardingDone: restoredProfile })
      clearDemoFlag()
      save(null)
      void requestPersistentStorage()
      setRestore(null)
      if (restoredProfile) {
        toast('Välkommen tillbaka! Din data är återställd.', { tone: 'success' })
        navigate('/', { replace: true })
      } else {
        setRestoring(false)
        toast('Säkerhetskopian är inläst. Den saknar profil – svara på några snabba frågor så räknar Lagom fram dina mål.')
      }
    } catch {
      setRestoring(false)
      toast('Återställningen misslyckades. Ingen data har ändrats.', { tone: 'error' })
    }
  }

  const eyebrow = index > 0 ? stepText(steps, index) : undefined
  const focus = moved
  const blockedContinue = !canContinue(current, draft, today)

  const variants = {
    enter: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir * 36 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir * -36 }),
  }

  const common = { draft, onChange, today, focusOnMount: focus, eyebrow }
  // I apparna visas flytten från en annan enhet som ett eget kort med steg (se WebMoveCard).
  const inApp = isInApp()
  let body: ReactNode
  switch (current) {
    case 'valkommen':
      body = (
        <>
          <WelcomeStep today={today} />
          {inApp && <WebMoveCard onRestore={() => fileRef.current?.click()} />}
        </>
      )
      break
    case 'mal':
      body = <GoalStep {...common} />
      break
    case 'om-dig':
      body = <AboutStep {...common} errors={errors} visibleErrors={visibleErrors} onBlurField={onBlurField} />
      break
    case 'aktivitet':
      body = <ActivityStep {...common} />
      break
    case 'takt':
      body = <RateStep {...common} showErrors={attempted} />
      break
    case 'kost':
      body = <DietStep {...common} />
      break
    case 'sammanfattning':
      body = <SummaryStep {...common} />
      break
  }

  const welcome = current === 'valkommen'

  return (
    <div className="flex min-h-dvh flex-col">
      {!welcome && (
        <div className="pt-safe sticky top-0 z-30 bg-bg/85 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-3 px-2">
            <IconButton icon={ChevronLeft} aria-label="Föregående steg" onClick={back} noTooltip />
            <div className="flex flex-1 justify-center">
              <ProgressDots steps={steps} current={index} />
            </div>
            <span className="w-11" aria-hidden />
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col" aria-label="Kom igång med Lagom">
        <div className="relative flex-1 overflow-x-clip">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.section
              key={current}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 380, damping: 36, mass: 0.8 }}
              className={welcome ? '' : 'mx-auto w-full max-w-lg px-4 pb-6 pt-4'}
            >
              {body}
            </motion.section>
          </AnimatePresence>
        </div>

        <div className="sticky bottom-0 z-20 bg-linear-to-t from-bg from-70% to-transparent pt-6">
          <div className="mx-auto w-full max-w-lg px-4 pb-[max(1rem,var(--sa-bottom))]">
            {attempted && blockedContinue && current !== 'om-dig' && (
              <p role="alert" className="mb-2 text-center text-[0.875rem] text-ink-2">
                {current === 'mal' || current === 'aktivitet' ? 'Välj ett alternativ för att gå vidare.' : 'Kontrollera uppgifterna ovan.'}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={finishing}
              className={cx(blockedContinue && 'opacity-70')}
              iconRight={current === 'sammanfattning' ? Check : ArrowRight}
            >
              {welcome ? 'Kom igång' : current === 'sammanfattning' ? 'Börja använda Lagom' : 'Fortsätt'}
            </Button>
            {welcome && (
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2">
                <Button type="button" variant="ghost" size="sm" iconLeft={Sparkles} loading={demoLoading} onClick={exploreDemo}>
                  Utforska med exempeldata
                </Button>
                {!inApp && (
                  <Button type="button" variant="ghost" size="sm" iconLeft={ArchiveRestore} onClick={() => fileRef.current?.click()}>
                    Återställ säkerhetskopia
                  </Button>
                )}
                <Link to="/om" className="inline-flex min-h-11 items-center px-2 text-[0.8125rem] font-semibold text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline">
                  Om Lagom
                </Link>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={onRestoreFile}
                  data-testid="aterstall-fil"
                />
              </div>
            )}
          </div>
        </div>
      </form>

      <Sheet
        open={restore !== null}
        onClose={() => {
          if (!restoring) setRestore(null)
        }}
        title="Återställ säkerhetskopia"
        description={restore ? `${restore.fileName} · skapad ${backupDateLabel(restore.backup.exportedAt)}` : undefined}
        footer={
          <Button fullWidth iconLeft={ArchiveRestore} loading={restoring} onClick={confirmRestore}>
            Återställ min data
          </Button>
        }
      >
        {restore && <ImportSummaryList summary={restore.summary} />}
        <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-3">
          Profil, mål, dagbok, vikt, recept och inställningar läses in precis som de var – du behöver inte svara på frågorna igen.
        </p>
      </Sheet>
    </div>
  )
}
