import { useEffect } from 'react'

/**
 * Förfina sidans dokumenttitel, t.ex. med ett livsmedels namn: `useDocumentTitle(food?.name)` ger
 * "Havregrynsgröt – Lagom". AppShell sätter en titel per sökväg först (i en layout-effekt), så
 * sidor behöver bara anropa kroken när de vill ha något mer specifikt.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (title) document.title = `${title} – Lagom`
  }, [title])
}
