'use client'

import Link from 'next/link'
import { Building2, Crown, Edit, Home, Mail, MapPin, Phone, Trash2, User } from 'lucide-react'
import type { Customer, CustomerTag } from './types'

interface CustomerCardProps {
  customer: Customer
  tagIds: string[]
  tags: CustomerTag[]
  onEdit: (customer: Customer, e: React.MouseEvent) => void
  onDelete: (customerId: string, e: React.MouseEvent) => void
}

/**
 * Kund-kort i griden. Vit yta, slate-200 border, hover ger subtil shadow.
 * Ikon-avatar i primary-50 som speglar kundtyp via Lucide-ikon (User /
 * Building2 / Home) — istället för tidigare bunta gradient-fyllningar
 * (amber-orange för företag, emerald för BRF) som inte fanns i paletten.
 */
export function CustomerCard({ customer, tagIds, tags, onEdit, onDelete }: CustomerCardProps) {
  const isVip = (customer.lifetime_value || 0) >= 50000
  const Icon = customer.customer_type === 'company' ? Building2 : customer.customer_type === 'brf' ? Home : User

  return (
    <Link
      href={`/dashboard/customers/${customer.customer_id}`}
      className="block bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isVip && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
              <h3 className="font-heading text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
                {customer.name || 'Okänd'}
              </h3>
              {customer.customer_type === 'company' && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100 rounded-full">
                  Företag
                </span>
              )}
              {customer.customer_type === 'brf' && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full">
                  BRF
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 truncate">
              {customer.customer_number && (
                <span className="text-slate-700 font-medium">{customer.customer_number} · </span>
              )}
              {(customer.lifetime_value || 0) > 0 && (
                <span className="text-primary-700 font-semibold tabular-nums">
                  {Math.round(customer.lifetime_value || 0).toLocaleString('sv-SE')} kr ·{' '}
                </span>
              )}
              <span>Sedan {new Date(customer.created_at).toLocaleDateString('sv-SE')}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={e => onEdit(customer, e)}
            aria-label="Redigera"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={e => onDelete(customer.customer_id, e)}
            aria-label="Ta bort"
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <ContactRow icon={<Phone className="w-3.5 h-3.5" />} value={customer.phone_number} />
        <ContactRow icon={<Mail className="w-3.5 h-3.5" />} value={customer.email} />
        <ContactRow icon={<MapPin className="w-3.5 h-3.5" />} value={customer.address_line} />
      </div>

      {tagIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-4 pt-4 border-t border-slate-100">
          {tagIds.map(tagId => {
            const tag = tags.find(t => t.tag_id === tagId)
            if (!tag) return null
            return (
              <span
                key={tagId}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full text-white"
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

function ContactRow({ icon, value }: { icon: React.ReactNode; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm">
      <span className="text-slate-400 flex-shrink-0">{icon}</span>
      <span className="text-slate-700 truncate">{value || '—'}</span>
    </div>
  )
}
