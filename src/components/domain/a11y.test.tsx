/**
 * Tillgänglighet i domänkomponenterna (granskningen inför lansering): dagbyte som läses upp
 * (WCAG 4.1.3), kontrast på den valda enhetschipens gramvikt (1.4.3) och namn som skärmläsare
 * faktiskt hör i näringstabellen (aria-label på element utan roll ignoreras).
 */
import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MotionGlobalConfig } from 'motion/react'
import type { ISODate } from '../../types'
import { havregryn } from '../../features/add/testFoods'
import { DateNavigator, NutrientTable } from './index'
import { PortionPicker } from './PortionPicker'

// Node-moduler laddas dynamiskt (appens tsconfig har inte Node-typerna).
interface NodeFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>
}
interface NodeUrl {
  fileURLToPath(url: string): string
}
interface NodePath {
  dirname(p: string): string
  resolve(...parts: string[]): string
}
const nodeModule = <T,>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>

async function readRepoFile(path: string): Promise<string> {
  const { fileURLToPath } = await nodeModule<NodeUrl>('node:url')
  const { dirname, resolve } = await nodeModule<NodePath>('node:path')
  const { readFile } = await nodeModule<NodeFs>('node:fs/promises')
  return readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../..', path), 'utf8')
}

const indexCss = await readRepoFile('src/index.css')

MotionGlobalConfig.skipAnimations = true

/** Relativ luminans för #rrggbb. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** --lg-*-färgerna (bara #rrggbb) i ett CSS-block. */
function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/--lg-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]!] = m[2]!
  return out
}

/** Blocket som börjar vid `start` och slutar vid första `end` därefter. */
function between(start: string, end: string): string {
  const from = indexCss.indexOf(start)
  expect(from, `hittar inte ${start} i index.css`).toBeGreaterThanOrEqual(0)
  return indexCss.slice(from, indexCss.indexOf(end, from))
}

const themes = {
  ljust: tokens(between(':root {\n  color-scheme: light;', '\n}')),
  mörkt: tokens(between('  .dark {\n    color-scheme: dark;', '\n  }')),
}

// ---------------------------------------------------------------------------
// Dagbyte
// ---------------------------------------------------------------------------

const TODAY: ISODate = '2026-09-27' // en söndag, vecka 39

/** Styrd datumväljare, så att pilarna, svepet och datumfältet faktiskt byter dag. */
function Controlled({ start = TODAY }: { start?: ISODate }) {
  const [date, setDate] = useState<ISODate>(start)
  return <DateNavigator date={date} onChange={setDate} today={TODAY} />
}

describe('DateNavigator – dagbyte läses upp', () => {
  it('har en tom statusregion från start, så att inget läses upp när sidan öppnas', () => {
    render(<Controlled />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    expect(status).toHaveClass('sr-only')
  })

  it('läser upp den nya dagen när man trycker på pilarna och "Till idag"', async () => {
    render(<Controlled />)
    const status = screen.getByRole('status')
    fireEvent.click(screen.getByRole('button', { name: /^Föregående dag/ }))
    expect(status).toHaveTextContent('Visar igår, lördag 26 september, vecka 39')
    fireEvent.click(screen.getByRole('button', { name: /^Föregående dag/ }))
    expect(status).toHaveTextContent('Visar fredag 25 september, vecka 39')
    // Den gamla dagens innehåll lämnar sidan med en kort animation – vänta tills bara ett "Gå till idag" finns.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Gå till idag' })).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Gå till idag' }))
    expect(status).toHaveTextContent('Visar idag, söndag 27 september, vecka 39')
    fireEvent.click(screen.getByRole('button', { name: /^Nästa dag/ }))
    expect(status).toHaveTextContent('Visar imorgon, måndag 28 september, vecka 40')
  })

  it('läser upp dagen även när den byts med svep eller i datumfältet', () => {
    const { container } = render(<Controlled />)
    const status = screen.getByRole('status')
    const group = screen.getByRole('group', { name: 'Välj dag' })

    // Svep åt höger = föregående dag.
    fireEvent.pointerDown(group, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200 })
    fireEvent.pointerUp(group, { pointerId: 1, pointerType: 'touch', clientX: 240, clientY: 205 })
    expect(status).toHaveTextContent('Visar igår, lördag 26 september, vecka 39')

    const picker = container.querySelector<HTMLInputElement>('input[type="date"]')!
    fireEvent.change(picker, { target: { value: '2026-09-22' } })
    expect(status).toHaveTextContent('Visar tisdag 22 september, vecka 39')
  })

  it('läser upp en ändring utifrån (ny date-prop) men inte en omrendering med samma dag', () => {
    const { rerender } = render(<DateNavigator date="2026-09-27" onChange={() => {}} today={TODAY} />)
    const status = screen.getByRole('status')
    rerender(<DateNavigator date="2026-09-27" onChange={() => {}} today={TODAY} />)
    expect(status).toBeEmptyDOMElement()
    rerender(<DateNavigator date="2026-09-20" onChange={() => {}} today={TODAY} />)
    expect(status).toHaveTextContent('Visar söndag 20 september, vecka 38')
  })

  it('utelämnar veckan när den inte visas och lägger till årtalet för ett annat år', () => {
    const { rerender } = render(<DateNavigator date="2026-09-27" onChange={() => {}} today={TODAY} showWeek={false} />)
    const status = screen.getByRole('status')
    rerender(<DateNavigator date="2026-09-23" onChange={() => {}} today={TODAY} showWeek={false} />)
    expect(status).toHaveTextContent(/^Visar onsdag 23 september$/)
    rerender(<DateNavigator date="2025-12-31" onChange={() => {}} today={TODAY} showWeek={false} />)
    expect(status).toHaveTextContent(/^Visar onsdag 31 december 2025$/)
  })

  it('behåller knappens etikett med dagen ("… Välj datum")', () => {
    render(<Controlled />)
    expect(screen.getByRole('button', { name: 'Idag, söndag 27 september, vecka 39. Välj datum' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Enhetschip: gramvikten på den valda chipen
// ---------------------------------------------------------------------------

describe('PortionPicker – enhetschips', () => {
  it('visar gramvikten på den valda chipen i en heltäckande färg (inte opacitet)', () => {
    render(<PortionPicker food={havregryn} onConfirm={() => {}} />)
    const units = screen.getByRole('group', { name: 'Enhet' })
    fireEvent.click(within(units).getByRole('button', { name: /^dl/ }))

    const selected = within(units).getByRole('button', { pressed: true })
    const detail = within(selected).getByText(/35 g/)
    expect(detail).toHaveClass('text-ink-2')
    expect(selected.innerHTML).not.toMatch(/opacity-/)
    // Mellanrum mellan etiketten och vikten (chipens text ligger i ett enda element).
    expect(selected.textContent).toBe('dl · 35 g')

    // Övriga chips: vikten i text-ink-3, aldrig genomskinlig.
    const others = within(units).getAllByRole('button', { pressed: false })
    expect(others.length).toBeGreaterThan(1)
    for (const chip of others) {
      const weight = chip.querySelector('span > span')
      if (weight) expect(weight).toHaveClass('text-ink-3')
    }
    expect(units.innerHTML).not.toMatch(/opacity-75/)
  })

  it('en icke vald chip använder text-ink-3 för vikten', () => {
    render(<PortionPicker food={{ ...havregryn, portions: [{ id: 'port', label: '1 portion', grams: 50 }] }} onConfirm={() => {}} />)
    const units = screen.getByRole('group', { name: 'Enhet' })
    fireEvent.click(within(units).getByRole('button', { name: /^1 portion/ }))
    const dl = within(units).getByRole('button', { name: /^dl/ })
    expect(dl).toHaveAttribute('aria-pressed', 'false')
    expect(within(dl).getByText(/35 g/)).toHaveClass('text-ink-3')
  })

  for (const [theme, t] of Object.entries(themes)) {
    it(`färgerna på chipens gramvikt har minst 4,5:1 mot den valda fyllningen och ytan (${theme})`, () => {
      // Vald chip: text-ink-2 på gran-soft. Icke vald: text-ink-3 på surface (hover: surface-2).
      expect(contrast(t['ink-2']!, t['gran-soft']!), `${theme}: ink-2 mot gran-soft`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t['ink-3']!, t['surface']!), `${theme}: ink-3 mot surface`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t['ink-3']!, t['surface-2']!), `${theme}: ink-3 mot surface-2`).toBeGreaterThanOrEqual(4.5)
    })
  }
})

// ---------------------------------------------------------------------------
// Näringstabellen: namn som läses upp
// ---------------------------------------------------------------------------

describe('NutrientTable – namn för skärmläsare', () => {
  const nutrients = { kcal: 387, protein: 12, fat: 9.5, carbs: 60, fiber: 4 }

  it('ett okänt värde läses som "okänt" (ett streck för ögat, ordet för skärmläsaren)', () => {
    const { container } = render(<NutrientTable nutrients={nutrients} keys={['protein', 'salt']} defaultExpanded={['makro', 'kolhydrat', 'ovrigt']} showCompleteness={false} />)
    const salt = screen.getByText('Salt').closest('div') as HTMLElement
    const dash = within(salt).getByText('–')
    expect(dash).toHaveAttribute('aria-hidden', 'true')
    expect(within(salt).getByText('okänt')).toHaveClass('sr-only')
    // aria-label på ett element utan roll ignoreras – inga sådana kvar i tabellen.
    for (const el of Array.from(container.querySelectorAll('[aria-label]'))) {
      expect(el.getAttribute('role') ?? el.tagName.toLowerCase(), `aria-label på <${el.tagName.toLowerCase()}>`).not.toMatch(/^(span|div|p)$/)
    }
  })

  it('gruppknappens namn innehåller hur många ämnen som är kända', () => {
    render(<NutrientTable nutrients={nutrients} keys={['protein', 'fat', 'salt']} showCompleteness={false} />)
    // protein och fett är kända, salt inte: "2 av 3 kända".
    const button = screen.getAllByRole('button').find((b) => /av \d+ kända/.test(b.textContent ?? ''))
    expect(button).toBeDefined()
    expect(button!.querySelector('[aria-hidden="true"]')).toHaveTextContent(/^\d+\/\d+$/)
    expect(button!.textContent).toMatch(/\d+ av \d+ kända/)
  })
})
