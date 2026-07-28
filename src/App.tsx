import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from '@/features/auth/AuthGate'
import { TabBar } from '@/components/TabBar'
import { OfflineBanner } from '@/components/OfflineBanner'
import { Atmosphere } from '@/world/Atmosphere'
import CollectPage from '@/features/collect/CollectPage'
import ThinkPage from '@/features/think/ThinkPage'
import CurrentPage from '@/features/current/CurrentPage'
import MemoryPage from '@/features/memory/MemoryPage'
import ThoughtPage from '@/features/thought/ThoughtPage'
import RunsPage from '@/features/runs/RunsPage'
import ImportPage from '@/features/importer/ImportPage'

export default function App() {
  return (
    <AuthGate>
      <Atmosphere />
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<CollectPage />} />
        <Route path="/think" element={<ThinkPage />} />
        <Route path="/current" element={<CurrentPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/thought/:id" element={<ThoughtPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/import" element={<ImportPage />} />
        {/* pre-v2 paths */}
        <Route path="/brain" element={<Navigate to="/think" replace />} />
        <Route path="/focus" element={<Navigate to="/current" replace />} />
        <Route path="/settings" element={<Navigate to="/memory" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </AuthGate>
  )
}
