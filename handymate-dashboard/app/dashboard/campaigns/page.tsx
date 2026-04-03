'use client'

import { useEffect, useState } from 'react'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import {
  Megaphone,
  Plus, 
  Send, 
  Clock, 
  CheckCircle, 
  Users,
  MessageSquare,
  MoreVertical,
  Trash2,
  Eye
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Campaign {
  campaign_id: string
  name: string
  message: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent'
  scheduled_at: string | null
  sent_at: string | null
  recipient_count: number
  delivered_count: number
  created_at: string
}

export default function CampaignsPage() {
  const business = useBusiness()
  const { hasFeature: canAccess } = useBusinessPlan()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent'>('all')

  useEffect(() => {
    fetchCampaigns()
  }, [business.business_id])

  async function fetchCampaigns() {
    const { data, error } = await supabase
      .from('sms_campaign')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setCampaigns(data)
    }
    setLoading(false)
  }

  const handleDelete = async (campaignId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna kampanj?')) return

    await supabase
      .from('sms_campaign')
      .delete()
      .eq('campaign_id', campaignId)

    fetchCampaigns()
  }

  const filteredCampaigns = campaigns.filter(c => {
    if (filter === 'draft') return c.status === 'draft'
    if (filter === 'sent') return c.status === 'sent'
    return true
  })

  const getStatusBadge = (status: string) => {
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Beräkna SMS-statistik
  const totalSent = campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + c.recipient_count, 0)
  const totalDelivered = campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + c.delivered_count, 0)

  if (!canAccess('campaign_analytics')) return <UpgradePrompt featureKey="campaign_analytics" />

  if (loading) {
    return (
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-primary-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-primary-700 mr-4">
              <Megaphone className="w-6 h-6 text-gray-900" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Kampanjer</h1>
              <p className="text-gray-500">Skicka SMS till dina kunder</p>
            </div>
          </div>
          <Link
            href="/dashboard/campaigns/new"
            className="flex items-center px-4 py-2 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny kampanj
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Totalt kampanjer</p>
                <p className="text-2xl font-bold text-gray-900">{campaigns.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary-100">
                <Megaphone className="w-5 h-5 text-sky-700" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">SMS skickade</p>
                <p className="text-2xl font-bold text-gray-900">{totalSent}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary-100">
                <Send className="w-5 h-5 text-primary-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Levererade</p>
                <p className="text-2xl font-bold text-gray-900">{totalDelivered}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-100">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Leveransgrad</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0}%
                </p>
              </div>
              <div className="p-3 rounded-xl bg-amber-100">
                <MessageSquare className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex space-x-2 mb-6">
          {[
            { id: 'all', label: 'Alla' },
            { id: 'draft', label: 'Utkast' },
            { id: 'sent', label: 'Skickade' }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === f.id
                  ? 'bg-primary-700 text-white'
                  : 'bg-white text-gray-500 hover:text-white border border-[#E2E8F0]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Campaign List */}
        <div className="bg-white rounded-xl border border-[#E2E8F0]">
          {filteredCampaigns.length === 0 ? (
            <div className="p-12 text-center">
              <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">
                {filter === 'draft' ? 'Inga utkast' : filter === 'sent' ? 'Inga skickade kampanjer' : 'Inga kampanjer ännu'}
              </p>
              <Link 
                href="/dashboard/campaigns/new" 
                className="text-sky-700 hover:text-primary-700 text-sm"
              >
                Skapa din första kampanj →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredCampaigns.map((campaign) => (
                <div key={campaign.campaign_id} className="p-4 hover:bg-gray-100/30 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-10 h-10 bg-[#F0FDFA] rounded-xl flex items-center justify-center border border-[#E2E8F0] mr-4">
                        <MessageSquare className="w-5 h-5 text-sky-700" />
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
                          {campaign.sent_at
                            ? `Skickad ${formatDate(campaign.sent_at)}`
                            : campaign.status === 'scheduled' && campaign.scheduled_at
                            ? `Schemalagd ${new Date(campaign.scheduled_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}`
                            : `Skapad ${formatDate(campaign.created_at)}`}
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
                            onClick={() => handleDelete(campaign.campaign_id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {campaign.status === 'scheduled' && (
                          <button
                            onClick={() => handleDelete(campaign.campaign_id)}
                            className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-600 bg-red-50 border border-red-200 rounded-lg"
                          >
                            Avbryt
                          </button>
                        )}
                        {campaign.status === 'sent' && (
                          <Link
                            href={`/dashboard/campaigns/${campaign.campaign_id}`}
                            className="px-3 py-1.5 text-xs font-medium text-sky-700 hover:text-primary-700 bg-primary-50 border border-[#E2E8F0] rounded-lg"
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
      </div>
    </div>
  )
}
