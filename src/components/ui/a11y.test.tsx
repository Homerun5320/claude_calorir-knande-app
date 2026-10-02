/**
 * Tillgänglighet i UI-kitet (granskningen inför lansering): stor text (WCAG 1.4.4/1.4.10), fältramar
 * (1.4.11), felmeddelanden som läses upp (3.3.1/4.1.3), notiser som hinner läsas (2.2.1) och
 * nyp-zoom i apparna (1.4.4).
 */
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Badge, Button, Chip, ListRow, NumberField, Select, Stat, TextField, toast, useToastStore } from './index'
import { pauseToast, resumeToast, toastDuration } from './toast'
import { RANGE_ANNOUNCE_DELAY_MS } from './NumberField'
import { FIELD_SHELL } from './TextField'

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

/** Läs en fil i repot (sökväg relativt roten). CSS går inte att läsa med ?raw i vitest (blir tom). */
async function readRepoFile(path: string): Promise<string> {
  const { fileURLToPath } = await nodeModule<NodeUrl>('node:url')
  const { dirname, resolve } = await nodeModule<NodePath>('node:path')
  const { readFile } = await nodeModule<NodeFs>('node:fs/promises')
  return readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../..', path), 'utf8')
}

const indexCss = await readRepoFile('src/index.css')
const indexHtml = await readRepoFile('index.html')
const capacitorConfig = await readRepoFile('capacitor.config.ts')

// ---------------------------------------------------------------------------
// Stor text: radbrytning i stället för klippning och sidledsscroll
// ---------------------------------------------------------------------------

/** Klasser som klipper eller blockerar radbrytning. */
const NO_WRAP = /(^|\s)(whitespace-nowrap|truncate)(\s|$)/

describe('stor text – radbrytning', () => {
  it('Button radbryter, har min-h-* i stället för fast höjd och behåller 44 px som minimum', () => {
    const sizes = { sm: 'min-h-9', md: 'min-h-11', lg: 'min-h-14' } as const
    for (const [size, minH] of Object.entries(sizes) as Array<[keyof typeof sizes, string]>) {
      const { unmount } = render(<Button size={size}>Exportera dagbok som CSV</Button>)
      const button = screen.getByRole('button', { name: 'Exportera dagbok som CSV' })
      expect(button).toHaveClass(minH, 'max-w-full', 'text-center')
      expect(button.className).not.toMatch(NO_WRAP)
      expect(button.className).not.toMatch(/(^|\s)h-(9|11|14)(\s|$)/)
      // Texten ligger i ett eget element som får radbrytas.
      const label = screen.getByText('Exportera dagbok som CSV')
      expect(label.className).not.toMatch(NO_WRAP)
      expect(label).toHaveClass('min-w-0', 'break-words')
      unmount()
    }
  })

  it('Chip kan radbrytas men behåller shrink-0 (rader som scrollar i sidled pressas inte ihop)', () => {
    render(<Chip>Kopiera gårdagens middag</Chip>)
    const chip = screen.getByRole('button', { name: 'Kopiera gårdagens middag' })
    expect(chip).toHaveClass('max-w-full', 'shrink-0', 'min-h-9', 'min-w-11')
    expect(chip.className).not.toMatch(NO_WRAP)
    expect(chip.className).not.toMatch(/(^|\s)h-(8|9)(\s|$)/)
  })

  it('Chip: flera barn (emoji + etikett) får luft mellan sig och en truncate-rad kan förkortas', () => {
    render(
      <Chip size="sm" className="max-w-[14rem]">
        <span aria-hidden>🏃</span>
        Löpning
        <span className="truncate">Ett mycket långt namn på en aktivitet</span>
      </Chip>,
    )
    const chip = screen.getByRole('button')
    const wrapper = chip.querySelector('span.min-w-0') as HTMLElement
    expect(wrapper).toHaveClass('inline-flex', 'gap-1.5', 'min-w-0')
    expect(wrapper.querySelector('.truncate')).not.toBeNull()
  })

  it('Badge kan radbrytas och har min-h-* i stället för fast höjd', () => {
    render(
      <>
        <Badge>Inom intervallet</Badge>
        <Badge size="md">Lite högt</Badge>
      </>,
    )
    const small = screen.getByText('Inom intervallet').parentElement!
    const medium = screen.getByText('Lite högt').parentElement!
    expect(small).toHaveClass('min-h-5', 'max-w-full', 'shrink-0')
    expect(medium).toHaveClass('min-h-6')
    for (const badge of [small, medium]) {
      expect(badge.className).not.toMatch(NO_WRAP)
      expect(badge.className).not.toMatch(/(^|\s)h-(5|6)(\s|$)/)
    }
    expect(screen.getByText('Inom intervallet').className).not.toMatch(NO_WRAP)
  })

  it('ListRow visar upp till två rader rubrik och underrubrik i stället för att klippa till en', () => {
    render(<ListRow title="Allergier och överkänslighet" subtitle="Dina egna markeringar för allergener" />)
    const title = screen.getByText('Allergier och överkänslighet')
    const subtitle = screen.getByText('Dina egna markeringar för allergener')
    for (const el of [title, subtitle]) {
      expect(el).toHaveClass('line-clamp-2', 'break-words')
      expect(el.className).not.toMatch(NO_WRAP)
    }
  })

  it('Stat kortar inte etiketten med "…" – den radbryts', () => {
    render(<Stat label="Kolhydrater" value="212" unit="g" />)
    const label = screen.getByText('Kolhydrater')
    expect(label).toHaveClass('min-w-0', 'break-words')
    expect(label.className).not.toMatch(NO_WRAP)
  })

  it('index.css: långa ord bryts och en fieldset kan krympa under sitt bredaste ord', () => {
    expect(indexCss).toMatch(/body \{[^}]*overflow-wrap: break-word;/)
    expect(indexCss).toMatch(/fieldset \{\s*min-width: 0;/)
  })
})

// ---------------------------------------------------------------------------
// Fältramar: minst 3:1 (WCAG 1.4.11)
// ---------------------------------------------------------------------------

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

describe('fältramar', () => {
  const themes = {
    ljust: tokens(between(':root {\n  color-scheme: light;', '\n}')),
    mörkt: tokens(between('  .dark {\n    color-scheme: dark;', '\n  }')),
  }

  for (const [theme, t] of Object.entries(themes)) {
    it(`--lg-field-line har minst 3:1 mot sidan, kortet, fältets fyllning och surface-3 (${theme})`, () => {
      const line = t['field-line']
      expect(line, 'saknar --lg-field-line').toBeDefined()
      for (const surface of ['bg', 'surface', 'surface-2', 'surface-3']) {
        expect(contrast(line!, t[surface]!), `${theme}: field-line mot ${surface}`).toBeGreaterThanOrEqual(3)
      }
    })
  }

  it('fältramen i det delade fältskalet använder tokenen – inte en genomskinlig ram', () => {
    expect(FIELD_SHELL).toContain('ring-field-line')
    expect(FIELD_SHELL).not.toContain('ring-transparent')
    expect(indexCss).toContain('--color-field-line: var(--lg-field-line);')
  })

  it('TextField, NumberField och Select delar fältskalet (ramen syns i alla)', () => {
    render(
      <>
        <TextField label="Namn" />
        <NumberField label="Vikt" value={70} onChange={() => {}} />
        <Select label="Aktivitet" options={[{ value: 'a', label: 'Låg' }]} />
      </>,
    )
    for (const name of ['Namn', 'Vikt', 'Aktivitet']) {
      const control = screen.getByLabelText(name)
      expect(control.closest('[data-invalid]'), name).toHaveClass('ring-field-line')
    }
  })

  it('ett ogiltigt fält får en tydligare, röd ram (ring-2, lingon) även vid hover och fokus', () => {
    expect(FIELD_SHELL).toContain('data-[invalid=true]:ring-2')
    expect(FIELD_SHELL).toContain('data-[invalid=true]:ring-lingon')
    expect(FIELD_SHELL).toContain('data-[invalid=true]:hover:ring-lingon')
    expect(FIELD_SHELL).toContain('data-[invalid=true]:focus-within:ring-lingon')
  })
})

// ---------------------------------------------------------------------------
// Felmeddelanden som läses upp
// ---------------------------------------------------------------------------

/** Fältets beständiga levande region för fel (den enda med aria-atomic). */
function errorRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>('[aria-live][aria-atomic]')
  expect(region, 'ingen levande region för fel').not.toBeNull()
  return region!
}

describe('felmeddelanden', () => {
  it('ligger i en beständig levande region som finns redan innan felet visas', () => {
    const { rerender } = render(<TextField label="Namn" value="" onChange={() => {}} />)
    const region = errorRegion()
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()

    rerender(<TextField label="Namn" value="" onChange={() => {}} error="Ange ett namn" />)
    // Samma element före och efter: skärmläsaren ser en ändring i en region som redan fanns.
    expect(errorRegion()).toBe(region)
    expect(region).toHaveTextContent('Ange ett namn')
    const input = screen.getByRole('textbox', { name: 'Namn' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Ange ett namn')
    expect(region).toContainElement(document.getElementById(input.getAttribute('aria-describedby')!))

    rerender(<TextField label="Namn" value="Eva" onChange={() => {}} />)
    expect(errorRegion()).toBe(region)
    expect(region).toBeEmptyDOMElement()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('hjälptexten ligger utanför regionen (den ska inte läsas upp vid varje ändring) och viker för felet', () => {
    const { rerender } = render(<TextField label="Namn" hint="Så här skriver du" />)
    expect(screen.getByText('Så här skriver du')).toBeInTheDocument()
    expect(errorRegion()).not.toContainElement(screen.getByText('Så här skriver du'))
    rerender(<TextField label="Namn" hint="Så här skriver du" error="Ange ett namn" />)
    expect(screen.queryByText('Så här skriver du')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Namn' })).toHaveAccessibleDescription('Ange ett namn')
  })

  it('ett fel som redan finns när fältet visas ropas inte ut (ingen role="alert")', () => {
    render(<TextField label="Namn" error="Ange ett namn" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(errorRegion()).toHaveTextContent('Ange ett namn')
  })

  it('Select och NumberField kopplar felet med aria-describedby och aria-invalid', () => {
    render(
      <>
        <Select label="Aktivitet" error="Välj aktivitet" options={[{ value: 'a', label: 'Låg' }]} />
        <NumberField label="Mängd" value={undefined} onChange={() => {}} error="Ange en mängd" />
      </>,
    )
    const select = screen.getByLabelText('Aktivitet')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('Välj aktivitet')
    const number = screen.getByRole('spinbutton', { name: 'Mängd' })
    expect(number).toHaveAttribute('aria-invalid', 'true')
    expect(number).toHaveAccessibleDescription('Ange en mängd')
  })
})

describe('NumberField – gränsmeddelandet läses upp (WCAG 3.3.1/4.1.3)', () => {
  function Controlled({ min = 20, max = 400, suffix = 'kg', error }: { min?: number; max?: number; suffix?: string; error?: string }) {
    const [value, setValue] = useState<number | undefined>(undefined)
    return <NumberField label="Vikt" value={value} onChange={setValue} min={min} max={max} suffix={suffix} step={0.1} error={error} />
  }

  /** Den uppläsningsregion (assertive) som NumberField själv styr. */
  const assertive = () => document.querySelector<HTMLElement>('[aria-live="assertive"]')!

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Skriv in en text som en rad tecken (ett change-event per tecken, 100 ms emellan). */
  function typeText(input: HTMLElement, text: string) {
    for (let i = 1; i <= text.length; i++) {
      fireEvent.change(input, { target: { value: text.slice(0, i) } })
      act(() => {
        vi.advanceTimersByTime(100)
      })
    }
  }

  it('läses inte upp vid varje tecken men efter en paus i skrivandet', () => {
    vi.useFakeTimers()
    render(<Controlled />)
    const input = screen.getByRole('spinbutton', { name: 'Vikt' })
    typeText(input, '7,24')
    // Medan man skriver: meddelandet syns (och är kopplat till fältet) men ropas inte ut.
    expect(input).toHaveAccessibleDescription('Ange ett värde mellan 20 och 400\u00a0kg.')
    expect(assertive()).toBeEmptyDOMElement()
    expect(errorRegion()).toHaveAttribute('aria-live', 'off')

    act(() => {
      vi.advanceTimersByTime(RANGE_ANNOUNCE_DELAY_MS - 200)
    })
    expect(assertive()).toBeEmptyDOMElement()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(assertive().textContent).toBe('Ange ett värde mellan 20 och 400\u00a0kg.')

    // Nästa tecken nollställer uppläsningen (så att samma text kan läsas upp igen efter nästa paus).
    typeText(input, '7,245')
    expect(assertive()).toBeEmptyDOMElement()
    act(() => {
      vi.advanceTimersByTime(RANGE_ANNOUNCE_DELAY_MS + 50)
    })
    expect(assertive().textContent).toBe('Ange ett värde mellan 20 och 400\u00a0kg.')
  })

  it('en paus avbryts när värdet blir giltigt – inget läses upp i onödan', () => {
    vi.useFakeTimers()
    render(<Controlled />)
    const input = screen.getByRole('spinbutton', { name: 'Vikt' })
    typeText(input, '7') // utanför
    expect(input).toHaveAttribute('aria-invalid', 'true')
    typeText(input, '72') // giltigt
    act(() => {
      vi.advanceTimersByTime(RANGE_ANNOUNCE_DELAY_MS * 2)
    })
    expect(assertive()).toBeEmptyDOMElement()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('läses upp direkt vid Enter och vid blur – då också vad värdet blev', () => {
    vi.useFakeTimers()
    render(<Controlled />)
    const input = screen.getByRole('spinbutton', { name: 'Vikt' })
    typeText(input, '7')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(assertive().textContent).toBe('Ange ett värde mellan 20 och 400\u00a0kg.')

    fireEvent.blur(input)
    // Värdet kläms till 20 när fältet lämnas – skärmläsaren får veta det.
    expect(input).toHaveValue('20')
    expect(assertive().textContent).toBe('Ange ett värde mellan 20 och 400\u00a0kg. Värdet sattes till 20\u00a0kg.')
  })

  it('ett giltigt värde ger ingen uppläsning vid blur', () => {
    vi.useFakeTimers()
    render(<Controlled />)
    const input = screen.getByRole('spinbutton', { name: 'Vikt' })
    typeText(input, '72,4')
    fireEvent.blur(input)
    expect(assertive()).toBeEmptyDOMElement()
    expect(input).toHaveValue('72,4')
  })

  it('förälderns eget fel läses upp artigt av fältramen när det dyker upp', () => {
    const { rerender } = render(<NumberField label="Mängd" value={undefined} onChange={() => {}} />)
    const region = errorRegion()
    expect(region).toHaveAttribute('aria-live', 'polite')
    rerender(<NumberField label="Mängd" value={undefined} onChange={() => {}} error="Ange en mängd." />)
    expect(errorRegion()).toBe(region)
    expect(region).toHaveTextContent('Ange en mängd.')
  })

  it('den stora portionsväljaren har samma regioner och en synlig ram under siffran', () => {
    const { container } = render(<NumberField size="lg" label="Mängd" value={150} onChange={() => {}} suffix="g" />)
    expect(errorRegion()).toHaveAttribute('aria-live', 'polite')
    expect(assertive()).toBeEmptyDOMElement()
    // Understrykningen är fältets enda ram i stort läge – samma 3:1-token som övriga fält.
    expect(container.querySelector('.bg-field-line')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Notiser: visningstid efter längd (WCAG 2.2.1)
// ---------------------------------------------------------------------------

describe('toastDuration', () => {
  afterEach(() => {
    vi.useRealTimers()
    act(() => useToastStore.setState({ toasts: [] }))
  })

  const LONG = 'Tryck på ”Börja med min egen profil” för att lägga in dina egna uppgifter – då startar provperioden på 14 dagar.'

  it('en kort notis visas minst 4 s, ett fel minst 6 s och en notis med åtgärd minst 8 s', () => {
    expect(toastDuration({ message: 'Tillagt' })).toBe(4000)
    expect(toastDuration({ message: 'Tillagt', tone: 'error' })).toBe(6000)
    expect(toastDuration({ message: 'Borttaget', action: { label: 'Ångra', onClick: () => {} } })).toBe(8000)
    // Utan meddelande (som tidigare anrop) gäller miniminivåerna.
    expect(toastDuration({})).toBe(4000)
    expect(toastDuration({ tone: 'error' })).toBe(6000)
  })

  it('en lång förklaring får tid att läsas – cirka 60 ms per tecken plus tid att uppfatta den', () => {
    expect(LONG.length).toBeGreaterThan(100)
    const ms = toastDuration({ message: LONG })
    expect(ms).toBe(2000 + 60 * LONG.length)
    expect(ms).toBeGreaterThan(8000)
    // Ett fel och en notis med åtgärd växer på samma sätt – men aldrig under sin miniminivå.
    expect(toastDuration({ message: LONG, tone: 'error' })).toBe(ms)
    expect(toastDuration({ message: LONG, action: { label: 'Ångra', onClick: () => {} } })).toBe(ms)
    expect(toastDuration({ message: 'x'.repeat(130), action: { label: 'Ångra', onClick: () => {} } })).toBe(9800)
  })

  it('är aldrig längre än 15 s och ett eget duration gäller alltid', () => {
    expect(toastDuration({ message: 'x'.repeat(1000) })).toBe(15_000)
    expect(toastDuration({ message: 'x'.repeat(1000), duration: 2500 })).toBe(2500)
    expect(toastDuration({ message: LONG, duration: 1000 })).toBe(1000)
  })

  it('notisen ligger kvar så länge som beräknat och pausas fortfarande vid hovring och fokus', () => {
    vi.useFakeTimers()
    let id = ''
    const shown = () => useToastStore.getState().toasts.map((t) => t.id)
    act(() => {
      id = toast(LONG)
    })
    const ms = toastDuration({ message: LONG })
    act(() => {
      vi.advanceTimersByTime(ms - 1000)
    })
    expect(shown()).toContain(id)

    // Pausad: ligger kvar hur länge som helst.
    pauseToast(id)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(shown()).toContain(id)
    resumeToast(id)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(shown()).not.toContain(id)

    // Och en kort notis försvinner efter sin miniminivå (4 s), inte efter den långas tid.
    act(() => {
      id = toast('Tillagt')
    })
    act(() => {
      vi.advanceTimersByTime(3900)
    })
    expect(shown()).toContain(id)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(shown()).not.toContain(id)
  })
})

// ---------------------------------------------------------------------------
// Nyp-zoom (WCAG 1.4.4)
// ---------------------------------------------------------------------------

describe('zoom', () => {
  it('webbens viewport blockerar inte zoom', () => {
    const viewport = /<meta name="viewport" content="([^"]*)"/.exec(indexHtml)?.[1] ?? ''
    expect(viewport).toContain('width=device-width')
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/i)
    expect(viewport).not.toMatch(/maximum-scale/i)
    expect(viewport).not.toMatch(/minimum-scale/i)
  })

  it('apparna tillåter nyp-zoom i webbvyn (Capacitors standard är av)', () => {
    for (const platform of ['ios', 'android']) {
      const block = new RegExp(`\\n  ${platform}: \\{[\\s\\S]*?\\n  \\},`).exec(capacitorConfig)?.[0] ?? ''
      expect(block, `saknar ${platform}-blocket i capacitor.config.ts`).not.toBe('')
      expect(block, `${platform}.zoomEnabled`).toMatch(/\n    zoomEnabled: true,/)
    }
  })
})
