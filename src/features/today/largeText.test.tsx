/**
 * Stor text (200 %) på Idag: måltidskorten har inte plats för ikon, namn, energi och plusknapp bredvid
 * varandra – då döljs den dekorativa ikonen, namnet får brytas och förhandsvisningen av maten visas på
 * upp till tre rader (containerfråga, `@max-[16rem]`; rem följer rotens teckenstorlek, så vid normal
 * text ≈ 21 rem gäller den aldrig). Se ../../components/domain/largeText.test.tsx.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_SETTINGS } from '../../stores/profileStore'
import { todayISO } from '../../lib/dates'
import { MealsOverview } from './MealsOverview'

describe('stor text – måltidskorten på Idag', () => {
  it('ikonen döljs och texten bryts i stället för att klippas när kortet är smalt', () => {
    render(
      <MemoryRouter>
        <MealsOverview today={todayISO()} meals={DEFAULT_SETTINGS.meals} mindful={false} />
      </MemoryRouter>,
    )
    const first = DEFAULT_SETTINGS.meals.find((m) => m.enabled) ?? DEFAULT_SETTINGS.meals[0]
    const name = screen.getAllByText(first.name)[0]
    const card = name.closest('li') as HTMLElement
    expect(card).toHaveClass('card', '@container')
    // Namnet bryts (aldrig "…"), och energin (om den finns) hamnar under det när raden är smal.
    expect(name).toHaveClass('min-w-0', 'break-words')
    expect(name).not.toHaveClass('truncate')
    expect(name.parentElement).toHaveClass('flex-wrap')
    // Plusknappen är 44 px (px, inte rem) när kortet är smalt.
    const plus = screen.getAllByRole('link', { name: new RegExp(`^Lägg till i ${first.name.toLowerCase()}`) })[0]
    expect(plus).toHaveClass('size-11', '@max-[16rem]:size-[44px]')
    // Förhandsvisningen av maten är en rad med "…" vid normal text och tre rader vid stor text.
    const preview = card.querySelector('.truncate') as HTMLElement
    expect(preview).toHaveClass('@max-[16rem]:line-clamp-3', '@max-[16rem]:whitespace-normal')
  })
})
