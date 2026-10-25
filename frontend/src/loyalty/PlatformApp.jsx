import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, friendlyError } from './api'
import { ICON_CHOICES } from './icons'

const TOKEN_KEY = 'kerasma-platform-token'

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignore */ }
}

export function Landing() {
  return (
    <main className="app-shell">
      <section className="welcome-screen">
        <p className="welcome-kicker">Kerasma</p>
        <h1>Κάρτα επιβράβευσης για κάθε μαγαζί.</h1>
        <p className="muted">Καφέ, πλυντήριο αυτοκινήτων, κομμωτήριο ή φούρνος: η επιχείρηση ορίζει το δώρο και οι πελάτες μαζεύουν πόντους με ένα QR, χωρίς χαρτάκια.</p>
        <p className="muted small">Έχεις κάρτα; Άνοιξε τον σύνδεσμο που σου έδωσε το κατάστημα.</p>
      </section>
    </main>
  )
}

// Operator console: create businesses, hand out owner keys, switch businesses off.
export function PlatformApp() {
  const [token, setToken] = useState(readToken)
  const [tenants, setTenants] = useState(null)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [issued, setIssued] = useState(null) // { name, slug, ownerKey }
  const [form, setForm] = useState({ slug: '', name: '', icon: 'star' })

  const signOut = useCallback((message = '') => {
    saveToken('')
    setToken('')
    setTenants(null)
    setError(message)
  }, [])

  const call = useCallback(async (path, options = {}) => {
    try {
      return await api(path, { ...options, token })
    } catch (callError) {
      if (callError instanceof ApiError && callError.status === 401 && token) signOut(friendlyError(callError))
      throw callError
    }
  }, [token, signOut])

  const load = useCallback(async () => {
    try {
      setTenants((await call('/api/platform/tenants')).tenants)
    } catch (loadError) {
      setError(friendlyError(loadError))
    }
  }, [call])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  async function login(event) {
    event.preventDefault()
    setError('')
    try {
      const data = await api('/api/platform/login', { method: 'POST', body: { key } })
      saveToken(data.token)
      setToken(data.token)
      setKey('')
    } catch (loginError) {
      setError(friendlyError(loginError))
    }
  }

  async function create(event) {
    event.preventDefault()
    setError('')
    setInfo('')
    try {
      const data = await call('/api/platform/tenants', { method: 'POST', body: { ...form, slug: form.slug.trim().toLowerCase() } })
      setIssued({ name: data.tenant.name, slug: data.tenant.slug, ownerKey: data.ownerKey })
      setForm({ slug: '', name: '', icon: 'star' })
      await load()
    } catch (createError) {
      setError(friendlyError(createError))
    }
  }

  async function toggle(tenant) {
    setError('')
    try {
      await call(`/api/platform/tenants/${tenant.id}`, { method: 'PATCH', body: { active: !tenant.active } })
      await load()
    } catch (toggleError) {
      setError(friendlyError(toggleError))
    }
  }

  async function resetKey(tenant) {
    setError('')
    try {
      const data = await call(`/api/platform/tenants/${tenant.id}`, { method: 'PATCH', body: { resetOwnerKey: true } })
      setIssued({ name: tenant.name, slug: tenant.slug, ownerKey: data.ownerKey })
    } catch (resetError) {
      setError(friendlyError(resetError))
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      setInfo('Αντιγράφηκε.')
    } catch {
      setInfo('Επίλεξε το κείμενο και αντίγραψέ το.')
    }
  }

  if (!token) {
    return (
      <main className="app-shell admin-shell">
        <section className="welcome-screen">
          <p className="welcome-kicker">Kerasma · Πλατφόρμα</p>
          <h1>Διαχείριση επιχειρήσεων</h1>
          <form onSubmit={login} className="customer-form">
            <label htmlFor="platform-key">Κωδικός πλατφόρμας</label>
            <input id="platform-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
            <button type="submit" className="primary-button" disabled={!key}>Σύνδεση</button>
          </form>
          {error ? <p className="message error admin-login-error" role="alert">{error}</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <strong className="brand-lockup compact"><span>Kerasma</span></strong>
        <button type="button" className="admin-toggle" onClick={() => signOut()}>Αποσύνδεση</button>
      </header>

      {issued ? (
        <section className="settings-card issued-card" role="status">
          <h3>Κωδικός ιδιοκτήτη: {issued.name}</h3>
          <p className="muted small">Φαίνεται μόνο τώρα. Στείλε τον στον ιδιοκτήτη. Αν χαθεί, φτιάχνεις νέο.</p>
          <p className="owner-key">{issued.ownerKey}</p>
          <p className="muted small">Ταμείο: {window.location.origin}/{issued.slug}/admin</p>
          <div className="action-row">
            <button type="button" className="secondary" onClick={() => copy(`Ταμείο: ${window.location.origin}/${issued.slug}/admin\nΚωδικός ιδιοκτήτη: ${issued.ownerKey}\nΚάρτα πελατών: ${window.location.origin}/${issued.slug}`)}>Αντιγραφή μηνύματος</button>
            <button type="button" className="text-button" onClick={() => setIssued(null)}>Έγινε</button>
          </div>
        </section>
      ) : null}

      {error ? <p className="message error inline" role="alert">{error}</p> : null}
      {info ? <p className="message info inline" role="status">{info}</p> : null}

      <section className="settings-tab">
        <div className="section-heading"><div><p className="section-kicker">Πλατφόρμα</p><h2>Επιχειρήσεις</h2></div></div>
        {tenants === null ? <p className="muted">Φόρτωση…</p> : (
          <ul className="member-list tenant-list">
            {tenants.map((tenant) => (
              <li key={tenant.id} className={tenant.active ? '' : 'is-inactive'}>
                <div className="tenant-row">
                  <span><strong>{tenant.name}</strong><small>/{tenant.slug} · {tenant.members} μέλη{tenant.active ? '' : ' · ανενεργή'}</small></span>
                  <div className="admin-actions">
                    <a className="secondary small-button" href={`/${tenant.slug}/admin`}>Ταμείο</a>
                    <button type="button" className="secondary small-button" onClick={() => resetKey(tenant)}>Νέος κωδικός</button>
                    <button type="button" className={tenant.active ? 'danger small-button' : 'secondary small-button'} onClick={() => toggle(tenant)}>{tenant.active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className="settings-card" onSubmit={create}>
          <h3>Νέα επιχείρηση</h3>
          <label>Όνομα<input type="text" maxLength={40} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="π.χ. Πλυντήριο Νίκος" /></label>
          <label>Διεύθυνση (λατινικά)<input type="text" maxLength={40} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="π.χ. carwash-nikos" /></label>
          <label>Εικονίδιο<select value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })}>
            {ICON_CHOICES.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
          </select></label>
          <p className="muted small">Λογότυπο, χρώμα και δώρο τα ορίζει ο ιδιοκτήτης μετά τη σύνδεσή του.</p>
          <button type="submit" className="primary-button" disabled={!form.name.trim() || form.slug.length < 3}>Δημιουργία</button>
        </form>
      </section>
    </main>
  )
}
