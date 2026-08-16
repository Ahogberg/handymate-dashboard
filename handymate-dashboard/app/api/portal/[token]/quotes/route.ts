import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const { data: quotes, error: quotesError } = await supabase
      .from('quotes')
      .select('quote_id, title, status, total, customer_pays, rot_rut_type, rot_rut_deduction, valid_until, created_at, sent_at, accepted_at, sign_token')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .in('status', ['sent', 'opened', 'accepted', 'declined', 'expired'])
      .order('created_at', { ascending: false })

    // TD-22: tidigare bara `{ data: quotes }` — en kolumnmissmatch eller
    // RLS-miss gav en tyst tom lista med HTTP 200, ingen spår i loggen.
    if (quotesError) {
      console.error('[portal/quotes] query error:', quotesError)
      return NextResponse.json({ error: 'Kunde inte hämta offerterna just nu' }, { status: 500 })
    }

    return NextResponse.json({ quotes: quotes || [] })
  } catch (error: any) {
    console.error('Portal quotes error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
