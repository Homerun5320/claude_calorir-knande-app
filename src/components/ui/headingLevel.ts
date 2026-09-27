/**
 * Automatisk rubriknivå: en komponent som inte vet var den hamnar (t.ex. EmptyState eller
 * NutrientTable) tar nivån efter närmast föregående rubrik i dokumentet – direkt under sidans h1
 * blir den h2, i ett kort eller ark med h2-rubrik blir den h3. Då hoppar rubrikerna aldrig över
 * en nivå (WCAG 1.3.1, axe "heading-order").
 */
import { useLayoutEffect, useState, type RefObject } from 'react'

export type HeadingLevel = 2 | 3 | 4 | 5 | 6
export type HeadingTag = 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

const HEADINGS = 'h1, h2, h3, h4, h5, h6, [role="heading"][aria-level]'

function levelOf(el: Element): number {
  const m = /^H([1-6])$/.exec(el.tagName)
  if (m) return Number(m[1])
  return Number(el.getAttribute('aria-level')) || 2
}

/** Nivån för en rubrik som ska ligga efter `el`:s föregående rubrik (2–6). */
export function levelAfterPrecedingHeading(el: Element): HeadingLevel {
  let previous: Element | null = null
  for (const h of Array.from(el.ownerDocument.querySelectorAll(HEADINGS))) {
    // Dokumentordning: sluta vid första rubriken som inte ligger före elementet.
    if (!(h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) || el.contains(h)) break
    previous = h
  }
  const next = previous ? levelOf(previous) + 1 : 2
  return Math.min(6, Math.max(2, next)) as HeadingLevel
}

/**
 * Rubriknivå för en komponent: `explicit` om den anges, annars efter föregående rubrik (räknas
 * ut före första målningen). `fallback` används innan elementet finns.
 */
export function useHeadingLevel(ref: RefObject<Element | null>, explicit?: HeadingLevel, fallback: HeadingLevel = 3): HeadingLevel {
  const [auto, setAuto] = useState<HeadingLevel>(fallback)
  useLayoutEffect(() => {
    if (explicit !== undefined || !ref.current) return
    const next = levelAfterPrecedingHeading(ref.current)
    if (next !== auto) setAuto(next)
  })
  return explicit ?? auto
}

export function headingTag(level: HeadingLevel): HeadingTag {
  return `h${level}` as HeadingTag
}
