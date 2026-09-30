/**
 * "Bra att veta när du är gravid" (eller "… när du ammar") – Livsmedelsverkets råd för
 * livsmedlet, visat varsamt på en solgul yta. Aldrig röd varningsfärg: det är råd, inte förbud.
 *
 * Visas bara när profilens livsfas är 'gravid' eller 'ammar' och något råd gäller livsmedlet
 * (se `lib/pregnancy`).
 */
import { useMemo } from 'react'
import { Info } from 'lucide-react'
import type { Food } from '../../types'
import { useProfileStore } from '../../stores/profileStore'
import { pregnancyNotes, pregnancyNoteTitle } from '../../lib/pregnancy'
import { ExternalLink, cx } from '../../components/ui'

export function PregnancyNote({ food, className }: { food: Food; className?: string }) {
  const lifeStage = useProfileStore((s) => s.profile?.lifeStage)
  const notes = useMemo(() => pregnancyNotes(food, lifeStage), [food, lifeStage])
  if (notes.length === 0) return null
  const title = pregnancyNoteTitle(lifeStage)
  return (
    <section aria-label={title} className={cx('rounded-2xl bg-sol-soft px-4 py-3 text-sm text-ink', className)}>
      <p className="flex items-center gap-2 font-semibold">
        <Info className="size-4 shrink-0 text-hjortron" aria-hidden />
        {title}
      </p>
      <ul className="mt-1.5 flex flex-col gap-2 leading-relaxed">
        {notes.map((n) => (
          <li key={n.id}>{n.text}</li>
        ))}
      </ul>
      <ExternalLink
        href={notes[0].source}
        className="mt-1 inline-flex min-h-11 items-center gap-1 font-semibold text-gran underline-offset-4 hover:underline"
      >
        Läs mer hos Livsmedelsverket
      </ExternalLink>
    </section>
  )
}
