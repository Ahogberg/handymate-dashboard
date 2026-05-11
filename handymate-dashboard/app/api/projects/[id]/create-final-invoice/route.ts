import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { generateOCR } from '@/lib/ocr'

export const dynamic = 'force-dynamic'

/**
 * POST /api/projects/[id]/create-final-invoice
 *
 * Skapar en draft-slutfaktura från projektets signerade offert +
 * alla signerade ÄTA. Markerar ÄTA:erna som invoiced (status +
 * invoice_id + invoiced_at) så att samma tilläggsarbete inte kan
 * dubbel-fakturas.
 *
 * Pre-flight-validering (TD-27):
 * - business_config.org_number måste vara satt
 * - business_config.business_name måste vara satt
 *
 * Atomicitets-not (TD-29):
 * INSERT invoice → UPDATE project_change körs separat. Om INSERT
 * lyckas men UPDATE failar är vi i ett halv-konsistent state
 * (fakturan finns men ÄTA är inte markerade invoiced). V1 loggar
 * error tydligt så Andreas kan kompensera manuellt. V2 ska byggas
 * som Postgres RPC för sann atomicitet.
 *
 * Response: { invoice_id, invoice_number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json(
        { error: 'Otillräckliga behörigheter' },
        { status: 403 },
      )
    }

    const supabase = getServerSupabase()
    const projectId = params.id

    // ── 1. Project ───────────────────────────────────────────────
    const { data: project, error: projectError } = await supabase
      .from('project')
      .select('project_id, name, customer_id, business_id, quote_id, status')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (projectError) {
      console.error('[create-final-invoice] project query error:', projectError)
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
    if (!project.customer_id) {
      return NextResponse.json(
        { error: 'Projektet saknar kopplad kund — kan inte skapa faktura' },
        { status: 400 },
      )
    }

    // ── 2. Business config + pre-flight (TD-27) ─────────────────
    const { data: businessConfig, error: businessError } = await supabase
      .from('business_config')
      .select('business_name, org_number, bankgiro, plusgiro, bank_account_number, invoice_prefix, next_invoice_number, default_payment_days')
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (businessError) {
      console.error('[create-final-invoice] business_config query error:', businessError)
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

    const missingFields: string[] = []
    if (!businessConfig?.business_name?.trim()) missingFields.push('business_name')
    if (!businessConfig?.org_number?.trim()) missingFields.push('org_number')
    if (
      !businessConfig?.bankgiro?.trim() &&
      !businessConfig?.plusgiro?.trim() &&
      !businessConfig?.bank_account_number?.trim()
    ) {
      missingFields.push('betalmottagare (bankgiro/plusgiro/bankkonto)')
    }
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: `Företaget saknar ${missingFields.join(' + ')} i inställningar — fyll i under Inställningar → Företag innan du skapar slutfaktura`,
          fields: missingFields,
        },
        { status: 400 },
      )
    }

    // ── 3. Quote + quote_items ──────────────────────────────────
    let quote: any = null
    let quoteItems: any[] = []
    if (project.quote_id) {
      const { data: q, error: quoteError } = await supabase
        .from('quotes')
        .select('quote_id, total, signed_at, accepted_at, introduction_text, conclusion_text, items')
        .eq('quote_id', project.quote_id)
        .eq('business_id', business.business_id)
        .maybeSingle()

      if (quoteError) {
        console.error('[create-final-invoice] quote query error:', quoteError)
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
        quote = q
        const { data: qi, error: itemsError } = await supabase
          .from('quote_items')
          .select('id, description, quantity, unit, unit_price, is_rot_eligible, is_rut_eligible, item_type, sort_order, group_name, cost_price, article_number')
          .eq('quote_id', project.quote_id)
          .order('sort_order', { ascending: true })

        if (itemsError) {
          console.error('[create-final-invoice] quote_items query error:', itemsError)
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

        // Legacy-fallback: JSONB quotes.items om quote_items är tom
        if ((qi || []).length === 0 && Array.isArray(q.items) && q.items.length > 0) {
          quoteItems = q.items.map((item: any, i: number) => ({
            id: item.id || `legacy_${i}`,
            description: item.description || item.name || '',
            quantity: Number(item.quantity) || 1,
            unit: item.unit || 'st',
            unit_price: Number(item.unit_price ?? item.price) || 0,
            is_rot_eligible: !!item.is_rot_eligible,
            is_rut_eligible: !!item.is_rut_eligible,
            item_type: item.item_type || 'item',
            sort_order: item.sort_order ?? i,
            group_name: item.group_name || null,
            cost_price: item.cost_price ?? null,
            article_number: item.article_number ?? null,
          }))
        } else {
          quoteItems = qi || []
        }
      }
    }

    // ── 4. Signed ÄTA ────────────────────────────────────────────
    const { data: signedChanges, error: changesError } = await supabase
      .from('project_change')
      .select('change_id, ata_number, description, change_type, status, total, items, signed_at')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .in('status', ['signed', 'approved'])
      .order('ata_number', { ascending: true })

    if (changesError) {
      console.error('[create-final-invoice] project_change query error:', changesError)
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

    const signedAtas = signedChanges || []

    if (quoteItems.length === 0 && signedAtas.length === 0) {
      return NextResponse.json(
        { error: 'Inget underlag att fakturera — projektet saknar signerad offert och signerade tilläggsarbeten' },
        { status: 400 },
      )
    }

    // ── 5. Bygg items JSONB ─────────────────────────────────────
    const items: any[] = []
    let sortOrder = 0

    // Quote-rader först
    for (const qi of quoteItems) {
      const qty = Number(qi.quantity) || 0
      const price = Number(qi.unit_price) || 0
      items.push({
        id: `ii_${Math.random().toString(36).slice(2, 14)}`,
        item_type: qi.item_type || 'item',
        description: qi.description || '',
        quantity: qty,
        unit: qi.unit || 'st',
        unit_price: price,
        total: qty * price,
        is_rot_eligible: !!qi.is_rot_eligible,
        is_rut_eligible: !!qi.is_rut_eligible,
        sort_order: sortOrder++,
        group_name: qi.group_name || null,
        cost_price: qi.cost_price ?? null,
        article_number: qi.article_number ?? null,
        _source: 'quote',
      })
    }

    // ÄTA-rader — gruppera per ÄTA via group_name + metadata
    // (_source, _change_id, _ata_number) för spårbarhet utan ny tabell.
    // V1: ÄTA-items har inget is_rot_eligible-flagga (TD-26) → alla false.
    for (const ata of signedAtas) {
      const groupLabel = `ÄTA #${ata.ata_number} · ${ata.description}`
      const ataItems = Array.isArray(ata.items) ? ata.items : []
      const isRemoval = ata.change_type === 'removal'

      if (ataItems.length > 0) {
        for (const ai of ataItems) {
          const qty = Number(ai.quantity) || 1
          const rawPrice = Number(ai.unit_price) || 0
          // Removal-ÄTA: negativ unit_price så subtotal-summering kan
          // tas rakt över alla rader utan filter på change_type.
          const price = isRemoval ? -Math.abs(rawPrice) : rawPrice
          items.push({
            id: `ii_${Math.random().toString(36).slice(2, 14)}`,
            item_type: 'item',
            description: ai.name || ai.description || groupLabel,
            quantity: qty,
            unit: ai.unit || 'st',
            unit_price: price,
            total: qty * price,
            is_rot_eligible: false,
            is_rut_eligible: false,
            sort_order: sortOrder++,
            group_name: groupLabel,
            _source: 'ata',
            _change_id: ata.change_id,
            _ata_number: ata.ata_number,
          })
        }
      } else {
        // ÄTA utan items — använd ata.total som enrads-fallback
        const rawTotal = Math.abs(Number(ata.total) || 0)
        const total = isRemoval ? -rawTotal : rawTotal
        items.push({
          id: `ii_${Math.random().toString(36).slice(2, 14)}`,
          item_type: 'item',
          description: ata.description,
          quantity: 1,
          unit: 'st',
          unit_price: total,
          total,
          is_rot_eligible: false,
          is_rut_eligible: false,
          sort_order: sortOrder++,
          group_name: groupLabel,
          _source: 'ata',
          _change_id: ata.change_id,
          _ata_number: ata.ata_number,
        })
      }
    }

    // ── 6. Subtotal, VAT, total ─────────────────────────────────
    const regularItems = items.filter(i => (i.item_type || 'item') === 'item')
    const subtotal = regularItems.reduce((s, i) => s + (Number(i.quantity) * Number(i.unit_price)), 0)
    const vatRate = 25
    const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100
    const total = Math.round((subtotal + vatAmount) * 100) / 100

    // ── 7. ROT/RUT ──────────────────────────────────────────────
    const rotLabor = regularItems
      .filter(i => i.is_rot_eligible)
      .reduce((s, i) => s + (Number(i.quantity) * Number(i.unit_price)), 0)
    const rutLabor = regularItems
      .filter(i => i.is_rut_eligible)
      .reduce((s, i) => s + (Number(i.quantity) * Number(i.unit_price)), 0)

    let rotRutType: 'rot' | 'rut' | null = null
    let rotRutDeduction = 0
    let customerPays = total

    if (rotLabor > 0) {
      rotRutType = 'rot'
      rotRutDeduction = Math.round(rotLabor * 0.30 * 100) / 100
      customerPays = Math.round((total - rotRutDeduction) * 100) / 100
    } else if (rutLabor > 0) {
      rotRutType = 'rut'
      rotRutDeduction = Math.round(rutLabor * 0.50 * 100) / 100
      customerPays = Math.round((total - rotRutDeduction) * 100) / 100
    }

    // ── 8. Generera invoice_number + OCR ────────────────────────
    const prefix = businessConfig?.invoice_prefix || 'FV'
    const nextNum = businessConfig?.next_invoice_number || 1
    const year = new Date().getFullYear()
    const invoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`
    const ocrNumber = generateOCR(String(nextNum))

    const dueDays = businessConfig?.default_payment_days || 30
    const invoiceDate = new Date()
    const dueDate = new Date(invoiceDate)
    dueDate.setDate(dueDate.getDate() + dueDays)

    // ── 9. INSERT invoice ───────────────────────────────────────
    // invoice-tabellen har INTE project_id-kolumn (TD-31). Projekt-
    // koppling sker indirekt via quote_id → project.quote_id. För att
    // hitta "alla fakturor för ett projekt" får man joina via quote.
    // V2: ALTER TABLE invoice ADD COLUMN project_id TEXT.
    const { data: invoice, error: insertError } = await supabase
      .from('invoice')
      .insert({
        business_id: business.business_id,
        customer_id: project.customer_id,
        quote_id: project.quote_id || null,
        invoice_number: invoiceNumber,
        invoice_type: 'final',
        status: 'draft',
        items,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        rot_rut_type: rotRutType,
        rot_rut_deduction: rotRutDeduction,
        customer_pays: customerPays,
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        ocr_number: ocrNumber,
        introduction_text: quote?.introduction_text || null,
        conclusion_text: quote?.conclusion_text || null,
        bankgiro_number: businessConfig?.bankgiro || null,
        plusgiro_number: businessConfig?.plusgiro || null,
        bank_account: businessConfig?.bank_account_number || null,
      })
      .select('invoice_id, invoice_number')
      .single()

    if (insertError) {
      console.error('[create-final-invoice] insert error:', insertError)
      return NextResponse.json(
        {
          error: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
          stage: 'invoice_insert',
        },
        { status: 500 },
      )
    }

    // ── 10. Bump next_invoice_number ────────────────────────────
    // Inte atomic — om två requests kör samtidigt kan vi få samma
    // nummer. Lågt-concurrency pilot OK; produktion behöver sequence
    // eller advisory lock (samma anti-pattern som app/api/invoices/route.ts).
    const { error: bumpError } = await supabase
      .from('business_config')
      .update({ next_invoice_number: nextNum + 1 })
      .eq('business_id', business.business_id)

    if (bumpError) {
      console.warn('[create-final-invoice] next_invoice_number bump failed (invoice already created):', bumpError)
    }

    // ── 11. UPDATE project_change → status='invoiced' ───────────
    // TD-29: detta är inte atomic med INSERT invoice. Om denna UPDATE
    // failar är vi i half-state — fakturan finns men ÄTA är inte
    // markerade invoiced. Loggar error så Andreas kan kompensera
    // manuellt (manuell UPDATE i Supabase SQL Editor).
    let ataUpdateWarning: string | undefined
    if (signedAtas.length > 0) {
      const changeIds = signedAtas.map(a => a.change_id)
      const { error: updateError } = await supabase
        .from('project_change')
        .update({
          status: 'invoiced',
          invoice_id: invoice.invoice_id,
          invoiced_at: new Date().toISOString(),
        })
        .in('change_id', changeIds)
        .eq('business_id', business.business_id)

      if (updateError) {
        console.error('[create-final-invoice] CRITICAL: project_change update failed after invoice insert:', {
          invoice_id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
          change_ids: changeIds,
          error: updateError,
        })
        ataUpdateWarning = `Fakturan skapades (${invoice.invoice_number}) men ÄTA-status kunde inte uppdateras. Kontakta support — change_ids: ${changeIds.join(', ')}`
      }
    }

    // ── 12. Response ────────────────────────────────────────────
    return NextResponse.json({
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      ...(ataUpdateWarning ? { warning: ataUpdateWarning } : {}),
    })
  } catch (error: any) {
    console.error('[create-final-invoice] unexpected error:', error)
    return NextResponse.json(
      { error: error?.message || 'Serverfel', stage: 'unexpected' },
      { status: 500 },
    )
  }
}
