'use client'

import Link from 'next/link'
import { Eye, Megaphone, MessageSquare, Trash2, Users } from 'lucide-react'
import type { Campaign } from './types'

type CampaignFilter = 'all' | 'draft' | 'sent'

interface CampaignsListProps {
  campaigns: Campaign[]
  filter: CampaignFilter
  formatDate: (s: string) => string
  onDelete: (campaignId: string) => void
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return <span className="px-2.5 py-1 text-xs rounded-full bg-gray-100 text-gray-500 border border-gray-300">Utkast</span>
    case 'scheduled':
      return <span className="px-2.5 py-1 text-xs rounded-full bg-amber-100 text-amber-600 border border-amber-200">Schemalagd</span>
    case 'sending':
      return <span className="px-2.5 py-1 text-xs rounded-full bg-primary-100 text-primary-600 border border-primary-600/30">Skickar...</span>
    case 'sent':
      return <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200">Skickad</span>
    default:
      return null
  }
}

export function CampaignsList({ campaigns, filter, formatDate, onDelete }: CampaignsListProps) {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0]">
      {campaigns.length === 0 ? (
        <div className="p-12 text-center">
          <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">
            {filter === 'draft' ? 'Inga utkast' : filter === 'sent' ? 'Inga skickade kampanjer' : 'Inga kampanjer ännu'}
          </p>
          <Link href="/dashboard/campaigns/new" className="text-secondary-700 hover:text-primary-700 text-sm">
            Skapa din första kampanj →
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {campaigns.map(campaign => (
            <div key={campaign.campaign_id} className="p-4 hover:bg-gray-100/30 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-1 min-w-0">
                  <div className="w-10 h-10 bg-[#F0FDFA] rounded-xl flex items-center justify-center border border-[#E2E8F0] mr-4">
                    <MessageSquare className="w-5 h-5 text-secondary-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-gray-900 truncate">{campaign.name}</p>
                      {getStatusBadge(campaign.status)}
                    </div>
                    <p className="text-sm text-gray-400 truncate mt-1">{campaign.message}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 ml-4">
                  <div className="text-right hidden sm:block">
                    <div className="flex items-center text-sm text-gray-500">
                      <Users className="w-4 h-4 mr-1" />
                      {campaign.recipient_count} mottagare
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {campaign.sent_at ? `Skickad ${formatDate(campaign.sent_at)}` : `Skapad ${formatDate(campaign.created_at)}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {campaign.status === 'draft' && (
                      <Link
                        href={`/dashboard/campaigns/${campaign.campaign_id}`}
                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                    )}
                    {campaign.status === 'draft' && (
                      <button
                        onClick={() => onDelete(campaign.campaign_id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {campaign.status === 'sent' && (
                      <Link
                        href={`/dashboard/campaigns/${campaign.campaign_id}`}
                        className="px-3 py-1.5 text-xs font-medium text-secondary-700 hover:text-primary-700 bg-primary-50 border border-[#E2E8F0] rounded-lg"
                      >
                        Visa resultat
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
