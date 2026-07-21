import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/projects/[id]/efterkalkyl
 *
 * Motor 1 (Lärande prissättning) — steg 1, projekt-UI. Returnerar den
 * frusna project_outcome-raden för ett projekt (om den finns) + projektets
 * status, så EfterkalkylCard kan avgöra om sektionen ska visas
 * (kräver status='completed' OCH en frusen outcome-rad).
 *
 * Fail-safe läsning: om project_outcome-tabellen inte finns än
 * (v73-migrationen inte körd) degraderar vi till outcome: null istället
 * för 500 — sektionen är då bara osynlig, aldrig en trasig sida.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data: project } = await supabase
      .from('project')
      .select('project_id, status')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: outcome, error: outcomeErr } = await supabase
      .from('project_outcome')
      .select('*')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (outcomeErr) {
      console.error('[efterkalkyl] project_outcome-läsning misslyckades, degraderar till null:', outcomeErr)
      return NextResponse.json({ project_status: project.status, outcome: null })
    }

    return NextResponse.json({ project_status: project.status, outcome: outcome || null })
  } catch (error: any) {
    console.error('Get efterkalkyl error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
