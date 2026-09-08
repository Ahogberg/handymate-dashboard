import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'
import { receiveCustomerMessage } from '@/lib/portal/customer-thread'
import { REVIEW_TAGS, REVIEW_COMMENT_MAX, isLowRating } from '@/lib/portal/review'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portal/[token]/review — kundens svar på "Hur blev det?"
 *
 * Portalens beslutskort (2026-09-07). Tidigare sparades omdömet aldrig
 * (PortalReviewCTA var ett rent Google-steg). Nu:
 *   1–3  → raden sparas + kundens ord går som meddelande i tråden
 *          (customer_message + kort + push, lib/portal/customer-thread.ts)
 *          så hantverkaren kan rätta till det. Inget Google.
 *   4–5  → raden sparas; svaret bär Google-länken om firman har en.
 *
 * Ett omdöme per kund: finns en rad redan svarar vi 409 med när det
 * lämnades — kortet visar "Tack för ditt omdöme, lämnat {datum}".
 */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(
      supabase,
      params.token,
      'customer_id, business_id, portal_enabled, name, phone_number',
    )
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const rating = Number(body?.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Välj ett betyg mellan 1 och 5' }, { status: 400 })
    }
    const tags: string[] = Array.isArray(body?.tags)
      ? body.tags.filter((t: unknown) => typeof t === 'string' && (REVIEW_TAGS as readonly string[]).includes(t))
      : []
    const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, REVIEW_COMMENT_MAX) : ''
    const projectId = typeof body?.project_id === 'string' && body.project_id ? body.project_id : null
    const isLow = isLowRating(rating)

    if (isLow && !comment) {
      return NextResponse.json({ error: 'Berätta kort vad som inte blev bra' }, { status: 400 })
    }

    const { data: existing, error: existingError } = await supabase
      .from('portal_review')
      .select('id, created_at')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingError) {
      console.error('[portal/review] uppslag misslyckades:', existingError.message)
      return NextResponse.json({ error: 'Kunde inte spara omdömet just nu' }, { status: 500 })
    }
    if (existing) {
      return NextResponse.json({ error: 'Du har redan lämnat ett omdöme', left_at: existing.created_at }, { status: 409 })
    }

    const { data: review, error: insertError } = await supabase
      .from('portal_review')
      .insert({
        business_id: customer.business_id,
        customer_id: customer.customer_id,
        project_id: projectId,
        rating,
        tags,
        comment: comment || null,
        forwarded_to_thread: isLow,
      })
      .select('id, created_at')
      .single()
    if (insertError || !review) {
      console.error('[portal/review] insert misslyckades:', insertError?.message)
      return NextResponse.json({ error: 'Kunde inte spara omdömet just nu' }, { status: 500 })
    }

    // Lågt betyg: kundens egna ord in i tråden så hantverkaren hör av sig.
    // Högt betyg med text: samma väg, men märkt som omdöme — ett kort i kön
    // är det enda stället hantverkaren annars aldrig ser det.
    const stars = `${rating} av 5`
    const threadText = isLow
      ? `Omdöme ${stars} — det här blev inte bra: ${comment}`
      : [`Omdöme ${stars}`, tags.length ? tags.join(', ') : null, comment || null].filter(Boolean).join(' — ')
    await receiveCustomerMessage(supabase, {
      businessId: customer.business_id,
      customerId: customer.customer_id,
      customerName: customer.name,
      customerPhone: customer.phone_number,
      message: threadText,
    })

    // Utskickslogg: markera senaste förfrågan som besvarad (best-effort —
    // ett omdöme utan föregående förfrågan är också giltigt).
    const { error: rrError } = await supabase
      .from('review_request')
      .update({ review_received: true, clicked_at: new Date().toISOString() })
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .eq('review_received', false)
    if (rrError) console.error('[portal/review] review_request-uppdatering misslyckades:', rrError.message)

    let googleReviewUrl: string | null = null
    if (!isLow) {
      const { data: biz } = await supabase
        .from('business_config')
        .select('google_review_url')
        .eq('business_id', customer.business_id)
        .maybeSingle()
      googleReviewUrl = biz?.google_review_url || null
    }

    return NextResponse.json({
      ok: true,
      review_id: review.id,
      left_at: review.created_at,
      low: isLow,
      googleReviewUrl,
    })
  } catch (error: any) {
    console.error('Portal review error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}

/**
 * PATCH — kunden klickade "Recensera på Google". Bara en tidsstämpel på
 * senaste omdömet; vi kan aldrig se om recensionen faktiskt skrevs.
 */
export async function PATCH(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const { data: latest } = await supabase
      .from('portal_review')
      .select('id')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest) return NextResponse.json({ error: 'Inget omdöme att koppla till' }, { status: 404 })

    const { error } = await supabase
      .from('portal_review')
      .update({ google_clicked_at: new Date().toISOString() })
      .eq('id', latest.id)
      .eq('business_id', customer.business_id)
    if (error) {
      console.error('[portal/review] google_clicked_at misslyckades:', error.message)
      return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Portal review PATCH error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
