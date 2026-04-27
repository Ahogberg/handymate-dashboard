import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getStageBySlug } from '@/lib/pipeline'
import { getNextCaseNumber } from '@/lib/numbering'

/**
 * GET - Lista deals för ett företag.
 *
 * Varje deal berikas med project-data via project.deal_id-join så att
 * unified pipeline-vyn kan visa projekt-status, datum, budget och spenderat
 * på samma rad som dealen — utan separat fetch.
 *
 * Response-shape: { deals: Array<Deal & { project: ProjectSummary | null }> }
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const stageId = request.nextUrl.searchParams.get('stageId')
    const customerId = request.nextUrl.searchParams.get('customerId')

    let query = supabase
      .from('deal')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (stageId) {
      query = query.eq('stage_id', stageId)
    }

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data: deals, error } = await query

    if (error) throw error

    const dealList = deals || []

    // Hämta projekt kopplade till dessa deals (project.deal_id) i en query
    const dealIds = dealList.map((d: any) => d.id).filter(Boolean)
    let projectByDealId: Record<string, any> = {}

    if (dealIds.length > 0) {
      const { data: projects } = await supabase
        .from('project')
        .select('project_id, deal_id, name, status, start_date, end_date, progress_percent, budget_amount')
        .eq('business_id', business.business_id)
        .in('deal_id', dealIds)

      const projectList = projects || []
      const projectIds = projectList.map((p: any) => p.project_id)

      // Beräkna spenderat per projekt från time_entry (samma mönster som /api/projects)
      let spentByProjectId: Record<string, number> = {}
      if (projectIds.length > 0) {
        const { data: timeEntries } = await supabase
          .from('time_entry')
          .select('project_id, duration_minutes, hourly_rate')
          .in('project_id', projectIds)

        for (const t of (timeEntries || [])) {
          const hours = (t.duration_minutes || 0) / 60
          const amount = hours * (t.hourly_rate || 0)
          spentByProjectId[t.project_id] = (spentByProjectId[t.project_id] || 0) + amount
        }
      }

      for (const p of projectList) {
        if (!p.deal_id) continue
        projectByDealId[p.deal_id] = {
          id: p.project_id,
          name: p.name,
          status: p.status,
          start_date: p.start_date,
          end_date: p.end_date,
          progress_percent: p.progress_percent ?? 0,
          budget_sek: p.budget_amount ?? null,
          spent_sek: Math.round(spentByProjectId[p.project_id] || 0),
        }
      }
    }

    const enrichedDeals = dealList.map((d: any) => ({
      ...d,
      project: projectByDealId[d.id] || null,
    }))

    return NextResponse.json({ deals: enrichedDeals })
  } catch (error: any) {
    console.error('Get deals error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa en ny deal manuellt
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const {
      title,
      customerId,
      value,
      stageSlug,
      description,
      priority,
      job_type,
      source,
      assigned_to,
    } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Default stage to first pipeline stage
    const slug = stageSlug || 'new_inquiry'
    let stage = await getStageBySlug(business.business_id, slug)
    // Fallback: hämta första steget om slug inte matchar
    if (!stage) {
      const supabaseStage = getServerSupabase()
      const { data: firstStage } = await supabaseStage
        .from('pipeline_stage')
        .select('*')
        .eq('business_id', business.business_id)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single()
      stage = firstStage
    }
    if (!stage) {
      return NextResponse.json({ error: 'Inga pipeline-steg hittades' }, { status: 404 })
    }

    // Hämta nästa ärende-nummer från delad räknare. Samma räknare används av
    // projects, så när dealen vinner och konverteras blir project_number = "P-{N}"
    // med samma N — deal #1003 → projekt P-1003.
    const nextNumber = await getNextCaseNumber(supabase, business.business_id)

    // Insert deal
    const { data: deal, error: insertError } = await supabase
      .from('deal')
      .insert({
        business_id: business.business_id,
        title,
        customer_id: customerId || null,
        value: value || null,
        stage_id: stage.id,
        description: description || null,
        priority: priority || 'medium',
        source: source || 'manual',
        deal_number: nextNumber,
        job_type: job_type || null,
        assigned_to: assigned_to || null,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Log pipeline activity
    await supabase.from('pipeline_activity').insert({
      business_id: business.business_id,
      deal_id: deal.id,
      activity_type: 'deal_created',
      description: `Deal "${title}" skapad manuellt`,
      to_stage_id: stage.id,
      triggered_by: 'user',
    })

    return NextResponse.json({ deal })
  } catch (error: any) {
    console.error('Create deal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
