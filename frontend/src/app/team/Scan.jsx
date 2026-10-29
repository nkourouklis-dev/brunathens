import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, friendlyError, unitLabel } from '../api.js'
import { Icon } from '../icons.jsx'
import { Scanner } from '../Scanner.jsx'
import { Button, ConfirmSheet, Field, Notice, Sheet, useToast } from '../ui.jsx'
import { ActivityList } from './shared.jsx'

// Η οθόνη του ταμείου: σκανάρεις την κάρτα, δίνεις πόντους ή εξαργυρώνεις δώρο.

function MemberSheet({ business, scan, onClose, onChanged }) {
  const [member, setMember] = useState(scan.member)
  const [points, setPoints] = useState(Math.min(scan.rules.pointsPerVisit, scan.rules.maxPointsPerScan))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [recent, setRecent] = useState(scan.recent)
  const [done, setDone] = useState(null) // { text, transactionId }
  const [recentEarn, setRecentEarn] = useState(null) // δευτερόλεπτα από την προηγούμενη επίσκεψη
  const [confirmReward, setConfirmReward] = useState(null)
  const ticketRef = useRef(scan.ticket)
  const maxPoints = scan.rules.maxPointsPerScan

  const run = async (kind, path, body, doneText) => {
    setBusy(kind)
    setError('')
    try {
      const data = await api(`b/${business.slug}/team/${path}`, { method: 'POST', body: { ticket: ticketRef.current, ...body } })
      setMember(data.member)
      setRecent(data.recent)
      setRecentEarn(null)
      setDone({ text: doneText(data), transactionId: data.transactionId })
      onChanged()
    } catch (err) {
      if (err instanceof ApiError && err.serverMessage === 'Recent earn') setRecentEarn(err.data.secondsAgo ?? 0)
      else setError(friendlyError(err))
    } finally {
      setBusy('')
    }
  }

  const earn = (force = false) => run('earn', 'earn', { points, force }, (data) => `+${points} ${unitLabel(business, points)} · σύνολο ${data.member.points}`)
  const redeem = (reward) => run('redeem', 'redeem', { rewardId: reward.id }, () => `Εξαργυρώθηκε: ${reward.name}`)

  const undo = async () => {
    setBusy('undo')
    try {
      const data = await api(`b/${business.slug}/team/undo`, { method: 'POST', body: { transactionId: done.transactionId } })
      setMember(data.member)
      setDone(null)
      onChanged()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy('')
    }
  }

  const afford = member.rewards.filter((reward) => reward.affordable)
  const later = member.rewards.filter((reward) => !reward.affordable)

  return (
    <Sheet title={member.name} onClose={onClose}>
      <div className="scan-member">
        <div className="scan-points"><strong>{member.points}</strong><span>{unitLabel(business, member.points)}</span></div>
        <p className="muted small">Κάρτα {member.cardNumber} · {member.visits} επισκέψεις · {member.rewardsRedeemed} δώρα που πήρε</p>
      </div>

      {done ? (
        <div className="success-box">
          <Icon name="check" size={28} />
          <strong>{done.text}</strong>
          <div className="row-actions">
            <Button variant="ghost" icon="undo" busy={busy === 'undo'} onClick={undo}>Αναίρεση</Button>
            <Button onClick={onClose}>Επόμενος πελάτης</Button>
          </div>
        </div>
      ) : (
        <>
          <section className="scan-section">
            <h3>Επίσκεψη</h3>
            <div className="stepper">
              <button type="button" className="icon-button big" onClick={() => setPoints((value) => Math.max(1, value - 1))} aria-label="Λιγότεροι πόντοι"><Icon name="minus" size={22} /></button>
              <output aria-live="polite"><strong>{points}</strong> {unitLabel(business, points)}</output>
              <button type="button" className="icon-button big" onClick={() => setPoints((value) => Math.min(maxPoints, value + 1))} aria-label="Περισσότεροι πόντοι"><Icon name="plus" size={22} /></button>
            </div>
            {recentEarn !== null ? (
              <div className="warn-box">
                <p>Αυτή η κάρτα πήρε {business.unitMany} πριν {recentEarn} δευτερόλεπτα. Να προστεθούν ξανά;</p>
                <div className="row-actions">
                  <Button variant="ghost" onClick={() => setRecentEarn(null)}>Όχι</Button>
                  <Button busy={busy === 'earn'} onClick={() => earn(true)}>Ναι, πρόσθεσε</Button>
                </div>
              </div>
            ) : (
              <Button busy={busy === 'earn'} icon="plus" onClick={() => earn(false)}>Δώσε {points} {unitLabel(business, points)}</Button>
            )}
          </section>

          {member.rewards.length ? (
            <section className="scan-section">
              <h3>Δώρα</h3>
              <ul className="reward-actions">
                {afford.map((reward) => (
                  <li key={reward.id}>
                    <button type="button" className="reward-button" disabled={Boolean(busy)} onClick={() => setConfirmReward(reward)}>
                      <Icon name={reward.icon} size={22} />
                      <span><strong>{reward.name}</strong><small>Εξαργύρωση · −{reward.cost} {business.unitMany}</small></span>
                      <Icon name="chevron" size={18} />
                    </button>
                  </li>
                ))}
                {later.map((reward) => (
                  <li key={reward.id} className="is-locked">
                    <span className="reward-button"><Icon name={reward.icon} size={22} /><span><strong>{reward.name}</strong><small>Λείπουν {reward.remaining} {business.unitMany}</small></span></span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <Notice kind="error">{error}</Notice>

      {recent.length ? (
        <section className="scan-section">
          <h3>Τελευταίες κινήσεις</h3>
          <ul className="history compact">
            {recent.map((tx) => (
              <li key={tx.id}><div><strong>{tx.kind === 'redeem' && tx.rewardName ? tx.rewardName : tx.kind === 'earn' ? 'Επίσκεψη' : tx.kind === 'welcome' ? 'Καλωσόρισμα' : tx.kind === 'reversal' ? 'Αναίρεση' : 'Διόρθωση'}</strong></div><span className={tx.delta > 0 ? 'delta plus' : 'delta minus'}>{tx.delta > 0 ? `+${tx.delta}` : tx.delta}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {confirmReward ? (
        <ConfirmSheet
          title="Εξαργύρωση δώρου"
          message={`${member.name}: ${confirmReward.name} (−${confirmReward.cost} ${business.unitMany}). Να γίνει;`}
          confirmLabel="Εξαργύρωση"
          onClose={() => setConfirmReward(null)}
          onConfirm={async () => { const reward = confirmReward; setConfirmReward(null); await redeem(reward) }}
        />
      ) : null}
    </Sheet>
  )
}

export default function Scan({ me, onOpenTab }) {
  const { business, identity } = me
  const [scan, setScan] = useState(null)
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [transactions, setTransactions] = useState([])
  const [toast, toastNode] = useToast()
  const lockRef = useRef(false)

  const loadActivity = useCallback(async () => {
    try {
      const data = await api(`b/${business.slug}/team/activity`)
      setTransactions(data.transactions.slice(0, 12))
    } catch { /* η λίστα είναι δευτερεύουσα */ }
  }, [business.slug])

  useEffect(() => { loadActivity() }, [loadActivity])

  const lookup = useCallback(async (code) => {
    if (lockRef.current) return
    lockRef.current = true
    setBusy(true)
    setError('')
    try {
      setScan(await api(`b/${business.slug}/team/lookup`, { method: 'POST', body: { code } }))
      setManual('')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
      lockRef.current = false
    }
  }, [business.slug])

  const undo = async (tx) => {
    try {
      await api(`b/${business.slug}/team/undo`, { method: 'POST', body: { transactionId: tx.id } })
      toast('Η κίνηση αναιρέθηκε')
      loadActivity()
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const needsSetup = identity.role === 'owner' && (!business.hasLogo || business.rewards.length === 0)

  return (
    <div className="tab-content">
      {needsSetup ? (
        <aside className="setup-card">
          <strong>Ολοκλήρωσε τη ρύθμιση της κάρτας σου</strong>
          <ul>
            <li className={business.hasLogo ? 'done' : ''}><Icon name={business.hasLogo ? 'check' : 'upload'} size={16} /> Ανέβασε το λογότυπό σου</li>
            <li className={business.rewards.length ? 'done' : ''}><Icon name={business.rewards.length ? 'check' : 'gift'} size={16} /> Όρισε τα δώρα που κερδίζουν οι πελάτες</li>
            <li><Icon name="link" size={16} /> Μοίρασε το link ή το QR εγγραφής στους πελάτες</li>
          </ul>
          <Button variant="secondary" onClick={() => onOpenTab('settings')}>Άνοιγμα ρυθμίσεων</Button>
        </aside>
      ) : null}

      <section className="panel">
        <h2>Σάρωση κάρτας</h2>
        <Scanner active={!scan} onCode={lookup} />
        <form className="manual" onSubmit={(event) => { event.preventDefault(); if (manual.trim()) lookup(manual) }}>
          <Field label="Ή γράψε τον αριθμό κάρτας">
            <div className="inline-field">
              <input value={manual} onChange={(event) => setManual(event.target.value.toUpperCase())} maxLength={9} autoCapitalize="characters" autoComplete="off" placeholder="K7Q4-9MZ2" />
              <Button type="submit" busy={busy} onClick={undefined}>Αναζήτηση</Button>
            </div>
          </Field>
        </form>
        <Notice kind="error">{error}</Notice>
      </section>

      <section className="panel">
        <h2>Τελευταίες κινήσεις</h2>
        <ActivityList transactions={transactions} role={identity.role} onUndo={undo} />
      </section>

      {scan ? <MemberSheet business={business} scan={scan} onClose={() => { setScan(null); loadActivity() }} onChanged={loadActivity} /> : null}
      {toastNode}
    </div>
  )
}
