import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchDocs, deleteDoc, updateHighlights } from '../lib/docs'
import '../styles/DocDetail.css'

const DEFAULT_FONT_SIZE = 17 // px
const FONT_STEP = 2
const FONT_MIN = 12
const FONT_MAX = 36

// Walk text nodes to get character offset within container (visible text space)
function getCharOffset(container, node, offset) {
  if (node.nodeType === Node.TEXT_NODE) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let chars = 0, cur
    while ((cur = walker.nextNode())) {
      if (cur === node) return chars + offset
      chars += cur.length
    }
    return chars
  }
  // Element node: sum text before the offset-th child
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const limit = node.childNodes[offset] || null
  let chars = 0, cur
  while ((cur = walker.nextNode())) {
    if (cur === limit || !node.contains(cur)) break
    chars += cur.length
  }
  return chars
}

// Parse **bold** and __underline__ into segments with visible-text positions
function parseMarkup(raw) {
  const segs = []
  const re = /\*\*(.+?)\*\*|__(.+?)__/gs
  let last = 0, visPos = 0, m
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      const t = raw.slice(last, m.index)
      segs.push({ text: t, bold: false, underline: false, visStart: visPos, visEnd: visPos + t.length })
      visPos += t.length
    }
    const inner = m[1] !== undefined ? m[1] : m[2]
    const isBold = m[1] !== undefined
    segs.push({ text: inner, bold: isBold, underline: !isBold, visStart: visPos, visEnd: visPos + inner.length })
    visPos += inner.length
    last = m.index + (isBold ? 4 : 4) + inner.length // 2 open + 2 close markers
  }
  if (last < raw.length) {
    const t = raw.slice(last)
    segs.push({ text: t, bold: false, underline: false, visStart: visPos, visEnd: visPos + t.length })
  }
  return segs
}

// Merge markup segments with highlight ranges (both in visible-text space)
function buildRenderSegments(raw, highlights) {
  const markupSegs = parseMarkup(raw)
  const sorted = (highlights || []).map((h, i) => ({ ...h, idx: i })).sort((a, b) => a.start - b.start)
  if (!sorted.length) return markupSegs.map(s => ({ ...s, highlighted: false, hlIdx: -1 }))

  const result = []
  for (const seg of markupSegs) {
    let cursor = seg.visStart
    for (const hl of sorted) {
      if (hl.end <= cursor) continue
      if (hl.start >= seg.visEnd) break
      const clipStart = Math.max(hl.start, cursor)
      const clipEnd = Math.min(hl.end, seg.visEnd)
      if (cursor < clipStart) {
        result.push({ ...seg, text: seg.text.slice(cursor - seg.visStart, clipStart - seg.visStart), highlighted: false, hlIdx: -1 })
      }
      result.push({ ...seg, text: seg.text.slice(clipStart - seg.visStart, clipEnd - seg.visStart), highlighted: true, hlIdx: hl.idx })
      cursor = clipEnd
    }
    if (cursor < seg.visEnd) {
      result.push({ ...seg, text: seg.text.slice(cursor - seg.visStart), highlighted: false, hlIdx: -1 })
    }
  }
  return result
}

function mergeAndAdd(existing, newH) {
  const all = [...existing, { start: newH.start, end: newH.end }].sort((a, b) => a.start - b.start)
  const merged = []
  for (const h of all) {
    if (merged.length && h.start <= merged.at(-1).end) {
      merged.at(-1).end = Math.max(merged.at(-1).end, h.end)
    } else {
      merged.push({ ...h })
    }
  }
  return merged
}

export default function DocDetail() {
  const { docId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [doc, setDoc] = useState(state?.doc || null)
  const [loading, setLoading] = useState(!state?.doc)
  const [highlights, setHighlights] = useState(state?.doc?.highlights || [])
  const [fontSize, setFontSize] = useState(() =>
    parseInt(localStorage.getItem('readerFontSize') || String(DEFAULT_FONT_SIZE), 10)
  )
  const [pendingSelection, setPendingSelection] = useState(null)
  const [activeHlIdx, setActiveHlIdx] = useState(null)
  const [activeHlPos, setActiveHlPos] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const textRef = useRef(null)
  const selTimerRef = useRef(null)

  useEffect(() => {
    if (state?.doc) return
    fetchDocs({ userId: user.userId })
      .then(all => {
        const found = all.find(d => d.docId === docId)
        if (found) { setDoc(found); setHighlights(found.highlights || []) }
        else navigate('/reader')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line

  // Text selection detection for highlighting
  useEffect(() => {
    function onSelectionChange() {
      clearTimeout(selTimerRef.current)
      selTimerRef.current = setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !textRef.current?.contains(sel.anchorNode)) {
          setPendingSelection(null)
          return
        }
        const text = sel.toString().trim()
        if (!text) { setPendingSelection(null); return }
        const range = sel.getRangeAt(0)
        const start = getCharOffset(textRef.current, range.startContainer, range.startOffset)
        const end = getCharOffset(textRef.current, range.endContainer, range.endOffset)
        if (start < end) {
          setActiveHlIdx(null)
          setPendingSelection({ start, end })
        }
      }, 250)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      clearTimeout(selTimerRef.current)
    }
  }, [])

  function clearSelection() {
    window.getSelection()?.removeAllRanges()
    setPendingSelection(null)
  }

  async function addHighlight() {
    if (!pendingSelection || !doc) return
    const next = mergeAndAdd(highlights, pendingSelection)
    setHighlights(next)
    clearSelection()
    try { await updateHighlights({ userId: user.userId, createdAt: doc.createdAt, highlights: next }) } catch {}
  }

  async function removeHighlight(idx) {
    if (!doc) return
    const next = highlights.filter((_, i) => i !== idx)
    setHighlights(next)
    setActiveHlIdx(null)
    setActiveHlPos(null)
    try { await updateHighlights({ userId: user.userId, createdAt: doc.createdAt, highlights: next }) } catch {}
  }

  function changeFontSize(delta) {
    setFontSize(prev => {
      const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, prev + delta))
      localStorage.setItem('readerFontSize', String(clamped))
      return clamped
    })
  }

  function resetFontSize() {
    setFontSize(DEFAULT_FONT_SIZE)
    localStorage.setItem('readerFontSize', String(DEFAULT_FONT_SIZE))
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteDoc({ userId: user.userId, createdAt: doc.createdAt })
      navigate('/reader', { replace: true })
    } catch { setDeleting(false) }
  }

  if (loading) return <div className="page-loading">loading…</div>
  if (!doc) return null

  const segments = buildRenderSegments(doc.body || '', highlights)

  const createdLabel = new Date(doc.createdAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  const editedLabel = doc.updatedAt && doc.updatedAt !== doc.createdAt
    ? new Date(doc.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div
      className="doc-detail"
      onClick={() => { setActiveHlIdx(null); setActiveHlPos(null) }}
    >
      <div className="doc-detail-header">
        <button className="btn-back" onClick={() => navigate('/reader')}>← reader</button>
        <div className="doc-detail-actions">
          <button
            className="doc-action-btn"
            onClick={e => {
              e.stopPropagation()
              navigate(`/reader/docs/${doc.docId}/edit`, { state: { doc: { ...doc, highlights } } })
            }}
          >
            Edit
          </button>
          {confirmDelete ? (
            <>
              <button
                className="doc-delete-confirm-btn"
                disabled={deleting}
                onClick={e => { e.stopPropagation(); handleDelete() }}
              >
                {deleting ? 'deleting…' : 'confirm delete'}
              </button>
              <button
                className="doc-action-btn"
                onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="doc-delete-btn"
              onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="doc-detail-card">
        <div className="doc-detail-meta">
          <span className="doc-detail-date">{createdLabel}</span>
          {editedLabel && <span className="doc-detail-date">· edited {editedLabel}</span>}
          {(doc.tags || []).length > 0 && (
            <div className="doc-detail-tags">
              {doc.tags.map(t => <span key={t} className="tag-chip">#{t}</span>)}
            </div>
          )}
        </div>

        {doc.title && <h1 className="doc-detail-title">{doc.title}</h1>}

        <hr className="doc-detail-divider" />

        <div
          ref={textRef}
          className="doc-detail-body"
          style={{ fontSize: `${fontSize}px` }}
        >
          {segments.map((seg, i) => {
            const inner = seg.bold
              ? <strong key="inner">{seg.text}</strong>
              : seg.underline
                ? <u key="inner">{seg.text}</u>
                : seg.text
            if (seg.highlighted) {
              return (
                <mark
                  key={i}
                  className="reader-highlight"
                  onClick={e => {
                    e.stopPropagation()
                    clearTimeout(selTimerRef.current)
                    setPendingSelection(null)
                    setActiveHlIdx(seg.hlIdx)
                    setActiveHlPos({ x: e.clientX, y: e.clientY })
                  }}
                >
                  {inner}
                </mark>
              )
            }
            return <span key={i}>{inner}</span>
          })}
        </div>
      </div>

      {/* Bottom controls: highlight action bar OR font size pill */}
      {pendingSelection ? (
        <div className="reader-action-bar">
          <button className="reader-action-btn reader-action-btn--highlight" onClick={addHighlight}>
            Highlight
          </button>
          <button className="reader-action-btn" onClick={clearSelection}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="reader-font-controls">
          <button className="reader-font-btn" onClick={() => changeFontSize(-FONT_STEP)}>A−</button>
          <button className="reader-font-btn reader-font-btn--reset" onClick={resetFontSize}>A</button>
          <button className="reader-font-btn" onClick={() => changeFontSize(FONT_STEP)}>A+</button>
        </div>
      )}

      {/* Remove highlight popup */}
      {activeHlIdx !== null && activeHlPos && (
        <div
          className="reader-remove-popup"
          style={{
            position: 'fixed',
            top: Math.max(8, activeHlPos.y - 52),
            left: Math.min(window.innerWidth - 180, Math.max(8, activeHlPos.x - 80)),
          }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => removeHighlight(activeHlIdx)}>Remove highlight</button>
        </div>
      )}
    </div>
  )
}
