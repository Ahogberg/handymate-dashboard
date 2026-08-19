import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/karin/events/[id] — tar bort en EGEN post ur bolagskalendern.
 *
 * Frågar BARA `karin_custom_event`, filtrerat på både id och
 * `business.business_id`. En härledd myndighetsdeadline finns aldrig som en
 * rad i den tabellen — den här rutten kan därför ALDRIG träffa en härledd
 * post, oavsett vilket id den får in. Samma skäl gör att en annan
 * verksamhets post aldrig kan raderas härifrån.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const id = params.id
    if (!id) return NextResponse.json({ error: 'id krävs' }, { status: 400 })

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('karin_custom_event')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) {
      console.error('[karin/events DELETE]', error.message)
      return NextResponse.json({ error: 'Kunde inte ta bort' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[karin/events DELETE] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
