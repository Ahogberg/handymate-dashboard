import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { TEAM } from '@/lib/agents/team'

/**
 * GET /api/dashboard/saved-scoreboard
 *
 * "Vad teamet sparat åt dig" — månadsöversikt som översätter teamets
 * aktivitet till tid (uppskattad) och några riktiga stödsiffror.
 *
 * ÄRLIGHET (epistemisk hygien):
 *   - Tid är en UPPSKATTNING (~15 min per loggad åtgärd, samma heuristik som
 *     dashboardens 7-dagars-rad). Flaggas som estimate i svaret (is_estimate).
 *   - Stödsiffrorna (samtal, offerter, påminnelser) är RIKTIGA räkningar.
 *   - Per-agent åtgärder bygger på agent_runs.agent_id (attribution-fixen
 *     Del 1A) + automationsloggar, så nedbrytningen är korrekt attribuerad.
 *   - Vi hittar INTE på "kr indrivet" — det utelämnas tills vi har en pålitlig
 *     påminnelse→betald-faktura-koppling.
 */

const MIN_PER_ACTION = 15

function monthRange(year: number, monthIdx: number): { startIso: string; endIso: string } {
  const start = new Date(year, monthIdx, 1, 0, 0, 0, 0)
  const end = new Date(year, monthIdx + 1, 1, 0, 0, 0, 0)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id

  const now = new Date()
  const thisMonth = monthRange(now.getFullYear(), now.getMonth())
  const prevMonth = monthRange(now.getFullYear(), now.getMonth() - 1)

  const [runsRes, prevRunsRes, logsRes, quotesRes] = await Promise.all([
    supabase
      .from('agent_runs')
      .select('agent_id, trigger_type')
      .eq('business_id', businessId)
      .gte('created_at', thisMonth.startIso)
      .lt('created_at', thisMonth.endIso)
      .limit(5000),
    supabase
      .from('agent_runs')
      .select('agent_id')
      .eq('business_id', businessId)
      .gte('created_at', prevMonth.startIso)
      .lt('created_at', prevMonth.endIso)
      .limit(5000),
    supabase
      .from('v3_automation_logs')
      .select('action_type, agent_id')
      .eq('business_id', businessId)
      .eq('status', 'success')
      .gte('created_at', thisMonth.startIso)
      .lt('created_at', thisMonth.endIso)
      .limit(5000),
    supabase
      .from('quotes')
      .select('quote_id, sent_at')
      .eq('business_id', businessId)
      .gte('sent_at', thisMonth.startIso)
      .lt('sent_at', thisMonth.endIso)
      .limit(5000),
  ])

  const runs = runsRes.data || []
  const prevRuns = prevRunsRes.data || []
  const logs = logsRes.data || []
  const quotes = quotesRes.data || []

  // ── Per-agent åtgärdsräkning (runs + automationsloggar) ───
  const actionsByAgent: Record<string, number> = {}
  for (const r of runs) {
    const id = (r.agent_id || 'matte').toLowerCase()
    actionsByAgent[id] = (actionsByAgent[id] || 0) + 1
  }
  for (const l of logs) {
    if (!l.agent_id) continue
    const id = l.agent_id.toLowerCase()
    actionsByAgent[id] = (actionsByAgent[id] || 0) + 1
  }

  // Lisa-detalj: dela upp samtal vs SMS från trigger_type.
  const lisaCalls = runs.filter(r => (r.agent_id || '').toLowerCase() === 'lisa' && r.trigger_type === 'phone_call').length
  const lisaSms = runs.filter(r => (r.agent_id || '').toLowerCase() === 'lisa' && r.trigger_type === 'incoming_sms').length

  const reminders = logs.filter(l => l.action_type === 'send_reminder' || l.action_type === 'send_invoice_reminder').length

  // Bygg per-agent-rader (bara agenter med åtgärder), sorterat efter tid.
  const perAgent = TEAM
    .map(agent => {
      const actions = actionsByAgent[agent.id] || 0
      const minutes = actions * MIN_PER_ACTION
      let detail = `${actions} åtgärd${actions === 1 ? '' : 'er'}`
      if (agent.id === 'lisa' && (lisaCalls > 0 || lisaSms > 0)) {
        detail = `${lisaCalls} samtal, ${lisaSms} SMS`
      } else if (agent.id === 'karin' && reminders > 0) {
        detail = `${actions} åtgärder · ${reminders} påminnelse${reminders === 1 ? '' : 'r'}`
      }
      return { id: agent.id, name: agent.name, role: agent.role, actions, minutes, detail }
    })
    .filter(a => a.actions > 0)
    .sort((a, b) => b.minutes - a.minutes)

  const totalActions = runs.length + logs.filter(l => l.agent_id).length
  const prevActions = prevRuns.length
  const totalMinutes = totalActions * MIN_PER_ACTION
  const prevMinutes = prevActions * MIN_PER_ACTION

  // Månadsetikett (svensk, versal första bokstav)
  const monthLabel = now.toLocaleDateString('sv-SE', { month: 'long' })

  return NextResponse.json({
    month_label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    is_estimate: true,
    minutes_per_action: MIN_PER_ACTION,
    total_minutes: totalMinutes,
    prev_total_minutes: prevMinutes,
    support: {
      calls: lisaCalls + lisaSms,
      quotes_sent: quotes.length,
      reminders,
    },
    per_agent: perAgent,
  })
}
