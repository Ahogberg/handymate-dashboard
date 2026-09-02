/**
 * Etapp T — Company Model Read Contract V1.
 *
 * KVITTOPRINCIPEN FÖR DEFAULTS: det här kontraktet HITTAR ALDRIG PÅ ett
 * värde. Varje fält är källmärkt — { value, source, authority, freshness }.
 * Saknas en riktig ägar-uppgift returneras `value: null` och
 * `authority: 'missing'`; konsumenter (prompter, fakturaflöden) hanterar
 * det ärligt ("timpris ej angivet") istället för att gissa ett tal. Ett
 * schema-DEFAULT (margin_target_percent DEFAULT 50, default_payment_days
 * DEFAULT 30 m.fl.) är INTE ägarens kunskap — bara för att en kolumn har
 * ett värde betyder inte att ägaren valt det.
 *
 * Bakgrund (inventeringen, tasks/jaunty-pondering-hummingbird.md Etapp T):
 * fyra olika timpris-defaults (695/650/895/500) fanns spridda i koden,
 * marginalmålet (v134) lästes aldrig av Karin/Lars, och Hannas prompt
 * hårdkodade 60 dagar oberoende av lib/customers/quiet-customer.ts's
 * delade trösklar. Den här filen är EN läskälla för "hur jobbar den här
 * firman" — ingen ny jättetabell, bara en källmärkt aggregator över det
 * som redan finns spritt (business_config, v3_automation_settings,
 * business_knowledge, quiet-customer-primitiven).
 *
 * FieldAuthority:
 *   - owner_confirmed: ägaren har uttryckligen bekräftat/sparat värdet,
 *     OCH det finns ett tidsstämplat bevis för det (t.ex. margin_target_
 *     set_at). Starkast bevisläge.
 *   - owner_set: ägaren har rimligen satt värdet (en JSONB-nyckel som bara
 *     finns om någon skrivit den, ett fält utan schema-DEFAULT som
 *     maskerar det), men utan en separat bekräftelse-tidsstämpel.
 *   - seeded_default: systemet seedade värdet automatiskt (branschmall
 *     vid signup, en auto-skapad settings-rad) och inget bevis finns för
 *     att ägaren anpassat det.
 *   - derived: en kodkonstant/beräknad regel (t.ex. tyst-kund-trösklarna)
 *     — inte ägar-konfigurerbar, men inte heller en gissning.
 *   - hardcoded_default: kontraktet visar ett värde som ÄR systemets
 *     dokumenterade fallback (t.ex. 30 dagars betalvillkor) — värdet är
 *     inte påhittat (det är precis vad koden faktiskt använder överallt),
 *     men det är heller inte ägarens bekräftade sanning.
 *   - missing: inget värde alls. `value` är alltid `null` här.
 *
 * Enda fältet som får bära ett icke-null `value` under 'hardcoded_default'
 * är payment_terms_days — alla andra hardcoded_default-kandidater (timpris,
 * marginalmål) klassas hellre 'missing' än att visa ett tal som kan
 * misstas för sanning (se KVITTOPRINCIPEN ovan).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getKnowledgeForBranch } from '@/lib/knowledge-defaults'
import { describeBranches, resolveBusinessBranch } from '@/lib/branch'
import { normalizeExplicitMarginTarget } from '@/lib/projects/margin-guardian'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'
import {
  HANNA_OUTBOUND_QUIET_DAYS,
  CAPACITY_FILL_QUIET_DAYS,
} from '@/lib/customers/quiet-customer'

// ─────────────────────────────────────────────────────────────────
// Kärntyper
// ─────────────────────────────────────────────────────────────────

export type FieldAuthority =
  | 'owner_confirmed'
  | 'owner_set'
  | 'seeded_default'
  | 'derived'
  | 'hardcoded_default'
  | 'missing'

export interface CompanyField<T> {
  value: T | null
  source: string
  authority: FieldAuthority
  /** ISO-tidsstämpel för när värdet senast bekräftades/uppdaterades, eller
      null om ingen sådan tidsstämpel finns. */
  freshness: string | null
}

export interface ConfirmedKnowledgeItem {
  id: string
  knowledge_type: string
  text: string
  created_at: string
}

export interface AutomationSettingsValue {
  work_start: string
  work_end: string
  work_days: string[]
  night_mode_enabled: boolean
  min_job_value_sek: number
  require_approval_send_quote: boolean
  require_approval_send_invoice: boolean
  require_approval_create_booking: boolean
  lead_response_target_minutes: number
}

export interface QuietThresholdsValue {
  hanna_outbound_days: number
  capacity_fill_days: number
}

export interface CompanyModel {
  business_id: string
  revenue_target_annual_sek: CompanyField<number>
  margin_target_percent: CompanyField<number>
  hourly_rate: CompanyField<number>
  vat_rate: CompanyField<number>
  branch: CompanyField<string>
  secondary_branches: CompanyField<string[]>
  knowledge_base: CompanyField<Record<string, unknown>>
  automation_settings: CompanyField<AutomationSettingsValue>
  confirmed_knowledge: CompanyField<ConfirmedKnowledgeItem[]>
  quiet_customer_thresholds: CompanyField<QuietThresholdsValue>
  payment_terms_days: CompanyField<number>
  degraded_sources: string[]
}

const MISSING = <T>(source: string): CompanyField<T> => ({
  value: null,
  source,
  authority: 'missing',
  freshness: null,
})

// ─────────────────────────────────────────────────────────────────
// Rena, återanvändbara fält-helpers — används både av byggCompanyModel
// OCH direkt av prompt-siter som redan har pricing_settings i scope
// (system-prompt.ts, strategi-agent.ts, ekonomi-agent.ts) utan att
// behöva ladda en hel CompanyModel för en enda siffra.
// ─────────────────────────────────────────────────────────────────

const PRICING_SETTINGS_SOURCE = 'business_config.pricing_settings'

/** Timpris — ENDA källan är pricing_settings.hourly_rate. Kontraktet har
    INGEN fallback-siffra (varken default_hourly_rate eller ett hårdkodat
    tal) — se filhuvudet. */
export function hourlyRateField(
  pricingSettings: { hourly_rate?: unknown } | null | undefined,
): CompanyField<number> {
  const raw = pricingSettings?.hourly_rate
  const value = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null
  if (value === null) return MISSING(`${PRICING_SETTINGS_SOURCE}.hourly_rate`)
  return { value, source: `${PRICING_SETTINGS_SOURCE}.hourly_rate`, authority: 'owner_set', freshness: null }
}

export function vatRateField(
  pricingSettings: { vat_rate?: unknown } | null | undefined,
): CompanyField<number> {
  const raw = pricingSettings?.vat_rate
  const value = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null
  if (value === null) return MISSING(`${PRICING_SETTINGS_SOURCE}.vat_rate`)
  return { value, source: `${PRICING_SETTINGS_SOURCE}.vat_rate`, authority: 'owner_set', freshness: null }
}

/** Marginalmål — auktoritativt ENDAST när margin_target_set_at är satt.
    Återanvänder normalizeExplicitMarginTarget (samma kärna som
    lib/profitability.ts's getExplicitMarginTarget) så klämpnings-/
    valideringslogiken aldrig kan glida isär mellan Margin Guardian och
    detta kontrakt. */
export function marginTargetField(
  percent: unknown,
  setAt: string | null | undefined,
): CompanyField<number> {
  const source = 'business_config.margin_target_percent'
  if (!setAt) return MISSING(source)
  const value = normalizeExplicitMarginTarget(percent)
  if (value === null) return MISSING(source)
  return { value, source, authority: 'owner_confirmed', freshness: setAt }
}

/** Årsomsättningsmål — nullable utan DEFAULT (sql/v128), så närvaro av
    ett värde ÄR beviset (ingen set_at behövs, till skillnad från
    marginalmålet vars kolumn har DEFAULT 50). */
export function revenueTargetField(value: unknown): CompanyField<number> {
  const source = 'business_config.revenue_target_annual_sek'
  const num = typeof value === 'number' && Number.isFinite(value) ? value : null
  if (num === null) return MISSING(source)
  return { value: num, source, authority: 'owner_set', freshness: null }
}

/**
 * Betalningsvillkor — business_config.default_payment_days har
 * DEFAULT 30 (sql/invoice_overhaul.sql), samma maskeringsproblem som
 * marginalmålet men UTAN en set_at-kolumn. Samma knep som v134 använde
 * för marginalmålet: ett värde som AVVIKER från schema-defaulten kan
 * inte ha uppstått ur defaulten och är därför bevisligen uttryckligt.
 * Ett värde som RÅKAR vara exakt 30 är tvetydigt — kontraktet visar
 * ändå 30 (det är genuint vad koden använder överallt idag) men märker
 * det ärligt som 'hardcoded_default', inte som ägarens bekräftade val.
 */
const DEFAULT_PAYMENT_TERMS_DAYS = 30

export function paymentTermsField(defaultPaymentDays: unknown): CompanyField<number> {
  const source = 'business_config.default_payment_days'
  const num = typeof defaultPaymentDays === 'number' && Number.isFinite(defaultPaymentDays)
    ? defaultPaymentDays
    : null
  if (num !== null && num !== DEFAULT_PAYMENT_TERMS_DAYS) {
    return { value: num, source, authority: 'owner_set', freshness: null }
  }
  return {
    value: DEFAULT_PAYMENT_TERMS_DAYS,
    source: 'hardcoded_default(30)',
    authority: 'hardcoded_default',
    freshness: null,
  }
}

/** Tyst-kund-trösklarna — kodkonstanter, aldrig databeroende. Alltid
    'derived', aldrig 'missing'. */
export function quietCustomerThresholdsField(): CompanyField<QuietThresholdsValue> {
  return {
    value: {
      hanna_outbound_days: HANNA_OUTBOUND_QUIET_DAYS,
      capacity_fill_days: CAPACITY_FILL_QUIET_DAYS,
    },
    source: 'lib/customers/quiet-customer.ts',
    authority: 'derived',
    freshness: null,
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (typeof a !== 'object') return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/** Kunskapsbas — seedad från lib/knowledge-defaults.ts vid signup
    (app/api/auth/register/route.ts: `knowledge_base: getKnowledgeForBranch(branch)`).
    Bevisligen ägar-redigerad om innehållet AVVIKER från den exakta
    branschmallen — annars 'seeded_default'. */
export function knowledgeBaseField(
  knowledgeBase: Record<string, unknown> | null | undefined,
  branch: string | null | undefined,
): CompanyField<Record<string, unknown>> {
  const source = 'business_config.knowledge_base'
  if (!knowledgeBase || Object.keys(knowledgeBase).length === 0) return MISSING(source)
  const seeded = getKnowledgeForBranch(branch || '')
  const isSeeded = deepEqual(knowledgeBase, seeded)
  return {
    value: knowledgeBase,
    source,
    authority: isSeeded ? 'seeded_default' : 'owner_set',
    freshness: null,
  }
}

export function branchField(branch: string | null | undefined): CompanyField<string> {
  const source = 'business_config.branch'
  if (!branch) return MISSING(source)
  return { value: branch, source, authority: 'owner_set', freshness: null }
}

/**
 * automation_settings — v3_automation_settings-raden auto-skapas för
 * ALLA företag vid migrationstillfället (sql/v3_automation_settings.sql:
 * "Skapa default-rad för alla befintliga företag") — precis samma
 * maskeringsproblem som margin_target_percent. Tabellen har både
 * created_at och updated_at; Settings-sidan (app/api/automation/
 * settings/route.ts) sätter updated_at EXPLICIT vid varje sparning.
 * En rad vars updated_at fortfarande är (nära) identisk med created_at
 * har alltså aldrig sparats om av ägaren sedan auto-provisioneringen.
 */
export function automationSettingsField(row: {
  work_start?: unknown
  work_end?: unknown
  work_days?: unknown
  night_mode_enabled?: unknown
  min_job_value_sek?: unknown
  require_approval_send_quote?: unknown
  require_approval_send_invoice?: unknown
  require_approval_create_booking?: unknown
  lead_response_target_minutes?: unknown
  created_at?: unknown
  updated_at?: unknown
} | null | undefined): CompanyField<AutomationSettingsValue> {
  const source = 'v3_automation_settings'
  if (!row) return MISSING(source)

  const value: AutomationSettingsValue = {
    work_start: typeof row.work_start === 'string' ? row.work_start : '07:00',
    work_end: typeof row.work_end === 'string' ? row.work_end : '17:00',
    work_days: Array.isArray(row.work_days) ? row.work_days as string[] : [],
    night_mode_enabled: Boolean(row.night_mode_enabled),
    min_job_value_sek: typeof row.min_job_value_sek === 'number' ? row.min_job_value_sek : 0,
    require_approval_send_quote: Boolean(row.require_approval_send_quote),
    require_approval_send_invoice: Boolean(row.require_approval_send_invoice),
    require_approval_create_booking: Boolean(row.require_approval_create_booking),
    lead_response_target_minutes: typeof row.lead_response_target_minutes === 'number'
      ? row.lead_response_target_minutes
      : 30,
  }

  const createdAt = typeof row.created_at === 'string' ? row.created_at : null
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : null
  const everSaved = Boolean(createdAt && updatedAt && updatedAt !== createdAt)

  return {
    value,
    source,
    authority: everSaved ? 'owner_set' : 'seeded_default',
    freshness: everSaved ? updatedAt : null,
  }
}

export interface RawConfirmedKnowledgeRow {
  id: string
  knowledge_type: string
  title: string | null
  observation: string | null
  created_at: string
}

/** Bekräftade regler/mönster — business_knowledge business_rule/
    priority_rule/pattern-rader är alla ägar-dikterade eller ägar-
    godkända (skrivna via POST /api/business-rules, Prioriteringsprinciper,
    eller ett godkänt playbook_pattern_confirmation-kort) — aldrig en
    obekräftad AI-gissning. Tom lista → 'missing' (ingenting att lita på,
    inte "noll regler bekräftade"). */
export function confirmedKnowledgeField(
  rows: RawConfirmedKnowledgeRow[],
): CompanyField<ConfirmedKnowledgeItem[]> {
  const source = 'business_knowledge'
  if (rows.length === 0) return MISSING(source)
  const items: ConfirmedKnowledgeItem[] = rows.map(r => ({
    id: r.id,
    knowledge_type: r.knowledge_type,
    text: r.observation || r.title || '',
    created_at: r.created_at,
  }))
  const freshest = items.reduce<string | null>((latest, item) => {
    if (!latest) return item.created_at
    return item.created_at > latest ? item.created_at : latest
  }, null)
  return { value: items, source, authority: 'owner_confirmed', freshness: freshest }
}

function secondaryBranchesField(
  value: string[] | null | undefined,
  degraded: boolean,
): CompanyField<string[]> {
  const source = 'business_config.secondary_branches'
  if (degraded) return MISSING(source)
  return { value: value || [], source, authority: 'owner_set', freshness: null }
}

// ─────────────────────────────────────────────────────────────────
// Pure assemble — byggCompanyModel
// ─────────────────────────────────────────────────────────────────

export interface CompanyModelBusinessConfigRow {
  revenue_target_annual_sek: unknown
  margin_target_percent: unknown
  margin_target_set_at: string | null
  pricing_settings: Record<string, unknown> | null
  branch: string | null
  secondary_branches: string[] | null
  knowledge_base: Record<string, unknown> | null
  default_payment_days: unknown
}

export interface CompanyModelInput {
  businessId: string
  /** null = raden kunde inte läsas (degraderad källa) — se degradedSources. */
  businessConfig: CompanyModelBusinessConfigRow | null
  /** true om business_config-selecten (huvudraden) misslyckades. */
  businessConfigDegraded: boolean
  /** true specifikt om secondary_branches-kolumnen inte kunde läsas
      (t.ex. saknad v93-migration) — skild från businessConfigDegraded
      eftersom resten av raden ändå kan vara giltig. */
  secondaryBranchesDegraded: boolean
  automationSettings: Parameters<typeof automationSettingsField>[0]
  automationSettingsDegraded: boolean
  confirmedKnowledgeRows: RawConfirmedKnowledgeRow[]
  confirmedKnowledgeDegraded: boolean
}

/** Ren, facit-först sammansättning — ingen I/O. Se loadCompanyModel för
    den fail-soft repository-laddningen. */
export function byggCompanyModel(input: CompanyModelInput): CompanyModel {
  const degradedSources: string[] = []
  if (input.businessConfigDegraded) degradedSources.push('business_config')
  if (input.secondaryBranchesDegraded && !input.businessConfigDegraded) {
    degradedSources.push('business_config.secondary_branches')
  }
  if (input.automationSettingsDegraded) degradedSources.push('v3_automation_settings')
  if (input.confirmedKnowledgeDegraded) degradedSources.push('business_knowledge')

  const cfg = input.businessConfig

  return {
    business_id: input.businessId,
    revenue_target_annual_sek: cfg
      ? revenueTargetField(cfg.revenue_target_annual_sek)
      : MISSING('business_config.revenue_target_annual_sek'),
    margin_target_percent: cfg
      ? marginTargetField(cfg.margin_target_percent, cfg.margin_target_set_at)
      : MISSING('business_config.margin_target_percent'),
    hourly_rate: cfg
      ? hourlyRateField(cfg.pricing_settings)
      : MISSING(`${PRICING_SETTINGS_SOURCE}.hourly_rate`),
    vat_rate: cfg
      ? vatRateField(cfg.pricing_settings)
      : MISSING(`${PRICING_SETTINGS_SOURCE}.vat_rate`),
    branch: cfg ? branchField(cfg.branch) : MISSING('business_config.branch'),
    secondary_branches: cfg
      ? secondaryBranchesField(cfg.secondary_branches, input.secondaryBranchesDegraded)
      : MISSING('business_config.secondary_branches'),
    knowledge_base: cfg
      ? knowledgeBaseField(cfg.knowledge_base, cfg.branch)
      : MISSING('business_config.knowledge_base'),
    automation_settings: automationSettingsField(input.automationSettings),
    confirmed_knowledge: confirmedKnowledgeField(input.confirmedKnowledgeRows),
    quiet_customer_thresholds: quietCustomerThresholdsField(),
    payment_terms_days: cfg
      ? paymentTermsField(cfg.default_payment_days)
      : paymentTermsField(null),
    degraded_sources: degradedSources,
  }
}

// ─────────────────────────────────────────────────────────────────
// Repository — fail-soft I/O, samma explicita adapter-idiom som
// lib/value/load-revenue-recovery-cases.ts (tenantfiltrerat, ingen
// embed/join). Skillnaden mot den filen: HÄR kastar vi ALDRIG — en
// trasig källa degraderar bara det berörda fältet till 'missing' plus
// en rad i degraded_sources, eftersom kontraktet läses av prompt-/
// chattflöden som aldrig får krascha på en enskild källas fel.
// ─────────────────────────────────────────────────────────────────

export interface CompanyModelRepository {
  getBusinessConfig(): Promise<{ row: CompanyModelBusinessConfigRow | null; degraded: boolean }>
  getSecondaryBranchesDegraded(): Promise<boolean>
  getAutomationSettings(): Promise<{ row: Parameters<typeof automationSettingsField>[0]; degraded: boolean }>
  getConfirmedKnowledge(): Promise<{ rows: RawConfirmedKnowledgeRow[]; degraded: boolean }>
}

const CONFIRMED_KNOWLEDGE_TYPES = ['business_rule', 'priority_rule', 'pattern'] as const

export function createCompanyModelRepository(
  supabase: SupabaseClient,
  businessId: string,
): CompanyModelRepository {
  return {
    async getBusinessConfig() {
      try {
        const { data, error } = await supabase
          .from('business_config')
          .select(
            'revenue_target_annual_sek, margin_target_percent, margin_target_set_at, pricing_settings, branch, secondary_branches, knowledge_base, default_payment_days',
          )
          .eq('business_id', businessId)
          .maybeSingle()
        if (error) {
          // secondary_branches (v93) kan saknas i miljöer där migrationen
          // inte körts — då degraderar vi BARA det fältet genom att läsa
          // om utan kolumnen, inte hela raden.
          if (arSchemaSaknas(error)) {
            const { data: fallback, error: fallbackError } = await supabase
              .from('business_config')
              .select(
                'revenue_target_annual_sek, margin_target_percent, margin_target_set_at, pricing_settings, branch, knowledge_base, default_payment_days',
              )
              .eq('business_id', businessId)
              .maybeSingle()
            if (fallbackError) {
              await rapporteraTystFel(supabase, businessId, 'company-model:business_config', fallbackError.message)
              return { row: null, degraded: true }
            }
            return {
              row: fallback ? { ...fallback, secondary_branches: null } as CompanyModelBusinessConfigRow : null,
              degraded: false,
            }
          }
          await rapporteraTystFel(supabase, businessId, 'company-model:business_config', error.message)
          return { row: null, degraded: true }
        }
        return { row: data as CompanyModelBusinessConfigRow | null, degraded: false }
      } catch (err: any) {
        await rapporteraTystFel(supabase, businessId, 'company-model:business_config', err?.message || String(err))
        return { row: null, degraded: true }
      }
    },

    async getSecondaryBranchesDegraded() {
      try {
        const { error } = await supabase
          .from('business_config')
          .select('secondary_branches')
          .eq('business_id', businessId)
          .maybeSingle()
        if (error && arSchemaSaknas(error)) return true
        return false
      } catch {
        return false
      }
    },

    async getAutomationSettings() {
      try {
        const { data, error } = await supabase
          .from('v3_automation_settings')
          .select(
            'work_start, work_end, work_days, night_mode_enabled, min_job_value_sek, require_approval_send_quote, require_approval_send_invoice, require_approval_create_booking, lead_response_target_minutes, created_at, updated_at',
          )
          .eq('business_id', businessId)
          .maybeSingle()
        if (error) {
          if (arSchemaSaknas(error)) return { row: null, degraded: false }
          await rapporteraTystFel(supabase, businessId, 'company-model:v3_automation_settings', error.message)
          return { row: null, degraded: true }
        }
        return { row: data, degraded: false }
      } catch (err: any) {
        await rapporteraTystFel(supabase, businessId, 'company-model:v3_automation_settings', err?.message || String(err))
        return { row: null, degraded: true }
      }
    },

    async getConfirmedKnowledge() {
      try {
        const { data, error } = await supabase
          .from('business_knowledge')
          .select('id, knowledge_type, title, observation, created_at')
          .eq('business_id', businessId)
          .eq('status', 'active')
          .in('knowledge_type', [...CONFIRMED_KNOWLEDGE_TYPES])
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) {
          if (arSchemaSaknas(error)) return { rows: [], degraded: false }
          await rapporteraTystFel(supabase, businessId, 'company-model:business_knowledge', error.message)
          return { rows: [], degraded: true }
        }
        return { rows: (data || []) as RawConfirmedKnowledgeRow[], degraded: false }
      } catch (err: any) {
        await rapporteraTystFel(supabase, businessId, 'company-model:business_knowledge', err?.message || String(err))
        return { rows: [], degraded: true }
      }
    },
  }
}

export async function loadCompanyModelFromRepository(
  businessId: string,
  repository: CompanyModelRepository,
): Promise<CompanyModel> {
  const [businessConfigResult, automationResult, knowledgeResult] = await Promise.all([
    repository.getBusinessConfig(),
    repository.getAutomationSettings(),
    repository.getConfirmedKnowledge(),
  ])

  // secondary_branches-degradering är bara relevant att kolla separat om
  // huvudraden faktiskt lästes via den snabbare fallback-vägen ovan (som
  // redan avgjorde det). Vi frågar bara igen om huvudläsningen aldrig
  // körde den kollen (dvs. den lyckades direkt med alla kolumner) — i så
  // fall är secondary_branches per definition INTE degraderad (den kom
  // med i samma lyckade select).
  const secondaryBranchesDegraded = businessConfigResult.row
    ? businessConfigResult.row.secondary_branches === null
      && !Array.isArray(businessConfigResult.row.secondary_branches)
      && await repository.getSecondaryBranchesDegraded()
    : false

  return byggCompanyModel({
    businessId,
    businessConfig: businessConfigResult.row,
    businessConfigDegraded: businessConfigResult.degraded,
    secondaryBranchesDegraded,
    automationSettings: automationResult.row,
    automationSettingsDegraded: automationResult.degraded,
    confirmedKnowledgeRows: knowledgeResult.rows,
    confirmedKnowledgeDegraded: knowledgeResult.degraded,
  })
}

export async function loadCompanyModel(
  supabase: SupabaseClient,
  businessId: string,
): Promise<CompanyModel> {
  return loadCompanyModelFromRepository(businessId, createCompanyModelRepository(supabase, businessId))
}

// ─────────────────────────────────────────────────────────────────
// Prompt-formatering — kompakt, ärlig. Skriver ALDRIG en gissad siffra;
// saknade fält blir "(ej angivet)", oäkta systemdefaults märks explicit.
// ─────────────────────────────────────────────────────────────────

/** Timpris-raden — återanvänds direkt av system-prompt.ts/strategi-/
    ekonomi-agenten (som redan har pricing_settings i scope och inte
    behöver en full CompanyModel-laddning för en enda siffra). */
export function formatHourlyRateForPrompt(field: CompanyField<number>): string {
  if (field.value === null) {
    return 'Timpris: EJ ANGIVET — fråga ägaren innan du citerar ett pris för arbete, gissa aldrig.'
  }
  return `Timpris: ${field.value} kr/tim (exkl. moms)`
}

function formatKr(n: number): string {
  return `${Math.round(n).toLocaleString('sv-SE')} kr`
}

export function byggCompanyModelPromptBlock(model: CompanyModel): string {
  const lines: string[] = []

  lines.push(
    model.hourly_rate.value !== null
      ? `- Timpris: ${model.hourly_rate.value} kr/tim`
      : '- Timpris: (ej angivet — fråga ägaren, citera aldrig ett gissat pris)',
  )
  lines.push(
    model.vat_rate.value !== null
      ? `- Moms: ${model.vat_rate.value}%`
      : '- Moms: (ej angivet)',
  )
  lines.push(
    model.revenue_target_annual_sek.value !== null
      ? `- Årsomsättningsmål: ${formatKr(model.revenue_target_annual_sek.value)}/år`
      : '- Årsomsättningsmål: (ej angivet)',
  )
  lines.push(
    model.margin_target_percent.value !== null
      ? `- Marginalmål: ${model.margin_target_percent.value}% (bekräftat av ägaren)`
      : '- Marginalmål: (ej angivet — hitta aldrig på en tröskel)',
  )

  // Svensk etikett ur lib/branch — aldrig råa ID:n ("electrician") i prompten.
  const branch = model.branch.value
  const extra = model.secondary_branches.value
  lines.push(
    branch
      ? `- Bransch: ${describeBranches(resolveBusinessBranch({ branch, secondary_branches: extra }))}`
      : '- Bransch: (ej angivet)',
  )

  lines.push(
    model.payment_terms_days.authority === 'hardcoded_default'
      ? `- Betalningsvillkor: ${model.payment_terms_days.value} dagar (systemets standardvärde, ej uttryckligen satt av ägaren)`
      : `- Betalningsvillkor: ${model.payment_terms_days.value} dagar`,
  )

  if (model.knowledge_base.authority === 'seeded_default') {
    lines.push('- Kunskapsbas: standardmall för branschen, inte anpassad av ägaren ännu')
  }

  const confirmed = model.confirmed_knowledge.value
  if (confirmed && confirmed.length > 0) {
    lines.push(`- Bekräftade regler/mönster (${confirmed.length} st):`)
    for (const item of confirmed.slice(0, 8)) {
      lines.push(`  - ${item.text}`)
    }
  }

  if (model.degraded_sources.length > 0) {
    lines.push(`[Källor som inte kunde läsas just nu: ${model.degraded_sources.join(', ')}]`)
  }

  return ['## Företagsfakta (källmärkta — hitta aldrig på ett saknat värde)', ...lines].join('\n')
}
