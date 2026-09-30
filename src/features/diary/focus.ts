/**
 * Fokus i dagboken när det man just använde försvinner.
 *
 * Ark och dialoger återställer fokus till knappen som öppnade dem – men om knappen själv
 * försvinner (posten togs bort, flyttades eller måltiden tömdes) hamnar fokus annars på
 * <body>, och tangentbords- och skärmläsaranvändare kastas upp till sidans början.
 * Här flyttas fokus i stället till något begripligt i närheten.
 */
import { getFocusable } from '../../components/ui/Sheet'
import type { MealId } from '../../types'

/** Id på måltidens "Lägg till i …"-länk i dagboken (en dag visas i taget, så id:t är unikt). */
export function addFoodLinkId(meal: MealId): string {
  return `dagbok-lagg-till-${meal}`
}

/**
 * Knappen för en post i dagboken. Måltiden anges så att en rad som är på väg ut ur en annan
 * måltid (när posten bytt måltid) inte väljs.
 */
export function entryButton(entryId: string | undefined, meal: MealId): HTMLElement | null {
  if (!entryId) return null
  for (const el of document.querySelectorAll<HTMLElement>('[data-entry-id]')) {
    if (el.dataset.entryId === entryId && el.dataset.meal === meal) return el.querySelector<HTMLElement>('button')
  }
  return null
}

/** Måltidens "Lägg till i …"-länk. */
export function addFoodLink(meal: MealId): HTMLElement | null {
  return document.getElementById(addFoodLinkId(meal))
}

/** Alla "Lägg till i …"-länkar bland måltiderna, i sidans ordning. */
function addFoodLinks(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[id^="${addFoodLinkId('' as MealId)}"]`)]
}

/** Första "Lägg till i …"-länken bland måltiderna – sista utvägen. */
export function firstAddFoodLink(): HTMLElement | null {
  return addFoodLinks()[0] ?? null
}

/** Sista "Lägg till i …"-länken – närmast det som ligger under måltiderna (träning, vatten). */
export function lastAddFoodLink(): HTMLElement | null {
  return addFoodLinks().at(-1) ?? null
}

/** Knappen för dagens första post (t.ex. efter att en tom dag fyllts genom kopiering). */
export function firstEntryButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-entry-id] button')
}

/** Id på träningssektionens "Logga"-knapp i dagboken. */
export const LOG_EXERCISE_ID = 'dagbok-logga-traning'

/** Ta bort-knappen för ett träningspass i dagboken. */
export function exerciseRemoveButton(exerciseId: string | undefined): HTMLElement | null {
  if (!exerciseId) return null
  for (const el of document.querySelectorAll<HTMLElement>('[data-exercise-id]')) {
    if (el.dataset.exerciseId === exerciseId) return el.querySelector<HTMLElement>('button')
  }
  return null
}

/**
 * Närmaste fokuserbara element efter `el` (och utanför det) i sidans innehåll (<main>), annars
 * det närmaste före. För när ett helt kort försvinner, t.ex. "Dölj dagens tips".
 */
export function focusableNear(el: Element | null): HTMLElement | null {
  if (!el) return null
  const root = el.closest('main') ?? document.body
  if (!(root instanceof HTMLElement)) return null
  const items = getFocusable(root).filter((x) => !el.contains(x))
  const after = items.find((x) => el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)
  if (after) return after
  return items.filter((x) => el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING).at(-1) ?? null
}

type Candidate = () => HTMLElement | null | undefined

/**
 * Flytta fokus till den första kandidat som finns, när React har ritat om. Används när knappen
 * man just tryckte på byts ut eller försvinner (en kopierad tom dag, "Markera dagen som klar"
 * som blir "Öppna igen", ett borttaget träningspass) – annars hamnar fokus på <body>.
 */
export function focusAfterRender(...candidates: Candidate[]): void {
  window.setTimeout(() => {
    for (const get of candidates) {
      const el = get()
      if (el?.isConnected) {
        el.focus()
        return
      }
    }
  }, 0)
}

/**
 * Som `focusAfterRender`, efter att ett ark eller en dialog har stängts. Timeouten gör att vårt
 * val kommer efter arkets egen fokusåterställning – annars skulle den skriva över det.
 */
export const focusAfterClose = focusAfterRender
