/**
 * Dela recept och måltider – sidan /dela (förhandsvisning, sparande med åtkomstkontroll, inklistrad
 * länk, vald fil, fel och medvetet läge) och delningsknappen (integritetstext, länk och fil).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import ImportSharedPage from './ImportSharedPage'
import RecipeDetailPage from './RecipeDetailPage'
import { ShareButton } from './ShareButton'
import { useToastStore } from '../../components/ui/toast'
import { useFoodStore } from '../../stores/foodStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { useAccessGateStore } from '../premium/requireAccess'
import { builtinFood, loadBuiltinCatalog, type BuiltinCatalog } from '../../lib/foodRepo'
import { clearDemoFlag, setDemoFlag } from '../../lib/demoFlag'
import {
  SHARE_ERRORS,
  buildMealShare,
  buildRecipeShare,
  encodeSharePayload,
  shareFileContent,
  type SharePayload,
} from '../../lib/shareLink'
import type { Food, MealTemplate, Profile, Recipe } from '../../types'

MotionGlobalConfig.skipAnimations = true

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: Date.now() - 3 * 86_400_000,
}

const custom: Food = {
  id: 'custom:musli',
  name: 'Mammas müsli',
  source: 'custom',
  category: 'spannmal',
  nutrients: { kcal: 400, protein: 10, carbs: 60, fat: 12 },
  portions: [{ id: 'skal', label: '1 skål', grams: 60 }],
}

let catalog: BuiltinCatalog

function recipe(): Recipe {
  return {
    id: 'r_dela',
    name: 'Frukostskål',
    servings: 2,
    emoji: '🥣',
    instructions: 'Blanda allt.\nÄt direkt.',
    ingredients: [
      { id: 'i1', food: builtinFood(catalog, 'lagom:havregryn')!, amount: 2, unit: 'dl', grams: 70 },
      { id: 'i2', food: custom, amount: 1, unit: 'portion:skal', grams: 60 },
    ],
    createdAt: 1,
    updatedAt: 1,
  }
}

function meal(): MealTemplate {
  return {
    id: 'tpl_dela',
    name: 'Min frukost',
    meal: 'frukost',
    items: [{ food: custom, amount: 1, unit: 'portion:skal', grams: 60 }],
    createdAt: 1,
  }
}

async function linkParam(payload: SharePayload): Promise<string> {
  const encoded = await encodeSharePayload(payload)
  if (!encoded.ok) throw new Error('kunde inte koda')
  return encoded.param
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/dela', element: <ImportSharedPage /> },
      { path: '/recept/:id', element: <div>Receptsidan</div> },
      { path: '/lagg-till', element: <div>Lägg till mat</div> },
    ],
    { initialEntries: [path] },
  )
  const utils = render(<RouterProvider router={router} />)
  return { router, ...utils }
}

const lastToast = () => useToastStore.getState().toasts.at(-1)

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  catalog = await loadBuiltinCatalog()
})

beforeEach(() => {
  clearDemoFlag()
  useFoodStore.setState({ customFoods: {}, recipes: {}, cachedFoods: {}, favorites: [], usage: {}, templates: [] })
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: false, energyUnit: 'kcal' } })
  useLicenseStore.setState({ trialStartedAt: Date.now(), licenseKey: null, activatedAt: null })
  useAccessGateStore.setState({ blocked: null })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  clearDemoFlag()
  vi.unstubAllGlobals()
})

describe('ImportSharedPage', () => {
  it('visar förhandsvisningen från länken – utan att spara något', async () => {
    const d = await linkParam(buildRecipeShare(recipe()))
    renderAt(`/dela?d=${d}`)
    expect(await screen.findByRole('heading', { level: 2, name: 'Frukostskål' })).toBeInTheDocument()
    expect(screen.getByText('Delat recept')).toBeInTheDocument()
    expect(screen.getByText('Havregryn')).toBeInTheDocument()
    expect(screen.getByText('Mammas müsli')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Näring per portion' })).toBeInTheDocument()
    expect(screen.getByText('Energi')).toBeInTheDocument()
    expect(screen.getByText('1 livsmedel följer med och sparas bland dina egna livsmedel.')).toBeInTheDocument()
    expect(screen.getByText(/Visa instruktionerna/)).toBeInTheDocument()
    // Inget sparas automatiskt.
    expect(useFoodStore.getState().recipes).toEqual({})
    expect(useFoodStore.getState().customFoods).toEqual({})
  })

  it('sparar receptet först efter klick och öppnar det', async () => {
    const d = await linkParam(buildRecipeShare(recipe()))
    const { router } = renderAt(`/dela?d=${d}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Spara recept' }))
    const recipes = Object.values(useFoodStore.getState().recipes)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].name).toBe('Frukostskål')
    expect(Object.values(useFoodStore.getState().customFoods).map((f) => f.name)).toEqual(['Mammas müsli'])
    await waitFor(() => expect(router.state.location.pathname).toBe(`/recept/${recipes[0].id}`))
    expect(lastToast()?.message).toBe('”Frukostskål” är sparat i Mina recept')
  })

  it('sparar inget med exempeldata – exemplet är skrivskyddat', async () => {
    setDemoFlag()
    const d = await linkParam(buildRecipeShare(recipe()))
    renderAt(`/dela?d=${d}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Spara recept' }))
    expect(useAccessGateStore.getState().blocked).toEqual({ action: 'recept', demo: true })
    expect(useFoodStore.getState().recipes).toEqual({})
    expect(useFoodStore.getState().customFoods).toEqual({})
  })

  it('sparar inget när provperioden är slut', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 90 * 86_400_000 })
    const d = await linkParam(buildMealShare(meal()))
    renderAt(`/dela?d=${d}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Spara måltid' }))
    expect(useAccessGateStore.getState().blocked).toEqual({ action: 'kopiera' })
    expect(useFoodStore.getState().templates).toEqual([])
  })

  it('öppnar en inklistrad länk', async () => {
    const d = await linkParam(buildRecipeShare(recipe()))
    renderAt('/dela')
    const open = screen.getByRole('button', { name: 'Öppna länken' })
    expect(open).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: /Länk/ }), { target: { value: `Testa det här! https://lagom.example/#/dela?d=${d}` } })
    fireEvent.click(open)
    expect(await screen.findByRole('heading', { level: 2, name: 'Frukostskål' })).toBeInTheDocument()
  })

  it('öppnar en vald fil och sparar måltiden', async () => {
    const { router } = renderAt('/dela')
    const file = new File([shareFileContent(buildMealShare(meal()))], 'Min frukost.lagom.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Välj en delad fil'), { target: { files: [file] } })
    expect(await screen.findByRole('heading', { level: 2, name: 'Min frukost' })).toBeInTheDocument()
    expect(screen.getByText('Delad måltid')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Näring för måltiden' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Spara måltid' }))
    const [template] = useFoodStore.getState().templates
    expect(template).toMatchObject({ name: 'Min frukost', meal: 'frukost' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/lagg-till'))
    expect(router.state.location.search).toBe('?flik=maltider')
  })

  it('visar ett vänligt fel för en skadad länk och för en säkerhetskopia', async () => {
    renderAt('/dela?d=z.AAAAAAAAAAAA')
    expect(await screen.findByText(SHARE_ERRORS.corrupt)).toBeInTheDocument()
    const backup = new File([JSON.stringify({ format: 'lagom-backup', version: 1, data: {} })], 'kopia.json')
    fireEvent.change(screen.getByLabelText('Välj en delad fil'), { target: { files: [backup] } })
    expect(await screen.findByText(SHARE_ERRORS.backup)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Spara/ })).not.toBeInTheDocument()
  })

  it('säger vilka livsmedel som saknas och låter inte spara', async () => {
    const payload: SharePayload = {
      v: 1,
      kind: 'meal',
      name: 'Framtidsfika',
      foods: [{ ref: 'lagom:framtidens-bulle', name: 'Framtidens bulle' }],
      items: [{ food: 0, amount: 1, unit: 'g', grams: 80 }],
    }
    renderAt(`/dela?d=${await linkParam(payload)}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('Framtidens bulle')
    expect(screen.getByRole('button', { name: 'Spara måltid' })).toBeDisabled()
  })

  it('går tillbaka till fältet med "Öppna något annat"', async () => {
    const { router } = renderAt(`/dela?d=${await linkParam(buildRecipeShare(recipe()))}`)
    const heading = await screen.findByRole('heading', { level: 2, name: 'Frukostskål' })
    await waitFor(() => expect(heading).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Öppna något annat' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Länk/ })).toHaveFocus())
    expect(router.state.location.search).toBe('')
    expect(useFoodStore.getState().recipes).toEqual({})
  })

  it('döljer siffrorna i medvetet läge tills man ber om dem', async () => {
    useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: true } }))
    renderAt(`/dela?d=${await linkParam(buildRecipeShare(recipe()))}`)
    expect(await screen.findByText('Medvetet läge är på – siffrorna är dolda.')).toBeInTheDocument()
    expect(screen.queryByText('Energi')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Visa näringsvärden' }))
    expect(screen.getByText('Energi')).toBeInTheDocument()
  })
})

describe('ShareButton', () => {
  it('finns på egna recept men inte på klassikerna', async () => {
    useFoodStore.setState({ recipes: { r_dela: recipe() } })
    const router = createMemoryRouter([{ path: '/recept/:id', element: <RecipeDetailPage /> }], { initialEntries: ['/recept/r_dela'] })
    render(<RouterProvider router={router} />)
    expect(await screen.findByRole('button', { name: 'Dela receptet Frukostskål' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/recept/klassiker-pannkakor')
    })
    expect(await screen.findByRole('heading', { level: 1, name: /Pannkakor/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Dela receptet/ })).not.toBeInTheDocument()
  })

  function renderButton(target: Parameters<typeof ShareButton>[0]['target']) {
    const router = createMemoryRouter([{ path: '/', element: <ShareButton target={target} /> }])
    return render(<RouterProvider router={router} />)
  }

  it('berättar vad som delas och kopierar länken', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    renderButton({ kind: 'recipe', recipe: recipe() })
    fireEvent.click(screen.getByRole('button', { name: 'Dela receptet Frukostskål' }))
    expect(await screen.findByText('Alla som har länken kan se receptet.')).toBeInTheDocument()
    expect(screen.getByText(/Ingenting från din dagbok/)).toBeInTheDocument()
    const copy = screen.getByRole('button', { name: 'Kopiera länk' })
    await waitFor(() => expect(copy).toBeEnabled())
    // Utan delningsdialog finns bara "Kopiera länk".
    expect(screen.queryByRole('button', { name: 'Dela länk' })).not.toBeInTheDocument()
    await act(async () => {
      fireEvent.click(copy)
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    const url = writeText.mock.calls[0][0] as string
    expect(url).toMatch(/#\/dela\?d=z\.[A-Za-z0-9_-]+$/)
    await waitFor(() => expect(lastToast()?.message).toBe('Länken är kopierad – klistra in den där du vill dela den.'))
  })

  it('föreslår fil när receptet är för stort för en länk', async () => {
    const nutrients = { kcal: 123.456, protein: 1.234, carbs: 2.345, fat: 3.456, fiber: 4.567, salt: 0.123, sugars: 5.678, satFat: 1.111, vitC: 12.345, iron: 1.234 }
    const big: Recipe = {
      ...recipe(),
      ingredients: Array.from({ length: 100 }, (_, i) => ({
        id: `i${i}`,
        food: { ...custom, id: `custom:${i}`, name: `Ingrediens med ett ganska långt namn nummer ${i}`, nutrients },
        amount: 10 + i,
        unit: 'g' as const,
        grams: 10 + i,
      })),
      instructions: 'Rör om försiktigt. '.repeat(500),
    }
    renderButton({ kind: 'recipe', recipe: big })
    fireEvent.click(screen.getByRole('button', { name: 'Dela receptet Frukostskål' }))
    expect(await screen.findByText('Receptet är för stort för en länk – dela det som fil i stället.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kopiera länk' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Dela som fil' })).toBeEnabled()
  })

  it('delar inget recept utan ingredienser', async () => {
    renderButton({ kind: 'recipe', recipe: { ...recipe(), ingredients: [] } })
    fireEvent.click(screen.getByRole('button', { name: 'Dela receptet Frukostskål' }))
    expect(await screen.findByText('Receptet har inga ingredienser att dela ännu.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kopiera länk' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Dela som fil' })).toBeDisabled()
  })

  it('sparar en fil med bara måltiden', async () => {
    // jsdom saknar blob-adresser och kan inte "ladda ned" – fånga filen i stället.
    let saved: Blob | undefined
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = vi.fn((b: Blob) => {
      saved = b
      return 'blob:lagom'
    })
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      renderButton({ kind: 'meal', template: meal() })
      fireEvent.click(screen.getByRole('button', { name: 'Dela måltiden Min frukost' }))
      expect(await screen.findByText('Alla som har länken kan se måltiden.')).toBeInTheDocument()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Dela som fil' }))
      })
      await waitFor(() => expect(saved).toBeDefined())
      expect(click).toHaveBeenCalled()
    } finally {
      URL.createObjectURL = original.create
      URL.revokeObjectURL = original.revoke
      click.mockRestore()
    }
    const json = JSON.parse(await saved!.text()) as SharePayload
    expect(json).toMatchObject({ v: 1, kind: 'meal', name: 'Min frukost' })
    expect(JSON.stringify(json)).not.toContain('custom:musli')
    await waitFor(() => expect(lastToast()?.message).toBe('Filen är sparad – skicka den till den du vill dela med.'))
  })
})
