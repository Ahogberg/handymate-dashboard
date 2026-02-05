import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, logAdminAction } from '@/lib/admin-auth'
import { cookies } from 'next/headers'

/**
 * GET /api/admin/impersonate/verify?token=xxx
 * Verify impersonation token and create session
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')

    if (!token || !token.startsWith('imp_')) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    const supabase = getAdminSupabase()

    // Look up the token
    const { data: tokenData, error: tokenError } = await supabase
      .from('impersonation_tokens')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })
    }

    // Check expiration
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 400 })
    }

    // Mark token as used
    await supabase
      .from('impersonation_tokens')
      .update({ used: true, used_at: new Date().toISOString() })
      .eq('token', token)

    // Get target user
    const { data: userData } = await supabase.auth.admin.getUserById(tokenData.target_user_id)

    if (!userData?.user?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Generate a magic link for the target user
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'}/dashboard`
      }
    })

    if (linkError || !linkData) {
      console.error('Magic link error:', linkError)
      return NextResponse.json({ error: 'Failed to generate login link' }, { status: 500 })
    }

    // Log successful verification
    await logAdminAction(
      'impersonate_verified',
      tokenData.admin_user_id,
      tokenData.target_business_id,
      {
        targetUserId: tokenData.target_user_id,
        targetEmail: userData.user.email
      }
    )

    // Set impersonation cookie
    const cookieStore = await cookies()
    cookieStore.set('handymate_impersonating', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/'
    })

    cookieStore.set('handymate_admin_id', tokenData.admin_user_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/'
    })

    // Redirect to the magic link
    // The magic link will authenticate the user and redirect to dashboard
    const magicLink = linkData.properties?.action_link

    if (magicLink) {
      return NextResponse.redirect(magicLink)
    }

    // Fallback: return info for manual action
    return NextResponse.json({
      success: true,
      message: 'Impersonation verified. Please use the credentials to log in.',
      email: userData.user.email
    })

  } catch (error: any) {
    console.error('Verify impersonation error:', error)
    return NextResponse.json({
      error: error.message || 'Verification failed'
    }, { status: 500 })
  }
}
