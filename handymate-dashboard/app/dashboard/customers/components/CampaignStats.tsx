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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-secondary-700" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{campaignCount}</p>
            <p className="text-xs text-gray-400">Kampanjer</p>
          </div>
        </div>
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
            <Send className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{totalSent}</p>
            <p className="text-xs text-gray-400">Skickade</p>
          </div>
        </div>
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{totalDelivered}</p>
            <p className="text-xs text-gray-400">Levererade</p>
          </div>
        </div>
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{deliveryRate}%</p>
            <p className="text-xs text-gray-400">Leveransgrad</p>
          </div>
        </div>
      </div>
    </div>
  )
}
