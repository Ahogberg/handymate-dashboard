import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

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

    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { error } = await supabase
      .from('calendar_connection')
      .delete()
      .eq('business_user_id', currentUser.id)
      .eq('provider', 'google')

    if (error) {
      console.error('Error deleting calendar connection:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'Google Calendar disconnected successfully',
    })
  } catch (error: unknown) {
    console.error('Google disconnect error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
