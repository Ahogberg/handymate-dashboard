// Pipeline tools — lead qualification and management
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

function generateId(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let id = prefix + "_"
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

export async function qualifyLead(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    conversation_id: string
    phone?: string
    name?: string
    source?: string
  }
): Promise<ToolResult> {
  console.log(`[Tool] qualify_lead: conversation ${params.conversation_id}`)

  // Fetch the conversation/recording
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("business_id", businessId)
    .eq("conversation_id", params.conversation_id)
    .single()

  // Also check call_recording if not found in conversations
  let transcript = conversation?.content || ""
  let phone = params.phone || conversation?.phone_number || ""
  let contactName = params.name || ""
  let source = params.source || "manual"

  if (!transcript) {
    const { data: recording } = await supabase
      .from("call_recording")
      .select("*")
      .eq("business_id", businessId)
      .eq("recording_id", params.conversation_id)
      .single()

    if (recording) {
      transcript = recording.transcript || recording.transcript_summary || ""
      phone = phone || recording.phone_from || recording.phone_to || ""
      source = "vapi_call"
    }
  }

  if (!transcript) {
    return {
      success: false,
      error: "Ingen transkription hittades för detta samtal",
    }
  }

  // Fetch scoring rules
  const { data: rules } = await supabase
    .from("lead_scoring_rules")
    .select("*")
    .eq("business_id", businessId)
    .eq("enabled", true)

  // Check if lead already exists for this conversation
  const { data: existingLead } = await supabase
    .from("leads")
    .select("lead_id, score")
    .eq("business_id", businessId)
    .eq("conversation_id", params.conversation_id)
    .single()

  // Use Claude to analyze the conversation
  // We return the analysis data and let the agent orchestrator handle it
  // The agent should call this tool and use the result to create/update the lead

  // Basic scoring from transcript analysis
  const scoreReasons: Array<{ rule: string; points: number; matched: boolean }> = []
  let score = 0

  const lowerTranscript = transcript.toLowerCase()

  for (const rule of (rules || []) as any[]) {
    const condition = rule.condition?.type || ""
    let matched = false

    switch (condition) {
      case "answered_call":
        matched = transcript.length > 50
        break
      case "specific_job":
        matched = /installera|reparera|byta|montera|fixa|laga|bygga|renovera|måla|dra om|elsäkerhet|jordfelsbrytare/i.test(
          lowerTranscript
        )
        break
      case "urgency_mentioned":
        matched = /akut|bråttom|snabbt|omedelbart|idag|imorgon|snarast|nödfall|läcker|kortslut/i.test(
          lowerTranscript
        )
        break
      case "in_service_area":
        matched = /adress|gata|väg|plats|området|stockholm|göteborg|malmö/i.test(
          lowerTranscript
        )
        break
      case "returning_customer":
        if (phone) {
          const { data: existingCust } = await supabase
            .from("customer")
            .select("customer_id")
            .eq("business_id", businessId)
            .eq("phone_number", phone)
            .single()
          matched = !!existingCust
        }
        break
      case "budget_mentioned":
        matched = /budget|pris|kosta|kronor|kr|tusen|lapp/i.test(lowerTranscript)
        break
      case "unclear_request":
        matched = transcript.length < 30 && !/installera|reparera|byta|fixa/i.test(lowerTranscript)
        break
    }

    scoreReasons.push({
      rule: rule.rule_name,
      points: rule.points,
      matched,
    })
    if (matched) score += rule.points
  }

  // Clamp score 0-100
  score = Math.max(0, Math.min(100, score))

  // Determine urgency from transcript
  let urgency: "low" | "medium" | "high" | "emergency" = "medium"
  if (/nödfall|akut omedelbart|kortslut|läcker svårt|brand/i.test(lowerTranscript)) {
    urgency = "emergency"
  } else if (/akut|bråttom|idag|snarast/i.test(lowerTranscript)) {
    urgency = "high"
  } else if (/nästa vecka|snart|inom kort/i.test(lowerTranscript)) {
    urgency = "medium"
  } else if (/ingen brådska|när som helst|framöver/i.test(lowerTranscript)) {
    urgency = "low"
  }

  // Extract job type (basic)
  let jobType = "Okänt"
  const jobPatterns: Array<[RegExp, string]> = [
    [/elinstallation|elarbete|elsäkerhet|jordfelsbrytare|elcentral/i, "Elinstallation"],
    [/rör|vatten|avlopp|läck|kran|toalett|vvs/i, "VVS/Rörarbete"],
    [/snickeri|bygga|renovera|tillbyggnad|kök|badrum/i, "Renovering"],
    [/målning|måla|tapetser/i, "Målning"],
    [/lås|inbrott|säkerhet/i, "Låssmed"],
    [/städ|flytt|rengör/i, "Städning"],
    [/värme|kyla|ventilation|ac|värmepump/i, "VVS/Värme"],
  ]
  for (const [pattern, type] of jobPatterns) {
    if (pattern.test(lowerTranscript)) {
      jobType = type
      break
    }
  }

  // Estimate value (rough)
  let estimatedValue: number | null = null
  const priceMatch = lowerTranscript.match(/(\d+)\s*(tusen|tkr|000\s*kr)/i)
  if (priceMatch) {
    estimatedValue = parseInt(priceMatch[1]) * 1000
  }

  const now = new Date().toISOString()

  if (existingLead) {
    // Update existing lead
    await supabase
      .from("leads")
      .update({
        score,
        score_reasons: scoreReasons.filter((r) => r.matched),
        urgency,
        job_type: jobType,
        estimated_value: estimatedValue,
        updated_at: now,
      })
      .eq("lead_id", existingLead.lead_id)

    // Log activity
    await supabase.from("lead_activities").insert({
      activity_id: generateId("la"),
      lead_id: existingLead.lead_id,
      business_id: businessId,
      activity_type: "score_updated",
      description: `Lead kvalificerad: score ${score}, urgency ${urgency}, jobbtyp ${jobType}`,
      metadata: { score, urgency, job_type: jobType, score_reasons: scoreReasons },
      created_at: now,
    })

    return {
      success: true,
      data: {
        lead_id: existingLead.lead_id,
        action: "updated",
        score,
        urgency,
        job_type: jobType,
        estimated_value: estimatedValue,
        score_reasons: scoreReasons.filter((r) => r.matched),
      },
    }
  }

  // Create new lead
  const leadId = generateId("lead")
  const { error } = await supabase.from("leads").insert({
    lead_id: leadId,
    business_id: businessId,
    phone,
    name: contactName || null,
    source,
    status: "new",
    score,
    score_reasons: scoreReasons.filter((r) => r.matched),
    estimated_value: estimatedValue,
    job_type: jobType,
    urgency,
    conversation_id: params.conversation_id,
    created_at: now,
    updated_at: now,
  })

  if (error) {
    return { success: false, error: `Kunde inte skapa lead: ${error.message}` }
  }

  // Log activity
  await supabase.from("lead_activities").insert({
    activity_id: generateId("la"),
    lead_id: leadId,
    business_id: businessId,
    activity_type: "created",
    description: `Ny lead skapad: ${contactName || phone || "Okänd"}, score ${score}, ${jobType}`,
    metadata: { score, urgency, job_type: jobType, source },
    created_at: now,
  })

  return {
    success: true,
    data: {
      lead_id: leadId,
      action: "created",
      score,
      urgency,
      job_type: jobType,
      estimated_value: estimatedValue,
      score_reasons: scoreReasons.filter((r) => r.matched),
      message: `Lead skapad: ${contactName || phone || "Okänd"} (score ${score}, ${urgency} urgency)`,
    },
  }
}

export async function updateLeadStatus(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    lead_id: string
    status: string
    lost_reason?: string
    notes?: string
    customer_id?: string
  }
): Promise<ToolResult> {
  console.log(`[Tool] update_lead_status: ${params.lead_id} → ${params.status}`)

  const updates: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
  }

  if (params.lost_reason) updates.lost_reason = params.lost_reason
  if (params.notes) updates.notes = params.notes
  if (params.customer_id) updates.customer_id = params.customer_id
  if (params.status === "won") updates.converted_at = new Date().toISOString()

  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("lead_id", params.lead_id)
    .eq("business_id", businessId)
    .select()
    .single()

  if (error) {
    return { success: false, error: `Kunde inte uppdatera lead: ${error.message}` }
  }

  // Log activity
  await supabase.from("lead_activities").insert({
    activity_id: generateId("la"),
    lead_id: params.lead_id,
    business_id: businessId,
    activity_type: "status_changed",
    description: `Status ändrad till ${params.status}${params.lost_reason ? ` (${params.lost_reason})` : ""}`,
    metadata: { new_status: params.status, lost_reason: params.lost_reason },
    created_at: new Date().toISOString(),
  })

  return {
    success: true,
    data: {
      message: `Lead uppdaterad till status "${params.status}"`,
      lead: data,
    },
  }
}

export async function getLead(
  supabase: SupabaseClient,
  businessId: string,
  params: { lead_id: string }
): Promise<ToolResult> {
  console.log(`[Tool] get_lead: ${params.lead_id}`)

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("lead_id", params.lead_id)
    .eq("business_id", businessId)
    .single()

  if (error) {
    return { success: false, error: `Lead hittades inte: ${error.message}` }
  }

  // Fetch activities
  const { data: activities } = await supabase
    .from("lead_activities")
    .select("*")
    .eq("lead_id", params.lead_id)
    .order("created_at", { ascending: false })
    .limit(20)

  // Fetch linked customer if exists
  let customer = null
  if (lead.customer_id) {
    const { data: cust } = await supabase
      .from("customer")
      .select("customer_id, name, phone_number, email, address_line")
      .eq("customer_id", lead.customer_id)
      .single()
    customer = cust
  }

  return {
    success: true,
    data: {
      ...lead,
      activities: activities || [],
      customer,
    },
  }
}

export async function searchLeads(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    status?: string
    urgency?: string
    min_score?: number
    max_score?: number
    job_type?: string
    from_date?: string
    to_date?: string
    limit?: number
  }
): Promise<ToolResult> {
  console.log(`[Tool] search_leads: ${JSON.stringify(params)}`)

  let query = supabase
    .from("leads")
    .select("lead_id, name, phone, status, score, urgency, job_type, estimated_value, created_at, updated_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(params.limit || 20)

  if (params.status) query = query.eq("status", params.status)
  if (params.urgency) query = query.eq("urgency", params.urgency)
  if (params.min_score !== undefined) query = query.gte("score", params.min_score)
  if (params.max_score !== undefined) query = query.lte("score", params.max_score)
  if (params.job_type) query = query.ilike("job_type", `%${params.job_type}%`)
  if (params.from_date) query = query.gte("created_at", `${params.from_date}T00:00:00`)
  if (params.to_date) query = query.lte("created_at", `${params.to_date}T23:59:59`)

  const { data, error } = await query

  if (error) {
    return { success: false, error: `Sökning misslyckades: ${error.message}` }
  }

  return {
    success: true,
    data: {
      count: data.length,
      leads: data,
    },
  }
}
