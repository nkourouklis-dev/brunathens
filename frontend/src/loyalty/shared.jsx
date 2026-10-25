import { useMemo, useState } from 'react'
import { qrToSvg } from './qr'
import { TenantIcon } from './icons'
import { useTenant } from './tenant'

export function BrandLockup({ compact = false, href }) {
  const tenant = useTenant()
  const [failed, setFailed] = useState(false)
  return (
    <a href={href || `/${tenant.slug}`} className={compact ? 'brand-lockup compact' : 'brand-lockup'} aria-label={`${tenant.name} αρχική`}>
      {tenant.logo && !failed ? <img src={tenant.logo} alt={tenant.name} onError={() => setFailed(true)} /> : <span>{tenant.name}</span>}
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
  const tenant = useTenant()
  return (
    <ol className="stamps" aria-label={`${filled} από ${total} πόντους`}>
      {Array.from({ length: total }, (_, index) => {
        const isFilled = index < filled
        const isNew = highlightLast && index === filled - 1
        return (
          <li key={index} className={`${isFilled ? 'stamp filled' : 'stamp'}${isNew ? ' is-new' : ''}`} aria-hidden="true">
            {isFilled ? <TenantIcon name={tenant.icon} /> : null}
          </li>
        )
      })}
    </ol>
  )
}
