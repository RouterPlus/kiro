import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import App from './App'
import type { PageType } from './components/layout'

// URL path <-> PageType mapping
const pathToPage: Record<string, PageType> = {
  '/': 'home',
  '/accounts': 'accounts',
  '/machine-id': 'machineId',
  '/kiro-settings': 'kiroSettings',
  '/proxy': 'proxy',
  '/k-proxy': 'kproxy',
  '/proxy-pool': 'proxyPool',
  '/register': 'register',
  '/subscription': 'subscription',
  '/webhooks': 'webhooks',
  '/diagnostics': 'diagnostics',
  '/config-sync': 'configSync',
  '/logs': 'logs',
  '/settings': 'settings',
  '/about': 'about'
}

const pageToPath: Record<PageType, string> = {
  'home': '/',
  'accounts': '/accounts',
  'machineId': '/machine-id',
  'kiroSettings': '/kiro-settings',
  'proxy': '/proxy',
  'kproxy': '/k-proxy',
  'proxyPool': '/proxy-pool',
  'register': '/register',
  'subscription': '/subscription',
  'webhooks': '/webhooks',
  'diagnostics': '/diagnostics',
  'configSync': '/config-sync',
  'logs': '/logs',
  'settings': '/settings',
  'about': '/about'
}

// Router-aware App wrapper
function AppWithRouter() {
  const navigate = useNavigate()
  const location = useLocation()

  // Sync URL changes to trigger re-renders
  useEffect(() => {
    // This ensures the App component re-renders when URL changes
    const page = pathToPage[location.pathname] || 'home'
    console.log('[Router] Current page:', page, 'path:', location.pathname)
  }, [location.pathname])

  // Intercept page changes and update URL
  // We'll monkey-patch the Sidebar's onPageChange
  useEffect(() => {
    // Store original pushState
    const originalPushState = window.history.pushState.bind(window.history)

    // Intercept pushState to sync with our routing
    window.history.pushState = function(state: any, title: string, url?: string | URL | null) {
      originalPushState(state, title, url)
      // Dispatch event so React Router picks it up
      window.dispatchEvent(new PopStateEvent('popstate'))
    }

    return () => {
      window.history.pushState = originalPushState
    }
  }, [])

  // Helper to navigate programmatically
  useEffect(() => {
    // Expose navigation helper globally for the app to use
    (window as any).__navigate = (page: PageType) => {
      const path = pageToPath[page] || '/'
      navigate(path)
    }
  }, [navigate])

  return <App />
}

// Main export with BrowserRouter wrapper
export default function AppRouterWrapper() {
  return (
    <BrowserRouter>
      <AppWithRouter />
    </BrowserRouter>
  )
}
