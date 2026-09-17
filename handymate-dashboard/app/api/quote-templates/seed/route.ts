import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getDefaultStandardTexts } from '@/lib/quote-standard-text-defaults'
import { normalizeTemplateBranch } from '@/lib/quote-template-defaults'
import { seedQuoteTemplates } from '@/lib/seed-defaults'

/**
 * POST - Hämta färdiga branschmallar ("Hämta färdiga mallar för din bransch")
 *
 * Idempotent: mallar vars namn redan finns för businessen hoppas över —
 * ett dubbelklick eller en andra körning skapar aldrig dubbletter.
 * Inserterar direkt mot quote_templates (kringgår plan-kvoten i POST-
 * handlern i ../route.ts med avsikt — seedade mallar ska inte äta
 * användarens kvot, se app/api/quote-templates/route.ts).
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Get branch from business_config
    const { data: config } = await supabase
      .from('business_config')
      .select('branch')
      .eq('business_id', businessId)
      .single()

    const branch = normalizeTemplateBranch(config?.branch)

    // Delad seeder (2026-09-17): samma idempotens, jobbtypssäkring,
    // standardflagga och omkoppling som vid onboardingens finalize —
    // rutten är bara den manuella knappen till samma sak.
    const { inserted, relinked } = await seedQuoteTemplates(supabase, businessId, branch)
    if (inserted.length === 0 && relinked === 0) {
      return NextResponse.json({ templates: [], count: 0, relinked: 0, alreadySeeded: true })
    }
    const defaultTexts = getDefaultStandardTexts(branch)

    // Also seed standard texts if none exist
    const { count } = await supabase
      .from('quote_standard_texts')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)

    if ((count || 0) === 0) {
      const textInserts = defaultTexts.map(t => ({
        id: 'qst_' + Math.random().toString(36).substr(2, 9),
        business_id: businessId,
        text_type: t.text_type,
        name: t.name,
        content: t.content,
        is_default: true,
      }))

      await supabase.from('quote_standard_texts').insert(textInserts)
    }

    return NextResponse.json({ templates: inserted, count: inserted.length, relinked })
  } catch (error: any) {
    console.error('Seed templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
