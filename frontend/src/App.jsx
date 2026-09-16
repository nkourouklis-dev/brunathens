import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { isStoreOpen, getNextOpeningTime, maxPickupAheadMinutes } from './utils/storeHours'

const STATUS_LABELS = {
  sent: 'Στάλθηκε',
  received: 'Ετοιμάζεται',
  ready: 'Έτοιμο',
  completed: 'Παραδόθηκε',
  cancelled: 'Ακυρώθηκε',
}

const ACTIVE_STATUSES = ['sent', 'received', 'ready']
const ACTIVE_ORDER_MAX_AGE_MS = 6 * 60 * 60 * 1000
const DUE_SOON_MS = 10 * 60 * 1000
const MAX_QUANTITY = 20

const NEXT_ADMIN_ACTION = {
  sent: ['received', 'Παραλήφθηκε'],
  received: ['ready', 'Έτοιμη'],
  ready: ['completed', 'Παραδόθηκε'],
}

const DEFAULT_DRAFT = {
  productId: '',
  size: 'double',
  sugar: 'σκέτος',
  extras: [],
  comments: '',
  label: 'Το δικό μου',
}

const PICKUP_OFFSETS = [
  ['15', 'Σε 15 λεπτά'],
  ['30', 'Σε 30 λεπτά'],
  ['45', 'Σε 45 λεπτά'],
  ['60', 'Σε 1 ώρα'],
]

const PRODUCT_FILTERS = [
  ['all', 'Όλα'],
  ['hot', 'Ζεστοί'],
  ['cold', 'Κρύοι'],
  ['tea', 'Τσάι'],
]

const PRODUCT_KIND_LABELS = { hot: 'Ζεστός', cold: 'Κρύος', tea: 'Τσάι' }

const PRODUCT_ORDER = ['Espresso', 'Freddo Espresso', 'Cappuccino', 'Freddo Cappuccino', 'Iced Latte', 'Americano', 'Flat White', 'Latte', 'Mocha', 'Cold Brew', 'Tea']

// Server error codes → what the customer or owner should read.
const ERROR_MESSAGES = {
  'Invalid pickup time': 'Η ώρα παραλαβής δεν ισχύει. Διάλεξε ξανά.',
  'Pickup time out of range': 'Η ώρα παραλαβής πέρασε. Διάλεξε ξανά.',
  'Pickup time too far ahead': 'Η παραλαβή μπορεί να είναι έως 1 ώρα από τώρα.',
  'Pickup after closing': 'Η ώρα παραλαβής είναι μετά το κλείσιμο. Διάλεξε νωρίτερα.',
  'Invalid order items': 'Κάτι δεν πάει καλά με το καλάθι. Έλεγξε τις ποσότητες.',
  'Unknown product': 'Κάποιο προϊόν δεν είναι πια διαθέσιμο. Αφαίρεσέ το από το καλάθι.',
  'Unknown customer': 'Δεν βρέθηκε το προφίλ σου. Πάτα «Άλλαξε όνομα» και ξαναδοκίμασε.',
  'Missing customer': 'Δεν βρέθηκε το προφίλ σου. Πάτα «Άλλαξε όνομα» και ξαναδοκίμασε.',
  'Missing customer, product or label': 'Δώσε ένα όνομα στο αγαπημένο σου.',
  'Admin authorization required': 'Η σύνδεση διαχείρισης έληξε. Συνδέσου ξανά.',
  'Order not found': 'Η παραγγελία δεν υπάρχει πια.',
  'Favorite not found': 'Το αγαπημένο δεν υπάρχει πια.',
  'Store is closed': 'Το κατάστημα είναι κλειστό αυτή τη στιγμή.',
}

const LOGO_URL = '/brun-logo.jpg'
const VAPID_PUBLIC_KEY = 'BMtcf-LV0JtZz6INjs897aGIRCqY6jbbMBSLklyipLp59SzXAR7J9kwOt87lMWTusoWFFbpAduU36WmJ-gLjUEE'
const CART_STORAGE_KEY = 'brun-cart'
const CUSTOMER_PUSH_STORAGE_KEY = 'brun-customer-push'

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

function formatItemOptions(options = {}) {
  return [
    options.size ? formatSize(options.size) : '',
    options.sugar ? formatSugar(options.sugar) : '',
    ...(options.extras || []),
  ].filter(Boolean).join(' · ')
}

function summarizeItems(items = []) {
  return items.map((item) => `${item.quantity} × ${item.product_name}`).join(', ')
}

function countItems(items = []) {
  return items.reduce((total, item) => total + (Number(item.quantity) || 0), 0)
}

function pluralizeItems(count) {
  return count === 1 ? '1 προϊόν' : `${count} προϊόντα`
}

function getProductKind(product) {
  if (product.category === 'cold' || product.name.toLowerCase().includes('freddo')) return 'cold'
  if (product.category === 'tea') return 'tea'
  return 'hot'
}

function toCartOptions(options = {}) {
  return {
    size: options.size || '',
    sugar: options.sugar || '',
    extras: options.extras || [],
    comments: (options.comments || '').trim(),
  }
}

function readStoredCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]')
    return Array.isArray(stored)
      ? stored.filter((item) => item?.key && Number(item.productId) && Number(item.quantity) > 0)
      : []
  } catch {
    return []
  }
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)))
}

// SQLite CURRENT_TIMESTAMP values are UTC without a zone marker.
function parseServerDate(value) {
  if (!value) return null

  const normalizedValue = typeof value === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  const date = new Date(normalizedValue)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatClock(date) {
  return date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

function formatOrderTime(value) {
  const date = parseServerDate(value)
  if (!date) return ''

  return date.toLocaleString('el-GR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPickupTime(value) {
  if (!value) return 'Άμεσα'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return formatClock(date)
}

function formatPickupLine(value) {
  return value ? `Παραλαβή στις ${formatPickupTime(value)}` : 'Παραλαβή άμεσα'
}

function getGreeting(date) {
  return date.getHours() < 13 ? 'Καλημέρα' : 'Καλησπέρα'
}

class ApiError extends Error {
  constructor(status, serverMessage) {
    super(serverMessage || `Request failed (${status})`)
    this.status = status
    this.serverMessage = serverMessage
  }
}

async function fetchJson(url, options = {}) {
  const safePath = url.startsWith('/') ? url : `/${url}`
  const response = await fetch(safePath, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })

  if (!response.ok) {
    let serverMessage = ''
    try {
      serverMessage = (await response.json()).error || ''
    } catch {
      // Non-JSON error body
    }
    throw new ApiError(response.status, serverMessage)
  }

  return response.json()
}

function friendlyError(error) {
  if (!(error instanceof ApiError)) return 'Δεν υπάρχει σύνδεση. Έλεγξε το ίντερνετ και δοκίμασε ξανά.'
  if (ERROR_MESSAGES[error.serverMessage]) return ERROR_MESSAGES[error.serverMessage]
  if (error.status >= 500) return 'Κάτι πήγε στραβά σε εμάς. Δοκίμασε ξανά σε λίγο.'
  return 'Κάτι δεν πήγε καλά. Δοκίμασε ξανά.'
}

async function getPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('unsupported')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('denied')

  const registration = await navigator.serviceWorker.ready
  return await registration.pushManager.getSubscription() || registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
}

function pushErrorMessage(error) {
  if (error instanceof ApiError) return friendlyError(error)
  if (error.message === 'unsupported') return 'Σε iPhone/iPad πρόσθεσε πρώτα το BRUN στην αρχική οθόνη (Share → Add to Home Screen).'
  if (error.message === 'denied') return 'Οι ειδοποιήσεις είναι κλειστές από τις ρυθμίσεις του browser.'
  return 'Δεν ενεργοποιήθηκαν οι ειδοποιήσεις. Δοκίμασε ξανά.'
}

function BrandLockup({ compact = false }) {
  return (
    <a href="/" className={compact ? 'brand-lockup compact' : 'brand-lockup'} aria-label="BRUN αρχική">
      <img src={LOGO_URL} alt="BRUN" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling.style.display = 'inline' }} />
      <span>BRUN</span>
    </a>
  )
}

function App() {
  const [products, setProducts] = useState([])
  const [favorites, setFavorites] = useState([])
  const [myOrders, setMyOrders] = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [customer, setCustomer] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [view, setView] = useState('menu')
  const [productFilter, setProductFilter] = useState('all')
  const [draft, setDraft] = useState(DEFAULT_DRAFT)
  const [quantity, setQuantity] = useState(1)
  const [showComments, setShowComments] = useState(false)
  const [isNamingFavorite, setIsNamingFavorite] = useState(false)
  const [cart, setCart] = useState(readStoredCart)
  const [pickupMode, setPickupMode] = useState('now')
  const [pickupOffset, setPickupOffset] = useState('15')
  const [lastOrder, setLastOrder] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  // The owner's app lives at /admin, with its own manifest so it gets its own home-screen icon
  // (iOS home-screen apps don't share storage with Safari). ?admin=true is kept for old links.
  const [isAdminApp] = useState(() => window.location.pathname.replace(/\/+$/, '') === '/admin' || new URLSearchParams(window.location.search).has('admin'))
  const [adminTab, setAdminTab] = useState('active')
  // Destructive buttons need a second tap: holds e.g. 'order:12' or 'favorite:3' for 4 seconds.
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('brun-admin-token') || '')
  const [adminKey, setAdminKey] = useState('')
  const [adminLoginError, setAdminLoginError] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pushStatus, setPushStatus] = useState('')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [customerPushState, setCustomerPushState] = useState('unknown')
  const [customerPushMessage, setCustomerPushMessage] = useState('')
  const deviceIdRef = useRef('')

  useEffect(() => {
    const deviceId = localStorage.getItem('cafe-device-id') || crypto.randomUUID()
    localStorage.setItem('cafe-device-id', deviceId)
    deviceIdRef.current = deviceId

    const savedName = localStorage.getItem('cafe-customer-name')
    if (savedName && !isAdminApp) {
      setCustomerName(savedName)
      void initializeCustomer(savedName).catch((initError) => setError(friendlyError(initError)))
    }
  }, [])

  useEffect(() => {
    void loadProducts()
    const interval = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    if (!info) return
    const timeout = setTimeout(() => setInfo(''), 4000)
    return () => clearTimeout(timeout)
  }, [info])

  useEffect(() => {
    if (isAdminApp && adminToken) {
      void loadAdminOrders()
      void checkPushSubscription()
      const interval = setInterval(() => {
        void loadAdminOrders()
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [isAdminApp, adminToken])

  useEffect(() => {
    if (customer) {
      void loadFavorites()
      void loadMyOrders()
      void refreshCustomerPushState(customer.id)
      const interval = setInterval(() => {
        void loadFavorites()
        void loadMyOrders()
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [customer])

  const storeOpen = useMemo(() => isStoreOpen(new Date(now)), [now])
  const pickupOffsets = useMemo(() => {
    const limit = maxPickupAheadMinutes(new Date(now))
    return PICKUP_OFFSETS.filter(([value]) => Number(value) <= limit)
  }, [now])
  const effectivePickupOffset = pickupOffsets.some(([value]) => value === pickupOffset)
    ? pickupOffset
    : pickupOffsets.at(-1)?.[0] ?? null
  const effectivePickupMode = pickupMode === 'later' && effectivePickupOffset ? 'later' : 'now'

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const selectedProduct = productsById.get(Number(draft.productId))

  const orderedProducts = useMemo(
    () => [...products].sort((first, second) => PRODUCT_ORDER.indexOf(first.name) - PRODUCT_ORDER.indexOf(second.name)),
    [products],
  )
  const visibleProducts = productFilter === 'all'
    ? orderedProducts
    : orderedProducts.filter((product) => getProductKind(product) === productFilter)

  const sizeOptions = selectedProduct ? selectedProduct.options.filter((option) => option.option_type === 'size') : []
  const sugarOptions = selectedProduct ? selectedProduct.options.filter((option) => option.option_type === 'sugar') : []
  const extraOptions = selectedProduct ? selectedProduct.options.filter((option) => option.option_type === 'extra') : []

  const cartItems = cart
    .filter((item) => productsById.has(item.productId))
    .map((item) => ({ ...item, product: productsById.get(item.productId) }))
  const cartCount = countItems(cartItems)

  const isActiveOrder = (order) => ACTIVE_STATUSES.includes(order.status)
    && now - (parseServerDate(order.created_at)?.getTime() ?? 0) < ACTIVE_ORDER_MAX_AGE_MS
  const activeOrders = myOrders.filter((order) => isActiveOrder(order) && !(view === 'sent' && order.id === lastOrder?.id))
  const pastOrders = myOrders.filter((order) => !isActiveOrder(order))

  const pickupSummary = effectivePickupMode === 'later'
    ? `Παραλαβή ${formatClock(new Date(now + Number(effectivePickupOffset) * 60_000))}`
    : 'Παραλαβή άμεσα'

  const orderDueTime = (order) => (order.pickup_time ? new Date(order.pickup_time) : parseServerDate(order.created_at))?.getTime() ?? 0
  const isDueSoon = (order) => order.status !== 'ready' && orderDueTime(order) - now <= DUE_SOON_MS
  const adminActiveOrders = allOrders
    .filter((order) => ACTIVE_STATUSES.includes(order.status))
    .sort((first, second) => orderDueTime(first) - orderDueTime(second))
  const adminDoneOrders = allOrders.filter((order) => !ACTIVE_STATUSES.includes(order.status))

  function scrollToBuilder() {
    window.setTimeout(() => document.getElementById('order-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function loadProducts() {
    try {
      const data = await fetchJson('/api/products')
      setProducts(data.products)
    } catch (loadError) {
      setError(friendlyError(loadError))
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
    try {
      const data = await fetchJson(`/api/favorites?customerId=${customer.id}`)
      setFavorites(data.favorites)
    } catch {
      // Polling: keep the last known favorites
    }
  }

  async function loadMyOrders() {
    if (!customer) return
    try {
      const data = await fetchJson(`/api/orders?customerId=${customer.id}`)
      setMyOrders(data.orders)
    } catch {
      // Polling: keep the last known orders
    }
  }

  async function loadAdminOrders() {
    if (!adminToken) return
    try {
      const data = await fetchJson('/api/orders', { headers: { Authorization: `Bearer ${adminToken}` } })
      setAllOrders(data.orders)
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) handleAdminError(loadError)
    }
  }

  function handleAdminError(adminError) {
    if (adminError instanceof ApiError && adminError.status === 401) {
      localStorage.removeItem('brun-admin-token')
      setAdminToken('')
      setAdminLoginError(friendlyError(adminError))
      return
    }
    setError(friendlyError(adminError))
  }

  async function handleCreateCustomer(event) {
    event.preventDefault()
    const trimmedName = customerName.trim()
    if (!trimmedName) {
      setError('Βάλε ένα όνομα για να ξεκινήσεις.')
      return
    }

    localStorage.setItem('cafe-customer-name', trimmedName)
    try {
      await initializeCustomer(trimmedName)
    } catch (createError) {
      setError(friendlyError(createError))
    }
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function selectProduct(product) {
    const productSizes = product.options.filter((option) => option.option_type === 'size')
    const productSugars = product.options.filter((option) => option.option_type === 'sugar')

    setDraft((current) => ({
      ...DEFAULT_DRAFT,
      productId: String(product.id),
      size: productSizes.some((option) => option.option_value === current.size)
        ? current.size
        : productSizes[0]?.option_value || '',
      sugar: productSugars.some((option) => option.option_value === current.sugar)
        ? current.sugar
        : productSugars[0]?.option_value || 'σκέτος',
    }))
    setQuantity(1)
    setShowComments(false)
    setIsNamingFavorite(false)
    setView('item')
    scrollToBuilder()
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

  function toggleFavoriteNaming() {
    if (!isNamingFavorite && selectedProduct && draft.label === DEFAULT_DRAFT.label) {
      updateDraft('label', selectedProduct.name)
    }
    setIsNamingFavorite((current) => !current)
  }

  function addItemToCart(productId, itemQuantity, options) {
    const selectedOptions = toCartOptions(options)
    setCart((current) => {
      const existing = current.find((item) => item.productId === productId && JSON.stringify(item.selectedOptions) === JSON.stringify(selectedOptions))
      if (existing) {
        return current.map((item) => (item === existing ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + itemQuantity) } : item))
      }
      return [...current, { key: crypto.randomUUID(), productId, quantity: itemQuantity, selectedOptions }]
    })
  }

  function handleAddToCart() {
    if (!selectedProduct) return
    addItemToCart(selectedProduct.id, quantity, draft)
    setError('')
    setInfo(`Μπήκε στο καλάθι: ${quantity} × ${selectedProduct.name}`)
    setView('menu')
    scrollToBuilder()
  }

  function handleAddFavoriteToCart(favorite) {
    const options = favorite.selected_options || {}
    const favoriteQuantity = Math.min(MAX_QUANTITY, Math.max(1, Number(options.quantity) || 1))
    addItemToCart(favorite.product_id, favoriteQuantity, options)
    setInfo(`Μπήκε στο καλάθι: ${favoriteQuantity} × ${favorite.product_name}`)
    if (view === 'sent') setView('menu')
  }

  function handleEditFavorite(favorite) {
    const options = favorite.selected_options || {}
    setDraft({
      ...DEFAULT_DRAFT,
      productId: String(favorite.product_id),
      size: options.size || DEFAULT_DRAFT.size,
      sugar: options.sugar || DEFAULT_DRAFT.sugar,
      extras: options.extras || [],
      comments: options.comments || '',
    })
    setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Number(options.quantity) || 1)))
    setShowComments(Boolean(options.comments))
    setIsNamingFavorite(false)
    setView('item')
    scrollToBuilder()
  }

  function changeCartQuantity(key, delta) {
    setCart((current) => current.flatMap((item) => {
      if (item.key !== key) return [item]
      const nextQuantity = item.quantity + delta
      return nextQuantity < 1 ? [] : [{ ...item, quantity: Math.min(MAX_QUANTITY, nextQuantity) }]
    }))
  }

  function openCart() {
    setError('')
    setView('cart')
    scrollToBuilder()
  }

  async function handleSaveFavorite(event) {
    event.preventDefault()
    if (!customer || !selectedProduct) return

    setIsSubmitting(true)
    setError('')

    try {
      await fetchJson('/api/favorites', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          productId: selectedProduct.id,
          label: draft.label.trim() || selectedProduct.name,
          selectedOptions: { ...toCartOptions(draft), quantity },
        }),
      })

      setDraft((current) => ({ ...current, label: DEFAULT_DRAFT.label }))
      setIsNamingFavorite(false)
      await loadFavorites()
      setInfo('Το αγαπημένο αποθηκεύτηκε.')
    } catch (submittedError) {
      setError(friendlyError(submittedError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCheckout() {
    if (!customer || cartItems.length === 0) return

    setIsSubmitting(true)
    setError('')

    try {
      const data = await fetchJson('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          pickupTime: effectivePickupMode === 'later'
            ? new Date(Date.now() + Number(effectivePickupOffset) * 60_000).toISOString()
            : null,
          items: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            selectedOptions: item.selectedOptions,
          })),
        }),
      })

      setCart([])
      setPickupMode('now')
      setPickupOffset('15')
      setLastOrder(data.order)
      setMyOrders((current) => [data.order, ...current.filter((order) => order.id !== data.order.id)])
      setView('sent')
      scrollToBuilder()
    } catch (submittedError) {
      setError(friendlyError(submittedError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAdminStatus(orderId, status) {
    setError('')
    try {
      await fetchJson(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status }),
      })
      await loadAdminOrders()
    } catch (statusError) {
      handleAdminError(statusError)
    }
  }

  async function handleRemoveFavorite(favorite) {
    setError('')
    setFavorites((current) => current.filter((item) => item.id !== favorite.id))
    try {
      await fetchJson(`/api/favorites/${favorite.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ customerId: customer.id, deviceId: deviceIdRef.current }),
      })
      setInfo(`Αφαιρέθηκε από τα αγαπημένα: ${favorite.label}`)
    } catch (removeError) {
      setError(friendlyError(removeError))
      await loadFavorites()
    }
  }

  async function handleDeleteOrder(orderId) {
    setError('')
    try {
      await fetchJson(`/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      await loadAdminOrders()
    } catch (deleteError) {
      handleAdminError(deleteError)
    }
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
      setError('')
    } catch (loginError) {
      setAdminLoginError(loginError instanceof ApiError && loginError.status === 401
        ? 'Λάθος κωδικός διαχείρισης. Έλεγξε κεφαλαία, μικρά και κενά.'
        : 'Δεν έγινε σύνδεση. Δοκίμασε ξανά.')
    }
  }

  async function enableAdminNotifications() {
    try {
      const subscription = await getPushSubscription()
      await fetchJson('/api/push-subscriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(subscription.toJSON()),
      })
      setPushEnabled(true)
      setPushStatus('Οι ειδοποιήσεις ενεργοποιήθηκαν σε αυτή τη συσκευή.')
    } catch (notificationError) {
      setPushStatus(pushErrorMessage(notificationError))
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

  async function refreshCustomerPushState(customerId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setCustomerPushState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setCustomerPushState('denied')
      return
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      const isSubscribed = Boolean(subscription)
        && Notification.permission === 'granted'
        && localStorage.getItem(CUSTOMER_PUSH_STORAGE_KEY) === String(customerId)
      setCustomerPushState(isSubscribed ? 'enabled' : 'available')
    } catch {
      setCustomerPushState('available')
    }
  }

  async function enableCustomerNotifications() {
    setCustomerPushMessage('')
    try {
      const subscription = await getPushSubscription()
      await fetchJson('/api/customer-push-subscriptions', {
        method: 'POST',
        body: JSON.stringify({ customerId: customer.id, deviceId: deviceIdRef.current, subscription: subscription.toJSON() }),
      })
      localStorage.setItem(CUSTOMER_PUSH_STORAGE_KEY, String(customer.id))
      setCustomerPushState('enabled')
    } catch (notificationError) {
      setCustomerPushMessage(pushErrorMessage(notificationError))
      if (notificationError.message === 'denied') setCustomerPushState('denied')
      if (notificationError.message === 'unsupported') setCustomerPushState('unsupported')
    }
  }

  function logoutAdmin() {
    localStorage.removeItem('brun-admin-token')
    setAdminToken('')
    setAllOrders([])
    setAdminLoginError('')
    setError('')
  }

  function changeCustomerName() {
    localStorage.removeItem('cafe-customer-name')
    setCustomer(null)
    setCustomerName('')
    setInfo('')
    setError('')
  }

  const customerNotifyPrompt = customerPushState === 'available' || customerPushState === 'enabled' || customerPushMessage ? (
    <div className="notify-prompt">
      {customerPushState === 'available' ? <button type="button" className="notify-button" onClick={enableCustomerNotifications}>🔔 Ειδοποίησέ με όταν είναι έτοιμο</button> : null}
      {customerPushState === 'enabled' ? <p>🔔 Θα σε ειδοποιήσουμε μόλις είναι έτοιμο.</p> : null}
      {customerPushMessage ? <p role="alert">{customerPushMessage}</p> : null}
    </div>
  ) : null

  if (isAdminApp && !adminToken) {
    return (
      <main className="app-shell admin-shell">
        <section className="welcome-screen">
          <BrandLockup />
          <p className="welcome-kicker">Ιδιοκτήτης BRUN</p>
          <h1>Διαχείριση παραγγελιών</h1>
          <form onSubmit={handleAdminLogin} className="customer-form">
            <label htmlFor="admin-key">Κωδικός διαχείρισης</label>
            <input id="admin-key" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck="false" />
            <button type="submit" className="primary-button">Σύνδεση</button>
          </form>
          {adminLoginError ? <p className="message error admin-login-error" role="alert">{adminLoginError}</p> : null}
          <p className="admin-install-hint">Για εικονίδιο στην αρχική οθόνη: άνοιξε αυτή τη σελίδα στο Safari/Chrome → Κοινοποίηση → «Προσθήκη στην αρχική οθόνη». Θα εμφανιστεί ως «BRUN Admin».</p>
          <a className="text-button admin-home-link" href="/">← Στο κατάστημα</a>
        </section>
      </main>
    )
  }

  if (isAdminApp) {
    const adminOrders = adminTab === 'active' ? adminActiveOrders : adminDoneOrders

    return (
      <main className="app-shell admin-shell">
        <header className="topbar">
          <BrandLockup compact />
          <div className="header-actions">
            <a className="admin-toggle" href="/">Κατάστημα</a>
            <button type="button" className="admin-toggle" onClick={logoutAdmin}>Αποσύνδεση</button>
          </div>
        </header>

        <section id="admin-panel" className="admin-only-panel">
          <div className="admin-title">
            <p className="section-kicker">Ιδιοκτήτης BRUN</p>
            <h1>Διαχείριση παραγγελιών</h1>
            <p>Οι πιο επείγουσες παραγγελίες είναι πρώτες.</p>
          </div>
          {error ? <p className="message error inline admin-message" role="alert">{error}</p> : null}
          {!pushEnabled ? <div className="push-settings">
            <button type="button" className="primary-button push-button" onClick={enableAdminNotifications}>Ενεργοποίηση ειδοποιήσεων</button>
            <p>Σε iPhone/iPad: πρόσθεσε πρώτα αυτή τη σελίδα στην αρχική οθόνη (Share → Add to Home Screen), άνοιξε το «BRUN Admin» από εκεί και πάτα ξανά το κουμπί.</p>
            {pushStatus ? <strong>{pushStatus}</strong> : null}
          </div> : null}

          <div className="admin-tabs" role="tablist" aria-label="Παραγγελίες">
            <button type="button" role="tab" aria-selected={adminTab === 'active'} onClick={() => setAdminTab('active')}>Ενεργές ({adminActiveOrders.length})</button>
            <button type="button" role="tab" aria-selected={adminTab === 'done'} onClick={() => setAdminTab('done')}>Ολοκληρωμένες</button>
          </div>

          {adminOrders.length === 0 ? (
            <p className="muted empty-copy">{adminTab === 'active' ? 'Δεν υπάρχουν ενεργές παραγγελίες.' : 'Δεν υπάρχουν ολοκληρωμένες παραγγελίες ακόμα.'}</p>
          ) : (
            <div className="order-list admin-list">
              {adminOrders.map((order) => {
                const nextAction = NEXT_ADMIN_ACTION[order.status]
                return (
                  <article key={order.id} className={`admin-order-card status-${order.status}${adminTab === 'active' && isDueSoon(order) ? ' is-due' : ''}`}>
                    <div className="admin-order-head">
                      <strong>{order.customer_name}</strong>
                      <span className={order.pickup_time ? 'pickup-badge' : 'pickup-badge now'}>{order.pickup_time ? `Παραλαβή ${formatPickupTime(order.pickup_time)}` : 'Άμεσα'}</span>
                    </div>
                    <ul className="admin-items">
                      {order.items.map((item, index) => (
                        <li key={item.id ?? index}>
                          <span className="admin-qty">{item.quantity}×</span>
                          <div>
                            <strong>{item.product_name}</strong>
                            <small>{formatItemOptions(item.selected_options) || 'Χωρίς επιλογές'}</small>
                            {item.selected_options?.comments ? <small className="item-comment">«{item.selected_options.comments}»</small> : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="admin-order-foot">
                      <small>#{order.id} · {formatOrderTime(order.created_at)} · <span className={`status-chip status-${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span></small>
                      <div className="admin-actions">
                        {nextAction ? <button type="button" className="primary-button" onClick={() => handleAdminStatus(order.id, nextAction[0])}>{nextAction[1]}</button> : null}
                        <button type="button" className="danger" onClick={() => handleDeleteOrder(order.id)}>Διαγραφή</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>
    )
  }

  if (!customer) {
    return (
      <main className="app-shell">
        <section className="welcome-screen">
          <BrandLockup />
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
          {error ? <p className="message error" role="alert">{error}</p> : null}
        </section>
      </main>
    )
  }

  const hasCartBar = view === 'menu' && cartCount > 0

  return (
    <main className={hasCartBar ? 'app-shell has-cart-bar' : 'app-shell'}>
      <header className="topbar">
        <BrandLockup compact />
        <div className="header-actions">
          <button type="button" className="admin-toggle" onClick={changeCustomerName}>Άλλαξε όνομα</button>
        </div>
      </header>

      {!storeOpen ? (
        <div className="store-closed-banner" role="alert">
          <strong>Το κατάστημα είναι κλειστό αυτή τη στιγμή</strong>
          <span>{getNextOpeningTime(new Date(now))}</span>
        </div>
      ) : null}

      {error && view !== 'cart' ? <p className="message error" role="alert">{error}</p> : null}
      {info ? <p className="message info" role="status">{info}</p> : null}

      <section className="home-view">
        <div className="greeting">
          <p className="welcome-kicker">{getGreeting(new Date(now))}, {customer.name}</p>
          <h1>Ο καφές σου<br />είναι εδώ.</h1>
        </div>

        {activeOrders.map((order) => {
          const progressIndex = ACTIVE_STATUSES.indexOf(order.status)
          const isReady = order.status === 'ready'
          return (
            <section key={order.id} className={isReady ? 'active-order is-ready' : 'active-order'} aria-live="polite">
              <p className="hero-kicker">{isReady ? 'Είναι έτοιμο! Πέρασε να το πάρεις ☕' : `Η παραγγελία σου · #${order.id}`}</p>
              <h2>{summarizeItems(order.items)}</h2>
              <p className="hero-detail">{formatPickupLine(order.pickup_time)}</p>
              <ol className="progress-steps" aria-label="Πορεία παραγγελίας">
                {ACTIVE_STATUSES.map((status, index) => (
                  <li key={status} className={index < progressIndex || isReady ? 'done' : index === progressIndex ? 'current' : ''} aria-current={index === progressIndex ? 'step' : undefined}>
                    {STATUS_LABELS[status]}
                  </li>
                ))}
              </ol>
              {!isReady ? customerNotifyPrompt : null}
            </section>
          )
        })}

        {activeOrders.length === 0 && favorites.length === 0 ? (
          <section className="favorite-hero">
            <div className="hero-bean" aria-hidden="true">●</div>
            <p className="hero-kicker">Καφεδάρα και σήμερα</p>
            <h2>Διάλεξε τον πρώτο σου καφέ</h2>
            <p className="hero-detail">Φτιάξ’ τον όπως σου αρέσει και κράτησέ τον στα αγαπημένα.</p>
            <button type="button" className="repeat-button" onClick={scrollToBuilder}>Φτιάξε τον καφέ σου</button>
          </section>
        ) : null}

        {favorites.length > 0 ? (
          <section className="favorites-section" aria-label="Τα αγαπημένα σου">
            <p className="section-kicker">♡ Τα αγαπημένα σου</p>
            <div className="favorites-scroller">
              {favorites.map((favorite) => (
                <article key={favorite.id} className="favorite-card">
                  <button type="button" className="favorite-card-body" onClick={() => handleEditFavorite(favorite)} aria-label={`Επεξεργασία: ${favorite.label}`}>
                    <strong>{favorite.label}</strong>
                    <span>{Number(favorite.selected_options?.quantity) || 1} × {favorite.product_name}</span>
                    <small>{formatItemOptions(favorite.selected_options) || 'Όπως είναι'}</small>
                  </button>
                  <div className="favorite-actions">
                    <button type="button" className="favorite-add" onClick={() => handleAddFavoriteToCart(favorite)} disabled={!storeOpen}>+ Στο καλάθι</button>
                    <button type="button" className="favorite-remove" onClick={() => handleRemoveFavorite(favorite)} aria-label={`Αφαίρεση αγαπημένου: ${favorite.label}`}>
                      Αφαίρεση
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="order-builder" id="order-builder">
          {view === 'menu' ? (
            <>
              <div className="section-heading"><div><p className="section-kicker">Κατάλογος</p><h2>Διάλεξε καφέ</h2></div></div>
              <div className="filter-row">
                {PRODUCT_FILTERS.map(([value, label]) => (
                  <button key={value} type="button" className={productFilter === value ? 'filter-chip selected' : 'filter-chip'} aria-pressed={productFilter === value} onClick={() => setProductFilter(value)}>{label}</button>
                ))}
              </div>
              <div className="product-grid">
                {visibleProducts.map((product) => (
                  <button key={product.id} type="button" className="product-card" onClick={() => selectProduct(product)}>
                    {product.image ? <img src={product.image} alt="" className="product-image" loading="lazy" /> : <span className="product-image fallback-image" aria-hidden="true" />}
                    <span className="product-card-name">{product.name}</span>
                    <span className="product-card-category">{PRODUCT_KIND_LABELS[getProductKind(product)]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {view === 'item' && selectedProduct ? (
            <>
              <div className="section-heading"><div><p className="section-kicker">Ρύθμιση</p><h2>Φτιάξ’ τον όπως θέλεις</h2></div></div>
              <div className="customizer">
                <div className="selected-product-line">{selectedProduct.image ? <img src={selectedProduct.image} alt="" className="selected-thumb" /> : <span className="selected-thumb fallback-image" aria-hidden="true" />}<strong>{selectedProduct.name}</strong><button type="button" className="text-button" onClick={() => setView('menu')}>Άλλαξε</button></div>
                {sizeOptions.length ? <div className="field-group"><p className="field-label">Μέγεθος</p><div className="choice-grid">{sizeOptions.map((option) => <button key={option.id} type="button" className={draft.size === option.option_value ? 'choice selected' : 'choice'} aria-pressed={draft.size === option.option_value} onClick={() => updateDraft('size', option.option_value)}>{getOptionLabel(option.option_value)}</button>)}</div></div> : null}
                {sugarOptions.length ? <div className="field-group"><p className="field-label">Ζάχαρη</p><div className="choice-grid">{sugarOptions.map((option) => <button key={option.id} type="button" className={draft.sugar === option.option_value ? 'choice selected' : 'choice'} aria-pressed={draft.sugar === option.option_value} onClick={() => updateDraft('sugar', option.option_value)}>{getOptionLabel(option.option_value)}</button>)}</div></div> : null}
                {extraOptions.length ? <div className="field-group"><p className="field-label">Κάτι ακόμη;</p><div className="chip-row">{extraOptions.map((option) => <button key={option.id} type="button" className={draft.extras.includes(option.option_value) ? 'choice chip selected' : 'choice chip'} aria-pressed={draft.extras.includes(option.option_value)} onClick={() => toggleExtra(option.option_value)}>{draft.extras.includes(option.option_value) ? '✓ ' : '+ '}{option.option_value}</button>)}</div></div> : null}
                <div className="field-inline"><p className="field-label">Ποσότητα</p><div className="quantity-stepper"><button type="button" className="quantity-control" onClick={() => setQuantity((current) => Math.max(1, current - 1))} disabled={quantity <= 1} aria-label="Μείωσε ποσότητα">−</button><output className="quantity-value" aria-label="Ποσότητα" aria-live="polite">{quantity}</output><button type="button" className="quantity-control" onClick={() => setQuantity((current) => Math.min(MAX_QUANTITY, current + 1))} disabled={quantity >= MAX_QUANTITY} aria-label="Αύξησε ποσότητα">+</button></div></div>
                {showComments ? <div className="favorite-name"><label htmlFor="order-comments">Σχόλιο</label><textarea id="order-comments" value={draft.comments} onChange={(event) => updateDraft('comments', event.target.value)} placeholder="π.χ. χωρίς καλαμάκι" rows="2" maxLength={200} autoFocus /></div> : <button type="button" className="text-button add-comment" onClick={() => setShowComments(true)}>+ Πρόσθεσε σχόλιο</button>}
                {isNamingFavorite ? <div className="favorite-name"><label htmlFor="favorite-label">Όνομα αγαπημένου</label><div className="favorite-inline-row"><input id="favorite-label" type="text" value={draft.label} onChange={(event) => updateDraft('label', event.target.value)} placeholder="π.χ. Το πρωινό μου" autoFocus /><button type="button" className="secondary" onClick={handleSaveFavorite} disabled={isSubmitting}>Αποθήκευση</button></div></div> : null}
                <div className="order-bar">
                  <div className="order-bar-summary"><strong>{quantity} × {selectedProduct.name}</strong>{cartCount > 0 ? <button type="button" className="text-button" onClick={openCart}>Καλάθι ({cartCount})</button> : null}</div>
                  <div className="action-row"><button type="button" className="save-button" onClick={toggleFavoriteNaming} aria-expanded={isNamingFavorite}>{isNamingFavorite ? 'Άκυρο' : '♡ Αγαπημένο'}</button><button type="button" className="primary-button order-button" onClick={handleAddToCart}>Προσθήκη στο καλάθι</button></div>
                </div>
              </div>
            </>
          ) : null}

          {view === 'cart' ? (
            <>
              <div className="section-heading">
                <div><p className="section-kicker">Ολοκλήρωση</p><h2>Το καλάθι σου</h2></div>
                <button type="button" className="text-button" onClick={() => setView('menu')}>+ Κι άλλο</button>
              </div>
              {cartItems.length === 0 ? (
                <div className="customizer">
                  <p className="muted empty-copy">Το καλάθι σου είναι άδειο.</p>
                  <button type="button" className="primary-button" onClick={() => setView('menu')}>Διάλεξε καφέ</button>
                </div>
              ) : (
                <div className="customizer">
                  <ul className="cart-list">
                    {cartItems.map((item) => (
                      <li key={item.key} className="cart-item">
                        {item.product.image ? <img src={item.product.image} alt="" className="selected-thumb" /> : <span className="selected-thumb fallback-image" aria-hidden="true" />}
                        <div className="cart-item-info">
                          <strong>{item.product.name}</strong>
                          <small>{formatItemOptions(item.selectedOptions) || 'Όπως είναι'}</small>
                          {item.selectedOptions.comments ? <small>«{item.selectedOptions.comments}»</small> : null}
                        </div>
                        <div className="quantity-stepper compact">
                          <button type="button" className="quantity-control" onClick={() => changeCartQuantity(item.key, -1)} aria-label={item.quantity === 1 ? `Αφαίρεσε ${item.product.name}` : `Μείωσε ${item.product.name}`}>{item.quantity === 1 ? '×' : '−'}</button>
                          <output className="quantity-value" aria-live="polite">{item.quantity}</output>
                          <button type="button" className="quantity-control" onClick={() => changeCartQuantity(item.key, 1)} disabled={item.quantity >= MAX_QUANTITY} aria-label={`Αύξησε ${item.product.name}`}>+</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="field-group">
                    <p className="field-label">Παραλαβή</p>
                    <div className="choice-grid pickup-grid">
                      <button type="button" className={effectivePickupMode === 'now' ? 'choice selected' : 'choice'} aria-pressed={effectivePickupMode === 'now'} onClick={() => setPickupMode('now')}>Άμεσα</button>
                      <button type="button" className={effectivePickupMode === 'later' ? 'choice selected' : 'choice'} aria-pressed={effectivePickupMode === 'later'} onClick={() => setPickupMode('later')} disabled={pickupOffsets.length === 0}>Να διαλέξω ώρα</button>
                    </div>
                    {effectivePickupMode === 'later' ? <select className="pickup-select" aria-label="Ώρα παραλαβής" value={effectivePickupOffset} onChange={(event) => setPickupOffset(event.target.value)}>{pickupOffsets.map(([value, label]) => <option key={value} value={value}>{label} · {formatClock(new Date(now + Number(value) * 60_000))}</option>)}</select> : null}
                  </div>
                  {error ? <p className="message error inline" role="alert">{error}</p> : null}
                  <div className="order-bar">
                    <div className="order-bar-summary"><strong>{pluralizeItems(cartCount)}</strong><small>{pickupSummary}</small></div>
                    <button type="button" className="primary-button order-button" onClick={handleCheckout} disabled={isSubmitting || !storeOpen}>{isSubmitting ? 'Στέλνεται…' : 'Ολοκλήρωση παραγγελίας'}</button>
                  </div>
                </div>
              )}
            </>
          ) : null}

          {view === 'sent' && lastOrder ? (
            <div className="sent-panel" role="status">
              <div className="sent-check" aria-hidden="true">✓</div>
              <p className="section-kicker">Η παραγγελία στάλθηκε · #{lastOrder.id}</p>
              <h2>Ευχαριστούμε, {customer.name}!</h2>
              <ul className="sent-items">{lastOrder.items.map((item, index) => <li key={item.id ?? index}>{item.quantity} × {item.product_name}</li>)}</ul>
              <p className="sent-pickup">{formatPickupLine(lastOrder.pickup_time)}</p>
              {customerNotifyPrompt}
              <button type="button" className="primary-button" onClick={() => { setView('menu'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Εντάξει</button>
            </div>
          ) : null}
        </section>

        <section className="orders-section">
          <div className="section-heading"><div><p className="section-kicker">Η πορεία σου</p><h2>Οι παραγγελίες σου</h2></div></div>
          {pastOrders.length === 0 ? (
            <p className="muted empty-copy">{myOrders.length ? 'Οι ολοκληρωμένες παραγγελίες σου θα εμφανίζονται εδώ.' : 'Η πρώτη σου παραγγελία είναι μερικά πατήματα μακριά.'}</p>
          ) : (
            <div className="order-list">
              {pastOrders.map((order) => (
                <div key={order.id} className="order-item">
                  <div>
                    <strong>{summarizeItems(order.items)}</strong>
                    <small>{formatPickupLine(order.pickup_time)}</small>
                    <small>Παραγγελία στις {formatOrderTime(order.created_at)}</small>
                  </div>
                  <span className={`status-chip status-${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      {hasCartBar ? (
        <div className="cart-bar">
          <div className="cart-bar-summary">
            <strong>Καλάθι · {pluralizeItems(cartCount)}</strong>
            <small>{cartItems.map((item) => `${item.quantity} × ${item.product.name}`).join(', ')}</small>
          </div>
          <button type="button" className="primary-button" onClick={openCart}>Ολοκλήρωση →</button>
        </div>
      ) : null}
    </main>
  )
}

export default App
