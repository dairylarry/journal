import { useMemo } from 'react'
import { toLocalDate } from '../lib/entries'
import '../styles/MonthGrid.css'

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getWeeks(year, month) {
  const pad = n => String(n).padStart(2, '0')
  const firstDow = new Date(year, month, 1).getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${year}-${pad(month + 1)}-${pad(i + 1)}`
    ),
  ]

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7)
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

export default function MonthGrid({
  year,
  month,
  entryDates,       // Set<string>
  streakDates,      // Set<string>
  selectedWeekDates, // string[] | null
  onWeekSelect,     // (dates: string[]) => void
}) {
  const today = toLocalDate()
  const weeks = useMemo(() => getWeeks(year, month), [year, month])

  return (
    <div className="month-grid">
      <div className="month-grid-header">
        {DOW_LABELS.map(d => (
          <div key={d} className="month-grid-dow">{d}</div>
        ))}
      </div>

      <div className="month-grid-weeks">
        {weeks.map((week, wi) => {
          const nonNullDates = week.filter(Boolean)
          const isFuture = nonNullDates.length > 0 && nonNullDates[0] > today
          const isSelected = !isFuture &&
            selectedWeekDates &&
            nonNullDates.length > 0 &&
            nonNullDates.every(d => selectedWeekDates.includes(d)) &&
            nonNullDates.length === selectedWeekDates.filter(d => nonNullDates.includes(d)).length

          return (
            <div
              key={wi}
              className={`month-grid-week${isSelected ? ' month-grid-week--selected' : ''}${isFuture ? ' month-grid-week--future' : ''}`}
              onClick={() => !isFuture && onWeekSelect(nonNullDates)}
            >
              {week.map((date, di) => {
                if (!date) {
                  return <div key={di} className="month-grid-day month-grid-day--empty" />
                }

                const hasEntry = entryDates.has(date)
                const isStreak = streakDates.has(date)
                const isToday = date === today

                let cls = 'month-grid-day'
                if (isStreak) cls += ' month-grid-day--streak'
                else if (hasEntry) cls += ' month-grid-day--has-entry'
                if (isToday) cls += ' month-grid-day--today'

                return (
                  <div key={di} className={cls}>
                    {parseInt(date.slice(8), 10)}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
