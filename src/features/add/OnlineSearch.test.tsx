/**
 * Sök i Open Food Facts: ändrar man söktexten medan sökningen laddar och skriver tillbaka den ska
 * knappen komma tillbaka – aldrig en skelettlista som aldrig blir klar och saknar "Försök igen".
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Food } from '../../types'
import { offBar } from './testFoods'
import { OnlineSearch } from './OnlineSearch'

const mocks = vi.hoisted(() => ({ search: vi.fn() }))

vi.mock('../../lib/foodRepo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/foodRepo')>()),
  searchOnlineFoods: mocks.search,
}))

const BUTTON = 'Sök i Open Food Facts (online)'

/** En sökning som hänger tills den avbryts – som fetch gör (AbortError) – eller tills `finish` anropas. */
function hangingSearch() {
  const finishers: Array<(foods: Food[]) => void> = []
  mocks.search.mockImplementation(
    (_q: string, opts?: { signal?: AbortSignal }) =>
      new Promise<Food[]>((resolve, reject) => {
        finishers.push(resolve)
        opts?.signal?.addEventListener('abort', () => reject(new DOMException('Avbrutet', 'AbortError')))
      }),
  )
  return { finish: (foods: Food[]) => finishers.at(-1)?.(foods) }
}

function renderSearch(query: string) {
  const ui = (q: string) => (
    <MemoryRouter>
      <OnlineSearch query={q} onPick={() => {}} onQuickAdd={() => {}} onDetails={() => {}} basketCount={() => 0} />
    </MemoryRouter>
  )
  const view = render(ui(query))
  return { ...view, setQuery: (q: string) => view.rerender(ui(q)) }
}

beforeEach(() => {
  mocks.search.mockReset()
})

describe('OnlineSearch – söktexten ändras medan sökningen laddar', () => {
  it('skriver man tillbaka samma söktext kommer knappen tillbaka i stället för en evig skelettlista', async () => {
    const search = hangingSearch()
    const { container, setQuery } = renderSearch('zzqx')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    })
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: BUTTON })).not.toBeInTheDocument()

    // Ändra söktexten: den pågående sökningen avbryts och knappen visas för den nya texten.
    await act(async () => setQuery('zzqxa'))
    expect(screen.getByRole('button', { name: BUTTON })).toBeInTheDocument()

    // Tillbaka till den första: inget laddar längre, och man kan söka igen.
    await act(async () => setQuery('zzqx'))
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.getByRole('button', { name: BUTTON })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    })
    expect(mocks.search).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    await act(async () => search.finish([offBar]))
    expect(await screen.findByText(offBar.name)).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('en avbruten sökning som ändå svarar efteråt ändrar ingenting', async () => {
    // Svarar trots avbrott (ignorerar signalen) – resultatet för den gamla söktexten ska inte visas.
    let resolveOld: (foods: Food[]) => void = () => {}
    mocks.search.mockImplementationOnce(() => new Promise<Food[]>((resolve) => (resolveOld = resolve)))
    const { container, setQuery } = renderSearch('zzqx')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    })
    await act(async () => setQuery('zzqxa'))
    await act(async () => resolveOld([offBar]))
    expect(screen.queryByText(offBar.name)).not.toBeInTheDocument()

    await act(async () => setQuery('zzqx'))
    expect(screen.queryByText(offBar.name)).not.toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
    expect(screen.getByRole('button', { name: BUTTON })).toBeInTheDocument()
  })

  it('ett fel ger fortfarande "Försök igen"', async () => {
    mocks.search.mockRejectedValueOnce(new Error('Open Food Facts svarar inte just nu. Försök igen om en stund.'))
    renderSearch('zzqx')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: BUTTON }))
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Open Food Facts svarar inte just nu')
    expect(screen.getByRole('button', { name: 'Försök igen' })).toBeInTheDocument()
  })
})
