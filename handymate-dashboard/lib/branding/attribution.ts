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
