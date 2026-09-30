/**
 * Dagens anteckning sparas en stund efter att man slutat skriva ("Sparar …" → "Sparat"), direkt
 * när fältet lämnas, när dagen byts och när sidan göms eller stängs – med en skrivning av dagboken
 * per paus. Mående sparas med ett tryck, och en framtida dag har bara anteckningen.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Mock } from 'vitest'
import { addDays, todayISO } from '../../lib/dates'
import { useDiaryStore } from '../../stores/diaryStore'
import type { ISODate } from '../../types'
import { DayNotesCard, NOTE_SAVE_DELAY_MS } from './DayNotesCard'

type SetDayMeta = ReturnType<typeof useDiaryStore.getState>['setDayMeta']
let originalSetDayMeta: SetDayMeta
let setDayMeta: Mock<SetDayMeta>

const note = () => screen.getByRole('textbox', { name: /^Anteckning/ })
const storedNote = (date: ISODate = todayISO()) => useDiaryStore.getState().days[date]?.note

/** Som i dagboken: kortet renderas med key={date}. */
function Notes({ date, planned }: { date: ISODate; planned?: boolean }) {
  return <DayNotesCard key={date} date={date} planned={planned} />
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeAll(async () => {
  await waitFor(() => expect(useDiaryStore.persist.hasHydrated()).toBe(true))
  originalSetDayMeta = useDiaryStore.getState().setDayMeta
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  setDayMeta = vi.fn(originalSetDayMeta)
  useDiaryStore.setState({ setDayMeta })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  useDiaryStore.setState({ setDayMeta: originalSetDayMeta })
  delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState
})

describe('DayNotesCard', () => {
  it('väntar 600 ms efter sista tangenttrycket och sparar en gång', () => {
    expect(NOTE_SAVE_DELAY_MS).toBe(600)
    const today = todayISO()
    render(<Notes date={today} />)
    expect(screen.queryByText('Sparar …')).not.toBeInTheDocument()
    for (const text of ['P', 'Pi', 'Pig', 'Pigg']) {
      fireEvent.change(note(), { target: { value: text } })
      act(() => {
        vi.advanceTimersByTime(200)
      })
    }
    expect(screen.getByText('Sparar …')).toBeInTheDocument()
    expect(setDayMeta).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(NOTE_SAVE_DELAY_MS)
    })
    expect(setDayMeta).toHaveBeenCalledTimes(1)
    expect(setDayMeta).toHaveBeenCalledWith(today, { note: 'Pigg' })
    expect(storedNote()).toBe('Pigg')
    expect(screen.getByText('Sparat')).toBeInTheDocument()
  })

  it('sparar direkt när fältet lämnas och trimmar texten', () => {
    render(<Notes date={todayISO()} />)
    fireEvent.change(note(), { target: { value: '  Promenad i solen  ' } })
    fireEvent.blur(note())
    expect(storedNote()).toBe('Promenad i solen')
    expect(screen.getByText('Sparat')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(NOTE_SAVE_DELAY_MS * 2)
    })
    expect(setDayMeta).toHaveBeenCalledTimes(1)
  })

  it('sparar på den gamla dagen när dagen byts', () => {
    const today = todayISO()
    const yesterday = addDays(today, -1)
    useDiaryStore.getState().setDayMeta(yesterday, { note: 'Igår' })
    setDayMeta.mockClear()
    const { rerender } = render(<Notes date={today} />)
    fireEvent.change(note(), { target: { value: 'Idag' } })
    rerender(<Notes date={yesterday} />)
    expect(setDayMeta).toHaveBeenCalledTimes(1)
    expect(storedNote(today)).toBe('Idag')
    expect(storedNote(yesterday)).toBe('Igår')
    expect(note()).toHaveValue('Igår')
  })

  it('sparar när sidan göms, stängs eller lämnas (omladdning, en annan adress)', () => {
    render(<Notes date={todayISO()} />)
    fireEvent.change(note(), { target: { value: 'Före bakgrunden' } })
    setVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(storedNote()).toBe('Före bakgrunden')

    setVisibility('visible')
    fireEvent.change(note(), { target: { value: 'Före stängningen' } })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(storedNote()).toBe('Före stängningen')
    // Omladdning eller en annan adress: Chromium hinner bara spara det som startas i beforeunload.
    fireEvent.change(note(), { target: { value: 'Före omladdningen' } })
    act(() => {
      window.dispatchEvent(new Event('beforeunload', { cancelable: true }))
    })
    expect(storedNote()).toBe('Före omladdningen')
    expect(setDayMeta).toHaveBeenCalledTimes(3)
  })

  it('sparar inget när bara mellanslag ändras eller texten skrivs tillbaka', () => {
    useDiaryStore.getState().setDayMeta(todayISO(), { note: 'Lugn dag' })
    setDayMeta.mockClear()
    render(<Notes date={todayISO()} />)
    expect(note()).toHaveValue('Lugn dag')
    fireEvent.change(note(), { target: { value: 'Lugn dag ' } })
    expect(screen.queryByText('Sparar …')).not.toBeInTheDocument()
    fireEvent.change(note(), { target: { value: 'Lugn dagg' } })
    expect(screen.getByText('Sparar …')).toBeInTheDocument()
    fireEvent.change(note(), { target: { value: 'Lugn dag' } })
    expect(screen.queryByText('Sparar …')).not.toBeInTheDocument()
    fireEvent.blur(note())
    act(() => {
      vi.advanceTimersByTime(NOTE_SAVE_DELAY_MS * 2)
    })
    expect(setDayMeta).not.toHaveBeenCalled()
  })

  it('en tömd anteckning tas bort', () => {
    useDiaryStore.getState().setDayMeta(todayISO(), { note: 'Tas bort' })
    render(<Notes date={todayISO()} />)
    fireEvent.change(note(), { target: { value: '' } })
    act(() => {
      vi.advanceTimersByTime(NOTE_SAVE_DELAY_MS)
    })
    expect(storedNote()).toBeUndefined()
  })

  it('mående sparas med ett tryck, och en framtida dag har bara anteckningen', () => {
    const { unmount } = render(<Notes date={todayISO()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Humör: Bra' }))
    expect(useDiaryStore.getState().days[todayISO()]?.mood).toBe(4)
    unmount()

    render(<Notes date={addDays(todayISO(), 1)} planned />)
    expect(screen.getByRole('heading', { name: 'Anteckningar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Humör: Bra' })).not.toBeInTheDocument()
  })
})
