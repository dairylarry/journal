import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchEntries, computeStreaks, toLocalDate } from '../lib/entries'
import MonthGrid from '../components/MonthGrid'
import EntryCard from '../components/EntryCard'
import '../styles/History.css'

function getWeeksForMonth(year, month) {
  const pad = n => String(n).padStart(2, '0')
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`),
  ]
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7)
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

// Returns the non-null dates of the week row containing dateStr
function weekDatesForDate(year, month, dateStr) {
  for (const week of getWeeksForMonth(year, month)) {
    if (week.includes(dateStr)) return week.filter(Boolean)
  }
  return null
}

// Returns the non-null dates of the last week row that isn't entirely future
function lastNonFutureWeek(year, month, today) {
  const weeks = getWeeksForMonth(year, month)
  for (let i = weeks.length - 1; i >= 0; i--) {
    const nonNull = weeks[i].filter(Boolean)
    if (nonNull.length && nonNull[0] <= today) return nonNull
  }
  return null
}

export default function History() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTags, setSelectedTags] = useState(new Set())
  const [currentMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selectedWeekDates, setSelectedWeekDates] = useState(() => {
    const now = new Date()
    const today = toLocalDate()
    return weekDatesForDate(now.getFullYear(), now.getMonth(), today)
  })

  useEffect(() => {
    fetchEntries({ userId: user.userId })
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user.userId])

  const allTags = useMemo(() => {
    const set = new Set(entries.flatMap(e => e.tags || []))
    return [...set].sort()
  }, [entries])

  const filteredEntries = useMemo(() => {
    if (!selectedTags.size) return entries
    return entries.filter(e => (e.tags || []).some(t => selectedTags.has(t)))
  }, [entries, selectedTags])

  const filteredDateSet = useMemo(() => (
    new Set(filteredEntries.map(e => e.date))
  ), [filteredEntries])

  // Streak dates from ALL entries (unfiltered)
  const streakDates = useMemo(() => {
    if (!entries.length) return new Set()
    const today = toLocalDate()
    const dateSet = new Set(entries.map(e => e.date))
    const result = new Set()
    const cursor = new Date(today + 'T12:00:00')
    while (dateSet.has(toLocalDate(cursor))) {
      result.add(toLocalDate(cursor))
      cursor.setDate(cursor.getDate() - 1)
    }
    return result
  }, [entries])

  const earliestMonth = useMemo(() => {
    if (!entries.length) return null
    const earliest = [...entries].map(e => e.date).sort()[0]
    const [y, m] = earliest.split('-').map(Number)
    return { year: y, month: m - 1 }
  }, [entries])

  const isAtCurrentMonth = (
    viewMonth.year === currentMonth.year &&
    viewMonth.month === currentMonth.month
  )
  const isAtEarliestMonth = earliestMonth && (
    viewMonth.year === earliestMonth.year &&
    viewMonth.month === earliestMonth.month
  )

  function prevMonth() {
    setViewMonth(prev => {
      let { year, month } = prev
      month--
      if (month < 0) { month = 11; year-- }
      const today = toLocalDate()
      setSelectedWeekDates(lastNonFutureWeek(year, month, today))
      return { year, month }
    })
  }

  function nextMonth() {
    setViewMonth(prev => {
      let { year, month } = prev
      month++
      if (month > 11) { month = 0; year++ }
      const today = toLocalDate()
      const isNowCurrent = year === currentMonth.year && month === currentMonth.month
      setSelectedWeekDates(
        isNowCurrent
          ? weekDatesForDate(year, month, today)
          : lastNonFutureWeek(year, month, today)
      )
      return { year, month }
    })
  }

  function toggleTag(tag) {
    setSelectedTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
    setSelectedWeekDates(null)
  }

  function handleWeekSelect(dates) {
    setSelectedWeekDates(prev =>
      prev && prev.join() === dates.join() ? null : dates
    )
  }

  const weekCards = useMemo(() => {
    if (!selectedWeekDates) return []
    return filteredEntries
      .filter(e => selectedWeekDates.includes(e.date))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [filteredEntries, selectedWeekDates])

  if (loading) return <div className="history-loading">loading…</div>

  return (
    <div className="history">
      <div className="history-header">
        <button className="btn-back" onClick={() => navigate('/')}>← back</button>
        <h1 className="history-title">history</h1>
      </div>

      {allTags.length > 0 && (
        <div className="history-tag-filter">
          {allTags.map(tag => (
            <button
              key={tag}
              className={`tag-pill${selectedTags.has(tag) ? ' tag-pill--active' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              #{tag}
            </button>
          ))}
          {selectedTags.size > 0 && (
            <button
              className="tag-filter-clear"
              onClick={() => { setSelectedTags(new Set()); setSelectedWeekDates(null) }}
            >
              clear
            </button>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="history-empty">No entries yet.</div>
      ) : (
        <>
          <div className="history-month-nav">
            {!isAtEarliestMonth ? (
              <button className="month-nav-btn" onClick={prevMonth}>‹</button>
            ) : (
              <span />
            )}
            <span className="month-label">
              {new Date(viewMonth.year, viewMonth.month).toLocaleDateString('en-US', {
                month: 'long', year: 'numeric',
              })}
            </span>
            {!isAtCurrentMonth ? (
              <button className="month-nav-btn" onClick={nextMonth}>›</button>
            ) : (
              <span />
            )}
          </div>

          <MonthGrid
            year={viewMonth.year}
            month={viewMonth.month}
            entryDates={filteredDateSet}
            streakDates={streakDates}
            selectedWeekDates={selectedWeekDates}
            onWeekSelect={handleWeekSelect}
          />

          {selectedWeekDates && weekCards.length > 0 && (
            <div className="history-cards">
              {weekCards.map(entry => (
                <EntryCard
                  key={entry.createdAt}
                  entry={entry}
                  onClick={() => navigate(`/entries/${entry.entryId}`, { state: { entry } })}
                />
              ))}
            </div>
          )}

          {selectedWeekDates && weekCards.length === 0 && (
            <div className="history-no-entries">
              No entries for this week{selectedTags.size > 0 ? ' with selected tags' : ''}.
            </div>
          )}
        </>
      )}
    </div>
  )
}
