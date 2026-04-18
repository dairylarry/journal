import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchEntries, computeStreaks, countWords, toLocalDate } from '../lib/entries'
import '../styles/Landing.css'

export default function Landing() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [streak, setStreak] = useState(() => {
    try { return JSON.parse(localStorage.getItem('streakCache') || 'null') } catch { return null }
  })
  const [todayWords, setTodayWords] = useState(() => {
    try { return JSON.parse(localStorage.getItem('todayWordsCache') || 'null') } catch { return null }
  })
  const [todayCount, setTodayCount] = useState(0)

  useEffect(() => {
    fetchEntries({ userId: user.userId }).then(entries => {
      const { currentStreak, longestStreak } = computeStreaks(entries)
      const today = toLocalDate()
      const todayEntries = entries.filter(e => e.date === today)
      const words = todayEntries.reduce((sum, e) => sum + (e.wordCount || 0), 0)
      setStreak({ currentStreak, longestStreak })
      setTodayWords(words)
      setTodayCount(todayEntries.length)
      localStorage.setItem('streakCache', JSON.stringify({ currentStreak, longestStreak }))
      localStorage.setItem('todayWordsCache', JSON.stringify(words))
    }).catch(console.error)
  }, [user.userId])

  function handleToday() {
    navigate('/today')
  }

  const currentStreak = streak?.currentStreak ?? 0
  const words = todayWords ?? 0

  return (
    <div className="landing">
      <div className="landing-wordmark">journal</div>

      <div className="landing-stats">
        <div className="landing-streak">
          <span className="landing-streak-count">{currentStreak}</span>
          <span className="landing-streak-label">{currentStreak === 1 ? 'day streak' : 'day streak'}</span>
        </div>
        <div className="landing-stat-divider" />
        <div className="landing-words">
          <span className="landing-words-count">{words}</span>
          <span className="landing-words-label">words today</span>
        </div>
      </div>

      <nav className="landing-nav">
        <button className="landing-btn landing-btn--primary" onClick={() => navigate('/entries/new')}>
          <span>New entry</span>
          <span className="landing-btn-arrow">+</span>
        </button>

        <button className="landing-btn" onClick={handleToday}>
          <div>
            <div>Today</div>
            {todayCount > 0 && (
              <div className="landing-btn-sub">
                {todayCount} {todayCount === 1 ? 'entry' : 'entries'}
              </div>
            )}
          </div>
          <span className="landing-btn-arrow">›</span>
        </button>

        <hr className="landing-divider" />

        <button className="landing-btn" onClick={() => navigate('/history')}>
          <span>History</span>
          <span className="landing-btn-arrow">›</span>
        </button>

        <button className="landing-btn" onClick={() => navigate('/account')}>
          <span>Account</span>
          <span className="landing-btn-arrow">›</span>
        </button>
      </nav>
    </div>
  )
}
