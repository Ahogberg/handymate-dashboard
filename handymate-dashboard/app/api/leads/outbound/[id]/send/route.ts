import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { sendLetter } from '@/lib/leads/api/brevutskick'

/** POST — Skicka godkänt brev via DR.se */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { id } = await params
  const biz = business as any

  // Kontrollera logga
  if (!biz.logo_url) {
    return NextResponse.json({
      error: 'Ladda upp din företagslogga innan du skickar brev',
      redirect: '/dashboard/settings?tab=company',
    }, { status: 400 })
  }

  // Hämta lead
  const { data: lead, error: leadError } = await supabase
    .from('leads_outbound')
    .select('*')
    .eq('id', id)
    .eq('business_id', business.business_id)
    .single()

  if (leadError || !lead) {
    return NextResponse.json({ error: 'Lead hittades inte' }, { status: 404 })
  }

  if (lead.status !== 'approved') {
    return NextResponse.json({ error: 'Leadet måste godkännas innan det kan skickas' }, { status: 400 })
  }

  // Kontrollera kvota
  const month = new Date().toISOString().slice(0, 7)
  const { data: usage } = await supabase
    .from('leads_monthly_usage')
    .select('*')
    .eq('business_id', business.business_id)
    .eq('month', month)
    .single()

  const quota = usage?.letters_quota || (biz.leads_addon_tier === 'pro' ? 50 : 20)
  const sent = usage?.letters_sent || 0
  const isOverQuota = sent >= quota

  // Skicka via DR.se
  const result = await sendLetter(
    lead.letter_content,
    lead.property_address,
    biz.business_name
  )

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Kunde inte skicka brevet' }, { status: 500 })
  }

  // Uppdatera lead-status
  await supabase
    .from('leads_outbound')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      cost_sek: result.costCustomer,
      postnord_tracking_id: result.trackingId,
    })
    .eq('id', id)

  // Uppdatera kvota — extra brev kostar 15 kr/st
  const extraCost = isOverQuota ? result.costCustomer : 0
  await supabase
    .from('leads_monthly_usage')
    .upsert({
      business_id: business.business_id,
      month,
      letters_sent: sent + 1,
      letters_quota: quota,
      extra_letters: isOverQuota ? (usage?.extra_letters || 0) + 1 : (usage?.extra_letters || 0),
      extra_cost_sek: (usage?.extra_cost_sek || 0) + extraCost,
    }, { onConflict: 'business_id,month' })

  return NextResponse.json({
    success: true,
    trackingId: result.trackingId,
    cost: result.costCustomer,
    overQuota: isOverQuota,
  })
}
