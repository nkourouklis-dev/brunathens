import { useEffect, useState } from 'react'
import { api, ApiError } from './api.js'
import { Link, PageError, Screen, Spinner, usePageMeta } from './ui.jsx'

export default function Privacy({ slug }) {
  const [business, setBusiness] = useState(null)
  const [state, setState] = useState('loading')
  usePageMeta({ title: business ? `Απόρρητο · ${business.name}` : 'Απόρρητο', color: business?.color })
  useEffect(() => {
    api(`b/${slug}`).then((data) => { setBusiness(data.business); setState('ok') }).catch((err) => setState(err instanceof ApiError && err.status === 404 ? 'missing' : 'error'))
  }, [slug])

  if (state === 'loading') return <Screen className="center"><Spinner /></Screen>
  if (state !== 'ok') return <PageError title="Δεν βρέθηκε">Έλεγξε το link.</PageError>
  const { legal } = business
  return (
    <Screen className="legal">
      <article className="prose">
        <h1>Πολιτική απορρήτου</h1>
        <p>Η κάρτα επιβράβευσης του <strong>{business.name}</strong> λειτουργεί μέσω της πλατφόρμας Κερδίσετο.</p>
        <h2>Υπεύθυνος επεξεργασίας</h2>
        <p>{legal.name || business.name}{legal.address ? `, ${legal.address}` : ''}{legal.vat ? ` · ΑΦΜ ${legal.vat}` : ''}{legal.email ? ` · ${legal.email}` : ''}{legal.phone ? ` · ${legal.phone}` : ''}</p>
        <h2>Ποια δεδομένα αποθηκεύονται</h2>
        <p>Όνομα, email, αριθμός κάρτας, υπόλοιπο πόντων και ιστορικό επισκέψεων και δώρων. Αν το επιλέξεις, και η συγκατάθεσή σου για ενημερώσεις.</p>
        <h2>Σκοπός</h2>
        <p>Για να λειτουργεί η κάρτα επιβράβευσης και για να μπορείς να συνδέεσαι σε αυτήν. Δεν πουλάμε τα δεδομένα σου.</p>
        <h2>Τα δικαιώματά σου</h2>
        <p>Μπορείς να δεις, να διορθώσεις ή να διαγράψεις την κάρτα σου οποιαδήποτε στιγμή από τον «Λογαριασμό» μέσα στην κάρτα, ή να επικοινωνήσεις με την επιχείρηση.</p>
        <p><Link to={`/b/${slug}`}>Πίσω στην κάρτα</Link></p>
      </article>
    </Screen>
  )
}
