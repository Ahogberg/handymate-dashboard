'use client'

import { useState } from 'react'
import { Sparkles, Trash2, Plus, TrendingUp, Edit3, Check, ChevronDown, ChevronUp } from 'lucide-react'

interface QuoteItem {
  id: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  type: 'labor' | 'material' | 'service'
  confidence: number
}

interface AIQuotePreviewProps {
  jobTitle: string
  jobDescription: string
  items: QuoteItem[]
  confidence: number
  reasoning: string
  suggestedDeductionType: 'none' | 'rot' | 'rut'
  priceComparison: { average: number; min: number; max: number; count: number }
  similarQuotes: Array<{ id: string; title: string; total: number }>
  onAccept: (data: {
    title: string
    description: string
    items: Array<{
      id: string
      type: 'labor' | 'material' | 'service'
      name: string
      quantity: number
      unit: string
      unit_price: number
      total: number
    }>
    rotRutType: '' | 'rot' | 'rut'
  }) => void
  onRegenerate: () => void
}

export default function AIQuotePreview({
  jobTitle,
  jobDescription,
  items: initialItems,
  confidence,
  reasoning,
  suggestedDeductionType,
  priceComparison,
  similarQuotes,
  onAccept,
  onRegenerate
}: AIQuotePreviewProps) {
  const [title, setTitle] = useState(jobTitle)
  const [description, setDescription] = useState(jobDescription)
  const [items, setItems] = useState(initialItems)
  const [rotRut, setRotRut] = useState<'' | 'rot' | 'rut'>(suggestedDeductionType === 'none' ? '' : suggestedDeductionType)
  const [showReasoning, setShowReasoning] = useState(false)

  const updateItem = (id: string, field: string, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
  }

  const addItem = (type: 'labor' | 'material') => {
    setItems([...items, {
      id: `item_${Math.random().toString(36).substr(2, 9)}`,
      description: '',
      quantity: 1,
      unit: type === 'labor' ? 'timmar' : 'st',
      unitPrice: 0,
      type,
      confidence: 100
    }])
  }

  const laborCost = items.filter(i => i.type === 'labor').reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const materialCost = items.filter(i => i.type !== 'labor').reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const total = laborCost + materialCost

  const formatCurrency = (n: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n)

  function handleAccept() {
    onAccept({
      title,
      description,
      items: items.map(item => ({
        id: item.id,
        type: item.type,
        name: item.description,
        quantity: item.quantity,
        unit: item.unit === 'timmar' ? 'hour' : item.unit === 'st' ? 'piece' : item.unit,
        unit_price: item.unitPrice,
        total: item.quantity * item.unitPrice
      })),
      rotRutType: rotRut
    })
  }

  const confidenceColor = confidence >= 75 ? 'text-emerald-600' : confidence >= 50 ? 'text-amber-600' : 'text-red-600'

  return (
    <div className="space-y-4">
      {/* Header with confidence */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">AI-förslag</h2>
        </div>
        <span className={`text-sm font-medium ${confidenceColor}`}>
          Träffsäkerhet: {confidence}%
        </span>
      </div>

      {/* Reasoning toggle */}
      <button
        onClick={() => setShowReasoning(!showReasoning)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        {showReasoning ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        AI-resonemang
      </button>
      {showReasoning && (
        <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">{reasoning}</p>
      )}

      {/* Editable title & description */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Jobbtitel</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Beskrivning till kund</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
          />
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-400">Offertrader</label>
          <div className="flex gap-2">
            <button onClick={() => addItem('labor')} className="text-xs text-blue-400 hover:text-blue-700">+ Arbete</button>
            <button onClick={() => addItem('material')} className="text-xs text-emerald-600 hover:text-emerald-700">+ Material</button>
          </div>
        </div>
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                item.type === 'labor' ? 'bg-blue-100 text-blue-400' : 'bg-emerald-100 text-emerald-600'
              }`}>
                {item.type === 'labor' ? 'Arb' : 'Mat'}
              </span>
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                className="flex-1 px-2 py-1 bg-gray-200 border border-gray-300 rounded text-gray-900 text-sm focus:outline-none min-w-0"
                placeholder="Beskrivning"
              />
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                className="w-14 px-2 py-1 bg-gray-200 border border-gray-300 rounded text-gray-900 text-sm text-center focus:outline-none"
              />
              <span className="text-gray-400 text-xs w-6">{item.unit === 'timmar' ? 'h' : 'st'}</span>
              <input
                type="number"
                value={item.unitPrice}
                onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                className="w-20 px-2 py-1 bg-gray-200 border border-gray-300 rounded text-gray-900 text-sm text-right focus:outline-none"
              />
              <span className="text-gray-900 text-sm font-medium w-20 text-right">{formatCurrency(item.quantity * item.unitPrice)}</span>
              <button onClick={() => removeItem(item.id)} className="p-1 text-gray-400 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="border-t border-gray-300 pt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Arbetskostnad</span>
          <span className="text-gray-900">{formatCurrency(laborCost)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Materialkostnad</span>
          <span className="text-gray-900">{formatCurrency(materialCost)}</span>
        </div>
        <div className="flex justify-between font-semibold text-base pt-2 border-t border-gray-300">
          <span className="text-gray-900">Summa exkl moms</span>
          <span className="text-gray-900">{formatCurrency(total)}</span>
        </div>
      </div>

      {/* ROT/RUT suggestion */}
      {suggestedDeductionType !== 'none' && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="text-sm text-emerald-600">
            {suggestedDeductionType.toUpperCase()}-avdrag rekommenderas
          </span>
          <button
            onClick={() => setRotRut(rotRut ? '' : suggestedDeductionType as 'rot' | 'rut')}
            className={`ml-auto px-3 py-1 text-xs rounded-lg ${
              rotRut ? 'bg-emerald-500 text-gray-900' : 'bg-gray-100 text-gray-500 hover:text-gray-900'
            }`}
          >
            {rotRut ? 'Aktiverat' : 'Aktivera'}
          </button>
        </div>
      )}

      {/* Price comparison */}
      {priceComparison.count > 0 && (
        <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-cyan-600" />
            <span className="text-sm font-medium text-gray-900">Jämfört med din historik</span>
          </div>
          <p className="text-xs text-gray-500">
            Liknande jobb: {formatCurrency(priceComparison.min)} – {formatCurrency(priceComparison.max)} (snitt: {formatCurrency(priceComparison.average)})
          </p>
          {total > 0 && priceComparison.average > 0 && (
            <p className={`text-xs mt-1 ${total < priceComparison.average * 0.85 ? 'text-amber-600' : total > priceComparison.average * 1.15 ? 'text-amber-600' : 'text-emerald-600'}`}>
              Denna offert är {Math.round(((total - priceComparison.average) / priceComparison.average) * 100)}% {total < priceComparison.average ? 'under' : 'över'} ditt snitt
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onRegenerate}
          className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200 text-sm min-h-[48px]"
        >
          Generera nytt förslag
        </button>
        <button
          onClick={handleAccept}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 text-sm min-h-[48px]"
        >
          Använd förslaget
        </button>
      </div>
    </div>
  )
}
