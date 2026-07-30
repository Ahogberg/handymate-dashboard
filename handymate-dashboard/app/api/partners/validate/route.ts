import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { checkRateLimitDb } from '@/lib/rate-limit-db'
import { extractClientIp } from '@/lib/onboarding/website-scrape'

export const dynamic = 'force-dynamic'

/**
 * GET /api/partners/validate?code=P-XXXX
 *
 * Fynd 1b (nykundsresan-granskning) — låter Step2Business bekräfta en
 * partnerkod för besökaren INNAN kontot skapas (ingen session finns än,
 * samma läge som hemsida-skrapningen i onboarding/scrape-website). Ingen
 * auth — måste därför hastighetsbegränsas per IP.
 *
 * Samma "aktiv"-villkor som partner-uppslaget i app/api/auth/route.ts
 * (referral_code + status='active'). Exponerar ALDRIG mer än partnerns
 * namn — inga id:n, provisionssatser, e-post eller andra fält.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = extractClientIp(
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-real-ip'),
    )
    const rateLimit = await checkRateLimitDb(`partner-validate:${ip}`, {
      maxRequests: 20,
      windowMs: 60 * 60 * 1000, // 1 timme
    })
    if (!rateLimit.allowed) {
      return NextResponse.json({ valid: false }, { status: 429 })
    }

    const code = request.nextUrl.searchParams.get('code')?.trim()
    if (!code || code.length > 32) {
      return NextResponse.json({ valid: false })
    }

    const supabase = getServerSupabase()
    const { data: partner, error } = await supabase
      .from('partners')
      .select('name')
      .eq('referral_code', code)
      .eq('status', 'active')
      .maybeSingle()

    if (error || !partner) {
      return NextResponse.json({ valid: false })
    }

    return NextResponse.json({ valid: true, partnerName: partner.name })
  } catch (error: unknown) {
    console.error('[partners/validate] Oväntat fel:', error)
    return NextResponse.json({ valid: false })
  }
}
