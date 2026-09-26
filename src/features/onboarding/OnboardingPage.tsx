/**
 * Välkomstflödet (/valkommen) – lugnt, snabbt (under en minut) och en fråga per steg.
 *
 * 0 Välkommen → 1 Mål → 2 Om dig → 3 Vardagsaktivitet → 4 Takt & målvikt (vid gå ner/upp)
 * → 5 Kost → 6 Sammanfattning. Utkastet sparas i sessionStorage så att inget försvinner om sidan
 * laddas om. Enter går vidare, tillbaka-knappen går ett steg bakåt.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate, Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ChevronLeft, Check, Sparkles } from 'lucide-react'
import { Button, IconButton, toast, cx } from '../../components/ui'
import { PageFallback } from '../../components/layout/AppShell'
import { useToday } from '../../hooks/useToday'
import { requestPersistentStorage } from '../../lib/backup'
import { useBodyStore } from '../../stores/bodyStore'
import { useHydrated } from '../../stores/hydration'
import { useProfileStore } from '../../stores/profileStore'
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

interface Saved {
  draft: ProfileDraft
  step: OnboardingStep
}

function loadSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { draft?: unknown; step?: unknown }
    return { draft: reviveDraft(parsed.draft), step: (typeof parsed.step === 'string' ? parsed.step : 'valkommen') as OnboardingStep }
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

export default function OnboardingPage() {
  const hydrated = useHydrated()
  const done = useProfileStore((s) => s.settings.onboardingDone && s.profile !== null)
  if (!hydrated) return <PageFallback />
  if (done) return <Navigate to="/" replace />
  return <OnboardingFlow />
}

function ProgressDots({ steps, current }: { steps: readonly OnboardingStep[]; current: number }) {
  const reduce = useReducedMotion()
  // Välkomststeget räknas inte.
  const total = steps.length - 1
  const index = current - 1
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-label="Förlopp" aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-valuetext={`Steg ${index + 1} av ${total}`}>
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

function OnboardingFlow() {
  const navigate = useNavigate()
  const today = useToday()
  const reduce = useReducedMotion()
  const setProfile = useProfileStore((s) => s.setProfile)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const logWeight = useBodyStore((s) => s.logWeight)

  const [initial] = useState(loadSaved)
  const [draft, setDraft] = useState<ProfileDraft>(() => initial?.draft ?? emptyDraft())
  const [step, setStep] = useState<OnboardingStep>(() => initial?.step ?? 'valkommen')
  const [direction, setDirection] = useState<1 | -1>(1)
  const [touched, setTouched] = useState<Partial<Record<ProfileField, boolean>>>({})
  const [attempted, setAttempted] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const navigated = useRef(false)

  const steps = useMemo(() => stepsFor(draft, today), [draft, today])
  // Om ett steg försvinner (takt när målet ändras till att behålla vikten) – gå vidare till kost.
  const found = steps.indexOf(step)
  const index = found !== -1 ? found : step === 'takt' ? steps.indexOf('kost') : 0
  const current = steps[index]

  useEffect(() => {
    save({ draft, step: current })
  }, [draft, current])

  const errors = useMemo(() => validateAbout(draft, today), [draft, today])
  const visibleErrors: Partial<Record<ProfileField, boolean>> = attempted
    ? { sex: true, birthYear: true, heightCm: true, weightKg: true, targetWeightKg: true }
    : touched

  const onChange = useCallback((patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch })), [])
  const onBlurField = useCallback((f: ProfileField) => setTouched((t) => (t[f] ? t : { ...t, [f]: true })), [])

  const goTo = (next: number, dir: 1 | -1) => {
    navigated.current = true
    setDirection(dir)
    setAttempted(false)
    setStep(steps[next])
    window.scrollTo({ top: 0 })
  }

  const finish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      const profile = buildProfile(draft, { today })
      setProfile(profile)
      logWeight(today, Math.round((draft.weightKg as number) * 10) / 10)
      updateSettings({ onboardingDone: true, mindfulMode: draft.goalChoice === 'medvetet' })
      save(null)
      // Be webbläsaren skydda datan mot automatisk rensning (väntar inte på svaret).
      void requestPersistentStorage()
      toast(draft.name.trim() ? `Välkommen, ${draft.name.trim()}!` : 'Välkommen till Lagom!', { tone: 'success' })
      navigate('/', { replace: true })
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
        // Flytta fokus till första felaktiga fält.
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      }
      return
    }
    if (current === 'sammanfattning') void finish()
    else goTo(index + 1, 1)
  }

  const back = () => {
    if (index > 0) goTo(index - 1, -1)
  }

  const exploreDemo = async () => {
    setDemoLoading(true)
    try {
      const { seedDemoData } = await import('../../lib/demo')
      await seedDemoData()
      save(null)
      toast('Exempeldata är inlagd – rensa den när du vill under Inställningar → Data.', { tone: 'success' })
      navigate('/', { replace: true })
    } catch {
      setDemoLoading(false)
      toast('Exempeldatan kunde inte läsas in. Försök igen.', { tone: 'error' })
    }
  }

  const eyebrow = index > 0 ? `Steg ${index} av ${steps.length - 1}` : undefined
  const focus = navigated.current
  const blockedContinue = !canContinue(current, draft, today)

  const variants = {
    enter: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir * 36 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: dir * -36 }),
  }

  const common = { draft, onChange, today, focusOnMount: focus, eyebrow }
  let body: ReactNode
  switch (current) {
    case 'valkommen':
      body = <WelcomeStep today={today} />
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
          <div className="mx-auto w-full max-w-lg px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
                <Link to="/om" className="inline-flex min-h-11 items-center px-2 text-[0.8125rem] font-semibold text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline">
                  Om Lagom
                </Link>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
