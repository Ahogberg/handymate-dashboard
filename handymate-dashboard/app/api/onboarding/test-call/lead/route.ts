import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { readTestCall, writeTestCall } from '@/lib/onboarding/test-call'

/**
 * DELETE /api/onboarding/test-call/lead — tar bort testets lead/deal, och
 * kunden ENDAST om inget annat refererar den (kunden kan ha funnits innan —
 * createLeadAndDeal dedupar på telefon; radera aldrig en riktig kund).
 * Scopat till EXAKT id:na i test_call-staten — aldrig fri radering.
 */
export async function DELETE(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const bizId = business.business_id
  const state = await readTestCall(supabase, bizId)
  if (!state.lead_id) return NextResponse.json({ ok: true, nothing_to_delete: true })

  if (state.deal_id) {
    await supabase.from('deal').delete().eq('id', state.deal_id).eq('business_id', bizId)
  }
  await supabase.from('leads').delete().eq('lead_id', state.lead_id).eq('business_id', bizId)

  if (state.customer_id) {
    const refs = await Promise.all([
      supabase.from('leads').select('lead_id', { count: 'exact', head: true }).eq('business_id', bizId).eq('customer_id', state.customer_id),
      supabase.from('deal').select('id', { count: 'exact', head: true }).eq('business_id', bizId).eq('customer_id', state.customer_id),
      supabase.from('quotes').select('quote_id', { count: 'exact', head: true }).eq('business_id', bizId).eq('customer_id', state.customer_id),
      supabase.from('invoice').select('invoice_id', { count: 'exact', head: true }).eq('business_id', bizId).eq('customer_id', state.customer_id),
    ])
    const totalRefs = refs.reduce((s, r) => s + (r.count || 0), 0)
    if (totalRefs === 0) {
      await supabase.from('customer').delete().eq('customer_id', state.customer_id).eq('business_id', bizId)
    }
  }

  await writeTestCall(supabase, bizId, { lead_id: null, customer_id: null, deal_id: null })
  return NextResponse.json({ ok: true })
}
