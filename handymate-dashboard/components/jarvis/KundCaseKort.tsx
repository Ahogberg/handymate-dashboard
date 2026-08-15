'use client'

import Link from 'next/link'
import { AgentAvatar } from '@/components/agents/AgentAvatar'

export interface KundCaseSignal {
  approval_id: string
  approval_type: string
  agentId: string
  title: string
}

export interface KundCaseData {
  customer_id: string
  customer_name: string | null
  signals: KundCaseSignal[]
  communication_overlap: boolean
}

/**
 * Sammanfattande läskort. Varje underliggande approval ligger kvar i kön med
 * sin egen knapp och riskgräns; kund-caset skapar aldrig ett ”godkänn allt”.
 */
export function KundCaseKort({ data }: { data: KundCaseData }) {
  const customerName = data.customer_name ?? 'En kund'

  return (
    <div className="mb-2.5 rounded-2xl border border-primary-200 border-l-[3px] border-l-primary-600 bg-white px-4 py-3.5">
      <div className="mb-1 flex items-center gap-2.5">
        <AgentAvatar agentKey="matte" size="sm" />
        <span className="min-w-0 flex-1 text-sm font-semibold text-primary-900">
          {customerName} berör flera delar av teamet
        </span>
      </div>
      <p className="m-0 text-xs text-slate-500">
        {data.signals.length} saker om samma kund hänger ihop
      </p>

      {data.communication_overlap && (
        <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">Samordna kontakten.</span>{' '}
          Flera meddelanden kan annars nå kunden nära varandra.
        </div>
      )}

      <div className="mt-2.5 flex flex-col gap-1.5">
        {data.signals.map(signal => (
          <div key={signal.approval_id} className="flex min-w-0 items-center gap-2">
            <AgentAvatar agentKey={signal.agentId} size="sm" />
            <span className="truncate text-sm text-slate-700">{signal.title}</span>
          </div>
        ))}
      </div>

      <Link
        href={`/dashboard/customers/${data.customer_id}`}
        className="mt-3 inline-block text-sm font-medium text-primary-700 hover:text-primary-800"
      >
        Öppna kunden →
      </Link>
    </div>
  )
}

export default KundCaseKort
