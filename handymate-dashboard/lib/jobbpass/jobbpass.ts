import type { SupabaseClient } from '@supabase/supabase-js'
import { signStorageUrl } from '@/lib/storage-signing'
import { listConfirmedInstallationsForProject, type InstallationRow } from '@/lib/installation/installation'
import { listWarrantiesForProject, customerWarrantiesFromRows, type WarrantyRow, type CustomerWarranty } from '@/lib/warranty/warranty-truth'

/**
 * Jobbpass V1 (Etapp Ä, Closeout-to-Lifetime, sql/v154_jobbpass.sql).
 *
 * När ett projekt avslutas kan ägaren publicera ett digitalt jobbpass till
 * kunden: en samlad, kundsäker vy över det som REDAN finns i databasen —
 * ingenting nytt räknas fram och ingenting kopieras. Idiomet är hämtat rakt
 * av från lib/projects/commercial-readiness.ts och lib/invoices/evidence-
 * manifest.ts: en REN derivationsfunktion (deriveJobbpassView) skild från
 * I/O-laddarna, fail-soft per källa ('error' aldrig en gissning), och en
 * uttömmande fält-ALLOWLIST som kundvyn byggs mot.
 *
 * ═══ DEN HÄRDA REGELN ═══
 *
 * deriveJobbpassView() PLOCKAR VARJE FÄLT EXPLICIT UR RÅDATAT — den
 * sprider (`...raw`) ALDRIG en rad rakt in i kundvyn. Det gör det
 * strukturellt omöjligt för ett internt fält (marginal, arbetskostnad,
 * inköpspris, personal- eller interna kommentarer) att nå kunden bara för
 * att någon lägger till en kolumn i en käll-tabell en dag — fältet måste
 * uttryckligen namnges HÄR för att synas, och läggs det till här utan att
 * också läggas till i JOBBPASS_ALLOWED_FIELDS fångar assertJobbpassShape()
 * det innan svaret ens byggs klart.
 *
 * Beskrivningen av VAD som är förbjudet hålls medvetet i PROSA i den här
 * filen, aldrig som exakta kolumnnamn — källskanningsfacit (tests/
 * jobbpass.spec.ts) letar efter just de mönstren i den HÄR filens text, och
 * skulle filen själv stava ut dem i en kommentar bleve skanningen menings-
 * lös (självreferens-fällan). Facit-filen får gärna stava ut dem, den skannas
 * aldrig sig själv.
 */

// ─────────────────────────────────────────────────────────────────
// Kundvyns typ + allowlist
// ─────────────────────────────────────────────────────────────────

export interface JobbpassScopeItem {
  description: string
  quantity: number | null
  unit: string | null
  unit_price: number | null
  total: number | null
  group_name: string | null
  item_type: string | null
}

export interface JobbpassChange {
  ata_number: number | null
  description: string
  total: number | null
  signed_at: string | null
}

export interface JobbpassWorkReport {
  title: string | null
  description: string | null
  work_performed: string | null
  materials_used: string | null
  signed_by: string | null
  signed_at: string | null
}

export interface JobbpassChecklistItem {
  text: string
  checked: boolean
}

export interface JobbpassChecklist {
  name: string
  items: JobbpassChecklistItem[]
}

export interface JobbpassPhoto {
  id: string
  url: string
  caption: string | null
}

export interface JobbpassInvoiceReference {
  invoice_number: string | null
  invoice_date: string | null
  total: number | null
}

/** En bekräftad installation — bara det kunden har nytta av. Intervallet bär alltid sin källa (grind 4). */
export interface JobbpassInstallation {
  name: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  placement: string | null
  installed_at: string | null
  service_interval_months: number | null
  service_interval_source: 'product_info' | 'craftsman' | null
  care_instructions: string | null
}

export interface JobbpassCustomerView {
  project: {
    project_id: string
    name: string
    completed_at: string | null
  }
  business: {
    name: string
    logo_url: string | null
    accent_color: string | null
    phone: string | null
    email: string | null
  }
  /** null = ingen accepterad offert att visa. Hellre missa än gissa. */
  scope: { title: string | null; description: string | null; items: JobbpassScopeItem[] } | null
  /** Bara godkända/signerade ÄTA. */
  changes: JobbpassChange[]
  /** null = ingen signerad fältrapport. */
  work_report: JobbpassWorkReport | null
  /** Bara checklistor med minst en avbockad punkt. */
  checklists: JobbpassChecklist[]
  /** Bara ägarens UTVALDA foton — se assemblePublishedPhotos. */
  photos: JobbpassPhoto[]
  /** null = inget skickat/betalt/förfallet underlag att peka på ännu. */
  invoice_reference: JobbpassInvoiceReference | null
  /** Bara status 'confirmed' (Fastighetspasset steg 2) — utkast når aldrig kunden. */
  installations: JobbpassInstallation[]
  /** Bara registrerade garantier med typ + garantigivare + källa (grind 3, v175). Aldrig en generisk text. */
  warranties: CustomerWarranty[]
  future_service: { consent: boolean }
  certificates_note: string
}

/**
 * Uttömmande karta över vilka fält varje sektion i kundvyn FÅR bära. Testad
 * av assertJobbpassShape (körs vid VARJE derivation, inte bara i facit) och
 * av tests/jobbpass.spec.ts (typnivå + körningsnivå).
 */
export const JOBBPASS_ALLOWED_FIELDS = {
  top: [
    'project', 'business', 'scope', 'changes', 'work_report', 'checklists',
    'photos', 'invoice_reference', 'installations', 'warranties', 'future_service', 'certificates_note',
  ],
  project: ['project_id', 'name', 'completed_at'],
  business: ['name', 'logo_url', 'accent_color', 'phone', 'email'],
  scope: ['title', 'description', 'items'],
  scope_item: ['description', 'quantity', 'unit', 'unit_price', 'total', 'group_name', 'item_type'],
  change: ['ata_number', 'description', 'total', 'signed_at'],
  work_report: ['title', 'description', 'work_performed', 'materials_used', 'signed_by', 'signed_at'],
  checklist: ['name', 'items'],
  checklist_item: ['text', 'checked'],
  photo: ['id', 'url', 'caption'],
  invoice_reference: ['invoice_number', 'invoice_date', 'total'],
  installation: ['name', 'manufacturer', 'model', 'serial_number', 'placement', 'installed_at', 'service_interval_months', 'service_interval_source', 'care_instructions'],
  warranty_item: ['title', 'kind', 'kind_label', 'issuer', 'source_label', 'start_date', 'end_date', 'description', 'installation_id'],
  future_service: ['consent'],
} as const

function assertKeys(obj: Record<string, unknown> | null | undefined, allowed: readonly string[], where: string): void {
  if (!obj) return
  const extra = Object.keys(obj).filter(k => !(allowed as readonly string[]).includes(k))
  if (extra.length > 0) {
    throw new Error(`Jobbpass-allowlisten bruten i ${where}: ${extra.join(', ')}`)
  }
}

/** Körs vid varje derivation — inte bara ett testverktyg. Kastar om ett fält
    utanför JOBBPASS_ALLOWED_FIELDS smugit sig in i kundvyn. */
export function assertJobbpassShape(view: JobbpassCustomerView): JobbpassCustomerView {
  assertKeys(view as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.top, 'toppnivå')
  assertKeys(view.project as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.project, 'project')
  assertKeys(view.business as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.business, 'business')
  for (const inst of view.installations || []) assertKeys(inst as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.installation, 'installation')
  for (const w of view.warranties || []) assertKeys(w as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.warranty_item, 'warranty_item')
  if (view.scope) {
    assertKeys(view.scope as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.scope, 'scope')
    for (const item of view.scope.items) {
      assertKeys(item as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.scope_item, 'scope.items[]')
    }
  }
  for (const change of view.changes) {
    assertKeys(change as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.change, 'changes[]')
  }
  if (view.work_report) {
    assertKeys(view.work_report as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.work_report, 'work_report')
  }
  for (const cl of view.checklists) {
    assertKeys(cl as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.checklist, 'checklists[]')
    for (const item of cl.items) {
      assertKeys(item as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.checklist_item, 'checklists[].items[]')
    }
  }
  for (const photo of view.photos) {
    assertKeys(photo as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.photo, 'photos[]')
  }
  if (view.invoice_reference) {
    assertKeys(view.invoice_reference as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.invoice_reference, 'invoice_reference')
  }
  assertKeys(view.future_service as unknown as Record<string, unknown>, JOBBPASS_ALLOWED_FIELDS.future_service, 'future_service')
  return view
}

// ─────────────────────────────────────────────────────────────────
// Källrader — smala, namngivna kolumnlistor. Se filhuvudet: allt som INTE
// står här kan aldrig läcka, för att det aldrig läses.
// ─────────────────────────────────────────────────────────────────

export interface JobbpassProjectRow {
  project_id: string
  name: string | null
  completed_at: string | null
  quote_id: string | null
  customer_id: string | null
}

export interface JobbpassBusinessRow {
  name: string | null
  logo_url: string | null
  accent_color: string | null
  phone: string | null
  email: string | null
}

export interface JobbpassQuoteRow {
  quote_id: string
  status: string | null
  title: string | null
  description: string | null
}

export interface JobbpassQuoteItemRow {
  id: string
  item_type: string | null
  group_name: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  unit_price: number | null
  total: number | null
  sort_order: number | null
  option_selected: boolean | null
  is_hidden: boolean | null
}

export interface JobbpassChangeRow {
  change_id: string
  ata_number: number | null
  description: string | null
  status: string | null
  signed_at: string | null
  total: number | null
  amount: number | null
}

export interface JobbpassFieldReportRow {
  id: string
  title: string | null
  description: string | null
  work_performed: string | null
  materials_used: string | null
  status: string | null
  signed_by: string | null
  signed_at: string | null
  created_at: string | null
}

export interface JobbpassChecklistItemRow {
  text: string
  checked: boolean
}

export interface JobbpassChecklistRow {
  id: string
  name: string | null
  status: string | null
  items: JobbpassChecklistItemRow[] | null
}

export interface JobbpassInvoiceRow {
  invoice_id: string
  invoice_number: string | null
  invoice_date: string | null
  total: number | null
  status: string | null
}

/** Redan begränsat till ägarens urval OCH redan signerat — se
    loadSelectedJobbpassPhotos + signStorageUrl i API-rutten. */
export interface JobbpassPhotoInput {
  id: string
  url: string
  caption: string | null
}

export interface JobbpassSourceInput {
  project: JobbpassProjectRow
  business: JobbpassBusinessRow | null
  quote: JobbpassQuoteRow | null | 'error'
  quoteItems: JobbpassQuoteItemRow[] | 'error'
  changes: JobbpassChangeRow[] | 'error'
  fieldReports: JobbpassFieldReportRow[] | 'error'
  checklists: JobbpassChecklistRow[] | 'error'
  invoices: JobbpassInvoiceRow[] | 'error'
  photos: JobbpassPhotoInput[]
  serviceConsent: boolean
  /** Bekräftade installationer (v174). Valfri — saknas tabellen eller failar frågan visas inget. */
  installations?: InstallationRow[] | 'error'
  /** Registrerade garantier (v175). Valfri — fel eller saknad tabell visar inget. */
  warranties?: WarrantyRow[] | 'error'
  /** Dagens datum (ISO) för giltighetsfiltret — injiceras i test. */
  today?: string
}

// ─────────────────────────────────────────────────────────────────
// Ren derivation — ingen I/O.
// ─────────────────────────────────────────────────────────────────

export const JOBBPASS_CERTIFICATES_NOTE = 'Kommer snart: certifikat.'

const ACCEPTED_QUOTE_STATUSES = new Set(['accepted', 'signed'])
const SENT_INVOICE_STATUSES = new Set(['sent', 'paid', 'overdue'])

function ataApproved(row: JobbpassChangeRow): boolean {
  if (row.status === 'declined') return false
  return Boolean(row.signed_at) || row.status === 'signed' || row.status === 'invoiced'
}

function formatSvenskDatum(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}


/**
 * Bygger kundvyn ur redan hämtade källrader. Ren funktion — samma indata
 * ger alltid samma utdata, inga sidoeffekter, inget klockberoende (allt
 * datumarbete sker på inkommande strängar). Testbar direkt utan Supabase.
 */
export function deriveJobbpassView(input: JobbpassSourceInput): JobbpassCustomerView {
  const project = {
    project_id: input.project.project_id,
    name: input.project.name?.trim() || 'Ditt projekt',
    completed_at: input.project.completed_at,
  }

  const business = {
    name: input.business?.name?.trim() || '',
    logo_url: input.business?.logo_url || null,
    accent_color: input.business?.accent_color || null,
    phone: input.business?.phone || null,
    email: input.business?.email || null,
  }

  let scope: JobbpassCustomerView['scope'] = null
  if (
    input.quote
    && input.quote !== 'error'
    && ACCEPTED_QUOTE_STATUSES.has(input.quote.status || '')
    && input.quoteItems !== 'error'
  ) {
    const items: JobbpassScopeItem[] = input.quoteItems
      .filter(it => it.is_hidden !== true)
      .filter(it => it.item_type !== 'option' || it.option_selected === true)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(it => ({
        description: it.description || '',
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        total: it.total,
        group_name: it.group_name,
        item_type: it.item_type,
      }))
    scope = { title: input.quote.title, description: input.quote.description, items }
  }

  const changes: JobbpassChange[] = input.changes === 'error'
    ? []
    : input.changes
        .filter(ataApproved)
        .map(c => ({
          ata_number: c.ata_number,
          description: c.description || '',
          total: c.total ?? c.amount ?? null,
          signed_at: c.signed_at,
        }))

  let work_report: JobbpassWorkReport | null = null
  if (input.fieldReports !== 'error') {
    const signed = input.fieldReports.filter(r => r.status === 'signed')
    const latest = [...signed].sort((a, b) => {
      const ad = Date.parse(a.signed_at || a.created_at || '') || 0
      const bd = Date.parse(b.signed_at || b.created_at || '') || 0
      return bd - ad
    })[0]
    if (latest) {
      work_report = {
        title: latest.title,
        description: latest.description,
        work_performed: latest.work_performed,
        materials_used: latest.materials_used,
        signed_by: latest.signed_by,
        signed_at: latest.signed_at,
      }
    }
  }

  const checklists: JobbpassChecklist[] = input.checklists === 'error'
    ? []
    : input.checklists
        .filter(cl => (cl.status === 'in_progress' || cl.status === 'completed') && Array.isArray(cl.items) && cl.items.length > 0)
        .filter(cl => (cl.items || []).some(it => it.checked === true))
        .map(cl => ({
          name: cl.name?.trim() || 'Checklista',
          items: (cl.items || []).map(it => ({ text: it.text, checked: it.checked })),
        }))

  const photos: JobbpassPhoto[] = input.photos.map(p => ({ id: p.id, url: p.url, caption: p.caption }))

  let invoice_reference: JobbpassInvoiceReference | null = null
  if (input.invoices !== 'error') {
    const eligible = input.invoices
      .filter(i => SENT_INVOICE_STATUSES.has(i.status || ''))
      .sort((a, b) => (Date.parse(b.invoice_date || '') || 0) - (Date.parse(a.invoice_date || '') || 0))
    const latest = eligible[0]
    if (latest) {
      invoice_reference = {
        invoice_number: latest.invoice_number,
        invoice_date: latest.invoice_date,
        total: latest.total,
      }
    }
  }

  const installations: JobbpassInstallation[] = (Array.isArray(input.installations) ? input.installations : [])
    .filter(r => r.status === 'confirmed')
    .map(r => ({
      name: r.name,
      manufacturer: r.manufacturer,
      model: r.model,
      serial_number: r.serial_number,
      placement: r.placement,
      installed_at: r.installed_at,
      service_interval_months: r.service_interval_months,
      service_interval_source: r.service_interval_source,
      care_instructions: r.care_instructions,
    }))

  const warranties = customerWarrantiesFromRows(Array.isArray(input.warranties) ? input.warranties : [], input.today ?? new Date().toISOString())

  const view: JobbpassCustomerView = {
    project,
    business,
    scope,
    changes,
    work_report,
    checklists,
    photos,
    invoice_reference,
    installations,
    warranties,
    future_service: { consent: input.serviceConsent },
    certificates_note: JOBBPASS_CERTIFICATES_NOTE,
  }

  return assertJobbpassShape(view)
}

// ─────────────────────────────────────────────────────────────────
// I/O — läsning av källdata. Smala .select()-listor, fail-soft per källa.
// ─────────────────────────────────────────────────────────────────

async function safeSelect<T>(
  run: () => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
): Promise<T[] | 'error'> {
  try {
    const { data, error } = await run()
    if (error) return 'error'
    return data || []
  } catch {
    return 'error'
  }
}

export type JobbpassSourceData = Omit<JobbpassSourceInput, 'photos' | 'serviceConsent'>

/**
 * Hämtar allt underlag utom foton och samtycke (de hör till jobbpass-raden,
 * inte till projektets källdata) och returnerar rådata — INTE kundvyn.
 * Anroparen kombinerar detta med signerade foton + samtycke och skickar
 * genom deriveJobbpassView(). `null` = projektet hittades inte (fel tenant
 * eller borttaget) — anroparen svarar 404, aldrig en tom vy.
 */
export async function loadJobbpassSourceData(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<JobbpassSourceData | null> {
  const { data: projectRow, error: projectError } = await supabase
    .from('project')
    .select('project_id, name, completed_at, quote_id, customer_id')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (projectError || !projectRow) return null
  const project = projectRow as JobbpassProjectRow

  let business: JobbpassBusinessRow | null = null
  try {
    // Se lib/business/quote-surface-select.ts: business_config läses brett
    // för att en enskild saknad kolumn i en smal lista inte ska 400a hela
    // frågan. Bara de namngivna fälten nedan lämnar den här funktionen —
    // resten av raden kastas bort direkt.
    const { data, error } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', businessId)
      .maybeSingle()
    if (!error && data) {
      const row = data as Record<string, unknown>
      business = {
        name: (row.business_name as string | null) ?? null,
        logo_url: (row.logo_url as string | null) ?? null,
        accent_color: (row.accent_color as string | null) ?? null,
        phone: (row.phone_number as string | null) ?? null,
        email: (row.contact_email as string | null) ?? null,
      }
    }
  } catch {
    business = null
  }

  let quote: JobbpassQuoteRow | null | 'error' = null
  if (project.quote_id) {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('quote_id, status, title, description')
        .eq('quote_id', project.quote_id)
        .eq('business_id', businessId)
        .maybeSingle()
      quote = error || !data ? 'error' : (data as JobbpassQuoteRow)
    } catch {
      quote = 'error'
    }
  }

  const quoteItems: JobbpassQuoteItemRow[] | 'error' = (!project.quote_id || quote === 'error' || quote === null)
    ? []
    : await safeSelect<JobbpassQuoteItemRow>(() =>
        supabase
          .from('quote_items')
          .select('id, item_type, group_name, description, quantity, unit, unit_price, total, sort_order, option_selected, is_hidden')
          .eq('quote_id', project.quote_id as string)
          .order('sort_order', { ascending: true }),
      )

  const changes = await safeSelect<JobbpassChangeRow>(() =>
    supabase
      .from('project_change')
      .select('change_id, ata_number, description, status, signed_at, total, amount')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  const fieldReports = await safeSelect<JobbpassFieldReportRow>(() =>
    supabase
      .from('field_reports')
      .select('id, title, description, work_performed, materials_used, status, signed_by, signed_at, created_at')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  const checklists = await safeSelect<JobbpassChecklistRow>(() =>
    supabase
      .from('project_checklist')
      .select('id, name, status, items')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  const invoices = await safeSelect<JobbpassInvoiceRow>(() =>
    supabase
      .from('invoice')
      .select('invoice_id, invoice_number, invoice_date, total, status')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  return { project, business, quote, quoteItems, changes, fieldReports, checklists, invoices }
}

export interface JobbpassCandidatePhotoRow {
  id: string
  file_path: string
  mime_type: string | null
  name: string | null
}

/**
 * Läser BARA de projektfoton ägaren faktiskt valt (`.in('id', selectedIds)`)
 * — obehandlade/övriga bilder når aldrig ens den här funktionens svar, långt
 * innan någon signering eller kundvy är inblandad. Tom lista in → tom lista
 * ut, ingen fråga skickas.
 */
export async function loadSelectedJobbpassPhotos(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
  selectedPhotoIds: string[],
): Promise<JobbpassCandidatePhotoRow[]> {
  if (!Array.isArray(selectedPhotoIds) || selectedPhotoIds.length === 0) return []
  const { data, error } = await supabase
    .from('project_document')
    .select('id, file_path, mime_type, name')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .in('id', selectedPhotoIds)
  if (error || !data) return []
  return (data as JobbpassCandidatePhotoRow[]).filter(row => (row.mime_type || '').startsWith('image/'))
}

// ─────────────────────────────────────────────────────────────────
// I/O — jobbpass-raden (urval, samtycke, publicering).
// ─────────────────────────────────────────────────────────────────

export interface JobbpassRow {
  id: string
  business_id: string
  project_id: string
  selected_photo_ids: string[]
  service_consent: boolean
  status: 'draft' | 'published'
  token: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export type JobbpassResult =
  | { ok: true; row: JobbpassRow; /** true bara vid FÖRSTA publiceringen — utskicket till kunden hänger på det. */ justPublished?: boolean }
  | { ok: false; error: string }

/** Deterministiskt id — jp_<project_id> — högst ETT jobbpass per projekt
    (samma invmf_<invoice_id>-idiom som lib/invoices/evidence-manifest.ts). */
export function jobbpassId(projectId: string): string {
  return `jp_${projectId}`
}

function normalizeJobbpassRow(row: Record<string, unknown>): JobbpassRow {
  return {
    id: row.id as string,
    business_id: row.business_id as string,
    project_id: row.project_id as string,
    selected_photo_ids: Array.isArray(row.selected_photo_ids) ? (row.selected_photo_ids as string[]) : [],
    service_consent: Boolean(row.service_consent),
    status: (row.status as 'draft' | 'published') || 'draft',
    token: (row.token as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/** Idempotent: skapar en draft-rad om ingen finns, annars returnerar den
    befintliga (draft ELLER published) oförändrad. NEVER THROWS. */
export async function getOrCreateDraftJobbpass(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<JobbpassResult> {
  const id = jobbpassId(projectId)
  try {
    const existing = await supabase
      .from('jobbpass')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle()
    if (existing.error) return { ok: false, error: existing.error.message }
    if (existing.data) return { ok: true, row: normalizeJobbpassRow(existing.data) }

    const now = new Date().toISOString()
    const inserted = await supabase
      .from('jobbpass')
      .insert({
        id,
        business_id: businessId,
        project_id: projectId,
        selected_photo_ids: [],
        service_consent: false,
        status: 'draft',
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .maybeSingle()

    if (inserted.error) {
      // Kapplöpning: två samtidiga öppningar av samma projekt. Unik-
      // constrainten på id vinner racet, försöket som förlorade läser bara
      // upp det som faktiskt skrevs.
      if (inserted.error.code === '23505') {
        const retry = await supabase.from('jobbpass').select('*').eq('id', id).eq('business_id', businessId).maybeSingle()
        if (!retry.error && retry.data) return { ok: true, row: normalizeJobbpassRow(retry.data) }
      }
      return { ok: false, error: inserted.error.message }
    }
    if (!inserted.data) return { ok: false, error: 'Jobbpasset kunde inte skapas' }
    return { ok: true, row: normalizeJobbpassRow(inserted.data) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Uppdaterar foturval och/eller samtycke. Bara de fält som skickas med
    ändras. NEVER THROWS. */
export async function setJobbpassSelection(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
  params: { selectedPhotoIds?: string[]; serviceConsent?: boolean },
): Promise<JobbpassResult> {
  const id = jobbpassId(projectId)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (Array.isArray(params.selectedPhotoIds)) patch.selected_photo_ids = params.selectedPhotoIds
  if (typeof params.serviceConsent === 'boolean') patch.service_consent = params.serviceConsent

  try {
    const { data, error } = await supabase
      .from('jobbpass')
      .update(patch)
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Jobbpasset hittades inte — öppna ytan igen innan du sparar' }
    return { ok: true, row: normalizeJobbpassRow(data) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Publicerar: sätter status/token/published_at. Idempotent — redan
    publicerad returneras oförändrad, token byts ALDRIG ut (en delad länk
    får aldrig sluta fungera bara för att ägaren öppnar ytan igen). */
export async function publishJobbpass(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<JobbpassResult> {
  const id = jobbpassId(projectId)
  try {
    const existing = await supabase.from('jobbpass').select('*').eq('id', id).eq('business_id', businessId).maybeSingle()
    if (existing.error) return { ok: false, error: existing.error.message }
    if (!existing.data) return { ok: false, error: 'Jobbpasset hittades inte — öppna ytan innan publicering' }
    const current = normalizeJobbpassRow(existing.data)
    if (current.status === 'published') return { ok: true, row: current, justPublished: false }

    const now = new Date().toISOString()
    const token = crypto.randomUUID()
    const { data, error } = await supabase
      .from('jobbpass')
      .update({ status: 'published', token, published_at: now, updated_at: now })
      .eq('id', id)
      .eq('business_id', businessId)
      .select('*')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Publiceringen misslyckades' }
    return { ok: true, row: normalizeJobbpassRow(data), justPublished: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Publik uppslagning via token. Svarar BARA för status='published' —
    en draft-rad (även om token av misstag skulle finnas) är aldrig synlig
    här. `null` → anroparen svarar 404. */
export async function getPublishedJobbpassByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<JobbpassRow | null> {
  if (!token) return null
  try {
    const { data, error } = await supabase
      .from('jobbpass')
      .select('*')
      .eq('token', token)
      .eq('status', 'published')
      .maybeSingle()
    if (error || !data) return null
    return normalizeJobbpassRow(data)
  } catch {
    return null
  }
}

/**
 * Hanna-kopplingen. Läsfunktion för BEFINTLIGA eftermarknadsflöden
 * (recensionsförfrågan, rekommendationslänk, en framtida schemalagd
 * service-påminnelse) att fråga "har kunden sagt ja till framtida
 * service?" innan de skickar något. INTE kopplad till någon cron eller
 * trigger i V1 — bara en läsbar sanning som ett senare schemalagt jobb kan
 * slå upp. `null` = inget jobbpass finns eller uppslaget misslyckades
 * (aldrig ett gissat true/false).
 */
export async function getJobbpassServiceConsent(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('jobbpass')
      .select('service_consent')
      .eq('id', jobbpassId(projectId))
      .eq('business_id', businessId)
      .maybeSingle()
    if (error || !data) return null
    return Boolean((data as Record<string, unknown>).service_consent)
  } catch {
    return null
  }
}

// ── Fastighetspasset steg 1 (2026-08-27): passet in i kundportalen ─────────

const PROJECT_FILES_BUCKET = 'project-files'

/**
 * Hela sammansättningen av kundvyn ur en jobbpass-rad: källdata, ägarens
 * utvalda foton (signerade, 1 h), derivation. EN väg för den publika sidan
 * (app/api/jobbpass/public/[token]) och portalen (app/api/portal/[token]/
 * jobbpass) — samma allowlist, samma kvittoprincip. null ⇒ 404 hos anroparen.
 */
export async function assembleJobbpassView(
  supabase: SupabaseClient,
  jobbpass: JobbpassRow,
): Promise<JobbpassCustomerView | null> {
  const sourceData = await loadJobbpassSourceData(supabase, jobbpass.business_id, jobbpass.project_id)
  if (!sourceData) return null
  const selectedRows = await loadSelectedJobbpassPhotos(
    supabase, jobbpass.business_id, jobbpass.project_id, jobbpass.selected_photo_ids,
  )
  const signedPhotos = (
    await Promise.all(
      selectedRows.map(async r => ({
        id: r.id,
        url: await signStorageUrl(supabase, PROJECT_FILES_BUCKET, r.file_path, 3600),
        caption: null as string | null,
      })),
    )
  ).filter((p): p is { id: string; url: string; caption: null } => !!p.url)
  const installations = await listConfirmedInstallationsForProject(supabase, jobbpass.business_id, jobbpass.project_id)
  const warranties = await listWarrantiesForProject(supabase, jobbpass.business_id, jobbpass.project_id)
  return deriveJobbpassView({ ...sourceData, photos: signedPhotos, serviceConsent: jobbpass.service_consent, installations, warranties })
}

export interface CustomerJobbpassEntry {
  row: JobbpassRow
  project_name: string
  completed_at: string | null
}

/**
 * Kundens publicerade jobbpass — jobbpass ⟗ project.customer_id, bara
 * status 'published'. Fel returneras (aldrig svalda) så portal-rutten kan
 * svara ärligt i stället för med en tom lista.
 */
export async function listPublishedJobbpassForCustomer(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
): Promise<{ entries: CustomerJobbpassEntry[]; error?: string }> {
  const { data: projects, error: projErr } = await supabase
    .from('project')
    .select('project_id, name, completed_at')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
  if (projErr) return { entries: [], error: projErr.message }
  const byId = new Map((projects || []).map(p => [p.project_id as string, p]))
  if (byId.size === 0) return { entries: [] }
  const { data: rows, error } = await supabase
    .from('jobbpass')
    .select('*')
    .eq('business_id', businessId)
    .eq('status', 'published')
    .in('project_id', Array.from(byId.keys()))
    .order('published_at', { ascending: false })
  if (error) return { entries: [], error: error.message }
  return {
    entries: (rows || []).map(r => {
      const row = normalizeJobbpassRow(r as Record<string, unknown>)
      const proj = byId.get(row.project_id)
      return { row, project_name: (proj?.name as string) || 'Projekt', completed_at: (proj?.completed_at as string | null) ?? null }
    }),
  }
}
