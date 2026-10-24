import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './theme.css'
import './loyalty/loyalty.css'
import CustomerApp from './loyalty/CustomerApp.jsx'
import AdminApp from './loyalty/AdminApp.jsx'

// The ordering app (App.jsx) is no longer used; the app is now the BRUN loyalty card.
// /admin is the counter (scan cards, give points); everything else is the customer's card.
const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin' || new URLSearchParams(window.location.search).has('admin')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('BRUN service worker registration failed', error)
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdmin ? <AdminApp /> : <CustomerApp />}
  </StrictMode>,
)
