/**
 * Företagets varumärke på kundvända ytor — EN sanning (2026-09-07).
 *
 * Före den här filen valde varje mailväg själv vilka kolumner den läste
 * ur business_config: offertmailet hade logotyp + accentfärg, fakturamailet
 * hårdkodad teal utan logotyp, bekräftelsen efter signering inget alls.
 * Samma kund fick tre visuella identiteter i samma affär. Nu läser alla
 * kundmail sitt varumärke härifrån och renderar genom emailLayout()
 * (lib/email-templates.ts) — Claude Designs master blir ett byte i EN fil.
 *
 * Kontrakt:
 *  - accentColor är ALLTID en giltig #rrggbb (valideras, fallback teal).
 *  - Stämpeln ("Skickat via Handymate", lib/branding/attribution.ts) ingår.
 *  - loadBranding kastar aldrig — vid fel blir det neutralt varumärke med
 *    firmanamn "Handymate"; ett utskick får inte stanna på varumärket.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAttribution, type Attribution } from './attribution'

/** Handymates teal — fallback när företaget inte valt accentfärg. */
export const DEFAULT_ACCENT_COLOR = '#0F766E'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export interface Branding {
  businessName: string
  /** Validerad #rrggbb, aldrig tom. */
  accentColor: string
  logoUrl?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  orgNumber?: string
  swishNumber?: string
  bankgiro?: string
  attribution: Attribution
}

/** Raden ur business_config som varumärket byggs av (select('*') duger också). */
export type BrandingSource = {
  business_name?: string | null
  display_name?: string | null
  contact_name?: string | null
  contact_email?: string | null
  phone_number?: string | null
  public_phone?: string | null
  org_number?: string | null
  logo_url?: string | null
  accent_color?: string | null
  swish_number?: string | null
  bankgiro?: string | null
  referral_code?: string | null
  attribution_link_enabled?: boolean | null
}

/** Kolumnlistan för loadBranding — utan attribution_link_enabled (sql/v202), se fallback. */
export const BRANDING_COLUMNS =
  'business_name, display_name, contact_name, contact_email, phone_number, public_phone, org_number, logo_url, accent_color, swish_number, bankgiro, referral_code'

export function normalizeAccentColor(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  return HEX_COLOR.test(v) ? v : DEFAULT_ACCENT_COLOR
}

function clean(value: string | null | undefined): string | undefined {
  const v = (value ?? '').trim()
  return v ? v : undefined
}

/**
 * Synkron variant för anropare som redan har business_config-raden i
 * scope (select('*')) — ingen extra query.
 */
export function brandingFromConfig(row: BrandingSource | null | undefined): Branding {
  return {
    businessName: clean(row?.business_name) ?? clean(row?.display_name) ?? 'Handymate',
    accentColor: normalizeAccentColor(row?.accent_color),
    logoUrl: clean(row?.logo_url),
    contactName: clean(row?.contact_name),
    contactEmail: clean(row?.contact_email),
    contactPhone: clean(row?.public_phone) ?? clean(row?.phone_number),
    orgNumber: clean(row?.org_number),
    swishNumber: clean(row?.swish_number),
    bankgiro: clean(row?.bankgiro),
    attribution: buildAttribution(row),
  }
}

/**
 * Hämtar varumärket med EN query. Kastar aldrig. Provar först med
 * attribution_link_enabled (kolumnen kommer i sql/v202 — PostgREST fäller
 * hela selecten om den saknas), faller sedan tillbaka på BRANDING_COLUMNS
 * (saknad kolumn = länken PÅ, samma regel som loadAttribution).
 */
export async function loadBranding(supabase: SupabaseClient, businessId: string): Promise<Branding> {
  try {
    const full = await supabase
      .from('business_config')
      .select(`${BRANDING_COLUMNS}, attribution_link_enabled`)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!full.error) return brandingFromConfig(full.data as BrandingSource | null)

    const fallback = await supabase
      .from('business_config')
      .select(BRANDING_COLUMNS)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!fallback.error) return brandingFromConfig(fallback.data as BrandingSource | null)

    return brandingFromConfig(null)
  } catch {
    return brandingFromConfig(null)
  }
}
