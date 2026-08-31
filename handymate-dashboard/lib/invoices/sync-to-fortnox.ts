import type { SupabaseClient } from '@supabase/supabase-js'
import { fortnoxRequest, isFortnoxConnected, syncCustomerToFortnox, updateFortnoxCustomer } from '@/lib/fortnox'
import { prepareInvoiceManifest, markInvoiceDelivered } from '@/lib/invoices/evidence-manifest'
import { generateOCR } from '@/lib/ocr'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import { buildTaxReductionPayload, fortnoxHouseWorkType, fortnoxTaxReductionType } from '@/lib/fortnox/housework'
import { defaultCategoryForIndustry, type RotRutType } from '@/lib/skv/categories'
import { buildFortnoxInvoiceRows, type FortnoxInvoiceRow, type FortnoxRowSourceItem } from '@/lib/invoices/fortnox-rows'

/**
 * Fortnox-bokföringssteget för en kundfaktura. Bruten ut ur
 * app/api/invoices/[id]/send-via-fortnox/route.ts (2026-08-20, enat
 * fakturautskick) så samma logik kan köras från BÅDE den fristående
 * "Bokför i Fortnox"-rutten och sendInvoice() (som körs för både
 * manuellt utskick och autoInvoiceOnComplete).
 *
 * Rör ALDRIG kundleverans (email/SMS) — det är sendInvoice()s ansvar,
 * som anropar denna funktion FÖRE leveransförsöket.
 */

const FORTNOX_PENDING_TIMEOUT_MS = 5 * 60 * 1000

export interface SyncToFortnoxResult {
  success: boolean
  /** true = Fortnox var inte kopplat, inget gjordes. Inte ett fel. */
  skipped?: boolean
  /** true = fakturan var redan synkad, denna körning gjorde inget nytt Fortnox-anrop. */
  idempotent?: boolean
  fortnoxInvoiceNumber?: string
  fortnoxDocumentNumber?: string
  /**
   * Satt bara vid en FÄRSK lyckad synk (inte på idempotent-vägen) —
   * det nya invoice_number/ocr_number som just skrevs till DB. Anroparen
   * (sendInvoice) har redan hämtat fakturan INNAN detta anrop gjordes,
   * så dess in-memory-kopia är annars stale efter denna uppdatering.
   */
  newInvoiceNumber?: string
  newOcrNumber?: string
  /**
   * true = fakturan skickades som e-faktura via Fortnox (kunden har ett
   * org_number — företag/BRF) istället för Handymates egen PDF/email/SMS.
   * sendInvoice() hoppar då över sin egen kundleverans helt. false/
   * undefined = ingen org_number, eller e-fakturaförsöket misslyckades
   * (t.ex. ingen aktiv e-fakturaanslutning hos mottagaren) — sendInvoice()
   * faller tillbaka till PDF/email/SMS som vanligt (2026-08-21).
   */
  eInvoiceSent?: boolean
  error?: string
}

export async function syncInvoiceToFortnox(
  supabase: SupabaseClient,
  params: { businessId: string; invoiceId: string },
): Promise<SyncToFortnoxResult> {
  const { businessId, invoiceId } = params

  const connected = await isFortnoxConnected(businessId)
  if (!connected) {
    return { success: true, skipped: true }
  }

  const { data: invoice, error: fetchErr } = await supabase
    .from('invoice')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .single()

  if (fetchErr || !invoice) {
    return { success: false, error: 'Faktura hittades inte' }
  }

  if (invoice.customer_id) {
    const { data: customerData, error: customerErr } = await supabase
      .from('customer')
      .select('*')
      .eq('customer_id', invoice.customer_id)
      .maybeSingle()
    if (customerErr) {
      console.error('[sync-to-fortnox] customer fetch error:', customerErr)
      return { success: false, error: 'Kunde inte hämta kunduppgifter för fakturan. Försök igen.' }
    }
    invoice.customer = customerData
  } else {
    invoice.customer = null
  }

  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return { success: false, error: `Fakturan är redan ${invoice.status === 'paid' ? 'betald' : 'avbruten'}` }
  }

  const syncStatus = invoice.fortnox_sync_status as string | null
  const lastAttempt = invoice.fortnox_sync_attempted_at as string | null
  if (syncStatus === 'synced' && invoice.fortnox_invoice_number) {
    return {
      success: true,
      idempotent: true,
      fortnoxInvoiceNumber: invoice.fortnox_invoice_number,
      fortnoxDocumentNumber: invoice.fortnox_document_number,
      eInvoiceSent: !!invoice.fortnox_einvoice_sent_at,
    }
  }
  if (syncStatus === 'pending' && lastAttempt) {
    const ageMs = Date.now() - new Date(lastAttempt).getTime()
    if (ageMs < FORTNOX_PENDING_TIMEOUT_MS) {
      return { success: false, error: 'Sync pågår redan. Vänta ett par minuter innan du försöker igen.' }
    }
    console.warn(
      `[sync-to-fortnox] invoice ${invoiceId} pending för ${Math.round(ageMs / 1000)}s — antar in-flight-dödad, tillåter retry`,
    )
  }

  let customerNumber = invoice.customer?.fortnox_customer_number as string | null
  if (!customerNumber && invoice.customer_id) {
    const sync = await syncCustomerToFortnox(businessId, invoice.customer_id)
    if (!sync.success || !sync.customerNumber) {
      return { success: false, error: `Kunde inte synka kund till Fortnox: ${sync.error || 'okänt fel'}` }
    }
    customerNumber = sync.customerNumber
  }

  if (!customerNumber) {
    return { success: false, error: 'Ingen kund kopplad till fakturan' }
  }

  // E-faktura (2026-08-21, korrigerad 2026-08-21): Fortnox e-fakturaadress
  // ÄR organisationsnumret — GLN krävs INTE i Sverige (verifierat mot
  // Fortnox egen support: "Your e-invoice address in Fortnox is your
  // organisation number. GLN-numbers are not a requirement within
  // Sweden"). Så triggern är org_number (redan ett fält varje företags-/
  // BRF-kund har), inte ett separat GLN-fält ingen kund i praktiken har.
  // GLN skickas med som ett VALFRITT override om det ändå är ifyllt.
  // Håller Fortnox-kundens Type/OrganisationNumber/GLN uppdaterade INNAN
  // fakturan bokförs — annars vet inte /einvoice-anropet nedan vart den
  // ska routas. Körs på varje synk (inte bara vid kundens FÖRSTA Fortnox-
  // synk högre upp), så ett org-nummer som läggs till i efterhand på en
  // redan synkad kund ändå når fram. Best-effort: misslyckas den, faller
  // e-fakturaförsöket nedan tillbaka till Handymates egen PDF/email/SMS-
  // leverans ändå.
  if (invoice.customer?.org_number) {
    try {
      await updateFortnoxCustomer(businessId, customerNumber, {
        Type: 'COMPANY',
        OrganisationNumber: invoice.customer.org_number,
        GLN: invoice.customer.gln_number || undefined,
        GLNDelivery: invoice.customer.gln_number || undefined,
      })
    } catch (glnErr: any) {
      console.error('[sync-to-fortnox] Kunde inte uppdatera Fortnox-kundens e-fakturaadress:', glnErr?.message || glnErr)
    }
  }

  const items: FortnoxRowSourceItem[] = Array.isArray(invoice.items) ? invoice.items : []
  if (items.length === 0) {
    return { success: false, error: 'Fakturan saknar rader' }
  }

  const { data: bizConfig } = await supabase
    .from('business_config')
    .select('business_name, contact_name, industry, default_rot_work_category')
    .eq('business_id', businessId)
    .single()

  // ROT/RUT i Fortnox-fakturan (2026-08-26, se lib/fortnox/housework.ts):
  // TaxReductionType på fakturan + HouseWork/HouseWorkType/HouseWorkHours-
  // ToReport på VARJE rad. Kategorin (vad arbetet är) är Skatteverkets kod
  // på fakturan, annars företagets default — aldrig gissad: saknas den
  // bokförs fakturan UTAN husarbete och driftlarmet får veta.
  const taxReductionType = fortnoxTaxReductionType(invoice.rot_rut_type)
  const skvCategory: string | null = taxReductionType
    ? (invoice.rot_work_category || bizConfig?.default_rot_work_category || defaultCategoryForIndustry(bizConfig?.industry) || null)
    : null
  const houseWorkType = fortnoxHouseWorkType(skvCategory)
  const rotType: RotRutType | null = taxReductionType === 'ROT' ? 'rot' : taxReductionType === 'RUT' ? 'rut' : null
  if (taxReductionType && !houseWorkType) {
    await rapporteraTystFel(supabase, businessId, 'fortnox:housework-category-missing',
      `ROT/RUT-fakturan saknar arbetskategori (rot_work_category) — bokförs i Fortnox utan husarbete.`,
      { invoiceId, rot_rut_type: invoice.rot_rut_type, skvCategory })
  }
  const withHouseWork = !!(taxReductionType && houseWorkType && rotType)

  // A3 (Prisslingan V2): radbyggaren är utbruten och facit-låst —
  // se lib/invoices/fortnox-rows.ts (VAT-arv per rad, negativa rabattrader,
  // delsummor bort, rubrik/text som textrader, ArticleNumber fasad).
  const invoiceRows: FortnoxInvoiceRow[] = buildFortnoxInvoiceRows(items, {
    invoiceVatRate: invoice.vat_rate != null ? Number(invoice.vat_rate) : null,
    houseWork: withHouseWork
      ? { rotType: rotType as RotRutType, houseWorkType: houseWorkType as string }
      : null,
  })

  const today = new Date().toISOString().split('T')[0]
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toISOString().split('T')[0]
    : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  // Projektet i Fortnox (steg 3, 2026-08-26): kundfakturan konteras på samma
  // Fortnox-projekt som leverantörsfakturorna → projektresultat i Fortnox.
  // Bara när projektet redan har ett Fortnox-nummer; aldrig gissat.
  let fortnoxProjectNumber: string | null = null
  if (invoice.project_id) {
    const { data: proj } = await supabase
      .from('project')
      .select('fortnox_project_number')
      .eq('project_id', invoice.project_id)
      .eq('business_id', businessId)
      .maybeSingle()
    fortnoxProjectNumber = proj?.fortnox_project_number || null
  }

  const invoicePayload: Record<string, unknown> = {
    CustomerNumber: customerNumber,
    Project: fortnoxProjectNumber || undefined,
    InvoiceDate: today,
    DueDate: dueDate,
    Currency: 'SEK',
    Language: 'SV',
    OurReference: bizConfig?.contact_name || bizConfig?.business_name || undefined,
    YourReference: invoice.customer?.name || undefined,
    InvoiceRows: invoiceRows,
    Remarks: invoice.internal_notes || undefined,
    ExternalInvoiceReference1: invoiceId,
  }

  // Invoice.TaxReduction är READ-ONLY i Fortnox (ett heltal Fortnox räknar
  // fram) — det gamla påhittade objektet med belopp och personnummer på
  // fakturan skickas inte längre. Köparens uppgifter går via
  // POST /taxreductions efter bokföringen (nedan).
  if (withHouseWork) {
    invoicePayload.TaxReductionType = taxReductionType
  }
  const reductionAmount = Number(invoice.rot_deduction || invoice.rot_rut_deduction || 0)
  const personalNumber: string | null = invoice.rot_personal_number || invoice.customer?.personal_number || null
  const propertyDesignation: string | null = invoice.rot_property_designation || invoice.customer?.property_designation || null

  await prepareInvoiceManifest(supabase, {
    businessId,
    invoiceId,
    projectId: invoice.project_id || null,
  })

  const startedAt = new Date().toISOString()
  await supabase
    .from('invoice')
    .update({ fortnox_sync_status: 'pending', fortnox_sync_attempted_at: startedAt })
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  let fortnoxInvoiceNumber: string | null = null
  let fortnoxDocumentNumber: string | null = null
  let fortnoxError: string | null = null

  try {
    // Fortnox Invoice-resursen (kundfaktura) har INGET InvoiceNumber-fält —
    // bekräftat 2026-08-20 mot Fortnox riktiga OpenAPI-spec
    // (fortnox_Kf_InvoiceSingleItem). Det enda identifierande numret är
    // DocumentNumber. InvoiceNumber finns bara på andra resurser
    // (betalningsuppföljning, SupplierInvoice — dit det hörde i den
    // ursprungliga koden, förväxlat med kundfaktura-resursen). Att läsa
    // InvoiceNumber här gav alltid undefined, vilket fick varje lyckad
    // bokning att tolkas som ett misslyckande.
    const response = await fortnoxRequest<{ Invoice: { DocumentNumber: string } }>(
      businessId,
      'POST',
      '/invoices',
      { Invoice: invoicePayload },
    )
    fortnoxInvoiceNumber = response?.Invoice?.DocumentNumber ?? null
    fortnoxDocumentNumber = response?.Invoice?.DocumentNumber ?? null
  } catch (err: any) {
    fortnoxError = err?.message || 'Fortnox-fel'
    console.error('[sync-to-fortnox] Fortnox API failed:', fortnoxError)
  }

  // Dubbelskydd (2026-08-20, verifierat mot Fortnox egen OpenAPI-spec —
  // se lib/invoices/sync-to-fortnox.ts's grannefil-historik för research):
  // PUT /invoices/{DocumentNumber}/externalprint markerar fakturan som
  // Sent=true i Fortnox UTAN att generera/skicka något själv ("Use this
  // endpoint to set invoice as sent, without generating an invoice").
  // Gör att Fortnox egen "Skicka"-knapp/e-postutskick i deras gränssnitt
  // visar fakturan som redan skickad, så en människa där inte råkar
  // dubbelmejla kunden. Best-effort — bokföringen (huvudsyftet) är redan
  // klar vid det här laget oavsett vad detta anrop gör.
  if (fortnoxDocumentNumber) {
    try {
      await fortnoxRequest(
        businessId,
        'PUT',
        `/invoices/${fortnoxDocumentNumber}/externalprint`,
        { Invoice: { CustomerNumber: customerNumber } },
      )
    } catch (markSentErr: any) {
      console.error('[sync-to-fortnox] externalprint (markera som skickad) misslyckades — bokföringen kvarstår korrekt:', markSentErr?.message || markSentErr)
    }
  }

  // E-faktura (2026-08-21, korrigerad 2026-08-21): kunden har ett
  // org_number (företag/BRF) → försök skicka som e-faktura via Fortnox
  // e-fakturaoperatör istället för Handymates egen PDF/email/SMS. Fortnox
  // routar via organisationsnumret (GLN krävs inte i Sverige) och avgör
  // själv om mottagaren faktiskt har en aktiv e-fakturaanslutning — best-
  // effort: misslyckas anropet (ingen sådan anslutning) faller
  // sendInvoice() tillbaka till sin egen leverans — se eInvoiceSent i
  // returvärdet. Bokföringen ovan är redan klar oavsett utfall här.
  let eInvoiceSent = false
  if (fortnoxDocumentNumber && invoice.customer?.org_number) {
    try {
      await fortnoxRequest(businessId, 'GET', `/invoices/${fortnoxDocumentNumber}/einvoice`)
      eInvoiceSent = true
    } catch (eInvoiceErr: any) {
      console.error('[sync-to-fortnox] E-fakturaförsök misslyckades, faller tillbaka till egen leverans:', eInvoiceErr?.message || eInvoiceErr)
    }
  }

  if (fortnoxError || !fortnoxInvoiceNumber) {
    await supabase
      .from('invoice')
      .update({ fortnox_sync_status: 'failed', fortnox_sync_error: fortnoxError || 'No invoice number returned' })
      .eq('invoice_id', invoiceId)
      .eq('business_id', businessId)

    return { success: false, error: fortnoxError || 'No invoice number returned' }
  }

  // fortnoxDocumentNumber sätts alltid tillsammans med fortnoxInvoiceNumber
  // från samma Fortnox-svar (rad ~206-207) — kan i praktiken inte vara null
  // här, men TS narrowar inte det via kollen ovan (skild variabel). Egen
  // koll för typsäkerheten.
  if (!fortnoxDocumentNumber) {
    return { success: false, error: 'No document number returned' }
  }

  // Skattereduktionsbegäran i Fortnox (2026-08-26): POST /taxreductions —
  // posten som Fortnox skickar till Skatteverket när kundens betalning är
  // registrerad. Best-effort: bokföringen ovan är redan klar; misslyckas
  // detta står fakturan kvar i Fortnox utan begäran, rot_application_status
  // förblir null (INTE 'submitted' — det ordet ska betyda att Fortnox har
  // en begäran), och driftlarmet får veta. Andreas kan då skicka via vår
  // egen XML (/dashboard/invoices/rot-payment) eller registrera i Fortnox.
  let taxReductionCreated = false
  if (withHouseWork) {
    if (reductionAmount > 0 && personalNumber) {
      try {
        await fortnoxRequest(businessId, 'POST', '/taxreductions', {
          TaxReduction: buildTaxReductionPayload({
            documentNumber: fortnoxDocumentNumber,
            askedAmountKr: reductionAmount,
            customerName: invoice.customer?.name,
            personalNumber,
            propertyDesignation,
            brfOrgNumber: invoice.rot_brf_org_number || null,
            apartmentNumber: invoice.rot_apartment_number || null,
          }),
        })
        taxReductionCreated = true
      } catch (trErr: any) {
        const message = trErr?.message || 'taxreductions failed'
        console.error('[sync-to-fortnox] POST /taxreductions misslyckades (bokföringen kvarstår):', message)
        await rapporteraTystFel(supabase, businessId, 'fortnox:taxreduction-failed', message, {
          invoiceId, fortnoxDocumentNumber, askedAmountKr: reductionAmount,
        })
      }
    } else {
      await rapporteraTystFel(supabase, businessId, 'fortnox:taxreduction-skipped',
        'ROT/RUT-fakturan bokfördes i Fortnox men ingen begäran skapades — personnummer eller avdragsbelopp saknas.',
        { invoiceId, fortnoxDocumentNumber, hasPersonalNumber: !!personalNumber, askedAmountKr: reductionAmount })
    }
  }

  const now = new Date().toISOString()
  // Nummer-unifiering (2026-08-20): skriv över Handymates eget
  // invoice_number/ocr_number med Fortnox-härledda värden, så kunden
  // ALDRIG kan se två olika nummer för samma faktura (t.ex. om Fortnox
  // någon gång kontaktar kunden direkt, som en egen betalningspåminnelse).
  // Säkert utrett innan bygget: ingen annan kod tolkar invoice_number-
  // formatet, ingen intern betalningsavstämning slår upp fakturor via
  // ocr_number, och kreditfakturor kopplas via ett stabilt ID
  // (original_invoice_id) — inte via nummersträngen. Sker INNAN kunden
  // någonsin ser fakturan (Fortnox-först-ordningen garanterar det), så
  // det är aldrig ett nummer kunden hunnit se bytas ut.
  const newOcrNumber = generateOCR(fortnoxDocumentNumber)
  const updateData: Record<string, unknown> = {
    fortnox_invoice_number: fortnoxInvoiceNumber,
    fortnox_document_number: fortnoxDocumentNumber,
    fortnox_synced_at: now,
    fortnox_sync_status: 'synced',
    fortnox_sync_error: null,
    invoice_number: fortnoxDocumentNumber,
    ocr_number: newOcrNumber,
  }
  // 'submitted' = Fortnox HAR en begäran (ROT och RUT), annars null.
  if (taxReductionCreated) {
    updateData.rot_application_status = 'submitted'
  }
  if (eInvoiceSent) {
    updateData.fortnox_einvoice_sent_at = now
  }

  const { error: finalUpdateError } = await supabase
    .from('invoice')
    .update(updateData)
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)

  if (finalUpdateError) {
    // Fortnox HAR redan bokfört fakturan korrekt vid det här laget — det
    // som misslyckades är bara vår egen lokala bokföring av att det
    // lyckades. Kritiskt att larma synligt: utan detta blir raden kvar på
    // fortnox_sync_status='pending', och ett omförsök efter timeouten
    // (FORTNOX_PENDING_TIMEOUT_MS) skulle då POSTa ÄNNU en gång och skapa
    // en riktig dubblett i Fortnox — trots att den första bokföringen
    // redan var korrekt. console.error försvinner i Vercel-loggarna;
    // rapporteraTystFel gör felet synligt i automation_activity.
    console.error('[sync-to-fortnox] Kunde inte skriva synced-status efter lyckad Fortnox-bokning:', finalUpdateError.message)
    await rapporteraTystFel(
      supabase,
      businessId,
      'sync-to-fortnox:final-update-failed-after-fortnox-success',
      finalUpdateError.message,
      { invoiceId, fortnoxDocumentNumber },
    )
  }

  await markInvoiceDelivered(supabase, { businessId, invoiceId, method: 'fortnox' })

  return {
    success: true,
    fortnoxInvoiceNumber,
    fortnoxDocumentNumber: fortnoxDocumentNumber ?? undefined,
    newInvoiceNumber: fortnoxDocumentNumber,
    newOcrNumber,
    eInvoiceSent,
  }
}

// mapUnit flyttad till lib/invoices/fortnox-rows.ts (mapFortnoxUnit) — A3.
