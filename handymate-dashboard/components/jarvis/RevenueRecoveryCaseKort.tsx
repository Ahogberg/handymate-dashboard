'use client'

import Link from 'next/link'
import { AlertTriangle, Check, Circle } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { RevenueRecoveryCase } from '@/lib/value/revenue-recovery-case'

const formatKr = (value: number) => (
  `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(value)} kr`
)

const STAGES: Array<{
  key: keyof RevenueRecoveryCase['evidence']
  label: string
}> = [
  { key: 'identified', label: 'Hittat' },
  { key: 'owner_verified', label: 'Verifierat' },
  { key: 'ata_created', label: 'ÄTA' },
  { key: 'customer_accepted', label: 'Kund' },
  { key: 'delivery_proven', label: 'Klart' },
  { key: 'invoice_created', label: 'Faktura' },
  { key: 'payment_confirmed', label: 'Betalt' },
]

/**
 * Ett läsande Matte-kort. Det utför aldrig nästa steg; länken går till den
 * befintliga approval-, projekt- eller fakturaytan som redan äger handlingen.
 */
export function RevenueRecoveryCaseKort({ data }: { data: RevenueRecoveryCase }) {
  const needsControl = data.phase === 'unknown' || data.phase === 'failed'

  return (
    <div className="mt-2.5 rounded-2xl border border-primary-200 border-l-[3px] border-l-primary-600 bg-white px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <AgentAvatar agentKey="matte" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-semibold text-primary-900">
            {data.project_name || 'Intäktsärende'}
          </p>
          <p className={`m-0 mt-0.5 text-xs ${needsControl ? 'text-amber-700' : 'text-slate-500'}`}>
            {data.phase_label}
          </p>
        </div>
        {data.phase === 'paid' && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700">
            <Check className="h-3 w-3" /> Betalt
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1" aria-label="Intäktsärendets beviskedja">
        {STAGES.map(stage => {
          const proven = data.evidence[stage.key]
          return (
            <div key={stage.key} className="min-w-0 text-center">
              <span className="mx-auto flex h-5 w-5 items-center justify-center">
                {proven ? (
                  <Check className="h-4 w-4 text-primary-700" aria-hidden />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-slate-300" aria-hidden />
                )}
              </span>
              <span className={`block truncate text-[9px] ${proven ? 'font-medium text-slate-600' : 'text-slate-300'}`}>
                {stage.label}
              </span>
            </div>
          )
        })}
      </div>

      {(data.identified_kr != null || data.invoice_total_kr != null) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2.5 text-xs">
          {data.identified_kr != null && (
            <span className="text-slate-500">
              Identifierat underlag: <b className="font-semibold text-slate-700">{formatKr(data.identified_kr)}</b>
            </span>
          )}
          {data.invoice_total_kr != null && (
            <span className="text-slate-500">
              Fakturans belopp: <b className="font-semibold text-slate-700">{formatKr(data.invoice_total_kr)}</b>
            </span>
          )}
        </div>
      )}

      {data.truth_note && (
        <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{data.truth_note}</span>
        </div>
      )}

      {data.next_action && (
        <Link
          href={data.next_action.href}
          className="mt-3 inline-block text-sm font-medium text-primary-700 hover:text-primary-800"
        >
          {data.next_action.label} →
        </Link>
      )}
    </div>
  )
}

export default RevenueRecoveryCaseKort
