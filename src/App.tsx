import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from '@/features/auth/AuthGate'
import { TabBar } from '@/components/TabBar'
import { OfflineBanner } from '@/components/OfflineBanner'
import CapturePage from '@/features/capture/CapturePage'
import BrainPage from '@/features/brain/BrainPage'
import FocusPage from '@/features/focus/FocusPage'
import ThoughtPage from '@/features/thought/ThoughtPage'
import SettingsPage from '@/features/settings/SettingsPage'
import RunsPage from '@/features/runs/RunsPage'
import ImportPage from '@/features/importer/ImportPage'

export default function App() {
  return (
    <AuthGate>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<CapturePage />} />
        <Route path="/brain" element={<BrainPage />} />
        <Route path="/focus" element={<FocusPage />} />
        <Route path="/thought/:id" element={<ThoughtPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </AuthGate>
  )
}
