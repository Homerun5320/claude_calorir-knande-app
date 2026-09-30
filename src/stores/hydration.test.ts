/**
 * Inläsning efter en sparning i en annan flik: en synlig flik läser in direkt, en dold flik väntar
 * (flera sparningar i rad blir en inläsning) och läser in direkt när den blir synlig.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ remote: [] as Array<(name: string) => void> }))

vi.mock('./storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./storage')>()
  return {
    ...actual,
    canRehydrate: () => true,
    onRemoteWrite: (listener: (name: string) => void) => {
      m.remote.push(listener)
      return () => {}
    },
  }
})

const { HIDDEN_REHYDRATE_DELAY_MS } = await import('./hydration')
const { useDiaryStore } = await import('./diaryStore')
const { STORE_KEYS } = await import('./storage')

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

const remoteWrite = (name: string) => m.remote.forEach((l) => l(name))

describe('inläsning efter en sparning i en annan flik', () => {
  let rehydrate: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    rehydrate = vi.spyOn(useDiaryStore.persist, 'rehydrate').mockResolvedValue(undefined)
  })

  afterEach(() => {
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('en synlig flik läser in direkt', () => {
    setVisibility('visible')
    remoteWrite(STORE_KEYS.diary)
    expect(rehydrate).toHaveBeenCalledTimes(1)
  })

  it('en dold flik läser in högst en gång per halvminut – och direkt när den visas', () => {
    setVisibility('hidden')
    for (let i = 0; i < 10; i++) remoteWrite(STORE_KEYS.diary)
    expect(rehydrate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(HIDDEN_REHYDRATE_DELAY_MS)
    expect(rehydrate).toHaveBeenCalledTimes(1)

    remoteWrite(STORE_KEYS.diary)
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(rehydrate).toHaveBeenCalledTimes(2)
    // Den väntande inläsningen är avbruten – ingen extra inläsning senare.
    vi.advanceTimersByTime(HIDDEN_REHYDRATE_DELAY_MS)
    expect(rehydrate).toHaveBeenCalledTimes(2)
  })
})
