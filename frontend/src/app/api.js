export class ApiError extends Error {
  constructor(status, serverMessage, data = {}) {
    super(serverMessage || `Request failed (${status})`)
    this.status = status
    this.serverMessage = serverMessage
    this.data = data
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try { data = await response.json() } catch { /* κενό ή όχι JSON */ }
  if (!response.ok) throw new ApiError(response.status, data.error || '', data)
  return data
}

// Κωδικοί σφαλμάτων του server → κείμενο που διαβάζει ο άνθρωπος.
const MESSAGES = {
  'Name required': 'Γράψε ένα όνομα (τουλάχιστον 2 χαρακτήρες).',
  'Invalid email': 'Το email δεν φαίνεται σωστό.',
  'Terms required': 'Για να φτιάξεις κάρτα, αποδέξου τους όρους.',
  'Email already registered': 'Υπάρχει ήδη κάρτα με αυτό το email. Πάτα «Έχω ήδη κάρτα».',
  'Signup closed': 'Οι νέες εγγραφές είναι προσωρινά κλειστές.',
  'Invalid join code': 'Αυτό το link εγγραφής δεν ισχύει πια. Ζήτησε νέο από το κατάστημα.',
  'Too many attempts': 'Πολλές προσπάθειες. Δοκίμασε ξανά σε λίγο.',
  'Invalid code': 'Ο κωδικός δεν είναι σωστός ή έληξε.',
  'Email not configured': 'Η σύνδεση με email δεν είναι ακόμα διαθέσιμη. Ρώτα στο κατάστημα.',
  'Email failed': 'Δεν στάλθηκε το email. Δοκίμασε ξανά σε λίγο.',
  'Not signed in': 'Συνδέσου ξανά.',
  'Code expired': 'Ο κωδικός QR έληξε. Ο πελάτης να ανανεώσει την κάρτα.',
  'Code replaced': 'Αυτό το QR δεν ισχύει πια. Ο πελάτης να δείξει την κάρτα από την εφαρμογή.',
  'Member not found': 'Δεν βρέθηκε κάρτα σε αυτή την επιχείρηση.',
  'Not enough points': 'Δεν υπάρχουν αρκετοί πόντοι.',
  'Reward not found': 'Το δώρο δεν υπάρχει πια.',
  'Already added for this scan': 'Αυτή η σάρωση έχει ήδη καταχωρηθεί. Σκάναρε ξανά για νέα επίσκεψη.',
  'Already undone': 'Έχει ήδη αναιρεθεί.',
  'Too old to undo': 'Πέρασε πολύς χρόνος. Την αναίρεση την κάνει πια ο υπεύθυνος.',
  'Transaction not found': 'Δεν βρέθηκε η κίνηση.',
  'Invalid scan': 'Σκάναρε ξανά την κάρτα.',
  'Scan expired': 'Πέρασαν 5 λεπτά από τη σάρωση. Σκάναρε ξανά.',
  'Invalid points': 'Μη έγκυρος αριθμός πόντων.',
  'Admin authorization required': 'Η σύνδεση έληξε. Συνδέσου ξανά.',
  'Not allowed': 'Δεν έχεις δικαίωμα για αυτή την ενέργεια.',
  'Business suspended': 'Η επιχείρηση είναι σε αναστολή.',
  'Wrong PIN': 'Λάθος PIN.',
  'Wrong email or password': 'Λάθος email ή κωδικός.',
  'Wrong key': 'Λάθος κλειδί.',
  'PIN must be 6 digits': 'Το PIN πρέπει να έχει ακριβώς 6 ψηφία.',
  'PIN in use': 'Αυτό το PIN το χρησιμοποιεί ήδη άλλος. Διάλεξε άλλο.',
  'Password too short': 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.',
  'Email taken': 'Αυτό το email χρησιμοποιείται ήδη στην ομάδα.',
  'Invitation unavailable': 'Αυτή η πρόσκληση δεν ισχύει πια (έληξε, χρησιμοποιήθηκε ή ακυρώθηκε). Ζήτησε νέα.',
  'Invalid setting': 'Μη έγκυρη τιμή.',
  'Invalid logo': 'Το λογότυπο πρέπει να είναι εικόνα PNG, JPG ή WebP.',
  'Logo too large': 'Το λογότυπο είναι πολύ μεγάλο.',
  'Too many rewards': 'Έχεις φτάσει το μέγιστο αριθμό δώρων.',
  'Apple Wallet not configured': 'Το Apple Wallet δεν έχει ρυθμιστεί ακόμα.',
  'Google Wallet not configured': 'Το Google Wallet δεν έχει ρυθμιστεί ακόμα.',
  'Slug taken': 'Αυτή η διεύθυνση χρησιμοποιείται ήδη. Διάλεξε άλλη.',
  'Invalid slug': 'Η διεύθυνση πρέπει να έχει 3–32 λατινικά πεζά, αριθμούς ή παύλες.',
  'Signup disabled': 'Η δημιουργία νέων επιχειρήσεων δεν είναι ανοιχτή. Επικοινώνησε με τον διαχειριστή.',
  'No owner yet': 'Δεν έχει ακόμα ιδιοκτήτη. Δώσε του το link πρόσκλησης.',
  'Business not found': 'Δεν βρέθηκε αυτή η επιχείρηση.',
}

export function friendlyError(error) {
  if (!(error instanceof ApiError)) return 'Δεν υπάρχει σύνδεση. Έλεγξε το ίντερνετ και δοκίμασε ξανά.'
  if (MESSAGES[error.serverMessage]) return MESSAGES[error.serverMessage]
  if (error.status === 429) return MESSAGES['Too many attempts']
  if (error.status >= 500) return 'Κάτι πήγε στραβά σε εμάς. Δοκίμασε ξανά σε λίγο.'
  return 'Κάτι δεν πήγε καλά. Δοκίμασε ξανά.'
}

export function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

export function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

export function unitLabel(business, count) {
  return Math.abs(count) === 1 ? business.unitOne : business.unitMany
}

export const KIND_LABELS = {
  earn: 'Επίσκεψη',
  redeem: 'Εξαργύρωση δώρου',
  adjust: 'Διόρθωση',
  reversal: 'Αναίρεση',
  welcome: 'Καλωσόρισμα',
}

export const ROLE_LABELS = { owner: 'Ιδιοκτήτης', manager: 'Υπεύθυνος', staff: 'Ταμείο' }

// Αντιγραφή στο πρόχειρο με fallback για παλιότερους browsers.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { /* ignore */ }
    area.remove()
    return ok
  }
}

// Κοινοποίηση με το native sheet του κινητού όταν υπάρχει.
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return true
    } catch (error) {
      if (error?.name === 'AbortError') return true
    }
  }
  return copyText(url)
}
