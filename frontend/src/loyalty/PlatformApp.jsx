import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, friendlyError } from './api'
import { ICON_CHOICES, TenantIcon } from './icons'
import { SWATCHES, logoFromFile } from './Branding'

const EMPTY_FORM = {
  slug: '', name: '', tagline: '', icon: 'star', color: '#2b2b2b', logo: '',
  reward_name: '', points_per_reward: '10', max_points_per_scan: '5', scan_cooldown_seconds: '60',
  legalName: '', legalAddress: '', legalVat: '', contactEmail: '',
}

const TOKEN_KEY = 'kerdiseto-platform-token'

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
        <p className="welcome-kicker">Kerdiseto</p>
        <h1>Κάρτα επιβράβευσης για κάθε μαγαζί.</h1>
        <p className="muted">Πλυντήριο αυτοκινήτων, κομμωτήριο, φούρνος ή γυμναστήριο: η επιχείρηση ορίζει το δώρο και οι πελάτες μαζεύουν πόντους με ένα QR, χωρίς χαρτάκια.</p>
        <p className="muted small">Έχεις κάρτα; Άνοιξε τον σύνδεσμο που σου έδωσε το κατάστημα.</p>
        <p className="muted small"><a href="/platform">Είσοδος διαχειριστή</a></p>
      </section>
    </main>
  )
}

const number = new Intl.NumberFormat('el-GR')

function lastSeen(iso) {
  if (!iso) return 'καμία κίνηση'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'σήμερα'
  if (days === 1) return 'χθες'
  return `πριν ${days} ημέρες`
}

// items: [value, label, filterKey?]; tiles with a filterKey are buttons that toggle that filter.
function Stats({ items, filter, onFilter }) {
  return (
    <div className="stats-grid">
      {items.map(([value, label, key]) => key ? (
        <button key={label} type="button" className={filter === key ? 'stat-tile selected' : 'stat-tile'} aria-pressed={filter === key} onClick={() => onFilter(filter === key ? null : key)}>
          <strong>{number.format(value)}</strong><small>{label}</small>
        </button>
      ) : <div key={label}><strong>{number.format(value)}</strong><small>{label}</small></div>)}
    </div>
  )
}

const FILTERS = {
  active: { title: 'Ενεργές επιχειρήσεις', keep: (tenant) => tenant.active, value: (tenant) => `${tenant.members} μέλη` },
  inactive: { title: 'Ανενεργές επιχειρήσεις', keep: (tenant) => !tenant.active, value: (tenant) => `${tenant.members} μέλη` },
  members: { title: 'Μέλη ανά επιχείρηση', sort: (tenant) => tenant.members, value: (tenant) => `${number.format(tenant.members)} μέλη` },
  points: { title: 'Πόντοι (30 ημ.) ανά επιχείρηση', sort: (tenant) => tenant.pointsGiven30d, value: (tenant) => `${number.format(tenant.pointsGiven30d)} πόντοι` },
  rewards: { title: 'Δώρα (30 ημ.) ανά επιχείρηση', sort: (tenant) => tenant.rewards30d, value: (tenant) => `${number.format(tenant.rewards30d)} δώρα` },
}

// Operator console: create businesses, hand out owner keys, switch businesses off.
export function PlatformApp() {
  const [token, setToken] = useState(readToken)
  const [tenants, setTenants] = useState(null)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [issued, setIssued] = useState(null) // { name, slug, ownerKey }
  const [form, setForm] = useState(EMPTY_FORM)
  const fileRef = useRef(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null) // { id, confirm }

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
      setForm(EMPTY_FORM)
      setCreating(false)
      setSelectedId(data.tenant.id)
      await load()
    } catch (createError) {
      setError(friendlyError(createError))
    }
  }

  async function pickLogo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setForm((current) => ({ ...current, logo: '' }))
      const logo = await logoFromFile(file)
      setForm((current) => ({ ...current, logo }))
    } catch {
      setError('Δεν διαβάστηκε η εικόνα. Δοκίμασε PNG ή JPG.')
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

  async function remove(tenant) {
    setError('')
    try {
      await call(`/api/platform/tenants/${tenant.id}`, { method: 'DELETE', body: { confirm: deleting.confirm } })
      setDeleting(null)
      setSelectedId(null)
      setInfo(`Η επιχείρηση «${tenant.name}» διαγράφηκε.`)
      await load()
    } catch (removeError) {
      setError(friendlyError(removeError))
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

  const needle = query.trim().toLowerCase()
  const rule = filter ? FILTERS[filter] : null
  const listed = needle || rule
  const matches = !listed ? [] : (tenants ?? [])
    .filter((tenant) => (!needle || `${tenant.name} ${tenant.slug}`.toLowerCase().includes(needle)) && (!rule?.keep || rule.keep(tenant)))
    .sort((a, b) => (rule?.sort ? rule.sort(b) - rule.sort(a) : 0))
  const selected = tenants?.find((tenant) => tenant.id === selectedId) ?? null

  if (!token) {
    return (
      <main className="app-shell admin-shell">
        <section className="welcome-screen">
          <p className="welcome-kicker">Kerdiseto · Πλατφόρμα</p>
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
        <strong className="brand-lockup compact"><span>Kerdiseto</span></strong>
        <button type="button" className="admin-toggle" onClick={() => signOut()}>Αποσύνδεση</button>
      </header>

      {issued ? (
        <section className="settings-card issued-card" role="status">
          <h3>Κωδικός ιδιοκτήτη: {issued.name}</h3>
          <p className="muted small">Φαίνεται μόνο τώρα. Στείλε τον στον ιδιοκτήτη. Αν χαθεί, φτιάχνεις νέο.</p>
          <p className="owner-key">{issued.ownerKey}</p>
          <p className="muted small">Διαχείριση: {window.location.origin}/{issued.slug}/admin</p>
          <div className="action-row">
            <button type="button" className="secondary" onClick={() => copy(issued.ownerKey)}>Αντιγραφή κωδικού</button>
            <button type="button" className="secondary" onClick={() => copy(`Διαχείριση: ${window.location.origin}/${issued.slug}/admin\nΚωδικός ιδιοκτήτη: ${issued.ownerKey}\nΚάρτα πελατών: ${window.location.origin}/${issued.slug}`)}>Αντιγραφή μηνύματος</button>
            <button type="button" className="text-button" onClick={() => setIssued(null)}>Έγινε</button>
          </div>
        </section>
      ) : null}

      {error ? <p className="message error inline" role="alert">{error}</p> : null}
      {info ? <p className="message info inline" role="status">{info}</p> : null}

      <section className="settings-tab">
        <div className="section-heading"><div><p className="section-kicker">Πλατφόρμα</p><h2>Επιχειρήσεις</h2></div></div>
        {tenants === null ? <p className="muted">Φόρτωση…</p> : (
          <>
            <Stats items={[
              [tenants.filter((tenant) => tenant.active).length, 'ενεργές επιχειρήσεις', 'active'],
              ...(tenants.some((tenant) => !tenant.active) ? [[tenants.filter((tenant) => !tenant.active).length, 'ανενεργές', 'inactive']] : []),
              [tenants.reduce((sum, tenant) => sum + tenant.members, 0), 'μέλη', 'members'],
              [tenants.reduce((sum, tenant) => sum + tenant.pointsGiven30d, 0), 'πόντοι (30 ημ.)', 'points'],
              [tenants.reduce((sum, tenant) => sum + tenant.rewards30d, 0), 'δώρα (30 ημ.)', 'rewards'],
            ]} filter={filter} onFilter={setFilter} />

            <div className="platform-picker">
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση επιχείρησης…" aria-label="Αναζήτηση επιχείρησης" />
              <select value={selected?.id ?? ''} onChange={(event) => { setSelectedId(event.target.value ? Number(event.target.value) : null); setQuery(''); setFilter(null) }} aria-label="Επιλογή επιχείρησης">
                <option value="">Επιλογή επιχείρησης ({tenants.length})</option>
                {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}{tenant.active ? '' : ' (ανενεργή)'}</option>)}
              </select>
            </div>

            {listed ? (
              <>
              {rule ? <p className="section-kicker list-title">{rule.title}</p> : null}
              <ul className="member-list tenant-list">
                {matches.length ? matches.map((tenant) => (
                  <li key={tenant.id} className={tenant.active ? '' : 'is-inactive'}>
                    <button type="button" onClick={() => { setSelectedId(tenant.id); setQuery(''); setFilter(null) }}>
                      <span><strong>{tenant.name}</strong><small>/{tenant.slug}{tenant.active ? '' : ' · ανενεργή'}</small></span>
                      <span className="list-value">{(rule ?? FILTERS.active).value(tenant)}</span>
                    </button>
                  </li>
                )) : <li className="muted small">Καμία επιχείρηση δεν ταιριάζει.</li>}
              </ul>
              </>
            ) : selected ? (
              <article className={selected.active ? 'settings-card tenant-detail' : 'settings-card tenant-detail is-inactive'}>
                <div className="tenant-head">
                  <h3>{selected.name}</h3>
                  <small>/{selected.slug} · {selected.active ? 'ενεργή' : 'ανενεργή'} · τελευταία κίνηση: {lastSeen(selected.lastActivityAt)}</small>
                </div>
                <Stats items={[
                  [selected.members, 'μέλη'],
                  [selected.newMembers30d, 'νέα (30 ημ.)'],
                  [selected.activeMembers30d, 'ενεργά (30 ημ.)'],
                  [selected.pointsGiven30d, 'πόντοι (30 ημ.)'],
                  [selected.rewards30d, 'δώρα (30 ημ.)'],
                  [selected.pointsOutstanding, 'πόντοι σε κάρτες'],
                ]} />
                <div className="admin-actions">
                  <a className="secondary small-button" href={`/${selected.slug}/admin`}>Διαχείριση</a>
                  <a className="secondary small-button" href={`/${selected.slug}`}>Κάρτα πελατών</a>
                  <button type="button" className="secondary small-button" onClick={() => resetKey(selected)}>Νέος κωδικός</button>
                  <button type="button" className={selected.active ? 'danger small-button' : 'secondary small-button'} onClick={() => toggle(selected)}>{selected.active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}</button>
                  <button type="button" className="danger small-button" onClick={() => setDeleting({ id: selected.id, confirm: '' })}>Διαγραφή</button>
                </div>
                {deleting?.id === selected.id ? (
                  <form className="delete-confirm" onSubmit={(event) => { event.preventDefault(); void remove(selected) }}>
                    <p className="muted small">Διαγράφονται οριστικά η επιχείρηση, τα {number.format(selected.members)} μέλη, οι υπάλληλοι και το ιστορικό της. Δεν γίνεται επαναφορά. Για επιβεβαίωση γράψε <strong>{selected.slug}</strong>.</p>
                    <input type="text" value={deleting.confirm} onChange={(event) => setDeleting({ ...deleting, confirm: event.target.value })} autoCapitalize="off" autoCorrect="off" spellCheck="false" aria-label="Επιβεβαίωση διαγραφής" />
                    <div className="action-row">
                      <button type="submit" className="danger" disabled={deleting.confirm !== selected.slug}>Οριστική διαγραφή</button>
                      <button type="button" className="text-button" onClick={() => setDeleting(null)}>Άκυρο</button>
                    </div>
                  </form>
                ) : null}
              </article>
            ) : <p className="muted small">Διάλεξε επιχείρηση από τη λίστα ή αναζήτησε με όνομα για να δεις τα στοιχεία της.</p>}
          </>
        )}

        {creating ? null : <button type="button" className="secondary" onClick={() => setCreating(true)}>+ Νέα επιχείρηση</button>}

        {creating ? <form className="settings-card" onSubmit={create}>
          <h3>Νέα επιχείρηση</h3>
          <label>Όνομα<input type="text" maxLength={40} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="π.χ. Πλυντήριο Νίκος" /></label>
          <label>Διεύθυνση (λατινικά)<input type="text" maxLength={40} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="π.χ. carwash-nikos" /></label>
          <label>Σύνθημα στην αρχική <span className="optional">(προαιρετικό)</span><input type="text" maxLength={80} value={form.tagline} onChange={(event) => setForm({ ...form, tagline: event.target.value })} placeholder="π.χ. Κάθε πλύσιμο μετράει." /></label>

          <div className="logo-row">
            <div className="logo-preview" style={{ background: form.color }}>
              {form.logo ? <img src={form.logo} alt="Λογότυπο" /> : <TenantIcon name={form.icon} size={28} />}
            </div>
            <div className="logo-actions">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickLogo} aria-label="Επιλογή λογοτύπου" />
              <button type="button" className="secondary small-button" onClick={() => fileRef.current?.click()}>{form.logo ? 'Αλλαγή λογοτύπου' : 'Ανέβασε λογότυπο'}</button>
              {form.logo ? <button type="button" className="text-button" onClick={() => setForm({ ...form, logo: '' })}>Αφαίρεση</button> : null}
            </div>
          </div>

          <div>
            <p className="field-label">Εικονίδιο στις σφραγίδες</p>
            <div className="icon-grid" role="radiogroup" aria-label="Εικονίδιο">
              {ICON_CHOICES.map((choice) => (
                <button key={choice.key} type="button" role="radio" aria-checked={form.icon === choice.key} className={form.icon === choice.key ? 'icon-choice selected' : 'icon-choice'} onClick={() => setForm({ ...form, icon: choice.key })} title={choice.label}>
                  <TenantIcon name={choice.key} size={22} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="field-label">Χρώμα κάρτας</p>
            <div className="swatch-row">
              {SWATCHES.map((color) => (
                <button key={color} type="button" className={form.color.toLowerCase() === color ? 'swatch selected' : 'swatch'} style={{ background: color }} onClick={() => setForm({ ...form, color })} aria-label={`Χρώμα ${color}`} />
              ))}
              <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} aria-label="Άλλο χρώμα" />
            </div>
          </div>

          <h3 className="subhead">Δώρο και κανόνες</h3>
          <label>Όνομα δώρου<input type="text" maxLength={40} value={form.reward_name} onChange={(event) => setForm({ ...form, reward_name: event.target.value })} placeholder="π.χ. Δωρεάν πλύσιμο" /></label>
          <label>Πόντοι για δώρο<input type="number" inputMode="numeric" min={2} max={50} value={form.points_per_reward} onChange={(event) => setForm({ ...form, points_per_reward: event.target.value })} /></label>
          <label>Μέγιστοι πόντοι ανά σάρωση<input type="number" inputMode="numeric" min={1} max={20} value={form.max_points_per_scan} onChange={(event) => setForm({ ...form, max_points_per_scan: event.target.value })} /></label>
          <label>Αναμονή μεταξύ σαρώσεων (δευτερόλεπτα)<input type="number" inputMode="numeric" min={0} max={3600} value={form.scan_cooldown_seconds} onChange={(event) => setForm({ ...form, scan_cooldown_seconds: event.target.value })} /></label>

          <h3 className="subhead">Στοιχεία για την πολιτική απορρήτου <span className="optional">(προαιρετικά)</span></h3>
          <label>Επωνυμία<input type="text" maxLength={120} value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} /></label>
          <label>Διεύθυνση<input type="text" maxLength={160} value={form.legalAddress} onChange={(event) => setForm({ ...form, legalAddress: event.target.value })} /></label>
          <label>ΑΦΜ<input type="text" maxLength={20} value={form.legalVat} onChange={(event) => setForm({ ...form, legalVat: event.target.value })} /></label>
          <label>Email επικοινωνίας<input type="email" maxLength={120} value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} /></label>
          <p className="muted small">Ο ιδιοκτήτης μπορεί να τα αλλάξει αργότερα από τη διαχείριση.</p>
          <button type="submit" className="primary-button" disabled={!form.name.trim() || form.slug.length < 3}>Δημιουργία</button>
          <button type="button" className="text-button" onClick={() => setCreating(false)}>Άκυρο</button>
        </form> : null}
      </section>
    </main>
  )
}
