'use client'

import { useEffect, useState } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  Loader2,
  FileText,
  Sparkles,
  Star,
} from 'lucide-react'
import Link from 'next/link'

interface StandardText {
  id: string
  business_id: string
  text_type: string
  name: string
  content: string
  is_default: boolean
  created_at?: string
  updated_at?: string
}

const TEXT_TYPES = [
  { value: 'introduction', label: 'Inledning', description: 'Inledande text som visas överst i offerten' },
  { value: 'conclusion', label: 'Avslutning', description: 'Avslutande text innan signatur' },
  { value: 'not_included', label: 'Ej inkluderat', description: 'Saker som inte ingår i offerten' },
  { value: 'ata_terms', label: 'ÄTA-villkor', description: 'Villkor för ändrings- och tilläggsarbeten' },
  { value: 'payment_terms', label: 'Betalningsvillkor', description: 'Betalningsvillkor och faktureringsinfo' },
]

export default function QuoteStandardTextsPage() {
  const business = useBusiness()
  const [texts, setTexts] = useState<StandardText[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [activeTab, setActiveTab] = useState('introduction')

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  // New text state
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState('introduction')

  useEffect(() => {
    if (business) fetchTexts()
  }, [business])

  const fetchTexts = async () => {
    try {
      const res = await fetch('/api/quote-standard-texts')
      const data = await res.json()
      setTexts(data.texts || [])
    } catch (err) {
      console.error('Failed to fetch texts:', err)
    } finally {
      setLoading(false)
    }
  }

  const seedDefaults = async () => {
    setSeeding(true)
    try {
      // Trigger seed via the template seed endpoint which also seeds standard texts
      const res = await fetch('/api/quote-templates/seed', { method: 'POST' })
      if (res.ok) {
        await fetchTexts()
      }
    } catch (err) {
      console.error('Failed to seed:', err)
    } finally {
      setSeeding(false)
    }
  }

  const startEdit = (text: StandardText) => {
    setEditingId(text.id)
    setEditName(text.name)
    setEditContent(text.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditContent('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      const res = await fetch('/api/quote-standard-texts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name: editName, content: editContent }),
      })
      if (res.ok) {
        const data = await res.json()
        setTexts(prev => prev.map(t => t.id === editingId ? data.text : t))
        cancelEdit()
      }
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }

  const toggleDefault = async (text: StandardText) => {
    try {
      const res = await fetch('/api/quote-standard-texts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: text.id, is_default: !text.is_default }),
      })
      if (res.ok) {
        const data = await res.json()
        // If setting as default, unset others of same type
        if (data.text.is_default) {
          setTexts(prev =>
            prev.map(t => {
              if (t.id === text.id) return data.text
              if (t.text_type === text.text_type && t.is_default) return { ...t, is_default: false }
              return t
            })
          )
        } else {
          setTexts(prev => prev.map(t => t.id === text.id ? data.text : t))
        }
      }
    } catch (err) {
      console.error('Failed to toggle default:', err)
    }
  }

  const deleteText = async (id: string) => {
    if (!confirm('Vill du ta bort denna standardtext?')) return
    try {
      await fetch(`/api/quote-standard-texts?id=${id}`, { method: 'DELETE' })
      setTexts(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const createNew = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/quote-standard-texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text_type: showNew ? activeTab : newType,
          name: newName,
          content: newContent,
          is_default: false,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setTexts(prev => [...prev, data.text])
        setShowNew(false)
        setNewName('')
        setNewContent('')
      }
    } catch (err) {
      console.error('Failed to create:', err)
    } finally {
      setSaving(false)
    }
  }

  const filteredTexts = texts.filter(t => t.text_type === activeTab)
  const activeTypeInfo = TEXT_TYPES.find(t => t.value === activeTab)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="text-gray-400 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Standardtexter</h1>
            <p className="text-gray-500 text-sm">Hantera texter som används i offerter</p>
          </div>
        </div>
        <div className="flex gap-2">
          {texts.length === 0 && (
            <button
              onClick={seedDefaults}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 hover:bg-gray-200 text-gray-900 rounded-lg transition-colors"
            >
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Skapa standardtexter
            </button>
          )}
          <button
            onClick={() => { setShowNew(true); setNewType(activeTab) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Ny text
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-gray-200 pb-px">
        {TEXT_TYPES.map(type => {
          const count = texts.filter(t => t.text_type === type.value).length
          return (
            <button
              key={type.value}
              onClick={() => setActiveTab(type.value)}
              className={`px-4 py-2.5 text-sm whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === type.value
                  ? 'border-primary-600 text-sky-700 font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              {type.label}
              {count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary-700" />
        </div>
      )}

      {/* Description */}
      {!loading && activeTypeInfo && (
        <p className="text-sm text-gray-500 mb-4">{activeTypeInfo.description}</p>
      )}

      {/* Empty state */}
      {!loading && filteredTexts.length === 0 && !showNew && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Inga {activeTypeInfo?.label.toLowerCase() || 'texter'} sparade
          </h3>
          <p className="text-gray-500 mb-6">
            Skapa en ny standardtext eller generera förslag baserat på din bransch.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={seedDefaults}
              disabled={seeding}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-200"
            >
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generera standardtexter
            </button>
            <button
              onClick={() => { setShowNew(true); setNewType(activeTab) }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              Skapa ny
            </button>
          </div>
        </div>
      )}

      {/* New text form */}
      {showNew && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Ny {activeTypeInfo?.label.toLowerCase() || 'text'}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Namn</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="T.ex. Standard inledning"
                autoFocus
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Innehåll</label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                rows={5}
                placeholder="Skriv din text här..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E] resize-y"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowNew(false); setNewName(''); setNewContent('') }}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900"
              >
                Avbryt
              </button>
              <button
                onClick={createNew}
                disabled={!newName.trim() || saving}
                className="flex items-center gap-1 px-4 py-1.5 bg-primary-700 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text list */}
      {!loading && filteredTexts.length > 0 && (
        <div className="space-y-3">
          {filteredTexts.map(text => (
            <div
              key={text.id}
              className="bg-white border border-[#E2E8F0] rounded-xl p-4 hover:border-gray-300 transition-colors"
            >
              {editingId === text.id ? (
                // Edit mode
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Namn</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Innehåll</label>
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E] resize-y"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900"
                    >
                      <X className="w-3.5 h-3.5" />
                      Avbryt
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="flex items-center gap-1 px-4 py-1.5 bg-primary-700 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Spara
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{text.name}</h3>
                      {text.is_default && (
                        <span className="px-1.5 py-0.5 bg-primary-50 text-sky-700 text-[10px] font-medium rounded">
                          Standard
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleDefault(text)}
                        title={text.is_default ? 'Ta bort som standard' : 'Sätt som standard'}
                        className={`p-1.5 rounded transition-colors ${
                          text.is_default
                            ? 'text-yellow-500 hover:text-yellow-600'
                            : 'text-gray-300 hover:text-yellow-500'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${text.is_default ? 'fill-yellow-400' : ''}`} />
                      </button>
                      <button
                        onClick={() => startEdit(text)}
                        className="p-1.5 text-gray-400 hover:text-gray-900 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteText(text.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-4">
                    {text.content || '(tom)'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
