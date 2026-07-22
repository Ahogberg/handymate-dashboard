import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { priceInclVatPerVisit } from '@/lib/agreements/pricing'

// Force-dynamic så Vercel Edge inte cachar respons — samma motivering som
// app/api/portal/[token]/projects/route.ts (token-baserade publika routes
// är cache-känsliga).
export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/[token]/agreements
 *
 * Motor 2, Etapp 2 — portal-avtalsvyn. Kundens AKTIVA serviceavtal (v1: ingen
 * kund-självservice, bara insyn — se tasks/motor2-serviceavtal-spec.md
 * "Avgränsningar v1"). Returnerar tom lista (aldrig fel) om katalogen/
 * avtalstabellen inte finns än (v74 ej körd) — samma fail-safe-mönster som
 * app/api/agreements/route.ts.
 *
 * Nästa besök: nästa OBOKADE... nej — nästa FRAMTIDA booking kopplad till
 * avtalet (agreement_id) om en sådan är schemalagd, annars avtalets egna
 * next_visit_at (Lars-cronen hinner inte alltid boka innan portalen visas).
 *
 * Pris: INKL. moms (portalen är kundvänd) — samma platta 25%-sats som
 * lib/agreements/invoice-visit.ts fakturerar med, se lib/agreements/pricing.ts.
 */

function isMissingRelationError(error: any): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = String(error?.message || '')
  return /does not exist|schema cache/i.test(message) && /relation|table|service_agreement/i.test(message)
}

async function getCustomerFromToken(token: string) {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('customer')
    .select('customer_id, business_id, portal_enabled')
    .eq('portal_token', token)
    .single()
  if (!data || !data.portal_enabled) return null
  return data
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const customer = await getCustomerFromToken(params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const supabase = getServerSupabase()

    const { data: agreementsData, error } = await supabase
      .from('service_agreement')
      .select('agreement_id, title, interval_months, price_items, next_visit_at')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json({ agreements: [] })
      }
      throw error
    }

    const agreements = agreementsData || []
    if (agreements.length === 0) {
      return NextResponse.json({ agreements: [] })
    }

    const nowIso = new Date().toISOString()

    const enriched = await Promise.all(
      agreements.map(async (a: any) => {
        let nextVisitAt: string | null = a.next_visit_at || null

        try {
          const { data: nextBooking } = await supabase
            .from('booking')
            .select('scheduled_start')
            .eq('business_id', customer.business_id)
            .eq('agreement_id', a.agreement_id)
            .gt('scheduled_start', nowIso)
            .not('status', 'in', '(cancelled,no_show)')
            .order('scheduled_start', { ascending: true })
            .limit(1)
            .maybeSingle()

          if (nextBooking?.scheduled_start) {
            nextVisitAt = nextBooking.scheduled_start
          }
        } catch (bookingErr) {
          // Fail-safe: en trasig booking-uppslagning ska inte dölja hela
          // avtalet för kunden — fall tillbaka till avtalets next_visit_at.
          console.error('[portal/agreements] booking lookup failed (non-blocking):', bookingErr)
        }

        return {
          agreement_id: a.agreement_id,
          title: a.title,
          interval_months: a.interval_months,
          next_visit_at: nextVisitAt,
          price_incl_vat: priceInclVatPerVisit(a.price_items),
        }
      }),
    )

    return NextResponse.json({ agreements: enriched })
  } catch (error: any) {
    console.error('Portal agreements error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
