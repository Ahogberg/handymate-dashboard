'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Loader2 } from 'lucide-react'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

export interface AddressResult {
  full_address: string
  street_address: string
  postal_code: string
  city: string
  lat: number
  lng: number
}

interface Props {
  value: string
  onChange: (value: string) => void
  onSelect?: (result: AddressResult) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

interface Suggestion {
  id: string
  name: string
  full_address: string
  street: string
  postcode: string
  city: string
  lat: number
  lng: number
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Sök adress...',
  className,
  disabled,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback(async (query: string) => {
    if (!MAPBOX_TOKEN || query.length < 3) {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({
        q: query,
        access_token: MAPBOX_TOKEN,
        country: 'se',
        language: 'sv',
        limit: '5',
        types: 'address',
      })
      const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`)
      if (!res.ok) { setSuggestions([]); return }

      const data = await res.json()
      const items: Suggestion[] = (data.features || []).map((f: any) => {
        const props = f.properties || {}
        const ctx = props.context || {}
        return {
          id: f.id || props.mapbox_id || Math.random().toString(36).slice(2),
          name: props.name || props.full_address || '',
          full_address: props.full_address || props.name || '',
          street: props.name || '',
          postcode: ctx.postcode?.name || '',
          city: ctx.place?.name || ctx.locality?.name || '',
          lat: (f.geometry?.coordinates || [])[1] || 0,
          lng: (f.geometry?.coordinates || [])[0] || 0,
        }
      })
      setSuggestions(items)
      setShowDropdown(items.length > 0)
      setHighlightIdx(-1)
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(val: string) {
    onChange(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.length >= 3 && MAPBOX_TOKEN) {
      timerRef.current = setTimeout(() => search(val), 300)
    } else {
      setSuggestions([])
      setShowDropdown(false)
    }
  }

  function handleSelect(s: Suggestion) {
    onChange(s.full_address)
    setShowDropdown(false)
    setSuggestions([])
    onSelect?.({
      full_address: s.full_address,
      street_address: s.street,
      postal_code: s.postcode,
      city: s.city,
      lat: s.lat,
      lng: s.lng,
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[highlightIdx])
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  const inputCls = className || 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500'

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true) }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`${inputCls} pl-9`}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-500 animate-spin" />}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-start gap-2 transition-colors ${
                i === highlightIdx ? 'bg-teal-50 text-teal-900' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <MapPin className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{s.street}</p>
                <p className="text-xs text-gray-400">{s.postcode} {s.city}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
