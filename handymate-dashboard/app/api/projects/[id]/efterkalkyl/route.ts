import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'


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

    // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()

    const { data: project, error: projectError } = await supabase
      .from('project')
      .select('project_id, status')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (projectError) {
      console.error('[efterkalkyl] projektläsning misslyckades:', projectError)
      return NextResponse.json({ error: 'Projektet kunde inte läsas' }, { status: 500 })
    }
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

    // Förväntad marginal vid accept (v120) — egen defensiv query, en 42703
    // (kolumnen inte skapad än) får aldrig fälla hela sidan. Bara relevant
    // när efterkalkylen faktiskt har en offert att jämföra med.
    let expectedMarginSnapshot: unknown = null
    const quoteId = (outcome as { quote_id?: string | null } | null)?.quote_id
    if (quoteId) {
      try {
        const { data: quoteRow, error: quoteErr } = await supabase
          .from('quotes')
          .select('expected_margin_snapshot')
          .eq('quote_id', quoteId)
          .eq('business_id', business.business_id)
          .maybeSingle()
        if (quoteErr) {
          console.warn('[efterkalkyl] expected_margin_snapshot-läsning misslyckades (icke-blockerande):', quoteErr.message)
        } else {
          expectedMarginSnapshot = quoteRow?.expected_margin_snapshot || null
        }
      } catch (err) {
        console.warn('[efterkalkyl] oväntat fel vid expected_margin_snapshot-läsning (icke-blockerande):', err)
      }
    }

    // ÄTA-sammanställning för Project Closeout-skärmen (2026-08-13) — antal
    // ÄTA-förslag som förekommit på projektet, oavsett utfall (godkänt/
    // avvisat/väntande). ata_signed_kr på outcome-raden är BELOPPET av de
    // signerade — den här räknar hur många som HITTADES, en annan siffra.
    // Icke-blockerande: en trasig räkning ska aldrig fälla hela sidan.
    let ataCount: number | null = null
    try {
      const { count, error: ataErr } = await supabase
        .from('pending_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.business_id)
        .eq('approval_type', 'create_ata_draft')
        .contains('payload', { project_id: params.id })
      if (ataErr) {
        console.warn('[efterkalkyl] ÄTA-räkning misslyckades (icke-blockerande):', ataErr.message)
      } else {
        ataCount = count ?? 0
      }
    } catch (err) {
      console.warn('[efterkalkyl] oväntat fel vid ÄTA-räkning (icke-blockerande):', err)
    }

    return NextResponse.json({
      project_status: project.status,
      outcome: outcome || null,
      expected_margin_snapshot: expectedMarginSnapshot,
      ata_count: ataCount,
    })
  } catch (error: any) {
    console.error('Get efterkalkyl error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
