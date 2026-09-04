import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { agentForApproval } from '@/lib/jarvis/approval-view'
import { harledAgentTillstand, type AgentId, type AgentTillstandIndata } from '@/lib/agents/agent-tillstand'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/team-activity
 *
 * Returnerar vad varje AI-team-medlem gjort idag (eller senaste 24h)
 * baserat på riktig data från agent_runs, v3_automation_logs, invoices,
 * quotes, booking m.fl.
 *
 * Format per agent:
 *   { id, stat: '7' | '18 200 kr' | null, action: 'samtal besvarade...', meta: '11:42' | null, idle: boolean, tillstand: AgentTillstand }
 *
 * `tillstand` (tasks/plan-sann-agentstatus.md) är den grindade sanningen —
 * `stat`/`action`/`idle` finns kvar för bakåtkompatibilitet men en agent utan
 * en uppfylld förutsättning (nummer, verifierat provsamtal, påslagna
 * automationer, fakturadata, kundsegment) eller under den globala pausen
 * visas ALDRIG som samma gröna "bevakar" som en riktigt aktiverad agent —
 * se lib/agents/agent-tillstand.ts.
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

  // ── Rådata per agent (delas mellan aktivitetstexten och tillstånds-
  //    härledningen nedan — samma räkning, aldrig två sanningar) ──────
  const lisaCalls = agentRuns.filter(r => r.agent_id === 'lisa' && r.trigger_type === 'phone_call')
  const lisaSms = agentRuns.filter(r => r.agent_id === 'lisa' && r.trigger_type === 'incoming_sms')
  const lisaTotal = lisaCalls.length + lisaSms.length
  const lisaLatest = [...lisaCalls, ...lisaSms].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]

  const sentQuotes = quotes.filter(q => q.sent_at && new Date(q.sent_at) >= new Date(sinceIso))
  const draftQuotes = quotes.filter(q => q.status === 'draft' || q.status === 'sent')
  const acceptedQuotes = quotes.filter(q => q.status === 'accepted')
  const danielHandelser24h = (sentQuotes.length + acceptedQuotes.length) > 0
    ? sentQuotes.length + acceptedQuotes.length
    : draftQuotes.length

  const totalInvoiced = invoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0)
  const sentInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'paid')
  const reminderActions = automationLogs.filter(l =>
    l.action_type === 'send_reminder' || l.action_type === 'send_invoice_reminder'
  )
  // Samma predikat som Karins rika gren nedan (totalInvoiced > 0 ||
  // reminderActions.length > 0) — annars kan tillstånd och idle-flaggan säga
  // emot varandra på ett kant-fall (t.ex. en faktura på exakt 0 kr).
  const karinHandelser24h = (totalInvoiced > 0 || reminderActions.length > 0)
    ? invoices.length + reminderActions.length
    : 0

  const updatedBookings = bookings.filter(b =>
    b.updated_at && new Date(b.updated_at) >= new Date(sinceIso)
  )
  const bookingActions = automationLogs.filter(l =>
    l.action_type === 'send_booking_reminder' || l.action_type === 'create_booking'
  )
  const larsHandelser24h = updatedBookings.length + bookingActions.length

  const campaignActions = automationLogs.filter(l =>
    l.action_type === 'send_sms' || l.action_type === 'send_email' || l.action_type === 'quote_followup'
  )
  const hannaHandelser24h = campaignActions.length

  // ═══ WATCH-BLOCKET + SANN AGENTSTATUS — "Teamet just nu" ═══
  // (Tur 4 etapp 3, utökad med tasks/plan-sann-agentstatus.md)
  //
  // Enbart ANTAL och DATUM, aldrig belopp — blocket bor på en yta hela
  // personalen ser, så ingen ny rollgrind behövs (permission-kontraktet
  // orört). Kronorna bor i ägargrindade Att hämta.
  //
  // Inga embeds: FK:erna på booking/quotes är obekräftade i prod (lärdomen
  // 2026-08-05) — kundnamnet till nästa bokning hämtas separat.
  //
  // Flyttad HIT (före agentobjekten byggs, inte efter) eftersom varje agents
  // tillstånd nu behöver kill-switchen, automationsinställningarna och
  // fakturadata/kundsegment-signalerna innan action-texten skrivs.
  const nu = new Date().toISOString()
  const [
    obetaldaRes,
    oppnaOffRes,
    settingsRes,
    cfgRes,
    nastaBokningRes,
    automationSettingsRes,
    invoiceAnyRes,
    segmenteradeKunderRes,
    vantandeKortRes,
    lisaSamtalNagonsinRes,
  ] = await Promise.all([
    supabase
      .from('invoice')
      .select('due_date', { count: 'exact' })
      .eq('business_id', businessId)
      .in('status', ['sent', 'overdue'])
      .order('due_date', { ascending: true })
      .limit(1),
    supabase
      .from('quotes')
      .select('quote_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .in('status', [...OPEN_QUOTE_STATUSES]),
    supabase
      .from('v3_automation_settings')
      .select('quote_followup_days')
      .eq('business_id', businessId)
      .maybeSingle(),
    // Sann agentstatus (tasks/plan-sann-agentstatus.md): utökad med de tre
    // verifierade business_config-kolumnerna kill-switchen och Lisas
    // aktiveringsgrind behöver. Kolumner kontrollerade mot information_schema
    // — gissa aldrig fler, PostgREST avvisar hela selecten på en okänd kolumn.
    supabase
      .from('business_config')
      .select('assigned_phone_number, agents_globally_paused, onboarding_data')
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
      .from('booking')
      .select('scheduled_start, customer_id')
      .eq('business_id', businessId)
      .eq('status', 'confirmed')
      .gte('scheduled_start', nu)
      .order('scheduled_start', { ascending: true })
      .limit(1),
    // Daniels/Lars/Hannas aktiveringsgrindar och löftestexter — fail-soft:
    // saknad rad eller fel ⇒ alla tre flaggor false (aldrig krasch, aldrig
    // ett påstått påslaget reglage utan bevis).
    supabase
      .from('automation_settings')
      .select('sms_auto_enabled, sms_quote_followup, sms_day_before_reminder')
      .eq('business_id', businessId)
      .maybeSingle(),
    // Karins aktiveringsgrind: fakturadata finns (samma signal som
    // lib/onboarding/kom-igang-tasks.ts, minus fortnox_connected — den
    // kolumnen är inte i den verifierade listan för denna rutt).
    supabase
      .from('invoice')
      .select('invoice_id', { count: 'exact', head: true })
      .eq('business_id', businessId),
    // Hannas aktiveringsgrind: minst en kund har ett kundsegment.
    supabase
      .from('customer')
      .select('customer_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .not('segment_id', 'is', null),
    // "behöver dig" per agent — samma routing som resten av godkännande-ytan
    // (lib/jarvis/approval-view.ts agentForApproval), ingen ny kartläggning.
    // team_intro är ett informationskort, inte ett väntande beslut.
    supabase
      .from('pending_approvals')
      .select('approval_type, payload')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .neq('approval_type', 'team_intro'),
    // Lisas aktiveringsgrind, del 2: ett RIKTIGT samtal som Lisa fångat
    // någonsin är starkare bevis än ett provsamtal. Mot databasen 2026-09-04
    // hade inget av de åtta kontona med nummer ett provsamtal registrerat
    // (onboarding_data.test_call.called_at) — inte demokontot med ett riktigt
    // samtal, inte de betalande. Grindad enbart på provsamtalet hade Lisa
    // visat "Verifiera telefonen" överallt, även där hon bevisligen jobbat.
    // Utan tidsfönster med avsikt: agentRunsRes ovan är bara senaste dygnet.
    supabase
      .from('agent_runs')
      .select('run_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('agent_id', 'lisa')
      .eq('trigger_type', 'phone_call'),
  ])

  const nastaBokningRad = (nastaBokningRes.data || [])[0] || null
  let nastaBokningKund: string | null = null
  if (nastaBokningRad?.customer_id) {
    const { data: kund } = await supabase
      .from('customer')
      .select('name')
      .eq('business_id', businessId)
      .eq('customer_id', nastaBokningRad.customer_id)
      .maybeSingle()
    nastaBokningKund = kund?.name || null
  }

  // ── Signalerna bakom tillstånden — fail-soft överallt: saknad rad,
  //    saknad kolumn (defensivt cast) eller ett DB-fel ger den försiktiga
  //    tolkningen (false/0), aldrig en krasch. ────────────────────────
  const cfg = cfgRes.data as {
    assigned_phone_number?: string | null
    agents_globally_paused?: boolean | null
    onboarding_data?: Record<string, unknown> | null
  } | null
  const harNummer = Boolean(cfg?.assigned_phone_number)
  const agentsGloballyPaused = cfg?.agents_globally_paused === true
  const testCall = (cfg?.onboarding_data as Record<string, unknown> | null | undefined)
    ?.test_call as { called_at?: string | null } | undefined
  // Verifierad = provsamtal ELLER minst ett riktigt fångat samtal någonsin
  // (se frågan lisaSamtalNagonsinRes i Promise.all). Konton med nummer men
  // noll samtal får kvar "Verifiera telefonen" — ärligt, och samma läge som
  // enabled_unverified i lib/onboarding/channel-health.ts.
  const lisaSamtalNagonsin = lisaSamtalNagonsinRes.count ?? 0
  const telefonVerifierad = Boolean(testCall?.called_at) || lisaSamtalNagonsin > 0

  const autoSettings = automationSettingsRes.data as {
    sms_auto_enabled?: boolean | null
    sms_quote_followup?: boolean | null
    sms_day_before_reminder?: boolean | null
  } | null
  // "Inte uttryckligen av" — INTE "uttryckligen på". Det är exakt semantiken
  // cronen kör med (app/api/cron/quote-follow-up/route.ts: `enabled =
  // sms_auto_enabled !== false && sms_quote_followup !== false`, och saknad
  // rad lämnar enabled = true). Mot databasen 2026-09-04 har NOLL konton en
  // automation_settings-rad — med `=== true` hade remsan sagt "Daniel behöver
  // aktiveras" på varenda konto medan cronen samtidigt skickade uppföljningar.
  // Statusen måste beskriva vad automationen faktiskt gör, inte vad en
  // strängare tolkning av samma rad skulle betyda.
  const smsAutoEnabled = autoSettings?.sms_auto_enabled !== false
  const smsQuoteFollowup = autoSettings?.sms_quote_followup !== false
  const smsDayBeforeReminder = autoSettings?.sms_day_before_reminder !== false

  const karinHasInvoiceData = (invoiceAnyRes.count ?? 0) > 0
  const hannaHasSegment = (segmenteradeKunderRes.count ?? 0) > 0

  const pendingByAgent = new Map<string, number>()
  for (const row of vantandeKortRes.data || []) {
    const agent = agentForApproval({
      approval_type: row.approval_type,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
    })
    pendingByAgent.set(agent, (pendingByAgent.get(agent) ?? 0) + 1)
  }
  const vantandeKort = (agent: AgentId) => pendingByAgent.get(agent) ?? 0

  const tillstandIndata: AgentTillstandIndata = {
    agentsGloballyPaused,
    lisa: { harNummer, telefonVerifierad, handelser24h: lisaTotal, vantandeKort: vantandeKort('lisa') },
    daniel: {
      harNummer,
      smsAutoEnabled,
      smsQuoteFollowup,
      handelser24h: danielHandelser24h,
      vantandeKort: vantandeKort('daniel'),
    },
    karin: { harFakturadata: karinHasInvoiceData, handelser24h: karinHandelser24h, vantandeKort: vantandeKort('karin') },
    lars: { handelser24h: larsHandelser24h, vantandeKort: vantandeKort('lars') },
    hanna: {
      harKundsegment: hannaHasSegment,
      smsAutoEnabled,
      handelser24h: hannaHandelser24h,
      vantandeKort: vantandeKort('hanna'),
    },
  }
  const tillstand = harledAgentTillstand(tillstandIndata)

  /**
   * Slår ihop den härledda tillståndsraden med den rikt beskrivna
   * aktivitetstexten. `pausad`/`behover_aktiveras` vinner alltid över ett
   * historiskt stat-tal — att visa "7 samtal hanterade" på en pausad eller
   * oaktiverad agent hade motsagt badgen bredvid.
   */
  function agentPost(
    id: AgentId,
    rikt: { stat: string; action: string; meta: string | null } | null,
  ) {
    const t = tillstand[id]
    if (t.tillstand === 'pausad' || t.tillstand === 'behover_aktiveras') {
      return { id, stat: null, action: t.rad, meta: null, idle: true, tillstand: t.tillstand }
    }
    if (rikt) {
      return { id, stat: rikt.stat, action: rikt.action, meta: rikt.meta, idle: false, tillstand: t.tillstand }
    }
    return { id, stat: null, action: t.rad, meta: null, idle: true, tillstand: t.tillstand }
  }

  // ── LISA: Kundservice (samtal + SMS-konversationer) ──────
  const lisa = agentPost('lisa', lisaTotal > 0
    ? {
        stat: String(lisaTotal),
        action: lisaCalls.length && lisaSms.length
          ? `samtal & SMS besvarade · ${lisaCalls.length} samtal, ${lisaSms.length} SMS`
          : lisaCalls.length
            ? 'samtal hanterade'
            : 'SMS besvarade',
        meta: lisaLatest ? formatTime(lisaLatest.created_at) : null,
      }
    : null)

  // ── DANIEL: Säljare (offerter) ────────────────────────────
  const daniel = agentPost('daniel', (sentQuotes.length + acceptedQuotes.length) > 0
    ? {
        stat: String(sentQuotes.length + acceptedQuotes.length),
        action: acceptedQuotes.length > 0
          ? `offerter hanterade · ${acceptedQuotes.length} accepterade`
          : `offerter förberedda · väntar på godkännande`,
        meta: sentQuotes[0] ? formatTime(sentQuotes[0].sent_at!) : null,
      }
    : draftQuotes.length > 0
      ? { stat: String(draftQuotes.length), action: 'offerter under bearbetning', meta: null }
      : null)

  // ── KARIN: Ekonom (fakturor + påminnelser) ────────────────
  const karin = agentPost('karin', totalInvoiced > 0 || reminderActions.length > 0
    ? {
        stat: totalInvoiced > 0 ? formatSek(totalInvoiced) : String(reminderActions.length),
        action: totalInvoiced > 0
          ? reminderActions.length > 0
            ? `fakturerat · ${reminderActions.length} påminnelse${reminderActions.length === 1 ? '' : 'r'} skickade`
            : `fakturerat · ${sentInvoices.length} skickade`
          : `påminnelse${reminderActions.length === 1 ? '' : 'r'} skickade`,
        meta: invoices[0] ? formatTime(invoices[0].created_at) : null,
      }
    : null)

  // ── LARS: Projektledare (bokningar) ──────────────────────
  const lars = agentPost('lars', (updatedBookings.length + bookingActions.length) > 0
    ? {
        stat: String(updatedBookings.length || bookingActions.length),
        action: bookingActions.some(a => a.action_type === 'send_booking_reminder')
          ? 'bokningspåminnelser skickade'
          : 'bokningar uppdaterade',
        meta: updatedBookings[0] ? formatTime(updatedBookings[0].updated_at) : null,
      }
    : null)

  // ── HANNA: Marknad (kampanjer + SMS-flöden) ──────────────
  const hanna = agentPost('hanna', campaignActions.length > 0
    ? {
        stat: String(campaignActions.length),
        action: 'utskick gjorda · uppföljningar och påminnelser',
        meta: campaignActions[0] ? formatTime(campaignActions[0].created_at) : null,
      }
    : null)

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

  const watch = {
    fakturor: {
      bevakade: obetaldaRes.count ?? 0,
      nastaForfall: (obetaldaRes.data || [])[0]?.due_date ?? null,
    },
    offerter: {
      oppna: oppnaOffRes.count ?? 0,
      followupDagar: settingsRes.data?.quote_followup_days ?? 5,
      // Sann agentstatus: löftet om en dag-siffra kräver att reglaget
      // faktiskt är påslaget — annars säger byggBevakning det ärligt.
      paminnelseAktiv: smsQuoteFollowup,
    },
    telefon: {
      aktiv: harNummer,
      samtal: lisaCalls.length,
    },
    nastaBokning: nastaBokningRad
      ? { start: nastaBokningRad.scheduled_start, kund: nastaBokningKund }
      : null,
    // Sann agentstatus: samma reglage som styr om SMS:et faktiskt skickas.
    dagenInnanPaminnelseAktiv: smsDayBeforeReminder,
    // generate-insights-cronen (söndag 06:00, vercel.json) filtrerar bort
    // konton utan assigned_phone_number — löftet gäller bara dem.
    veckosammanfattning: harNummer,
    // Hanna får en källa när det finns en ärlig sådan — hellre ingen fråga
    // än en påhittad.
    hannaFragor: [] as string[],
  }

  return NextResponse.json({
    agents: [matte, lisa, daniel, karin, lars, hanna],
    summary,
    watch,
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
