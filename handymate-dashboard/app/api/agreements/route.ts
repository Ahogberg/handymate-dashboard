import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { stockholmLocalToISO } from '@/lib/bookings/availability'

/**
 * Serviceavtal (service_agreement) — CRUD. Mönster: app/api/quote-templates/route.ts.
 *
 * FAIL-SAFE mot v74 ej körd — se isMissingRelationError.
 */
function isMissingRelationError(error: any): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = String(error?.message || '')
  return /does not exist|schema cache/i.test(message) && /relation|table|service_agreement/i.test(message)
}

/**
 * GET - Lista avtal. ?customer_id= filtrerar till en kund, annars alla
 * avtal för businessen (t.ex. för en framtida översiktsvy).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const customerId = request.nextUrl.searchParams.get('customer_id')

    let query = supabase
      .from('service_agreement')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json({ agreements: [], migration_pending: true })
      }
      throw error
    }

    return NextResponse.json({ agreements: data || [] })
  } catch (error: any) {
    console.error('Get agreements error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa nytt avtal. Fryser price_items från en vald katalogpost
 * (type_id) ELLER från egna rader (custom price_items i body) — snapshot-
 * princip, samma som quote_templates → quotes. Sätter next_visit_at från
 * vald startmånad/-dag.
 *
 * Body:
 *   customer_id: string (krävs)
 *   type_id?: string           — välj ur katalogen; annars custom nedan
 *   title?: string             — override av katalogpostens namn, eller
 *                                 krävs om type_id saknas
 *   interval_months?: number   — krävs om type_id saknas
 *   visit_duration_min?: number
 *   price_items?: array        — krävs om type_id saknas
 *   job_type?: string
 *   first_visit_date: string   — YYYY-MM-DD, default: 1:a i nästa månad
 *   notes?: string
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.customer_id) {
      return NextResponse.json({ error: 'customer_id krävs' }, { status: 400 })
    }

    let title: string
    let intervalMonths: number
    let visitDurationMin: number
    let priceItems: any[]
    const jobType: string | null = body.job_type || null

    if (body.type_id) {
      const { data: type, error: typeErr } = await supabase
        .from('service_agreement_type')
        .select('*')
        .eq('type_id', body.type_id)
        .eq('business_id', business.business_id)
        .maybeSingle()

      if (typeErr) throw typeErr
      if (!type) {
        return NextResponse.json({ error: 'Avtalstypen hittades inte i katalogen' }, { status: 404 })
      }

      title = body.title || type.name
      intervalMonths = body.interval_months || type.interval_months
      visitDurationMin = body.visit_duration_min || type.visit_duration_min
      priceItems = Array.isArray(body.price_items) ? body.price_items : type.price_items
    } else {
      if (!body.title || !body.interval_months || !Array.isArray(body.price_items) || body.price_items.length === 0) {
        return NextResponse.json(
          { error: 'title, interval_months och price_items krävs för egna avtal (utan type_id)' },
          { status: 400 }
        )
      }
      title = body.title
      intervalMonths = body.interval_months
      visitDurationMin = body.visit_duration_min || 60
      priceItems = body.price_items
    }

    // Dominerande ROT/RUT-typ för avtalet — härledd från första raden som
    // har en satt typ. Radnivån styr det faktiska avdraget vid fakturering
    // (lib/agreements/invoice-visit.ts), detta fältet är en sammanfattning.
    const rotRutType = priceItems.find((i: any) => i?.rot_rut_type)?.rot_rut_type || null

    // Startdatum — default 1:a i nästa månad (svensk lokaltid).
    let firstVisitDate: string = body.first_visit_date
    if (!firstVisitDate) {
      const now = new Date()
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      firstVisitDate = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`
    }
    const nextVisitAt = stockholmLocalToISO(firstVisitDate, '08:00')

    const agreementId = 'agr_' + Math.random().toString(36).substr(2, 9)

    const { data, error } = await supabase
      .from('service_agreement')
      .insert({
        agreement_id: agreementId,
        business_id: business.business_id,
        customer_id: body.customer_id,
        title,
        job_type: jobType,
        interval_months: intervalMonths,
        visit_duration_min: visitDurationMin,
        price_items: priceItems,
        rot_rut_type: rotRutType,
        next_visit_at: nextVisitAt,
        status: 'active',
        created_from_project_id: body.created_from_project_id || null,
        notes: body.notes || null,
      })
      .select()
      .single()

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json(
          { error: 'Serviceavtal är inte redo än (migration väntar).' },
          { status: 503 }
        )
      }
      throw error
    }

    return NextResponse.json({ agreement: data })
  } catch (error: any) {
    console.error('Create agreement error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Paus/avsluta/återuppta eller redigera ett avtal.
 * Body: { agreement_id, action: 'pause'|'resume'|'cancel' } ELLER direkta
 * fält (title/notes/interval_months/visit_duration_min/price_items/next_visit_at).
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { agreement_id, action, ...fields } = body

    if (!agreement_id) {
      return NextResponse.json({ error: 'Missing agreement_id' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (action) {
      const statusByAction: Record<string, string> = {
        pause: 'paused',
        resume: 'active',
        cancel: 'cancelled',
      }
      const status = statusByAction[action]
      if (!status) {
        return NextResponse.json({ error: `Okänd action: ${action}` }, { status: 400 })
      }
      updates.status = status
    }

    const allowedFields = [
      'title', 'notes', 'job_type', 'interval_months', 'visit_duration_min',
      'price_items', 'rot_rut_type', 'next_visit_at', 'status',
    ]
    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updates[key] = fields[key]
      }
    }

    const { data, error } = await supabase
      .from('service_agreement')
      .update(updates)
      .eq('agreement_id', agreement_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json(
          { error: 'Serviceavtal är inte redo än (migration väntar).' },
          { status: 503 }
        )
      }
      throw error
    }

    return NextResponse.json({ agreement: data })
  } catch (error: any) {
    console.error('Update agreement error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
