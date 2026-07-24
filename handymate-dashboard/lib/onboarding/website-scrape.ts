/**
 * Rena hjälpfunktioner för hemsida-skrapningen (hemsida-förgreningen, Del 2).
 * Delas mellan app/api/onboarding/scrape-website/route.ts (server, gör
 * själva nätverks-/DNS-anropen) och Step2Business.tsx (client, validerar
 * URL:en innan den ens skickas till servern).
 *
 * VIKTIGT: den här filen importerar ALDRIG node-specifika moduler (dns, net,
 * fs, ...) — den måste vara säker att buntas in i klient-bundlen. DNS-
 * uppslag för SSRF-skyddet ligger i route.ts, som är server-only.
 *
 * Testas i tests/hemsida-forgrening.spec.ts (rena funktioner, ingen nätverk/
 * DB) — kör med: npx playwright test tests/hemsida-forgrening.spec.ts --no-deps
 */

export const SCRAPE_TIMEOUT_MS = 8_000
export const SCRAPE_MAX_BYTES = 1_000_000 // ~1 MB
export const SCRAPE_MAX_TEXT_CHARS = 18_000
export const SCRAPE_MAX_REDIRECTS = 3
export const SCRAPE_USER_AGENT =
  'HandymateBot/1.0 (+https://app.handymate.se; läser in kunddata vid onboarding)'

export interface NormalizedUrlOk {
  ok: true
  url: string
  hostname: string
}
export interface NormalizedUrlError {
  ok: false
  reason: string
}
export type NormalizedUrlResult = NormalizedUrlOk | NormalizedUrlError

/**
 * Normaliserar kundens URL-input: lägger till https:// om schema saknas,
 * validerar att resultatet är en giltig http(s)-URL med hostnamn.
 * Gissar aldrig — ogiltig input ger ett tydligt svenskt felmeddelande.
 */
export function normalizeWebsiteUrl(raw: string): NormalizedUrlResult {
  const trimmed = (raw || '').trim()
  if (!trimmed) {
    return { ok: false, reason: 'Ingen adress angavs' }
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return { ok: false, reason: 'Det där ser inte ut som en giltig webbadress' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Bara http eller https stöds' }
  }

  if (!parsed.hostname) {
    return { ok: false, reason: 'Det där ser inte ut som en giltig webbadress' }
  }

  return { ok: true, url: parsed.toString(), hostname: parsed.hostname.toLowerCase() }
}

/**
 * SSRF-skydd, del 1: är en IP-adress privat/reserverad (interna nät,
 * loopback, link-local, ...)? Ren funktion — testas direkt utan DNS.
 * Körs mot DNS-upplösta IP:er i route.ts (server) och mot host-strängar
 * som redan är IP-literaler i isBlockedHostname nedan.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = parseInt(v4[1], 10)
    const b = parseInt(v4[2], 10)
    if ([a, b, parseInt(v4[3], 10), parseInt(v4[4], 10)].some(n => n > 255)) return true // ogiltig — blockera hellre
    if (a === 127) return true // 127.0.0.0/8 loopback
    if (a === 10) return true // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
    if (a === 0) return true // 0.0.0.0/8
    return false
  }

  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true // IPv6 loopback / unspecified
  if (lower.startsWith('fe80:')) return true // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7 (ULA)

  // IPv4-mappad IPv6 (::ffff:a.b.c.d) — packa upp och kolla igen.
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateOrReservedIp(mapped[1])

  return false
}

/**
 * SSRF-skydd, del 2: blockera kända interna hostnamn på strängnivå INNAN
 * DNS-uppslag görs (localhost, .local/mDNS, samt hostnamn som redan är en
 * privat IP-literal, ev. inringad som [::1]).
 */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local')) return true
  if (h === '0' || h === '0.0.0.0') return true

  const bracket = h.match(/^\[(.+)\]$/)
  const ipCandidate = bracket ? bracket[1] : h
  const looksLikeIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipCandidate) || ipCandidate.includes(':')
  if (looksLikeIp) return isPrivateOrReservedIp(ipCandidate)

  return false
}

/**
 * Strippar HTML till ren text inför LLM-extraktion: tar bort script/style/
 * nav/footer-brus och HTML-kommentarer, avkodar vanliga entiteter,
 * komprimerar whitespace, kortar till SCRAPE_MAX_TEXT_CHARS tecken.
 */
export function htmlToExtractableText(html: string): string {
  let s = html
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/<[^>]+>/g, ' ')
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
  s = s.replace(/\s+/g, ' ').trim()
  return s.slice(0, SCRAPE_MAX_TEXT_CHARS)
}

export interface ScrapedExtraction {
  business_name: string | null
  org_number: string | null
  description: string | null
  services: string[] | null
  phone: string | null
  email: string | null
  address: string | null
  service_area: string | null
  opening_hours: string | null
}

/**
 * Parsar Haikus JSON-svar defensivt (kan komma inbäddat i ```json-block).
 * Returnerar null vid parse-fel — anropande route degraderar till ok:false.
 * Fält som inte är strängar/arrayer med strängar räknas som "hittades inte"
 * (null) snarare än att faila hela parsningen.
 */
export function parseExtractionJson(raw: string): ScrapedExtraction | null {
  if (!raw) return null
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const obj = parsed as Record<string, unknown>
  const pick = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const services = Array.isArray(obj.services)
    ? obj.services.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.trim())
    : null

  return {
    business_name: pick(obj.business_name),
    org_number: pick(obj.org_number),
    description: pick(obj.description),
    services: services && services.length > 0 ? services : null,
    phone: pick(obj.phone),
    email: pick(obj.email),
    address: pick(obj.address),
    service_area: pick(obj.service_area),
    opening_hours: pick(obj.opening_hours),
  }
}
