import {
  GTM_CHANNELS,
  GTM_CONTACT_BASES,
  GTM_LEGAL_FORMS,
  type GtmAccountInput,
  type GtmChannel,
  type GtmContactBasis,
  type GtmLegalForm,
  type GtmSourceFact,
} from './types'
import { calculateFit } from './scoring'
import { suggestedChannelIsEligible } from './policy'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'

const MAX_IMPORT = 500

export function cleanText(value: unknown, max = 500): string | null {
  if (value === null || value === undefined) return null
  const cleaned = String(value).trim()
  return cleaned ? cleaned.slice(0, max) : null
}

export function normalizeOrgNumber(value: unknown): string | null {
  const cleaned = cleanText(value, 32)?.replace(/[^0-9]/g, '') || null
  if (!cleaned) return null
  return cleaned.length === 10 ? cleaned : null
}

export function normalizeEmail(value: unknown): string | null {
  const email = cleanText(value, 320)?.toLowerCase() || null
  if (!email) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

export function normalizePhone(value: unknown): string | null {
  const raw = cleanText(value, 64)
  if (!raw) return null
  const normalized = normalizeSwedishPhone(raw)
  const digits = normalized.replace(/[^0-9]/g, '')
  if (normalized.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return null
}

export function normalizeUrl(value: unknown): string | null {
  const raw = cleanText(value, 1000)
  if (!raw) return null
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const parsed = new URL(withScheme)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const candidate = cleanText(value, 100)
  return candidate && allowed.includes(candidate as T[number]) ? candidate as T[number] : fallback
}

export function normalizeUuid(value: unknown): string | null {
  const candidate = cleanText(value, 80)
  if (!candidate) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null
}

export function normalizeDateTime(value: unknown): string | null {
  const candidate = cleanText(value, 64)
  if (!candidate) return null
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function sourceFacts(value: unknown): GtmSourceFact[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const label = cleanText(row.label, 120)
    const factValue = cleanText(row.value, 500)
    if (!label || !factValue) return []
    return [{ label, value: factValue, source_url: normalizeUrl(row.source_url) }]
  })
}

export interface NormalizedAccount extends GtmAccountInput {
  org_number: string | null
  legal_form: GtmLegalForm
  contact_basis: GtmContactBasis
  suggested_channel: GtmChannel
  source_facts: GtmSourceFact[]
  fit_score: number
  fit_reasons: string[]
}

export function normalizeAccountInput(value: unknown): NormalizedAccount {
  if (!value || typeof value !== 'object') throw new Error('Prospektraden måste vara ett objekt')
  const row = value as Record<string, unknown>
  const companyName = cleanText(row.company_name, 240)
  const sourceName = cleanText(row.source_name, 160)
  const sourceCheckedAt = cleanText(row.source_checked_at, 64)
  if (!companyName) throw new Error('company_name saknas')
  if (!sourceName) throw new Error(`source_name saknas för ${companyName}`)
  if (!sourceCheckedAt || Number.isNaN(new Date(sourceCheckedAt).getTime())) {
    throw new Error(`source_checked_at saknas eller är ogiltigt för ${companyName}`)
  }

  const legalForm = enumValue(row.legal_form, GTM_LEGAL_FORMS, 'unknown')
  const contactBasis = enumValue(row.contact_basis, GTM_CONTACT_BASES, 'unknown')
  const suggestedChannel = enumValue(row.suggested_channel, GTM_CHANNELS, 'none')

  const normalized: GtmAccountInput = {
    org_number: normalizeOrgNumber(row.org_number),
    company_name: companyName,
    legal_form: legalForm,
    website: normalizeUrl(row.website),
    company_phone: normalizePhone(row.company_phone),
    company_email: normalizeEmail(row.company_email),
    municipality: cleanText(row.municipality, 160),
    county: cleanText(row.county, 160),
    sni_code: cleanText(row.sni_code, 40),
    industry: cleanText(row.industry, 240),
    employee_band: cleanText(row.employee_band, 80),
    turnover_band: cleanText(row.turnover_band, 80),
    source_name: sourceName,
    source_url: normalizeUrl(row.source_url),
    source_checked_at: new Date(sourceCheckedAt).toISOString(),
    source_facts: sourceFacts(row.source_facts),
    factual_notes: cleanText(row.factual_notes, 3000),
    primary_contact_name: cleanText(row.primary_contact_name, 160),
    primary_contact_role: cleanText(row.primary_contact_role, 160),
    primary_contact_email: normalizeEmail(row.primary_contact_email),
    primary_contact_phone: normalizePhone(row.primary_contact_phone),
    primary_contact_linkedin: normalizeUrl(row.primary_contact_linkedin),
    contact_basis: contactBasis,
    suggested_channel: suggestedChannel,
    owner_user_id: normalizeUuid(row.owner_user_id),
    next_action_at: normalizeDateTime(row.next_action_at),
  }

  if (!suggestedChannelIsEligible(legalForm, contactBasis, suggestedChannel)) {
    throw new Error(`Kanalen ${suggestedChannel} är inte tillåten för ${companyName}`)
  }

  const fit = calculateFit(normalized)
  return { ...normalized, fit_score: fit.score, fit_reasons: fit.reasons } as NormalizedAccount
}

export function normalizeAccountBatch(value: unknown): NormalizedAccount[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Minst ett prospekt krävs')
  if (value.length > MAX_IMPORT) throw new Error(`Högst ${MAX_IMPORT} prospekt per import`)
  return value.map(normalizeAccountInput)
}
