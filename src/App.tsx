import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AuthGate } from '@/features/auth/AuthGate'
import { installWaterTouch } from '@/lib/touch-water'
import { TabBar } from '@/components/TabBar'
import { OfflineBanner } from '@/components/OfflineBanner'
import { Atmosphere, WorldHem } from '@/world/Atmosphere'
import SkyPage from '@/features/sky/SkyPage'
import CurrentPage from '@/features/current/CurrentPage'
import MemoryPage from '@/features/memory/MemoryPage'
import RunsPage from '@/features/runs/RunsPage'
import ImportPage from '@/features/importer/ImportPage'

export default function App() {
  // every button in the app answers a touch the way water does
  useEffect(() => installWaterTouch(), [])
  // What changes between the three tabs is what is standing on the world, not
  // the world: the sky, the ocean and the hour are one continuous thing under
  // all of them, and the tab bar's lens slides rather than jumps. The views
  // were the one part of it that cut. Keyed on the path so each arrival is a
  // fresh element with an animation to run — see .view in global.css.
  const { pathname } = useLocation()
  return (
    <>
      {/* the world is painted before anything asks who you are, so launching
          the app opens onto the sky rather than onto a loading state */}
      <Atmosphere />
      <AuthGate>
        <OfflineBanner />
        {/* Opacity and nothing else in here. A transform or a filter would
            make this the containing block for every `position: fixed`
            descendant, and the sky's full-screen page and its photo viewer are
            both inside it — a two-line flourish would quietly un-fix the two
            surfaces it took five rounds to get to the bottom of the screen. */}
        <div className="view" key={pathname}>
          <Routes>
            <Route path="/" element={<SkyPage />} />
            {/* Collect was a second capture screen — "What is on your mind?",
                a box, a Capture button — and nothing in the app has linked to
                it for months. The sky does the same job better: hold anywhere
                and write, and what you write lands where you were standing,
                inside the group you were reading. A screen you cannot reach is
                not a feature, it is a thing that has to keep compiling. */}
            <Route path="/collect" element={<Navigate to="/" replace />} />
            {/* the sky is the world now; ThinkPage was a second drawing of the
                same graph and rendered nowhere for months. The redirect stays
                for anything holding an old link — a bookmark, a cached PWA
                start url — but nothing in the app points here. */}
            <Route path="/think" element={<Navigate to="/" replace />} />
            <Route path="/current" element={<CurrentPage />} />
            <Route path="/memory" element={<MemoryPage />} />
            {/* The thought detail page is gone — see the registry. Old links
                still arrive though: a notification, a bookmark, the ocean list
                before this deploy. They land on the thing itself, in the sky,
                which is where everything else in the app opens. */}
            <Route path="/thought/:id" element={<ToTheSky />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/import" element={<ImportPage />} />
            {/* pre-v2 paths */}
            <Route path="/brain" element={<Navigate to="/" replace />} />
            <Route path="/focus" element={<Navigate to="/current" replace />} />
            <Route path="/settings" element={<Navigate to="/memory" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <TabBar />
      </AuthGate>
      {/* last in the flow on purpose — see WorldHem */}
      <WorldHem />
    </>
  )
}

/** An old /thought/:id link, pointed at the drop it was always about. */
function ToTheSky() {
  const { id } = useParams()
  return <Navigate to={id ? `/?open=${encodeURIComponent(id)}` : '/'} replace />
}
