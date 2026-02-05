import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, logAdminAction, getAdminSupabase } from '@/lib/admin-auth'
import { cookies } from 'next/headers'

/**
 * POST /api/admin/impersonate/[businessId]
 * Impersonate a business user (for support/debugging)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  try {
    const { businessId } = await params

    // Auth check
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const supabase = getAdminSupabase()

    // Get business config to find user_id
    const { data: business, error: businessError } = await supabase
      .from('business_config')
      .select('business_id, user_id, business_name, contact_name')
      .eq('business_id', businessId)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (!business.user_id) {
      return NextResponse.json({ error: 'Business has no associated user' }, { status: 400 })
    }

    // Generate a magic link for the target user
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: '', // Will be filled from user_id
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'}/dashboard?impersonating=true`
      }
    })

    // Alternative approach: Create a custom session token
    // For now, we'll use a simpler approach - set a cookie that indicates impersonation
    // and redirect to a special login endpoint

    // Log the impersonation attempt
    await logAdminAction(
      'impersonate_start',
      adminCheck.userId!,
      businessId,
      {
        businessName: business.business_name,
        contactName: business.contact_name,
        targetUserId: business.user_id,
        adminEmail: adminCheck.email
      }
    )

    // Get the target user's email
    const { data: userData } = await supabase.auth.admin.getUserById(business.user_id)

    if (!userData?.user?.email) {
      return NextResponse.json({ error: 'Could not find user email' }, { status: 400 })
    }

    // Generate a one-time impersonation token
    const impersonationToken = `imp_${Math.random().toString(36).substr(2, 24)}`
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    // Store token in database for verification
    const { error: tokenError } = await supabase
      .from('impersonation_tokens')
      .insert({
        token: impersonationToken,
        admin_user_id: adminCheck.userId,
        target_user_id: business.user_id,
        target_business_id: businessId,
        expires_at: expiresAt.toISOString(),
        used: false
      })

    if (tokenError) {
      // Table might not exist, create it
      console.error('Token storage error (table may not exist):', tokenError)

      // Fall back to a simpler approach - just return info for manual login
      return NextResponse.json({
        success: true,
        method: 'manual',
        businessId,
        businessName: business.business_name,
        userEmail: userData.user.email,
        message: 'Use the credentials to log in manually. Impersonation table not configured.'
      })
    }

    // Return the impersonation URL
    const impersonationUrl = `/api/admin/impersonate/verify?token=${impersonationToken}`

    return NextResponse.json({
      success: true,
      method: 'token',
      businessId,
      businessName: business.business_name,
      impersonationUrl,
      expiresAt: expiresAt.toISOString(),
      message: 'Redirect to impersonationUrl to log in as this user'
    })

  } catch (error: any) {
    console.error('Impersonate error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to impersonate'
    }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/impersonate/[businessId]
 * End impersonation session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  try {
    const { businessId } = await params

    // Auth check
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Log the end of impersonation
    await logAdminAction(
      'impersonate_end',
      adminCheck.userId!,
      businessId,
      { adminEmail: adminCheck.email }
    )

    return NextResponse.json({
      success: true,
      message: 'Impersonation session ended'
    })

  } catch (error: any) {
    console.error('End impersonation error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to end impersonation'
    }, { status: 500 })
  }
}
