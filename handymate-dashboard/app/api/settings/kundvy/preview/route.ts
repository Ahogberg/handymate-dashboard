import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { normalizeAccentColor } from '@/lib/branding/get-branding'
import { buildKundvyPreviews, type KundvyConfigRow } from '@/lib/branding/kundvy-preview'
import type { KundvyOverrides } from '@/lib/branding/kundvy'

export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/kundvy/preview
 *
 * Renderar de sju kontaktpunkterna på "Så ser dina kunder dig" med
 * företagets varumärke och sidans osparade reglage (accent/logotyp) ovanpå.
 * Bara exempeldata — ingen kund läses. Samma byggare som sändvägarna, så
 * det ägaren ser är det kunden får.
 *
 * Body: { accent_color?: string | null, logo_url?: string | null }
 * Svar: { previews: KundvyPreview[] }
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !isOwnerOrAdmin(currentUser)) {
    return NextResponse.json({ error: 'Bara ägare och admin kan se varumärkessidan' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const overrides: KundvyOverrides = {}
  if (typeof body.accent_color === 'string') overrides.accent_color = normalizeAccentColor(body.accent_color)
  if (body.logo_url === null) overrides.logo_url = null
  else if (typeof body.logo_url === 'string') overrides.logo_url = body.logo_url

  const previews = buildKundvyPreviews(business as unknown as KundvyConfigRow, overrides)
  return NextResponse.json({ previews })
}
