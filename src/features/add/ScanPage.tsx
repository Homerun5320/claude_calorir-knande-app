/**
 * Skanna streckkod – /skanna?maltid=frukost&datum=2026-09-26
 *
 * Kameran i helskärm med sökram och en svepande laserlinje. Streckkoden kontrolleras (EAN-
 * kontrollsiffra), letas först upp lokalt (sparade produkter, egna livsmedel, inbyggd databas –
 * fungerar offline) och sedan i Open Food Facts. Hittas produkten väljer man mängd och lägger
 * till direkt – eller i korgen för att skanna nästa vara. Utan kamera går det lika bra att skriva
 * in siffrorna.
 *
 * Kameran släpps alltid när sidan lämnas eller appen hamnar i bakgrunden.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Camera, Flashlight, FlashlightOff, Keyboard, PackageSearch, Plus, RefreshCw, ShoppingBasket, WifiOff, X } from 'lucide-react'
import type { Food } from '../../types'
import { Button, IconButton, Sheet, Spinner, TextField, cx, toast } from '../../components/ui'
import { CategoryIcon, MealIcon } from '../../components/domain'
import { useProfileStore } from '../../stores/profileStore'
import { useFoodStore } from '../../stores/foodStore'
import { useToday } from '../../hooks/useToday'
import { findFoodByBarcode, rememberFoods } from '../../lib/foodRepo'
import { OFF_MESSAGES, OpenFoodFactsError, fetchProductByBarcode, isAbortError, isValidEan, normalizeBarcode } from '../../lib/openFoodFacts'
import { mealName } from '../../lib/meals'
import { relativeDayLabel } from '../../lib/dates'
import { addPageHref, countLabel, findByBarcode, foodDetailHref, newFoodHref, nutriScoreInfo, parseAddParams } from './addLogic'
import { useAddFood } from './useAddFood'
import { useBasketStore } from './basketStore'
import { NutriScoreBadge, useLeave } from './components'
import { PortionSheet } from './PortionSheet'
import {
  CAMERA_ERROR_TEXT,
  cleanManualCode,
  classifyCameraError,
  createScanGate,
  openCamera,
  setTorch,
  startBarcodeScanner,
  stopStream,
  torchSupported,
  vibrate,
  type BarcodeScanner,
  type CameraErrorKind,
} from './scanner'

type CamState = { kind: 'starting' } | { kind: 'scanning'; engine: 'native' | 'zxing' } | { kind: 'error'; reason: CameraErrorKind }

type Lookup =
  | { kind: 'idle' }
  | { kind: 'loading'; code: string }
  | { kind: 'found'; code: string; food: Food }
  | { kind: 'notfound'; code: string }
  | { kind: 'offline'; code: string }
  | { kind: 'error'; code: string; message: string }

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export default function ScanPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const leave = useLeave()
  const reduce = useReducedMotion()
  const today = useToday()
  const online = useOnline()
  const meals = useProfileStore((s) => s.settings.meals)
  const { date, meal } = useMemo(() => parseAddParams(params, meals, today), [params, meals, today])
  const fromAdd = (location.state as { from?: string } | null)?.from === 'lagg-till'
  const mealLabel = mealName(meals, meal)
  const exitTo = fromAdd ? addPageHref({ meal, date }) : date === today ? '/' : `/dagbok/${date}`

  const { addFood } = useAddFood()
  const basketCount = useBasketStore((s) => s.items.length)
  const basketAdd = useBasketStore((s) => s.add)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [gate] = useState(() => createScanGate())
  const [cam, setCam] = useState<CamState>({ kind: 'starting' })
  const [torch, setTorchState] = useState({ available: false, on: false })
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  const [attempt, setAttempt] = useState(0)
  const [lookup, setLookup] = useState<Lookup>({ kind: 'idle' })
  const [flash, setFlash] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const manualInput = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // --- Uppslag ---------------------------------------------------------------
  const runLookup = useCallback(async (raw: string) => {
    const code = normalizeBarcode(raw)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    gate.lock()
    setLookup({ kind: 'loading', code })
    try {
      // Egna livsmedel först (ofta en rättad kopia av en Open Food Facts-produkt), sedan allt annat lokalt.
      const own = findByBarcode(Object.values(useFoodStore.getState().customFoods), code)
      const local = own ?? (await findFoodByBarcode(code))
      if (ctrl.signal.aborted) return
      if (local) {
        setLookup({ kind: 'found', code, food: local })
        return
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setLookup({ kind: 'offline', code })
        return
      }
      const food = await fetchProductByBarcode(code, ctrl.signal)
      if (ctrl.signal.aborted) return
      if (food) {
        rememberFoods([food])
        setLookup({ kind: 'found', code, food })
      } else {
        setLookup({ kind: 'notfound', code })
      }
    } catch (err) {
      if (isAbortError(err) || ctrl.signal.aborted) return
      if (err instanceof OpenFoodFactsError && err.code === 'offline') setLookup({ kind: 'offline', code })
      else setLookup({ kind: 'error', code, message: err instanceof Error ? err.message : OFF_MESSAGES.network })
    }
  }, [gate])

  const onCode = useCallback(
    (raw: string) => {
      const code = normalizeBarcode(raw)
      // Felaktiga avläsningar (fel kontrollsiffra) ignoreras tyst – nästa bildruta brukar bli rätt.
      if (!isValidEan(code) || !gate.accept(code)) return
      vibrate(45)
      setFlash(true)
      window.setTimeout(() => setFlash(false), 650)
      void runLookup(code)
    },
    [gate, runLookup],
  )
  const onCodeRef = useRef(onCode)
  useEffect(() => {
    onCodeRef.current = onCode
  })

  const closeLookup = () => {
    abortRef.current?.abort()
    setLookup({ kind: 'idle' })
    gate.unlock()
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  // --- Synlighet: släpp kameran när appen hamnar i bakgrunden --------------------
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // --- Kamera -------------------------------------------------------------
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let stream: MediaStream | null = null
    let scanner: BarcodeScanner | null = null
    setCam({ kind: 'starting' })

    ;(async () => {
      try {
        stream = await openCamera()
        if (cancelled) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) throw new Error('Ingen video')
        video.srcObject = stream
        await video.play().catch(() => undefined)
        setTorchState({ available: torchSupported(stream), on: false })
        const s = await startBarcodeScanner(video, stream, (code) => onCodeRef.current(code))
        if (cancelled) {
          s.stop()
          stopStream(stream)
          return
        }
        scanner = s
        setCam({ kind: 'scanning', engine: s.engine })
      } catch (err) {
        stopStream(stream)
        if (!cancelled) setCam({ kind: 'error', reason: classifyCameraError(err) })
      }
    })()

    return () => {
      cancelled = true
      scanner?.stop()
      stopStream(stream)
      streamRef.current = null
      const video = videoRef.current
      if (video) {
        video.pause()
        video.srcObject = null
      }
      setTorchState({ available: false, on: false })
    }
  }, [visible, attempt])

  const toggleTorch = async () => {
    const next = !torch.on
    if (await setTorch(streamRef.current, next)) setTorchState((t) => ({ ...t, on: next }))
    else toast('Ficklampan gick inte att tända på den här enheten.')
  }

  // --- Åtgärder -------------------------------------------------------------
  const goToBasket = () => {
    if (fromAdd) navigate(-1)
    else navigate(addPageHref({ meal, date }), { replace: true })
  }

  const submitManual = (code: string) => {
    setManualOpen(false)
    gate.reset()
    void runLookup(code)
  }

  const found = lookup.kind === 'found' ? lookup.food : null
  const cameraOk = cam.kind !== 'error'
  const busy = lookup.kind === 'loading'

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg text-ink">
      {/* Kamerabild */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden
        className={cx('absolute inset-0 size-full object-cover transition-opacity duration-500', cam.kind === 'scanning' ? 'opacity-100' : 'opacity-0')}
      />

      {/* Sökram */}
      {cameraOk && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className={cx(
              'relative aspect-[1.55] w-[min(80vw,24rem)] rounded-[1.75rem] shadow-[0_0_0_100vmax_color-mix(in_oklab,var(--lg-bg)_55%,transparent)] transition-[box-shadow,outline-color] duration-300',
              flash ? 'outline outline-4 outline-gran' : 'outline outline-0 outline-transparent',
            )}
          >
            <FrameCorners />
            {cam.kind === 'scanning' && !busy && lookup.kind === 'idle' && (
              reduce ? (
                <span className="absolute inset-x-6 top-1/2 h-0.5 rounded-full bg-gran/80 shadow-[0_0_14px_3px_var(--lg-gran)]" />
              ) : (
                <motion.span
                  className="absolute inset-x-6 h-0.5 rounded-full bg-gran shadow-[0_0_16px_3px_var(--lg-gran)]"
                  initial={{ top: '12%' }}
                  animate={{ top: ['12%', '88%'] }}
                  transition={{ duration: 1.8, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                />
              )
            )}
            {cam.kind === 'starting' && (
              <div className="absolute inset-0 grid place-items-center">
                <span className="flex items-center gap-2 text-sm text-ink-2">
                  <Spinner className="size-4" /> Startar kameran …
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Övre list */}
      <header className="pt-safe relative z-10 px-3">
        <div className="flex h-14 items-center gap-2">
          <IconButton icon={X} aria-label="Stäng" onClick={() => leave(exitTo)} variant="ghost" className="bg-surface/70! text-ink! backdrop-blur-md" />
          <div className="min-w-0 flex-1 text-center">
            <h1 className="font-display text-lg font-semibold tracking-tight">Skanna streckkod</h1>
          </div>
          {torch.available ? (
            <IconButton
              icon={torch.on ? FlashlightOff : Flashlight}
              aria-label={torch.on ? 'Släck ficklampan' : 'Tänd ficklampan'}
              pressed={torch.on}
              onClick={toggleTorch}
              variant="ghost"
              className={cx('backdrop-blur-md', torch.on ? 'bg-sol! text-bg!' : 'bg-surface/70! text-ink!')}
            />
          ) : (
            <span className="size-11" aria-hidden />
          )}
        </div>
        {!online && (
          <p className="mx-auto mt-1 flex max-w-sm items-center justify-center gap-2 rounded-full bg-surface/80 px-3 py-1.5 text-xs text-ink-2 backdrop-blur-md">
            <WifiOff className="size-3.5" aria-hidden /> Offline – bara produkter som redan finns i Lagom hittas.
          </p>
        )}
      </header>

      {/* Mitten: tips eller reservläge utan kamera */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
        {cam.kind === 'error' ? (
          <CameraFallback reason={cam.reason} onRetry={() => setAttempt((a) => a + 1)} onSubmit={submitManual} inputRef={manualInput} busy={busy} />
        ) : (
          <p className="mt-[calc(min(80vw,24rem)/1.55_+_3rem)] rounded-full bg-surface/60 px-4 py-2 text-sm text-ink backdrop-blur-md" aria-live="polite">
            {busy ? 'Streckkod hittad – letar efter produkten …' : cam.kind === 'scanning' ? 'Håll streckkoden inom ramen' : 'Startar kameran …'}
          </p>
        )}
      </div>

      {/* Nedre list */}
      <footer className="relative z-10 flex flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {busy && (
            <motion.div
              key="busy"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-surface/90 px-4 py-3 backdrop-blur-md"
              role="status"
            >
              <Spinner className="size-5 text-gran" />
              <span className="min-w-0 flex-1 text-sm">
                Letar efter <span className="font-semibold tabular-nums">{lookup.kind === 'loading' ? lookup.code : ''}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={closeLookup}>
                Avbryt
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 rounded-[1.5rem] bg-surface/80 p-2 backdrop-blur-md">
          <span className="flex min-w-0 items-center gap-2 pl-1.5 text-sm text-ink-2">
            <MealIcon meal={meal} size="xs" />
            <span className="truncate">
              {mealLabel} · {relativeDayLabel(date, today)}
            </span>
          </span>
          {cameraOk && (
            <Button variant="secondary" size="sm" iconLeft={Keyboard} onClick={() => setManualOpen(true)}>
              Skriv in kod
            </Button>
          )}
        </div>

        {basketCount > 0 && (
          <motion.button
            type="button"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={goToBasket}
            className="mx-auto flex min-h-12 w-full max-w-md items-center justify-center gap-2 rounded-[1.5rem] bg-gran px-4 text-sm font-semibold text-on-gran"
          >
            <ShoppingBasket className="size-4" aria-hidden />
            {countLabel(basketCount)} i korgen – visa korgen
          </motion.button>
        )}
      </footer>

      {/* Produkt hittad */}
      <PortionSheet
        food={found}
        onClose={closeLookup}
        detailsTo={found ? foodDetailHref(found.id, { meal, date }) : undefined}
        primary={{
          label: `Lägg till i ${mealLabel}`,
          icon: Plus,
          onClick: (amount, unit) => {
            if (!found) return
            if (addFood(found, amount, unit, { date, meal })) {
              setLookup({ kind: 'idle' })
              leave(exitTo)
            }
          },
        }}
        secondary={{
          label: 'Lägg i korgen',
          icon: ShoppingBasket,
          onClick: (amount, unit) => {
            if (!found) return
            if (basketAdd(found, amount, unit, 'scan')) {
              toast('Lagt i korgen – skanna nästa vara', { tone: 'success' })
              closeLookup()
            }
          },
        }}
        missingNutritionAction={
          found ? (
            <Button
              variant="soft"
              size="sm"
              iconLeft={Plus}
              replace
              to={newFoodHref({ copyOf: found.id, barcode: lookup.kind === 'found' ? lookup.code : undefined, meal, date })}
            >
              Komplettera värdena
            </Button>
          ) : undefined
        }
      >
        {found && <ProductHeader food={found} />}
      </PortionSheet>

      {/* Hittades inte / offline / fel */}
      <Sheet
        open={lookup.kind === 'notfound' || lookup.kind === 'offline' || lookup.kind === 'error'}
        onClose={closeLookup}
        title={lookup.kind === 'offline' ? 'Du är offline' : lookup.kind === 'error' ? 'Något gick snett' : 'Produkten finns inte ännu'}
      >
        <LookupProblem
          lookup={lookup}
          onCreate={(code) => navigate(newFoodHref({ barcode: code, meal, date }), { replace: true })}
          onRetry={(code) => void runLookup(code)}
          onScanAgain={closeLookup}
        />
      </Sheet>

      {/* Manuell inmatning */}
      <Sheet
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Skriv in streckkod"
        description="Siffrorna står under streckkoden på förpackningen."
        initialFocusRef={manualInput}
      >
        <ManualEntry onSubmit={submitManual} inputRef={manualInput} busy={busy} />
      </Sheet>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delar
// ---------------------------------------------------------------------------

function FrameCorners() {
  const base = 'absolute size-9 border-gran'
  return (
    <span aria-hidden>
      <span className={cx(base, '-left-0.5 -top-0.5 rounded-tl-[1.75rem] border-l-4 border-t-4')} />
      <span className={cx(base, '-right-0.5 -top-0.5 rounded-tr-[1.75rem] border-r-4 border-t-4')} />
      <span className={cx(base, '-bottom-0.5 -left-0.5 rounded-bl-[1.75rem] border-b-4 border-l-4')} />
      <span className={cx(base, '-bottom-0.5 -right-0.5 rounded-br-[1.75rem] border-b-4 border-r-4')} />
    </span>
  )
}

function ProductHeader({ food }: { food: Food }) {
  const [failed, setFailed] = useState(false)
  const nutri = nutriScoreInfo(food.extra?.nutriscore)
  return (
    <div className="flex items-center gap-3">
      {food.imageUrl && !failed ? (
        <img src={food.imageUrl} alt="" onError={() => setFailed(true)} className="size-16 shrink-0 rounded-2xl bg-surface-2 object-contain" />
      ) : (
        <CategoryIcon category={food.category} size="lg" />
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-ink-2">
        {food.extra?.quantity && <span>{food.extra.quantity}</span>}
        {nutri && (
          <NutriScoreBadge score={nutri} />
        )}
        {food.barcode && <span className="w-full text-xs tabular-nums text-ink-3">{food.barcode}</span>}
      </div>
    </div>
  )
}

function ManualEntry({ onSubmit, inputRef, busy }: { onSubmit: (code: string) => void; inputRef: RefObject<HTMLInputElement | null>; busy: boolean }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const code = cleanManualCode(value)
    if (!isValidEan(code)) {
      setError(OFF_MESSAGES.invalid_barcode)
      return
    }
    onSubmit(code)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 pb-2" noValidate>
      <TextField
        ref={inputRef}
        label="Streckkod (EAN)"
        value={value}
        onValueChange={(v) => {
          setValue(cleanManualCode(v))
          setError(undefined)
        }}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint="search"
        placeholder="7310865000637"
        hint="8 eller 13 siffror"
        error={error}
        clearable
      />
      <Button type="submit" size="lg" fullWidth iconLeft={PackageSearch} loading={busy} disabled={value.length < 8}>
        Sök produkten
      </Button>
    </form>
  )
}

function CameraFallback({
  reason,
  onRetry,
  onSubmit,
  inputRef,
  busy,
}: {
  reason: CameraErrorKind
  onRetry: () => void
  onSubmit: (code: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  busy: boolean
}) {
  const text = CAMERA_ERROR_TEXT[reason]
  const canRetry = reason === 'denied' || reason === 'busy' || reason === 'error'
  return (
    <div className="w-full max-w-md rounded-[1.75rem] bg-surface p-5 shadow-[var(--shadow-float)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-2">
          <Camera className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold leading-tight">{text.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{text.text}</p>
        </div>
      </div>
      <ManualEntry onSubmit={onSubmit} inputRef={inputRef} busy={busy} />
      {canRetry && (
        <Button variant="ghost" size="sm" iconLeft={RefreshCw} onClick={onRetry} fullWidth className="mt-1">
          Försök starta kameran igen
        </Button>
      )}
    </div>
  )
}

function LookupProblem({
  lookup,
  onCreate,
  onRetry,
  onScanAgain,
}: {
  lookup: Lookup
  onCreate: (code: string) => void
  onRetry: (code: string) => void
  onScanAgain: () => void
}) {
  if (lookup.kind !== 'notfound' && lookup.kind !== 'offline' && lookup.kind !== 'error') return null
  const code = lookup.code
  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-2">
          {lookup.kind === 'offline' ? <WifiOff className="size-6" aria-hidden /> : <PackageSearch className="size-6" aria-hidden />}
        </span>
        <p className="text-sm leading-relaxed text-ink-2">
          {lookup.kind === 'notfound' && (
            <>
              Streckkoden <span className="font-semibold tabular-nums text-ink">{code}</span> finns varken i Lagom eller i Open Food Facts. Lägg in
              värdena från förpackningen – då känner Lagom igen produkten nästa gång.
            </>
          )}
          {lookup.kind === 'offline' && (
            <>
              Produkten med streckkod <span className="font-semibold tabular-nums text-ink">{code}</span> finns inte sparad på enheten. Försök igen när du
              har uppkoppling, eller lägg in värdena själv.
            </>
          )}
          {lookup.kind === 'error' && lookup.message}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button size="lg" fullWidth iconLeft={Plus} onClick={() => onCreate(code)}>
          Skapa eget livsmedel
        </Button>
        {lookup.kind !== 'notfound' && (
          <Button variant="soft" size="lg" fullWidth iconLeft={RefreshCw} onClick={() => onRetry(code)}>
            Försök igen
          </Button>
        )}
        <Button variant="ghost" fullWidth onClick={onScanAgain}>
          Skanna en annan vara
        </Button>
      </div>
    </div>
  )
}
