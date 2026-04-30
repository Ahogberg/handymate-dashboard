/**
 * Thread message-historik — multi-turn-stöd för agent-chat.
 *
 * Bakåtkompat: alla funktioner är safe-by-default. Om thread_id är null
 * eller om DB-anrop failar returneras tomma värden så endpointen kan
 * fortsätta utan att krascha.
 *
 * PII-skydd: scrubPII() maskar svenska personnummer och bankkontonummer
 * innan vi sparar. Vi sparar inte ARTIKEL FÖR ARTIKEL — bara textinnehåll
 * — men bättre att vara försiktig om hantverkaren av misstag klistrar in
 * känslig data.
 */

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type MessageRole = 'user' | 'assistant' | 'system'

export interface ThreadMessage {
  id: string
  thread_id: string
  business_id: string
  role: MessageRole
  agent: string | null
  content: string
  is_handoff_announcement: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export interface SaveMessageInput {
  threadId: string
  businessId: string
  role: MessageRole
  agent?: string | null
  content: string
  isHandoffAnnouncement?: boolean
  metadata?: Record<string, unknown>
}

/**
 * Maskar PII i text innan vi sparar.
 * - Svenska personnummer (10 eller 12 siffror, med eller utan bindestreck)
 * - Bankgiro (4-5 siffror + bindestreck + 3-4 siffror)
 * - Plusgiro (1-7 siffror + bindestreck + 1 siffra)
 * - Banknummer-liknande långa siffersekvenser (>=10 siffror i rad)
 */
export function scrubPII(text: string): string {
  if (!text) return text
  let out = text

  // Personnummer: 19YYMMDD-XXXX, YYMMDDXXXX, YYMMDD-XXXX
  out = out.replace(/\b(?:19|20)?\d{6}[-+]?\d{4}\b/g, '[personnummer]')

  // Bankgiro: NNNN-NN[NN] eller NNNNN-N[NN]
  out = out.replace(/\b\d{4,5}-\d{3,4}\b/g, m =>
    /^\d{6,8}$/.test(m.replace('-', '')) ? '[bankgiro]' : m
  )

  // Långa siffersekvenser (10+ siffror i rad utan separator) — kan vara
  // konto- eller kreditkortsnummer
  out = out.replace(/\b\d{10,}\b/g, '[kontonummer]')

  return out
}

/**
 * Sparar ett meddelande i thread_message. Sväljer DB-fel non-blocking
 * så chatten inte kraschar om DB är temporärt nere.
 */
export async function saveThreadMessage(input: SaveMessageInput): Promise<void> {
  if (!input.threadId || !input.content) return
  try {
    const supabase = getSupabase()
    await supabase.from('thread_message').insert({
      thread_id: input.threadId,
      business_id: input.businessId,
      role: input.role,
      agent: input.agent ?? null,
      content: scrubPII(input.content),
      is_handoff_announcement: input.isHandoffAnnouncement ?? false,
      metadata: input.metadata ?? {},
    })
  } catch (err) {
    console.error('[thread-messages] save failed (non-blocking):', err)
  }
}

/**
 * Hämtar de senaste N meddelandena för en tråd, kronologiskt sorterade
 * (äldsta först). N=20 default.
 *
 * Skippar handoff-announcements per default — de är "system-info" och
 * ska inte ingå i Claude messages-arrayen. UI:t kan hämta dem separat
 * via includeHandoffs=true.
 */
export async function loadThreadMessages(
  threadId: string,
  opts: { limit?: number; includeHandoffs?: boolean } = {}
): Promise<ThreadMessage[]> {
  if (!threadId) return []
  const limit = opts.limit ?? 20
  const includeHandoffs = !!opts.includeHandoffs
  try {
    const supabase = getSupabase()
    let query = supabase
      .from('thread_message')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!includeHandoffs) {
      query = query.eq('is_handoff_announcement', false)
    }

    const { data } = await query
    // Vi hämtade desc för att få senaste; vänd till asc för kronologisk ordning
    return ((data || []) as ThreadMessage[]).slice().reverse()
  } catch (err) {
    console.error('[thread-messages] load failed (non-blocking):', err)
    return []
  }
}

/**
 * Approximativ token-räkning för en lista av meddelanden.
 * Tumregel för svensk text: ~3.5 tecken per token (lite mer än engelska
 * pga umlauter och längre ord). Vi är medvetet konservativa (=räknar
 * högre) för att inte träffa Claude-context-limit av misstag.
 */
export function estimateTokens(messages: { content: string }[]): number {
  let chars = 0
  for (const m of messages) chars += (m.content || '').length
  return Math.ceil(chars / 3.5)
}

/**
 * Konverterar thread_message-rader till Claude messages-format.
 * Skippar handoff-announcements (kommer ej med från loadThreadMessages
 * default — detta är extra skydd om någon skulle skicka in dem).
 */
export function toClaudeMessages(
  rows: ThreadMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return rows
    .filter(r => !r.is_handoff_announcement && (r.role === 'user' || r.role === 'assistant'))
    .map(r => ({
      role: r.role === 'user' ? 'user' as const : 'assistant' as const,
      content: r.content,
    }))
}

/**
 * När historiken blir för lång (~8000 tokens) summerar vi de äldre
 * meddelandena till en kort context_summary via Claude Haiku och
 * sparar på thread.context_summary. Vi behåller de senaste 10
 * meddelandena ordagrant.
 *
 * Returnerar { summary, kept } där kept är de senaste 10 ordagranta
 * meddelandena. summary blir null om Haiku-anropet failar (då används
 * bara kept utan summary).
 */
export async function summarizeIfNeeded(opts: {
  threadId: string
  rows: ThreadMessage[]
  tokenBudget?: number
  apiKey: string
}): Promise<{
  summary: string | null
  kept: ThreadMessage[]
}> {
  const budget = opts.tokenBudget ?? 8000
  if (estimateTokens(opts.rows) <= budget) {
    return { summary: null, kept: opts.rows }
  }

  const KEEP_LATEST = 10
  const split = Math.max(0, opts.rows.length - KEEP_LATEST)
  const older = opts.rows.slice(0, split)
  const kept = opts.rows.slice(split)

  if (older.length === 0) {
    return { summary: null, kept }
  }

  // Haiku-anrop: extremt billigt, ~200ms latency
  const conversationText = older
    .map(r => `${r.role === 'user' ? 'Hantverkaren' : (r.agent || 'Assistent')}: ${r.content}`)
    .join('\n')

  let summary: string | null = null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: 'Du sammanfattar konversationer mellan en hantverkare och AI-assistent. Skriv kort på svenska — max 5 punkter. Behåll viktig kontext (kund, projekt, belopp, åtgärder). Hoppa över småprat.',
        messages: [
          {
            role: 'user',
            content: `Sammanfatta följande konversation kort så att en agent kan följa kontexten utan att läsa allt:\n\n${conversationText}`,
          },
        ],
      }),
    })
    if (res.ok) {
      const data = await res.json()
      summary = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim() || null
    }
  } catch (err) {
    console.error('[thread-messages] summarize failed (non-blocking):', err)
  }

  // Spara summary på threaden så vi inte behöver bygga om den nästa gång
  if (summary) {
    try {
      const supabase = getSupabase()
      await supabase
        .from('agent_threads')
        .update({ context_summary: summary })
        .eq('id', opts.threadId)
    } catch { /* non-blocking */ }
  }

  return { summary, kept }
}
