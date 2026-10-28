import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, friendlyError } from '../api.js'
import { BusinessMark, Icon } from '../icons.jsx'
import { Button, EmptyState, Field, Link, Notice, PageError, Screen, Spinner, brandStyle, usePageMeta } from '../ui.jsx'
import { RoleBadge } from './shared.jsx'
import Scan from './Scan.jsx'
import Members from './Members.jsx'
import Stats from './Stats.jsx'
import People from './People.jsx'
import Settings from './Settings.jsx'

const TABS = [
  { id: 'scan', label: 'Σάρωση', icon: 'scan', role: 'staff' },
  { id: 'members', label: 'Πελάτες', icon: 'users', role: 'manager' },
  { id: 'stats', label: 'Στατιστικά', icon: 'chart', role: 'manager' },
  { id: 'team', label: 'Ομάδα', icon: 'link', role: 'manager' },
  { id: 'settings', label: 'Ρυθμίσεις', icon: 'settings', role: 'owner' },
]
const RANK = { staff: 1, manager: 2, owner: 3 }

function Login({ business, onLoggedIn }) {
  const [mode, setMode] = useState('pin')
  const [pin, setPin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api(`b/${business.slug}/team/login`, { method: 'POST', body: mode === 'pin' ? { pin } : { email, password } })
      onLoggedIn()
    } catch (err) {
      setError(friendlyError(err))
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className="center team-login" >
      <div className="login-card" style={brandStyle(business)}>
        <BusinessMark business={business} size={64} />
        <h1>{business.name}</h1>
        <p className="muted">Είσοδος προσωπικού</p>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'pin'} className={mode === 'pin' ? 'is-selected' : ''} onClick={() => { setMode('pin'); setError('') }}>Ταμείο (PIN)</button>
          <button type="button" role="tab" aria-selected={mode === 'email'} className={mode === 'email' ? 'is-selected' : ''} onClick={() => { setMode('email'); setError('') }}>Διαχείριση</button>
        </div>
        <form className="form" onSubmit={submit}>
          {mode === 'pin' ? (
            <Field label="Το PIN σου (6 ψηφία)">
              <input value={pin} type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="code-input" autoFocus onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} required />
            </Field>
          ) : (
            <>
              <Field label="Email"><input type="email" autoComplete="username" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
              <Field label="Κωδικός"><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
            </>
          )}
          <Notice kind="error">{error}</Notice>
          <Button type="submit" busy={busy} onClick={undefined}>Είσοδος</Button>
        </form>
        <p className="muted small center-text">Δεν έχεις πρόσβαση; Ζήτησε από τον ιδιοκτήτη ένα link πρόσκλησης.</p>
        <Link to={`/b/${business.slug}`} className="link-button">Η κάρτα πελάτη</Link>
      </div>
    </Screen>
  )
}

function tabFromHash(allowed) {
  const id = window.location.hash.replace('#', '')
  return allowed.find((tab) => tab.id === id)?.id || allowed[0]?.id
}

function Shell({ me, onMe, onLogout }) {
  const allowed = TABS.filter((tab) => RANK[me.identity.role] >= RANK[tab.role])
  const [tab, setTab] = useState(() => tabFromHash(allowed))

  useEffect(() => {
    const onHash = () => setTab(tabFromHash(allowed))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [allowed.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback((id) => { window.location.hash = id }, [])
  const { business, identity } = me

  return (
    <div className="team-shell" style={brandStyle(business)}>
      <header className="team-header">
        <BusinessMark business={business} size={36} />
        <div className="team-title"><strong>{business.name}</strong><small>{identity.name}</small></div>
        <RoleBadge role={identity.role} />
        <button type="button" className="icon-button" onClick={onLogout} aria-label="Αποσύνδεση" title="Αποσύνδεση"><Icon name="logout" size={20} /></button>
      </header>
      {business.status && business.status !== 'active' ? <Notice kind="error">Η επιχείρηση είναι σε αναστολή.</Notice> : null}
      <main className="team-main">
        {tab === 'scan' ? <Scan me={me} onOpenTab={open} /> : null}
        {tab === 'members' ? <Members me={me} /> : null}
        {tab === 'stats' ? <Stats me={me} /> : null}
        {tab === 'team' ? <People me={me} /> : null}
        {tab === 'settings' ? <Settings me={me} onMe={onMe} /> : null}
      </main>
      <nav className="bottom-nav" aria-label="Κύριο μενού">
        {allowed.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => open(item.id)}>
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function TeamApp({ slug }) {
  const [state, setState] = useState('loading') // loading | login | app | missing | error
  const [business, setBusiness] = useState(null)
  const [me, setMe] = useState(null)

  const load = useCallback(async () => {
    try {
      const { business: info } = await api(`b/${slug}`)
      setBusiness(info)
      try {
        setMe(await api(`b/${slug}/team/me`))
        setState('app')
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setState('login')
        else throw error
      }
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? 'missing' : 'error')
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  usePageMeta({
    title: business ? `${business.name} · Προσωπικό` : 'Προσωπικό',
    color: business?.color,
    manifest: `/api/b/${slug}/team-manifest`,
    icon: `/api/b/${slug}/icon.png?size=192&v=${business?.logoVersion ?? 0}`,
  })

  const logout = async () => {
    await api(`b/${slug}/team/logout`, { method: 'POST', body: {} }).catch(() => {})
    setMe(null)
    setState('login')
  }

  if (state === 'loading') return <Screen className="center"><Spinner /></Screen>
  if (state === 'missing') return <PageError title="Δεν βρέθηκε η επιχείρηση">Έλεγξε το link.</PageError>
  if (state === 'error') return <Screen className="center"><EmptyState icon="close" title="Δεν φόρτωσε"><Button onClick={() => { setState('loading'); load() }}>Δοκίμασε ξανά</Button></EmptyState></Screen>
  if (state === 'login') return <Login business={business} onLoggedIn={() => { setState('loading'); load() }} />
  return <Shell me={me} onMe={setMe} onLogout={logout} />
}
