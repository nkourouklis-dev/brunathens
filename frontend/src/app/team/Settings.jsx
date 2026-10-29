import { useRef, useState } from 'react'
import { api, friendlyError, shareLink } from '../api.js'
import { BusinessMark, Icon, contrastText } from '../icons.jsx'
import { Button, ConfirmSheet, CopyField, Field, Notice, QrCode, Sheet, useToast } from '../ui.jsx'
import { ICON_KEYS } from '../../../shared/constants.js'
import { fileToLogoDataUrl } from './shared.jsx'

const COLORS = ['#1f2937', '#b45309', '#b91c1c', '#be185d', '#7c3aed', '#1d4ed8', '#0e7490', '#047857', '#4d7c0f', '#a16207']

const MODES = [
  { value: 'open', title: 'Ανοιχτό', text: 'Όποιος έχει το link μπορεί να πάρει κάρτα.' },
  { value: 'code', title: 'Με κωδικό', text: 'Το link περιέχει μυστικό κωδικό που μπορείς να αλλάξεις όποτε θες.' },
  { value: 'closed', title: 'Κλειστό', text: 'Δεν γίνονται νέες εγγραφές.' },
]

export function joinUrl(business) {
  const base = `${window.location.origin}/b/${business.slug}`
  return business.signupMode === 'code' ? `${base}?j=${business.joinCode}` : base
}

function Section({ title, hint, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {hint ? <p className="muted small">{hint}</p> : null}
      {children}
    </section>
  )
}

// Κοινή λογική αποθήκευσης: στέλνει ένα κομμάτι ρυθμίσεων και ενημερώνει την εφαρμογή.
function useSave(business, onMe, toast) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (patch, message = 'Αποθηκεύτηκε') => {
    setBusy(true)
    setError('')
    try {
      onMe(await api(`b/${business.slug}/team/settings`, { method: 'PUT', body: patch }))
      toast(message)
      return true
    } catch (err) {
      setError(friendlyError(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { save, busy, error }
}

function Appearance({ business, onMe, toast }) {
  const [form, setForm] = useState({ name: business.name, tagline: business.tagline, icon: business.icon, color: business.color })
  const { save, busy, error } = useSave(business, onMe, toast)
  const [logoError, setLogoError] = useState('')
  const fileRef = useRef(null)
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const preview = { ...business, ...form, textColor: contrastText(form.color) }

  const pickLogo = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setLogoError('')
    try {
      await save({ logo: await fileToLogoDataUrl(file) }, 'Το λογότυπο ενημερώθηκε')
    } catch {
      setLogoError('Η εικόνα δεν μπορεί να χρησιμοποιηθεί. Δοκίμασε PNG ή JPG.')
    }
  }

  return (
    <Section title="Εμφάνιση" hint="Έτσι θα δουν την κάρτα οι πελάτες σου και το Wallet τους.">
      <div className="brand-preview" style={{ '--brand': form.color }}>
        <BusinessMark business={preview} size={64} />
        <div><strong>{form.name || 'Όνομα'}</strong><small>{form.tagline}</small></div>
      </div>

      <div className="logo-row">
        <Button variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>{business.hasLogo ? 'Αλλαγή λογοτύπου' : 'Ανέβασμα λογοτύπου'}</Button>
        {business.hasLogo ? <Button variant="ghost" onClick={() => save({ logo: null }, 'Το λογότυπο αφαιρέθηκε')}>Αφαίρεση</Button> : null}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickLogo} />
      </div>
      <Notice kind="error">{logoError}</Notice>
      <p className="muted small">Χωρίς λογότυπο χρησιμοποιείται το εικονίδιο που διαλέγεις παρακάτω.</p>

      <form className="form" onSubmit={(event) => { event.preventDefault(); save(form) }}>
        <Field label="Όνομα επιχείρησης"><input value={form.name} maxLength={60} onChange={(event) => set('name')(event.target.value)} required /></Field>
        <Field label="Υπότιτλος (προαιρετικό)"><input value={form.tagline} maxLength={80} onChange={(event) => set('tagline')(event.target.value)} placeholder="π.χ. Καφές & γλυκά" /></Field>
        <div className="field">
          <span className="field-label">Εικονίδιο</span>
          <div className="icon-grid" role="radiogroup" aria-label="Εικονίδιο">
            {ICON_KEYS.map((name) => (
              <button key={name} type="button" role="radio" aria-checked={form.icon === name} aria-label={name} className={form.icon === name ? 'is-selected' : ''} onClick={() => set('icon')(name)}>
                <Icon name={name} size={22} />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Χρώμα</span>
          <div className="color-row">
            {COLORS.map((color) => (
              <button key={color} type="button" className={`swatch${form.color === color ? ' is-selected' : ''}`} style={{ background: color }} aria-label={color} onClick={() => set('color')(color)} />
            ))}
            <input type="color" value={form.color} onChange={(event) => set('color')(event.target.value)} aria-label="Δικό σου χρώμα" />
          </div>
        </div>
        <Notice kind="error">{error}</Notice>
        <Button type="submit" busy={busy} onClick={undefined}>Αποθήκευση εμφάνισης</Button>
      </form>
    </Section>
  )
}

function Rules({ business, onMe, toast }) {
  const [form, setForm] = useState({
    cardStyle: business.cardStyle, unitOne: business.unitOne, unitMany: business.unitMany,
    pointsPerVisit: business.pointsPerVisit, maxPointsPerScan: business.maxPointsPerScan,
    scanCooldownSeconds: business.scanCooldownSeconds, welcomePoints: business.welcomePoints,
  })
  const { save, busy, error } = useSave(business, onMe, toast)
  const num = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value === '' ? '' : Number(event.target.value) }))
  const text = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <Section title="Κάρτα και πόντοι">
      <form className="form" onSubmit={(event) => { event.preventDefault(); save(form) }}>
        <div className="field">
          <span className="field-label">Τύπος κάρτας</span>
          <div className="segmented">
            <button type="button" className={form.cardStyle === 'stamps' ? 'is-selected' : ''} onClick={() => setForm({ ...form, cardStyle: 'stamps' })}>Στάμπες</button>
            <button type="button" className={form.cardStyle === 'points' ? 'is-selected' : ''} onClick={() => setForm({ ...form, cardStyle: 'points' })}>Μπάρα πόντων</button>
          </div>
        </div>
        <div className="two-cols">
          <Field label="Ένας πόντος λέγεται"><input value={form.unitOne} maxLength={20} onChange={text('unitOne')} /></Field>
          <Field label="Πολλοί λέγονται"><input value={form.unitMany} maxLength={20} onChange={text('unitMany')} /></Field>
        </div>
        <div className="two-cols">
          <Field label="Πόντοι ανά επίσκεψη"><input type="number" inputMode="numeric" min="1" max="100" value={form.pointsPerVisit} onChange={num('pointsPerVisit')} /></Field>
          <Field label="Μέγιστοι ανά σάρωση"><input type="number" inputMode="numeric" min="1" max="1000" value={form.maxPointsPerScan} onChange={num('maxPointsPerScan')} /></Field>
        </div>
        <div className="two-cols">
          <Field label="Αναμονή ανάμεσα σε σαρώσεις (δευτ.)" hint="Προστατεύει από διπλή βαθμολόγηση."><input type="number" inputMode="numeric" min="0" max="86400" value={form.scanCooldownSeconds} onChange={num('scanCooldownSeconds')} /></Field>
          <Field label="Πόντοι καλωσορίσματος" hint="Δίνονται στη δημιουργία κάρτας."><input type="number" inputMode="numeric" min="0" max="100" value={form.welcomePoints} onChange={num('welcomePoints')} /></Field>
        </div>
        <Notice kind="error">{error}</Notice>
        <Button type="submit" busy={busy} onClick={undefined}>Αποθήκευση κανόνων</Button>
      </form>
    </Section>
  )
}

function RewardSheet({ business, reward, onClose, onMe, toast }) {
  const [form, setForm] = useState({ name: reward?.name || '', description: reward?.description || '', cost: reward?.cost || 10, icon: reward?.icon || 'gift', active: reward ? Boolean(reward.active) : true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const base = `b/${business.slug}/team/rewards`

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onMe(await api(reward ? `${base}/${reward.id}` : base, { method: reward ? 'PUT' : 'POST', body: form }))
      toast('Το δώρο αποθηκεύτηκε')
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    onMe(await api(`${base}/${reward.id}`, { method: 'DELETE' }))
    toast('Το δώρο διαγράφηκε')
    onClose()
  }

  const icons = ICON_KEYS
  return (
    <Sheet title={reward ? 'Επεξεργασία δώρου' : 'Νέο δώρο'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Όνομα δώρου"><input value={form.name} maxLength={60} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="π.χ. Δωρεάν καφές" required /></Field>
        <Field label="Περιγραφή (προαιρετικό)"><input value={form.description} maxLength={120} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        <Field label={`Κόστος (${business.unitMany})`}><input type="number" inputMode="numeric" min="1" value={form.cost} onChange={(event) => setForm({ ...form, cost: Number(event.target.value) })} required /></Field>
        <div className="field">
          <span className="field-label">Εικονίδιο</span>
          <div className="icon-grid">
            {icons.map((name) => (
              <button key={name} type="button" aria-label={name} className={form.icon === name ? 'is-selected' : ''} onClick={() => setForm({ ...form, icon: name })}><Icon name={name} size={22} /></button>
            ))}
          </div>
        </div>
        <label className="check-row"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Ενεργό (το βλέπουν οι πελάτες)</label>
        <Notice kind="error">{error}</Notice>
        <Button type="submit" busy={busy} onClick={undefined}>Αποθήκευση</Button>
        {reward ? <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>Διαγραφή δώρου</Button> : null}
      </form>
      {confirmDelete ? <ConfirmSheet danger title="Διαγραφή δώρου" message={`Να διαγραφεί το «${reward.name}»; Το ιστορικό των πελατών δεν χάνεται.`} confirmLabel="Διαγραφή" onClose={() => setConfirmDelete(false)} onConfirm={remove} /> : null}
    </Sheet>
  )
}

function Rewards({ business, onMe, toast }) {
  const [editing, setEditing] = useState(undefined) // undefined: κλειστό, null: νέο, αντικείμενο: επεξεργασία
  return (
    <Section title="Δώρα" hint="Τι κερδίζουν οι πελάτες όταν μαζέψουν πόντους.">
      {business.rewards.length ? (
        <ul className="team-list">
          {business.rewards.map((reward) => (
            <li key={reward.id} className={reward.active ? '' : 'is-inactive'}>
              <span className="avatar"><Icon name={reward.icon} size={18} /></span>
              <div className="member-info"><strong>{reward.name}</strong><small>{reward.cost} {business.unitMany}{reward.active ? '' : ' · ανενεργό'}</small></div>
              <button type="button" className="icon-button" aria-label="Επεξεργασία" onClick={() => setEditing(reward)}><Icon name="edit" size={18} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="muted">Δεν έχεις ορίσει δώρα ακόμη.</p>}
      <Button icon="plus" variant="secondary" onClick={() => setEditing(null)}>Νέο δώρο</Button>
      {editing !== undefined ? <RewardSheet business={business} reward={editing} onClose={() => setEditing(undefined)} onMe={onMe} toast={toast} /> : null}
    </Section>
  )
}

function Poster({ business, onClose }) {
  const url = joinUrl(business)
  return (
    <Sheet title="Αφίσα εγγραφής" onClose={onClose} wide>
      <div className="poster" id="poster">
        <BusinessMark business={business} size={84} />
        <h3>{business.name}</h3>
        <p>Σκάναρε και πάρε την κάρτα επιβράβευσής σου</p>
        <QrCode value={url} label="QR εγγραφής" size={260} />
        <small>{url.replace(/^https?:\/\//, '')}</small>
      </div>
      <Button icon="share" onClick={() => window.print()}>Εκτύπωση</Button>
    </Sheet>
  )
}

function Signup({ business, onMe, toast }) {
  const { save, busy, error } = useSave(business, onMe, toast)
  const [poster, setPoster] = useState(false)
  const [rotating, setRotating] = useState(false)
  const url = joinUrl(business)

  const rotate = async () => {
    onMe(await api(`b/${business.slug}/team/join-code`, { method: 'POST', body: {} }))
    toast('Δημιουργήθηκε νέος κωδικός')
  }

  return (
    <Section title="Εγγραφή πελατών" hint="Οι πελάτες ανοίγουν το link ή σκανάρουν το QR και παίρνουν κάρτα.">
      <div className="mode-list" role="radiogroup">
        {MODES.map((mode) => (
          <button key={mode.value} type="button" role="radio" aria-checked={business.signupMode === mode.value} className={business.signupMode === mode.value ? 'is-selected' : ''} disabled={busy} onClick={() => business.signupMode !== mode.value && save({ signupMode: mode.value })}>
            <strong>{mode.title}</strong><small>{mode.text}</small>
          </button>
        ))}
      </div>
      <Notice kind="error">{error}</Notice>
      {business.signupMode !== 'closed' ? (
        <>
          <div className="qr-box"><QrCode value={url} label="QR εγγραφής" size={180} /></div>
          <CopyField value={url} />
          <div className="row-actions">
            <Button variant="secondary" icon="share" onClick={() => shareLink({ title: business.name, text: `Πάρε την κάρτα επιβράβευσης του ${business.name}:`, url })}>Κοινοποίηση</Button>
            <Button variant="secondary" icon="print" onClick={() => setPoster(true)}>Αφίσα</Button>
          </div>
          {business.signupMode === 'code' ? <Button variant="ghost" onClick={() => setRotating(true)}>Νέος κωδικός (το παλιό link παύει να ισχύει)</Button> : null}
        </>
      ) : null}
      {poster ? <Poster business={business} onClose={() => setPoster(false)} /> : null}
      {rotating ? <ConfirmSheet title="Νέος κωδικός εγγραφής" message="Το link και το QR που έχεις μοιράσει θα σταματήσουν να δουλεύουν για νέες εγγραφές. Οι υπάρχουσες κάρτες δεν επηρεάζονται." confirmLabel="Αλλαγή" onClose={() => setRotating(false)} onConfirm={async () => { await rotate(); setRotating(false) }} /> : null}
    </Section>
  )
}

function Legal({ business, onMe, toast }) {
  const [form, setForm] = useState({
    legalName: business.legal.name, legalAddress: business.legal.address, legalVat: business.legal.vat,
    contactEmail: business.legal.email, contactPhone: business.legal.phone,
  })
  const { save, busy, error } = useSave(business, onMe, toast)
  const text = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  return (
    <Section title="Στοιχεία επιχείρησης" hint="Εμφανίζονται στη σελίδα απορρήτου της κάρτας ως υπεύθυνος επεξεργασίας δεδομένων.">
      <form className="form" onSubmit={(event) => { event.preventDefault(); save(form) }}>
        <Field label="Επωνυμία"><input value={form.legalName} maxLength={120} onChange={text('legalName')} /></Field>
        <Field label="Διεύθυνση"><input value={form.legalAddress} maxLength={200} onChange={text('legalAddress')} /></Field>
        <div className="two-cols">
          <Field label="ΑΦΜ"><input value={form.legalVat} maxLength={30} onChange={text('legalVat')} /></Field>
          <Field label="Τηλέφωνο"><input type="tel" value={form.contactPhone} maxLength={30} onChange={text('contactPhone')} /></Field>
        </div>
        <Field label="Email επικοινωνίας"><input type="email" value={form.contactEmail} onChange={text('contactEmail')} /></Field>
        <Notice kind="error">{error}</Notice>
        <Button type="submit" busy={busy} onClick={undefined}>Αποθήκευση</Button>
      </form>
    </Section>
  )
}

function Password({ business, identity, toast }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!identity.email) return null
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api(`b/${business.slug}/team/password`, { method: 'POST', body: form })
      setForm({ currentPassword: '', newPassword: '' })
      toast('Ο κωδικός άλλαξε')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="Ο κωδικός μου">
      <form className="form" onSubmit={submit}>
        <Field label="Τρέχων κωδικός"><input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required /></Field>
        <Field label="Νέος κωδικός" hint="Τουλάχιστον 8 χαρακτήρες."><input type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required /></Field>
        <Notice kind="error">{error}</Notice>
        <Button type="submit" busy={busy} onClick={undefined}>Αλλαγή κωδικού</Button>
      </form>
    </Section>
  )
}

export default function Settings({ me, onMe }) {
  const { business, identity } = me
  const [toast, toastNode] = useToast()
  return (
    <div className="tab-content">
      <Appearance business={business} onMe={onMe} toast={toast} />
      <Rewards business={business} onMe={onMe} toast={toast} />
      <Rules business={business} onMe={onMe} toast={toast} />
      <Signup business={business} onMe={onMe} toast={toast} />
      <Legal business={business} onMe={onMe} toast={toast} />
      <Password business={business} identity={identity} toast={toast} />
      {toastNode}
    </div>
  )
}
