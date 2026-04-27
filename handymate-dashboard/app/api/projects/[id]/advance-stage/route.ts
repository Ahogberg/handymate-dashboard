import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { advanceProjectStage } from '@/lib/project-stages/automation-engine'

/**
 * POST /api/projects/[id]/advance-stage
 *
 * Flyttar projektet till nästa stage (eller en specifik stage om to_stage_id
 * skickas med — används av "klicka direkt på en stage i listan"-flödet).
 *
 * Body:
 *   {}                            → flytta till nästa stage (position + 1)
 *   { to_stage_id: 'ps-04' }      → flytta direkt till denna stage
 *
 * Triggar automationer via lib/project-stages/automation-engine. Vid
 * framgång returneras nya current_stage så modalen kan uppdatera sig
 * själv direkt utan refetch.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = params.id
  const body = await request.json().catch(() => ({}))
  const requestedStageId: string | undefined = body?.to_stage_id

  const supabase = getServerSupabase()

  // 1. Hämta projektet + nuvarande stage
  const { data: project, error: projError } = await supabase
    .from('project')
    .select('project_id, current_workflow_stage_id')
    .eq('project_id', projectId)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (projError) return NextResponse.json({ error: projError.message }, { status: 500 })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // 2. Bestäm målstage
  let targetStageId = requestedStageId

  if (!targetStageId) {
    // Räkna ut nästa stage baserat på position
    const { data: stages } = await supabase
      .from('project_workflow_stages')
      .select('id, position')
      .or(`business_id.is.null,business_id.eq.${business.business_id}`)
      .order('position', { ascending: true })

    const stageList = stages || []
    const currentStage = stageList.find(s => s.id === project.current_workflow_stage_id)

    if (!currentStage) {
      // Inget current → starta på första
      targetStageId = stageList[0]?.id
    } else {
      const next = stageList.find(s => s.position === currentStage.position + 1)
      if (!next) {
        return NextResponse.json(
          { error: 'Projekt är redan i sista stage' },
          { status: 400 }
        )
      }
      targetStageId = next.id
    }
  }

  if (!targetStageId) {
    return NextResponse.json({ error: 'Kunde inte bestämma målstage' }, { status: 400 })
  }

  // 3. Verifiera att målstage finns och är åtkomlig
  const { data: targetStage } = await supabase
    .from('project_workflow_stages')
    .select('id, name, position, color, icon')
    .eq('id', targetStageId)
    .or(`business_id.is.null,business_id.eq.${business.business_id}`)
    .maybeSingle()

  if (!targetStage) {
    return NextResponse.json({ error: 'Målstage hittades inte' }, { status: 404 })
  }

  // 4. Kör advance via engine — uppdaterar projekt + loggar history + triggar automationer
  await advanceProjectStage(projectId, targetStageId, business.business_id)

  return NextResponse.json({
    success: true,
    new_stage: targetStage,
  })
}
