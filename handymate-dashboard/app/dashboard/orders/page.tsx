'use client'

import { useEffect, useState } from 'react'
import {
  Package,
  Plus,
  Send,
  Eye,
  Trash2,
  CheckCircle,
  Clock,
  Truck,
  Search,
  Loader2
} from 'lucide-react'
// Strukturlyft (Etapp L2b2, 2026-08-18, docs/HANDYMATE_DESIGN_SYSTEM.md).
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface OrderItem {
  name: string
  sku?: string
  quantity: number
  unit: string
  unit_price: number
  total: number
}

interface Order {
  order_id: string
  status: 'draft' | 'pending' | 'ordered' | 'delivered'
  items: OrderItem[]
  total: number
  delivery_address: string | null
  notes: string | null
  created_at: string
  ordered_at: string | null
  supplier?: {
    supplier_id: string
    name: string
    contact_email: string | null
  }
  quote?: {
    quote_id: string
    title: string
  }
}

export default function OrdersPage() {
  const business = useBusiness()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'draft' | 'ordered' | 'delivered'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    if (business.business_id) {
      fetchOrders()
    }
  }, [business.business_id])

  async function fetchOrders() {
    const response = await fetch(`/api/orders?businessId=${business.business_id}`)
    const data = await response.json()
    setOrders(data.orders || [])
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const handleSend = async (orderId: string) => {
    setSendingId(orderId)
    try {
      const response = await fetch('/api/orders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Kunde inte skicka beställning')
      }

      showToast('Beställning skickad till leverantör!', 'success')
      fetchOrders()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setSendingId(null)
    }
  }

  const handleMarkDelivered = async (orderId: string) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, status: 'delivered' })
      })

      if (!response.ok) throw new Error('Kunde inte uppdatera')

      showToast('Beställning markerad som levererad!', 'success')
      fetchOrders()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const handleDelete = async (orderId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna beställning?')) return

    try {
      const response = await fetch(`/api/orders?orderId=${orderId}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Kunde inte ta bort')

      showToast('Beställning borttagen!', 'success')
      fetchOrders()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-500 border-gray-300'
      case 'pending': return 'bg-amber-100 text-amber-600 border-amber-200'
      case 'ordered': return 'bg-primary-100 text-primary-600 border-primary-600/30'
      case 'delivered': return 'bg-emerald-100 text-emerald-600 border-emerald-200'
      default: return 'bg-gray-100 text-gray-500 border-gray-300'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Utkast'
      case 'pending': return 'Väntar'
      case 'ordered': return 'Beställd'
      case 'delivered': return 'Levererad'
      default: return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <Package className="w-4 h-4" />
      case 'pending': return <Clock className="w-4 h-4" />
      case 'ordered': return <Send className="w-4 h-4" />
      case 'delivered': return <Truck className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  // Filtrera beställningar
  const filteredOrders = orders.filter(order => {
    const matchesFilter = filter === 'all' || order.status === filter
    const matchesSearch = !searchTerm ||
      order.supplier?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.items?.some(item => item.name?.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesFilter && matchesSearch
  })

  // Läget — besked i stället för fyra fåfänga statplattor (2026-08-18,
  // samma mönster som app/dashboard/projects/page.tsx rad ~367-394): de
  // gamla plattorna (Totalt/Beställda/Levererade/kr totalt) räknade samma
  // data flera gånger. Nu: bara det som faktiskt väntar på dig, härlett ur
  // samma `orders`-lista som redan är hämtad — ingen ny fetch.
  const pendingDeliveries = orders.filter(o => o.status === 'ordered')
  const pendingValue = pendingDeliveries.reduce((sum, o) => sum + (o.total || 0), 0)

  if (loading) {
    return (
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-primary-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative">
        {/* Header — ljust idiom (docs/HANDYMATE_DESIGN_SYSTEM.md), samma
            uppbyggnad som Godkännanden/Bokningar/Fakturor: ikon-platta +
            font-heading-titel. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-primary-700" />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900">Materialbeställningar</h1>
              <p className="text-sm text-slate-500 mt-0.5">Beställ material från dina grossister</p>
            </div>
          </div>
          <Link
            href="/dashboard/orders/new"
            className="flex items-center justify-center px-4 py-2 min-h-[44px] bg-primary-700 rounded-card font-medium text-white hover:bg-primary-600 transition-all"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny beställning
          </Link>
        </div>

        {/* Läget — besked i stället för fyra fåfänga statplattor (samma
            mönster som Projekt-sidans chip-rad, se filhuvudet ovanför
            pendingDeliveries): kontexten som text/chips, bara när den bär
            något. */}
        <div className="flex flex-wrap items-center gap-2.5 mb-6">
          {pendingDeliveries.length > 0 ? (
            <>
              <span className="inline-flex items-center gap-2 px-3.5 min-h-[36px] bg-white border border-slate-200 rounded-full text-sm font-medium text-gray-700">
                <Truck className="w-4 h-4 text-primary-600" />
                {pendingDeliveries.length} väntar leverans
              </span>
              <span className="inline-flex items-center gap-2 px-3.5 min-h-[36px] bg-primary-50 border border-primary-100 rounded-full text-sm font-semibold text-primary-700 tabular-nums">
                <Package className="w-4 h-4" />
                {pendingValue.toLocaleString('sv-SE')} kr på väg
              </span>
            </>
          ) : (
            <span className="text-sm text-gray-400">Inget beställt just nu</span>
          )}
        </div>

        {/* Filters — segmenterad kontroll, samma idiom som Godkännanden/
            Bokningar/Fakturor (bg-slate-100 rack + vit "pill" på aktivt
            läge). Fixar även den gamla no-op-hover-buggen på de inaktiva
            flikarna (osynlig text på vit botten). */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
            {[
              { id: 'all', label: 'Alla' },
              { id: 'draft', label: 'Utkast' },
              { id: 'ordered', label: 'Beställda' },
              { id: 'delivered', label: 'Levererade' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as typeof filter)}
                className={`px-4 py-2 min-h-[44px] rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  filter === f.id ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Sök beställning..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 min-h-[44px] bg-white border border-slate-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
            />
          </div>
        </div>

        {/* Orders List */}
        <div className="bg-white rounded-card border border-slate-200 overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-primary-50 rounded-card flex items-center justify-center mx-auto mb-4">
                <Package className="w-8 h-8 text-primary-700" />
              </div>
              <p className="font-heading text-slate-900 font-semibold text-lg mb-1">Inga beställningar än</p>
              <p className="text-slate-500 text-sm mb-2">När du beställer material hamnar det här.</p>
              <Link
                href="/dashboard/orders/new"
                className="text-primary-700 hover:text-primary-800 text-sm font-medium"
              >
                Skapa din första beställning →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <div key={order.order_id} className="p-4 hover:bg-gray-100/30 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-[#F0FDFA] rounded-xl flex items-center justify-center border border-[#E2E8F0]">
                        <Package className="w-5 h-5 text-primary-700" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <p className="font-heading font-semibold text-slate-900">
                            {order.supplier?.name || 'Ingen leverantör'}
                          </p>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(order.status)}`}>
                            {getStatusIcon(order.status)}
                            {getStatusText(order.status)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1 tabular-nums">
                          {order.items?.length || 0} produkter • {order.total?.toLocaleString('sv-SE')} kr
                        </p>
                        {order.quote && (
                          <p className="text-xs text-gray-400 mt-1">
                            Från offert: {order.quote.title}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:ml-auto">
                      <p className="text-sm text-gray-400 mr-4 hidden sm:block">
                        {order.ordered_at
                          ? `Beställd ${new Date(order.ordered_at).toLocaleDateString('sv-SE')}`
                          : `Skapad ${new Date(order.created_at).toLocaleDateString('sv-SE')}`
                        }
                      </p>

                      {order.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleSend(order.order_id)}
                            disabled={sendingId === order.order_id || !order.supplier?.contact_email}
                            className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] text-sm bg-primary-700 rounded-lg text-white hover:bg-primary-600 disabled:opacity-50 transition-all"
                            title={order.supplier?.contact_email ? 'Skicka till leverantör' : 'Leverantören saknar email'}
                          >
                            {sendingId === order.order_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Skicka
                          </button>
                          <button
                            onClick={() => handleDelete(order.order_id)}
                            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {order.status === 'ordered' && (
                        <button
                          onClick={() => handleMarkDelivered(order.order_id)}
                          className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] text-sm bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-600 hover:bg-emerald-100 transition-all"
                        >
                          <Truck className="w-4 h-4" />
                          Levererad
                        </button>
                      )}

                      {order.status === 'delivered' && (
                        <span className="flex items-center gap-2 px-3 py-1.5 text-sm text-emerald-600">
                          <CheckCircle className="w-4 h-4" />
                          Klar
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Items preview */}
                  <div className="mt-3 ml-14 flex flex-wrap gap-2">
                    {order.items?.slice(0, 3).map((item, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 bg-gray-100 rounded-lg text-gray-500">
                        {item.quantity}× {item.name}
                      </span>
                    ))}
                    {(order.items?.length || 0) > 3 && (
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded-lg text-gray-400">
                        +{(order.items?.length || 0) - 3} till
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
