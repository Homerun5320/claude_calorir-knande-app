/**
 * Stegfältet sparar efter en paus: att skriva "12000" siffra för siffra eller trycka flera gånger
 * på −/+ blir en enda skrivning av dagboken. Fältet sparar direkt när det lämnas, när kortet
 * försvinner, när dagen byts (på den gamla dagen) och när sidan göms eller stängs, och följer steg
 * som ändras utifrån (Apple Hälsa/Health Connect) när inget väntar på att sparas.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Mock } from 'vitest'
import { useToastStore } from '../../../components/ui'
import { SAVE_DELAY_MS } from '../../../hooks/useDeferredSave'
import { addDays, todayISO } from '../../../lib/dates'
import { useDiaryStore } from '../../../stores/diaryStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../../stores/profileStore'
import type { ExerciseEntry, ISODate, Profile } from '../../../types'
import type { BodyBasics } from '../hooks'
import { STEPS_ACTIVITY_ID } from '../activityLogic'
import { StepsCard } from './StepsCard'

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.25,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

const BASICS: BodyBasics = { weightKg: 70, weightKnown: true, heightCm: 168, activityLevel: 'latt' }
const NO_EXERCISE: readonly ExerciseEntry[] = []

type SetDayMeta = ReturnType<typeof useDiaryStore.getState>['setDayMeta']
let originalSetDayMeta: SetDayMeta
let setDayMeta: Mock<SetDayMeta>
/** Antal skrivningar av dagboken där dagarnas uppgifter ändrades. */
let dayWrites = 0
let unsubscribe = () => {}

function Card({ date }: { date: ISODate }) {
  const exercise = useDiaryStore((s) => s.exercise[date] ?? NO_EXERCISE)
  return <StepsCard date={date} isToday={date === todayISO()} exercise={exercise} basics={BASICS} mindful={false} />
}

const field = () => screen.getByRole('spinbutton', { name: /^Steg (idag|den här dagen)$/ })
const storedSteps = (date: ISODate = todayISO()) => useDiaryStore.getState().days[date]?.steps

function typeDigits(input: HTMLElement, text: string) {
  for (let i = 1; i <= text.length; i++) {
    fireEvent.change(input, { target: { value: text.slice(0, i) } })
    act(() => {
      vi.advanceTimersByTime(120)
    })
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeAll(async () => {
  await waitFor(() => expect(useDiaryStore.persist.hasHydrated() && useProfileStore.persist.hasHydrated()).toBe(true))
  originalSetDayMeta = useDiaryStore.getState().setDayMeta
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ profile: PROFILE, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
  setDayMeta = vi.fn(originalSetDayMeta)
  useDiaryStore.setState({ setDayMeta })
  dayWrites = 0
  unsubscribe = useDiaryStore.subscribe((s, prev) => {
    if (s.days !== prev.days) dayWrites++
  })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  unsubscribe()
  useDiaryStore.setState({ setDayMeta: originalSetDayMeta })
  delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState
})

describe('StepsCard', () => {
  it('sparar "12000" siffra för siffra med en enda skrivning efter pausen', () => {
    const today = todayISO()
    render(<Card date={today} />)
    typeDigits(field(), '12000')
    expect(field()).toHaveValue('12000')
    // Uppskattningen följer det som står i fältet direkt, innan något har sparats.
    expect(screen.getByText('Sträcka')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lägg till som aktivitet' })).toBeInTheDocument()
    expect(setDayMeta).not.toHaveBeenCalled()
    expect(storedSteps()).toBeUndefined()

    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS)
    })
    expect(setDayMeta).toHaveBeenCalledTimes(1)
    expect(setDayMeta).toHaveBeenCalledWith(today, { steps: 12000 })
    expect(dayWrites).toBe(1)
    expect(storedSteps()).toBe(12000)
    expect(field()).toHaveValue('12000')
  })

  it('sparar direkt när fältet lämnas', () => {
    render(<Card date={todayISO()} />)
    fireEvent.change(field(), { target: { value: '8500' } })
    fireEvent.blur(field())
    expect(setDayMeta).toHaveBeenCalledTimes(1)
    expect(storedSteps()).toBe(8500)
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS * 2)
    })
    expect(dayWrites).toBe(1)
  })

  it('sparar det som väntar när kortet försvinner', () => {
    const { unmount } = render(<Card date={todayISO()} />)
    fireEvent.change(field(), { target: { value: '4321' } })
    unmount()
    expect(setDayMeta).toHaveBeenCalledTimes(1)
    expect(storedSteps()).toBe(4321)
  })

  it('sparar när sidan göms eller stängs', () => {
    render(<Card date={todayISO()} />)
    fireEvent.change(field(), { target: { value: '3000' } })
    setVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(storedSteps()).toBe(3000)

    setVisibility('visible')
    fireEvent.change(field(), { target: { value: '3500' } })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(storedSteps()).toBe(3500)
    expect(setDayMeta).toHaveBeenCalledTimes(2)
  })

  it('flera tryck på −/+ i rad blir en skrivning', () => {
    useDiaryStore.getState().setDayMeta(todayISO(), { steps: 6000 })
    setDayMeta.mockClear()
    dayWrites = 0
    render(<Card date={todayISO()} />)
    const plus = screen.getByRole('button', { name: 'Öka steg idag' })
    const minus = screen.getByRole('button', { name: 'Minska steg idag' })
    fireEvent.click(plus)
    fireEvent.click(plus)
    fireEvent.click(plus)
    fireEvent.click(minus)
    expect(field()).toHaveValue('7000')
    expect(setDayMeta).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS)
    })
    expect(setDayMeta).toHaveBeenCalledTimes(1)
    expect(dayWrites).toBe(1)
    expect(storedSteps()).toBe(7000)
  })

  it('tömt fält sparar inga steg', () => {
    useDiaryStore.getState().setDayMeta(todayISO(), { steps: 5000 })
    render(<Card date={todayISO()} />)
    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.blur(field())
    expect(storedSteps()).toBeUndefined()
    expect(useDiaryStore.getState().days[todayISO()]).toHaveProperty('steps', undefined)
  })

  it('skriver inget när värdet inte ändras', () => {
    useDiaryStore.getState().setDayMeta(todayISO(), { steps: 5000 })
    setDayMeta.mockClear()
    render(<Card date={todayISO()} />)
    fireEvent.change(field(), { target: { value: '50000' } })
    fireEvent.change(field(), { target: { value: '5000' } })
    fireEvent.blur(field())
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS * 2)
    })
    expect(setDayMeta).not.toHaveBeenCalled()
  })

  it('följer steg som ändras utifrån när inget väntar', () => {
    const today = todayISO()
    render(<Card date={today} />)
    act(() => {
      useDiaryStore.getState().setDayMetas([{ date: today, patch: { steps: 9100 } }])
    })
    expect(field()).toHaveValue('9100')
    expect(screen.getByText('Sträcka')).toBeInTheDocument()
  })

  it('behåller det man håller på att skriva när stegen ändras utifrån', () => {
    const today = todayISO()
    render(<Card date={today} />)
    fireEvent.change(field(), { target: { value: '2500' } })
    act(() => {
      useDiaryStore.getState().setDayMetas([{ date: today, patch: { steps: 9100 } }])
    })
    expect(field()).toHaveValue('2500')
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS)
    })
    expect(storedSteps()).toBe(2500)
    expect(field()).toHaveValue('2500')
  })

  it('sparar på den gamla dagen när dagen byts och visar den nya dagens steg', () => {
    const today = todayISO()
    const yesterday = addDays(today, -1)
    useDiaryStore.getState().setDayMeta(yesterday, { steps: 4000 })
    setDayMeta.mockClear()
    const { rerender } = render(<Card date={today} />)
    fireEvent.change(field(), { target: { value: '11000' } })
    rerender(<Card date={yesterday} />)
    expect(setDayMeta).toHaveBeenCalledTimes(1)
    expect(setDayMeta).toHaveBeenCalledWith(today, { steps: 11000 })
    expect(storedSteps(today)).toBe(11000)
    expect(storedSteps(yesterday)).toBe(4000)
    expect(screen.getByRole('spinbutton', { name: 'Steg den här dagen' })).toHaveValue('4000')
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS * 2)
    })
    expect(setDayMeta).toHaveBeenCalledTimes(1)
  })

  it('"Lägg till som aktivitet" sparar stegen först och bygger på det sparade värdet', () => {
    const today = todayISO()
    render(<Card date={today} />)
    fireEvent.change(field(), { target: { value: '12000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till som aktivitet' }))
    expect(storedSteps()).toBe(12000)
    const entry = useDiaryStore.getState().exercise[today]?.[0]
    expect(entry).toMatchObject({ activityId: STEPS_ACTIVITY_ID, minutes: 45 })
    expect(entry?.kcal).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Stegen finns med bland aktiviteterna' })).toBeDisabled()

    // Fler steg: aktiviteten uppdateras med det nya, sparade värdet.
    fireEvent.change(field(), { target: { value: '14000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Uppdatera stegaktiviteten' }))
    expect(storedSteps()).toBe(14000)
    const updated = useDiaryStore.getState().exercise[today]?.[0]
    expect(updated?.minutes).toBeGreaterThan(45)
    expect(setDayMeta).toHaveBeenCalledTimes(2)
  })
})
