import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mission/[id]/resolve — avsluta ett aktivt uppdrag
 * (Goal-to-Plan V1, Etapp A). Body: { action: 'cancel' | 'complete' }.
 *
 * Bara aktiva uppdrag kan avslutas (status-CHECKen i sql/v144 kräver
 * resolved_at på varje slutläge). Ett redan avslutat, någon annans eller
 * ett obefintligt uppdrag → 404. Saknas tabellen finns inget uppdrag att
 * avsluta — också 404, aldrig ett kastat fel.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const action = body?.action
    if (action !== 'cancel' && action !== 'complete') {
      return NextResponse.json({ error: 'Ogiltig åtgärd — ange cancel eller complete' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('mission')
      .update({
        status: action === 'cancel' ? 'cancelled' : 'completed',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .eq('status', 'active')
      .select('id, status, resolved_at')
      .maybeSingle()

    if (error) {
      console.warn('[mission/resolve] uppdatering misslyckades (svarar 404):', error.message)
      return NextResponse.json({ error: 'Uppdraget hittades inte' }, { status: 404 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Uppdraget hittades inte' }, { status: 404 })
    }

    return NextResponse.json({ mission: data })
  } catch (error: any) {
    console.error('POST /api/mission/[id]/resolve error:', error)
    return NextResponse.json({ error: 'Kunde inte avsluta uppdraget' }, { status: 500 })
  }
}
