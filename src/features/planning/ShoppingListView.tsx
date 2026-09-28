/**
 * Fliken "Inköpslista": veckans ingredienser grupperade per butiksavdelning, med bockar, egna rader
 * och delning som text (delningsdialogen eller urklipp).
 */
import { useMemo, useState, type FormEvent } from 'react'
import { Check, ClipboardCopy, Info, Plus, RotateCcw, Share2, X } from 'lucide-react'
import type { ISODate } from '../../types'
import { Button, Card, EmptyState, IconButton, Skeleton, TextField, cx, toast } from '../../components/ui'
import { usePlanStore } from '../../stores/planStore'
import { formatNumber } from '../../lib/format'
import {
  MAX_EXTRA_LENGTH,
  remainingCount,
  shoppingListText,
  weekRangeText,
  weekTitle,
  type ShoppingExtra,
  type ShoppingLine,
  type ShoppingList,
  type WeekShopping,
} from '../../lib/planning'
import { shareOrCopy } from '../diary/share'
import { requireAccess } from '../premium/requireAccess'

const EMPTY_WEEK: WeekShopping = { checked: [], extras: [] }

/** "Köttbullar", "Köttbullar och Pannkakor", "Köttbullar, Pannkakor och Gröt". */
export function joinSv(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} och ${list[list.length - 1]}`
}

/** Rubriken i den delade texten: "Inköpslista vecka 40 (28 sep – 4 okt)". */
export function shoppingTitle(weekStart: ISODate, today: ISODate): string {
  return `Inköpslista ${weekTitle(weekStart).toLocaleLowerCase('sv-SE')} (${weekRangeText(weekStart, today)})`
}

function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export interface ShoppingListViewProps {
  weekStart: ISODate
  today: ISODate
  list: ShoppingList
  /** true medan livsmedelsdatabasen och de inbyggda recepten laddas (listan är då inte komplett). */
  loading: boolean
  /** Antal planerade rader i veckan (för tomläget). */
  planned: number
  onPlan: () => void
}

export function ShoppingListView({ weekStart, today, list, loading, planned, onPlan }: ShoppingListViewProps) {
  const week = usePlanStore((s) => s.shopping[weekStart] ?? EMPTY_WEEK)
  const toggleChecked = usePlanStore((s) => s.toggleChecked)
  const checked = useMemo(() => new Set(week.checked), [week.checked])
  const remaining = remainingCount(list, week.extras, checked)
  const total = list.count + week.extras.length
  const anyChecked = list.groups.some((g) => g.lines.some((l) => checked.has(l.key))) || week.extras.some((e) => e.checked)
  const [native] = useState(canNativeShare)

  const share = (mode: 'share' | 'copy') => {
    const title = shoppingTitle(weekStart, today)
    const text = shoppingListText(title, list, week.extras, checked)
    // Delningen måste starta i samma klick – ingen await före anropet.
    const env = mode === 'copy' ? { clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : undefined } : undefined
    void shareOrCopy(title, text, env).then((outcome) => {
      if (outcome === 'copied') toast('Inköpslistan är kopierad – klistra in den där du vill.', { tone: 'success' })
      else if (outcome === 'failed') toast('Det gick inte att dela eller kopiera listan här.', { tone: 'error' })
    })
  }

  const uncheckAll = () => {
    const before = usePlanStore.getState().uncheckAll(weekStart)
    toast('Alla bockar är borttagna', {
      action: { label: 'Ångra', onClick: () => usePlanStore.getState().restoreChecks(weekStart, before) },
    })
  }

  // Listan är inte komplett förrän recepten har laddats – visa den inte halvfärdig (då skulle
  // t.ex. en klassiker se ut att saknas).
  if (loading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Hämtar recepten">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-[1.5rem]" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {total > 0 ? (
        <Card padding="none" className="p-4">
          <p className="font-display text-[1.25rem] font-semibold tracking-tight text-ink" aria-live="polite">
            {remaining === 0 ? 'Allt är avbockat' : `${formatNumber(remaining)} ${remaining === 1 ? 'vara' : 'varor'} kvar`}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-ink-3">
            {remaining === 0 ? 'Trevlig matlagning!' : `av ${formatNumber(total)} på listan`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {native && (
              <Button size="sm" iconLeft={Share2} onClick={() => share('share')} disabled={remaining === 0}>
                Dela listan
              </Button>
            )}
            <Button size="sm" variant={native ? 'secondary' : 'primary'} iconLeft={ClipboardCopy} onClick={() => share('copy')} disabled={remaining === 0}>
              Kopiera listan
            </Button>
            {anyChecked && (
              <Button size="sm" variant="ghost" iconLeft={RotateCcw} onClick={uncheckAll}>
                Ta bort bockarna
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card variant="flat">
          <EmptyState
            compact
            illustration="plate"
            title="Inköpslistan är tom"
            text={
              planned > 0
                ? 'De planerade måltiderna har inga varor att handla (t.ex. rester). Lägg till egna varor nedan.'
                : 'Planera veckans måltider så fylls listan i av sig själv. Du kan också lägga till egna varor.'
            }
            action={
              planned === 0 ? (
                <Button variant="soft" size="sm" onClick={onPlan}>
                  Till planeringen
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {list.missingRecipes.length > 0 && (
        <p className="flex items-start gap-2 rounded-2xl bg-sol-soft p-3 text-[0.875rem] leading-snug text-ink">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {list.missingRecipes.length === 1 ? 'Receptet' : 'Recepten'} {joinSv(list.missingRecipes)} finns inte längre och räknas inte med.
          </span>
        </p>
      )}

      {list.groups.map((group) => (
        <Card key={group.id} as="section" aria-labelledby={`inkop-${group.id}`} padding="none" className="px-2 pb-2 pt-4">
          <h2 id={`inkop-${group.id}`} className="eyebrow mb-1 px-2">
            {group.label}
          </h2>
          <ul className="flex flex-col">
            {group.lines.map((line) => (
              <ShoppingRow key={line.key} line={line} checked={checked.has(line.key)} onToggle={() => toggleChecked(weekStart, line.key)} />
            ))}
          </ul>
        </Card>
      ))}

      <ExtrasCard weekStart={weekStart} extras={week.extras} />

      {list.count > 0 && (
        <p className="px-1 text-[0.8125rem] leading-relaxed text-ink-3">
          Mängderna är ungefärliga och avrundade uppåt. Kött, fisk, pasta och ris står i rå eller okokt vikt – så som du köper dem. Kranvatten
          räknas inte med.
        </p>
      )}
    </div>
  )
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gran',
        checked ? 'border-gran bg-gran text-on-gran' : 'border-line bg-surface',
      )}
    >
      {checked && <Check className="size-4" strokeWidth={3} />}
    </span>
  )
}

function ShoppingRow({ line, checked, onToggle }: { line: ShoppingLine; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-surface-2">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={onToggle} />
        <CheckBox checked={checked} />
        <span className="min-w-0 flex-1">
          <span className={cx('block font-medium leading-snug', checked ? 'text-ink-3 line-through' : 'text-ink')}>
            {line.name}
            {line.brand && <span className="font-normal text-ink-3"> · {line.brand}</span>}
          </span>
          {line.amountText && (
            <span className={cx('block text-[0.875rem] leading-snug', checked ? 'text-ink-3' : 'text-ink-2')}>
              {line.amountText}
              {line.partial && ' + lite till'}
            </span>
          )}
          {line.usedFor.length > 0 && <span className="line-clamp-2 block text-[0.8125rem] leading-snug text-ink-3">Till {joinSv(line.usedFor)}</span>}
        </span>
      </label>
    </li>
  )
}

function ExtrasCard({ weekStart, extras }: { weekStart: ISODate; extras: readonly ShoppingExtra[] }) {
  const [text, setText] = useState('')
  const toggleExtra = usePlanStore((s) => s.toggleExtra)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    if (!requireAccess('planera')) return
    const added = usePlanStore.getState().addExtra(weekStart, text)
    if (!added) {
      toast('Listan har redan många egna rader – ta bort några först.', { tone: 'error' })
      return
    }
    setText('')
  }

  const remove = (extra: ShoppingExtra) => {
    const removed = usePlanStore.getState().removeExtra(weekStart, extra.id)
    if (!removed) return
    toast(`${removed.text} är borttagen`, { action: { label: 'Ångra', onClick: () => usePlanStore.getState().restoreExtra(weekStart, removed) } })
  }

  return (
    <Card as="section" aria-labelledby="inkop-egna" padding="none" className="px-2 pb-3 pt-4">
      <h2 id="inkop-egna" className="eyebrow mb-1 px-2">
        Egna varor
      </h2>
      {extras.length > 0 && (
        <ul className="mb-2 flex flex-col">
          {extras.map((extra) => (
            <li key={extra.id} className="flex items-start gap-1">
              <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-surface-2">
                <input type="checkbox" className="peer sr-only" checked={extra.checked} onChange={() => toggleExtra(weekStart, extra.id)} />
                <CheckBox checked={extra.checked} />
                <span className={cx('min-w-0 flex-1 break-words font-medium leading-snug', extra.checked ? 'text-ink-3 line-through' : 'text-ink')}>{extra.text}</span>
              </label>
              <IconButton icon={X} size="md" variant="ghost" aria-label={`Ta bort ${extra.text}`} onClick={() => remove(extra)} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex items-end gap-2 px-2">
        <TextField
          label="Lägg till egen vara"
          labelHidden
          placeholder="T.ex. diskmedel eller kaffefilter"
          value={text}
          onValueChange={setText}
          maxLength={MAX_EXTRA_LENGTH}
          enterKeyHint="done"
          autoComplete="off"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="soft" iconLeft={Plus} disabled={!text.trim()}>
          Lägg till
        </Button>
      </form>
    </Card>
  )
}
