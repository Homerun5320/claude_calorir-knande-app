/**
 * Stor text (200 %) i Inställningar: profilkortet och Livsmedelsdatabas-kortet får brytas i stället för
 * att klippas med "…" eller tvinga fram vågrät scroll. Profilkortet byter layout med en containerfråga
 * (`@max-[14rem]`; rem följer rotens teckenstorlek, så vid normal text ≈ 20 rem gäller den aldrig).
 * Se ../../components/domain/largeText.test.tsx.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import SettingsPage from './SettingsPage'
import { DatabaseSection } from './sections/DatabaseSection'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Profile } from '../../types'

MotionGlobalConfig.skipAnimations = true

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
  createdAt: new Date(2026, 8, 1).getTime(),
}

beforeAll(async () => {
  await waitFor(() => expect(useProfileStore.persist.hasHydrated()).toBe(true))
})

describe('stor text – Inställningar', () => {
  it('profilkortet: avataren döljs och texten får flera rader när kortet är smalt', () => {
    useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
    const router = createMemoryRouter([{ path: '/installningar', element: <SettingsPage /> }], { initialEntries: ['/installningar'] })
    render(<RouterProvider router={router} />)
    const name = screen.getByText('Hej, Anna')
    const card = name.closest('a') as HTMLElement
    expect(card).toHaveClass('@container')
    // Normal text: en rad med "…". Stor text: två respektive tre rader.
    expect(name).toHaveClass('truncate', '@max-[14rem]:line-clamp-2', '@max-[14rem]:whitespace-normal')
    const summary = screen.getByText(/Kvinna · \d+ år · 168 cm/)
    expect(summary).toHaveClass('truncate', '@max-[14rem]:line-clamp-3', '@max-[14rem]:whitespace-normal')
    const avatar = name.parentElement?.previousElementSibling as HTMLElement
    expect(avatar).toHaveClass('@max-[14rem]:hidden')
  })

  it('Livsmedelsdatabas: siffran och texten bryts, och punktlistans texter får krympa', async () => {
    const { container } = render(
      <MemoryRouter>
        <DatabaseSection />
      </MemoryRouter>,
    )
    const label = await screen.findByText('livsmedel att söka bland')
    expect(label.parentElement).toHaveClass('flex-wrap')
    const items = Array.from(container.querySelectorAll('ul > li.flex'))
    expect(items.length).toBeGreaterThan(0)
    for (const li of items) expect(li.lastElementChild).toHaveClass('min-w-0', 'break-words')
  })
})
