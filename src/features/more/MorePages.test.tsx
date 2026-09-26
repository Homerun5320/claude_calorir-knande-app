/**
 * Röktester för Mer, Om Lagom och Matkalendern: renderas utan renderingsloopar, visar levande
 * nyckeltal, respekterar medvetet läge och länkar rätt.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import MorePage from './MorePage'
import AboutPage from './AboutPage'
import FoodCalendarPage from './FoodCalendarPage'
import { todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { LAST_BACKUP_KEY } from '../settings/backupStatus'
import type { Profile } from '../../types'

MotionGlobalConfig.skipAnimations = true

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 76,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: Date.now() - 2 * 86_400_000,
}

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  localStorage.clear()
  useDiaryStore.getState().clearDiary()
  useFoodStore.getState().clearFoods()
  useFastingStore.getState().clearFasting()
  useBodyStore.setState({ weights: [{ id: 'w1', date: todayISO(), kg: 72.4, createdAt: 0 }], measurements: [] })
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('MorePage', () => {
  it('visar alla kort med levande nyckeltal', () => {
    useDiaryStore.getState().addWater(todayISO(), 750)
    useFastingStore.getState().startFast(16, '16:8', Date.now() - (2 * 60 + 5) * 60_000)
    inRouter(<MorePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mer' })).toBeInTheDocument()
    expect(screen.getByText('Anna, dag 3 med Lagom')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Mer i Lagom' })
    for (const [name, href] of [
      ['Vikt & mått', '/vikt'],
      ['Recept', '/recept'],
      ['Träning', '/traning'],
      ['Dryck', '/dryck'],
      ['Fasta', '/fasta'],
      ['Matkalender', '/matkalender'],
      ['Insikter', '/insikter'],
      ['Inställningar', '/installningar'],
      ['Om Lagom', '/om'],
    ] as const) {
      expect(within(nav).getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', href)
    }
    expect(within(nav).getByText(/72,4 kg · idag/)).toBeInTheDocument()
    expect(within(nav).getByText(/0,75 l vatten idag/)).toBeInTheDocument()
    expect(within(nav).getByText('Pågår · 2 h 5 min')).toBeInTheDocument()
  })

  it('döljer vikten i medvetet läge', () => {
    useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: true } }))
    inRouter(<MorePage />)
    expect(screen.queryByText(/72,4 kg/)).not.toBeInTheDocument()
    expect(screen.getByText('Senast vägd idag')).toBeInTheDocument()
  })

  it('påminner om säkerhetskopia när det finns data men ingen kopia', () => {
    const { unmount } = inRouter(<MorePage />)
    expect(screen.getByRole('link', { name: /Gör din första säkerhetskopia/ })).toHaveAttribute('href', '/installningar/data')
    unmount()
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()))
    inRouter(<MorePage />)
    expect(screen.queryByText(/säkerhetskopia/)).not.toBeInTheDocument()
  })

  it('öppnar Stöd & hjälp', async () => {
    inRouter(<MorePage />)
    fireEvent.click(screen.getByRole('button', { name: /Stöd & hjälp/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Stöd & hjälp' })
    expect(within(dialog).getByRole('link', { name: /alkoholhjalpen\.se/ })).toHaveAttribute('href', 'https://alkoholhjalpen.se')
    expect(within(dialog).getByRole('link', { name: 'Ring 1177' })).toHaveAttribute('href', 'tel:1177')
  })
})

describe('AboutPage', () => {
  it('beskriver hur Lagom löser problemen och listar källor', () => {
    inRouter(<AboutPage />)
    expect(screen.getByRole('heading', { name: 'Så löser Lagom problemen med andra kaloriappar' })).toBeInTheDocument()
    expect(screen.getByText(/Okända värden visas som 0/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Livsmedelsverkets livsmedelsdatabas/ })).toHaveAttribute('href', 'https://soknaringsinnehall.livsmedelsverket.se/')
    expect(screen.getByRole('link', { name: /Open Food Facts/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /2024 Adult Compendium/ })).toBeInTheDocument()
    expect(screen.getByText('Inte en medicinteknisk produkt')).toBeInTheDocument()
    expect(screen.getByText(/Version \d+\.\d+\.\d+/)).toBeInTheDocument()
  })

  it('erbjuder att komma igång före välkomstflödet', () => {
    useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS } })
    inRouter(<AboutPage />)
    expect(screen.getByRole('link', { name: 'Kom igång' })).toHaveAttribute('href', '/valkommen')
  })
})

describe('FoodCalendarPage', () => {
  it('visar kommande matdagar, säsong och dagsljus', async () => {
    inRouter(<FoodCalendarPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Svensk matkalender' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kommande matdagar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Säsong i / })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dagsljus i Stockholm' })).toBeInTheDocument()
    expect(screen.getByText('Solen är uppe')).toBeInTheDocument()
    // Säsongens råvaror länkar till sök
    const produceLinks = screen.getAllByRole('link', { name: /^Sök efter / })
    expect(produceLinks.length).toBeGreaterThan(0)
    expect(produceLinks[0].getAttribute('href')).toMatch(/^\/lagg-till\?q=/)

    // Öppna första kommande matdagen
    const upcoming = within(screen.getByRole('heading', { name: 'Kommande matdagar' }).closest('section') as HTMLElement).getAllByRole('button')
    fireEvent.click(upcoming[0])
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getAllByRole('link').some((a) => a.getAttribute('href')?.startsWith('/lagg-till?q='))).toBe(true)
  })

  it('visar veckans traditioner', () => {
    inRouter(<FoodCalendarPage />)
    expect(screen.getByRole('button', { name: /Ärtsoppa och pannkakor/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fredagsmys/ })).toBeInTheDocument()
  })
})
