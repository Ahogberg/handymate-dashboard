import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { resolveCustomerPriceList } from '@/lib/ai-quote-generator'

// Auth via request.headers i importerad helper — force-dynamic obligatorisk
// (2026-08-22-klassen, se CLAUDE.md).
export const dynamic = 'force-dynamic'

/**
 * GET /api/pricing/resolve?customer_id=… (Prisslingan V2 pass 4, D3)
 *
 * Kundprislist-uppslaget fanns i TVÅ kopior: server-side
 * (resolveCustomerPriceList, AI-generatorn) och en klient-side-dubblett i
 * offert-editorns prefill som läste price_lists_v2 direkt med anon-nyckeln
 * (RLS-känslig — före v182 fick anställda tyst tomt svar). Nu EN väg:
 * klienten gör ETT fetch hit; servern äger uppslagsordningen
 * (kundens lista → segmentets → företagets default).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const customerId = request.nextUrl.searchParams.get('customer_id')
    if (!customerId) {
      return NextResponse.json({ error: 'customer_id krävs' }, { status: 400 })
    }

    // priceListId behövs av offert-editorn (som sedan hämtar den FULLA
    // listan inkl. segment/avtalsform via /api/pricing/price-lists/[id]) —
    // samma uppslagsordning som resolveCustomerPriceList, men med id:t kvar.
    const { getServerSupabase } = await import('@/lib/supabase')
    const supabase = getServerSupabase()
    let priceListId: string | null = null
    const { data: kund } = await supabase
      .from('customer')
      .select('price_list_id, segment_id')
      .eq('customer_id', customerId)
      .eq('business_id', business.business_id)
      .maybeSingle()
    if (kund) {
      priceListId = kund.price_list_id || null
      if (!priceListId && kund.segment_id) {
        const { data: seg } = await supabase
          .from('price_lists_v2')
          .select('id')
          .eq('business_id', business.business_id)
          .eq('segment_id', kund.segment_id)
          .limit(1)
          .maybeSingle()
        priceListId = seg?.id || null
      }
      if (!priceListId) {
        const { data: def } = await supabase
          .from('price_lists_v2')
          .select('id')
          .eq('business_id', business.business_id)
          .eq('is_default', true)
          .limit(1)
          .maybeSingle()
        priceListId = def?.id || null
      }
    }

    const priceList = await resolveCustomerPriceList(business.business_id, customerId)
    return NextResponse.json({ priceListId, priceList: priceList ?? null })
  } catch (error: any) {
    console.error('GET /api/pricing/resolve error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
