import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { PageError, Screen, Spinner, usePath } from './app/ui.jsx'
import { Landing, Start } from './app/Landing.jsx'

const CustomerApp = lazy(() => import('./app/CustomerApp.jsx'))
const TeamApp = lazy(() => import('./app/team/TeamApp.jsx'))
const InviteApp = lazy(() => import('./app/InviteApp.jsx'))
const PlatformApp = lazy(() => import('./app/PlatformApp.jsx'))
const Privacy = lazy(() => import('./app/Privacy.jsx'))

function Router() {
  const path = usePath().replace(/\/+$/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  let page
  if (path === '/') page = <Landing />
  else if (path === '/start') page = <Start />
  else if (path === '/platform') page = <PlatformApp />
  else if (parts[0] === 'invite' && parts.length === 2) page = <InviteApp key={parts[1]} token={decodeURIComponent(parts[1])} />
  else if (parts[0] === 'b' && parts.length === 2) page = <CustomerApp key={parts[1]} slug={parts[1]} />
  else if (parts[0] === 'b' && parts.length === 3 && parts[2] === 'team') page = <TeamApp key={parts[1]} slug={parts[1]} />
  else if (parts[0] === 'b' && parts.length === 3 && parts[2] === 'privacy') page = <Privacy slug={parts[1]} />
  else page = <PageError title="Δεν βρέθηκε η σελίδα">Έλεγξε τη διεύθυνση.</PageError>
  return <Suspense fallback={<Screen className="center"><Spinner /></Screen>}>{page}</Suspense>
}

createRoot(document.getElementById('root')).render(<StrictMode><Router /></StrictMode>)
