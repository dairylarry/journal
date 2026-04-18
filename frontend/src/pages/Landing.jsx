import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchEntries, computeStreaks, countWords, toLocalDate } from '../lib/entries'
import EntryCard from '../components/EntryCard'
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
  const [todayEntries, setTodayEntries] = useState([])
  const [weekGroups, setWeekGroups] = useState([])

  useEffect(() => {
    fetchEntries({ userId: user.userId }).then(entries => {
      const { currentStreak, longestStreak } = computeStreaks(entries)
      const today = toLocalDate()
      const te = entries.filter(e => e.date === today)
      const words = te.reduce((sum, e) => sum + (e.wordCount || 0), 0)

      // Collect the previous days of the current week (Sun–today)
      const d = new Date(today + 'T12:00:00')
      const dow = d.getDay() // 0 = Sunday
      const prevDates = new Set()
      for (let i = 1; i <= dow; i++) {
        const past = new Date(d)
        past.setDate(d.getDate() - i)
        prevDates.add(toLocalDate(past))
      }

      // Group by date, newest day first
      const byDate = {}
      entries.filter(e => prevDates.has(e.date)).forEach(e => {
        if (!byDate[e.date]) byDate[e.date] = []
        byDate[e.date].push(e)
      })
      const groups = Object.keys(byDate)
        .sort()
        .reverse()
        .map(date => ({
          date,
          dateLabel: new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
          }),
          entries: byDate[date].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        }))

      setStreak({ currentStreak, longestStreak })
      setTodayWords(words)
      setTodayEntries(te)
      setWeekGroups(groups)
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
            {todayEntries.length > 0 && (
              <div className="landing-btn-sub">
                {todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'}
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

      {(todayEntries.length > 0 || weekGroups.length > 0) && (
        <div className="landing-week-entries">
          {todayEntries.length > 0 && (
            <div className="landing-day-group">
              <div className="landing-day-label">Today</div>
              {todayEntries.map(entry => (
                <EntryCard
                  key={entry.createdAt}
                  entry={entry}
                  onClick={() => navigate(`/entries/${entry.entryId}`, { state: { entry } })}
                />
              ))}
            </div>
          )}

          {weekGroups.map(({ date, dateLabel, entries }) => (
            <div key={date} className="landing-day-group">
              <div className="landing-day-label">{dateLabel}</div>
              {entries.map(entry => (
                <EntryCard
                  key={entry.createdAt}
                  entry={entry}
                  onClick={() => navigate(`/entries/${entry.entryId}`, { state: { entry } })}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
