import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Prevent mouse wheel from unintentionally changing number input values across the entire app
if (typeof window !== 'undefined') {
  window.addEventListener(
    'wheel',
    (e) => {
      const active = document.activeElement
      if (active && active.tagName === 'INPUT' && active.type === 'number') {
        active.blur()
      }
      if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'number') {
        e.target.blur()
      }
    },
    { passive: true }
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
