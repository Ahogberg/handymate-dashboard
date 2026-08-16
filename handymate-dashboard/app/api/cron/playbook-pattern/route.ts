import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { proposePattern, type ProposePatternResult } from '@/lib/playbook/propose-pattern'
import { MIN_SAMPLE_SIZE } from '@/lib/playbook/detect-pattern'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/playbook-pattern
 *
 * Playbook Pattern Confirmation V1 (Debrief → Playbook, V2-lagret,
 * tasks/todo.md "Playbook Pattern Confirmation V1" 2026-08-16 natt): en
 * gång i veckan, för varje företag, hitta jobbtyper med tillräckligt
 * många bekräftade lärdomar (project_lesson) och föreslå ett
 * företagsomfattande mönster (lib/playbook/propose-pattern.ts) om ett
 * genuint upprepat tema finns.
 *
 * VECKOVIS, INTE DAGLIG: lärdomar ackumuleras långsamt (bara vid
 * projektstängning via debrief-kortet, lib/debrief/create-debrief-card.ts)
 * — ingen anledning till en ny daglig Hobby-cron-rad. Schemat
 * "20 5 * * 2" (tisdagar 05:20) i vercel.json — kontrollerad mot HELA
 * listan innan commit (node -e "require('./vercel.json').crons..."),
 * ingen exakt schema-krock med någon befintlig rad. Samma disciplin som
 * app/api/cron/expectation-drift/route.ts dokumenterade ikväll.
 *
 * ENUMERERING AV KANDIDAT-JOBBTYPER: en enkel distinct-läsning av
 * project_lesson.job_type per företag, grupperad och räknad i minnet.
 * Volymen (antal lärdomar per företag) är liten nog att detta är
 * försumbart — ingen anledning till en dyrare GROUP BY-query för V1.
 *
 * Fail-safe per företag OCH per jobbtyp: proposePattern kastar aldrig,
 * och ett företags fel får inte fälla svepet för alla andra (samma
 * mönster som expectation-drift-cronen).
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
  let jobTypesConsidered = 0
  let created = 0
  const results: Partial<Record<ProposePatternResult, number>> = {}
  const errors: string[] = []

  try {
    const { data: businesses, error: bizErr } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused')
    if (bizErr) throw bizErr

    for (const biz of businesses || []) {
      // Pausade agenter ska vara tysta — samma spärr som karin-deadlines/
      // missed-revenue/expectation-drift.
      if (biz.agents_globally_paused) continue
      scanned++
      const businessId = biz.business_id as string
      if (!businessId) continue

      try {
        const { data: lessonRows, error: lessonErr } = await supabase
          .from('project_lesson')
          .select('job_type')
          .eq('business_id', businessId)
          .not('job_type', 'is', null)

        if (lessonErr) {
          // 42P01/42703 = project_lesson finns inte än (v121 ej körd) —
          // väntat i vissa miljöer, larma inte om det.
          if ((lessonErr as any).code !== '42P01' && (lessonErr as any).code !== '42703') {
            console.error(`[cron/playbook-pattern] ${businessId}: kunde inte läsa lärdomar:`, lessonErr.message)
          }
          continue
        }

        const countByJobType: Record<string, number> = {}
        for (const row of lessonRows || []) {
          const jt = (row as any).job_type as string | null
          if (!jt) continue
          countByJobType[jt] = (countByJobType[jt] || 0) + 1
        }

        const candidateJobTypes = Object.entries(countByJobType)
          .filter(([, count]) => count >= MIN_SAMPLE_SIZE)
          .map(([jobType]) => jobType)

        for (const jobType of candidateJobTypes) {
          jobTypesConsidered++
          const result = await proposePattern(supabase, businessId, jobType)
          results[result] = (results[result] || 0) + 1
          if (result === 'created') created++
        }
      } catch (err: any) {
        // Ett företags fel får inte fälla svepet för alla andra.
        console.error(`[cron/playbook-pattern] ${businessId}:`, err?.message || err)
        errors.push(`${businessId}: ${err?.message || 'okänt fel'}`)
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      scanned,
      job_types_considered: jobTypesConsidered,
      created,
      results,
      errors: errors.slice(0, 10),
    })
  } catch (err: any) {
    console.error('[cron/playbook-pattern] svepet failade:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
