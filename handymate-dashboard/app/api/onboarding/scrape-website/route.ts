import { checkFuelGate } from '@/lib/costs/fuel'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getClaudeModel } from '@/lib/ai/get-model'
import { checkRateLimitDb } from '@/lib/rate-limit-db'
import { getServerSupabase } from '@/lib/supabase'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'
import {
  normalizeWebsiteUrl,
  htmlToExtractableText,
  parseExtractionJson,
  buildScrapeRateLimitKey,
  extractClientIp,
  SCRAPE_MIN_TEXT_CHARS,
} from '@/lib/onboarding/website-scrape'
import { fetchWebsiteWithSsrfGuard } from '@/lib/onboarding/website-fetch'

export const dynamic = 'force-dynamic'

/**
 * Hämtningen får kosta upp till 8 s (SCRAPE_TIMEOUT_MS) och Haiku-
 * extraktionen några sekunder till. Utan den här raden gäller Vercels
 * default på 10 s för serverless-funktioner — funktionen dödades alltså
 * mitt i extraktionen så fort kundens sajt svarade långsamt, och kunden
 * fick "Jag kunde inte läsa sidan" trots att läsningen var på väg att
 * lyckas. 30 s ligger tryggt under Hobby-planens tak på 60 s.
 */
export const maxDuration = 30

/**
 * POST /api/onboarding/scrape-website
 *
 * Del 2 av hemsida-förgreningen (tasks/hemsida-forgrening-spec.md). Kunden
 * anger sin hemsida i onboardingen — vi läser den server-side och låter
 * Haiku extrahera fält (namn, org.nr, tjänster, kontaktuppgifter, ...) för
 * att förifylla onboardingen. Extraktionen gissar ALDRIG — Haiku instrueras
 * att returnera null för allt som inte faktiskt står på sidan.
 *
 * Hemsida-förgreningen flyttades till BÖRJAN av företagssteget (Step2Business)
 * — frågan ställs nu innan kontot skapas, alltså innan det finns någon
 * inloggad session. Routen kräver därför INTE längre getAuthenticatedBusiness
 * som hårt villkor:
 *  - Finns en session (t.ex. en resumande användare mitt i onboardingen) →
 *    används den för spårning (rate limit per business).
 *  - Finns ingen session → tillåts anropet ändå, men hastighetsbegränsas
 *    obligatoriskt per IP (checkRateLimitDb, se buildScrapeRateLimitKey).
 * Detta är fortsatt en SSRF-känslig endpoint (server-side fetch mot en
 * kundangiven URL) — därför är SSRF-skydden nedan oförändrade och gäller
 * lika strikt oavsett auth-status.
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

// SSRF-skyddad hämtning: lib/onboarding/website-fetch.ts (bruten ut i
// pass 1b, tasks/plan-launch-desk-signaler.md, så att Launch Desk-
// signalerna kan återanvända EXAKT samma skydd — se den filens doc-kommentar
// för det fulla resonemanget om DNS-rebinding, redirects och storlekstak).

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
    // Ingen hård auth-spärr längre — se doc-kommentaren ovan. Sessionen
    // används bara för att spåra per business istället för per IP när den
    // finns; ett fel/timeout i auth-uppslaget ska inte blockera flödet.
    const business = await getAuthenticatedBusiness(request).catch(() => null)

    // Med session gäller Bränslestoppet (extraktionen nedan kostar tokens och
    // bokförs på kunden). Utan session: Handymates förvärvskostnad.
    if (business) {
      const fuel = await checkFuelGate(getServerSupabase(), business.business_id)
      if (!fuel.allowed) {
        return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
      }
    }

    const ip = extractClientIp(
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-real-ip'),
    )
    const rateLimitKey = buildScrapeRateLimitKey(ip, business?.business_id ?? null)
    const rateLimit = await checkRateLimitDb(rateLimitKey, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000, // 1 timme
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, reason: 'Du har provat lite för många gånger — vänta en stund och försök igen.' },
        { status: 429 },
      )
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

    const fetchResult = await fetchWebsiteWithSsrfGuard(normalized.url)
    if (!fetchResult.ok) {
      return NextResponse.json({ ok: false, reason: fetchResult.reason, normalizedUrl: normalized.url })
    }

    const text = htmlToExtractableText(fetchResult.html)
    if (!text || text.length < SCRAPE_MIN_TEXT_CHARS) {
      // För lite innehåll för att vara värt en LLM-extraktion (parkerad
      // domän, "sida under uppbyggnad", JS-only SPA som inte renderat, ...).
      return NextResponse.json({ ok: false, reason: 'Sidan innehöll för lite text för att läsas', normalizedUrl: normalized.url })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[scrape-website] ANTHROPIC_API_KEY saknas — degraderar utan extraktion')
      return NextResponse.json({ ok: false, reason: 'Extraktion är inte tillgänglig just nu', normalizedUrl: normalized.url })
    }

    let extraction = null
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const extractionModel = getClaudeModel('extraction')
      const response = await anthropic.messages.create({
        model: extractionModel,
        max_tokens: 1024,
        messages: [{ role: 'user', content: `${EXTRACTION_PROMPT_HEADER}\n${text}\n"""` }],
      })

      // COGS-boken — bokförs bara om vi har en inloggad session (se
      // doc-kommentaren ovan: routen tillåts köra utan session, och utan
      // business_id finns ingen kund att bokföra kostnaden på).
      if (business) {
        const supabase = getServerSupabase()
        await meterDirectLlmCall({
          supabase,
          businessId: business.business_id,
          usage: response.usage,
          costUsd: llmCostUsd(response.usage, extractionModel),
          refType: 'onboarding_scrape_website',
          refId: normalized.url,
        })
      }

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
