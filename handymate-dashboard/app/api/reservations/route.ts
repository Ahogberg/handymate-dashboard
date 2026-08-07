import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET  /api/reservations?include=triggers — hela reservationsbiblioteket
 * POST /api/reservations                  — skapa egen reservation
 * PUT  /api/reservations                  — uppdatera (inkl. återaktivera muted)
 * DELETE /api/reservations?id=...         — ta bort
 *
 * Biblioteket laddas EN gång när offert-editorn monteras och matchas sedan
 * klient-side (lib/reservations/match.ts) — inga serveranrop per tangenttryck.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const include = request.nextUrl.searchParams.get('include')

    const { data: reservations, error } = await supabase
      .from('reservation_texts')
      .select('*')
      .eq('business_id', business.business_id)
      .order('sort_order')
      .order('title')

    if (error) {
      // Innan sql/v91 körts finns inte tabellen. Ett tomt bibliotek är rätt
      // svar då — editorn visar helt enkelt inga förslag i stället för att
      // krascha offertbygget.
      console.warn('[reservations] uppslag misslyckades (tomt bibliotek):', error.message)
      return NextResponse.json({ reservations: [] })
    }

    let result: any[] = reservations || []

    if (include === 'triggers' && result.length > 0) {
      const { data: triggers, error: trigErr } = await supabase
        .from('reservation_triggers')
        .select('*')
        .eq('business_id', business.business_id)
        .in('reservation_id', result.map(r => r.id))

      if (trigErr) {
        console.warn('[reservations] triggers-uppslag misslyckades:', trigErr.message)
        result = result.map(r => ({ ...r, triggers: [] }))
      } else {
        const byReservation: Record<string, any[]> = {}
        for (const t of triggers || []) {
          if (!byReservation[t.reservation_id]) byReservation[t.reservation_id] = []
          byReservation[t.reservation_id].push(t)
        }
        result = result.map(r => ({ ...r, triggers: byReservation[r.id] || [] }))
      }
    }

    return NextResponse.json({ reservations: result })
  } catch (error: any) {
    console.error('GET reservations error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const title = (body.title || '').trim()
    const content = (body.content || '').trim()
    if (!title || !content) {
      return NextResponse.json({ error: 'Rubrik och text krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const id = `res_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    const { error } = await supabase.from('reservation_texts').insert({
      id,
      business_id: business.business_id,
      title,
      content,
      source: 'custom',
      sort_order: Number(body.sort_order) || 999,
    })
    if (error) throw error

    const triggers: Array<{ trigger_type: string; category_slug?: string; keyword?: string; product_id?: string }> =
      Array.isArray(body.triggers) ? body.triggers : []

    if (triggers.length > 0) {
      const { error: trigErr } = await supabase.from('reservation_triggers').insert(
        triggers.map((t, i) => ({
          id: `restrig_${id}_${i}`,
          business_id: business.business_id,
          reservation_id: id,
          trigger_type: t.trigger_type,
          category_slug: t.trigger_type === 'category' ? t.category_slug : null,
          keyword: t.trigger_type === 'keyword' ? (t.keyword || '').toLowerCase() : null,
          product_id: t.trigger_type === 'product' ? t.product_id : null,
        })),
      )
      if (trigErr) throw trigErr
    }

    return NextResponse.json({ success: true, id })
  } catch (error: any) {
    console.error('POST reservations error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: 'id krävs' }, { status: 400 })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.title !== undefined) updates.title = String(body.title).trim()
    if (body.content !== undefined) updates.content = String(body.content).trim()
    if (body.is_active !== undefined) updates.is_active = !!body.is_active
    if (body.suggest_enabled !== undefined) {
      updates.suggest_enabled = !!body.suggest_enabled
      // "Föreslå igen" ska ge reservationen en ärlig omstart, inte tystas
      // direkt igen av gamla avvisningar.
      if (body.suggest_enabled) updates.consecutive_rejects = 0
    }
    if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order) || 0

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('reservation_texts')
      .update(updates)
      .eq('id', body.id)
      .eq('business_id', business.business_id)
    if (error) throw error

    // Triggrarna ersätts som en HELHET när de skickas med (spår C3).
    //
    // Delvisa uppdateringar hade krävt id:n på klientsidan och gett en tyst
    // asymmetri: en borttagen trigger är inte samma sak som en utelämnad.
    // Utelämnat fält → triggrarna rörs inte alls, så en ren titeländring
    // aldrig råkar radera kopplingarna.
    if (Array.isArray(body.triggers)) {
      const { error: delErr } = await supabase
        .from('reservation_triggers')
        .delete()
        .eq('reservation_id', body.id)
        .eq('business_id', business.business_id)
      if (delErr) throw delErr

      const triggers: Array<{ trigger_type: string; category_slug?: string; keyword?: string; product_id?: string }> =
        body.triggers
      if (triggers.length > 0) {
        const { error: insErr } = await supabase.from('reservation_triggers').insert(
          triggers.map((t, i) => ({
            // Tidsstämpel i nyckeln så en omskrivning aldrig krockar med de
            // rader som just raderats i samma anrop.
            id: `restrig_${body.id}_${Date.now()}_${i}`,
            business_id: business.business_id,
            reservation_id: body.id,
            trigger_type: t.trigger_type,
            category_slug: t.trigger_type === 'category' ? t.category_slug : null,
            keyword: t.trigger_type === 'keyword' ? (t.keyword || '').toLowerCase() : null,
            product_id: t.trigger_type === 'product' ? t.product_id : null,
          })),
        )
        if (insErr) throw insErr
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('PUT reservations error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const id = request.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id krävs' }, { status: 400 })

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('reservation_texts')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE reservations error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
