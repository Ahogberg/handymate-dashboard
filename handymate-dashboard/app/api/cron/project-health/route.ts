import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { handleProjectEvent } from '@/lib/project-ai-engine'

/**
 * POST /api/cron/project-health
 *
 * Daglig cron-endpoint som kör hälsokontroll på alla aktiva projekt.
 * Anropas av Vercel Cron eller extern scheduler.
 *
 * Headers: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Fetch all active projects (planning + active)
    const { data: projects, error } = await supabase
      .from('project')
      .select('project_id, business_id')
      .in('status', ['planning', 'active'])
      .order('updated_at', { ascending: true })
      .limit(200)

    if (error) throw error

    const results = {
      total: projects?.length || 0,
      processed: 0,
      errors: 0,
    }

    // Process each project
    for (const project of projects || []) {
      try {
        await handleProjectEvent({
          type: 'daily_health_check',
          businessId: project.business_id,
          projectId: project.project_id,
        })
        results.processed++
      } catch {
        results.errors++
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    console.error('Cron project-health error:', error)
    const message = error instanceof Error ? error.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Also support GET for Vercel Cron
export async function GET(request: NextRequest) {
  return POST(request)
}
