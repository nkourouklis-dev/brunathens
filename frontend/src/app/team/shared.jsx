import { formatDateTime, KIND_LABELS, ROLE_LABELS } from '../api.js'
import { Icon } from '../icons.jsx'

export const STAFF_UNDO_MINUTES = 15

export function RoleBadge({ role }) {
  return <span className={`badge badge-${role}`}>{ROLE_LABELS[role] || role}</span>
}

export function canUndo(tx, role) {
  if (!['earn', 'redeem', 'adjust'].includes(tx.kind) || tx.undone) return false
  if (role !== 'staff') return true
  return (Date.now() - new Date(tx.createdAt).getTime()) / 60000 <= STAFF_UNDO_MINUTES
}

export function txTitle(tx) {
  if (tx.kind === 'redeem' && tx.rewardName) return `${KIND_LABELS.redeem}: ${tx.rewardName}`
  return KIND_LABELS[tx.kind] || 'Κίνηση'
}

// Λίστα κινήσεων (όλων των πελατών) με δυνατότητα αναίρεσης.
export function ActivityList({ transactions, role, onUndo, showMember = true }) {
  if (!transactions.length) return <p className="muted center-text">Δεν υπάρχουν κινήσεις ακόμα.</p>
  return (
    <ul className="history">
      {transactions.map((tx) => (
        <li key={tx.id} className={tx.undone || tx.kind === 'reversal' ? 'is-undone' : ''}>
          <div>
            <strong>{showMember && tx.memberName ? `${tx.memberName} · ` : ''}{txTitle(tx)}</strong>
            <small>{formatDateTime(tx.createdAt)} · {tx.teamName}{tx.note && tx.kind === 'adjust' ? ` · ${tx.note}` : ''}{tx.undone ? ' · αναιρέθηκε' : ''}</small>
          </div>
          <span className={tx.delta > 0 ? 'delta plus' : 'delta minus'}>{tx.delta > 0 ? `+${tx.delta}` : tx.delta}</span>
          {onUndo && canUndo(tx, role) ? (
            <button type="button" className="icon-button" onClick={() => onUndo(tx)} aria-label="Αναίρεση" title="Αναίρεση"><Icon name="undo" size={18} /></button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

// Μετατρέπει εικόνα που διάλεξε ο χρήστης σε PNG έως 512px (διατηρεί διαφάνεια) και κάτω από το όριο μεγέθους του server.
export async function fileToLogoDataUrl(file, maxBytes = 330 * 1024) {
  if (!file || !file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('invalid')
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('invalid'))
      element.src = url
    })
    for (const max of [512, 384, 256, 192]) {
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/png')
      if ((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75 <= maxBytes) return dataUrl
    }
    throw new Error('too large')
  } finally {
    URL.revokeObjectURL(url)
  }
}
