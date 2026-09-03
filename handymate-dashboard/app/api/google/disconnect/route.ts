import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { revokeGoogleAccess } from '@/lib/google-calendar'

/**
 * DELETE /api/google/disconnect
 * Disconnect Google Calendar integration
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Token måste läsas FÖRE raderingen — efteråt finns inget kvar att
    // återkalla, och behörigheten hade blivit kvar i användarens Google-konto
    // för alltid. Refresh-token först: access-token har ofta redan gått ut.
    const { data: koppling } = await supabase
      .from('calendar_connection')
      .select('refresh_token, access_token')
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')
      .maybeSingle()

    const { error } = await supabase
      .from('calendar_connection')
      .delete()
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')

    if (error) {
      console.error('Error deleting calendar connection:', error)
      throw error
    }

    // Återkallningen sker EFTER raderingen: lyckas raderingen men inte
    // återkallningen är användaren ändå frånkopplad hos oss, vilket är det de
    // bad om. Omvänd ordning hade kunnat lämna en halvraderad koppling kvar om
    // Google svarade trögt.
    let revoked = false
    let revokeError: string | undefined
    const token = koppling?.refresh_token || koppling?.access_token
    if (token) {
      const r = await revokeGoogleAccess(String(token))
      revoked = r.ok
      revokeError = r.error
      if (!r.ok) {
        // Icke-blockerande, men värt att synas: användaren är frånkopplad hos
        // oss medan Google fortfarande listar appen under "Appar med åtkomst".
        console.warn('[google/disconnect] behörigheten kunde inte återkallas hos Google:', r.error)
      }
    }

    return NextResponse.json({
      success: true,
      revoked,
      ...(revokeError ? { revoke_error: revokeError } : {}),
      message: revoked
        ? 'Google Calendar frånkopplad och behörigheten återkallad'
        : 'Google Calendar frånkopplad',
    })
  } catch (error: unknown) {
    console.error('Google disconnect error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
