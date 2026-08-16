import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

/**
 * Playbook Pattern Confirmation V1 — läs-halvan (Debrief → Playbook,
 * V2-lagret, 2026-08-16). Skrivsidan (app/api/approvals/[id]/route.ts,
 * case 'playbook_pattern_confirmation') skeppades i commit 73f887ec och
 * konsumeras redan tyst av lib/ai-quote-generator.ts
 * (fetchConfirmedPatterns) — men ingen yta lät ägaren SE vad som lärts.
 * Det här är den ytan.
 *
 * Ingen owner/admin-gate: att TITTA på bekräftade mönster är inte
 * känsligt (samma resonemang som business-rules-ruttens GET) — bara att
 * SKAPA/ÄNDRA dem är det, och det sker uteslutande via
 * godkännandeflödet (pending_approvals), inte den här rutten. Den här
 * rutten är läs-only och har ingen POST/DELETE.
 *
 * job_type IS NOT NULL-filtret är medvetet: den nattliga observations-
 * pipen (lib/agents/daniel/observation-prompt.ts) skriver också
 * knowledge_type='pattern'-rader, men UTAN job_type, för ett helt annat
 * syfte (generella affärsobservationer). Utan filtret skulle den här
 * vyn blanda ihop två olika saker. Se sql/v141_business_knowledge_pattern.sql.
 *
 * Fail-safe: job_type-kolumnen kan saknas tills v141 körts manuellt.
 * Degraderar då till en tom lista (samma arSchemaSaknas-mönster som
 * fetchConfirmedPatterns), inte ett 500-fel.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  try {
    const { data, error } = await supabase
      .from('business_knowledge')
      .select('id, job_type, observation, confidence, created_at, data_basis')
      .eq('business_id', business.business_id)
      .eq('knowledge_type', 'pattern')
      .eq('status', 'active')
      .not('job_type', 'is', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[playbook/patterns] läsning misslyckades (fail-safe, tom lista):', error.message)
      if (arSchemaSaknas(error)) return NextResponse.json({ patterns: [] })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ patterns: data || [] })
  } catch (err) {
    console.error('[playbook/patterns] läsning kastade (fail-safe, tom lista):', err)
    if (arSchemaSaknas(err)) return NextResponse.json({ patterns: [] })
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
