/**
 * Mål och makron → Veckobudget: reglaget, förvalen (Fredagsmys, Helg, Egen), veckotabellen med
 * varje dags mål, att summan alltid är 0, att ingen dag kan hamna under golvet och att
 * graviditet ger en vänlig förklaring i stället för en veckobudget.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { GoalsSection } from './GoalsSection'
import { todayISO } from '../../../lib/dates'
import { computeEnergy, computeTargets } from '../../../lib/energy'
import { formatEnergy } from '../../../lib/format'
import { presetShift, shiftSum } from '../../../lib/weeklyBudget'
import { useBodyStore } from '../../../stores/bodyStore'
import { useDiaryStore } from '../../../stores/diaryStore'
import { useFoodStore } from '../../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../../stores/profileStore'
import type { Profile } from '../../../types'

MotionGlobalConfig.skipAnimations = true

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore]

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

function renderGoals() {
  return render(
    <MemoryRouter>
      <GoalsSection />
    </MemoryRouter>,
  )
}

const saved = () => useProfileStore.getState().settings.weeklyBudget
/** Testing Library slår ihop blanksteg (även hårda mellanslag) – gör likadant med förväntningen. */
const energy = (kcal: number) => formatEnergy(kcal).replace(/\s+/g, ' ')

function setProfile(patch: Partial<Profile> = {}, weeklyBudget?: { enabled: boolean; shift: number[] }) {
  useProfileStore.setState({ profile: { ...PROFILE, ...patch }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true, adaptiveTargets: false, weeklyBudget } })
}

function weekTable() {
  return screen.getByRole('table', { name: 'Dagsmål per veckodag med veckobudgeten' })
}

function row(day: string) {
  return within(weekTable()).getByRole('row', { name: new RegExp(`^${day}`) })
}

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useBodyStore.getState().clearBody()
  setProfile()
})

describe('Veckobudget i Mål och makron', () => {
  it('reglaget slår på Fredagsmys med en tydlig veckotabell', () => {
    renderGoals()
    const base = computeTargets(PROFILE, 70, {}, { today: todayISO() }).kcal
    expect(screen.getByText(/Samma energi över veckan – bara fördelad så som ditt liv ser ut/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Veckobudget' }))
    // Gäller från idag – dagar som redan har varit behåller det jämna dagsmålet.
    expect(saved()).toEqual({ enabled: true, shift: presetShift('fredagsmys', 300), since: todayISO() })
    expect(screen.getByRole('radio', { name: 'Fredagsmys' })).toHaveAttribute('aria-checked', 'true')

    expect(within(weekTable()).getAllByRole('row')).toHaveLength(8)
    expect(within(row('Fredag')).getByText(`+${energy(300)}`)).toBeInTheDocument()
    expect(within(row('Fredag')).getByText(energy(base + 300))).toBeInTheDocument()
    expect(within(row('Måndag')).getByText(`−${energy(120)}`)).toBeInTheDocument()
    expect(within(row('Måndag')).getByText(energy(base - 120))).toBeInTheDocument()
    expect(screen.getByText(/Veckans summa:/).textContent).toContain(formatEnergy(7 * base))
    expect(screen.getByText(/Veckans summa:/).textContent).toContain('samma som sju dagar')
  })

  it('Helg och mer extra per dag', () => {
    setProfile({}, { enabled: true, shift: presetShift('fredagsmys', 300) })
    renderGoals()
    fireEvent.click(screen.getByRole('radio', { name: 'Helg' }))
    expect(saved()?.shift).toEqual(presetShift('helg', 300))
    fireEvent.click(screen.getByRole('button', { name: 'Öka extra per dag' }))
    expect(saved()?.shift).toEqual(presetShift('helg', 350))
    expect(within(row('Söndag')).getByText(`+${energy(350)}`)).toBeInTheDocument()
    // Ned till 0: förvalet ligger kvar och veckan blir jämn.
    const minus = screen.getByRole('button', { name: 'Minska extra per dag' })
    for (let i = 0; i < 7; i++) fireEvent.click(minus)
    expect(saved()?.shift).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(screen.getByRole('radio', { name: 'Helg' })).toHaveAttribute('aria-checked', 'true')
  })

  it('Egen: steg om 50 kcal per dag – summan förblir 0', () => {
    setProfile({}, { enabled: true, shift: presetShift('fredagsmys', 300) })
    renderGoals()
    fireEvent.click(screen.getByRole('radio', { name: 'Egen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mer energi på fredag' }))
    const shift = saved()?.shift ?? []
    expect(shift[4]).toBe(350)
    expect(shiftSum(shift)).toBe(0)
    // Lördagen (också extra) ligger kvar.
    expect(shift[5]).toBe(300)
    fireEvent.click(screen.getByRole('button', { name: 'Mindre energi på tisdag' }))
    expect(saved()?.shift[1]).toBe(shift[1] - 50)
    expect(shiftSum(saved()?.shift ?? [])).toBe(0)
    // Egen gäller kvar även om fördelningen råkar likna ett förval.
    expect(screen.getByRole('radio', { name: 'Egen' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Jämn vecka' }))
    expect(saved()?.shift).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('ingen dag kan hamna under golvet', () => {
    // Viktnedgång 0,5 kg/vecka: basmålet ligger en bit över golvet för egna mål.
    setProfile({ goal: 'ga_ner' }, { enabled: true, shift: presetShift('fredagsmys', 300) })
    renderGoals()
    const today = todayISO()
    const floor = computeEnergy({ ...PROFILE, goal: 'ga_ner' }, 70, { today }).overrideFloor.kcal
    const plus = screen.getByRole('button', { name: 'Öka extra per dag' })
    for (let i = 0; i < 40 && !(plus as HTMLButtonElement).disabled; i++) fireEvent.click(plus)
    expect((plus as HTMLButtonElement).disabled).toBe(true)
    const base = computeTargets({ ...PROFILE, goal: 'ga_ner' }, 70, {}, { today }).kcal
    for (const v of saved()?.shift ?? []) expect(base + v).toBeGreaterThanOrEqual(floor)
  })

  it('utan utrymme (lågt BMI): en vänlig förklaring och ingen dag under underhållet', () => {
    setProfile({ goal: 'ga_ner', startWeightKg: 50 })
    renderGoals()
    fireEvent.click(screen.getByRole('switch', { name: 'Veckobudget' }))
    expect(screen.getByText(/Just nu finns inget utrymme att flytta energi/)).toBeInTheDocument()
    expect(saved()?.shift).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(screen.getByRole('button', { name: 'Öka extra per dag' })).toBeDisabled()
  })

  it('avstängd: fördelningen sparas för nästa gång', () => {
    setProfile({}, { enabled: true, shift: presetShift('helg', 200) })
    renderGoals()
    fireEvent.click(screen.getByRole('switch', { name: 'Veckobudget' }))
    expect(saved()).toEqual({ enabled: false, shift: presetShift('helg', 200) })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('medvetet läge: inga siffror – bara reglaget och förvalen', () => {
    setProfile({}, { enabled: true, shift: presetShift('fredagsmys', 300) })
    useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: true } }))
    renderGoals()
    const card = screen.getByRole('switch', { name: 'Veckobudget' }).closest('section') ?? document.body
    expect(screen.queryByRole('table', { name: /Dagsmål per veckodag/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Öka extra per dag' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Veckans summa:/)).not.toBeInTheDocument()
    expect(screen.getByText(/Siffrorna vilar i medvetet läge/)).toBeInTheDocument()
    expect(card.textContent).not.toMatch(/\d\s?(kcal|kJ)/)
    // Förvalen går ändå att byta.
    fireEvent.click(screen.getByRole('radio', { name: 'Helg' }))
    expect(saved()?.shift).toEqual(presetShift('helg', 300))
  })

  it('graviditet: ingen veckobudget, förklarat vänligt', () => {
    setProfile({ lifeStage: 'gravid' }, { enabled: true, shift: presetShift('fredagsmys', 300) })
    renderGoals()
    expect(screen.getByRole('switch', { name: 'Veckobudget' })).toBeDisabled()
    expect(screen.getByText(/Under graviditeten mår kropp och barn bäst av jämn energi varje dag/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('under 18 år: ingen veckobudget', () => {
    setProfile({ birthYear: Number(todayISO().slice(0, 4)) - 16 })
    renderGoals()
    expect(screen.getByRole('switch', { name: 'Veckobudget' })).toBeDisabled()
    expect(screen.getByText(/Under 18 år behöver kroppen jämn energi varje dag/)).toBeInTheDocument()
  })
})
