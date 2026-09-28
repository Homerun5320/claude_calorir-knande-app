import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const platform = vi.hoisted(() => ({ webkit: true, standalone: false, inApp: false }))

vi.mock('../../config/platform', () => ({
  isAppleWebKit: () => platform.webkit,
  isStandalone: () => platform.standalone,
  isInApp: () => platform.inApp,
}))

const { default: InstallHintCard, INSTALL_HINT_DISMISSED_KEY } = await import('./InstallHintCard')

function renderCard() {
  return render(
    <MemoryRouter>
      <InstallHintCard />
    </MemoryRouter>,
  )
}

describe('InstallHintCard', () => {
  beforeEach(() => {
    Object.assign(platform, { webkit: true, standalone: false, inApp: false })
    localStorage.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('visar tipset och stegen i Safari på iPhone', () => {
    renderCard()
    expect(screen.getByRole('heading', { name: 'Lägg Lagom på hemskärmen' })).toBeInTheDocument()
    expect(screen.getByText(/Safari kan rensa data för webbplatser du inte besökt på en vecka/)).toBeInTheDocument()
    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toHaveTextContent('Spara en säkerhetskopia (Inställningar → Data).')
    expect(steps[1]).toHaveTextContent('Tryck på Dela → Lägg till på hemskärmen.')
    expect(steps[2]).toHaveTextContent('Öppna Lagom från hemskärmen och läs in kopian – hemskärmsappen har egen lagring.')
    expect(screen.getByRole('link', { name: 'Inställningar → Data' })).toHaveAttribute('href', '/installningar/data')
  })

  it.each([
    ['i andra webbläsare', { webkit: false }],
    ['som hemskärmsapp', { standalone: true }],
    ['i butiksapparna', { inApp: true }],
  ])('visas inte %s', (_label, flags) => {
    Object.assign(platform, flags)
    const { container } = renderCard()
    expect(container).toBeEmptyDOMElement()
  })

  it('stängs med en 44 px stor knapp och förblir stängt', async () => {
    const user = userEvent.setup()
    const { unmount } = renderCard()
    const close = screen.getByRole('button', { name: 'Stäng tipset' })
    expect(close.className).toContain('size-11')
    await user.click(close)
    expect(screen.queryByRole('heading', { name: 'Lägg Lagom på hemskärmen' })).not.toBeInTheDocument()
    expect(localStorage.getItem(INSTALL_HINT_DISMISSED_KEY)).not.toBeNull()
    unmount()
    const { container } = renderCard()
    expect(container).toBeEmptyDOMElement()
  })

  it('fungerar även när localStorage är blockerad', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blockerad', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blockerad', 'SecurityError')
    })
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: 'Stäng tipset' }))
    expect(screen.queryByRole('heading', { name: 'Lägg Lagom på hemskärmen' })).not.toBeInTheDocument()
  })
})
