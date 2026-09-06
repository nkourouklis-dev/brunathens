import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const STATUS_LABELS = {
  sent: 'Στάλθηκε',
  received: 'Παραλήφθηκε',
  ready: 'Έτοιμο',
  cancelled: 'Ακυρώθηκε',
}

const DEFAULT_DRAFT = {
  productId: '',
  size: 'double',
  sugar: 'σκέτος',
  extras: [],
  comments: '',
  label: 'Το δικό μου',
}

const LOGO_URL = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3TkNto8gKU7O4gKAKvDbQjSnKJi0XbJ9SbJmLxLOiPA&s=10'
const VAPID_PUBLIC_KEY = 'BMtcf-LV0JtZz6INjs897aGIRCqY6jbbMBSLklyipLp59SzXAR7J9kwOt87lMWTusoWFFbpAduU36WmJ-gLjUEE'

const optionLabels = {
  single: 'Μονό',
  double: 'Διπλό',
  quad: 'Τετραπλό',
  small: 'Μικρό',
  medium: 'Μεσαίο',
  large: 'Μεγάλο',
  'σκέτος': 'Σκέτος',
  'μέτριος': 'Μέτριος',
  'γλυκός': 'Γλυκός',
}

function getOptionLabel(value) {
  return optionLabels[value] || value
}

function formatSize(value) {
  const shotLabels = {
    single: '1 shot',
    double: '2 shots',
    quad: '4 shots',
  }

  return shotLabels[value] || `Μέγεθος ${getOptionLabel(value)}`
}

function formatSugar(value) {
  const sugarLabels = {
    'σκέτος': 'Χωρίς ζάχαρη',
    'μέτριος': 'Μέτρια ζάχαρη',
    'γλυκός': 'Γλυκιά ζάχαρη',
    medium: 'Μέτρια ζάχαρη',
    plain: 'Χωρίς ζάχαρη',
    sweet: 'Γλυκιά ζάχαρη',
  }

  return sugarLabels[value] || value
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)))
}

function formatOrderTime(value) {
  if (!value) return ''

  const normalizedValue = typeof value === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value

  return new Date(normalizedValue).toLocaleString('el-GR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchJson(url, options = {}) {
  const safePath = url.startsWith('/') ? url : `/${url}`
  const response = await fetch(safePath, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${response.status}:${errorText || 'Request failed'}`)
  }

  return response.json()
}

function App() {
  const [products, setProducts] = useState([])
  const [favorites, setFavorites] = useState([])
  const [myOrders, setMyOrders] = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [customer, setCustomer] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [draft, setDraft] = useState(DEFAULT_DRAFT)
  const [orderStep, setOrderStep] = useState(1)
  const [quantity, setQuantity] = useState(1)
  const [adminMode, setAdminMode] = useState(false)
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('brun-admin-token') || '')
  const [adminKey, setAdminKey] = useState('')
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminLoginError, setAdminLoginError] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeRepeatId, setActiveRepeatId] = useState(null)
  const [pushStatus, setPushStatus] = useState('')
  const [pushEnabled, setPushEnabled] = useState(false)
  const deviceIdRef = useRef('')

  useEffect(() => {
    const deviceId = localStorage.getItem('cafe-device-id') || crypto.randomUUID()
    localStorage.setItem('cafe-device-id', deviceId)
    deviceIdRef.current = deviceId

    const savedName = localStorage.getItem('cafe-customer-name')
    if (savedName) {
      setCustomerName(savedName)
      void initializeCustomer(savedName)
    }
  }, [])

  useEffect(() => {
    void loadProducts()
  }, [])

  useEffect(() => {
    if (adminMode) {
      void loadAdminOrders()
      void checkPushSubscription()
      const interval = setInterval(() => {
        void loadAdminOrders()
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [adminMode])

  useEffect(() => {
    if (customer) {
      void loadFavorites()
      void loadMyOrders()
      const interval = setInterval(() => {
        void loadFavorites()
        void loadMyOrders()
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [customer])

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === Number(draft.productId)) ?? products[0],
    [products, draft.productId],
  )

  const orderedProducts = useMemo(() => {
    const order = ['Espresso', 'Freddo Espresso', 'Cappuccino', 'Freddo Cappuccino', 'Iced Latte', 'Americano', 'Flat White', 'Latte', 'Mocha', 'Cold Brew', 'Tea']
    return [...products].sort((first, second) => order.indexOf(first.name) - order.indexOf(second.name))
  }, [products])

  const sizeOptions = selectedProduct
    ? selectedProduct.options.filter((option) => option.option_type === 'size')
    : []
  const sugarOptions = selectedProduct
    ? selectedProduct.options.filter((option) => option.option_type === 'sugar')
    : []
  const extraOptions = selectedProduct
    ? selectedProduct.options.filter((option) => option.option_type === 'extra')
    : []

  async function loadProducts() {
    const data = await fetchJson('/api/products')
    setProducts(data.products)
    if (!draft.productId && data.products.length > 0) {
      const firstProduct = data.products[0]
      const firstSize = firstProduct.options.find((option) => option.option_type === 'size')
      const firstSugar = firstProduct.options.find((option) => option.option_type === 'sugar')
      setDraft((current) => ({
        ...current,
        productId: String(firstProduct.id),
        size: firstSize?.option_value || current.size,
        sugar: firstSugar?.option_value || 'σκέτος',
      }))
    }
  }

  async function initializeCustomer(name) {
    if (!name || !deviceIdRef.current) return

    const data = await fetchJson('/api/customers', {
      method: 'POST',
      body: JSON.stringify({ name, deviceId: deviceIdRef.current }),
    })

    setCustomer(data.customer)
    setError('')
  }

  async function loadFavorites() {
    if (!customer) return
    const data = await fetchJson(`/api/favorites?customerId=${customer.id}`)
    setFavorites(data.favorites)
  }

  async function loadMyOrders() {
    if (!customer) return
    const data = await fetchJson(`/api/orders?customerId=${customer.id}`)
    setMyOrders(data.orders)
  }

  async function loadAdminOrders() {
    if (!adminToken) return
    const data = await fetchJson('/api/orders', { headers: { Authorization: `Bearer ${adminToken}` } })
    setAllOrders(data.orders)
  }

  async function handleCreateCustomer(event) {
    event.preventDefault()
    const trimmedName = customerName.trim()
    if (!trimmedName) {
      setError('Βάλε ένα όνομα για να ξεκινήσεις.')
      return
    }

    localStorage.setItem('cafe-customer-name', trimmedName)
    setInfo('Σου έφτιαξα το προφίλ ...')
    await initializeCustomer(trimmedName)
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function selectProduct(product) {
    const productSizes = product.options.filter((option) => option.option_type === 'size')
    const productSugars = product.options.filter((option) => option.option_type === 'sugar')

    setDraft((current) => ({
      ...current,
      productId: String(product.id),
      size: productSizes.some((option) => option.option_value === current.size)
        ? current.size
        : productSizes[0]?.option_value || '',
      sugar: productSugars.some((option) => option.option_value === current.sugar)
        ? current.sugar
        : productSugars[0]?.option_value || 'σκέτος',
    }))
      setOrderStep(2)
  }

  function toggleExtra(extraValue) {
    setDraft((current) => {
      const currentExtras = current.extras || []
      return {
        ...current,
        extras: currentExtras.includes(extraValue)
          ? currentExtras.filter((value) => value !== extraValue)
          : [...currentExtras, extraValue],
      }
    })
  }

  async function handleSaveFavorite(event) {
    event.preventDefault()
    if (!customer || !selectedProduct) return

    setIsSubmitting(true)
    setError('')

    try {
      const payload = {
        customerId: customer.id,
        productId: selectedProduct.id,
        label: draft.label || selectedProduct.name,
        selectedOptions: {
          size: draft.size,
          sugar: draft.sugar,
          extras: draft.extras || [],
          comments: draft.comments || '',
          quantity,
        },
      }

      await fetchJson('/api/favorites', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setDraft((current) => ({ ...current, label: 'Το δικό μου' }))
      await loadFavorites()
      setInfo('Το αγαπημένο αποθηκεύτηκε.')
    } catch (submittedError) {
      setError(submittedError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleOrderNow() {
    if (!customer || !selectedProduct) return

    setIsSubmitting(true)
    setError('')

    try {
      await fetchJson('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          productId: selectedProduct.id,
          selectedOptions: {
            size: draft.size,
            sugar: draft.sugar,
            extras: draft.extras || [],
            comments: draft.comments || '',
            quantity,
          },
        }),
      })

      await loadMyOrders()
      setInfo('Η παραγγελία στάλθηκε στον ιδιοκτήτη.')
      setDraft(DEFAULT_DRAFT)
      setQuantity(1)
      setOrderStep(1)
      if (products.length > 0) {
        setDraft((current) => ({ ...current, productId: String(products[0].id) }))
      }
    } catch (submittedError) {
      setError(submittedError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRepeatFavorite(favorite) {
    setIsSubmitting(true)
    setActiveRepeatId(favorite.id)
    setError('')
    try {
      await fetchJson('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          productId: favorite.product_id,
          selectedOptions: favorite.selected_options || {},
        }),
      })
      await loadMyOrders()
      setInfo('Παραγγέλθηκε ξανά.')
    } catch (submittedError) {
      setError(submittedError.message)
    } finally {
      setIsSubmitting(false)
      window.setTimeout(() => setActiveRepeatId(null), 650)
    }
  }

  async function handleAdminStatus(orderId, status) {
    await fetchJson(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status }),
    })
    await loadAdminOrders()
    await loadMyOrders()
  }

  async function handleDeleteOrder(orderId) {
    await fetchJson(`/api/orders/${orderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    await loadAdminOrders()
  }

  async function handleAdminLogin(event) {
    event.preventDefault()
    setAdminLoginError('')
    try {
      const data = await fetchJson('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ key: adminKey }),
      })
      localStorage.setItem('brun-admin-token', data.token)
      setAdminToken(data.token)
      setAdminKey('')
      setShowAdminLogin(false)
      setAdminMode(true)
    } catch (loginError) {
      setAdminLoginError(loginError.message.includes('401') || loginError.message.includes('Λάθος')
        ? 'Λάθος κωδικός διαχείρισης. Έλεγξε κεφαλαία, μικρά και κενά.'
        : 'Δεν έγινε σύνδεση. Δοκίμασε ξανά.')
    }
  }

  async function enableAdminNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('Οι ειδοποιήσεις δεν υποστηρίζονται σε αυτόν τον browser.')
      return
    }

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushStatus('Η άδεια ειδοποιήσεων δεν ενεργοποιήθηκε.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      await fetchJson('/api/push-subscriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(subscription.toJSON()),
      })
      setPushEnabled(true)
      setPushStatus('Οι ειδοποιήσεις ενεργοποιήθηκαν σε αυτή τη συσκευή.')
    } catch (notificationError) {
      setPushStatus(`Δεν ενεργοποιήθηκαν οι ειδοποιήσεις: ${notificationError.message}`)
    }
  }

  async function checkPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    try {
      const registration = await navigator.serviceWorker.ready
      setPushEnabled(Boolean(await registration.pushManager.getSubscription()))
    } catch {
      setPushEnabled(false)
    }
  }

  const toggleAdminMode = () => {
    if (!adminMode && !adminToken) {
      setShowAdminLogin(true)
      return
    }

    const nextValue = !adminMode
    setAdminMode(nextValue)
    window.setTimeout(() => {
      if (nextValue) {
        document.getElementById('admin-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 0)
  }

  function changeCustomerName() {
    localStorage.removeItem('cafe-customer-name')
    setCustomer(null)
    setCustomerName('')
    setInfo('')
    setError('')
  }

  const favoriteHeroOptions = favorites[0] && selectedProduct?.id === favorites[0].product_id
    ? draft
    : favorites[0]?.selected_options || {}

  if (customer && adminMode) {
    return (
      <main className="app-shell admin-shell">
        <header className="topbar">
          <a href="/" className="brand-lockup compact" aria-label="BRUN αρχική">
            <img src={LOGO_URL} alt="BRUN" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling.style.display = 'inline' }} />
            <span>BRUN</span>
          </a>
          <button type="button" className="admin-toggle" onClick={toggleAdminMode}>Έξοδος</button>
        </header>

        <section id="admin-panel" className="admin-only-panel">
          <div className="admin-title">
            <p className="section-kicker">Ιδιοκτήτης BRUN</p>
            <h1>Διαχείριση παραγγελιών</h1>
            <p>Εδώ βλέπεις μόνο τις ενεργές παραγγελίες του bar.</p>
          </div>
          {!pushEnabled ? <div className="push-settings">
            <button type="button" className="primary-button push-button" onClick={enableAdminNotifications}>Ενεργοποίηση ειδοποιήσεων</button>
            <p>Σε iPhone/iPad: πρόσθεσε πρώτα το BRUN στην αρχική οθόνη από Share → Add to Home Screen.</p>
            {pushStatus ? <strong>{pushStatus}</strong> : null}
          </div> : null}
          {allOrders.length === 0 ? <p className="muted empty-copy">Δεν υπάρχουν ενεργές παραγγελίες.</p> : <div className="order-list admin-list">{allOrders.map((order) => <div key={order.id} className="admin-order-item"><div className="order-meta"><strong>{order.customer_name}</strong><span>{order.product_name}</span><small>{formatSize(order.selected_options?.size || 'double')} · {formatSugar(order.selected_options?.sugar || 'μέτριος')} · {order.selected_options?.extras?.join(', ') || 'χωρίς extras'}</small>{order.selected_options?.comments ? <small>Σχόλιο: {order.selected_options.comments}</small> : null}<small>{formatOrderTime(order.created_at)}</small></div><div className="admin-actions"><button type="button" className="secondary" onClick={() => handleAdminStatus(order.id, 'ready')}>Έτοιμη</button><button type="button" className="danger" onClick={() => handleDeleteOrder(order.id)}>Διαγραφή</button></div></div>)}</div>}
        </section>
      </main>
    )
  }

  if (!customer) {
    return (
      <main className="app-shell">
        <section className="welcome-screen">
          <a href="/" className="brand-lockup" aria-label="BRUN αρχική">
            <img src={LOGO_URL} alt="BRUN" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling.style.display = 'inline' }} />
            <span>BRUN</span>
          </a>
          <p className="welcome-kicker">Ο καφές σου, όπως τον θέλεις</p>
          <h1>Πάμε να φτιάξουμε τον καφέ που προτιμάς.</h1>
          <form onSubmit={handleCreateCustomer} className="customer-form">
            <label htmlFor="customer-name">Πώς να σε φωνάζουμε;</label>
            <input
              id="customer-name"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Γράψε το όνομά σου"
            />
            <button type="submit" className="primary-button">Ξεκίνα</button>
          </form>
          {error ? <p className="message error">{error}</p> : null}
          {info ? <p className="message info">{info}</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="/" className="brand-lockup compact" aria-label="BRUN αρχική">
          <img src={LOGO_URL} alt="BRUN" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling.style.display = 'inline' }} />
          <span>BRUN</span>
        </a>
        <div className="header-actions">
          <button type="button" className="admin-toggle" onClick={changeCustomerName}>Άλλαξε όνομα</button>
          <button type="button" className="admin-toggle" onClick={toggleAdminMode} aria-label={adminMode ? 'Κλείσε διαχείριση' : 'Άνοιξε διαχείριση'}>
            {adminMode ? 'Κλείσε διαχείριση' : 'Άνοιξε διαχείριση'}
          </button>
        </div>
      </header>

      {showAdminLogin ? <form className="admin-login" onSubmit={handleAdminLogin}>
        <div>
          <p className="section-kicker">Ιδιοκτήτης BRUN</p>
          <h2>Σύνδεση διαχείρισης</h2>
          <p>Ο κωδικός διαχείρισης είναι μόνο για τον ιδιοκτήτη.</p>
        </div>
        <input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Κωδικός διαχείρισης" autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
        <div className="admin-login-actions"><button type="submit" className="primary-button">Σύνδεση</button><button type="button" className="text-button" onClick={() => setShowAdminLogin(false)}>Άκυρο</button></div>
        {adminLoginError ? <p className="message error">{adminLoginError}</p> : null}
      </form> : null}

      {error ? <p className="message error">{error}</p> : null}
      {info ? <p className="message info">{info}</p> : null}

      <section className="home-view">
        <div className="greeting">
          <p className="welcome-kicker">Καλημέρα, {customer.name}</p>
          <h1>Ο καφές σου<br />είναι εδώ.</h1>
        </div>

        <section className="favorite-hero">
          <div className="hero-bean" aria-hidden="true">●</div>
          <p className="hero-kicker">Καφεδάρα και σήμερα</p>
          {favorites.length > 0 ? (
            <>
              <h2>{favorites[0].product_name}</h2>
              <p className="hero-detail">
                {formatSize(favoriteHeroOptions.size || 'double')} · {formatSugar(favoriteHeroOptions.sugar || 'σκέτος')}
              </p>
              <button
                type="button"
                className={`repeat-button ${activeRepeatId === favorites[0].id ? 'is-ordered' : ''}`}
                onClick={() => handleRepeatFavorite(favorites[0])}
                disabled={isSubmitting}
              >
                {activeRepeatId === favorites[0].id ? 'Μπήκε στην παραγγελία' : 'Παράγγειλε ξανά'}
              </button>
            </>
          ) : (
            <>
              <h2>Διάλεξε τον πρώτο σου καφέ</h2>
              <p className="hero-detail">Φτιάξ’ τον όπως σου αρέσει και κράτησέ τον για μετά.</p>
              <button type="button" className="repeat-button" onClick={() => { setOrderStep(1); document.getElementById('order-builder')?.scrollIntoView({ behavior: 'smooth' }) }}>
                Φτιάξε τον καφέ σου
              </button>
            </>
          )}
        </section>

        <section className="order-builder" id="order-builder">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Βήμα {orderStep} από 3</p>
              <h2>{orderStep === 1 ? 'Διάλεξε καφέ' : orderStep === 2 ? 'Φτιάξ’ τον όπως θέλεις' : 'Έτοιμος για παραγγελία;'}</h2>
            </div>
          </div>

          <div className="order-steps" aria-label="Βήματα παραγγελίας">
            {[['01', 'Καφές'], ['02', 'Γεύση'], ['03', 'Τέλος']].map(([step, label], index) => (
              <button key={step} type="button" className={orderStep === index + 1 ? 'step-marker active' : orderStep > index + 1 ? 'step-marker complete' : 'step-marker'} onClick={() => index + 1 < orderStep && setOrderStep(index + 1)} disabled={index + 1 > orderStep}>
                <span>{step}</span>{label}
              </button>
            ))}
          </div>

          {orderStep === 1 ? (
            <div className="product-grid">
              {orderedProducts.map((product) => (
                <button key={product.id} type="button" className={`product-card ${String(product.id) === String(draft.productId) ? 'selected' : ''}`} onClick={() => selectProduct(product)}>
                  {product.image ? <img src={product.image} alt="" className="product-image" loading="lazy" /> : <span className="product-image fallback-image" aria-hidden="true" />}
                  <span className="product-card-name">{product.name}</span>
                  <span className="product-card-category">{product.category === 'cold' || product.name.toLowerCase().includes('freddo') ? 'Κρύος' : product.category === 'tea' ? 'Τσάι' : 'Ζεστός'}</span>
                </button>
              ))}
            </div>
          ) : null}

          {orderStep === 2 && selectedProduct ? (
            <div className="customizer">
              <div className="selected-product-line"><strong>{selectedProduct.name}</strong><button type="button" className="text-button" onClick={() => setOrderStep(1)}>Άλλαξε καφέ</button></div>
              <div className="field-group"><label>Μέγεθος</label><div className="choice-grid">{sizeOptions.map((option) => <button key={option.id} type="button" className={draft.size === option.option_value ? 'choice selected' : 'choice'} onClick={() => updateDraft('size', option.option_value)}>{getOptionLabel(option.option_value)}</button>)}</div></div>
              <div className="field-group"><label>Ζάχαρη</label><div className="choice-grid">{sugarOptions.map((option) => <button key={option.id} type="button" className={draft.sugar === option.option_value ? 'choice selected' : 'choice'} onClick={() => updateDraft('sugar', option.option_value)}>{getOptionLabel(option.option_value)}</button>)}</div></div>
              <div className="field-group"><label>Κάτι ακόμη;</label><div className="choice-grid extras-grid">{extraOptions.map((option) => <button key={option.id} type="button" className={draft.extras.includes(option.option_value) ? 'choice selected' : 'choice'} onClick={() => toggleExtra(option.option_value)}>{draft.extras.includes(option.option_value) ? '✓ ' : '+ '}{option.option_value}</button>)}</div></div>
              <div className="action-row single-action"><button type="button" className="primary-button order-button" onClick={() => setOrderStep(3)}>Συνέχεια</button></div>
            </div>
          ) : null}

          {orderStep === 3 && selectedProduct ? (
            <div className="customizer">
              <div className="review-line"><div><p className="section-kicker">Η επιλογή σου</p><strong>{selectedProduct.name}</strong><small>{formatSize(draft.size)} · {formatSugar(draft.sugar)}{draft.extras.length ? ` · ${draft.extras.join(', ')}` : ''}</small></div><button type="button" className="text-button" onClick={() => setOrderStep(2)}>Επεξεργασία</button></div>
              <div className="field-group"><label htmlFor="quantity-value">Πόσα θέλεις;</label><div className="quantity-stepper"><button type="button" className="quantity-control" onClick={() => setQuantity((current) => Math.max(1, current - 1))} disabled={quantity <= 1} aria-label="Μείωσε ποσότητα">−</button><output id="quantity-value" className="quantity-value">{quantity}</output><button type="button" className="quantity-control" onClick={() => setQuantity((current) => Math.min(20, current + 1))} disabled={quantity >= 20} aria-label="Αύξησε ποσότητα">+</button><span className="quantity-unit">{quantity === 1 ? 'τεμάχιο' : 'τεμάχια'}</span></div></div>
              <div className="favorite-name"><label htmlFor="order-comments">Σχόλια για την παραγγελία</label><textarea id="order-comments" value={draft.comments} onChange={(event) => updateDraft('comments', event.target.value)} placeholder="π.χ. χωρίς καλαμάκι" rows="3" /></div>
              <div className="favorite-name"><label htmlFor="favorite-label">Όνομα για να τον ξαναβρείς</label><input id="favorite-label" type="text" value={draft.label} onChange={(event) => updateDraft('label', event.target.value)} placeholder="π.χ. Το πρωινό μου" /></div>
              <div className="action-row"><button type="button" className="save-button" onClick={handleSaveFavorite} disabled={isSubmitting}>Κράτησέ τον</button><button type="button" className="primary-button order-button" onClick={handleOrderNow} disabled={isSubmitting}>Παράγγειλε τώρα</button></div>
            </div>
          ) : null}
        </section>

        <section className="orders-section">
          <div className="section-heading"><div><p className="section-kicker">Η πορεία σου</p><h2>Οι παραγγελίες σου</h2></div></div>
          {myOrders.length === 0 ? <p className="muted empty-copy">Η πρώτη σου παραγγελία είναι μερικά πατήματα μακριά.</p> : <div className="order-list">{myOrders.map((order) => <div key={order.id} className="order-item"><div><strong>{order.product_name}</strong><small>{formatSize(order.selected_options?.size || 'double')} · {formatSugar(order.selected_options?.sugar || 'μέτριος')}</small><small>Παραγγελία στις {formatOrderTime(order.created_at)}</small></div><span className="status-chip">{STATUS_LABELS[order.status] || order.status}</span></div>)}</div>}
        </section>

        {adminMode ? <section id="admin-panel" className="orders-section admin-panel"><div className="section-heading"><div><p className="section-kicker">Ιδιοκτήτης BRUN</p><h2>Διαχείριση παραγγελιών</h2></div></div><div className="push-settings"><button type="button" className="primary-button push-button" onClick={enableAdminNotifications}>Ενεργοποίηση ειδοποιήσεων</button><p>Σε iPhone/iPad: πρόσθεσε πρώτα το BRUN στην αρχική οθόνη από Share → Add to Home Screen.</p>{pushStatus ? <strong>{pushStatus}</strong> : null}</div>{allOrders.length === 0 ? <p className="muted empty-copy">Δεν υπάρχουν ενεργές παραγγελίες.</p> : <div className="order-list admin-list">{allOrders.map((order) => <div key={order.id} className="admin-order-item"><div className="order-meta"><strong>{order.customer_name}</strong><span>{order.product_name}</span><small>{formatSize(order.selected_options?.size || 'double')} · {formatSugar(order.selected_options?.sugar || 'μέτριος')} · {order.selected_options?.extras?.join(', ') || 'χωρίς extras'}</small>{order.selected_options?.comments ? <small>Σχόλιο: {order.selected_options.comments}</small> : null}<small>{formatOrderTime(order.created_at)}</small></div><div className="admin-actions"><button type="button" className="secondary" onClick={() => handleAdminStatus(order.id, 'ready')}>Έτοιμη</button><button type="button" className="danger" onClick={() => handleDeleteOrder(order.id)}>Διαγραφή</button></div></div>)}</div>}</section> : null}
      </section>
    </main>
  )
}

export default App
