import { getServerSupabase } from '@/lib/supabase'
import { calculateQuoteTotals } from '@/lib/quote-calculations'
import { generateOCR } from '@/lib/ocr'
import { getNextCustomerNumber, getNextCaseNumber } from '@/lib/numbering'
import { ensureDefaultStages, getStageBySlug } from '@/lib/pipeline'
import type { QuoteItem } from '@/lib/types/quote'

/**
 * lib/demo/seed-demo-account.ts (2026-07)
 *
 * "Demo-tryggheten": riggar om demokontot med färsk, realistisk exempeldata
 * inför varje säljdemo. Datum sätts RELATIVT NU vid varje körning — demon
 * ser alltid levande ut oavsett när den körs.
 *
 * Säkerhet: denna funktion tar bara emot ett business_id som ANROPAREN
 * (app/api/admin/demo-reset/route.ts) redan har verifierat är exakt
 * process.env.DEMO_BUSINESS_ID. Funktionen gör ingen egen gate — den litar
 * på route-lagret. Rör ALDRIG business_config/business_users/auth: läser
 * bara personal_phone/business_name/contact_name (read-only).
 *
 * Radera→infoga är idempotent: kör man reset igen raderas gårdagens
 * demo-rader (matchade på business_id) innan nya skapas.
 *
 * Tabeller som seedas (samma set som raderas, i beroendeordning vid radering):
 *   pending_approvals, agent_runs, pipeline_activity, quote_items, invoice,
 *   project, quotes, deal, customer
 */

export interface DemoResetSummary {
  customers: number
  deals: number
  quotes: number
  invoices: number
  projects: number
  approvals: number
  agentRuns: number
}

export interface DemoResetError {
  error: string
}

function isError(x: DemoResetSummary | DemoResetError): x is DemoResetError {
  return typeof (x as DemoResetError).error === 'string'
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 11)}`
}

// ── Datumhjälpare — allt relativt NU ──────────────────────────
function isoAt(offsetDays: number, hour = 9, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}
function dateOnly(offsetDays: number): string {
  return isoAt(offsetDays).split('T')[0]
}
function svDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('sv-SE')
}

export async function resetDemoAccount(
  businessId: string
): Promise<DemoResetSummary | DemoResetError> {
  const supabase = getServerSupabase()

  // ── 0. Läs ägarens mobilnummer + företagsnamn (READ-ONLY — rör aldrig business_config) ──
  const { data: biz, error: bizErr } = await supabase
    .from('business_config')
    .select('personal_phone, business_name, contact_name')
    .eq('business_id', businessId)
    .single()

  if (bizErr || !biz) {
    return { error: 'Kunde inte läsa demokontots företagsinställningar.' }
  }
  const ownerPhone = (biz.personal_phone as string | null) || null
  if (!ownerPhone) {
    return {
      error:
        'Inget mobilnummer sparat på demokontot. Gå till Inställningar → Telefoni och spara "Ditt privata mobilnummer" innan du återställer demon.',
    }
  }
  const businessName = (biz.business_name as string) || 'Företaget'
  const contactName = (biz.contact_name as string) || ''

  // ── 1. Radera tidigare demo-data (endast denna business_id) ──
  // Ordning: löv-till-rot så inga FK-beroenden (t.ex. pipeline_activity →
  // deal, quote_items → quotes) någonsin ger ett orphan-fel, oavsett om
  // CASCADE redan skulle städat undan dem.
  await supabase.from('pending_approvals').delete().eq('business_id', businessId)
  await supabase.from('agent_runs').delete().eq('business_id', businessId)
  await supabase.from('pipeline_activity').delete().eq('business_id', businessId)
  await supabase.from('quote_items').delete().eq('business_id', businessId)
  await supabase.from('invoice').delete().eq('business_id', businessId)
  await supabase.from('project').delete().eq('business_id', businessId)
  await supabase.from('quotes').delete().eq('business_id', businessId)
  await supabase.from('deal').delete().eq('business_id', businessId)
  await supabase.from('customer').delete().eq('business_id', businessId)

  // ── 2. Pipeline-steg måste finnas (no-op om redan seedade) ──
  await ensureDefaultStages(businessId)

  // ══════════════════════════════════════════════════════════
  // 3. KUNDER (6 st) — alla telefonnummer = ägarens personal_phone
  // ══════════════════════════════════════════════════════════
  type SeedCustomer = {
    key: string
    insert: Record<string, unknown>
  }

  const customerSeeds: SeedCustomer[] = [
    {
      key: 'anna',
      insert: {
        customer_id: genId('cust'),
        business_id: businessId,
        name: 'Anna Lindqvist',
        phone_number: ownerPhone,
        email: 'demo+1@handymate.se',
        address_line: 'Björkvägen 14, 122 33 Enskede',
        customer_type: 'private',
        personal_number: '19820314-5566',
        property_designation: 'Enskede 1:23',
      },
    },
    {
      key: 'mikael',
      insert: {
        customer_id: genId('cust'),
        business_id: businessId,
        name: 'Mikael Svensson',
        phone_number: ownerPhone,
        email: 'demo+2@handymate.se',
        address_line: 'Furuvägen 8, 141 45 Huddinge',
        customer_type: 'private',
      },
    },
    {
      key: 'brf',
      insert: {
        customer_id: genId('cust'),
        business_id: businessId,
        name: 'BRF Lönnen',
        phone_number: ownerPhone,
        email: 'demo+3@handymate.se',
        address_line: 'Lönngatan 5, 118 27 Stockholm',
        customer_type: 'brf',
        org_number: '769600-1234',
        contact_person: 'Lena Ahlgren (ordförande)',
        apartment_count: 24,
      },
    },
    {
      key: 'fastighets',
      insert: {
        customer_id: genId('cust'),
        business_id: businessId,
        name: 'Fastighets AB Storgatan',
        phone_number: ownerPhone,
        email: 'demo+4@handymate.se',
        address_line: 'Storgatan 22, 111 51 Stockholm',
        customer_type: 'company',
        org_number: '556677-8899',
        contact_person: 'Peter Norin',
      },
    },
    {
      key: 'kristina',
      insert: {
        customer_id: genId('cust'),
        business_id: businessId,
        name: 'Kristina Bergström',
        phone_number: ownerPhone,
        email: 'demo+5@handymate.se',
        address_line: 'Ekbacken 3, 168 36 Bromma',
        customer_type: 'private',
        personal_number: '19750622-1122',
      },
    },
    {
      key: 'johan',
      insert: {
        customer_id: genId('cust'),
        business_id: businessId,
        name: 'Johan Ek',
        phone_number: ownerPhone,
        email: 'demo+6@handymate.se',
        address_line: 'Sjövägen 19, 131 40 Nacka',
        customer_type: 'private',
      },
    },
  ]

  const customers: Record<string, { customer_id: string; name: string; email: string; phone_number: string }> = {}
  for (const c of customerSeeds) {
    const customerNumber = await getNextCustomerNumber(supabase, businessId)
    const { data, error } = await supabase
      .from('customer')
      .insert({ ...c.insert, customer_number: customerNumber, created_at: new Date().toISOString() })
      .select('customer_id, name, email, phone_number')
      .single()
    if (error || !data) return { error: `Kunde inte skapa kund ${c.key}: ${error?.message}` }
    customers[c.key] = data
  }

  // ══════════════════════════════════════════════════════════
  // 4. DEALS (4 st, olika pipeline-steg, värden exkl. moms)
  // ══════════════════════════════════════════════════════════
  const stageNewInquiry = await getStageBySlug(businessId, 'new_inquiry')
  const stageContacted = await getStageBySlug(businessId, 'contacted')
  const stageQuoteSent = await getStageBySlug(businessId, 'quote_sent')
  const stageQuoteAccepted = await getStageBySlug(businessId, 'quote_accepted')
  if (!stageNewInquiry || !stageContacted || !stageQuoteSent || !stageQuoteAccepted) {
    return { error: 'Pipeline-steg saknas för demokontot — kunde inte skapa affärer.' }
  }

  type SeedDeal = {
    key: string
    customerKey: string
    title: string
    value: number
    stage: { id: string }
    priority: string
    source: string
    job_type: string
    created_at: string
  }

  const dealSeeds: SeedDeal[] = [
    {
      key: 'brf_leak',
      customerKey: 'brf',
      title: 'Takläckage akut – Lönngatan 5',
      value: 15000,
      stage: stageNewInquiry,
      priority: 'urgent',
      source: 'call',
      job_type: 'tak',
      created_at: isoAt(0, 8, 40),
    },
    {
      key: 'fastighets_el',
      customerKey: 'fastighets',
      title: 'Eldragning garage – Storgatan 22',
      value: 28000,
      stage: stageContacted,
      priority: 'medium',
      source: 'phone',
      job_type: 'el',
      created_at: isoAt(-3, 11, 0),
    },
    {
      key: 'mikael_altan',
      customerKey: 'mikael',
      title: 'Altanbygge – Furuvägen 8',
      value: 95000,
      stage: stageQuoteSent,
      priority: 'medium',
      source: 'website',
      job_type: 'altan',
      created_at: isoAt(-6, 14, 0),
    },
    {
      key: 'anna_badrum',
      customerKey: 'anna',
      title: 'Badrumsrenovering – Björkvägen 14',
      value: 185000,
      stage: stageQuoteAccepted,
      priority: 'high',
      source: 'website',
      job_type: 'badrum',
      created_at: isoAt(-12, 9, 30),
    },
  ]

  const deals: Record<string, { id: string; title: string }> = {}
  for (const d of dealSeeds) {
    const dealNumber = await getNextCaseNumber(supabase, businessId)
    const { data, error } = await supabase
      .from('deal')
      .insert({
        business_id: businessId,
        customer_id: customers[d.customerKey].customer_id,
        title: d.title,
        value: d.value,
        stage_id: d.stage.id,
        priority: d.priority,
        source: d.source,
        deal_number: dealNumber,
        job_type: d.job_type,
        created_at: d.created_at,
      })
      .select('id, title')
      .single()
    if (error || !data) return { error: `Kunde inte skapa affär ${d.key}: ${error?.message}` }
    deals[d.key] = data

    await supabase.from('pipeline_activity').insert({
      business_id: businessId,
      deal_id: data.id,
      activity_type: 'deal_created',
      description: `Deal "${d.title}" skapad`,
      to_stage_id: d.stage.id,
      triggered_by: 'user',
      created_at: d.created_at,
    })
  }

  // ══════════════════════════════════════════════════════════
  // 5. OFFERTER (3 st) — via samma calculateQuoteTotals-motor som produktionen
  // ══════════════════════════════════════════════════════════
  type SeedQuoteItem = QuoteItem
  type SeedQuote = {
    key: string
    customerKey: string
    dealKey: string | null
    title: string
    status: 'draft' | 'sent' | 'accepted'
    items: SeedQuoteItem[]
    sentAt: string | null
    acceptedAt: string | null
    createdAt: string
    validUntilOffset: number
    projectAddress: string
  }

  const annaItems: SeedQuoteItem[] = [
    { id: genId('qi'), item_type: 'item', description: 'Rivning befintligt badrum och bortforsling', quantity: 1, unit: 'st', unit_price: 18000, total: 18000, is_rot_eligible: true, is_rut_eligible: false, rot_rut_type: 'rot', labor_amount: 18000, material_amount: 0, sort_order: 0 },
    { id: genId('qi'), item_type: 'item', description: 'VVS-arbete – rör, avlopp och installation', quantity: 1, unit: 'st', unit_price: 45000, total: 45000, is_rot_eligible: true, is_rut_eligible: false, rot_rut_type: 'rot', labor_amount: 45000, material_amount: 0, sort_order: 1 },
    { id: genId('qi'), item_type: 'item', description: 'Kakel- och klinkerarbete', quantity: 1, unit: 'st', unit_price: 42000, total: 42000, is_rot_eligible: true, is_rut_eligible: false, rot_rut_type: 'rot', labor_amount: 42000, material_amount: 0, sort_order: 2 },
    { id: genId('qi'), item_type: 'item', description: 'Material – kakel, klinker, sanitetsporslin och blandare', quantity: 1, unit: 'st', unit_price: 80000, total: 80000, is_rot_eligible: false, is_rut_eligible: false, rot_rut_type: null, labor_amount: 0, material_amount: 80000, sort_order: 3 },
  ]

  const mikaelItems: SeedQuoteItem[] = [
    { id: genId('qi'), item_type: 'item', description: 'Grundläggning och plintar', quantity: 20, unit: 'tim', unit_price: 750, total: 15000, is_rot_eligible: false, is_rut_eligible: false, rot_rut_type: null, labor_amount: 15000, material_amount: 0, sort_order: 0 },
    { id: genId('qi'), item_type: 'item', description: 'Byggnation altan – snickeriarbete', quantity: 50, unit: 'tim', unit_price: 700, total: 35000, is_rot_eligible: false, is_rut_eligible: false, rot_rut_type: null, labor_amount: 35000, material_amount: 0, sort_order: 1 },
    { id: genId('qi'), item_type: 'item', description: 'Material – tryckimpregnerat virke, skruv och ytbehandling', quantity: 1, unit: 'st', unit_price: 45000, total: 45000, is_rot_eligible: false, is_rut_eligible: false, rot_rut_type: null, labor_amount: 0, material_amount: 45000, sort_order: 2 },
  ]

  const johanItems: SeedQuoteItem[] = [
    { id: genId('qi'), item_type: 'item', description: 'Byte av 6 fönster – 2-glas till 3-glas, arbete och montering', quantity: 1, unit: 'st', unit_price: 62000, total: 62000, is_rot_eligible: true, is_rut_eligible: false, rot_rut_type: 'rot', labor_amount: 25000, material_amount: 37000, sort_order: 0 },
    { id: genId('qi'), item_type: 'option', description: 'Tillval: uppgradering till aluminiumbeklädnad utvändigt', quantity: 1, unit: 'st', unit_price: 18000, total: 18000, is_rot_eligible: false, is_rut_eligible: false, rot_rut_type: null, option_selected: false, option_default: false, sort_order: 1 },
  ]

  const quoteSeeds: SeedQuote[] = [
    {
      key: 'anna_quote',
      customerKey: 'anna',
      dealKey: 'anna_badrum',
      title: 'Badrumsrenovering – Björkvägen 14',
      status: 'accepted',
      items: annaItems,
      sentAt: isoAt(-12, 10, 0),
      acceptedAt: isoAt(-10, 16, 30),
      createdAt: isoAt(-12, 9, 45),
      validUntilOffset: 18,
      projectAddress: 'Björkvägen 14, 122 33 Enskede',
    },
    {
      key: 'mikael_quote',
      customerKey: 'mikael',
      dealKey: 'mikael_altan',
      title: 'Altanbygge – Furuvägen 8',
      status: 'sent',
      items: mikaelItems,
      sentAt: isoAt(-6, 14, 20),
      acceptedAt: null,
      createdAt: isoAt(-6, 14, 5),
      validUntilOffset: 24,
      projectAddress: 'Furuvägen 8, 141 45 Huddinge',
    },
    {
      key: 'johan_quote',
      customerKey: 'johan',
      dealKey: null,
      title: 'Fönsterbyte – Sjövägen 19',
      status: 'draft',
      items: johanItems,
      sentAt: null,
      acceptedAt: null,
      createdAt: isoAt(0, 11, 0),
      validUntilOffset: 30,
      projectAddress: 'Sjövägen 19, 131 40 Nacka',
    },
  ]

  const quotes: Record<string, { quote_id: string; quote_number: string; total: number; customer_pays: number }> = {}
  let quoteCounter = 0
  for (const q of quoteSeeds) {
    quoteCounter++
    const totals = calculateQuoteTotals(q.items, 0, 25)
    const quoteId = genId('quote')
    const quoteNumber = `#${String(quoteCounter).padStart(3, '0')}`
    const rotRutType = totals.rotWorkCost > 0 ? 'rot' : totals.rutWorkCost > 0 ? 'rut' : null
    const totalDeduction = totals.rotDeduction + totals.rutDeduction

    const { data, error } = await supabase
      .from('quotes')
      .insert({
        quote_id: quoteId,
        business_id: businessId,
        customer_id: customers[q.customerKey].customer_id,
        quote_number: quoteNumber,
        status: q.status,
        title: q.title,
        description: null,
        items: [],
        labor_total: totals.laborTotal,
        material_total: totals.materialTotal,
        subtotal: totals.subtotal,
        discount_percent: 0,
        discount_amount: 0,
        vat_rate: 25,
        vat_amount: totals.vat,
        total: totals.total,
        rot_rut_type: rotRutType,
        rot_rut_eligible: totals.rotWorkCost + totals.rutWorkCost,
        rot_rut_deduction: totalDeduction,
        customer_pays: totalDeduction > 0 ? totals.total - totalDeduction : totals.total,
        terms: {},
        images: [],
        valid_until: dateOnly(q.validUntilOffset),
        sent_at: q.sentAt,
        accepted_at: q.acceptedAt,
        ai_generated: false,
        sign_token: crypto.randomUUID(),
        payment_plan: [],
        detail_level: 'detailed',
        show_unit_prices: true,
        show_quantities: true,
        rot_work_cost: totals.rotWorkCost || null,
        rot_deduction: totals.rotDeduction || null,
        rot_customer_pays: totals.rotWorkCost > 0 ? totals.total - totals.rotDeduction : null,
        rut_work_cost: totals.rutWorkCost || null,
        rut_deduction: totals.rutDeduction || null,
        rut_customer_pays: totals.rutWorkCost > 0 ? totals.total - totals.rutDeduction : null,
        project_address: q.projectAddress,
        deal_id: q.dealKey ? deals[q.dealKey].id : null,
        created_at: q.createdAt,
      })
      .select('quote_id, quote_number, total, customer_pays')
      .single()

    if (error || !data) return { error: `Kunde inte skapa offert ${q.key}: ${error?.message}` }
    quotes[q.key] = data

    const itemInserts = q.items.map((item, idx) => ({
      id: item.id,
      quote_id: quoteId,
      business_id: businessId,
      item_type: item.item_type,
      group_name: item.group_name || null,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      total: item.total,
      is_rot_eligible: item.is_rot_eligible,
      is_rut_eligible: item.is_rut_eligible,
      rot_rut_type: item.rot_rut_type ?? null,
      option_selected: item.option_selected ?? false,
      option_default: item.option_default ?? false,
      labor_amount: item.labor_amount ?? null,
      material_amount: item.material_amount ?? null,
      sort_order: idx,
    }))
    const { error: itemsErr } = await supabase.from('quote_items').insert(itemInserts)
    if (itemsErr) return { error: `Kunde inte skapa offertrader för ${q.key}: ${itemsErr.message}` }

    // Länka dealen tillbaka till offerten (samma mönster som POST /api/quotes,
    // MEN vi synkar medvetet INTE deal.value hit — pipeline-värdena ska hålla
    // sig till de exkl.-moms-siffror som är specade för demon).
    if (q.dealKey) {
      await supabase.from('deal').update({ quote_id: quoteId }).eq('id', deals[q.dealKey].id).eq('business_id', businessId)
    }
  }

  // ══════════════════════════════════════════════════════════
  // 6. PROJEKT (2 st)
  // ══════════════════════════════════════════════════════════
  const { data: annaProject, error: annaProjErr } = await supabase
    .from('project')
    .insert({
      business_id: businessId,
      customer_id: customers.anna.customer_id,
      quote_id: quotes.anna_quote.quote_id,
      deal_id: deals.anna_badrum.id,
      name: 'Badrumsrenovering – Björkvägen 14',
      project_type: 'fixed',
      status: 'active',
      budget_amount: quotes.anna_quote.customer_pays,
      progress_percent: 35,
      start_date: dateOnly(-9),
      end_date: dateOnly(5),
      address: 'Björkvägen 14, 122 33 Enskede',
      job_type: 'badrum',
      created_at: isoAt(-9, 8, 0),
    })
    .select('project_id')
    .single()
  if (annaProjErr || !annaProject) return { error: `Kunde inte skapa projekt (Anna): ${annaProjErr?.message}` }

  const { data: kristinaProject, error: kristinaProjErr } = await supabase
    .from('project')
    .insert({
      business_id: businessId,
      customer_id: customers.kristina.customer_id,
      name: 'Byte av kökskran och packningar',
      project_type: 'fixed',
      status: 'completed',
      budget_amount: 6000,
      progress_percent: 100,
      start_date: dateOnly(-5),
      end_date: dateOnly(-4),
      completed_at: isoAt(-4, 15, 30),
      address: 'Ekbacken 3, 168 36 Bromma',
      job_type: 'vvs',
      created_at: isoAt(-5, 9, 0),
    })
    .select('project_id')
    .single()
  if (kristinaProjErr || !kristinaProject) return { error: `Kunde inte skapa projekt (Kristina): ${kristinaProjErr?.message}` }

  // ══════════════════════════════════════════════════════════
  // 7. FAKTUROR (3 st): betald, skickad ej förfallen, förfallen 8 dagar
  // ══════════════════════════════════════════════════════════
  type SeedInvoiceItem = { id: string; item_type: string; description: string; quantity: number; unit: string; unit_price: number; total: number; type: string; is_rot_eligible: boolean; is_rut_eligible: boolean; sort_order: number }

  function invoiceItem(description: string, total: number, type: 'labor' | 'material', rot: boolean, idx: number): SeedInvoiceItem {
    return {
      id: genId('ii'),
      item_type: 'item',
      description,
      quantity: 1,
      unit: 'st',
      unit_price: total,
      total,
      type,
      is_rot_eligible: rot,
      is_rut_eligible: false,
      sort_order: idx,
    }
  }

  // 7a. Betald — Fastighets AB Storgatan, äldre jobb
  const fastighetsItems = [invoiceItem('Elinstallation kontor – arbete och material', 24000, 'labor', false, 0)]
  const fastighetsSubtotal = 24000
  const fastighetsVat = fastighetsSubtotal * 0.25
  const fastighetsTotal = fastighetsSubtotal + fastighetsVat
  const fastighetsInvoiceNumber = `FV-${new Date().getFullYear()}-D01`
  const { data: fastighetsInvoice, error: fastighetsInvErr } = await supabase
    .from('invoice')
    .insert({
      business_id: businessId,
      customer_id: customers.fastighets.customer_id,
      invoice_number: fastighetsInvoiceNumber,
      invoice_type: 'standard',
      status: 'paid',
      items: fastighetsItems,
      subtotal: fastighetsSubtotal,
      vat_rate: 25,
      vat_amount: fastighetsVat,
      total: fastighetsTotal,
      customer_pays: fastighetsTotal,
      invoice_date: dateOnly(-40),
      due_date: dateOnly(-10),
      paid_at: isoAt(-15, 10, 0),
      ocr_number: generateOCR(fastighetsInvoiceNumber),
      our_reference: contactName || null,
      created_at: isoAt(-40, 9, 0),
    })
    .select('invoice_id, invoice_number')
    .single()
  if (fastighetsInvErr || !fastighetsInvoice) return { error: `Kunde inte skapa faktura (Fastighets): ${fastighetsInvErr?.message}` }

  // 7b. Skickad, ej förfallen — Johan Ek, äldre jobb med ROT
  const johanInvItems = [invoiceItem('Byte av 4 element', 9600, 'labor', true, 0)]
  const johanSubtotal = 9600
  const johanVat = johanSubtotal * 0.25
  const johanTotal = johanSubtotal + johanVat
  const johanRotDeduction = Math.min(johanSubtotal * 0.3, 50000)
  const johanInvoiceNumber = `FV-${new Date().getFullYear()}-D02`
  const { data: johanInvoice, error: johanInvErr } = await supabase
    .from('invoice')
    .insert({
      business_id: businessId,
      customer_id: customers.johan.customer_id,
      invoice_number: johanInvoiceNumber,
      invoice_type: 'standard',
      status: 'sent',
      items: johanInvItems,
      subtotal: johanSubtotal,
      vat_rate: 25,
      vat_amount: johanVat,
      total: johanTotal,
      rot_rut_type: 'rot',
      rot_rut_deduction: johanRotDeduction,
      customer_pays: johanTotal - johanRotDeduction,
      invoice_date: dateOnly(-3),
      due_date: dateOnly(27),
      ocr_number: generateOCR(johanInvoiceNumber),
      our_reference: contactName || null,
      created_at: isoAt(-3, 13, 0),
    })
    .select('invoice_id, invoice_number')
    .single()
  if (johanInvErr || !johanInvoice) return { error: `Kunde inte skapa faktura (Johan): ${johanInvErr?.message}` }

  // 7c. Förfallen 8 dagar — Kristina Bergström (kopplad till avslutade projektet)
  const kristinaInvItems = [invoiceItem('Byte av kökskran och packningar', 4800, 'labor', false, 0)]
  const kristinaSubtotal = 4800
  const kristinaVat = kristinaSubtotal * 0.25
  const kristinaTotal = kristinaSubtotal + kristinaVat // 6000
  const kristinaInvoiceNumber = `FV-${new Date().getFullYear()}-D03`
  const kristinaDueDate = dateOnly(-8)
  const { data: kristinaInvoice, error: kristinaInvErr } = await supabase
    .from('invoice')
    .insert({
      business_id: businessId,
      customer_id: customers.kristina.customer_id,
      project_id: kristinaProject.project_id,
      invoice_number: kristinaInvoiceNumber,
      invoice_type: 'standard',
      status: 'sent',
      items: kristinaInvItems,
      subtotal: kristinaSubtotal,
      vat_rate: 25,
      vat_amount: kristinaVat,
      total: kristinaTotal,
      customer_pays: kristinaTotal,
      invoice_date: dateOnly(-38),
      due_date: kristinaDueDate,
      reminder_count: 0,
      ocr_number: generateOCR(kristinaInvoiceNumber),
      our_reference: contactName || null,
      created_at: isoAt(-38, 9, 0),
    })
    .select('invoice_id, invoice_number')
    .single()
  if (kristinaInvErr || !kristinaInvoice) return { error: `Kunde inte skapa faktura (Kristina): ${kristinaInvErr?.message}` }

  // ══════════════════════════════════════════════════════════
  // 8. PENDING_APPROVALS (3 st) — payload-strukturen kopierad EXAKT från
  //    lib/autopilot/quote-nudge.ts (Daniel), app/api/cron/send-reminders
  //    (Karin) och executeApprovalPayload's generiska 'send_sms'-case (Lisa),
  //    se app/api/approvals/[id]/route.ts.
  // ══════════════════════════════════════════════════════════
  const daysOverdue = 8
  const reminderFee = 60
  const penaltyInterest = 8
  const interestAmount = Math.round((kristinaTotal * (penaltyInterest / 100) * daysOverdue) / 365)

  const approvalSeeds = [
    // Daniel — offert-uppföljning (kopierar lib/autopilot/quote-nudge.ts:84-103)
    {
      id: genId('appr'),
      business_id: businessId,
      approval_type: 'quote_nudge',
      title: `💡 Nudge — ${customers.mikael.name}`,
      description: 'Öppnat offerten 3x utan att svara',
      status: 'pending',
      risk_level: 'medium',
      payload: {
        agent_id: 'daniel',
        quote_id: quotes.mikael_quote.quote_id,
        to: ownerPhone,
        message: `Hej ${customers.mikael.name}! Jag såg att du tittade på offerten för "Altanbygge – Furuvägen 8". Har du några frågor? Hör gärna av dig! //${contactName}`,
        customer_name: customers.mikael.name,
        view_count: 3,
      },
      created_at: isoAt(0, 8, 15),
      expires_at: isoAt(7),
    },
    // Lisa — svar på missat samtal (samma SMS-mall som v3-regeln "Svar på
    // missat samtal" i lib/seed-defaults.ts, men köad för godkännande i demon
    // istället för auto-skickad). Exekveras via generiska 'send_sms'-caset.
    {
      id: genId('appr'),
      business_id: businessId,
      approval_type: 'send_sms',
      title: `📞 Missat samtal — ${customers.brf.name}`,
      description: 'Ringde angående takläckage — inget svar',
      status: 'pending',
      risk_level: 'low',
      payload: {
        agent_id: 'lisa',
        to: ownerPhone,
        message: `Hej! Vi missade tyvärr ditt samtal till ${businessName}. Svara på detta SMS med vad du behöver hjälp med, så återkommer vi direkt — eller ringer upp så snart vi kan.`,
        customer_id: customers.brf.customer_id,
        customer_name: customers.brf.name,
        related_id: deals.brf_leak.id,
      },
      created_at: isoAt(0, 8, 42),
      expires_at: isoAt(7),
    },
    // Karin — fakturapåminnelse (kopierar deliveryInput-formen EXAKT från
    // app/api/cron/send-reminders/route.ts:342-360, ReminderDeliveryInput i
    // lib/invoice-reminder-send.ts — så Godkänn kör deliverInvoiceReminder på riktigt).
    {
      id: genId('appr'),
      business_id: businessId,
      approval_type: 'invoice_reminder',
      title: `Skicka påminnelse för faktura ${kristinaInvoice.invoice_number}`,
      description: `Faktura ${kristinaInvoice.invoice_number} på ${kristinaTotal.toLocaleString('sv-SE')} kr är ${daysOverdue} dagar försenad. Godkänn för att skicka påminnelse 1 till kunden.`,
      status: 'pending',
      risk_level: 'medium',
      payload: {
        invoice_id: kristinaInvoice.invoice_id,
        autonomy_key: 'invoice_reminder',
        delivery: {
          invoiceId: kristinaInvoice.invoice_id,
          invoiceNumber: kristinaInvoice.invoice_number,
          businessId,
          customerId: customers.kristina.customer_id,
          businessName,
          customerPhone: ownerPhone,
          customerEmail: customers.kristina.email,
          emailToo: false,
          messages: {
            sms: `Hej! Faktura ${kristinaInvoice.invoice_number} på ${kristinaTotal.toLocaleString('sv-SE')} kr förföll ${svDate(-8)}. Kanske missades? OCR: ${generateOCR(kristinaInvoiceNumber)}.\n${businessName}`,
            emailSubject: `Påminnelse: Faktura ${kristinaInvoice.invoice_number}`,
            emailBody: `<p>Vi vill vänligen påminna om att faktura <strong>${kristinaInvoice.invoice_number}</strong> på <strong>${kristinaTotal.toLocaleString('sv-SE')} kr</strong> förföll den ${svDate(-8)}.</p><p>Om betalningen redan är skickad, bortse från detta meddelande.</p>`,
          },
          level: 'friendly',
          currentCount: 0,
          nextReminderAt: isoAt(6),
          reminderFee,
          interestAmount,
          penaltyInterest,
          daysOverdue,
        },
      },
      created_at: isoAt(0, 9, 5),
      expires_at: isoAt(7),
    },
  ]

  const { error: approvalsErr } = await supabase.from('pending_approvals').insert(approvalSeeds)
  if (approvalsErr) return { error: `Kunde inte skapa godkännanden: ${approvalsErr.message}` }

  // ══════════════════════════════════════════════════════════
  // 9. AGENT_RUNS — några enkla rader "igår kväll" så bevisbandet har siffror.
  //    Kolumnerna är okomplicerade (run_id, business_id, agent_id, trigger_type,
  //    tool_calls, status, created_at — se sql/agent_tables.sql + v21_agent_specialization.sql)
  //    så vi seedar dem. Läses av app/api/dashboard/team-activity/route.ts (Lisas siffror).
  // ══════════════════════════════════════════════════════════
  const agentRunSeeds = [
    { run_id: genId('agentrun'), business_id: businessId, agent_id: 'lisa', trigger_type: 'phone_call', trigger_data: {}, tool_calls: 2, status: 'completed', created_at: isoAt(-1, 19, 12) },
    { run_id: genId('agentrun'), business_id: businessId, agent_id: 'lisa', trigger_type: 'phone_call', trigger_data: {}, tool_calls: 1, status: 'completed', created_at: isoAt(-1, 20, 3) },
    { run_id: genId('agentrun'), business_id: businessId, agent_id: 'lisa', trigger_type: 'incoming_sms', trigger_data: {}, tool_calls: 1, status: 'completed', created_at: isoAt(-1, 20, 47) },
  ]
  const { error: agentRunsErr } = await supabase.from('agent_runs').insert(agentRunSeeds)
  if (agentRunsErr) {
    // Non-fatal: bevisbandet degraderar bara till "inget nytt sedan igår" om detta failar.
    console.error('[demo-reset] agent_runs insert failed (non-blocking):', agentRunsErr.message)
  }

  return {
    customers: customerSeeds.length,
    deals: dealSeeds.length,
    quotes: quoteSeeds.length,
    invoices: 3,
    projects: 2,
    approvals: approvalSeeds.length,
    agentRuns: agentRunsErr ? 0 : agentRunSeeds.length,
  }
}

export { isError }
