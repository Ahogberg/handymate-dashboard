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

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Utkast', cls: 'bg-slate-100 text-slate-700 border border-slate-200' },
    scheduled: { label: 'Schemalagd', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
    sending: { label: 'Skickar…', cls: 'bg-primary-50 text-primary-700 border border-primary-100' },
    sent: { label: 'Skickad', cls: 'bg-green-50 text-green-700 border border-green-200' },
  }
  const c = cfg[status]
  if (!c) return null
  return (
    <span className={`px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded-full ${c.cls}`}>
      {c.label}
    </span>
  )
}

export function CampaignsList({ campaigns, filter, formatDate, onDelete }: CampaignsListProps) {
  if (campaigns.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl py-14 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center mx-auto mb-4">
          <Megaphone className="w-5 h-5" />
        </div>
        <p className="text-sm text-slate-700 mb-1 font-medium">
          {filter === 'draft' ? 'Inga utkast' : filter === 'sent' ? 'Inga skickade kampanjer' : 'Inga kampanjer ännu'}
        </p>
        <Link href="/dashboard/campaigns/new" className="text-sm font-semibold text-primary-700 hover:text-primary-600">
          Skapa din första kampanj →
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="divide-y divide-slate-100">
        {campaigns.map(campaign => (
          <div key={campaign.campaign_id} className="p-4 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-heading text-sm font-bold text-slate-900 tracking-tight truncate">
                      {campaign.name}
                    </p>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{campaign.message}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <div className="inline-flex items-center gap-1 text-xs text-slate-600">
                    <Users className="w-3.5 h-3.5" />
                    <span className="tabular-nums">{campaign.recipient_count}</span>
                    <span className="text-slate-400">mottagare</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {campaign.sent_at ? `Skickad ${formatDate(campaign.sent_at)}` : `Skapad ${formatDate(campaign.created_at)}`}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {campaign.status === 'draft' && (
                    <>
                      <Link
                        href={`/dashboard/campaigns/${campaign.campaign_id}`}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        aria-label="Visa"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => onDelete(campaign.campaign_id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        aria-label="Ta bort"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {campaign.status === 'sent' && (
                    <Link
                      href={`/dashboard/campaigns/${campaign.campaign_id}`}
                      className="px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-100 hover:bg-primary-100 rounded-lg transition-colors"
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
    </div>
  )
}
