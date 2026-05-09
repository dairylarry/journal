import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchDocs, deleteDoc, updateHighlights, updateBookmarks } from '../lib/docs'
import '../styles/DocDetail.css'

const DEFAULT_FONT_SIZE = 17
const FONT_STEP = 2
const FONT_MIN = 12
const FONT_MAX = 36

// ── Text rendering helpers ──────────────────────────────────────────────────

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
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const limit = node.childNodes[offset] || null
  let chars = 0, cur
  while ((cur = walker.nextNode())) {
    if (cur === limit || !node.contains(cur)) break
    chars += cur.length
  }
  return chars
}

function parseMarkup(raw) {
  // Match bold+underline (**__text__**), bold (**text**), underline (__text__)
  const segs = []
  const re = /\*\*__(.+?)__\*\*|\*\*(.+?)\*\*|__(.+?)__/gs
  let last = 0, visPos = 0, m
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      const t = raw.slice(last, m.index)
      segs.push({ text: t, bold: false, underline: false, visStart: visPos, visEnd: visPos + t.length })
      visPos += t.length
    }
    const bothBU = m[1] !== undefined
    const isBold = bothBU || m[2] !== undefined
    const isUnder = bothBU || m[3] !== undefined
    const inner = m[1] ?? m[2] ?? m[3]
    segs.push({ text: inner, bold: isBold, underline: isUnder, visStart: visPos, visEnd: visPos + inner.length })
    visPos += inner.length
    last = m.index + m[0].length
  }
  if (last < raw.length) {
    const t = raw.slice(last)
    segs.push({ text: t, bold: false, underline: false, visStart: visPos, visEnd: visPos + t.length })
  }
  return segs
}

// Builds render segments handling both highlights and bookmarks simultaneously
function buildRenderSegments(raw, highlights, bookmarks) {
  const markupSegs = parseMarkup(raw)
  const hlSorted = (highlights || []).map((h, i) => ({ ...h, idx: i })).sort((a, b) => a.start - b.start)
  const bkSorted = (bookmarks || []).map((b, i) => ({ ...b, idx: i })).sort((a, b) => a.start - b.start)

  const result = []
  for (const seg of markupSegs) {
    const pts = new Set([seg.visStart, seg.visEnd])
    for (const ann of [...hlSorted, ...bkSorted]) {
      if (ann.end <= seg.visStart || ann.start >= seg.visEnd) continue
      pts.add(Math.max(ann.start, seg.visStart))
      pts.add(Math.min(ann.end, seg.visEnd))
    }
    const sorted = [...pts].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i], to = sorted[i + 1]
      const text = seg.text.slice(from - seg.visStart, to - seg.visStart)
      if (!text) continue
      const hl = hlSorted.find(h => h.start <= from && h.end >= to)
      const bk = bkSorted.find(b => b.start <= from && b.end >= to)
      result.push({
        ...seg, text,
        highlighted: !!hl, hlIdx: hl ? hl.idx : -1,
        bookmarked: !!bk, bkIdx: bk ? bk.idx : -1,
      })
    }
  }
  return result
}

function mergeAndAdd(existing, newH) {
  const all = [...existing, { start: newH.start, end: newH.end }].sort((a, b) => a.start - b.start)
  const merged = []
  for (const h of all) {
    if (merged.length && h.start <= merged.at(-1).end) merged.at(-1).end = Math.max(merged.at(-1).end, h.end)
    else merged.push({ ...h })
  }
  return merged
}

function scrollToBookmark(direction) {
  const seen = new Set()
  const bkEls = [...document.querySelectorAll('[data-bk-idx]')].filter(el => {
    const idx = el.dataset.bkIdx
    if (seen.has(idx)) return false
    seen.add(idx)
    return true
  })
  if (!bkEls.length) return
  const mid = window.innerHeight / 2
  if (direction === 'prev') {
    const el = [...bkEls].reverse().find(el => el.getBoundingClientRect().top < mid - 50)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } else {
    const el = bkEls.find(el => el.getBoundingClientRect().top > mid + 50)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DocDetail() {
  const { docId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [doc, setDoc] = useState(state?.doc || null)
  const [loading, setLoading] = useState(!state?.doc)
  const [highlights, setHighlights] = useState(state?.doc?.highlights || [])
  const [bookmarks, setBookmarks] = useState(state?.doc?.bookmarks || [])
  const [fontSize, setFontSize] = useState(() =>
    parseInt(localStorage.getItem('readerFontSize') || String(DEFAULT_FONT_SIZE), 10)
  )
  const [showFontControls, setShowFontControls] = useState(false)
  const [pendingSelection, setPendingSelection] = useState(null)
  // { hlIdx, bkIdx, x, y } — which annotation was tapped
  const [activeAnnotation, setActiveAnnotation] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [scrollY, setScrollY] = useState(0)
  const [maxScroll, setMaxScroll] = useState(0)
  const [isScrolling, setIsScrolling] = useState(false)

  const textRef = useRef(null)
  const selTimerRef = useRef(null)
  const scrollFadeRef = useRef(null)
  const fontControlsRef = useRef(null)

  // Load doc
  useEffect(() => {
    if (state?.doc) return
    fetchDocs({ userId: user.userId })
      .then(all => {
        const found = all.find(d => d.docId === docId)
        if (found) {
          setDoc(found)
          setHighlights(found.highlights || [])
          setBookmarks(found.bookmarks || [])
        } else navigate('/reader')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line

  // Auto-restore scroll position
  useEffect(() => {
    if (!doc) return
    const saved = localStorage.getItem(`scrollPos_${docId}`)
    if (!saved) return
    const pos = parseInt(saved, 10)
    if (pos > 0) {
      setTimeout(() => {
        window.scrollTo(0, pos)
        setIsScrolling(true)
        scrollFadeRef.current = setTimeout(() => setIsScrolling(false), 2000)
      }, 120)
    }
  }, [doc?.docId]) // eslint-disable-line

  // Save scroll position on unmount
  useEffect(() => {
    return () => localStorage.setItem(`scrollPos_${docId}`, String(window.scrollY))
  }, [docId])

  // Scroll tracking
  useEffect(() => {
    function onScroll() {
      setScrollY(window.scrollY)
      setMaxScroll(document.documentElement.scrollHeight - window.innerHeight)
      setIsScrolling(true)
      clearTimeout(scrollFadeRef.current)
      scrollFadeRef.current = setTimeout(() => setIsScrolling(false), 2000)
    }
    function onResize() { setMaxScroll(document.documentElement.scrollHeight - window.innerHeight) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      clearTimeout(scrollFadeRef.current)
    }
  }, [])

  // Text selection for highlights/bookmarks
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
        if (start < end) { setActiveAnnotation(null); setPendingSelection({ start, end }) }
      }, 250)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      clearTimeout(selTimerRef.current)
    }
  }, [])

  // Close font controls on outside click
  useEffect(() => {
    if (!showFontControls) return
    function onOutside(e) {
      if (fontControlsRef.current && !fontControlsRef.current.contains(e.target))
        setShowFontControls(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [showFontControls])

  // ── Handlers ───────────────────────────────────────────────────────────────

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
    setActiveAnnotation(null)
    try { await updateHighlights({ userId: user.userId, createdAt: doc.createdAt, highlights: next }) } catch {}
  }

  async function addBookmark() {
    if (!pendingSelection || !doc) return
    const next = [...bookmarks, { start: pendingSelection.start, end: pendingSelection.end, savedAt: new Date().toISOString() }]
      .sort((a, b) => a.start - b.start)
    setBookmarks(next)
    clearSelection()
    try { await updateBookmarks({ userId: user.userId, createdAt: doc.createdAt, bookmarks: next }) } catch {}
  }

  async function removeBookmark(idx) {
    if (!doc) return
    const next = bookmarks.filter((_, i) => i !== idx)
    setBookmarks(next)
    setActiveAnnotation(null)
    try { await updateBookmarks({ userId: user.userId, createdAt: doc.createdAt, bookmarks: next }) } catch {}
  }

  async function clearAllBookmarks() {
    if (!doc) return
    setBookmarks([])
    try { await updateBookmarks({ userId: user.userId, createdAt: doc.createdAt, bookmarks: [] }) } catch {}
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

  // ── Derived ────────────────────────────────────────────────────────────────

  const atTop = scrollY <= 80
  const atBottom = maxScroll > 0 && scrollY >= maxScroll - 80
  const showScrollPill = !atTop || !atBottom || bookmarks.length > 0

  if (loading) return <div className="page-loading">loading…</div>
  if (!doc) return null

  const segments = buildRenderSegments(doc.body || '', highlights, bookmarks)

  const createdLabel = new Date(doc.createdAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  const editedLabel = doc.updatedAt && doc.updatedAt !== doc.createdAt
    ? new Date(doc.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="doc-detail" onClick={() => setActiveAnnotation(null)}>

      {/* ── Header ── */}
      <div className="doc-detail-header">
        <button className="btn-back" onClick={() => navigate('/reader')}>← reader</button>

        <div className="doc-detail-actions">
          {/* Bookmark counter + clear all */}
          {bookmarks.length > 0 && (
            <div className="doc-bookmark-info">
              <span className="doc-bookmark-count">◆ {bookmarks.length}</span>
              <button className="doc-bookmark-clear" onClick={e => { e.stopPropagation(); clearAllBookmarks() }}>
                clear all
              </button>
            </div>
          )}

          {/* Font size */}
          <div className="doc-font-wrap" ref={fontControlsRef}>
            <button
              className={`doc-action-btn${showFontControls ? ' doc-action-btn--active' : ''}`}
              onClick={e => { e.stopPropagation(); setShowFontControls(v => !v) }}
            >
              Aa
            </button>
            {showFontControls && (
              <div className="doc-font-popover">
                <button className="reader-font-btn" onClick={() => changeFontSize(-FONT_STEP)}>A−</button>
                <button className="reader-font-btn reader-font-btn--reset" onClick={resetFontSize}>A</button>
                <button className="reader-font-btn" onClick={() => changeFontSize(FONT_STEP)}>A+</button>
              </div>
            )}
          </div>

          {/* Edit */}
          <button
            className="doc-action-btn"
            onClick={e => {
              e.stopPropagation()
              navigate(`/reader/docs/${doc.docId}/edit`, { state: { doc: { ...doc, highlights, bookmarks } } })
            }}
          >
            Edit
          </button>

          {/* Delete */}
          {confirmDelete ? (
            <>
              <button className="doc-delete-confirm-btn" disabled={deleting}
                onClick={e => { e.stopPropagation(); handleDelete() }}>
                {deleting ? 'deleting…' : 'confirm delete'}
              </button>
              <button className="doc-action-btn"
                onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}>
                Cancel
              </button>
            </>
          ) : (
            <button className="doc-delete-btn"
              onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* ── Document card ── */}
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

        <div ref={textRef} className="doc-detail-body" style={{ fontSize: `${fontSize}px` }}>
          {segments.map((seg, i) => {
            const inner = seg.bold && seg.underline
              ? <strong key="i"><u>{seg.text}</u></strong>
              : seg.bold ? <strong key="i">{seg.text}</strong>
              : seg.underline ? <u key="i">{seg.text}</u>
              : seg.text

            if (seg.highlighted || seg.bookmarked) {
              const cls = [
                seg.highlighted ? 'reader-highlight' : '',
                seg.bookmarked ? 'reader-bookmark' : '',
              ].filter(Boolean).join(' ')

              return (
                <mark
                  key={i}
                  className={cls}
                  data-bk-idx={seg.bookmarked ? seg.bkIdx : undefined}
                  onClick={e => {
                    e.stopPropagation()
                    clearTimeout(selTimerRef.current)
                    setPendingSelection(null)
                    setActiveAnnotation({
                      hlIdx: seg.highlighted ? seg.hlIdx : null,
                      bkIdx: seg.bookmarked ? seg.bkIdx : null,
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }}
                >{inner}</mark>
              )
            }
            return <span key={i}>{inner}</span>
          })}
        </div>
      </div>

      {/* ── Highlight / bookmark action bar (bottom center) ── */}
      {pendingSelection && (
        <div className="reader-action-bar">
          <button className="reader-action-btn reader-action-btn--bookmark" onClick={addBookmark}>
            ◆
          </button>
          <button className="reader-action-btn reader-action-btn--highlight" onClick={addHighlight}>
            Highlight
          </button>
          <button className="reader-action-btn" onClick={clearSelection}>Cancel</button>
        </div>
      )}

      {/* ── Scroll controls (bottom right, fades) ── */}
      {showScrollPill && (
        <div className="reader-scroll-controls" style={{ opacity: isScrolling ? 1 : 0.18 }}>
          {!atTop && (
            <button className="reader-scroll-btn" title="Top"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>
          )}
          {bookmarks.length > 0 && (
            <button className="reader-scroll-btn reader-scroll-btn--bkm" title="Previous bookmark"
              onClick={() => scrollToBookmark('prev')}>▲</button>
          )}
          {bookmarks.length > 0 && (
            <button className="reader-scroll-btn reader-scroll-btn--bkm" title="Next bookmark"
              onClick={() => scrollToBookmark('next')}>▼</button>
          )}
          {!atBottom && (
            <button className="reader-scroll-btn" title="Bottom"
              onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}>↓</button>
          )}
        </div>
      )}

      {/* ── Remove annotation popup ── */}
      {activeAnnotation && (
        <div
          className="reader-remove-popup"
          style={{
            position: 'fixed',
            top: Math.max(8, activeAnnotation.y - 52),
            left: Math.min(window.innerWidth - 180, Math.max(8, activeAnnotation.x - 80)),
          }}
          onClick={e => e.stopPropagation()}
        >
          {activeAnnotation.hlIdx !== null && (
            <button onClick={() => removeHighlight(activeAnnotation.hlIdx)}>Remove highlight</button>
          )}
          {activeAnnotation.bkIdx !== null && (
            <button onClick={() => removeBookmark(activeAnnotation.bkIdx)}>Remove bookmark</button>
          )}
        </div>
      )}
    </div>
  )
}
