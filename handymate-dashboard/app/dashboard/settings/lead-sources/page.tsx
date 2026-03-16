'use client'

import { useEffect, useState, useCallback } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Link2,
  Copy,
  Check,
  Trash2,
  Loader2,
  ExternalLink,
  Mail,
  ToggleLeft,
  ToggleRight,
  X,
  TrendingUp,
} from 'lucide-react'

interface LeadSource {
  id: string
  name: string
  portal_code: string
  api_key: string
  is_active: boolean
  created_at: string
  notes: string | null
  lead_count: number
  won_count: number
}

export default function LeadSourcesPage() {
  const business = useBusiness()
  const [sources, setSources] = useState<LeadSource[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/lead-sources')
      if (!res.ok) throw new Error('Fetch failed')
      const data = await res.json()
      setSources(data.sources || [])
    } catch (err) {
      console.error('Kunde inte hämta lead-källor:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/settings/lead-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), notes: newNotes.trim() || null }),
      })
      if (!res.ok) throw new Error('Create failed')
      setShowModal(false)
      setNewName('')
      setNewNotes('')
      fetchSources()
    } catch (err) {
      console.error('Kunde inte skapa lead-källa:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (source: LeadSource) => {
    try {
      await fetch('/api/settings/lead-sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: source.id, is_active: !source.is_active }),
      })
      setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_active: !s.is_active } : s))
    } catch (err) {
      console.error('Kunde inte uppdatera:', err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Är du säker? Leads som redan skickats påverkas inte.')) return
    try {
      await fetch(`/api/settings/lead-sources?id=${id}`, { method: 'DELETE' })
      setSources(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      console.error('Kunde inte ta bort:', err)
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getPortalUrl = (code: string) => `https://app.handymate.se/lead-portal/${code}`

  const getMailtoUrl = (source: LeadSource) => {
    const portalUrl = getPortalUrl(source.portal_code)
    const subject = encodeURIComponent(`Din lead-portal hos ${business.business_name}`)
    const body = encodeURIComponent(
      `Hej!\n\nDu kan nu skicka leads direkt till oss via din personliga portal:\n\n${portalUrl}\n\nÖppna länken, fyll i lead-informationen och bifoga eventuella handlingar.\nDu kan följa status på alla dina skickade leads i portalen.\n\nHälsningar,\n${business.contact_name || business.business_name}`
    )
    return `mailto:?subject=${subject}&body=${body}`
  }

  if (!business.business_id) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/settings" className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Lead-källor</h1>
            <p className="text-sm text-gray-500">Koppla externa leverantörer som skickar leads</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Lägg till källa
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
          </div>
        ) : sources.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Inga lead-källor ännu</h3>
            <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
              Lägg till leverantörer som Webolia, Offerta eller andra som skickar leads till dig.
              Varje källa får en unik portal-länk.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Lägg till din första källa
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {sources.map(source => {
              const portalUrl = getPortalUrl(source.portal_code)
              const convRate = source.lead_count > 0
                ? Math.round((source.won_count / source.lead_count) * 100)
                : 0

              return (
                <div
                  key={source.id}
                  className={`bg-white rounded-xl border p-5 transition-colors ${source.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
                >
                  {/* Rad 1: Namn + status */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                        <Link2 className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{source.name}</h3>
                        {source.notes && <p className="text-xs text-gray-400">{source.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggle(source)}
                        className="flex items-center gap-1.5 text-xs"
                        title={source.is_active ? 'Inaktivera' : 'Aktivera'}
                      >
                        {source.is_active ? (
                          <>
                            <ToggleRight className="w-5 h-5 text-teal-600" />
                            <span className="text-teal-700 font-medium">Aktiv</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-5 h-5 text-gray-400" />
                            <span className="text-gray-400 font-medium">Inaktiv</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Rad 2: Portal-länk */}
                  <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-500 truncate flex-1 font-mono">{portalUrl}</span>
                    <button
                      onClick={() => copyToClipboard(portalUrl, source.id + '-url')}
                      className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium flex-shrink-0"
                    >
                      {copiedId === source.id + '-url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === source.id + '-url' ? 'Kopierad!' : 'Kopiera'}
                    </button>
                    <a
                      href={getMailtoUrl(source)}
                      className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium flex-shrink-0"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Skicka via mail
                    </a>
                  </div>

                  {/* Rad 3: API-nyckel (dold) */}
                  <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-400">API-nyckel:</span>
                    <span className="text-xs text-gray-500 font-mono truncate flex-1">
                      {source.api_key.slice(0, 8)}••••••••
                    </span>
                    <button
                      onClick={() => copyToClipboard(source.api_key, source.id + '-key')}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium flex-shrink-0"
                    >
                      {copiedId === source.id + '-key' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === source.id + '-key' ? 'Kopierad!' : 'Kopiera'}
                    </button>
                  </div>

                  {/* Rad 4: Statistik + åtgärder */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Leads: <strong className="text-gray-700">{source.lead_count}</strong>
                      </span>
                      <span>
                        Vunna: <strong className="text-green-600">{source.won_count}</strong>
                      </span>
                      <span>
                        Konv: <strong className={convRate > 20 ? 'text-green-600' : 'text-gray-700'}>{convRate}%</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors"
                        title="Öppna portal"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleDelete(source.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                        title="Ta bort"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal: Lägg till källa */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Lägg till lead-källa</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Namn på källa *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="t.ex. Webolia"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Anteckningar</label>
                <textarea
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="t.ex. Säljer leads inom el och VVS"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Skapa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
