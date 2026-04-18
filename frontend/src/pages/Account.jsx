import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchEntries, computeStreaks } from '../lib/entries'
import '../styles/Account.css'

export default function Account() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetchEntries({ userId: user.userId }).then(entries => {
      const { currentStreak, longestStreak } = computeStreaks(entries)
      const totalEntries = entries.length
      const totalWords = entries.reduce((sum, e) => sum + (e.wordCount || 0), 0)
      setStats({ currentStreak, longestStreak, totalEntries, totalWords })
    }).catch(console.error)
  }, [user.userId])

  async function handleLogout() {
    await logout()
  }

  return (
    <div className="account">
      <div className="account-header">
        <button className="btn-back" onClick={() => navigate('/')}>← back</button>
        <h1 className="account-title">account</h1>
      </div>

      <div className="account-section">
        <div className="account-label">signed in as</div>
        <div className="account-value">{user?.username}</div>
      </div>

      {stats && (
        <div className="account-stats">
          <div className="account-stat">
            <span className="account-stat-value">{stats.currentStreak}</span>
            <span className="account-stat-label">current streak</span>
          </div>
          <div className="account-stat">
            <span className="account-stat-value">{stats.longestStreak}</span>
            <span className="account-stat-label">longest streak</span>
          </div>
          <div className="account-stat">
            <span className="account-stat-value account-stat-value--neutral">{stats.totalEntries}</span>
            <span className="account-stat-label">total entries</span>
          </div>
          <div className="account-stat">
            <span className="account-stat-value account-stat-value--neutral">
              {stats.totalWords.toLocaleString()}
            </span>
            <span className="account-stat-label">total words</span>
          </div>
        </div>
      )}

      <button className="account-logout" onClick={handleLogout}>
        log out
      </button>
    </div>
  )
}
