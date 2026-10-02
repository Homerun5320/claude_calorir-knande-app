/**
 * Inställningar → Profil: "Spara profilen"-listan klibbar ovanför bottennavigeringen och får inte
 * skymma fokuserade fält (WCAG 2.4.11). Så länge listan syns – med felraden när något saknas –
 * håller scroll-padding på <html> fokus ovanför den, och värdet släpps när listan går.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { ProfileSection } from './ProfileSection'
import { DialogHost } from '../../../components/ui'
import { todayISO } from '../../../lib/dates'
import { useBodyStore } from '../../../stores/bodyStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../../stores/profileStore'
import type { Profile } from '../../../types'

MotionGlobalConfig.skipAnimations = true

const html = document.documentElement

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 76,
  activityLevel: 'latt',
  goal: 'ga_ner',
  weeklyRateKg: 0.5,
  targetWeightKg: 68,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: new Date(2026, 8, 1).getTime(),
}

/** ResizeObserver-ersättare som testet själv kan utlösa. */
const observers = new Set<() => void>()
class FakeResizeObserver {
  private readonly callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
  }
  observe() {
    observers.add(this.callback)
  }
  disconnect() {
    observers.delete(this.callback)
  }
}

function renderProfile() {
  // Dataroutern behövs för useBlocker (frågar innan osparade ändringar går förlorade).
  const router = createMemoryRouter([{ path: '/installningar/profil', element: <ProfileSection /> }], { initialEntries: ['/installningar/profil'] })
  return render(
    <>
      <RouterProvider router={router} />
      <DialogHost />
    </>,
  )
}

const length = () => screen.getByRole('spinbutton', { name: /Längd/ })

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  useBodyStore.setState({ weights: [{ id: 'w1', date: todayISO(), kg: 74, createdAt: 0 }], measurements: [] })
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
  html.style.scrollPaddingBottom = ''
  // jsdom har ingen layout: den klibbiga listan är 62 px hög, och 102 px med felraden.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains('sticky') ? (this.querySelector('[role="alert"]') ? 102 : 62) : 0
    return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  observers.clear()
  html.style.scrollPaddingBottom = ''
})

describe('ProfileSection – Spara profilen-listan', () => {
  it('rör inte scroll-padding innan något är ändrat', () => {
    renderProfile()
    expect(screen.queryByRole('button', { name: /Spara profilen/ })).not.toBeInTheDocument()
    expect(html.style.scrollPaddingBottom).toBe('')
  })

  it('håller fokus ovanför listan när något ändras, och släpper det när ändringen ångras', async () => {
    renderProfile()
    fireEvent.change(length(), { target: { value: '172' } })
    await screen.findByRole('button', { name: /Spara profilen/ })
    // 62 px lista + 8 px luft för fokusramen (sticky utan layout i jsdom: avståndet till kanten 0).
    expect(html.style.scrollPaddingBottom).toBe('70px')

    fireEvent.click(screen.getByRole('button', { name: 'Ångra' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Spara profilen/ })).not.toBeInTheDocument())
    expect(html.style.scrollPaddingBottom).toBe('')
  })

  it('räknar med felraden när den gör listan högre', async () => {
    renderProfile()
    fireEvent.change(length(), { target: { value: '50' } })
    fireEvent.click(await screen.findByRole('button', { name: /Spara profilen/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kontrollera de markerade fälten.')
    // ResizeObserver meddelar att listan blev högre: 102 + 8.
    act(() => observers.forEach((cb) => cb()))
    expect(html.style.scrollPaddingBottom).toBe('110px')

    // Rättar man värdet försvinner felraden och padding krymper igen.
    fireEvent.change(length(), { target: { value: '172' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    act(() => observers.forEach((cb) => cb()))
    expect(html.style.scrollPaddingBottom).toBe('70px')
  })

  it('släpper scroll-padding när sidan lämnas med osparade ändringar', async () => {
    const { unmount } = renderProfile()
    fireEvent.change(length(), { target: { value: '172' } })
    await screen.findByRole('button', { name: /Spara profilen/ })
    expect(html.style.scrollPaddingBottom).toBe('70px')
    unmount()
    expect(html.style.scrollPaddingBottom).toBe('')
  })
})
