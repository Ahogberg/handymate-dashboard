/**
 * Delad fakturasändkärna (Etapp Q, TD-86, 2026-08-18).
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * `app/api/invoices/send/route.ts` gjorde tidigare ALLT: auth, validering
 * OCH den faktiska sändningen (email/SMS/PDF/manifest/status). Det gick bra
 * så länge enda anroparen var en inloggad användare i webbläsaren — men
 * `autoInvoiceOnComplete` (lib/projects/auto-invoice-on-complete.ts) körs
 * server-till-server utan session och behövde samma sändning. Den gjorde
 * ett internt `fetch('/api/invoices/send')`, vilket rutten avvisade med 401
 * (`getAuthenticatedBusiness` hittar ingen session) — VARJE gång. Auto-
 * fakturan blev alltid kvar som utkast, tyst.
 *
 * Fixen följer husmönstret från `lib/invoice-reminder-send.ts` (delas redan
 * av cron + approvals): sändkärnan flyttas hit, ut ur rutten. Rutten gör nu
 * bara auth + validering + anrop hit. `autoInvoiceOnComplete` anropar denna
 * funktion DIREKT — inget nätverksanrop, ingen session behövs, samma kod
 * som den manuella sändningen (PDF-bilaga, portal-länk, Swish, ROT/RUT-mall,
 * manifest-krokarna).
 *
 * Detta SKAPAR samtidigt den leverans-strypunkt som manifest-inventeringen
 * (Etapp P) konstaterade saknades: av de tre sent-skrivarna går nu TVÅ
 * (manuell sändning + auto-faktura) genom en och samma kärna. Fortnox-vägen
 * (`send-via-fortnox/route.ts`) förblir egen — den skriver bokföring, inte
 * email/SMS, och har redan sina egna manifest-krokar.
 *
 * KONTRAKT: sendInvoice() förutsätter att business_id ÄGER fakturan (queryn
 * filtrerar på business_id) men gör INGEN egen auth/behörighets-/rate-limit-
 * kontroll — det är anroparens ansvar (rutten gör det redan; auto-fakturan
 * kör med servicerollen och har redan verifierat businessId högre upp).
 */

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateOCR } from '@/lib/ocr'
import { generateInvoicePDF } from '@/lib/pdf-generator'
import { generateSwishQR } from '@/lib/swish-qr'
import { buildInvoicePdfBuffer } from '@/lib/invoices/build-invoice-pdf'
import { randomUUID } from 'crypto'
import { prepareInvoiceManifest, markInvoiceDelivered } from '@/lib/invoices/evidence-manifest'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import { syncInvoiceToFortnox } from '@/lib/invoices/sync-to-fortnox'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export interface SendInvoiceParams {
  businessId: string
  invoiceId: string
  /** Skicka via email — anroparen avgör (rutten defaultar till true, se route.ts). */
  sendEmail: boolean
  /** Skicka via SMS — anroparen avgör. */
  sendSms: boolean
  /**
   * Vem som initierade utskicket — attributionsregeln (Codex Q-granskning
   * 2026-08-18): autofakturan får ALDRIG loggas som en mänsklig användare.
   * 'user' = en inloggad människa tryckte skicka (rutten, default).
   * 'automation' = systemflöde (auto-invoice-on-complete).
   * Skrivs till customer_activity.created_by.
   */
  source?: 'user' | 'automation'
}

export interface SendInvoiceResult {
  /** false = fakturan hittades inte (fel invoice_id eller fel business_id). */
  found: boolean
  /** true bara om email faktiskt gick ut (Resend accepterade den). */
  email?: boolean
  /** true bara om SMS faktiskt gick ut (godkänt av strypunkten). */
  sms?: boolean
  errors: string[]
}

/**
 * Skickar en faktura via email och/eller SMS, uppdaterar status, fryser/
 * markerar leveransmanifestet och triggar post-send-automationer (pipeline,
 * projektsteg, smart-kommunikation, portal-notis).
 *
 * Läser INTE session — anropas med en servicerolls-klient (eller en
 * request-scopad klient från rutten, bägge fungerar identiskt eftersom
 * queryn filtrerar på business_id).
 */
export async function sendInvoice(
  supabase: SupabaseClient,
  params: SendInvoiceParams,
): Promise<SendInvoiceResult> {
  const { businessId, invoiceId, sendEmail: send_email, sendSms: send_sms } = params

  // Hämta faktura med kundinfo och verifiera ägarskap. ETAPP 6b: samma
  // kundfält som invoices/pdf redan hämtar (address_line/personal_number/
  // property_designation) — mall-motorn (buildInvoiceTemplateData) läser
  // dem för PDF-bilagan, precis som den redan gör för nedladdningen.
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoice')
    .select(`
      *,
      customer:customer_id (
        name,
        phone_number,
        email,
        address_line,
        personal_number,
        property_designation,
        customer_number
      )
    `)
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .single()

  if (invoiceError || !invoice) {
    return { found: false, errors: [] }
  }

  // Enat fakturautskick (2026-08-20): Fortnox-bokföring FÖRE
  // kundleverans. Fortnox-fel blockerar HELA leveransen — ingen email/
  // SMS skickas om bokföringen misslyckades. syncInvoiceToFortnox() är
  // idempotent (redan 'synced' → no-op) så en omkörning efter ett
  // tidigare Fortnox-fel gör inte om det som redan lyckades.
  const fortnoxResult = await syncInvoiceToFortnox(supabase, { businessId, invoiceId })
  if (!fortnoxResult.success) {
    return { found: true, errors: [`Fortnox: ${fortnoxResult.error}`] }
  }

  // Etapp P (sql/v148): fryser fakturaunderlaget INNAN fysisk sändning
  // påbörjas. Best-effort — ett prepare-fel får ALDRIG blockera eller
  // fördröja utskicket, returvärdet ignoreras medvetet.
  await prepareInvoiceManifest(supabase, {
    businessId,
    invoiceId,
    projectId: invoice.project_id || null,
  })

  // Hämta företagsconfig — EN gång, för både PDF-generering och avsändar-/
  // kontaktinfo. Rutten hämtade tidigare samma rad TVÅ gånger (en gång via
  // getAuthenticatedBusiness, en gång direkt) — `business` DÄR var alltid
  // exakt denna business_config-rad (se lib/auth.ts), så dubbelhämtningen
  // var ren duplicering.
  const { data: businessConfig } = await supabase
    .from('business_config')
    .select('*')
    .eq('business_id', businessId)
    .single()

  const results: { sms?: boolean; email?: boolean; errors: string[] } = { errors: [] }

  // Säkerställ kundportal aktiverad
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  let portalUrl = ''
  if (invoice.customer_id) {
    const { data: cust } = await supabase
      .from('customer')
      .select('portal_token, portal_enabled')
      .eq('customer_id', invoice.customer_id)
      .single()

    if (cust?.portal_token && cust?.portal_enabled) {
      portalUrl = `${APP_URL}/portal/${cust.portal_token}?tab=invoices`
    } else {
      // Auto-skapa kundportal
      const newToken = randomUUID()
      await supabase
        .from('customer')
        .update({
          portal_token: newToken,
          portal_token_created_at: new Date().toISOString(),
          portal_enabled: true,
        })
        .eq('customer_id', invoice.customer_id)
      portalUrl = `${APP_URL}/portal/${newToken}?tab=invoices`
    }
  }

  // Skicka email
  if (send_email && invoice.customer?.email) {
    try {
      const pdfUrl = `${APP_URL}/api/invoices/pdf?invoiceId=${invoiceId}`
      const amountToPay = invoice.rot_rut_type ? invoice.customer_pays : invoice.total

      // ── Generera PDF-bilaga ────────────────────────────────────────
      // ETAPP 6b (offert-masterplan.md, faktura-sprinten): samma mall-
      // HTML→Chromium-väg som invoices/pdf (buildInvoicePdfBuffer, EN
      // källa) — tidigare byggde denna route en EGEN, avkortad jsPDF-data
      // (saknade OCR/personnummer/fastighetsbeteckning/referenser) så
      // mejlbilagan skiljde sig från nedladdningen. Fallbacken nedan
      // används bara om Chromium-rendering misslyckas.
      let pdfBuffer: Buffer
      try {
        const pdfFromHtml = await buildInvoicePdfBuffer(invoice, businessConfig, {
          logTag: 'invoices/send',
        })
        if (!pdfFromHtml) throw new Error('renderHtmlToPdf returnerade null')
        pdfBuffer = pdfFromHtml
      } catch (htmlPdfErr) {
        console.error('[invoices/send] HTML→PDF-vägen misslyckades — faller tillbaka till jsPDF:', htmlPdfErr)
        console.error('[invoices/send] FALLBACK-JSPDF AKTIV — Chromium-rendering misslyckades, mejlbilagan skickas med den äldre jsPDF-renderaren')
        const swishQR = await generateSwishQR(
          businessConfig?.swish_number,
          amountToPay || invoice.total,
          invoice.invoice_number,
        )
        pdfBuffer = generateInvoicePDF(
          {
            invoice_number: invoice.invoice_number,
            invoice_date: invoice.invoice_date,
            due_date: invoice.due_date,
            status: invoice.status,
            items: invoice.items || [],
            subtotal: invoice.subtotal,
            vat_rate: invoice.vat_rate,
            vat_amount: invoice.vat_amount,
            total: invoice.total,
            rot_rut_type: invoice.rot_rut_type,
            rot_rut_deduction: invoice.rot_rut_deduction,
            customer_pays: invoice.customer_pays,
            is_credit_note: invoice.is_credit_note,
            credit_reason: invoice.credit_reason,
            original_invoice_id: invoice.original_invoice_id,
            personnummer: invoice.personnummer,
            fastighetsbeteckning: invoice.fastighetsbeteckning,
            customer: invoice.customer,
            ocr_number: invoice.ocr_number || generateOCR(invoice.invoice_number || ''),
            our_reference: invoice.our_reference,
            your_reference: invoice.your_reference,
            invoice_type: invoice.invoice_type || 'standard',
          },
          {
            business_name: businessConfig?.business_name,
            org_number: businessConfig?.org_number,
            contact_email: businessConfig?.contact_email,
            contact_phone: businessConfig?.contact_phone,
            address: businessConfig?.address,
            bankgiro: businessConfig?.bankgiro,
            plusgiro: businessConfig?.plusgiro,
            swish_number: businessConfig?.swish_number,
            swish_qr: swishQR || undefined,
            f_skatt_registered: businessConfig?.f_skatt_registered,
          }
        )
      }

      // ═══ RETURVÄRDET MÅSTE LÄSAS (N3-felklassen, fynd av Codex 2026-08-08) ═══
      //
      // Resend-SDK:n kastar INTE vid HTTP-fel — den returnerar
      // { data: null, error } (node_modules/resend/dist/index.mjs).
      // Tidigare kastades svaret bort och results.email sattes till true
      // villkorslöst: en avvisad sändning blev alltså "skickad", och
      // fakturan fick status sent utan att någonting nått kunden. Exakt
      // samma mönster som auto-fakturans 401 — påstådd leverans utan
      // verifierad.
      //
      // getResend() instansieras HÄR (inte längst upp i funktionen, som i
      // den gamla rutten) — Resend-konstruktorn kastar synkront om
      // RESEND_API_KEY saknas. Instansierad tidigt kunde det kasta ETT steg
      // in i funktionen, INNAN ens fakturan hämtats eller SMS-vägen prövats
      // — en miljö utan RESEND_API_KEY kunde då aldrig skicka SMS-varningar
      // heller. Nu fångas felet av try/catchen nedan precis som alla andra
      // e-postfel, och SMS-försöket (om begärt) påverkas inte alls.
      const resend = getResend()
      const emailRes = await resend.emails.send({
        from: `${businessConfig?.business_name || 'Handymate'} <faktura@${process.env.RESEND_DOMAIN || 'handymate.se'}>`,
        to: invoice.customer.email,
        subject: `Faktura ${invoice.invoice_number} från ${businessConfig?.business_name || 'oss'}`,
        html: buildInvoiceEmailHtml({
          customerName: invoice.customer?.name || '',
          businessName: businessConfig?.business_name || '',
          invoiceNumber: invoice.invoice_number,
          dueDate: invoice.due_date,
          subtotal: invoice.subtotal,
          vatRate: invoice.vat_rate,
          vatAmount: invoice.vat_amount,
          amountToPay: amountToPay || 0,
          rotRutType: invoice.rot_rut_type,
          rotRutDeduction: invoice.rot_rut_deduction,
          bankgiro: businessConfig?.bankgiro,
          ocrNumber: invoice.ocr_number || generateOCR(invoice.invoice_number || ''),
          swishNumber: businessConfig?.swish_number,
          orgNumber: businessConfig?.org_number,
          contactEmail: businessConfig?.contact_email,
          contactPhone: businessConfig?.contact_phone,
          portalUrl: portalUrl || pdfUrl,
          pdfUrl,
        }),
        attachments: [
          {
            filename: `faktura-${invoice.invoice_number}.pdf`,
            content: pdfBuffer,
          }
        ]
      })

      if (emailRes.error) {
        console.error('Email send rejected by Resend:', emailRes.error)
        results.errors.push(`Email: ${emailRes.error.message || 'avvisad av e-posttjänsten'}`)
      } else {
        results.email = true
      }
    } catch (emailError: any) {
      console.error('Email send error:', emailError)
      results.errors.push(`Email: ${emailError.message}`)
    }
  }

  // Skicka SMS
  if (send_sms && invoice.customer?.phone_number) {
    try {
      const amountToPay = invoice.rot_rut_type ? invoice.customer_pays : invoice.total
      const smsLink = portalUrl || `${APP_URL}/api/invoices/pdf?invoiceId=${invoiceId}`

      // Genom strypunkten (etapp 0 batch 1) — ger opt-out-spärr, sms_log,
      // kostnadsmätning och typografitvätt. Utan den kunde en kund som
      // svarat STOPP få fakturan via SMS ändå.
      const { sendSmsViaElks } = await import('@/lib/sms-send')
      const smsResult = await sendSmsViaElks({
        supabase,
        businessId,
        businessName: businessConfig?.business_name,
        to: invoice.customer.phone_number,
        message: `Faktura ${invoice.invoice_number} från ${businessConfig?.business_name || 'oss'}.\n\nAtt betala: ${amountToPay?.toLocaleString('sv-SE')} kr\nFörfaller: ${new Date(invoice.due_date).toLocaleDateString('sv-SE')}\n\nSe faktura: ${smsLink}`,
        customerId: invoice.customer_id || null,
        relatedId: invoiceId,
        messageType: 'invoice',
        recipient: 'customer',
        purpose: 'transactional',
      })

      if (smsResult.success) {
        results.sms = true
      } else {
        results.errors.push(`SMS: ${smsResult.error || 'kunde inte skickas'}`)
      }
    } catch (smsError: any) {
      console.error('SMS send error:', smsError)
      results.errors.push(`SMS: ${smsError.message}`)
    }
  }

  // Uppdatera fakturastatus + manifest + aktivitetslogg. Utbruten till en
  // egen funktion (applyInvoiceDeliveryOutcome nedan) — det är HÄR leverans-
  // strypunktens invariant faktiskt sitter (status/manifest skrivs om OCH
  // BARA OM email eller sms faktiskt gick ut), och den tar BARA emot
  // `supabase`-parametern (ingen egen getServerSupabase()) — vilket gör den
  // facit-testbar i isolering utan att röra Resend/46elks/Chromium/produktions-
  // databasen (samma anledning som lib/sms-send.ts:s egen strypunkt bara
  // källskannas i tests/sms-quota-chokepoint.spec.ts — aldrig anropas live).
  const outcome = await applyInvoiceDeliveryOutcome(supabase, {
    businessId,
    invoiceId,
    invoice,
    results,
    source: params.source ?? 'user',
  })

  // Best-effort-sidoautomationer (pipeline/projektsteg/kommunikation/portal)
  // — EGEN, separat funktion (se triggerPostSendAutomations nedan) MEDVETET
  // inte anropad inifrån applyInvoiceDeliveryOutcome: den använder sin egen
  // getServerSupabase() internt (oförändrat sedan innan Etapp Q) och skulle
  // annars smyga med riktiga nätverksanrop in i den funktionens facit-tester.
  if (outcome.delivered) {
    await triggerPostSendAutomations({ businessId, invoiceId, invoice })
  }

  return { found: true, email: results.email, sms: results.sms, errors: results.errors }
}

export interface InvoiceDeliveryOutcomeParams {
  businessId: string
  invoiceId: string
  /**
   * Fakturaraden — samma otypade form som `.select('*')` ger (`invoice`
   * saknade en delad interface redan innan Etapp Q; customer_activity-
   * loggningen läser fält som business_id/customer_id/invoice_number).
   */
  invoice: any
  results: { email?: boolean; sms?: boolean; errors: string[] }
  /** Attributionsregeln — se SendInvoiceParams.source. Default 'user'. */
  source?: 'user' | 'automation'
}

export interface InvoiceDeliveryOutcomeResult {
  /** true om email||sms lyckades — samma villkor som svarets success-fält. */
  delivered: boolean
  sentMethod: 'email' | 'sms' | 'both' | null
}

/**
 * Skriver `status='sent'`/`sent_at`/`sent_method`, markerar leveransmanifestet
 * och loggar customer_activity — MEN BARA om leveransen (results.email/sms)
 * faktiskt lyckades. Gör INGENTING (ingen skrivning, ingen mark, ingen
 * aktivitetslogg) om varken email eller sms gick ut — det är precis den
 * garantin som TD-86/Etapp Q handlar om.
 *
 * Anropar MEDVETET inte triggerPostSendAutomations (pipeline/projektsteg/
 * kommunikation/portal) — den funktionen använder sin egen getServerSupabase()
 * internt och skulle annars smyga med riktiga nätverksanrop mot produktions-
 * databasen in i den här funktionens facit-tester (tests/send-invoice-core.
 * spec.ts). sendInvoice() anropar båda funktionerna i tur och ordning.
 */
export async function applyInvoiceDeliveryOutcome(
  supabase: SupabaseClient,
  params: InvoiceDeliveryOutcomeParams,
): Promise<InvoiceDeliveryOutcomeResult> {
  const { businessId, invoiceId, invoice, results, source = 'user' } = params

  if (results.email || results.sms) {
    // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): sent_at/
    // sent_method sattes ALDRIG här — InvoiceStatusTimeline.tsx läser
    // BÅDA (rad 48-52) för att visa "Skickad via {metod}"-steget som
    // klart; utan sent_at visas steget som "upcoming" trots att fakturan
    // faktiskt är skickad. Samma buggklass som project.status-fyndet
    // tidigare i samma körning — en statusflip utan sina stödjande fält.
    const sentMethod = results.email && results.sms ? 'both' : results.email ? 'email' : 'sms'
    const { error: statusErr } = await supabase
      .from('invoice')
      .update({ status: 'sent', sent_at: new Date().toISOString(), sent_method: sentMethod, delivery_status: 'delivered' })
      .eq('invoice_id', invoiceId)

    if (statusErr) {
      console.error('[invoices/send] Status update failed after send:', statusErr)
      results.errors.push(`Status: ${statusErr.message}`)
      // Etapp P-härdning: felet svaldes tidigare (bara loggat till
      // console) trots att kunden FAKTISKT redan fått fakturan (email/sms
      // gick iväg innan detta steget). Gör det högt utan att ändra
      // svarssemantiken ovan — driftlarmet (automation_activity) fångar
      // det nu istället för att det försvinner i Vercel-loggarna.
      await rapporteraTystFel(
        supabase,
        businessId,
        'invoice-manifest:status-write-failed-after-delivery',
        statusErr.message,
        { invoiceId },
      )
    }

    // Manifestet markeras levererat OAVSETT om statusskrivningen ovan
    // lyckades — leveransen (email/sms) skedde, och det är den sanningen
    // manifestet fryser. Best-effort, blockerar aldrig svaret.
    await markInvoiceDelivered(supabase, {
      businessId,
      invoiceId,
      method: sentMethod,
    })

    // Logga aktivitet (customer_activity — gamla namnet activity fanns inte)
    // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): activity_id och
    // title är NOT NULL utan default på customer_activity — insertet
    // saknade båda och floppade TYST vid VARJE fakturautskick (ingen
    // .error-koll här, samma tysta-fel-mönster som redan dokumenterat i
    // auto-invoice-on-complete.ts). Fältformen kopierad från den
    // fungerande app/api/quotes/send/route.ts.
    const { error: activityErr } = await supabase
      .from('customer_activity')
      .insert({
        activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
        business_id: invoice.business_id,
        customer_id: invoice.customer_id,
        activity_type: 'invoice_sent',
        title: `Faktura ${invoice.invoice_number} skickad`,
        description: `Faktura ${invoice.invoice_number} skickad${results.email ? ' via email' : ''}${results.sms ? ' via SMS' : ''}`,
        metadata: { invoice_id: invoiceId, ...results },
        // Attributionsregeln: automationens utskick får aldrig se ut som en
        // människas klick — 'automation' när auto-invoice-on-complete skickade.
        created_by: source,
      })
    if (activityErr) {
      console.error('[invoices/send] customer_activity insert failed:', activityErr)
    }

    return { delivered: true, sentMethod }
  }

  // Enat fakturautskick (2026-08-20): Fortnox-steget (om aktuellt) körs
  // nu FÖRE detta, i sendInvoice(). Om vi hamnar här har bokföringen
  // alltså redan lyckats — det som misslyckades är bara kundleveransen.
  // delivery_status='delivery_failed' fångar exakt det tillståndet
  // (sql/v163) så en retry vet att bara göra om leveransen, aldrig
  // Fortnox-anropet.
  const { error: deliveryStatusErr } = await supabase
    .from('invoice')
    .update({ delivery_status: 'delivery_failed' })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
  if (deliveryStatusErr) {
    console.error('[invoices/send] delivery_status write failed:', deliveryStatusErr)
  }

  return { delivered: false, sentMethod: null }
}

export interface PostSendAutomationsParams {
  businessId: string
  invoiceId: string
  invoice: any
}

/**
 * Best-effort-sidoautomationer EFTER en lyckad leverans: pipeline-flytt,
 * projektsteg, smart-kommunikation, portal-notis. Medvetet en EGEN funktion,
 * separat från applyInvoiceDeliveryOutcome ovan — av två skäl:
 *
 * 1. Ingen av de fyra tar emot den supabase-klient som skickades in till
 *    sendInvoice; de har (oförändrat sedan innan Etapp Q) alltid använt sin
 *    egen `getServerSupabase()` internt. Håller dem separata gör den gränsen
 *    synlig i stället för dold inuti en funktion som ser ut att vara
 *    supabase-parametriserad rakt igenom.
 * 2. Det är HÄR (status/manifest/aktivitet i applyInvoiceDeliveryOutcome)
 *    som TD-86:s leverans-sanning sitter och facit-testas mot en fejkad
 *    databas — dessa fyra sidoeffekter är redan var för sig try/catchade
 *    (icke-blockerande, oförändrad logik) och skulle bara smyga med riktiga
 *    nätverksanrop mot produktions-Supabase in i den testsviten om de låg kvar.
 */
export async function triggerPostSendAutomations(params: PostSendAutomationsParams): Promise<void> {
  const { businessId, invoiceId, invoice } = params

  // Pipeline: move deal to invoiced
  try {
    const { findDealByInvoice, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
    const settings = await getAutomationSettings(businessId)
    if (settings?.auto_move_on_payment) {
      const deal = await findDealByInvoice(businessId, invoiceId)
      if (deal) {
        await moveDeal({
          dealId: deal.id,
          businessId,
          // V80: Ingen 'invoiced'-stage finns längre ('quote_accepted' är
          // borttaget, sql/v80_merge_accepted_into_won.sql) — flytta direkt
          // till 'won'. Betalstatus är fakturamodulens ansvar (invoice.status/
          // paid_at), inte pipeline-stegets — "Vunnen" betyder numera signerad/
          // vunnen affär, inte nödvändigtvis betald. De flesta dealsen är redan
          // i 'won' via Golden Path vid signering — moveDeal() no-opar då.
          toStageSlug: 'won',
          triggeredBy: 'system',
        })
      }
    }
  } catch (pipelineErr) {
    console.error('Pipeline trigger error (non-blocking):', pipelineErr)
  }

  // Project workflow stage: 'Faktura skickad' (non-blocking)
  try {
    const { advanceProjectStage, SYSTEM_STAGES, findProjectForEntity } = await import('@/lib/project-stages/automation-engine')
    const project = await findProjectForEntity({
      businessId,
      invoiceId,
    })
    if (project) {
      const flytt = await advanceProjectStage(project.project_id, SYSTEM_STAGES.INVOICE_SENT, businessId)
      if (!flytt.moved) console.error('[invoices/send] stegflytten misslyckades (non-blocking):', flytt.error, { projectId: project.project_id })
    }
  } catch (err) {
    console.error('[invoices/send] advanceProjectStage failed:', err)
  }

  // Smart communication: trigger invoice_sent event
  try {
    const { triggerEventCommunication } = await import('@/lib/smart-communication')
    await triggerEventCommunication({
      businessId,
      event: 'invoice_sent',
      customerId: invoice.customer_id,
      context: { invoiceId },
    })
  } catch (commErr) {
    console.error('Communication trigger error (non-blocking):', commErr)
  }

  // Portal-notifikation borttagen (2026-08-20): sendInvoice() skickar redan
  // ett komplett mejl (PDF-bilaga + länk "Visa i kundportalen") och/eller
  // SMS (samma portal-länk) högre upp i samma anrop. Ett separat,
  // ovillkorligt "Ny faktura — visa i din portal"-mejl härifrån ovanpå det
  // var alltid överflödigt — kunden fick två mejl om samma faktura inom
  // loppet av sekunder. Övriga portal-notis-event (invoice_paid,
  // invoice_overdue, project_update, ...) är oförändrade — bara denna
  // specifika ovillkorliga trigger vid utskick är borttagen.
}

// ── Faktura-mailmall (teal, matchar offertmall) ─────────────────────

function buildInvoiceEmailHtml(opts: {
  customerName: string
  businessName: string
  invoiceNumber: string
  dueDate: string
  subtotal: number
  vatRate: number
  vatAmount: number
  amountToPay: number
  rotRutType?: string | null
  rotRutDeduction?: number | null
  bankgiro?: string | null
  ocrNumber: string
  swishNumber?: string | null
  orgNumber?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  portalUrl: string
  pdfUrl: string
}): string {
  const firstName = opts.customerName.split(' ')[0] || 'Kund'

  const rotSection = opts.rotRutType ? `
    <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0 0 4px; font-weight: 600; color: #166534;">🏠 ${opts.rotRutType.toUpperCase()}-avdrag tillämpas</p>
      <p style="margin: 0; color: #374151; font-size: 14px;">
        Avdraget på <strong>${opts.rotRutDeduction?.toLocaleString('sv-SE')} kr</strong> dras automatiskt via Skatteverket.
      </p>
    </div>` : ''

  const rotRow = opts.rotRutType ? `
    <tr>
      <td style="padding: 12px 16px; color: #374151; font-size: 14px;">${opts.rotRutType.toUpperCase()}-avdrag</td>
      <td style="padding: 12px 16px; text-align: right; color: #059669; font-size: 14px; font-weight: 600;">-${opts.rotRutDeduction?.toLocaleString('sv-SE')} kr</td>
    </tr>` : ''

  const swishSection = opts.swishNumber ? (() => {
    const swishData = JSON.stringify({
      version: 1,
      payee: { value: (opts.swishNumber as string).replace(/\D/g, '') },
      amount: { value: Math.round(opts.amountToPay) },
      message: { value: opts.invoiceNumber },
    })
    const swishLink = 'swish://payment?data=' + encodeURIComponent(swishData)
    return `
    <div style="text-align: center; margin: 24px 0; padding: 20px; background: #F0FDFA; border: 1px solid #99F6E4; border-radius: 8px;">
      <p style="font-size: 13px; color: #6B7280; margin: 0 0 12px;">Betala enkelt med Swish</p>
      <a href="${swishLink}"
         style="display: inline-block; background: #0F766E; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
        Betala ${opts.amountToPay.toLocaleString('sv-SE')} kr med Swish
      </a>
      <p style="font-size: 13px; color: #374151; margin: 12px 0 0;">
        Swish-nummer: <strong>${opts.swishNumber}</strong>
      </p>
      <p style="font-size: 12px; color: #9CA3AF; margin: 4px 0 0;">
        Märk betalningen: <strong>${opts.invoiceNumber}</strong>
      </p>
    </div>`
  })() : ''

  const paymentInfo = [
    opts.bankgiro ? `Bankgiro: <strong>${opts.bankgiro}</strong>` : '',
    `OCR-nummer: <strong>${opts.ocrNumber}</strong>`,
  ].filter(Boolean).join('<br>')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8fafc; color: #1F2937;">
  <div style="max-width: 600px; margin: 0 auto;">

    <div style="background: #0F766E; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 700;">${opts.businessName}</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px;">Faktura ${opts.invoiceNumber}</p>
    </div>

    <div style="background: white; padding: 28px; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px;">

      <h2 style="color: #111827; font-size: 18px; margin: 0 0 8px;">Hej ${firstName}!</h2>
      <p style="color: #374151; line-height: 1.6; margin: 0 0 20px;">
        Här kommer din faktura. Nedan hittar du en sammanfattning — du kan se alla detaljer i din kundportal eller i bifogad PDF.
      </p>

      ${rotSection}

      <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
        <tr style="background: #F9FAFB;">
          <td style="padding: 12px 16px; color: #6B7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Beskrivning</td>
          <td style="padding: 12px 16px; text-align: right; color: #6B7280; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Belopp</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; color: #374151; font-size: 14px; border-top: 1px solid #E5E7EB;">Delsumma</td>
          <td style="padding: 12px 16px; text-align: right; color: #374151; font-size: 14px; border-top: 1px solid #E5E7EB;">${opts.subtotal?.toLocaleString('sv-SE')} kr</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; color: #374151; font-size: 14px; border-top: 1px solid #F3F4F6;">Moms (${opts.vatRate}%)</td>
          <td style="padding: 12px 16px; text-align: right; color: #374151; font-size: 14px; border-top: 1px solid #F3F4F6;">${opts.vatAmount?.toLocaleString('sv-SE')} kr</td>
        </tr>
        ${rotRow}
        <tr style="background: #F0FDFA;">
          <td style="padding: 14px 16px; color: #0F766E; font-size: 16px; font-weight: 700; border-top: 2px solid #0F766E;">Att betala</td>
          <td style="padding: 14px 16px; text-align: right; color: #0F766E; font-size: 16px; font-weight: 700; border-top: 2px solid #0F766E;">${opts.amountToPay.toLocaleString('sv-SE')} kr</td>
        </tr>
      </table>

      <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0 0 4px; font-weight: 600; color: #111827; font-size: 14px;">Betalningsinformation</p>
        <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.6;">${paymentInfo}</p>
        <p style="margin: 8px 0 0; color: #6B7280; font-size: 13px;">Förfallodatum: <strong>${new Date(opts.dueDate).toLocaleDateString('sv-SE')}</strong></p>
      </div>

      ${swishSection}

      <div style="text-align: center; margin: 24px 0 8px;">
        <a href="${opts.portalUrl}" style="display: inline-block; background: #0F766E; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Visa i kundportalen
        </a>
        <p style="margin: 12px 0 0; font-size: 13px;">
          <a href="${opts.pdfUrl}" style="color: #0F766E; text-decoration: underline;">Ladda ner som PDF</a>
        </p>
      </div>

      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />

      <p style="color: #6B7280; font-size: 13px; text-align: center; margin: 0; line-height: 1.5;">
        ${opts.businessName}${opts.orgNumber ? ` · Org.nr: ${opts.orgNumber}` : ''}<br>
        ${[opts.contactEmail, opts.contactPhone].filter(Boolean).join(' · ')}
      </p>
    </div>
  </div>
</body>
</html>`
}
