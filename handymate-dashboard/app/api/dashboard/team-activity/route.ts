import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/dashboard/team-activity
 *
 * Returnerar vad varje AI-team-medlem gjort idag (eller senaste 24h)
 * baserat på riktig data från agent_runs, v3_automation_logs, invoices,
 * quotes, booking m.fl.
 *
 * Format per agent:
 *   { id, stat: '7' | '18 200 kr' | null, action: 'samtal besvarade...', meta: '11:42' | null, idle: boolean }
 */

const HOURS_BACK = 24

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id
  const sinceIso = new Date(Date.now() - HOURS_BACK * 3_600_000).toISOString()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  // ── Kör alla queries parallellt ───────────────────────────
  const [agentRunsRes, automationLogsRes, invoicesRes, quotesRes, bookingsRes] = await Promise.all([
    // Senaste agent-körningar
    supabase
      .from('agent_runs')
      .select('agent_id, trigger_type, trigger_data, tool_calls, status, created_at')
      .eq('business_id', businessId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(200),

    // Automationsloggar
    supabase
      .from('v3_automation_logs')
      .select('action_type, status, created_at, agent_id')
      .eq('business_id', businessId)
      .eq('status', 'success')
      .gte('created_at', sinceIso)
      .limit(200),

    // Fakturor skapade idag
    supabase
      .from('invoice')
      .select('invoice_id, total, status, created_at')
      .eq('business_id', businessId)
      .gte('created_at', todayIso),

    // Offerter idag
    supabase
      .from('quotes')
      .select('quote_id, status, sent_at, created_at')
      .eq('business_id', businessId)
      .gte('created_at', sinceIso),

    // Bokningar idag
    supabase
      .from('booking')
      .select('booking_id, status, scheduled_start, created_at, updated_at')
      .eq('business_id', businessId)
      .gte('updated_at', sinceIso),
  ])

  const agentRuns = agentRunsRes.data || []
  const automationLogs = automationLogsRes.data || []
  const invoices = invoicesRes.data || []
  const quotes = quotesRes.data || []
  const bookings = bookingsRes.data || []

  // ── LISA: Kundservice (samtal + SMS-konversationer) ──────
  const lisaCalls = agentRuns.filter(r => r.agent_id === 'lisa' && r.trigger_type === 'phone_call')
  const lisaSms = agentRuns.filter(r => r.agent_id === 'lisa' && r.trigger_type === 'incoming_sms')
  const lisaTotal = lisaCalls.length + lisaSms.length
  const lisaLatest = [...lisaCalls, ...lisaSms].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]

  const lisa = lisaTotal > 0
    ? {
        id: 'lisa',
        stat: String(lisaTotal),
        action: lisaCalls.length && lisaSms.length
          ? `samtal & SMS besvarade · ${lisaCalls.length} samtal, ${lisaSms.length} SMS`
          : lisaCalls.length
            ? 'samtal besvarade'
            : 'SMS besvarade',
        meta: lisaLatest ? formatTime(lisaLatest.created_at) : null,
        idle: false,
      }
    : { id: 'lisa', stat: null, action: 'Inga inkommande just nu', meta: null, idle: true }

  // ── DANIEL: Säljare (offerter) ────────────────────────────
  const sentQuotes = quotes.filter(q => q.sent_at && new Date(q.sent_at) >= new Date(sinceIso))
  const draftQuotes = quotes.filter(q => q.status === 'draft' || q.status === 'sent')
  const acceptedQuotes = quotes.filter(q => q.status === 'accepted')

  const daniel = (sentQuotes.length + acceptedQuotes.length) > 0
    ? {
        id: 'daniel',
        stat: String(sentQuotes.length + acceptedQuotes.length),
        action: acceptedQuotes.length > 0
          ? `offerter hanterade · ${acceptedQuotes.length} accepterade`
          : `offerter förberedda · väntar på godkännande`,
        meta: sentQuotes[0] ? formatTime(sentQuotes[0].sent_at!) : null,
        idle: false,
      }
    : draftQuotes.length > 0
      ? {
          id: 'daniel',
          stat: String(draftQuotes.length),
          action: 'offerter under bearbetning',
          meta: null,
          idle: false,
        }
      : { id: 'daniel', stat: null, action: 'Inga aktiva offerter idag', meta: null, idle: true }

  // ── KARIN: Ekonom (fakturor + påminnelser) ────────────────
  const totalInvoiced = invoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0)
  const sentInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'paid')
  const reminderActions = automationLogs.filter(l =>
    l.action_type === 'send_reminder' || l.action_type === 'send_invoice_reminder'
  )

  const karin = totalInvoiced > 0 || reminderActions.length > 0
    ? {
        id: 'karin',
        stat: totalInvoiced > 0 ? formatSek(totalInvoiced) : String(reminderActions.length),
        action: totalInvoiced > 0
          ? reminderActions.length > 0
            ? `fakturerat · ${reminderActions.length} påminnelse${reminderActions.length === 1 ? '' : 'r'} skickade`
            : `fakturerat · ${sentInvoices.length} skickade`
          : `påminnelse${reminderActions.length === 1 ? '' : 'r'} skickade`,
        meta: invoices[0] ? formatTime(invoices[0].created_at) : null,
        idle: false,
      }
    : { id: 'karin', stat: null, action: 'Inga fakturor att hantera', meta: null, idle: true }

  // ── LARS: Projektledare (bokningar) ──────────────────────
  const updatedBookings = bookings.filter(b =>
    b.updated_at && new Date(b.updated_at) >= new Date(sinceIso)
  )
  const bookingActions = automationLogs.filter(l =>
    l.action_type === 'send_booking_reminder' || l.action_type === 'create_booking'
  )

  const lars = (updatedBookings.length + bookingActions.length) > 0
    ? {
        id: 'lars',
        stat: String(updatedBookings.length || bookingActions.length),
        action: bookingActions.some(a => a.action_type === 'send_booking_reminder')
          ? 'bokningspåminnelser skickade'
          : 'bokningar uppdaterade',
        meta: updatedBookings[0] ? formatTime(updatedBookings[0].updated_at) : null,
        idle: false,
      }
    : { id: 'lars', stat: null, action: 'Inga bokningar att hantera', meta: null, idle: true }

  // ── HANNA: Marknad (kampanjer + SMS-flöden) ──────────────
  const campaignActions = automationLogs.filter(l =>
    l.action_type === 'send_sms' || l.action_type === 'send_email' || l.action_type === 'quote_followup'
  )

  const hanna = campaignActions.length > 0
    ? {
        id: 'hanna',
        stat: String(campaignActions.length),
        action: 'utskick gjorda · uppföljningar och påminnelser',
        meta: campaignActions[0] ? formatTime(campaignActions[0].created_at) : null,
        idle: false,
      }
    : { id: 'hanna', stat: null, action: 'Inga aktiva kampanjer', meta: null, idle: true }

  // ── MATTE: Chefsassistent (totalt) ────────────────────────
  const matteRuns = agentRuns.filter(r => r.agent_id === 'matte' || !r.agent_id)
  const matteTools = matteRuns.reduce((sum, r) => sum + (r.tool_calls || 0), 0)
  const allActiveAgents = [lisa, daniel, karin, lars, hanna].filter(a => !a.idle).length

  const matte = allActiveAgents > 0
    ? {
        id: 'matte',
        stat: String(allActiveAgents),
        action: `agenter aktiva · ${matteTools} åtgärder koordinerade`,
        meta: null,
        idle: false,
      }
    : { id: 'matte', stat: null, action: 'Allt lugnt — teamet vilar', meta: null, idle: true }

  // ── Sammanfattnings-data för subheader ────────────────────
  const summary = {
    total_calls: lisaCalls.length,
    total_sms: lisaSms.length,
    total_quotes: sentQuotes.length + draftQuotes.length,
    total_invoiced: Math.round(totalInvoiced),
    total_bookings_updated: updatedBookings.length,
    total_automations: automationLogs.length,
    active_agents: allActiveAgents,
  }

  return NextResponse.json({
    agents: [matte, lisa, daniel, karin, lars, hanna],
    summary,
    since: sinceIso,
  })
}

// ── Helpers ──────────────────────────────────────────────
function formatSek(value: number): string {
  return new Intl.NumberFormat('sv-SE').format(Math.round(value)) + ' kr'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  if (diffMs < 60_000) return 'nyss'
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} min sedan`
  // Idag → klockslag, annars datum
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}
