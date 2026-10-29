import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, friendlyError, formatDateTime, unitLabel, KIND_LABELS } from './api.js'
import { BusinessMark, Icon } from './icons.jsx'
import {
  Button, ConfirmSheet, EmptyState, Field, Link, Notice, PageError, QrCode, Screen, Sheet, Spinner, brandStyle, usePageMeta, useToast,
} from './ui.jsx'

const QR_REFRESH_MARGIN_MS = 15_000
const POLL_MS = 15_000

// ---------- πρόοδος προς το επόμενο δώρο ----------

function Progress({ business, member }) {
  const { progress } = member
  const unit = unitLabel(business, progress.next?.remaining ?? 0)
  if (!progress.target) return null
  const full = !progress.next
  const stamps = business.cardStyle === 'stamps' && progress.target <= 20

  return (
    <div className="progress">
      {stamps ? (
        <ol className="stamps" aria-label={`${progress.filled} από ${progress.target}`}>
          {Array.from({ length: progress.target }, (_, index) => (
            <li key={index} className={index < progress.filled ? 'stamp filled' : 'stamp'}>
              {index < progress.filled ? <Icon name={business.icon} size={16} /> : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.target} aria-valuenow={progress.filled}>
          <span style={{ width: `${Math.min(100, (progress.filled / progress.target) * 100)}%` }} />
        </div>
      )}
      <p className="progress-text">
        {full
          ? (progress.availableCount > 1 ? `Έχεις ${progress.availableCount} δώρα έτοιμα!` : 'Έχεις δώρο έτοιμο! Δείξε την κάρτα στο ταμείο.')
          : `Σε ${progress.next.remaining} ${unit}: ${progress.next.name}`}
      </p>
    </div>
  )
}

// ---------- QR που ανανεώνεται ----------

function RotatingQr({ slug }) {
  const [token, setToken] = useState('')
  const [failed, setFailed] = useState(false)
  const timer = useRef(null)

  const load = useCallback(async () => {
    clearTimeout(timer.current)
    try {
      const data = await api(`b/${slug}/qr`)
      setToken(data.token)
      setFailed(false)
      timer.current = setTimeout(load, Math.max(10_000, data.expiresAt - Date.now() - QR_REFRESH_MARGIN_MS))
    } catch {
      setFailed(true)
      timer.current = setTimeout(load, 10_000)
    }
  }, [slug])

  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  return (
    <div className="qr-box">
      <QrCode value={token} label="QR κάρτας" />
      {failed ? <p className="qr-note">Δεν υπάρχει σύνδεση. Θα ξαναδοκιμάσω…</p> : null}
    </div>
  )
}

// ---------- κάρτα ----------

function WalletButtons({ business, onError }) {
  const [busy, setBusy] = useState(false)
  if (!business.wallet.apple && !business.wallet.google) return null
  const addGoogle = async () => {
    setBusy(true)
    try {
      const data = await api(`b/${business.slug}/wallet/google`)
      window.location.href = data.url
    } catch (error) {
      onError(friendlyError(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="wallet-buttons">
      {business.wallet.apple ? <a className="btn btn-dark" href={`/api/b/${business.slug}/wallet/apple`}><Icon name="phone" size={18} /> Apple Wallet</a> : null}
      {business.wallet.google ? <Button variant="dark" busy={busy} icon="phone" onClick={addGoogle}>Google Wallet</Button> : null}
    </div>
  )
}

function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('kerdiseto-install-hint') === '1' } catch { return false }
  })
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (hidden || standalone) return null
  return (
    <aside className="hint">
      <Icon name="share" size={20} />
      <p>{isIos ? 'Πάτα «Κοινοποίηση» και μετά «Προσθήκη στην αρχική οθόνη» για να έχεις την κάρτα πάντα πρόχειρη.' : 'Πρόσθεσε αυτή τη σελίδα στην αρχική οθόνη (μενού του browser) για να έχεις την κάρτα πάντα πρόχειρη.'}</p>
      <button type="button" className="icon-button" aria-label="Κλείσιμο" onClick={() => { setHidden(true); try { localStorage.setItem('kerdiseto-install-hint', '1') } catch { /* ignore */ } }}><Icon name="close" size={18} /></button>
    </aside>
  )
}

function AccountSheet({ business, member, onClose, onChanged, onLoggedOut }) {
  const [name, setName] = useState(member.name)
  const [marketing, setMarketing] = useState(member.marketingOptIn)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await api(`b/${business.slug}/me`, { method: 'PATCH', body: { name, marketingOptIn: marketing } })
      onChanged(data)
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    await api(`b/${business.slug}/logout`, { method: 'POST', body: {} }).catch(() => {})
    onLoggedOut()
  }

  return (
    <Sheet title="Η κάρτα μου" onClose={onClose}>
      <Field label="Όνομα"><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} autoComplete="name" /></Field>
      <p className="muted small">Email: {member.email}</p>
      <label className="check">
        <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
        <span>Θέλω να λαμβάνω προσφορές και νέα από το {business.name}.</span>
      </label>
      <Notice kind="error">{error}</Notice>
      <Button busy={busy} onClick={save}>Αποθήκευση</Button>
      <div className="stack-links">
        <Button variant="ghost" icon="logout" onClick={logout}>Αποσύνδεση από αυτή τη συσκευή</Button>
        <Button variant="ghost-danger" icon="trash" onClick={() => setConfirmDelete(true)}>Διαγραφή της κάρτας μου</Button>
        <a className="muted small" href={`/b/${business.slug}/privacy`} target="_blank" rel="noreferrer">Πολιτική απορρήτου</a>
      </div>
      {confirmDelete ? (
        <ConfirmSheet
          title="Διαγραφή κάρτας"
          message="Θα σβηστούν το όνομα και το email σου και θα χάσεις τους πόντους σου. Αυτό δεν αναιρείται."
          confirmLabel="Ναι, διαγραφή"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api(`b/${business.slug}/me`, { method: 'DELETE', body: {} })
            onLoggedOut()
          }}
        />
      ) : null}
    </Sheet>
  )
}

function CardView({ business, card, onCard, onLoggedOut }) {
  const { member, transactions } = card
  const [showAccount, setShowAccount] = useState(false)
  const [error, setError] = useState('')
  const [toast, toastNode] = useToast()
  const lastPoints = useRef(member.points)

  // Ανανεώνεται μόνη της, ώστε οι πόντοι να εμφανίζονται λίγα δευτερόλεπτα αφού τους δώσει το ταμείο.
  useEffect(() => {
    let stopped = false
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const data = await api(`b/${business.slug}/me`)
        if (!stopped) onCard(data)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) onLoggedOut()
      }
    }
    const interval = setInterval(refresh, POLL_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      stopped = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [business.slug, onCard, onLoggedOut])

  useEffect(() => {
    const diff = member.points - lastPoints.current
    if (diff > 0) toast(`+${diff} ${unitLabel(business, diff)}! 🎉`)
    lastPoints.current = member.points
  }, [member.points, business, toast])

  const ready = member.progress.rewards.filter((reward) => reward.affordable)

  return (
    <Screen className="customer">
      <section className="loyalty-card" style={brandStyle(business)}>
        <header>
          <BusinessMark business={business} size={46} />
          <div>
            <h1>{business.name}</h1>
            {business.tagline ? <p>{business.tagline}</p> : null}
          </div>
          <button type="button" className="icon-button on-brand" onClick={() => setShowAccount(true)} aria-label="Ρυθμίσεις κάρτας"><Icon name="settings" size={22} /></button>
        </header>
        <div className="points">
          <strong>{member.points}</strong>
          <span>{unitLabel(business, member.points)}</span>
        </div>
        <Progress business={business} member={member} />
        <p className="holder">{member.name} · {member.cardNumber}</p>
      </section>

      {ready.length ? (
        <Notice kind="success">Έτοιμο για εξαργύρωση: {ready.map((reward) => reward.name).join(', ')}</Notice>
      ) : null}

      <section className="panel qr-panel">
        <h2>Δείξε το QR στο ταμείο</h2>
        <RotatingQr slug={business.slug} />
        <p className="muted small">Κάθε φορά που επισκέπτεσαι το κατάστημα, το ταμείο σκανάρει την κάρτα και παίρνεις {unitLabel(business, 2)}.</p>
      </section>

      <WalletButtons business={business} onError={setError} />
      <Notice kind="error">{error}</Notice>

      {member.progress.rewards.length ? (
        <section className="panel">
          <h2>Δώρα</h2>
          <ul className="reward-list">
            {member.progress.rewards.map((reward) => (
              <li key={reward.id} className={reward.affordable ? 'is-ready' : ''}>
                <span className="reward-icon"><Icon name={reward.icon} size={22} /></span>
                <div>
                  <strong>{reward.name}</strong>
                  {reward.description ? <small>{reward.description}</small> : null}
                  <div className="bar mini"><span style={{ width: `${Math.min(100, (member.points / reward.cost) * 100)}%` }} /></div>
                </div>
                <span className="reward-cost">{reward.affordable ? 'Έτοιμο ✓' : `${member.points}/${reward.cost}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <h2>Κινήσεις</h2>
        {transactions.length ? (
          <ul className="history">
            {transactions.map((tx) => (
              <li key={tx.id}>
                <div>
                  <strong>{tx.kind === 'redeem' && tx.rewardName ? tx.rewardName : KIND_LABELS[tx.kind] || 'Κίνηση'}</strong>
                  <small>{formatDateTime(tx.createdAt)}</small>
                </div>
                <span className={tx.delta > 0 ? 'delta plus' : 'delta minus'}>{tx.delta > 0 ? `+${tx.delta}` : tx.delta}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={business.icon} title="Καμία κίνηση ακόμα">Η πρώτη σου επίσκεψη θα εμφανιστεί εδώ.</EmptyState>}
      </section>

      <InstallHint />
      <footer className="page-footer">
        <span>{business.name}</span> · <a href={`/b/${business.slug}/privacy`}>Απόρρητο</a> · <span>Κερδίσετο</span>
      </footer>

      {showAccount ? <AccountSheet business={business} member={member} onClose={() => setShowAccount(false)} onChanged={onCard} onLoggedOut={onLoggedOut} /> : null}
      {toastNode}
    </Screen>
  )
}

// ---------- εγγραφή / σύνδεση ----------

function Welcome({ business, children }) {
  const cheapest = business.rewards[0]
  return (
    <section className="welcome" style={brandStyle(business)}>
      <BusinessMark business={business} size={72} />
      <h1>{business.name}</h1>
      {business.tagline ? <p className="tagline">{business.tagline}</p> : null}
      {cheapest ? (
        <p className="offer">
          <Icon name={cheapest.icon} size={18} />
          Μάζεψε {cheapest.cost} {business.unitMany} και κέρδισε: <strong>{cheapest.name}</strong>
        </p>
      ) : <p className="offer">Μάζεψε {business.unitMany} σε κάθε επίσκεψη.</p>}
      {business.welcomePoints > 0 ? <p className="bonus">🎁 {business.welcomePoints} {unitLabel(business, business.welcomePoints)} δώρο με την εγγραφή!</p> : null}
      {children}
    </section>
  )
}

function JoinForm({ business, joinCode, onJoined, onHaveCard }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [terms, setTerms] = useState(false)
  const [marketing, setMarketing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const blocked = business.signupMode === 'closed'
    ? 'Οι νέες εγγραφές είναι προσωρινά κλειστές.'
    : business.signupMode === 'code' && !joinCode ? 'Για να φτιάξεις κάρτα χρειάζεσαι το link που δίνει το κατάστημα (ή το QR στο ταμείο).' : ''

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api(`b/${business.slug}/join`, { method: 'POST', body: { name, email, terms, marketing, code: joinCode } })
      onJoined(data)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h2>Πάρε την κάρτα σου</h2>
      {blocked ? <Notice kind="info">{blocked}</Notice> : (
        <>
          <Field label="Όνομα"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="name" required /></Field>
          <Field label="Email" hint="Για να βρίσκεις την κάρτα σου από άλλο κινητό.">
            <input type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </Field>
          <label className="check">
            <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} required />
            <span>Αποδέχομαι την <a href={`/b/${business.slug}/privacy`} target="_blank" rel="noreferrer">πολιτική απορρήτου</a> και τη χρήση των στοιχείων μου για το πρόγραμμα επιβράβευσης.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} />
            <span>Θέλω να λαμβάνω προσφορές και νέα (προαιρετικό).</span>
          </label>
          <Notice kind="error">{error}</Notice>
          <Button type="submit" busy={busy} onClick={undefined}>Δημιουργία κάρτας</Button>
        </>
      )}
      <button type="button" className="link-button" onClick={onHaveCard}>Έχω ήδη κάρτα</button>
    </form>
  )
}

function LoginForm({ business, onLoggedIn, onBack }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [devCode, setDevCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const request = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api(`b/${business.slug}/login/request`, { method: 'POST', body: { email } })
      setSent(true)
      setDevCode(data.devCode || '')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      onLoggedIn(await api(`b/${business.slug}/login/verify`, { method: 'POST', body: { email, code } }))
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel form" onSubmit={sent ? verify : request}>
      <h2>Βρες την κάρτα σου</h2>
      {!sent ? (
        <>
          <Field label="Email της κάρτας"><input type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></Field>
          <Notice kind="error">{error}</Notice>
          <Button type="submit" busy={busy} onClick={undefined}>Στείλε μου κωδικό</Button>
        </>
      ) : (
        <>
          <p>Αν υπάρχει κάρτα με αυτό το email, στείλαμε έναν 6ψήφιο κωδικό. Ισχύει για 15 λεπτά.</p>
          {devCode ? <Notice kind="info">Δοκιμαστικός κωδικός: <strong>{devCode}</strong></Notice> : null}
          <Field label="Κωδικός"><input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="code-input" required /></Field>
          <Notice kind="error">{error}</Notice>
          <Button type="submit" busy={busy} onClick={undefined}>Σύνδεση</Button>
        </>
      )}
      <button type="button" className="link-button" onClick={onBack}>← Πίσω</button>
    </form>
  )
}

// ---------- ρίζα ----------

export default function CustomerApp({ slug }) {
  const [business, setBusiness] = useState(null)
  const [card, setCard] = useState(null)
  const [state, setState] = useState('loading') // loading | guest | missing | error
  const [mode, setMode] = useState('join')
  const joinCode = new URLSearchParams(window.location.search).get('j') || ''

  const load = useCallback(async () => {
    try {
      const { business: info } = await api(`b/${slug}`)
      setBusiness(info)
      try {
        const data = await api(`b/${slug}/me`)
        setCard(data)
        setBusiness(data.business)
        setState('card')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setState('guest')
          // Ο πελάτης που ήρθε από link εγγραφής βλέπει πρώτα τη φόρμα· αν ήρθε χωρίς link, ίσως έχει ήδη κάρτα.
          setMode(info.signupMode === 'closed' ? 'login' : 'join')
        } else throw error
      }
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? 'missing' : 'error')
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  usePageMeta({
    title: business ? business.name : 'Κάρτα επιβράβευσης',
    color: business?.color,
    manifest: `/api/b/${slug}/manifest`,
    icon: `/api/b/${slug}/icon.png?size=192&v=${business?.logoVersion ?? 0}`,
  })

  const gotCard = useCallback((data) => {
    setCard(data)
    setBusiness(data.business)
    setState('card')
    // Αφαιρούμε το join code από τη διεύθυνση: η κάρτα υπάρχει πια.
    if (window.location.search) window.history.replaceState(null, '', `/b/${slug}`)
  }, [slug])

  const loggedOut = useCallback(() => { setCard(null); setMode('login'); setState('guest') }, [])

  if (state === 'loading') return <Screen className="center"><Spinner /></Screen>
  if (state === 'missing') return <PageError title="Δεν βρέθηκε αυτή η κάρτα">Το link μπορεί να είναι λάθος ή η επιχείρηση να μην υπάρχει πια.</PageError>
  if (state === 'error') {
    return <Screen className="center"><EmptyState icon="close" title="Δεν φόρτωσε"><Button onClick={() => { setState('loading'); load() }}>Δοκίμασε ξανά</Button></EmptyState></Screen>
  }
  if (state === 'card') return <CardView business={business} card={card} onCard={setCard} onLoggedOut={loggedOut} />

  return (
    <Screen className="customer guest">
      <Welcome business={business} />
      {mode === 'join'
        ? <JoinForm business={business} joinCode={joinCode} onJoined={gotCard} onHaveCard={() => setMode('login')} />
        : <LoginForm business={business} onLoggedIn={gotCard} onBack={() => setMode('join')} />}
      <footer className="page-footer">
        <Link to={`/b/${slug}/team`}>Για το προσωπικό</Link> · <a href={`/b/${slug}/privacy`}>Απόρρητο</a> · <span>Κερδίσετο</span>
      </footer>
    </Screen>
  )
}

