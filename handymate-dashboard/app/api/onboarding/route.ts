import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { seedAllDefaults } from '@/lib/seed-defaults'

export const dynamic = 'force-dynamic'

/**
 * GET /api/onboarding
 * Hämta onboarding-progress (step + data + business info)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('business_config')
      .select('business_id, business_name, display_name, contact_name, contact_email, phone_number, branch, service_area, org_number, address, services_offered, default_hourly_rate, callout_fee, rot_enabled, rut_enabled, knowledge_base, assigned_phone_number, forward_phone_number, call_mode, phone_setup_type, lead_sources, lead_email_address, onboarding_step, onboarding_data, onboarding_completed_at, working_hours, industry')
      .eq('business_id', business.business_id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Check Google Calendar status
    let googleConnected = false
    let gmailEnabled = false
    const { data: calConn } = await supabase
      .from('calendar_connection')
      .select('id, gmail_sync_enabled')
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (calConn) {
      googleConnected = true
      gmailEnabled = calConn.gmail_sync_enabled || false
    }

    return NextResponse.json({
      ...data,
      google_connected: googleConnected,
      gmail_enabled: gmailEnabled,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('GET /api/onboarding error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * PUT /api/onboarding
 * Spara steg-progress + data
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { step, data: stepData } = body

    const supabase = getServerSupabase()

    // Build update object
    const updates: Record<string, unknown> = {}

    if (typeof step === 'number' && step >= 1 && step <= 10) {
      updates.onboarding_step = step
    }

    if (stepData && typeof stepData === 'object') {
      // Merge with existing onboarding_data
      const { data: current } = await supabase
        .from('business_config')
        .select('onboarding_data')
        .eq('business_id', business.business_id)
        .single()

      const existing = (current?.onboarding_data as Record<string, unknown>) || {}
      updates.onboarding_data = { ...existing, ...stepData }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 })
    }

    const { error } = await supabase
      .from('business_config')
      .update(updates)
      .eq('business_id', business.business_id)

    if (error) {
      console.error('PUT /api/onboarding update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('PUT /api/onboarding error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/onboarding
 * Slutför onboarding – spara all data + markera klar
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      business_name,
      contact_name,
      contact_email,
      phone_number,
      branch,
      org_number,
      address,
      service_area,
      services_offered,
      default_hourly_rate,
      callout_fee,
      rot_enabled,
      rut_enabled,
      lead_sources,
      knowledge_base,
    } = body

    const supabase = getServerSupabase()

    const updates: Record<string, unknown> = {
      onboarding_step: 10, // Mark fully complete (compat with both V1 and V2 flows)
      onboarding_completed_at: new Date().toISOString(),
    }

    // Only set non-undefined values
    if (business_name) updates.business_name = business_name
    if (contact_name) updates.contact_name = contact_name
    if (contact_email) updates.contact_email = contact_email
    if (phone_number) updates.phone_number = phone_number
    if (branch) updates.branch = branch
    if (org_number !== undefined) updates.org_number = org_number
    if (address !== undefined) updates.address = address
    if (service_area !== undefined) updates.service_area = service_area
    if (services_offered) updates.services_offered = services_offered
    if (default_hourly_rate !== undefined) updates.default_hourly_rate = default_hourly_rate
    if (callout_fee !== undefined) updates.callout_fee = callout_fee
    if (rot_enabled !== undefined) updates.rot_enabled = rot_enabled
    if (rut_enabled !== undefined) updates.rut_enabled = rut_enabled
    if (lead_sources) updates.lead_sources = lead_sources
    if (knowledge_base) updates.knowledge_base = knowledge_base

    const { error } = await supabase
      .from('business_config')
      .update(updates)
      .eq('business_id', business.business_id)

    if (error) {
      console.error('POST /api/onboarding error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Seed all defaults (idempotent — safe to run multiple times)
    const seedResult = await seedAllDefaults(
      supabase,
      business.business_id,
      branch || 'other'
    )

    return NextResponse.json({ success: true, seeded: seedResult })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('POST /api/onboarding finalize error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
