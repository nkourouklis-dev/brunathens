import { useCallback, useEffect, useState } from 'react'
import { api, friendlyError, formatDate, ROLE_LABELS, shareLink } from '../api.js'
import { Icon } from '../icons.jsx'
import { Button, CopyField, EmptyState, Field, Notice, Sheet, Spinner, useToast } from '../ui.jsx'
import { RoleBadge } from './shared.jsx'

const STATUS_LABELS = { pending: 'Σε αναμονή', used: 'Χρησιμοποιήθηκε', expired: 'Έληξε', revoked: 'Ακυρώθηκε' }

function InviteSheet({ business, role, emailEnabled, onClose, onCreated }) {
  const roles = role === 'owner' ? ['staff', 'manager', 'owner'] : ['staff']
  const [inviteRole, setInviteRole] = useState('staff')
  const [label, setLabel] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  const create = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api(`b/${business.slug}/team/invitations`, { method: 'POST', body: { role: inviteRole, label, email: email || undefined } })
      setCreated(data)
      onCreated(data.invitations)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <Sheet title="Η πρόσκληση είναι έτοιμη" onClose={onClose}>
        <p>Στείλε αυτό το link σε {label || 'τον άνθρωπο που θες να προσκαλέσεις'} ({ROLE_LABELS[created.invitation.role]}). Ισχύει για 7 μέρες και μπορεί να χρησιμοποιηθεί <strong>μία φορά</strong>.</p>
        <CopyField value={created.invitation.url} label="Αντιγραφή" />
        <Button variant="secondary" icon="share" onClick={() => shareLink({ title: `Πρόσκληση στο ${business.name}`, text: `Σε προσκαλούν στην ομάδα του ${business.name}:`, url: created.invitation.url })}>Κοινοποίηση</Button>
        {created.emailSent ? <Notice kind="success">Στάλθηκε και με email.</Notice> : null}
        <Button variant="ghost" onClick={onClose}>Κλείσιμο</Button>
      </Sheet>
    )
  }

  return (
    <Sheet title="Νέα πρόσκληση" onClose={onClose}>
      <form className="form" onSubmit={create}>
        <Field label="Ρόλος">
          <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
            {roles.map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
          </select>
        </Field>
        <p className="muted small">
          {inviteRole === 'staff' ? 'Ταμείο: σκανάρει κάρτες και δίνει πόντους. Μπαίνει με δικό του 6ψήφιο PIN.'
            : inviteRole === 'manager' ? 'Υπεύθυνος: βλέπει πελάτες και στατιστικά, διορθώνει πόντους, προσκαλεί ταμίες. Μπαίνει με email και κωδικό.'
              : 'Ιδιοκτήτης: έχει πλήρη πρόσβαση, και στις ρυθμίσεις. Μπαίνει με email και κωδικό.'}
        </p>
        <Field label="Όνομα (προαιρετικό)"><input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} placeholder="π.χ. Γιώργος" /></Field>
        {emailEnabled ? <Field label="Στείλε και με email (προαιρετικό)"><input type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field> : null}
        <Notice kind="error">{error}</Notice>
        <Button type="submit" busy={busy} onClick={undefined}>Δημιουργία link πρόσκλησης</Button>
      </form>
    </Sheet>
  )
}

function PinSheet({ business, member, onClose, onDone }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api(`b/${business.slug}/team/staff/${member.id}`, { method: 'PATCH', body: { pin } })
      onDone(data.team)
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title={`Νέο PIN για ${member.name}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <Field label="Νέο PIN (6 ψηφία)"><input value={pin} inputMode="numeric" maxLength={6} className="code-input" onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} required /></Field>
        <p className="muted small">Θα αποσυνδεθεί από όλες τις συσκευές και θα μπαίνει με το νέο PIN.</p>
        <Notice kind="error">{error}</Notice>
        <Button type="submit" busy={busy} onClick={undefined}>Αποθήκευση</Button>
      </form>
    </Sheet>
  )
}

export default function People({ me }) {
  const { business, identity } = me
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [pinFor, setPinFor] = useState(null)
  const [toast, toastNode] = useToast()

  const load = useCallback(async () => {
    try { setData(await api(`b/${business.slug}/team/staff`)) } catch (err) { setError(friendlyError(err)) }
  }, [business.slug])

  useEffect(() => { load() }, [load])

  const manageable = (member) => member.id !== identity.id && (identity.role === 'owner' || member.role === 'staff')

  const toggle = async (member) => {
    try {
      const result = await api(`b/${business.slug}/team/staff/${member.id}`, { method: 'PATCH', body: { active: !member.active } })
      setData((current) => ({ ...current, team: result.team }))
      toast(member.active ? `${member.name}: απενεργοποιήθηκε` : `${member.name}: ενεργοποιήθηκε`)
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const revoke = async (invitation) => {
    try {
      const result = await api(`b/${business.slug}/team/invitations/${invitation.id}`, { method: 'DELETE', body: {} })
      setData((current) => ({ ...current, invitations: result.invitations }))
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  if (!data) return <div className="tab-content">{error ? <Notice kind="error">{error}</Notice> : <Spinner />}</div>

  const pending = data.invitations.filter((invitation) => invitation.status === 'pending')
  const past = data.invitations.filter((invitation) => invitation.status !== 'pending').slice(0, 8)

  return (
    <div className="tab-content">
      <section className="panel">
        <div className="panel-head">
          <h2>Ομάδα</h2>
          <Button icon="plus" onClick={() => setShowInvite(true)}>Πρόσκληση</Button>
        </div>
        <ul className="team-list">
          {data.team.map((member) => (
            <li key={member.id} className={member.active ? '' : 'is-inactive'}>
              <span className="avatar">{member.name.slice(0, 1).toUpperCase()}</span>
              <div className="member-info">
                <strong>{member.name}{member.id === identity.id ? ' (εσύ)' : ''}</strong>
                <small>{member.email || (member.hasPin ? 'Σύνδεση με PIN' : '')}{member.lastLoginAt ? ` · τελευταία είσοδος ${formatDate(member.lastLoginAt)}` : ''}</small>
              </div>
              <RoleBadge role={member.role} />
              {manageable(member) ? (
                <div className="team-actions">
                  {member.role === 'staff' ? <button type="button" className="icon-button" title="Νέο PIN" aria-label="Νέο PIN" onClick={() => setPinFor(member)}><Icon name="edit" size={18} /></button> : null}
                  <button type="button" className="link-button" onClick={() => toggle(member)}>{member.active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}</button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Προσκλήσεις σε αναμονή</h2>
        {pending.length ? (
          <ul className="team-list">
            {pending.map((invitation) => (
              <li key={invitation.id}>
                <span className="avatar"><Icon name="link" size={16} /></span>
                <div className="member-info"><strong>{invitation.label || 'Χωρίς όνομα'}</strong><small>Λήγει {formatDate(invitation.expiresAt)}</small></div>
                <RoleBadge role={invitation.role} />
                <button type="button" className="link-button danger" onClick={() => revoke(invitation)}>Ακύρωση</button>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon="link" title="Καμία πρόσκληση σε αναμονή">Πάτα «Πρόσκληση» για να προσθέσεις ταμία ή υπεύθυνο.</EmptyState>}
        {past.length ? (
          <details className="past">
            <summary>Παλιότερες προσκλήσεις</summary>
            <ul className="history compact">
              {past.map((invitation) => (
                <li key={invitation.id}><div><strong>{invitation.label || ROLE_LABELS[invitation.role]}</strong><small>{STATUS_LABELS[invitation.status]}{invitation.usedByName ? ` · ${invitation.usedByName}` : ''}</small></div></li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {showInvite ? <InviteSheet business={business} role={identity.role} emailEnabled={me.emailEnabled} onClose={() => setShowInvite(false)} onCreated={(invitations) => setData((current) => ({ ...current, invitations }))} /> : null}
      {pinFor ? <PinSheet business={business} member={pinFor} onClose={() => setPinFor(null)} onDone={(team) => { setData((current) => ({ ...current, team })); toast('Το PIN άλλαξε') }} /> : null}
      {toastNode}
    </div>
  )
}
