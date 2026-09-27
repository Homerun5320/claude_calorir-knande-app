/**
 * Inställningar → Data: visar om ändringarna sparas på enheten, och uppmanar till en
 * säkerhetskopia när webbläsaren inte låter Lagom spara (bara i minnet).
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { StorageStatus } from './sections/DataSection'

const status = vi.hoisted(() => ({ memoryOnly: false }))
vi.mock('../../hooks/useStorageStatus', () => ({ useMemoryOnlyStorage: () => status.memoryOnly }))

function renderStatus(lastBackup: number | null = null) {
  return render(
    <MemoryRouter>
      <StorageStatus lastBackup={lastBackup} />
    </MemoryRouter>,
  )
}

describe('StorageStatus', () => {
  it('säger att allt sparas på enheten och påminner om säkerhetskopia', () => {
    status.memoryOnly = false
    renderStatus()
    expect(screen.getByRole('status')).toHaveTextContent('Sparas på enheten')
    expect(screen.getByText(/Exportera gärna en säkerhetskopia/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Spara säkerhetskopia/ })).not.toBeInTheDocument()
  })

  it('förklarar tydligt när ändringarna bara finns i minnet och erbjuder en säkerhetskopia', () => {
    status.memoryOnly = true
    renderStatus(Date.now())
    const box = screen.getByRole('status')
    expect(box).toHaveTextContent('Sparas inte på enheten just nu')
    expect(box).toHaveTextContent(/privat läge/)
    expect(box).toHaveTextContent(/tills du stänger fliken/)
    expect(screen.getByRole('button', { name: 'Spara säkerhetskopia nu' })).toBeInTheDocument()
  })
})
