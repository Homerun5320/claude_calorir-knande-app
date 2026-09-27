/**
 * Tester för Lagoms UI-kit: inmatning, tangentbordsnavigering, modaler och bekräftelser.
 */
import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import {
  Button,
  ConfirmDialog,
  DialogHost,
  NumberField,
  ProgressBar,
  SegmentedControl,
  Sheet,
  Stepper,
  Switch,
  Tabs,
  TextField,
  confirmDialog,
  stepNumber,
  useDialogStore,
} from './index'

function ControlledNumber({ onValue, initial, ...rest }: { onValue?: (v: number | undefined) => void; initial?: number; min?: number; max?: number; step?: number }) {
  const [value, setValue] = useState<number | undefined>(initial)
  return (
    <NumberField
      label="Mängd"
      suffix="dl"
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

  it('begränsar till max och snyggar till texten när fältet lämnas', async () => {
    const user = userEvent.setup()
    const onValue = vi.fn()
    render(<ControlledNumber onValue={onValue} max={10} />)
    const input = screen.getByRole('spinbutton', { name: 'Mängd' })

    await user.type(input, '25')
    expect(onValue).toHaveBeenLastCalledWith(10)
    expect(input).toHaveValue('25') // inte omskrivet mitt i

    await user.tab()
    expect(input).toHaveValue('10')
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
      <Tabs
        id="insikter"
        aria-label="Insikter"
        value="energi"
        onChange={onChange}
        tabs={[
          { value: 'energi', label: 'Energi' },
          { value: 'makro', label: 'Makro', count: 3 },
        ]}
      />,
    )
    const energi = screen.getByRole('tab', { name: 'Energi' })
    expect(energi).toHaveAttribute('aria-selected', 'true')
    expect(energi).toHaveAttribute('aria-controls', 'insikter-panel-energi')
    energi.focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('makro')
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
