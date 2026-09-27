/**
 * Bakåtknappen och modaler: ark och dialoger får en egen historikpost så att bakåt stänger dem,
 * utan att routern navigerar eller frågar "Lämna utan att spara?" – och navigering inifrån en
 * modal fungerar som vanligt (push, replace och navigate(-1)).
 */
import { StrictMode, useRef, useState, type ReactNode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createHashRouter, createMemoryRouter, RouterProvider, useBlocker, useNavigate } from 'react-router-dom'
import { ConfirmDialog, Dialog, Sheet } from './index'

const MARKER = '__lagomModal'

function markers(): string[] {
  const s = window.history.state as Record<string, unknown> | null
  return Array.isArray(s?.[MARKER]) ? (s[MARKER] as string[]) : []
}

/** Vänta tills historiken har landat (jsdom traverserar asynkront). */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30))
  })
}

async function back() {
  await act(async () => {
    window.history.back()
    await new Promise((r) => setTimeout(r, 30))
  })
}

function SheetHarness({ children, initialOpen = false, onClose }: { children?: ReactNode; initialOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öppna
      </button>
      <Sheet
        open={open}
        onClose={() => {
          onClose?.()
          setOpen(false)
        }}
        title="Portion"
      >
        {children}
      </Sheet>
    </>
  )
}

beforeEach(async () => {
  // Börja varje test på en ren post (utan markör) i jsdom:s historik.
  await settle()
  window.history.replaceState({ idx: 0, key: 'start' }, '', '#/')
})

describe('Sheet och bakåtknappen', () => {
  it('lägger en historikpost när arket öppnas och stänger arket vid bakåt', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SheetHarness onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    expect(screen.getByRole('dialog', { name: 'Portion' })).toBeInTheDocument()
    expect(markers()).toHaveLength(1)
    // Samma URL och samma router-state som posten under.
    expect(window.location.hash).toBe('#/')
    expect((window.history.state as { key?: string }).key).toBe('start')

    await back()
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(markers()).toHaveLength(0)
    expect(window.location.hash).toBe('#/')
  })

  it('tar bort sin post när arket stängs med ✕ (bakåt lämnar sedan sidan direkt)', async () => {
    const user = userEvent.setup()
    render(<SheetHarness />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    expect(markers()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Stäng' }))
    await settle()
    expect(markers()).toHaveLength(0)
    expect((window.history.state as { key?: string }).key).toBe('start')
  })

  it('döljer markörstegen för andra popstate-lyssnare (routern) men inte riktiga navigeringar', async () => {
    const user = userEvent.setup()
    const routerLike = vi.fn()
    window.addEventListener('popstate', routerLike)
    try {
      render(<SheetHarness />)
      await user.click(screen.getByRole('button', { name: 'Öppna' }))
      await back() // stänger arket – samma post för routern
      expect(routerLike).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Öppna' }))
      await user.click(screen.getByRole('button', { name: 'Stäng' }))
      await settle() // vårt eget dolda steg bakåt
      expect(routerLike).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('popstate', routerLike)
    }
  })

  it('en push inifrån arket ersätter markörposten – navigeringen ångras inte', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 0, key: 'a' }, '', '#/a')
    const { unmount } = render(<SheetHarness />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    const lengthWithSheet = window.history.length

    // Som routern gör vid navigate('/b'):
    window.history.pushState({ idx: 1, key: 'b' }, '', '#/b')
    expect(window.history.length).toBe(lengthWithSheet) // markörposten återanvändes (arket var sista posten)
    expect(window.location.hash).toBe('#/b')
    expect(markers()).toHaveLength(0)

    unmount() // sidan byts – arket försvinner
    await settle()
    expect(window.location.hash).toBe('#/b') // inget steg bakåt

    await back()
    expect(window.location.hash).toBe('#/a') // bakåt från B går direkt till sidan
  })

  it('navigate(-1) inifrån arket hoppar även över markören', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 0, key: 'p' }, '', '#/p')
    window.history.pushState({ idx: 1, key: 'a' }, '', '#/a')
    render(<SheetHarness />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))

    await act(async () => {
      window.history.go(-1) // routerns navigate(-1)
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(window.location.hash).toBe('#/p')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('replace inifrån arket ersätter sidans egen post', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 0, key: 'p' }, '', '#/p')
    window.history.pushState({ idx: 1, key: 'a' }, '', '#/a')
    const { unmount } = render(<SheetHarness />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))

    window.history.replaceState({ idx: 1, key: 'c' }, '', '#/c')
    expect(window.location.hash).toBe('#/c')
    unmount()
    await settle()
    expect(window.location.hash).toBe('#/c')
    expect((window.history.state as { key?: string }).key).toBe('c')
    expect(markers()).toHaveLength(0)

    await back()
    expect(window.location.hash).toBe('#/p') // /a är ersatt, inte kvar emellan
  })

  it('replace på samma sida (t.ex. sökparametrar) behåller markören – bakåt stänger arket och behåller URL:en', async () => {
    const user = userEvent.setup()
    const routerLike = vi.fn()
    window.history.replaceState({ idx: 3, key: 'a1' }, '', '#/lagg-till?maltid=lunch')
    window.addEventListener('popstate', routerLike)
    try {
      render(<SheetHarness />)
      await user.click(screen.getByRole('button', { name: 'Öppna' }))
      // Sidan sparar söktexten i adressen medan arket är öppet (routerns replace, ny key).
      window.history.replaceState({ idx: 3, key: 'a2' }, '', '#/lagg-till?maltid=lunch&q=mj%C3%B6lk')
      expect(markers()).toHaveLength(1)

      await back()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(markers()).toHaveLength(0)
      expect(window.location.hash).toBe('#/lagg-till?maltid=lunch&q=mj%C3%B6lk')
      expect((window.history.state as { key?: string }).key).toBe('a2')
      expect(routerLike).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('popstate', routerLike)
    }
  })

  it('samma sak när arket stängs med ✕ efter en replace på samma sida', async () => {
    const user = userEvent.setup()
    window.history.replaceState({ idx: 3, key: 'a1' }, '', '#/lagg-till')
    render(<SheetHarness />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    window.history.replaceState({ idx: 3, key: 'a2' }, '', '#/lagg-till?q=te')
    await user.click(screen.getByRole('button', { name: 'Stäng' }))
    await settle()
    expect(markers()).toHaveLength(0)
    expect(window.location.hash).toBe('#/lagg-till?q=te')
    expect((window.history.state as { key?: string }).key).toBe('a2')
    // Nästa ark fungerar som vanligt (ingen hängande förväntan).
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    expect(markers()).toHaveLength(1)
  })

  it('StrictMode ger bara en historikpost', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <SheetHarness />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    await settle()
    expect(markers()).toHaveLength(1)
    // Ett steg bakåt räcker för att komma förbi markören – det finns ingen extra post kvar.
    await back()
    expect(markers()).toHaveLength(0)
    expect((window.history.state as { key?: string }).key).toBe('start')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('nästlade modaler stängs en i taget', async () => {
    const user = userEvent.setup()
    function Nested() {
      const [outer, setOuter] = useState(false)
      const [inner, setInner] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOuter(true)}>
            Öppna
          </button>
          <Sheet open={outer} onClose={() => setOuter(false)} title="Ark">
            <button type="button" onClick={() => setInner(true)}>
              Mer
            </button>
          </Sheet>
          <Dialog open={inner} onClose={() => setInner(false)} title="Dialog">
            innehåll
          </Dialog>
        </>
      )
    }
    render(<Nested />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    await user.click(screen.getByRole('button', { name: 'Mer' }))
    expect(markers()).toHaveLength(2)

    await back()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dialog' })).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Ark' })).toBeInTheDocument()

    await back()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ark' })).not.toBeInTheDocument())
  })

  it('en fristående bekräftelsedialog (alertdialog) lägger ingen post – men ovanpå ett ark gör den det', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [sheet, setSheet] = useState(false)
      const [ask, setAsk] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setAsk(true)}>
            Fråga
          </button>
          <button type="button" onClick={() => setSheet(true)}>
            Ark
          </button>
          <Sheet open={sheet} onClose={() => setSheet(false)} title="Ark">
            <button type="button" onClick={() => setAsk(true)}>
              Fråga i arket
            </button>
          </Sheet>
          <ConfirmDialog open={ask} title="Säker?" onConfirm={() => setAsk(false)} onCancel={() => setAsk(false)} />
        </>
      )
    }
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Fråga' }))
    expect(screen.getByRole('alertdialog', { name: 'Säker?' })).toBeInTheDocument()
    expect(markers()).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Ark' }))
    await user.click(screen.getByRole('button', { name: 'Fråga i arket' }))
    expect(markers()).toHaveLength(2)
    await back() // avbryter frågan, arket är kvar
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Ark' })).toBeInTheDocument()
  })

  it('ett ark som inte går att avfärda lägger ingen post', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Öppna
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Sparar" dismissible={false}>
            …
          </Sheet>
        </>
      )
    }
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    expect(markers()).toHaveLength(0)
  })
})

describe('Sheet returnFocus', () => {
  it('lämnar fokus till ett angivet element när arket stängs', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      const target = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Öppna
          </button>
          <button type="button" ref={target}>
            Nästa post
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Portion" returnFocus={target}>
            innehåll
          </Sheet>
        </>
      )
    }
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    await user.click(screen.getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nästa post' })).toHaveFocus())
  })

  it('faller tillbaka på öppnaren om elementet saknas, och rör inte fokus med false', async () => {
    const user = userEvent.setup()
    function Harness({ returnFocus }: { returnFocus: false | (() => HTMLElement | null) }) {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Öppna
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Portion" returnFocus={returnFocus}>
            innehåll
          </Sheet>
        </>
      )
    }
    const { unmount } = render(<Harness returnFocus={() => null} />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    await user.click(screen.getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Öppna' })).toHaveFocus())
    unmount()

    render(<Harness returnFocus={false} />)
    await user.click(screen.getByRole('button', { name: 'Öppna' }))
    await user.click(screen.getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Öppna' })).not.toHaveFocus()
  })
})

// ---------------------------------------------------------------------------
// Med en riktig router
// ---------------------------------------------------------------------------

function PageA({ blockAll = false }: { blockAll?: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  // Som "Lämna utan att spara?" i appen: blockerar byte av sida.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => blockAll && currentLocation.pathname !== nextLocation.pathname)
  return (
    <div>
      <h1>Sida A</h1>
      {blocker.state === 'blocked' && <p role="alert">Lämna utan att spara?</p>}
      <button type="button" onClick={() => setOpen(true)}>
        Öppna ark
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ark på A">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            navigate('/b')
          }}
        >
          Till B
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            navigate(-1)
          }}
        >
          Tillbaka
        </button>
      </Sheet>
    </div>
  )
}

const ROUTES = (blockAll = false) => [
  { path: '/', element: <h1>Start</h1> },
  { path: '/a', element: <PageA blockAll={blockAll} /> },
  { path: '/b', element: <h1>Sida B</h1> },
]

describe('Sheet med createHashRouter', () => {
  it('bakåt stänger arket och stannar på sidan – utan blockerarens fråga', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '#/')
    const router = createHashRouter(ROUTES(true))
    render(<RouterProvider router={router} />)
    await act(() => router.navigate('/a'))
    await user.click(await screen.findByRole('button', { name: 'Öppna ark' }))
    expect(screen.getByRole('dialog', { name: 'Ark på A' })).toBeInTheDocument()

    await back()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Sida A' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/a')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    // Nästa bakåt lämnar sidan som vanligt – och då frågar blockeraren.
    await back()
    expect(await screen.findByRole('alert')).toHaveTextContent('Lämna utan att spara?')
    router.dispose()
  })

  it('navigering inifrån arket fungerar och bakåt därifrån går till sidan', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '#/')
    const router = createHashRouter(ROUTES())
    render(<RouterProvider router={router} />)
    await act(() => router.navigate('/a'))
    await user.click(await screen.findByRole('button', { name: 'Öppna ark' }))
    await user.click(screen.getByRole('button', { name: 'Till B' }))

    expect(await screen.findByRole('heading', { name: 'Sida B' })).toBeInTheDocument()
    await settle()
    expect(router.state.location.pathname).toBe('/b')
    expect(window.location.hash).toBe('#/b')

    await back()
    expect(await screen.findByRole('heading', { name: 'Sida A' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(markers()).toHaveLength(0)
    router.dispose()
  })

  it('navigate(-1) inifrån arket lämnar sidan', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '#/')
    const router = createHashRouter(ROUTES())
    render(<RouterProvider router={router} />)
    await act(() => router.navigate('/a'))
    await user.click(await screen.findByRole('button', { name: 'Öppna ark' }))
    await user.click(screen.getByRole('button', { name: 'Tillbaka' }))

    expect(await screen.findByRole('heading', { name: 'Start' })).toBeInTheDocument()
    await settle()
    expect(router.state.location.pathname).toBe('/')
    router.dispose()
  })
})

describe('Sheet med createMemoryRouter (som i sidtesterna)', () => {
  it('navigering inifrån arket fungerar och lämnar ingen markör efter sig', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter(ROUTES(), { initialEntries: ['/a'] })
    render(<RouterProvider router={router} />)
    await user.click(screen.getByRole('button', { name: 'Öppna ark' }))
    expect(markers()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Till B' }))
    expect(await screen.findByRole('heading', { name: 'Sida B' })).toBeInTheDocument()
    await settle()
    expect(router.state.location.pathname).toBe('/b')
    expect(markers()).toHaveLength(0)
  })
})
