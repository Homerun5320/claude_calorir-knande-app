/**
 * Köp- och användarvillkor (/villkor) – nås utan profil, från Om Lagom, Inställningar och köpet.
 * Samma text finns som fristående sida i public/villkor/ och i docs/KOPVILLKOR.md. I
 * butiksapparna visas inte avsnitten om webbköp – där sköter App Store och Google Play köpet.
 */
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { sellsOnWeb } from '../../config/platform'
import { TERMS_SECTIONS, TERMS_VERSION, visibleSections } from './legalContent'
import { LegalDocument } from './LegalView'

const RELATED = [
  { to: '/integritet', label: 'Integritetspolicy' },
  { to: '/om', label: 'Om Lagom' },
] as const

export default function TermsPage() {
  useDocumentTitle('Köp- och användarvillkor')
  const sections = visibleSections(TERMS_SECTIONS, sellsOnWeb())
  return <LegalDocument title="Köp- och användarvillkor" version={TERMS_VERSION} sections={sections} related={RELATED} />
}
