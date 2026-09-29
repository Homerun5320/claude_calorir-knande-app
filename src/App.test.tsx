/**
 * Gate i App.tsx: nya användare skickas till välkomstflödet – men en delningslänk (#/dela?d=…) som
 * öppnades innan profilen fanns tappas inte, utan öppnas när välkomstflödet är klart.
 */
import { act, render, waitFor } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { useProfileStore } from './stores/profileStore'

MotionGlobalConfig.skipAnimations = true

beforeAll(() => {
  // AppShell scrollar till toppen vid sidbyte och följer systemets tema – jsdom saknar båda.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe('Gate och delningslänkar', () => {
  it('öppnar en delningslänk efter välkomstflödet i stället för att tappa den', async () => {
    window.location.hash = '#/dela?d=j.test'
    // Routern läser adressen när modulen laddas.
    const { default: App } = await import('./App')
    render(<App />)
    await waitFor(() => expect(window.location.hash).toBe('#/valkommen'))

    // Välkomstflödet är klart och appen landar på startsidan …
    act(() => {
      useProfileStore.getState().updateSettings({ onboardingDone: true })
      window.location.hash = '#/'
    })
    // … och går vidare till länken.
    await waitFor(() => expect(window.location.hash).toBe('#/dela?d=j.test'))

    // Bara en gång: nästa besök på startsidan stannar där.
    act(() => {
      window.location.hash = '#/'
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(window.location.hash).toBe('#/')
  })
})
