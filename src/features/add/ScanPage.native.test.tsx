/**
 * ScanPage i de inbyggda apparna: telefonens egen streckkodsläsare (src/native/barcode.ts) i
 * stället för webbens kamera. Native-modulen mockas.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  scanFoodBarcode: vi.fn(),
  haptic: vi.fn(),
  openCamera: vi.fn(),
  barcodeModule: true,
}))

vi.mock('../../native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../native')>()),
  isNative: () => true,
  haptic: mocks.haptic,
  loadNative: async (name: string) => (name === 'barcode' && mocks.barcodeModule ? { scanFoodBarcode: mocks.scanFoodBarcode } : null),
}))
vi.mock('./scanner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scanner')>()),
  openCamera: mocks.openCamera,
}))

import ScanPage from './ScanPage'
import { DialogHost } from '../../components/ui/Dialog'
import { useToastStore } from '../../components/ui/toast'
import { useFoodStore } from '../../stores/foodStore'
import { useBasketStore } from './basketStore'
import { loadBuiltinCatalog } from '../../lib/foodRepo'
import { offBar } from './testFoods'

function renderScan() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <div>Hem</div> },
      { path: '/skanna', element: <ScanPage /> },
    ],
    { initialEntries: ['/skanna?maltid=frukost&datum=2026-09-26'] },
  )
  return render(
    <>
      <RouterProvider router={router} />
      <DialogHost />
    </>,
  )
}

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await loadBuiltinCatalog()
})

beforeEach(() => {
  mocks.barcodeModule = true
  mocks.openCamera.mockRejectedValue(Object.assign(new Error('ingen kamera'), { name: 'NotFoundError' }))
  useFoodStore.setState({ usage: {}, cachedFoods: { [offBar.id]: offBar }, customFoods: {}, favorites: [], templates: [], recipes: {} })
  useBasketStore.setState({ items: [] })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  mocks.scanFoodBarcode.mockReset()
  mocks.haptic.mockReset()
  mocks.openCamera.mockReset()
})

describe('ScanPage i apparna', () => {
  it('öppnar läsaren direkt, letar upp koden och öppnar läsaren igen efter "Lägg i korgen"', async () => {
    mocks.scanFoodBarcode.mockResolvedValueOnce({ status: 'scanned', code: '7310865000637', format: 'ean_13' }).mockResolvedValue({ status: 'cancelled' })
    renderScan()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Proteinbar')).toBeInTheDocument()
    expect(mocks.scanFoodBarcode).toHaveBeenCalledTimes(1)
    expect(mocks.scanFoodBarcode).toHaveBeenCalledWith({ haptic: false })
    expect(mocks.haptic).toHaveBeenCalledWith('tap')
    // Webbens kamera startas aldrig.
    expect(mocks.openCamera).not.toHaveBeenCalled()
    expect(document.querySelector('video')).toBeNull()

    // Portionsväljaren rapporterar mängden i en effekt efter första renderingen. findByRole kan
    // hitta arket innan den effekten har körts (på en belastad CI-maskin), och då gör ett tryck
    // ingenting – låt effekterna köras klart innan knappen trycks.
    await act(async () => {})
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lägg i korgen' }))
    })
    await waitFor(() => expect(useBasketStore.getState().items).toHaveLength(1))
    await waitFor(() => expect(mocks.scanFoodBarcode).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Skanna streckkod' })).toBeInTheDocument()
  })

  it('avbruten skanning visar knappen – den öppnar läsaren igen', async () => {
    mocks.scanFoodBarcode.mockResolvedValue({ status: 'cancelled' })
    renderScan()
    fireEvent.click(await screen.findByRole('button', { name: 'Skanna streckkod' }))
    await waitFor(() => expect(mocks.scanFoodBarcode).toHaveBeenCalledTimes(2))
    expect(mocks.haptic).not.toHaveBeenCalled()
  })

  it('nekad kamera visar telefonens Inställningar och fältet för koden', async () => {
    mocks.scanFoodBarcode.mockResolvedValue({ status: 'denied', reason: 'denied', title: 'Kameran är inte tillåten', text: 'x' })
    renderScan()
    expect(await screen.findByText('Kameran är inte tillåten')).toBeInTheDocument()
    expect(screen.getByLabelText(/Streckkod \(EAN\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Försök starta kameran igen' }))
    await waitFor(() => expect(mocks.scanFoodBarcode).toHaveBeenCalledTimes(2))
    expect(mocks.openCamera).not.toHaveBeenCalled()
  })

  it('fel sorts kod ger en notis', async () => {
    mocks.scanFoodBarcode.mockResolvedValue({ status: 'invalid', title: 'Ingen streckkod för livsmedel', text: 'Koden går inte att söka på.' })
    renderScan()
    await screen.findByRole('button', { name: 'Skanna streckkod' })
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Koden går inte att söka på.')
  })

  it('saknas tillägget tar webbens kamera över', async () => {
    mocks.barcodeModule = false
    renderScan()
    await waitFor(() => expect(mocks.openCamera).toHaveBeenCalled())
    expect(mocks.scanFoodBarcode).not.toHaveBeenCalled()
  })
})
