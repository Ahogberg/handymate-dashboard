import { getServerSupabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { calculateQuoteTotals } from '@/lib/quote-calculations'
import { rotRutDeductionInclVat } from '@/lib/rot-rut'
import { generateOCR } from '@/lib/ocr'
import { getNextCustomerNumber, getNextCaseNumber } from '@/lib/numbering'
import { ensureDefaultStages, getStageBySlug } from '@/lib/pipeline'
import type { QuoteItem } from '@/lib/types/quote'
import { buildDemoManifest, type DemoManifest } from '@/lib/demo/manifest'

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
 *   project_checklist, project, quotes, deal, customer, booking,
 *   schedule_entry
 *
 * Fas 0.2 (planen vad-kan-vi-kopiera-snug-phoenix.md, R2-DoD
 * tasks/resurs-masterplan.md): booking + schedule_entry seedas nu också —
 * resurstavlan (/dashboard/schema) ska demoa beläggnings-%, obemannat-
 * spåret och en konflikt utan tomma kolumner. Extra teammedlemmar
 * (business_users) seedas MEDVETET INTE här — det är STRUKTURELL data,
 * samma undantag som business_config/business_users/auth i filhuvudet
 * ovan (destruktiv delete→insert på en auth-kopplad tabell varje reset
 * vore farligt — kan radera den inloggade presentatörens egen rad).
 * Läggs till EN GÅNG av Andreas via sql/demo_seed_flerpersons.sql (samma
 * engångs-riggningsmönster som sql/demo-konto-setup.sql). Bookings/
 * schedule_entry läser bara vilka AKTIVA business_users som råkar finnas
 * just nu (ingen hård koppling till den SQL-filen) — degraderar snyggt
 * till färre personer på tavlan om filen inte körts än, kraschar aldrig.
 */

export interface DemoResetSummary {
  customers: number
  deals: number
  quotes: number
  invoices: number
  projects: number
  approvals: number
  agentRuns: number
  bookings: number
  scheduleEntries: number
  manifest: DemoManifest
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
  businessId: string,
  actorUserId: string,
  accessToken: string,
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

  // ── 1. Atomisk radering via V99 ───────────────────────────
  // RPC:n anropas med den verkliga användarens JWT så auth.uid() i
  // SECURITY DEFINER-funktionen blir auditens actor och DB:n kan upprepa
  // owner/admin-grinden. Service-role används fortsatt enbart för seedningen.
  const rpcSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
  const resetStartedAt = new Date().toISOString()
  const { data: resetAuditId, error: resetError } = await rpcSupabase.rpc(
    'reset_demo_tenant',
    { p_business_id: businessId },
  )

  if (resetError || typeof resetAuditId !== 'string') {
    console.error('[demo-reset] atomisk radering misslyckades:', resetError?.message)
    // RPC-transaktionen rullade tillbaka även sin påbörjade audit. Skriv en
    // separat, smal felrad efter rollback så försöket ändå blir synligt.
    const { error: auditInsertError } = await supabase.from('demo_reset_audit').insert({
      business_id: businessId,
      actor_user_id: actorUserId,
      started_at: resetStartedAt,
      finished_at: new Date().toISOString(),
      ok: false,
      error_text: 'delete_transaction_failed',
      reset_version: 'v99',
    })
    if (auditInsertError) {
      console.error('[demo-reset] kunde inte auditlogga rollback:', auditInsertError.message)
    }
    return { error: 'Kunde inte radera det gamla demoläget. Inga gamla demorader ändrades.' }
  }

  async function failReset(message: string, errorCode = 'seed_failed'): Promise<DemoResetError> {
    const { error: auditError } = await supabase
      .from('demo_reset_audit')
      .update({
        actor_user_id: actorUserId,
        finished_at: new Date().toISOString(),
        ok: false,
        error_text: errorCode,
      })
      .eq('id', resetAuditId)
      .eq('business_id', businessId)
    if (auditError) {
      console.error('[demo-reset] kunde inte avsluta felauditen:', auditError.message)
    }
    return { error: message }
  }

  try {

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
    if (error || !data) return failReset(`Kunde inte skapa kund ${c.key}: ${error?.message}`, 'customer_insert_failed')
    customers[c.key] = data
  }

  // ══════════════════════════════════════════════════════════
  // 4. DEALS (4 st, olika pipeline-steg, värden exkl. moms)
  // ══════════════════════════════════════════════════════════
  const stageNewInquiry = await getStageBySlug(businessId, 'new_inquiry')
  const stageContacted = await getStageBySlug(businessId, 'contacted')
  const stageQuoteSent = await getStageBySlug(businessId, 'quote_sent')
  // V80: 'quote_accepted' är borttaget (sql/v80_merge_accepted_into_won.sql)
  // — demokontots "accepterad offert"-exempel visas numera i 'won' istället.
  const stageWon = await getStageBySlug(businessId, 'won')
  if (!stageNewInquiry || !stageContacted || !stageQuoteSent || !stageWon) {
    return failReset('Pipeline-steg saknas för demokontot — kunde inte skapa affärer.', 'pipeline_stage_missing')
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
      stage: stageWon,
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
    if (error || !data) return failReset(`Kunde inte skapa affär ${d.key}: ${error?.message}`, 'deal_insert_failed')
    deals[d.key] = data

    const { error: activityError } = await supabase.from('pipeline_activity').insert({
      business_id: businessId,
      deal_id: data.id,
      activity_type: 'deal_created',
      description: `Deal "${d.title}" skapad`,
      to_stage_id: d.stage.id,
      triggered_by: 'user',
      created_at: d.created_at,
    })
    if (activityError) {
      return failReset(`Kunde inte skapa pipelineaktivitet för ${d.key}: ${activityError.message}`, 'pipeline_activity_insert_failed')
    }
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

    if (error || !data) return failReset(`Kunde inte skapa offert ${q.key}: ${error?.message}`, 'quote_insert_failed')
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
    if (itemsErr) return failReset(`Kunde inte skapa offertrader för ${q.key}: ${itemsErr.message}`, 'quote_items_insert_failed')

    // Länka dealen tillbaka till offerten (samma mönster som POST /api/quotes,
    // MEN vi synkar medvetet INTE deal.value hit — pipeline-värdena ska hålla
    // sig till de exkl.-moms-siffror som är specade för demon).
    if (q.dealKey) {
      const { error: dealLinkError } = await supabase
        .from('deal')
        .update({ quote_id: quoteId })
        .eq('id', deals[q.dealKey].id)
        .eq('business_id', businessId)
      if (dealLinkError) {
        return failReset(`Kunde inte länka offerten till affären ${q.dealKey}: ${dealLinkError.message}`, 'deal_quote_link_failed')
      }
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
  if (annaProjErr || !annaProject) return failReset(`Kunde inte skapa projekt (Anna): ${annaProjErr?.message}`, 'project_insert_failed')

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
  if (kristinaProjErr || !kristinaProject) return failReset(`Kunde inte skapa projekt (Kristina): ${kristinaProjErr?.message}`, 'project_insert_failed')

  // ══════════════════════════════════════════════════════════
  // 6b. EGENKONTROLL-CHECKLISTA (1 st, aktiv) — Anna-badrummet, tema
  //     lånat från BRANCH_CHECKLISTS.plumber['Badrumsrenovering'] (se
  //     lib/checklist-defaults.ts) så demot känns verkligt istället för
  //     hittepå. 4 punkter redan avbockade (som om hantverkaren jobbat på
  //     projektet i 9 dagar, progress_percent=35 ovan), 2 kvarstår — båda
  //     required:true så "Bocka av"-raden i projektvyn (Etapp 1c,
  //     app/dashboard/projects/[id]/page.tsx ~1772) har något att visa.
  //     De två öppna punkterna är MEDVETET valda som mål för de två
  //     egenkontroll-godkännandena nedan (8b/8c) — ett foto som styrker
  //     den ena, ett foto som motsäger den andra.
  // ══════════════════════════════════════════════════════════
  const checklistItemFallMotBrunn = { id: genId('ci'), text: 'Verifiera fall mot brunn', required: true, checked: false }
  const checklistItemGenomforing = { id: genId('ci'), text: 'Kontrollera tätning vid rörgenomföring', required: true, checked: false }
  const badrumChecklistItems = [
    { id: genId('ci'), text: 'Tätskikt applicerat enligt BBV', required: true, checked: true },
    { id: genId('ci'), text: 'Provtrycka tätskikt', required: true, checked: true },
    { id: genId('ci'), text: 'Kontrollera golvbrunn position', required: false, checked: true },
    { id: genId('ci'), text: 'Installera blandare och kopplingar', required: false, checked: true },
    checklistItemFallMotBrunn,
    checklistItemGenomforing,
  ]
  const badrumChecklistId = genId('cl')
  const { error: checklistErr } = await supabase.from('project_checklist').insert({
    id: badrumChecklistId,
    project_id: annaProject.project_id,
    business_id: businessId,
    template_id: null,
    name: 'Badrumsrenovering — egenkontroll',
    items: badrumChecklistItems,
    status: 'in_progress',
    created_at: isoAt(-2, 14, 0),
  })
  if (checklistErr) return failReset(`Kunde inte skapa checklista (Anna): ${checklistErr.message}`, 'project_checklist_insert_failed')

  // ══════════════════════════════════════════════════════════
  // 6c. VECKANS SCHEMA (R2-DoD, tasks/resurs-masterplan.md) — bookings
  //     (assigned_user_id satta + en obemannad) + schedule_entry (internt +
  //     en frånvaro) för INNEVARANDE vecka, så resurstavlan
  //     (/dashboard/schema) demoar beläggnings-%, obemannat-spåret och en
  //     billig konflikt direkt. Läser bara AKTIVA business_users som
  //     faktiskt finns — se filhuvudets kommentar om varför extra
  //     teammedlemmar seedas separat (sql/demo_seed_flerpersons.sql), inte
  //     här.
  // ══════════════════════════════════════════════════════════
  const { data: teamRows, error: teamError } = await supabase
    .from('business_users')
    .select('id, name')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (teamError) {
    return failReset(`Kunde inte läsa demoteamet: ${teamError.message}`, 'team_read_failed')
  }
  const team = (teamRows || []) as { id: string; name: string }[]

  // Måndagen i INNEVARANDE vecka, relativt NU — resurstavlan öppnas alltid
  // på innevarande vecka vid inloggning, så veckans bokningar måste ligga
  // där oavsett vilken dag demot körs (samma "allt relativt NU"-princip
  // som resten av filen).
  const mondayThisWeek = (): Date => {
    const d = new Date()
    const dow = d.getDay() // 0=sön..6=lör
    const diffToMonday = dow === 0 ? -6 : 1 - dow
    d.setDate(d.getDate() + diffToMonday)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const weekDateTime = (dayOffset: number, hour: number, minute = 0): string => {
    const d = mondayThisWeek()
    d.setDate(d.getDate() + dayOffset)
    d.setHours(hour, minute, 0, 0)
    return d.toISOString()
  }

  type SeedBooking = {
    customerKey: string
    notes: string
    start: string
    end: string
    /** Index i team[] (modulo teamets storlek) — null = medvetet obemannad. */
    memberIdx: number | null
    projectId?: string | null
    kind?: 'standard' | 'service' | 'offer' | 'emergency'
  }
  const bookingSeeds: SeedBooking[] = [
    { customerKey: 'anna', notes: 'Badrumsrenovering – dag 5', start: weekDateTime(0, 8), end: weekDateTime(0, 16), memberIdx: 0, projectId: annaProject.project_id },
    { customerKey: 'fastighets', notes: 'Eldragning garage', start: weekDateTime(1, 8), end: weekDateTime(1, 15), memberIdx: 1 },
    // Onsdag: samma person (memberIdx 2) som interndagen nedan → medveten,
    // billig konflikt (09–14 offertbesök krockar med 08–10 "Hämta material")
    // så konflikt-flaggningen (lib/schedule/person-day.ts flagConflicts)
    // har något att visa i demot utan extra kod.
    { customerKey: 'brf', notes: 'Offertbesök – takläckage', start: weekDateTime(2, 9), end: weekDateTime(2, 14), memberIdx: 2, kind: 'offer' },
    // Medvetet obemannad — demoar "obemannat"-spåret på resurstavlan.
    { customerKey: 'mikael', notes: 'Altanbygge – grundläggning', start: weekDateTime(3, 8), end: weekDateTime(3, 16), memberIdx: null },
    { customerKey: 'johan', notes: 'Fönsterbyte – mätbesök', start: weekDateTime(4, 8), end: weekDateTime(4, 12), memberIdx: 0, kind: 'offer' },
  ]

  let bookingsCreated = 0
  for (const b of bookingSeeds) {
    const assignedMember = b.memberIdx !== null && team.length > 0 ? team[b.memberIdx % team.length] : null
    const { error: bookErr } = await supabase.from('booking').insert({
      booking_id: genId('book'),
      business_id: businessId,
      customer_id: customers[b.customerKey].customer_id,
      scheduled_start: b.start,
      scheduled_end: b.end,
      status: 'confirmed',
      notes: b.notes,
      assigned_user_id: assignedMember?.id ?? null,
      assigned_to: assignedMember?.name ?? null,
      project_id: b.projectId ?? null,
      kind: b.kind || 'standard',
      created_at: new Date().toISOString(),
    })
    if (bookErr) return failReset(`Kunde inte skapa demobokning: ${bookErr.message}`, 'booking_insert_failed')
    bookingsCreated++
  }

  let scheduleEntriesCreated = 0
  if (team.length > 0) {
    // Samma person som onsdagens offertbesök (memberIdx 2 ovan) — se den
    // medvetna konflikt-kommentaren där.
    const internalMember = team[2 % team.length]
    const { error: internalErr } = await supabase.from('schedule_entry').insert({
      id: genId('sce'),
      business_id: businessId,
      business_user_id: internalMember.id,
      project_id: null,
      title: 'Hämta material — Bygghandeln',
      start_datetime: weekDateTime(2, 8),
      end_datetime: weekDateTime(2, 10),
      all_day: false,
      type: 'internal',
      status: 'scheduled',
    })
    if (internalErr) return failReset(`Kunde inte skapa intern schemarad: ${internalErr.message}`, 'schedule_entry_insert_failed')
    scheduleEntriesCreated++
  }
  if (team.length > 1) {
    // En frånvaro (heldag, torsdag) — annan person än onsdagens konflikt,
    // så de två demo-poängen (konflikt / frånvaro) syns på olika personer.
    const absentMember = team[1 % team.length]
    const { error: absenceErr } = await supabase.from('schedule_entry').insert({
      id: genId('sce'),
      business_id: businessId,
      business_user_id: absentMember.id,
      project_id: null,
      title: 'Semester',
      start_datetime: weekDateTime(3, 0, 0),
      end_datetime: weekDateTime(3, 23, 59),
      all_day: true,
      type: 'time_off',
      status: 'scheduled',
    })
    if (absenceErr) return failReset(`Kunde inte skapa frånvarorad: ${absenceErr.message}`, 'schedule_entry_insert_failed')
    scheduleEntriesCreated++
  }

  // ══════════════════════════════════════════════════════════
  // 7. FAKTUROR (3 st): betald, skickad ej förfallen, förfallen 8 dagar
  // ══════════════════════════════════════════════════════════
  type SeedInvoiceItem = { id: string; item_type: string; description: string; quantity: number; unit: string; unit_price: number; total: number; type: string; is_rot_eligible: boolean; is_rut_eligible: boolean; sort_order: number }

  const invoiceItem = (description: string, total: number, type: 'labor' | 'material', rot: boolean, idx: number): SeedInvoiceItem => {
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
  if (fastighetsInvErr || !fastighetsInvoice) return failReset(`Kunde inte skapa faktura (Fastighets): ${fastighetsInvErr?.message}`, 'invoice_insert_failed')

  // 7b. Skickad, ej förfallen — Johan Ek, äldre jobb med ROT
  const johanInvItems = [invoiceItem('Byte av 4 element', 9600, 'labor', true, 0)]
  const johanSubtotal = 9600
  const johanVat = johanSubtotal * 0.25
  const johanTotal = johanSubtotal + johanVat
  const johanRotDeduction = rotRutDeductionInclVat('rot', johanSubtotal, { vatRate: 25 })
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
  if (johanInvErr || !johanInvoice) return failReset(`Kunde inte skapa faktura (Johan): ${johanInvErr?.message}`, 'invoice_insert_failed')

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
  if (kristinaInvErr || !kristinaInvoice) return failReset(`Kunde inte skapa faktura (Kristina): ${kristinaInvErr?.message}`, 'invoice_insert_failed')

  // ══════════════════════════════════════════════════════════
  // 8. PENDING_APPROVALS (5 st) — payload-strukturen kopierad EXAKT från
  //    lib/autopilot/quote-nudge.ts (Daniel), app/api/cron/send-reminders
  //    (Karin), executeApprovalPayload's generiska 'send_sms'-case (Lisa),
  //    se app/api/approvals/[id]/route.ts, samt lib/egenkontroll/
  //    analyze-and-queue.ts (Lars) för de två egenkontroll-korten (8d/8e)
  //    — så Etapp 1's DoD-punkt "demobar på demokontot med seedade foton"
  //    är uppfylld utan att en live Anthropic-analys behöver köras under
  //    demot. photo_ref pekar INTE på en riktig Supabase Storage-fil —
  //    varken ProjectApprovalsBlock.tsx eller IdagCore.tsx hämtar en
  //    bild-URL från payload, de visar bara title/description som text
  //    (verifierat: getPreview() läser bara payload.message/sms_text, och
  //    executeApprovalPayload's 'egenkontroll_foto'-case skriver bara in
  //    photo_ref som en textsträng i checklistans notes-fält).
  // ══════════════════════════════════════════════════════════
  const daysOverdue = 8
  const reminderFee = 60
  const penaltyInterest = 8
  const interestAmount = Math.round((kristinaTotal * (penaltyInterest / 100) * daysOverdue) / 365)
  const invoiceReminderApprovalId = genId('appr')
  const ataMissedApprovalId = genId('appr')
  const materialMissedApprovalId = genId('appr')
  const profitabilityWarningApprovalId = genId('appr')

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
      id: invoiceReminderApprovalId,
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
    // Lars — egenkontroll: foto styrker en öppen punkt (kopierar
    // förslag-grenen av lib/egenkontroll/analyze-and-queue.ts:254-271
    // EXAKT — title/description-formlerna med forslag.length=1 gäller
    // ordagrant). Godkänn bockar av 'Verifiera fall mot brunn' på
    // badrum-checklistan (executeApprovalPayload's 'egenkontroll_foto'-case).
    {
      id: genId('appr'),
      business_id: businessId,
      approval_type: 'egenkontroll_foto',
      title: 'Foto styrker 1 egenkontrollpunkt — markera som klara?',
      description: `Punkter: ${checklistItemFallMotBrunn.text}`,
      status: 'pending',
      risk_level: 'low',
      payload: {
        routed_agent: 'lars',
        project_id: annaProject.project_id,
        checklist_id: badrumChecklistId,
        photo_ref: genId('doc'),
        forslag: [
          {
            punkt_id: checklistItemFallMotBrunn.id,
            text: checklistItemFallMotBrunn.text,
            motivering: 'Fotot visar tydligt att fallet mot golvbrunnen är korrekt utfört enligt punkten.',
          },
        ],
        uploaded_by: null,
      },
      created_at: isoAt(0, 9, 20),
      expires_at: isoAt(7),
    },
    // Lars — egenkontroll: foto motsäger en öppen punkt (kopierar
    // avvikelse-grenen av lib/egenkontroll/analyze-and-queue.ts:286-304
    // EXAKT). Godkänn kvitterar bara flaggan (ingen mutation, se
    // executeApprovalPayload's 'egenkontroll_avvikelse'-case).
    {
      id: genId('appr'),
      business_id: businessId,
      approval_type: 'egenkontroll_avvikelse',
      title: `Lars flaggade: ${checklistItemGenomforing.text} ser inte klar ut på fotot`,
      description: 'Fotot visar att skarven vid genomföringen inte är tätad.',
      status: 'pending',
      risk_level: 'low',
      payload: {
        routed_agent: 'lars',
        project_id: annaProject.project_id,
        checklist_id: badrumChecklistId,
        photo_ref: genId('doc'),
        punkt_id: checklistItemGenomforing.id,
        motivering: 'Fotot visar att skarven vid genomföringen inte är tätad.',
      },
      created_at: isoAt(0, 9, 35),
      expires_at: isoAt(7),
    },
    // ═══ Storyläget (2026-08-08) — värdefynden som bär säljdemon ═══
    //
    // Momentlagret (lib/moments/derive.ts) härleder sina kort ur precis de
    // här raderna, genom SAMMA väg som produktion. Payloadformerna kopierar
    // producenterna EXAKT: missad_intakt speglar cron/missed-revenue
    // (inkl. dedupe_key — annars dubblerar nästa nattsvep korten), och
    // profitability_warning speglar lib/profitability.ts.
    //
    // Beloppen är valda för demons dramaturgi men KONSISTENTA med den
    // seedade världen: ÄTA:n hör till annas aktiva badrumsprojekt,
    // materialet till kristinas avslutade kranbyte.
    {
      id: ataMissedApprovalId,
      business_id: businessId,
      approval_type: 'missad_intakt',
      routing_role: 'owner_admin',
      title: 'Signerad ÄTA ej fakturerad — 8 900 kr',
      description: 'Badrumsrenovering – Björkvägen 14 — Extra tätskikt vid dusch, signerad för 12 dagar sedan',
      status: 'pending',
      risk_level: 'low',
      payload: {
        routed_agent: 'karin',
        kind: 'ata_ej_fakturerad',
        project_id: annaProject.project_id,
        project_name: 'Badrumsrenovering – Björkvägen 14',
        amount_kr: 8900,
        evidence: 'Extra tätskikt vid dusch — signerad ÄTA utan faktura',
        dedupe_key: `ata:${genId('chg')}`,
      },
      created_at: isoAt(0, 6, 40),
      expires_at: isoAt(14),
    },
    {
      id: materialMissedApprovalId,
      business_id: businessId,
      approval_type: 'missad_intakt',
      routing_role: 'owner_admin',
      title: 'Ofakturerat material på avslutat projekt — 2 400 kr',
      description: 'Byte av kökskran och packningar — projektet är klart men materialet är inte fakturerat',
      status: 'pending',
      risk_level: 'low',
      payload: {
        routed_agent: 'karin',
        kind: 'material_ej_fakturerat',
        project_id: kristinaProject.project_id,
        project_name: 'Byte av kökskran och packningar',
        amount_kr: 2400,
        evidence: 'Blandare och packningar registrerade men aldrig fakturerade',
        dedupe_key: `material:${kristinaProject.project_id}`,
      },
      created_at: isoAt(0, 6, 41),
      expires_at: isoAt(14),
    },
    {
      id: profitabilityWarningApprovalId,
      business_id: businessId,
      approval_type: 'profitability_warning',
      title: 'Badrumsrenoveringen är på väg att spräcka kalkylen',
      description: 'Materialkostnaden ligger över kalkyl utan registrerad ÄTA — prognosen pekar på 9 250 kr överdrag.',
      status: 'pending',
      risk_level: 'medium',
      payload: {
        agent_id: 'karin',
        project_id: annaProject.project_id,
        project_name: 'Badrumsrenovering – Björkvägen 14',
        cost_percent: 82,
        margin_percent: 9,
        projected_overrun: 9250,
        status: 'at_risk',
      },
      created_at: isoAt(0, 6, 50),
      expires_at: isoAt(7),
    },
  ]

  const { error: approvalsErr } = await supabase.from('pending_approvals').insert(approvalSeeds)
  if (approvalsErr) return failReset(`Kunde inte skapa godkännanden: ${approvalsErr.message}`, 'approvals_insert_failed')

  // ══════════════════════════════════════════════════════════
  // 8b. OBSERVATIONER (business_knowledge) — teamets "berättar"-röst.
  //     Härleds till insikter i Matte-panelen och närvarobandet. Inga
  //     belopp i strukturen (tabellen saknar värdekolumn) — summorna får
  //     stå i texten, och momentlagret gör dem ALDRIG till kronor.
  // ══════════════════════════════════════════════════════════
  const { error: knowledgeErr } = await supabase.from('business_knowledge').insert([
    {
      business_id: businessId,
      agent_id: 'daniel',
      knowledge_type: 'insight',
      title: 'Två offerter har inte följts upp',
      observation: `Offerten till Mikael Svensson har stått obesvarad i över fem dagar. Historiskt vinner ni ungefär var fjärde sådan efter en påminnelse.`,
      suggestion: null,
      confidence: 0.8,
      status: 'active',
      created_at: isoAt(0, 6, 15),
    },
    {
      business_id: businessId,
      agent_id: 'lisa',
      knowledge_type: 'insight',
      title: 'Tre samtal fångade i natt',
      observation: 'Jag svarade på tre samtal utanför arbetstid — ett gällde en ny förfrågan om takläckage som ligger som lead.',
      suggestion: null,
      confidence: 0.9,
      status: 'active',
      created_at: isoAt(0, 5, 55),
    },
    {
      business_id: businessId,
      agent_id: 'lars',
      knowledge_type: 'anomaly',
      title: 'Materialuttag utan ÄTA på Björkvägen',
      observation: 'Materialkostnaden på badrumsrenoveringen ligger över kalkyl, men ingen ÄTA är registrerad för tillägget.',
      suggestion: 'Kolla om extraarbetet borde bli en ÄTA innan fakturan går.',
      confidence: 0.75,
      status: 'active',
      created_at: isoAt(0, 6, 5),
    },
  ])
  if (knowledgeErr) return failReset(`Kunde inte skapa observationer: ${knowledgeErr.message}`, 'business_knowledge_insert_failed')

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
    return failReset(`Kunde inte skapa agentkörningar: ${agentRunsErr.message}`, 'agent_runs_insert_failed')
  }

  // ── 10. Stabilt entity-manifest för Epic 5 ────────────────
  // Alla värden kommer från de inserts som precis lyckades. Inga belopp eller
  // seedantaganden lagras här — bara pekare till riktiga produktionsobjekt.
  const manifest = buildDemoManifest({
    businessId,
    staleQuoteId: quotes.mikael_quote.quote_id,
    marginProjectId: annaProject.project_id,
    overdueInvoiceId: kristinaInvoice.invoice_id,
    ataMissedApprovalId,
    materialMissedApprovalId,
    profitabilityWarningApprovalId,
    invoiceReminderApprovalId,
  })
  const { error: manifestError } = await supabase.from('business_preferences').upsert(
    {
      business_id: businessId,
      key: 'demo_manifest',
      value: JSON.stringify(manifest),
      source: 'user',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id,key' },
  )
  if (manifestError) {
    return failReset(`Kunde inte spara demomanifestet: ${manifestError.message}`, 'demo_manifest_upsert_failed')
  }

  const { error: auditFinishError } = await supabase
    .from('demo_reset_audit')
    .update({
      actor_user_id: actorUserId,
      finished_at: new Date().toISOString(),
      ok: true,
      error_text: null,
    })
    .eq('id', resetAuditId)
    .eq('business_id', businessId)
  if (auditFinishError) {
    console.error('[demo-reset] kunde inte avsluta success-auditen:', auditFinishError.message)
    return { error: 'Demon seedades men återställningen kunde inte auditloggas som klar.' }
  }

  return {
    customers: customerSeeds.length,
    deals: dealSeeds.length,
    quotes: quoteSeeds.length,
    invoices: 3,
    projects: 2,
    approvals: approvalSeeds.length,
    agentRuns: agentRunSeeds.length,
    bookings: bookingsCreated,
    scheduleEntries: scheduleEntriesCreated,
    manifest,
  }
  } catch (error: any) {
    console.error('[demo-reset] oväntat seedfel:', error)
    return failReset(
      error?.message ? `Kunde inte slutföra seedningen: ${error.message}` : 'Kunde inte slutföra seedningen.',
      'unexpected_seed_exception',
    )
  }
}

export { isError }
