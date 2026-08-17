import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// iOS will happily zoom a game board on a double tap and leave you playing at
// 1.4×, with the buttons off the bottom of an installed app and no browser
// chrome left to undo it. The sky is not a document.
const nozoom = (e: Event) => e.preventDefault()
document.addEventListener('gesturestart', nozoom)
document.addEventListener('dblclick', nozoom)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
