import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * POST /api/reviews/mark-received
 *
 * Markerar att en recension faktiskt mottagits från en kund. Triggar
 * advance till ps-08 REVIEW_RECEIVED på matchande projekt.
 *
 * Anropas av:
 *   - Manuell knapp i UI (när hantverkaren ser recensionen på Google/Trustpilot)
 *   - Framtida webhooks från Trustpilot/Google Reviews-API
 *   - Approval-godkännande av en review-request (kan kopplas senare)
 *
 * Body:
 *   { customer_id: string, project_id?: string, review_url?: string }
 *
 * Returnerar:
 *   { success: boolean, project_id?: string, advanced?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { customer_id, project_id: explicitProjectId, review_url } = body || {}

    if (!customer_id && !explicitProjectId) {
      return NextResponse.json(
        { error: 'customer_id eller project_id krävs' },
        { status: 400 }
      )
    }

    const supabase = getServerSupabase()

    // 1. Hitta projektet att advance:a
    let projectId: string | null = explicitProjectId || null
    let projectCustomerId: string | null = customer_id || null

    if (!projectId && customer_id) {
      // Senaste aktivt eller nyligen-avslutat projekt för kunden — det är troligen
      // det som recensionen handlar om
      const { data: projects } = await supabase
        .from('project')
        .select('project_id, customer_id, current_workflow_stage_id, completed_at, created_at')
        .eq('business_id', business.business_id)
        .eq('customer_id', customer_id)
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
      const found = projects?.[0]
      if (found) {
        projectId = found.project_id
        projectCustomerId = found.customer_id
      }
    } else if (projectId && !customer_id) {
      const { data: p } = await supabase
        .from('project')
        .select('customer_id')
        .eq('project_id', projectId)
        .eq('business_id', business.business_id)
        .maybeSingle()
      projectCustomerId = p?.customer_id || null
    }

    // 2. Uppdatera ev. review_request-rad om en existerar (audit + dedup-skydd
    // för cron som annars skulle skicka påminnelser)
    if (projectCustomerId) {
      try {
        await supabase
          .from('review_request')
          .update({
            review_received: true,
            clicked_at: new Date().toISOString(),
            ...(review_url ? { review_url } : {}),
          })
          .eq('business_id', business.business_id)
          .eq('customer_id', projectCustomerId)
          .eq('review_received', false)
      } catch (err) {
        console.error('[reviews/mark-received] update review_request failed:', err)
      }
    }

    // 3. Advance projektet till ps-08
    let advanced = false
    if (projectId) {
      try {
        const { advanceProjectStage, SYSTEM_STAGES } = await import('@/lib/project-stages/automation-engine')
        await advanceProjectStage(projectId, SYSTEM_STAGES.REVIEW_RECEIVED, business.business_id)
        advanced = true
      } catch (err) {
        console.error('[reviews/mark-received] advanceProjectStage failed:', err)
      }
    }

    return NextResponse.json({
      success: true,
      project_id: projectId,
      advanced,
    })
  } catch (err: any) {
    console.error('[reviews/mark-received] error:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
