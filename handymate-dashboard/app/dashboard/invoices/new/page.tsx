'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  FileText,
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Timer,
  Calculator
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string | null
  address_line: string | null
}

interface TimeEntry {
  entry_id: string
  work_date: string
  hours_worked: number
  hourly_rate: number | null
  materials_cost: number | null
  description: string | null
  customer_id: string | null
  customer?: { name: string }
  invoice_id: string | null
}

interface InvoiceItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  type?: 'labor' | 'material'
}

export default function NewInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])

  // Form state
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') || '')
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [vatRate, setVatRate] = useState(25)
  const [rotRutType, setRotRutType] = useState<'' | 'rot' | 'rut'>('')
  const [dueDays, setDueDays] = useState(30)

  // Time entry selection
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<string[]>([])
  const [showTimeEntries, setShowTimeEntries] = useState(false)

  useEffect(() => {
    if (business.business_id) {
      fetchData()
    }
  }, [business.business_id])

  async function fetchData() {
    // Fetch customers
    const { data: customersData } = await supabase
      .from('customer')
      .select('*')
      .eq('business_id', business.business_id)
      .order('name')

    // Fetch unfactured time entries
    const { data: timeData } = await supabase
      .from('time_entry')
      .select(`
        *,
        customer:customer_id (name)
      `)
      .eq('business_id', business.business_id)
      .is('invoice_id', null)
      .order('work_date', { ascending: false })

    setCustomers(customersData || [])
    setTimeEntries(timeData || [])
    setLoading(false)
  }

  const addItem = () => {
    setItems([...items, {
      description: '',
      quantity: 1,
      unit: 'st',
      unit_price: 0,
      total: 0,
      type: 'labor'
    }])
  }

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }

    // Recalculate total
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total = newItems[index].quantity * newItems[index].unit_price
    }

    setItems(newItems)
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const addTimeEntriesToInvoice = () => {
    const selected = timeEntries.filter(te => selectedTimeEntries.includes(te.entry_id))
    const newItems: InvoiceItem[] = []

    for (const entry of selected) {
      const laborCost = (entry.hours_worked || 0) * (entry.hourly_rate || 500)
      newItems.push({
        description: entry.description || `Arbete ${new Date(entry.work_date).toLocaleDateString('sv-SE')}`,
        quantity: entry.hours_worked || 0,
        unit: 'timmar',
        unit_price: entry.hourly_rate || 500,
        total: laborCost,
        type: 'labor'
      })

      if (entry.materials_cost && entry.materials_cost > 0) {
        newItems.push({
          description: `Material (${new Date(entry.work_date).toLocaleDateString('sv-SE')})`,
          quantity: 1,
          unit: 'st',
          unit_price: entry.materials_cost,
          total: entry.materials_cost,
          type: 'material'
        })
      }

      // Set customer if not set
      if (!customerId && entry.customer_id) {
        setCustomerId(entry.customer_id)
      }
    }

    setItems([...items, ...newItems])
    setShowTimeEntries(false)
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const vatAmount = subtotal * (vatRate / 100)
  const total = subtotal + vatAmount

  const laborCost = items.filter(i => i.type === 'labor').reduce((sum, i) => sum + i.total, 0)
  const rotRutDeduction = rotRutType
    ? Math.round(laborCost * (rotRutType === 'rot' ? 0.30 : 0.50) * 100) / 100
    : 0
  const customerPays = total - rotRutDeduction

  const handleCreate = async () => {
    if (items.length === 0) {
      alert('Lägg till minst en rad')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          customer_id: customerId || null,
          items,
          vat_rate: vatRate,
          rot_rut_type: rotRutType || null,
          due_days: dueDays,
          time_entry_ids: selectedTimeEntries.length > 0 ? selectedTimeEntries : undefined
        })
      })

      if (!response.ok) throw new Error('Kunde inte skapa faktura')

      const data = await response.json()
      router.push(`/dashboard/invoices/${data.invoice.invoice_id}`)
    } catch (error) {
      alert('Något gick fel')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {/* Time Entry Modal */}
      {showTimeEntries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Välj tidrapporter</h3>

            {timeEntries.length === 0 ? (
              <p className="text-zinc-500 py-8 text-center">Inga ofakturerade tidrapporter</p>
            ) : (
              <div className="space-y-2">
                {timeEntries.map((entry) => {
                  const laborCost = (entry.hours_worked || 0) * (entry.hourly_rate || 500)
                  const totalCost = laborCost + (entry.materials_cost || 0)

                  return (
                    <label
                      key={entry.entry_id}
                      className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                        selectedTimeEntries.includes(entry.entry_id)
                          ? 'bg-violet-500/10 border-violet-500/50'
                          : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTimeEntries.includes(entry.entry_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTimeEntries([...selectedTimeEntries, entry.entry_id])
                          } else {
                            setSelectedTimeEntries(selectedTimeEntries.filter(id => id !== entry.entry_id))
                          }
                        }}
                        className="w-5 h-5 rounded border-zinc-600 text-violet-500 focus:ring-violet-500"
                      />
                      <div className="flex-1">
                        <p className="text-white font-medium">
                          {new Date(entry.work_date).toLocaleDateString('sv-SE')} - {entry.hours_worked}h
                        </p>
                        <p className="text-sm text-zinc-400">
                          {entry.customer?.name || 'Ingen kund'} - {entry.description || 'Ingen beskrivning'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-medium">{totalCost.toLocaleString('sv-SE')} kr</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowTimeEntries(false)
                  setSelectedTimeEntries([])
                }}
                className="px-4 py-2 text-zinc-400 hover:text-white"
              >
                Avbryt
              </button>
              <button
                onClick={addTimeEntriesToInvoice}
                disabled={selectedTimeEntries.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Lägg till ({selectedTimeEntries.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/invoices" className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Ny faktura</h1>
            <p className="text-sm text-zinc-400">Skapa och skicka en faktura</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Customer & Settings */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Kund</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="">Välj kund...</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Betalningsvillkor</label>
                <select
                  value={dueDays}
                  onChange={(e) => setDueDays(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value={10}>10 dagar</option>
                  <option value={15}>15 dagar</option>
                  <option value={30}>30 dagar</option>
                  <option value={45}>45 dagar</option>
                  <option value={60}>60 dagar</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Momssats</label>
                <select
                  value={vatRate}
                  onChange={(e) => setVatRate(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value={25}>25%</option>
                  <option value={12}>12%</option>
                  <option value={6}>6%</option>
                  <option value={0}>0% (momsfri)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">ROT/RUT-avdrag</label>
                <select
                  value={rotRutType}
                  onChange={(e) => setRotRutType(e.target.value as '' | 'rot' | 'rut')}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="">Inget avdrag</option>
                  <option value="rot">ROT-avdrag (30%)</option>
                  <option value="rut">RUT-avdrag (50%)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Rader</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTimeEntries(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700"
                >
                  <Timer className="w-4 h-4" />
                  Från tidrapport
                </button>
                <button
                  onClick={addItem}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-violet-500/20 border border-violet-500/30 rounded-xl text-violet-400 hover:bg-violet-500/30"
                >
                  <Plus className="w-4 h-4" />
                  Lägg till rad
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-zinc-700 rounded-xl">
                <Calculator className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500 mb-2">Inga rader ännu</p>
                <p className="text-sm text-zinc-600">Lägg till rader manuellt eller från tidrapporter</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-3 p-4 bg-zinc-800/50 rounded-xl">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs text-zinc-500 mb-1">Beskrivning</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-zinc-500 mb-1">Antal</label>
                      <input
                        type="number"
                        step="0.5"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-zinc-500 mb-1">Enhet</label>
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      >
                        <option value="st">st</option>
                        <option value="timmar">timmar</option>
                        <option value="m">m</option>
                        <option value="m²">m²</option>
                        <option value="kg">kg</option>
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-zinc-500 mb-1">à-pris</label>
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateItem(index, 'unit_price', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-zinc-500 mb-1">Typ</label>
                      <select
                        value={item.type || 'labor'}
                        onChange={(e) => updateItem(index, 'type', e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      >
                        <option value="labor">Arbete</option>
                        <option value="material">Material</option>
                      </select>
                    </div>
                    <div className="w-24 text-right">
                      <label className="block text-xs text-zinc-500 mb-1">Summa</label>
                      <p className="py-2 text-white font-medium">{item.total.toLocaleString('sv-SE')} kr</p>
                    </div>
                    <button
                      onClick={() => removeItem(index)}
                      className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
            <div className="max-w-sm ml-auto space-y-3">
              <div className="flex justify-between text-zinc-400">
                <span>Delsumma</span>
                <span>{subtotal.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Moms ({vatRate}%)</span>
                <span>{vatAmount.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-white pt-3 border-t border-zinc-700">
                <span>Totalt</span>
                <span>{total.toLocaleString('sv-SE')} kr</span>
              </div>
              {rotRutType && (
                <>
                  <div className="flex justify-between text-emerald-400">
                    <span>{rotRutType.toUpperCase()}-avdrag</span>
                    <span>-{rotRutDeduction.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-emerald-400 pt-3 border-t border-zinc-700">
                    <span>Kunden betalar</span>
                    <span>{customerPays.toLocaleString('sv-SE')} kr</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Link
              href="/dashboard/invoices"
              className="px-6 py-3 text-zinc-400 hover:text-white"
            >
              Avbryt
            </Link>
            <button
              onClick={handleCreate}
              disabled={creating || items.length === 0}
              className="flex items-center px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Skapa faktura
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
