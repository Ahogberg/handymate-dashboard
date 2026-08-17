import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { findKickoffCandidates } from '@/lib/playbook/kickoff-candidates'
import { proposeKickoff, type ProposeKickoffResult } from '@/lib/playbook/propose-kickoff'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/playbook-kickoff
 *
 * Playbook Kickoff Copilot V1 (tasks/todo.md "Playbook Kickoff Copilot V1
 * — 2026-08-17 (04:00)"): en gång i veckan, för varje företag, hitta
 * nyligen skapade, icke avslutade projekt vars job_type matchar ett
 * AKTIVT bekräftat mönster (Playbook Pattern Confirmation V1, natten
 * innan) och föreslå en kontrollpunkt
 * (lib/playbook/kickoff-candidates.ts + lib/playbook/propose-kickoff.ts).
 *
 * PERIODISK SVEPNING, INTE ETT SKAPANDE-HOOK: se filhuvudet i
 * lib/playbook/kickoff-candidates.ts för varför — den faktiska
 * produktionsvägen för projekt-skapande förbigår create-from-quote.ts i
 * de flesta fall (samma rotorsak som gav 29/33 projekt stage:null
 * 2026-08-13), så ett skapande-hook skulle tyst missa de flesta riktiga
 * projekt. Läser i stället NUVARANDE tillstånd, precis som fixen för den
 * buggen gjorde.
 *
 * VECKOVIS, ANNAN DAG ÄN PLAYBOOK-PATTERN: schemat "25 5 * * 4"
 * (torsdagar 05:25) i vercel.json — playbook-pattern kör tisdagar 05:20,
 * så kickoff-svepningen naturligt hinner se mönster som bekräftats sedan
 * förra tisdagen innan den själv kör. Kontrollerad mot HELA listan innan
 * commit (node -e "require('./vercel.json').crons..."), ingen exakt
 * schema-krock med någon befintlig rad.
 *
 * Fail-safe per företag OCH per kandidat: findKickoffCandidates/
 * proposeKickoff kastar aldrig, och ett företags fel får inte fälla
 * svepet för alla andra (samma mönster som cron/playbook-pattern).
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return kor()
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return kor()
}

async function kor() {
  const supabase = getServerSupabase()

  let scanned = 0
  let candidatesConsidered = 0
  let created = 0
  const results: Partial<Record<ProposeKickoffResult, number>> = {}
  const errors: string[] = []

  try {
    const { data: businesses, error: bizErr } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused')
    if (bizErr) throw bizErr

    for (const biz of businesses || []) {
      // Pausade agenter ska vara tysta — samma spärr som karin-deadlines/
      // missed-revenue/expectation-drift/playbook-pattern.
      if (biz.agents_globally_paused) continue
      scanned++
      const businessId = biz.business_id as string
      if (!businessId) continue

      try {
        const candidates = await findKickoffCandidates(supabase, businessId)
        for (const candidate of candidates) {
          candidatesConsidered++
          const result = await proposeKickoff(supabase, businessId, candidate)
          results[result] = (results[result] || 0) + 1
          if (result === 'created') created++
        }
      } catch (err: any) {
        // Ett företags fel får inte fälla svepet för alla andra.
        console.error(`[cron/playbook-kickoff] ${businessId}:`, err?.message || err)
        errors.push(`${businessId}: ${err?.message || 'okänt fel'}`)
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      scanned,
      candidates_considered: candidatesConsidered,
      created,
      results,
      errors: errors.slice(0, 10),
    })
  } catch (err: any) {
    console.error('[cron/playbook-kickoff] svepet failade:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
