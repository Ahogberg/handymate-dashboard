import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { OPEN_QUOTE_STATUSES, WON_QUOTE_STATUSES } from '@/lib/quotes/statuses'

/**
 * Hantverkarens egen "markera som accepterad".
 *
 * Rutten äger auth och statusflippen — inget mer. ALLA eftersteg (marginal,
 * projekt, deal→vunnen, projekt-AI, kommunikation, notis, automationsevent,
 * autopilot och bekräftelse till kunden) ligger i finalizeAcceptedQuote, precis
 * som för signeringen och kundportalen.
 *
 * Före 2026-09-18 hade den här rutten egna kopior av projektet, affären och en
 * egen bekräftelse — som dessutom påstod att kunden hade SIGNERAT ("Vi har
 * mottagit din signatur på offerten") fast ingen signatur fanns. Den skrev
 * också `accepted_manually`, en kolumn som aldrig funnits i prod: varje accept
 * föll därför ned i en reservgren som tappade även `accepted_at`. Kolumnen
 * `accepted_via` (v263) är markören nu, och reservgrenen är borta.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const { quoteId } = await request.json()
    if (typeof quoteId !== 'string' || !quoteId.trim()) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Hämta offert och verifiera ägarskap
    const { data: quote, error: fetchErr } = await supabase
      .from('quotes')
      .select('quote_id, status, customer_id, title, total')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (fetchErr) {
      console.error('[quotes/accept] quote read failed:', fetchErr)
      return NextResponse.json({ error: 'Offerten kunde inte läsas. Försök igen.' }, { status: 503 })
    }
    if (!quote) {
      return NextResponse.json({ error: 'Offert hittades inte' }, { status: 404 })
    }

    // Ett återförsök kvitterar accepten, men kör inte utskick/automation igen.
    // Detta kvitto intygar statusen, inte att allt efterarbete har lyckats.
    if ((WON_QUOTE_STATUSES as readonly string[]).includes(quote.status)) {
      return NextResponse.json({ success: true, deduplicated: true })
    }

    if (!(OPEN_QUOTE_STATUSES as readonly string[]).includes(quote.status)) {
      return NextResponse.json({ error: 'Offerten kan inte accepteras i nuvarande status' }, { status: 400 })
    }

    // Statusflippen, med provenance: det ska gå att se att HANTVERKAREN
    // registrerade accepten, inte kunden.
    const { data: accepted, error: updateErr } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_via: 'internt',
        accepted_by: currentUser.name || currentUser.email || null,
      })
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .eq('status', quote.status)
      .select('quote_id')
      .maybeSingle()

    if (updateErr) {
      console.error('Quote accept update error:', updateErr)
      return NextResponse.json({ error: `Databasfel: ${updateErr.message}` }, { status: 500 })
    }

    // Compare-and-set: endast anropet som faktiskt ändrade status får
    // köra eftersteg.
    if (!accepted) {
      return NextResponse.json({ error: 'Offerten har ändrats. Läs in den igen innan du fortsätter.' }, { status: 409 })
    }

    const { finalizeAcceptedQuote } = await import('@/lib/quotes/finalize-accepted')
    await finalizeAcceptedQuote(supabase, {
      businessId: business.business_id,
      quoteId,
      quoteTitle: quote.title || null,
      customerId: quote.customer_id,
      total: quote.total ?? null,
      source: 'internt',
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Accept quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
