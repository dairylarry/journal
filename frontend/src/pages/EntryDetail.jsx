import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchEntries } from '../lib/entries'
import '../styles/EntryDetail.css'

function useMDPreview() {
  const [MDPreview, setMDPreview] = useState(() => window.__MDPreview || null)
  useEffect(() => {
    if (!window.__MDPreview) {
      import('@uiw/react-md-editor').then(mod => {
        window.__MDPreview = mod.default.Markdown
        setMDPreview(() => mod.default.Markdown)
      })
    }
  }, [])
  return MDPreview
}

function MarkdownView({ source, className }) {
  const MDPreview = useMDPreview()
  if (!source) return null
  return (
    <div className={className} data-color-mode="light">
      {MDPreview
        ? <MDPreview source={source} />
        : <span style={{ whiteSpace: 'pre-wrap' }}>{source}</span>
      }
    </div>
  )
}

export default function EntryDetail() {
  const { entryId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [entry, setEntry] = useState(state?.entry || null)
  const [loading, setLoading] = useState(!state?.entry)

  useEffect(() => {
    if (state?.entry) return
    fetchEntries({ userId: user.userId })
      .then(all => {
        const found = all.find(e => e.entryId === entryId)
        if (found) setEntry(found)
        else navigate('/')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="page-loading">loading…</div>
  if (!entry) return null

  const dateLabel = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="detail">
      <div className="detail-header">
        <button className="btn-back" onClick={() => navigate(-1)}>← back</button>
        <button
          className="detail-edit-btn"
          onClick={() => navigate(`/entries/${entry.entryId}/edit`, { state: { entry } })}
        >
          Edit
        </button>
      </div>

      <div className="detail-card">
        <div className="detail-meta">
          <span className="detail-date">{dateLabel}</span>
          {(entry.tags || []).length > 0 && (
            <div className="detail-tags">
              {entry.tags.map(t => (
                <span key={t} className="tag-chip">#{t}</span>
              ))}
            </div>
          )}
        </div>

        <h1 className="detail-title">{entry.title}</h1>

        <hr className="detail-divider" />

        <MarkdownView source={entry.body} className="detail-md" />

        {entry.notes && (
          <>
            <hr className="detail-divider" />
            <div className="detail-notes-section">
              <div className="detail-notes-label">Notes</div>
              <MarkdownView source={entry.notes} className="detail-md" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
