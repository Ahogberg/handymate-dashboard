import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, logAdminAction, isAdmin } from '@/lib/admin-auth'
import { cookies } from 'next/headers'

/**
 * GET /api/admin/impersonate/verify?token=xxx
 * Verify impersonation token and create session
 */
export async function GET(request: NextRequest) {
  try {
    // Kräv autentiserad admin — annars kan vem som helst med en giltig
    // token-sträng lösa in den och få en magic link till kundens konto.
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

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

    // Den admin som skapade token måste vara samma admin som löser in den.
    // Hindrar en admin från att lösa in en annan admins impersonation-token.
    if (adminCheck.userId !== tokenData.admin_user_id) {
      return NextResponse.json({ error: 'Forbidden - token belongs to another admin' }, { status: 403 })
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
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'}/dashboard`
      }
    })

    if (linkError || !linkData?.properties?.action_link) {
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
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/'
    })

    cookieStore.set('handymate_admin_id', tokenData.admin_user_id, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/'
    })

    // Always redirect — never return the magic link in JSON
    return NextResponse.redirect(linkData.properties.action_link)

  } catch (error: any) {
    console.error('Verify impersonation error:', error)
    return NextResponse.json({
      error: 'Verification failed'
    }, { status: 500 })
  }
}
