// Handymate Scheduled Triggers — Proactive Automation Engine
// Runs every 15 minutes via Supabase cron
// Scans for automation candidates and triggers the AI agent

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

// ── Types ────────────────────────────────────────────────

interface AutomationRule {
  rule_id: string
  business_id: string
  rule_type: string
  label: string
  delay_hours: number
  max_attempts: number
  channel: string
  enabled: boolean
  message_template: string
}

interface QueueCandidate {
  business_id: string
  rule_id: string
  rule_type: string
  target_id: string
  target_type: string
  customer_id: string | null
  customer_name: string | null
  target_label: string
  agent_instruction: string
}

// ── Helpers ──────────────────────────────────────────────

function generateId(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let id = prefix + "_"
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

/** Check if current time is within night block (21:00–07:00 Swedish time) */
function isNightBlock(): boolean {
  const now = new Date()
  const year = now.getFullYear()
  // CEST: last Sunday March → last Sunday October
  const marchLast = new Date(year, 2, 31)
  const cestStart = new Date(year, 2, 31 - marchLast.getDay(), 2, 0, 0)
  const octLast = new Date(year, 9, 31)
  const cestEnd = new Date(year, 9, 31 - octLast.getDay(), 3, 0, 0)
  const isCEST = now >= cestStart && now < cestEnd
  const offset = isCEST ? 2 : 1
  const swedenHour = (now.getUTCHours() + offset) % 24
  return swedenHour >= 21 || swedenHour < 7
}

// ── Candidate Finders ────────────────────────────────────
// Each function finds targets that match a specific rule type

async function findQuoteFollowups(
  supabase: SupabaseClient,
  rule: AutomationRule
): Promise<QueueCandidate[]> {
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - rule.delay_hours)

  // Find quotes that are 'sent' and older than delay_hours, not yet followed up
  const { data: quotes } = await supabase
    .from("quotes")
    .select("quote_id, customer_id, title, total, created_at")
    .eq("business_id", rule.business_id)
    .eq("status", "sent")
    .lt("created_at", cutoff.toISOString())
    .order("created_at", { ascending: true })
    .limit(10)

  if (!quotes || quotes.length === 0) return []

  // Filter out ones already in queue
  const quoteIds = quotes.map((q: any) => q.quote_id)
  const { data: existing } = await supabase
    .from("automation_queue")
    .select("target_id, attempt_number")
    .in("target_id", quoteIds)
    .eq("rule_type", "quote_followup")
    .in("status", ["pending", "executed"])

  const existingMap = new Map(
    (existing || []).map((e: any) => [e.target_id, e.attempt_number])
  )

  // Get customer names
  const customerIds = [...new Set(quotes.map((q: any) => q.customer_id).filter(Boolean))]
  const { data: customers } = await supabase
    .from("customer")
    .select("customer_id, name")
    .in("customer_id", customerIds)

  const customerMap = new Map(
    (customers || []).map((c: any) => [c.customer_id, c.name])
  )

  const candidates: QueueCandidate[] = []
  for (const q of quotes as any[]) {
    const prevAttempt = existingMap.get(q.quote_id) || 0
    if (prevAttempt >= rule.max_attempts) continue

    const customerName = customerMap.get(q.customer_id) || "Okänd kund"
    const instruction = rule.message_template
      .replace("{quote_id}", q.quote_id)
      .replace("{total}", String(q.total || 0))
      .replace("{customer}", customerName)

    candidates.push({
      business_id: rule.business_id,
      rule_id: rule.rule_id,
      rule_type: "quote_followup",
      target_id: q.quote_id,
      target_type: "quote",
      customer_id: q.customer_id,
      customer_name: customerName,
      target_label: `Offert "${q.title}" — ${q.total?.toLocaleString()} kr`,
      agent_instruction: instruction,
    })
  }

  return candidates
}

async function findBookingReminders(
  supabase: SupabaseClient,
  rule: AutomationRule
): Promise<QueueCandidate[]> {
  // Bookings scheduled for tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split("T")[0]

  const { data: bookings } = await supabase
    .from("booking")
    .select("booking_id, customer_id, scheduled_start, scheduled_end, notes")
    .eq("business_id", rule.business_id)
    .in("status", ["pending", "confirmed"])
    .gte("scheduled_start", `${tomorrowStr}T00:00:00`)
    .lt("scheduled_start", `${tomorrowStr}T23:59:59`)
    .limit(20)

  if (!bookings || bookings.length === 0) return []

  // Filter out already queued
  const bookingIds = bookings.map((b: any) => b.booking_id)
  const { data: existing } = await supabase
    .from("automation_queue")
    .select("target_id")
    .in("target_id", bookingIds)
    .eq("rule_type", "booking_reminder")
    .in("status", ["pending", "executed"])

  const existingSet = new Set((existing || []).map((e: any) => e.target_id))

  // Get customer names
  const customerIds = [...new Set(bookings.map((b: any) => b.customer_id).filter(Boolean))]
  const { data: customers } = await supabase
    .from("customer")
    .select("customer_id, name")
    .in("customer_id", customerIds)

  const customerMap = new Map(
    (customers || []).map((c: any) => [c.customer_id, c.name])
  )

  const candidates: QueueCandidate[] = []
  for (const b of bookings as any[]) {
    if (existingSet.has(b.booking_id)) continue

    const customerName = customerMap.get(b.customer_id) || "Okänd kund"
    const time = new Date(b.scheduled_start).toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    })

    const instruction = rule.message_template
      .replace("{booking_id}", b.booking_id)
      .replace("{time}", time)
      .replace("{customer}", customerName)
      .replace("{service_type}", b.notes?.split(' — ')[0] || "Jobb")

    candidates.push({
      business_id: rule.business_id,
      rule_id: rule.rule_id,
      rule_type: "booking_reminder",
      target_id: b.booking_id,
      target_type: "booking",
      customer_id: b.customer_id,
      customer_name: customerName,
      target_label: `${b.notes?.split(' — ')[0] || "Bokning"} imorgon kl ${time}`,
      agent_instruction: instruction,
    })
  }

  return candidates
}

async function findInvoiceReminders(
  supabase: SupabaseClient,
  rule: AutomationRule
): Promise<QueueCandidate[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - Math.floor(rule.delay_hours / 24))

  const { data: invoices } = await supabase
    .from("invoice")
    .select("invoice_id, customer_id, invoice_number, total, due_date")
    .eq("business_id", rule.business_id)
    .eq("status", "sent")
    .lt("due_date", cutoff.toISOString().split("T")[0])
    .limit(10)

  if (!invoices || invoices.length === 0) return []

  // Filter out already queued (respect max_attempts)
  const invoiceIds = invoices.map((i: any) => i.invoice_id)
  const { data: existing } = await supabase
    .from("automation_queue")
    .select("target_id, attempt_number")
    .in("target_id", invoiceIds)
    .eq("rule_type", "invoice_reminder")

  const attemptMap = new Map<string, number>()
  for (const e of existing || []) {
    const prev = attemptMap.get((e as any).target_id) || 0
    attemptMap.set((e as any).target_id, Math.max(prev, (e as any).attempt_number))
  }

  // Customer names
  const customerIds = [...new Set(invoices.map((i: any) => i.customer_id).filter(Boolean))]
  const { data: customers } = await supabase
    .from("customer")
    .select("customer_id, name")
    .in("customer_id", customerIds)

  const customerMap = new Map(
    (customers || []).map((c: any) => [c.customer_id, c.name])
  )

  const candidates: QueueCandidate[] = []
  for (const inv of invoices as any[]) {
    const prevAttempt = attemptMap.get(inv.invoice_id) || 0
    if (prevAttempt >= rule.max_attempts) continue

    const customerName = customerMap.get(inv.customer_id) || "Okänd kund"
    const instruction = rule.message_template
      .replace("{invoice_id}", inv.invoice_number || inv.invoice_id)
      .replace("{total}", String(inv.total || 0))
      .replace("{due_date}", inv.due_date || "okänt")
      .replace("{customer}", customerName)

    candidates.push({
      business_id: rule.business_id,
      rule_id: rule.rule_id,
      rule_type: "invoice_reminder",
      target_id: inv.invoice_id,
      target_type: "invoice",
      customer_id: inv.customer_id,
      customer_name: customerName,
      target_label: `Faktura ${inv.invoice_number} — ${inv.total?.toLocaleString()} kr, förfallen ${inv.due_date}`,
      agent_instruction: instruction,
    })
  }

  return candidates
}

async function findLeadResponses(
  supabase: SupabaseClient,
  rule: AutomationRule
): Promise<QueueCandidate[]> {
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - rule.delay_hours)

  // Recent call recordings without a linked quote or booking
  const { data: recordings } = await supabase
    .from("call_recording")
    .select("recording_id, customer_id, phone_number, transcript_summary, created_at")
    .eq("business_id", rule.business_id)
    .gt("created_at", cutoff.toISOString())
    .not("transcript", "is", null)
    .limit(10)

  if (!recordings || recordings.length === 0) return []

  // Check which recordings already have follow-up actions
  const recIds = recordings.map((r: any) => r.recording_id)
  const { data: existingQueue } = await supabase
    .from("automation_queue")
    .select("target_id")
    .in("target_id", recIds)
    .eq("rule_type", "lead_response")

  const existingSet = new Set((existingQueue || []).map((e: any) => e.target_id))

  // Check which have linked suggestions that were approved
  const { data: suggestions } = await supabase
    .from("ai_suggestion")
    .select("recording_id, suggestion_type, status")
    .in("recording_id", recIds)
    .in("suggestion_type", ["booking", "quote"])
    .in("status", ["approved", "completed"])

  const handledSet = new Set((suggestions || []).map((s: any) => s.recording_id))

  const candidates: QueueCandidate[] = []
  for (const rec of recordings as any[]) {
    if (existingSet.has(rec.recording_id)) continue
    if (handledSet.has(rec.recording_id)) continue

    const instruction = rule.message_template
      .replace("{phone}", rec.phone_number || "okänt nummer")
      .replace("{recording_id}", rec.recording_id)

    candidates.push({
      business_id: rule.business_id,
      rule_id: rule.rule_id,
      rule_type: "lead_response",
      target_id: rec.recording_id,
      target_type: "conversation",
      customer_id: rec.customer_id,
      customer_name: null,
      target_label: `Samtal från ${rec.phone_number || "okänt"} — ${rec.transcript_summary?.substring(0, 80) || "Ej analyserat"}`,
      agent_instruction: instruction,
    })
  }

  return candidates
}

async function findProjectCompletes(
  supabase: SupabaseClient,
  rule: AutomationRule
): Promise<QueueCandidate[]> {
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - rule.delay_hours)

  // Bookings marked as completed recently, with no linked invoice
  const { data: bookings } = await supabase
    .from("booking")
    .select("booking_id, customer_id, notes")
    .eq("business_id", rule.business_id)
    .eq("status", "completed")
    .limit(20)

  if (!bookings || bookings.length === 0) return []

  // Check which have invoices
  const customerIds = bookings.map((b: any) => b.customer_id).filter(Boolean)
  const { data: invoices } = await supabase
    .from("invoice")
    .select("customer_id")
    .eq("business_id", rule.business_id)
    .in("customer_id", customerIds)
    .neq("status", "cancelled")

  const invoicedCustomers = new Set((invoices || []).map((i: any) => i.customer_id))

  // Filter out already queued
  const bookingIds = bookings.map((b: any) => b.booking_id)
  const { data: existing } = await supabase
    .from("automation_queue")
    .select("target_id")
    .in("target_id", bookingIds)
    .eq("rule_type", "project_complete")

  const existingSet = new Set((existing || []).map((e: any) => e.target_id))

  // Customer names
  const { data: customers } = await supabase
    .from("customer")
    .select("customer_id, name")
    .in("customer_id", customerIds)

  const customerMap = new Map(
    (customers || []).map((c: any) => [c.customer_id, c.name])
  )

  const candidates: QueueCandidate[] = []
  for (const b of bookings as any[]) {
    if (existingSet.has(b.booking_id)) continue
    if (invoicedCustomers.has(b.customer_id)) continue

    const customerName = customerMap.get(b.customer_id) || "Okänd kund"
    const instruction = rule.message_template
      .replace("{booking_id}", b.booking_id)
      .replace("{service_type}", b.notes?.split(' — ')[0] || "Jobb")
      .replace("{customer}", customerName)

    candidates.push({
      business_id: rule.business_id,
      rule_id: rule.rule_id,
      rule_type: "project_complete",
      target_id: b.booking_id,
      target_type: "project",
      customer_id: b.customer_id,
      customer_name: customerName,
      target_label: `${b.notes?.split(' — ')[0] || "Projekt"} klart — ${customerName}`,
      agent_instruction: instruction,
    })
  }

  return candidates
}

// ── Lead Pipeline Finders ─────────────────────────────────

async function findLeadQualify(
  supabase: SupabaseClient,
  rule: AutomationRule
): Promise<QueueCandidate[]> {
  const cutoff = new Date()
  cutoff.setMinutes(cutoff.getMinutes() - (rule.delay_hours * 60)) // delay_hours used as minutes for this rule

  // Conversations without a linked lead, created within the window
  const { data: conversations } = await supabase
    .from("conversations")
    .select("conversation_id, business_id, phone_number, created_at")
    .eq("business_id", rule.business_id)
    .gt("created_at", cutoff.toISOString())
    .limit(10)

  if (!conversations || conversations.length === 0) return []

  // Check which already have leads
  const convIds = conversations.map((c: any) => c.conversation_id)
  const { data: existingLeads } = await supabase
    .from("leads")
    .select("conversation_id")
    .in("conversation_id", convIds)

  const leadedSet = new Set((existingLeads || []).map((l: any) => l.conversation_id))

  // Filter out already queued
  const { data: existing } = await supabase
    .from("automation_queue")
    .select("target_id")
    .in("target_id", convIds)
    .eq("rule_type", "lead_qualify")

  const existingSet = new Set((existing || []).map((e: any) => e.target_id))

  const candidates: QueueCandidate[] = []
  for (const conv of conversations as any[]) {
    if (leadedSet.has(conv.conversation_id)) continue
    if (existingSet.has(conv.conversation_id)) continue

    const instruction = (rule.message_template || "Analysera samtal {conversation_id}, kvalificera lead, skapa i pipeline")
      .replace("{conversation_id}", conv.conversation_id)
      .replace("{phone}", conv.phone_number || "okänt")

    candidates.push({
      business_id: rule.business_id,
      rule_id: rule.rule_id,
      rule_type: "lead_qualify",
      target_id: conv.conversation_id,
      target_type: "conversation",
      customer_id: null,
      customer_name: null,
      target_label: `Nytt samtal från ${conv.phone_number || "okänt"}`,
      agent_instruction: instruction,
    })
  }

  return candidates
}

async function findLeadNurture(
  supabase: SupabaseClient,
  rule: AutomationRule
): Promise<QueueCandidate[]> {
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - rule.delay_hours)

  // Leads with status 'contacted' and score > 50, not updated since delay
  const { data: leads } = await supabase
    .from("leads")
    .select("lead_id, name, phone, job_type, score, updated_at")
    .eq("business_id", rule.business_id)
    .eq("status", "contacted")
    .gt("score", 50)
    .lt("updated_at", cutoff.toISOString())
    .limit(10)

  if (!leads || leads.length === 0) return []

  // Filter out already queued
  const leadIds = leads.map((l: any) => l.lead_id)
  const { data: existing } = await supabase
    .from("automation_queue")
    .select("target_id, attempt_number")
    .in("target_id", leadIds)
    .eq("rule_type", "lead_nurture")

  const attemptMap = new Map<string, number>()
  for (const e of existing || []) {
    const prev = attemptMap.get((e as any).target_id) || 0
    attemptMap.set((e as any).target_id, Math.max(prev, (e as any).attempt_number))
  }

  const candidates: QueueCandidate[] = []
  for (const lead of leads as any[]) {
    const prevAttempt = attemptMap.get(lead.lead_id) || 0
    if (prevAttempt >= rule.max_attempts) continue

    const instruction = (rule.message_template || "Följ upp lead {lead_id}")
      .replace("{lead_id}", lead.lead_id)
      .replace("{name}", lead.name || "kunden")
      .replace("{job_type}", lead.job_type || "deras förfrågan")
      .replace("{phone}", lead.phone || "")

    candidates.push({
      business_id: rule.business_id,
      rule_id: rule.rule_id,
      rule_type: "lead_nurture",
      target_id: lead.lead_id,
      target_type: "lead",
      customer_id: null,
      customer_name: lead.name,
      target_label: `${lead.name || "Okänd"} — ${lead.job_type || "Lead"} (score ${lead.score})`,
      agent_instruction: instruction,
    })
  }

  return candidates
}

async function findHotLeadAlerts(
  supabase: SupabaseClient,
  rule: AutomationRule
): Promise<QueueCandidate[]> {
  const cutoff = new Date()
  cutoff.setMinutes(cutoff.getMinutes() - 30) // Check last 30 minutes

  // Leads with urgency high/emergency, created recently
  const { data: leads } = await supabase
    .from("leads")
    .select("lead_id, name, phone, job_type, urgency, score")
    .eq("business_id", rule.business_id)
    .in("urgency", ["high", "emergency"])
    .eq("status", "new")
    .gt("created_at", cutoff.toISOString())
    .limit(5)

  if (!leads || leads.length === 0) return []

  // Filter out already alerted
  const leadIds = leads.map((l: any) => l.lead_id)
  const { data: existing } = await supabase
    .from("automation_queue")
    .select("target_id")
    .in("target_id", leadIds)
    .eq("rule_type", "lead_hot_alert")

  const existingSet = new Set((existing || []).map((e: any) => e.target_id))

  // Get business owner phone for alert
  const { data: bizConfig } = await supabase
    .from("business_config")
    .select("phone_number, contact_name")
    .eq("business_id", rule.business_id)
    .single()

  const candidates: QueueCandidate[] = []
  for (const lead of leads as any[]) {
    if (existingSet.has(lead.lead_id)) continue

    const instruction = (rule.message_template || "Het lead-alert")
      .replace("{name}", lead.name || "Okänd")
      .replace("{job_type}", lead.job_type || "jobb")
      .replace("{phone}", lead.phone || "okänt nummer")
      .replace("{owner_phone}", bizConfig?.phone_number || "")

    candidates.push({
      business_id: rule.business_id,
      rule_id: rule.rule_id,
      rule_type: "lead_hot_alert",
      target_id: lead.lead_id,
      target_type: "lead",
      customer_id: null,
      customer_name: lead.name,
      target_label: `HET LEAD: ${lead.name || "Okänd"} — ${lead.job_type || "Akut"} (${lead.urgency})`,
      agent_instruction: instruction,
    })
  }

  return candidates
}

// ── Main Orchestration ───────────────────────────────────

const FINDER_MAP: Record<
  string,
  (supabase: SupabaseClient, rule: AutomationRule) => Promise<QueueCandidate[]>
> = {
  quote_followup: findQuoteFollowups,
  booking_reminder: findBookingReminders,
  invoice_reminder: findInvoiceReminders,
  lead_response: findLeadResponses,
  project_complete: findProjectCompletes,
  lead_qualify: findLeadQualify,
  lead_nurture: findLeadNurture,
  lead_hot_alert: findHotLeadAlerts,
}

async function processAutomations(supabase: SupabaseClient): Promise<{
  businesses_scanned: number
  candidates_found: number
  queued: number
  executed: number
  skipped_night: number
}> {
  const results = {
    businesses_scanned: 0,
    candidates_found: 0,
    queued: 0,
    executed: 0,
    skipped_night: 0,
  }

  // Get all enabled rules grouped by business
  const { data: rules, error } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("enabled", true)
    .order("business_id")

  if (error || !rules || rules.length === 0) {
    console.log("[Automation] No enabled rules found")
    return results
  }

  // Group rules by business
  const rulesByBusiness = new Map<string, AutomationRule[]>()
  for (const rule of rules as AutomationRule[]) {
    const list = rulesByBusiness.get(rule.business_id) || []
    list.push(rule)
    rulesByBusiness.set(rule.business_id, list)
  }

  results.businesses_scanned = rulesByBusiness.size
  const nightBlock = isNightBlock()

  for (const [businessId, businessRules] of rulesByBusiness) {
    console.log(
      `[Automation] Business ${businessId}: ${businessRules.length} enabled rules`
    )

    for (const rule of businessRules) {
      const finder = FINDER_MAP[rule.rule_type]
      if (!finder) {
        console.warn(`[Automation] Unknown rule type: ${rule.rule_type}`)
        continue
      }

      try {
        const candidates = await finder(supabase, rule)
        results.candidates_found += candidates.length

        if (candidates.length === 0) continue

        console.log(
          `[Automation] ${rule.rule_type}: ${candidates.length} candidates for ${businessId}`
        )

        for (const candidate of candidates) {
          const queueId = generateId("aq")
          const now = new Date()

          // Insert into queue
          await supabase.from("automation_queue").insert({
            queue_id: queueId,
            business_id: candidate.business_id,
            rule_id: candidate.rule_id,
            rule_type: candidate.rule_type,
            target_id: candidate.target_id,
            target_type: candidate.target_type,
            customer_id: candidate.customer_id,
            customer_name: candidate.customer_name,
            target_label: candidate.target_label,
            scheduled_at: now.toISOString(),
            status: "pending",
            attempt_number: 1,
            agent_instruction: candidate.agent_instruction,
            created_at: now.toISOString(),
          })

          results.queued++

          // Night block — queue but don't execute
          if (nightBlock && (rule.channel === "sms" || rule.channel === "both")) {
            console.log(
              `[Automation] Skipping ${queueId} (night block, channel=${rule.channel})`
            )
            results.skipped_night++
            continue
          }

          // Trigger the agent
          try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!
            const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

            const agentResponse = await fetch(
              `${supabaseUrl}/functions/v1/agent`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${supabaseServiceKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  trigger_type: "cron",
                  business_id: candidate.business_id,
                  trigger_data: {
                    cron_type: candidate.rule_type,
                    instruction: candidate.agent_instruction,
                    target_id: candidate.target_id,
                    target_type: candidate.target_type,
                    queue_id: queueId,
                  },
                }),
              }
            )

            const agentResult = await agentResponse.json()

            // Update queue entry
            if (agentResponse.ok && agentResult.run_id) {
              await supabase
                .from("automation_queue")
                .update({
                  status: "executed",
                  executed_at: new Date().toISOString(),
                  agent_run_id: agentResult.run_id,
                })
                .eq("queue_id", queueId)

              results.executed++
              console.log(
                `[Automation] Executed ${queueId} → run ${agentResult.run_id}`
              )
            } else {
              await supabase
                .from("automation_queue")
                .update({
                  status: "failed",
                  executed_at: new Date().toISOString(),
                  error_message:
                    agentResult.error || `HTTP ${agentResponse.status}`,
                })
                .eq("queue_id", queueId)
            }
          } catch (agentErr) {
            console.error(
              `[Automation] Agent trigger failed for ${queueId}:`,
              agentErr
            )
            await supabase
              .from("automation_queue")
              .update({
                status: "failed",
                error_message:
                  agentErr instanceof Error
                    ? agentErr.message
                    : "Agent trigger failed",
              })
              .eq("queue_id", queueId)
          }
        }
      } catch (err) {
        console.error(
          `[Automation] Error processing ${rule.rule_type} for ${businessId}:`,
          err
        )
      }
    }
  }

  return results
}

// ── SMS Queue Processor ──────────────────────────────────
// Sends queued SMS (night-blocked) when send_after has passed

async function processSmsQueue(
  supabase: SupabaseClient
): Promise<{ sms_sent: number; sms_failed: number }> {
  const results = { sms_sent: 0, sms_failed: 0 }

  const { data: queued, error } = await supabase
    .from("sms_queue")
    .select("*")
    .eq("status", "queued")
    .lte("send_after", new Date().toISOString())
    .order("send_after", { ascending: true })
    .limit(50)

  if (error || !queued || queued.length === 0) return results

  const elksUser = Deno.env.get("ELKS_API_USER")
  const elksPassword = Deno.env.get("ELKS_API_PASSWORD")
  if (!elksUser || !elksPassword) {
    console.error("[SmsQueue] Missing ELKS_API_USER or ELKS_API_PASSWORD secrets")
    return results
  }

  console.log(`[SmsQueue] Processing ${queued.length} queued SMS`)

  for (const sms of queued as any[]) {
    try {
      const response = await fetch("https://api.46elks.com/a1/sms", {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${elksUser}:${elksPassword}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          from: sms.sender_name,
          to: sms.phone_to,
          message: sms.message,
        }),
      })

      const elksResult = await response.json()

      if (response.ok) {
        await supabase
          .from("sms_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("queue_id", sms.queue_id)

        // Log to sms_log
        await supabase.from("sms_log").insert({
          sms_id: "sms_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12),
          business_id: sms.business_id,
          direction: "outbound",
          phone_from: sms.sender_name,
          phone_to: sms.phone_to,
          message: sms.message,
          status: "sent",
          elks_id: elksResult.id,
          created_at: new Date().toISOString(),
        }).catch(() => {})

        // Log to sms_conversation for history
        await supabase.from("sms_conversation").insert({
          business_id: sms.business_id,
          phone_number: sms.phone_to,
          role: "assistant",
          content: sms.message,
          created_at: new Date().toISOString(),
        }).catch(() => {})

        results.sms_sent++
        console.log(`[SmsQueue] Sent ${sms.queue_id} → ${sms.phone_to}`)
      } else {
        const errMsg = elksResult.message || `HTTP ${response.status}`
        await supabase
          .from("sms_queue")
          .update({ status: "failed", error_message: errMsg, sent_at: new Date().toISOString() })
          .eq("queue_id", sms.queue_id)

        results.sms_failed++
        console.error(`[SmsQueue] Failed ${sms.queue_id}: ${errMsg}`)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Send failed"
      await supabase
        .from("sms_queue")
        .update({ status: "failed", error_message: errMsg })
        .eq("queue_id", sms.queue_id)

      results.sms_failed++
      console.error(`[SmsQueue] Error ${sms.queue_id}:`, err)
    }
  }

  return results
}

// ── Daily Summary (Morning Report) ──────────────────────

async function processDailySummary(
  supabase: SupabaseClient
): Promise<{ daily_summaries_triggered: number }> {
  const results = { daily_summaries_triggered: 0 }

  // Only run between 06:00–07:00 Swedish time
  const now = new Date()
  const swedenHour = parseInt(
    new Intl.DateTimeFormat("sv-SE", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/Stockholm",
    }).format(now)
  )
  if (swedenHour < 6 || swedenHour >= 7) return results

  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now) // "YYYY-MM-DD"

  // Find businesses with daily_summary automation enabled
  const { data: rules } = await supabase
    .from("automation_rules")
    .select("rule_id, business_id, message_template, channel")
    .eq("rule_type", "daily_summary")
    .eq("enabled", true)

  if (!rules || rules.length === 0) return results

  for (const rule of rules as any[]) {
    const idempotencyKey = `daily_summary::${rule.business_id}::${today}`

    // Check if already triggered today
    const { data: existing } = await supabase
      .from("automation_queue")
      .select("queue_id")
      .eq("target_id", idempotencyKey)
      .eq("rule_type", "daily_summary")
      .single()

    if (existing) continue

    // Get business config for contact info
    const { data: bizConfig } = await supabase
      .from("business_config")
      .select("phone_number, contact_email, business_name")
      .eq("business_id", rule.business_id)
      .single()

    if (!bizConfig) continue

    const instruction =
      `Kör morgonrapport för ${today}. ` +
      `Använd get_daily_stats för att hämta gårdagens statistik. ` +
      `Skicka en kort SMS-sammanfattning (max 160 tecken, nyckeltal) till ${bizConfig.phone_number || "ägarens telefonnummer"}. ` +
      (bizConfig.contact_email
        ? `Skicka även en utförlig rapport via email till ${bizConfig.contact_email} med ämne "Morgonrapport ${today} — ${bizConfig.business_name}".`
        : "")

    // Queue it
    const queueId = generateId("aq")
    await supabase.from("automation_queue").insert({
      queue_id: queueId,
      business_id: rule.business_id,
      rule_id: rule.rule_id,
      rule_type: "daily_summary",
      target_id: idempotencyKey,
      target_type: "report",
      customer_id: null,
      customer_name: null,
      target_label: `Morgonrapport ${today}`,
      scheduled_at: now.toISOString(),
      status: "pending",
      attempt_number: 1,
      agent_instruction: instruction,
      created_at: now.toISOString(),
    })

    // Trigger the agent
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

      const agentResponse = await fetch(
        `${supabaseUrl}/functions/v1/agent`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            trigger_type: "cron",
            business_id: rule.business_id,
            trigger_data: {
              cron_type: "daily_summary",
              instruction,
              target_id: idempotencyKey,
              target_type: "report",
              queue_id: queueId,
            },
          }),
        }
      )

      const agentResult = await agentResponse.json()

      if (agentResponse.ok && agentResult.run_id) {
        await supabase
          .from("automation_queue")
          .update({
            status: "executed",
            executed_at: new Date().toISOString(),
            agent_run_id: agentResult.run_id,
          })
          .eq("queue_id", queueId)

        results.daily_summaries_triggered++
        console.log(
          `[DailySummary] Triggered for ${rule.business_id} → run ${agentResult.run_id}`
        )
      } else {
        await supabase
          .from("automation_queue")
          .update({
            status: "failed",
            executed_at: new Date().toISOString(),
            error_message: agentResult.error || `HTTP ${agentResponse.status}`,
          })
          .eq("queue_id", queueId)
      }
    } catch (err) {
      console.error(`[DailySummary] Error for ${rule.business_id}:`, err)
      await supabase
        .from("automation_queue")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Trigger failed",
        })
        .eq("queue_id", queueId)
    }
  }

  return results
}

// ── Edge Function Handler ────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const startTime = Date.now()
  console.log("[Automation] Starting scheduled trigger scan...")

  try {
    const results = await processAutomations(supabase)
    const smsQueueResults = await processSmsQueue(supabase)
    const dailySummaryResults = await processDailySummary(supabase)
    const durationMs = Date.now() - startTime

    console.log(
      `[Automation] Complete in ${durationMs}ms:`,
      JSON.stringify({ ...results, ...smsQueueResults, ...dailySummaryResults })
    )

    return new Response(
      JSON.stringify({
        ...results,
        ...smsQueueResults,
        ...dailySummaryResults,
        duration_ms: durationMs,
        night_block: isNightBlock(),
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  } catch (err) {
    console.error("[Automation] Fatal error:", err)
    return new Response(
      JSON.stringify({
        error:
          err instanceof Error ? err.message : "Automation processing failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
