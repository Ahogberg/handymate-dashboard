/**
 * ProjectCommercialReadiness V1 (Etapp O, 2026-08-17) — Evidence-to-Payment
 * readiness slice.
 *
 * Council-sanktionerat (docs/council/PRIORITY_PROPOSAL_CODEX.md, Rank 3
 * "Evidence-to-invoice readiness"). Vaktposternas ord, citerade ordagrant
 * eftersom de är bindande för hela den här filen:
 *
 *   "an evidence reference contract indexes existing photos, reports,
 *    messages, signatures, time and materials without copying blobs"
 *   "invoice-readiness rules are deterministic and explainable"
 *   "missing evidence creates a warning or review action, not an
 *    autonomous block, during the first release"
 *
 * Det betyder konkret:
 *  - Det här är ett INDEX över BEFINTLIGA rader (project_change, quotes,
 *    invoice, time_entry, field_reports, project_checklist,
 *    supplier_invoices, project_material) — ingen blob-lagring, ingen ny
 *    sanning skapas.
 *  - Verdikten är REN och deterministisk (deriveProjectCommercialReadiness).
 *  - "blocked" är en SIGNAL till hantverkaren, inte en spärr som hindrar
 *    honom från att fakturera ändå — det här lagret agerar ALDRIG själv.
 *    Filen innehåller ENDAST läsande uppslag (select) — inga skrivande
 *    databasanrop av något slag.
 *
 * Samma disciplin som lib/value/revenue-recovery-case.ts: en trasig eller
 * omöjlig-att-verifiera referens gissas ALDRIG till "klart" — den blir
 * `ej_bedombar` och hamnar i truth_notes, aldrig i en tyst 100%.
 *
 * Löften EXKLUDERADE i V1: customer_facts av typen 'commitment' är
 * kundnivå utan projektlänk — att gissa länken skulle hitta på en
 * koppling som inte finns. V2 = v148 (project-referens på customer_fact).
 *
 * Item-nivå (offert-rad vs levererat) är EXPLICIT V2. 'tid'-slotten här
 * är bara pengarnivå: finns någon loggad tid alls på projektet.
 *
 * fakturaberedskap.tsx/RedoAttFakturera på projektsidan lämnas ORÖRDA i
 * V1 — det här är ett separat, Matte-vänt verktyg. En senare etapp kan
 * slå ihop dem (samma "är vi redo?"-fråga, olika käll-djup).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeEgenkontrollProgress, type EgenkontrollChecklistLike } from './fakturaberedskap'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export type ReadinessVerdict = 'ready' | 'blocked' | 'needs_review'

export type EvidenceSlotName =
  | 'omfattning'
  | 'ata'
  | 'tid'
  | 'material'
  | 'egenkontroll'
  | 'arbetsrapport'
  | 'avslut'
  | 'faktura'

export type EvidenceSlotStatus = 'styrkt' | 'saknas' | 'motsager' | 'ej_bedombar'

export interface EvidenceRef {
  table: string
  ref_id: string
}

export interface EvidenceSlot {
  slot: EvidenceSlotName
  status: EvidenceSlotStatus
  detail: string
  refs: EvidenceRef[]
}

export interface ProjectCommercialReadiness {
  project_id: string
  verdict: ReadinessVerdict
  slots: EvidenceSlot[]
  blockers: string[]
  truth_notes: string[]
}

// ─────────────────────────────────────────────────────────────────
// Input contract — raw rows, direct references only. `'error'` means
// "detta källuppslag misslyckades" (fail-soft, aldrig en krasch);
// `null` på quote betyder "projektet har ingen quote_id" (inte ett fel).
// Tomma listor är en GILTIG, verifierad avsaknad — skiljs alltid från
// `'error'`.
// ─────────────────────────────────────────────────────────────────

export interface ReadinessProjectRow {
  project_id: string
  status: string | null
  completed_at: string | null
  quote_id: string | null
  budget_amount: number | null
}

export interface ReadinessQuoteRow {
  quote_id: string
  status: string | null
}

export interface ReadinessChangeRow {
  change_id: string
  ata_number: number | null
  status: string | null
  sent_at: string | null
  signed_at: string | null
  declined_at: string | null
  amount: number | null
  total: number | null
}

export interface ReadinessTimeEntryRow {
  time_entry_id: string
}

export interface ReadinessSupplierInvoiceRow {
  id: string
  total_amount: number | null
}

export interface ReadinessProjectMaterialRow {
  material_id: string
  total_purchase: number | null
}

export interface ReadinessChecklistRow extends EgenkontrollChecklistLike {
  id: string
}

export interface ReadinessFieldReportRow {
  id: string
  status: string | null
}

export interface ReadinessInvoiceRow {
  invoice_id: string
  status: string | null
  total: number | null
}

export interface ProjectCommercialReadinessInput {
  project: ReadinessProjectRow
  quote: ReadinessQuoteRow | null | 'error'
  changes: ReadinessChangeRow[] | 'error'
  timeEntries: ReadinessTimeEntryRow[] | 'error'
  supplierInvoices: ReadinessSupplierInvoiceRow[] | 'error'
  projectMaterials: ReadinessProjectMaterialRow[] | 'error'
  checklists: ReadinessChecklistRow[] | 'error'
  fieldReports: ReadinessFieldReportRow[] | 'error'
  invoices: ReadinessInvoiceRow[] | 'error'
}

// ─────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────

const SLOT_ORDER: EvidenceSlotName[] = [
  'omfattning', 'ata', 'tid', 'material', 'egenkontroll', 'arbetsrapport', 'avslut', 'faktura',
]

const SLOT_LABELS: Record<EvidenceSlotName, string> = {
  omfattning: 'Omfattning',
  ata: 'ÄTA',
  tid: 'Tid',
  material: 'Material',
  egenkontroll: 'Egenkontroll',
  arbetsrapport: 'Arbetsrapport',
  avslut: 'Avslut',
  faktura: 'Faktura',
}

interface SlotDerivation {
  status: EvidenceSlotStatus
  detail: string
  refs: EvidenceRef[]
}

function d(status: EvidenceSlotStatus, detail: string, refs: EvidenceRef[] = []): SlotDerivation {
  return { status, detail, refs }
}

const ACCEPTED_QUOTE_STATUSES = new Set(['accepted', 'signed'])
const PENDING_ATA_STATUSES = new Set(['sent', 'draft'])

// ── omfattning ──────────────────────────────────────────────────

function deriveOmfattning(input: ProjectCommercialReadinessInput): SlotDerivation {
  const { project, quote } = input
  if (!project.quote_id) {
    return d('saknas', 'Ingen accepterad offert kopplad')
  }
  if (quote === 'error' || quote === null) {
    return d('ej_bedombar', 'Offertkopplingen kunde inte verifieras')
  }
  if (ACCEPTED_QUOTE_STATUSES.has(quote.status || '')) {
    return d('styrkt', 'Offert godkänd av kund', [{ table: 'quotes', ref_id: quote.quote_id }])
  }
  return d(
    'saknas',
    `Offerten är inte godkänd (status: ${quote.status || 'okänd'})`,
    [{ table: 'quotes', ref_id: quote.quote_id }],
  )
}

// ── ata ──────────────────────────────────────────────────────────

function deriveAta(input: ProjectCommercialReadinessInput): { derivation: SlotDerivation; extraNotes: string[] } {
  const { changes } = input
  if (changes === 'error') {
    return { derivation: d('ej_bedombar', 'ÄTA-listan kunde inte hämtas'), extraNotes: [] }
  }

  const declined = changes.filter(c => c.status === 'declined' || Boolean(c.declined_at))
  const extraNotes: string[] = []
  if (declined.length > 0) {
    extraNotes.push(
      `${declined.length} ÄTA avböjd${declined.length === 1 ? '' : 'a'} av kund (exkluderad${declined.length === 1 ? '' : 'e'} ur bedömningen)`,
    )
  }

  const pending = changes.filter(c => PENDING_ATA_STATUSES.has(c.status || ''))
  if (pending.length > 0) {
    const detail = pending.length === 1
      ? `ÄTA${pending[0].ata_number != null ? ' ' + pending[0].ata_number : ''} väntar på kundgodkännande`
      : `${pending.length} ÄTA väntar på kundgodkännande`
    return {
      derivation: d('saknas', detail, pending.map(c => ({ table: 'project_change', ref_id: c.change_id }))),
      extraNotes,
    }
  }

  const detail = changes.length === 0 ? 'Inga ÄTA registrerade' : 'Alla ÄTA godkända eller fakturerade'
  const refs = changes
    .filter(c => c.status !== 'declined' && !c.declined_at)
    .map(c => ({ table: 'project_change', ref_id: c.change_id }))
  return { derivation: d('styrkt', detail, refs), extraNotes }
}

// ── tid ──────────────────────────────────────────────────────────

function deriveTid(input: ProjectCommercialReadinessInput): SlotDerivation {
  const { timeEntries, project } = input
  if (timeEntries === 'error') {
    return d('ej_bedombar', 'Tidrapporteringen kunde inte hämtas')
  }
  if (timeEntries.length > 0) {
    return d(
      'styrkt',
      `${timeEntries.length} tidpost${timeEntries.length === 1 ? '' : 'er'} registrerade`,
      timeEntries.map(t => ({ table: 'time_entry', ref_id: t.time_entry_id })),
    )
  }
  const status = (project.status || '').toLowerCase()
  if (status === 'active' || status === 'completed') {
    return d('saknas', 'Ingen tid loggad på projektet')
  }
  return d('ej_bedombar', 'Projektet har inte startat — tid kan inte bedömas ännu')
}

// ── material ────────────────────────────────────────────────────

function deriveMaterial(input: ProjectCommercialReadinessInput): SlotDerivation {
  const { supplierInvoices, projectMaterials } = input
  if (supplierInvoices === 'error' || projectMaterials === 'error') {
    return d('ej_bedombar', 'Materialunderlaget kunde inte hämtas')
  }
  const refs: EvidenceRef[] = [
    ...supplierInvoices.map(s => ({ table: 'supplier_invoices', ref_id: s.id })),
    ...projectMaterials.map(m => ({ table: 'project_material', ref_id: m.material_id })),
  ]
  if (refs.length === 0) {
    // Aldrig gissa: tomt kan betyda "inget material behövs" ELLER
    // "material glömdes registrera". Vi vet inte vilket.
    return d('ej_bedombar', 'Inget material registrerat — okänt om projektet kräver material')
  }
  const totalKr = Math.round(
    supplierInvoices.reduce((s, x) => s + Number(x.total_amount || 0), 0)
    + projectMaterials.reduce((s, x) => s + Number(x.total_purchase || 0), 0),
  )
  return d('styrkt', `Material registrerat (${totalKr} kr inköpt)`, refs)
}

// ── egenkontroll ────────────────────────────────────────────────

function deriveEgenkontroll(input: ProjectCommercialReadinessInput): SlotDerivation {
  const { checklists } = input
  if (checklists === 'error') {
    return d('ej_bedombar', 'Checklistorna kunde inte hämtas')
  }
  const { done, total, aktiva } = computeEgenkontrollProgress(checklists)
  if (total === 0) {
    return d('ej_bedombar', 'Ingen aktiv eller klar egenkontroll med punkter')
  }
  const refs = aktiva.map(cl => ({ table: 'project_checklist', ref_id: cl.id }))
  if (done < total) {
    const kvar = total - done
    return d('saknas', `${kvar} egenkontrollpunkt${kvar === 1 ? '' : 'er'} kvar`, refs)
  }
  return d('styrkt', 'Egenkontroll avbockad', refs)
}

// ── arbetsrapport ───────────────────────────────────────────────

function deriveArbetsrapport(input: ProjectCommercialReadinessInput): SlotDerivation {
  const { fieldReports } = input
  if (fieldReports === 'error') {
    return d('ej_bedombar', 'Arbetsrapporter kunde inte hämtas')
  }
  if (fieldReports.length === 0) {
    // Rapporter är valfria — avsaknad blockerar ALDRIG (council-guardrail).
    return d('ej_bedombar', 'Ingen arbetsrapport skapad ännu — valfritt underlag')
  }
  const unsigned = fieldReports.filter(r => r.status !== 'signed')
  if (unsigned.length > 0) {
    return d('saknas', 'Arbetsrapport osignerad', unsigned.map(r => ({ table: 'field_reports', ref_id: r.id })))
  }
  return d('styrkt', 'Arbetsrapport signerad', fieldReports.map(r => ({ table: 'field_reports', ref_id: r.id })))
}

// ── avslut ──────────────────────────────────────────────────────

function deriveAvslut(input: ProjectCommercialReadinessInput): SlotDerivation {
  const { project } = input
  const completed = project.status === 'completed' || Boolean(project.completed_at)
  if (completed) {
    return d('styrkt', 'Projektet är avslutat', [{ table: 'project', ref_id: project.project_id }])
  }
  return d(
    'ej_bedombar',
    'Projektet pågår — beredskap kan ändå kontrolleras',
    [{ table: 'project', ref_id: project.project_id }],
  )
}

// ── faktura ─────────────────────────────────────────────────────

function ataSigneratKr(changes: ReadinessChangeRow[]): number {
  return changes.reduce((sum, c) => {
    const signed = Boolean(c.signed_at) || c.status === 'signed' || c.status === 'invoiced'
    if (!signed) return sum
    return sum + Math.abs(Number(c.total ?? c.amount ?? 0))
  }, 0)
}

function deriveFaktura(input: ProjectCommercialReadinessInput): SlotDerivation {
  const { invoices, project, changes } = input
  if (invoices === 'error') {
    return d('ej_bedombar', 'Fakturor kunde inte hämtas')
  }
  if (invoices.length === 0) {
    return d('styrkt', 'Inget fakturerat ännu')
  }
  const refs = invoices.map(i => ({ table: 'invoice', ref_id: i.invoice_id }))

  if (changes === 'error') {
    // Vi kan inte avgöra förväntad intäkt utan ÄTA-underlaget — gissa
    // aldrig om det som redan fakturerats täcker allt.
    return d(
      'ej_bedombar',
      'Faktura finns, men ÄTA-underlaget kunde inte hämtas — går inte avgöra om något är ofakturerat',
      refs,
    )
  }

  const forvantad = Number(project.budget_amount || 0) + ataSigneratKr(changes)
  const fakturerat = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const uninvoiced = forvantad - fakturerat

  if (uninvoiced > 0) {
    return d('motsager', `Faktura finns men ${Math.round(uninvoiced)} kr är fortfarande ofakturerat`, refs)
  }
  return d('styrkt', 'Redan fakturerad', refs)
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

/**
 * Härleder verdikten för ETT projekt. Ren funktion — ingen DB, ingen
 * sidoeffekt. Alla 8 slots finns alltid med i output, oavsett verdikt.
 */
export function deriveProjectCommercialReadiness(
  input: ProjectCommercialReadinessInput,
): ProjectCommercialReadiness {
  const ataResult = deriveAta(input)

  const derivations: Record<EvidenceSlotName, SlotDerivation> = {
    omfattning: deriveOmfattning(input),
    ata: ataResult.derivation,
    tid: deriveTid(input),
    material: deriveMaterial(input),
    egenkontroll: deriveEgenkontroll(input),
    arbetsrapport: deriveArbetsrapport(input),
    avslut: deriveAvslut(input),
    faktura: deriveFaktura(input),
  }

  const slots: EvidenceSlot[] = SLOT_ORDER.map(name => ({
    slot: name,
    ...derivations[name],
  }))

  const saknasSlots = slots.filter(s => s.status === 'saknas')
  const motsagerSlots = slots.filter(s => s.status === 'motsager')
  const ejBedombarSlots = slots.filter(s => s.status === 'ej_bedombar')

  // needs_review vinner alltid över blocked — en motsägelse kräver en
  // människa FÖRST, oavsett om det också saknas något annat.
  const verdict: ReadinessVerdict = motsagerSlots.length > 0
    ? 'needs_review'
    : saknasSlots.length > 0
      ? 'blocked'
      : 'ready'

  const blockers = saknasSlots.map(s => s.detail)
  const truth_notes = [
    ...motsagerSlots.map(s => `${SLOT_LABELS[s.slot]}: ${s.detail}`),
    ...ejBedombarSlots.map(s => `${SLOT_LABELS[s.slot]}: ${s.detail}`),
    ...ataResult.extraNotes,
  ]

  return Object.freeze({
    project_id: input.project.project_id,
    verdict,
    slots: Object.freeze(slots) as EvidenceSlot[],
    blockers,
    truth_notes,
  })
}

// ─────────────────────────────────────────────────────────────────
// Swedish summary — deterministisk formulering, ALDRIG bara en siffra.
// ─────────────────────────────────────────────────────────────────

export function byggReadinessSummering(readiness: ProjectCommercialReadiness): string {
  const notaBene = readiness.truth_notes.length > 0
    ? ` (${readiness.truth_notes.join(' ')})`
    : ''

  if (readiness.verdict === 'ready') {
    return `Redo att fakturera — alla bedömbara delar är styrkta.${notaBene}`
  }

  if (readiness.verdict === 'blocked') {
    return `Inte redo att fakturera. ${readiness.blockers.join(' ')}`.trim()
  }

  // needs_review
  const blockerPart = readiness.blockers.length > 0 ? ` ${readiness.blockers.join(' ')}` : ''
  const noteText = readiness.truth_notes.length > 0
    ? readiness.truth_notes.join(' ')
    : 'Något i underlaget motsäger sig själv.'
  return `Behöver en snabb koll innan fakturering. ${noteText}${blockerPart}`.trim()
}

// ─────────────────────────────────────────────────────────────────
// I/O — repository-style single-place loader. Läser BARA (select).
// Varje källa är fail-soft var för sig: ett trasigt uppslag degraderar
// bara DEN slotten till ej_bedombar (via 'error' i input-kontraktet)
// — det får aldrig krascha hela verktyget eller falskt visa "klart".
// ─────────────────────────────────────────────────────────────────

/**
 * Hämtar direktreferenserna för ETT projekt och härleder verdikten.
 * `null` = projektet hittades inte (annan tenant eller borttaget) —
 * anroparen svarar 404, inte en tom/felaktig readiness.
 */
export async function loadProjectCommercialReadiness(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<ProjectCommercialReadiness | null> {
  const { data: projectRow, error: projectError } = await supabase
    .from('project')
    .select('project_id, status, completed_at, quote_id, budget_amount')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (projectError || !projectRow) return null
  const project = projectRow as ReadinessProjectRow

  let quote: ReadinessQuoteRow | null | 'error' = null
  if (project.quote_id) {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('quote_id, status')
        .eq('quote_id', project.quote_id)
        .eq('business_id', businessId)
        .maybeSingle()
      quote = error || !data ? 'error' : (data as ReadinessQuoteRow)
    } catch {
      quote = 'error'
    }
  }

  const changes = await safeSelect<ReadinessChangeRow>(() =>
    supabase
      .from('project_change')
      .select('change_id, ata_number, status, sent_at, signed_at, declined_at, amount, total')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  const timeEntries = await safeSelect<ReadinessTimeEntryRow>(() =>
    supabase
      .from('time_entry')
      .select('time_entry_id')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  const supplierInvoices = await safeSelect<ReadinessSupplierInvoiceRow>(() =>
    supabase
      .from('supplier_invoices')
      .select('id, total_amount')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  const projectMaterials = await safeSelect<ReadinessProjectMaterialRow>(() =>
    supabase
      .from('project_material')
      .select('material_id, total_purchase')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  const checklists = await safeSelect<ReadinessChecklistRow>(() =>
    supabase
      .from('project_checklist')
      .select('id, status, items')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  const fieldReports = await safeSelect<ReadinessFieldReportRow>(() =>
    supabase
      .from('field_reports')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  const invoices = await safeSelect<ReadinessInvoiceRow>(() =>
    supabase
      .from('invoice')
      .select('invoice_id, status, total')
      .eq('project_id', projectId)
      .eq('business_id', businessId),
  )

  return deriveProjectCommercialReadiness({
    project,
    quote,
    changes,
    timeEntries,
    supplierInvoices,
    projectMaterials,
    checklists,
    fieldReports,
    invoices,
  })
}

/** Fail-soft select: nätverks-/DB-fel blir 'error', aldrig en kastad exception. */
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
