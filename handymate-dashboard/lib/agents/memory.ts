/**
 * V21 DEL 2 — Agent Memory Pipeline
 *
 * Efter varje agent-körning:
 * 1. Extrahera lärdom via Claude Haiku
 * 2. Generera embedding (mock om API saknas)
 * 3. Spara i agent_memories
 *
 * Före varje körning:
 * 1. Hämta top-5 relevanta minnen via cosine similarity
 * 2. Injicera i systemprompt
 */

import { getServerSupabase } from '@/lib/supabase'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

// ── Extract memory from agent run ──

export async function extractAndSaveMemory(
  businessId: string,
  agentId: string,
  finalResponse: string,
  triggerType: string,
  triggerData: Record<string, unknown>
): Promise<void> {
  if (!finalResponse || finalResponse.length < 30) return
  if (!process.env.ANTHROPIC_API_KEY) return

  try {
    // 1. Extract a learning using Haiku
    const extractionRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Baserat på denna agent-körning, vad är en viktig lärdom om detta företag eller kund? Svara med exakt 1 mening på svenska. Om inget värdefullt — svara "INGEN".

Trigger: ${triggerType}
Kontext: ${JSON.stringify(triggerData).slice(0, 300)}
Agentens svar: ${finalResponse.slice(0, 500)}`
        }],
      }),
    })

    if (!extractionRes.ok) return

    const extraction = await extractionRes.json()
    const memoryContent = extraction.content?.[0]?.text?.trim()

    if (!memoryContent || memoryContent === 'INGEN' || memoryContent.length < 10) return

    // 2. Determine memory type
    const memoryType = classifyMemoryType(memoryContent, triggerType)

    // 3. Generate embedding (mock for now — Anthropic doesn't have embeddings API yet)
    const embedding = await generateEmbedding(memoryContent)

    // 4. Save to agent_memories
    const supabase = getServerSupabase()

    // Check for duplicate/similar memories
    const { data: existing } = await supabase
      .from('agent_memories')
      .select('id, content, access_count')
      .eq('business_id', businessId)
      .eq('agent_id', agentId)
      .ilike('content', `%${memoryContent.slice(0, 50)}%`)
      .limit(1)

    if (existing && existing.length > 0) {
      // Update access count instead of duplicating
      await supabase
        .from('agent_memories')
        .update({
          access_count: (existing[0].access_count || 0) + 1,
          last_accessed_at: new Date().toISOString(),
          importance_score: Math.min(1.0, 0.5 + (existing[0].access_count || 0) * 0.1),
        })
        .eq('id', existing[0].id)
      return
    }

    await supabase.from('agent_memories').insert({
      business_id: businessId,
      agent_id: agentId,
      memory_type: memoryType,
      content: memoryContent,
      embedding: embedding,
      importance_score: calculateImportance(triggerType, memoryContent),
    })
  } catch (err) {
    console.error('[agent-memory] Failed to extract/save memory:', err)
  }
}

// ── Retrieve relevant memories ──

export async function getRelevantMemories(
  businessId: string,
  agentId: string,
  context?: string
): Promise<string[]> {
  const supabase = getServerSupabase()

  // Simple approach: get most recent + highest importance memories for this agent
  // Full vector search requires embedding the query — use importance-based for now
  const { data: memories } = await supabase
    .from('agent_memories')
    .select('id, content, importance_score, memory_type, access_count')
    .eq('business_id', businessId)
    .or(`agent_id.eq.${agentId},agent_id.eq.matte`) // Include Matte's shared knowledge
    .order('importance_score', { ascending: false })
    .limit(5)

  if (!memories || memories.length === 0) return []

  // Update last_accessed_at
  const ids = memories.map((m: any) => m.id)
  await supabase
    .from('agent_memories')
    .update({ last_accessed_at: new Date().toISOString() })
    .in('id', ids)

  return memories.map((m: any) => m.content)
}

/**
 * Build prompt injection for agent memories
 */
export function buildMemoryPrompt(memories: string[]): string {
  if (memories.length === 0) return ''

  return `

=== Vad du vet om detta företag ===
${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}
=== Slut på minnen ===
Använd dessa lärdomar när du fattar beslut. Uppdatera inte minnen — fokusera på uppgiften.`
}

// ── Inter-agent messages ──

export async function sendAgentMessage(
  businessId: string,
  fromAgent: string,
  toAgent: string,
  messageType: 'request' | 'insight' | 'alert' | 'handoff',
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = getServerSupabase()

  await supabase.from('agent_messages').insert({
    business_id: businessId,
    from_agent: fromAgent,
    to_agent: toAgent,
    message_type: messageType,
    content,
    metadata: metadata || {},
  })
}

export async function getAgentMessages(
  businessId: string,
  agentId: string,
  limit = 5
): Promise<Array<{ from_agent: string; message_type: string; content: string; created_at: string }>> {
  const supabase = getServerSupabase()

  const { data } = await supabase
    .from('agent_messages')
    .select('id, from_agent, message_type, content, created_at')
    .eq('business_id', businessId)
    .eq('to_agent', agentId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)

  // Mark as read
  if (data && data.length > 0) {
    await supabase
      .from('agent_messages')
      .update({ status: 'read' })
      .in('id', data.map((m: any) => m.id))
  }

  return data || []
}

/**
 * Build prompt injection for pending agent messages
 */
export function buildMessagesPrompt(
  messages: Array<{ from_agent: string; message_type: string; content: string }>
): string {
  if (messages.length === 0) return ''

  const agentNames: Record<string, string> = {
    matte: 'Matte (chef)',
    karin: 'Karin (ekonom)',
    hanna: 'Hanna (marknad)',
    daniel: 'Daniel (sälj)',
    lars: 'Lars (projekt)',
  }

  return `

=== Meddelanden från kollegor ===
${messages.map(m => `${agentNames[m.from_agent] || m.from_agent}: ${m.content}`).join('\n')}
=== Slut på meddelanden ===
Agera på relevanta meddelanden. Du kan skicka svar via send_agent_message.`
}

// ── Helpers ──

function classifyMemoryType(content: string, triggerType: string): string {
  const lower = content.toLowerCase()
  if (lower.includes('föredrar') || lower.includes('vill ha') || lower.includes('gillar')) return 'preference'
  if (lower.includes('brukar') || lower.includes('tenderar') || lower.includes('mönster')) return 'pattern'
  if (lower.includes('har ') || lower.includes('är ') || lower.includes('finns')) return 'fact'
  return 'observation'
}

function calculateImportance(triggerType: string, content: string): number {
  let score = 0.5
  if (triggerType === 'phone_call') score += 0.2 // Phone calls are high-signal
  if (triggerType === 'manual') score += 0.1
  if (content.toLowerCase().includes('viktigt') || content.toLowerCase().includes('kritisk')) score += 0.15
  if (content.length > 100) score += 0.05
  return Math.min(1.0, score)
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  // Anthropic doesn't have an embeddings API — use null for now
  // When available, replace with real embedding call
  // For vector search, could use OpenAI ada-002 or similar
  return null
}
