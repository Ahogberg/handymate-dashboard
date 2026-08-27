import { checkFuelGate } from '@/lib/costs/fuel'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { generateStorefrontContent } from '@/lib/storefront/generate-content'

/**
 * POST /api/storefront/generate
 *
 * Manuell "Skapa min hemsida"/"Regenerera med AI"-knapp i
 * /dashboard/website. Genererar OCH publicerar direkt (isPublished:true)
 * — oförändrat beteende. Den delade genererings-kärnan ligger i
 * lib/storefront/generate-content.ts och används även av
 * app/api/cron/hemsida-forslag/route.ts (som istället sparar ett utkast,
 * isPublished:false, och lägger fram ett godkännande-kort).
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const fuel = await checkFuelGate(supabase, business.business_id)
    if (!fuel.allowed) {
      return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
    }
    const result = await generateStorefrontContent(supabase, business.business_id, { isPublished: true })

    if (!result.ok) {
      console.error('Storefront generate error:', result.error)
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, slug: result.slug })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('Storefront generate error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
