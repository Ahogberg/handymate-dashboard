/**
 * "Skickat via Handymate" — attributionsstämpeln på alla kundvända
 * dokument och mejl (offert, faktura, kundportal, e-post).
 *
 * Texten visas ALLTID. Ordet "Handymate" länkar till företagets
 * rekommendationssida (/via/<referral_code>) när
 *   1. företaget inte stängt av länken (business_config.attribution_link_enabled,
 *      sql/v200 — saknad/null kolumn tolkas som PÅ), och
 *   2. företaget har en referral_code (lib/referral/codes.ts — kan vara
 *      null på gamla konton).
 *
 * Alla ytor importerar härifrån; ingen yta bygger sin egen sträng.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAppBaseUrl } from '@/lib/site-url'

export const ATTRIBUTION_TEXT = 'Skickat via Handymate'

export type Attribution = { text: string; url: string | null }

export type AttributionSource = {
  referral_code?: string | null
  attribution_link_enabled?: boolean | null
}

const BRAND = 'Handymate'
const PREFIX = 'Skickat via '
const LINK_COLOR = '#0F766E'
const MUTED_COLOR = '#6b7280'

export function buildAttribution(cfg: AttributionSource | null | undefined): Attribution {
  const code = (cfg?.referral_code ?? '').trim()
  const linkEnabled = cfg?.attribution_link_enabled !== false
  const url = linkEnabled && code ? `${getAppBaseUrl()}/via/${encodeURIComponent(code)}` : null
  return { text: ATTRIBUTION_TEXT, url }
}

/**
 * Hämtar stämpelns underlag för ett företag med EN query — för ytor som
 * inte redan har business_config-raden i scope (`select('*')`; den som har
 * det anropar buildAttribution(raden) direkt).
 *
 * Kolumnen attribution_link_enabled kommer i sql/v200. PostgREST fäller
 * hela selecten om en begärd kolumn saknas, så innan v200 är körd faller
 * vi tillbaka på bara referral_code (saknad kolumn = länken PÅ). Kastar
 * aldrig — vid fel blir det texten utan länk, utskicket får inte stanna
 * på stämpeln.
 */
export async function loadAttribution(
  supabase: SupabaseClient,
  businessId: string,
): Promise<Attribution> {
  try {
    const full = await supabase
      .from('business_config')
      .select('referral_code, attribution_link_enabled')
      .eq('business_id', businessId)
      .maybeSingle()
    if (!full.error) return buildAttribution(full.data)

    const fallback = await supabase
      .from('business_config')
      .select('referral_code')
      .eq('business_id', businessId)
      .maybeSingle()
    if (!fallback.error) {
      return buildAttribution({ referral_code: fallback.data?.referral_code, attribution_link_enabled: undefined })
    }
    return buildAttribution(null)
  } catch {
    return buildAttribution(null)
  }
}

/** Ordet "Handymate" som länk (om url) eller ren text. */
function brandMarkup(a: Attribution, linkStyle: string): string {
  return a.url ? `<a href="${a.url}" style="${linkStyle}">${BRAND}</a>` : BRAND
}

/** Fotrad för utgående e-post (HTML). */
export function attributionEmailHtml(a: Attribution): string {
  const brand = brandMarkup(a, `color:${LINK_COLOR};text-decoration:none`)
  return `<p style="margin:24px 0 0;font-size:12px;color:${MUTED_COLOR};text-align:center">${PREFIX}${brand}</p>`
}

/** Fotrad för HTML→PDF-mallarna (puppeteer) — länken blir klickbar i PDF:en. */
export function attributionDocumentHtml(a: Attribution): string {
  const brand = brandMarkup(a, `color:${LINK_COLOR};text-decoration:none`)
  return `<div class="hm-attribution" style="margin-top:16pt;font-size:9pt;color:${MUTED_COLOR};text-align:center">${PREFIX}${brand}</div>`
}

/** För jsPDF (doc.textWithLink): bara text + url. */
export function attributionPdfText(a: Attribution): { text: string; url: string | null } {
  return { text: a.text, url: a.url }
}
