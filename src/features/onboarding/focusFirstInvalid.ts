/**
 * Flytta fokus till första felaktiga fältet i ett formulär. En radiogrupp (t.ex. Kön) är ingen
 * fokuserbar kontroll i sig – då får det alternativ som ligger i tabbordningen fokus, så att
 * skärmläsaren läser upp gruppen och dess felmeddelande.
 */
export function focusFirstInvalid(root: ParentNode = document): boolean {
  const first = root.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!first) return false
  const target =
    first.getAttribute('role') === 'radiogroup'
      ? (first.querySelector<HTMLElement>('[role="radio"][tabindex="0"]:not(:disabled)') ??
        first.querySelector<HTMLElement>('[role="radio"]:not(:disabled)'))
      : first
  if (!target) return false
  target.focus()
  return document.activeElement === target
}
