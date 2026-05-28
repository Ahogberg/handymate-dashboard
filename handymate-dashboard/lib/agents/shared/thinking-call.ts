/**
 * Generisk Claude-anrop med extended-thinking — delas av alla agenter.
 *
 * Wraps raw fetch mot Anthropic Messages API (SDK 0.17.0 i repot är
 * för gammal för thinking-parametern). Sonnet 4.6 stödjer
 * extended-thinking utan beta-header.
 *
 * Inkapslar:
 * - Request-build (model + max_tokens + thinking-config + system + messages)
 * - Response-parse (content-blocks → thinking + text)
 * - JSON-array-match + normalize via shared normalizeObservation
 * - Strukturerad debug-info för diagnostik
 * - Konsekvent logging-format [{agentId}/call] ... så Vercel logs är scanbar
 *
 * Tidigare inline i lib/agents/karin/observation-prompt.ts (callKarinWithThinking,
 * rad 549-722). Extraherat 2026-05-18 vid Phase A2 av Karin-kloning.
 */

import { normalizeObservation, type AgentObservation } from './normalize'

// ─────────────────────────────────────────────────────────────────
// Debug-info exporterad så per-agent debug-types kan extenda
// ─────────────────────────────────────────────────────────────────

export interface AgentDebugInfo {
  code_version: string
  prompt_maturity: string
  system_prompt_length: number
  user_message_length: number
  api_status: number
  api_status_text?: string
  api_error_body?: string
  stop_reason?: string
  content_block_count: number
  content_block_types: string[]
  thinking_full?: string
  raw_text?: string
  raw_text_length: number
  regex_match_found: boolean
  matched_substring?: string
  parse_error?: string
  parsed_count: number
  normalize_success: number
  normalize_dropped: number
  validation_dropped: number
  validation_drop_reasons?: string[]
  parsed_observations?: AgentObservation[]
  /** Steg 7 (2026-05-29): Anthropic API usage från response.usage.
      Används av cron-route för agent_runs-logging och cost-cap-summering. */
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  /** Steg 7: USD-kostnad för anropet, beräknad från usage + Sonnet 4.6-priser. */
  estimated_cost_usd?: number
}

export interface ThinkingCallOptions {
  agentId: string                    // 'karin' | 'daniel' | 'lars' | 'hanna' — för logging-prefix
  codeVersion: string                // syns i debug.code_version
  promptMaturity: string             // 'early_stage' | 'full_analysis' | etc.
  systemPrompt: string
  userMessage: string
  model?: string                     // default 'claude-sonnet-4-6'
  maxTokens?: number                 // default 12000
  thinkingBudget?: number            // default 8000
}

export interface ThinkingCallResult {
  observations: AgentObservation[]
  thinkingPreview: string
  debug: AgentDebugInfo
}

/**
 * Anropa Claude med extended-thinking, parsa response, normalize observations.
 * Returnerar både parsed observations och rich debug-info för diagnostik.
 */
export async function callAgentWithThinking(
  options: ThinkingCallOptions,
): Promise<ThinkingCallResult> {
  const {
    agentId,
    codeVersion,
    promptMaturity,
    systemPrompt,
    userMessage,
    model = 'claude-sonnet-4-6',
    maxTokens = 12000,
    thinkingBudget = 8000,
  } = options

  const logPrefix = `[${agentId}/call]`

  const debug: AgentDebugInfo = {
    code_version: codeVersion,
    prompt_maturity: promptMaturity,
    system_prompt_length: systemPrompt.length,
    user_message_length: userMessage.length,
    api_status: 0,
    content_block_count: 0,
    content_block_types: [],
    raw_text_length: 0,
    regex_match_found: false,
    parsed_count: 0,
    normalize_success: 0,
    normalize_dropped: 0,
    validation_dropped: 0,
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(`${logPrefix} ANTHROPIC_API_KEY not set`)
    debug.api_error_body = 'ANTHROPIC_API_KEY not configured'
    return { observations: [], thinkingPreview: '', debug }
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      thinking: { type: 'enabled', budget_tokens: thinkingBudget },
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  debug.api_status = response.status
  debug.api_status_text = response.statusText

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    console.error(`${logPrefix} Anthropic API error:`, {
      status: response.status,
      body: errText.slice(0, 500),
    })
    debug.api_error_body = errText.slice(0, 1000)
    return { observations: [], thinkingPreview: `error: ${response.status}`, debug }
  }

  const data: any = await response.json()
  const blocks: Array<{ type: string; text?: string; thinking?: string }> =
    data.content || []

  debug.stop_reason = data.stop_reason
  debug.content_block_count = blocks.length
  debug.content_block_types = blocks.map(b => b.type)

  // Steg 7 (2026-05-29): usage + cost. Sonnet 4.6-priser:
  //   $3/1M input tokens, $15/1M output tokens (thinking räknas som output)
  //   Cache write: $3.75/1M (5m), cache read: $0.30/1M
  // Defensiv parsing — om Anthropic ändrar shape framöver lever cron kvar.
  if (data.usage && typeof data.usage === 'object') {
    const u = data.usage as {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
    const inputTokens = typeof u.input_tokens === 'number' ? u.input_tokens : 0
    const outputTokens = typeof u.output_tokens === 'number' ? u.output_tokens : 0
    const cacheWrite = typeof u.cache_creation_input_tokens === 'number' ? u.cache_creation_input_tokens : 0
    const cacheRead = typeof u.cache_read_input_tokens === 'number' ? u.cache_read_input_tokens : 0
    debug.usage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheWrite,
      cache_read_input_tokens: cacheRead,
    }
    const inputCost = (inputTokens / 1_000_000) * 3.0
    const outputCost = (outputTokens / 1_000_000) * 15.0
    const cacheWriteCost = (cacheWrite / 1_000_000) * 3.75
    const cacheReadCost = (cacheRead / 1_000_000) * 0.30
    debug.estimated_cost_usd = inputCost + outputCost + cacheWriteCost + cacheReadCost
  }

  const thinkingBlock = blocks.find(b => b.type === 'thinking')
  const textBlock = blocks.find(b => b.type === 'text')

  const thinkingFull = thinkingBlock?.thinking || ''
  const thinkingPreview = thinkingFull.slice(0, 300)
  debug.thinking_full = thinkingFull

  // VIKTIGT: använd undefined-check istället för `|| '[]'`-fallback.
  // Tidigare bug: text-fallback maskerade att text-blocket saknades helt.
  const text = textBlock?.text
  debug.raw_text = text
  debug.raw_text_length = text?.length || 0

  console.log(`${logPrefix} response shape:`, {
    stop_reason: data.stop_reason,
    block_count: blocks.length,
    block_types: blocks.map(b => b.type),
    thinking_length: thinkingFull.length,
    text_present: !!text,
    text_length: text?.length || 0,
    text_preview: text?.slice(0, 200),
  })

  if (!text) {
    console.error(`${logPrefix} no text block in response — model returned only thinking?`)
    return { observations: [], thinkingPreview, debug }
  }

  const match = text.match(/\[[\s\S]*\]/)
  if (!match) {
    console.error(`${logPrefix} no JSON array in response text:`, text.slice(0, 300))
    return { observations: [], thinkingPreview, debug }
  }

  debug.regex_match_found = true
  debug.matched_substring = match[0].slice(0, 1000)

  try {
    const parsedRaw = JSON.parse(match[0]) as unknown[]
    const parsedArray: any[] = Array.isArray(parsedRaw) ? (parsedRaw as any[]) : []
    debug.parsed_count = parsedArray.length
    debug.parsed_observations = parsedArray as AgentObservation[]

    console.log(`${logPrefix} before normalize:`, {
      version: codeVersion,
      count: parsedArray.length,
      first_keys: parsedArray[0] ? Object.keys(parsedArray[0]) : [],
    })

    const normalizeNotes: string[] = []
    const dropReasons: string[] = []
    const valid: AgentObservation[] = []

    for (let i = 0; i < parsedArray.length; i++) {
      const raw = parsedArray[i]
      const normalized = normalizeObservation(raw, i, normalizeNotes)
      if (normalized) {
        valid.push(normalized)
      } else {
        dropReasons.push(`obs[${i}]: no salvageable observation/message field`)
      }
    }

    debug.normalize_success = valid.length
    debug.normalize_dropped = parsedArray.length - valid.length
    debug.validation_dropped = debug.normalize_dropped
    debug.validation_drop_reasons = [...dropReasons, ...normalizeNotes]

    console.log(`${logPrefix} after normalize:`, {
      version: codeVersion,
      survived: valid.length,
      dropped: debug.normalize_dropped,
      normalize_notes_count: normalizeNotes.length,
      first_drop: dropReasons[0],
      first_note: normalizeNotes[0],
    })

    if (valid.length === 0 && parsedArray.length > 0) {
      console.warn(`${logPrefix} parsed observations but all dropped:`, dropReasons)
    }
    if (normalizeNotes.length > 0) {
      console.log(`${logPrefix} schema normalization applied:`, normalizeNotes)
    }

    return { observations: valid, thinkingPreview, debug }
  } catch (parseErr) {
    const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
    console.error(`${logPrefix} JSON parse failed:`, errMsg, match[0].slice(0, 300))
    debug.parse_error = errMsg
    return { observations: [], thinkingPreview, debug }
  }
}
