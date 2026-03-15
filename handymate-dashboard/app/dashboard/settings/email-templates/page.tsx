'use client'

import { useEffect, useState } from 'react'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import {
  Mail,
  Plus,
  X,
  Loader2,
  Trash2,
  Edit,
  Copy,
  Eye,
  Save,
  FileText
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'

interface EmailTemplate {
  template_id: string
  name: string
  subject: string
  body: string
  category: string
  variables: string[]
  is_default: boolean
  created_at: string
}

const CATEGORIES = [
  { id: 'general', label: 'Allmänt' },
  { id: 'invoice', label: 'Faktura' },
  { id: 'quote', label: 'Offert' },
  { id: 'booking', label: 'Bokning' },
  { id: 'reminder', label: 'Påminnelse' },
  { id: 'follow_up', label: 'Uppföljning' },
  { id: 'warranty', label: 'Garanti' },
]

const AVAILABLE_VARIABLES = [
  { key: '{{customer_name}}', label: 'Kundnamn' },
  { key: '{{business_name}}', label: 'Företagsnamn' },
  { key: '{{invoice_number}}', label: 'Fakturanummer' },
  { key: '{{quote_number}}', label: 'Offertnummer' },
  { key: '{{amount}}', label: 'Belopp' },
  { key: '{{due_date}}', label: 'Förfallodatum' },
  { key: '{{booking_date}}', label: 'Bokningsdatum' },
  { key: '{{warranty_end}}', label: 'Garantislut' },
]

export default function EmailTemplatesPage() {
  const business = useBusiness()
  const { hasFeature: canAccess } = useBusinessPlan()
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const [form, setForm] = useState({
    name: '',
    subject: '',
    body: '',
    category: 'general',
  })

  useEffect(() => {
    if (business.business_id) fetchData()
  }, [business.business_id])

  async function fetchData() {
    setLoading(true)
    try {
      const response = await fetch('/api/email-templates')
      const data = await response.json()
      setTemplates(data.templates || [])
    } catch {
      // ignore
    }
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const openCreate = () => {
    setEditingTemplate(null)
    setForm({ name: '', subject: '', body: '', category: 'general' })
    setShowEditor(true)
  }

  const openEdit = (t: EmailTemplate) => {
    setEditingTemplate(t)
    setForm({ name: t.name, subject: t.subject, body: t.body, category: t.category })
    setShowEditor(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.body) {
      showToast('Namn, ämne och innehåll krävs', 'error')
      return
    }
    setActionLoading(true)
    try {
      const response = await fetch('/api/email-templates', {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTemplate ? { template_id: editingTemplate.template_id, ...form } : form),
      })
      if (!response.ok) throw new Error()
      showToast(editingTemplate ? 'Mall uppdaterad!' : 'Mall skapad!', 'success')
      setShowEditor(false)
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (templateId: string) => {
    if (!confirm('Ta bort e-postmall?')) return
    try {
      await fetch(`/api/email-templates?templateId=${templateId}`, { method: 'DELETE' })
      showToast('Mall borttagen!', 'success')
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const handleDuplicate = async (t: EmailTemplate) => {
    try {
      await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${t.name} (kopia)`,
          subject: t.subject,
          body: t.body,
          category: t.category,
        }),
      })
      showToast('Mall duplicerad!', 'success')
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const insertVariable = (variable: string) => {
    setForm(prev => ({ ...prev, body: prev.body + variable }))
  }

  const getCategoryLabel = (id: string) => CATEGORIES.find(c => c.id === id)?.label || id

  const filteredTemplates = templates.filter(t => !filterCategory || t.category === filterCategory)

  const getPreviewHtml = () => {
    let html = form.body
    html = html.replace(/{{customer_name}}/g, 'Anna Johansson')
    html = html.replace(/{{business_name}}/g, business.business_name || 'Mitt Företag')
    html = html.replace(/{{invoice_number}}/g, '2026-001')
    html = html.replace(/{{quote_number}}/g, 'OFF-2026-001')
    html = html.replace(/{{amount}}/g, '15 000 kr')
    html = html.replace(/{{due_date}}/g, '2026-03-15')
    html = html.replace(/{{booking_date}}/g, '2026-02-25')
    html = html.replace(/{{warranty_end}}/g, '2028-02-18')
    return html
  }

  if (!canAccess('email_template_editor')) return <UpgradePrompt featureKey="email_template_editor" />

  if (loading) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-6 py-3 rounded-xl text-white font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">E-postmallar</h1>
          <p className="text-gray-500 mt-1">Skapa och hantera e-postmallar för fakturor, offerter, påminnelser m.m.</p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto">
            <button
              onClick={() => setFilterCategory('')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                !filterCategory ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Alla ({templates.length})
            </button>
            {CATEGORIES.map(c => {
              const count = templates.filter(t => t.category === c.id).length
              if (count === 0) return null
              return (
                <button
                  key={c.id}
                  onClick={() => setFilterCategory(c.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    filterCategory === c.id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {c.label} ({count})
                </button>
              )
            })}
          </div>
          <button
            onClick={openCreate}
            className="sm:ml-auto flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-teal-500 to-teal-500 rounded-xl font-medium text-white hover:opacity-90 min-h-[44px]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny mall
          </button>
        </div>

        {/* Template list */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200">
          {filteredTemplates.length === 0 ? (
            <div className="p-12 text-center">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-400">Inga e-postmallar</p>
              <button onClick={openCreate} className="mt-4 text-teal-600 hover:text-teal-500">
                Skapa din första mall →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredTemplates.map(t => (
                <div key={t.template_id} className="p-4 sm:p-5 hover:bg-gray-50/50 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <h3 className="font-semibold text-gray-900">{t.name}</h3>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-teal-50 text-teal-600 border border-teal-200">
                          {getCategoryLabel(t.category)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">Ämne: {t.subject}</p>
                      <p className="text-sm text-gray-400 mt-1 line-clamp-1">{t.body.replace(/<[^>]+>/g, '').substring(0, 100)}...</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { openEdit(t); setShowPreview(true) }} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Förhandsgranska">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDuplicate(t)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Duplicera">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(t)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg" title="Redigera">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(t.template_id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Ta bort">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">{editingTemplate ? 'Redigera mall' : 'Ny e-postmall'}</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium ${showPreview ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  <Eye className="w-4 h-4 inline mr-1" />
                  Förhandsvisa
                </button>
                <button onClick={() => { setShowEditor(false); setShowPreview(false) }} className="p-2 text-gray-400 hover:text-gray-900">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {showPreview ? (
              <div className="border border-gray-200 rounded-xl p-6 bg-gray-50 min-h-[200px]">
                <p className="text-sm text-gray-400 mb-2">Ämne: <strong className="text-gray-900">{form.subject}</strong></p>
                <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: getPreviewHtml().replace(/\n/g, '<br>') }} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Mallnamn *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="T.ex. Faktura-påminnelse"
                      className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Kategori</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Ämne *</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="E-postens ämnesrad"
                    className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Innehåll *</label>
                  <textarea
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                    placeholder="Skriv ditt e-postmeddelande här..."
                    rows={10}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none font-mono text-sm"
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-2">Infoga variabel:</p>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_VARIABLES.map(v => (
                      <button
                        key={v.key}
                        onClick={() => insertVariable(v.key)}
                        className="px-2.5 py-1 text-xs bg-teal-50 text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-100"
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowEditor(false); setShowPreview(false) }} className="px-4 py-2 text-gray-500 hover:text-gray-900">
                Avbryt
              </button>
              <button
                onClick={handleSave}
                disabled={actionLoading}
                className="flex items-center px-4 py-2 bg-gradient-to-r from-teal-500 to-teal-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {editingTemplate ? 'Uppdatera' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
