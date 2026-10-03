/**
 * Stor text (200 %): domänkomponenterna får inte klippa text med "…" eller tvinga fram vågrät
 * scroll när rotens teckenstorlek fördubblas (alla rem-mått växer, men telefonens bredd gör det inte).
 *
 * jsdom har ingen layout, så testet kontrollerar orsakerna i markeringen: texten får brytas
 * (`break-words`, `min-w-0`, `flex-wrap`) i stället för `truncate`/`whitespace-nowrap`, och raderna
 * som är för smala för sina kolumner byter layout med en containerfråga (`@container` +
 * `@max-[…rem]`). rem i en containerfråga följer rotens teckenstorlek – vid normal text (raderna
 * ≈ 20 rem breda) gäller reglerna aldrig, så sidorna ser ut precis som förut. Själva mätningen
 * (390 px bred vy, html 16/24/32 px) görs i en riktig webbläsare, se docs/ eller scripts/e2e.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MotionGlobalConfig } from 'motion/react'
import { DateNavigator, FoodRow, MacroBars, NutrientTable, WaterGlasses } from './index'

MotionGlobalConfig.skipAnimations = true

const TARGETS = { proteinG: 90, carbsG: 240, fatG: 70, fiberG: 25 }
const TOTALS = { kcal: 1200, protein: 60, carbs: 150, fat: 40, fiber: 12 }

describe('stor text – MacroBars (kompakt)', () => {
  it('fyra kolumner blir 2 × 2 när raden är för smal, och etiketterna klipps aldrig', () => {
    const { container } = render(<MacroBars totals={TOTALS} targets={TARGETS} variant="compact" />)
    const list = container.querySelector('ul') as HTMLElement
    expect(list).toHaveClass('@container', 'grid-cols-4')
    for (const li of within(list).getAllByRole('listitem')) {
      expect(li).toHaveClass('min-w-0', '@max-[14rem]:col-span-2')
    }
    // Ingen text i staplarna är avklippt med "…".
    expect(list.querySelector('.truncate')).toBeNull()
    expect(screen.getByText('Kolhydr.')).toHaveClass('break-words')
  })

  it('tre kolumner blir en kolumn', () => {
    const { container } = render(<MacroBars totals={TOTALS} targets={{ ...TARGETS, fiberG: undefined }} variant="compact" />)
    const items = within(container.querySelector('ul') as HTMLElement).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    for (const li of items) expect(li).toHaveClass('@max-[12rem]:col-span-3')
  })

  it('den detaljerade varianten bryter raden i stället för att trycka ut gram och mål', () => {
    const { container } = render(<MacroBars totals={TOTALS} targets={TARGETS} variant="detailed" />)
    const row = screen.getByText('Protein').parentElement as HTMLElement
    expect(row).toHaveClass('flex-wrap')
    expect(screen.getByText('Protein')).toHaveClass('min-w-0', 'break-words')
    expect(container.querySelector('.truncate')).toBeNull()
  })
})

describe('stor text – DateNavigator', () => {
  it('rubriken och raden under får brytas, och pilarna krymper till 44 px när navigatorn är smal', () => {
    render(<DateNavigator date="2026-09-26" onChange={() => {}} today="2026-09-27" />)
    const group = screen.getByRole('group', { name: 'Välj dag' })
    expect(group).toHaveClass('@container')
    // "Igår" och raden under (aria-hidden) är vanlig text som bryts, inte "…".
    expect(screen.getByText('Igår')).toHaveClass('min-w-0', 'break-words')
    expect(group.querySelector('.truncate')).toBeNull()
    const subtitleRow = screen.getByText('Till idag').parentElement as HTMLElement
    expect(subtitleRow).toHaveClass('min-h-5', 'flex-wrap')
    expect(subtitleRow).not.toHaveClass('h-5')
    const prev = screen.getByRole('button', { name: /^Föregående dag/ })
    const next = screen.getByRole('button', { name: /^Nästa dag/ })
    for (const arrow of [prev, next]) expect(arrow).toHaveClass('h-11', 'w-11', '@max-[16rem]:h-[44px]', '@max-[16rem]:w-[44px]')
  })
})

describe('stor text – FoodRow', () => {
  it('energin och makrona hamnar under namnet när raden är för smal', () => {
    const { container } = render(
      <FoodRow name="Havregrynsgröt" amountText="1 portion (250 g)" kcal={170} macros={{ protein: 6, carbs: 28, fat: 3 }} onClick={() => {}} trailing={<span>+</span>} />,
    )
    expect(container.firstElementChild).toHaveClass('@container')
    const button = screen.getByRole('button', { name: /Havregrynsgröt/ })
    expect(button).toHaveClass('@max-[17rem]:flex-wrap')
    const energy = screen.getByText('P').closest('span.flex') as HTMLElement
    expect(energy).toHaveClass('@max-[17rem]:w-full', '@max-[17rem]:flex-row', '@max-[17rem]:justify-between')
    // Namnet är fortfarande högst två rader, aldrig en rad med "…".
    expect(screen.getByText('Havregrynsgröt')).toHaveClass('line-clamp-2', 'break-words')
  })
})

describe('stor text – WaterGlasses', () => {
  it('texten får en egen rad och knapparna blir 44 px när sammanfattningen är för smal', () => {
    const { container } = render(<WaterGlasses ml={875} targetMl={2000} onAdd={() => {}} onRemove={() => {}} />)
    expect(container.firstElementChild).toHaveClass('@container')
    const summary = screen.getByText('0,88').parentElement as HTMLElement
    expect(summary).toHaveClass('min-w-0', 'flex-1', '@max-[14rem]:basis-full')
    expect(summary.parentElement).toHaveClass('flex-wrap')
    for (const name of [/^Ta bort ett glas/, /^Lägg till ett glas \(\d+ ml\)$/]) {
      const buttons = screen.getAllByRole('button', { name }).filter((b) => b.classList.contains('h-11'))
      expect(buttons.length).toBeGreaterThan(0)
      for (const b of buttons) expect(b).toHaveClass('@max-[14rem]:h-[44px]', '@max-[14rem]:w-[44px]')
    }
  })
})

describe('stor text – NutrientTable', () => {
  it('gruppens rubrik, antalet och omdömet bryts i stället för att sticka ut ur kortet', () => {
    const { container } = render(
      <NutrientTable
        nutrients={{ kcal: 387, protein: 12, fat: 9.5, carbs: 60, fiber: 4, salt: 1.2 }}
        references={{ protein: { ri: 50 } }}
        keys={['protein', 'fiber', 'salt']}
        collapsible
        defaultExpanded={['makro', 'kolhydrat', 'ovrigt']}
        showCompleteness={false}
      />,
    )
    // Rubrikknappen: rubrik (kan brytas), "3/3" och pil (aldrig ihoptryckta).
    const heading = container.querySelector('button[aria-expanded] > span')
    expect(heading).toHaveClass('min-w-0', 'break-words')
    const count = container.querySelector('button[aria-expanded] span[aria-hidden="true"]')
    expect(count).toHaveClass('shrink-0')
    // Raden med stapel, procent och omdöme får bryta, så att omdömet hamnar under procenten.
    const percentRow = Array.from(container.querySelectorAll('dd')).find((dd) => dd.textContent?.includes('av RI')) as HTMLElement
    expect(percentRow).toHaveClass('flex-wrap')
  })
})
