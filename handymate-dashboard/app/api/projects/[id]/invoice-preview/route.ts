import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

// Force-dynamic — preview-data är realtidssnap av signerade ÄTA +
// quote_items, får inte cachas.
export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[id]/invoice-preview
 *
 * Returnerar all data som behövs för att rendera dashboard
 * "Förhandsgranska faktura"-vyn för ett projekt — auto-pull av
 * signerade ÄTA till en proposed slutfaktura.
 *
 * Schema-noteringar (verifierat 2026-05-11):
 * - `quotes` tabell (plural), inte `quote`
 * - `quote_items` separat tabell är canonical items-källa.
 *   `quotes.items` (JSONB) är legacy och används bara som fallback
 *   om quote_items är tom (gamla quotes från före quote_overhaul).
 * - `project_change.items` är JSONB-array med shape
 *   `[{name, description, quantity, unit, unit_price, rot_rut_type}]`
 *   (v10_ata.sql:12).
 * - `business_config.bankgiro` (inte bankgiro_number).
 * - `customer.personal_number` + `customer.property_designation` är
 *   ROT-fälten på kund.
 *
 * TD-22-pattern: alla queries destrukturerar `{ data, error }` och
 * returnerar PostgrestError-detaljer i 500-respons.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // ── 1. Project ───────────────────────────────────────────────
    const { data: project, error: projectError } = await supabase
      .from('project')
      .select('project_id, name, customer_id, business_id, quote_id, status, completed_at')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (projectError) {
      console.error('[invoice-preview] project query error:', projectError)
      return NextResponse.json(
        {
          error: projectError.message,
          code: projectError.code,
          details: projectError.details,
          hint: projectError.hint,
          stage: 'project',
        },
        { status: 500 },
      )
    }
    if (!project) {
      return NextResponse.json({ error: 'Projekt hittades inte' }, { status: 404 })
    }

    // ── 2. Customer ──────────────────────────────────────────────
    let customer: any = null
    if (project.customer_id) {
      const { data: c, error: customerError } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, email, address_line, personal_number, property_designation')
        .eq('customer_id', project.customer_id)
        .eq('business_id', business.business_id)
        .maybeSingle()
      if (customerError) {
        console.error('[invoice-preview] customer query error:', customerError)
        return NextResponse.json(
          {
            error: customerError.message,
            code: customerError.code,
            details: customerError.details,
            hint: customerError.hint,
            stage: 'customer',
          },
          { status: 500 },
        )
      }
      customer = c
    }

    // ── 3. Business config ──────────────────────────────────────
    const { data: businessConfig, error: businessError } = await supabase
      .from('business_config')
      .select('business_id, business_name, org_number, bankgiro, plusgiro, bank_account_number, invoice_prefix, next_invoice_number')
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (businessError) {
      console.error('[invoice-preview] business_config query error:', businessError)
      return NextResponse.json(
        {
          error: businessError.message,
          code: businessError.code,
          details: businessError.details,
          hint: businessError.hint,
          stage: 'business_config',
        },
        { status: 500 },
      )
    }

    // ── 4. Quote + quote_items ──────────────────────────────────
    let quote: any = null
    let quoteItems: any[] = []
    if (project.quote_id) {
      const { data: q, error: quoteError } = await supabase
        .from('quotes')
        .select('quote_id, quote_number, total, signed_at, accepted_at, status, introduction_text, conclusion_text, items, rot_work_cost, rot_deduction, rot_customer_pays, rut_work_cost, rut_deduction, rut_customer_pays')
        .eq('quote_id', project.quote_id)
        .eq('business_id', business.business_id)
        .maybeSingle()

      if (quoteError) {
        console.error('[invoice-preview] quote query error:', quoteError)
        return NextResponse.json(
          {
            error: quoteError.message,
            code: quoteError.code,
            details: quoteError.details,
            hint: quoteError.hint,
            stage: 'quote',
          },
          { status: 500 },
        )
      }

      if (q) {
        // Canonical: hämta items från quote_items-tabellen
        const { data: qi, error: itemsError } = await supabase
          .from('quote_items')
          .select('id, description, quantity, unit, unit_price, total, is_rot_eligible, is_rut_eligible, item_type, sort_order, group_name')
          .eq('quote_id', project.quote_id)
          .order('sort_order', { ascending: true })

        if (itemsError) {
          console.error('[invoice-preview] quote_items query error:', itemsError)
          return NextResponse.json(
            {
              error: itemsError.message,
              code: itemsError.code,
              details: itemsError.details,
              hint: itemsError.hint,
              stage: 'quote_items',
            },
            { status: 500 },
          )
        }

        // Legacy-fallback: om quote_items är tom men quotes.items (JSONB) har data,
        // mappa den till samma shape. Gamla offerter från före quote_overhaul.sql.
        if ((qi || []).length === 0 && Array.isArray(q.items) && q.items.length > 0) {
          quoteItems = q.items.map((item: any, i: number) => ({
            id: item.id || `legacy_${i}`,
            description: item.description || item.name || '',
            quantity: item.quantity || 1,
            unit: item.unit || 'st',
            unit_price: item.unit_price || item.price || 0,
            total: (item.quantity || 1) * (item.unit_price || item.price || 0),
            is_rot_eligible: !!item.is_rot_eligible,
            is_rut_eligible: !!item.is_rut_eligible,
            item_type: item.item_type || 'item',
            sort_order: item.sort_order ?? i,
            group_name: item.group_name || null,
            _source: 'legacy_jsonb',
          }))
        } else {
          quoteItems = qi || []
        }

        // Plocka bort items från quote-objektet — vi exponerar dem
        // separat under quote.items för konsumenter.
        const { items: _legacyItems, ...quoteCore } = q
        quote = { ...quoteCore, items: quoteItems }
      }
    }

    // ── 5. project_change (ÄTA) — split by status ───────────────
    // project_change har INTE invoice_number-kolumn — bara invoice_id
    // (FK TEXT via v10_ata.sql:32) + invoiced_at. Joinas via two-query
    // pattern (TD-7) mot invoice-tabellen för att resolva invoice_number.
    const { data: allChanges, error: changesError } = await supabase
      .from('project_change')
      .select('change_id, ata_number, description, change_type, status, total, items, signed_at, signed_by_name, invoice_id, invoiced_at, created_at')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .order('ata_number', { ascending: true })

    if (changesError) {
      console.error('[invoice-preview] project_change query error:', changesError)
      return NextResponse.json(
        {
          error: changesError.message,
          code: changesError.code,
          details: changesError.details,
          hint: changesError.hint,
          stage: 'project_change',
        },
        { status: 500 },
      )
    }

    const signedStatuses = new Set(['signed', 'approved'])
    const pendingStatuses = new Set(['sent', 'draft'])
    const invoicedStatuses = new Set(['invoiced'])

    const signedAtas = (allChanges || [])
      .filter(c => signedStatuses.has(c.status))
      .map(c => ({
        change_id: c.change_id,
        ata_number: c.ata_number,
        description: c.description,
        change_type: c.change_type,
        signed_at: c.signed_at,
        signed_by_name: c.signed_by_name,
        total: Number(c.total) || 0,
        items: Array.isArray(c.items) ? c.items : [],
      }))

    const pendingAtas = (allChanges || [])
      .filter(c => pendingStatuses.has(c.status))
      .map(c => ({
        change_id: c.change_id,
        ata_number: c.ata_number,
        description: c.description,
        change_type: c.change_type,
        status: c.status,
        total: Number(c.total) || 0,
      }))

    // Two-query pattern (TD-7): hämta invoice_number för invoiced-ÄTA
    // via separat lookup mot invoice-tabellen. project_change har bara
    // invoice_id (TEXT FK), inte invoice_number.
    const invoicedRaw = (allChanges || []).filter(c => invoicedStatuses.has(c.status))
    const invoiceIds = Array.from(
      new Set(invoicedRaw.map(c => c.invoice_id).filter((id): id is string => !!id)),
    )

    const invoiceNumberMap: Record<string, string | null> = {}
    if (invoiceIds.length > 0) {
      const { data: invoices, error: invoicesError } = await supabase
        .from('invoice')
        .select('invoice_id, invoice_number')
        .in('invoice_id', invoiceIds)
        .eq('business_id', business.business_id)

      if (invoicesError) {
        console.error('[invoice-preview] invoice lookup error:', invoicesError)
        return NextResponse.json(
          {
            error: invoicesError.message,
            code: invoicesError.code,
            details: invoicesError.details,
            hint: invoicesError.hint,
            stage: 'invoice_number_lookup',
          },
          { status: 500 },
        )
      }

      for (const inv of invoices || []) {
        invoiceNumberMap[inv.invoice_id] = inv.invoice_number
      }
    }

    const invoicedAtas = invoicedRaw.map(c => ({
      change_id: c.change_id,
      ata_number: c.ata_number,
      description: c.description,
      change_type: c.change_type,
      invoice_id: c.invoice_id,
      invoice_number: c.invoice_id ? invoiceNumberMap[c.invoice_id] ?? null : null,
      invoiced_at: c.invoiced_at,
      total: Number(c.total) || 0,
    }))

    // ── 6. Server-side totals ───────────────────────────────────
    // Quote-total: prioritera summa av quote_items, fall tillbaka på
    // quotes.total om items saknas (legacy quote utan rader).
    const itemsSum = quoteItems.reduce(
      (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
      0,
    )
    const quoteTotal = quoteItems.length > 0 ? itemsSum : Number(quote?.total) || 0

    // ÄTA-summor: additions positiva, removals negativa
    const sumAtas = (arr: { change_type: string; total: number }[]) =>
      arr.reduce((s, a) => {
        const v = Math.abs(a.total)
        return s + (a.change_type === 'removal' ? -v : v)
      }, 0)

    const signedAtasTotal = sumAtas(signedAtas)
    const invoicedAtasTotal = sumAtas(invoicedAtas)

    // ── 7. ROT/RUT summary från quote_items ─────────────────────
    const rotWorkCost = quoteItems
      .filter(it => it.is_rot_eligible)
      .reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
    const rutWorkCost = quoteItems
      .filter(it => it.is_rut_eligible)
      .reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)

    let rotRutSummary:
      | { type: 'ROT' | 'RUT'; eligible_amount: number; deduction_percent: 30 | 50; deduction_amount: number; customer_pays: number }
      | null = null

    if (rotWorkCost > 0) {
      const deduction = rotWorkCost * 0.30
      rotRutSummary = {
        type: 'ROT',
        eligible_amount: Math.round(rotWorkCost * 100) / 100,
        deduction_percent: 30,
        deduction_amount: Math.round(deduction * 100) / 100,
        customer_pays: 0, // fylls i nedan efter total-beräkning
      }
    } else if (rutWorkCost > 0) {
      const deduction = rutWorkCost * 0.50
      rotRutSummary = {
        type: 'RUT',
        eligible_amount: Math.round(rutWorkCost * 100) / 100,
        deduction_percent: 50,
        deduction_amount: Math.round(deduction * 100) / 100,
        customer_pays: 0,
      }
    }

    // ── 8. VAT + total ──────────────────────────────────────────
    // ÄTA v1 har ingen is_rot_eligible-flagga på items (TD-26) — så
    // alla ÄTA-rader behandlas som non-ROT/RUT. Bara quote-items
    // räknas mot rotRutSummary.
    const totalExclVat = quoteTotal + signedAtasTotal
    const vatAmount = Math.round(totalExclVat * 0.25 * 100) / 100
    const totalInclVat = totalExclVat + vatAmount

    if (rotRutSummary) {
      rotRutSummary.customer_pays = Math.round((totalInclVat - rotRutSummary.deduction_amount) * 100) / 100
    }

    // ── 9. Next invoice number ──────────────────────────────────
    const prefix = businessConfig?.invoice_prefix || 'FV'
    const nextNum = businessConfig?.next_invoice_number || 1
    const year = new Date().getFullYear()
    const nextInvoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`

    // ── 10. Response ────────────────────────────────────────────
    return NextResponse.json({
      project: {
        project_id: project.project_id,
        name: project.name,
        customer_id: project.customer_id,
        business_id: project.business_id,
        quote_id: project.quote_id,
        status: project.status,
        completed_at: project.completed_at,
      },
      customer,
      business: businessConfig
        ? {
            business_id: businessConfig.business_id,
            name: businessConfig.business_name,
            org_number: businessConfig.org_number,
            bankgiro_number: businessConfig.bankgiro,
            plusgiro_number: businessConfig.plusgiro,
            bank_account: businessConfig.bank_account_number,
          }
        : null,
      quote,
      signedAtas,
      pendingAtas,
      invoicedAtas,
      quoteTotal: Math.round(quoteTotal * 100) / 100,
      signedAtasTotal: Math.round(signedAtasTotal * 100) / 100,
      invoicedAtasTotal: Math.round(invoicedAtasTotal * 100) / 100,
      rotRutSummary,
      totalExclVat: Math.round(totalExclVat * 100) / 100,
      vatAmount,
      totalInclVat: Math.round(totalInclVat * 100) / 100,
      nextInvoiceNumber,
    })
  } catch (error: any) {
    console.error('[invoice-preview] unexpected error:', error)
    return NextResponse.json(
      { error: error?.message || 'Serverfel', stage: 'unexpected' },
      { status: 500 },
    )
  }
}
