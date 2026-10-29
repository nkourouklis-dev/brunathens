import { useEffect, useState } from 'react'
import { api, friendlyError } from './api.js'
import { Icon } from './icons.jsx'
import { Button, Field, Link, Notice, Screen, navigate, usePageMeta } from './ui.jsx'

export function Landing() {
  const [selfSignup, setSelfSignup] = useState(false)
  usePageMeta({ title: 'Κερδίσετο · Κάρτα επιβράβευσης για κάθε επιχείρηση', color: '#1f2937' })
  useEffect(() => { api('platform/me').then((data) => setSelfSignup(Boolean(data.selfSignup))).catch(() => {}) }, [])
  return (
    <Screen className="landing">
      <div className="landing-hero">
        <span className="mark landing-mark"><Icon name="gift" size={36} /></span>
        <h1>Κερδίσετο</h1>
        <p>Ψηφιακή κάρτα επιβράβευσης για την επιχείρησή σου. Οι πελάτες σκανάρουν ένα QR, παίρνουν κάρτα στο κινητό και μαζεύουν πόντους σε κάθε επίσκεψη.</p>
        {selfSignup ? <Link to="/start" className="btn btn-primary">Φτιάξε την κάρτα σου</Link> : <p className="muted">Για να αποκτήσεις κάρτα για την επιχείρησή σου, επικοινώνησε μαζί μας.</p>}
      </div>
      <ul className="landing-points">
        <li><Icon name="gift" /><div><strong>Δικά σου δώρα και λογότυπο</strong><span>Όλα ρυθμίζονται από εσένα, χωρίς προγραμματιστή.</span></div></li>
        <li><Icon name="users" /><div><strong>Ομάδα με ρόλους</strong><span>Προσκαλείς ταμίες με PIN και υπεύθυνους με κωδικό.</span></div></li>
        <li><Icon name="scan" /><div><strong>Ασφαλές QR</strong><span>Το QR αλλάζει συνεχώς, ώστε να μην αντιγράφεται.</span></div></li>
      </ul>
      <section className="shots" aria-label="Στιγμιότυπα">
        <figure><img src="/screens/card.png" alt="Η κάρτα του πελάτη με στάμπες και QR" loading="lazy" /><figcaption>Η κάρτα του πελάτη</figcaption></figure>
        <figure><img src="/screens/scan.png" alt="Το ταμείο δίνει πόντους μετά τη σάρωση" loading="lazy" /><figcaption>Το ταμείο δίνει πόντους</figcaption></figure>
        <figure><img src="/screens/settings.png" alt="Οι ρυθμίσεις της επιχείρησης" loading="lazy" /><figcaption>Ρυθμίσεις από τον ιδιοκτήτη</figcaption></figure>
      </section>
      <footer className="page-footer"><Link to="/platform">Διαχείριση</Link> · Κερδίσετο</footer>
    </Screen>
  )
}

export function Start() {
  const [form, setForm] = useState({ businessName: '', ownerName: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  usePageMeta({ title: 'Δημιουργία κάρτας · Κερδίσετο', color: '#1f2937' })
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api('signup', { method: 'POST', body: form })
      navigate(`/b/${data.slug}/team#settings`)
    } catch (err) {
      setError(err.status === 403 ? 'Οι δημόσιες εγγραφές δεν είναι ενεργές.' : friendlyError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Screen className="center">
      <div className="login-card">
        <h1>Φτιάξε την κάρτα σου</h1>
        <form className="form" onSubmit={submit}>
          <Field label="Όνομα επιχείρησης"><input value={form.businessName} maxLength={60} onChange={set('businessName')} required /></Field>
          <Field label="Το όνομά σου"><input value={form.ownerName} maxLength={60} autoComplete="name" onChange={set('ownerName')} required /></Field>
          <Field label="Email"><input type="email" inputMode="email" autoComplete="username" value={form.email} onChange={set('email')} required /></Field>
          <Field label="Κωδικός" hint="Τουλάχιστον 8 χαρακτήρες."><input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required /></Field>
          <Notice kind="error">{error}</Notice>
          <Button type="submit" busy={busy} onClick={undefined}>Δημιουργία</Button>
        </form>
        <Link to="/" className="link-button">Πίσω</Link>
      </div>
    </Screen>
  )
}
