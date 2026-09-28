/**
 * Integritetspolicy (/integritet) – nås utan profil, från Om Lagom, Inställningar och köpet.
 * Samma text finns som fristående sida i public/integritet/ (för butikerna) och i
 * docs/INTEGRITETSPOLICY.md. I butiksapparna visas inte styckena om webbköp (Stripe).
 */
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { sellsOnWeb } from '../../config/platform'
import { PRIVACY_SECTIONS, PRIVACY_VERSION, visibleSections } from './legalContent'
import { LegalDocument } from './LegalView'

const RELATED = [
  { to: '/villkor', label: 'Köp- och användarvillkor' },
  { to: '/om', label: 'Om Lagom' },
] as const

export default function PrivacyPage() {
  useDocumentTitle('Integritetspolicy')
  // Plattformen ändras inte medan appen körs – räcker att räkna vid varje rendering.
  const sections = visibleSections(PRIVACY_SECTIONS, sellsOnWeb())
  return <LegalDocument title="Integritetspolicy" version={PRIVACY_VERSION} sections={sections} related={RELATED} />
}
