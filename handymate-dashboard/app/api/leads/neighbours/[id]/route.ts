import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * PATCH /api/leads/neighbours/[id] — Uppdatera kampanj (approve, edit, mark converted)
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = getServerSupabase()

  const updates: Record<string, unknown> = {}

  // Edit letter content
  if (body.letter_content !== undefined) {
    updates.letter_content = body.letter_content
    updates.letter_edited = true
  }

  // Approve (draft → approved)
  if (body.status === 'approved') {
    updates.status = 'approved'
  }

  // Send (approved → sent)
  if (body.status === 'sent') {
    // Get campaign
    const { data: campaign } = await supabase
      .from('leads_neighbour_campaigns')
      .select('*')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Kampanj hittades inte' }, { status: 404 })

    // Logo check
    const { data: config } = await supabase
      .from('business_config')
      .select('logo_url')
      .eq('business_id', business.business_id)
      .single()

    if (!config?.logo_url) {
      return NextResponse.json({ error: 'Logotyp krävs' }, { status: 400 })
    }

    const count = campaign.neighbour_count || 0
    const costSek = count * 15

    // Update monthly usage (shared with outbound)
    const month = new Date().toISOString().slice(0, 7)
    const { data: usage } = await supabase
      .from('leads_monthly_usage')
      .select('letters_sent, letters_quota, extra_letters, extra_cost_sek')
      .eq('business_id', business.business_id)
      .eq('month', month)
      .maybeSingle()

    const currentSent = (usage?.letters_sent || 0) + (usage?.extra_letters || 0)
    const quota = usage?.letters_quota || 20
    const withinQuota = Math.min(count, Math.max(0, quota - currentSent))
    const extraLetters = count - withinQuota
    const extraCost = extraLetters * 15

    await supabase.from('leads_monthly_usage').upsert({
      business_id: business.business_id,
      month,
      letters_sent: (usage?.letters_sent || 0) + withinQuota,
      letters_quota: quota,
      extra_letters: (usage?.extra_letters || 0) + extraLetters,
      extra_cost_sek: (usage?.extra_cost_sek || 0) + extraCost,
    }, { onConflict: 'business_id,month' })

    updates.status = 'sent'
    updates.sent_at = new Date().toISOString()
    updates.cost_sek = costSek
    updates.quota_used = withinQuota
    updates.extra_cost_sek = extraCost
  }

  // Mark conversions
  if (body.converted_count !== undefined) {
    updates.converted_count = body.converted_count
  }
  if (body.revenue_generated !== undefined) {
    updates.revenue_generated = body.revenue_generated
  }

  const { data, error } = await supabase
    .from('leads_neighbour_campaigns')
    .update(updates)
    .eq('id', params.id)
    .eq('business_id', business.business_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}
