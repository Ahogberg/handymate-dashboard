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
      case 'ordered': return 'bg-blue-100 text-blue-400 border-blue-500/30'
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

  // Beräkna statistik
  const stats = {
    total: orders.length,
    draft: orders.filter(o => o.status === 'draft').length,
    ordered: orders.filter(o => o.status === 'ordered').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    totalValue: orders.reduce((sum, o) => sum + (o.total || 0), 0)
  }

  if (loading) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Materialbeställningar</h1>
            <p className="text-sm text-gray-500">Beställ material från dina grossister</p>
          </div>
          <Link
            href="/dashboard/orders/new"
            className="flex items-center justify-center px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny beställning
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-400">Totalt</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Send className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{stats.ordered}</p>
                <p className="text-xs text-gray-400">Beställda</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Truck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{stats.delivered}</p>
                <p className="text-xs text-gray-400">Levererade</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Package className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{stats.totalValue.toLocaleString('sv-SE')}</p>
                <p className="text-xs text-gray-400">kr totalt</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto">
            {[
              { id: 'all', label: 'Alla' },
              { id: 'draft', label: 'Utkast' },
              { id: 'ordered', label: 'Beställda' },
              { id: 'delivered', label: 'Levererade' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as typeof filter)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  filter === f.id ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' : 'text-gray-500 hover:text-white'
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
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
        </div>

        {/* Orders List */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">Inga beställningar hittades</p>
              <Link
                href="/dashboard/orders/new"
                className="text-blue-600 hover:text-blue-500 text-sm"
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
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-blue-300">
                        <Package className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <p className="font-medium text-gray-900">
                            {order.supplier?.name || 'Ingen leverantör'}
                          </p>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(order.status)}`}>
                            {getStatusIcon(order.status)}
                            {getStatusText(order.status)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
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
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg text-white hover:opacity-90 disabled:opacity-50"
                            title={order.supplier?.contact_email ? 'Skicka till leverantör' : 'Leverantören saknar email'}
                          >
                            {sendingId === order.order_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Skicka
                          </button>
                          <button
                            onClick={() => handleDelete(order.order_id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      {order.status === 'ordered' && (
                        <button
                          onClick={() => handleMarkDelivered(order.order_id)}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-600 hover:bg-emerald-500/30"
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
