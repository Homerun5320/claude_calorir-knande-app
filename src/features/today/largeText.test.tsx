/**
 * Stor text (200 %) på Idag: måltiderna är fyrkanter, två per rad (`@min-[19.5rem]`, en containerfråga i rem). Vid stor
 * text (rotstorlek 24 px eller mer) blir det en kolumn utan fast form, så att inget klipps: namnet bryts,
 * förhandsvisningen av maten har två rader med "…" och plusknappen är alltid 44 px (px, inte rem).
 * Se ../../components/domain/largeText.test.tsx.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_SETTINGS } from '../../stores/profileStore'
import { todayISO } from '../../lib/dates'
import { MealsOverview } from './MealsOverview'

describe('stor text – måltidskorten på Idag', () => {
  it('fyrkanten blir en kolumn och texten bryts i stället för att klippas vid stor text', () => {
    render(
      <MemoryRouter>
        <MealsOverview today={todayISO()} meals={DEFAULT_SETTINGS.meals} mindful={false} />
      </MemoryRouter>,
    )
    const first = DEFAULT_SETTINGS.meals.find((m) => m.enabled) ?? DEFAULT_SETTINGS.meals[0]
    const name = screen.getAllByText(first.name)[0]
    const card = name.closest('li') as HTMLElement
    // Fyrkant bara när det finns plats för två per rad; annars en kolumn med fri höjd.
    expect(card).toHaveClass('card', '@min-[19.5rem]:aspect-square')
    expect(card).not.toHaveClass('aspect-square')
    // Namnet bryts (aldrig "…").
    expect(name).toHaveClass('min-w-0', 'break-words')
    expect(name).not.toHaveClass('truncate')
    // Plusknappen är 44 px (px, inte rem) – även när texten är stor.
    const plus = screen.getAllByRole('link', { name: new RegExp(`^Lägg till i ${first.name.toLowerCase()}`) })[0]
    expect(plus).toHaveClass('size-[44px]')
    // Förhandsvisningen av maten har högst två rader (line-clamp) och klipps inte med en enda rad.
    const preview = card.querySelector('.line-clamp-2') as HTMLElement
    expect(preview).not.toBeNull()
    expect(preview).not.toHaveClass('truncate')
  })
})
