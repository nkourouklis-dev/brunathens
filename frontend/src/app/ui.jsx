import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { qrToSvg } from './qr'
import { Icon } from './icons.jsx'
import { copyText } from './api.js'

// ---------- μικρός router ----------

export function navigate(path, { replace = false } = {}) {
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
  window.dispatchEvent(new Event('app:navigate'))
  window.scrollTo(0, 0)
}

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const update = () => setPath(window.location.pathname)
    window.addEventListener('popstate', update)
    window.addEventListener('app:navigate', update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener('app:navigate', update)
    }
  }, [])
  return path
}

export function Link({ to, children, className, ...rest }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

// ---------- τίτλος, χρώμα γραμμής, manifest ----------

function setHeadLink(rel, attrs) {
  let element = document.head.querySelector(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    document.head.appendChild(element)
  }
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value)
}

export function usePageMeta({ title, color, manifest, icon }) {
  useEffect(() => {
    if (title) document.title = title
    const meta = document.head.querySelector('meta[name="theme-color"]')
    if (meta && color) meta.setAttribute('content', color)
    if (manifest) setHeadLink('manifest', { href: manifest })
    if (icon) setHeadLink('apple-touch-icon', { href: icon })
  }, [title, color, manifest, icon])
}

// Βάζει τα χρώματα της επιχείρησης ως CSS variables σε όλη την εφαρμογή.
export function brandStyle(business) {
  return { '--brand': business.color, '--brand-text': business.textColor }
}

// ---------- μικρά components ----------

export function QrCode({ value, label, size }) {
  const svg = useMemo(() => (value ? qrToSvg(value, { border: 2, ecl: 'M' }) : null), [value])
  if (!svg) return <div className="qr-placeholder" style={size ? { width: size, height: size } : undefined} aria-hidden="true" />
  return (
    <svg className="qr-svg" viewBox={svg.viewBox} role="img" aria-label={label} shapeRendering="crispEdges" style={size ? { width: size, height: size } : undefined}>
      <rect width="100%" height="100%" fill="#fff" />
      <path d={svg.path} fill="#111" />
    </svg>
  )
}

export function Spinner({ label = 'Φόρτωση…' }) {
  return <div className="spinner-wrap" role="status"><span className="spinner" /><span className="sr-only">{label}</span></div>
}

export function Screen({ children, className = '', style }) {
  return <main className={`screen ${className}`} style={style}>{children}</main>
}

export function Notice({ kind = 'info', children }) {
  if (!children) return null
  return <p className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Button({ variant = 'primary', busy = false, icon, children, className = '', ...rest }) {
  return (
    <button type="button" className={`btn btn-${variant} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy ? <span className="spinner small" /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  )
}

export function Sheet({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
    }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Κλείσιμο"><Icon name="close" size={20} /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmSheet({ title, message, confirmLabel = 'Συνέχεια', danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="row-actions">
        <Button variant="ghost" onClick={onClose}>Άκυρο</Button>
        <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{confirmLabel}</Button>
      </div>
    </Sheet>
  )
}

// Ειδοποίηση που εξαφανίζεται μόνη της.
export function useToast() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const show = useCallback((message, kind = 'ok') => {
    clearTimeout(timer.current)
    setToast({ message, kind })
    timer.current = setTimeout(() => setToast(null), 3200)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  const node = toast ? <div className={`toast toast-${toast.kind}`} role="status">{toast.message}</div> : null
  return [show, node]
}

export function CopyField({ value, label = 'Αντιγραφή', onCopied }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="copy-field">
      <input readOnly value={value} onFocus={(event) => event.target.select()} aria-label="Link" />
      <Button variant="secondary" icon={copied ? 'check' : 'copy'} onClick={async () => {
        if (await copyText(value)) {
          setCopied(true)
          onCopied?.()
          setTimeout(() => setCopied(false), 1800)
        }
      }}>{copied ? 'Αντιγράφηκε' : label}</Button>
    </div>
  )
}

export function EmptyState({ icon = 'star', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={34} />
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  )
}

export function PageError({ title = 'Δεν βρέθηκε', children }) {
  return (
    <Screen className="center">
      <div className="empty">
        <Icon name="close" size={34} />
        <strong>{title}</strong>
        <p>{children}</p>
        <Link to="/" className="btn btn-secondary">Αρχική</Link>
      </div>
    </Screen>
  )
}
