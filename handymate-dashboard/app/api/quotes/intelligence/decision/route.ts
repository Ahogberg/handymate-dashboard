import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { recordLearningEvent } from '@/lib/agent/learning-engine'
import { AGENTRAD_CHOICES, buildDecisionPreference, type AgentradChoice } from '@/lib/daniel-agentrad'

export const dynamic = 'force-dynamic'

/**
 * POST /api/quotes/intelligence/decision — hantverkarens svar på Daniels
 * agentrad (lib/daniel-agentrad.ts): "Lägg till N h" eller "Behåll N h".
 *
 * Skriver ETT learning_event (quote_price_adjusted, reference_type quote)
 * med Daniels förslag och människans val. Inga timmar ändras här —
 * redigeraren är den enda platsen där offertens rader ändras. Tenant-
 * skopat: offerten måste tillhöra det inloggade företaget.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as
      | { quoteId?: unknown; choice?: unknown; suggested_hours?: unknown; quoted_hours?: unknown }
      | null
    const quoteId = typeof body?.quoteId === 'string' ? body.quoteId : ''
    if (!quoteId || !/^[a-zA-Z0-9_-]{1,160}$/.test(quoteId)) {
      return NextResponse.json({ error: 'Ogiltig offertreferens' }, { status: 400 })
    }
    const choice = body?.choice
    if (typeof choice !== 'string' || !AGENTRAD_CHOICES.includes(choice as AgentradChoice)) {
      return NextResponse.json({ error: 'Ogiltigt val' }, { status: 400 })
    }
    const suggestedHours = Number(body?.suggested_hours)
    const quotedHours = Number(body?.quoted_hours)
    if (!Number.isFinite(suggestedHours) || suggestedHours < 0 || !Number.isFinite(quotedHours) || quotedHours < 0) {
      return NextResponse.json({ error: 'Ogiltiga timmar' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('quote_id')
      .eq('business_id', business.business_id)
      .eq('quote_id', quoteId)
      .maybeSingle()
    if (quoteError) {
      return NextResponse.json({ error: 'Offerten kunde inte läsas' }, { status: 500 })
    }
    if (!quote) {
      return NextResponse.json({ error: 'Offerten hittades inte' }, { status: 404 })
    }

    const typedChoice = choice as AgentradChoice
    const chosenHours = typedChoice === 'lagg_till' ? quotedHours + suggestedHours : quotedHours
    const result = await recordLearningEvent(
      business.business_id,
      'quote_price_adjusted',
      quoteId,
      'quote',
      {
        source: 'daniel_agentrad',
        recommended_hours: quotedHours + suggestedHours,
        suggested_buffer_hours: suggestedHours,
        quoted_hours: quotedHours,
      },
      { choice: typedChoice, hours: chosenHours },
      {
        learnedPreference: buildDecisionPreference(typedChoice, typedChoice === 'lagg_till' ? suggestedHours : quotedHours),
        preferenceCategory: 'pricing',
      },
    )
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error || 'Valet kunde inte sparas' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[quote-intelligence/decision] Error:', error)
    return NextResponse.json({ error: 'Valet kunde inte sparas' }, { status: 500 })
  }
}
