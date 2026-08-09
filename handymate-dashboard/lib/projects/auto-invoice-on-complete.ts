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
import { markInvoiceSources } from '@/lib/invoices/mark-sources'
import { calculateCappedDeduction } from '@/lib/rot-rut-limits'
import { createInvoice } from '@/lib/invoices/create-invoice'

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

      /**
       * ═══ RADERNA LÄSES FRÅN quote_items — SANNINGEN, INTE SPEGLINGEN ═══
       * (Projektauditen P1-3, lagad 2026-08-09.)
       *
       * quotes.items (JSONB) är en legacy-spegling. Moderna offerter sparar
       * `items: []` där — raderna bor i quote_items-tabellen, som PDF och
       * utskick redan läser. Den här vägen läste BARA speglingen: fakturan
       * för ett modernt fastprisprojekt byggdes alltså utan offertens rader —
       * enbart ÄTA, eller "Inga fakturarader" — medan siffran på kortet såg
       * rimlig ut.
       *
       * Tabellen först; JSONB:n enbart som fallback för offerter skapade
       * innan quote_items fanns. Sektioner/textblock och dolda rader (v90:
       * priset ingår i summan) följer med — samma innehåll som kunden såg
       * och skrev på.
       */
      const { data: strukturerade } = await supabase
        .from('quote_items')
        .select('item_type, description, quantity, unit, unit_price, total, is_rot_eligible, sort_order, is_hidden, option_selected')
        .eq('quote_id', project.quote_id)
        .eq('business_id', businessId)
        .order('sort_order')

      if (strukturerade && strukturerade.length > 0) {
        quoteItems = strukturerade
          // Tillval kunden INTE valde ska aldrig faktureras. Valda tillval blir
          // vanliga rader — annars hade subtotalens item-filter tyst tappat
          // arbete kunden faktiskt beställt (quote-calculations räknar
          // selected options som items; fakturan måste göra detsamma).
          .filter((item: any) => item.item_type !== 'option' || item.option_selected === true)
          .map((item: any, i: number) => ({
            id: 'ii_q_' + Math.random().toString(36).substr(2, 8),
            item_type: item.item_type === 'option' ? 'item' : (item.item_type || 'item'),
            description: item.description || '',
            quantity: item.quantity || 1,
            unit: item.unit || 'st',
            unit_price: item.unit_price || 0,
            total: item.total ?? (item.quantity || 1) * (item.unit_price || 0),
            is_rot_eligible: item.is_rot_eligible || false,
            sort_order: item.sort_order ?? i,
          }))
      } else if (quote?.items && Array.isArray(quote.items)) {
        // Legacy-offert: JSONB:n är den enda källan som finns.
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
      }

      if (quote && quoteItems.length > 0) {
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
          { vatRate },
        )
        rotRutDeduction = capped.deduction
      }
      customerPays = total - rotRutDeduction
    }

    // 7. Hämta config
    const { data: config } = await supabase
      .from('business_config')
      .select('default_payment_days, auto_invoice_on_complete, business_name, personal_phone, swish_number')
      .eq('business_id', businessId)
      .single()

    const autoSend = config?.auto_invoice_on_complete === true
    const dueDays = config?.default_payment_days || 30
    const invoiceDate = new Date()
    const dueDate = new Date(invoiceDate)
    dueDate.setDate(dueDate.getDate() + dueDays)

    // 8. Skapa faktura — ETAPP 6a (offert-masterplan.md): gemensam kärna
    // för nummer/OCR/datum/insert/bump, se lib/invoices/create-invoice.ts.
    //
    // ═══ SKAPAS ALLTID SOM UTKAST (N3, 2026-08-07) ═══
    //
    // Raden löd tidigare `autoSend ? 'sent' : 'draft'`. Fakturan märktes alltså
    // skickad INNAN sändningen ens försökts — och sändningen nedan misslyckades
    // alltid, eftersom /api/invoices/send kräver getAuthenticatedBusiness och det
    // här är ett serveranrop utan session. Felet swaljdes av en tom catch, och
    // hantverkaren fick SMS om att fakturan gått iväg.
    //
    // Auto-sändningen har alltså aldrig fungerat, och produkten har sagt motsatsen.
    //
    // Nu skapas fakturan som utkast. Blir den skickad är det sändrutten som sätter
    // om statusen, och först då säger vi det. Ett leveransfel kan inte längre
    // producera vare sig `sent`-status eller "skickad"-copy.
    const invoiceStatus = 'draft'
    let invoice: { invoice_id: string; invoice_number: string; total: number; status: string }
    let invoiceNumber: string
    try {
      const created = await createInvoice(supabase, {
        businessId,
        customerId: project.customer_id,
        items: allItems,
        subtotal,
        vatRate,
        vatAmount,
        total,
        rotRutType: (rotRutType as 'rot' | 'rut' | null) || null,
        rotRutDeduction,
        customerPays: customerPays || total,
        projectId,
        quoteId: project.quote_id || null,
        invoiceType: 'standard',
        status: invoiceStatus,
        dueDays,
        invoiceDate,
        personnummer,
        fastighetsbeteckning,
        selectClause: 'invoice_id, invoice_number, total, status',
      })
      invoice = created.invoice
      invoiceNumber = created.invoiceNumber
    } catch (insertErr: any) {
      return { success: false, error: insertErr.message }
    }

    // ── Markera ÄTA som fakturerade ──────────────────────────────────────
    //
    // Satte tidigare BARA `status`. Intäktssvepet (lib/value/missed-revenue.ts:117)
    // tittar enbart på `invoiced_at`, aldrig på status — så varje ÄTA som
    // fakturerats den här vägen larmades tre dygn senare som "inte fakturerad".
    // Ett kort som uppmanar hantverkaren att fakturera samma arbete en gång
    // till är värre än inget kort alls.
    //
    // Detta syntes aldrig i drift eftersom svepet samtidigt var en no-op
    // (fel kolumnnamn, se cron-rutten). Båda lagas i samma commit — lagar man
    // bara svepet byter man en tyst nolla mot falska larm.
    //
    // `create-final-invoice/route.ts:436-444` gjorde redan rätt; den här vägen
    // gör nu likadant. Även `business_id` läggs till: en `.in()` på id:n utan
    // företagsfilter förlitade sig på att id:n är globalt unika.
    if (atas && atas.length > 0) {
      // Delade vägen (P0-4): atomisk via RPC:n när v104 är körd.
      // Misslyckas markeringen är det ÄTA:n som blir fel, inte fakturan —
      // och det ska synas i loggen i stället för att dyka upp som ett
      // falskt intäktsfynd tre dygn senare.
      const markering = await markInvoiceSources(supabase, {
        businessId,
        invoiceId: invoice.invoice_id,
        changeIds: atas.map(a => a.change_id),
      })
      if (!markering.ok) {
        console.error('[auto-invoice] kunde inte markera ÄTA som fakturerade:', markering.errors, {
          project_id: projectId,
          invoice_id: invoice?.invoice_id,
          ata_count: atas.length,
        })
      }
    }

    // 9. Hämta kundinfo
    const { data: customer } = await supabase
      .from('customer')
      .select('name, email, phone_number, portal_token, portal_enabled')
      .eq('customer_id', project.customer_id)
      .single()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    const dueDateStr = dueDate.toLocaleDateString('sv-SE')

    // 10. Om auto-send: försök skicka till kund via /api/invoices/send.
    //
    // Svaret LÄSES nu. Tidigare stod här ett `await fetch(...)` vars resultat
    // kastades bort och en tom catch — vilket är hur ett alltid misslyckande
    // anrop kunde se ut som en lyckad sändning i månader.
    //
    // KÄND BEGRÄNSNING: rutten kräver getAuthenticatedBusiness och det här är ett
    // serveranrop utan session, så den svarar 401. `_internal_business_id`
    // konsumeras inte av rutten — fältet var en verkningslös lösning på just det
    // problemet. Anropet ligger kvar för att intentionen ska vara synlig och för
    // att det börjar fungera den dag rutten får en server-till-server-väg. Men
    // det får inte längre PÅSTÅ något: misslyckas det förblir fakturan ett utkast
    // och hantverkaren får veta det.
    let levererad = false
    if (autoSend && customer?.email) {
      try {
        const res = await fetch(`${appUrl}/api/invoices/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice_id: invoice.invoice_id,
            send_email: true,
            send_sms: !!customer.phone_number,
          }),
        })
        levererad = res.ok
        if (!res.ok) {
          console.error('[auto-invoice] sändningen nekades:', res.status, {
            invoice_id: invoice.invoice_id,
            project_id: projectId,
          })
        }
      } catch (sendErr: any) {
        console.error('[auto-invoice] sändningen failade:', sendErr?.message || sendErr, {
          invoice_id: invoice.invoice_id,
          project_id: projectId,
        })
      }
    }

    // 11. SMS till hantverkaren
    try {
      if (config?.personal_phone) {
        const amountStr = total.toLocaleString('sv-SE')
        const customerName = customer?.name || 'kund'

        // Grenar på vad som FAKTISKT hände, inte på vad inställningen önskade.
        // Tidigare stod "skickad till kund" så fort auto-send var påslaget —
        // även när sändningen aldrig gick igenom.
        const invoiceUrl = `${appUrl}/dashboard/invoices/${invoice.invoice_id}`
        let smsMessage: string
        if (levererad) {
          smsMessage = `✅ Faktura ${invoiceNumber} på ${amountStr} kr skickad till ${customerName}. Betalning förfaller ${dueDateStr}. // Handymate`
        } else if (autoSend) {
          smsMessage = `⚠️ ${project.name} är klart och faktura på ${amountStr} kr är skapad — men den kunde inte skickas automatiskt. Granska och skicka själv: ${invoiceUrl}`
        } else {
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

    // 12. Ligger fakturan kvar som utkast: skapa pending_approval.
    //
    // Villkoret var `!autoSend`. Det räckte så länge auto-sändning antogs lyckas —
    // men när den misslyckas blir fakturan ett utkast som ingen får ett kort om,
    // och då ligger pengarna och väntar utan att någon vet. `!levererad` täcker
    // båda fallen: avstängd auto-sändning och misslyckad sådan.
    if (!levererad) {
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
          description: autoSend
            ? `Faktura ${invoiceNumber} på ${total.toLocaleString('sv-SE')} kr skapades automatiskt från avslutat projekt, men kunde inte skickas. Granska och skicka till ${customer?.name || 'kund'}.`
            : `Faktura ${invoiceNumber} på ${total.toLocaleString('sv-SE')} kr skapades automatiskt från avslutat projekt. Granska och skicka till ${customer?.name || 'kund'}.`,
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
            // ═══ KORTET SKA BÄRA DET MAN GODKÄNNER (regel 1, 2026-08-08) ═══
            //
            // Fakturautkastet är redan SKAPAT här ovanför — artefakten finns.
            // Men payloaden bar bara `total` och `items_count`, så kortet
            // visade en summa utan att man kunde se vad den bestod av.
            // "Granska faktura" utan raderna är en uppmaning att gå någon
            // annanstans, inte ett färdigt resultat.
            //
            // Samma form som create_quote_draft: raderna och delsummorna i
            // payloaden, så kortet kan visa dem utan att öppna fakturan.
            preview: {
              items: allItems,
              subtotal,
              vat_amount: vatAmount,
              total,
              rot_rut_deduction: rotRutDeduction || 0,
              customer_pays: customerPays ?? total,
            },
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
      await supabase.from('customer_activity').insert({
        business_id: businessId,
        customer_id: project.customer_id,
        activity_type: 'invoice_created',
        // Loggen säger vad som hände, inte vad som var påslaget.
        description: `Faktura ${invoiceNumber} skapades automatiskt från projekt "${project.name}"${levererad ? ' och skickades till kund' : ' (utkast)'}`,
        metadata: {
          invoice_id: invoice.invoice_id,
          project_id: projectId,
          auto_sent: levererad,
          has_ata: ataItems.length > 0,
        },
      })
    } catch { /* non-blocking */ }

    return {
      success: true,
      invoice_id: invoice.invoice_id,
      invoice_number: invoiceNumber,
      total,
      // Returnerar det faktiska sluttillståndet. Anroparen får inte veta "sent"
      // om ingenting lämnat huset — det var precis den lögnen som fanns här.
      status: (levererad ? 'sent' : 'draft') as 'draft' | 'sent',
    }
  } catch (err: any) {
    console.error('[autoInvoiceOnComplete] Error:', err)
    return { success: false, error: err.message }
  }
}
