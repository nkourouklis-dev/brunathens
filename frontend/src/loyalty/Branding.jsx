import { useRef, useState } from 'react'
import { friendlyError } from './api'
import { ICON_CHOICES, TenantIcon } from './icons'
import { useTenant } from './tenant'

const SWATCHES = ['#2b2b2b', '#8a4f24', '#1f6f5c', '#1d4e89', '#7b2d5b', '#b3261e', '#c27a00', '#3d5a3a']

// Turns any picked image into a 256px square PNG (transparent padding), small enough to store with the business.
function logoFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      for (const size of [256, 192, 128]) {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        const scale = Math.min(size / image.width, size / image.height)
        const width = image.width * scale
        const height = image.height * scale
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
        const dataUrl = canvas.toDataURL('image/png')
        if (dataUrl.length < 280_000) return resolve(dataUrl)
      }
      return reject(new Error('too large'))
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')) }
    image.src = url
  })
}

// Owner: logo, stamp icon, colour, name and the details that appear in the privacy policy.
export function BrandingCard({ call }) {
  const tenant = useTenant()
  const [form, setForm] = useState({
    name: tenant.name,
    tagline: tenant.tagline,
    icon: tenant.icon,
    color: tenant.color,
    logo: tenant.logo,
    legalName: tenant.legal.name,
    legalAddress: tenant.legal.address,
    legalVat: tenant.legal.vat,
    contactEmail: tenant.legal.email,
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  async function pickLogo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      update('logo', await logoFromFile(file))
    } catch {
      setError('Δεν διαβάστηκε η εικόνα. Δοκίμασε PNG ή JPG.')
    }
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await call('/api/loyalty/admin/branding', { method: 'PUT', body: { ...form, logo: form.logo === tenant.logo ? undefined : form.logo } })
      setMessage('Αποθηκεύτηκε. Ανανεώνεται η σελίδα…')
      setTimeout(() => window.location.reload(), 700)
    } catch (saveError) {
      setError(friendlyError(saveError))
      setBusy(false)
    }
  }

  return (
    <form className="settings-card branding-card" onSubmit={save}>
      <h3>Η επιχείρησή σου</h3>

      <div className="logo-row">
        <div className="logo-preview" style={{ background: form.color }}>
          {form.logo ? <img src={form.logo} alt="Λογότυπο" /> : <TenantIcon name={form.icon} size={28} />}
        </div>
        <div className="logo-actions">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickLogo} aria-label="Επιλογή λογοτύπου" />
          <button type="button" className="secondary small-button" onClick={() => fileRef.current?.click()}>{form.logo ? 'Αλλαγή λογοτύπου' : 'Ανέβασε λογότυπο'}</button>
          {form.logo ? <button type="button" className="text-button" onClick={() => update('logo', '')}>Αφαίρεση</button> : null}
        </div>
      </div>

      <label>Όνομα<input type="text" maxLength={40} value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
      <label>Σύνθημα στην αρχική <span className="optional">(προαιρετικό)</span><input type="text" maxLength={80} value={form.tagline} onChange={(event) => update('tagline', event.target.value)} placeholder="π.χ. Κάθε πλύσιμο μετράει." /></label>

      <div>
        <p className="field-label">Εικονίδιο στις σφραγίδες</p>
        <div className="icon-grid" role="radiogroup" aria-label="Εικονίδιο">
          {ICON_CHOICES.map((choice) => (
            <button key={choice.key} type="button" role="radio" aria-checked={form.icon === choice.key} className={form.icon === choice.key ? 'icon-choice selected' : 'icon-choice'} onClick={() => update('icon', choice.key)} title={choice.label}>
              <TenantIcon name={choice.key} size={22} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="field-label">Χρώμα κάρτας</p>
        <div className="swatch-row">
          {SWATCHES.map((color) => (
            <button key={color} type="button" className={form.color.toLowerCase() === color ? 'swatch selected' : 'swatch'} style={{ background: color }} onClick={() => update('color', color)} aria-label={`Χρώμα ${color}`} />
          ))}
          <input type="color" value={form.color} onChange={(event) => update('color', event.target.value)} aria-label="Άλλο χρώμα" />
        </div>
      </div>

      <h3 className="subhead">Στοιχεία για την πολιτική απορρήτου</h3>
      <p className="muted small">Εμφανίζονται στους πελάτες. Συμπλήρωσέ τα με τα νόμιμα στοιχεία της επιχείρησης.</p>
      <label>Επωνυμία<input type="text" maxLength={120} value={form.legalName} onChange={(event) => update('legalName', event.target.value)} /></label>
      <label>Διεύθυνση<input type="text" maxLength={160} value={form.legalAddress} onChange={(event) => update('legalAddress', event.target.value)} /></label>
      <label>ΑΦΜ<input type="text" maxLength={20} value={form.legalVat} onChange={(event) => update('legalVat', event.target.value)} /></label>
      <label>Email επικοινωνίας<input type="email" maxLength={120} value={form.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} /></label>

      {message ? <p className="message info inline" role="status">{message}</p> : null}
      {error ? <p className="message error inline" role="alert">{error}</p> : null}
      <button type="submit" className="primary-button" disabled={busy || !form.name.trim()}>Αποθήκευση</button>
    </form>
  )
}
