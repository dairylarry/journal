import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Today from './pages/Today'
import EntryEditor from './pages/EntryEditor'
import EntryDetail from './pages/EntryDetail'
import History from './pages/History'
import Account from './pages/Account'

function AuthedRoutes() {
  const { authState } = useAuth()

  if (authState === 'loading') return <div className="app-loading" />
  if (authState === 'unauthenticated') return <Login />

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/today" element={<Today />} />
      <Route path="/entries/new" element={<EntryEditor />} />
      <Route path="/entries/:entryId/edit" element={<EntryEditor />} />
      <Route path="/entries/:entryId" element={<EntryDetail />} />
      <Route path="/history" element={<History />} />
      <Route path="/account" element={<Account />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/journal-app">
      <AuthProvider>
        <AuthedRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
