// Ωράριο καταστήματος σε ώρα Ελλάδας.
//
// Το διαβάζουν ΚΑΙ η οθόνη ΚΑΙ ο server (functions/_lib/shared.js), ώστε μια αλλαγή
// ωραρίου να γίνεται σε ένα σημείο. Η ώρα Αθήνας βγαίνει από Intl με τη ζώνη
// Europe/Athens — όχι με σταθερό offset — οπότε η αλλαγή θερινής/χειμερινής ώρας
// λαμβάνεται υπόψη αυτόματα.

const ZONE = 'Europe/Athens'

// Λεπτά από τα μεσάνυχτα. Κλειδί: 0 = Κυριακή … 6 = Σάββατο.
const STORE_HOURS = {
  0: { open: 7 * 60, close: 13 * 60 },
  1: { open: 5 * 60 + 30, close: 15 * 60 + 30 },
  2: { open: 5 * 60 + 30, close: 15 * 60 + 30 },
  3: { open: 5 * 60 + 30, close: 15 * 60 + 30 },
  4: { open: 5 * 60 + 30, close: 15 * 60 + 30 },
  5: { open: 5 * 60 + 30, close: 15 * 60 + 30 },
  6: { open: 6 * 60, close: 14 * 60 },
}

// Η παραλαβή δεν μπορεί να κλειστεί πιο μπροστά από μία ώρα.
export const MAX_PICKUP_AHEAD_MINUTES = 60

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const DAY_NAMES = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο']

function athensParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hourCycle: 'h23',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return {
    dayOfWeek: WEEKDAY_INDEX[map.weekday],
    minutes: Number(map.hour) * 60 + Number(map.minute),
  }
}

function formatMinutes(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function isStoreOpen(date = new Date()) {
  const { dayOfWeek, minutes } = athensParts(date)
  const hours = STORE_HOURS[dayOfWeek]
  return minutes >= hours.open && minutes < hours.close
}

// Πόσα λεπτά μένουν μέχρι το σημερινό κλείσιμο· 0 όταν είναι κλειστά.
export function minutesUntilClose(date = new Date()) {
  if (!isStoreOpen(date)) return 0
  const { dayOfWeek, minutes } = athensParts(date)
  return STORE_HOURS[dayOfWeek].close - minutes
}

// Το πιο μακρινό σημείο παραλαβής που επιτρέπεται τώρα, σε λεπτά από τώρα: μία ώρα
// το πολύ, και ποτέ μετά το κλείσιμο. Στις 15:10 μιας Δευτέρας επιστρέφει 20.
export function maxPickupAheadMinutes(date = new Date()) {
  return Math.min(MAX_PICKUP_AHEAD_MINUTES, minutesUntilClose(date))
}

// "Ανοίγουμε σήμερα στις 05:30" ή "Ανοίγουμε αύριο, Κυριακή, στις 07:00".
// Το κατάστημα ανοίγει κάθε μέρα, οπότε το επόμενο άνοιγμα είναι πάντα σήμερα ή αύριο.
export function getNextOpeningTime(date = new Date()) {
  const { dayOfWeek, minutes } = athensParts(date)
  const today = STORE_HOURS[dayOfWeek]

  if (minutes < today.open) {
    return `Ανοίγουμε σήμερα στις ${formatMinutes(today.open)}`
  }

  const tomorrow = (dayOfWeek + 1) % 7
  return `Ανοίγουμε αύριο, ${DAY_NAMES[tomorrow]}, στις ${formatMinutes(STORE_HOURS[tomorrow].open)}`
}
