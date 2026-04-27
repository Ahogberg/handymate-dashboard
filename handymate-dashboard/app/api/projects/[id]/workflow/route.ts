import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/projects/[id]/workflow
 *
 * Returnerar projektets workflow-stages (8 system-stages från
 * project_workflow_stages) berikade med status (done | current | upcoming)
 * + planerade datum från milestones + senaste AI-automation.
 *
 * Body-shape (matchar ProjectStageModal-komponenten):
 *   {
 *     project: { id, name, customer_name, amount, dates, category },
 *     current_stage: { id, name, position, color, icon } | null,
 *     stages: [{ id, name, position, color, icon, status,
 *                completed_at, planned_date }],
 *     latest_automation: { agent, action, rule_name, action_type, created_at } | null
 *   }
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const projectId = params.id

  // 1. Projekt + kund
  const { data: project, error: projectError } = await supabase
    .from('project')
    .select('project_id, name, customer_id, budget_amount, start_date, end_date, current_workflow_stage_id, workflow_stage_history, project_type')
    .eq('project_id', projectId)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  let customerName: string | null = null
  if (project.customer_id) {
    const { data: cust } = await supabase
      .from('customer')
      .select('name')
      .eq('customer_id', project.customer_id)
      .maybeSingle()
    customerName = cust?.name || null
  }

  // 2. Alla system-stages + business-egna stages
  const { data: stagesRaw } = await supabase
    .from('project_workflow_stages')
    .select('id, name, position, color, icon, is_system, business_id')
    .or(`business_id.is.null,business_id.eq.${business.business_id}`)
    .order('position', { ascending: true })

  const stages = stagesRaw || []
  const currentStageId = project.current_workflow_stage_id || null
  const currentStage = stages.find(s => s.id === currentStageId) || null
  const currentPosition = currentStage?.position ?? 0

  // 3. Stage-history för completed_at-tidpunkter
  const history: Array<{ stage_id: string; entered_at: string; previous_stage_id: string | null }> =
    Array.isArray(project.workflow_stage_history) ? project.workflow_stage_history : []

  // 4. Milestones för planned_date per stage (om kopplat via metadata)
  const { data: milestones } = await supabase
    .from('project_milestone')
    .select('milestone_id, name, due_date, status')
    .eq('project_id', projectId)
    .eq('business_id', business.business_id)
    .order('due_date', { ascending: true })

  // 5. Senaste AI-automation för projektet
  const { data: latestAutomation } = await supabase
    .from('v3_automation_logs')
    .select('agent_id, rule_name, action_type, status, created_at, context')
    .eq('business_id', business.business_id)
    .eq('trigger_type', 'project_stage_change')
    .contains('context', { project_id: projectId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const enrichedStages = stages.map(stage => {
    let status: 'done' | 'current' | 'upcoming'
    if (stage.position < currentPosition) status = 'done'
    else if (stage.position === currentPosition) status = 'current'
    else status = 'upcoming'

    // completed_at: hitta entered_at för NÄSTA stage (= när denna stage blev klar)
    // För current/upcoming → null
    let completedAt: string | null = null
    if (status === 'done') {
      const nextStage = stages.find(s => s.position === stage.position + 1)
      if (nextStage) {
        const entry = history.find(h => h.stage_id === nextStage.id)
        completedAt = entry?.entered_at || null
      }
    }

    // planned_date: hitta milestone vars name matchar (loose match) — annars null
    const matchedMilestone = (milestones || []).find(m =>
      m.name?.toLowerCase().includes(stage.name.toLowerCase().split(' ')[0])
    )
    const plannedDate = matchedMilestone?.due_date || null

    return {
      id: stage.id,
      name: stage.name,
      position: stage.position,
      color: stage.color,
      icon: stage.icon,
      status,
      completed_at: completedAt,
      planned_date: plannedDate,
    }
  })

  return NextResponse.json({
    project: {
      id: project.project_id,
      name: project.name,
      customer_name: customerName,
      amount: project.budget_amount,
      start_date: project.start_date,
      end_date: project.end_date,
      category: project.project_type || null,
    },
    current_stage: currentStage
      ? {
          id: currentStage.id,
          name: currentStage.name,
          position: currentStage.position,
          color: currentStage.color,
          icon: currentStage.icon,
        }
      : null,
    stages: enrichedStages,
    latest_automation: latestAutomation
      ? {
          agent: latestAutomation.agent_id || 'matte',
          action: (latestAutomation.context as any)?.action_text
            || latestAutomation.rule_name
            || 'Stage uppdaterad',
          rule_name: latestAutomation.rule_name,
          action_type: latestAutomation.action_type,
          created_at: latestAutomation.created_at,
        }
      : null,
  })
}
