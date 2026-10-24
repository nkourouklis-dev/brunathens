import { useMemo } from 'react'
import { qrToSvg } from './qr'

export const LOGO_URL = '/brun-logo.jpg'

export function BrandLockup({ compact = false, href = '/' }) {
  return (
    <a href={href} className={compact ? 'brand-lockup compact' : 'brand-lockup'} aria-label="BRUN αρχική">
      <img src={LOGO_URL} alt="BRUN" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling.style.display = 'inline' }} />
      <span>BRUN</span>
    </a>
  )
}

export function QrCode({ value, label }) {
  const svg = useMemo(() => (value ? qrToSvg(value, { border: 2, ecl: 'M' }) : null), [value])
  if (!svg) return <div className="qr-placeholder" aria-hidden="true" />
  return (
    <svg className="qr-svg" viewBox={svg.viewBox} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={svg.path} fill="#111" />
    </svg>
  )
}

// Row of stamps: filled for points collected towards the next reward.
export function Stamps({ filled, total, highlightLast = false }) {
  return (
    <ol className="stamps" aria-label={`${filled} από ${total} πόντους`}>
      {Array.from({ length: total }, (_, index) => {
        const isFilled = index < filled
        const isNew = highlightLast && index === filled - 1
        return (
          <li key={index} className={`${isFilled ? 'stamp filled' : 'stamp'}${isNew ? ' is-new' : ''}`} aria-hidden="true">
            {isFilled ? <CupIcon /> : null}
          </li>
        )
      })}
    </ol>
  )
}

export function CupIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" fill="currentColor" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5c0 1 1 1.3 1 2.5M11.5 3.5c0 1 1 1.3 1 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
