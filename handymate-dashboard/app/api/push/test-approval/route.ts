import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { sendApprovalPush } from '@/lib/notifications/approval-push'

export const dynamic = 'force-dynamic'

/**
 * GET /api/push/test-approval?type={approval_type}
 *
 * Test-endpoint för att verifiera push-leverans utan att skapa
 * riktiga DB-rader (ÄTA, quote, customer, project). Användbar för:
 *
 * - Verifiera att Expo-token är korrekt registrerad (testa innan
 *   EAS Build är live — log:en visar om Expo svarar 200)
 * - Sanity-check efter ändring i lib/notifications/approval-push.ts
 * - Smoke-test under TestFlight-rollout
 *
 * KRÄVER auth (getAuthenticatedBusiness) — inte publik. Christoffer
 * (eller Andreas) trigger:ar från sin egen browser/curl med session.
 *
 * Supported types:
 *   - ata_signed_notification
 *   - ata_declined_notification
 *   - review_request
 *   - quote_signed
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = request.nextUrl.searchParams.get('type') || ''

  const TEST_PAYLOADS: Record<string, Record<string, unknown>> = {
    ata_signed_notification: {
      change_id: 'test_change_001',
      ata_number: 99,
      project_id: 'test_project_001',
      signed_by_name: 'Testkund Eriksson',
      total: 12500,
      signed_at: new Date().toISOString(),
    },
    ata_declined_notification: {
      change_id: 'test_change_002',
      ata_number: 99,
      project_id: 'test_project_001',
      total: 8500,
      declined_at: new Date().toISOString(),
      declined_reason: 'För dyrt — testar push',
    },
    review_request: {
      project_id: 'test_project_001',
      project_name: 'Test-badrum',
      completed_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      customer_id: 'test_customer_001',
      customer_name: 'Testkund Eriksson',
      customer_phone: '+46701234567',
      google_place_id: 'ChIJtest_placeholder',
      review_url: 'https://search.google.com/local/writereview?placeid=ChIJtest_placeholder',
      suggested_sms_text: 'Test-SMS-text',
      routed_agent: 'hanna',
      to: '+46701234567',
      message: 'Test-SMS-text',
    },
    quote_signed: {
      customer_name: 'Testkund Eriksson',
      quote_id: 'test_quote_001',
      project_id: 'test_project_001',
      total: 47500,
    },
  }

  const payload = TEST_PAYLOADS[type]
  if (!payload) {
    return NextResponse.json(
      {
        error: 'Unknown approval_type',
        supported_types: Object.keys(TEST_PAYLOADS),
        example: '/api/push/test-approval?type=ata_signed_notification',
      },
      { status: 400 },
    )
  }

  // sendApprovalPush är fire-and-forget och fångar fel internt.
  // För test-endpointen vill vi vänta in resultatet så caller får
  // veta hur det gick — awaitar därför istället för void.
  await sendApprovalPush({
    business_id: business.business_id,
    approval_type: type,
    payload,
  })

  return NextResponse.json({
    ok: true,
    sent: {
      business_id: business.business_id,
      approval_type: type,
      payload,
    },
    note: 'Push triggerad. Kolla Vercel function logs för leveransstatus (web-push + Expo). Riktig mobile-leverans kräver EAS Build + registrerad push-token.',
  })
}
