import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, friendlyError, formatDateTime, pointsLabel } from './api'
import { BrandLockup, QrCode, Stamps } from './shared'
import { PrivacyPolicy } from './PrivacyPolicy'

const POLL_MS = 4000
const QR_REFRESH_MS = 60_000

function detectPlatform() {
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

function historyLine(entry, rewardName) {
  if (entry.kind === 'earn') return `+${entry.delta} ${pointsLabel(entry.delta)}`
  if (entry.kind === 'redeem') return rewardName
  if (entry.kind === 'reversal') return `Αναίρεση (${entry.delta > 0 ? '+' : ''}${entry.delta})`
  return `Διόρθωση (${entry.delta > 0 ? '+' : ''}${entry.delta})`
}

export default function CustomerApp() {
  const [state, setState] = useState({ status: 'loading' }) // loading | signedOut | ready
  const [config, setConfig] = useState(null)
  const [view, setView] = useState(() => (window.location.pathname.replace(/\/+$/, '') === '/privacy' ? 'privacy' : 'card'))
  const [celebration, setCelebration] = useState(null)
  const previousRef = useRef(null)

  const applyMe = useCallback((data) => {
    const previous = previousRef.current
    if (previous) {
      if (data.member.lifetimePoints > previous.lifetimePoints) {
        const gained = data.member.lifetimePoints - previous.lifetimePoints
        setCelebration({ id: Date.now(), kind: 'earn', text: `+${gained} ${pointsLabel(gained)}! ☕` })
      } else if (data.member.rewardsRedeemed > previous.rewardsRedeemed) {
        setCelebration({ id: Date.now(), kind: 'redeem', text: 'Καλή απόλαυση! 🎉' })
      }
    }
    previousRef.current = data.member
    setState({ status: 'ready', ...data })
  }, [])

  const loadMe = useCallback(async () => {
    try {
      applyMe(await api('/api/loyalty/me'))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        previousRef.current = null
        setState({ status: 'signedOut' })
      } else {
        setState((current) => (current.status === 'loading' ? { status: 'offline' } : current))
      }
    }
  }, [applyMe])

  useEffect(() => {
    void loadMe()
    api('/api/loyalty/config').then(setConfig).catch(() => {})
  }, [loadMe])

  // Live points while the card is on screen, so a scan at the counter shows up at once.
  useEffect(() => {
    if (state.status !== 'ready') return undefined
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadMe()
    }, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void loadMe() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [state.status, loadMe])

  useEffect(() => {
    if (!celebration) return undefined
    navigator.vibrate?.(80)
    const timeout = setTimeout(() => setCelebration(null), 3500)
    return () => clearTimeout(timeout)
  }, [celebration])

  function openPrivacy() {
    window.history.pushState({}, '', '/privacy')
    setView('privacy')
    window.scrollTo(0, 0)
  }

  function closePrivacy() {
    window.history.pushState({}, '', '/')
    setView('card')
    window.scrollTo(0, 0)
  }

  useEffect(() => {
    const onPop = () => setView(window.location.pathname.replace(/\/+$/, '') === '/privacy' ? 'privacy' : 'card')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (view === 'privacy') return <PrivacyPolicy onBack={closePrivacy} />

  if (state.status === 'loading') {
    return <main className="app-shell"><div className="loading-screen"><BrandLockup /></div></main>
  }

  if (state.status === 'offline') {
    return (
      <main className="app-shell">
        <section className="welcome-screen">
          <BrandLockup />
          <h1>Δεν υπάρχει σύνδεση.</h1>
          <p className="muted">Έλεγξε το ίντερνετ και δοκίμασε ξανά.</p>
          <button type="button" className="primary-button" onClick={() => { setState({ status: 'loading' }); void loadMe() }}>Ξανά</button>
        </section>
      </main>
    )
  }

  if (state.status === 'signedOut') {
    return <Welcome config={config} onSignedIn={(member) => { previousRef.current = member; void loadMe() }} onPrivacy={openPrivacy} />
  }

  if (view === 'settings') {
    return (
      <Settings
        member={state.member}
        onBack={() => setView('card')}
        onSaved={(member) => { previousRef.current = member; setState((current) => ({ ...current, member })) }}
        onSignedOut={() => { previousRef.current = null; setView('card'); setState({ status: 'signedOut' }) }}
        onPrivacy={openPrivacy}
      />
    )
  }

  return <CardView data={state} celebration={celebration} onSettings={() => { setView('settings'); window.scrollTo(0, 0) }} />
}

// ---------- Signed out: sign up / sign in ----------

function Welcome({ config, onSignedIn, onPrivacy }) {
  const [mode, setMode] = useState('intro') // intro | signup | login
  const [prefillEmail, setPrefillEmail] = useState('')
  const perReward = config?.pointsPerReward ?? 10
  const rewardName = config?.rewardName ?? 'Δωρεάν καφές'

  if (mode === 'signup') {
    return <SignUp onBack={() => setMode('intro')} onSignedIn={onSignedIn} onPrivacy={onPrivacy} onUseLogin={(email) => { setPrefillEmail(email); setMode('login') }} />
  }
  if (mode === 'login') {
    return <SignIn initialEmail={prefillEmail} emailLogin={config?.emailLogin !== false} onBack={() => setMode('intro')} onSignedIn={onSignedIn} />
  }

  return (
    <main className="app-shell">
      <section className="welcome-screen loyalty-welcome">
        <BrandLockup />
        <p className="welcome-kicker">Η κάρτα επιβράβευσης του BRUN</p>
        <h1>Κάθε καφές μετράει.</h1>
        <div className="welcome-rule">
          <Stamps filled={perReward - 1} total={perReward} />
          <p><strong>1 καφές = 1 πόντος.</strong> Μάζεψε {perReward} και ο επόμενος είναι δικός μας: {rewardName.toLowerCase()}.</p>
        </div>
        <div className="welcome-actions">
          <button type="button" className="primary-button" onClick={() => setMode('signup')}>Φτιάξε την κάρτα σου</button>
          <button type="button" className="ghost-button" onClick={() => setMode('login')}>Έχω ήδη κάρτα</button>
        </div>
      </section>
    </main>
  )
}

function SignUp({ onBack, onSignedIn, onPrivacy, onUseLogin }) {
  const [form, setForm] = useState({ name: '', email: '', favoriteDrink: '', acceptTerms: false, marketingOptIn: false })
  const [error, setError] = useState('')
  const [emailTaken, setEmailTaken] = useState(false)
  const [busy, setBusy] = useState(false)
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  async function submit(event) {
    event.preventDefault()
    setError('')
    setEmailTaken(false)
    if (!form.name.trim()) return setError('Γράψε το όνομά σου.')
    if (!form.acceptTerms) return setError('Για να φτιάξεις κάρτα, αποδέξου τους όρους.')
    setBusy(true)
    try {
      const data = await api('/api/loyalty/signup', { method: 'POST', body: form })
      onSignedIn(data.member)
    } catch (submitError) {
      setError(friendlyError(submitError))
      setEmailTaken(submitError instanceof ApiError && submitError.serverMessage === 'Email already registered')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar"><BrandLockup compact /><button type="button" className="admin-toggle" onClick={onBack}>← Πίσω</button></header>
      <section className="form-screen">
        <p className="welcome-kicker">Νέα κάρτα</p>
        <h1>Φτιάξε την κάρτα σου</h1>
        <form className="customer-form" onSubmit={submit} noValidate>
          <label htmlFor="signup-name">Όνομα</label>
          <input id="signup-name" type="text" autoComplete="given-name" value={form.name} onChange={(event) => update('name', event.target.value)} maxLength={60} placeholder="Πώς να σε φωνάζουμε;" />
          <label htmlFor="signup-email">Email</label>
          <input id="signup-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" value={form.email} onChange={(event) => update('email', event.target.value)} maxLength={254} placeholder="Για να βρίσκεις την κάρτα σου σε άλλο κινητό" />
          <label htmlFor="signup-drink">Ο καφές σου <span className="optional">(προαιρετικό)</span></label>
          <input id="signup-drink" type="text" value={form.favoriteDrink} onChange={(event) => update('favoriteDrink', event.target.value)} maxLength={60} placeholder="π.χ. Freddo espresso σκέτος" />

          <label className="check-row">
            <input type="checkbox" checked={form.acceptTerms} onChange={(event) => update('acceptTerms', event.target.checked)} />
            <span>Αποδέχομαι τους <button type="button" className="inline-link" onClick={onPrivacy}>όρους και την πολιτική απορρήτου</button>.</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={form.marketingOptIn} onChange={(event) => update('marketingOptIn', event.target.checked)} />
            <span>Θέλω να μαθαίνω για προσφορές του BRUN με email. <span className="optional">(προαιρετικό)</span></span>
          </label>

          {error ? <p className="message error inline" role="alert">{error}</p> : null}
          {emailTaken ? <button type="button" className="ghost-button" onClick={() => onUseLogin(form.email)}>Σύνδεση με αυτό το email</button> : null}
          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Μισό λεπτό…' : 'Φτιάξε την κάρτα'}</button>
        </form>
      </section>
    </main>
  )
}

function SignIn({ initialEmail, emailLogin, onBack, onSignedIn }) {
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [devCode, setDevCode] = useState('')
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return undefined
    const timeout = setTimeout(() => setResendIn((value) => value - 1), 1000)
    return () => clearTimeout(timeout)
  }, [resendIn])

  async function requestCode(event) {
    event?.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api('/api/loyalty/login/request', { method: 'POST', body: { email } })
      setDevCode(data.devCode || '')
      setStep('code')
      setResendIn(30)
    } catch (requestError) {
      setError(friendlyError(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function verify(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api('/api/loyalty/login/verify', { method: 'POST', body: { email, code } })
      onSignedIn(data.member)
    } catch (verifyError) {
      setError(friendlyError(verifyError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar"><BrandLockup compact /><button type="button" className="admin-toggle" onClick={onBack}>← Πίσω</button></header>
      <section className="form-screen">
        <p className="welcome-kicker">Έχω ήδη κάρτα</p>
        <h1>{step === 'email' ? 'Βρες την κάρτα σου' : 'Έλεγξε το email σου'}</h1>
        {!emailLogin ? <p className="muted">Η σύνδεση με email ενεργοποιείται σύντομα. Μέχρι τότε, ρώτα στο ταμείο.</p> : null}

        {step === 'email' ? (
          <form className="customer-form" onSubmit={requestCode} noValidate>
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" value={email} onChange={(event) => setEmail(event.target.value)} />
            {error ? <p className="message error inline" role="alert">{error}</p> : null}
            <button type="submit" className="primary-button" disabled={busy || !email.trim()}>{busy ? 'Στέλνεται…' : 'Στείλε μου κωδικό'}</button>
          </form>
        ) : (
          <form className="customer-form" onSubmit={verify} noValidate>
            <p className="muted form-hint">Αν υπάρχει κάρτα με το <strong>{email}</strong>, σου στείλαμε έναν 6ψήφιο κωδικό. Ισχύει 15 λεπτά.</p>
            {devCode ? <p className="dev-hint">Δοκιμαστικό περιβάλλον · κωδικός: <strong>{devCode}</strong></p> : null}
            <label htmlFor="login-code">Κωδικός</label>
            <input id="login-code" className="code-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
            {error ? <p className="message error inline" role="alert">{error}</p> : null}
            <button type="submit" className="primary-button" disabled={busy || code.length !== 6}>{busy ? 'Έλεγχος…' : 'Σύνδεση'}</button>
            <div className="form-links">
              <button type="button" className="text-button" onClick={() => requestCode()} disabled={resendIn > 0 || busy}>{resendIn > 0 ? `Νέος κωδικός σε ${resendIn}″` : 'Στείλε νέο κωδικό'}</button>
              <button type="button" className="text-button" onClick={() => { setStep('email'); setCode(''); setError('') }}>Άλλο email</button>
            </div>
          </form>
        )}
      </section>
    </main>
  )
}

// ---------- Signed in: the card ----------

function CardView({ data, celebration, onSettings }) {
  const { member, history, program, wallet } = data
  const [qr, setQr] = useState(null)
  const [qrError, setQrError] = useState(false)
  const [walletBusy, setWalletBusy] = useState('')
  const [walletError, setWalletError] = useState('')
  const [platform] = useState(detectPlatform)

  const loadQr = useCallback(async () => {
    try {
      setQr(await api('/api/loyalty/qr'))
      setQrError(false)
    } catch {
      setQrError(true)
    }
  }, [])

  useEffect(() => {
    void loadQr()
    const interval = setInterval(() => { if (document.visibilityState === 'visible') void loadQr() }, QR_REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void loadQr() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadQr])

  const qrExpired = qr && qr.expiresAt < Date.now()
  const hasReward = member.rewardsAvailable > 0
  const showApple = wallet.apple && platform !== 'android'
  const showGoogle = wallet.google && platform !== 'ios'

  async function addToGoogle() {
    setWalletError('')
    setWalletBusy('google')
    try {
      const { url } = await api('/api/loyalty/wallet/google')
      window.location.href = url
    } catch (error) {
      setWalletError(friendlyError(error))
    } finally {
      setWalletBusy('')
    }
  }

  return (
    <main className="app-shell card-shell">
      <header className="topbar">
        <BrandLockup compact />
        <button type="button" className="admin-toggle" onClick={onSettings}>Λογαριασμός</button>
      </header>

      {celebration ? <div key={celebration.id} className={`celebration ${celebration.kind}`} role="status">{celebration.text}</div> : null}

      <p className="welcome-kicker">{firstName(member.name)} · μέλος BRUN</p>

      <section className={hasReward ? 'loyalty-card has-reward' : 'loyalty-card'} aria-label="Η κάρτα σου">
        <div className="loyalty-card-head">
          <span className="loyalty-card-brand">BRUN</span>
          <span className="loyalty-card-number">{member.cardNumber}</span>
        </div>
        <div className="loyalty-card-points">
          <strong>{member.progress}</strong><span>/ {program.pointsPerReward}</span>
        </div>
        <Stamps filled={member.progress} total={program.pointsPerReward} highlightLast={celebration?.kind === 'earn'} />
        <p className="loyalty-card-status">
          {hasReward
            ? <><strong>🎁 {member.rewardsAvailable === 1 ? 'Σε περιμένει' : `Σε περιμένουν ${member.rewardsAvailable} ×`} {program.rewardName.toLowerCase()}!</strong> Δείξε το QR στο ταμείο.</>
            : <>Σου {member.pointsToNextReward === 1 ? 'λείπει 1 πόντος' : `λείπουν ${member.pointsToNextReward} πόντοι`} για {program.rewardName.toLowerCase()}.</>}
        </p>
      </section>

      <section className="qr-panel" aria-label="Ο κωδικός σου">
        <div className={qrExpired || qrError ? 'qr-frame is-stale' : 'qr-frame'}>
          <QrCode value={qr?.token} label="QR της κάρτας σου" />
        </div>
        <p className="qr-caption">Δείξε τον κωδικό στο ταμείο σε κάθε καφέ.</p>
        <p className="qr-number">Αριθμός κάρτας <strong>{member.cardNumber}</strong></p>
        {qrError || qrExpired ? <p className="message error inline" role="alert">Ο κωδικός δεν ανανεώθηκε (χωρίς ίντερνετ;). Ο αριθμός κάρτας δουλεύει πάντα.</p> : null}
      </section>

      {showApple || showGoogle ? (
        <section className="wallet-section">
          <p className="section-kicker">Βάλ’ τη στο κινητό</p>
          <div className="wallet-buttons">
            {showApple ? <a className="wallet-button apple" href="/api/loyalty/wallet/apple"><WalletGlyph />Προσθήκη στο Apple Wallet</a> : null}
            {showGoogle ? <button type="button" className="wallet-button google" onClick={addToGoogle} disabled={walletBusy === 'google'}><WalletGlyph />{walletBusy === 'google' ? 'Άνοιγμα…' : 'Προσθήκη στο Google Wallet'}</button> : null}
          </div>
          {walletError ? <p className="message error inline" role="alert">{walletError}</p> : null}
          <p className="muted small">Από το Wallet ανοίγει γρήγορα στο ταμείο, ακόμα και χωρίς ίντερνετ.</p>
        </section>
      ) : null}

      <section className="history-section">
        <div className="section-heading"><div><p className="section-kicker">Ιστορικό</p><h2>Οι κινήσεις σου</h2></div></div>
        {history.length === 0 ? (
          <p className="muted empty-copy">Εδώ θα βλέπεις κάθε πόντο που μαζεύεις.</p>
        ) : (
          <ul className="history-list">
            {history.map((entry) => (
              <li key={entry.id} className={`history-item kind-${entry.kind}`}>
                <span>{historyLine(entry, program.rewardName)}</span>
                <small>{formatDateTime(entry.createdAt)}</small>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small lifetime">Σύνολο: {member.lifetimePoints} {pointsLabel(member.lifetimePoints)} · {member.rewardsRedeemed} {member.rewardsRedeemed === 1 ? 'δώρο' : 'δώρα'}</p>
      </section>
    </main>
  )
}

function WalletGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="14" r="1.4" fill="currentColor" />
    </svg>
  )
}

// ---------- Account settings ----------

function Settings({ member, onBack, onSaved, onSignedOut, onPrivacy }) {
  const [form, setForm] = useState({ name: member.name, favoriteDrink: member.favoriteDrink, marketingOptIn: member.marketingOptIn })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  async function save(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const data = await api('/api/loyalty/me', { method: 'PATCH', body: form })
      onSaved(data.member)
      setMessage('Αποθηκεύτηκε.')
    } catch (saveError) {
      setError(friendlyError(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    try {
      await api('/api/loyalty/logout', { method: 'POST' })
    } finally {
      onSignedOut()
    }
  }

  async function deleteAccount() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    try {
      await api('/api/loyalty/me', { method: 'DELETE' })
      onSignedOut()
    } catch (deleteError) {
      setError(friendlyError(deleteError))
      setBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar"><BrandLockup compact /><button type="button" className="admin-toggle" onClick={onBack}>← Η κάρτα μου</button></header>
      <section className="form-screen">
        <p className="welcome-kicker">Λογαριασμός</p>
        <h1>Τα στοιχεία σου</h1>
        <form className="customer-form" onSubmit={save}>
          <label htmlFor="settings-name">Όνομα</label>
          <input id="settings-name" type="text" value={form.name} onChange={(event) => update('name', event.target.value)} maxLength={60} />
          <label htmlFor="settings-drink">Ο καφές σου</label>
          <input id="settings-drink" type="text" value={form.favoriteDrink} onChange={(event) => update('favoriteDrink', event.target.value)} maxLength={60} placeholder="π.χ. Freddo espresso σκέτος" />
          <label htmlFor="settings-email">Email</label>
          <input id="settings-email" type="email" value={member.email} readOnly disabled />
          <label className="check-row">
            <input type="checkbox" checked={form.marketingOptIn} onChange={(event) => update('marketingOptIn', event.target.checked)} />
            <span>Θέλω να μαθαίνω για προσφορές του BRUN με email.</span>
          </label>
          {message ? <p className="message info inline" role="status">{message}</p> : null}
          {error ? <p className="message error inline" role="alert">{error}</p> : null}
          <button type="submit" className="primary-button" disabled={busy}>Αποθήκευση</button>
        </form>

        <div className="settings-actions">
          <button type="button" className="ghost-button" onClick={signOut}>Αποσύνδεση από αυτή τη συσκευή</button>
          <button type="button" className="text-button" onClick={onPrivacy}>Όροι και πολιτική απορρήτου</button>
          <div className="danger-zone">
            <p className="muted small">Η διαγραφή σβήνει τα στοιχεία σου και τους πόντους σου. Δεν αναιρείται.</p>
            <button type="button" className="danger" onClick={deleteAccount} disabled={busy}>{confirmDelete ? 'Πάτα ξανά για οριστική διαγραφή' : 'Διαγραφή λογαριασμού'}</button>
            {confirmDelete ? <button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>Άκυρο</button> : null}
          </div>
        </div>
      </section>
    </main>
  )
}
