import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getDefaultAgreementTypes } from '@/lib/agreement-type-defaults'

/**
 * Serviceavtalskatalogen (lager 1) — CRUD för service_agreement_type.
 * Mönster: app/api/quote-templates/route.ts.
 *
 * FAIL-SAFE mot v74 ej körd: sql/v74_serviceavtal.sql körs manuellt i
 * Supabase SQL Editor efter merge (se CLAUDE.md). Om relationen saknas
 * svarar GET/POST/PUT/DELETE med ett tomt/no-op-resultat istället för att
 * krascha — samma andemening som isMissingTermsTextColumn i quote-templates.
 */
function isMissingRelationError(error: any): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = String(error?.message || '')
  return /does not exist|schema cache/i.test(message) && /relation|table|service_agreement_type/i.test(message)
}

/**
 * GET - Lista katalogen. Lazy-seedar tyst vid första anropet om katalogen
 * är tom (0 rader) — ingen CTA behövs, katalogen är intern inställningsdata
 * (till skillnad från mallbanken som har en explicit "Hämta mallar"-knapp).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    let { data, error } = await supabase
      .from('service_agreement_type')
      .select('*')
      .eq('business_id', business.business_id)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true })

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json({ agreement_types: [], migration_pending: true })
      }
      throw error
    }

    if ((data || []).length === 0) {
      // Lazy-seed vid tom katalog — hämta branschen och seeda tyst.
      const { data: config } = await supabase
        .from('business_config')
        .select('branch')
        .eq('business_id', business.business_id)
        .maybeSingle()

      const defaults = getDefaultAgreementTypes(config?.branch || 'other')
      if (defaults.length > 0) {
        const { data: inserted, error: insertErr } = await supabase
          .from('service_agreement_type')
          .insert(
            defaults.map((t, i) => ({
              type_id: `sat_${business.business_id}_${i}`,
              business_id: business.business_id,
              name: t.name,
              description: t.description,
              interval_months: t.interval_months,
              visit_duration_min: t.visit_duration_min,
              price_items: t.price_items,
              match_keys: t.match_keys,
              is_active: true,
              seeded: true,
            }))
          )
          .select('*')

        if (!insertErr && inserted) {
          data = inserted
        }
      }
    }

    return NextResponse.json({ agreement_types: data || [] })
  } catch (error: any) {
    console.error('Get agreement types error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny katalogpost
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.name || !body.interval_months || !Array.isArray(body.price_items)) {
      return NextResponse.json(
        { error: 'name, interval_months och price_items krävs' },
        { status: 400 }
      )
    }

    const typeId = 'sat_' + Math.random().toString(36).substr(2, 9)

    const { data, error } = await supabase
      .from('service_agreement_type')
      .insert({
        type_id: typeId,
        business_id: business.business_id,
        name: body.name,
        description: body.description || null,
        interval_months: body.interval_months,
        visit_duration_min: body.visit_duration_min || 60,
        price_items: body.price_items,
        match_keys: body.match_keys || [],
        is_active: body.is_active ?? true,
        seeded: false,
      })
      .select()
      .single()

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json(
          { error: 'Serviceavtal-katalogen är inte redo än (migration väntar).' },
          { status: 503 }
        )
      }
      throw error
    }

    return NextResponse.json({ agreement_type: data })
  } catch (error: any) {
    console.error('Create agreement type error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera katalogpost
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { type_id, ...fields } = body

    if (!type_id) {
      return NextResponse.json({ error: 'Missing type_id' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    const allowedFields = [
      'name', 'description', 'interval_months', 'visit_duration_min',
      'price_items', 'match_keys', 'is_active',
    ]
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates[key] = fields[key]
      }
    }

    const { data, error } = await supabase
      .from('service_agreement_type')
      .update(updates)
      .eq('type_id', type_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json(
          { error: 'Serviceavtal-katalogen är inte redo än (migration väntar).' },
          { status: 503 }
        )
      }
      throw error
    }

    return NextResponse.json({ agreement_type: data })
  } catch (error: any) {
    console.error('Update agreement type error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort katalogpost
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const typeId = request.nextUrl.searchParams.get('type_id')

    if (!typeId) {
      return NextResponse.json({ error: 'Missing type_id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('service_agreement_type')
      .delete()
      .eq('type_id', typeId)
      .eq('business_id', business.business_id)

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json({ success: true })
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete agreement type error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
