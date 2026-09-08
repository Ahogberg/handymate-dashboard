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
import { buildAttribution } from '@/lib/branding/attribution'
import { loadPdfLogo } from '@/lib/branding/pdf'
import { brandingFromConfig, type Branding } from '@/lib/branding/get-branding'
import { halsning } from '@/lib/customers/namn'
import {
  emailLayout, emailParagraph, emailSection, amountBlock, paymentBlock, summaryTable, rotRutNotice,
  secondaryButton, secondaryLink, linkBlock, escapeEmailText, formatKr, formatDag, type SummaryRow,
} from '@/lib/email-templates'

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
  /** true om fakturan gick som e-faktura via Fortnox istället (2026-08-21). */
  einvoice?: boolean
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
        business_id,
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
  if (invoice.business_id !== businessId || (invoice.customer_id && invoice.customer?.business_id !== businessId)) {
    return { found: true, errors: ['Fakturan eller kunden kunde inte verifieras i företaget. Ingen leverans eller Fortnox-synk gjordes.'] }
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

  // Nummer-unifiering (2026-08-20): `invoice` hämtades OVAN, innan
  // Fortnox-synken kördes — om synken precis skrev över invoice_number/
  // ocr_number i DB (fortnoxResult.newInvoiceNumber satt), är denna
  // in-memory-kopia stale. Patcha den INNAN PDF/mejl/SMS byggs nedan, så
  // kunden ser Fortnox nummer redan i sitt första möte med fakturan —
  // aldrig Handymates interna utkastnummer.
  if (fortnoxResult.newInvoiceNumber) {
    invoice.invoice_number = fortnoxResult.newInvoiceNumber
    invoice.ocr_number = fortnoxResult.newOcrNumber
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

  const results: { sms?: boolean; email?: boolean; einvoice?: boolean; errors: string[] } = { errors: [] }

  // E-faktura (2026-08-21): Fortnox skickade redan fakturan direkt till
  // kundens bokföringsprogram (kunden har ett gln_number). Handymates egen
  // PDF/email/SMS-leverans hoppas då över helt — annars får en företagskund
  // som specifikt bett om e-faktura ändå ett dubblettmejl med PDF-bilaga,
  // precis det de ville slippa. Om e-fakturaförsöket misslyckades
  // (eInvoiceSent falsy) fortsätter email/SMS nedan som vanligt.
  if (fortnoxResult.eInvoiceSent) {
    results.einvoice = true
  }

  // Säkerställ kundportal aktiverad
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  let portalUrl = ''
  if (invoice.customer_id && !results.einvoice) {
    const { data: cust, error: customerError } = await supabase
      .from('customer')
      .select('portal_token, portal_enabled')
      .eq('customer_id', invoice.customer_id)
      .eq('business_id', businessId)
      .single()
    const syncReceipt = fortnoxResult.skipped ? 'Ingen Fortnox-synk gjordes.' : 'Fortnox-synken är klar.'
    if (customerError || !cust) return { found: true, errors: [`${syncReceipt} Kundportalen kunde inte verifieras. Inget mejl eller SMS skickades.`] }

    if (cust?.portal_token && cust?.portal_enabled) {
      portalUrl = `${APP_URL}/portal/${cust.portal_token}?tab=invoices`
    } else {
      // Auto-skapa kundportal
      const newToken = randomUUID()
      let portalUpdate = supabase
        .from('customer')
        .update({
          portal_token: newToken,
          portal_token_created_at: new Date().toISOString(),
          portal_enabled: true,
        })
        .eq('customer_id', invoice.customer_id)
        .eq('business_id', businessId)
      portalUpdate = cust.portal_token == null ? portalUpdate.is('portal_token', null) : portalUpdate.eq('portal_token', cust.portal_token)
      const { data: portalRows, error: portalError } = await portalUpdate.select('customer_id')
      if (portalError || !portalRows?.length) return { found: true, errors: [`${syncReceipt} Portallänken kunde inte sparas. Inget mejl eller SMS skickades.`] }
      portalUrl = `${APP_URL}/portal/${newToken}?tab=invoices`
    }
  }

  // Skicka email
  if (send_email && invoice.customer?.email && !results.einvoice) {
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
        const [swishQR, logo] = await Promise.all([
          generateSwishQR(
            businessConfig?.swish_number,
            amountToPay || invoice.total,
            invoice.invoice_number,
          ),
          // Firmans logga + accent även i fallbacken (yta 2, 2026-09-07).
          loadPdfLogo(businessConfig?.logo_url, 'invoices/send'),
        ])
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
            contact_phone: businessConfig?.public_phone || businessConfig?.phone_number,
            address: businessConfig?.address,
            bankgiro: businessConfig?.bankgiro,
            plusgiro: businessConfig?.plusgiro,
            swish_number: businessConfig?.swish_number,
            swish_qr: swishQR || undefined,
            f_skatt_registered: businessConfig?.f_skatt_registered,
            accent_color: businessConfig?.accent_color || undefined,
            logo_base64: logo?.data,
            logo_format: logo?.format,
          },
          // businessConfig är hela raden (select('*')) — stämpeln byggs direkt.
          { attribution: buildAttribution(businessConfig) },
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
          // businessConfig är hela raden (select('*')) → varumärke + stämpel
          // utan extra query (lib/branding/get-branding.ts).
          branding: brandingFromConfig(businessConfig),
          invoiceNumber: invoice.invoice_number,
          // description = fakturans rubrik (data-builder.ts: "Utfört arbete" som fallback)
          title: invoice.description,
          dueDate: invoice.due_date,
          subtotal: invoice.subtotal,
          vatRate: invoice.vat_rate,
          vatAmount: invoice.vat_amount,
          total: invoice.total || 0,
          amountToPay: amountToPay || 0,
          rotRutType: invoice.rot_rut_type,
          rotRutDeduction: invoice.rot_rut_deduction,
          ocrNumber: invoice.ocr_number || generateOCR(invoice.invoice_number || ''),
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
      } else if (!emailRes.data?.id) {
        results.errors.push('Email: sändtjänsten gav ingen leveransreferens. Kontrollera leveransen före nytt försök.')
      } else {
        results.email = true
      }
    } catch (emailError: any) {
      console.error('Email send error:', emailError)
      results.errors.push(`Email: ${emailError.message}`)
    }
  }

  // Skicka SMS
  if (send_sms && invoice.customer?.phone_number && !results.einvoice) {
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

  return { found: true, email: results.email, sms: results.sms, einvoice: results.einvoice, errors: results.errors }
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
  results: { email?: boolean; sms?: boolean; einvoice?: boolean; errors: string[] }
  /** Attributionsregeln — se SendInvoiceParams.source. Default 'user'. */
  source?: 'user' | 'automation'
}

export interface InvoiceDeliveryOutcomeResult {
  /** true om email||sms||einvoice lyckades — samma villkor som svarets success-fält. */
  delivered: boolean
  sentMethod: 'email' | 'sms' | 'both' | 'einvoice' | null
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
  if (invoice.business_id !== businessId) throw new Error('Fakturan tillhör inte det aktuella företaget. Ingen kvittens skrevs.')

  if (results.email || results.sms || results.einvoice) {
    // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): sent_at/
    // sent_method sattes ALDRIG här — InvoiceStatusTimeline.tsx läser
    // BÅDA (rad 48-52) för att visa "Skickad via {metod}"-steget som
    // klart; utan sent_at visas steget som "upcoming" trots att fakturan
    // faktiskt är skickad. Samma buggklass som project.status-fyndet
    // tidigare i samma körning — en statusflip utan sina stödjande fält.
    // einvoice är alltid ensam (send-invoice.ts hoppar över email/sms-
    // blocken när den är satt) — behöver inget eget both-läge.
    const sentMethod = results.einvoice ? 'einvoice' : results.email && results.sms ? 'both' : results.email ? 'email' : 'sms'
    const { data: statusRows, error: statusErr } = await supabase
      .from('invoice')
      .update({ status: 'sent', sent_at: new Date().toISOString(), sent_method: sentMethod, delivery_status: 'delivered' })
      .eq('invoice_id', invoiceId)
      .eq('business_id', businessId)
      .select('invoice_id')

    if (statusErr || !statusRows?.length) {
      console.error('[invoices/send] Status update failed after send:', statusErr)
      const statusMessage = statusErr?.message || 'Ingen fakturarad uppdaterades efter utskicket. Skicka inte igen.'
      results.errors.push(`Status: ${statusMessage}`)
      // Etapp P-härdning: felet svaldes tidigare (bara loggat till
      // console) trots att kunden FAKTISKT redan fått fakturan (email/sms
      // gick iväg innan detta steget). Gör det högt utan att ändra
      // svarssemantiken ovan — driftlarmet (automation_activity) fångar
      // det nu istället för att det försvinner i Vercel-loggarna.
      await rapporteraTystFel(
        supabase,
        businessId,
        'invoice-manifest:status-write-failed-after-delivery',
        statusMessage,
        { invoiceId },
      )
    }

    // Manifestet markeras levererat OAVSETT om statusskrivningen ovan
    // lyckades — leveransen (email/sms) skedde, och det är den sanningen
    // manifestet fryser. Best-effort, blockerar aldrig svaret.
    const manifest = await markInvoiceDelivered(supabase, {
      businessId,
      invoiceId,
      method: sentMethod,
    })
    if (!manifest.ok) results.errors.push(`Leveransunderlag: ${manifest.message}`)
    else if (manifest.row.status === 'incomplete') results.errors.push('Utskicket är gjort men leveransunderlaget är ofullständigt.')

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
        business_id: businessId,
        customer_id: invoice.customer_id,
        activity_type: 'invoice_sent',
        title: `Faktura ${invoice.invoice_number} skickad`,
        description: `Faktura ${invoice.invoice_number} skickad${results.einvoice ? ' via e-faktura (Fortnox)' : ''}${results.email ? ' via email' : ''}${results.sms ? ' via SMS' : ''}`,
        metadata: { invoice_id: invoiceId, ...results },
        // Attributionsregeln: automationens utskick får aldrig se ut som en
        // människas klick — 'automation' när auto-invoice-on-complete skickade.
        created_by: source,
      })
    if (activityErr) {
      console.error('[invoices/send] customer_activity insert failed:', activityErr)
      results.errors.push('Fakturan skickades men kundhistoriken kunde inte sparas.')
    }

    return { delivered: true, sentMethod }
  }

  // Enat fakturautskick (2026-08-20): Fortnox-steget (om aktuellt) körs
  // nu FÖRE detta, i sendInvoice(). Om vi hamnar här har bokföringen
  // alltså redan lyckats — det som misslyckades är bara kundleveransen.
  // delivery_status='delivery_failed' fångar exakt det tillståndet
  // (sql/v163) så en retry vet att bara göra om leveransen, aldrig
  // Fortnox-anropet.
  const { data: deliveryRows, error: deliveryStatusErr } = await supabase
    .from('invoice')
    .update({ delivery_status: 'delivery_failed' })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .select('invoice_id')
  if (deliveryStatusErr || !deliveryRows?.length) {
    console.error('[invoices/send] delivery_status write failed:', deliveryStatusErr)
    results.errors.push('Utskicksförsökets status kunde inte sparas.')
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

  // Project workflow stage: 'Faktura skickad' (non-blocking) — genom
  // händelsebryggan (Del B, 2026-08-26): forward-only, hittar projektet via
  // invoice.project_id, läser .moved och loggar ärligt.
  try {
    const { bumpProjectStage } = await import('@/lib/project-stages/event-bridge')
    const flytt = await bumpProjectStage(businessId, { invoiceId }, 'invoice_sent')
    if (!flytt.moved && !flytt.skipped) console.error('[invoices/send] stegflytten misslyckades (non-blocking):', flytt.error, { projectId: flytt.projectId })
  } catch (err) {
    console.error('[invoices/send] bumpProjectStage invoice_sent failed:', err)
  }

  // Smart Communication-triggern för invoice_sent är BORTTAGEN (Etapp 0,
  // 2026-08-27, Andreas-beslut): fakturan är redan levererad ovan; den
  // globala communication_rule kunde skicka ett extra faktura-SMS via
  // setTimeout i en serverless-request (dubblett, och reglaget hette
  // dessutom sms_invoice_reminder). Kanoniska påminnelser bor i
  // lib/invoice-reminder-send.ts.

  // Portal-notifikation borttagen (2026-08-20): sendInvoice() skickar redan
  // ett komplett mejl (PDF-bilaga + länk "Visa i kundportalen") och/eller
  // SMS (samma portal-länk) högre upp i samma anrop. Ett separat,
  // ovillkorligt "Ny faktura — visa i din portal"-mejl härifrån ovanpå det
  // var alltid överflödigt — kunden fick två mejl om samma faktura inom
  // loppet av sekunder. Övriga portal-notis-event (invoice_paid,
  // invoice_overdue, project_update, ...) är oförändrade — bara denna
  // specifika ovillkorliga trigger vid utskick är borttagen.
}

// ── Faktura-mailet — företagets varumärke via masterlayouten ─────────
//
// Varumärkeslagret 2026-09-07: tidigare hårdkodad teal utan logotyp, medan
// offertmailet bar företagets logga och accent — samma kund fick två
// identiteter i samma affär. Nu emailLayout() + byggblocken; stämpeln
// kommer med varumärket (brandingFromConfig → buildAttribution).

/**
 * Designens fakturamail: "Att betala" som stor siffra med förfallodatum,
 * totalsumma och preliminärt ROT/RUT bredvid; Swish som primärknapp med
 * bankgiro/OCR under; sedan brödtext, summering, ROT-blocket och portalen.
 */
export function buildInvoiceEmailHtml(opts: {
  customerName: string
  branding: Branding
  invoiceNumber: string
  title?: string | null
  dueDate: string
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  amountToPay: number
  rotRutType?: string | null
  rotRutDeduction?: number | null
  ocrNumber: string
  portalUrl: string
  pdfUrl: string
}): string {
  const b = opts.branding
  const rot = opts.rotRutType && opts.rotRutDeduction ? { type: opts.rotRutType, amount: opts.rotRutDeduction } : null
  const forfaller = formatDag(opts.dueDate)
  const nr = escapeEmailText(opts.invoiceNumber)
  const titel = escapeEmailText(opts.title)

  const rows: SummaryRow[] = [
    { label: 'Delsumma exkl. moms', value: formatKr(opts.subtotal) },
    { label: `Moms ${opts.vatRate} %`, value: formatKr(opts.vatAmount) },
  ]
  if (rot) {
    rows.push({ label: 'Totalt inkl. moms', value: formatKr(opts.total), total: true })
    rows.push({ label: `Preliminärt ${rot.type.toUpperCase()}-avdrag`, value: `−${formatKr(rot.amount)}`, deduction: true })
  }
  rows.push({ label: 'Att betala', value: formatKr(opts.amountToPay), emphasis: true })

  const content = `
    ${amountBlock({
      label: 'Att betala',
      amount: opts.amountToPay,
      due: forfaller,
      total: rot ? opts.total : undefined,
      rot: rot ? { type: rot.type, deduction: rot.amount } : null,
    })}
    ${paymentBlock({
      swishNumber: b.swishNumber,
      amount: opts.amountToPay,
      message: opts.invoiceNumber,
      bankgiro: b.bankgiro,
      ocr: opts.ocrNumber,
      due: forfaller,
      accent: b.accentColor,
    })}
    ${emailParagraph(`${escapeEmailText(halsning(opts.customerName))} Här kommer fakturan${titel ? ` för <strong style="color:#0f172a;">${titel}</strong>` : ` <strong style="color:#0f172a;">${nr}</strong>`}. Alla detaljer finns i bifogad PDF${opts.portalUrl ? ' och i kundportalen' : ''}.`)}
    ${summaryTable(rows)}
    ${rot ? rotRutNotice(rot.type, rot.amount, 'Blir avdraget lägre fakturerar vi skillnaden.') : ''}
    ${opts.portalUrl
      ? emailSection(secondaryButton('Visa i kundportalen', opts.portalUrl) + secondaryLink('Ladda ner fakturan (PDF)', opts.pdfUrl, b.accentColor))
      : linkBlock('Ladda ner fakturan (PDF)', opts.pdfUrl, b.accentColor)}
  `
  return emailLayout(b, content, { meta: `Faktura ${nr}`, preheader: `Att betala ${formatKr(opts.amountToPay)} · förfaller ${forfaller}` })
}
