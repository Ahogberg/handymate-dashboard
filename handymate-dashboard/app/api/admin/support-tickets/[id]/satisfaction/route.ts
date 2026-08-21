import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const HANDYMATE_GOOGLE_REVIEW_URL = process.env.HANDYMATE_GOOGLE_REVIEW_URL || ''

/**
 * POST /api/admin/support-tickets/[id]/satisfaction
 *
 * Trots /admin/-segmentet i sökvägen (för konsekvens med syskonrutterna för
 * detta supportärende) är denna rutt INTE administratörsskyddad. Det är
 * hantverkaren själv som svarar på "löste vi det?" i sin egen session —
 * därför verifieras kravet med den vanliga hantverkar-sessionshjälparen,
 * inte den interna teamets adminkontroll.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ogiltig JSON-body' }, { status: 400 })
  }

  const { satisfaction } = body || {}
  if (satisfaction !== 'positive' && satisfaction !== 'negative') {
    return NextResponse.json(
      { error: 'satisfaction måste vara positive eller negative' },
      { status: 400 }
    )
  }

  const supabase = getServerSupabase()

  const { data: updated, error } = await supabase
    .from('support_ticket')
    .update({ satisfaction })
    .eq('id', params.id)
    .eq('business_id', business.business_id)
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json({ error: 'Ärendet hittades inte' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    review_url: satisfaction === 'positive' && HANDYMATE_GOOGLE_REVIEW_URL
      ? HANDYMATE_GOOGLE_REVIEW_URL
      : null,
  })
}
