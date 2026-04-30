'use client'

import { CheckCircle, Megaphone, MessageSquare, Send } from 'lucide-react'

interface CampaignStatsProps {
  campaignCount: number
  totalSent: number
  totalDelivered: number
}

export function CampaignStats({ campaignCount, totalSent, totalDelivered }: CampaignStatsProps) {
  const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <StatCard icon={<Megaphone className="w-4.5 h-4.5" />} label="Kampanjer" value={campaignCount} />
      <StatCard icon={<Send className="w-4.5 h-4.5" />} label="Skickade" value={totalSent} />
      <StatCard
        icon={<CheckCircle className="w-4.5 h-4.5" />}
        label="Levererade"
        value={totalDelivered}
        accent="green"
      />
      <StatCard
        icon={<MessageSquare className="w-4.5 h-4.5" />}
        label="Leveransgrad"
        value={`${deliveryRate}%`}
        accent="amber"
      />
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  accent?: 'green' | 'amber'
}) {
  const iconCls =
    accent === 'green'
      ? 'bg-green-50 text-green-700'
      : accent === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-primary-50 text-primary-700'

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconCls}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-heading text-lg font-bold text-slate-900 tabular-nums tracking-tight">{value}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  )
}
