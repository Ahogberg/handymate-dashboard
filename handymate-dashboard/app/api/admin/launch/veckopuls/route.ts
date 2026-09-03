import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin } from '@/lib/admin-auth'
import { hamtaVeckopuls } from '@/lib/launch-desk/veckopuls'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/launch/veckopuls — "ett tal per fredag"
 * (docs/gtm/SALJMASKINEN.md, tasks/plan-veckopuls.md). Panelen överst i
 * Launch Desk (app/admin/launch/page.tsx). hamtaVeckopuls är fail-soft per
 * fråga, så den här rutten returnerar alltid 200 för en inloggad admin.
 */
export async function GET(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const supabase = getAdminSupabase()
  const veckopuls = await hamtaVeckopuls(supabase)
  return NextResponse.json(veckopuls)
}
