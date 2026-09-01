'use client'

// Kundkort i partnerportalen (partnerprogram v2, 2026-08-11):
// aktivitetsnivå-badge, provisionsläge ("25 % · månad 7 av 12" /
// "Basnivå 10 %"), uppföljningspills och expanderbar tidslinje.
// Inga kundbelopp visas — bara partnerns egen intjäning.

import { ChevronDown, ChevronRight } from 'lucide-react'
import FollowupPills from './FollowupPills'
import { formatSek, formatDate, formatProcent, type Referral, type PartnerEvent } from './types'

function aktivitetsBadge(level: Referral['activity_level']): string {
  switch (level) {
    case 'aktiv': return 'bg-green-50 text-green-700 border-green-200'
    case 'onboardar': return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'inaktiv': return 'bg-orange-50 text-orange-700 border-orange-200'
    case 'churnad': return 'bg-red-50 text-red-700 border-red-200'
  }
}

function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    referral_clicked: 'Klickade på din länk',
    trial_started: 'Registrerade sig via din länk',
    converted: 'Blev betalande kund',
    plan_upgraded: 'Uppgraderade plan',
    provision_earned: 'Provision ackruerad',
    provision_paid: 'Provision utbetald',
    churned: 'Avslutade prenumeration',
    test: 'Test-webhook',
  }
  return map[type] || type
}

interface Props {
  referral: Referral
  events: PartnerEvent[]
  expanded: boolean
  onToggle: () => void
  onFollowupChanged: () => void
}

export default function ReferralCard({ referral: ref, events, expanded, onToggle, onFollowupChanged }: Props) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {ref.business_name || ref.email || '—'}
            </p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${aktivitetsBadge(ref.activity_level)}`}>
              {ref.activity_label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>Registrerad: {formatDate(ref.created_at)}</span>
            {ref.converted_at && <span>Kund sedan: {formatDate(ref.converted_at)}</span>}
            {ref.referred_by && <span>Attributionskod: {ref.referred_by}</span>}
          </div>
        </div>

        <div className="text-right shrink-0">
          {ref.current_rate !== null ? (
            <>
              <p className="text-sm font-semibold text-primary-700">
                {ref.on_base_rate
                  ? `Basnivå ${formatProcent(ref.current_rate)}`
                  : `${formatProcent(ref.current_rate)} · månad ${ref.customer_month} av ${ref.ladder_months}`}
              </p>
              <p className="text-xs text-gray-500">{formatSek(ref.earned_total_sek)} intjänat</p>
            </>
          ) : ref.status === 'pending' ? (
            <p className="text-xs text-gray-400">Provision startar vid första betalning</p>
          ) : ref.activity_level === 'churnad' ? (
            <p className="text-xs text-gray-400">Avslutad</p>
          ) : (
            <p className="text-xs text-gray-400">Ingen provision än</p>
          )}
        </div>

        <div className="shrink-0 text-gray-400">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      <div className="px-5 pb-3 pl-5">
        <FollowupPills businessId={ref.business_id} followups={ref.followups} onChanged={onFollowupChanged} />
      </div>

      {expanded && (
        <div className="px-5 pb-4 pl-8">
          <div className="border-l-2 border-gray-200 pl-4 space-y-3">
            <TimelineItem date={ref.created_at} text="Registrerade sig via din länk" />
            {ref.converted_at && <TimelineItem date={ref.converted_at} text="Blev betalande kund — provisionen började räknas" />}
            {ref.customer_month > 0 && (
              <TimelineItem
                date={new Date().toISOString()}
                text={
                  ref.on_base_rate
                    ? `Basnivå — ${formatSek(ref.earned_total_sek)} intjänat totalt`
                    : `Månad ${ref.customer_month} av ${ref.ladder_months} — ${formatSek(ref.earned_total_sek)} intjänat`
                }
                active
              />
            )}
            {events.map(evt => (
              <TimelineItem key={evt.id} date={evt.created_at} text={eventTypeLabel(evt.event_type)} />
            ))}
            {ref.activity_level === 'churnad' && (
              <TimelineItem date={new Date().toISOString()} text="Prenumeration avslutad — provisionen upphörde" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineItem({ date, text, active }: { date: string; text: string; active?: boolean }) {
  return (
    <div className="relative flex items-start gap-3">
      <div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
        active ? 'bg-primary-500 border-primary-600' : 'bg-white border-gray-300'
      }`} />
      <div className="min-w-0">
        <p className={`text-sm ${active ? 'font-medium text-primary-700' : 'text-gray-700'}`}>{text}</p>
        <p className="text-xs text-gray-400">{formatDate(date)}</p>
      </div>
    </div>
  )
}
