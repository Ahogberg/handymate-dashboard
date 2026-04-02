'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useBusiness } from '@/lib/BusinessContext'
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { QuoteItem, PaymentPlanEntry } from '@/lib/types/quote'
import { generateItemId, createDefaultItem, recalculateItems } from '@/lib/quote-calculations'

interface TemplateData {
  id: string
  name: string
  description: string
  branch: string
  category: string
  introduction_text: string
  conclusion_text: string
  not_included: string
  ata_terms: string
  payment_terms_text: string
  default_items: QuoteItem[]
  default_payment_plan: PaymentPlanEntry[]
  detail_level: string
  show_unit_prices: boolean
  show_quantities: boolean
  rot_enabled: boolean
  rut_enabled: boolean
}

const UNIT_OPTIONS = [
  { value: 'st', label: 'st' },
  { value: 'tim', label: 'tim' },
  { value: 'm', label: 'm' },
  { value: 'm2', label: 'm²' },
  { value: 'lm', label: 'lm' },
  { value: 'kg', label: 'kg' },
  { value: 'pauschal', label: 'pauschal' },
]

export default function QuoteTemplateEditorPage() {
  const router = useRouter()
  const params = useParams()
  const business = useBusiness()
  const templateId = (params as any)?.id as string

  const [template, setTemplate] = useState<TemplateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    texts: true,
    items: true,
    payment: false,
    display: false,
  })

  const dirtyRef = useRef(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (templateId) fetchTemplate()
  }, [templateId])

  const fetchTemplate = async () => {
    try {
      const res = await fetch('/api/quote-templates')
      const data = await res.json()
      const found = (data.templates || []).find((t: any) => t.id === templateId)
      if (found) {
        setTemplate({
          id: found.id,
          name: found.name || '',
          description: found.description || '',
          branch: found.branch || '',
          category: found.category || '',
          introduction_text: found.introduction_text || '',
          conclusion_text: found.conclusion_text || '',
          not_included: found.not_included || '',
          ata_terms: found.ata_terms || '',
          payment_terms_text: found.payment_terms_text || '',
          default_items: found.default_items || [],
          default_payment_plan: found.default_payment_plan || [],
          detail_level: found.detail_level || 'detailed',
          show_unit_prices: found.show_unit_prices ?? true,
          show_quantities: found.show_quantities ?? true,
          rot_enabled: found.rot_enabled || false,
          rut_enabled: found.rut_enabled || false,
        })
      }
    } catch (err) {
      console.error('Failed to fetch template:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveTemplate = useCallback(async () => {
    if (!template) return
    setSaving(true)
    try {
      await fetch('/api/quote-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      })
      dirtyRef.current = false
    } catch (err) {
      console.error('Failed to save template:', err)
    } finally {
      setSaving(false)
    }
  }, [template])

  const updateField = (field: string, value: any) => {
    setTemplate(prev => prev ? { ...prev, [field]: value } : null)
    dirtyRef.current = true
    // Auto-save debounce
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveTemplate(), 3000)
  }

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Item management
  const addItem = (type: QuoteItem['item_type']) => {
    if (!template) return
    const items = [...template.default_items]
    const newItem = createDefaultItem(type, items.length)
    items.push(newItem)
    updateField('default_items', items)
  }

  const updateItem = (index: number, field: string, value: any) => {
    if (!template) return
    const items = [...template.default_items]
    items[index] = { ...items[index], [field]: value }
    if (field === 'quantity' || field === 'unit_price') {
      items[index].total = (items[index].quantity || 0) * (items[index].unit_price || 0)
    }
    updateField('default_items', recalculateItems(items))
  }

  const removeItem = (index: number) => {
    if (!template) return
    const items = template.default_items.filter((_, i) => i !== index)
    updateField('default_items', items)
  }

  const moveItem = (from: number, to: number) => {
    if (!template || to < 0 || to >= template.default_items.length) return
    const items = [...template.default_items]
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    const reordered = items.map((item, i) => ({ ...item, sort_order: i }))
    updateField('default_items', reordered)
  }

  // Payment plan management
  const addPaymentEntry = () => {
    if (!template) return
    const plan = [...template.default_payment_plan]
    plan.push({ label: '', percent: 0, amount: 0, due_description: '' })
    updateField('default_payment_plan', plan)
  }

  const updatePaymentEntry = (index: number, field: string, value: any) => {
    if (!template) return
    const plan = [...template.default_payment_plan]
    plan[index] = { ...plan[index], [field]: value }
    updateField('default_payment_plan', plan)
  }

  const removePaymentEntry = (index: number) => {
    if (!template) return
    const plan = template.default_payment_plan.filter((_, i) => i !== index)
    updateField('default_payment_plan', plan)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="p-6 text-center">
        <p className="text-zinc-400">Mall hittades inte.</p>
        <Link href="/dashboard/settings/quote-templates" className="text-primary-500 hover:underline mt-2 inline-block">
          Tillbaka till mallar
        </Link>
      </div>
    )
  }

  const paymentSum = template.default_payment_plan.reduce((s, e) => s + (e.percent || 0), 0)
  const paymentValid = template.default_payment_plan.length === 0 || Math.abs(paymentSum - 100) < 0.01

  return (
    <div className="p-6 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings/quote-templates" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Redigera mall</h1>
            <p className="text-zinc-500 text-sm">{template.name}</p>
          </div>
        </div>
        <button
          onClick={saveTemplate}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-600 text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Spara
        </button>
      </div>

      {/* Section: Basic Info */}
      <Section title="Namn & Kategori" sectionKey="basic" expanded={expandedSections.basic} onToggle={toggleSection}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Mallnamn</label>
            <input
              type="text"
              value={template.name}
              onChange={e => updateField('name', e.target.value)}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-600"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Bransch</label>
            <input
              type="text"
              value={template.branch}
              onChange={e => updateField('branch', e.target.value)}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-600"
              placeholder="t.ex. bygg, el, vvs"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Kategori</label>
            <input
              type="text"
              value={template.category}
              onChange={e => updateField('category', e.target.value)}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-600"
              placeholder="t.ex. Badrum, Kök"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Beskrivning</label>
            <input
              type="text"
              value={template.description}
              onChange={e => updateField('description', e.target.value)}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-600"
              placeholder="Kort beskrivning av mallen"
            />
          </div>
        </div>
      </Section>

      {/* Section: Standard texts */}
      <Section title="Standardtexter" sectionKey="texts" expanded={expandedSections.texts} onToggle={toggleSection}>
        <div className="space-y-4">
          <TextArea label="Inledning" value={template.introduction_text} onChange={v => updateField('introduction_text', v)} />
          <TextArea label="Avslutning" value={template.conclusion_text} onChange={v => updateField('conclusion_text', v)} />
          <TextArea label="Ej inkluderat" value={template.not_included} onChange={v => updateField('not_included', v)} />
          <TextArea label="ÄTA-villkor" value={template.ata_terms} onChange={v => updateField('ata_terms', v)} />
          <TextArea label="Betalningsvillkor" value={template.payment_terms_text} onChange={v => updateField('payment_terms_text', v)} />
        </div>
      </Section>

      {/* Section: Items */}
      <Section title="Specifikationsrader" sectionKey="items" expanded={expandedSections.items} onToggle={toggleSection}>
        <div className="space-y-2">
          {template.default_items.map((item, index) => (
            <div
              key={item.id || index}
              className={`flex items-center gap-2 p-2 rounded-lg border ${
                item.item_type === 'heading'
                  ? 'bg-zinc-800/30 border-zinc-700'
                  : item.item_type === 'subtotal'
                  ? 'bg-zinc-800/50 border-zinc-600'
                  : 'bg-zinc-900/30 border-zinc-800'
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveItem(index, index - 1)} className="text-zinc-600 hover:text-zinc-300 text-xs">&uarr;</button>
                <GripVertical className="w-4 h-4 text-zinc-600" />
                <button onClick={() => moveItem(index, index + 1)} className="text-zinc-600 hover:text-zinc-300 text-xs">&darr;</button>
              </div>

              <span className="text-xs text-zinc-500 w-16 flex-shrink-0">
                {item.item_type === 'heading' ? 'Rubrik' :
                 item.item_type === 'text' ? 'Text' :
                 item.item_type === 'subtotal' ? 'Delsum.' :
                 item.item_type === 'discount' ? 'Rabatt' : 'Post'}
              </span>

              <input
                type="text"
                value={item.description}
                onChange={e => updateItem(index, 'description', e.target.value)}
                className={`flex-1 bg-transparent border-b border-zinc-700 px-1 py-0.5 text-sm focus:outline-none focus:border-primary-600 ${
                  item.item_type === 'heading' ? 'font-bold text-white' :
                  item.item_type === 'text' ? 'italic text-zinc-400' :
                  'text-zinc-200'
                }`}
                placeholder="Beskrivning"
              />

              {(item.item_type === 'item' || item.item_type === 'discount') && (
                <>
                  <input
                    type="number"
                    value={item.quantity || ''}
                    onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-16 bg-transparent border-b border-zinc-700 text-right text-sm text-zinc-200 px-1 py-0.5 focus:outline-none focus:border-primary-600"
                    placeholder="Antal"
                  />
                  <select
                    value={item.unit}
                    onChange={e => updateItem(index, 'unit', e.target.value)}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 px-1 py-0.5"
                  >
                    {UNIT_OPTIONS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={item.unit_price || ''}
                    onChange={e => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="w-20 bg-transparent border-b border-zinc-700 text-right text-sm text-zinc-200 px-1 py-0.5 focus:outline-none focus:border-primary-600"
                    placeholder="À-pris"
                  />
                  <span className="w-20 text-right text-sm text-zinc-400">
                    {((item.quantity || 0) * (item.unit_price || 0)).toLocaleString('sv-SE')} kr
                  </span>
                </>
              )}

              {item.item_type === 'subtotal' && (
                <span className="text-sm font-medium text-zinc-300 ml-auto">
                  {(item.total || 0).toLocaleString('sv-SE')} kr
                </span>
              )}

              {item.item_type === 'item' && (
                <label className="flex items-center gap-1 text-xs text-zinc-500 ml-1">
                  <input
                    type="checkbox"
                    checked={item.is_rot_eligible}
                    onChange={e => updateItem(index, 'is_rot_eligible', e.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-800 text-primary-600 focus:ring-primary-600"
                  />
                  ROT
                </label>
              )}

              <button
                onClick={() => removeItem(index)}
                className="text-zinc-600 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => addItem('item')} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg"><Plus className="w-3.5 h-3.5" /> Post</button>
          <button onClick={() => addItem('heading')} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg"><Plus className="w-3.5 h-3.5" /> Rubrik</button>
          <button onClick={() => addItem('text')} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg"><Plus className="w-3.5 h-3.5" /> Fritext</button>
          <button onClick={() => addItem('subtotal')} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg"><Plus className="w-3.5 h-3.5" /> Delsumma</button>
          <button onClick={() => addItem('discount')} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg"><Plus className="w-3.5 h-3.5" /> Rabatt</button>
        </div>
      </Section>

      {/* Section: Payment Plan */}
      <Section title="Betalningsplan" sectionKey="payment" expanded={expandedSections.payment} onToggle={toggleSection}>
        <div className="space-y-2">
          {template.default_payment_plan.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-zinc-900/30 border border-zinc-800 rounded-lg">
              <input
                type="text"
                value={entry.label}
                onChange={e => updatePaymentEntry(index, 'label', e.target.value)}
                className="flex-1 bg-transparent border-b border-zinc-700 text-sm text-zinc-200 px-1 py-0.5 focus:outline-none focus:border-primary-600"
                placeholder="Benämning"
              />
              <input
                type="number"
                value={entry.percent || ''}
                onChange={e => updatePaymentEntry(index, 'percent', parseFloat(e.target.value) || 0)}
                className="w-16 bg-transparent border-b border-zinc-700 text-right text-sm text-zinc-200 px-1 py-0.5 focus:outline-none focus:border-primary-600"
                placeholder="%"
              />
              <span className="text-sm text-zinc-500">%</span>
              <input
                type="text"
                value={entry.due_description}
                onChange={e => updatePaymentEntry(index, 'due_description', e.target.value)}
                className="flex-1 bg-transparent border-b border-zinc-700 text-sm text-zinc-200 px-1 py-0.5 focus:outline-none focus:border-primary-600"
                placeholder="Förfaller"
              />
              <button onClick={() => removePaymentEntry(index)} className="text-zinc-600 hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {!paymentValid && template.default_payment_plan.length > 0 && (
          <div className="mt-2 p-2 bg-red-900/20 border border-red-800/30 rounded-lg text-red-300 text-sm">
            Procentsatserna summerar till {paymentSum}% – de måste bli exakt 100%.
          </div>
        )}

        <button onClick={addPaymentEntry} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg mt-3">
          <Plus className="w-3.5 h-3.5" /> Lägg till delfaktura
        </button>
      </Section>

      {/* Section: Display Settings */}
      <Section title="Visningsinställningar" sectionKey="display" expanded={expandedSections.display} onToggle={toggleSection}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Detaljnivå</label>
            <select
              value={template.detail_level}
              onChange={e => updateField('detail_level', e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-600"
            >
              <option value="detailed">Detaljerad (alla rader)</option>
              <option value="subtotals_only">Enbart delsummor</option>
              <option value="total_only">Enbart totalsumma</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={template.show_unit_prices}
              onChange={e => updateField('show_unit_prices', e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-primary-600 focus:ring-primary-600"
            />
            Visa à-priser
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={template.show_quantities}
              onChange={e => updateField('show_quantities', e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-primary-600 focus:ring-primary-600"
            />
            Visa antal
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={template.rot_enabled}
                onChange={e => updateField('rot_enabled', e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-primary-600 focus:ring-primary-600"
              />
              ROT-avdrag
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={template.rut_enabled}
                onChange={e => updateField('rut_enabled', e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-primary-600 focus:ring-primary-600"
              />
              RUT-avdrag
            </label>
          </div>
        </div>
      </Section>

      {/* Sticky bottom bar (mobile) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-900/95 backdrop-blur border-t border-zinc-800 md:hidden">
        <button
          onClick={saveTemplate}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-600 text-white rounded-lg font-medium"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Spara mall
        </button>
      </div>
    </div>
  )
}

// Collapsible section component
function Section({
  title, sectionKey, expanded, onToggle, children,
}: {
  title: string
  sectionKey: string
  expanded: boolean
  onToggle: (key: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <span className="font-medium text-white">{title}</span>
        {expanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// Simple textarea component
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm text-zinc-400 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-600 resize-y"
      />
    </div>
  )
}
