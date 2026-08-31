import { getServerSupabase } from '@/lib/supabase'
import { getDefaultStandardTexts } from '@/lib/quote-standard-text-defaults'
import { getChecklistsForBranch } from '@/lib/checklist-defaults'
import { applyHourlyRateToDefaults, getDefaultProducts } from '@/lib/product-defaults'
import { getDefaultReservations } from '@/lib/reservation-defaults'
import { getDefaultQuoteTemplates, normalizeTemplateBranch } from '@/lib/quote-template-defaults'
import { getDefaultAgreementTypes } from '@/lib/agreement-type-defaults'
import { ensureDefaultStages } from '@/lib/pipeline'

type SupabaseClient = ReturnType<typeof getServerSupabase>

/**
 * Seed all default data for a business.
 * Idempotent — uses conflict checks so it can be run multiple times safely.
 */
export async function seedAllDefaults(
  supabase: SupabaseClient,
  businessId: string,
  branch: string,
  /**
   * Ytterligare branscher (v93). Bee arbetar både som elektriker och med bygg.
   *
   * Bara SORTIMENTEN slås ihop — artiklar och prislista, där en halv bank för
   * ett helt jobb är ett verkligt problem. Mallar, checklistor, standardtexter
   * och avtalstyper följer huvudbranschen: två uppsättningar offertmallar
   * eller dubbla checklistor gör valet svårare, inte lättare, och det är ett
   * val hantverkaren gör per jobb ändå.
   */
  secondaryBranches: string[] = [],
  /** UX1f (Prisslingan V2): hantverkarens timpris från onboardingen —
      läggs på seedade timartiklar (applyHourlyRateToDefaults). */
  hourlyRate: number | null = null
) {
  const productBranches = [branch, ...secondaryBranches.filter(b => b && b !== branch)]

  const results = await Promise.allSettled([
    // OBS: legacy seedAutomationRules (automation_rules/automation_queue) är
    // borttaget — det systemet är inert (ingen incheckad konsument: ingen
    // pg_cron, inget i appen enqueue:ar, edge-funktionen scheduled-triggers är
    // oschemalagd). v3_automation_rules nedan är den levande motorn.
    seedV3AutomationRules(supabase, businessId),
    seedLeadScoringRules(supabase, businessId),
    seedPipelineStages(supabase, businessId),
    seedQuoteStandardTexts(supabase, businessId, branch),
    seedChecklistTemplates(supabase, businessId, branch),
    seedProducts(supabase, businessId, productBranches, hourlyRate),
    // UX5: ALLA branscher (inte bara huvud-) — el+bygg får båda urvalen.
    seedReservations(supabase, businessId, productBranches),
    seedQuoteTemplates(supabase, businessId, branch),
    seedAgreementTypes(supabase, businessId, branch),
  ])

  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length > 0) {
    console.error(`[seedAllDefaults] ${failed.length} seed operations failed:`,
      failed.map(r => (r as PromiseRejectedResult).reason))
  }

  return { total: results.length, succeeded: results.length - failed.length, failed: failed.length }
}

/**
 * Seedar default-regler i v3_automation_rules — den LEVANDE automationsmotorn
 * (fireEvent + evaluate-thresholds-cron). Utan dessa får nya företag noll
 * automationer. Posture: snabbsvar mot kund auto-skickas; allt som rör pengar
 * (fakturapåminnelse) kräver godkännande. Alla respekterar arbetstider/nattläge.
 */
async function seedV3AutomationRules(supabase: SupabaseClient, businessId: string) {
  const { data: existing } = await supabase
    .from('v3_automation_rules')
    .select('id')
    .eq('business_id', businessId)
    .eq('is_system', true)
    .limit(1)

  if (existing && existing.length > 0) return

  const rules: Array<{
    name: string
    description: string
    trigger_type: string
    trigger_config: Record<string, unknown>
    action_type: string
    action_config: Record<string, unknown>
    requires_approval: boolean
  }> = [
    {
      name: 'Snabbsvar på ny lead',
      description: 'Skickar ett tack-SMS direkt när en ny förfrågan kommer in.',
      trigger_type: 'event',
      trigger_config: { event_name: 'lead_received' },
      action_type: 'send_sms',
      action_config: { template: 'Hej {{customer_name}}! Tack för din förfrågan till {{business_name}}. Vi återkommer så snart vi kan.' },
      requires_approval: false,
    },
    {
      name: 'Svar på missat samtal',
      description: 'SMS:ar tillbaka automatiskt när ett samtal missas.',
      trigger_type: 'event',
      trigger_config: { event_name: 'call_missed' },
      action_type: 'send_sms',
      action_config: { template: 'Hej! Vi missade tyvärr ditt samtal till {{business_name}}. Svara på detta SMS med vad du behöver hjälp med, så återkommer vi direkt — eller ringer upp så snart vi kan.' },
      requires_approval: false,
    },
    {
      name: 'Följ upp skickad offert',
      description: 'Skapar en uppföljningspåminnelse 3 dagar efter att en offert skickats.',
      trigger_type: 'event',
      trigger_config: { event_name: 'quote_sent' },
      action_type: 'schedule_followup',
      action_config: { days_until: 3, description: 'Följ upp skickad offert' },
      requires_approval: false,
    },
    {
      name: 'Kund öppnade offert',
      description: 'Notifierar dig när en kund öppnar sin offert — bra läge att höra av sig.',
      trigger_type: 'event',
      trigger_config: { event_name: 'quote_opened' },
      action_type: 'notify_owner',
      action_config: { title: 'Kund tittar på offerten', body: 'En kund har precis öppnat sin offert. Passa på att höra av dig medan den är aktuell.' },
      requires_approval: false,
    },
    {
      // "Faktura eskalering dag 7" — kanonisk 7-dagarsregel (matchar
      // sql/v3_seed_rules.sql). Ersatte tidigare "Påminn om förfallen
      // faktura" (v85, dashboard-städpaketet del B): två regler seedade
      // samma 7-dagarströskel via olika vägar (denna fil vs v3_seed_rules.sql
      // körd manuellt), vilket gav hantverkaren två godkännandekort för
      // samma faktura. create_approval (inte send_sms) så titel/beskrivning
      // interpoleras med {{invoice_number}}/{{customer_name}} av
      // handleCreateApproval (lib/automation-engine.ts).
      name: 'Faktura eskalering dag 7',
      description: 'Striktare påminnelse efter 7 dagar — kräver godkännande',
      trigger_type: 'threshold',
      trigger_config: { entity: 'invoice', field: 'days_overdue', operator: '>=', value: 7 },
      action_type: 'create_approval',
      action_config: { title: 'Faktura {{invoice_number}} — obetald 7+ dagar', description: 'Fakturan till {{customer_name}} har varit obetald i minst 7 dagar. Godkänn för att skicka formell påminnelse.' },
      requires_approval: true,
    },
    {
      name: 'Be om recension efter avslutat jobb',
      description: 'Skapar en påminnelse att be kunden om ett omdöme dagen efter att ett jobb avslutats.',
      trigger_type: 'event',
      trigger_config: { event_name: 'job_completed' },
      action_type: 'schedule_followup',
      action_config: { days_until: 1, description: 'Be kunden om en recension' },
      requires_approval: false,
    },
  ]

  await supabase.from('v3_automation_rules').insert(
    rules.map((r, i) => ({
      id: `v3r_${businessId}_${i}`,
      business_id: businessId,
      name: r.name,
      description: r.description,
      is_active: true,
      is_system: true,
      trigger_type: r.trigger_type,
      trigger_config: r.trigger_config,
      action_type: r.action_type,
      action_config: r.action_config,
      requires_approval: r.requires_approval,
      respects_work_hours: true,
      respects_night_mode: true,
    }))
  )
}

async function seedLeadScoringRules(supabase: SupabaseClient, businessId: string) {
  const { data: existing } = await supabase
    .from('lead_scoring_rules')
    // PK heter `rule_id` (sql/leads_pipeline.sql:112). Med `id` gav frågan
    // 42703, data blev null, och kontrollen "finns redan regler?" svarade
    // alltid nej — seed-RPC:n kördes om vid varje anrop.
    .select('rule_id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.rpc('seed_lead_scoring_rules', { p_business_id: businessId })
}

/**
 * OBS — två separata stage-system samexisterar (avsiktligt, olika syften):
 *   • `pipeline_stage` (SINGULAR) = Kanban-deals-boarden. Seedas här.
 *   • `pipeline_stages` (PLURAL) = V4 lead-pipeline (lib/pipeline-stages.ts),
 *     self-seedar lazy vid första läsning — seedas alltså INTE här.
 * Förväxla inte tabellerna när du skriver queries.
 */
async function seedPipelineStages(_supabase: SupabaseClient, businessId: string) {
  // Avvikelse #35 (2026-08-28): den här funktionen skrev en gammal form
  // (name/position/color, ingen slug) — `position` finns inte i
  // pipeline_stage, insertet föll tyst i Promise.allSettled och nya konton
  // fick INGA steg. Golden Path frågar efter slug 'new_inquiry' → null →
  // ingen affär för någon lead. En seeder: lib/pipeline.ts ensureDefaultStages
  // (DEFAULT_STAGES med slug + sort_order), samma som /api/pipeline redan
  // använder lazy. Idempotent.
  void _supabase
  await ensureDefaultStages(businessId)
}

async function seedQuoteStandardTexts(supabase: SupabaseClient, businessId: string, branch: string) {
  const { data: existing } = await supabase
    .from('quote_standard_texts')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  const texts = getDefaultStandardTexts(branch)
  await supabase.from('quote_standard_texts').insert(
    texts.map((t, i) => ({
      id: `qst_${businessId}_${i}`,
      business_id: businessId,
      text_type: t.text_type,
      name: t.name,
      content: t.content,
      is_default: true,
    }))
  )
}

async function seedChecklistTemplates(supabase: SupabaseClient, businessId: string, branch: string) {
  const { data: existing } = await supabase
    .from('checklist_template')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  const templates = getChecklistsForBranch(branch)
  await supabase.from('checklist_template').insert(
    templates.map((t, i) => ({
      id: `ct_${businessId}_${i}`,
      business_id: businessId,
      name: t.name,
      category: t.category,
      items: t.items,
      is_default: true,
    }))
  )
}

/**
 * Seedar produktbanken (`products`) — den tabell offert-editorn, produktbanks-
 * UI:t och AI-offertgeneratorn faktiskt läser.
 *
 * Utan denna fick varje ny kund en TOM produktbank: AI:n satte unit_price 0 med
 * "PRIS SAKNAS", och telefonagenten (som läser price_list) svarade med andra
 * priser än offerten. Båda tabellerna genereras nu ur lib/product-defaults.ts.
 *
 * Idempotent — hoppar helt om businessen redan har produkter, så en kund som
 * hunnit lägga upp eget sortiment aldrig får seed-rader ovanpå.
 */
export async function seedProducts(supabase: SupabaseClient, businessId: string, branch: string | string[], hourlyRate?: number | null) {
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existing && existing.length > 0) return

  // UX1f: hantverkarens EGET timpris (onboarding steg 3) läggs på de
  // prissatta timartiklarna — statiska 550 kr motsade den enda prisuppgift
  // han lämnat. Prislösa rörs aldrig; se applyHourlyRateToDefaults.
  const products = applyHourlyRateToDefaults(getDefaultProducts(branch), hourlyRate)
  const { error } = await supabase.from('products').insert(
    products.map((p, i) => ({
      id: `prod_${businessId}_${i}`,
      business_id: businessId,
      name: p.name,
      description: p.description || null,
      sku: p.sku,
      unit: p.unit,
      category: p.category,
      sales_price: p.unit_price,
      // Inköpspris lämnas tomt — vi känner inte hantverkarens inköpsavtal, och
      // 0 skulle se ut som 100 % marginal i efterkalkylen.
      purchase_price: null,
      default_labor_share: p.labor_share,
      rot_eligible: p.deduction === 'rot',
      rut_eligible: p.deduction === 'rut',
      is_active: true,
      // Löpande arbete är det hantverkaren når oftast — snabbvalsknapparna i
      // offerten visar favoriter först.
      is_favorite: p.category === 'arbete' && p.unit === 'tim',
    }))
  )
  if (error) {
    console.error('[seedProducts] insert misslyckades:', businessId, error.message)
    throw error
  }
}

/**
 * Seedar reservationsbiblioteket (reservation_texts + reservation_triggers).
 *
 * Utan seed blir reservationsmotorn en tom yta ingen fyller — hantverkare
 * skriver aldrig egna förbehåll. Texterna är neutrala formuleringsmallar,
 * se lib/reservation-defaults.ts för hållningen.
 *
 * FAIL-SAFE mot att v91 inte körts: saknas tabellen loggas det och seeden
 * hoppas över, precis som seedAgreementTypes gör mot v74 — annars skulle ett
 * saknat schema blockera hela onboardingen.
 */
async function seedReservations(supabase: SupabaseClient, businessId: string, branch: string | string[]) {
  const { data: existing, error: existErr } = await supabase
    .from('reservation_texts')
    .select('id')
    .eq('business_id', businessId)
    .limit(1)

  if (existErr) {
    console.warn('[seedReservations] hoppar över (tabellen saknas?):', existErr.message)
    return
  }
  if (existing && existing.length > 0) return

  const defaults = getDefaultReservations(branch)
  if (defaults.length === 0) return

  const rows = defaults.map((r, i) => ({
    id: `res_${businessId}_${i}`,
    business_id: businessId,
    title: r.title,
    content: r.content,
    source: 'system',
    system_key: r.system_key,
    sort_order: i,
  }))

  const { error: insertErr } = await supabase.from('reservation_texts').insert(rows)
  if (insertErr) {
    console.error('[seedReservations] insert misslyckades:', businessId, insertErr.message)
    return
  }

  // Triggers refererar raden via samma index — id:na är deterministiska ovan.
  const triggerRows = defaults.flatMap((r, i) =>
    r.triggers.map((t, j) => ({
      id: `restrig_${businessId}_${i}_${j}`,
      business_id: businessId,
      reservation_id: `res_${businessId}_${i}`,
      trigger_type: t.type,
      category_slug: t.type === 'category' ? t.value : null,
      keyword: t.type === 'keyword' ? t.value.toLowerCase() : null,
    })),
  )

  if (triggerRows.length > 0) {
    const { error: trigErr } = await supabase.from('reservation_triggers').insert(triggerRows)
    if (trigErr) {
      console.error('[seedReservations] triggers misslyckades:', businessId, trigErr.message)
    }
  }
}

// B2 (Prisslingan V2, 2026-08-31): seedPriceList borttagen. Den kunde
// ALDRIG lyckas — price_list.id är INTEGER med sequence medan seeden
// skickade TEXT-id:n ('pl_...'), och insert-felet destrukturerades aldrig.
// Bevis i prod: price_list_id_seq.last_value var NULL — tabellen har aldrig
// haft en rad. Läsarna går nu mot products (lib/products/price-list-view.ts).

/**
 * Seedar mallbanken (quote_templates) — delar lib/quote-template-defaults.ts
 * med app/api/quote-templates/seed/route.ts (den manuella "Hämta färdiga
 * mallar"-CTA:n). Idempotent per mallnamn (inte bara "finns någon mall") så
 * att en business som redan sparat en egen mall ändå får branschmallarna.
 */
async function seedQuoteTemplates(supabase: SupabaseClient, businessId: string, branch: string) {
  const normalizedBranch = normalizeTemplateBranch(branch)

  const { data: existingRows } = await supabase
    .from('quote_templates')
    .select('name')
    .eq('business_id', businessId)

  const existingNames = new Set((existingRows || []).map((r: { name: string }) => r.name))
  const defaultTemplates = getDefaultQuoteTemplates(normalizedBranch).filter(t => !existingNames.has(t.name))

  if (defaultTemplates.length === 0) return

  const defaultTexts = getDefaultStandardTexts(normalizedBranch)
  const texts: Record<string, string> = {}
  for (const t of defaultTexts) texts[t.text_type] = t.content

  await supabase.from('quote_templates').insert(
    defaultTemplates.map((t, i) => ({
      id: `qtpl_${businessId}_${i}`,
      business_id: businessId,
      branch: normalizedBranch,
      name: t.name,
      description: t.description,
      category: t.category,
      // Inlednings-/avslutningstext seedas INTE längre (pilot-beslut 2026-07)
      // — redundanta mot quotes.description. getDefaultStandardTexts()
      // returnerar inte längre dessa typer, se lib/quote-standard-text-defaults.ts.
      not_included: texts.not_included || null,
      ata_terms: texts.ata_terms || null,
      payment_terms_text: texts.payment_terms || null,
      default_items: t.default_items,
      default_payment_plan: t.default_payment_plan,
      rot_enabled: t.rot_enabled,
      rut_enabled: t.rut_enabled,
    }))
  )
}

/**
 * Relationen (tabellen) saknas — v74_serviceavtal.sql har inte körts än i
 * Supabase SQL Editor (migrationer körs manuellt, se CLAUDE.md). Postgres
 * ger felkod 42P01, PostgREST kan även svara med "schema cache"-text.
 */
function isMissingRelationError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const message = String(error.message || '')
  return /does not exist|schema cache/i.test(message) && /relation|table|service_agreement_type/i.test(message)
}

/**
 * Seedar serviceavtalskatalogen (service_agreement_type) — delar
 * lib/agreement-type-defaults.ts. Idempotent per namn (samma mönster som
 * seedQuoteTemplates ovan). FAIL-SAFE mot v74 ej körd: om tabellen saknas
 * skippas tyst istället för att blockera resten av seedAllDefaults (som
 * körs via Promise.allSettled tillsammans med alla andra seed-steg).
 */
async function seedAgreementTypes(supabase: SupabaseClient, businessId: string, branch: string) {
  const normalizedBranch = normalizeTemplateBranch(branch)

  const { data: existingRows, error: selectErr } = await supabase
    .from('service_agreement_type')
    .select('name')
    .eq('business_id', businessId)

  if (selectErr) {
    if (isMissingRelationError(selectErr)) return
    throw selectErr
  }

  const existingNames = new Set((existingRows || []).map((r: { name: string }) => r.name))
  const defaultTypes = getDefaultAgreementTypes(normalizedBranch).filter(t => !existingNames.has(t.name))

  if (defaultTypes.length === 0) return

  const { error: insertErr } = await supabase.from('service_agreement_type').insert(
    defaultTypes.map((t, i) => ({
      type_id: `sat_${businessId}_${i}`,
      business_id: businessId,
      name: t.name,
      description: t.description,
      interval_months: t.interval_months,
      visit_duration_min: t.visit_duration_min,
      price_items: t.price_items,
      match_keys: t.match_keys,
      is_active: true,
      seeded: true,
    }))
  )
  if (insertErr && !isMissingRelationError(insertErr)) throw insertErr
}
