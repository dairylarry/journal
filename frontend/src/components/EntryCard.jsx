import { useState, useEffect } from 'react'
import '../styles/EntryCard.css'

export default function EntryCard({ entry, onClick }) {
  const [MDPreview, setMDPreview] = useState(() => window.__MDPreview || null)

  useEffect(() => {
    if (!window.__MDPreview) {
      import('@uiw/react-md-editor').then(mod => {
        window.__MDPreview = mod.default.Markdown
        setMDPreview(() => mod.default.Markdown)
      })
    }
  }, [])

  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })

  return (
    <div className="entry-card" onClick={onClick}>
      <div className="entry-card-top">
        <span className="entry-card-title">{entry.title}</span>
        <span className="entry-card-date">{dateLabel}</span>
        {(entry.tags || []).length > 0 && (
          <div className="entry-card-tags">
            {entry.tags.map(t => (
              <span key={t} className="tag-chip">#{t}</span>
            ))}
          </div>
        )}
      </div>

      <hr className="entry-card-divider" />

      <div className="entry-card-body">
        {MDPreview ? (
          <div className="entry-card-md" data-color-mode="light">
            <MDPreview source={entry.body} />
          </div>
        ) : (
          <div className="entry-card-md">{entry.body}</div>
        )}
      </div>

      {entry.notes && (
        <>
          <hr className="entry-card-divider" />
          <div className="entry-card-notes">
            <div className="entry-card-notes-label">Notes</div>
            {MDPreview ? (
              <div className="entry-card-md" data-color-mode="light">
                <MDPreview source={entry.notes} />
              </div>
            ) : (
              <div className="entry-card-md">{entry.notes}</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
