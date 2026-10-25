import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, friendlyError, formatTime, formatDateTime, pointsLabel, KIND_LABELS } from './api'
import { BrandLockup, Stamps } from './shared'
import { Scanner } from './Scanner'
import { BrandingCard } from './Branding'
import { useTenant } from './tenant'

const IDLE_RESET_MS = 90_000

const tokenKey = (slug) => `kerdiseto-admin-token:${slug}`

function readToken(slug) {
  try { return localStorage.getItem(tokenKey(slug)) || '' } catch { return '' }
}

function saveToken(slug, token) {
  try {
    if (token) localStorage.setItem(tokenKey(slug), token)
    else localStorage.removeItem(tokenKey(slug))
  } catch { /* ignore */ }
}

export default function AdminApp() {
  const tenant = useTenant()
  const slug = tenant.slug
  const adminHref = `/${slug}/admin`
  const [token, setToken] = useState(() => readToken(slug))
  const [session, setSession] = useState(null) // { staff, settings }
  const [tab, setTab] = useState('scan')
  const [loginError, setLoginError] = useState('')

  const signOut = useCallback((message = '') => {
    saveToken(slug, '')
    setToken('')
    setSession(null)
    setLoginError(message)
    setTab('scan')
  }, [])

  const call = useCallback(async (path, options = {}) => {
    try {
      return await api(path, { ...options, token })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) signOut(friendlyError(error))
      throw error
    }
  }, [token, signOut])

  const refreshSession = useCallback(async () => {
    try {
      setSession(await call('/api/loyalty/admin/me'))
    } catch {
      // handled by call()
    }
  }, [call])

  useEffect(() => {
    if (token) void refreshSession()
  }, [token, refreshSession])

  if (!token) return <AdminLogin error={loginError} onToken={(value) => { saveToken(slug, value); setLoginError(''); setToken(value) }} />
  if (!session) return <main className="app-shell admin-shell"><div className="loading-screen"><BrandLockup href={adminHref} /></div></main>

  const isOwner = session.staff.role === 'owner'
  const tabs = [['scan', 'Σάρωση'], ['activity', 'Κινήσεις'], ...(isOwner ? [['members', 'Μέλη'], ['settings', 'Ρυθμίσεις']] : [])]

  return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <BrandLockup compact href={adminHref} />
        <div className="header-actions">
          <span className="staff-badge">{session.staff.name}</span>
          <button type="button" className="admin-toggle" onClick={() => signOut()}>Αποσύνδεση</button>
        </div>
      </header>

      <nav className="admin-tabs loyalty-tabs" role="tablist" aria-label="Ενότητες" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>
        ))}
      </nav>

      {tab === 'scan' ? <ScanTab call={call} settings={session.settings} /> : null}
      {tab === 'activity' ? <ActivityTab call={call} /> : null}
      {tab === 'members' && isOwner ? <MembersTab call={call} settings={session.settings} /> : null}
      {tab === 'settings' && isOwner ? <SettingsTab call={call} onSettings={(settings) => setSession((current) => ({ ...current, settings }))} /> : null}
    </main>
  )
}

// ---------- Login ----------

function AdminLogin({ error, onToken }) {
  const tenant = useTenant()
  const [mode, setMode] = useState('pin')
  const [pin, setPin] = useState('')
  const [key, setKey] = useState('')
  const [localError, setLocalError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setLocalError('')
    setBusy(true)
    try {
      const data = mode === 'pin'
        ? await api('/api/loyalty/staff/login', { method: 'POST', body: { pin } })
        : await api('/api/loyalty/owner/login', { method: 'POST', body: { key } })
      onToken(data.token)
    } catch (loginError) {
      setLocalError(loginError instanceof ApiError && loginError.status === 401
        ? (mode === 'pin' ? 'Λάθος PIN.' : 'Λάθος κωδικός. Έλεγξε κεφαλαία, μικρά και κενά.')
        : friendlyError(loginError))
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell admin-shell">
      <section className="welcome-screen">
        <BrandLockup href={`/${tenant.slug}/admin`} />
        <p className="welcome-kicker">{tenant.name} · Διαχείριση</p>
        <h1>Κάρτες επιβράβευσης</h1>
        <div className="admin-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'pin'} onClick={() => setMode('pin')}>Υπάλληλος (PIN)</button>
          <button type="button" role="tab" aria-selected={mode === 'owner'} onClick={() => setMode('owner')}>Ιδιοκτήτης</button>
        </div>
        <form onSubmit={submit} className="customer-form">
          {mode === 'pin' ? (
            <>
              <label htmlFor="staff-pin">Το PIN σου (6 ψηφία)</label>
              <input id="staff-pin" className="code-input" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} />
            </>
          ) : (
            <>
              <label htmlFor="admin-key">Κωδικός διαχείρισης</label>
              <input id="admin-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
            </>
          )}
          <button type="submit" className="primary-button" disabled={busy || (mode === 'pin' ? pin.length !== 6 : !key)}>{busy ? 'Σύνδεση…' : 'Σύνδεση'}</button>
        </form>
        {localError || error ? <p className="message error admin-login-error" role="alert">{localError || error}</p> : null}
        <p className="admin-install-hint">Για εικονίδιο στην αρχική οθόνη: Κοινοποίηση → «Προσθήκη στην αρχική οθόνη». Θα εμφανιστεί ως «{tenant.name} Διαχείριση».</p>
      </section>
    </main>
  )
}

// ---------- Scan ----------

function ScanTab({ call, settings }) {
  const [scan, setScan] = useState(null) // { member, ticket, source }
  const [points, setPoints] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastAction, setLastAction] = useState(null) // { kind, text, transactionId, undone }
  const [cooldown, setCooldown] = useState(null) // { secondsAgo }
  const [confirmRedeem, setConfirmRedeem] = useState(false)
  const [manual, setManual] = useState('')
  const idleRef = useRef(null)

  const reset = useCallback(() => {
    setScan(null)
    setPoints(1)
    setError('')
    setLastAction(null)
    setCooldown(null)
    setConfirmRedeem(false)
  }, [])

  // Clear the customer panel if nobody touches it for a while.
  useEffect(() => {
    if (!scan) return undefined
    clearTimeout(idleRef.current)
    idleRef.current = setTimeout(reset, IDLE_RESET_MS)
    return () => clearTimeout(idleRef.current)
  }, [scan, lastAction, reset])

  const lookup = useCallback(async (code) => {
    setError('')
    setBusy(true)
    try {
      const data = await call('/api/loyalty/admin/lookup', { method: 'POST', body: { code } })
      setScan(data)
      setPoints(1)
      setLastAction(null)
      setCooldown(null)
      setConfirmRedeem(false)
      setManual('')
    } catch (lookupError) {
      setError(friendlyError(lookupError))
    } finally {
      setBusy(false)
    }
  }, [call])

  async function earn(force = false) {
    setError('')
    setBusy(true)
    try {
      const data = await call('/api/loyalty/admin/earn', { method: 'POST', body: { ticket: scan.ticket, points, force } })
      setScan((current) => ({ ...current, member: data.member, earned: true }))
      setCooldown(null)
      setPoints(1)
      setLastAction({ kind: 'earn', text: `+${points} ${pointsLabel(points)} για ${data.member.name}`, transactionId: data.transactionId })
    } catch (earnError) {
      if (earnError instanceof ApiError && earnError.serverMessage === 'Recent earn') setCooldown({ secondsAgo: earnError.data.secondsAgo })
      else setError(friendlyError(earnError))
    } finally {
      setBusy(false)
    }
  }

  async function redeem() {
    if (!confirmRedeem) {
      setConfirmRedeem(true)
      return
    }
    setError('')
    setBusy(true)
    try {
      const data = await call('/api/loyalty/admin/redeem', { method: 'POST', body: { ticket: scan.ticket } })
      setScan((current) => ({ ...current, member: data.member }))
      setLastAction({ kind: 'redeem', text: `🎁 ${settings.reward_name} για ${data.member.name}`, transactionId: data.transactionId })
      setConfirmRedeem(false)
    } catch (redeemError) {
      setError(friendlyError(redeemError))
    } finally {
      setBusy(false)
    }
  }

  async function undo() {
    setError('')
    setBusy(true)
    try {
      const data = await call('/api/loyalty/admin/undo', { method: 'POST', body: { transactionId: lastAction.transactionId } })
      setScan((current) => ({ ...current, member: data.member }))
      setLastAction((current) => ({ ...current, undone: true }))
    } catch (undoError) {
      setError(friendlyError(undoError))
    } finally {
      setBusy(false)
    }
  }

  const member = scan?.member
  const perReward = settings.points_per_reward

  return (
    <section className="scan-tab">
      <Scanner active={!scan && !busy} onCode={lookup} />

      {!scan ? (
        <form className="manual-entry" onSubmit={(event) => { event.preventDefault(); if (manual.trim()) void lookup(manual) }}>
          <label htmlFor="manual-code">Ή γράψε τον αριθμό κάρτας</label>
          <div className="manual-row">
            <input id="manual-code" type="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck="false" placeholder="π.χ. K7Q4-9MZ2" value={manual} onChange={(event) => setManual(event.target.value.toUpperCase())} maxLength={12} />
            <button type="submit" className="primary-button" disabled={busy || manual.replace(/[^A-Z0-9]/gi, '').length !== 8}>Εύρεση</button>
          </div>
        </form>
      ) : null}

      {error ? <p className="message error inline scan-error" role="alert">{error}</p> : null}

      {member ? (
        <article className={member.rewardsAvailable > 0 ? 'member-panel has-reward' : 'member-panel'} aria-live="polite">
          <div className="member-head">
            <div>
              <h2>{member.name}</h2>
              <small>{member.cardNumber} · {scan.source === 'wallet' ? 'Wallet' : scan.source === 'manual' ? 'Αριθμός κάρτας' : 'Εφαρμογή'}</small>
            </div>
            <button type="button" className="text-button" onClick={reset}>Κλείσιμο ✕</button>
          </div>

          <div className="member-progress">
            <strong>{member.progress}<span>/{perReward}</span></strong>
            <Stamps filled={member.progress} total={perReward} />
          </div>

          {member.rewardsAvailable > 0 ? (
            <div className="reward-callout">
              <p><strong>Δικαιούται {member.rewardsAvailable === 1 ? '' : `${member.rewardsAvailable} × `}{settings.reward_name.toLowerCase()}!</strong></p>
              <button type="button" className={confirmRedeem ? 'primary-button reward-button confirm' : 'primary-button reward-button'} onClick={redeem} disabled={busy}>
                {confirmRedeem ? 'Επιβεβαίωση: δόθηκε το δώρο' : `🎁 Εξαργύρωση (−${perReward})`}
              </button>
              {confirmRedeem ? <button type="button" className="text-button" onClick={() => setConfirmRedeem(false)}>Άκυρο</button> : null}
            </div>
          ) : null}

          {lastAction ? (
            <div className={lastAction.undone ? 'last-action undone' : 'last-action'} role="status">
              <span>{lastAction.undone ? `Αναιρέθηκε: ${lastAction.text}` : `✓ ${lastAction.text}`}</span>
              {!lastAction.undone ? <button type="button" className="text-button" onClick={undo} disabled={busy}>Αναίρεση</button> : null}
            </div>
          ) : null}

          {cooldown ? (
            <div className="cooldown-callout" role="alert">
              <p>Πήρε πόντο πριν από {cooldown.secondsAgo}″. Να προστεθεί κι άλλος;</p>
              <div className="action-row">
                <button type="button" className="secondary" onClick={() => setCooldown(null)}>Όχι</button>
                <button type="button" className="primary-button" onClick={() => earn(true)} disabled={busy}>Ναι, πρόσθεσε</button>
              </div>
            </div>
          ) : scan.earned ? null : (
            <div className="earn-row">
              <div className="quantity-stepper">
                <button type="button" className="quantity-control" onClick={() => setPoints((value) => Math.max(1, value - 1))} disabled={points <= 1} aria-label="Λιγότεροι πόντοι">−</button>
                <output className="quantity-value" aria-live="polite">{points}</output>
                <button type="button" className="quantity-control" onClick={() => setPoints((value) => Math.min(settings.max_points_per_scan, value + 1))} disabled={points >= settings.max_points_per_scan} aria-label="Περισσότεροι πόντοι">+</button>
              </div>
              <button type="button" className="primary-button earn-button" onClick={() => earn(false)} disabled={busy}>+{points} {pointsLabel(points)}</button>
            </div>
          )}

          <button type="button" className={scan.earned ? 'primary-button next-button' : 'ghost-button next-button'} onClick={reset}>Επόμενος πελάτης</button>
        </article>
      ) : null}
    </section>
  )
}

// ---------- Activity ----------

function ActivityTab({ call }) {
  const [items, setItems] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setItems((await call('/api/loyalty/admin/activity')).activity)
    } catch (loadError) {
      setError(friendlyError(loadError))
    }
  }, [call])

  useEffect(() => {
    void load()
    const interval = setInterval(load, 10_000)
    return () => clearInterval(interval)
  }, [load])

  async function undo(id) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setError('')
    try {
      await call('/api/loyalty/admin/undo', { method: 'POST', body: { transactionId: id } })
      setConfirmId(null)
      await load()
    } catch (undoError) {
      setError(friendlyError(undoError))
    }
  }

  return (
    <section className="activity-tab">
      <div className="section-heading"><div><p className="section-kicker">Τελευταίες 24 ώρες</p><h2>Κινήσεις</h2></div></div>
      {error ? <p className="message error inline" role="alert">{error}</p> : null}
      {items === null ? <p className="muted">Φόρτωση…</p> : items.length === 0 ? <p className="muted empty-copy">Καμία κίνηση ακόμα.</p> : (
        <ul className="activity-list">
          {items.map((item) => (
            <li key={item.id} className={`activity-item kind-${item.kind}${item.reversed ? ' is-reversed' : ''}`}>
              <div>
                <strong>{item.memberName}</strong>
                <small>{formatTime(item.createdAt)} · {item.staffName}{item.note ? ` · ${item.note}` : ''}</small>
              </div>
              <span className="activity-delta">{item.kind === 'redeem' ? '🎁' : `${item.delta > 0 ? '+' : ''}${item.delta}`}<em>{KIND_LABELS[item.kind]}</em></span>
              {item.canUndo ? <button type="button" className={confirmId === item.id ? 'danger small-button' : 'secondary small-button'} onClick={() => undo(item.id)}>{confirmId === item.id ? 'Σίγουρα;' : 'Αναίρεση'}</button> : item.reversed ? <small className="reversed-label">αναιρέθηκε</small> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- Members (owner) ----------

function MembersTab({ call, settings }) {
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState(null)
  const [selected, setSelected] = useState(null)
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const search = useCallback(async (value) => {
    try {
      setMembers((await call(`/api/loyalty/admin/members?q=${encodeURIComponent(value)}`)).members)
    } catch (searchError) {
      setError(friendlyError(searchError))
    }
  }, [call])

  useEffect(() => {
    const timeout = setTimeout(() => search(query), 250)
    return () => clearTimeout(timeout)
  }, [query, search])

  async function adjust(event) {
    event.preventDefault()
    setError('')
    setInfo('')
    try {
      const data = await call('/api/loyalty/admin/adjust', { method: 'POST', body: { memberId: selected.id, delta: Number(delta), note } })
      setSelected({ ...selected, ...data.member })
      setInfo(`Έγινε. ${data.member.name}: ${data.member.points} ${pointsLabel(data.member.points)}.`)
      setDelta('')
      setNote('')
      void search(query)
    } catch (adjustError) {
      setError(friendlyError(adjustError))
    }
  }

  return (
    <section className="members-tab">
      <div className="section-heading"><div><p className="section-kicker">Ιδιοκτήτης</p><h2>Μέλη</h2></div></div>
      <input className="search-input" type="search" placeholder="Όνομα, email ή αριθμός κάρτας" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Αναζήτηση μελών" />
      {error ? <p className="message error inline" role="alert">{error}</p> : null}
      {info ? <p className="message info inline" role="status">{info}</p> : null}

      {selected ? (
        <article className="member-panel">
          <div className="member-head">
            <div><h2>{selected.name}</h2><small>{selected.cardNumber} · {selected.email}</small></div>
            <button type="button" className="text-button" onClick={() => { setSelected(null); setInfo('') }}>Κλείσιμο ✕</button>
          </div>
          <div className="member-progress">
            <strong>{selected.progress}<span>/{settings.points_per_reward}</span></strong>
            <Stamps filled={selected.progress} total={settings.points_per_reward} />
          </div>
          <p className="muted small">Σύνολο {selected.lifetimePoints} {pointsLabel(selected.lifetimePoints)} · {selected.rewardsRedeemed} δώρα · μέλος από {formatDateTime(selected.createdAt)}</p>
          <form className="adjust-form" onSubmit={adjust}>
            <label htmlFor="adjust-delta">Διόρθωση πόντων (π.χ. 2 ή -1)</label>
            <div className="manual-row">
              <input id="adjust-delta" type="number" inputMode="numeric" value={delta} onChange={(event) => setDelta(event.target.value)} />
              <button type="submit" className="primary-button" disabled={!Number(delta)}>Καταχώριση</button>
            </div>
            <input type="text" placeholder="Αιτία (προαιρετικό)" value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} aria-label="Αιτία διόρθωσης" />
          </form>
        </article>
      ) : null}

      {members === null ? <p className="muted">Φόρτωση…</p> : members.length === 0 ? <p className="muted empty-copy">Κανένα μέλος.</p> : (
        <ul className="member-list">
          {members.map((member) => (
            <li key={member.id}>
              <button type="button" onClick={() => { setSelected(member); setInfo(''); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                <span><strong>{member.name}</strong><small>{member.cardNumber}{member.marketingOptIn ? ' · ✉︎' : ''}</small></span>
                <span className="member-points">{member.progress}/{settings.points_per_reward}{member.rewardsAvailable ? ' 🎁' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- Settings (owner) ----------

function SettingsTab({ call, onSettings }) {
  const [stats, setStats] = useState(null)
  const [form, setForm] = useState(null)
  const [staff, setStaff] = useState([])
  const [newStaff, setNewStaff] = useState({ name: '', pin: '' })
  const [pinEdit, setPinEdit] = useState({ id: null, pin: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [statsData, settingsData, staffData] = await Promise.all([
        call('/api/loyalty/admin/stats'),
        call('/api/loyalty/admin/settings'),
        call('/api/loyalty/admin/staff'),
      ])
      setStats(statsData)
      setForm(settingsData.settings)
      setStaff(staffData.staff)
    } catch (loadError) {
      setError(friendlyError(loadError))
    }
  }, [call])

  useEffect(() => { void load() }, [load])

  async function run(action, success) {
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(success)
    } catch (actionError) {
      setError(friendlyError(actionError))
    }
  }

  const saveSettings = (event) => {
    event.preventDefault()
    return run(async () => {
      const data = await call('/api/loyalty/admin/settings', {
        method: 'PUT',
        body: {
          points_per_reward: Number(form.points_per_reward),
          max_points_per_scan: Number(form.max_points_per_scan),
          scan_cooldown_seconds: Number(form.scan_cooldown_seconds),
          reward_name: form.reward_name,
        },
      })
      setForm(data.settings)
      onSettings(data.settings)
    }, 'Οι ρυθμίσεις αποθηκεύτηκαν.')
  }

  const addStaff = (event) => {
    event.preventDefault()
    return run(async () => {
      await call('/api/loyalty/admin/staff', { method: 'POST', body: newStaff })
      setNewStaff({ name: '', pin: '' })
      await load()
    }, 'Ο υπάλληλος προστέθηκε.')
  }

  const toggleStaff = (member) => run(async () => {
    await call(`/api/loyalty/admin/staff/${member.id}`, { method: 'PATCH', body: { active: !member.active } })
    await load()
  }, member.active ? `${member.name}: απενεργοποιήθηκε.` : `${member.name}: ενεργοποιήθηκε.`)

  const changePin = (event) => {
    event.preventDefault()
    return run(async () => {
      await call(`/api/loyalty/admin/staff/${pinEdit.id}`, { method: 'PATCH', body: { pin: pinEdit.pin } })
      setPinEdit({ id: null, pin: '' })
    }, 'Το PIN άλλαξε.')
  }

  if (!form) return <section className="settings-tab"><p className="muted">Φόρτωση…</p>{error ? <p className="message error inline">{error}</p> : null}</section>

  return (
    <section className="settings-tab">
      {stats ? (
        <div className="stats-grid">
          <div><strong>{stats.members}</strong><small>μέλη</small></div>
          <div><strong>{stats.newMembersWeek}</strong><small>νέα (7 ημ.)</small></div>
          <div><strong>{stats.pointsToday}</strong><small>πόντοι σήμερα</small></div>
          <div><strong>{stats.activeMembersWeek}</strong><small>ενεργά (7 ημ.)</small></div>
          <div><strong>{stats.rewardsMonth}</strong><small>δώρα (30 ημ.)</small></div>
          <div><strong>{stats.marketingOptIns}</strong><small>δέχονται email</small></div>
        </div>
      ) : null}

      {message ? <p className="message info inline" role="status">{message}</p> : null}
      {error ? <p className="message error inline" role="alert">{error}</p> : null}

      <BrandingCard call={call} />

      <form className="settings-card" onSubmit={saveSettings}>
        <h3>Πρόγραμμα</h3>
        <label>Πόντοι για δώρο<input type="number" min="2" max="50" value={form.points_per_reward} onChange={(event) => setForm({ ...form, points_per_reward: event.target.value })} /></label>
        <label>Το δώρο<input type="text" maxLength={40} value={form.reward_name} onChange={(event) => setForm({ ...form, reward_name: event.target.value })} /></label>
        <label>Μέγιστοι πόντοι ανά σάρωση<input type="number" min="1" max="20" value={form.max_points_per_scan} onChange={(event) => setForm({ ...form, max_points_per_scan: event.target.value })} /></label>
        <label>Προστασία διπλής σάρωσης (δευτ.)<input type="number" min="0" max="3600" value={form.scan_cooldown_seconds} onChange={(event) => setForm({ ...form, scan_cooldown_seconds: event.target.value })} /></label>
        <button type="submit" className="primary-button">Αποθήκευση</button>
      </form>

      <div className="settings-card">
        <h3>Υπάλληλοι</h3>
        <ul className="staff-list">
          {staff.map((member) => (
            <li key={member.id} className={member.active ? '' : 'is-inactive'}>
              <span>{member.name}{member.active ? '' : ' (ανενεργός)'}</span>
              <div className="admin-actions">
                <button type="button" className="secondary small-button" onClick={() => setPinEdit({ id: member.id, pin: '' })}>Νέο PIN</button>
                <button type="button" className={member.active ? 'danger small-button' : 'secondary small-button'} onClick={() => toggleStaff(member)}>{member.active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}</button>
              </div>
              {pinEdit.id === member.id ? (
                <form className="manual-row pin-row" onSubmit={changePin}>
                  <input type="text" inputMode="numeric" maxLength={6} placeholder="6 ψηφία" value={pinEdit.pin} onChange={(event) => setPinEdit({ ...pinEdit, pin: event.target.value.replace(/\D/g, '') })} aria-label={`Νέο PIN για ${member.name}`} />
                  <button type="submit" className="primary-button" disabled={pinEdit.pin.length !== 6}>OK</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        <form className="add-staff" onSubmit={addStaff}>
          <input type="text" placeholder="Όνομα" maxLength={40} value={newStaff.name} onChange={(event) => setNewStaff({ ...newStaff, name: event.target.value })} aria-label="Όνομα υπαλλήλου" />
          <input type="text" inputMode="numeric" placeholder="PIN (6 ψηφία)" maxLength={6} value={newStaff.pin} onChange={(event) => setNewStaff({ ...newStaff, pin: event.target.value.replace(/\D/g, '') })} aria-label="PIN υπαλλήλου" />
          <button type="submit" className="primary-button" disabled={!newStaff.name.trim() || newStaff.pin.length !== 6}>Προσθήκη</button>
        </form>
      </div>
    </section>
  )
}
