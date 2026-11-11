/**
 * useBottomBarPadding/useTopBarPadding: scroll-padding på <html> som följer en klibbig eller fast
 * list, så att tangentbordsfokus aldrig hamnar under den (WCAG 2.4.11). jsdom har ingen layout –
 * höjden läses ur `data-h` via en ersatt getBoundingClientRect, och ResizeObserver ersätts av en
 * som testet själv kan utlösa.
 */
import { act, render } from '@testing-library/react'
import { useBottomBarPadding, useTopBarPadding } from './useBottomBarPadding'

const html = document.documentElement

/** ResizeObserver-ersättare: testet utlöser `fireResize()` när en lists höjd har ändrats. */
const observers = new Set<() => void>()
class FakeResizeObserver {
  private readonly callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
  }
  observe() {
    observers.add(this.callback)
  }
  disconnect() {
    observers.delete(this.callback)
  }
}
const fireResize = () => act(() => observers.forEach((cb) => cb()))

interface BarProps {
  h: number
  position?: 'fixed' | 'sticky' | 'static'
  bottom?: string
  top?: string
  show?: boolean
}

function BottomBar({ h, position = 'fixed', bottom = '0px', show = true }: BarProps) {
  const ref = useBottomBarPadding()
  return show ? <div ref={ref} data-h={h} data-testid="bar" style={{ position, bottom }} /> : null
}

function TopBar({ h, position = 'sticky', top = '0px' }: BarProps) {
  const ref = useTopBarPadding()
  return <div ref={ref} data-h={h} data-testid="bar" style={{ position, top }} />
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = Number(this.dataset.h ?? 0)
    return { x: 0, y: 0, left: 0, top: 0, right: 390, bottom: height, width: 390, height, toJSON: () => ({}) }
  })
  html.style.scrollPaddingBottom = ''
  html.style.scrollPaddingTop = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  observers.clear()
  html.style.scrollPaddingBottom = ''
  html.style.scrollPaddingTop = ''
})

describe('useBottomBarPadding', () => {
  it('sätter scroll-padding-bottom till listans höjd, avståndet till kanten och lite luft', () => {
    render(<BottomBar h={62} position="sticky" bottom="96px" />)
    // 62 + 96 + 8 px luft för fokusramen
    expect(html.style.scrollPaddingBottom).toBe('166px')
  })

  it('räknar bara höjden när listan varken är fast eller klibbig', () => {
    render(<BottomBar h={50} position="static" bottom="40px" />)
    expect(html.style.scrollPaddingBottom).toBe('58px')
  })

  it('återställer det tidigare inline-värdet när listan försvinner', () => {
    html.style.scrollPaddingBottom = '12px'
    const { unmount } = render(<BottomBar h={76} />)
    expect(html.style.scrollPaddingBottom).toBe('84px')
    unmount()
    expect(html.style.scrollPaddingBottom).toBe('12px')
  })

  it('lämnar <html> orört när listan inte syns (höjd 0)', () => {
    html.style.scrollPaddingBottom = '12px'
    render(<BottomBar h={0} bottom="96px" />)
    expect(html.style.scrollPaddingBottom).toBe('12px')
  })

  it('följer listan när den kommer och går (AnimatePresence-fallet)', () => {
    const { rerender } = render(<BottomBar h={76} show={false} />)
    expect(html.style.scrollPaddingBottom).toBe('')
    rerender(<BottomBar h={76} show />)
    expect(html.style.scrollPaddingBottom).toBe('84px')
    rerender(<BottomBar h={76} show={false} />)
    expect(html.style.scrollPaddingBottom).toBe('')
  })

  it('mäter om när listans höjd ändras (felraden i profilen)', () => {
    const { getByTestId } = render(<BottomBar h={62} position="sticky" bottom="96px" />)
    expect(html.style.scrollPaddingBottom).toBe('166px')
    getByTestId('bar').dataset.h = '102'
    fireResize()
    expect(html.style.scrollPaddingBottom).toBe('206px')
    getByTestId('bar').dataset.h = '62'
    fireResize()
    expect(html.style.scrollPaddingBottom).toBe('166px')
  })

  it('mäter om när fönstret ändrar storlek (annan brytpunkt ger annat avstånd till kanten)', () => {
    const { getByTestId } = render(<BottomBar h={62} position="sticky" bottom="96px" />)
    expect(html.style.scrollPaddingBottom).toBe('166px')
    getByTestId('bar').style.bottom = '24px'
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(html.style.scrollPaddingBottom).toBe('94px')
  })

  it('tar den lista som täcker mest när flera finns, och återställer först när alla är borta', () => {
    html.style.scrollPaddingBottom = '12px'
    const small = render(<BottomBar h={40} />)
    const big = render(<BottomBar h={100} />)
    expect(html.style.scrollPaddingBottom).toBe('108px')
    big.unmount()
    expect(html.style.scrollPaddingBottom).toBe('48px')
    small.unmount()
    expect(html.style.scrollPaddingBottom).toBe('12px')
  })

  it('slutar lyssna när listan är borta', () => {
    const { unmount } = render(<BottomBar h={76} />)
    expect(observers.size).toBe(1)
    unmount()
    expect(observers.size).toBe(0)
    html.style.scrollPaddingBottom = '3px'
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(html.style.scrollPaddingBottom).toBe('3px')
  })

  it('fungerar utan ResizeObserver (äldre webbläsare)', () => {
    vi.unstubAllGlobals()
    const { unmount } = render(<BottomBar h={76} />)
    expect(html.style.scrollPaddingBottom).toBe('84px')
    unmount()
    expect(html.style.scrollPaddingBottom).toBe('')
  })
})

describe('useTopBarPadding', () => {
  it('sätter scroll-padding-top efter listans avstånd från överkanten och höjd', () => {
    html.style.scrollPaddingBottom = '7px'
    const { unmount } = render(<TopBar h={72} top="56px" />)
    expect(html.style.scrollPaddingTop).toBe('136px')
    // Nederkanten är en egen sak.
    expect(html.style.scrollPaddingBottom).toBe('7px')
    unmount()
    expect(html.style.scrollPaddingTop).toBe('')
  })
})
