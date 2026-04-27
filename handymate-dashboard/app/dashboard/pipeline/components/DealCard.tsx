'use client'

import Link from 'next/link'
import {
  Bot,
  CheckSquare,
  Clock,
  FileText,
  GripVertical,
  MapPin,
  MessageSquare,
  Phone,
  Zap,
} from 'lucide-react'
import { CopyId } from '@/components/CopyId'
import { getLeadCategory } from '@/lib/lead-categories'
import { formatValueCompact, getPriorityDot, timeAgo } from '../helpers'
import { usePipelineContext } from '../context'
import type { Deal } from '../types'

interface DealCardProps {
  deal: Deal
  isDragging: boolean
}

/**
 * Deal-kort i kanban-vyn. Drag-handlers, klick (öppnar deal-detalj),
 * snabbknappar (Ring/SMS/Karta/Offert/Uppgifter) och tilldelad teammedlem.
 *
 * All state + handlers kommer från PipelineContext. Endast `deal` + `isDragging`
 * är props — det är värden som varierar per kort i listan.
 */
export function DealCard({ deal, isDragging }: DealCardProps) {
  const {
    teamMembers,
    handleDragStart,
    handleDragEnd,
    openDealDetail,
    handleQuickSms,
    handleOpenTasks,
  } = usePipelineContext()

  const assignee = deal.assigned_to ? teamMembers.find(m => m.id === deal.assigned_to) : null
  const assigneeInitials = assignee ? assignee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : ''

  return (
    <div draggable onDragStart={e => handleDragStart(e, deal.id)} onDragEnd={handleDragEnd} onClick={() => openDealDetail(deal)}
      className={`group relative p-3 rounded-lg border border-[#E2E8F0] bg-white cursor-pointer transition-all hover:shadow-md hover:border-gray-300 ${isDragging ? 'opacity-40 scale-95 rotate-1' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <CopyId value={`D-${deal.deal_number || deal.id.slice(0, 6)}`} label={`Ärende #${deal.deal_number || deal.id.slice(0, 6)}`} className="text-primary-700" />
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getPriorityDot(deal.priority)}`} />
            <h4 className="text-sm font-medium text-gray-900 truncate">{deal.title ? deal.title.charAt(0).toUpperCase() + deal.title.slice(1) : 'Utan titel'}</h4>
            {(deal.source === 'ai' || deal.source === 'call') && <span title="AI-skapad"><Bot className="w-3.5 h-3.5 text-primary-700 flex-shrink-0" /></span>}
            {deal.lead_source_platform && <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full flex-shrink-0 ${
              deal.lead_source_platform === 'offerta' ? 'bg-orange-100 text-orange-700' :
              deal.lead_source_platform === 'servicefinder' ? 'bg-primary-100 text-primary-700' :
              deal.lead_source_platform === 'byggahus' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-600'
            }`}>{
              deal.lead_source_platform === 'offerta' ? 'Offerta' :
              deal.lead_source_platform === 'servicefinder' ? 'SF' :
              deal.lead_source_platform === 'byggahus' ? 'Byggahus' :
              deal.lead_source_platform
            }</span>}
            {!deal.lead_source_platform && deal.source && !['manual', 'ai', 'call', 'website_form', 'vapi_call', 'inbound_sms'].includes(deal.source) && (
              <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full flex-shrink-0 bg-violet-100 text-violet-700">
                via {deal.source}
              </span>
            )}
            {(() => {
              const cat = getLeadCategory(deal.category)
              return cat ? (
                <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded-full border flex-shrink-0 ${cat.bgClass}`} title={`Kategori: ${cat.label}`}>
                  {cat.label}
                </span>
              ) : null
            })()}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate ml-3.5">{deal.customer?.customer_number && <span className="font-medium">Kund {deal.customer.customer_number} · </span>}{deal.customer?.name || <span className="italic text-gray-400">Okänd kund</span>}</p>
          {deal.description && !deal.customer?.name && <p className="text-xs text-gray-400 mt-0.5 truncate ml-3.5">{deal.description}</p>}
        </div>
        <GripVertical className="w-4 h-4 text-gray-200 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
      </div>
      <div className="flex items-center justify-between mt-2 ml-3.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-700">{deal.value != null && deal.value > 0 ? formatValueCompact(deal.value) : ''}</span>{deal.value != null && deal.value > 0 && <span className="text-[9px] text-gray-400 ml-0.5">exkl.</span>}
          {deal.lead_temperature && <span className={`w-1.5 h-1.5 rounded-full ${deal.lead_temperature === 'hot' ? 'bg-red-500' : deal.lead_temperature === 'warm' ? 'bg-amber-500' : 'bg-primary-500'}`} title={deal.lead_temperature === 'hot' ? 'Het lead' : deal.lead_temperature === 'warm' ? 'Varm lead' : 'Kall lead'} />}
        </div>
        <div className="flex items-center gap-2">
          {assignee && (
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: assignee.color || '#3B82F6' }}
              title={`Tilldelad: ${assignee.name}`}
            >
              {assigneeInitials}
            </span>
          )}
          {deal.response_time_seconds != null && deal.response_time_seconds > 0 && (
            <span className={`text-[10px] flex items-center gap-0.5 ${deal.response_time_seconds < 60 ? 'text-green-500' : deal.response_time_seconds < 3600 ? 'text-amber-500' : 'text-red-400'}`} title="Svarstid">
              <Zap className="w-2.5 h-2.5" />{deal.response_time_seconds < 60 ? `${deal.response_time_seconds}s` : deal.response_time_seconds < 3600 ? `${Math.round(deal.response_time_seconds / 60)}m` : `${Math.round(deal.response_time_seconds / 3600)}h`}
            </span>
          )}
          {(() => {
            const days = Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86400000)
            const ageDot = days <= 3 ? 'bg-green-400' : days <= 7 ? 'bg-amber-400' : 'bg-red-400'
            return <span className={`w-1.5 h-1.5 rounded-full ${ageDot}`} title={`${days}d gammal`} />
          })()}
          <span className="text-[10px] text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(deal.updated_at)}</span>
        </div>
      </div>

      {/* Snabbknappar — hover desktop, alltid mobil */}
      <div className="flex items-center justify-around mt-2 pt-2 border-t border-gray-100 opacity-0 group-hover:opacity-100 md:transition-opacity" onClick={e => e.stopPropagation()}>
        {deal.customer?.phone_number && (
          <a href={`tel:${deal.customer.phone_number}`} className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-primary-700 transition-colors" title="Ring">
            <Phone className="w-3.5 h-3.5" />
            <span className="text-[10px]">Ring</span>
          </a>
        )}
        {deal.customer?.phone_number && (
          <button onClick={() => handleQuickSms(deal)} className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-primary-700 transition-colors" title="SMS">
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="text-[10px]">SMS</span>
          </button>
        )}
        {deal.customer?.address_line ? (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deal.customer.address_line)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-primary-700 transition-colors" title={deal.customer.address_line} onClick={e => e.stopPropagation()}>
            <MapPin className="w-3.5 h-3.5" />
            <span className="text-[10px]">Karta</span>
          </a>
        ) : (
          <Link href={deal.quote_id
            ? `/dashboard/quotes/${deal.quote_id}`
            : `/dashboard/quotes/new?customer_id=${deal.customer_id || ''}&title=${encodeURIComponent(deal.title || '')}&deal_id=${deal.id}`}
            className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-primary-700 transition-colors" title={deal.quote_id ? 'Visa offert' : 'Skapa offert'} onClick={e => e.stopPropagation()}>
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[10px]">{deal.quote_id ? 'Offert' : 'Ny offert'}</span>
          </Link>
        )}
        <button onClick={() => handleOpenTasks(deal)} className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-purple-600 transition-colors" title="Uppgifter">
          <CheckSquare className="w-3.5 h-3.5" />
          <span className="text-[10px]">Uppgifter</span>
        </button>
      </div>
    </div>
  )
}
