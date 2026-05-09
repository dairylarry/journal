import '../styles/DocCard.css'

export default function DocCard({ doc, onClick }) {
  const createdLabel = new Date(doc.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const wasEdited = doc.updatedAt && doc.updatedAt !== doc.createdAt
  const editedLabel = wasEdited
    ? new Date(doc.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="doc-card" onClick={onClick}>
      <div className="doc-card-title">{doc.title || 'Untitled'}</div>
      <div className="doc-card-meta">
        <span>{createdLabel}</span>
        {editedLabel && <span>· edited {editedLabel}</span>}
        {doc.wordCount > 0 && <span>· {doc.wordCount.toLocaleString()} words</span>}
      </div>
      {(doc.tags || []).length > 0 && (
        <div className="doc-card-tags">
          {doc.tags.map(t => <span key={t} className="tag-chip">#{t}</span>)}
        </div>
      )}
    </div>
  )
}
