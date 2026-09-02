/**
 * Branschkontext till prompterna — vad firman faktiskt gör, i firmans egna
 * ord (Branschförståelse steg 1, 2026-09-02).
 *
 * Tre källor som fanns i databasen men aldrig nådde modellen:
 *   - business_config.branch + secondary_branches (onboardingens val)
 *   - business_config.specialties (JSONB, valda i onboardingens steg 2 —
 *     skrevs av app/api/onboarding/route.ts men lästes av ingen)
 *   - job_types (företagets egna jobbtyper — namnen kunden känner igen)
 *
 * Fail-soft: ett läsfel ger null och prompten byggs utan blocket. Aldrig
 * ett kastat fel i en prompt-väg.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  describeBranches,
  getBranchDefinition,
  resolveBusinessBranch,
  type BranchId,
} from './index'

export interface TradeContext {
  primary: BranchId
  secondary: BranchId[]
  /** Ägarens valda specialiteter (fria strängar ur onboardingen). */
  specialties: string[]
  /** Företagets aktiva jobbtyper i sorteringsordning. */
  jobTypes: string[]
}

const MAX_JOB_TYPES = 40

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const v of value) {
    const s = typeof v === 'string' ? v.trim() : typeof v === 'object' && v && 'name' in v ? String((v as { name: unknown }).name ?? '').trim() : ''
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/** Ren byggare — används av loadTradeContext och av facit utan databas. */
export function buildTradeContext(input: {
  branch?: string | null
  industry?: string | null
  secondary_branches?: string[] | null
  specialties?: unknown
  job_types?: Array<{ name: string }> | string[] | null
}): TradeContext {
  const resolved = resolveBusinessBranch(input)
  return {
    primary: resolved.primary,
    secondary: resolved.secondary,
    specialties: toStringList(input.specialties),
    jobTypes: toStringList(input.job_types ?? []).slice(0, MAX_JOB_TYPES),
  }
}

export async function loadTradeContext(
  supabase: SupabaseClient,
  businessId: string,
): Promise<TradeContext | null> {
  try {
    const [bizRes, jobTypesRes] = await Promise.all([
      supabase
        .from('business_config')
        .select('branch, industry, secondary_branches, specialties')
        .eq('business_id', businessId)
        .maybeSingle(),
      supabase
        .from('job_types')
        .select('name, sort_order')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .is('archived_at', null)
        .order('sort_order', { ascending: true })
        .limit(MAX_JOB_TYPES),
    ])
    if (bizRes.error) {
      console.error('[trade-context] business_config kunde inte läsas:', bizRes.error.message)
      return null
    }
    if (!bizRes.data) return null
    if (jobTypesRes.error) {
      // Jobbtyperna är ett tillägg — branschen ska ändå nå prompten.
      console.warn('[trade-context] job_types kunde inte läsas (fortsätter utan):', jobTypesRes.error.message)
    }
    return buildTradeContext({
      ...(bizRes.data as { branch?: string | null; industry?: string | null; secondary_branches?: string[] | null; specialties?: unknown }),
      job_types: (jobTypesRes.data as Array<{ name: string }> | null) ?? [],
    })
  } catch (err) {
    console.error('[trade-context] oväntat fel (fortsätter utan branschblock):', err)
    return null
  }
}

/**
 * Promptblocket. Skrivs så att modellen får branschen som fakta och
 * jobbtyperna som ordförråd — och en uttrycklig spärr mot att hitta på
 * tjänster firman inte listat.
 */
export function formatTradeContextBlock(ctx: TradeContext | null | undefined): string {
  if (!ctx) return ''
  const def = getBranchDefinition(ctx.primary)
  const lines: string[] = ['## Bransch och inriktning']
  lines.push(`- Bransch: ${describeBranches(ctx)} — ett ${def.company}, du hjälper en ${def.worker.toLowerCase()}`)
  if (ctx.primary === 'other' && ctx.secondary.length === 0) {
    lines.push('- Branschen är allround/ej specificerad — anta ingen specialisering, fråga hellre.')
  }
  if (ctx.specialties.length > 0) {
    lines.push(`- Specialiteter (valda av ägaren): ${ctx.specialties.join(', ')}`)
  }
  if (ctx.jobTypes.length > 0) {
    lines.push(`- Företagets egna jobbtyper (använd exakt dessa namn när du pratar om jobb): ${ctx.jobTypes.join(', ')}`)
  } else {
    lines.push('- Företaget har inga jobbtyper upplagda ännu — föreslå inga egna, fråga vad de brukar göra.')
  }
  lines.push('- Erbjud aldrig tjänster som ligger utanför branschen och listan ovan utan att först fråga ägaren.')
  return lines.join('\n')
}
