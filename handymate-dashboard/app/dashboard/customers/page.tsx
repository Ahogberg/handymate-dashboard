'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, Search, Phone, Mail, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string | null
  address_line: string | null
  created_at: string
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    async function fetchCustomers() {
      const { data } = await supabase
        .from('customer')
        .select('*')
        .eq('business_id', 'elexperten_sthlm')
        .order('created_at', { ascending: false })

      setCustomers(data || [])
      setLoading(false)
    }

    fetchCustomers()
  }, [])

  const filteredCustomers = customers.filter(customer =>
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone_number?.includes(searchTerm) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-[#09090b] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Kunder</h1>
            <p className="text-zinc-400">{customers.length} kunder totalt</p>
          </div>
          <div className="flex space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Sök kund..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500"
              />
            </div>
            <button className="flex items-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4 mr-2" />
              Ny kund
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCustomers.map((customer) => (
            <div key={customer.customer_id} className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6 hover:border-zinc-700 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {customer.name ? customer.name.split(' ').map(n => n[0]).join('').substring(0, 2) : '?'}
                    </span>
                  </div>
                  <div className="ml-4">
                    <h3 className="font-semibold text-white">{customer.name || 'Okänd'}</h3>
                    <p className="text-sm text-zinc-500">Kund sedan {new Date(customer.created_at).toLocaleDateString('sv-SE')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-sm">
                  <Phone className="w-4 h-4 text-zinc-500 mr-3" />
                  <span className="text-zinc-300">{customer.phone_number || '-'}</span>
                </div>
                <div className="flex items-center text-sm">
                  <Mail className="w-4 h-4 text-zinc-500 mr-3" />
                  <span className="text-zinc-300">{customer.email || '-'}</span>
                </div>
                <div className="flex items-center text-sm">
                  <MapPin className="w-4 h-4 text-zinc-500 mr-3" />
                  <span className="text-zinc-300">{customer.address_line || '-'}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-800">
                <button className="text-violet-400 hover:text-violet-300 text-sm font-medium transition-colors">
                  Visa detaljer →
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">Inga kunder hittades</p>
          </div>
        )}
      </div>
    </div>
  )
}
