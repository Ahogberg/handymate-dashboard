/**
 * Agent handoff — när en agent får en fråga utanför sitt expertområde
 * eskalerar den till rätt agent. Den nya agenten svarar i samma response
 * så användaren ser hela kedjan.
 *
 * Datamodell:
 *   agent_threads — pågående konversation, har current_agent_id
 *   agent_handoffs — audit per handoff (from, to, reason, context)
 *
 * Loop-skydd: max 3 handoffs per thread. Om gränsen nås faller vi tillbaka
 * till nuvarande agent och loggar varningen.
 */

import { createClient } from '@supabase/supabase-js'
import { AGENT_CAPABILITIES, canHandoff, isValidAgentId, type AgentId } from './capabilities'

export const MAX_HANDOFFS_PER_THREAD = 3

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface AgentThread {
  id: string
  business_id: string
  customer_id: string | null
  project_id: string | null
  current_agent_id: AgentId
  context_summary: string | null
  handoff_count: number
  last_message_at: string
  created_at: string
}

export interface HandoffAttemptResult {
  /** True om handoff godkändes och utfördes (DB-rad i agent_handoffs skapad). */
  ok: boolean
  /** Aktuell agent EFTER försöket — antingen target_agent (på success) eller from_agent (om refused). */
  current_agent: AgentId
  /** Varför handoff:en avvisades, om ok=false. */
  refused_reason?: 'invalid_target' | 'not_allowed' | 'max_handoffs_reached' | 'self_handoff'
}

/**
 * Hämta eller skapa en agent_thread för (business_id, customer_id) eller
 * (business_id, project_id). Default current_agent = 'matte' vid ny tråd.
 */
export async function getOrCreateThread(opts: {
  businessId: string
  customerId?: string | null
  projectId?: string | null
}): Promise<AgentThread> {
  const supabase = getSupabase()
  const { businessId, customerId, projectId } = opts

  // Första: hitta existerande aktiv tråd. Vi prioriterar customer_id-matchning;
  // project_id-matchning används bara om ingen customer-tråd finns.
  let query = supabase
    .from('agent_threads')
    .select('*')
    .eq('business_id', businessId)
    .order('last_message_at', { ascending: false })
    .limit(1)

  if (customerId) {
    query = query.eq('customer_id', customerId)
  } else if (projectId) {
    query = query.eq('project_id', projectId)
  } else {
    // Ingen kontext alls — skapa ny tråd, vi slår inte ihop dessa
    return await createThread(businessId, null, null)
  }

  const { data: existing } = await query.maybeSingle()
  if (existing) return existing as AgentThread

  return await createThread(businessId, customerId || null, projectId || null)
}

async function createThread(
  businessId: string,
  customerId: string | null,
  projectId: string | null
): Promise<AgentThread> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('agent_threads')
    .insert({
      business_id: businessId,
      customer_id: customerId,
      project_id: projectId,
      current_agent_id: 'matte',
      handoff_count: 0,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`Kunde inte skapa agent_thread: ${error?.message || 'okänt fel'}`)
  }
  return data as AgentThread
}

/**
 * Försök utföra en handoff. Verifierar att target är giltig och tillåten,
 * att max-loop inte överskrids, och loggar resultatet.
 *
 * Vid success:
 *   - agent_threads.current_agent_id sätts till target
 *   - agent_threads.handoff_count++
 *   - agent_threads.context_summary uppdateras
 *   - rad i agent_handoffs skapas
 *
 * Vid avvisning: ingen DB-ändring, returnera reason.
 */
export async function executeHandoff(opts: {
  thread: AgentThread
  fromAgent: AgentId
  toAgent: AgentId | string
  reason: string
  contextSummary?: string
}): Promise<HandoffAttemptResult> {
  const { thread, fromAgent, reason, contextSummary } = opts
  const target = opts.toAgent

  // Validera target finns
  if (!isValidAgentId(target)) {
    return { ok: false, current_agent: fromAgent, refused_reason: 'invalid_target' }
  }

  if (target === fromAgent) {
    return { ok: false, current_agent: fromAgent, refused_reason: 'self_handoff' }
  }

  if (!canHandoff(fromAgent, target)) {
    return { ok: false, current_agent: fromAgent, refused_reason: 'not_allowed' }
  }

  if ((thread.handoff_count || 0) >= MAX_HANDOFFS_PER_THREAD) {
    console.warn(`[handoff] max-loop reached on thread ${thread.id}, refusing handoff ${fromAgent}→${target}`)
    return { ok: false, current_agent: fromAgent, refused_reason: 'max_handoffs_reached' }
  }

  const supabase = getSupabase()

  // Logga handoff (audit)
  await supabase.from('agent_handoffs').insert({
    thread_id: thread.id,
    from_agent: fromAgent,
    to_agent: target,
    reason,
    context_summary: contextSummary || null,
  })

  // Uppdatera tråd
  await supabase
    .from('agent_threads')
    .update({
      current_agent_id: target,
      handoff_count: (thread.handoff_count || 0) + 1,
      context_summary: contextSummary || thread.context_summary || null,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', thread.id)

  return { ok: true, current_agent: target }
}

/**
 * Bygger ett kort, transparent handoff-meddelande från avgående agent
 * ("Bra fråga om priset — jag lämnar den till Karin"). Används av chat-
 * endpointet för att visa handoff för användaren utan att blanda in modellen.
 *
 * Hålls medvetet kort och regelbaserat — inte ett LLM-anrop.
 */
export function buildHandoffAnnouncement(fromAgent: AgentId, toAgent: AgentId, reason?: string): string {
  const fromName = AGENT_CAPABILITIES[fromAgent]?.name || fromAgent
  const toName = AGENT_CAPABILITIES[toAgent]?.name || toAgent
  // Tonen ska låta som om avgående agent säger det. Ej "Hej, det här är Lars."
  const reasonClause = reason && reason.trim() ? ` (${reason.trim().replace(/[.!?]+$/, '')})` : ''
  return `Det där är inget jag hanterar bäst${reasonClause} — jag lämnar över till ${toName}.`
}

/** Hämta en specifik tråd (utan att skapa ny). */
export async function getThread(threadId: string): Promise<AgentThread | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('agent_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle()
  return (data as AgentThread) || null
}

/** Uppdatera last_message_at — bör anropas vid varje meddelande på tråden. */
export async function touchThread(threadId: string): Promise<void> {
  const supabase = getSupabase()
  await supabase
    .from('agent_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', threadId)
}
