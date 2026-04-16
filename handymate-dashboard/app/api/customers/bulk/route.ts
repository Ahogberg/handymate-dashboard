import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/customers/bulk
 * Massimport av kunder (används i onboarding CSV-flödet).
 *
 * Body: { customers: Array<{ name: string; phone: string; email?: string }> }
 * Returns: { created: number, skipped: number, errors: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const customers = Array.isArray(body.customers) ? body.customers : []

    if (customers.length === 0) {
      return NextResponse.json({ error: 'Inga kunder att importera' }, { status: 400 })
    }

    if (customers.length > 1000) {
      return NextResponse.json({ error: 'Max 1000 kunder per import' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Hämta befintliga telefonnummer för att undvika dubbletter
    const { data: existing } = await supabase
      .from('customer')
      .select('phone_number')
      .eq('business_id', businessId)

    const existingPhones = new Set((existing || []).map((c: any) => c.phone_number))

    const toInsert: any[] = []
    let skipped = 0
    const errors: string[] = []

    for (const c of customers) {
      const name = typeof c.name === 'string' ? c.name.trim() : ''
      const phone = typeof c.phone === 'string' ? c.phone.trim() : ''
      const email = typeof c.email === 'string' ? c.email.trim() : null

      if (!name || !phone) {
        skipped++
        continue
      }

      if (existingPhones.has(phone)) {
        skipped++
        continue
      }
      existingPhones.add(phone)

      toInsert.push({
        customer_id: 'cus_' + Math.random().toString(36).substring(2, 14),
        business_id: businessId,
        name,
        phone_number: phone,
        email: email || null,
        customer_type: 'private',
        created_at: new Date().toISOString(),
      })
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ created: 0, skipped, errors })
    }

    // Batcha inserts — max 100 per batch för att undvika timeout
    let created = 0
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100)
      const { error } = await supabase.from('customer').insert(batch)
      if (error) {
        console.error('[customers/bulk] Insert batch failed:', error)
        errors.push(`Batch ${Math.floor(i / 100) + 1} misslyckades`)
      } else {
        created += batch.length
      }
    }

    return NextResponse.json({ created, skipped, errors })
  } catch (error: any) {
    console.error('[customers/bulk] Error:', error)
    return NextResponse.json({ error: 'Import misslyckades' }, { status: 500 })
  }
}
