/**
 * V34 — Morning Brief: Varje agent bidrar med sin dagliga sammanfattning.
 */

import { getServerSupabase } from '@/lib/supabase'
import { assembleCashRadar } from '@/lib/cash-radar-data'
import { svDateStr, svDateStrPlusDays } from '@/lib/dates'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'

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

/**
 * Bumpa när brief-LOGIKEN ändras (queries, grenar, texter) så att dagens
 * redan cachade brief ogiltigförklaras och genereras om vid nästa läsning —
 * annars serveras gårdagens-logik-brief ända tills morgon-cronen kör igen.
 * (Upptäckt 2026-08-05: overdue-fixen syntes inte förrän dagen efter
 * eftersom GET:en serverade 05:30-cronens cache byggd med gammal kod.)
 */
export const MORNING_BRIEF_VERSION = 5 // 5: profWarnings läser pending_approvals istället för project_events (var alltid tom)

export interface MorningBrief {
  date: string
  greeting: string
  agents: AgentBrief[]
  generatedAt: string
  /** Se MORNING_BRIEF_VERSION — saknas i äldre cachade briefs (→ regenerera). */
  version?: number
}

export async function generateMorningBrief(businessId: string): Promise<MorningBrief> {
  const supabase = getServerSupabase()
  // TD-3: morgonbriefen skickas ofta tidigt — UTC-splitting av dagens
  // datum kan peka på GÅRDAGEN om cronen kör före midnatt UTC men efter
  // midnatt svensk tid. Måste räknas i svensk lokaltid.
  const today = svDateStr()

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
    recentCalls,
  ] = await Promise.all([
    // check-overdue-cronen flippar status till 'overdue' när förfallodatum
    // passerar — filtrerade vi bara på 'sent' missade Karin exakt de
    // fakturor hon skulle varna för (v85, dashboard-städpaketet del F).
    supabase.from('invoice')
      .select('invoice_id, invoice_number, total, due_date')
      .eq('business_id', businessId).in('status', ['sent', 'overdue'])
      .lt('due_date', today).limit(5),
    supabase.from('invoice')
      .select('invoice_id, total, due_date')
      .eq('business_id', businessId).eq('status', 'sent')
      .gte('due_date', today)
      .lte('due_date', svDateStrPlusDays(3))
      .limit(5),
    supabase.from('leads')
      // Sanering 2026-08-05: kolumnen heter pipeline_stage_key — det gamla
      // namnet fällde hela queryn → leads-sektionen i briefen var alltid tom.
      .select('lead_id, name, job_type, score, pipeline_stage_key')
      .eq('business_id', businessId)
      .not('status', 'in', '("won","lost")')
      .order('score', { ascending: false }).limit(10),
    supabase.from('quotes')
      .select('quote_id, title, total, created_at')
      .eq('business_id', businessId).in('status', [...OPEN_QUOTE_STATUSES])
      .lt('created_at', new Date(Date.now() - 5 * 86400000).toISOString())
      .limit(5),
    supabase.from('booking')
      // Epic 1 (2026-08-11): kundjoin för "Inför mötet"-raderna nedan.
      .select('booking_id, notes, scheduled_start, status, customer_id, customer (name)')
      .eq('business_id', businessId)
      .gte('scheduled_start', `${today}T00:00:00`)
      .lte('scheduled_start', `${today}T23:59:59`)
      .not('status', 'eq', 'cancelled')
      .order('scheduled_start'),
    // Bugg (2026-08-12): läste tidigare project_events/'profitability_warning'
    // — ingen kod skriver dit. Producenten checkProfitabilityWarnings
    // (lib/profitability.ts) skriver till pending_approvals, samma mönster
    // som app/api/dashboard/pengar/route.ts:81-86.
    supabase.from('pending_approvals')
      .select('description, payload')
      .eq('business_id', businessId).eq('approval_type', 'profitability_warning')
      .eq('status', 'pending')
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
    // Lisas underlag: samtalen sedan igår. Ett rullande dygn, inte
    // kalenderdygn — en brief som läses 07:00 ska visa gårdagskvällens
    // samtal, inte ett tomt fönster.
    supabase.from('call_recording')
      .select('recording_id, phone_number, transcript_summary, created_at')
      .eq('business_id', businessId)
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('created_at', { ascending: false }).limit(5),
  ])

  const karinBrief = buildKarinBrief(overdueInvoices.data || [], pendingInvoices.data || [])

  // Pengar in-radarn: tunn vecka framåt → rad överst i Karins brief.
  // Non-blocking — radarfel får aldrig fälla hela briefen.
  try {
    const radar = await assembleCashRadar(supabase, businessId)
    if (radar.ready && radar.dips.length > 0) {
      const dip = radar.dips[0]
      karinBrief.details.unshift({
        text: `Vecka ${isoWeekNo(dip.week_start)} ser tunn ut (~${fmt(dip.expected_kr)} kr mot normala ~${fmt(radar.normal_kr)}) — åtgärder finns på dashboarden.`,
        urgency: 'high',
        link: '/dashboard',
      })
      if (karinBrief.badgeType === 'success') {
        karinBrief.badge = 'Tunn vecka'
        karinBrief.badgeType = 'warning'
      }
    }
  } catch (err) {
    console.warn('[morning-brief] cash-radar hoppades över (icke-blockerande):', err)
  }

  const danielBrief = buildDanielBrief(openLeads.data || [], staleQuotes.data || [])

  // ═══ "Inför mötet" (Meeting Intelligence Epic 1, 2026-08-11) ═══
  //
  // För dagens KUNDKOPPLADE bokningar hämtas det hantverkaren behöver veta
  // innan han kliver in: öppna offerter och förfallna fakturor för just de
  // kunderna. Batchat (en .in()-fråga per tabell), aldrig blockerande —
  // briefen är viktigare än mötesraderna.
  const moteskontext = new Map<string, { offert?: string; faktura?: string }>()
  try {
    const kundIds = Array.from(new Set(
      (todayBookings.data || [])
        .map((b: any) => b.customer_id)
        .filter(Boolean),
    )) as string[]
    if (kundIds.length > 0) {
      const [oppnaOfferter, forfallnaFakturor] = await Promise.all([
        supabase.from('quotes')
          .select('customer_id, total, created_at')
          .eq('business_id', businessId)
          .in('customer_id', kundIds)
          .in('status', [...OPEN_QUOTE_STATUSES]),
        supabase.from('invoice')
          .select('customer_id, total, due_date')
          .eq('business_id', businessId)
          .in('customer_id', kundIds)
          .in('status', ['sent', 'overdue'])
          .lt('due_date', today),
      ])
      for (const kundId of kundIds) {
        const offert = (oppnaOfferter.data || []).find((q: any) => q.customer_id === kundId)
        const faktura = (forfallnaFakturor.data || []).find((f: any) => f.customer_id === kundId)
        if (!offert && !faktura) continue
        const post: { offert?: string; faktura?: string } = {}
        if (offert) {
          const dagar = Math.floor((Date.now() - new Date(offert.created_at).getTime()) / 86400000)
          post.offert = `öppen offert ${Math.round(Number(offert.total) || 0).toLocaleString('sv-SE')} kr (${dagar} dgr utan svar)`
        }
        if (faktura) {
          post.faktura = `förfallen faktura ${Math.round(Number(faktura.total) || 0).toLocaleString('sv-SE')} kr`
        }
        moteskontext.set(kundId, post)
      }
    }
  } catch (err) {
    console.warn('[morning-brief] möteskontext hoppades över (icke-blockerande):', err)
  }

  // pending_approvals har project_id i payload, inte som egen kolumn.
  const profWarningRows = (profWarnings.data || []).map((w: any) => ({
    description: w.description,
    project_id: w.payload?.project_id,
  }))
  const larsBrief = buildLarsBrief(todayBookings.data || [], profWarningRows, moteskontext)
  const hannaBrief = buildHannaBrief(inactiveCustomers.data || [])
  const lisaBrief = buildLisaBrief(recentCalls.data || [])
  const matteBrief = buildMatteBrief(pendingApprovals.data || [], [karinBrief, danielBrief, larsBrief, hannaBrief, lisaBrief])

  const brief: MorningBrief = {
    date: today,
    greeting: `God morgon, ${firstName}!`,
    agents: [matteBrief, karinBrief, danielBrief, larsBrief, hannaBrief, lisaBrief],
    generatedAt: new Date().toISOString(),
    version: MORNING_BRIEF_VERSION,
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

/** ISO 8601-veckonummer (torsdagsregeln) ur ett ISO-datum, t.ex. '2026-07-06' → 28. */
function isoWeekNo(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7 // mån=0 ... sön=6
  d.setUTCDate(d.getUTCDate() - dow + 3) // torsdagen i samma vecka
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const fdow = (firstThu.getUTCDay() + 6) % 7
  firstThu.setUTCDate(firstThu.getUTCDate() - fdow + 3) // årets första torsdag
  return 1 + Math.round((d.getTime() - firstThu.getTime()) / (7 * 86_400_000))
}

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
    details: leads.slice(0, 3).map((l: any) => ({ text: `${l.name || 'Lead'} — ${l.pipeline_stage_key || '—'}`, urgency: 'low' as const, link: `/dashboard/pipeline?lead=${l.lead_id}` })),
  }
  return { agentId: 'daniel', quote: 'Inga leads just nu.', badge: 'Tomt', badgeType: 'neutral', details: [] }
}

function buildLarsBrief(
  bookings: any[],
  warnings: any[],
  moteskontext: Map<string, { offert?: string; faktura?: string }> = new Map(),
): AgentBrief {
  // "Inför mötet"-raden: bokningens tid + kund + det man behöver veta innan
  // man kliver in (öppen offert / förfallen faktura). Utan kontext blir det
  // den vanliga bokningsraden.
  const bokningsRad = (b: any): BriefDetail => {
    const tid = new Date(b.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    const kundNamn = b.customer?.name || null
    const ctx = b.customer_id ? moteskontext.get(b.customer_id) : undefined
    if (kundNamn && ctx) {
      const delar = [ctx.offert, ctx.faktura].filter(Boolean).join(' · ')
      return {
        text: `Inför mötet med ${kundNamn} kl ${tid}: ${delar}`,
        urgency: 'medium' as const,
        link: `/dashboard/schedule`,
      }
    }
    return {
      text: `Kl ${tid}: ${kundNamn || b.notes || 'Bokning'}`,
      urgency: 'low' as const,
      link: `/dashboard/schedule`,
    }
  }

  if (warnings.length > 0) return {
    agentId: 'lars', quote: `${warnings.length} projekt med lönsamhetsrisk`,
    badge: 'Risk', badgeType: 'danger',
    details: [
      ...warnings.map((w: any) => ({ text: w.description, urgency: 'high' as const, link: w.project_id ? `/dashboard/projects/${w.project_id}` : '/dashboard/projects' })),
      ...bookings.map(bokningsRad),
    ],
  }
  if (bookings.length > 0) return {
    agentId: 'lars', quote: `${bookings.length} bokning${bookings.length > 1 ? 'ar' : ''} idag`,
    badge: `${bookings.length} idag`, badgeType: 'neutral',
    details: bookings.map(bokningsRad),
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

/**
 * Lisas brief — samtalen som kom in medan hantverkaren jobbade.
 *
 * SPÅR D1 (2026-08-06): Lisa saknades HELT i morgonbriefen. Telefonisten —
 * den agent som fångar det hantverkaren annars hade missat — syntes alltså
 * inte i den vy som ska sammanfatta vad teamet gjort. Det var inte ett
 * designbeslut; kartan över agenter i widgeten hade fem poster och
 * sammanställningen här byggde aldrig en sjätte.
 *
 * Ett besvarat samtal är en GOD nyhet, inte en åtgärd: Lisa tog det, och
 * hantverkaren behöver bara veta att det hänt. Därför 'success' och låg
 * brådska — inte en varning som tränar bort uppmärksamhet.
 */
function buildLisaBrief(calls: any[]): AgentBrief {
  if (calls.length > 0) return {
    agentId: 'lisa',
    quote: calls.length === 1 ? 'Jag tog ett samtal åt dig' : `Jag tog ${calls.length} samtal åt dig`,
    badge: 'Hanterat',
    badgeType: 'success',
    details: calls.slice(0, 3).map((c: any) => ({
      text: c.transcript_summary?.trim()
        ? `${c.phone_number || 'Okänt nummer'} — ${String(c.transcript_summary).slice(0, 90)}`
        : `${c.phone_number || 'Okänt nummer'} ringde`,
      urgency: 'low' as const,
      link: '/dashboard/calls',
    })),
  }
  return { agentId: 'lisa', quote: 'Inga samtal sedan igår.', badge: 'OK', badgeType: 'neutral', details: [] }
}

function buildMatteBrief(approvals: any[], agentBriefs: AgentBrief[]): AgentBrief {
  const urgentCount = agentBriefs.reduce((sum, b) => sum + b.details.filter(d => d.urgency === 'high').length, 0) + approvals.length
  // Approval-detaljerna listas inte längre här — godkänn-kön (IdagCore) äger
  // den ytan och skulle bara dubblera samma kort. approvals.length lever
  // kvar i urgentCount ovan så one-linern ("N saker kräver din uppmärksamhet")
  // fortfarande räknar rätt.
  const details: BriefDetail[] = agentBriefs
    .filter(b => b.badgeType === 'danger' || b.badgeType === 'warning')
    .map(b => ({ text: b.quote, urgency: b.badgeType === 'danger' ? 'high' as const : 'medium' as const }))
    .slice(0, 5)

  if (urgentCount > 0) return {
    agentId: 'matte', quote: `${urgentCount} sak${urgentCount > 1 ? 'er' : ''} kräver din uppmärksamhet`,
    badge: `${urgentCount} åtgärder`, badgeType: urgentCount > 3 ? 'danger' : 'warning', details,
  }
  return { agentId: 'matte', quote: 'Allt lugnt idag. Teamet har koll.', badge: 'Allt OK', badgeType: 'success', details: [] }
}
