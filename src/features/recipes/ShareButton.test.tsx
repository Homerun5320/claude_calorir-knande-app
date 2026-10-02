/**
 * Delningsarket för recept: säger att länken till källan följer med (bara sidans adress, utan
 * parametrar) – och delar den också så.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { ShareButton } from './ShareButton'
import { useToastStore } from '../../components/ui/toast'
import { decodeShareParam } from '../../lib/shareLink'
import type { Food, Recipe } from '../../types'

MotionGlobalConfig.skipAnimations = true

const musli: Food = {
  id: 'custom:musli',
  name: 'Mammas müsli',
  source: 'custom',
  category: 'spannmal',
  nutrients: { kcal: 400, protein: 10, carbs: 60, fat: 12 },
  portions: [{ id: 'skal', label: '1 skål', grams: 60 }],
}

function recipe(sourceUrl?: string): Recipe {
  return {
    id: 'r_kalla',
    name: 'Frukostskål',
    servings: 2,
    instructions: 'Blanda allt.',
    ...(sourceUrl ? { sourceUrl } : {}),
    ingredients: [{ id: 'i1', food: musli, amount: 1, unit: 'portion:skal', grams: 60 }],
    createdAt: 1,
    updatedAt: 1,
  }
}

function renderButton(target: Recipe) {
  const router = createMemoryRouter([{ path: '/', element: <ShareButton target={{ kind: 'recipe', recipe: target }} /> }])
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ShareButton – länken till källan', () => {
  it('berättar att källänken följer med, och delar bara sidans adress', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    renderButton(recipe('https://www.exempel.se/recept/x?igshid=ABC&subscriber=123#steg'))
    fireEvent.click(screen.getByRole('button', { name: 'Dela receptet Frukostskål' }))
    expect(await screen.findByText(/Länken till källan \(exempel\.se\) följer också med – bara sidans adress, utan parametrar\./)).toBeInTheDocument()
    // Resten av texten är kvar i samma stycke.
    expect(screen.getByText(/Ingenting från din dagbok/)).toBeInTheDocument()

    const copy = screen.getByRole('button', { name: 'Kopiera länk' })
    await waitFor(() => expect(copy).toBeEnabled())
    await act(async () => {
      fireEvent.click(copy)
    })
    const url = writeText.mock.calls[0][0] as string
    const read = await decodeShareParam(url.slice(url.indexOf('d=') + 2))
    if (!read.ok || read.payload.kind !== 'recipe') throw new Error('kunde inte läsa länken')
    expect(read.payload.sourceUrl).toBe('https://www.exempel.se/recept/x')
    expect(url).not.toMatch(/igshid|subscriber/)
  })

  it('nämner ingen källänk när receptet saknar en – eller när den inte går att dela', async () => {
    const view = renderButton(recipe())
    fireEvent.click(screen.getByRole('button', { name: 'Dela receptet Frukostskål' }))
    expect(await screen.findByText('Alla som har länken kan se receptet.')).toBeInTheDocument()
    expect(screen.queryByText(/Länken till källan/)).not.toBeInTheDocument()
    view.unmount()

    // En http-adress delas aldrig (bara https) – då ska arket inte låtsas att den följer med.
    renderButton(recipe('http://osaker.example/recept'))
    fireEvent.click(screen.getByRole('button', { name: 'Dela receptet Frukostskål' }))
    expect(await screen.findByText('Alla som har länken kan se receptet.')).toBeInTheDocument()
    expect(screen.queryByText(/Länken till källan/)).not.toBeInTheDocument()
  })
})
