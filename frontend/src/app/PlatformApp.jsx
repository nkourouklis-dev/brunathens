import { useCallback, useEffect, useState } from 'react'
import { api, friendlyError, formatDate } from './api.js'
import { BusinessMark } from './icons.jsx'
import { Button, CopyField, EmptyState, Field, Notice, Screen, Sheet, Spinner, navigate, useToast } from './ui.jsx'

function Login({ onLoggedIn }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('platform/login', { method: 'POST', body: { key } })
      onLoggedIn()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Screen className="center">
      <div className="login-card">
        <h1>Κερδίσετο · Διαχείριση</h1>
        <form className="form" onSubmit={submit}>
          <Field label="Κλειδί διαχειριστή"><input type="password" value={key} autoComplete="current-password" onChange={(event) => setKey(event.target.value)} required /></Field>
          <Notice kind="error">{error}</Notice>
          <Button type="submit" busy={busy} onClick={undefined}>Είσοδος</Button>
        </form>
      </div>
    </Screen>
  )
}

function InviteLink({ title, url, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p>Στείλε αυτό το link στον ιδιοκτήτη. Ισχύει 7 μέρες και χρησιμοποιείται μία φορά.</p>
      <CopyField value={url} />
      <Button onClick={onClose}>Έτοιμο</Button>
    </Sheet>
  )
}

function CreateSheet({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', ownerName: '', color: '#1f2937' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api('platform/businesses', { method: 'POST', body: form })
      onCreated(data)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title="Νέα επιχείρηση" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Όνομα επιχείρησης"><input value={form.name} maxLength={60} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label="Όνομα ιδιοκτήτη (προαιρετικό)"><input value={form.ownerName} maxLength={60} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} /></Field>
        <Field label="Χρώμα"><input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></Field>
        <p className="muted small">Ο ιδιοκτήτης θα ανεβάσει λογότυπο, δώρα και ρυθμίσεις μόνος του μέσα από το link πρόσκλησης.</p>
        <Notice kind="error">{error}</Notice>
        <Button type="submit" busy={busy} onClick={undefined}>Δημιουργία</Button>
      </form>
    </Sheet>
  )
}

export default function PlatformApp() {
  const [state, setState] = useState('loading')
  const [items, setItems] = useState([])
  const [creating, setCreating] = useState(false)
  const [link, setLink] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [toast, toastNode] = useToast()

  const load = useCallback(async () => {
    try {
      const me = await api('platform/me')
      if (!me.authenticated) { setState('login'); return }
      setItems((await api('platform/businesses')).businesses)
      setState('app')
    } catch { setState('login') }
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (fn) => {
    try { await fn() } catch (err) { toast(friendlyError(err), 'error') }
  }

  if (state === 'loading') return <Screen className="center"><Spinner /></Screen>
  if (state === 'login') return <Login onLoggedIn={load} />

  return (
    <Screen className="platform">
      <header className="platform-header">
        <h1>Επιχειρήσεις</h1>
        <div>
          <Button icon="plus" onClick={() => setCreating(true)}>Νέα</Button>
          <Button variant="ghost" onClick={async () => { await api('platform/logout', { method: 'POST', body: {} }); setState('login') }}>Έξοδος</Button>
        </div>
      </header>
      {items.length ? (
        <ul className="biz-list">
          {items.map((item) => (
            <li key={item.id} className={item.status === 'active' ? '' : 'is-inactive'}>
              <BusinessMark business={item} size={44} />
              <div className="member-info">
                <strong>{item.name}</strong>
                <small>/b/{item.slug} · {item.members} πελάτες · {item.team} στην ομάδα · {item.lastActivity ? `τελευταία κίνηση ${formatDate(item.lastActivity)}` : 'χωρίς κινήσεις'}</small>
                {item.owners === 0 ? <small className="warn-text">Δεν έχει ιδιοκτήτη ακόμη</small> : null}
                {item.status !== 'active' ? <small className="warn-text">Σε αναστολή</small> : null}
              </div>
              <div className="biz-actions">
                <button type="button" className="link-button" onClick={() => act(async () => { const data = await api(`platform/businesses/${item.id}/invite-owner`, { method: 'POST', body: {} }); setLink({ title: `Link ιδιοκτήτη · ${item.name}`, url: data.inviteUrl }) })}>Link ιδιοκτήτη</button>
                {item.owners > 0 ? <button type="button" className="link-button" onClick={() => act(async () => { const data = await api(`platform/businesses/${item.id}/open`, { method: 'POST', body: {} }); navigate(`/b/${data.slug}/team`) })}>Άνοιγμα ως ιδιοκτήτης</button> : null}
                <button type="button" className="link-button" onClick={() => act(async () => setItems((await api(`platform/businesses/${item.id}`, { method: 'PATCH', body: { status: item.status === 'active' ? 'suspended' : 'active' } })).businesses))}>{item.status === 'active' ? 'Αναστολή' : 'Ενεργοποίηση'}</button>
                <button type="button" className="link-button danger" onClick={() => { setDeleting(item); setConfirmText('') }}>Διαγραφή</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon="gift" title="Καμία επιχείρηση ακόμα">Πάτα «Νέα» και στείλε το link στον ιδιοκτήτη.</EmptyState>}

      {creating ? <CreateSheet onClose={() => setCreating(false)} onCreated={(data) => { setItems(data.businesses); setCreating(false); setLink({ title: `Link ιδιοκτήτη · ${data.business.name}`, url: data.inviteUrl }) }} /> : null}
      {link ? <InviteLink {...link} onClose={() => setLink(null)} /> : null}
      {deleting ? (
        <Sheet title="Διαγραφή επιχείρησης" onClose={() => setDeleting(null)}>
          <p>Διαγράφονται οριστικά η επιχείρηση <strong>{deleting.name}</strong>, οι πελάτες και οι πόντοι τους. Γράψε <code>{deleting.slug}</code> για επιβεβαίωση.</p>
          <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} aria-label="Επιβεβαίωση" />
          <Button variant="danger" disabled={confirmText !== deleting.slug} onClick={() => act(async () => { setItems((await api(`platform/businesses/${deleting.id}`, { method: 'DELETE', body: { confirm: confirmText } })).businesses); setDeleting(null) })}>Διαγραφή οριστικά</Button>
        </Sheet>
      ) : null}
      {toastNode}
    </Screen>
  )
}
