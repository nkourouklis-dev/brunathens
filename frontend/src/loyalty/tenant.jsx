import { createContext, useContext, useEffect, useState } from 'react'
import { api, ApiError, setTenantSlug } from './api'

const TenantContext = createContext(null)

export function useTenant() {
  return useContext(TenantContext)
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Darken a colour until white text on it is readable.
function readable(hex) {
  let color = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#2b2b2b'
  for (let step = 0; step < 8 && luminance(color) > 0.2; step++) {
    color = `#${[1, 3, 5].map((index) => Math.round(parseInt(color.slice(index, index + 2), 16) * 0.85).toString(16).padStart(2, '0')).join('')}`
  }
  return color
}

function setHead(selector, create, attributes) {
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement(create)
    document.head.appendChild(element)
  }
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
}

// Loads one business and paints the page with its name, colour and logo before showing anything.
export function TenantGate({ slug, admin = false, children }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    setTenantSlug(slug)
    let cancelled = false
    api('/api/loyalty/config')
      .then((config) => { if (!cancelled) setState({ status: 'ready', config }) })
      .catch((error) => { if (!cancelled) setState({ status: error instanceof ApiError && error.status === 404 ? 'missing' : 'offline' }) })
    return () => { cancelled = true }
  }, [slug])

  const tenant = state.config?.tenant

  useEffect(() => {
    if (!tenant) return
    const card = readable(tenant.color)
    const root = document.documentElement.style
    root.setProperty('--t-card', card)
    root.setProperty('--t-card-2', `color-mix(in srgb, ${card} 78%, #ffffff)`)
    root.setProperty('--t-accent', card)
    root.setProperty('--t-accent-soft', `color-mix(in srgb, ${card} 12%, #ffffff)`)
    const title = admin ? `${tenant.name} · Ταμείο` : tenant.name
    document.title = title
    setHead('meta[name="theme-color"]', 'meta', { name: 'theme-color', content: '#ffffff' })
    setHead('meta[name="apple-mobile-web-app-title"]', 'meta', { name: 'apple-mobile-web-app-title', content: title })
    setHead('link[rel="manifest"]', 'link', { rel: 'manifest', href: `/api/loyalty/manifest?t=${slug}${admin ? '&admin=1' : ''}` })
    if (tenant.logo) setHead('link[rel="apple-touch-icon"]', 'link', { rel: 'apple-touch-icon', href: `/api/loyalty/logo?t=${slug}` })
  }, [tenant, slug, admin])

  if (state.status === 'loading') return <main className="app-shell"><div className="loading-screen"><span className="muted">…</span></div></main>
  if (state.status === 'missing') {
    return (
      <main className="app-shell">
        <section className="welcome-screen">
          <p className="welcome-kicker">Κερασμα</p>
          <h1>Δεν βρήκαμε αυτή την επιχείρηση.</h1>
          <p className="muted">Έλεγξε τη διεύθυνση ή ζήτα από το κατάστημα τον σωστό σύνδεσμο.</p>
        </section>
      </main>
    )
  }
  if (state.status === 'offline') {
    return (
      <main className="app-shell">
        <section className="welcome-screen">
          <h1>Δεν υπάρχει σύνδεση.</h1>
          <p className="muted">Έλεγξε το ίντερνετ και ανανέωσε τη σελίδα.</p>
        </section>
      </main>
    )
  }

  return <TenantContext.Provider value={tenant}>{children(state.config)}</TenantContext.Provider>
}
