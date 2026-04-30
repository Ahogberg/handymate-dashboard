'use client'

import Link from 'next/link'
import { Edit, Mail, MapPin, Phone, Trash2 } from 'lucide-react'
import type { Customer, CustomerTag } from './types'

interface CustomerCardProps {
  customer: Customer
  tagIds: string[]
  tags: CustomerTag[]
  onEdit: (customer: Customer, e: React.MouseEvent) => void
  onDelete: (customerId: string, e: React.MouseEvent) => void
}

export function CustomerCard({ customer, tagIds, tags, onEdit, onDelete }: CustomerCardProps) {
  return (
    <Link
      href={`/dashboard/customers/${customer.customer_id}`}
      className="bg-white rounded-xl sm:rounded-xl border border-[#E2E8F0] p-4 sm:p-5 hover:bg-gray-50 transition-all block"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${
            customer.customer_type === 'company' ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
            customer.customer_type === 'brf' ? 'bg-gradient-to-br from-emerald-400 to-primary-600' :
            'bg-primary-700'
          }`}>
            <span className="text-white font-bold text-base sm:text-lg">
              {customer.name ? customer.name.split(' ').map(n => n[0]).join('').substring(0, 2) : '?'}
            </span>
          </div>
          <div className="ml-3 sm:ml-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
                {(customer.lifetime_value || 0) >= 50000 && '👑 '}{customer.name || 'Okänd'}
              </h3>
              {customer.customer_type === 'company' && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-md">Företag</span>
              )}
              {customer.customer_type === 'brf' && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md">BRF</span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-400">
              {customer.customer_number && <span className="text-gray-500 font-medium">{customer.customer_number} · </span>}
              {(customer.lifetime_value || 0) > 0 && <span className="text-primary-700 font-medium">{Math.round(customer.lifetime_value || 0).toLocaleString('sv-SE')} kr · </span>}
              Sedan {new Date(customer.created_at).toLocaleDateString('sv-SE')}
            </p>
          </div>
        </div>
        <div className="flex space-x-1">
          <button
            onClick={e => onEdit(customer, e)}
            className="p-2.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={e => onDelete(customer.customer_id, e)}
            className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center text-xs sm:text-sm">
          <Phone className="w-4 h-4 text-gray-400 mr-2 sm:mr-3 flex-shrink-0" />
          <span className="text-gray-700 truncate">{customer.phone_number || '-'}</span>
        </div>
        <div className="flex items-center text-xs sm:text-sm">
          <Mail className="w-4 h-4 text-gray-400 mr-2 sm:mr-3 flex-shrink-0" />
          <span className="text-gray-700 truncate">{customer.email || '-'}</span>
        </div>
        <div className="flex items-center text-xs sm:text-sm">
          <MapPin className="w-4 h-4 text-gray-400 mr-2 sm:mr-3 flex-shrink-0" />
          <span className="text-gray-700 truncate">{customer.address_line || '-'}</span>
        </div>
      </div>
      {tagIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
          {tagIds.map(tagId => {
            const tag = tags.find(t => t.tag_id === tagId)
            if (!tag) return null
            return (
              <span
                key={tagId}
                className="px-2 py-0.5 text-[10px] font-medium rounded-full text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            )
          })}
        </div>
      )}
    </Link>
  )
}
