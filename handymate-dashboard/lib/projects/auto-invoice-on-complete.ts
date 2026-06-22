/**
 * Auto-faktura vid projektavslut
 *
 * Skapar faktura baserat på offert + godkända ÄTA.
 * - auto_invoice_on_complete = true  → skicka direkt till kund
 * - auto_invoice_on_complete = false → skapa utkast + pending_approval
 *
 * Notifierar alltid hantverkaren via SMS.
 */

import { getServerSupabase } from '@/lib/supabase'
import { generateOCR } from '@/lib/ocr'
import { calculateCappedDeduction } from '@/lib/rot-rut-limits'

interface AutoInvoiceResult {
  success: boolean
  invoice_id?: string
  invoice_number?: string
  total?: number
  status?: 'draft' | 'sent'
  error?: string
}

export async function autoInvoiceOnComplete(
  businessId: string,
  projectId: string,
): Promise<AutoInvoiceResult> {
  const supabase = getServerSupabase()

  try {
    // 1. Hämta projekt med offert-referens
    const { data: project, error: projErr } = await supabase
      .from('project')
      .select('project_id, name, customer_id, quote_id, budget_amount')
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .single()

    if (projErr || !project) {
      return { success: false, error: 'Projekt hittades inte' }
    }

    if (!project.customer_id) {
      return { success: false, error: 'Projektet saknar kund' }
    }

    // 2. Kolla om faktura redan finns för projektet
    const { data: existingInvoice } = await supabase
      .from('invoice')
      .select('invoice_id')
      .eq('business_id', businessId)
      .eq('project_id', projectId)
      .limit(1)
      .maybeSingle()

    if (existingInvoice) {
      return { success: true, invoice_id: existingInvoice.invoice_id, error: 'Faktura finns redan för projektet' }
    }

    // 3. Hämta offert om den finns
    let quoteItems: any[] = []
    let rotRutType: string | null = null
    let rotRutDeduction = 0
    let customerPays: number | null = null
    let personnummer: string | null = null
    let fastighetsbeteckning: string | null = null
    let vatRate = 25

    if (project.quote_id) {
      const { data: quote } = await supabase
        .from('quotes')
        .select('items, rot_rut_type, rot_rut_deduction, customer_pays, personnummer, fastighetsbeteckning, vat_rate')
        .eq('quote_id', project.quote_id)
        .single()

      if (quote?.items && Array.isArray(quote.items)) {
        quoteItems = quote.items.map((item: any, i: number) => ({
          id: 'ii_q_' + Math.random().toString(36).substr(2, 8),
          item_type: item.item_type || 'item',
          description: item.description || item.name || '',
          quantity: item.quantity || 1,
          unit: item.unit || 'st',
          unit_price: item.unit_price || item.price || 0,
          total: (item.quantity || 1) * (item.unit_price || item.price || 0),
          type: item.type,
          is_rot_eligible: item.is_rot_eligible || false,
          sort_order: item.sort_order ?? i,
        }))
        rotRutType = quote.rot_rut_type || null
        rotRutDeduction = quote.rot_rut_deduction || 0
        customerPays = quote.customer_pays || null
        personnummer = quote.personnummer || null
        fastighetsbeteckning = quote.fastighetsbeteckning || null
        vatRate = quote.vat_rate || 25
      }
    }

    // 4. Hämta godkända ÄTA (change orders)
    const { data: atas } = await supabase
      .from('project_change')
      .select('change_id, description, items, total, change_type')
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .in('status', ['approved', 'signed'])

    const ataItems: any[] = []
    if (atas && atas.length > 0) {
      // Lägg till ÄTA-rubrik
      ataItems.push({
        id: 'ii_ata_header',
        item_type: 'heading',
        description: 'Tilläggsarbeten (ÄTA)',
        quantity: 0,
        unit: '',
        unit_price: 0,
        total: 0,
      })

      for (const ata of atas) {
        if (ata.items && Array.isArray(ata.items)) {
          for (const item of ata.items) {
            const sign = ata.change_type === 'removal' ? -1 : 1
            ataItems.push({
              id: 'ii_ata_' + Math.random().toString(36).substr(2, 8),
              item_type: ata.change_type === 'removal' ? 'discount' : 'item',
              description: item.description || item.name || ata.description || 'ÄTA',
              quantity: item.quantity || 1,
              unit: item.unit || 'st',
              unit_price: Math.abs(item.unit_price || 0),
              total: sign * Math.abs((item.quantity || 1) * (item.unit_price || 0)),
              type: item.type || 'labor',
              is_rot_eligible: false,
              sort_order: 900 + ataItems.length,
            })
          }
        } else if (ata.total) {
          const sign = ata.change_type === 'removal' ? -1 : 1
          ataItems.push({
            id: 'ii_ata_' + Math.random().toString(36).substr(2, 8),
            item_type: ata.change_type === 'removal' ? 'discount' : 'item',
            description: ata.description || 'Tilläggsarbete',
            quantity: 1,
            unit: 'st',
            unit_price: Math.abs(ata.total),
            total: sign * Math.abs(ata.total),
            type: 'labor',
            is_rot_eligible: false,
            sort_order: 900 + ataItems.length,
          })
        }
      }
    }

    // 5. Kombinera alla rader
    const allItems = [...quoteItems, ...ataItems]

    if (allItems.length === 0) {
      return { success: false, error: 'Inga fakturarader — varken offert eller ÄTA hittades' }
    }

    // 6. Beräkna totaler
    const regularItems = allItems.filter(i => i.item_type === 'item' || !i.item_type)
    const discountItems = allItems.filter(i => i.item_type === 'discount')
    const subtotal = regularItems.reduce((sum, i) => sum + (i.total || 0), 0)
      - discountItems.reduce((sum, i) => sum + Math.abs(i.total || 0), 0)
    const vatAmount = Math.round(subtotal * (vatRate / 100))
    const total = subtotal + vatAmount

    // ROT/RUT med årstaksvalidering. Tidigare användes rå procentsats (0.3/0.5)
    // utan tak → avdraget kunde överskrida kundens årsutrymme och nekas av
    // Skatteverket. Kapa mot kundens återstående utrymme i båda grenarna.
    if (rotRutType) {
      const rate = rotRutType === 'rut' ? 0.5 : 0.3
      let eligibleLabor: number
      if (ataItems.length > 0) {
        // ÄTA ändrade totalen → räkna om underlaget från ROT-berättigade rader
        eligibleLabor = allItems
          .filter(i => i.is_rot_eligible && i.item_type !== 'discount')
          .reduce((sum, i) => sum + (i.total || 0), 0)
      } else {
        // Härled underlaget från offertens (kopierade) avdrag
        eligibleLabor = rotRutDeduction ? rotRutDeduction / rate : 0
      }
      if (eligibleLabor > 0) {
        const capped = await calculateCappedDeduction(
          project.customer_id,
          businessId,
          rotRutType as 'rot' | 'rut',
          eligibleLabor,
        )
        rotRutDeduction = capped.deduction
      }
      customerPays = total - rotRutDeduction
    }

    // 7. Hämta config
    const { data: config } = await supabase
      .from('business_config')
      .select('invoice_prefix, next_invoice_number, default_payment_days, auto_invoice_on_complete, business_name, personal_phone, swish_number')
      .eq('business_id', businessId)
      .single()

    const autoSend = config?.auto_invoice_on_complete === true
    const prefix = config?.invoice_prefix || 'FV'
    const nextNum = config?.next_invoice_number || 1
    const year = new Date().getFullYear()
    const invoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`
    const ocrNumber = generateOCR(String(nextNum))
    const dueDays = config?.default_payment_days || 30
    const invoiceDate = new Date()
    const dueDate = new Date(invoiceDate)
    dueDate.setDate(dueDate.getDate() + dueDays)

    // 8. Skapa faktura
    const invoiceStatus = autoSend ? 'sent' : 'draft'
    const { data: invoice, error: insertErr } = await supabase
      .from('invoice')
      .insert({
        business_id: businessId,
        customer_id: project.customer_id,
        project_id: projectId,
        quote_id: project.quote_id || null,
        invoice_number: invoiceNumber,
        invoice_type: 'standard',
        status: invoiceStatus,
        items: allItems,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        rot_rut_type: rotRutType,
        rot_rut_deduction: rotRutDeduction,
        customer_pays: customerPays || total,
        personnummer,
        fastighetsbeteckning,
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        ocr_number: ocrNumber,
      })
      .select('invoice_id, invoice_number, total, status')
      .single()

    if (insertErr) {
      return { success: false, error: insertErr.message }
    }

    // Increment fakturanummer
    await supabase
      .from('business_config')
      .update({ next_invoice_number: nextNum + 1 })
      .eq('business_id', businessId)

    // Markera ÄTA som fakturerade
    if (atas && atas.length > 0) {
      await supabase
        .from('project_change')
        .update({ status: 'invoiced' })
        .in('change_id', atas.map(a => a.change_id))
    }

    // 9. Hämta kundinfo
    const { data: customer } = await supabase
      .from('customer')
      .select('name, email, phone_number, portal_token, portal_enabled')
      .eq('customer_id', project.customer_id)
      .single()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    const dueDateStr = dueDate.toLocaleDateString('sv-SE')

    // 10. Om auto-send: skicka till kund via /api/invoices/send
    if (autoSend && customer?.email) {
      try {
        await fetch(`${appUrl}/api/invoices/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice_id: invoice.invoice_id,
            send_email: true,
            send_sms: !!customer.phone_number,
            _internal_business_id: businessId,
          }),
        })
      } catch {
        // Non-blocking — fakturan är skapad även om send misslyckas
      }
    }

    // 11. SMS till hantverkaren
    try {
      if (config?.personal_phone) {
        const amountStr = total.toLocaleString('sv-SE')
        const customerName = customer?.name || 'kund'

        let smsMessage: string
        if (autoSend) {
          smsMessage = `✅ Faktura ${invoiceNumber} på ${amountStr} kr skickad till ${customerName}. Betalning förfaller ${dueDateStr}. // Handymate`
        } else {
          const invoiceUrl = `${appUrl}/dashboard/invoices/${invoice.invoice_id}`
          smsMessage = `✅ ${project.name} är klart! Faktura på ${amountStr} kr är skapad som utkast — granska och skicka: ${invoiceUrl}`
        }

        await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: config.personal_phone,
            message: smsMessage,
            business_id: businessId,
          }),
        })
      }
    } catch {
      // Non-blocking
    }

    // 12. Om draft: skapa pending_approval
    if (!autoSend) {
      try {
        // Tidigare bugg: insert med fel kolumnnamn (type/context istället för
        // approval_type/payload) + approval_type NOT NULL utan default →
        // PostgREST avvisade raden, men .error lästes aldrig och .insert()
        // kastar inte → silent failure (review_auto_invoice-draften skapades
        // aldrig). Korrekt shape + synlig .error-loggning nedan.
        const { error: approvalErr } = await supabase.from('pending_approvals').insert({
          business_id: businessId,
          approval_type: 'review_auto_invoice',
          title: `Granska faktura — ${project.name}`,
          description: `Faktura ${invoiceNumber} på ${total.toLocaleString('sv-SE')} kr skapades automatiskt från avslutat projekt. Granska och skicka till ${customer?.name || 'kund'}.`,
          risk_level: 'medium',
          status: 'pending',
          payload: {
            agent_id: 'karin',
            invoice_id: invoice.invoice_id,
            invoice_number: invoiceNumber,
            project_id: projectId,
            project_name: project.name,
            customer_id: project.customer_id,
            customer_name: customer?.name || null,
            total,
            items_count: allItems.length,
            has_ata: ataItems.length > 0,
            rot_rut_type: rotRutType,
          },
        })
        if (approvalErr) {
          console.error(
            '[autoInvoiceOnComplete] review_auto_invoice-approval insert failed (non-blocking):',
            { business_id: businessId, invoice_id: invoice.invoice_id, error: approvalErr.message },
          )
        }
      } catch (err: any) {
        // Non-blocking — fakturan är redan skapad; approval-kortet är sekundärt.
        // Loggas synligt så framtida schema-/credits-stopp inte göms.
        console.error(
          '[autoInvoiceOnComplete] review_auto_invoice-approval insert threw (non-blocking):',
          { business_id: businessId, invoice_id: invoice.invoice_id, error: err?.message || String(err) },
        )
      }
    }

    // 13. Logga aktivitet
    try {
      await supabase.from('activity').insert({
        business_id: businessId,
        customer_id: project.customer_id,
        activity_type: 'invoice_created',
        description: `Faktura ${invoiceNumber} skapades automatiskt från projekt "${project.name}"${autoSend ? ' och skickades till kund' : ' (utkast)'}`,
        metadata: {
          invoice_id: invoice.invoice_id,
          project_id: projectId,
          auto_sent: autoSend,
          has_ata: ataItems.length > 0,
        },
      })
    } catch { /* non-blocking */ }

    return {
      success: true,
      invoice_id: invoice.invoice_id,
      invoice_number: invoiceNumber,
      total,
      status: invoiceStatus as 'draft' | 'sent',
    }
  } catch (err: any) {
    console.error('[autoInvoiceOnComplete] Error:', err)
    return { success: false, error: err.message }
  }
}
