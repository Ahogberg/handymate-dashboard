import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getDefaultStandardTexts } from '@/lib/quote-standard-text-defaults'
import { getDefaultQuoteTemplates, normalizeTemplateBranch } from '@/lib/quote-template-defaults'

function genId() {
  return 'qtpl_' + Math.random().toString(36).substr(2, 9)
}

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

    // Idempotens: hämta befintliga mallnamn för businessen och seeda bara
    // mallar vars namn INTE redan finns.
    const { data: existingRows } = await supabase
      .from('quote_templates')
      .select('name')
      .eq('business_id', businessId)

    const existingNames = new Set((existingRows || []).map(r => r.name))
    const defaultTemplates = getDefaultQuoteTemplates(branch).filter(t => !existingNames.has(t.name))

    if (defaultTemplates.length === 0) {
      return NextResponse.json({ templates: [], count: 0, alreadySeeded: true })
    }

    // Get default texts for this branch
    const defaultTexts = getDefaultStandardTexts(branch)
    const texts: Record<string, string> = {}
    for (const t of defaultTexts) {
      texts[t.text_type] = t.content
    }

    const inserts = defaultTemplates.map(t => ({
      id: genId(),
      business_id: businessId,
      branch,
      name: t.name,
      description: t.description,
      category: t.category,
      // Inlednings-/avslutningstext seedas INTE längre (pilot-beslut 2026-07)
      // — redundanta mot quotes.description. getDefaultStandardTexts()
      // returnerar inte längre dessa typer.
      not_included: texts.not_included || null,
      ata_terms: texts.ata_terms || null,
      payment_terms_text: texts.payment_terms || null,
      default_items: t.default_items,
      default_payment_plan: t.default_payment_plan,
      rot_enabled: t.rot_enabled,
      rut_enabled: t.rut_enabled,
    }))

    const { data, error } = await supabase
      .from('quote_templates')
      .insert(inserts)
      .select()

    if (error) throw error

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

    return NextResponse.json({ templates: data || [], count: inserts.length })
  } catch (error: any) {
    console.error('Seed templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
