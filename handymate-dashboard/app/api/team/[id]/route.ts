import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'


/**
 * GET /api/team/[id] - Hämta specifik teammedlem
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !hasPermission(currentUser, 'manage_users')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()

    const { data: member, error } = await supabase
      .from('business_users')
      .select('*')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (error || !member) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ member })

  } catch (error: any) {
    console.error('Get team member error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
