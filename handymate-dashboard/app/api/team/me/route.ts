import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission, type Permission } from '@/lib/permissions'

const PERMISSION_KEYS: Permission[] = [
  'see_all_projects',
  'see_financials',
  'manage_users',
  'approve_time',
  'create_invoices',
  'manage_settings',
]

/**
 * GET /api/team/me
 *
 * Returnerar role + permissions för current user. Mobile-appen anropar
 * den vid app-start för att hydrera klient-state med rätt rättigheter
 * istället för att gissa "owner + alla flaggor".
 *
 * Permissions beräknas via samma logik som hasPermission() i
 * lib/permissions.ts:
 *   - owner: alla 6 = true
 *   - admin: alla utom manage_settings = true
 *   - employee/project_manager/kalkylator: läs can_*-flaggorna direkt
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await getCurrentUser(request)

  // 404-fall: auth lyckades (business hittades) men ingen business_users-rad
  // matchar den inloggade användaren. Det är en data-integritetsfråga —
  // typiskt en business där auto-migrationen i sql/business_users.sql
  // aldrig körts, eller där owner-raden tagits bort manuellt.
  if (!user) {
    console.error('[team/me] 404: ingen business_users-rad för current user', {
      business_id: business.business_id,
      hint: 'getCurrentUser returnerade null trots att getAuthenticatedBusiness lyckades — kontrollera att auto-migration kört eller om owner-raden saknas',
    })
    return NextResponse.json(
      { error: 'business_users-rad saknas för denna användare' },
      { status: 404 },
    )
  }

  // Sanity: raden ska tillhöra samma business som getAuthenticatedBusiness
  // pekat ut. Om de skiljer sig är det också en data-integritetsfråga.
  if (user.business_id !== business.business_id) {
    console.error('[team/me] 404: business_users-rad pekar på annan business', {
      auth_business_id: business.business_id,
      user_business_id: user.business_id,
      user_row_id: user.id,
    })
    return NextResponse.json(
      { error: 'business_users-rad saknas för denna användare' },
      { status: 404 },
    )
  }

  const permissions = {
    see_all_projects: hasPermission(user, 'see_all_projects'),
    see_financials: hasPermission(user, 'see_financials'),
    manage_users: hasPermission(user, 'manage_users'),
    approve_time: hasPermission(user, 'approve_time'),
    create_invoices: hasPermission(user, 'create_invoices'),
    manage_settings: hasPermission(user, 'manage_settings'),
  }
  // PERMISSION_KEYS är källan till sanningen för listan ovan — om du
  // lägger till en ny permission i lib/permissions.ts ska den både listas
  // här och i const-arrayen ovan.
  void PERMISSION_KEYS

  return NextResponse.json({
    user: {
      id: user.id,
      business_id: user.business_id,
      role: user.role,
      name: user.name,
      email: user.email,
      permissions,
    },
  })
}
