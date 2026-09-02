'use client'

import { useState } from 'react'
import { Loader2, Plus, Send, Trash2, X } from 'lucide-react'
import { ATA_TYP_LABELS } from '@/lib/ata/labels'

/**
 * Skapa/redigera ÄTA.
 *
 * ═══ FÄLLORNA SOM STÄNGTS (2026-09-02) ═══
 *
 * - Rader initieras med `name || description` — prod hade tre ÄTA med
 *   rader nycklade på `description`, som blev namnlösa här och droppades
 *   av `validItems`-filtret → total 0 vid nästa sparning.
 * - En rad med pris men utan namn blockerar sparandet med en synlig varning
 *   i stället för att tyst försvinna.
 * - "Skapa & skicka" — hantverkaren slipper två steg (skapa, expandera,
 *   skicka). Sidan öppnar SendAtaDialog med den nya ÄTA:n.
 * - Fullskärm under 640px, radgrid som viker sig — hantverkare fyller i
 *   ÄTA:n på telefonen på bygget.
 */

export interface ChangeModalItem {
  name: string
  description?: string
  quantity: number
  unit: string
  unit_price: number
  rot_rut_type?: string | null
}

export interface ChangeModalEditing {
  change_id: string
  change_type: string
  description: string
  notes?: string | null
  hours?: number | null
  items?: ChangeModalItem[]
}

type RadState = { id: string; name: string; quantity: number; unit: string; unit_price: number; rot_rut_type: '' | 'rot' | 'rut' }

const TYPER: Array<{ key: 'addition' | 'change' | 'removal'; color: 'emerald' | 'amber' | 'red' }> = [
  { key: 'addition', color: 'emerald' },
  { key: 'change', color: 'amber' },
  { key: 'removal', color: 'red' },
]

export default function ChangeModal({ projectId, editing, customerId, onClose, onSaved, onError }: {
  projectId: string
  editing: ChangeModalEditing | null
  customerId: string | null
  onClose: () => void
  /** `sendNow` = användaren valde "Skapa & skicka"; `changeId` är den nya/redigerade ÄTA:n. */
  onSaved: (result: { changeId: string; sendNow: boolean }) => void
  onError: (msg: string) => void
}) {
  const [changeType, setChangeType] = useState<'addition' | 'change' | 'removal'>(
    (editing?.change_type as any) || 'addition'
  )
  const [description, setDescription] = useState(editing?.description || '')
  const [notes, setNotes] = useState(editing?.notes || '')
  const [hours, setHours] = useState(editing?.hours?.toString() || '')
  const [saving, setSaving] = useState<null | 'save' | 'send'>(null)

  // Item rows. A6 (Prisslingan V2, stänger TD-26): rot_rut_type per rad —
  // utan flaggan blev VARJE ÄTA-rad ROT-lös på fakturan (40 000 kr arbete
  // → 0 kr avdrag). '' = inget avdrag (default, som förut).
  const [items, setItems] = useState<RadState[]>(
    editing?.items?.map((item, idx) => ({
      id: `item_${idx}`,
      name: item.name || item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'st',
      unit_price: item.unit_price || 0,
      rot_rut_type: item.rot_rut_type === 'rot' ? 'rot' : item.rot_rut_type === 'rut' ? 'rut' : '',
    })) || [{ id: 'item_0', name: '', quantity: 1, unit: 'st', unit_price: 0, rot_rut_type: '' as const }]
  )

  const addItem = () => {
    setItems(prev => [...prev, { id: `item_${Date.now()}`, name: '', quantity: 1, unit: 'st', unit_price: 0, rot_rut_type: '' }])
  }

  const updateItemField = (id: string, field: keyof RadState, value: any) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const removeItem = (id: string) => {
    if (items.length <= 1) return
    setItems(prev => prev.filter(item => item.id !== id))
  }

  const total = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)

  // Rad med pris men utan namn: skulle tyst försvinna vid sparning.
  const namnlosaRader = items
    .map((item, idx) => ({ item, nr: idx + 1 }))
    .filter(({ item }) => !item.name.trim() && item.unit_price > 0)
    .map(({ nr }) => nr)
  const kanSpara = description.trim() !== '' && namnlosaRader.length === 0 && !saving

  const handleSave = async (sendNow: boolean) => {
    if (!description.trim()) {
      onError('Beskrivning krävs')
      return
    }
    if (namnlosaRader.length > 0) {
      onError(`Rad ${namnlosaRader.join(', ')} saknar namn`)
      return
    }
    setSaving(sendNow ? 'send' : 'save')
    try {
      const validItems = items.filter(i => i.name.trim()).map(i => ({
        name: i.name.trim(),
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        // A6: både rot_rut_type (AtaItem-formen) och de explicita flaggorna
        // som faktureringsvägarna läser (create-final-invoice, invoice-draft).
        rot_rut_type: i.rot_rut_type || null,
        is_rot_eligible: i.rot_rut_type === 'rot',
        is_rut_eligible: i.rot_rut_type === 'rut',
      }))

      let changeId: string
      if (editing) {
        const res = await fetch(`/api/ata/${editing.change_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            change_type: changeType,
            description: description.trim(),
            items: validItems,
            hours: hours ? parseFloat(hours) : 0,
            notes: notes.trim() || null,
          })
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Kunde inte spara ÄTA')
        }
        changeId = editing.change_id
      } else {
        const res = await fetch('/api/ata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            changeType,
            description: description.trim(),
            items: validItems,
            hours: hours ? parseFloat(hours) : 0,
            notes: notes.trim() || null,
            customerId,
          })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kunde inte skapa ÄTA')
        changeId = data.ata?.change_id
        if (!changeId) throw new Error('ÄTA:n skapades men saknar id')
      }
      onSaved({ changeId, sendNow })
    } catch (err: any) {
      onError(err.message || 'Kunde inte spara ÄTA')
      setSaving(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-stretch sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white sm:rounded-xl sm:border border-[#E2E8F0] w-full sm:max-w-xl p-5 sm:p-6 h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Redigera ÄTA' : 'Ny ÄTA'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900" aria-label="Stäng">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 flex-1">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Typ</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPER.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setChangeType(opt.key)}
                  className={`p-3 rounded-xl text-sm font-medium text-center transition-all border ${
                    changeType === opt.key
                      ? opt.color === 'emerald'
                        ? 'bg-emerald-100 border-emerald-500/30 text-emerald-600'
                        : opt.color === 'amber'
                        ? 'bg-amber-50 border-amber-200 text-amber-600'
                        : 'bg-red-100 border-red-500/30 text-red-600'
                      : 'bg-gray-100 border-gray-300 text-gray-500'
                  }`}
                >
                  {ATA_TYP_LABELS[opt.key]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Beskrivning *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Vad ska göras utöver offerten?"
              autoFocus
              className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] resize-none"
            />
          </div>

          {/* Item rows — grid som viker sig på smal skärm */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Rader</label>
            <div className="space-y-2">
              {items.map((item, idx) => {
                const saknarNamn = namnlosaRader.includes(idx + 1)
                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_4rem_4.5rem_4.5rem_6rem_auto] gap-2 items-center p-2 sm:p-0 rounded-lg ${saknarNamn ? 'bg-amber-50 sm:bg-transparent' : 'bg-gray-50 sm:bg-transparent'}`}
                  >
                    <input
                      type="text"
                      value={item.name}
                      onChange={e => updateItemField(item.id, 'name', e.target.value)}
                      placeholder="Benämning"
                      className={`min-w-0 px-3 py-2 bg-white border rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-[#0F766E] ${saknarNamn ? 'border-amber-400' : 'border-[#E2E8F0]'}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors sm:order-last"
                      disabled={items.length <= 1}
                      aria-label="Ta bort rad"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {/* Mobil: egen rad under benämningen. ≥640px: `contents` lyfter
                        fälten in i yttre gridets kolumner (Antal/Enhet/ROT/à-pris). */}
                    <div className="col-span-2 sm:contents grid grid-cols-[4rem_4.5rem_4.5rem_1fr] gap-2">
                      <input
                        type="number"
                        value={item.quantity || ''}
                        onChange={e => updateItemField(item.id, 'quantity', Number(e.target.value) || 0)}
                        placeholder="Antal"
                        min="0"
                        step="0.5"
                        inputMode="decimal"
                        className="px-2 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:border-[#0F766E]"
                      />
                      <select
                        value={item.unit}
                        onChange={e => updateItemField(item.id, 'unit', e.target.value)}
                        className="px-1 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-600 text-sm focus:outline-none focus:border-[#0F766E]"
                      >
                        <option value="st">st</option>
                        <option value="timme">tim</option>
                        <option value="kvm">m²</option>
                        <option value="m">m</option>
                        <option value="lpm">lpm</option>
                        <option value="kg">kg</option>
                        <option value="paket">pkt</option>
                      </select>
                      <select
                        value={item.rot_rut_type}
                        onChange={e => updateItemField(item.id, 'rot_rut_type', e.target.value)}
                        title="ROT-/RUT-berättigat arbete — styr avdraget när ÄTA:n faktureras"
                        className="px-1 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-600 text-sm focus:outline-none focus:border-[#0F766E]"
                      >
                        <option value="">–</option>
                        <option value="rot">ROT</option>
                        <option value="rut">RUT</option>
                      </select>
                      <input
                        type="number"
                        value={item.unit_price || ''}
                        onChange={e => updateItemField(item.id, 'unit_price', Number(e.target.value) || 0)}
                        placeholder="à-pris"
                        min="0"
                        inputMode="decimal"
                        className="min-w-0 px-2 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                  </div>
                )
              })}
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1.5 text-sm text-primary-700 font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Lägg till rad
              </button>
            </div>
            {namnlosaRader.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Rad {namnlosaRader.join(', ')} saknar namn — ge raden en benämning eller ta bort den.
              </p>
            )}
            {total > 0 && (
              <div className="mt-2 text-right text-sm font-semibold text-gray-900">
                Summa exkl. moms: {total.toLocaleString('sv-SE')} kr
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Timmar (valfritt)</label>
              <input
                type="number"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="0"
                min="0"
                step="0.5"
                inputMode="decimal"
                className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Anteckning</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Intern notering…"
                className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="sm:flex-1 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-100 order-last sm:order-first"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={!kanSpara}
            className={`sm:flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium disabled:opacity-50 ${
              editing
                ? 'bg-primary-700 text-white hover:opacity-90'
                : 'bg-white border border-primary-200 text-primary-700 hover:bg-primary-50'
            }`}
          >
            {saving === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editing ? 'Spara' : 'Spara som utkast'}
          </button>
          {!editing && (
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={!kanSpara}
              className="sm:flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Skapa & skicka
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
