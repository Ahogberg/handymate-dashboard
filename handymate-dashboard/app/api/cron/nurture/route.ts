import { NextRequest, NextResponse } from 'next/server'
import { getDueEnrollments, processEnrollmentStep } from '@/lib/nurture'

/**
 * Cron job: bearbeta förfallna nurture-enrollments.
 * Använder processEnrollmentStep (interpolerar mall + skickar SMS/email +
 * avancerar steg + slutför/eskalerar). Tidigare gick cronen via embed-joins
 * (som failade pga saknade FK) + en agent-väg → INGET skickades.
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

    let sent = 0, completed = 0, failed = 0
    for (const enrollment of dueEnrollments) {
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
    })
  } catch (error: any) {
    console.error('Nurture cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
