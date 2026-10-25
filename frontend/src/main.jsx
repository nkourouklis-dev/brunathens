import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './theme.css'
import './loyalty/loyalty.css'
import CustomerApp from './loyalty/CustomerApp.jsx'
import AdminApp from './loyalty/AdminApp.jsx'
import { Landing, PlatformApp } from './loyalty/PlatformApp.jsx'
import { TenantGate } from './loyalty/tenant.jsx'

// Kerasma: one app, many businesses.
//   /                 landing
//   /platform         operator console (create businesses)
//   /<slug>           the customer's card
//   /<slug>/admin     the counter (scan cards, give points) and the owner's settings
const [first, second] = window.location.pathname.split('/').filter(Boolean)

function Root() {
  if (!first) return <Landing />
  if (first === 'platform') return <PlatformApp />
  if (second === 'admin') {
    return <TenantGate slug={first} admin>{() => <AdminApp />}</TenantGate>
  }
  return <TenantGate slug={first}>{(config) => <CustomerApp slug={first} config={config} />}</TenantGate>
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
