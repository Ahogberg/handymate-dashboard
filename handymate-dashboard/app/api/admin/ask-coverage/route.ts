import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'
import type { AskCoverage } from '@/lib/matte/ask-coverage'

export const dynamic = 'force-dynamic'

const WINDOW_DAYS = 30

/**
 * GET /api/admin/ask-coverage
 *
 * Etapp L, ask-täckningsmätningen (Mission Control) — internt instrument,
 * inte en kundvänd yta. Aggregerar de senaste 30 dagarnas `matte_chat_turn`-
 * rader i kostnadsboken (cost_event, se lib/costs/record.ts) och räknar upp
 * `meta.coverage` (skrivet av byggAskCoverage i app/api/matte/chat/route.ts,
 * lib/matte/ask-coverage.ts).
 *
 * Bara RÄKNINGAR lämnas ut — aldrig enskilda rader eller något som kan
 * härledas tillbaka till ett specifikt meddelande. Instrumentet fanns till
 * för att svara "hur stor andel av det Matte ombeds göra kan hanteras
 * mekaniskt?", inte för att granska enskilda konversationer.
 *
 * Rader från INNAN Etapp L deployades saknar `meta.coverage` helt — de
 * hoppas tyst över (fail-soft per rad), inte räknas som "ingen åtgärd".
 * En saknad mätning är inte samma sak som en uppmätt nolla.
 */
export async function GET(request: NextRequest) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const supabase = getAdminSupabase()
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('cost_event')
      .select('meta')
      .eq('ref_type', 'matte_chat_turn')
      .gte('created_at', since)

    if (error) {
      // Vanligaste orsaken: v100-migrationen (cost_event) inte körd i miljön.
      // Fail-soft — adminpanelen ska visa "kunde inte läsas", inte krascha.
      console.warn('[admin/ask-coverage] cost_event kunde inte läsas:', error.message)
      return NextResponse.json({
        window_days: WINDOW_DAYS,
        turns: 0,
        med_verktyg: 0,
        kravde_beslut: 0,
        utfordes: 0,
        ingen_atgard: 0,
        per_presentation: {},
        note: `Kunde inte läsas: ${error.message}`,
      })
    }

    let turns = 0
    let medVerktyg = 0
    let kravdeBeslut = 0
    let utfordes = 0
    let ingenAtgard = 0
    const perPresentation: Record<string, number> = {}
    let rowsWithoutCoverage = 0

    for (const row of data || []) {
      const coverage = (row as { meta?: { coverage?: AskCoverage } } | null)?.meta?.coverage
      if (!coverage || coverage.version !== 1) {
        // Antingen en rad från före Etapp L, eller ett malformat meta-fält.
        // Räknas inte in — se filhuvudets not om varför en saknad mätning
        // inte är detsamma som en uppmätt nolla.
        rowsWithoutCoverage++
        continue
      }
      turns++
      if (coverage.hade_verktyg) medVerktyg++
      if (coverage.kravde_beslut) kravdeBeslut++
      if (coverage.utfordes) utfordes++
      if (coverage.ingen_atgard) ingenAtgard++
      const key = coverage.presentation_kind || 'none'
      perPresentation[key] = (perPresentation[key] || 0) + 1
    }

    return NextResponse.json({
      window_days: WINDOW_DAYS,
      turns,
      med_verktyg: medVerktyg,
      kravde_beslut: kravdeBeslut,
      utfordes,
      ingen_atgard: ingenAtgard,
      per_presentation: perPresentation,
      rows_without_coverage: rowsWithoutCoverage,
    })
  } catch (error: any) {
    console.error('[admin/ask-coverage] error:', error)
    return NextResponse.json({ error: error?.message || 'Kunde inte läsa ask-täckningen' }, { status: 500 })
  }
}
