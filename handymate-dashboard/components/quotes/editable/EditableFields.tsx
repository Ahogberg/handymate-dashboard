'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Inline-editable fält som ser ut som vanlig text när man inte hovrar,
 * får en subtil hover-stil när man kan klicka, och blir input vid focus.
 *
 * Designat för att smälta in i mallens visuella stil — inga synliga
 * kanter eller knappar förrän man interagerar.
 */

interface BaseProps {
  className?: string
  /** Visa placeholder när tomt */
  placeholder?: string
}

interface EditableTextProps extends BaseProps {
  value: string
  onChange: (value: string) => void
  /** Multiline → renderar som textarea med auto-grow */
  multiline?: boolean
}

export function EditableText({ value, onChange, className = '', placeholder, multiline }: EditableTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select?.()
    }
  }, [editing])

  function commit() {
    if (draft !== value) onChange(draft)
    setEditing(false)
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Escape') cancel()
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit()
          }}
          className={`editable-input ${className}`}
          placeholder={placeholder}
          rows={Math.max(2, draft.split('\n').length)}
          style={{
            background: '#fffbeb',
            border: '1px dashed #d97706',
            borderRadius: 4,
            padding: '4px 6px',
            font: 'inherit',
            color: 'inherit',
            width: '100%',
            resize: 'none',
            outline: 'none',
            margin: 0,
            display: 'block',
          }}
        />
      )
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') cancel()
          if (e.key === 'Enter') commit()
        }}
        className={`editable-input ${className}`}
        placeholder={placeholder}
        style={{
          background: '#fffbeb',
          border: '1px dashed #d97706',
          borderRadius: 4,
          padding: '2px 6px',
          font: 'inherit',
          color: 'inherit',
          width: '100%',
          outline: 'none',
          margin: 0,
        }}
      />
    )
  }

  const isEmpty = !value || value.trim() === ''
  return (
    <span
      onClick={() => setEditing(true)}
      className={`editable-text ${className}`}
      style={{
        cursor: 'text',
        borderRadius: 3,
        padding: '0 2px',
        margin: '0 -2px',
        transition: 'background 0.1s',
        display: 'inline-block',
        minWidth: '1ch',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(15, 118, 110, 0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {isEmpty ? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{placeholder || 'Klicka för att fylla i'}</span> : value}
    </span>
  )
}

interface EditableNumberProps extends BaseProps {
  value: number
  onChange: (value: number) => void
  /** Hur värdet visas när det inte är i edit-läge */
  format?: (value: number) => string
  step?: number
  min?: number
  /** Bredd på input vid edit */
  width?: number
}

export function EditableNumber({ value, onChange, className = '', format, step = 1, min, width = 80 }: EditableNumberProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(String(value)) }, [value])
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function commit() {
    const parsed = parseFloat(draft.replace(',', '.'))
    if (!isNaN(parsed) && parsed !== value) onChange(parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') { setDraft(String(value)); setEditing(false) }
          if (e.key === 'Enter') commit()
        }}
        className={className}
        style={{
          background: '#fffbeb',
          border: '1px dashed #d97706',
          borderRadius: 4,
          padding: '2px 6px',
          font: 'inherit',
          color: 'inherit',
          width,
          textAlign: 'right',
          outline: 'none',
        }}
        step={step}
        min={min}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={className}
      style={{
        cursor: 'text',
        borderRadius: 3,
        padding: '0 2px',
        margin: '0 -2px',
        transition: 'background 0.1s',
        display: 'inline-block',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(15, 118, 110, 0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {format ? format(value) : value}
    </span>
  )
}

interface EditableSelectProps<T extends string> extends BaseProps {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
}

export function EditableSelect<T extends string>({ value, onChange, options, className = '' }: EditableSelectProps<T>) {
  const current = options.find(o => o.value === value)?.label ?? value
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      className={className}
      style={{
        background: 'transparent',
        border: '1px dashed transparent',
        borderRadius: 3,
        padding: '0 2px',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
      }}
      onFocus={e => { e.currentTarget.style.borderColor = '#d97706'; e.currentTarget.style.background = '#fffbeb' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
      title={current}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
