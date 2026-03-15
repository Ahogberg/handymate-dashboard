import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getKnowledgeForBranch } from '@/lib/knowledge-defaults'

/**
 * POST /api/auth/register - Registrera nytt konto
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { email, password, businessName, displayName, contactName, phone, branch, serviceArea } = body

    if (!email || !password || !businessName || !contactName) {
      return NextResponse.json({ error: 'Fyll i alla obligatoriska fält' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          business_name: businessName,
          contact_name: contactName
        }
      }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Kunde inte skapa användare' }, { status: 400 })
    }

    const businessId = 'biz_' + Math.random().toString(36).substr(2, 12)

    const defaultWorkingHours = {
      monday: { active: true, start: '08:00', end: '17:00' },
      tuesday: { active: true, start: '08:00', end: '17:00' },
      wednesday: { active: true, start: '08:00', end: '17:00' },
      thursday: { active: true, start: '08:00', end: '17:00' },
      friday: { active: true, start: '08:00', end: '17:00' },
      saturday: { active: false, start: '09:00', end: '14:00' },
      sunday: { active: false, start: '10:00', end: '14:00' },
    }

    const knowledgeBase = getKnowledgeForBranch(branch)

    const supabaseAdmin = getServerSupabase()
    const { error: businessError } = await supabaseAdmin
      .from('business_config')
      .insert({
        business_id: businessId,
        user_id: authData.user.id,
        business_name: businessName,
        display_name: displayName || businessName,
        contact_name: contactName,
        contact_email: email,
        phone_number: phone,
        branch: branch,
        service_area: serviceArea || null,
        subscription_status: 'trial',
        subscription_plan: 'starter',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        working_hours: defaultWorkingHours,
        call_mode: 'human_first',
        knowledge_base: knowledgeBase,
        website_api_key: `HM-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      })

    if (businessError) {
      await getServerSupabase().auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: 'Kunde inte skapa företag' }, { status: 500 })
    }

    // Skapa owner-rad i business_users
    const ownerId = 'bu_' + Math.random().toString(36).substr(2, 12)
    await supabaseAdmin
      .from('business_users')
      .insert({
        id: ownerId,
        business_id: businessId,
        user_id: authData.user.id,
        role: 'owner',
        name: contactName,
        email: email,
        phone: phone || null,
        is_active: true,
        can_see_all_projects: true,
        can_see_financials: true,
        can_manage_users: true,
        can_approve_time: true,
        can_create_invoices: true,
        accepted_at: new Date().toISOString(),
      })

    const emailConfirmationPending = !authData.session

    return NextResponse.json({
      success: true,
      message: emailConfirmationPending
        ? 'Konto skapat! Kolla din e-post för att verifiera kontot.'
        : 'Konto skapat!',
      businessId,
      emailConfirmationPending
    })
  } catch (error: any) {
    console.error('Register error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
