import { NextRequest, NextResponse } from 'next/server'
import { getDueEnrollments, processEnrollmentStep } from '@/lib/nurture'

/**
 * Cron job: Bearbeta aktiva nurture-enrollments.
 * Körs var 15:e minut (eller valfritt intervall).
 * Auth: Bearer CRON_SECRET
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

    const results = []
    let successCount = 0
    let errorCount = 0

    for (const enrollment of dueEnrollments) {
      try {
        const result = await processEnrollmentStep(enrollment.id)
        results.push({
          enrollment_id: enrollment.id,
          ...result,
        })
        if (result.success) successCount++
        else errorCount++
      } catch (err: any) {
        errorCount++
        results.push({
          enrollment_id: enrollment.id,
          success: false,
          error: err.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: dueEnrollments.length,
      success_count: successCount,
      error_count: errorCount,
      results,
    })
  } catch (error: any) {
    console.error('Nurture cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
