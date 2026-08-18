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
import { createInvoice } from '@/lib/invoices/create-invoice'
import { byggProjektFakturaUnderlag } from '@/lib/invoices/project-invoice-draft'
import { sendInvoice } from '@/lib/invoices/send-invoice'

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
    // 1–6. Hela kompositionen (offertrader → ÄTA → totaler → ROT → kunden
    // betalar) bor i lib/invoices/project-invoice-draft.ts sedan Tur 4
    // etapp 2 — samma underlag bygger missad-intäkt-svepets fakturera_projekt-
    // kort och godkännandets drift-vakt. Historiken (quote_items-sanningen
    // P1-3, ROT-årstaket, tillvalsregeln) står i helpern.
    const underlag = await byggProjektFakturaUnderlag(supabase, businessId, projectId)

    if (!underlag.ok) {
      if (underlag.reason === 'faktura_finns') {
        return { success: true, invoice_id: underlag.existingInvoiceId, error: 'Faktura finns redan för projektet' }
      }
      return { success: false, error: underlag.error }
    }

    const { project, items: allItems, subtotal, vatRate, vatAmount, total } = underlag
    const { rotRutType, rotRutDeduction, personnummer, fastighetsbeteckning } = underlag
    const customerPays = underlag.customerPays
    const hasAta = underlag.hasAta

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
        rotRutType,
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
    if (underlag.ataChangeIds.length > 0) {
      // Delade vägen (P0-4): atomisk via RPC:n när v104 är körd.
      // Misslyckas markeringen är det ÄTA:n som blir fel, inte fakturan —
      // och det ska synas i loggen i stället för att dyka upp som ett
      // falskt intäktsfynd tre dygn senare.
      const markering = await markInvoiceSources(supabase, {
        businessId,
        invoiceId: invoice.invoice_id,
        changeIds: underlag.ataChangeIds,
      })
      if (!markering.ok) {
        console.error('[auto-invoice] kunde inte markera ÄTA som fakturerade:', markering.errors, {
          project_id: projectId,
          invoice_id: invoice?.invoice_id,
          ata_count: underlag.ataChangeIds.length,
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

    // 10. Om auto-send: skicka direkt via den delade sändkärnan (Etapp Q,
    // TD-86, 2026-08-18).
    //
    // TIDIGARE BUGG: här stod ett `await fetch('${appUrl}/api/invoices/send')`
    // — ett internt HTTP-anrop mot en rutt som kräver getAuthenticatedBusiness.
    // Ett serveranrop utan session svarade 401 VARJE gång, resultatet kastades
    // dessutom bort i en tom catch, så en alltid misslyckande sändning såg ut
    // som en lyckad i månader. `_internal_business_id` som skickades med
    // konsumerades aldrig av rutten — en verkningslös lösning på problemet.
    //
    // Fixen: sändkärnan (lib/invoices/send-invoice.ts, samma kod som den
    // manuella sändningen använder) flyttades ut ur rutten och anropas här
    // DIREKT med servicerollens supabase-klient som redan finns i scope.
    // Inget nätverksanrop, ingen session behövs — och resultatet LÄSES:
    // misslyckas sändningen förblir fakturan ett utkast och hantverkaren
    // får veta det, precis som innan.
    let levererad = false
    if (autoSend && customer?.email) {
      try {
        const sendResult = await sendInvoice(supabase, {
          businessId,
          invoiceId: invoice.invoice_id,
          sendEmail: true,
          sendSms: !!customer.phone_number,
        })
        levererad = Boolean(sendResult.email || sendResult.sms)
        if (!levererad) {
          console.error('[auto-invoice] sändningen nekades:', sendResult.errors, {
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
            has_ata: hasAta,
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
          has_ata: hasAta,
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
