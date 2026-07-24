import { NextRequest, NextResponse } from 'next/server'
import dns from 'node:dns'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getClaudeModel } from '@/lib/ai/get-model'
import {
  normalizeWebsiteUrl,
  isBlockedHostname,
  isPrivateOrReservedIp,
  htmlToExtractableText,
  parseExtractionJson,
  SCRAPE_TIMEOUT_MS,
  SCRAPE_MAX_BYTES,
  SCRAPE_MAX_REDIRECTS,
  SCRAPE_USER_AGENT,
} from '@/lib/onboarding/website-scrape'

export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/scrape-website
 *
 * Del 2 av hemsida-förgreningen (tasks/hemsida-forgrening-spec.md). Kunden
 * anger sin hemsida i onboardingen — vi läser den server-side och låter
 * Haiku extrahera fält (namn, org.nr, tjänster, kontaktuppgifter, ...) för
 * att förifylla onboardingen. Extraktionen gissar ALDRIG — Haiku instrueras
 * att returnera null för allt som inte faktiskt står på sidan.
 *
 * Kräver autentiserad business (auth via getAuthenticatedBusiness) — detta
 * är en SSRF-känslig endpoint (server-side fetch mot en kundangiven URL) och
 * ska aldrig vara nåbar utan inloggad session.
 *
 * SSRF-skydd:
 *  - Bara http/https-scheman.
 *  - Blockerar interna/privata mål på strängnivå (localhost, .local, IP-
 *    literaler i privata/reserverade block) INNAN nätverksanrop görs.
 *  - DNS-upplöser hostnamnet och validerar VARJE upplöst IP mot samma
 *    privata/reserverade block (skyddar mot DNS-rebinding: en publik
 *    hostname som pekar på en intern IP).
 *  - Följer redirects MANUELLT (redirect:'manual') och validerar varje hopp
 *    på nytt innan det följs — en publik URL kan annars redirecta internt.
 *  - Timeout ~8s (AbortController), storlekstak ~1MB (strömmas med hård
 *    brytpunkt, litar inte på Content-Length), identifierande User-Agent.
 *
 * Degraderar ALLTID snällt: kundens sajt kan vara trasig, nere, sakna HTTPS,
 * etc. — routen returnerar aldrig 500 för det, bara { ok:false, reason }.
 */

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

type FetchResult = { ok: true; html: string } | { ok: false; reason: string }

async function fetchWithSsrfGuard(startUrl: string): Promise<FetchResult> {
  let currentUrl = startUrl

  for (let hop = 0; hop <= SCRAPE_MAX_REDIRECTS; hop++) {
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
    const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': SCRAPE_USER_AGENT, Accept: 'text/html,text/plain' },
      })
    } catch {
      clearTimeout(timer)
      return { ok: false, reason: 'Kunde inte nå sidan (timeout eller nätverksfel)' }
    }
    clearTimeout(timer)

    // Manuell redirect-hantering — nästa varv validerar det NYA målet mot
    // SSRF-skyddet innan det följs (en publik URL kan redirecta internt).
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

    // Läs strömmen med ett hårt storlekstak (~1MB) — litar inte på
    // Content-Length (kan saknas eller vara felaktig).
    const reader = res.body?.getReader()
    if (!reader) {
      const text = await res.text()
      return { ok: true, html: text.slice(0, SCRAPE_MAX_BYTES) }
    }

    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > SCRAPE_MAX_BYTES) {
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

const EXTRACTION_PROMPT_HEADER = `Du läser text extraherad från ett svenskt hantverksföretags hemsida.

Hitta BARA information som faktiskt står i texten nedan. Gissa ALDRIG
organisationsnummer, priser, adress eller andra fält — om du inte hittar ett
fält i texten, sätt det till null. Hitta hellre för lite än att chansa.

Svara med ENBART ett JSON-objekt (ingen markdown, inga kommentarer, inga
code blocks) med exakt dessa nycklar:
{
  "business_name": string|null,
  "org_number": string|null,
  "description": string|null,
  "services": string[]|null,
  "phone": string|null,
  "email": string|null,
  "address": string|null,
  "service_area": string|null,
  "opening_hours": string|null
}

Text från hemsidan:
"""`

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const rawUrl = body?.url
    if (!rawUrl || typeof rawUrl !== 'string') {
      return NextResponse.json({ ok: false, reason: 'Ingen adress angavs' })
    }

    const normalized = normalizeWebsiteUrl(rawUrl)
    if (!normalized.ok) {
      return NextResponse.json({ ok: false, reason: normalized.reason })
    }

    const fetchResult = await fetchWithSsrfGuard(normalized.url)
    if (!fetchResult.ok) {
      return NextResponse.json({ ok: false, reason: fetchResult.reason, normalizedUrl: normalized.url })
    }

    const text = htmlToExtractableText(fetchResult.html)
    if (!text || text.length < 20) {
      return NextResponse.json({ ok: false, reason: 'Sidan innehöll ingen läsbar text', normalizedUrl: normalized.url })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[scrape-website] ANTHROPIC_API_KEY saknas — degraderar utan extraktion')
      return NextResponse.json({ ok: false, reason: 'Extraktion är inte tillgänglig just nu', normalizedUrl: normalized.url })
    }

    let extraction = null
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const response = await anthropic.messages.create({
        model: getClaudeModel('extraction'),
        max_tokens: 1024,
        messages: [{ role: 'user', content: `${EXTRACTION_PROMPT_HEADER}\n${text}\n"""` }],
      })
      const textBlock = response.content.find(b => b.type === 'text')
      if (textBlock && textBlock.type === 'text') {
        extraction = parseExtractionJson(textBlock.text)
      }
    } catch (err) {
      console.error('[scrape-website] Haiku-extraktion misslyckades:', err)
    }

    if (!extraction) {
      return NextResponse.json({ ok: false, reason: 'Kunde inte tolka sidans innehåll', normalizedUrl: normalized.url })
    }

    return NextResponse.json({ ok: true, extracted: extraction, normalizedUrl: normalized.url })
  } catch (error: unknown) {
    // Aldrig 500 pga kundens (trasiga) sajt — degradera snällt, samma
    // "aldrig fastna"-princip som resten av hemsida-förgreningen.
    console.error('[scrape-website] oväntat fel:', error)
    return NextResponse.json({ ok: false, reason: 'Något gick fel — fyll i manuellt istället' })
  }
}
