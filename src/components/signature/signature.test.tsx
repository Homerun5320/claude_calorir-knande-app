/**
 * Tester för Lagoms signaturgrafik: Dagsringen, Tallriken, säsongslandskapet och konfettin.
 * Komponenterna renderas i jsdom med olika props och de rena hjälpfunktionerna kontrolleras.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import {
  CalorieRing,
  Confetti,
  PlateModel,
  SeasonalHeader,
  arcPath,
  describePlate,
  fractionWords,
  macroEnergyShares,
  makeConfetti,
  mindfulLabel,
  moonLitPath,
  moonPhase,
  normalizeFractions,
  sceneLabel,
  summarizeRing,
  wedgePath,
} from './index'

// ---------------------------------------------------------------------------
// Dagsringen
// ---------------------------------------------------------------------------

describe('summarizeRing', () => {
  it('räknar kvar, över och status', () => {
    expect(summarizeRing(860, 2100)).toMatchObject({ total: 2100, remaining: 1240, over: 0, status: 'kvar' })
    expect(summarizeRing(0, 2100).status).toBe('tom')
    expect(summarizeRing(2240, 2100)).toMatchObject({ over: 140, remaining: 0, status: 'over' })
    // Inom ±3 % av målet är det "precis lagom".
    expect(summarizeRing(2080, 2100).status).toBe('lagom')
    expect(summarizeRing(2150, 2100).status).toBe('lagom')
  })

  it('lägger träningen till budgeten och tål konstiga värden', () => {
    expect(summarizeRing(1450, 2100, 320)).toMatchObject({ total: 2420, remaining: 970 })
    const weird = summarizeRing(Number.NaN, -5, Number.POSITIVE_INFINITY)
    expect(weird.total).toBe(1)
    expect(weird.eaten).toBe(0)
    expect(weird.status).toBe('tom')
  })
})

describe('macroEnergyShares', () => {
  it('ger energiandelar enligt Atwater (4/4/9)', () => {
    const s = macroEnergyShares({ protein: 50, carbs: 100, fat: 20 })
    expect(s).not.toBeNull()
    expect(s!.protein + s!.carbs + s!.fat).toBeCloseTo(1)
    expect(s!.fat).toBeCloseTo(180 / 780)
  })
  it('returnerar null utan känd energi', () => {
    expect(macroEnergyShares()).toBeNull()
    expect(macroEnergyShares({ protein: 0, carbs: 0, fat: 0 })).toBeNull()
  })
})

describe('mindfulLabel', () => {
  it('har varma ord utan siffror för hela skalan', () => {
    const titles = [0, 0.2, 0.5, 0.8, 1, 1.15, 1.6].map((r) => mindfulLabel(r).title)
    expect(titles).toEqual(['Redo för dagen', 'Gott om utrymme', 'På god väg', 'Lite kvar', 'Lagom', 'Mätt och belåten', 'Riktigt mätt'])
    for (const r of [0, 0.5, 1.3]) expect(`${mindfulLabel(r).title} ${mindfulLabel(r).hint}`).not.toMatch(/\d/)
  })
})

describe('arcPath', () => {
  it('ritar en båge och hoppar över försumbara', () => {
    expect(arcPath(80, 10, 200)).toMatch(/^M[\d.]+ [\d.]+A80 80 0 1 1 /)
    expect(arcPath(80, 10, 10.01)).toBe('')
  })
})

describe('<CalorieRing>', () => {
  it('visar kvarvarande energi med makrosegment och tillgänglig etikett', () => {
    const { container } = render(<CalorieRing eatenKcal={860} budgetKcal={2100} macros={{ protein: 52, carbs: 96, fat: 30 }} />)
    const ring = screen.getByRole('img', { name: /Dagsringen/ })
    expect(ring).toHaveAccessibleName(/1\s240 kcal kvar av 2\s100 kcal/)
    expect(ring).toHaveAccessibleName(/protein/)
    expect(ring).toHaveAttribute('data-status', 'kvar')
    expect(container).toHaveTextContent('kcal kvar')
    expect(container).toHaveTextContent(/860 av 2\s100 kcal/)
  })

  it('visar överskott mjukt – "över – helt okej", aldrig larm', () => {
    const { container } = render(<CalorieRing eatenKcal={2240} budgetKcal={2100} />)
    const ring = screen.getByRole('img')
    expect(ring).toHaveAttribute('data-status', 'over')
    expect(ring).toHaveAccessibleName(/140 kcal över budgeten på 2\s100 kcal – helt okej/)
    expect(container).toHaveTextContent('kcal över – helt okej')
    expect(screen.getByTestId('ring-over')).toBeInTheDocument()
  })

  it('markerar träning i spåret och i texten', () => {
    const { container } = render(<CalorieRing eatenKcal={1450} budgetKcal={2100} exerciseKcal={320} />)
    expect(screen.getByTestId('ring-exercise')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/320 kcal från träning/)
    expect(container).toHaveTextContent('varav 320 från träning')
  })

  it('döljer alla siffror i medvetet läge', () => {
    const { container } = render(<CalorieRing eatenKcal={1300} budgetKcal={2100} mindful macros={{ protein: 70, carbs: 120, fat: 50 }} />)
    expect(container).toHaveTextContent('På god väg')
    expect(container.textContent).not.toMatch(/\d/)
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toMatch(/\d/)
  })

  it('kan visa kJ och "precis lagom"', () => {
    const { container, rerender } = render(<CalorieRing eatenKcal={1000} budgetKcal={2000} unit="kJ" size={180} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(/kJ kvar/)
    expect(container).toHaveTextContent('kJ kvar')
    rerender(<CalorieRing eatenKcal={2010} budgetKcal={2000} />)
    expect(screen.getByRole('img')).toHaveAttribute('data-status', 'lagom')
    expect(container).toHaveTextContent('precis lagom')
  })
})

// ---------------------------------------------------------------------------
// Tallriken
// ---------------------------------------------------------------------------

describe('tallrikens geometri', () => {
  it('normaliserar andelar och ritar tårtbitar', () => {
    expect(normalizeFractions({ veg: 1, carb: 1, protein: 2 })).toEqual({ veg: 0.25, carb: 0.25, protein: 0.5 })
    expect(normalizeFractions({ veg: -1, carb: Number.NaN, protein: 0.3 })).toEqual({ veg: 0, carb: 0, protein: 0.3 })
    expect(wedgePath(0, 0.1)).toBe('')
    expect(wedgePath(0, 360)).toMatch(/a[\d.]+ [\d.]+ 0 1 0/)
    expect(wedgePath(0, 108)).toMatch(/^M.*Q.*Z$/)
  })

  it('beskriver idealet med ord', () => {
    expect(fractionWords(0.5)).toBe('hälften')
    expect(fractionWords(0.2)).toBe('en femtedel')
    expect(fractionWords(0.3)).toBe('knappt en tredjedel')
    expect(fractionWords(0.4)).toBe('två femtedelar')
    expect(fractionWords(0.62)).toBe('62 %')
    expect(describePlate({ veg: 0, carb: 0, protein: 0 }, { veg: 0.5, carb: 0.3, protein: 0.2 }, true)).toMatch(/tom/)
  })
})

describe('<PlateModel>', () => {
  it('visar faktiska andelar mot idealet', () => {
    const { container } = render(<PlateModel fractions={{ veg: 0.38, carb: 0.4, protein: 0.22 }} />)
    const plate = screen.getByRole('img', { name: /Tallriksmodellen/ })
    expect(plate).toHaveAccessibleName(/grönsaker 38 % \(mål 50 %\)/)
    expect(plate).toHaveAccessibleName(/kolhydrater 40 % \(mål 30 %\)/)
    expect(container).toHaveTextContent('mål 20 %')
    expect(screen.getAllByTestId('plate-ideal-line').length).toBeGreaterThanOrEqual(3)
  })

  it('är vänlig och vacker även tom', () => {
    const { container } = render(<PlateModel fractions={{ veg: 0, carb: 0, protein: 0 }} ideal={{ veg: 0.4, carb: 0.4, protein: 0.2 }} />)
    expect(container).toHaveTextContent('Tallriken väntar på något gott')
    expect(container).toHaveTextContent('två femtedelar grönsaker')
    expect(screen.getByTestId('plate-ideal-veg')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(/tom/)
  })

  it('klarar små storlekar utan etiketter och utan bestick', () => {
    const { container } = render(<PlateModel fractions={{ veg: 1, carb: 0, protein: 0 }} size={120} showLabels={false} cutlery={false} />)
    expect(container.querySelector('figcaption')).toBeNull()
    expect(container.querySelector('svg')).toHaveAttribute('width', '120')
  })

  it('tvingat tomt läge', () => {
    render(<PlateModel fractions={{ veg: 0.5, carb: 0.3, protein: 0.2 }} empty />)
    expect(screen.getByTestId('plate-ideal-carb')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Säsongslandskapet
// ---------------------------------------------------------------------------

describe('himlakroppar', () => {
  it('räknar ut månfasen', () => {
    // Fullmåne 26 september 2026 kl. 16.49 UTC, nymåne 18 januari 2026 kl. 19.52 UTC.
    expect(moonPhase(new Date(Date.UTC(2026, 8, 26, 16, 49)))).toBeCloseTo(0.5, 1)
    const nm = moonPhase(new Date(Date.UTC(2026, 0, 18, 19, 52)))
    expect(Math.min(nm, 1 - nm)).toBeLessThan(0.02)
  })

  it('ritar månens skära', () => {
    expect(moonLitPath(10, 10, 5, 0.25)).toMatch(/^M10 5A5 5 0 0 1 10 15A[\d.]+ 5 0 0 [01] 10 5Z$/)
    expect(moonLitPath(10, 10, 5, 0.8)).toContain('A5 5 0 0 0 10 15')
  })

  it('har svenska stämningsord', () => {
    expect(sceneLabel('sommar', 'natt')).toBe('Ljus sommarnatt')
    expect(sceneLabel('host', 'gryning')).toBe('Höstmorgon')
    expect(sceneLabel('vinter', 'skymning')).toBe('Vinterskymning')
  })
})

describe('<SeasonalHeader>', () => {
  it('vinternatt: norrsken, stjärnor, månen och läsbar text', () => {
    render(
      <SeasonalHeader date="2026-01-15" now={new Date(2026, 0, 15, 23, 0)}>
        <h1 className="text-ink">God kväll</h1>
      </SeasonalHeader>,
    )
    const heading = screen.getByRole('heading', { name: 'God kväll' })
    const root = heading.closest('[data-season]')!
    expect(root).toHaveAttribute('data-season', 'vinter')
    expect(root).toHaveAttribute('data-phase', 'natt')
    expect(root).toHaveAttribute('data-scene', 'Vinternatt')
    expect(screen.getAllByTestId('aurora')).toHaveLength(3)
    expect(screen.getByTestId('celestial-mane')).toBeInTheDocument()
    expect(screen.getByTestId('lake-ice')).toBeInTheDocument()
    expect(screen.getByTestId('cottage')).toHaveAttribute('data-lit', 'true')
    // Texten får ljusa tokens mot natthimlen.
    expect((heading.parentElement as HTMLElement).style.getPropertyValue('--lg-ink')).toContain('white')
  })

  it('sommarnatt: midnattssol i stället för stjärnor', () => {
    render(<SeasonalHeader date="2026-06-21" season="sommar" phase="natt" now={new Date(2026, 5, 21, 0, 30)} />)
    expect(screen.getByTestId('celestial-midnattssol')).toBeInTheDocument()
    expect(screen.queryByTestId('aurora')).toBeNull()
    expect(screen.getByTestId('lake-glow')).toBeInTheDocument()
  })

  it('höstdag: fallande löv, flyttfåglar och svamp i gräset', () => {
    const { container } = render(<SeasonalHeader date="2026-09-26" season="host" phase="dag" now={new Date(2026, 8, 26, 12, 0)} />)
    expect(container.firstElementChild).toHaveAttribute('data-phase', 'dag')
    expect(screen.getByTestId('particles-leaves')).toBeInTheDocument()
    expect(screen.getByTestId('birds')).toBeInTheDocument()
    expect(screen.getByTestId('celestial-sol')).toBeInTheDocument()
    expect(screen.getByTestId('cottage')).toHaveAttribute('data-lit', 'false')
  })

  it('vårgryning: dis över sjön; standardårstid från datumet', () => {
    const { container } = render(<SeasonalHeader date="2026-04-20" phase="gryning" now={new Date(2026, 3, 20, 5, 30)} height={150} />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('data-season', 'var')
    expect(root.style.height).toBe('150px')
    expect(screen.getByTestId('mist')).toBeInTheDocument()
    expect(screen.getByTestId('meadow')).toBeInTheDocument()
  })

  it('räknar fram dygnets fas från klockan', () => {
    const { container } = render(<SeasonalHeader date="2026-06-21" now={new Date(2026, 5, 21, 13, 0)} />)
    expect(container.firstElementChild).toHaveAttribute('data-phase', 'dag')
    expect(container.firstElementChild).toHaveAttribute('data-season', 'sommar')
  })
})

// ---------------------------------------------------------------------------
// Konfetti
// ---------------------------------------------------------------------------

describe('makeConfetti', () => {
  it('är deterministisk och använder skogens tokenfärger', () => {
    const a = makeConfetti(30, 3)
    expect(a).toHaveLength(30)
    expect(makeConfetti(30, 3)).toEqual(a)
    expect(makeConfetti(30, 4)).not.toEqual(a)
    for (const p of a) {
      expect(p.color).toMatch(/^var\(--lg-(lingon|sol|blabar|mossa)\)$/)
      expect(p.peak).toBeLessThan(0) // skjuts uppåt …
      expect(p.dy).toBeGreaterThan(p.peak) // … och faller sedan
    }
  })
})

describe('<Confetti>', () => {
  it('skjuter en skur när utlösaren ändras och städar sedan bort sig själv', async () => {
    const onComplete = vi.fn()
    const { rerender } = render(<Confetti fire={0} count={8} onComplete={onComplete} />)
    expect(screen.queryByTestId('confetti')).toBeNull()

    rerender(<Confetti fire={1} count={8} onComplete={onComplete} />)
    const burst = screen.getByTestId('confetti')
    expect(burst).toHaveAttribute('aria-hidden', 'true')
    expect(burst.querySelectorAll('svg')).toHaveLength(8)

    await waitFor(() => expect(screen.queryByTestId('confetti')).toBeNull(), { timeout: 4000 })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('skjuter inte igen för samma värde, men för ett nytt', async () => {
    const { rerender } = render(<Confetti fire="mål" count={4} fullscreen />)
    expect(screen.getByTestId('confetti').className).toContain('fixed')
    rerender(<Confetti fire="mål" count={4} fullscreen />)
    expect(screen.getAllByTestId('confetti')).toHaveLength(1)
    await act(async () => {
      rerender(<Confetti fire="dag klar" count={4} fullscreen />)
    })
    expect(screen.getByTestId('confetti')).toBeInTheDocument()
  })
})
