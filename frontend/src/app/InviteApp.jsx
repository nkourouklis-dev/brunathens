import { useEffect, useState } from 'react'
import { api, ApiError, friendlyError, ROLE_LABELS } from './api.js'
import { BusinessMark } from './icons.jsx'
import { Button, Field, Notice, PageError, Screen, Spinner, brandStyle, navigate, usePageMeta } from './ui.jsx'

const ROLE_TEXT = {
  staff: 'Θα σκανάρεις κάρτες πελατών και θα δίνεις πόντους. Διάλεξε ένα δικό σου 6ψήφιο PIN για να μπαίνεις.',
  manager: 'Θα βλέπεις πελάτες και στατιστικά και θα διαχειρίζεσαι το ταμείο. Θα μπαίνεις με email και κωδικό.',
  owner: 'Θα έχεις πλήρη έλεγχο της επιχείρησης: λογότυπο, δώρα, ρυθμίσεις και ομάδα. Θα μπαίνεις με email και κωδικό.',
}

export default function InviteApp({ token }) {
  const [state, setState] = useState('loading')
  const [info, setInfo] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', pin: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`invite/${encodeURIComponent(token)}`)
      .then((data) => { setInfo(data); setForm((current) => ({ ...current, name: data.invitation.label })); setState('ready') })
      .catch((err) => setState(err instanceof ApiError && err.status === 404 ? 'invalid' : 'error'))
  }, [token])

  usePageMeta({ title: info ? `Πρόσκληση · ${info.business.name}` : 'Πρόσκληση', color: info?.business.color })

  if (state === 'loading') return <Screen className="center"><Spinner /></Screen>
  if (state === 'invalid') return <PageError title="Το link δεν ισχύει">Η πρόσκληση μπορεί να έχει λήξει, να έχει ήδη χρησιμοποιηθεί ή να ακυρώθηκε. Ζήτησε νέα από τον ιδιοκτήτη.</PageError>
  if (state === 'error') return <PageError title="Δεν φόρτωσε">Δοκίμασε ξανά σε λίγο.</PageError>

  const { business, invitation } = info
  const isStaff = invitation.role === 'staff'
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: key === 'pin' ? event.target.value.replace(/\D/g, '') : event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = isStaff ? { name: form.name, pin: form.pin } : { name: form.name, email: form.email, password: form.password }
      const data = await api(`invite/${encodeURIComponent(token)}/accept`, { method: 'POST', body })
      navigate(`/b/${data.slug}/team`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setState('invalid')
      else setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className="center">
      <div className="login-card" style={brandStyle({ color: business.color, textColor: '#fff' })}>
        <BusinessMark business={business} size={64} />
        <h1>{business.name}</h1>
        <p><strong>Πρόσκληση ως {ROLE_LABELS[invitation.role]}</strong></p>
        <p className="muted">{ROLE_TEXT[invitation.role]}</p>
        <form className="form" onSubmit={submit}>
          <Field label="Το όνομά σου"><input value={form.name} maxLength={60} autoComplete="name" onChange={set('name')} required /></Field>
          {isStaff ? (
            <Field label="Διάλεξε PIN (6 ψηφία)" hint="Θα το γράφεις κάθε φορά που μπαίνεις. Μην το μοιραστείς.">
              <input value={form.pin} type="password" inputMode="numeric" autoComplete="off" maxLength={6} className="code-input" onChange={set('pin')} required />
            </Field>
          ) : (
            <>
              <Field label="Email"><input type="email" inputMode="email" autoComplete="username" value={form.email} onChange={set('email')} required /></Field>
              <Field label="Κωδικός" hint="Τουλάχιστον 8 χαρακτήρες."><input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required /></Field>
            </>
          )}
          <Notice kind="error">{error}</Notice>
          <Button type="submit" busy={busy} onClick={undefined}>Αποδοχή πρόσκλησης</Button>
        </form>
      </div>
    </Screen>
  )
}
