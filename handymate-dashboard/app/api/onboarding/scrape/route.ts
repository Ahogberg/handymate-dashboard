import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// Firecrawl kan vara långsam — kräver Pro (Hobby cappar på 10s).
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/scrape  { website }
 *
 * Skrapar hantverkarens egen hemsida (Firecrawl) → extraherar
 * företagsnamn/ort/tjänster/ton med Claude Haiku. Körs i fas A INNAN kontot
 * skapats → ingen business-auth. ALLA fel → { ok: false } så onboardingen
 * faller tillbaka på manuell ifyllnad (aldrig blockerande).
 *
 * TODO (v2): IP-rate-limit — routen är oautentiserad (pre-konto).
 */

function normalizeUrl(raw: string): string | null {
  let s = (raw || '').trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  try { return new URL(s).href } catch { return null }
}

const BRANCH_KEYS = ['electrician', 'plumber', 'carpenter', 'painter', 'hvac', 'locksmith', 'construction', 'roofing', 'flooring', 'gardening', 'cleaning', 'moving', 'other'] as const

const EXTRACT_PROMPT = `Du analyserar en svensk hantverkares hemsida (markdown). Extrahera företagsinfo.
Returnera ENDAST JSON (ingen markdown):
{
  "company_name": "exakt företagsnamn eller null",
  "ort": "huvudort/stad eller null",
  "services": ["tjänst1", "tjänst2"],
  "tone": "personlig" | "professionell" | "rak",
  "branch": "en av: electrician, plumber, carpenter, painter, hvac, locksmith, construction, roofing, flooring, gardening, cleaning, moving, other"
}
Regler:
- services: 2–6 konkreta tjänster på svenska (t.ex. "Badrumsrenovering", "Elinstallation"). Tom array om oklart.
- tone: bedöm språkets ton mot kund. Default "professionell" om oklart.
- branch: hantverkarens huvudbransch. Välj den BÄST matchande nyckeln. "other" om oklart/blandat.
- Hitta INTE på. Sätt null/[]/"other" hellre än att gissa.`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const url = normalizeUrl(body?.website)
    if (!url) return NextResponse.json({ ok: false, reason: 'invalid_url' })
    if (!process.env.FIRECRAWL_API_KEY || !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ ok: false, reason: 'not_configured' })
    }

    // 1. Skrapa via Firecrawl REST-API (fetch — undviker SDK:ns undici-beroende
    //    som inte går att bundla i Next). Graceful.
    let markdown = ''
    try {
      const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ['markdown'] }),
        signal: AbortSignal.timeout(20000),
      })
      const fcJson: any = await fcRes.json().catch(() => null)
      markdown = fcJson?.data?.markdown || fcJson?.markdown || ''
    } catch (e) {
      console.error('[onboarding/scrape] firecrawl error:', e)
      return NextResponse.json({ ok: false, reason: 'scrape_failed' })
    }
    if (!markdown.trim()) return NextResponse.json({ ok: false, reason: 'empty' })

    // 2. Extrahera med Haiku (samma mönster som lib/matte/intent-agent.ts)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: EXTRACT_PROMPT,
      messages: [{ role: 'user', content: `Hemsida (${url}):\n\n${markdown.slice(0, 6000)}` }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return NextResponse.json({ ok: false, reason: 'no_extract' })

    const parsed = JSON.parse(m[0]) as {
      company_name: string | null; ort: string | null; services: string[]; tone: string; branch: string
    }
    return NextResponse.json({
      ok: true,
      company_name: parsed.company_name || null,
      ort: parsed.ort || null,
      services: Array.isArray(parsed.services) ? parsed.services.slice(0, 6) : [],
      tone: ['personlig', 'professionell', 'rak'].includes(parsed.tone) ? parsed.tone : 'professionell',
      branch: (BRANCH_KEYS as readonly string[]).includes(parsed.branch) ? parsed.branch : 'other',
    })
  } catch (e) {
    console.error('[onboarding/scrape] error:', e)
    return NextResponse.json({ ok: false, reason: 'error' })
  }
}
