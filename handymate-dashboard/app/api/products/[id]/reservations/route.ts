import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md).
export const dynamic = 'force-dynamic'

/**
 * Förbehåll kopplade från ARTIKELSIDAN (sql/v91_reservations.sql).
 *
 * Koppling kunde tidigare bara skapas från förbehålls-editorn
 * (app/dashboard/settings/reservations/page.tsx → PUT /api/reservations).
 * Den rutten ersätter HELA triggerlistan för en reservation_id, vilket gör
 * den farlig att återanvända härifrån: att hämta en reservation, lägga till
 * en produkt-trigger och PUTta tillbaka hela listan riskerar att tappa en
 * samtidig ändring av reservationens ÖVRIGA triggers (annan artikel,
 * kategori eller nyckelord).
 *
 * Den här rutten SCOPEAR i stället alltid på product_id (mönstret från
 * app/api/products/[id]/components/route.ts) — den rör ALDRIG andra
 * artiklars eller andra triggertypers rader, oavsett vilken reservation de
 * pekar på.
 *
 * Skriver till samma reservation_triggers-tabell som förbehålls-editorn
 * läser från, så en koppling gjord härifrån dyker upp där automatiskt.
 */

async function verifyProductOwnership(
  supabase: ReturnType<typeof getServerSupabase>,
  productId: string,
  businessId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('business_id', businessId)
    .maybeSingle()
  return !!data
}

/**
 * GET /api/products/[id]/reservations — förbehåll länkade till artikeln
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const productId = params.id

    if (!(await verifyProductOwnership(supabase, productId, business.business_id))) {
      return NextResponse.json({ error: 'Produkten hittades inte' }, { status: 404 })
    }

    const { data: triggers, error: trigErr } = await supabase
      .from('reservation_triggers')
      .select('reservation_id')
      .eq('product_id', productId)
      .eq('business_id', business.business_id)
      .eq('trigger_type', 'product')

    if (trigErr) throw trigErr

    const reservationIds = Array.from(new Set((triggers || []).map((t: any) => t.reservation_id)))
    if (reservationIds.length === 0) {
      return NextResponse.json({ reservations: [] })
    }

    const { data: reservations, error: resErr } = await supabase
      .from('reservation_texts')
      .select('id, title, content')
      .eq('business_id', business.business_id)
      .in('id', reservationIds)

    if (resErr) throw resErr

    return NextResponse.json({ reservations: reservations || [] })
  } catch (error: any) {
    console.error('GET product reservations error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/products/[id]/reservations — ersätt artikelns förbehållskopplingar
 * body: { reservation_ids: string[] }
 *
 * Validerar ALLA id:n mot företagets reservationsbibliotek FÖRE någon
 * skrivning. Ersätter sedan bara produkt-triggers SCOPEADE på product_id —
 * andra artiklars kopplingar och andra triggertyper (category/keyword) på
 * SAMMA reservationer rörs aldrig.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const productId = params.id
    const body = await request.json()

    if (!(await verifyProductOwnership(supabase, productId, business.business_id))) {
      return NextResponse.json({ error: 'Produkten hittades inte' }, { status: 404 })
    }

    const rawIds = Array.isArray(body.reservation_ids) ? body.reservation_ids : null
    if (!rawIds) {
      return NextResponse.json({ error: 'reservation_ids (lista) krävs' }, { status: 400 })
    }
    const reservationIds = Array.from(new Set(rawIds.filter((id: unknown) => typeof id === 'string' && id)))

    // Validera ALLA id:n innan någon skrivning sker — ett ogiltigt eller
    // främmande id ska stoppa hela anropet, inte tyst hoppas över.
    if (reservationIds.length > 0) {
      const { data: found, error: findErr } = await supabase
        .from('reservation_texts')
        .select('id')
        .eq('business_id', business.business_id)
        .in('id', reservationIds)

      if (findErr) throw findErr

      const foundIds = new Set((found || []).map((r: any) => r.id))
      const missing = reservationIds.filter(id => !foundIds.has(id))
      if (missing.length > 0) {
        return NextResponse.json(
          { error: 'Ett eller flera förbehåll hittades inte' },
          { status: 400 }
        )
      }
    }

    // Ersätt artikelns produkt-triggers: delete + insert SCOPEAT på
    // product_id (inte reservation_id) — det är det som gör den här rutten
    // säker att anropa upprepade gånger utan att röra andra kopplingar.
    const { error: delErr } = await supabase
      .from('reservation_triggers')
      .delete()
      .eq('product_id', productId)
      .eq('business_id', business.business_id)
      .eq('trigger_type', 'product')

    if (delErr) throw delErr

    if (reservationIds.length === 0) {
      return NextResponse.json({ reservations: [] })
    }

    const inserts = reservationIds.map(reservationId => ({
      business_id: business.business_id,
      reservation_id: reservationId,
      trigger_type: 'product',
      product_id: productId,
    }))

    const { error: insErr } = await supabase.from('reservation_triggers').insert(inserts)
    if (insErr) throw insErr

    const { data: reservations, error: resErr } = await supabase
      .from('reservation_texts')
      .select('id, title, content')
      .eq('business_id', business.business_id)
      .in('id', reservationIds)

    if (resErr) throw resErr

    return NextResponse.json({ reservations: reservations || [] })
  } catch (error: any) {
    console.error('PUT product reservations error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
