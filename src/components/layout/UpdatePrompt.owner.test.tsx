/**
 * Ägarens privata webbversion (OWNER_ONLY): en ny version tas i bruk direkt, utan notis.
 * Det vanliga flödet med notisen testas i layout.test.tsx.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UpdatePrompt from './UpdatePrompt'
import { ToastViewport } from '../ui/toast'

const pwa = vi.hoisted(() => ({
  needRefresh: false,
  updateServiceWorker: vi.fn(async (_reload?: boolean) => {}),
}))
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [pwa.needRefresh, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: pwa.updateServiceWorker,
  }),
}))
vi.mock('../../config/commerce', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/commerce')>()),
  OWNER_ONLY: true,
}))

afterEach(() => {
  pwa.needRefresh = false
  pwa.updateServiceWorker.mockClear()
})

describe('uppdatering i ägarens privata version', () => {
  it('uppdaterar direkt och visar ingen notis när en ny version väntar', () => {
    pwa.needRefresh = true
    render(
      <>
        <UpdatePrompt />
        <ToastViewport />
      </>,
    )
    expect(pwa.updateServiceWorker).toHaveBeenCalledTimes(1)
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true)
    expect(screen.queryByText('En ny version av Lagom finns')).not.toBeInTheDocument()
  })

  it('gör ingenting när ingen ny version finns', () => {
    render(<UpdatePrompt />)
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled()
  })
})
