import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateMonthlyReview, buildMonthlyReviewSms } from '@/lib/matte/monthly-review'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

export const maxDuration = 60

/**
 * GET /api/cron/monthly-review
 *   Cron: 1:a varje månad 07:00 — genererar rapport för föregående månad
 *   Verifierar x-cron-secret eller Bearer-token.
 *
 * POST /api/cron/monthly-review
 *   Manuell trigger från dashboard.
 *   Body: { month?: "YYYY-MM-01" }
 */

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, phone_number, assigned_phone_number')
    .eq('subscription_status', 'active')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{ business_id: string; ok: boolean; error?: string }> = []

  for (const biz of businesses || []) {
    try {
      const report = await generateMonthlyReview(supabase, biz.business_id)

      await supabase.from('monthly_reviews').upsert({
        business_id: biz.business_id,
        month: report.data.month,
        data: report.data,
        analysis: report.analysis,
        recommendations: report.recommendations,
        sent_at: new Date().toISOString(),
      }, { onConflict: 'business_id,month' })

      // Skicka SMS-notis till hantverkaren
      // Genom strypunkten (etapp 0 batch 3). recipient: 'owner' — går till
      // hantverkarens eget nummer, inte till en kund.
      //
      // Avsändaren hade en EGEN sanerare här — femte varianten — och den
      // strök dessutom å/ä/ö rakt av i stället för att gå genom
      // sanitizeSenderId, som först tar bort bolagsformen ("Bee Service AB"
      // → "BeeService" i stället för "BeeServiceA").
      const smsTo = biz.phone_number
      if (smsTo) {
        const smsText = buildMonthlyReviewSms(report.data, report.recommendations.length)
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const r = await sendSmsViaElks({
          supabase,
          businessId: biz.business_id,
          businessName: biz.business_name,
          to: smsTo,
          message: smsText,
          messageType: 'monthly_review',
          recipient: 'internal',
          purpose: 'internal',
        })
        if (!r.success) console.error('[cron/monthly-review] SMS misslyckades:', r.error)
      }

      // Skapa pending_approval så rapporten dyker upp som notis
      await supabase.from('pending_approvals').insert({
        id: `mrev_${biz.business_id}_${report.data.month}`,
        business_id: biz.business_id,
        approval_type: 'monthly_review',
        title: `📊 Månadsrapport ${report.data.month_label}`,
        description: `${report.recommendations.length} rekommendation${report.recommendations.length === 1 ? '' : 'er'} väntar`,
        payload: { agent_id: 'matte', month: report.data.month, recommendations: report.recommendations.slice(0, 3) },
        status: 'pending',
        risk_level: 'low',
      })

      results.push({ business_id: biz.business_id, ok: true })
    } catch (err: any) {
      results.push({ business_id: biz.business_id, ok: false, error: err?.message || 'Okänt fel' })
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results })
}

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const body = await request.json().catch(() => ({}))
  // Den manuella vägen får aldrig välja tenant ur request-body.
  const businessId = business.business_id
  const monthDate = body.month ? new Date(body.month) : undefined

  try {
    const report = await generateMonthlyReview(supabase, businessId, monthDate)

    const { error } = await supabase.from('monthly_reviews').upsert({
      business_id: businessId,
      month: report.data.month,
      data: report.data,
      analysis: report.analysis,
      recommendations: report.recommendations,
      sent_at: null,
    }, { onConflict: 'business_id,month' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      month: report.data.month,
      month_label: report.data.month_label,
      analysis: report.analysis,
      recommendations: report.recommendations,
      data: report.data,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Kunde inte generera rapport' }, { status: 500 })
  }
}
