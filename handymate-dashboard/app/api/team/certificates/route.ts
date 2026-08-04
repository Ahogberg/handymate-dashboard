import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * Certifikat/behörigheter (R3, tasks/resurs-masterplan.md) — differentieraren
 * mot Easoft (noll certifikatstöd). Skrivning kräver owner/admin (planens
 * explicita krav); en anställd får läsa SINA EGNA rader (samma "self OR
 * manage_users"-anda som app/api/team/route.ts, men strängare — planen
 * säger uttryckligen owner/admin, inte manage_users-flaggan, så vi matchar
 * canSeeInternalCosts-mönstret i app/api/team/route.ts snarare än
 * hasPermission(manage_users)).
 *
 * Tabellen (sql/v84_certifikat.sql) kan saknas (v84 ej körd av Andreas än)
 * → varje handler fångar det felet
 * explicit och degraderar snällt (tom lista / 503 vid skriv) istället för
 * att krascha sidan (lessons.md: tomma sidor = tyst svalda DB-fel — här
 * gör vi tvärtom, loggar högt och håller sidan vid liv).
 */
function isCertManager(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  // 42P01 = Postgres undefined_table. PGRST205 = PostgREST schema-cache
  // saknar relationen (samma symptom om v84 aldrig kördes, innan Postgres
  // ens hunnit klaga).
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message || '')
  )
}

/**
 * GET /api/team/certificates — lista certifikat för business.
 * Owner/admin ser alla; övriga ser bara sina egna.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    const supabase = getServerSupabase()

    let query = supabase
      .from('employee_certificate')
      .select('*')
      .eq('business_id', business.business_id)
      .order('valid_until', { ascending: true, nullsFirst: false })

    if (currentUser && !isCertManager(currentUser.role)) {
      query = query.eq('business_user_id', currentUser.id)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingTableError(error)) {
        console.warn('[team/certificates] employee_certificate saknas ännu — kör sql/v84_certifikat.sql. Fel:', error.message)
        return NextResponse.json({ certificates: [] })
      }
      throw error
    }

    return NextResponse.json({ certificates: data || [] })
  } catch (error: any) {
    console.error('GET /api/team/certificates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/team/certificates — skapa nytt certifikat. Owner/admin endast.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !isCertManager(currentUser.role)) {
      return NextResponse.json({ error: 'Otillräcklig behörighet' }, { status: 403 })
    }

    const body = await request.json()
    const { business_user_id, cert_type, cert_number, issued_date, valid_until, notes } = body

    if (!business_user_id || !cert_type || !String(cert_type).trim()) {
      return NextResponse.json({ error: 'business_user_id och cert_type krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Sanity: medlemmen måste faktiskt tillhöra businessen (annars kunde en
    // admin av misstag — eller en manipulerad request — skriva ett
    // certifikat på en annan businessens medlem).
    const { data: member } = await supabase
      .from('business_users')
      .select('id')
      .eq('id', business_user_id)
      .eq('business_id', business.business_id)
      .maybeSingle()
    if (!member) {
      return NextResponse.json({ error: 'Teammedlem hittades inte i detta företag' }, { status: 400 })
    }

    const id = `cert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const { data, error } = await supabase
      .from('employee_certificate')
      .insert({
        id,
        business_id: business.business_id,
        business_user_id,
        cert_type: String(cert_type).trim(),
        cert_number: cert_number || null,
        issued_date: issued_date || null,
        valid_until: valid_until || null,
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: 'Certifikatfunktionen är inte aktiverad än (sql/v84_certifikat.sql är inte körd).' },
          { status: 503 },
        )
      }
      throw error
    }

    return NextResponse.json({ certificate: data })
  } catch (error: any) {
    console.error('POST /api/team/certificates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/team/certificates — uppdatera certifikat. Owner/admin endast.
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !isCertManager(currentUser.role)) {
      return NextResponse.json({ error: 'Otillräcklig behörighet' }, { status: 403 })
    }

    const body = await request.json()
    const { id, cert_type, cert_number, issued_date, valid_until, notes } = body
    if (!id) {
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (cert_type !== undefined) {
      if (!String(cert_type).trim()) {
        return NextResponse.json({ error: 'cert_type kan inte vara tomt' }, { status: 400 })
      }
      updates.cert_type = String(cert_type).trim()
    }
    if (cert_number !== undefined) updates.cert_number = cert_number || null
    if (issued_date !== undefined) updates.issued_date = issued_date || null
    if (valid_until !== undefined) updates.valid_until = valid_until || null
    if (notes !== undefined) updates.notes = notes || null

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('employee_certificate')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: 'Certifikatfunktionen är inte aktiverad än (sql/v84_certifikat.sql är inte körd).' },
          { status: 503 },
        )
      }
      throw error
    }
    if (!data) {
      return NextResponse.json({ error: 'Certifikat hittades inte' }, { status: 404 })
    }

    return NextResponse.json({ certificate: data })
  } catch (error: any) {
    console.error('PUT /api/team/certificates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/team/certificates?id=... — ta bort certifikat. Owner/admin endast.
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !isCertManager(currentUser.role)) {
      return NextResponse.json({ error: 'Otillräcklig behörighet' }, { status: 403 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('employee_certificate')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) {
      if (isMissingTableError(error)) {
        // Tabellen finns inte → raden finns per definition inte heller.
        return NextResponse.json({ success: true })
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /api/team/certificates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
