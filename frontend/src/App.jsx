import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { flushPendingWrites } from './lib/entries'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Today from './pages/Today'
import EntryEditor from './pages/EntryEditor'
import EntryDetail from './pages/EntryDetail'
import History from './pages/History'
import Account from './pages/Account'

function OfflineBanner() {
  const { user } = useAuth()
  const [offline, setOffline] = useState(!navigator.onLine)
  const [synced, setSynced] = useState(0)

  useEffect(() => {
    async function handleOnline() {
      setOffline(false)
      if (user) {
        const count = await flushPendingWrites()
        if (count > 0) setSynced(count)
      }
    }
    const handleOffline = () => { setOffline(true); setSynced(0) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [user])

  useEffect(() => {
    if (synced > 0) {
      const t = setTimeout(() => setSynced(0), 3000)
      return () => clearTimeout(t)
    }
  }, [synced])

  if (synced > 0) return (
    <div className="offline-banner offline-banner--synced">
      synced {synced} {synced === 1 ? 'entry' : 'entries'}
    </div>
  )
  if (offline) return (
    <div className="offline-banner">offline — changes will sync when connected</div>
  )
  return null
}

function AuthedRoutes() {
  const { authState } = useAuth()

  if (authState === 'loading') return <div className="app-loading" />
  if (authState === 'unauthenticated') return <Login />

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/today" element={<Today />} />
        <Route path="/entries/new" element={<EntryEditor />} />
        <Route path="/entries/:entryId/edit" element={<EntryEditor />} />
        <Route path="/entries/:entryId" element={<EntryDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/account" element={<Account />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/journal">
      <AuthProvider>
        <AuthedRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
