import { useCallback, useEffect, useState } from 'react'
import { api, friendlyError, formatDate, unitLabel } from '../api.js'
import { Icon } from '../icons.jsx'
import { Button, EmptyState, Field, Notice, Sheet, Spinner, useToast } from '../ui.jsx'
import { ActivityList } from './shared.jsx'

function MemberDetail({ business, role, memberId, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { setData(await api(`b/${business.slug}/team/members/${memberId}`)) } catch (err) { setError(friendlyError(err)) }
  }, [business.slug, memberId])

  useEffect(() => { load() }, [load])

  const adjust = async (sign) => {
    const amount = Number(delta)
    if (!Number.isInteger(amount) || amount < 1) { setError('Γράψε πόσους πόντους.'); return }
    setBusy(true)
    setError('')
    try {
      await api(`b/${business.slug}/team/members/${memberId}/adjust`, { method: 'POST', body: { delta: sign * amount, note } })
      setDelta('')
      setNote('')
      await load()
      onChanged()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const undo = async (tx) => {
    try {
      await api(`b/${business.slug}/team/undo`, { method: 'POST', body: { transactionId: tx.id } })
      await load()
      onChanged()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Sheet title={data?.member.name || 'Πελάτης'} onClose={onClose} wide>
      {!data ? <Spinner /> : (
        <>
          <div className="scan-member">
            <div className="scan-points"><strong>{data.member.points}</strong><span>{unitLabel(business, data.member.points)}</span></div>
            <p className="muted small">{data.member.email}<br />Κάρτα {data.member.cardNumber} · εγγραφή {formatDate(data.member.createdAt)} · {data.member.visits} επισκέψεις · {data.member.rewardsRedeemed} δώρα</p>
          </div>
          <section className="scan-section">
            <h3>Διόρθωση πόντων</h3>
            <Field label="Πόσοι πόντοι"><input value={delta} inputMode="numeric" onChange={(event) => setDelta(event.target.value.replace(/\D/g, '').slice(0, 4))} /></Field>
            <Field label="Σημείωση (προαιρετικό)"><input value={note} maxLength={120} onChange={(event) => setNote(event.target.value)} placeholder="π.χ. ξέχασε την κάρτα" /></Field>
            <div className="row-actions">
              <Button variant="secondary" icon="minus" busy={busy} onClick={() => adjust(-1)}>Αφαίρεση</Button>
              <Button icon="plus" busy={busy} onClick={() => adjust(1)}>Προσθήκη</Button>
            </div>
          </section>
          <Notice kind="error">{error}</Notice>
          <section className="scan-section">
            <h3>Ιστορικό</h3>
            <ActivityList transactions={data.transactions} role={role} onUndo={undo} showMember={false} />
          </section>
        </>
      )}
    </Sheet>
  )
}

export default function Members({ me }) {
  const { business, identity } = me
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const [, toastNode] = useToast()

  const load = useCallback(async (q) => {
    try {
      const data = await api(`b/${business.slug}/team/members?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      setMembers(data.members)
      setError('')
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [business.slug])

  useEffect(() => {
    const timer = setTimeout(() => load(query.trim()), query ? 250 : 0)
    return () => clearTimeout(timer)
  }, [query, load])

  return (
    <div className="tab-content">
      <section className="panel">
        <h2>Πελάτες</h2>
        <div className="search">
          <Icon name="users" size={18} />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση με όνομα, email ή κάρτα" aria-label="Αναζήτηση πελατών" />
        </div>
        <Notice kind="error">{error}</Notice>
        {!members ? <Spinner /> : members.length ? (
          <ul className="member-list">
            {members.map((member) => (
              <li key={member.id}>
                <button type="button" onClick={() => setSelected(member.id)}>
                  <span className="avatar">{member.name.slice(0, 1).toUpperCase()}</span>
                  <span className="member-info"><strong>{member.name}</strong><small>{member.email}</small></span>
                  <span className="member-points"><strong>{member.points}</strong><small>{business.unitMany}</small></span>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon="users" title={query ? 'Δεν βρέθηκε κανείς' : 'Δεν υπάρχουν πελάτες ακόμα'}>{query ? 'Δοκίμασε άλλη αναζήτηση.' : 'Μοίρασε το link εγγραφής για να φτιάξουν κάρτα.'}</EmptyState>}
      </section>
      {selected ? <MemberDetail business={business} role={identity.role} memberId={selected} onClose={() => setSelected(null)} onChanged={() => load(query.trim())} /> : null}
      {toastNode}
    </div>
  )
}
