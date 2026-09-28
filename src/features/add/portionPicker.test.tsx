import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  PortionPicker,
  amountForUnitChange,
  amountHint,
  amountSuffix,
  formatFraction,
  initialSelection,
  isUsableUnit,
  mindfulPortionLabel,
  portionNoun,
  quickChoices,
  unitChipLabel,
} from '../../components/domain/PortionPicker'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { bulle, havregryn, kycklingbrost, mjolk, risKokt } from './testFoods'

describe('initialSelection', () => {
  it('använder livsmedlets första portion som standard', () => {
    expect(initialSelection(bulle)).toEqual({ amount: 1, unit: 'portion:st', grams: 60 })
  })

  it('använder 100 g när portioner saknas och dl saknar densitet', () => {
    expect(initialSelection({ portions: [] })).toEqual({ amount: 100, unit: 'g', grams: 100 })
  })

  it('kommer ihåg senast använda mängd och enhet', () => {
    const sel = initialSelection(bulle, { usage: { lastAmount: 2, lastUnit: 'portion:stor' } })
    expect(sel).toEqual({ amount: 2, unit: 'portion:stor', grams: 220 })
  })

  it('ignorerar en sparad enhet som inte längre finns', () => {
    const sel = initialSelection(bulle, { usage: { lastAmount: 3, lastUnit: 'portion:borta' } })
    expect(sel.unit).toBe('portion:st')
  })

  it('låter uttrycklig startmängd gå före historiken', () => {
    const sel = initialSelection(mjolk, { amount: 3, unit: 'dl', usage: { lastAmount: 1, lastUnit: 'portion:glas' } })
    expect(sel.amount).toBe(3)
    expect(sel.unit).toBe('dl')
    expect(sel.grams).toBeCloseTo(309)
  })

  it('tolkar mängd utan enhet i den förvalda enheten', () => {
    expect(initialSelection(bulle, { amount: 2 })).toMatchObject({ amount: 2, unit: 'portion:st', grams: 120 })
  })
})

describe('enheter', () => {
  it('känner igen användbara enheter', () => {
    expect(isUsableUnit(havregryn, 'dl')).toBe(true)
    expect(isUsableUnit(bulle, 'dl')).toBe(false)
    expect(isUsableUnit(bulle, undefined)).toBe(false)
  })

  it('behåller vikten när man byter till gram', () => {
    expect(amountForUnitChange(bulle, 2, 'portion:st', 'g')).toBe(120)
  })

  it('väljer ett jämnt antal om vikten passar, annars standardmängden', () => {
    expect(amountForUnitChange(bulle, 120, 'g', 'portion:st')).toBe(2)
    expect(amountForUnitChange(bulle, 90, 'g', 'portion:st')).toBe(1.5)
    expect(amountForUnitChange(bulle, 70, 'g', 'portion:st')).toBe(1)
    expect(amountForUnitChange(mjolk, 100, 'g', 'dl')).toBe(1)
    expect(amountForUnitChange(havregryn, 70, 'g', 'dl')).toBe(2)
    expect(amountForUnitChange(havregryn, 105, 'g', 'dl')).toBe(3)
    expect(amountForUnitChange(havregryn, 50, 'g', 'dl')).toBe(2) // 1,43 dl → standardmängden
  })

  it('visar gramvikt på chipsen men upprepar den inte', () => {
    expect(unitChipLabel(bulle, 'portion:st')).toEqual({ label: '1 st (medel)', detail: '60 g' })
    expect(unitChipLabel(bulle, 'portion:stor')).toEqual({ label: '1 stor kafébulle (ca 110 g)', detail: undefined })
    expect(unitChipLabel(havregryn, 'dl')).toEqual({ label: 'dl', detail: '35 g' })
    expect(unitChipLabel(mjolk, 'dl')).toEqual({ label: 'dl' })
    expect(unitChipLabel(bulle, 'g')).toEqual({ label: 'g' })
  })

  it('ger korta enheter efter siffran', () => {
    expect(portionNoun('1 st (medel)')).toBe('st')
    expect(portionNoun('1 skiva')).toBe('skiva')
    expect(amountSuffix(bulle, 'portion:st')).toBe('st')
    expect(amountSuffix(bulle, 'portion:stor')).toBe('×')
    expect(amountSuffix(bulle, 'g')).toBe('g')
  })

  it('beskriver vikten under siffran', () => {
    expect(amountHint(bulle, 2, 'portion:st')).toBe('≈ 120 g')
    expect(amountHint(bulle, 1, 'portion:stor')).toBe('1 stor kafébulle (ca 110 g)')
    expect(amountHint(bulle, 90, 'g')).toBe('≈ 1½ × 1 st (medel)')
    expect(amountHint(bulle, 70, 'g')).toBe('')
  })
})

describe('snabbval och ord', () => {
  it('ger ½–2 för portioner och mått, 50–200 g för gram', () => {
    expect(quickChoices('portion:st').map((q) => q.label)).toEqual(['½', '1', '1½', '2'])
    expect(quickChoices('dl').map((q) => q.label)).toEqual(['½ dl', '1 dl', '1½ dl', '2 dl'])
    expect(quickChoices('g').map((q) => q.amount)).toEqual([50, 100, 150, 200])
  })

  it('formaterar bråk', () => {
    expect(formatFraction(0.5)).toBe('½')
    expect(formatFraction(2.25)).toBe('2¼')
    expect(formatFraction(0.4)).toBe('0,4')
    expect(formatFraction(3)).toBe('3')
  })

  it('beskriver portionen i ord i medvetet läge', () => {
    expect(mindfulPortionLabel(undefined)).toBe('Energivärde saknas')
    expect(mindfulPortionLabel(30)).toBe('Ett litet tilltugg')
    expect(mindfulPortionLabel(300)).toBe('En lagom portion')
  })
})

describe('<PortionPicker />', () => {
  beforeEach(() => {
    useFoodStore.setState({ usage: {} })
    useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: false, energyUnit: 'kcal' } }))
  })
  afterEach(() => {
    useFoodStore.setState({ usage: {} })
  })

  it('visar energin för vald mängd och bekräftar med gram', () => {
    const onConfirm = vi.fn()
    render(<PortionPicker food={bulle} onConfirm={onConfirm} confirmLabel="Lägg till i Fika" />)
    // 1 st = 60 g → 207 kcal
    expect(screen.getAllByText('207').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '2 × 1 st (medel)' }))
    expect(screen.getAllByText('414').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till i Fika' }))
    expect(onConfirm).toHaveBeenCalledWith(2, 'portion:st', 120)
  })

  it('tar emot svenska decimaltal', () => {
    const onConfirm = vi.fn()
    render(<PortionPicker food={bulle} onConfirm={onConfirm} />)
    const input = screen.getByRole('spinbutton', { name: 'Mängd' })
    fireEvent.change(input, { target: { value: '1,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(onConfirm).toHaveBeenCalledWith(1.5, 'portion:st', 90)
  })

  it('byter enhet och behåller vikten i gram', () => {
    const onChange = vi.fn()
    render(<PortionPicker food={bulle} onConfirm={() => {}} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^g$/ }))
    expect(onChange).toHaveBeenLastCalledWith({ amount: 60, unit: 'g', grams: 60 })
  })

  it('förvalt är senast använda mängd', () => {
    act(() => {
      useFoodStore.getState().recordUsage(bulle.id, 2, 'portion:stor', 'fika')
    })
    const onChange = vi.fn()
    render(<PortionPicker food={bulle} onConfirm={() => {}} onChange={onChange} />)
    expect(onChange).toHaveBeenLastCalledWith({ amount: 2, unit: 'portion:stor', grams: 220 })
  })

  it('döljer siffror i medvetet läge', () => {
    act(() => {
      useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: true } }))
    })
    render(<PortionPicker food={bulle} onConfirm={() => {}} />)
    expect(screen.getAllByText('En lagom portion').length).toBeGreaterThan(0)
    expect(screen.queryByText('207')).not.toBeInTheDocument()
  })

  it('varnar och spärrar när vikten inte kan räknas ut', () => {
    const onConfirm = vi.fn()
    render(<PortionPicker food={bulle} initialAmount={2} initialUnit={'portion:borta'} onConfirm={onConfirm} />)
    // Okänd enhet ersätts av förvald – ingen varning.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Mängd' }), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Lägg till' })).toBeDisabled()
  })
})

describe('rå/okokt vikt i väljaren', () => {
  beforeEach(() => {
    useFoodStore.setState({ usage: {} })
    useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: false, energyUnit: 'kcal' } }))
  })

  it('har chips, efterled och hjälprad för rå vikt', () => {
    expect(isUsableUnit(kycklingbrost, 'g-ra')).toBe(true)
    expect(isUsableUnit(bulle, 'g-ra')).toBe(false)
    expect(isUsableUnit(kycklingbrost, 'dl-ra')).toBe(false)
    expect(unitChipLabel(kycklingbrost, 'g-ra')).toEqual({ label: 'g rå' })
    expect(unitChipLabel(risKokt, 'g-ra')).toEqual({ label: 'g okokt' })
    expect(unitChipLabel(risKokt, 'dl-ra')).toEqual({ label: 'dl okokt', detail: '230 g tillagat' })
    // Vanlig volym gäller den tillagade varan.
    expect(unitChipLabel({ ...risKokt, density: 0.8 }, 'dl')).toEqual({ label: 'dl tillagat', detail: '80 g' })
    expect(amountSuffix(kycklingbrost, 'g-ra')).toBe('g rå')
    expect(amountSuffix(risKokt, 'dl-ra')).toBe('dl okokt')
    expect(amountHint(kycklingbrost, 150, 'g-ra')).toBe('≈ 113 g tillagat')
    expect(quickChoices('g-ra')).toEqual([
      { amount: 50, label: '50 g' },
      { amount: 100, label: '100 g' },
      { amount: 150, label: '150 g' },
      { amount: 200, label: '200 g' },
    ])
    expect(quickChoices('dl-ra').map((q) => q.label)).toEqual(['½ dl', '1 dl', '1½ dl', '2 dl'])
  })

  it('behåller vikten när man byter mellan tillagat och rått', () => {
    // 113 g tillagat ≈ 151 g rått
    expect(amountForUnitChange(kycklingbrost, 113, 'g', 'g-ra')).toBe(151)
    expect(amountForUnitChange(kycklingbrost, 200, 'g-ra', 'g')).toBe(150)
    // 1 filé (95 g tillagat) ≈ 127 g rått
    expect(amountForUnitChange(kycklingbrost, 1, 'portion:file', 'g-ra')).toBe(127)
    // 2 dl okokt ris → 459 g kokt; tillbaka blir det 2 dl
    expect(amountForUnitChange(risKokt, 459, 'g', 'dl-ra')).toBe(2)
  })

  it('visar en hjälptext och bekräftar i rå vikt', () => {
    const onConfirm = vi.fn()
    render(<PortionPicker food={kycklingbrost} onConfirm={onConfirm} />)
    expect(screen.queryByText(/Väg rått/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^g rå/ }))
    expect(screen.getByText('Väg rått – Lagom räknar om till tillagad vikt (1 g rå ≈ 0,75 g tillagat).')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Mängd' }), { target: { value: '200' } })
    expect(screen.getByText('≈ 150 g tillagat')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(onConfirm).toHaveBeenCalledWith(200, 'g-ra', 150)
  })

  it('startar i rå vikt när den användes senast', () => {
    act(() => {
      useFoodStore.getState().recordUsage(kycklingbrost.id, 180, 'g-ra', 'middag')
    })
    const onChange = vi.fn()
    render(<PortionPicker food={kycklingbrost} onConfirm={() => {}} onChange={onChange} />)
    expect(onChange).toHaveBeenLastCalledWith({ amount: 180, unit: 'g-ra', grams: 135 })
    expect(screen.getByText(/1 g rå ≈ 0,75 g tillagat/)).toBeInTheDocument()
  })
})
