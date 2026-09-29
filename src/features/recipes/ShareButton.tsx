/**
 * "Dela" för ett eget recept eller en sparad måltid – som länk eller fil, utan server.
 *
 * Knappen öppnar ett ark som säger rakt ut vad som delas (bara receptet eller måltiden, aldrig
 * något ur dagboken) och att alla som har länken kan se det. Länken skapas när arket öppnas
 * (komprimeringen är asynkron), så att delningen sedan kan starta direkt i klicket – Safari
 * kräver det. Är receptet för stort för en länk, eller saknar appen webbplatsens adress, går det
 * att dela som fil ("<namn>.lagom.json" via `saveFile`, delningsbladet i apparna).
 *
 * ```tsx
 * <ShareButton target={{ kind: 'recipe', recipe }} />
 * <ShareButton target={{ kind: 'meal', template }} size="sm" />
 * ```
 */
import { useEffect, useMemo, useState } from 'react'
import { FileDown, Link2, Lock, Share2 } from 'lucide-react'
import type { MealTemplate, Recipe } from '../../types'
import { Button, IconButton, Sheet, Spinner, toast, type IconButtonSize } from '../../components/ui'
import { saveFile } from '../../lib/backup'
import { shareOrCopy } from '../diary/share'
import { isNative } from '../../native'
import { logError } from '../../lib/errorLog'
import {
  buildMealShare,
  buildRecipeShare,
  createShareLink,
  shareFileContent,
  shareFileName,
  type SharePayload,
} from '../../lib/shareLink'

export type ShareTarget = { kind: 'recipe'; recipe: Recipe } | { kind: 'meal'; template: MealTemplate }

export interface ShareButtonProps {
  target: ShareTarget
  /** 'icon' = rund ikonknapp (sidhuvud, kort), 'button' = knapp med text. */
  variant?: 'icon' | 'button'
  size?: IconButtonSize
  className?: string
}

type LinkState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error'; error: 'tooLarge' | 'noSite' | 'failed' | 'empty' }

/** Finns en delningsdialog? I apparna alltid (systemets delningsblad). */
function canNativeShare(): boolean {
  if (isNative()) return true
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/** Texter för recept respektive måltid. */
function wordsFor(kind: SharePayload['kind']) {
  return kind === 'recipe'
    ? {
        noun: 'receptet',
        title: 'Dela receptet',
        what: 'ett recept',
        contents: 'namn, ingredienser, mängder, portioner, tid, märkningar och instruktioner, och näringsvärden för livsmedel som inte finns i Lagoms lista',
        tooLarge: 'Receptet är för stort för en länk',
        empty: 'Receptet har inga ingredienser att dela ännu.',
      }
    : {
        noun: 'måltiden',
        title: 'Dela måltiden',
        what: 'en måltid',
        contents: 'namn, livsmedel och mängder, och näringsvärden för livsmedel som inte finns i Lagoms lista',
        tooLarge: 'Måltiden är för stor för en länk',
        empty: 'Måltiden har inga livsmedel att dela.',
      }
}

export function ShareButton({ target, variant = 'icon', size = 'md', className }: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const name = target.kind === 'recipe' ? target.recipe.name : target.template.name
  const label = target.kind === 'recipe' ? `Dela receptet ${name}` : `Dela måltiden ${name}`
  return (
    <>
      {variant === 'icon' ? (
        <IconButton icon={Share2} aria-label={label} size={size} onClick={() => setOpen(true)} className={className} noTooltip={size === 'sm'} />
      ) : (
        <Button variant="soft" iconLeft={Share2} onClick={() => setOpen(true)} className={className} aria-label={label}>
          Dela
        </Button>
      )}
      <ShareSheet target={target} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function ShareSheet({ target, open, onClose }: { target: ShareTarget; open: boolean; onClose: () => void }) {
  // Byggs först när arket öppnas – och på nytt om receptet har ändrats sedan dess. Beror på
  // själva receptet/måltiden, inte på `target` (som ofta skapas på nytt vid varje rendering).
  const source: Recipe | MealTemplate = target.kind === 'recipe' ? target.recipe : target.template
  const kind = target.kind
  const payload = useMemo<SharePayload | null>(() => {
    if (!open) return null
    return kind === 'recipe' ? buildRecipeShare(source as Recipe) : buildMealShare(source as MealTemplate)
  }, [open, kind, source])
  const [link, setLink] = useState<LinkState>({ status: 'loading' })
  const [nativeShare] = useState(canNativeShare)

  useEffect(() => {
    if (!payload) return
    // Utan ingredienser finns inget att dela (mottagaren skulle inte kunna öppna det).
    if (payload.items.length === 0) {
      setLink({ status: 'error', error: 'empty' })
      return
    }
    let cancelled = false
    setLink({ status: 'loading' })
    createShareLink(payload)
      .then((result) => {
        if (cancelled) return
        setLink(result.ok ? { status: 'ready', url: result.url } : { status: 'error', error: result.error })
      })
      .catch((error: unknown) => {
        logError(error, 'dela-länk')
        if (!cancelled) setLink({ status: 'error', error: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [payload])

  const close = onClose
  const words = wordsFor(kind)
  const name = payload?.name ?? source.name

  // Delningen måste starta i samma klick – ingen await före anropen.
  const shareLink = (mode: 'share' | 'copy') => {
    if (link.status !== 'ready' || !payload) return
    const env = mode === 'copy' ? { clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : undefined } : undefined
    const text = mode === 'copy' ? link.url : `${payload.name} – ${words.what} från Lagom:\n${link.url}`
    void shareOrCopy(payload.name, text, env).then((outcome) => {
      if (outcome === 'copied') toast('Länken är kopierad – klistra in den där du vill dela den.', { tone: 'success' })
      else if (outcome === 'failed') toast('Det gick inte att dela länken här. Dela som fil i stället.', { tone: 'error' })
      if (outcome === 'copied' || outcome === 'shared') close()
    })
  }

  const shareFile = () => {
    if (!payload || payload.items.length === 0) return
    void saveFile(shareFileName(payload.name), shareFileContent(payload)).then((outcome) => {
      if (outcome === 'saved') toast('Filen är sparad – skicka den till den du vill dela med.', { tone: 'success' })
      else if (outcome === 'failed') toast('Det gick inte att spara filen här.', { tone: 'error' })
      if (outcome === 'saved' || outcome === 'shared') close()
    })
  }

  const ready = link.status === 'ready'
  const empty = link.status === 'error' && link.error === 'empty'
  return (
    <Sheet
      open={open}
      onClose={close}
      title={words.title}
      description={`”${name}”`}
      width="sm"
      footer={
        <div className="flex flex-col gap-2">
          {nativeShare && (
            <Button size="lg" iconLeft={Share2} onClick={() => shareLink('share')} disabled={!ready} fullWidth>
              Dela länk
            </Button>
          )}
          <Button size="lg" variant={nativeShare ? 'soft' : 'primary'} iconLeft={Link2} onClick={() => shareLink('copy')} disabled={!ready} fullWidth>
            Kopiera länk
          </Button>
          <Button
            size="lg"
            variant={ready || link.status === 'loading' || empty ? 'ghost' : 'primary'}
            iconLeft={FileDown}
            onClick={shareFile}
            disabled={empty}
            fullWidth
          >
            Dela som fil
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 text-sm leading-relaxed text-ink-2">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
          <p>
            <strong className="font-semibold text-ink">Alla som har länken kan se {words.noun}.</strong> Bara {words.noun} följer med – {words.contents}.
            Ingenting från din dagbok eller dina allergiinställningar. {capitalize(words.noun)} ligger i själva länken och skickas inte till Lagoms server – bara
            dit du själv skickar länken.
          </p>
        </div>

        <div aria-live="polite" className="min-h-6 text-sm leading-relaxed">
          {link.status === 'loading' && (
            <span className="inline-flex items-center gap-2 text-ink-3">
              <Spinner className="size-4" />
              Skapar länken …
            </span>
          )}
          {link.status === 'error' && <p className="text-ink-2">{linkErrorText(link.error, kind)}</p>}
          {ready && (
            <p className="text-ink-3">
              Använder mottagaren Lagom-appen? Då klistras länken in – eller filen öppnas – under Recept → Öppna delat recept.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  )
}

/** Varför det inte blev någon länk – och vad man kan göra i stället. */
function linkErrorText(error: Extract<LinkState, { status: 'error' }>['error'], kind: ShareTarget['kind']): string {
  const words = wordsFor(kind)
  switch (error) {
    case 'empty':
      return words.empty
    case 'tooLarge':
      return `${words.tooLarge} – dela ${kind === 'recipe' ? 'det' : 'den'} som fil i stället.`
    case 'noSite':
      return 'Länkar går inte att skapa i den här versionen av appen – dela som fil i stället.'
    default:
      return 'Länken gick inte att skapa – dela som fil i stället.'
  }
}

function capitalize(s: string): string {
  return s ? s[0].toLocaleUpperCase('sv-SE') + s.slice(1) : s
}
