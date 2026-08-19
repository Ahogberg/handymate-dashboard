import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/karin/events — lägg till en EGEN post i bolagskalendern.
 *
 * Body: `{ title: string, event_date: 'YYYY-MM-DD', note?: string }`
 *
 * Samma grind som /api/karin/calendar: moms, skatt och bolagets egna datum
 * hör till den som driver bolaget, inte en montör i förbifarten.
 *
 * Skriver BARA till karin_custom_event (sql/v160) — aldrig till någon tabell
 * de härledda myndighetsdatumen kommer ifrån. En egen post kan alltså aldrig
 * bli förväxlad med, eller skriva över, en riktig deadline.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const eventDate = body?.event_date

    if (!title) {
      return NextResponse.json({ error: 'title krävs' }, { status: 400 })
    }
    if (typeof eventDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return NextResponse.json({ error: 'event_date krävs som YYYY-MM-DD' }, { status: 400 })
    }
    const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null

    const id = 'kce_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9)
    const supabase = getServerSupabase()

    const { error } = await supabase.from('karin_custom_event').insert({
      id,
      business_id: business.business_id,
      title,
      event_date: eventDate,
      note,
      created_by: currentUser.id || null,
    })

    if (error) {
      console.error('[karin/events POST]', error.message)
      return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id })
  } catch (err: any) {
    console.error('[karin/events POST] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
