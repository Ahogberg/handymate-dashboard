import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'

interface DuplicateGroup {
  match_type: 'phone' | 'email' | 'name_address'
  match_value: string
  customers: Array<{
    customer_id: string
    name: string
    phone_number: string
    email: string | null
    address_line: string | null
    created_at: string
  }>
}

/**
 * GET /api/customers/duplicates - Hitta potentiella dubbletter
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data: customers, error } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number, email, address_line, created_at')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: true })

    if (error) throw error

    const duplicates: DuplicateGroup[] = []

    // 1. Check phone duplicates (normalized)
    const phoneMap = new Map<string, typeof customers>()
    for (const c of customers || []) {
      if (!c.phone_number) continue
      const normalized = normalizeSwedishPhone(c.phone_number)
      if (!normalized) continue
      const existing = phoneMap.get(normalized) || []
      existing.push(c)
      phoneMap.set(normalized, existing)
    }

    phoneMap.forEach((group, phone) => {
      if (group.length > 1) {
        duplicates.push({
          match_type: 'phone',
          match_value: phone,
          customers: group,
        })
      }
    })

    // 2. Check email duplicates
    const emailMap = new Map<string, typeof customers>()
    for (const c of customers || []) {
      if (!c.email) continue
      const normalized = c.email.toLowerCase().trim()
      const existing = emailMap.get(normalized) || []
      existing.push(c)
      emailMap.set(normalized, existing)
    }

    emailMap.forEach((group, email) => {
      if (group.length > 1) {
        // Avoid duplicating groups already found via phone
        const ids = group.map((c: any) => c.customer_id).sort().join(',')
        const alreadyFound = duplicates.some(d =>
          d.customers.map((c: any) => c.customer_id).sort().join(',') === ids
        )
        if (!alreadyFound) {
          duplicates.push({
            match_type: 'email',
            match_value: email,
            customers: group,
          })
        }
      }
    })

    // 3. Check name+address duplicates (fuzzy)
    const nameAddrMap = new Map<string, typeof customers>()
    for (const c of customers || []) {
      if (!c.name || !c.address_line) continue
      const key = `${c.name.toLowerCase().trim()}|${c.address_line.toLowerCase().trim()}`
      const existing = nameAddrMap.get(key) || []
      existing.push(c)
      nameAddrMap.set(key, existing)
    }

    nameAddrMap.forEach((group, key) => {
      if (group.length > 1) {
        const ids = group.map((c: any) => c.customer_id).sort().join(',')
        const alreadyFound = duplicates.some(d =>
          d.customers.map((c: any) => c.customer_id).sort().join(',') === ids
        )
        if (!alreadyFound) {
          duplicates.push({
            match_type: 'name_address',
            match_value: key,
            customers: group,
          })
        }
      }
    })

    return NextResponse.json({
      duplicates,
      total_groups: duplicates.length,
      total_duplicates: duplicates.reduce((sum, g) => sum + g.customers.length - 1, 0),
    })
  } catch (error: any) {
    console.error('Duplicate detection error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/customers/duplicates - Slå ihop dubbletter
 * Body: { keep_id: string, merge_ids: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { keep_id, merge_ids } = await request.json()

    if (!keep_id || !merge_ids?.length) {
      return NextResponse.json({ error: 'keep_id och merge_ids krävs' }, { status: 400 })
    }

    // Verify all customers belong to business
    const { data: allCustomers } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', business.business_id)
      .in('customer_id', [keep_id, ...merge_ids])

    if ((allCustomers?.length || 0) !== merge_ids.length + 1) {
      return NextResponse.json({ error: 'En eller flera kunder hittades inte' }, { status: 404 })
    }

    // Move all references from merge_ids to keep_id
    const tables = [
      { table: 'booking', column: 'customer_id' },
      { table: 'time_entry', column: 'customer_id' },
      { table: 'invoice', column: 'customer_id' },
      { table: 'quotes', column: 'customer_id' },
      { table: 'call_recording', column: 'customer_id' },
      { table: 'ai_suggestion', column: 'customer_id' },
      { table: 'customer_activity', column: 'customer_id' },
      { table: 'sms_log', column: 'customer_id' },
    ]

    for (const { table, column } of tables) {
      await supabase
        .from(table)
        .update({ [column]: keep_id })
        .in(column, merge_ids)
    }

    // Delete merged customers
    const { error: deleteError } = await supabase
      .from('customer')
      .delete()
      .in('customer_id', merge_ids)
      .eq('business_id', business.business_id)

    if (deleteError) throw deleteError

    return NextResponse.json({
      success: true,
      merged_count: merge_ids.length,
      kept_id: keep_id,
    })
  } catch (error: any) {
    console.error('Merge customers error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
