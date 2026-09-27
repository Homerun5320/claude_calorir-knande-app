/**
 * Fokus i dagboken när det man just använde försvinner.
 *
 * Ark och dialoger återställer fokus till knappen som öppnade dem – men om knappen själv
 * försvinner (posten togs bort, flyttades eller måltiden tömdes) hamnar fokus annars på
 * <body>, och tangentbords- och skärmläsaranvändare kastas upp till sidans början.
 * Här flyttas fokus i stället till något begripligt i närheten.
 */
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

/** Första "Lägg till i …"-länken bland måltiderna – sista utvägen. */
export function firstAddFoodLink(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[id^="${addFoodLinkId('' as MealId)}"]`)
}

type Candidate = () => HTMLElement | null | undefined

/**
 * Flytta fokus till den första kandidat som finns. Körs efter att arket/dialogen har stängts och
 * återställt sitt eget fokus (därav timeouten) – annars skulle det skriva över vårt val.
 */
export function focusAfterClose(...candidates: Candidate[]): void {
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
