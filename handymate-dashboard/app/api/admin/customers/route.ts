import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase, logAdminAction } from '@/lib/admin-auth'

/**
 * GET /api/admin/customers — Lista alla företag
 */
export async function GET(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, contact_email, contact_name, subscription_plan, subscription_status, leads_addon, created_at, user_id')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Hämta SMS-usage denna månad
  const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const { data: smsData } = await supabase
    .from('sms_usage')
    .select('business_id, sms_sent, sms_quota')
    .eq('month', month)

  const smsMap: Record<string, { sent: number; quota: number }> = {}
  for (const s of smsData || []) {
    smsMap[s.business_id] = { sent: s.sms_sent || 0, quota: s.sms_quota || 50 }
  }

  const customers = (businesses || []).map((b: any) => ({
    ...b,
    sms_sent: smsMap[b.business_id]?.sent || 0,
    sms_quota: smsMap[b.business_id]?.quota || 50,
  }))

  return NextResponse.json({ customers })
}

/**
 * PATCH /api/admin/customers — Uppdatera plan/addons
 */
export async function PATCH(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { business_id, subscription_plan, leads_addon } = await request.json()
  if (!business_id) {
    return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
  }

  const supabase = getAdminSupabase()
  const updates: Record<string, any> = {}

  if (subscription_plan !== undefined) updates.subscription_plan = subscription_plan
  if (leads_addon !== undefined) updates.leads_addon = leads_addon

  const { error } = await supabase
    .from('business_config')
    .update(updates)
    .eq('business_id', business_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction('update_plan', adminCheck.userId!, business_id, updates)

  return NextResponse.json({ success: true })
}
