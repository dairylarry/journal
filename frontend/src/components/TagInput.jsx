import { useState, useRef } from 'react'
import '../styles/TagInput.css'

export default function TagInput({ value, onChange, suggestions, frequent = [] }) {
  const [inputValue, setInputValue] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef(null)

  const filtered = suggestions.filter(s =>
    !value.includes(s) && s.includes(inputValue.toLowerCase())
  )

  function addTag(raw) {
    const normalized = raw.toLowerCase().trim().replace(/,/g, '').replace(/\s+/g, '-')
    if (normalized && !value.includes(normalized)) {
      onChange([...value, normalized])
    }
    setInputValue('')
    setShowDropdown(false)
  }

  function removeTag(tag) {
    onChange(value.filter(t => t !== tag))
  }

  function toggleTag(tag) {
    if (value.includes(tag)) removeTag(tag)
    else onChange([...value, tag])
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputValue.trim()) addTag(inputValue)
    } else if (e.key === 'Tab' && inputValue.trim() && filtered.length > 0) {
      e.preventDefault()
      addTag(filtered[0])
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  return (
    <div className="tag-input-wrap">
      {frequent.length > 0 && (
        <div className="tag-frequent">
          {frequent.map(tag => {
            const active = value.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                className={`tag-frequent-pill${active ? ' tag-frequent-pill--active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </button>
            )
          })}
        </div>
      )}
      <div
        className="tag-input-pills"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(tag => (
          <span key={tag} className="tag-pill-item">
            #{tag}
            <button
              type="button"
              className="tag-pill-remove"
              onClick={e => { e.stopPropagation(); removeTag(tag) }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="tag-text-input"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setShowDropdown(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder={value.length === 0 ? 'add tags…' : ''}
        />
      </div>

      {showDropdown && filtered.length > 0 && (
        <div className="tag-dropdown">
          {filtered.slice(0, 8).map(tag => (
            <div
              key={tag}
              className="tag-dropdown-item"
              onMouseDown={e => { e.preventDefault(); addTag(tag) }}
            >
              #{tag}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
