/**
 * Tester för Lagoms UI-kit: inmatning, tangentbordsnavigering, modaler och bekräftelser.
 */
import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import {
  Button,
  Chip,
  ConfirmDialog,
  DialogHost,
  EmptyState,
  ExternalLink,
  NumberField,
  ProgressBar,
  SegmentedControl,
  Sheet,
  Stepper,
  Switch,
  Tabs,
  TextField,
  ToastViewport,
  confirmDialog,
  stepNumber,
  tabPanelProps,
  toast,
  useDialogStore,
  useToastStore,
} from './index'
import { pauseToast, resumeToast, toastDuration } from './toast'
import { rangeMessage } from './NumberField'

/** Webbläsare eller app – styr ExternalLinks skärmläsartext. */
const platform = vi.hoisted(() => ({ inApp: false }))
vi.mock('../../config/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/platform')>()),
  isInApp: () => platform.inApp,
}))

function ControlledNumber({
  onValue,
  initial,
  suffix = 'dl',
  ...rest
}: {
  onValue?: (v: number | undefined) => void
  initial?: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  autoComplete?: string
  error?: string
}) {
  const [value, setValue] = useState<number | undefined>(initial)
  return (
    <NumberField
      label="Mängd"
      suffix={suffix}
      value={value}
      onChange={(v) => {
        setValue(v)
        onValue?.(v)
      }}
      {...rest}
    />
  )
}

describe('NumberField', () => {
  it('tolkar svenskt decimalkomma och behåller den råa texten medan man skriver', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<ControlledNumber onValue={onValue} />)
    const input = screen.getByRole('spinbutton', { name: 'Mängd' })

    await user.type(input, '1,')
    // "1," är ett giltigt tal (1) men texten får inte formateras om mitt i skrivandet.
    expect(input).toHaveValue('1,')
    expect(onValue).toHaveBeenLastCalledWith(1)

    await user.type(input, '5')
    expect(input).toHaveValue('1,5')
    expect(onValue).toHaveBeenLastCalledWith(1.5)
    expect(input).toHaveAttribute('aria-valuenow', '1.5')
    expect(input).toHaveAttribute('inputmode', 'decimal')

    await user.tab()
    expect(input).toHaveValue('1,5')
  })

  it('tolkar blandade tal som "1 1/2" rätt (inte 11/2)', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<ControlledNumber onValue={onValue} />)
    const input = screen.getByRole('spinbutton', { name: 'Mängd' })
    await user.type(input, '1 1/2')
    expect(onValue).toHaveBeenLastCalledWith(1.5)
    expect(onValue).not.toHaveBeenCalledWith(5.5)
    expect(onValue).not.toHaveBeenCalledWith(11)
    await user.tab()
    expect(input).toHaveValue('1,5')
  })

  it('ignorerar bokstäver och ger undefined för tomt fält', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<ControlledNumber onValue={onValue} initial={2} />)
    const input = screen.getByRole('spinbutton', { name: 'Mängd' })
    expect(input).toHaveValue('2')

    await user.type(input, 'abc')
    expect(input).toHaveValue('2')

    await user.clear(input)
    expect(onValue).toHaveBeenLastCalledWith(undefined)
    expect(input).toHaveValue('')
  })

  it('klämmer inte medan man skriver – visar ett meddelande och klämmer först när fältet lämnas', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<ControlledNumber onValue={onValue} max={10} />)
    const input = screen.getByRole('spinbutton', { name: 'Mängd' })

    await user.type(input, '25')
    // Föräldern får inget ogiltigt värde – och inte heller ett tyst ändrat (10).
    expect(onValue).toHaveBeenLastCalledWith(undefined)
    expect(onValue).not.toHaveBeenCalledWith(10)
    expect(input).toHaveValue('25') // inte omskrivet mitt i
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Ange högst 10\u00a0dl.')

    await user.tab()
    expect(input).toHaveValue('10')
    expect(onValue).toHaveBeenLastCalledWith(10)
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('går att skriva "7,24" och "72,4" i ett fält med min 20 (vikt)', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <ControlledNumber onValue={onValue} min={20} max={400} suffix="kg" step={0.1} />
      </form>,
    )
    const input = screen.getByRole('spinbutton', { name: 'Mängd' })

    await user.type(input, '7,24')
    expect(input).toHaveValue('7,24')
    expect(onValue).not.toHaveBeenCalledWith(20)
    expect(screen.getByText('Ange ett värde mellan 20 och 400 kg.')).toBeInTheDocument()
    // Enter skickar inte formuläret med ett värde utanför gränserna.
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, '72,4')
    expect(onValue).toHaveBeenLastCalledWith(72.4)
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(/Ange ett värde mellan/)).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('gränsmeddelandet går före förälderns fel och stegning klämmer', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<ControlledNumber onValue={onValue} min={10} max={3000} step={50} suffix="ml" error="Ange en mängd." />)
    const input = screen.getByRole('spinbutton', { name: 'Mängd' })
    await user.type(input, '5000')
    expect(input).toHaveAccessibleDescription('Ange ett värde mellan 10 och 3\u00a0000\u00a0ml.')
    await user.keyboard('{ArrowUp}')
    expect(onValue).toHaveBeenLastCalledWith(3000)
    expect(input).toHaveValue('3000')
  })

  it('autoComplete är "off" som standard och kan sättas', () => {
    const { unmount } = render(<ControlledNumber />)
    expect(screen.getByRole('spinbutton', { name: 'Mängd' })).toHaveAttribute('autocomplete', 'off')
    unmount()
    render(<ControlledNumber autoComplete="bday-year" />)
    expect(screen.getByRole('spinbutton', { name: 'Mängd' })).toHaveAttribute('autocomplete', 'bday-year')
  })

  it('rangeMessage formulerar gränserna på svenska', () => {
    expect(rangeMessage(20, 400, 'kg')).toBe('Ange ett värde mellan 20 och 400 kg.')
    expect(rangeMessage(0.5, undefined)).toBe('Ange minst 0,5.')
    expect(rangeMessage(undefined, 10000, 'g')).toBe('Ange högst 10 000 g.')
  })

  it('stegar med piltangenter (Shift = ×10) och snäpper till steget', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<ControlledNumber onValue={onValue} initial={1.5} step={0.5} min={0} />)
    const input = screen.getByRole('spinbutton', { name: 'Mängd' })
    input.focus()

    await user.keyboard('{ArrowUp}')
    expect(onValue).toHaveBeenLastCalledWith(2)
    expect(input).toHaveValue('2')

    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(onValue).toHaveBeenLastCalledWith(0)
  })
})

describe('stepNumber', () => {
  it('snäpper till stegrutnätet och undviker flyttalsbrus', () => {
    expect(stepNumber(155, 1, 10)).toBe(160)
    expect(stepNumber(160, 1, 10)).toBe(170)
    expect(stepNumber(155, -1, 10)).toBe(150)
    expect(stepNumber(0.2, 1, 0.1)).toBe(0.3)
    expect(stepNumber(undefined, 1, 1, 1)).toBe(2)
    expect(stepNumber(1, -1, 1, 1)).toBe(1)
  })
})

describe('Stepper', () => {
  it('ökar och minskar inom gränserna', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [n, setN] = useState(1)
      return <Stepper label="Portioner" value={n} onChange={setN} min={1} max={2} />
    }
    render(<Harness />)
    const minus = screen.getByRole('button', { name: 'Minska portioner' })
    const plus = screen.getByRole('button', { name: 'Öka portioner' })
    expect(minus).toBeDisabled()

    await user.click(plus)
    expect(screen.getByRole('group', { name: 'Portioner' })).toHaveTextContent('2')
    expect(plus).toBeDisabled()
  })
})

describe('Switch', () => {
  it('växlar via klick på reglaget och på etiketten', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch label="Visa klimatpåverkan" description="Uppskattad CO₂e" onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'Visa klimatpåverkan' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveAccessibleDescription('Uppskattad CO₂e')

    await user.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(onChange).toHaveBeenLastCalledWith(true)

    await user.click(screen.getByText('Visa klimatpåverkan'))
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('är kontrollerad när checked anges', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch aria-label="Mörkt läge" checked={false} onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'Mörkt läge' })
    await user.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })
})

describe('SegmentedControl', () => {
  const options = [
    { value: 'dag', label: 'Dag' },
    { value: 'vecka', label: 'Vecka' },
    { value: 'manad', label: 'Månad' },
  ] as const

  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [v, setV] = useState<(typeof options)[number]['value']>('dag')
    return (
      <SegmentedControl
        aria-label="Period"
        value={v}
        options={options}
        onChange={(next) => {
          setV(next)
          onChange(next)
        }}
      />
    )
  }

  it('flyttar och väljer med piltangenter, Home och End', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expect(screen.getByRole('radiogroup', { name: 'Period' })).toBeInTheDocument()

    await user.tab()
    const dag = screen.getByRole('radio', { name: 'Dag' })
    expect(dag).toHaveFocus()
    expect(dag).toHaveAttribute('aria-checked', 'true')
    // Endast valt alternativ är tabbstopp.
    expect(screen.getByRole('radio', { name: 'Vecka' })).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('vecka')
    expect(screen.getByRole('radio', { name: 'Vecka' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Vecka' })).toHaveAttribute('aria-checked', 'true')

    await user.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith('manad')

    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('dag') // runt till början

    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('manad')
  })
})

describe('Tabs', () => {
  it('kopplar flikar till paneler och byter med piltangenter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <>
        <Tabs
          id="insikter"
          aria-label="Insikter"
          value="energi"
          onChange={onChange}
          tabs={[
            { value: 'energi', label: 'Energi' },
            { value: 'makro', label: 'Makro', count: 3 },
          ]}
        />
        <div {...tabPanelProps('insikter', 'energi')}>Energi-innehåll</div>
      </>,
    )
    const energi = screen.getByRole('tab', { name: 'Energi' })
    expect(energi).toHaveAttribute('aria-selected', 'true')
    expect(energi).toHaveAttribute('aria-controls', 'insikter-panel-energi')
    expect(screen.getByRole('tabpanel', { name: 'Energi' })).toBeInTheDocument()
    // Makro-panelen finns inte i dokumentet – då pekar aria-controls inte dit.
    expect(screen.getByRole('tab', { name: /Makro/ })).not.toHaveAttribute('aria-controls')
    energi.focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('makro')
  })

  it('tar emot egna panel-id:n och kan stänga av aria-controls', () => {
    const tabs = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]
    const { unmount } = render(<Tabs aria-label="Val" value="a" onChange={() => {}} tabs={tabs} controls={(v) => `egen-${v}`} />)
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-controls', 'egen-b')
    unmount()
    render(<Tabs aria-label="Val" value="a" onChange={() => {}} tabs={tabs} controls="none" />)
    expect(screen.getByRole('tab', { name: 'A' })).not.toHaveAttribute('aria-controls')
  })
})

describe('SegmentedControl – aria', () => {
  it('skickar vidare aria-describedby och aria-invalid till radiogruppen', () => {
    render(
      <>
        <SegmentedControl
          aria-label="Kön"
          aria-describedby="kon-fel"
          aria-invalid
          id="kon"
          value=""
          onChange={() => {}}
          options={[
            { value: 'kvinna', label: 'Kvinna' },
            { value: 'man', label: 'Man' },
          ]}
        />
        <p id="kon-fel">Välj ett alternativ.</p>
      </>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Kön' })
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(group).toHaveAccessibleDescription('Välj ett alternativ.')
    expect(group).toHaveAttribute('id', 'kon')
  })
})

describe('toast', () => {
  beforeEach(() => {
    act(() => {
      for (const t of useToastStore.getState().toasts) useToastStore.getState().dismiss(t.id)
    })
  })

  it('visar ångra-notiser minst 8 s och pausar medan man är i dem', () => {
    vi.useFakeTimers()
    try {
      expect(toastDuration({ action: { label: 'Ångra', onClick: () => {} } })).toBeGreaterThanOrEqual(8000)
      let id = ''
      act(() => {
        id = toast('Borttaget', { action: { label: 'Ångra', onClick: () => {} } })
      })
      act(() => vi.advanceTimersByTime(7000))
      expect(useToastStore.getState().toasts.map((t) => t.id)).toContain(id)
      pauseToast(id)
      act(() => vi.advanceTimersByTime(60_000))
      expect(useToastStore.getState().toasts.map((t) => t.id)).toContain(id)
      resumeToast(id)
      act(() => vi.advanceTimersByTime(2000))
      expect(useToastStore.getState().toasts.map((t) => t.id)).not.toContain(id)
    } finally {
      vi.useRealTimers()
    }
  })

  it('har en stängknapp och lämnar tillbaka fokus när Ångra trycks', async () => {
    const user = userEvent.setup()
    const undo = vi.fn()
    render(
      <>
        <button type="button">Sök</button>
        <ToastViewport />
      </>,
    )
    const origin = screen.getByRole('button', { name: 'Sök' })
    origin.focus()
    act(() => {
      toast('Tillagt i lunch', { action: { label: 'Ångra', onClick: undo } })
    })
    // Tangentbordsanvändaren går in i notisen och trycker Ångra.
    await user.tab()
    expect(screen.getByRole('button', { name: 'Ångra' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Stäng notisen' })).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(undo).toHaveBeenCalledTimes(1)
    expect(origin).toHaveFocus() // inte <body>
    expect(useToastStore.getState().toasts).toHaveLength(0)

    act(() => {
      toast('Sparat')
    })
    await user.click(await screen.findByRole('button', { name: 'Stäng notisen' }))
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('Escape stänger notisen men inte arket bakom', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <>
        <Sheet open onClose={onClose} title="Portion">
          <button type="button">Lägg till</button>
        </Sheet>
        <ToastViewport />
      </>,
    )
    screen.getByRole('button', { name: 'Lägg till' }).focus()
    act(() => {
      toast('Tillagt', { action: { label: 'Ångra', onClick: () => {} } })
    })
    act(() => screen.getByRole('button', { name: 'Ångra' }).focus())
    await user.keyboard('{Escape}')
    expect(useToastStore.getState().toasts).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
    // Fokus tillbaka in i arket.
    expect(screen.getByRole('dialog', { name: 'Portion' }).contains(document.activeElement)).toBe(true)
  })
})

describe('EmptyState – rubriknivå', () => {
  it('blir h2 direkt under sidans h1 och h3 under ett korts h2', () => {
    render(
      <>
        <h1>Recept</h1>
        <EmptyState title="Inga recept ännu" />
        <section>
          <h2>Mina recept</h2>
          <EmptyState title="Inget sparat" compact />
        </section>
        <EmptyState title="Egen nivå" titleAs="h4" />
      </>,
    )
    expect(screen.getByRole('heading', { name: 'Inga recept ännu' })).toHaveProperty('tagName', 'H2')
    expect(screen.getByRole('heading', { name: 'Inget sparat' })).toHaveProperty('tagName', 'H3')
    expect(screen.getByRole('heading', { name: 'Egen nivå' })).toHaveProperty('tagName', 'H4')
  })
})

describe('TextField', () => {
  it('rensar ett kontrollerat fält med rensa-knappen', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [q, setQ] = useState('kanelbulle')
      return <TextField label="Sök" clearable value={q} onValueChange={setQ} />
    }
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: 'Sök' })
    expect(input).toHaveValue('kanelbulle')
    await user.click(screen.getByRole('button', { name: 'Rensa' }))
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Rensa' })).not.toBeInTheDocument()
  })

  it('kopplar felmeddelandet till fältet', () => {
    render(<TextField label="Namn" error="Ange ett namn" />)
    const input = screen.getByRole('textbox', { name: 'Namn' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Ange ett namn')
  })
})

describe('Button', () => {
  it('renderar som länk med to och blockerar klick under laddning', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <MemoryRouter>
        <Button to="/recept">Mina recept</Button>
        <Button loading onClick={onClick}>
          Spara
        </Button>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Mina recept' })).toHaveAttribute('href', '/recept')
    const save = screen.getByRole('button', { name: 'Spara' })
    expect(save).toHaveAttribute('aria-busy', 'true')
    await user.click(save)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('ProgressBar', () => {
  it('visar överskott lugnt i stället för att klippa', () => {
    render(<ProgressBar aria-label="Energi" value={2400} max={2000} valueText="2 400 av 2 000 kcal" />)
    const bar = screen.getByRole('progressbar', { name: 'Energi' })
    expect(bar).toHaveAttribute('aria-valuenow', '2400')
    expect(bar).toHaveAttribute('aria-valuemax', '2000')
    expect(bar).toHaveAttribute('aria-valuetext', '2 400 av 2 000 kcal')
    expect(screen.getByTestId('progress-over')).toBeInTheDocument()
  })
})

describe('Sheet', () => {
  it('är en tillgänglig modal som stängs med Escape och fångar fokus', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <>
        <button type="button">Utanför</button>
        <Sheet open onClose={onClose} title="Välj portion" description="Ange mängd">
          <button type="button">Lägg till</button>
        </Sheet>
      </>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Välj portion' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Ange mängd')
    expect(dialog).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    // Tab cirkulerar inom arket: Stäng → Lägg till → Stäng.
    await user.tab()
    expect(screen.getByRole('button', { name: 'Stäng' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Lägg till' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Stäng' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('gör appen bakom arket inert medan det är öppet', async () => {
    const user = userEvent.setup()
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button">Bakom</button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Portion">
            innehåll
          </Sheet>
        </>
      )
    }
    render(<Harness />, { container: root })
    expect(root).toHaveAttribute('inert')
    // Arket ligger i en portal utanför #root och går att använda.
    expect(root.contains(screen.getByRole('dialog', { name: 'Portion' }))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(root).not.toHaveAttribute('inert'))
    root.remove()
  })

  it('återställer fokus och scroll när arket stängs', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Öppna
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Portion">
            innehåll
          </Sheet>
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Öppna' })
    await user.click(opener)
    expect(screen.getByRole('dialog', { name: 'Portion' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Stäng' }))
    await waitFor(() => expect(opener).toHaveFocus())
    expect(document.body.style.overflow).toBe('')
  })
})

describe('ConfirmDialog', () => {
  beforeEach(() => {
    useDialogStore.setState({ current: null, open: false, queue: [] })
  })

  it('kontrollerad dialog: Avbryt får fokus vid destruktiva val', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog open title="Ta bort receptet?" message="Det går inte att ångra." tone="danger" onConfirm={onConfirm} onCancel={onCancel} />)
    const dialog = screen.getByRole('alertdialog', { name: 'Ta bort receptet?' })
    expect(dialog).toHaveAccessibleDescription('Det går inte att ångra.')
    expect(screen.getByRole('button', { name: 'Avbryt' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Ta bort' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('confirmDialog() löses med true vid bekräftelse och false vid Escape', async () => {
    const user = userEvent.setup()
    render(<DialogHost />)

    let first!: Promise<boolean>
    act(() => {
      first = confirmDialog({ title: 'Rensa dagen?', message: 'Alla poster tas bort.', confirmLabel: 'Rensa', tone: 'danger' })
    })
    await user.click(await screen.findByRole('button', { name: 'Rensa' }))
    await expect(first).resolves.toBe(true)

    let second!: Promise<boolean>
    act(() => {
      second = confirmDialog({ title: 'Byta enhet?' })
    })
    // Nästa dialog visas när den förra har animerats ut.
    const dialog = await screen.findByRole('alertdialog', { name: 'Byta enhet?' }, { timeout: 2000 })
    expect(screen.getByRole('button', { name: 'Bekräfta' })).toHaveFocus()
    expect(dialog).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await expect(second).resolves.toBe(false)
  })
})

describe('ExternalLink', () => {
  afterEach(() => {
    platform.inApp = false
  })

  it('öppnar i ny flik utan att dela varifrån besökaren kom', () => {
    render(<ExternalLink href="https://www.1177.se">1177 Vårdguiden</ExternalLink>)
    const link = screen.getByRole('link', { name: '1177 Vårdguiden (öppnas i ny flik)' })
    expect(link).toHaveAttribute('href', 'https://www.1177.se')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // Ikonen är dekoration – skärmläsare hör texten i stället.
    const icon = link.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(link.querySelector('.sr-only')).toHaveTextContent('(öppnas i ny flik)')
    // Synlig fokus.
    expect(link.className).toMatch(/focus-visible:outline/)
  })

  it('säger "öppnas utanför appen" i appen', () => {
    platform.inApp = true
    render(<ExternalLink href="https://www.livsmedelsverket.se">Livsmedelsverket</ExternalLink>)
    expect(screen.getByRole('link', { name: 'Livsmedelsverket (öppnas utanför appen)' })).toHaveAttribute('target', '_blank')
  })

  it('mailto: och tel: får varken ikon, ny flik eller extra text', () => {
    render(
      <>
        <ExternalLink href="mailto:support@example.invalid">Mejla supporten</ExternalLink>
        <ExternalLink href="tel:+46700000000">Ring</ExternalLink>
      </>,
    )
    for (const name of ['Mejla supporten', 'Ring']) {
      const link = screen.getByRole('link', { name })
      expect(link).not.toHaveAttribute('target')
      expect(link).not.toHaveAttribute('rel')
      expect(link.querySelector('svg')).toBeNull()
    }
  })

  it('tar egen klass och kan dölja ikonen, men behåller skärmläsartexten', () => {
    render(
      <ExternalLink href="https://world.openfoodfacts.org" className="flex min-h-11 items-center" showIcon={false}>
        Open Food Facts
      </ExternalLink>,
    )
    const link = screen.getByRole('link', { name: 'Open Food Facts (öppnas i ny flik)' })
    expect(link).toHaveClass('flex', 'min-h-11')
    expect(link).not.toHaveClass('underline')
    expect(link.querySelector('svg')).toBeNull()
  })
})

describe('Chip – tryckyta', () => {
  it('är minst 44 px bred även med en kort text ("g")', () => {
    render(<Chip>g</Chip>)
    const chip = screen.getByRole('button', { name: 'g' })
    expect(chip).toHaveClass('min-w-11', 'justify-center')
    // Osynlig utökning av höjden till 44 px.
    expect(chip.className).toMatch(/after:-inset-y-1\.5/)
  })
})
