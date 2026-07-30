import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from '@/features/auth/AuthGate'
import { installWaterTouch } from '@/lib/touch-water'
import { TabBar } from '@/components/TabBar'
import { OfflineBanner } from '@/components/OfflineBanner'
import { Atmosphere } from '@/world/Atmosphere'
import SkyPage from '@/features/sky/SkyPage'
import CollectPage from '@/features/collect/CollectPage'
import CurrentPage from '@/features/current/CurrentPage'
import MemoryPage from '@/features/memory/MemoryPage'
import ThoughtPage from '@/features/thought/ThoughtPage'
import RunsPage from '@/features/runs/RunsPage'
import ImportPage from '@/features/importer/ImportPage'

export default function App() {
  // every button in the app answers a touch the way water does
  useEffect(() => installWaterTouch(), [])
  return (
    <>
      {/* the world is painted before anything asks who you are, so launching
          the app opens onto the sky rather than onto a loading state */}
      <Atmosphere />
      <AuthGate>
        <OfflineBanner />
        <Routes>
          <Route path="/" element={<SkyPage />} />
          <Route path="/collect" element={<CollectPage />} />
          {/* the sky is the world now; ThinkPage was a second drawing of the
              same graph and rendered nowhere for months. The redirect stays for
              anything holding an old link — a bookmark, a cached PWA start
              url — but nothing in the app points here. */}
          <Route path="/think" element={<Navigate to="/" replace />} />
          <Route path="/current" element={<CurrentPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/thought/:id" element={<ThoughtPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/import" element={<ImportPage />} />
          {/* pre-v2 paths */}
          <Route path="/brain" element={<Navigate to="/" replace />} />
          <Route path="/focus" element={<Navigate to="/current" replace />} />
          <Route path="/settings" element={<Navigate to="/memory" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <TabBar />
      </AuthGate>
    </>
  )
}
