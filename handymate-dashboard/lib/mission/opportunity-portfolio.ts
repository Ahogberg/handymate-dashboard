/**
 * Möjlighetsportföljen — Goal-to-Plan V1:s datafundament (Etapp A,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * ═══ SANNINGSKLASSERNA SLÅS ALDRIG IHOP ═══
 *
 * Fem klasser, var och en med sitt eget mått, redovisade var för sig — det
 * finns AVSIKTLIGT inget fält som lägger ihop dem till en siffra, och ett
 * sådant får aldrig läggas till (källskanningen i
 * tests/mission-truth-guard.spec.ts vaktar). En förfallen faktura är
 * intjänade kronor; en öppen offert är det inte; en tyst kundgrupp är ett
 * antal; ett marginalskydd är kronor som FÖRSVARAS, inte nya. Att addera
 * dem vore att ljuga med aritmetik.
 *
 * Detta är en WRAP av befintliga källor, inte en utökning av
 * lib/value/pengar-pa-bordet.ts — dess kontrakt bär just det hopslagna
 * fältet som missioner förbjuder. Källorna återanvänds däremot rakt av:
 * invoiceAmount-konventionen, sweepMissedRevenue-fynden,
 * summarizeQuietCustomersByJobType och profitability_warning-korten.
 *
 * Ren sammanställning (assembleOpportunityPortfolio, facit i
 * tests/opportunity-portfolio.spec.ts) + repository-mönstret för I/O —
 * samma uppdelning som lib/value/load-revenue-recovery-cases.ts. En källa
 * som felar blir en TOM klass plus en rad i degraded_sources: en saknad
 * signal får aldrig tyst se ut som "ingen möjlighet".
 */

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sweepMissedRevenue,
  type AtaRow,
  type InvoiceRow,
  type MaterialRow,
  type MissedRevenueFinding,
  type ProjectRow,
} from '@/lib/value/missed-revenue'
import { invoiceAmount } from '@/lib/value/pengar-pa-bordet'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import {
  summarizeQuietCustomersByJobType,
  type ReactivationJobTypeGroup,
} from '@/lib/customers/reactivation-signal'
import { arTestId, arTestNamn } from '@/lib/testdata'

export type TruthClass =
  | 'indrivningsbart'    // förfallna fakturor — intjänade kr
  | 'faktureringsklart'  // levererat ofakturerat (CONFIRMED_UNBILLED/LIKELY_UNBILLED)
  | 'pipeline'           // öppna offerter — ALDRIG säkrade pengar
  | 'ateraktivering'     // tysta kundgrupper — ANTAL, aldrig kr
  | 'marginalskydd'      // skyddade kr (projected_overrun), aldrig nya kr

export const TRUTH_CLASSES: readonly TruthClass[] = [
  'indrivningsbart',
  'faktureringsklart',
  'pipeline',
  'ateraktivering',
  'marginalskydd',
] as const

export type PortfolioMeasure =
  | { kind: 'kr'; amountKr: number }
  | { kind: 'count'; count: number }

export interface PortfolioItem {
  /** 'pf_' + stabil hash av klass + beviskälla — samma rad ger samma id
      vid varje omräkning (planens item_id:n överlever en färsk portfölj). */
  id: string
  truth_class: TruthClass
  title: string
  measure: PortfolioMeasure
  evidence: { table: 'invoice' | 'project' | 'quotes' | 'customer_group'; ref_id: string }
  /** Ansvarig specialist. */
  agent_key: 'karin' | 'lars' | 'daniel' | 'hanna'
  suggested_action: string
  /** Korttypen ett verkställt steg skulle skapa; null när ingen finns. */
  approval_type: string | null
}

export interface OpportunityPortfolio {
  generated_at: string
  by_class: Record<TruthClass, PortfolioItem[]>
  /** Källor som inte kunde läsas — deras klasser är tomma av FEL, inte brist. */
  degraded_sources: string[]
}

// ── Indata: exakt de fält sammanställningen behöver, inget mer ───────────

export interface OverdueInvoiceInput {
  invoice_id: string
  invoice_number: string | null
  /** Beloppet kunden är skyldig — repositoryt fyller det via den kanoniska
      invoiceAmount-konventionen (ROT/RUT → det kunden betalar). */
  total: number
  customer_name: string | null
}

export interface StaleQuoteInput {
  quote_id: string
  quote_number: string | null
  total: number
  customer_name: string | null
}

export interface MarginWarningInput {
  project_id: string
  project_name: string | null
  projected_overrun: number | null
  status: 'at_risk' | 'over_budget'
}

export interface PortfolioAssemblyInput {
  overdueInvoices: OverdueInvoiceInput[]
  missedRevenue: MissedRevenueFinding[]
  staleQuotes: StaleQuoteInput[]
  quietGroups: ReactivationJobTypeGroup[]
  marginWarnings: MarginWarningInput[]
  /** Fylls av loadOpportunityPortfolio — den rena delen skriver bara av. */
  degradedSources?: string[]
}

/**
 * Stabilt, deterministiskt id: samma klass + samma beviskälla → samma id,
 * oavsett när portföljen räknas om. Samma hash-idiom som
 * lib/ai/decision-record.ts (sha256 hex, 12 tecken).
 */
function itemId(truthClass: TruthClass, discriminator: string): string {
  return 'pf_' + createHash('sha256')
    .update(`${truthClass}|${discriminator}`)
    .digest('hex')
    .slice(0, 12)
}

const kr = (n: number) => Math.round(n)

/**
 * Ansvarsmappning för fakturafynden: ÄTA-fynd (projektändringar) hör till
 * Lars fältdomän; material- och projektfakturering är Karins ekonomidomän.
 * projekt_utan_faktura når aldrig hit som kr-item (alltid NEEDS_REVIEW),
 * men mappas till karin för fullständighetens skull.
 */
function missedRevenueAgent(kind: MissedRevenueFinding['kind']): PortfolioItem['agent_key'] {
  return kind === 'ata_ej_fakturerad' ? 'lars' : 'karin'
}

function missedRevenueTitle(f: MissedRevenueFinding): string {
  switch (f.kind) {
    case 'ata_ej_fakturerad':
      return `Ofakturerat tilläggsarbete — ${f.projectName}`
    case 'material_ej_fakturerat':
      return `Ofakturerat material — ${f.projectName}`
    case 'projekt_utan_faktura':
      return `Avslutat projekt utan faktura — ${f.projectName}`
  }
}

/**
 * Ren sammanställning av redan lästa rådata till portföljen. Ingen I/O,
 * ingen AI — beloppen kommer ur raderna, aldrig ur någon uppskattning.
 * Varje klassnyckel finns alltid, även när den är tom.
 */
export function assembleOpportunityPortfolio(
  input: PortfolioAssemblyInput,
  now: Date,
): OpportunityPortfolio {
  const by_class: Record<TruthClass, PortfolioItem[]> = {
    indrivningsbart: [],
    faktureringsklart: [],
    pipeline: [],
    ateraktivering: [],
    marginalskydd: [],
  }

  // ── Indrivningsbart: förfallna fakturor — redan intjänade kronor ──────
  for (const inv of input.overdueInvoices) {
    if (!(typeof inv.total === 'number' && inv.total > 0)) continue
    by_class.indrivningsbart.push({
      id: itemId('indrivningsbart', `invoice:${inv.invoice_id}`),
      truth_class: 'indrivningsbart',
      title: `Förfallen faktura ${inv.invoice_number ?? inv.invoice_id} — ${inv.customer_name ?? 'okänd kund'}`,
      measure: { kind: 'kr', amountKr: kr(inv.total) },
      evidence: { table: 'invoice', ref_id: inv.invoice_id },
      agent_key: 'karin',
      suggested_action: 'Skicka en betalningspåminnelse till kunden',
      approval_type: 'invoice_reminder',
    })
  }

  // ── Faktureringsklart: bara CONFIRMED/LIKELY får bära kronor. ─────────
  // NEEDS_REVIEW-fynd är per definition obekräftade och blir ETT
  // antalsmätt granskningsitem — aldrig kronor (samma disciplin som
  // missed-revenue-svepets egen klassning).
  let needsReviewAntal = 0
  for (const f of input.missedRevenue) {
    if (f.confidence === 'NEEDS_REVIEW') {
      needsReviewAntal += 1
      continue
    }
    if (!(f.amountKr > 0)) continue
    by_class.faktureringsklart.push({
      id: itemId('faktureringsklart', f.dedupeKey),
      truth_class: 'faktureringsklart',
      title: missedRevenueTitle(f),
      measure: { kind: 'kr', amountKr: kr(f.amountKr) },
      evidence: { table: 'project', ref_id: f.projectId },
      agent_key: missedRevenueAgent(f.kind),
      suggested_action: 'Granska underlaget och skapa fakturautkastet',
      approval_type: 'missad_intakt',
    })
  }
  if (needsReviewAntal > 0) {
    by_class.faktureringsklart.push({
      id: itemId('faktureringsklart', 'needs_review'),
      truth_class: 'faktureringsklart',
      // Samlingsitem — ref_id är granskningskökens markör, inte en radnyckel.
      title: `${needsReviewAntal} fynd behöver granskas innan belopp kan bekräftas`,
      measure: { kind: 'count', count: needsReviewAntal },
      evidence: { table: 'project', ref_id: 'needs_review' },
      agent_key: 'karin',
      suggested_action: 'Gå igenom granskningskön under Godkännanden',
      approval_type: 'missad_intakt',
    })
  }

  // ── Pipeline: öppna offerter — potentiella kronor, ALDRIG säkrade. ────
  // Klassen SJÄLV är markören: kind 'kr' här betyder "värt så här mycket
  // OM den vinns", och progressen räknar bara rörelse (accepterad/inte).
  for (const q of input.staleQuotes) {
    if (!(typeof q.total === 'number' && q.total > 0)) continue
    by_class.pipeline.push({
      id: itemId('pipeline', `quote:${q.quote_id}`),
      truth_class: 'pipeline',
      title: `Obesvarad offert ${q.quote_number ?? q.quote_id} — ${q.customer_name ?? 'okänd kund'}`,
      measure: { kind: 'kr', amountKr: kr(q.total) },
      evidence: { table: 'quotes', ref_id: q.quote_id },
      agent_key: 'daniel',
      suggested_action: 'Följ upp offerten med kunden',
      approval_type: 'quote_nudge',
    })
  }

  // ── Återaktivering: tysta kundgrupper — ANTAL, aldrig kronor. ─────────
  for (const g of input.quietGroups) {
    if (!(g.count > 0)) continue
    by_class.ateraktivering.push({
      id: itemId('ateraktivering', `group:${g.job_type}`),
      truth_class: 'ateraktivering',
      title: `${g.count} tysta ${g.job_type}-kunder`,
      measure: { kind: 'count', count: g.count },
      evidence: { table: 'customer_group', ref_id: g.job_type },
      agent_key: 'hanna',
      suggested_action: `Föreslå en återaktiveringskontakt till ${g.job_type}-kunderna`,
      approval_type: null,
    })
  }

  // ── Marginalskydd: kronor som FÖRSVARAS (prognostiserat överdrag). ────
  // Utan känt överdrag är varningen ett antal — aldrig ett hittat belopp.
  for (const w of input.marginWarnings) {
    const overrun = w.projected_overrun
    const harBelopp = typeof overrun === 'number' && overrun > 0
    by_class.marginalskydd.push({
      id: itemId('marginalskydd', `project:${w.project_id}`),
      truth_class: 'marginalskydd',
      title: w.status === 'over_budget'
        ? `Kalkylen överskriden — ${w.project_name ?? w.project_id}`
        : `Marginal i riskzonen — ${w.project_name ?? w.project_id}`,
      measure: harBelopp
        ? { kind: 'kr', amountKr: kr(overrun) }
        : { kind: 'count', count: 1 },
      evidence: { table: 'project', ref_id: w.project_id },
      agent_key: 'lars',
      suggested_action: 'Granska kostnadsprognosen och överväg en ÄTA',
      approval_type: 'profitability_warning',
    })
  }

  return {
    generated_at: now.toISOString(),
    by_class,
    degraded_sources: [...(input.degradedSources ?? [])],
  }
}

// ─────────────────────────────────────────────────────────────────────────
// I/O — repository-mönstret från lib/value/load-revenue-recovery-cases.ts:
// explicita business_id-filtrerade frågor, inga embeds/joins (flera
// tabeller saknar FK-constraints i produktion och PostgREST-embeds har
// dött tyst förr).
// ─────────────────────────────────────────────────────────────────────────

export interface PortfolioRepository {
  listOverdueInvoices(): Promise<OverdueInvoiceInput[]>
  listMissedRevenue(): Promise<MissedRevenueFinding[]>
  listStaleQuotes(): Promise<StaleQuoteInput[]>
  listQuietGroups(): Promise<ReactivationJobTypeGroup[]>
  listMarginWarnings(): Promise<MarginWarningInput[]>
}

/** Offert utan svar i så här många dagar räknas som uppföljningsbar pipeline
    i portföljen (missionsplanens tröskel — medvetet lite tröger än
    quote-follow-up-cadencens 5 dagar: planen ska peka på offerter som
    bevisligen inte svarar av sig själva). */
export const STALE_QUOTE_DAYS = 7

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

/**
 * Batchat namnuppslag mot customer-tabellen (explicit fråga, ingen embed).
 * Saknat namn är inget fel — titeln säger då "okänd kund".
 */
async function customerNames(
  supabase: SupabaseClient,
  businessId: string,
  customerIds: string[],
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(customerIds.filter(Boolean)))
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase
    .from('customer')
    .select('customer_id, name')
    .eq('business_id', businessId)
    .in('customer_id', ids)
  if (error) throw new Error(`customer-uppslag misslyckades: ${error.message}`)
  const map = new Map<string, string>()
  for (const row of asRows<{ customer_id: string; name: string | null }>(data)) {
    if (row.name) map.set(row.customer_id, row.name)
  }
  return map
}

/**
 * Supabase-adaptern. Källval per klass:
 *
 * - Förfallet följer den kanoniska förfallet-definitionen från
 *   app/api/dashboard/pengar (status sent/overdue OCH due_date passerat) —
 *   ett status-fält som aldrig hann flippas till 'overdue' är ändå
 *   förfallna pengar. Beloppet via invoiceAmount (ROT/RUT-konventionen).
 * - Fakturafynden är exakt samma fyra frågor + rena svep som pengar-rutten
 *   och nattcronen, med tom dedupe: portföljen svarar på "vad finns",
 *   inte "vad har inte blivit kort än".
 * - Marginalskydd läses ur öppna profitability_warning-kort i stället för
 *   att räkna om per-projekt-ekonomi: kortet ÄR den levande varningsytan
 *   (samma källa som pengar-rutten använder), och per-projekt-ekonomin är
 *   dyr att räkna för varje portföljanrop. Medvetet V1-val.
 * - Testdata filtreras (lib/testdata) — e2e-rader blir aldrig missionssteg.
 */
export function createPortfolioRepository(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): PortfolioRepository {
  return {
    async listOverdueInvoices() {
      const idag = now.toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('invoice')
        .select('invoice_id, invoice_number, total, customer_pays, rot_rut_type, customer_id')
        .eq('business_id', businessId)
        .in('status', ['sent', 'overdue'])
        .lt('due_date', idag)
      if (error) throw new Error(`invoice-uppslag misslyckades: ${error.message}`)
      const rows = asRows<{
        invoice_id: string
        invoice_number: string | null
        total: number | null
        customer_pays: number | null
        rot_rut_type: string | null
        customer_id: string | null
      }>(data).filter(r => !arTestId(r.invoice_id))
      const namn = await customerNames(supabase, businessId, rows.map(r => r.customer_id ?? ''))
      return rows
        .map(r => ({
          invoice_id: r.invoice_id,
          invoice_number: r.invoice_number,
          total: invoiceAmount(r),
          customer_name: r.customer_id ? namn.get(r.customer_id) ?? null : null,
        }))
        .filter(r => !arTestNamn(r.customer_name))
    },

    async listMissedRevenue() {
      const [atasRes, matsRes, projRes, invRes] = await Promise.all([
        supabase
          .from('project_change')
          .select('id:change_id, project_id, change_type, description, amount, signed_at, invoice_id, invoiced_at')
          .eq('business_id', businessId)
          .not('signed_at', 'is', null)
          .is('invoiced_at', null),
        supabase
          .from('project_material')
          .select('id:material_id, project_id, total_sell, invoiced, invoice_id')
          .eq('business_id', businessId)
          .eq('invoiced', false),
        supabase
          .from('project')
          .select('project_id, name, project_type, status, completed_at')
          .eq('business_id', businessId)
          .eq('status', 'completed'),
        supabase
          .from('invoice')
          .select('project_id')
          .eq('business_id', businessId)
          .not('project_id', 'is', null),
      ])
      for (const res of [atasRes, matsRes, projRes, invRes]) {
        if (res.error) throw new Error(`fakturafynd-uppslag misslyckades: ${res.error.message}`)
      }
      const riktigaProjekt = asRows<ProjectRow>(projRes.data)
        .filter(p => !arTestId(p.project_id) && !arTestNamn(p.name))
      return sweepMissedRevenue({
        atas: asRows<AtaRow>(atasRes.data),
        materials: asRows<MaterialRow>(matsRes.data),
        projects: riktigaProjekt,
        invoices: asRows<InvoiceRow>(invRes.data),
        alreadyReported: new Set(),
        now,
      })
    },

    async listStaleQuotes() {
      const grans = new Date(now.getTime() - STALE_QUOTE_DAYS * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('quotes')
        .select('quote_id, quote_number, total, title, customer_id')
        .eq('business_id', businessId)
        .in('status', [...OPEN_QUOTE_STATUSES])
        .lt('sent_at', grans)
      if (error) throw new Error(`quotes-uppslag misslyckades: ${error.message}`)
      const rows = asRows<{
        quote_id: string
        quote_number: string | null
        total: number | null
        title: string | null
        customer_id: string | null
      }>(data).filter(q => !arTestNamn(q.title))
      const namn = await customerNames(supabase, businessId, rows.map(r => r.customer_id ?? ''))
      return rows.map(r => ({
        quote_id: r.quote_id,
        quote_number: r.quote_number,
        total: typeof r.total === 'number' ? r.total : 0,
        customer_name: r.customer_id ? namn.get(r.customer_id) ?? null : null,
      }))
    },

    async listQuietGroups() {
      return summarizeQuietCustomersByJobType(supabase, businessId, { now })
    },

    async listMarginWarnings() {
      const { data, error } = await supabase
        .from('pending_approvals')
        .select('payload')
        .eq('business_id', businessId)
        .eq('approval_type', 'profitability_warning')
        .eq('status', 'pending')
      if (error) throw new Error(`profitability_warning-uppslag misslyckades: ${error.message}`)
      const warnings: MarginWarningInput[] = []
      for (const row of asRows<{ payload: Record<string, unknown> | null }>(data)) {
        const p = row.payload ?? {}
        const projectId = typeof p.project_id === 'string' ? p.project_id : null
        if (!projectId || arTestId(projectId)) continue
        warnings.push({
          project_id: projectId,
          project_name: typeof p.project_name === 'string' ? p.project_name : null,
          projected_overrun: typeof p.projected_overrun === 'number' ? p.projected_overrun : null,
          status: p.status === 'over_budget' ? 'over_budget' : 'at_risk',
        })
      }
      return warnings
    },
  }
}

/**
 * Läser alla fem källorna och sammanställer. Varje källa i sin egen
 * try/catch: en som felar bidrar med TOM indata och sitt namn i
 * degraded_sources — resten av portföljen lever vidare.
 *
 * (Repositoryt är redan business-scoped vid skapandet, exakt som
 * loadRevenueRecoveryCasesFromRepository — därför ingen businessId här.)
 */
export async function loadOpportunityPortfolio(
  repo: PortfolioRepository,
  now: Date = new Date(),
): Promise<OpportunityPortfolio> {
  const degraded: string[] = []
  async function safe<T>(name: string, fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[mission-portfolio] källan ${name} kunde inte läsas (tom klass + degraded):`, msg)
      degraded.push(name)
      return []
    }
  }

  const [overdueInvoices, missedRevenue, staleQuotes, quietGroups, marginWarnings] = await Promise.all([
    safe('overdue_invoices', () => repo.listOverdueInvoices()),
    safe('missed_revenue', () => repo.listMissedRevenue()),
    safe('stale_quotes', () => repo.listStaleQuotes()),
    safe('quiet_groups', () => repo.listQuietGroups()),
    safe('margin_warnings', () => repo.listMarginWarnings()),
  ])

  return assembleOpportunityPortfolio({
    overdueInvoices,
    missedRevenue,
    staleQuotes,
    quietGroups,
    marginWarnings,
    degradedSources: degraded,
  }, now)
}

/** Bekvämlighetsfasad — samma form som loadRevenueRecoveryCases. */
export async function loadOpportunityPortfolioForBusiness(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<OpportunityPortfolio> {
  return loadOpportunityPortfolio(createPortfolioRepository(supabase, businessId, now), now)
}
