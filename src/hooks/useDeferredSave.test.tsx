/**
 * useDeferredSave: sparar det senaste värdet en gång efter pausen, direkt vid flush, när
 * komponenten försvinner, när nyckeln byts (på den gamla nyckeln) och när sidan lämnas, stängs
 * eller göms – aldrig när värdet redan är sparat, alltid med den senaste `save` och utan extra
 * sparningar i StrictMode.
 */
import { act, renderHook } from '@testing-library/react'
import type { MockInstance } from 'vitest'
import { clearErrorLog, readErrorLog } from '../lib/errorLog'
import { SAVE_DELAY_MS, useDeferredSave, type DeferredSaveOptions } from './useDeferredSave'

type Store = Record<string, number | undefined>
type SaveFn = (value: number | undefined, key: string) => void

/**
 * En liten "butik" per nyckel och en spion som räknar sparningarna. `reactStrictMode` lägger
 * StrictMode i roten – bara då körs effekterna två gånger vid monteringen (en `wrapper` med
 * StrictMode gör det inte, eftersom det nya fibret då är wrappern ovanför StrictMode).
 */
function setup(initial: Store = {}, extra: Partial<DeferredSaveOptions<number | undefined>> = {}, reactStrictMode = false) {
  const store: Store = { ...initial }
  const save = vi.fn((value: number | undefined, key: string) => {
    store[key] = value
  })
  const hook = renderHook(
    (props: { k: string; save: SaveFn }) => useDeferredSave<number | undefined>({ key: props.k, read: (k) => store[k], save: props.save, ...extra }),
    { initialProps: { k: 'a', save: save as SaveFn }, reactStrictMode },
  )
  return { store, save, ...hook }
}

type ListenerSpy = MockInstance<(type: string, listener: EventListenerOrEventListenerObject | null) => void>

/** Lyssnarna för en händelsetyp som lagts till och tagits bort (samma referenser i samma ordning). */
function listenersFor(add: ListenerSpy, remove: ListenerSpy, type: string) {
  const of = (spy: ListenerSpy) => spy.mock.calls.filter(([t]) => t === type).map(([, listener]) => listener)
  return { added: of(add), removed: of(remove) }
}

/** Följer `pagehide` och `beforeunload` på window och `visibilitychange` på document. */
function spyListeners() {
  const spies = {
    windowAdd: vi.spyOn(window, 'addEventListener') as unknown as ListenerSpy,
    windowRemove: vi.spyOn(window, 'removeEventListener') as unknown as ListenerSpy,
    documentAdd: vi.spyOn(document, 'addEventListener') as unknown as ListenerSpy,
    documentRemove: vi.spyOn(document, 'removeEventListener') as unknown as ListenerSpy,
  }
  return {
    pagehide: () => listenersFor(spies.windowAdd, spies.windowRemove, 'pagehide'),
    beforeunload: () => listenersFor(spies.windowAdd, spies.windowRemove, 'beforeunload'),
    visibility: () => listenersFor(spies.documentAdd, spies.documentRemove, 'visibilitychange'),
    restore: () => {
      for (const spy of Object.values(spies)) spy.mockRestore()
    },
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  // Tillbaka till jsdom:s egen getter på Document.prototype.
  delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState
})

describe('useDeferredSave', () => {
  it('sparar det senaste värdet en gång, SAVE_DELAY_MS efter den sista ändringen', () => {
    const { result, save, store } = setup()
    expect(SAVE_DELAY_MS).toBe(600)
    for (const v of [1, 12, 120, 1200, 12000]) {
      act(() => {
        result.current.schedule(v)
      })
      act(() => {
        vi.advanceTimersByTime(SAVE_DELAY_MS - 1)
      })
    }
    expect(save).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(12000, 'a')
    expect(store.a).toBe(12000)
    expect(result.current.pending).toBe(false)
  })

  it('sparar inte ett värde som redan är sparat – och glömmer en ändring som ångrats', () => {
    const { result, save } = setup({ a: 5 })
    let scheduled = true
    act(() => {
      scheduled = result.current.schedule(5)
    })
    expect(scheduled).toBe(false)
    expect(result.current.pending).toBe(false)

    act(() => {
      result.current.schedule(6)
    })
    expect(result.current.pending).toBe(true)
    act(() => {
      result.current.schedule(5)
    })
    expect(result.current.pending).toBe(false)
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS * 2)
      result.current.flush()
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('flush sparar direkt, och bara en gång', () => {
    const { result, save } = setup()
    act(() => {
      result.current.schedule(3)
    })
    act(() => {
      result.current.flush()
      result.current.flush()
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(3, 'a')
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS * 2)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('sparar inte när butiken redan har fått samma värde utifrån', () => {
    const { result, save, store } = setup()
    act(() => {
      result.current.schedule(7)
    })
    store.a = 7
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS)
    })
    expect(save).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
  })

  it('sparar det som väntar när komponenten försvinner', () => {
    const { result, save, unmount } = setup()
    act(() => {
      result.current.schedule(42)
    })
    unmount()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(42, 'a')
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS * 2)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('sparar på den gamla nyckeln när nyckeln byts', () => {
    const { result, save, store, rerender } = setup({ b: 9 })
    act(() => {
      result.current.schedule(1000)
    })
    rerender({ k: 'b', save })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(1000, 'a')
    expect(store).toEqual({ a: 1000, b: 9 })
    expect(result.current.pending).toBe(false)

    // Nästa värde hör till den nya nyckeln.
    act(() => {
      result.current.schedule(2000)
    })
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS)
    })
    expect(save).toHaveBeenLastCalledWith(2000, 'b')
    expect(store).toEqual({ a: 1000, b: 2000 })
  })

  it('sparar när sidan göms (visibilitychange → hidden) men inte när den visas', () => {
    const { result, save } = setup()
    act(() => {
      result.current.schedule(8)
    })
    setVisibility('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(save).not.toHaveBeenCalled()
    setVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(8, 'a')
  })

  it('sparar när sidan stängs (pagehide)', () => {
    const { result, save } = setup()
    act(() => {
      result.current.schedule(11)
    })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(11, 'a')
  })

  // Chromium skickar pagehide/visibilitychange vid omladdning och en annan adress först när sidan
  // tas bort – då sparas en IndexedDB-transaktion aldrig. beforeunload kommer i tid (e2e-resorna
  // anteckning och vatten-och-steg i scripts/e2e/karna.mjs).
  it('sparar när sidan lämnas (beforeunload) – utan "Lämna sidan?"-dialog', () => {
    const { result, save } = setup()
    act(() => {
      result.current.schedule(13)
    })
    const event = new Event('beforeunload', { cancelable: true })
    act(() => {
      window.dispatchEvent(event)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(13, 'a')
    expect(event.defaultPrevented).toBe(false)
    expect(result.current.pending).toBe(false)
    // pagehide och timern efteråt sparar inte en gång till.
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
      vi.advanceTimersByTime(SAVE_DELAY_MS * 2)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('beforeunload-lyssnaren finns bara medan ett värde väntar', () => {
    const listeners = spyListeners()
    try {
      const { result, save, unmount } = setup({ a: 5 })
      // Inget väntar: ingen lyssnare (sidan kan sparas i bakåt-framåt-cachen).
      expect(listeners.beforeunload().added).toHaveLength(0)
      act(() => {
        result.current.schedule(5)
      })
      expect(listeners.beforeunload().added).toHaveLength(0)

      // Flera ändringar i rad: en lyssnare, som tas bort när värdet har sparats.
      act(() => {
        result.current.schedule(6)
        result.current.schedule(7)
      })
      expect(listeners.beforeunload().added).toHaveLength(1)
      expect(listeners.beforeunload().removed).toHaveLength(0)
      act(() => {
        vi.advanceTimersByTime(SAVE_DELAY_MS)
      })
      expect(save).toHaveBeenCalledWith(7, 'a')
      expect(listeners.beforeunload().removed).toEqual(listeners.beforeunload().added)

      // En ändring som ångras (tillbaka till det sparade värdet) tar också bort den.
      act(() => {
        result.current.schedule(8)
      })
      expect(listeners.beforeunload().added).toHaveLength(2)
      act(() => {
        result.current.schedule(7)
      })
      expect(listeners.beforeunload().removed).toEqual(listeners.beforeunload().added)

      // Avmonteringen sparar det som väntar och lämnar ingen lyssnare kvar.
      act(() => {
        result.current.schedule(9)
      })
      unmount()
      expect(save).toHaveBeenLastCalledWith(9, 'a')
      const { added, removed } = listeners.beforeunload()
      expect(added).toHaveLength(3)
      expect(removed).toEqual(added)
      window.dispatchEvent(new Event('beforeunload'))
      expect(save).toHaveBeenCalledTimes(2)
    } finally {
      listeners.restore()
    }
  })

  it('tar bort lyssnarna när komponenten försvinner', () => {
    const listeners = spyListeners()
    try {
      const { save, unmount } = setup()
      const mounted = { pagehide: listeners.pagehide(), visibility: listeners.visibility() }
      expect(mounted.pagehide.added).toHaveLength(1)
      expect(mounted.pagehide.removed).toHaveLength(0)
      expect(mounted.visibility.added).toHaveLength(1)
      expect(mounted.visibility.removed).toHaveLength(0)

      unmount()
      // Exakt de lyssnare som lades till tas bort – inga blir kvar.
      expect(listeners.pagehide().removed).toEqual(mounted.pagehide.added)
      expect(listeners.visibility().removed).toEqual(mounted.visibility.added)

      setVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('pagehide'))
      expect(save).not.toHaveBeenCalled()
    } finally {
      listeners.restore()
    }
  })

  it('använder alltid den senaste save', () => {
    const { result, save, rerender } = setup()
    act(() => {
      result.current.schedule(5)
    })
    const newer = vi.fn()
    rerender({ k: 'a', save: newer })
    act(() => {
      vi.advanceTimersByTime(SAVE_DELAY_MS)
    })
    expect(save).not.toHaveBeenCalled()
    expect(newer).toHaveBeenCalledWith(5, 'a')
  })

  it('schedule och flush behåller sin identitet mellan renderingarna', () => {
    const { result, rerender, save } = setup()
    const { schedule, flush } = result.current
    act(() => {
      result.current.schedule(1)
    })
    rerender({ k: 'a', save })
    expect(result.current.schedule).toBe(schedule)
    expect(result.current.flush).toBe(flush)
  })

  it('en egen väntetid och jämförelse', () => {
    const { result, save } = setup({ a: 10 }, { delay: 100, equals: (a, b) => Math.round(a ?? 0) === Math.round(b ?? 0) })
    act(() => {
      result.current.schedule(10.2)
    })
    expect(result.current.pending).toBe(false)
    act(() => {
      result.current.schedule(12)
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(save).toHaveBeenCalledWith(12, 'a')
  })

  it('ett fel vid sparningen hamnar i felloggen i stället för att krascha', () => {
    clearErrorLog()
    const { result, rerender } = setup()
    rerender({
      k: 'a',
      save: () => {
        throw new Error('Lagringen är full')
      },
    })
    act(() => {
      result.current.schedule(1)
    })
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(SAVE_DELAY_MS)
      }),
    ).not.toThrow()
    expect(readErrorLog().at(-1)?.message).toMatch(/^Fördröjd sparning: .*Lagringen är full/)
    expect(result.current.pending).toBe(false)
    clearErrorLog()
  })

  it('tål StrictMode: effekterna körs två gånger, men lyssnarna är i balans och inget sparas i onödan', () => {
    const listeners = spyListeners()
    try {
      const { result, save, unmount } = setup({}, {}, true)
      // StrictMode i roten: montera → avmontera → montera. Den första omgången tas bort helt.
      const mounted = { pagehide: listeners.pagehide(), visibility: listeners.visibility() }
      expect(mounted.pagehide.added).toHaveLength(2)
      expect(mounted.pagehide.removed).toEqual([mounted.pagehide.added[0]])
      expect(mounted.visibility.added).toHaveLength(2)
      expect(mounted.visibility.removed).toEqual([mounted.visibility.added[0]])
      expect(save).not.toHaveBeenCalled()

      act(() => {
        result.current.schedule(1)
      })
      act(() => {
        vi.advanceTimersByTime(SAVE_DELAY_MS)
      })
      expect(save).toHaveBeenCalledTimes(1)

      // Lyssnarna finns kvar efter StrictModes extra montering – och bara en gång.
      act(() => {
        result.current.schedule(2)
      })
      act(() => {
        window.dispatchEvent(new Event('pagehide'))
      })
      expect(save).toHaveBeenCalledTimes(2)
      expect(save).toHaveBeenLastCalledWith(2, 'a')
      act(() => {
        result.current.schedule(3)
      })
      setVisibility('hidden')
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(save).toHaveBeenCalledTimes(3)
      expect(save).toHaveBeenLastCalledWith(3, 'a')

      act(() => {
        result.current.schedule(4)
      })
      unmount()
      expect(save).toHaveBeenCalledTimes(4)
      expect(save).toHaveBeenLastCalledWith(4, 'a')
      // Efter avmonteringen är varje lyssnare som lades till också borttagen.
      expect(listeners.pagehide().removed).toEqual(mounted.pagehide.added)
      expect(listeners.visibility().removed).toEqual(mounted.visibility.added)
      expect(listeners.beforeunload().added.length).toBeGreaterThan(0)
      expect(listeners.beforeunload().removed).toEqual(listeners.beforeunload().added)
    } finally {
      listeners.restore()
    }
  })
})
