import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchDocs, createDoc, updateDoc, adjustHighlights, toVisibleText } from '../lib/docs'
import TagInput from '../components/TagInput'
import '../styles/DocEditor.css'

export default function DocEditor() {
  const { docId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isNew = !docId

  const [title, setTitle] = useState(state?.doc?.title || '')
  const [body, setBody] = useState(state?.doc?.body || '')
  const [tags, setTags] = useState(state?.doc?.tags || [])
  const [allTags, setAllTags] = useState([])
  const [existingDoc, setExistingDoc] = useState(state?.doc || null)
  const [loading, setLoading] = useState(!isNew && !state?.doc)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const textareaRef = useRef(null)

  useEffect(() => {
    fetchDocs({ userId: user.userId }).then(all => {
      const tagSet = new Set(all.flatMap(d => d.tags || []))
      setAllTags([...tagSet].sort())
      if (!isNew && !state?.doc) {
        const src = all.find(d => d.docId === docId)
        if (!src) { navigate('/reader'); return }
        setExistingDoc(src)
        setTitle(src.title || '')
        setBody(src.body || '')
        setTags(src.tags || [])
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, []) // eslint-disable-line

  function applyFormat(marker) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = body.slice(start, end)
    const wrapped = marker + selected + marker
    const newBody = body.slice(0, start) + wrapped + body.slice(end)
    setBody(newBody)
    setTimeout(() => {
      ta.selectionStart = start + marker.length
      ta.selectionEnd = end + marker.length
      ta.focus()
    }, 0)
  }

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    setError('')
    try {
      const finalTitle = title.trim() || 'Untitled'
      let savedDocId, savedDoc

      if (isNew) {
        savedDocId = crypto.randomUUID()
        const createdAt = new Date().toISOString()
        await createDoc({ userId: user.userId, docId: savedDocId, createdAt, title: finalTitle, body, tags })
        savedDoc = {
          docId: savedDocId, createdAt, updatedAt: createdAt,
          title: finalTitle, body, tags,
          wordCount: body.trim().split(/\s+/).filter(Boolean).length,
          highlights: [],
        }
      } else {
        savedDocId = existingDoc.docId
        // Adjust highlight offsets to account for any text changes
        const adjustedHighlights = adjustHighlights(
          toVisibleText(existingDoc.body || ''),
          toVisibleText(body),
          existingDoc.highlights || []
        )
        // Adjust bookmark offsets the same way as highlights
        const adjustedBookmarks = adjustHighlights(
          toVisibleText(existingDoc.body || ''),
          toVisibleText(body),
          existingDoc.bookmarks || []
        )
        await updateDoc({
          userId: user.userId,
          createdAt: existingDoc.createdAt,
          title: finalTitle,
          body,
          tags,
          highlights: adjustedHighlights,
          bookmarks: adjustedBookmarks,
        })
        savedDoc = {
          ...existingDoc,
          title: finalTitle, body, tags,
          highlights: adjustedHighlights,
          bookmarks: adjustedBookmarks,
          updatedAt: new Date().toISOString(),
          wordCount: body.trim().split(/\s+/).filter(Boolean).length,
        }
      }

      navigate(`/reader/docs/${savedDocId}`, { replace: true, state: { doc: savedDoc } })
    } catch (err) {
      setError('Failed to save. Please try again.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-loading">loading…</div>

  const wordCount = body.trim() ? body.trim().split(/\s+/).filter(Boolean).length : 0

  return (
    <div className="doc-editor">
      <div className="doc-editor-header">
        <button className="btn-back" onClick={() => navigate(-1)}>← back</button>
        <button
          className="doc-editor-save-btn"
          onClick={handleSave}
          disabled={!body.trim() || saving}
        >
          {saving ? 'saving…' : 'save'}
        </button>
      </div>

      {error && <div className="editor-error">{error}</div>}
      {!isNew && existingDoc?.bookmarks?.length > 0 && (
        <div className="doc-editor-bookmark-warning">
          This document has {existingDoc.bookmarks.length} bookmark{existingDoc.bookmarks.length > 1 ? 's' : ''}. Bookmarks and highlights will be adjusted to match text changes — those overlapping edited sections will be removed.
        </div>
      )}

      <input
        className="doc-editor-title"
        type="text"
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />

      <div className="doc-editor-toolbar">
        <button
          className="doc-editor-fmt-btn"
          title="Bold (wraps selection in **)"
          onMouseDown={e => { e.preventDefault(); applyFormat('**') }}
        >
          <strong>B</strong>
        </button>
        <button
          className="doc-editor-fmt-btn"
          title="Underline (wraps selection in __)"
          onMouseDown={e => { e.preventDefault(); applyFormat('__') }}
        >
          <u>U</u>
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="doc-editor-body"
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); applyFormat('**') }
          if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); applyFormat('__') }
        }}
        placeholder="Paste or type your document here…"
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
      />

      <div className="doc-editor-word-count">{wordCount} {wordCount === 1 ? 'word' : 'words'}</div>

      <div className="doc-editor-section-label">tags</div>
      <TagInput
        value={tags}
        onChange={setTags}
        suggestions={allTags}
        frequent={['spanish', 'chinese']}
      />
    </div>
  )
}
