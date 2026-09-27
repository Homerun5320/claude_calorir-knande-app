/**
 * Tester för appens ram: navigeringens markering, sidtitlar, felsidan och toast-notiser.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navMatch, routeTitle } from './AppShell'
import { isChunkLoadError, RouteError } from './RouteError'
import { toast, toastDuration, ToastViewport, useToastStore } from '../ui/toast'

describe('navigering', () => {
  const mer = { to: '/mer', sections: ['/vikt', '/recept', '/installningar'] }

  it('markerar Mer även på sidor man når därifrån', () => {
    expect(navMatch(mer, '/mer')).toBe('page')
    expect(navMatch(mer, '/vikt')).toBe('section')
    expect(navMatch(mer, '/recept/abc/redigera')).toBe('section')
    expect(navMatch(mer, '/installningar/data')).toBe('section')
    expect(navMatch(mer, '/dagbok')).toBeNull()
    // "/vikten" är inte en undersida till "/vikt".
    expect(navMatch(mer, '/vikten')).toBeNull()
  })

  it('låter sidomenyns genvägar ta över markeringen', () => {
    expect(navMatch(mer, '/vikt', ['/vikt'])).toBeNull()
    expect(navMatch(mer, '/installningar', ['/vikt'])).toBe('section')
  })

  it('Idag matchar bara exakt', () => {
    expect(navMatch({ to: '/', end: true }, '/')).toBe('page')
    expect(navMatch({ to: '/', end: true }, '/dagbok')).toBeNull()
  })

  it('ger varje sida en egen titel', () => {
    expect(routeTitle('/')).toBe('Idag – Lagom')
    expect(routeTitle('/dagbok/2026-09-20')).toBe('Dagbok – Lagom')
    expect(routeTitle('/vikt')).toBe('Vikt & mått – Lagom')
    expect(routeTitle('/recept/nytt')).toBe('Nytt recept – Lagom')
    expect(routeTitle('/livsmedel/lagom:x/redigera')).toBe('Redigera livsmedel – Lagom')
    expect(routeTitle('/okand')).toBe('Lagom – kaloriräknaren')
  })
})

describe('felsidan', () => {
  function Boom(): never {
    throw new TypeError('e is not iterable')
  }

  it('visar en lugn svensk felsida i stället för en stackspårning', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }])
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { name: 'Något gick snett' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ladda om' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara en säkerhetskopia' })).toBeInTheDocument()
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('känner igen koddelar som inte gick att hämta efter en uppdatering', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Vikt-abc.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('e is not iterable'))).toBe(false)
  })
})

describe('toast', () => {
  afterEach(() => {
    vi.useRealTimers()
    act(() => useToastStore.setState({ toasts: [] }))
  })

  it('visar Ångra längre och pausar medan pekaren är över notisen', async () => {
    vi.useFakeTimers()
    expect(toastDuration({ action: { label: 'Ångra', onClick: () => {} } })).toBe(8000)
    render(<ToastViewport />)
    const onUndo = vi.fn()
    act(() => {
      toast('Borttaget', { action: { label: 'Ångra', onClick: onUndo } })
    })
    const undo = screen.getByRole('button', { name: 'Ångra' })
    // Renderas i en portal direkt i <body>, så att den går att nå när ett ark är öppet.
    expect(undo.closest('[data-toast-viewport]')?.parentElement).toBe(document.body)

    act(() => vi.advanceTimersByTime(4000))
    const card = undo.parentElement!
    act(() => {
      card.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    })
    // React lyssnar på pointerover/pointerout för onPointerEnter/Leave.
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('button', { name: 'Ångra' })).toBeInTheDocument()

    vi.useRealTimers()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Ångra' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('läser upp fel direkt (role=alert)', () => {
    render(<ToastViewport />)
    act(() => {
      toast('Importen misslyckades', { tone: 'error' })
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Importen misslyckades')
  })
})
