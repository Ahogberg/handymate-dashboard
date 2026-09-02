/**
 * Delad SSRF-skyddad hämtning av en extern webbsida (server-only).
 *
 * Bruten ut ur app/api/onboarding/scrape-website/route.ts (hemsida-
 * förgreningen) i pass 1b (tasks/plan-launch-desk-signaler.md) så att
 * Launch Desk-signalerna (app/api/admin/launch/accounts/[id]/signaler)
 * kan återanvända EXAKT samma SSRF-skydd istället för att duplicera det.
 * Skyddet i sig är oförändrat — samma logik, bara flyttad.
 *
 * VIKTIGT: importerar node:dns — får ALDRIG importeras från klientkod.
 * Till skillnad från lib/onboarding/website-scrape.ts (som är säker att
 * bunta in i klienten) är den här filen server-only.
 *
 * SSRF-skydd:
 *  - Bara http/https-scheman.
 *  - Blockerar interna/privata mål på strängnivå (localhost, .local, IP-
 *    literaler i privata/reserverade block) INNAN nätverksanrop görs.
 *  - DNS-upplöser hostnamnet och validerar VARJE upplöst IP mot samma
 *    privata/reserverade block (skyddar mot DNS-rebinding).
 *  - Följer redirects MANUELLT och validerar varje hopp på nytt innan det
 *    följs — en publik URL kan annars redirecta internt.
 *  - Timeout (AbortController), storlekstak (strömmas med hård
 *    brytpunkt, litar inte på Content-Length), identifierande User-Agent.
 */
import dns from 'node:dns'
import {
  isBlockedHostname,
  isPrivateOrReservedIp,
  SCRAPE_TIMEOUT_MS,
  SCRAPE_MAX_BYTES,
  SCRAPE_MAX_REDIRECTS,
  SCRAPE_USER_AGENT,
} from './website-scrape'

export type WebsiteFetchResult = { ok: true; html: string } | { ok: false; reason: string }

export interface WebsiteFetchOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  userAgent?: string
}

async function resolveHostIsBlocked(hostname: string): Promise<boolean> {
  if (isBlockedHostname(hostname)) return true
  try {
    const addrs = await dns.promises.lookup(hostname, { all: true })
    if (addrs.length === 0) return true // inget svar — inget att läsa, och inget att chansa på
    return addrs.some(a => isPrivateOrReservedIp(a.address))
  } catch {
    // DNS-uppslaget misslyckades — kan inte verifiera att målet är säkert,
    // blockera hellre än att chansa (fail-closed).
    return true
  }
}

/**
 * Hämtar `startUrl` med SSRF-skyddet ovan. Degraderar ALLTID snällt —
 * kastar aldrig, returnerar { ok:false, reason } för allt som går fel.
 */
export async function fetchWebsiteWithSsrfGuard(
  startUrl: string,
  options: WebsiteFetchOptions = {},
): Promise<WebsiteFetchResult> {
  const timeoutMs = options.timeoutMs ?? SCRAPE_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? SCRAPE_MAX_BYTES
  const maxRedirects = options.maxRedirects ?? SCRAPE_MAX_REDIRECTS
  const userAgent = options.userAgent ?? SCRAPE_USER_AGENT

  let currentUrl = startUrl

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL
    try {
      parsed = new URL(currentUrl)
    } catch {
      return { ok: false, reason: 'Ogiltig webbadress' }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'Bara http eller https stöds' }
    }
    if (await resolveHostIsBlocked(parsed.hostname)) {
      return { ok: false, reason: 'Den adressen pekar på ett internt mål och kan inte läsas' }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': userAgent, Accept: 'text/html,text/plain' },
      })
    } catch {
      clearTimeout(timer)
      return { ok: false, reason: 'Kunde inte nå sidan (timeout eller nätverksfel)' }
    }
    clearTimeout(timer)

    // Manuell redirect-hantering — nästa varv validerar det NYA målet mot
    // SSRF-skyddet innan det följs (en publik URL kan annars redirecta internt).
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return { ok: false, reason: 'Sidan svarade med en redirect utan mål' }
      try {
        currentUrl = new URL(location, currentUrl).toString()
      } catch {
        return { ok: false, reason: 'Sidan redirectade till en ogiltig adress' }
      }
      continue
    }

    if (!res.ok) {
      return { ok: false, reason: `Sidan svarade med fel (status ${res.status})` }
    }

    const contentType = res.headers.get('content-type') || ''
    if (contentType && !/text\/html|text\/plain/i.test(contentType)) {
      return { ok: false, reason: 'Sidan innehöll inte läsbar text' }
    }

    // Läs strömmen med ett hårt storlekstak — litar inte på Content-Length
    // (kan saknas eller vara felaktig).
    const reader = res.body?.getReader()
    if (!reader) {
      const text = await res.text()
      return { ok: true, html: text.slice(0, maxBytes) }
    }

    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > maxBytes) {
          try { await reader.cancel() } catch { /* best effort */ }
          break
        }
        chunks.push(value)
      }
    }
    const html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8')
    return { ok: true, html }
  }

  return { ok: false, reason: 'För många omdirigeringar' }
}
