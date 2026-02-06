import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getKnowledgeForBranch } from '@/lib/knowledge-defaults'

// Admin client för att skapa business_config (runtime initialization)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()

    // Skapa Supabase client med cookies (pass function reference so cookies can be written)
    const supabase = createRouteHandlerClient({ cookies })

// ==================== REGISTER ====================
if (action === 'register') {
  const { email, password, businessName, displayName, contactName, phone, branch, serviceArea } = data

  // 1. Skapa auth user
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
    console.error('Auth error:', authError)
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'Kunde inte skapa användare' }, { status: 400 })
  }

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

  const supabaseAdmin = getSupabaseAdmin()
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
    })

  if (businessError) {
    console.error('Business error:', businessError)
    await getSupabaseAdmin().auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: 'Kunde inte skapa företag' }, { status: 500 })
  }

  // Kontrollera om email confirmation behövs
  const emailConfirmationPending = !authData.session

  return NextResponse.json({
    success: true,
    message: emailConfirmationPending
      ? 'Konto skapat! Kolla din e-post för att verifiera kontot.'
      : 'Konto skapat!',
    businessId,
    emailConfirmationPending
  })
}

// ==================== LOGIN ====================
if (action === 'login') {
  const { email, password } = data

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (authError) {
    console.error('Login error:', authError)
    return NextResponse.json({ error: 'Fel e-post eller lösenord' }, { status: 401 })
  }

  // Hämta business_config
  const { data: business, error: businessError } = await getSupabaseAdmin()
    .from('business_config')
    .select('business_id, business_name, contact_name')
    .eq('user_id', authData.user.id)
    .single()

  if (businessError || !business) {
    console.error('Business lookup error:', businessError)
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

      // Hämta business_config
      const { data: business } = await getSupabaseAdmin()
        .from('business_config')
        .select('business_id, business_name, contact_name, contact_email')
        .eq('user_id', session.user.id)
        .single()

      if (!business) {
        return NextResponse.json({ authenticated: false }, { status: 401 })
      }

      return NextResponse.json({ 
        authenticated: true,
        business
      })
    }

    // ==================== FORGOT PASSWORD ====================
    if (action === 'forgot_password') {
      const { email } = data

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'}/auth/callback?next=/reset-password`
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
