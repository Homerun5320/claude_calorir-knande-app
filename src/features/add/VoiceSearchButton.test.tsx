/**
 * Röstsökningen i sökfältet med ett mockat SpeechRecognition: knappen visas bara med
 * igenkänning på enheten, mikrofonen startas först vid tryck och språkpaketet hämtas bara efter
 * ett tydligt val.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { INSTALL_OFFER, VoiceSearchButton, VoiceSearchStatus, useVoiceSearch } from './VoiceSearchButton'
import AddFoodPage from './AddFoodPage'
import { DialogHost } from '../../components/ui/Dialog'
import { loadBuiltinCatalog } from '../../lib/foodRepo'
import type { RecognitionErrorEvent, RecognitionResultEvent } from '../../lib/voiceSearch'

interface MockRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  processLocally: boolean
  onstart: (() => void) | null
  onresult: ((event: RecognitionResultEvent) => void) | null
  onnomatch: (() => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  abort: ReturnType<typeof vi.fn>
}

let instances: MockRecognition[] = []

function mockSpeechRecognition(opts: { statuses?: string[]; install?: boolean; processLocally?: boolean } = {}) {
  const statuses = [...(opts.statuses ?? ['available'])]
  class Recognition {
    lang = ''
    continuous = true
    interimResults = false
    maxAlternatives = 3
    onstart = null
    onresult = null
    onnomatch = null
    onerror = null
    onend = null
    start = vi.fn()
    stop = vi.fn()
    abort = vi.fn()
    constructor() {
      instances.push(this as unknown as MockRecognition)
    }
  }
  if (opts.processLocally !== false) {
    Object.defineProperty(Recognition.prototype, 'processLocally', {
      configurable: true,
      get(this: { _local?: boolean }) {
        return this._local ?? false
      },
      set(this: { _local?: boolean }, value: boolean) {
        this._local = Boolean(value)
      },
    })
  }
  // Varje anrop tar nästa status i listan; den sista gäller sedan.
  const available = vi.fn(() => Promise.resolve(statuses.length > 1 ? statuses.shift()! : statuses[0]))
  const install = vi.fn(() => Promise.resolve(opts.install ?? true))
  Object.assign(Recognition, { available, install })
  ;(window as unknown as Record<string, unknown>).SpeechRecognition = Recognition
  return { available, install }
}

function Harness() {
  const [q, setQ] = useState('')
  const voice = useVoiceSearch(setQ)
  return (
    <>
      <label>
        Sök livsmedel
        <input
          value={q}
          onChange={(e) => {
            voice.cancel()
            setQ(e.target.value)
          }}
          onKeyDown={(e) => {
            // Som sökfältet i AddFoodPage: Escape rensar texten.
            if (e.key === 'Escape' && q) {
              e.preventDefault()
              setQ('')
            }
          }}
        />
      </label>
      {voice.visible && <VoiceSearchButton voice={voice} />}
      {voice.visible && <VoiceSearchStatus voice={voice} />}
      <DialogHost />
    </>
  )
}

const flush = () => act(async () => {})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  instances = []
})

describe('VoiceSearchButton', () => {
  it('tillgänglig: knappen visas, mikrofonen startas först vid tryck och texten fylls i', async () => {
    const { available, install } = mockSpeechRecognition({ statuses: ['available'] })
    render(<Harness />)
    const button = await screen.findByRole('button', { name: 'Sök med rösten' })
    expect(available).toHaveBeenCalledWith({ langs: ['sv-SE'], processLocally: true })
    // Ingen igenkänning (och ingen mikrofonfråga) innan man trycker.
    expect(instances).toHaveLength(0)

    fireEvent.click(button)
    await waitFor(() => expect(instances).toHaveLength(1))
    const rec = instances[0]
    expect(rec.processLocally).toBe(true)
    expect(rec.lang).toBe('sv-SE')
    expect(rec.interimResults).toBe(true)
    expect(rec.continuous).toBe(false)
    expect(rec.start).toHaveBeenCalledTimes(1)

    expect(screen.getByText('Startar mikrofonen …')).toHaveAttribute('aria-live', 'polite')
    act(() => rec.onstart?.())
    expect(screen.getByRole('button', { name: 'Sluta lyssna' })).toBeInTheDocument()
    expect(screen.getByText('Lyssnar …')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText(/Rösten tolkas bara här på enheten/)).toBeInTheDocument()

    act(() => rec.onresult?.({ results: [[{ transcript: 'två ägg' }]] }))
    expect(screen.getByRole('textbox', { name: 'Sök livsmedel' })).toHaveValue('två ägg')
    act(() => rec.onresult?.({ results: [[{ transcript: 'Två ägg och en smörgås.' }]] }))
    expect(screen.getByRole('textbox', { name: 'Sök livsmedel' })).toHaveValue('Två ägg och en smörgås')

    fireEvent.click(screen.getByRole('button', { name: 'Sluta lyssna' }))
    expect(rec.stop).toHaveBeenCalledTimes(1)
    act(() => rec.onend?.())
    expect(await screen.findByRole('button', { name: 'Sök med rösten' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Sök livsmedel' })).toHaveValue('Två ägg och en smörgås')
    expect(install).not.toHaveBeenCalled()
  })

  it('nedladdningsbar: språkpaketet hämtas bara efter ett tydligt val', async () => {
    const { available, install } = mockSpeechRecognition({ statuses: ['downloadable', 'downloadable', 'downloadable', 'available'] })
    render(<Harness />)
    const button = await screen.findByRole('button', { name: 'Sök med rösten' })
    await flush()
    expect(install).not.toHaveBeenCalled()

    // Första trycket: dialogen – "Inte nu" hämtar ingenting.
    fireEvent.click(button)
    expect(await screen.findByText(new RegExp(INSTALL_OFFER))).toBeInTheDocument()
    expect(install).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Inte nu' }))
    await flush()
    expect(install).not.toHaveBeenCalled()
    expect(instances).toHaveLength(0)

    // Andra trycket: "Hämta" – först då anropas install().
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Hämta' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Sök med rösten' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hämta' }))
    await waitFor(() => expect(install).toHaveBeenCalledWith({ langs: ['sv-SE'], processLocally: true }))
    expect(await screen.findByText(/Klart! Svensk taligenkänning finns nu på enheten/)).toBeInTheDocument()
    expect(available).toHaveBeenCalledTimes(4)
    // Lyssnandet startar inte av sig självt efter hämtningen.
    expect(instances).toHaveLength(0)
  })

  it('misslyckad hämtning ger ett vänligt meddelande', async () => {
    mockSpeechRecognition({ statuses: ['downloadable'], install: false })
    render(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sök med rösten' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hämta' }))
    expect(await screen.findByText(/Det gick inte att hämta svensk taligenkänning just nu/)).toBeInTheDocument()
    expect(instances).toHaveLength(0)
  })

  it('otillgänglig: ingen knapp', async () => {
    const { available } = mockSpeechRecognition({ statuses: ['unavailable'] })
    render(<Harness />)
    await waitFor(() => expect(available).toHaveBeenCalled())
    await flush()
    expect(screen.queryByRole('button', { name: 'Sök med rösten' })).not.toBeInTheDocument()
  })

  it('saknar processLocally: ingen knapp och ingen kontroll', async () => {
    const { available } = mockSpeechRecognition({ processLocally: false })
    render(<Harness />)
    await flush()
    expect(screen.queryByRole('button', { name: 'Sök med rösten' })).not.toBeInTheDocument()
    expect(available).not.toHaveBeenCalled()
  })

  it('bara webkitSpeechRecognition (server-igenkänning): ingen knapp', async () => {
    mockSpeechRecognition()
    const w = window as unknown as Record<string, unknown>
    w.webkitSpeechRecognition = w.SpeechRecognition
    delete w.SpeechRecognition
    render(<Harness />)
    await flush()
    expect(screen.queryByRole('button', { name: 'Sök med rösten' })).not.toBeInTheDocument()
  })

  it('nekad mikrofon ger ett vänligt meddelande', async () => {
    mockSpeechRecognition()
    render(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sök med rösten' }))
    await waitFor(() => expect(instances).toHaveLength(1))
    const rec = instances[0]
    act(() => {
      rec.onerror?.({ error: 'not-allowed' })
      rec.onend?.()
    })
    expect(await screen.findByText(/tillåta mikrofonen för Lagom i webbläsarens inställningar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sök med rösten' })).toBeInTheDocument()
  })

  it('att skriva avbryter lyssnandet, och Escape slutar lyssna', async () => {
    mockSpeechRecognition()
    render(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sök med rösten' }))
    await waitFor(() => expect(instances).toHaveLength(1))
    act(() => instances[0].onstart?.())
    fireEvent.change(screen.getByRole('textbox', { name: 'Sök livsmedel' }), { target: { value: 'mjölk' } })
    expect(instances[0].abort).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Sök med rösten' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sök med rösten' }))
    await waitFor(() => expect(instances).toHaveLength(2))
    act(() => instances[1].onstart?.())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(instances[1].stop).toHaveBeenCalled()
    expect(instances[1].abort).not.toHaveBeenCalled()
    act(() => instances[1].onend?.())

    // Escape i sökfältet som rensar texten avbryter helt – inget fylls i efteråt.
    fireEvent.click(screen.getByRole('button', { name: 'Sök med rösten' }))
    await waitFor(() => expect(instances).toHaveLength(3))
    act(() => {
      instances[2].onstart?.()
      instances[2].onresult?.({ results: [[{ transcript: 'kaffe' }]] })
    })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Sök livsmedel' }), { key: 'Escape' })
    expect(instances[2].abort).toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Sök livsmedel' })).toHaveValue('')
  })

  it('stänger av mikrofonen när sidan lämnas', async () => {
    mockSpeechRecognition()
    const { unmount } = render(<Harness />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sök med rösten' }))
    await waitFor(() => expect(instances).toHaveLength(1))
    act(() => instances[0].onstart?.())
    unmount()
    expect(instances[0].abort).toHaveBeenCalled()
  })
})

describe('AddFoodPage med röstsökning', () => {
  beforeAll(async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
    await loadBuiltinCatalog()
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })
  beforeEach(() => {
    instances = []
  })

  function renderPage() {
    const router = createMemoryRouter([{ path: '/lagg-till', element: <AddFoodPage /> }], {
      initialEntries: ['/lagg-till?maltid=frukost&datum=2026-09-26'],
    })
    return render(
      <>
        <RouterProvider router={router} />
        <DialogHost />
      </>,
    )
  }

  it('utan igenkänning på enheten finns ingen mikrofon i sökfältet', async () => {
    renderPage()
    await flush()
    expect(screen.getByPlaceholderText('Sök livsmedel')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sök med rösten' })).not.toBeInTheDocument()
  })

  it('mikrofonen i sökfältet fyller i sökningen', async () => {
    mockSpeechRecognition()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Sök med rösten' }))
    await waitFor(() => expect(instances).toHaveLength(1))
    act(() => {
      instances[0].onstart?.()
      instances[0].onresult?.({ results: [[{ transcript: 'Havregrynsgröt' }]] })
      instances[0].onend?.()
    })
    expect(screen.getByPlaceholderText('Sök livsmedel')).toHaveValue('Havregrynsgröt')
  })
})

describe('butiksbyggena', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each(['appstore', 'play'])('%s: ingen mikrofon och ingen kontroll av taligenkänningen', async (distribution) => {
    const { available } = mockSpeechRecognition()
    vi.stubEnv('VITE_DISTRIBUTION', distribution)
    vi.resetModules()
    const fresh = await import('./VoiceSearchButton')
    let seen: ReturnType<typeof fresh.useVoiceSearch> | null = null
    function StoreHarness() {
      const [, setQ] = useState('')
      const voice = fresh.useVoiceSearch(setQ)
      seen = voice
      // Komponenterna ritar ingenting, även om någon skulle visa dem.
      return (
        <div data-testid="rost">
          <fresh.VoiceSearchButton voice={voice} />
          <fresh.VoiceSearchStatus voice={voice} />
        </div>
      )
    }
    render(<StoreHarness />)
    await flush()
    expect(seen).toMatchObject({ visible: false, support: 'unsupported', phase: 'idle', notice: null })
    expect(screen.getByTestId('rost')).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Sök med rösten' })).not.toBeInTheDocument()
    expect(available).not.toHaveBeenCalled()
    expect(instances).toHaveLength(0)
  })
})
