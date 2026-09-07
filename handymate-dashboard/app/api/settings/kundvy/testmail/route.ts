import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { sendEmail } from '@/lib/email'
import { buildKundvyPreviews, type KundvyConfigRow } from '@/lib/branding/kundvy-preview'
import { KUNDVY_TOUCHPOINTS, type TouchpointId } from '@/lib/branding/kundvy'

export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/kundvy/testmail
 *
 * "Skicka det här mailet till mig" — skickar en kontaktpunkt av typen mail
 * (offertmailet eller fakturan) till den inloggade ägarens/adminens egen
 * adress, med SPARAT varumärke och exempeldata. Aldrig till någon annan:
 * mottagaren är alltid currentUser.email.
 *
 * Body: { kontaktpunkt: 'offertmail' | 'faktura' }
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !isOwnerOrAdmin(currentUser)) {
    return NextResponse.json({ error: 'Bara ägare och admin kan skicka testmail' }, { status: 403 })
  }
  const to = (currentUser.email || '').trim()
  if (!to) return NextResponse.json({ error: 'Ditt konto saknar e-postadress' }, { status: 400 })

  let body: { kontaktpunkt?: string } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const id = body.kontaktpunkt as TouchpointId
  const punkt = KUNDVY_TOUCHPOINTS.find((t) => t.id === id)
  if (!punkt || punkt.kind !== 'email') {
    return NextResponse.json({ error: 'Bara mail kan skickas som test' }, { status: 400 })
  }

  const [preview] = buildKundvyPreviews(business as unknown as KundvyConfigRow, undefined, [id])
  if (!preview?.html || !preview.subject) {
    return NextResponse.json({ error: 'Kunde inte bygga mailet' }, { status: 500 })
  }

  const result = await sendEmail({
    to,
    subject: `[Test] ${preview.subject}`,
    html: preview.html,
    fromName: business.business_name || 'Handymate',
    businessId: business.business_id,
  })
  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Mailet kunde inte skickas' }, { status: 502 })
  }
  return NextResponse.json({ success: true, to })
}
