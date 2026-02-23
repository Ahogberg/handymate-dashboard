import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getGoogleAuthUrl } from '@/lib/google-calendar'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/google/connect
 * Initiate Google Calendar OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.redirect(new URL('/login?redirect=/dashboard/settings', request.url))
    }

    let userId: string | null = null

    // Try to get business_users entry
    const currentUser = await getCurrentUser(request)
    if (currentUser) {
      userId = currentUser.id
    } else {
      // Fallback: create a business_users owner entry for pre-existing users
      const supabase = getServerSupabase()
      const newId = `bu_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      const { data: inserted, error: insertError } = await supabase
        .from('business_users')
        .insert({
          id: newId,
          business_id: business.business_id,
          user_id: business.user_id,
          role: 'owner',
          name: business.contact_name || 'Ägare',
          email: business.contact_email || '',
          is_active: true,
          can_see_all_projects: true,
          can_see_financials: true,
          can_manage_users: true,
          can_approve_time: true,
          can_create_invoices: true,
          accepted_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertError || !inserted) {
        console.error('Failed to create business_users entry:', insertError)
        return NextResponse.redirect(
          new URL('/dashboard/settings?tab=integrations&google=error&message=' + encodeURIComponent('Kunde inte skapa användarprofil'), request.url)
        )
      }
      userId = inserted.id
    }

    // Generate state token with business_id, user_id and timestamp
    const state = Buffer.from(
      JSON.stringify({
        business_id: business.business_id,
        user_id: userId,
        timestamp: Date.now(),
      })
    ).toString('base64')

    // Generate Google OAuth URL
    const authUrl = getGoogleAuthUrl(state)

    return NextResponse.redirect(authUrl)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('Google connect error:', msg)
    return NextResponse.redirect(
      new URL('/dashboard/settings?tab=integrations&google=error&message=' + encodeURIComponent(msg), request.url)
    )
  }
}
