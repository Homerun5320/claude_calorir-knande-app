/**
 * Inställningarna i de inbyggda apparna: raderna och sidorna för Påminnelser och Apple Hälsa
 * (på webben finns de inte – se SettingsPage.test.tsx). Native-koden mockas.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

vi.mock('../../native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../native')>()),
  isNative: () => true,
  loadNative: async () => null,
}))

import SettingsPage from './SettingsPage'
import { DialogHost } from '../../components/ui'
import { useProfileStore } from '../../stores/profileStore'
import { useReminderStore } from '../../stores/reminderStore'

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/installningar', element: <SettingsPage /> },
      { path: '/installningar/:section', element: <SettingsPage /> },
    ],
    { initialEntries: [path] },
  )
  return render(
    <>
      <RouterProvider router={router} />
      <DialogHost />
    </>,
  )
}

beforeAll(async () => {
  await waitFor(() => expect(useProfileStore.persist.hasHydrated() && useReminderStore.persist.hasHydrated()).toBe(true))
})

describe('Inställningar i apparna', () => {
  it('visar raderna för Påminnelser och Apple Hälsa', async () => {
    renderAt('/installningar')
    const reminders = await screen.findByRole('link', { name: /Påminnelser/ })
    expect(reminders).toHaveAttribute('href', '/installningar/paminnelser')
    expect(reminders).toHaveTextContent('Av')
    expect(screen.getByRole('link', { name: /Apple Hälsa/ })).toHaveAttribute('href', '/installningar/halsa')
  })

  it('öppnar sektionerna', async () => {
    const { unmount } = renderAt('/installningar/paminnelser')
    expect(await screen.findByRole('heading', { level: 1, name: 'Påminnelser' })).toBeInTheDocument()
    unmount()
    renderAt('/installningar/halsa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Apple Hälsa' })).toBeInTheDocument()
  })
})
