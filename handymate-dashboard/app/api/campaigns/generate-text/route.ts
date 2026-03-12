import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

/**
 * POST /api/campaigns/generate-text
 * Body: { type: 'reactivation'|'seasonal'|'follow_up', business_name, service_area, branch }
 * Returns AI-generated SMS text (max 160 chars) for the given campaign type.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { type } = await request.json()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    // Fetch branch and service_area from business_config (not in AuthenticatedBusiness)
    const supabase = getServerSupabase()
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('branch, service_area')
      .eq('business_id', business.business_id)
      .single()

    const businessName = business.business_name || 'Ditt Företag'
    const branch = bizConfig?.branch || 'hantverkare'
    const serviceArea = bizConfig?.service_area || 'Sverige'

    const typeDescriptions: Record<string, string> = {
      reactivation: 'Reaktivering — kontakta en kund som inte anlitat oss på länge. Påminn dem om oss och erbjud hjälp.',
      seasonal: `Säsongskampanj — tipsa om ett säsongsbetonat uppdrag (ex. vinterförberedelser, vårrenoveringen) för bransch: ${branch}.`,
      follow_up: 'Uppföljning — tacka för ett avslutat jobb och fråga om de är nöjda, erbjud nästa steg.',
    }

    const prompt = `Skriv ett kortfattat, personligt SMS (max 155 tecken) för kampanjtypen:
${typeDescriptions[type] || typeDescriptions.reactivation}

Företag: ${businessName}
Bransch: ${branch}
Område: ${serviceArea}

Regler:
- Personlig och vänlig ton, svenska
- Inkludera en tydlig uppmaning (ex. "Svara för att boka", "Hör av dig")
- Avsluta med // ${businessName}
- MAX 155 tecken INKLUSIVE företagssignaturen
- Returnera BARA SMS-texten, inget annat`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : ''

    // Ensure max 160 chars
    const truncated = text.length > 160 ? text.substring(0, 157) + '...' : text

    return NextResponse.json({ text: truncated, length: truncated.length })
  } catch (error: any) {
    console.error('[campaigns/generate-text] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
