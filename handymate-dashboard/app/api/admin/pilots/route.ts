import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'

interface BusinessConfig {
  business_id: string
  user_id: string
  business_name: string
  contact_name: string
  contact_email: string
  phone_number: string
  branch: string
  service_area: string | null
  assigned_phone_number: string | null
  subscription_status: string | null
  subscription_plan: string | null
  trial_ends_at: string | null
  is_pilot: boolean
  created_at: string
  onboarding_completed_at: string | null
  call_mode: string | null
  working_hours: Record<string, unknown> | null
}

/**
 * GET /api/admin/pilots
 * List all pilot businesses
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const supabase = getAdminSupabase()

    // Fetch all business configs with user info
    const { data: businesses, error } = await supabase
      .from('business_config')
      .select(`
        business_id,
        user_id,
        business_name,
        contact_name,
        contact_email,
        phone_number,
        branch,
        service_area,
        assigned_phone_number,
        subscription_status,
        subscription_plan,
        trial_ends_at,
        is_pilot,
        created_at,
        onboarding_completed_at,
        call_mode,
        working_hours
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch pilots error:', error)
      throw error
    }

    // Get user email addresses
    const typedBusinesses = businesses as BusinessConfig[] | null
    const userIds = typedBusinesses?.map(b => b.user_id).filter(Boolean) || []
    const { data: usersData } = await supabase.auth.admin.listUsers()

    const userEmails: Record<string, string> = {}
    usersData?.users?.forEach(user => {
      userEmails[user.id] = user.email || ''
    })

    // Enrich business data with user info
    const pilots = typedBusinesses?.map(business => ({
      businessId: business.business_id,
      businessName: business.business_name,
      contactName: business.contact_name,
      contactEmail: business.contact_email,
      phone: business.phone_number,
      branch: business.branch,
      serviceArea: business.service_area,
      assignedPhoneNumber: business.assigned_phone_number,
      subscriptionStatus: business.subscription_status,
      subscriptionPlan: business.subscription_plan,
      trialEndsAt: business.trial_ends_at,
      isPilot: business.is_pilot,
      createdAt: business.created_at,
      onboardingCompleted: !!business.onboarding_completed_at,
      callMode: business.call_mode,
      hasWorkingHours: !!business.working_hours,
      userEmail: userEmails[business.user_id] || business.contact_email
    })) || []

    // Calculate stats
    const stats = {
      total: pilots.length,
      pilots: pilots.filter(p => p.isPilot).length,
      trial: pilots.filter(p => p.subscriptionStatus === 'trial').length,
      active: pilots.filter(p => p.subscriptionStatus === 'active').length,
      withPhone: pilots.filter(p => p.assignedPhoneNumber).length,
      onboardingComplete: pilots.filter(p => p.onboardingCompleted).length
    }

    return NextResponse.json({
      pilots,
      stats
    })

  } catch (error: any) {
    console.error('List pilots error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to list pilots'
    }, { status: 500 })
  }
}
