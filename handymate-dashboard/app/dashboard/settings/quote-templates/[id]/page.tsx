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
  ChevronDown,
  ChevronRight,
  Check,
  MoveUp,
  MoveDown,
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
  const [saved, setSaved] = useState(false)
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
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save template:', err)
    } finally {
      setSaving(false)
    }
  }, [template])

  const updateField = (field: string, value: any) => {
    setTemplate(prev => prev ? { ...prev, [field]: value } : null)
    dirtyRef.current = true
    setSaved(false)
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
        <Loader2 className="w-5 h-5 animate-spin text-[#0F766E]" />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Mall hittades inte.</p>
        <Link href="/dashboard/settings/quote-templates" className="text-[#0F766E] hover:underline mt-2 inline-block text-sm">
          Tillbaka till mallar
        </Link>
      </div>
    )
  }

  const paymentSum = template.default_payment_plan.reduce((s, e) => s + (e.percent || 0), 0)
  const paymentValid = template.default_payment_plan.length === 0 || Math.abs(paymentSum - 100) < 0.01

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings/quote-templates"
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Redigera mall</h1>
            <p className="text-sm text-slate-500">{template.name}</p>
          </div>
        </div>
        <button
          onClick={saveTemplate}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-[#0F766E] text-white text-sm font-medium rounded-lg hover:bg-[#0D6B63] transition-colors"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? 'Sparad' : 'Spara'}
        </button>
      </div>

      {/* Section: Basic Info */}
      <Section title="Namn & Kategori" sectionKey="basic" expanded={expandedSections.basic} onToggle={toggleSection}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] text-[#64748B] mb-1">Mallnamn</label>
            <input
              type="text"
              value={template.name}
              onChange={e => updateField('name', e.target.value)}
              className="w-full border-thin border-[#E2E8F0] bg-white rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F766E] transition-colors"
            />
          </div>
          <div>
            <label className="block text-[12px] text-[#64748B] mb-1">Bransch</label>
            <input
              type="text"
              value={template.branch}
              onChange={e => updateField('branch', e.target.value)}
              className="w-full border-thin border-[#E2E8F0] bg-white rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F766E] transition-colors"
              placeholder="t.ex. bygg, el, vvs"
            />
          </div>
          <div>
            <label className="block text-[12px] text-[#64748B] mb-1">Kategori</label>
            <input
              type="text"
              value={template.category}
              onChange={e => updateField('category', e.target.value)}
              className="w-full border-thin border-[#E2E8F0] bg-white rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F766E] transition-colors"
              placeholder="t.ex. Badrum, Kök"
            />
          </div>
          <div>
            <label className="block text-[12px] text-[#64748B] mb-1">Beskrivning</label>
            <input
              type="text"
              value={template.description}
              onChange={e => updateField('description', e.target.value)}
              className="w-full border-thin border-[#E2E8F0] bg-white rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#0F766E] transition-colors"
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
        <div className="space-y-1.5">
          {template.default_items.map((item, index) => (
            <div
              key={item.id || index}
              className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                item.item_type === 'heading'
                  ? 'bg-[#F8FAFC] border-slate-200'
                  : item.item_type === 'subtotal'
                  ? 'bg-teal-50/30 border-teal-100'
                  : 'bg-white border-[#E2E8F0]'
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveItem(index, index - 1)}
                  disabled={index === 0}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"
                >
                  <MoveUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => moveItem(index, index + 1)}
                  disabled={index === template.default_items.length - 1}
                  className="text-slate-300 hover:text-slate-600 disabled:opacity-30 transition-colors"
                >
                  <MoveDown className="w-3 h-3" />
                </button>
              </div>

              <span className={`text-[10px] uppercase tracking-wide w-14 flex-shrink-0 ${
                item.item_type === 'heading' ? 'text-slate-500 font-medium' :
                item.item_type === 'subtotal' ? 'text-teal-600 font-medium' :
                'text-slate-400'
              }`}>
                {item.item_type === 'heading' ? 'Rubrik' :
                 item.item_type === 'text' ? 'Text' :
                 item.item_type === 'subtotal' ? 'Delsum.' :
                 item.item_type === 'discount' ? 'Rabatt' : 'Post'}
              </span>

              <input
                type="text"
                value={item.description}
                onChange={e => updateItem(index, 'description', e.target.value)}
                className={`flex-1 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#0F766E] px-1 py-0.5 text-sm transition-colors focus:outline-none ${
                  item.item_type === 'heading' ? 'font-semibold text-slate-900' :
                  item.item_type === 'text' ? 'italic text-slate-500' :
                  'text-slate-700'
                }`}
                placeholder="Beskrivning"
              />

              {(item.item_type === 'item' || item.item_type === 'discount') && (
                <>
                  <input
                    type="number"
                    value={item.quantity || ''}
                    onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    className="w-14 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#0F766E] text-right text-sm text-slate-700 px-1 py-0.5 focus:outline-none transition-colors"
                    placeholder="Antal"
                  />
                  <select
                    value={item.unit}
                    onChange={e => updateItem(index, 'unit', e.target.value)}
                    className="w-16 border-thin border-[#E2E8F0] bg-white rounded text-xs text-slate-600 px-1 py-1 focus:outline-none focus:border-[#0F766E]"
                  >
                    {UNIT_OPTIONS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={item.unit_price || ''}
                    onChange={e => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="w-20 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#0F766E] text-right text-sm text-slate-700 px-1 py-0.5 focus:outline-none transition-colors"
                    placeholder="À-pris"
                  />
                  <span className="w-20 text-right text-sm text-slate-500 tabular-nums">
                    {((item.quantity || 0) * (item.unit_price || 0)).toLocaleString('sv-SE')} kr
                  </span>
                </>
              )}

              {item.item_type === 'subtotal' && (
                <span className="text-sm font-semibold text-[#0F766E] ml-auto tabular-nums">
                  {(item.total || 0).toLocaleString('sv-SE')} kr
                </span>
              )}

              {item.item_type === 'item' && (
                <label className="flex items-center gap-1 text-[10px] text-slate-400 ml-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.is_rot_eligible}
                    onChange={e => updateItem(index, 'is_rot_eligible', e.target.checked)}
                    className="rounded border-slate-300 text-[#0F766E] focus:ring-[#0F766E] w-3.5 h-3.5"
                  />
                  ROT
                </label>
              )}

              <button
                onClick={() => removeItem(index)}
                className="text-slate-300 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {[
            { type: 'item' as const, label: 'Post' },
            { type: 'heading' as const, label: 'Rubrik' },
            { type: 'text' as const, label: 'Fritext' },
            { type: 'subtotal' as const, label: 'Delsumma' },
            { type: 'discount' as const, label: 'Rabatt' },
          ].map(btn => (
            <button
              key={btn.type}
              onClick={() => addItem(btn.type)}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-[#F8FAFC] hover:border-slate-300 text-slate-600 text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" /> {btn.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Section: Payment Plan */}
      <Section title="Betalningsplan" sectionKey="payment" expanded={expandedSections.payment} onToggle={toggleSection}>
        <div className="space-y-1.5">
          {template.default_payment_plan.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 p-2.5 bg-white border border-[#E2E8F0] rounded-lg">
              <input
                type="text"
                value={entry.label}
                onChange={e => updatePaymentEntry(index, 'label', e.target.value)}
                className="flex-1 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#0F766E] text-sm text-slate-700 px-1 py-0.5 focus:outline-none transition-colors"
                placeholder="Benämning"
              />
              <input
                type="number"
                value={entry.percent || ''}
                onChange={e => updatePaymentEntry(index, 'percent', parseFloat(e.target.value) || 0)}
                className="w-14 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#0F766E] text-right text-sm text-slate-700 px-1 py-0.5 focus:outline-none transition-colors"
                placeholder="%"
              />
              <span className="text-xs text-slate-400">%</span>
              <input
                type="text"
                value={entry.due_description}
                onChange={e => updatePaymentEntry(index, 'due_description', e.target.value)}
                className="flex-1 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#0F766E] text-sm text-slate-700 px-1 py-0.5 focus:outline-none transition-colors"
                placeholder="Förfaller"
              />
              <button onClick={() => removePaymentEntry(index)} className="text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {!paymentValid && template.default_payment_plan.length > 0 && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            Procentsatserna summerar till {paymentSum}% — de måste bli exakt 100%.
          </div>
        )}

        <button
          onClick={addPaymentEntry}
          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-[#F8FAFC] text-slate-600 text-xs font-medium rounded-lg mt-3 transition-colors"
        >
          <Plus className="w-3 h-3" /> Lägg till delfaktura
        </button>
      </Section>

      {/* Section: Display Settings */}
      <Section title="Visningsinställningar" sectionKey="display" expanded={expandedSections.display} onToggle={toggleSection}>
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] text-[#64748B] mb-1">Detaljnivå</label>
            <select
              value={template.detail_level}
              onChange={e => updateField('detail_level', e.target.value)}
              className="border-thin border-[#E2E8F0] bg-white rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#0F766E] transition-colors"
            >
              <option value="detailed">Detaljerad (alla rader)</option>
              <option value="subtotals_only">Enbart delsummor</option>
              <option value="total_only">Enbart totalsumma</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={template.show_unit_prices}
              onChange={e => updateField('show_unit_prices', e.target.checked)}
              className="rounded border-slate-300 text-[#0F766E] focus:ring-[#0F766E]"
            />
            Visa à-priser
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={template.show_quantities}
              onChange={e => updateField('show_quantities', e.target.checked)}
              className="rounded border-slate-300 text-[#0F766E] focus:ring-[#0F766E]"
            />
            Visa antal
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={template.rot_enabled}
                onChange={e => updateField('rot_enabled', e.target.checked)}
                className="rounded border-slate-300 text-[#0F766E] focus:ring-[#0F766E]"
              />
              ROT-avdrag
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={template.rut_enabled}
                onChange={e => updateField('rut_enabled', e.target.checked)}
                className="rounded border-slate-300 text-[#0F766E] focus:ring-[#0F766E]"
              />
              RUT-avdrag
            </label>
          </div>
        </div>
      </Section>

      {/* Sticky bottom bar (mobile) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-slate-200 md:hidden z-50">
        <button
          onClick={saveTemplate}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0F766E] text-white rounded-lg font-medium hover:bg-[#0D6B63] transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Sparad' : 'Spara mall'}
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
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => onToggle(sectionKey)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-[#F8FAFC] transition-colors"
      >
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {expanded && <div className="px-5 pb-5 border-t border-slate-100">{children}</div>}
    </div>
  )
}

// Simple textarea component
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[12px] text-[#64748B] mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full border-thin border-[#E2E8F0] bg-white rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#0F766E] resize-y transition-colors"
      />
    </div>
  )
}
