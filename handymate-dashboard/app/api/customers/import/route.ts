import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getNextCustomerNumber } from '@/lib/numbering'
import type { CustomerImportResult } from '@/lib/customers/import-result'

/**
 * POST /api/customers/import
 * Bulk import customers from CSV data
 * Body: { customers: Array<{ name, phone_number, email, address }> }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const customers = body?.customers

  if (!Array.isArray(customers) || customers.length === 0) {
    return NextResponse.json({ error: 'Skicka en kundlista med minst en rad.' }, { status: 400 })
  }

  if (customers.length > 5000) {
    return NextResponse.json({ error: 'Högst 5 000 rader kan importeras åt gången.' }, { status: 400 })
  }
  if (body.skip_existing !== undefined && typeof body.skip_existing !== 'boolean') {
    return NextResponse.json({ error: 'Välj om befintliga kunder ska hoppas över.' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const result: CustomerImportResult = {
    total: customers.length, success: 0, created: 0, updated: 0,
    unchanged: 0, skipped: 0, failed: 0, errors: [], importedIds: [],
  }
  const importedIds = new Set<string>()
  const fail = (index: number, message: string) => {
    result.failed++
    if (result.errors.length < 10) result.errors.push(`Rad ${index + 1}: ${message}`)
  }

  // Process in batches of 50
  const batchSize = 50
  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize)

    for (let offset = 0; offset < batch.length; offset++) {
      const row = batch[offset]
      const index = i + offset
      try {
        if (!row || typeof row !== 'object' || Array.isArray(row)
          || ['name', 'phone_number', 'email', 'address'].some(key => row[key] != null && typeof row[key] !== 'string')) {
          fail(index, 'Kontrollera att namn och kontaktuppgifter är text.')
          continue
        }
        const name = (row.name || '').trim()
        const phone = (row.phone_number || '').trim()
        const email = (row.email || '').trim()
        const address = (row.address || '').trim()

        if (!name && !phone) {
          fail(index, 'Namn eller telefonnummer saknas.')
          continue
        }

        // Check for existing customer by phone number
        if (phone) {
          const { data: existing, error: lookupError } = await supabase
            .from('customer')
            .select('customer_id')
            .eq('business_id', auth.business_id)
            .eq('phone_number', phone)
            .maybeSingle()

          // An unreadable/ambiguous lookup is not proof that the customer is new.
          if (lookupError) {
            fail(index, 'Kunde inte kontrollera om kunden redan finns. Ingen ny kund skapades för raden.')
            continue
          }

          if (existing) {
            if (body.skip_existing) {
              result.skipped++
              continue
            }
            // Update existing customer
            const updates: Record<string, string> = {}
            if (name) updates.name = name
            if (email) updates.email = email
            if (address) updates.address_line = address

            if (Object.keys(updates).length > 0) {
              const { data: saved, error: updateError } = await supabase
                .from('customer')
                .update(updates)
                .eq('business_id', auth.business_id)
                .eq('customer_id', existing.customer_id)
                .select('customer_id')
                .maybeSingle()
              if (updateError || !saved?.customer_id) {
                fail(index, 'Uppdateringen kunde inte bekräftas. Kontrollera kunden innan du försöker igen.')
                continue
              }
              result.updated++
            } else {
              result.unchanged++
            }
            result.success++
            importedIds.add(existing.customer_id)
            continue
          }
        }

        // Create new customer
        const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)
        const customerNumber = await getNextCustomerNumber(supabase, auth.business_id)
        const { data: saved, error } = await supabase
          .from('customer')
          .insert({
            customer_id: customerId,
            business_id: auth.business_id,
            name: name || 'Okänd',
            phone_number: phone || null,
            email: email || null,
            address_line: address || null,
            customer_number: customerNumber,
          })
          .select('customer_id')
          .single()

        if (error || !saved?.customer_id) {
          fail(index, 'Kunden kunde inte bekräftas som sparad. Kontrollera kundlistan innan du försöker igen.')
        } else {
          result.created++
          result.success++
          importedIds.add(saved.customer_id)
        }
      } catch {
        fail(index, 'Resultatet kunde inte bekräftas. Kontrollera kundlistan innan du försöker igen.')
      }
    }
  }

  // Fortnox-kundsvep EFTER loopen (2026-08-26): en batch-import synkar inte
  // per rad (N Fortnox-anrop i request-vägen) — batchSync tar de nya kunderna
  // i skapandeordning, max 50 per anrop; 2h-cronen tar resten. Non-blocking.
  if (result.created + result.updated > 0) {
    try {
      const { batchSync } = await import('@/lib/fortnox/sync')
      await batchSync(auth.business_id, 'customer')
    } catch { /* non-blocking; this receipt confirms Handymate, not Fortnox */ }
  }

  result.importedIds = Array.from(importedIds)
  return NextResponse.json(result)
}
