'use client'

import { useEffect, useState } from 'react'
import {
  Mail, Send, CheckCircle, Eye, Loader2, Search, Filter,
  MapPin, Calendar, Zap, Home, X, AlertTriangle, ArrowRight,
  BarChart3, TrendingUp, Lock, Sparkles, Package
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import Link from 'next/link'
import type { LeadOutbound, LeadMonthlyUsage } from '@/lib/leads/types'

type Tab = 'outbound' | 'neighbours' | 'stats'
type StatusFilter = 'all' | 'draft' | 'approved' | 'sent'

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Utkast', cls: 'bg-gray-100 text-gray-600' },
  approved: { label: 'Godkänd', cls: 'bg-blue-100 text-blue-700' },
  sent: { label: 'Skickad', cls: 'bg-primary-100 text-primary-700' },
  delivered: { label: 'Levererad', cls: 'bg-emerald-100 text-emerald-700' },
}

export default function LeadsOutboundPage() {
  const business = useBusiness()
  const { hasFeature } = useBusinessPlan()

  const [tab, setTab] = useState<Tab>('outbound')
  const [leads, setLeads] = useState<LeadOutbound[]>([])
  const [usage, setUsage] = useState<LeadMonthlyUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedLead, setSelectedLead] = useState<LeadOutbound | null>(null)
  const [editingLetter, setEditingLetter] = useState('')
  const [savingLetter, setSavingLetter] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [hasLogo, setHasLogo] = useState(true)
  const [hasAddon, setHasAddon] = useState(false)

  // Feature gate
  if (!hasFeature('leads_outbound')) {
    return <UpgradePrompt featureKey="leads_outbound" />
  }

  useEffect(() => {
    checkAddon()
    fetchLeads()
    fetchUsage()
  }, [business.business_id])

  async function checkAddon() {
    try {
      const res = await fetch('/api/business-settings')
      if (res.ok) {
        const data = await res.json()
        setHasAddon(data.leads_addon || false)
        setHasLogo(!!data.logo_url)
      }
    } catch { /* silent */ }
  }

  async function fetchLeads() {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/outbound?status=${statusFilter}`)
      if (res.ok) {
        const data = await res.json()
        setLeads(data.leads || [])
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  async function fetchUsage() {
    try {
      const res = await fetch('/api/leads/outbound/usage')
      if (res.ok) {
        const data = await res.json()
        setUsage(data)
      }
    } catch { /* silent */ }
  }

  async function handleScan() {
    setScanning(true)
    try {
      const res = await fetch('/api/leads/outbound', { method: 'POST' })
      if (res.ok) {
        fetchLeads()
      }
    } catch { /* silent */ }
    setScanning(false)
  }

  async function handleApprove(id: string) {
    await fetch(`/api/leads/outbound/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    })
    fetchLeads()
  }

  async function handleBatchApprove() {
    const draftIds = leads.filter(l => l.status === 'draft').map(l => l.id)
    if (draftIds.length === 0) return
    await fetch('/api/leads/outbound/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', leadIds: draftIds }),
    })
    fetchLeads()
  }

  async function handleSend(id: string) {
    setSendingId(id)
    const res = await fetch(`/api/leads/outbound/${id}/send`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error || 'Kunde inte skicka')
    }
    setSendingId(null)
    fetchLeads()
    fetchUsage()
  }

  async function handleSaveLetter() {
    if (!selectedLead) return
    setSavingLetter(true)
    await fetch(`/api/leads/outbound/${selectedLead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ letter_content: editingLetter }),
    })
    setSavingLetter(false)
    setSelectedLead(null)
    fetchLeads()
  }

  async function handleConvert(id: string) {
    await fetch(`/api/leads/outbound/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ converted: true }),
    })
    fetchLeads()
  }

  useEffect(() => { fetchLeads() }, [statusFilter])

  // Addon gate — visa upgrade-sida
  if (!hasAddon && !loading) {
    return <LeadsUpgradePage />
  }

  const filteredLeads = leads
  const draftCount = leads.filter(l => l.status === 'draft').length
  const approvedCount = leads.filter(l => l.status === 'approved').length
  const sentCount = leads.filter(l => l.status === 'sent' || l.status === 'delivered').length
  const convertedCount = leads.filter(l => l.converted).length

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Utskick</h1>
            <p className="text-sm text-gray-500">Brev till potentiella kunder baserat på fastighetsdata</p>
          </div>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-700 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {scanning ? 'Skannar...' : 'Skanna fastigheter'}
          </button>
        </div>

        {/* Logo warning */}
        {!hasLogo && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800 flex-1">
              Ladda upp din logotyp i Inställningar innan du kan skicka brev — det tar 30 sekunder
            </p>
            <Link href="/dashboard/settings?tab=company" className="text-sm text-primary-700 font-medium hover:underline whitespace-nowrap">
              Gå till Inställningar <ArrowRight className="w-3 h-3 inline" />
            </Link>
          </div>
        )}

        {/* Quota bar */}
        {usage && (
          <div className="mb-6 bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center gap-4">
            <Package className="w-5 h-5 text-primary-700" />
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{usage.letters_sent} av {usage.letters_quota} brev använda denna månad</span>
                {usage.extra_letters > 0 && <span className="text-amber-600">+{usage.extra_letters} extra ({usage.extra_cost_sek} kr)</span>}
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 rounded-full transition-all"
                  style={{ width: `${Math.min((usage.letters_sent / usage.letters_quota) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          <button onClick={() => setTab('outbound')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'outbound' ? 'bg-primary-700 text-white' : 'bg-white text-gray-500 border border-[#E2E8F0]'}`}>
            <Mail className="w-4 h-4 inline mr-1.5 -mt-0.5" />Utskick
          </button>
          <button onClick={() => setTab('neighbours')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'neighbours' ? 'bg-primary-700 text-white' : 'bg-white text-gray-500 border border-[#E2E8F0]'}`}>
            <Home className="w-4 h-4 inline mr-1.5 -mt-0.5" />Grannkampanjer
          </button>
          <button onClick={() => setTab('stats')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'stats' ? 'bg-primary-700 text-white' : 'bg-white text-gray-500 border border-[#E2E8F0]'}`}>
            <BarChart3 className="w-4 h-4 inline mr-1.5 -mt-0.5" />Statistik
          </button>
        </div>

        {tab === 'outbound' && (
          <>
            {/* Filters + batch actions */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1.5">
                {(['all', 'draft', 'approved', 'sent'] as StatusFilter[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${statusFilter === s ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {s === 'all' ? 'Alla' : STATUS_CONFIG[s]?.label || s} {s === 'all' ? `(${leads.length})` : ''}
                  </button>
                ))}
              </div>
              {draftCount > 0 && (
                <button onClick={handleBatchApprove} className="text-sm text-primary-700 font-medium hover:underline">
                  Godkänn alla ({draftCount})
                </button>
              )}
            </div>

            {/* Leads list */}
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary-700 animate-spin" /></div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-[#E2E8F0]">
                <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Inga utskick ännu — tryck "Skanna fastigheter" för att börja</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLeads.map(lead => (
                  <div key={lead.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center shrink-0">
                      <Home className="w-5 h-5 text-primary-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-gray-900 truncate">{lead.owner_name || 'Fastighetsägare'}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_CONFIG[lead.status]?.cls || 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_CONFIG[lead.status]?.label || lead.status}
                        </span>
                        {lead.converted && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Konverterad</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.property_address}</span>
                        {lead.built_year && <span>{lead.built_year}</span>}
                        {lead.energy_class && <span>Energi: {lead.energy_class}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => { setSelectedLead(lead); setEditingLetter(lead.letter_content) }} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Förhandsgranska">
                        <Eye className="w-4 h-4" />
                      </button>
                      {lead.status === 'draft' && (
                        <button onClick={() => handleApprove(lead.id)} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100">
                          Godkänn
                        </button>
                      )}
                      {lead.status === 'approved' && (
                        <button
                          onClick={() => handleSend(lead.id)}
                          disabled={sendingId === lead.id || !hasLogo}
                          title={!hasLogo ? 'Logotyp krävs' : 'Skicka brev'}
                          className="px-3 py-1.5 bg-primary-700 text-white text-xs font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {sendingId === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Skicka
                        </button>
                      )}
                      {lead.status === 'sent' && !lead.converted && (
                        <button onClick={() => handleConvert(lead.id)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100">
                          Blev jobb
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'neighbours' && (
          <NeighbourCampaignsTab />
        )}

        {tab === 'stats' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Skickade</p>
              <p className="text-2xl font-bold text-gray-900">{sentCount}</p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Konverterade</p>
              <p className="text-2xl font-bold text-emerald-600">{convertedCount}</p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Konverteringsgrad</p>
              <p className="text-2xl font-bold text-gray-900">{sentCount > 0 ? Math.round((convertedCount / sentCount) * 100) : 0}%</p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Väntar på godkännande</p>
              <p className="text-2xl font-bold text-blue-600">{draftCount}</p>
            </div>
          </div>
        )}
      </div>

      {/* Letter preview/edit modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLead(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Brevförhandsgranskning</h3>
                <p className="text-xs text-gray-400">{selectedLead.owner_name} — {selectedLead.property_address}</p>
              </div>
              <button onClick={() => setSelectedLead(null)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {/* Property info */}
              <div className="flex gap-4 text-xs text-gray-500 mb-4 pb-4 border-b border-gray-100">
                {selectedLead.property_type && <span><Home className="w-3 h-3 inline mr-1" />{selectedLead.property_type}</span>}
                {selectedLead.built_year && <span><Calendar className="w-3 h-3 inline mr-1" />Byggt {selectedLead.built_year}</span>}
                {selectedLead.energy_class && <span><Zap className="w-3 h-3 inline mr-1" />Energi {selectedLead.energy_class}</span>}
                {selectedLead.purchase_date && <span>Köpt {selectedLead.purchase_date}</span>}
              </div>

              {/* Letter content — editable */}
              <div className="bg-gray-50 rounded-xl p-6 mb-4 font-serif">
                <textarea
                  value={editingLetter}
                  onChange={e => setEditingLetter(e.target.value)}
                  className="w-full bg-transparent text-gray-800 text-sm leading-relaxed resize-y focus:outline-none min-h-[200px]"
                />
              </div>

              <div className="flex gap-2">
                {selectedLead.status === 'draft' && (
                  <>
                    <button
                      onClick={handleSaveLetter}
                      disabled={savingLetter}
                      className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
                    >
                      {savingLetter ? 'Sparar...' : 'Spara ändringar'}
                    </button>
                    <button
                      onClick={() => { handleSaveLetter().then(() => handleApprove(selectedLead.id)) }}
                      className="flex-1 px-4 py-2.5 bg-primary-700 text-white rounded-xl text-sm font-medium hover:bg-primary-700"
                    >
                      Spara & Godkänn
                    </button>
                  </>
                )}
                {selectedLead.status === 'approved' && (
                  <button
                    onClick={() => handleSend(selectedLead.id)}
                    disabled={!hasLogo || sendingId === selectedLead.id}
                    className="flex-1 px-4 py-2.5 bg-primary-700 text-white rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sendingId === selectedLead.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Skicka brev (15 kr)
                  </button>
                )}
                {selectedLead.postnord_tracking_id && (
                  <p className="text-xs text-gray-400">Tracking: {selectedLead.postnord_tracking_id}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Neighbour Campaigns Tab ─────────────────────────────────

function NeighbourCampaignsTab() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [stats, setStats] = useState({ totalSent: 0, totalConverted: 0, totalSpent: 0, totalRevenue: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leads/neighbours')
      .then(r => r.json())
      .then(data => {
        setCampaigns(data.campaigns || [])
        setStats(data.stats || { totalSent: 0, totalConverted: 0, totalSpent: 0, totalRevenue: 0 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function markConverted(id: string, count: number) {
    await fetch(`/api/leads/neighbours/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ converted_count: count }),
    })
    // Refresh
    const res = await fetch('/api/leads/neighbours')
    const data = await res.json()
    setCampaigns(data.campaigns || [])
    setStats(data.stats || stats)
  }

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-primary-700 animate-spin" /></div>

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs text-gray-400">Skickade brev</p>
          <p className="text-xl font-bold text-gray-900">{stats.totalSent}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs text-gray-400">Konverterade</p>
          <p className="text-xl font-bold text-primary-700">{stats.totalConverted}</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs text-gray-400">Spenderat</p>
          <p className="text-xl font-bold text-gray-900">{stats.totalSpent.toLocaleString('sv-SE')} kr</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-xs text-gray-400">ROI</p>
          <p className="text-xl font-bold text-emerald-600">
            {stats.totalSpent > 0 ? `${Math.round((stats.totalRevenue / stats.totalSpent) * 100)}%` : '—'}
          </p>
          {stats.totalRevenue > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{stats.totalRevenue.toLocaleString('sv-SE')} kr intäkter</p>
          )}
        </div>
      </div>

      {/* Campaign list */}
      {campaigns.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center">
          <Home className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Inga grannkampanjer ännu</p>
          <p className="text-sm text-gray-400 mt-1">Kampanjer skapas automatiskt när jobb avslutas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c: any) => (
            <div key={c.id} className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{c.job_type || 'Jobb'} · {c.source_address}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.status === 'sent' ? 'bg-primary-100 text-primary-700' :
                      c.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {c.status === 'sent' ? 'Skickad' : c.status === 'approved' ? 'Godkänd' : 'Utkast'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{c.neighbour_count} brev</span>
                    <span>{Number(c.cost_sek || 0)} kr</span>
                    {c.sent_at && <span>{new Date(c.sent_at).toLocaleDateString('sv-SE')}</span>}
                    {c.converted_count > 0 && <span className="text-primary-700 font-medium">{c.converted_count} jobb</span>}
                  </div>
                </div>
                {c.status === 'sent' && (
                  <button
                    onClick={() => markConverted(c.id, (c.converted_count || 0) + 1)}
                    className="text-xs text-primary-700 hover:underline shrink-0"
                  >
                    + Blev jobb
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Upgrade Landing Page ────────────────────────────────────

function LeadsUpgradePage() {
  const [activating, setActivating] = useState<string | null>(null)

  const features = [
    { emoji: '📬', title: 'Lagfarter — nå nyinflyttade', desc: 'Skicka brev till fastighetsägare som nyligen köpt bostad i ditt område.' },
    { emoji: '🏘️', title: 'Granneffekten', desc: 'Följ upp varje avslutat jobb med brev till grannar automatiskt.' },
    { emoji: '🤖', title: 'AI-skrivna brev', desc: 'Personliga och professionella brev genererade av AI, anpassade efter din bransch.' },
  ]

  const plans = [
    { tier: 'starter', name: 'Starter', price: 499, quota: 20, perLetter: 15, popular: false },
    { tier: 'pro', name: 'Pro', price: 999, quota: 50, perLetter: 12, popular: true },
  ]

  async function activate(tier: string) {
    setActivating(tier)
    try {
      const res = await fetch('/api/billing/leads-addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const data = await res.json()
      if (data.checkout_url) {
        window.location.href = data.checkout_url
      } else if (data.success) {
        window.location.reload()
      }
    } catch { /* silent */ }
    setActivating(null)
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-10 pt-8">
          <div className="w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-primary-700" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Handymate Leads</h1>
          <p className="text-lg text-gray-500 max-w-md mx-auto">Nå rätt kunder automatiskt — direkt i brevlådan</p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {features.map(f => (
            <div key={f.title} className="bg-white border border-[#E2E8F0] rounded-xl p-5 text-center">
              <div className="text-3xl mb-3">{f.emoji}</div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-xs text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {plans.map(plan => (
            <div key={plan.tier} className={`bg-white rounded-xl border-2 p-6 relative ${
              plan.popular ? 'border-primary-600 shadow-lg' : 'border-gray-200'
            }`}>
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-700 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Populärast
                </span>
              )}
              <h3 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                <span className="text-gray-500 text-sm">kr/mån</span>
              </div>
              <ul className="text-sm text-gray-600 space-y-2 mb-6">
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary-600 shrink-0" />{plan.quota} brev/månad inkluderade</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary-600 shrink-0" />Extra brev: {plan.perLetter} kr/st</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary-600 shrink-0" />AI-genererade brev</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary-600 shrink-0" />Lagfarter + Granneffekten</li>
              </ul>
              <button
                onClick={() => activate(plan.tier)}
                disabled={activating !== null}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
                  plan.popular
                    ? 'bg-primary-700 text-white hover:bg-primary-800'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                } disabled:opacity-50`}
              >
                {activating === plan.tier ? 'Aktiverar...' : 'Aktivera nu'}
              </button>
            </div>
          ))}
        </div>

        {/* Guarantee */}
        <div className="text-center">
          <p className="text-sm text-gray-400">
            🛡️ 30 dagars pengarna-tillbaka-garanti. Avsluta när du vill.
          </p>
        </div>
      </div>
    </div>
  )
}
