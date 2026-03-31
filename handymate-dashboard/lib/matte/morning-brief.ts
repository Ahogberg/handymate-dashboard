/**
 * V34 — Morning Brief: Varje agent bidrar med sin dagliga sammanfattning.
 */

import { getServerSupabase } from '@/lib/supabase'

export interface BriefDetail {
  text: string
  urgency: 'low' | 'medium' | 'high'
  link?: string
}

export interface AgentBrief {
  agentId: string
  quote: string
  badge?: string
  badgeType: 'neutral' | 'warning' | 'danger' | 'success'
  details: BriefDetail[]
}

export interface MorningBrief {
  date: string
  greeting: string
  agents: AgentBrief[]
  generatedAt: string
}

export async function generateMorningBrief(businessId: string): Promise<MorningBrief> {
  const supabase = getServerSupabase()
  const today = new Date().toISOString().split('T')[0]

  const { data: config } = await supabase
    .from('business_config')
    .select('contact_name, business_name')
    .eq('business_id', businessId)
    .single()

  const firstName = config?.contact_name?.split(' ')[0] || 'du'

  // Hämta all data parallellt
  const [
    overdueInvoices, pendingInvoices,
    openLeads, staleQuotes,
    todayBookings, profWarnings,
    inactiveCustomers, pendingApprovals,
  ] = await Promise.all([
    supabase.from('invoice')
      .select('invoice_id, invoice_number, total, due_date')
      .eq('business_id', businessId).eq('status', 'sent')
      .lt('due_date', today).limit(5),
    supabase.from('invoice')
      .select('invoice_id, total, due_date')
      .eq('business_id', businessId).eq('status', 'sent')
      .gte('due_date', today)
      .lte('due_date', new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0])
      .limit(5),
    supabase.from('leads')
      .select('lead_id, name, job_type, score, pipeline_stage')
      .eq('business_id', businessId)
      .not('status', 'in', '("won","lost","completed")')
      .order('score', { ascending: false }).limit(10),
    supabase.from('quotes')
      .select('quote_id, title, total, created_at')
      .eq('business_id', businessId).eq('status', 'sent')
      .lt('created_at', new Date(Date.now() - 5 * 86400000).toISOString())
      .limit(5),
    supabase.from('booking')
      .select('booking_id, notes, scheduled_start, status')
      .eq('business_id', businessId)
      .gte('scheduled_start', `${today}T00:00:00`)
      .lte('scheduled_start', `${today}T23:59:59`)
      .not('status', 'eq', 'cancelled')
      .order('scheduled_start'),
    supabase.from('project_events')
      .select('project_id, description')
      .eq('business_id', businessId).eq('type', 'profitability_warning')
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .limit(3),
    supabase.from('customer')
      .select('customer_id, name')
      .eq('business_id', businessId)
      .lt('updated_at', new Date(Date.now() - 180 * 86400000).toISOString())
      .limit(10),
    supabase.from('pending_approvals')
      .select('id, title')
      .eq('business_id', businessId).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(10),
  ])

  const karinBrief = buildKarinBrief(overdueInvoices.data || [], pendingInvoices.data || [])
  const danielBrief = buildDanielBrief(openLeads.data || [], staleQuotes.data || [])
  const larsBrief = buildLarsBrief(todayBookings.data || [], profWarnings.data || [])
  const hannaBrief = buildHannaBrief(inactiveCustomers.data || [])
  const matteBrief = buildMatteBrief(pendingApprovals.data || [], [karinBrief, danielBrief, larsBrief, hannaBrief])

  const brief: MorningBrief = {
    date: today,
    greeting: `God morgon, ${firstName}!`,
    agents: [matteBrief, karinBrief, danielBrief, larsBrief, hannaBrief],
    generatedAt: new Date().toISOString(),
  }

  // Cache
  await supabase.from('business_preferences').upsert({
    business_id: businessId,
    key: 'morning_brief_latest',
    value: JSON.stringify(brief),
    source: 'system',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,key' })
  // eslint-disable-next-line -- fire-and-forget cache

  return brief
}

function fmt(n: number): string { return n.toLocaleString('sv-SE') }

function buildKarinBrief(overdue: any[], upcoming: any[]): AgentBrief {
  const total = overdue.reduce((s: number, i: any) => s + (i.total || 0), 0)
  if (overdue.length > 0) return {
    agentId: 'karin',
    quote: `${overdue.length} faktura${overdue.length > 1 ? 'r' : ''} förfallen — ${fmt(total)} kr`,
    badge: `${overdue.length} förfallen`, badgeType: 'danger',
    details: [
      ...overdue.map((i: any) => ({ text: `${i.invoice_number || '—'}: ${fmt(i.total || 0)} kr, förföll ${i.due_date}`, urgency: 'high' as const, link: `/dashboard/invoices/${i.invoice_id}` })),
      ...upcoming.map((i: any) => ({ text: `${fmt(i.total || 0)} kr förfaller ${i.due_date}`, urgency: 'medium' as const, link: `/dashboard/invoices/${i.invoice_id}` })),
    ],
  }
  if (upcoming.length > 0) return {
    agentId: 'karin',
    quote: `${fmt(upcoming.reduce((s: number, i: any) => s + (i.total || 0), 0))} kr förfaller inom 3 dagar`,
    badge: `${upcoming.length} snart`, badgeType: 'warning',
    details: upcoming.map((i: any) => ({ text: `${fmt(i.total || 0)} kr förfaller ${i.due_date}`, urgency: 'medium' as const, link: `/dashboard/invoices/${i.invoice_id}` })),
  }
  return { agentId: 'karin', quote: 'Ekonomin ser bra ut idag.', badge: 'OK', badgeType: 'success', details: [] }
}

function buildDanielBrief(leads: any[], staleQuotes: any[]): AgentBrief {
  const hot = leads.filter((l: any) => (l.score || 0) >= 7)
  if (staleQuotes.length > 0) return {
    agentId: 'daniel',
    quote: `${staleQuotes.length} offert${staleQuotes.length > 1 ? 'er' : ''} utan svar — följ upp`,
    badge: `${staleQuotes.length} följ upp`, badgeType: 'warning',
    details: [
      ...staleQuotes.map((q: any) => {
        const days = Math.floor((Date.now() - new Date(q.created_at).getTime()) / 86400000)
        return { text: `${q.title}: ${fmt(q.total || 0)} kr, ${days} dagar sedan`, urgency: 'medium' as const, link: `/dashboard/quotes/${q.quote_id}/edit` }
      }),
      ...hot.map((l: any) => ({ text: `Hett lead: ${l.name || l.job_type} — score ${l.score}`, urgency: 'high' as const, link: `/dashboard/pipeline?lead=${l.lead_id}` })),
    ],
  }
  if (hot.length > 0) return {
    agentId: 'daniel', quote: `${hot.length} hett${hot.length > 1 ? 'a' : ''} lead${hot.length > 1 ? 's' : ''}`,
    badge: `${hot.length} heta`, badgeType: 'success',
    details: hot.map((l: any) => ({ text: `${l.name || 'Lead'}: ${l.job_type || '—'} — score ${l.score}`, urgency: 'high' as const, link: `/dashboard/pipeline?lead=${l.lead_id}` })),
  }
  if (leads.length > 0) return {
    agentId: 'daniel', quote: `${leads.length} aktiva leads`, badge: `${leads.length}`, badgeType: 'neutral',
    details: leads.slice(0, 3).map((l: any) => ({ text: `${l.name || 'Lead'} — ${l.pipeline_stage || '—'}`, urgency: 'low' as const, link: `/dashboard/pipeline?lead=${l.lead_id}` })),
  }
  return { agentId: 'daniel', quote: 'Inga leads just nu.', badge: 'Tomt', badgeType: 'neutral', details: [] }
}

function buildLarsBrief(bookings: any[], warnings: any[]): AgentBrief {
  if (warnings.length > 0) return {
    agentId: 'lars', quote: `${warnings.length} projekt med lönsamhetsrisk`,
    badge: 'Risk', badgeType: 'danger',
    details: [
      ...warnings.map((w: any) => ({ text: w.description, urgency: 'high' as const, link: `/dashboard/projects/${w.project_id}` })),
      ...bookings.map((b: any) => ({
        text: `Kl ${new Date(b.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}: ${b.notes || 'Bokning'}`,
        urgency: 'low' as const,
        link: `/dashboard/schedule`,
      })),
    ],
  }
  if (bookings.length > 0) return {
    agentId: 'lars', quote: `${bookings.length} bokning${bookings.length > 1 ? 'ar' : ''} idag`,
    badge: `${bookings.length} idag`, badgeType: 'neutral',
    details: bookings.map((b: any) => ({
      text: `Kl ${new Date(b.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}: ${b.notes || 'Bokning'}`,
      urgency: 'low' as const,
      link: `/dashboard/schedule`,
    })),
  }
  return { agentId: 'lars', quote: 'Inga bokningar idag.', badge: 'Ledig', badgeType: 'neutral', details: [] }
}

function buildHannaBrief(inactive: any[]): AgentBrief {
  if (inactive.length > 0) return {
    agentId: 'hanna', quote: `${inactive.length} kunder redo för reaktivering`,
    badge: 'Möjlighet', badgeType: 'success',
    details: inactive.slice(0, 3).map((c: any) => ({ text: `${c.name} — inaktiv 6+ månader`, urgency: 'low' as const, link: `/dashboard/customers/${c.customer_id}` })),
  }
  return { agentId: 'hanna', quote: 'Inga reaktiveringsmöjligheter just nu.', badge: 'OK', badgeType: 'neutral', details: [] }
}

function buildMatteBrief(approvals: any[], agentBriefs: AgentBrief[]): AgentBrief {
  const urgentCount = agentBriefs.reduce((sum, b) => sum + b.details.filter(d => d.urgency === 'high').length, 0) + approvals.length
  const details: BriefDetail[] = [
    ...approvals.slice(0, 3).map((a: any) => ({ text: a.title, urgency: 'high' as const, link: `/dashboard/approvals` })),
    ...agentBriefs.filter(b => b.badgeType === 'danger' || b.badgeType === 'warning')
      .map(b => ({ text: b.quote, urgency: b.badgeType === 'danger' ? 'high' as const : 'medium' as const })),
  ].slice(0, 5)

  if (urgentCount > 0) return {
    agentId: 'matte', quote: `${urgentCount} sak${urgentCount > 1 ? 'er' : ''} kräver din uppmärksamhet`,
    badge: `${urgentCount} åtgärder`, badgeType: urgentCount > 3 ? 'danger' : 'warning', details,
  }
  return { agentId: 'matte', quote: 'Allt lugnt idag. Teamet har koll.', badge: 'Allt OK', badgeType: 'success', details: [] }
}
