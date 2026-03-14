import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getKnowledgeForBranch } from '@/lib/knowledge-defaults'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || !body.action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 })
    }
    const { action, data } = body

    // Skapa Supabase client med cookies (pass function reference so cookies can be written)
    const supabase = createRouteHandlerClient({ cookies })

// ==================== REGISTER ====================
if (action === 'register') {
  if (!data?.email || !data?.password || !data?.businessName || !data?.contactName) {
    return NextResponse.json({ error: 'Fyll i alla obligatoriska fält' }, { status: 400 })
  }
  const { email, password, businessName, displayName, contactName, phone, branch, serviceArea, referralCode } = data

  // 1. Skapa auth user via admin API (skippar e-postverifiering)
  const supabaseAdmin = getServerSupabase()
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      business_name: businessName,
      contact_name: contactName,
    },
  })

  if (authError) {
    console.error('Auth error:', authError)
    // Kolla om användaren redan finns
    if (authError.message?.includes('already') || authError.message?.includes('exists')) {
      return NextResponse.json({ error: 'En användare med denna e-post finns redan. Försök logga in istället.' }, { status: 400 })
    }
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'Kunde inte skapa användare' }, { status: 400 })
  }

  // Logga in användaren direkt så att session skapas
  await supabase.auth.signInWithPassword({ email, password })

  // 2. Skapa business_config
  const businessId = 'biz_' + Math.random().toString(36).substr(2, 12)

  // Default working hours
  const defaultWorkingHours = {
    monday: { active: true, start: '08:00', end: '17:00' },
    tuesday: { active: true, start: '08:00', end: '17:00' },
    wednesday: { active: true, start: '08:00', end: '17:00' },
    thursday: { active: true, start: '08:00', end: '17:00' },
    friday: { active: true, start: '08:00', end: '17:00' },
    saturday: { active: false, start: '09:00', end: '14:00' },
    sunday: { active: false, start: '10:00', end: '14:00' },
  }

  // Get branch-specific knowledge base defaults
  const knowledgeBase = getKnowledgeForBranch(branch)

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
      referred_by: referralCode || null,
    })

  if (businessError) {
    console.error('Business error:', businessError)
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: 'Kunde inte skapa företag' }, { status: 500 })
  }

  // 3. Skapa owner-rad i business_users (för team-funktioner)
  await supabaseAdmin
    .from('business_users')
    .insert({
      business_id: businessId,
      user_id: authData.user.id,
      role: 'owner',
      name: contactName,
      email: email,
      phone: phone || null,
      accepted_at: new Date().toISOString(),
      can_see_all_projects: true,
      can_see_financials: true,
      can_manage_users: true,
      can_approve_time: true,
      can_create_invoices: true,
    })

  // 4. Referral-spårning
  if (referralCode) {
    try {
      const { resolveReferralCode } = await import('@/lib/referral/codes')
      const referrerBusinessId = await resolveReferralCode(referralCode)
      if (referrerBusinessId) {
        await supabaseAdmin
          .from('referrals')
          .insert({
            referrer_business_id: referrerBusinessId,
            referred_business_id: businessId,
            referred_email: email,
            referrer_type: 'customer',
            status: 'pending',
          })
      }
    } catch (err) {
      console.error('[Register] Referral tracking failed:', err)
    }
  }

  // 5. Generera referralkod för nya företaget
  try {
    const { generateReferralCode } = await import('@/lib/referral/codes')
    await generateReferralCode(businessId, businessName)
  } catch (err) {
    console.error('[Register] Referral code generation failed:', err)
  }

  // 6. Seeding deferred to onboarding finalize (POST /api/onboarding)
  // automation_rules, lead_scoring_rules, pipeline_stages, etc. are all seeded there

  return NextResponse.json({
    success: true,
    message: 'Konto skapat!',
    businessId,
    emailConfirmationPending: false,
  })
}

// ==================== LOGIN ====================
if (action === 'login') {
  if (!data?.email || !data?.password) {
    return NextResponse.json({ error: 'Ange e-post och lösenord' }, { status: 400 })
  }
  const { email, password } = data

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    console.error('Login error:', authError)
    return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 })
  }

  // Hämta business_config (owner) eller via business_users (teammedlem)
  let business: { business_id: string; business_name: string; contact_name?: string } | null = null

  const { data: directBusiness } = await getServerSupabase()
    .from('business_config')
    .select('business_id, business_name, contact_name')
    .eq('user_id', authData.user.id)
    .single()

  if (directBusiness) {
    business = directBusiness
  } else {
    // Fallback: teammedlem → sök business_users → hämta business_config
    const { data: bu } = await getServerSupabase()
      .from('business_users')
      .select('business_id, name')
      .eq('user_id', authData.user.id)
      .eq('is_active', true)
      .single()

    if (bu) {
      const { data: bc } = await getServerSupabase()
        .from('business_config')
        .select('business_id, business_name, contact_name')
        .eq('business_id', bu.business_id)
        .single()
      if (bc) business = bc
    }
  }

  if (!business) {
    return NextResponse.json({ error: 'Inget företag kopplat till kontot' }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    businessId: business.business_id,
    businessName: business.business_name
  })
}

    // ==================== LOGOUT ====================
    if (action === 'logout') {
      await supabase.auth.signOut()
      return NextResponse.json({ success: true })
    }

    // ==================== CHECK ====================
    if (action === 'check') {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        return NextResponse.json({ authenticated: false }, { status: 401 })
      }

      // Hämta business_config (owner) eller via business_users (teammedlem)
      let business: any = null

      const { data: directBusiness } = await getServerSupabase()
        .from('business_config')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (directBusiness) {
        business = directBusiness
      } else {
        // Fallback: teammedlem → sök business_users → hämta business_config
        const { data: bu } = await getServerSupabase()
          .from('business_users')
          .select('business_id, name')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .single()

        if (bu) {
          const { data: bc } = await getServerSupabase()
            .from('business_config')
            .select('*')
            .eq('business_id', bu.business_id)
            .single()
          if (bc) business = bc
        }
      }

      if (!business) {
        return NextResponse.json({ authenticated: false }, { status: 401 })
      }

      // Resolve plan from whichever column exists
      const resolvedPlan = business.plan || business.billing_plan || business.subscription_plan || 'starter'
      const normalizedPlan = String(resolvedPlan).toLowerCase()
      const plan = normalizedPlan === 'professional' ? 'professional' : normalizedPlan === 'business' ? 'business' : 'starter'

      return NextResponse.json({
        authenticated: true,
        business: {
          business_id: business.business_id,
          business_name: business.business_name,
          contact_name: business.contact_name,
          contact_email: business.contact_email,
          plan,
          onboarding_step: business.onboarding_step ?? 1,
          onboarding_completed_at: business.onboarding_completed_at ?? null,
        }
      })
    }

    // ==================== FORGOT PASSWORD ====================
    if (action === 'forgot_password') {
      const { email } = data

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'}/auth/callback?next=/reset-password`
      })

      if (error) {
        console.error('Reset password error:', error)
      }

      // Returnera alltid success för säkerhet
      return NextResponse.json({ success: true })
    }

    // ==================== RESET PASSWORD ====================
    if (action === 'reset_password') {
      const { password } = data

      const { error } = await supabase.auth.updateUser({
        password
      })

      if (error) {
        console.error('Update password error:', error)
        return NextResponse.json({ error: 'Kunde inte uppdatera lösenord' }, { status: 400 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  } catch (error: any) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
