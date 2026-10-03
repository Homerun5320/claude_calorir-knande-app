/**
 * NameValueRow (namn + värde ovanför en andelsstapel): vid stor text (200 %) får värdet hamna under
 * namnet och namnet två rader – annars trycks namnet ihop till några tecken eller värdet sticker ut ur
 * kortet. Vid normal text är namnet en rad med "…" precis som förut (containerfrågan gäller bara när
 * raden är smalare än 12 rem, ≈ 17 rem vid normal text).
 */
import { render, screen } from '@testing-library/react'
import { NameValueRow } from './ui'

describe('NameValueRow', () => {
  it('namn och värde kan brytas isär, och namnet klipps bara vid normal text', () => {
    const { container } = render(<NameValueRow name="Kycklinggryta med ris och grönsaker" value="2,8 kg · 99 %" />)
    const row = container.firstElementChild as HTMLElement
    expect(row).toHaveClass('@container', 'flex', 'flex-wrap', 'justify-between')
    const name = screen.getByText('Kycklinggryta med ris och grönsaker')
    // Normal text: en rad med "…". Stor text: två rader som får brytas.
    expect(name).toHaveClass('truncate', 'min-w-24', 'flex-1', 'basis-0', '@max-[12rem]:line-clamp-2', '@max-[12rem]:whitespace-normal')
    // Värdet får inte vara "shrink-0": ett värde bredare än raden måste kunna brytas.
    const value = screen.getByText('2,8 kg · 99 %')
    expect(value).not.toHaveClass('shrink-0')
    expect(value).toHaveClass('ml-auto', 'max-w-full')
  })

  it('texten bevarar ett mellanslag mellan namn och värde (skärmläsare och kopiering)', () => {
    const { container } = render(<NameValueRow name="Broccoli" value="0,03 kg" />)
    expect(container).toHaveTextContent(/Broccoli\s0,03 kg/)
  })

  it('utan värde (medvetet läge) visas bara namnet', () => {
    const { container } = render(<NameValueRow name="Protein" value={false} />)
    expect(container.querySelectorAll('span')).toHaveLength(1)
    expect(container).toHaveTextContent('Protein')
  })
})
