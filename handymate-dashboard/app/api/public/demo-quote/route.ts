import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { checkPublicRateLimitDb, hashClientIp } from '@/lib/rate-limit-db'
import {
  DEMO_QUOTE_ERRORS,
  DEMO_QUOTE_LIMITS,
  arGiltigtDemoNamn,
  arSvensktMobilnummer,
  demoCorsHeaders,
  skapaOchSkickaDemoOffert,
} from '@/lib/demo/demo-quote'

export const dynamic = 'force-dynamic'

/**
 * POST /api/public/demo-quote — "Skicka en offert till dig själv" på
 * handymate.se (yta 9, 2026-09-07). Publik utan auth: besökaren är inte
 * kund hos någon. Anropas cross-origin från landningssidan (eget repo).
 *
 * Body: { name, phone, firm? }
 * Svar 200: { ok: true, token, remaining_today }
 * Fel: 400 (validering), 429 (tak), 503 (kunde inte skicka).
 *
 * Tre fail-closed tak (checkPublicRateLimitDb, DB-backad):
 *   3 per mobilnummer och dygn — designens "Du har redan fått tre offerter i dag"
 *   5 per IP och timme
 *   200 globalt per dygn — varje anrop kostar ett riktigt SMS
 *
 * `firm` sparas INTE här — landningen skickar den till sin egen
 * save-lead bara när besökaren kryssat i "ni får ringa mig". Fältet tas
 * emot och valideras så ett skräpvärde inte tyst passerar vidare.
 */

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: demoCorsHeaders(request) })
}

export async function POST(request: NextRequest) {
  const headers = demoCorsHeaders(request)
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

  const body = await request.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ')
  const firm = String(body?.firm ?? '').trim()
  const phone = normalizeSwedishPhone(String(body?.phone ?? ''))

  if (!arGiltigtDemoNamn(name)) return json({ error: DEMO_QUOTE_ERRORS.name, field: 'name' }, 400)
  if (!arSvensktMobilnummer(phone)) {
    return json({ error: DEMO_QUOTE_ERRORS.phone, field: 'phone' }, 400)
  }
  if (firm.length > 40) return json({ error: DEMO_QUOTE_ERRORS.firm, field: 'firm' }, 400)

  // Taken i ordning billigast → dyrast: numret först så att svaret till en
  // ärlig besökare ("tre i dag") inte döljs bakom IP-taket.
  const dygn = 24 * 60 * 60 * 1000
  const perPhone = await checkPublicRateLimitDb(`demo-quote:phone:${phone}`, {
    maxRequests: DEMO_QUOTE_LIMITS.perPhonePerDay,
    windowMs: dygn,
  })
  if (!perPhone.allowed) return json({ error: DEMO_QUOTE_ERRORS.perPhone, remaining_today: 0 }, 429)

  const perIp = await checkPublicRateLimitDb(`demo-quote:ip:${hashClientIp(request)}`, {
    maxRequests: DEMO_QUOTE_LIMITS.perIpPerHour,
    windowMs: 60 * 60 * 1000,
  })
  if (!perIp.allowed) return json({ error: DEMO_QUOTE_ERRORS.perIp, remaining_today: perPhone.remaining }, 429)

  const global = await checkPublicRateLimitDb('demo-quote:global', {
    maxRequests: DEMO_QUOTE_LIMITS.globalPerDay,
    windowMs: dygn,
  })
  if (!global.allowed) return json({ error: DEMO_QUOTE_ERRORS.global, remaining_today: perPhone.remaining }, 429)

  const supabase = getServerSupabase()
  const result = await skapaOchSkickaDemoOffert(supabase, { name, phone })
  if (!result.ok) {
    return json({ error: DEMO_QUOTE_ERRORS.send, remaining_today: perPhone.remaining }, result.status)
  }

  return json({ ok: true, token: result.signToken, remaining_today: perPhone.remaining })
}
