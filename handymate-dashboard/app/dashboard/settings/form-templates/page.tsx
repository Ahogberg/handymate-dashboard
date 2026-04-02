'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  X,
  Loader2,
  ChevronDown,
  CheckSquare,
  Type,
  Camera,
  PenTool,
  Heading,
  Save,
  Copy,
} from 'lucide-react'

interface FormField {
  id: string
  type: 'checkbox' | 'text' | 'photo' | 'signature' | 'header'
  label: string
  required: boolean
  description?: string
}

interface FormTemplate {
  id: string
  name: string
  description: string | null
  category: string
  fields: FormField[]
  is_system: boolean
  is_active: boolean
}

const FIELD_TYPES: { type: FormField['type']; label: string; icon: any }[] = [
  { type: 'checkbox', label: 'Kryssruta', icon: CheckSquare },
  { type: 'text', label: 'Textfält', icon: Type },
  { type: 'photo', label: 'Foto', icon: Camera },
  { type: 'signature', label: 'Signatur', icon: PenTool },
  { type: 'header', label: 'Rubrik', icon: Heading },
]

const CATEGORY_OPTIONS = [
  { value: 'egenkontroll', label: 'Egenkontroll' },
  { value: 'safety', label: 'Säkerhet' },
  { value: 'inspection', label: 'Besiktning' },
  { value: 'custom', label: 'Övrigt' },
]

export default function FormTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<FormTemplate | null>(null)
  const [saving, setSaving] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editCategory, setEditCategory] = useState('custom')
  const [editFields, setEditFields] = useState<FormField[]>([])
  const [showAddField, setShowAddField] = useState(false)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/form-templates')
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const startEditing = (template: FormTemplate) => {
    setEditing(template)
    setEditName(template.name)
    setEditDescription(template.description || '')
    setEditCategory(template.category || 'custom')
    setEditFields([...(template.fields || [])])
  }

  const startNew = () => {
    setEditing({ id: '', name: '', description: null, category: 'custom', fields: [], is_system: false, is_active: true })
    setEditName('')
    setEditDescription('')
    setEditCategory('custom')
    setEditFields([])
  }

  const duplicateTemplate = (template: FormTemplate) => {
    setEditing({ ...template, id: '', name: `${template.name} (kopia)`, is_system: false })
    setEditName(`${template.name} (kopia)`)
    setEditDescription(template.description || '')
    setEditCategory(template.category || 'custom')
    setEditFields([...(template.fields || []).map(f => ({ ...f, id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }))])
  }

  const handleSave = async () => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        category: editCategory,
        fields: editFields,
      }

      if (editing?.id) {
        // Update
        const res = await fetch('/api/form-templates', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
        if (!res.ok) throw new Error()
      } else {
        // Create
        const res = await fetch('/api/form-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error()
      }

      setEditing(null)
      fetchTemplates()
    } catch {
      alert('Kunde inte spara mall')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ta bort denna mall?')) return
    try {
      const res = await fetch(`/api/form-templates?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      fetchTemplates()
    } catch {
      alert('Kunde inte ta bort mall')
    }
  }

  const addField = (type: FormField['type']) => {
    const newField: FormField = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      label: '',
      required: type !== 'header',
    }
    setEditFields([...editFields, newField])
    setShowAddField(false)
  }

  const updateField = (index: number, updates: Partial<FormField>) => {
    const fields = [...editFields]
    fields[index] = { ...fields[index], ...updates }
    setEditFields(fields)
  }

  const removeField = (index: number) => {
    setEditFields(editFields.filter((_, i) => i !== index))
  }

  const moveField = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= editFields.length) return
    const fields = [...editFields]
    const temp = fields[index]
    fields[index] = fields[newIndex]
    fields[newIndex] = temp
    setEditFields(fields)
  }

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-500'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
      </div>
    )
  }

  // Editing view
  if (editing) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen max-w-3xl mx-auto">
        <button
          onClick={() => setEditing(null)}
          className="flex items-center gap-1 text-sm text-sky-700 hover:text-primary-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Tillbaka till mallar
        </button>

        <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            {editing.id ? 'Redigera mall' : 'Ny formulärmall'}
          </h2>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Namn *</label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="T.ex. Egenkontroll badrum" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Beskrivning</label>
              <input type="text" value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Valfri beskrivning" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Kategori</label>
              <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className={inputCls}>
                {CATEGORY_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Fields */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Fält</h3>

            {editFields.length === 0 && (
              <p className="text-sm text-gray-400 mb-4">Inga fält tillagda. Klicka "Lägg till fält" nedan.</p>
            )}

            <div className="space-y-2">
              {editFields.map((field, idx) => {
                const typeInfo = FIELD_TYPES.find(t => t.type === field.type)
                const Icon = typeInfo?.icon || CheckSquare
                return (
                  <div key={field.id} className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg group">
                    <div className="flex flex-col gap-0.5 mt-1">
                      <button onClick={() => moveField(idx, -1)} disabled={idx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-30">
                        <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                      </button>
                      <button onClick={() => moveField(idx, 1)} disabled={idx === editFields.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-30">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 shrink-0">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-400 whitespace-nowrap">{typeInfo?.label}</span>
                    </div>

                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={field.label}
                        onChange={e => updateField(idx, { label: e.target.value })}
                        placeholder={field.type === 'header' ? 'Rubriktext...' : 'Fältnamn...'}
                        className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500"
                      />
                      {field.type !== 'header' && (
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={e => updateField(idx, { required: e.target.checked })}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-primary-700"
                            />
                            Obligatoriskt
                          </label>
                          <input
                            type="text"
                            value={field.description || ''}
                            onChange={e => updateField(idx, { description: e.target.value })}
                            placeholder="Beskrivning (valfri)"
                            className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:border-primary-500"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => removeField(idx)}
                      className="mt-2 text-gray-300 hover:text-red-500 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Add field */}
            <div className="mt-3 relative">
              <button
                onClick={() => setShowAddField(!showAddField)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-sky-700 hover:text-primary-700 border border-dashed border-gray-300 rounded-lg hover:border-primary-500 transition w-full justify-center"
              >
                <Plus className="w-4 h-4" /> Lägg till fält
              </button>

              {showAddField && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-2">
                  {FIELD_TYPES.map(ft => {
                    const Icon = ft.icon
                    return (
                      <button
                        key={ft.type}
                        onClick={() => addField(ft.type)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition"
                      >
                        <Icon className="w-4 h-4 text-gray-400" />
                        {ft.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => setEditing(null)}
              className="flex-1 px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600 hover:text-gray-900"
            >
              Avbryt
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Spara mall
            </button>
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen max-w-3xl mx-auto">
      <button
        onClick={() => router.push('/dashboard/settings')}
        className="flex items-center gap-1 text-sm text-sky-700 hover:text-primary-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Tillbaka till inställningar
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Formulärmallar</h1>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Ny mall
        </button>
      </div>

      <div className="space-y-3">
        {templates.map(t => (
          <div
            key={t.id}
            className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 flex items-center gap-4"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-gray-900">{t.name}</h3>
                {t.is_system && (
                  <span className="px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded-full">System</span>
                )}
              </div>
              {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
              <p className="text-xs text-gray-400 mt-1">
                {(t.fields || []).filter(f => f.type !== 'header').length} fält
                {' · '}
                {CATEGORY_OPTIONS.find(c => c.value === t.category)?.label || t.category}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => duplicateTemplate(t)}
                className="p-2 text-gray-400 hover:text-sky-600 transition"
                title="Kopiera"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => startEditing(t)}
                className="p-2 text-gray-400 hover:text-primary-700 transition"
                title="Redigera"
              >
                <GripVertical className="w-4 h-4" />
              </button>
              {!t.is_system && (
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-2 text-gray-400 hover:text-red-500 transition"
                  title="Ta bort"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}

        {templates.length === 0 && (
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400">Inga formulärmallar hittades</p>
          </div>
        )}
      </div>
    </div>
  )
}
