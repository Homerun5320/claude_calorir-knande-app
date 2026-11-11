/**
 * Inställningar → Livsmedelsdatabas: importen från Livsmedelsverket. Felet ska alltid vara en vänlig
 * svensk mening – aldrig utvecklartext (CORS, skript, kommandon) eller ordet "webbläsare", i något bygge.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LivsmedelsverketError } from '../../../lib/livsmedelsverket'
import { DatabaseSection } from './DatabaseSection'
import { LMV_UNREACHABLE_TEXT, lmvImportErrorText } from '../useLmvImport'

const mocks = vi.hoisted(() => ({ fail: null as unknown }))

vi.mock('../../../lib/livsmedelsverket', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/livsmedelsverket')>()),
  // En ström som misslyckas direkt, som när ingen kontakt går att få med Livsmedelsverket.
  importAll: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(mocks.fail) }) }),
}))

beforeEach(() => {
  mocks.fail = null
})

function renderSection() {
  return render(
    <MemoryRouter>
      <DatabaseSection />
    </MemoryRouter>,
  )
}

describe('felmeddelandet vid import', () => {
  it('ingen kontakt alls: en vänlig mening utan CORS, skript eller webbläsare', async () => {
    mocks.fail = new LivsmedelsverketError('network')
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: /Hämta från Livsmedelsverket/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(LMV_UNREACHABLE_TEXT)
    expect(LMV_UNREACHABLE_TEXT).toBe('Kunde inte nå Livsmedelsverket just nu. Försök igen om en stund.')
    expect(alert.textContent ?? '').not.toMatch(/CORS|webbläs|skript|npm|\.mjs|Lagom kan i stället/i)
    expect(alert.querySelector('code')).toBeNull()
    // Man kan försöka igen.
    expect(screen.getByRole('button', { name: 'Hämta igen' })).toBeInTheDocument()
  })

  it('andra fel från Livsmedelsverket behåller sitt egna svenska meddelande', async () => {
    mocks.fail = new LivsmedelsverketError('server', 503)
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: /Hämta från Livsmedelsverket/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Livsmedelsverkets databas har tillfälliga problem. Försök igen senare.')
  })

  it('ett oväntat fel visar ingen teknisk text', () => {
    expect(lmvImportErrorText(new TypeError('x is not a function'))).toBe('Importen avbröts av ett oväntat fel. Försök igen om en stund.')
    expect(lmvImportErrorText(new LivsmedelsverketError('offline'))).toMatch(/Ingen internetanslutning/)
  })
})
