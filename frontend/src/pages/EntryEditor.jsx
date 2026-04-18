import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import MDEditor from '@uiw/react-md-editor'
import { useAuth } from '../context/AuthContext'
import { createEntry, updateEntry, fetchEntries, countWords, toLocalDate } from '../lib/entries'
import TagInput from '../components/TagInput'
import '../styles/EntryEditor.css'

const DEBOUNCE_MS = 500

function generateTitle(date, nthToday) {
  const d = new Date(date + 'T12:00:00')
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const monthDay = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const base = `${weekday}, ${monthDay}`
  return nthToday > 1 ? `${base} — #${nthToday}` : base
}

export default function EntryEditor() {
  const { entryId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isNew = !entryId

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState([])
  const [allTags, setAllTags] = useState([])
  const [existingEntry, setExistingEntry] = useState(null)
  const [todayCount, setTodayCount] = useState(0)

  const [loading, setLoading] = useState(!isNew && !state?.entry)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const draftKey = isNew ? 'draft_new' : `draft_${entryId}`
  const saveTimerRef = useRef(null)
  const isDirtyRef = useRef(false)

  // Initial load
  useEffect(() => {
    async function load() {
      try {
        const all = await fetchEntries({ userId: user.userId })
        const tagSet = new Set(all.flatMap(e => e.tags || []))
        setAllTags([...tagSet].sort())

        if (isNew) {
          const today = toLocalDate()
          setTodayCount(all.filter(e => e.date === today).length + 1)
          const draft = localStorage.getItem(draftKey)
          if (draft) {
            const d = JSON.parse(draft)
            setTitle(d.title || '')
            setBody(d.body || '')
            setNotes(d.notes || '')
            setTags(d.tags || [])
            setDraftRestored(true)
            setTimeout(() => setDraftRestored(false), 3000)
          }
          return
        }

        // Edit mode
        const src = state?.entry || all.find(e => e.entryId === entryId)
        if (!src) { navigate('/'); return }
        setExistingEntry(src)

        const draft = localStorage.getItem(draftKey)
        if (draft) {
          const d = JSON.parse(draft)
          if (d.savedAt > (src.updatedAt || src.createdAt)) {
            setTitle(d.title || '')
            setBody(d.body || '')
            setNotes(d.notes || '')
            setTags(d.tags || [])
            setDraftRestored(true)
            setTimeout(() => setDraftRestored(false), 3000)
            return
          }
        }
        setTitle(src.title || '')
        setBody(src.body || '')
        setNotes(src.notes || '')
        setTags(src.tags || [])
      } catch (err) {
        setError('Failed to load.')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Draft autosave
  const saveDraft = useCallback(() => {
    localStorage.setItem(draftKey, JSON.stringify({
      title, body, notes, tags,
      savedAt: new Date().toISOString(),
    }))
  }, [title, body, notes, tags, draftKey])

  useEffect(() => {
    if (!isDirtyRef.current) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(saveDraft, DEBOUNCE_MS)
    return () => clearTimeout(saveTimerRef.current)
  }, [title, body, notes, tags, saveDraft])

  function markDirty() { isDirtyRef.current = true }

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    setError('')
    try {
      const today = toLocalDate()
      const wordCount = countWords(body)
      const finalTitle = title.trim() || generateTitle(today, isNew ? todayCount : 0)

      if (isNew) {
        await createEntry({
          userId: user.userId,
          entryId: crypto.randomUUID(),
          date: today,
          createdAt: new Date().toISOString(),
          title: finalTitle,
          body,
          notes,
          tags,
          wordCount,
        })
        localStorage.setItem('lastEntryDate', today)
        localStorage.removeItem('streakCache')
        localStorage.removeItem('todayWordsCache')
      } else {
        await updateEntry({
          userId: user.userId,
          createdAt: existingEntry.createdAt,
          title: finalTitle,
          body,
          notes,
          tags,
          wordCount,
        })
      }

      localStorage.removeItem(draftKey)
      isDirtyRef.current = false
      navigate('/today')
    } catch (err) {
      setError('Failed to save. Please try again.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (isDirtyRef.current && !confirm('Discard unsaved changes?')) return
    if (isDirtyRef.current) localStorage.removeItem(draftKey)
    navigate(-1)
  }

  if (loading) return <div className="page-loading">loading…</div>

  const wordCount = countWords(body)

  return (
    <div className="editor">
      <div className="editor-header">
        <button className="btn-back" onClick={handleBack}>← back</button>
        <div className="editor-header-right">
          <button
            className={`editor-preview-toggle${showPreview ? ' active' : ''}`}
            onClick={() => setShowPreview(v => !v)}
            title={showPreview ? 'Switch to edit' : 'Preview markdown'}
          >
            {showPreview ? 'edit' : 'preview'}
          </button>
          <button
            className="editor-save-btn"
            onClick={handleSave}
            disabled={!body.trim() || saving}
          >
            {saving ? 'saving…' : 'save'}
          </button>
        </div>
      </div>

      {draftRestored && <div className="editor-draft-notice">Draft restored</div>}
      {error && <div className="editor-error">{error}</div>}

      <input
        className="editor-title-input"
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={e => { setTitle(e.target.value); markDirty() }}
      />

      <div className="editor-section-label">entry</div>
      <div data-color-mode="light" className="editor-md-wrap">
        <MDEditor
          value={body}
          onChange={val => { setBody(val || ''); markDirty() }}
          preview={showPreview ? 'preview' : 'edit'}
          height={360}
          visibleDragbar={false}
        />
      </div>
      <div className="editor-word-count">{wordCount} {wordCount === 1 ? 'word' : 'words'}</div>

      <div className="editor-section-label">
        notes <span className="editor-optional">(optional)</span>
      </div>
      <div data-color-mode="light" className="editor-md-wrap">
        <MDEditor
          value={notes}
          onChange={val => { setNotes(val || ''); markDirty() }}
          preview={showPreview ? 'preview' : 'edit'}
          height={200}
          visibleDragbar={false}
          placeholder="Vocabulary, corrections, references…"
        />
      </div>

      <div className="editor-section-label">tags</div>
      <TagInput
        value={tags}
        onChange={v => { setTags(v); markDirty() }}
        suggestions={allTags}
      />
    </div>
  )
}
