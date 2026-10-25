// Icons a business can pick for its stamps. Simple 24px line drawings that take the colour of the text around them.

const ICONS = {
  coffee: ['Καφές', <>
    <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
    <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
    <path d="M8 3.5c0 1 1 1.3 1 2.5M11.5 3.5c0 1 1 1.3 1 2.5" />
  </>],
  croissant: ['Φούρνος', <>
    <path d="M3 15c1-5 5-8 9-8s8 3 9 8l-3 1.5c-.5-3-3-5-6-5s-5.5 2-6 5z" />
    <path d="M9.5 8.5l1.5 3M14.5 8.5L13 11.5" />
  </>],
  pizza: ['Πίτσα', <>
    <path d="M3 6.5C8.5 3 15.5 3 21 6.5L12 21 3 6.5z" />
    <circle cx="9.5" cy="9" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" />
  </>],
  burger: ['Φαγητό', <>
    <path d="M4 10a8 6 0 0 1 16 0z" />
    <path d="M3 13.5h18" />
    <path d="M4 17h16v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
  </>],
  icecream: ['Παγωτό', <>
    <path d="M8 11l4 10 4-10" />
    <path d="M7 11a5 5 0 1 1 10 0z" />
  </>],
  beer: ['Μπαρ', <>
    <path d="M6 8h9v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" />
    <path d="M15 10h2.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M6 8c0-2 1.5-3 3-2.5C10 4.5 12 4.5 12.5 6c1.5-.5 2.5.5 2.5 2" />
  </>],
  car: ['Αυτοκίνητο', <>
    <path d="M4.5 12.5l1.4-4.3A2 2 0 0 1 7.8 6.8h8.4a2 2 0 0 1 1.9 1.4l1.4 4.3" />
    <rect x="3" y="12.5" width="18" height="5" rx="1.5" />
    <circle cx="7.5" cy="17.5" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="17.5" r="1.7" fill="currentColor" stroke="none" />
  </>],
  drop: ['Πλύσιμο', <>
    <path d="M12 3.5C8 9 6 11.5 6 14.5a6 6 0 0 0 12 0c0-3-2-5.5-6-11z" />
    <path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" />
  </>],
  wrench: ['Συνεργείο', <>
    <path d="M14.5 6.5a4 4 0 0 0 4.8 4.8l-9.3 9.3a2.2 2.2 0 0 1-3.1-3.1l9.3-9.3a4 4 0 0 0-1.7-1.7z" />
  </>],
  bike: ['Ποδήλατο', <>
    <circle cx="6" cy="16" r="3.5" />
    <circle cx="18" cy="16" r="3.5" />
    <path d="M6 16l4-8h5l3 8M10 8H8M12.5 12.5H6" />
  </>],
  scissors: ['Κομμωτήριο', <>
    <circle cx="6" cy="6.5" r="2.5" />
    <circle cx="6" cy="17.5" r="2.5" />
    <path d="M8 8l12 9M8 16L20 7" />
  </>],
  sparkle: ['Ομορφιά', <>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    <path d="M19 16v4M17 18h4" />
  </>],
  leaf: ['Spa', <>
    <path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15z" />
    <path d="M5 19l8-8" />
  </>],
  flower: ['Λουλούδια', <>
    <circle cx="12" cy="12" r="2.2" />
    <circle cx="12" cy="6.2" r="2.6" />
    <circle cx="17.5" cy="10.2" r="2.6" />
    <circle cx="15.4" cy="16.7" r="2.6" />
    <circle cx="8.6" cy="16.7" r="2.6" />
    <circle cx="6.5" cy="10.2" r="2.6" />
  </>],
  paw: ['Κατοικίδια', <>
    <ellipse cx="12" cy="16" rx="4.5" ry="3.5" />
    <circle cx="6" cy="11" r="1.8" />
    <circle cx="10" cy="7.5" r="1.8" />
    <circle cx="14" cy="7.5" r="1.8" />
    <circle cx="18" cy="11" r="1.8" />
  </>],
  dumbbell: ['Γυμναστήριο', <>
    <path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" />
  </>],
  book: ['Βιβλιοπωλείο', <>
    <path d="M4 5.5C7 4.5 10 5 12 6.5c2-1.5 5-2 8-1v13c-3-1-6-.5-8 1-2-1.5-5-2-8-1z" />
    <path d="M12 6.5v13" />
  </>],
  gift: ['Δώρα', <>
    <rect x="4" y="9" width="16" height="11" rx="1.5" />
    <path d="M3 9h18V6.5H3zM12 6.5V20" />
    <path d="M12 6.5C10 3 6.5 3.5 7.5 6M12 6.5C14 3 17.5 3.5 16.5 6" />
  </>],
  heart: ['Καρδιά', <>
    <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z" />
  </>],
  star: ['Αστέρι', <>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z" />
  </>],
}

export const ICON_CHOICES = Object.entries(ICONS).map(([key, [label]]) => ({ key, label }))

export function TenantIcon({ name, size = 16 }) {
  const entry = ICONS[name] || ICONS.star
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {entry[1]}
    </svg>
  )
}
