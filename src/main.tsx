import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import { DEMO } from './lib/demo'
import { holdStill } from './lib/nozoom'
import { keepFresh } from './lib/sw'
import { tickDaylight } from './world/daylight'
import './styles/global.css'

// Demo builds run on foreign URLs (e.g. an artifact page), so history-based
// routing would fight the host — memory routing keeps the world self-contained.
const Router = DEMO ? MemoryRouter : BrowserRouter

// Before anything renders, so a stale app spends as little time on screen as
// it possibly can.
keepFresh()
// The world zooms; the interface does not.
holdStill()
/*
 * The hour, before the first frame rather than after it.
 *
 * Every colour in the app is a custom property the daylight engine writes, and
 * it only wrote them from inside an effect — which runs *after* the browser has
 * already painted once. So the app opened in the palette tokens.css ships as a
 * fallback (cyan on navy), held it for a frame, and then snapped to whatever
 * the actual hour is — a brown evening, a pale morning. What that looks like is
 * the background popping in a beat behind the app, because that is exactly what
 * it was.
 *
 * This only writes custom properties on the root element, which is safe at any
 * point and costs a fraction of a millisecond. The engine keeps ticking after
 * mount for the minutes that follow; this is only its first value, arriving in
 * time to be the first thing painted.
 */
tickDaylight()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
)
