export class ApiError extends Error {
  constructor(status, serverMessage, data = {}) {
    super(serverMessage || `Request failed (${status})`)
    this.status = status
    this.serverMessage = serverMessage
    this.data = data
  }
}

let tenantSlug = ''

// Every /api/loyalty call names the business it is for.
export function setTenantSlug(slug) {
  tenantSlug = slug
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantSlug && path.startsWith('/api/loyalty') ? { 'X-Tenant': tenantSlug } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let data = {}
  try {
    data = await response.json()
  } catch {
    // empty or non-JSON body
  }
  if (!response.ok) throw new ApiError(response.status, data.error || '', data)
  return data
}

// Server error codes → what people should read.
const MESSAGES = {
  'Name required': 'Γράψε το όνομά σου.',
  'Invalid email': 'Το email δεν φαίνεται σωστό.',
  'Terms required': 'Για να φτιάξεις κάρτα, αποδέξου τους όρους.',
  'Email already registered': 'Υπάρχει ήδη κάρτα με αυτό το email.',
  'Too many attempts': 'Πολλές προσπάθειες. Δοκίμασε ξανά σε λίγο.',
  'Invalid code': 'Ο κωδικός δεν είναι σωστός ή έληξε.',
  'Email not configured': 'Η σύνδεση με email δεν είναι ακόμα διαθέσιμη. Επικοινώνησε με τον υπεύθυνο.',
  'Email failed': 'Δεν στάλθηκε το email. Δοκίμασε ξανά σε λίγο.',
  'Not signed in': 'Συνδέσου ξανά.',
  'Code expired': 'Ο κωδικός QR έληξε. Πες στον πελάτη να ανανεώσει την κάρτα (ή σκάναρε ξανά).',
  'Code replaced': 'Αυτός ο κωδικός Wallet δεν ισχύει πια. Ο πελάτης να δείξει την κάρτα από την εφαρμογή.',
  'Member not found': 'Δεν βρέθηκε κάρτα.',
  'Not enough points': 'Δεν υπάρχουν αρκετοί πόντοι.',
  'Already added for this scan': 'Οι πόντοι γι’ αυτή τη σάρωση έχουν ήδη μπει. Σκάναρε ξανά για νέα αγορά.',
  'Already undone': 'Έχει ήδη αναιρεθεί.',
  'Too old to undo': 'Πέρασε πολύς χρόνος. Την αναίρεση την κάνει πια ο ιδιοκτήτης.',
  'Invalid scan': 'Σκάναρε ξανά την κάρτα.',
  'Scan expired': 'Πέρασαν 5 λεπτά από τη σάρωση. Σκάναρε ξανά.',
  'Invalid points': 'Μη έγκυρος αριθμός πόντων.',
  'Admin authorization required': 'Η σύνδεση έληξε. Συνδέσου ξανά.',
  'Owner only': 'Μόνο για τον ιδιοκτήτη.',
  'Wrong PIN': 'Λάθος PIN.',
  'PIN must be 6 digits': 'Το PIN πρέπει να έχει 6 ψηφία.',
  'PIN in use': 'Αυτό το PIN το έχει ήδη άλλος. Διάλεξε άλλο.',
  'Invalid setting': 'Μη έγκυρη τιμή.',
  'Business not found': 'Δεν βρέθηκε η επιχείρηση.',
  'Wrong access key': 'Λάθος κωδικός. Έλεγξε κεφαλαία, μικρά και κενά.',
  'Invalid slug': 'Η διεύθυνση επιτρέπει μόνο λατινικά, αριθμούς και παύλες (3 έως 40 χαρακτήρες).',
  'Slug in use': 'Αυτή η διεύθυνση χρησιμοποιείται ήδη.',
  'Invalid icon': 'Διάλεξε εικονίδιο.',
  'Invalid colour': 'Μη έγκυρο χρώμα.',
  'Logo must be a PNG under 300 KB': 'Το λογότυπο δεν αποθηκεύτηκε. Δοκίμασε άλλη εικόνα.',
  'Upload a PNG logo first': 'Ανέβασε πρώτα λογότυπο από τις Ρυθμίσεις.',
  'Platform authorization required': 'Η σύνδεση έληξε. Συνδέσου ξανά.',
  'Apple Wallet not configured': 'Το Apple Wallet δεν έχει ρυθμιστεί ακόμα.',
  'Google Wallet not configured': 'Το Google Wallet δεν έχει ρυθμιστεί ακόμα.',
}

export function friendlyError(error) {
  if (!(error instanceof ApiError)) return 'Δεν υπάρχει σύνδεση. Έλεγξε το ίντερνετ και δοκίμασε ξανά.'
  if (MESSAGES[error.serverMessage]) return MESSAGES[error.serverMessage]
  if (error.status >= 500) return 'Κάτι πήγε στραβά σε εμάς. Δοκίμασε ξανά σε λίγο.'
  return 'Κάτι δεν πήγε καλά. Δοκίμασε ξανά.'
}

export function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

export function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

export function pointsLabel(count) {
  return Math.abs(count) === 1 ? 'πόντος' : 'πόντοι'
}

export const KIND_LABELS = {
  earn: 'Πόντοι',
  redeem: 'Εξαργύρωση δώρου',
  adjust: 'Διόρθωση',
  reversal: 'Αναίρεση',
}
