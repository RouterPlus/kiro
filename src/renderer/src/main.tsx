import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppRouterWrapper from './AppRouter'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouterWrapper />
  </StrictMode>
)
