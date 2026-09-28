/**
 * Tester för domänkomponenterna: livsmedelsrader, kategoriikoner, näringstabellen,
 * datumväljaren och vattenglasen.
 */
import { render, screen, within } from '@testing-library/react'
import type { Food } from '../../types'
import { targetLabelFor } from '../charts/BarChart'
import { CategoryIcon, DateNavigator, FoodRow, NutrientTable, WaterGlasses, describeAmount, foodEmoji } from './index'

const bar: Pick<Food, 'portions' | 'density' | 'liquid'> = {
  portions: [{ id: 'st', label: '1 st (15 g)', grams: 15 }],
  density: undefined,
  liquid: false,
}

describe('describeAmount', () => {
  it('upprepar aldrig vikten när portionen redan anger den', () => {
    expect(describeAmount(bar, 1, 'portion:st')).toBe('1 st (15 g)')
    expect(describeAmount(bar, 1, 'portion:st')).not.toMatch(/\(15 g\) \(15 g\)/)
    expect(describeAmount(bar, 2, 'portion:st')).toBe('2 st (30 g)')
  })
})

describe('FoodRow', () => {
  it('visar makron med bokstav (P/K/F), inte bara färg', () => {
    render(<FoodRow name="Havregrynsgröt" amountText="1 portion (250 g)" kcal={170} macros={{ protein: 6, carbs: 28, fat: 3 }} />)
    const row = screen.getByText('Havregrynsgröt').closest('div') as HTMLElement
    expect(row).toHaveTextContent(/P\s6/)
    expect(row).toHaveTextContent(/K\s28/)
    expect(row).toHaveTextContent(/F\s3/)
  })

  it('kan visa namnet på tre rader', () => {
    const { rerender } = render(<FoodRow name="Ett mycket långt livsmedelsnamn" />)
    expect(screen.getByText('Ett mycket långt livsmedelsnamn')).toHaveClass('line-clamp-2')
    rerender(<FoodRow name="Ett mycket långt livsmedelsnamn" nameLines={3} />)
    expect(screen.getByText('Ett mycket långt livsmedelsnamn')).toHaveClass('line-clamp-3')
  })

  it('väljer emoji efter namnet när kategorin är grov', () => {
    render(<FoodRow name="Smörgås, grovt bröd med smör och ost" category="fardigratt" />)
    expect(screen.getByText('🥪')).toBeInTheDocument()
  })
})

describe('foodEmoji / CategoryIcon', () => {
  it('känner igen huvudordet i svenska namn', () => {
    expect(foodEmoji('Smörgås, grovt bröd med smör och ost', 'fardigratt')).toBe('🥪')
    expect(foodEmoji('Fralla med ost, skinka och grönsaker', 'fardigratt')).toBe('🥪')
    expect(foodEmoji('Kycklinggryta med grädde och paprika, med ris', 'fardigratt')).toBe('🍲')
    expect(foodEmoji('Blåbärspaj', 'bakverk')).toBe('🥧')
    expect(foodEmoji('Smulpaj med äpple (havresmul)', 'bakverk')).toBe('🥧')
    expect(foodEmoji('Pizza Vesuvio (skinka)', 'snabbmat')).toBe('🍕')
    expect(foodEmoji('Banan', 'frukt')).toBe('🍌')
    expect(foodEmoji('Kaffe med mjölk (bryggkaffe med skvätt mellanmjölk)', 'dryck')).toBe('☕')
  })

  it('förstår Livsmedelsverkets namn: "m." och "u." och huvudordet först', () => {
    expect(foodEmoji('Pannkaka tunn m. vatten', 'fardigratt')).toBe('🥞')
    expect(foodEmoji('Pannkaka tunn u. mjölk ägg', 'fardigratt')).toBe('🥞')
    expect(foodEmoji('Ärtsoppa fläsk tillagad konserv. m. vatten', 'fardigratt')).toBe('🍲')
    // Samma ikon som Lagoms kurerade köttbullar.
    expect(foodEmoji('Köttbullar nöt stekta', 'fardigratt')).toBe(foodEmoji('Färdiga köttbullar', 'rott_kott'))
    expect(foodEmoji('Köttbullar nöt stekta', 'fardigratt')).toBe('🧆')
    expect(foodEmoji('Hårt bröd fullkorn råg vete majs m. surdeg fibrer 15 % typ spisbröd', 'brod')).toBe('🍞')
    expect(foodEmoji('Paprika grön', 'gronsaker')).toBe('🫑')
    expect(foodEmoji('Pirog m. kött ugnsstekt typ sambusa', 'snabbmat')).toBe('🥟')
    // Beskrivningar längre in i namnet styr inte ikonen.
    expect(foodEmoji('Yoghurt mild honung fett 2 % berikad', 'mejeri')).toBe('🥛')
    expect(foodEmoji('Krabba vitt kött kokt', 'skaldjur')).toBe('🦐')
    expect(foodEmoji('Wienerbröd m. vaniljkräm sylt florsocker', 'bakverk')).not.toBe('🥪')
    expect(foodEmoji('Glassandwich', 'glass_dessert')).toBe('🍨')
  })

  it('går inte på falska träffar och faller tillbaka på kategorin', () => {
    expect(foodEmoji('Knäckebröd Frukost', 'brod')).toBe('🍞') // inte ost
    expect(foodEmoji('Sidfläsk, färskt, stekt', 'rott_kott')).not.toBe('🥤') // inte läsk
    expect(foodEmoji('Grovt bröd med frön och kärnor', 'brod')).toBe('🍞')
    expect(foodEmoji('Tekaka', 'brod')).toBe('🍞')
    expect(foodEmoji('Okänd rätt', 'fardigratt')).toBe('🍲')
    expect(foodEmoji(undefined, undefined)).toBe('🍽️')
  })

  it('CategoryIcon använder namnet och kan läsa upp kategorin', () => {
    render(<CategoryIcon category="fardigratt" name="Räksmörgås" labelled />)
    const icon = screen.getByRole('img', { name: 'Färdigrätter' })
    expect(icon).toHaveTextContent('🥪')
  })
})

describe('NutrientTable', () => {
  const nutrients = { kcal: 387, protein: 12, fat: 9.5, carbs: 60, fiber: 4, salt: 1.2 }

  it('visar etiketten som den skrivs, energi med riktiga mellanslag och h3 under ett korts h2', () => {
    render(
      <section>
        <h2>Näringsvärden</h2>
        <NutrientTable nutrients={nutrients} caption="Per portion (160 g)" showStatus={false} />
      </section>,
    )
    const caption = screen.getByText('Per portion (160 g)')
    expect(caption).not.toHaveClass('eyebrow') // inga versaler ("160 G")
    expect(screen.getByRole('heading', { name: /Makronäringsämnen/ })).toHaveProperty('tagName', 'H3')
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument()
    const energy = screen.getByText('Energi').parentElement as HTMLElement
    expect(energy.textContent?.replace(/ /g, ' ')).toMatch(/387 kcal \(1 619 kJ\)/)
  })

  it('visar värden med ofullständig täckning som "minst …"', () => {
    render(
      <NutrientTable
        nutrients={{ ...nutrients, vitD: 3.2 }}
        coverage={{ protein: 1, fat: 1, carbs: 1, fiber: 0.6, salt: 0, vitD: 0.5 }}
        keys={['protein', 'fiber', 'salt', 'vitD']}
        defaultExpanded={['makro', 'kolhydrat', 'ovrigt', 'vitamin']}
        showCompleteness={false}
      />,
    )
    const fiber = screen.getByText("Fibrer").closest('div') as HTMLElement
    expect(within(fiber).getByText(/minst/)).toBeInTheDocument()
    const protein = screen.getByText('Protein').closest('div') as HTMLElement
    expect(protein).not.toHaveTextContent('minst')
    // Ingen täckning alls = okänt, inte "minst 1,2 g".
    const salt = screen.getByText('Salt').closest('div') as HTMLElement
    expect(within(salt).getByLabelText('okänt')).toBeInTheDocument()
    expect(screen.getByText(/”Minst” betyder/)).toBeInTheDocument()
  })

  it('bygger en giltig beskrivningslista (dt/dd direkt i gruppen)', () => {
    const { container } = render(<NutrientTable nutrients={nutrients} references={{ protein: { ri: 50 } }} />)
    for (const dt of Array.from(container.querySelectorAll('dt'))) {
      expect(dt.parentElement?.parentElement?.tagName).toBe('DL')
    }
  })
})

describe('DateNavigator', () => {
  it('skriver veckodagen med liten bokstav mitt i en mening och stor först på raden', () => {
    render(<DateNavigator date="2026-09-26" onChange={() => {}} today="2026-09-27" />)
    // 2026-09-25 är en fredag.
    expect(screen.getByRole('button', { name: 'Föregående dag, fredag 25 september' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nästa dag, söndag 27 september' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Igår, lördag 26 september, vecka 39. Välj datum' })).toBeInTheDocument()
    expect(screen.getByText('Lördag 26 sep')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gå till idag' })).toBeInTheDocument()
  })

  it('visar veckonumret på idag', () => {
    render(<DateNavigator date="2026-09-27" onChange={() => {}} today="2026-09-27" />)
    expect(screen.getByText('Söndag 27 sep · v. 39')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gå till idag' })).not.toBeInTheDocument()
  })
})

describe('WaterGlasses', () => {
  it('visar siffran och enheten var för sig ("0,88" + "liter")', () => {
    render(<WaterGlasses ml={875} targetMl={2000} onAdd={() => {}} onRemove={() => {}} />)
    const number = screen.getByText('0,88')
    expect(number).toHaveClass('font-display')
    expect(number.parentElement?.textContent?.replace(/ /g, ' ')).toMatch(/^0,88 liter av 2 liter/)
    expect(screen.getByRole('group', { name: 'Vatten: 0,88 liter av 2 liter' })).toBeInTheDocument()
  })
})

describe('BarChart – mållinjens etikett', () => {
  it('använder målets egen precision', () => {
    // Axel 0, 1, 2, 3 (heltal) – "Klimatsmart" 1,6 kg ska inte bli "2".
    expect(targetLabelFor(1.6, [0, 1, 2, 3])).toBe('1,6')
    expect(targetLabelFor(2000, [0, 1000, 2000])).toBe('2 000')
    expect(targetLabelFor(0.25, [0, 0.5, 1])).toBe('0,25')
  })
})
