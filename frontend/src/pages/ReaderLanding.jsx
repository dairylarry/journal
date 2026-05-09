import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchDocs } from '../lib/docs'
import DocCard from '../components/DocCard'
import '../styles/ReaderLanding.css'

export default function ReaderLanding() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTag, setActiveTag] = useState(null)

  useEffect(() => {
    fetchDocs({ userId: user.userId })
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user.userId])

  const allTags = [...new Set(docs.flatMap(d => d.tags || []))].sort()
  const filtered = activeTag ? docs.filter(d => (d.tags || []).includes(activeTag)) : docs

  if (loading) return <div className="page-loading">loading…</div>

  return (
    <div className="reader-landing">
      <div className="reader-header">
        <button className="btn-back" onClick={() => navigate('/')}>← journal</button>
        <span className="reader-wordmark">reader</span>
        <button
          className="reader-new-btn"
          onClick={() => navigate('/reader/docs/new')}
        >
          + new
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="reader-tag-filter">
          {allTags.map(tag => (
            <button
              key={tag}
              className={`tag-pill${activeTag === tag ? ' tag-pill--active' : ''}`}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
          {activeTag && (
            <button className="tag-filter-clear" onClick={() => setActiveTag(null)}>
              clear
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="reader-empty">
          {docs.length === 0
            ? 'No documents yet. Add one to start reading.'
            : 'No documents match this tag.'}
        </div>
      ) : (
        <div className="reader-doc-list">
          {filtered.map(doc => (
            <DocCard
              key={doc.createdAt}
              doc={doc}
              onClick={() => navigate(`/reader/docs/${doc.docId}`, { state: { doc } })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
