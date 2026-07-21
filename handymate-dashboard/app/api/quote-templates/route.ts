import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getFeatureLimit, PlanType } from '@/lib/feature-gates'
import { getAllDefaultTemplateNames } from '@/lib/quote-template-defaults'

/**
 * sql/v72_quote_template_terms.sql lägger till terms_text-kolumnen men körs
 * MANUELLT av Andreas i Supabase SQL Editor efter merge — det finns alltså
 * ett fönster där koden är deployad men kolumnen inte finns än. PostgREST
 * svarar då med PGRST204 ("column ... not found in schema cache"). Vi
 * försöker om utan terms_text istället för att hela mall-sparningen failar.
 */
function isMissingTermsTextColumn(error: any): boolean {
  const message = String(error?.message || '')
  return /terms_text/i.test(message) && /schema cache|does not exist|column/i.test(message)
}

/**
 * GET - Lista offertmallar per business
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const branch = request.nextUrl.searchParams.get('branch')

    let query = supabase
      .from('quote_templates')
      .select('*')
      .eq('business_id', business.business_id)
      .order('is_favorite', { ascending: false })
      .order('usage_count', { ascending: false })

    if (branch) {
      query = query.eq('branch', branch)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ templates: data || [] })
  } catch (error: any) {
    console.error('Get templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny mall
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Plan-based limit check. Seedade branschmallar (lib/quote-template-
    // defaults.ts, hämtade via /api/quote-templates/seed — som inserterar
    // direkt och alltså aldrig går via denna vakt) ska inte äta användarens
    // kvot, annars blockeras "Spara som mall" direkt efter att man hämtat
    // branschmallarna. Ingen ny DB-kolumn för detta (se plan-dokumentet) —
    // vi räknar bort mallar vars namn matchar en känd seed-mall istället.
    const plan = ((business as any).subscription_plan || 'starter') as PlanType
    const limit = getFeatureLimit(plan, 'quote_templates')
    if (limit !== null) {
      const seedNames = new Set(getAllDefaultTemplateNames())
      const { data: existingNames } = await supabase
        .from('quote_templates')
        .select('name')
        .eq('business_id', business.business_id)
      const nonSeedCount = (existingNames || []).filter((row: { name: string }) => !seedNames.has(row.name)).length
      if (nonSeedCount >= limit) {
        return NextResponse.json(
          { error: `Maxgränsen på ${limit} offertmallar nådd. Uppgradera för obegränsat.` },
          { status: 403 }
        )
      }
    }

    const body = await request.json()

    const id = 'qtpl_' + Math.random().toString(36).substr(2, 9)

    const insertPayload: Record<string, any> = {
      id,
      business_id: business.business_id,
      name: body.name || 'Ny mall',
      description: body.description || null,
      branch: body.branch || null,
      category: body.category || null,
      introduction_text: body.introduction_text || null,
      conclusion_text: body.conclusion_text || null,
      not_included: body.not_included || null,
      ata_terms: body.ata_terms || null,
      payment_terms_text: body.payment_terms_text || null,
      terms_text: body.terms_text || null,
      default_items: body.default_items || [],
      default_payment_plan: body.default_payment_plan || [],
      detail_level: body.detail_level || 'detailed',
      show_unit_prices: body.show_unit_prices ?? true,
      show_quantities: body.show_quantities ?? true,
      rot_enabled: body.rot_enabled || false,
      rut_enabled: body.rut_enabled || false,
      is_favorite: body.is_favorite || false,
    }

    let { data, error } = await supabase.from('quote_templates').insert(insertPayload).select().single()

    if (error && isMissingTermsTextColumn(error)) {
      const { terms_text, ...fallbackPayload } = insertPayload
      ;({ data, error } = await supabase.from('quote_templates').insert(fallbackPayload).select().single())
    }

    if (error) throw error

    return NextResponse.json({ template: data })
  } catch (error: any) {
    console.error('Create template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera mall
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    const allowedFields = [
      'name', 'description', 'branch', 'category',
      'introduction_text', 'conclusion_text', 'not_included', 'ata_terms', 'payment_terms_text', 'terms_text',
      'default_items', 'default_payment_plan',
      'detail_level', 'show_unit_prices', 'show_quantities',
      'rot_enabled', 'rut_enabled', 'is_favorite',
    ]

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates[key] = fields[key]
      }
    }

    let { data, error } = await supabase
      .from('quote_templates')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error && isMissingTermsTextColumn(error) && 'terms_text' in updates) {
      const { terms_text, ...fallbackUpdates } = updates
      ;({ data, error } = await supabase
        .from('quote_templates')
        .update(fallbackUpdates)
        .eq('id', id)
        .eq('business_id', business.business_id)
        .select()
        .single())
    }

    if (error) throw error

    return NextResponse.json({ template: data })
  } catch (error: any) {
    console.error('Update template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH - Toggle favorite, eller (increment_usage: true) räkna upp
 * usage_count när en mall tillämpas på en offert.
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { id, increment_usage } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    if (increment_usage) {
      const { data: current } = await supabase
        .from('quote_templates')
        .select('usage_count')
        .eq('id', id)
        .eq('business_id', business.business_id)
        .single()

      if (!current) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      const { data, error } = await supabase
        .from('quote_templates')
        .update({ usage_count: (current.usage_count || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('business_id', business.business_id)
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ template: data })
    }

    // Get current state
    const { data: current } = await supabase
      .from('quote_templates')
      .select('is_favorite')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!current) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('quote_templates')
      .update({ is_favorite: !current.is_favorite, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ template: data })
  } catch (error: any) {
    console.error('Toggle favorite error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort mall
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('quote_templates')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
