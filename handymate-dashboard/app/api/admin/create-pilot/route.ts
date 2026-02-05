import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, logAdminAction, generatePassword, getAdminSupabase } from '@/lib/admin-auth'
import { getKnowledgeForBranch } from '@/lib/knowledge-defaults'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'

/**
 * POST /api/admin/create-pilot
 * Create a new pilot business with all defaults configured
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const supabase = getAdminSupabase()
    const body = await request.json()
    const { businessName, contactName, phone, email, branch, serviceArea } = body

    // Validate required fields
    if (!businessName || !contactName || !phone || !email || !branch) {
      return NextResponse.json({
        error: 'Missing required fields',
        required: ['businessName', 'contactName', 'phone', 'email', 'branch']
      }, { status: 400 })
    }

    // Check if email already exists
    const { data: existingUser } = await supabase.auth.admin.listUsers()
    const emailExists = existingUser?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase())
    if (emailExists) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }

    // Generate password
    const password = generatePassword(8)

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for pilots
      user_metadata: {
        business_name: businessName,
        contact_name: contactName,
        created_by_admin: true
      }
    })

    if (authError || !authData.user) {
      console.error('Auth creation error:', authError)
      return NextResponse.json({
        error: 'Failed to create user account',
        details: authError?.message
      }, { status: 500 })
    }

    // 2. Generate business ID
    const businessId = 'biz_' + Math.random().toString(36).substr(2, 12)

    // 3. Get default knowledge base for branch
    const knowledgeBase = getKnowledgeForBranch(branch)

    // 4. Default working hours
    const defaultWorkingHours = {
      monday: { active: true, start: '08:00', end: '17:00' },
      tuesday: { active: true, start: '08:00', end: '17:00' },
      wednesday: { active: true, start: '08:00', end: '17:00' },
      thursday: { active: true, start: '08:00', end: '17:00' },
      friday: { active: true, start: '08:00', end: '17:00' },
      saturday: { active: false, start: '09:00', end: '14:00' },
      sunday: { active: false, start: '10:00', end: '14:00' },
    }

    // 5. Create business_config
    const { error: businessError } = await supabase
      .from('business_config')
      .insert({
        business_id: businessId,
        user_id: authData.user.id,
        business_name: businessName,
        display_name: businessName,
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
        is_pilot: true,
        created_by_admin: adminCheck.userId,
      })

    if (businessError) {
      console.error('Business creation error:', businessError)
      // Cleanup: delete auth user
      await supabase.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({
        error: 'Failed to create business config',
        details: businessError.message
      }, { status: 500 })
    }

    // 6. Provision phone number
    let assignedPhoneNumber: string | null = null
    let phoneError: string | null = null

    try {
      const purchaseResponse = await fetch('https://api.46elks.com/a1/numbers', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          country: 'se',
          voice_start: `${APP_URL}/api/voice/incoming`,
          sms_url: `${APP_URL}/api/sms/incoming`
        }).toString()
      })

      if (purchaseResponse.ok) {
        const numberData = await purchaseResponse.json()
        assignedPhoneNumber = numberData.number

        // Update business_config with phone number
        await supabase
          .from('business_config')
          .update({
            assigned_phone_number: numberData.number,
            forward_phone_number: phone,
            elks_number_id: numberData.id,
            call_recording_enabled: true,
            call_recording_consent_message: 'Detta samtal kan komma att spelas in för kvalitets- och utbildningsändamål.'
          })
          .eq('business_id', businessId)
      } else {
        const errorText = await purchaseResponse.text()
        console.error('46elks purchase error:', errorText)
        phoneError = 'Failed to provision phone number'
      }
    } catch (error) {
      console.error('Phone provisioning error:', error)
      phoneError = 'Phone provisioning failed'
    }

    // 7. Log admin action
    await logAdminAction(
      'create_pilot',
      adminCheck.userId!,
      businessId,
      {
        businessName,
        contactName,
        email,
        branch,
        assignedPhoneNumber,
        phoneError
      }
    )

    return NextResponse.json({
      success: true,
      businessId,
      email,
      password,
      assignedPhoneNumber,
      phoneError,
      message: phoneError
        ? `Pilot created but phone provisioning failed: ${phoneError}`
        : 'Pilot created successfully'
    })

  } catch (error: any) {
    console.error('Create pilot error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to create pilot'
    }, { status: 500 })
  }
}
