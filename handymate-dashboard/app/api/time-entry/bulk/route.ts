import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedBusiness } from '@/lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST - Bulk-operationer på tidposter
 * Body: { entry_ids: string[], action: 'mark_invoiced' | 'delete' }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const { entry_ids, action } = await request.json()

    if (!entry_ids || !Array.isArray(entry_ids) || entry_ids.length === 0) {
      return NextResponse.json({ error: 'entry_ids krävs' }, { status: 400 })
    }

    if (!['mark_invoiced', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'Ogiltig action' }, { status: 400 })
    }

    if (action === 'mark_invoiced') {
      const { data, error } = await supabase
        .from('time_entry')
        .update({ invoiced: true })
        .in('time_entry_id', entry_ids)
        .eq('business_id', business.business_id)
        .select('time_entry_id')

      if (error) throw error

      return NextResponse.json({
        success: true,
        updated: data?.length || 0
      })
    }

    if (action === 'delete') {
      // Only delete non-invoiced entries
      const { data, error } = await supabase
        .from('time_entry')
        .delete()
        .in('time_entry_id', entry_ids)
        .eq('business_id', business.business_id)
        .eq('invoiced', false)
        .select('time_entry_id')

      if (error) throw error

      return NextResponse.json({
        success: true,
        deleted: data?.length || 0
      })
    }

    return NextResponse.json({ error: 'Ogiltig action' }, { status: 400 })

  } catch (error: unknown) {
    console.error('Bulk time entry error:', error)
    const message = error instanceof Error ? error.message : 'Bulk operation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
