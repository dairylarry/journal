import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchEntries, toLocalDate } from '../lib/entries'
import '../styles/Today.css'

export default function Today() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [entries, setEntries] = useState(null) // null = loading

  useEffect(() => {
    fetchEntries({ userId: user.userId }).then(all => {
      const today = toLocalDate()
      const todayEntries = all
        .filter(e => e.date === today)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // newest first

      if (todayEntries.length === 1) {
        // Single entry — go directly to editor
        navigate(`/entries/${todayEntries[0].entryId}/edit`, {
          replace: true,
          state: { entry: todayEntries[0] },
        })
      } else {
        setEntries(todayEntries)
      }
    }).catch(err => {
      console.error(err)
      setEntries([])
    })
  }, [user.userId, navigate])

  const today = toLocalDate()
  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  if (entries === null) return <div className="page-loading">loading…</div>

  return (
    <div className="today">
      <div className="today-header">
        <button className="btn-back" onClick={() => navigate('/')}>← back</button>
        <button className="today-new-btn" onClick={() => navigate('/entries/new')}>
          + new entry
        </button>
      </div>

      <div className="today-date">{dateLabel}</div>

      {entries.length === 0 ? (
        <div className="today-empty">
          <p className="today-empty-text">Nothing written yet today.</p>
          <button className="today-write-btn" onClick={() => navigate('/entries/new')}>
            Start writing
          </button>
        </div>
      ) : (
        <div className="today-list">
          {entries.map(entry => {
            const time = new Date(entry.createdAt).toLocaleTimeString('en-US', {
              hour: 'numeric', minute: '2-digit',
            })
            return (
              <button
                key={entry.createdAt}
                className="today-item"
                onClick={() => navigate(`/entries/${entry.entryId}/edit`, { state: { entry } })}
              >
                <div className="today-item-left">
                  <span className="today-item-title">{entry.title}</span>
                  <span className="today-item-meta">
                    <span>{time}</span>
                    <span>{entry.wordCount ?? 0} words</span>
                    {(entry.tags || []).length > 0 && (
                      <span>{entry.tags.map(t => `#${t}`).join(' ')}</span>
                    )}
                  </span>
                </div>
                <span className="today-item-arrow">›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
