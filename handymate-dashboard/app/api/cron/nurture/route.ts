import { NextRequest, NextResponse } from 'next/server'
import { getDueEnrollments, processEnrollmentStep } from '@/lib/nurture'
import { getServerSupabase } from '@/lib/supabase'

/**
 * Cron job: bearbeta förfallna nurture-enrollments.
 * Använder processEnrollmentStep (interpolerar mall + skickar SMS/email +
 * avancerar steg + slutför/eskalerar). Tidigare gick cronen via embed-joins
 * (som failade pga saknade FK) + en agent-väg → INGET skickades.
 *
 * Kill-switch (samma mönster som cron/patterns): en hantverkare som
 * pausat sina agenter (agents_globally_paused) ska inte få nurture-SMS/
 * email skickade. Enrollments itereras per business — en paused business
 * skippas, resten körs vidare (inte hela cronen som avbryts).
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dueEnrollments = await getDueEnrollments(50)

    if (dueEnrollments.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'Inga väntande nurture-steg',
      })
    }

    // Kill-switch — hämta agents_globally_paused för de businesses som
    // förekommer bland dagens due enrollments (en query, inte per enrollment).
    const supabase = getServerSupabase()
    const businessIds = Array.from(new Set(dueEnrollments.map((e) => e.business_id)))
    const { data: businesses, error: bizError } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused')
      .in('business_id', businessIds)

    if (bizError) {
      console.error('[nurture] business_config error:', bizError)
    }

    const pausedBusinessIds = new Set(
      (businesses || [])
        .filter((b) => b.agents_globally_paused === true)
        .map((b) => b.business_id),
    )

    let sent = 0, completed = 0, failed = 0, skipped = 0
    for (const enrollment of dueEnrollments) {
      if (pausedBusinessIds.has(enrollment.business_id)) {
        console.log(`[nurture] skipped business ${enrollment.business_id} — agents_globally_paused`)
        skipped++
        continue
      }

      try {
        const res = await processEnrollmentStep(enrollment.id)
        if (!res.success) { failed++; continue }
        if (res.action === 'completed_and_escalated') completed++
        else sent++
      } catch (e) {
        failed++
        console.error('[nurture] processEnrollmentStep error:', enrollment.id, e)
      }
    }

    return NextResponse.json({
      success: true,
      processed: dueEnrollments.length,
      sent,
      completed,
      failed,
      skipped,
    })
  } catch (error: any) {
    console.error('Nurture cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
