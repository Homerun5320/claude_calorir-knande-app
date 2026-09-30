/**
 * Lagoms logotyp: midnattssolen som vilar på horisonten – varken upp eller ner. Lagom.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="14" fill="var(--lg-gran)" />
      <circle cx="24" cy="26" r="11" fill="var(--lg-sol)" />
      <rect x="6" y="26" width="36" height="16" fill="var(--lg-gran)" />
      <rect x="9" y="25" width="30" height="2.5" rx="1.25" fill="var(--lg-on-gran)" opacity="0.95" />
      <rect x="15" y="31" width="18" height="2" rx="1" fill="var(--lg-on-gran)" opacity="0.5" />
      <rect x="20" y="36" width="8" height="2" rx="1" fill="var(--lg-on-gran)" opacity="0.3" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display text-2xl font-semibold tracking-tight text-ink ${className}`} style={{ fontVariationSettings: "'SOFT' 100, 'opsz' 72" }}>
      lagom<span className="text-sol">.</span>
    </span>
  )
}
