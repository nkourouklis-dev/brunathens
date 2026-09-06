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
  sugar: 'medium',
  extras: [],
  label: 'Το δικό μου',
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Request failed')
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
  const [adminMode, setAdminMode] = useState(() => localStorage.getItem('cafe-admin-mode') === 'true')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
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
      setDraft((current) => ({ ...current, productId: String(data.products[0].id) }))
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
    const data = await fetchJson('/api/orders')
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
          },
        }),
      })

      await loadMyOrders()
      setInfo('Η παραγγελία στάλθηκε στον ιδιοκτήτη.')
      setDraft(DEFAULT_DRAFT)
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
    }
  }

  async function handleAdminStatus(orderId, status) {
    await fetchJson(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
    await loadAdminOrders()
    await loadMyOrders()
  }

  const toggleAdminMode = () => {
    const nextValue = !adminMode
    setAdminMode(nextValue)
    localStorage.setItem('cafe-admin-mode', String(nextValue))
  }

  if (!customer) {
    return (
      <main className="app-shell">
        <section className="welcome-card">
          <p className="eyebrow">Coffee Club</p>
          <h1>Τι θα ήθελες να παραγγείλεις σήμερα;</h1>
          <form onSubmit={handleCreateCustomer} className="customer-form">
            <label htmlFor="customer-name">Όνομα / ψευδώνυμο</label>
            <input
              id="customer-name"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="π.χ. Μάριος"
            />
            <button type="submit">Ξεκίνα</button>
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
        <div>
          <p className="eyebrow">Καφετέρια</p>
          <h2>Γεια σου, {customer.name}</h2>
        </div>
        <button type="button" className="ghost-button" onClick={toggleAdminMode}>
          {adminMode ? 'Admin view on' : 'Admin view'}
        </button>
      </header>

      {error ? <p className="message error">{error}</p> : null}
      {info ? <p className="message info">{info}</p> : null}

      <section className="content-grid">
        <div className="left-column">
          <div className="panel">
            <div className="panel-header">
              <h3>Το αγαπημένο σου</h3>
            </div>
            {favorites.length === 0 ? (
              <p className="muted">Δεν έχεις αποθηκευμένα αγαπημένα ακόμη.</p>
            ) : (
              <div className="favorite-list">
                {favorites.map((favorite) => (
                  <div key={favorite.id} className="favorite-item">
                    <div>
                      <strong>{favorite.label}</strong>
                      <small>
                        {favorite.product_name} · {favorite.selected_options?.size || 'double'} ·{' '}
                        {favorite.selected_options?.sugar || 'medium'}
                      </small>
                    </div>
                    <button type="button" onClick={() => handleRepeatFavorite(favorite)}>
                      Παράγγειλε ξανά
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Φτιάξε την παραγγελία σου</h3>
            </div>

            <div className="product-grid">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className={`product-card ${String(product.id) === String(draft.productId) ? 'selected' : ''}`}
                  onClick={() => updateDraft('productId', String(product.id))}
                >
                  <span>{product.name}</span>
                  <small>{product.category}</small>
                </button>
              ))}
            </div>

            {selectedProduct ? (
              <div className="customizer">
                <div className="field-group">
                  <label>Μέγεθος</label>
                  <select value={draft.size} onChange={(event) => updateDraft('size', event.target.value)}>
                    {sizeOptions.map((option) => (
                      <option key={option.id} value={option.option_value}>
                        {option.option_value}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label>Ζάχαρη</label>
                  <select value={draft.sugar} onChange={(event) => updateDraft('sugar', event.target.value)}>
                    {sugarOptions.map((option) => (
                      <option key={option.id} value={option.option_value}>
                        {option.option_value}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label>Extras</label>
                  <div className="extra-list">
                    {extraOptions.map((option) => (
                      <label key={option.id} className="extra-option">
                        <input
                          type="checkbox"
                          checked={draft.extras.includes(option.option_value)}
                          onChange={() => toggleExtra(option.option_value)}
                        />
                        <span>{option.option_value}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="field-group">
                  <label>Όνομα αγαπημένου</label>
                  <input
                    type="text"
                    value={draft.label}
                    onChange={(event) => updateDraft('label', event.target.value)}
                    placeholder="π.χ. Το δικό μου"
                  />
                </div>

                <div className="action-row">
                  <button type="button" className="secondary" onClick={handleSaveFavorite} disabled={isSubmitting}>
                    Αποθήκευση αγαπημένου
                  </button>
                  <button type="button" onClick={handleOrderNow} disabled={isSubmitting}>
                    Παράγγειλε τώρα
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="right-column">
          <div className="panel">
            <div className="panel-header">
              <h3>Οι παραγγελίες μου</h3>
            </div>
            {myOrders.length === 0 ? (
              <p className="muted">Δεν έχεις στείλει παραγγελία ακόμη.</p>
            ) : (
              <div className="order-list">
                {myOrders.map((order) => (
                  <div key={order.id} className="order-item">
                    <div>
                      <strong>{order.product_name}</strong>
                      <small>
                        {order.selected_options?.size || 'double'} · {order.selected_options?.sugar || 'medium'}
                      </small>
                    </div>
                    <span className="status-chip">{STATUS_LABELS[order.status] || order.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {adminMode ? (
            <div className="panel admin-panel">
              <div className="panel-header">
                <h3>Admin</h3>
              </div>
              {allOrders.length === 0 ? (
                <p className="muted">Δεν υπάρχουν εισερχόμενες παραγγελίες.</p>
              ) : (
                <div className="order-list admin-list">
                  {allOrders.map((order) => (
                    <div key={order.id} className="admin-order-item">
                      <div className="order-meta">
                        <strong>{order.customer_name}</strong>
                        <span>{order.product_name}</span>
                        <small>
                          {order.selected_options?.size || 'double'} · {order.selected_options?.sugar || 'medium'} ·{' '}
                          {order.selected_options?.extras?.join(', ') || 'χωρίς extras'}
                        </small>
                        <small>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                      </div>
                      <div className="admin-actions">
                        <button type="button" onClick={() => handleAdminStatus(order.id, 'received')}>Παρέλαβα</button>
                        <button type="button" className="secondary" onClick={() => handleAdminStatus(order.id, 'ready')}>Έτοιμο</button>
                        <button type="button" className="danger" onClick={() => handleAdminStatus(order.id, 'cancelled')}>Ακύρωση</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  )
}

export default App
