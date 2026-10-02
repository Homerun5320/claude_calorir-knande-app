/**
 * Utgångarna ur exempeldata ("Börja med din egen profil", "Skapa min egen profil") rensar bara
 * exemplet: en kopia på telefonen och framstegsbilder från en tidigare egen dagbok får ligga kvar
 * (`keepOwnCopies`). Bara "Radera all data" tar allt.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DialogHost } from '../../components/ui/Dialog'
import { clearDemoFlag, setDemoFlag } from '../../lib/demoFlag'
import { StartOwnProfileButton } from '../premium/AccessGate'
import { DemoBanner } from './DemoBanner'

MotionGlobalConfig.skipAnimations = true

const wipeAndReset = vi.hoisted(() => vi.fn<(opts?: { removeLicense?: boolean; keepOwnCopies?: boolean }) => Promise<void>>(async () => {}))
vi.mock('../settings/wipe', () => ({ wipeAndReset }))

function renderWithDialogs(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      {ui}
      <DialogHost />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  wipeAndReset.mockClear()
  setDemoFlag()
})

afterEach(() => {
  cleanup()
  clearDemoFlag()
})

describe('utgångar ur exempeldata', () => {
  it('banderollen rensar exemplet men behåller användarens egen kopia och bilder', async () => {
    renderWithDialogs(<DemoBanner />)
    fireEvent.click(screen.getByRole('button', { name: /egen profil/i }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Börja' }))
    await waitFor(() => expect(wipeAndReset).toHaveBeenCalledTimes(1))
    expect(wipeAndReset).toHaveBeenCalledWith({ keepOwnCopies: true })
  })

  it('"Skapa min egen profil" i spärrarket gör likadant', async () => {
    renderWithDialogs(<StartOwnProfileButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Skapa min egen profil' }))
    await waitFor(() => expect(wipeAndReset).toHaveBeenCalledTimes(1))
    expect(wipeAndReset).toHaveBeenCalledWith({ keepOwnCopies: true })
  })
})
