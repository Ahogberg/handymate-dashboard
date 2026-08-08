import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { resetDemoAccount, isError } from '@/lib/demo/seed-demo-account'

export const dynamic = 'force-dynamic'

function getAccessToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)

  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null

  const cookies: Record<string, string> = {}
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...value] = cookie.trim().split('=')
    if (name && value.length > 0) cookies[name] = value.join('=')
  }
  const legacyToken = cookies['sb-access-token'] || cookies['supabase-auth-token']
  if (legacyToken) return legacyToken

  const supabaseCookie = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/)
  if (!supabaseCookie) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(supabaseCookie[1]))
    return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : null
  } catch {
    return null
  }
}

/**
 * POST /api/admin/demo-reset
 *
 * Återställer DEMOKONTOT med färsk exempeldata inför en säljdemo. Detta är
 * en destruktiv operation (delete → insert) och skyddas därför av en hård
 * grind utöver vanlig inloggning:
 *
 *   1. getAuthenticatedBusiness — kräver inloggad session, som alla routes.
 *   2. business.business_id === process.env.DEMO_BUSINESS_ID — annars 403.
 *   3. business_users-rollen är owner/admin — annars 403.
 *   4. V99-RPC:n upprepar demo- och rollgrindarna i databasen.
 *
 * Utan DEMO_BUSINESS_ID satt i miljön svarar routen ALLTID 403, oavsett vem
 * som är inloggad. Detta gör det omöjligt att av misstag (eller avsiktligt)
 * radera en riktig kunds data — resetten kan bara någonsin köras inloggad
 * på själva demokontot, och bara mot det.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const demoBusinessId = process.env.DEMO_BUSINESS_ID
    if (!demoBusinessId || business.business_id !== demoBusinessId) {
      return NextResponse.json(
        { error: 'Det här är inte demokontot. Återställningen kan bara köras på demokontot.' },
        { status: 403 }
      )
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser) || !currentUser.user_id) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const accessToken = getAccessToken(request)
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await resetDemoAccount(
      business.business_id,
      currentUser.user_id,
      accessToken,
    )
    if (isError(result)) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[demo-reset] Error:', error)
    return NextResponse.json({ error: error.message || 'Kunde inte återställa demon' }, { status: 500 })
  }
}
