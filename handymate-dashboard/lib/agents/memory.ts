/**
 * V21 DEL 2 — Agent Memory Pipeline
 *
 * Härdad i Etapp U (2026-08-18, sql/v149_agent_memory_hardening.sql):
 * agent_memories var append-only rå modelloutput utan bekräftelse, utan
 * ersättningskedja, utan färskhet och utan källspår — allt customer_fact
 * (v122) redan gör rätt. v149 lägger till fyra kolumner (superseded_by,
 * confirmed_at, source_type, source_id) på EXISTERANDE tabell. Filen är
 * fail-soft genomgående: körs v149 inte än (PostgREST 42703 — kolumnen
 * finns inte) faller varje skriv-/läsväg tillbaka till gårdagens form,
 * BYTE-IDENTISKT beteende, tills Andreas kör migrationen.
 *
 * Efter varje agent-körning:
 * 1. Extrahera lärdom via Claude Haiku (extractAndSaveMemory)
 * 2. Maska PII (scrubPII, samma helper som thread-messages.ts)
 * 3. Klassificera + dedupe/supersede + spara (saveExtractedMemory)
 *    — observation/fact auto-bekräftas (de påstår bara vad EN körning
 *      såg); pattern/preference (firmanivå-påståenden) skrivs UNBEKRÄFTADE
 *      och kräver ett pending_approvals-kort (case
 *      'agent_memory_confirmation', app/api/approvals/[id]/route.ts) innan
 *      de räknas som sanning — rå modelloutput blir aldrig sanning utan
 *      en människa.
 *
 * Före varje körning:
 * 1. Hämta relevanta minnen (fetchRelevantMemories/getRelevantMemories) —
 *    bara BEKRÄFTADE, icke-ersatta rader, rankade på färskhetsviktad
 *    poäng (recency-decay, halveringstid 90 dagar — se decayFactor).
 * 2. Injicera i systemprompt
 *
 * Dödad död kod (Etapp U): generateEmbedding returnerade alltid null,
 * embedding-kolumnen var alltid NULL, och context-argumentet till
 * getRelevantMemories ignorerades helt (ingen anropare skickade det ens).
 * V1-beslutet är ärlighet före ambition: bort, inte en låtsad
 * vektorsökning. Kolumnen finns kvar i databasen (ingen destruktiv
 * migration) — bara oanvänd.
 *
 * Facit: tests/agent-memory.spec.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'
import { scrubPII } from '@/lib/agent/thread-messages'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

export const AGENT_MEMORY_CONFIRMATION_TYPE = 'agent_memory_confirmation'

/** Firmanivå-kort som skapas av agent_memory_confirmation-flödet. */
const MEMORY_CARD_EXPIRES_DAYS = 14

export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  matte: 'Matte (chef)',
  karin: 'Karin (ekonom)',
  hanna: 'Hanna (marknad)',
  daniel: 'Daniel (sälj)',
  lars: 'Lars (projekt)',
  lisa: 'Lisa (kundservice)',
}

/** Varifrån ett minne kom — källspår (v149). id kan vara null om
 *  anroparen inte hade en referens i scope; type sätts ändå. */
export interface MemorySource {
  type: string
  id: string | null
}

// ── Källspår-detektion (fail-soft) ──

/** Är detta ett PostgREST "kolumnen finns inte"-fel (pre-migration)? Samma
 *  mönster som customer_fact-caset och deadline-sweep.ts. */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42703' || /column .* does not exist|schema cache/i.test(error.message || '')
}

// ── Klassificering + viktning (LÅST beteende — characterization tests) ──

export type MemoryType = 'observation' | 'pattern' | 'preference' | 'fact'

export function classifyMemoryType(content: string, triggerType: string): MemoryType {
  const lower = content.toLowerCase()
  if (lower.includes('föredrar') || lower.includes('vill ha') || lower.includes('gillar')) return 'preference'
  if (lower.includes('brukar') || lower.includes('tenderar') || lower.includes('mönster')) return 'pattern'
  if (lower.includes('har ') || lower.includes('är ') || lower.includes('finns')) return 'fact'
  return 'observation'
}

export function calculateImportance(triggerType: string, content: string): number {
  let score = 0.5
  if (triggerType === 'phone_call') score += 0.2 // Phone calls are high-signal
  if (triggerType === 'manual') score += 0.1
  if (content.toLowerCase().includes('viktigt') || content.toLowerCase().includes('kritisk')) score += 0.15
  if (content.length > 100) score += 0.05
  return Math.min(1.0, score)
}

/** Åtkomst-bumpen vid en exakt dubblett — samma formel som innan v149,
 *  bara flyttad till en egen funktion så den kan lås-testas. */
export function bumpedImportance(accessCount: number): number {
  return Math.min(1.0, 0.5 + (accessCount || 0) * 0.1)
}

/** Firmanivå-påståenden (pattern/preference) kräver ett mänskligt
 *  godkännande innan de räknas som sanning. Körningsobservationer
 *  (observation/fact) auto-bekräftas — de påstår bara vad EN körning såg. */
export function requiresConfirmation(memoryType: string): boolean {
  return memoryType === 'pattern' || memoryType === 'preference'
}

// ── Färskhet (recency-decay vid LÄSNING — ingen write-back behövs) ──

/** Halveringstid för ett minnes vikt — ~ett kvartal. Gammal information
 *  tonar bort (ett mönster observerat i våras väger mindre idag) men
 *  försvinner inte över en natt (ett minne från förra veckan är fortfarande
 *  ~95% av sin ursprungsvikt). Vald för att matcha den tidshorisont
 *  övriga "färskhets"-koncept i kodbasen redan resonerar i (kvartalsvisa
 *  mönster, inte dagsfärskt och inte för evigt). */
export const MEMORY_HALF_LIFE_DAYS = 90

export function decayFactor(ageMs: number): number {
  const ageDays = Math.max(0, ageMs) / (1000 * 60 * 60 * 24)
  return Math.pow(0.5, ageDays / MEMORY_HALF_LIFE_DAYS)
}

/** effective_score = importance * decay(age). Lästidsberäknad — ingen
 *  kolumn skrivs om, "nu" är alltid "nu". */
export function effectiveImportance(importanceScore: number, createdAtIso: string, now: Date = new Date()): number {
  const created = new Date(createdAtIso).getTime()
  if (Number.isNaN(created)) return importanceScore
  return importanceScore * decayFactor(now.getTime() - created)
}

export function rankByEffectiveScore<T extends { importance_score: number; created_at: string }>(
  memories: T[],
  now: Date = new Date(),
): T[] {
  return [...memories].sort(
    (a, b) => effectiveImportance(b.importance_score, b.created_at, now) - effectiveImportance(a.importance_score, a.created_at, now),
  )
}

/** v200 (sql/v200_agent_memories_customer_id.sql, gap 6): kundens EGNA minnen
 *  ska rankas FÖRE likvärdiga företagsminnen. Valt: en boost på den
 *  färskhetsviktade poängen innan sortering, hellre än att sortera i två
 *  separata grupper — en boost låter färskhetsdecay fortfarande avgöra
 *  ordningen både inom OCH mellan de två (ett urgammalt kundminne kan
 *  fortfarande tappa mot ett färskt företagsminne; en ren gruppsortering hade
 *  aldrig tillåtit det). customerId=null (den vanliga företagsnivå-frågan)
 *  ⇒ boost alltid 0 för alla rader ⇒ identisk ordning som rankByEffectiveScore. */
export const CUSTOMER_MEMORY_RANK_BOOST = 0.2

/** v200: kund-id:t interpoleras i ett PostgREST-filter (.or). Bara id:n med
 *  säkra tecken släpps in — annars behandlas anropet som företagsnivå. */
export function safeMemoryCustomerId(value: string | null | undefined): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value) ? value : null
}

export function rankByEffectiveScoreWithCustomerBoost<
  T extends { importance_score: number; created_at: string; customer_id?: string | null },
>(memories: T[], customerId: string | null, now: Date = new Date()): T[] {
  const score = (m: T) =>
    effectiveImportance(m.importance_score, m.created_at, now) +
    (customerId && m.customer_id === customerId ? CUSTOMER_MEMORY_RANK_BOOST : 0)
  return [...memories].sort((a, b) => score(b) - score(a))
}

// ── Dedupe/supersede — deterministisk, ALDRIG LLM-dömd ──

/**
 * Normaliserar text till jämförbara tokens: gemener, diakritik bortstädad,
 * skiljetecken bort, mellanslag-delad.
 */
export function normalizeForOverlap(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function normalizedText(text: string): string {
  return normalizeForOverlap(text).join(' ')
}

/** Jaccard-överlapp mellan två tokenmängder — |A∩B| / |A∪B|. */
export function jaccardOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  Array.from(setA).forEach((t) => {
    if (setB.has(t)) intersection++
  })
  const union = new Set(Array.from(setA).concat(Array.from(setB))).size
  return union === 0 ? 0 : intersection / union
}

/** Tröskeln för "samma sak, sagt igen med andra ord" — hög avsiktligt:
 *  hellre två sanna minnen som borde slagits ihop än en felaktig
 *  sammanslagning av två olika fakta. */
export const SUPERSEDE_OVERLAP_THRESHOLD = 0.6

export interface DedupeCandidate {
  id: string
  content: string
  memory_type: string
}

export type DedupeDecision =
  | { action: 'skip'; matchId: string }
  | { action: 'supersede'; matchId: string }
  | { action: 'insert' }

/**
 * Ersätter substring-hacket (.ilike('%first-50-chars%')) med två regler,
 * i tur och ordning:
 *   1. Exakt normaliserad matchning (samma innehåll, andra skiljetecken/
 *      versaler) → skip, bumpa den befintliga.
 *   2. Samma memory_type + hög tokenöverlapp (Jaccard ≥ 0.6) → den nya
 *      raden ERSÄTTER den gamla (supersede), inte en tyst bump.
 *   3. Annars → ny rad.
 *
 * KÄND BEGRÄNSNING (V2, ärligt dokumenterad): en riktig MOTSÄGELSE ("kunden
 * vill ha ek" vs "kunden vill ha ek, ändrade sig — vill ha halkfritt golv")
 * har LÅG tokenöverlapp och slinker igenom som två separata, samexisterande
 * minnen. Att avgöra äkta motsägelse kräver semantisk förståelse — den här
 * funktionen är medvetet inte LLM-dömd (deterministisk, testbar, aldrig en
 * gissning), så den gränsen accepteras hellre än att bygga en AI-domare.
 */
export function decideDedupeAction(newContent: string, newType: string, candidates: DedupeCandidate[]): DedupeDecision {
  const newNorm = normalizedText(newContent)
  if (newNorm.length > 0) {
    for (const c of candidates) {
      if (normalizedText(c.content) === newNorm) {
        return { action: 'skip', matchId: c.id }
      }
    }
  }

  const newTokens = normalizeForOverlap(newContent)
  let best: { id: string; overlap: number } | null = null
  for (const c of candidates) {
    if (c.memory_type !== newType) continue
    const overlap = jaccardOverlap(newTokens, normalizeForOverlap(c.content))
    if (overlap >= SUPERSEDE_OVERLAP_THRESHOLD && (!best || overlap > best.overlap)) {
      best = { id: c.id, overlap }
    }
  }
  if (best) return { action: 'supersede', matchId: best.id }
  return { action: 'insert' }
}

// ── Spara (I/O, testbar via injicerad klient — samma mönster som
//    lib/promises/deadline-sweep.ts findOpenPromiseDeadlines) ──

export interface SaveExtractedMemoryInput {
  businessId: string
  agentId: string
  rawContent: string
  triggerType: string
  source?: MemorySource
  /** v200 (sql/v200_agent_memories_customer_id.sql, gap 6): kundens id om
   *  minnet gäller en specifik kund. null/saknas = företagsnivå (som innan
   *  v200) — oförändrat beteende när ingen anropare skickar detta. */
  customerId?: string | null
}

export type SaveExtractedMemoryResult =
  | { action: 'discarded' }
  | { action: 'error'; error: string }
  | { action: 'bumped'; memoryId: string }
  | { action: 'inserted'; memoryId: string; legacy: boolean; confirmationPending: boolean }
  | { action: 'superseded'; memoryId: string; supersededId: string; confirmationPending: boolean }

/**
 * Klassificerar, maskar PII, deduperar/supersedar och sparar EN extraherad
 * mening. Ren I/O-orkestrering runt de rena funktionerna ovan — ingen
 * nätverkstrafik här (Haiku-anropet ligger i extractAndSaveMemory).
 */
export async function saveExtractedMemory(
  supabase: SupabaseClient,
  input: SaveExtractedMemoryInput,
): Promise<SaveExtractedMemoryResult> {
  const { businessId, agentId, triggerType, source } = input
  const customerId = safeMemoryCustomerId(input.customerId)
  const trimmed = (input.rawContent || '').trim()
  if (!trimmed || trimmed === 'INGEN' || trimmed.length < 10) {
    return { action: 'discarded' }
  }

  // PII-skydd (samma helper som thread-messages.ts): maska personnummer/
  // bankgiro/långa siffersekvenser (bl.a. svenska mobilnummer, 10 siffror)
  // INNAN något sparas.
  const content = scrubPII(trimmed)
  const memoryType = classifyMemoryType(content, triggerType)
  const importance = calculateImportance(triggerType, content)

  const baseCandidatesQuery = supabase
    .from('agent_memories')
    .select('id, content, memory_type, access_count')
    .eq('business_id', businessId)
    .eq('agent_id', agentId)
    .is('superseded_by', null)

  // v200: en kunds dedupe/supersede ska bara jämföras mot samma kunds egna
  // minnen ELLER företagsnivå (customer_id null) — ALDRIG mot en ANNAN
  // kunds minne. Utan customerId (företagsnivå-skrivning) oförändrat.
  const candidatesQuery = customerId
    ? baseCandidatesQuery.or(`customer_id.is.null,customer_id.eq.${customerId}`)
    : baseCandidatesQuery

  const { data: candidates, error: candErr } = await candidatesQuery.limit(50)

  if (candErr) {
    if (!isMissingColumnError(candErr)) {
      console.error('[agent-memory] dedupe-läsning misslyckades:', candErr.message)
      return { action: 'error', error: candErr.message }
    }
    // Pre-migration (42703 på superseded_by) — kör gårdagens exakta
    // väg: substring-dedupe, ingen bekräftelsegrind, ingen ny kolumn.
    return saveExtractedMemoryLegacy(supabase, businessId, agentId, content, memoryType, importance, customerId)
  }

  const decision = decideDedupeAction(content, memoryType, candidates || [])

  if (decision.action === 'skip') {
    const match = (candidates || []).find((c) => c.id === decision.matchId)
    const { error: bumpErr } = await supabase
      .from('agent_memories')
      .update({
        access_count: (match?.access_count || 0) + 1,
        last_accessed_at: new Date().toISOString(),
        importance_score: bumpedImportance(match?.access_count || 0),
      })
      .eq('id', decision.matchId)
    if (bumpErr) {
      console.error('[agent-memory] bump misslyckades:', bumpErr.message)
      return { action: 'error', error: bumpErr.message }
    }
    return { action: 'bumped', memoryId: decision.matchId }
  }

  const needsConfirmation = requiresConfirmation(memoryType)
  const { data: inserted, error: insertErr } = await insertAgentMemoryRow(
    supabase,
    {
      business_id: businessId,
      agent_id: agentId,
      memory_type: memoryType,
      content,
      importance_score: importance,
      confirmed_at: needsConfirmation ? null : new Date().toISOString(),
      source_type: source?.type ?? null,
      source_id: source?.id ?? null,
    },
    customerId,
  )

  if (insertErr || !inserted) {
    console.error('[agent-memory] insert misslyckades:', insertErr?.message)
    return { action: 'error', error: insertErr?.message || 'insert failed' }
  }

  if (decision.action === 'supersede') {
    const { error: supersedeErr } = await supabase
      .from('agent_memories')
      .update({ superseded_by: inserted.id })
      .eq('id', decision.matchId)
      .eq('business_id', businessId)
    if (supersedeErr) {
      // Icke-blockerande: den nya sanningen är redan sparad, en misslyckad
      // markering av den gamla får aldrig fälla hela sparandet.
      console.error('[agent-memory] supersede-markering misslyckades (icke-blockerande):', supersedeErr.message)
    }
  }

  if (needsConfirmation) {
    await createMemoryConfirmationCard(supabase, businessId, agentId, memoryType, content, inserted.id)
  }

  return decision.action === 'supersede'
    ? { action: 'superseded', memoryId: inserted.id, supersededId: decision.matchId, confirmationPending: needsConfirmation }
    : { action: 'inserted', memoryId: inserted.id, legacy: false, confirmationPending: needsConfirmation }
}

/** v200 (sql/v200_agent_memories_customer_id.sql): försöker alltid infoga
 *  customer_id (null vid företagsnivå). Fail-soft: om kolumnen inte finns än
 *  (isMissingColumnError) görs samma insert om EXAKT utan fältet — precis
 *  samma rad som innan v200, bara ett extra om-anrop. */
async function insertAgentMemoryRow(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  customerId: string | null | undefined,
): Promise<{ data: { id: string } | null; error: { message?: string; code?: string } | null }> {
  const withCustomer = { ...row, customer_id: customerId ?? null }
  const attempt = await supabase.from('agent_memories').insert(withCustomer).select('id').single()
  if (attempt.error && isMissingColumnError(attempt.error)) {
    return supabase.from('agent_memories').insert(row).select('id').single()
  }
  return attempt
}

/** Exakt gårdagens beteende — substring-dedupe, ingen v149-kolumn rörd.
 *  customer_id (v200) läggs med i inserten ändå — se insertAgentMemoryRow. */
async function saveExtractedMemoryLegacy(
  supabase: SupabaseClient,
  businessId: string,
  agentId: string,
  content: string,
  memoryType: MemoryType,
  importance: number,
  customerId?: string | null,
): Promise<SaveExtractedMemoryResult> {
  const { data: existing } = await supabase
    .from('agent_memories')
    .select('id, content, access_count')
    .eq('business_id', businessId)
    .eq('agent_id', agentId)
    .ilike('content', `%${content.slice(0, 50)}%`)
    .limit(1)

  if (existing && existing.length > 0) {
    await supabase
      .from('agent_memories')
      .update({
        access_count: (existing[0].access_count || 0) + 1,
        last_accessed_at: new Date().toISOString(),
        importance_score: bumpedImportance(existing[0].access_count || 0),
      })
      .eq('id', existing[0].id)
    return { action: 'bumped', memoryId: existing[0].id }
  }

  const { data: inserted, error: insertErr } = await insertAgentMemoryRow(
    supabase,
    {
      business_id: businessId,
      agent_id: agentId,
      memory_type: memoryType,
      content,
      importance_score: importance,
    },
    customerId,
  )

  if (insertErr || !inserted) {
    console.error('[agent-memory] legacy insert misslyckades:', insertErr?.message)
    return { action: 'error', error: insertErr?.message || 'insert failed' }
  }
  return { action: 'inserted', memoryId: inserted.id, legacy: true, confirmationPending: false }
}

/**
 * Bekräftelsegrinden: skapar ett pending_approvals-kort
 * (approval_type='agent_memory_confirmation'). Godkännande sätter
 * confirmed_at på DENNA redan sparade rad — se app/api/approvals/[id]/
 * route.ts, case 'agent_memory_confirmation'. Icke-blockerande: en
 * misslyckad kortskapelse får aldrig fälla ett redan sparat minne (det
 * ligger kvar unbekräftat och plockas inte upp av getRelevantMemories
 * förrän någon bekräftar det — säkert fail-läge, inte en läcka).
 */
async function createMemoryConfirmationCard(
  supabase: SupabaseClient,
  businessId: string,
  agentId: string,
  memoryType: MemoryType,
  content: string,
  memoryId: string,
): Promise<void> {
  try {
    const agentLabel = AGENT_DISPLAY_NAMES[agentId] || agentId
    const typLabel = memoryType === 'preference' ? 'en preferens' : 'ett mönster'
    const { error } = await supabase.from('pending_approvals').insert({
      id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      business_id: businessId,
      status: 'pending',
      expires_at: new Date(Date.now() + MEMORY_CARD_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      approval_type: AGENT_MEMORY_CONFIRMATION_TYPE,
      routing_role: 'owner_admin',
      title: `${agentLabel} har lagt märke till ${typLabel}`,
      description: content,
      risk_level: 'low',
      payload: {
        memory_id: memoryId,
        agent_id: agentId,
        memory_type: memoryType,
        content,
      },
    })
    if (error) {
      console.error('[agent-memory] kunde inte skapa bekräftelsekort (icke-blockerande):', error.message)
    }
  } catch (err: any) {
    console.error('[agent-memory] bekräftelsekort kastade (icke-blockerande):', err?.message || err)
  }
}

/**
 * Anropas fire-and-forget efter varje agent-körning (app/api/agent/trigger/
 * route.ts) och varje Matte-chattur (app/api/matte/chat/route.ts). Blockerar
 * aldrig — sväljer alla fel, precis som innan Etapp U.
 */
export async function extractAndSaveMemory(
  businessId: string,
  agentId: string,
  finalResponse: string,
  triggerType: string,
  triggerData: Record<string, unknown>,
  source?: MemorySource,
  /** v200 (gap 6): kundens id om körningen/turen gällde en specifik kund.
   *  null/saknas = företagsnivå (oförändrat beteende). */
  customerId?: string | null,
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

    // COGS-boken — extractAndSaveMemory anropas fire-and-forget från både
    // agent/trigger och matte/chat; mäts EN gång här inne så den bokförs
    // exakt en gång oavsett anropare.
    if (extraction.usage) {
      const supabaseForCost = getServerSupabase()
      await meterDirectLlmCall({
        supabase: supabaseForCost,
        businessId,
        usage: extraction.usage,
        costUsd: llmCostUsd(extraction.usage, HAIKU_MODEL),
        refType: 'agent_memory',
        refId: `${agentId}_${triggerType}_${Date.now()}`,
        meta: { agent_id: agentId, trigger_type: triggerType },
      })
    }

    const rawContent = extraction.content?.[0]?.text?.trim() || ''
    const supabase = getServerSupabase()
    await saveExtractedMemory(supabase, { businessId, agentId, rawContent, triggerType, source, customerId })
  } catch (err) {
    console.error('[agent-memory] Failed to extract/save memory:', err)
  }
}

// ── Läsa (I/O, testbar via injicerad klient) ──

export interface RelevantMemoryRow {
  id: string
  content: string
  importance_score: number
  memory_type: string
  created_at: string
  access_count?: number
  /** v200 — saknas (undefined) på legacy-fallbackens rader (kolumnen läses
   *  inte där), null = företagsnivå, annars kundens id. */
  customer_id?: string | null
  /** v201 (pass 3) — satt när raden kom ur relevansfrågan (textSearch),
   *  inte bara viktighetsrankningen. Odefinierad = kom ur den vanliga
   *  frågan. Låter buildMemoryPrompt lägga den under "Relevant för det
   *  här:" i stället för de vanliga rubrikerna. */
  relevant?: boolean
}

const RELEVANT_MEMORIES_FETCH_LIMIT = 200
const RELEVANT_MEMORIES_TOP_N = 5
/** Relevansträffarna får tränga in EXTRA plats ovanpå viktighetstoppen,
 *  aldrig helt tränga ut den — annars försvinner allt företagsminne bara
 *  för att frågan råkade träffa tre gamla kundrader. */
const RELEVANT_MEMORIES_QUERY_HEADROOM = 3

/**
 * Pass 3 (sql/v201_agent_memories_fts.sql) — bygger en websearch_to_tsquery-
 * kompatibel sträng ur en fri text: ord ≥ 4 tecken (svenska bokstäver
 * tillåtna), unika, max 12, skiljetecken strippade, ihopsatta med ' OR ' så
 * frågan blir en bred träfftratt snarare än en exakt fras (en kund skriver
 * sällan om sitt ärende med precis samma ordföljd två gånger). Ren funktion
 * — ingen I/O, testbar utan Supabase.
 */
export function byggMinnesfraga(text: string): string | null {
  const ord = (text || '')
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zåäöéA-ZÅÄÖÉ0-9]/g, ''))
    .filter((w) => w.length >= 4)

  const unika = Array.from(new Set(ord)).slice(0, 12)
  if (unika.length === 0) return null
  return unika.join(' OR ')
}

/** Varnar bara EN gång per process om relevanssökningen inte går att
 *  köra (saknad kolumn/index innan v201, eller ett transient DB-fel) —
 *  samma "en varning, inte en logglavin" som customer_fact-idiomet. */
let harVarnatOmRelevanssokning = false

/**
 * Andra frågan i fetchRelevantMemories när ett `opts.query` finns: samma
 * scope (business, agent-eller-matte, superseded_by null, confirmed_at
 * satt, kund-filtret från v200) men filtrerad på content_tsv i stället för
 * rankad på ren viktighet. Fail-soft: 42703 (v201 inte körd än) eller
 * annat fel ⇒ tom lista, ALDRIG en kastad fråga.
 */
async function fetchRelevanceMatches(
  supabase: SupabaseClient,
  businessId: string,
  agentId: string,
  customerId: string | null,
  tsQuery: string,
): Promise<RelevantMemoryRow[]> {
  try {
    const baseQuery = supabase
      .from('agent_memories')
      .select('id, content, importance_score, memory_type, created_at, access_count, customer_id')
      .eq('business_id', businessId)
      .or(`agent_id.eq.${agentId},agent_id.eq.matte`)
      .is('superseded_by', null)
      .not('confirmed_at', 'is', null)

    const scopedQuery = customerId
      ? baseQuery.or(`customer_id.is.null,customer_id.eq.${customerId}`)
      : baseQuery.is('customer_id', null)

    const { data, error } = await scopedQuery
      .textSearch('content_tsv', tsQuery, { config: 'swedish', type: 'websearch' })
      .limit(10)

    if (error) {
      if (!isMissingColumnError(error) && !harVarnatOmRelevanssokning) {
        console.warn('[agent-memory] relevanssökning misslyckades, faller tillbaka på viktighet:', error.message)
        harVarnatOmRelevanssokning = true
      }
      return []
    }
    return (data || []) as RelevantMemoryRow[]
  } catch (err) {
    if (!harVarnatOmRelevanssokning) {
      console.warn('[agent-memory] relevanssökning kastade, faller tillbaka på viktighet:', err)
      harVarnatOmRelevanssokning = true
    }
    return []
  }
}

/**
 * Hämtar minnen för en agent (+ Mattes delade minnen), bekräftade och
 * icke-ersatta (fail-soft: 42703 → gårdagens ofiltrerade fråga), rankade
 * på färskhetsviktad poäng (rankByEffectiveScore) — ALDRIG bara rå
 * importance_score längre, ett minne från i höstas ska inte slå ett från
 * i morse för evigt.
 *
 * OBS: "relevans" här betyder "topp-N per bekräftad poäng med
 * färskhetsdecay" — INTE semantisk sökning. Den tidigare kommentarens
 * antydan om vektor-likhet var död kod (embedding var alltid NULL); den
 * här funktionen döps och dokumenteras som vad den faktiskt är.
 *
 * Pass 3 (sql/v201_agent_memories_fts.sql): med `opts.query` körs DÄRUTÖVER
 * en andra fråga mot content_tsv (fetchRelevanceMatches) — dess träffar
 * läggs FÖRE viktighetstoppen (i den ordning frågan gav dem), dedupas på
 * id och klipps till RELEVANT_MEMORIES_TOP_N + headroom så en lyckad
 * relevansträff aldrig tränger ut ALLT företagsminne. Utan `opts.query`:
 * exakt gårdagens beteende (samma anrop, samma retur).
 */
export async function fetchRelevantMemories(
  supabase: SupabaseClient,
  businessId: string,
  agentId: string,
  opts: { now?: Date; customerId?: string | null; query?: string } = {},
): Promise<RelevantMemoryRow[]> {
  const now = opts.now ?? new Date()
  const customerId = safeMemoryCustomerId(opts.customerId)

  const baseQuery = supabase
    .from('agent_memories')
    .select('id, content, importance_score, memory_type, created_at, access_count, customer_id')
    .eq('business_id', businessId)
    .or(`agent_id.eq.${agentId},agent_id.eq.matte`)
    .is('superseded_by', null)
    .not('confirmed_at', 'is', null)

  // v200 (gap 6): utan customerId bara företagsnivå (customer_id IS NULL) —
  // en kunds minnen ska aldrig läcka in i ett sammanhang utan den kunden.
  // Med customerId: företagsnivå OCH kundens egna.
  const scopedQuery = customerId
    ? baseQuery.or(`customer_id.is.null,customer_id.eq.${customerId}`)
    : baseQuery.is('customer_id', null)

  const { data, error } = await scopedQuery.limit(RELEVANT_MEMORIES_FETCH_LIMIT)

  let rows = data as RelevantMemoryRow[] | null
  let readErr = error

  if (readErr && isMissingColumnError(readErr)) {
    // Pre-migration — gårdagens exakta fråga: ofiltrerad, DB-sorterad på
    // rå importance_score, topp-5 direkt (ingen decay-sortering behövs
    // här utöver vad rankByEffectiveScore gör lokalt nedan, som fortfarande
    // fungerar eftersom created_at alltid funnits, sedan v21).
    const legacy = await supabase
      .from('agent_memories')
      .select('id, content, importance_score, memory_type, created_at, access_count')
      .eq('business_id', businessId)
      .or(`agent_id.eq.${agentId},agent_id.eq.matte`)
      .order('importance_score', { ascending: false })
      .limit(RELEVANT_MEMORIES_TOP_N)
    rows = legacy.data as RelevantMemoryRow[] | null
    readErr = legacy.error
  }

  if (readErr) {
    console.error('[agent-memory] läsning misslyckades:', readErr.message)
    return []
  }
  if (!rows || rows.length === 0) return []

  const top = rankByEffectiveScoreWithCustomerBoost(rows, customerId, now).slice(0, RELEVANT_MEMORIES_TOP_N)

  // Pass 3: med en fråga i scope, hämta relevansträffarna och slå ihop dem
  // FÖRE viktighetstoppen. Utan query (den överväldigande majoriteten av
  // anropen, t.ex. legacy-vägen ovan) är `merged` bokstavligen `top` —
  // byte-identiskt med gårdagens retur.
  let merged: RelevantMemoryRow[] = top
  const tsQuery = opts.query ? byggMinnesfraga(opts.query) : null
  if (tsQuery) {
    const relevanta = await fetchRelevanceMatches(supabase, businessId, agentId, customerId, tsQuery)
    const setta = new Set<string>()
    const ihopslaget: RelevantMemoryRow[] = []
    for (const r of relevanta) {
      if (setta.has(r.id)) continue
      setta.add(r.id)
      ihopslaget.push({ ...r, relevant: true })
    }
    for (const r of top) {
      if (setta.has(r.id)) continue
      setta.add(r.id)
      ihopslaget.push(r)
    }
    merged = ihopslaget.slice(0, RELEVANT_MEMORIES_TOP_N + RELEVANT_MEMORIES_QUERY_HEADROOM)
  }

  const ids = merged.map((m) => m.id)
  if (ids.length > 0) {
    await supabase
      .from('agent_memories')
      .update({ last_accessed_at: now.toISOString() })
      .in('id', ids)
  }

  return merged
}

/**
 * Hämtar top-5 relevanta minnen via cosine similarity — NEJ: se
 * fetchRelevantMemories filhuvud, det är top-N per bekräftad relevanspoäng
 * med färskhetsdecay, ingen vektorsökning. Det gamla context-argumentet
 * (Etapp U, ärlighet före ambition) är fortfarande borta — ingen låtsad
 * vektorsökning. v200 (gap 6) lägger till ett RIKTIGT tredje argument,
 * customerId: en verklig kund-scopning (företagsnivå + kundens egna),
 * inte en attrapp.
 */
export interface RelevantMemoryText {
  content: string
  /** v200: sant om minnet är kundspecifikt för den efterfrågade kunden —
   *  buildMemoryPrompt markerar dessa så agenten aldrig blandar ihop dem
   *  med firmanivå-lärdomar. */
  isCustomer: boolean
  /** Pass 3 (v201): sant om raden kom ur relevansfrågan (svarar på `query`),
   *  inte bara viktighetsrankningen. Odefinierad/false för alla anrop utan
   *  query — gårdagens kontrakt, oförändrat. */
  isRelevant?: boolean
}

export async function getRelevantMemories(
  businessId: string,
  agentId: string,
  customerId?: string | null,
  /** Pass 3: användarens/triggerns text — driver relevanssökningen
   *  (byggMinnesfraga + content_tsv). Odefinierad = gårdagens beteende. */
  query?: string,
): Promise<RelevantMemoryText[]> {
  const supabase = getServerSupabase()
  const rows = await fetchRelevantMemories(supabase, businessId, agentId, { customerId, query })
  return rows.map((r) => ({
    content: r.content,
    isCustomer: !!customerId && r.customer_id === customerId,
    isRelevant: !!r.relevant,
  }))
}

/** Antingen ett rått minne (företagsnivå, gårdagens form) eller ett
 *  RelevantMemoryText (v200) som kan vara kundmärkt. */
export type MemoryPromptItem = string | RelevantMemoryText

/**
 * Build prompt injection for agent memories.
 *
 * v200 (gap 6): ett minne med isCustomer=true märks med prefixet
 * "Om kunden: " så agenten aldrig blandar ihop ett kundspecifikt minne med
 * en firmanivå-lärdom. Rena strängar (gårdagens form) märks aldrig.
 *
 * Pass 3 (v201): rader med isRelevant=true (relevansträffar på användarens
 * fråga) listas FÖRST, under en egen rubrik "Relevant för det här:" — resten
 * (företags-/kundminnen som förut) listas därefter, numrerade som innan.
 * Utan några relevanta rader (den överväldigande majoriteten av anropen,
 * och ALLA anrop utan query) är utseendet byte-identiskt med gårdagens.
 */
export function buildMemoryPrompt(memories: MemoryPromptItem[]): string {
  if (memories.length === 0) return ''

  const formatRad = (m: MemoryPromptItem, i: number): string => {
    if (typeof m === 'string') return `${i + 1}. ${m}`
    const prefix = m.isCustomer ? 'Om kunden: ' : ''
    return `${i + 1}. ${prefix}${m.content}`
  }

  const relevanta = memories.filter((m): m is RelevantMemoryText => typeof m !== 'string' && !!m.isRelevant)
  const ovriga = memories.filter((m) => typeof m === 'string' || !m.isRelevant)

  const sektioner: string[] = []
  if (relevanta.length > 0) {
    sektioner.push(`Relevant för det här:\n${relevanta.map(formatRad).join('\n')}`)
  }
  if (ovriga.length > 0) {
    sektioner.push(ovriga.map(formatRad).join('\n'))
  }

  return `

=== Vad du vet om detta företag ===
${sektioner.join('\n\n')}
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
): Promise<Array<{ from_agent: string; message_type: string; content: string; metadata: any; created_at: string }>> {
  const supabase = getServerSupabase()

  const { data } = await supabase
    .from('agent_messages')
    .select('id, from_agent, message_type, content, metadata, created_at')
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
  messages: Array<{ from_agent: string; message_type: string; content: string; metadata?: any }>
): string {
  if (messages.length === 0) return ''

  const formatted = messages.map(m => {
    const name = AGENT_DISPLAY_NAMES[m.from_agent] || m.from_agent
    const typeLabel = m.message_type === 'handoff' ? ' [HANDOFF]' : ''
    const lines = [`${name}${typeLabel}: ${m.content}`]
    if (m.metadata?.reason) lines.push(`  Anledning: ${m.metadata.reason}`)
    if (m.metadata?.context) lines.push(`  Kontext: ${JSON.stringify(m.metadata.context)}`)
    return lines.join('\n')
  })

  return `

=== Meddelanden från kollegor ===
${formatted.join('\n\n')}
=== Slut på meddelanden ===
Agera på relevanta meddelanden — vid HANDOFF, ta över ärendet direkt. Du kan skicka svar via send_agent_message.`
}
