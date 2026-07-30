import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import { DEMO } from './lib/demo'
import { keepFresh } from './lib/sw'
import './styles/global.css'

// Demo builds run on foreign URLs (e.g. an artifact page), so history-based
// routing would fight the host — memory routing keeps the world self-contained.
const Router = DEMO ? MemoryRouter : BrowserRouter

// Before anything renders, so a stale app spends as little time on screen as
// it possibly can.
keepFresh()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
)
