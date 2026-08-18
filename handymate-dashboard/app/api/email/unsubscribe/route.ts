import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-link'

/**
 * GET /api/email/unsubscribe?token=... — v151 (e-post-opt-out).
 *
 * Publik route utan inloggad session — kunden når den via länken i botten
 * av ett nurture-mail (lib/nurture.ts), se app/api/email/unsubscribe-
 * dokumentationen i lib/email/unsubscribe-link.ts. Autentiseringen här är
 * token-verifiering (samma mönster som app/api/referral-lead och
 * app/api/admin/partners/[id]/approve) — INTE getAuthenticatedBusiness()
 * (det finns ingen inloggad session att slå upp för en kund som klickar en
 * länk i sitt eget mail).
 *
 * Fail-closed: ogiltig/manipulerad/saknad token ⇒ 400 med ett generiskt
 * svenskt felmeddelande — läcker aldrig om ett visst business_id/customer_id
 * finns eller inte.
 *
 * Idempotent: redan avregistrerad ⇒ samma bekräftelsesida som en ny
 * avregistrering (ingen anledning att skvallra om historik, och kunden ska
 * kunna klicka länken flera gånger utan att något går sönder).
 *
 * Denna route registreras MEDVETET i tests/permission-contract.spec.ts
 * UNPROTECTED_BY_DESIGN — se motiveringen där.
 */

function htmlPage(params: { title: string; message: string; status: number }): NextResponse {
  const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${params.title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;">
    <div style="max-width:420px;width:100%;background:#ffffff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">
      <div style="height:6px;background:#0F766E;"></div>
      <div style="padding:32px 28px;text-align:center;">
        <h1 style="margin:0 0 12px;font-size:19px;color:#0f172a;">${params.title}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${params.message}</p>
      </div>
    </div>
  </div>
</body>
</html>`
  return new NextResponse(html, { status: params.status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function invalidLinkResponse(): NextResponse {
  return htmlPage({
    title: 'Länken är ogiltig',
    message: 'Den här avregistreringslänken är ogiltig eller trasig. Kontakta företaget direkt om du vill sluta få mail.',
    status: 400,
  })
}

function successResponse(businessName: string | null): NextResponse {
  return htmlPage({
    title: 'Du är avregistrerad',
    message: businessName
      ? `Du är avregistrerad från utskick från ${businessName}. Du kommer inte längre få marknadsföringsmail från oss.`
      : 'Du är avregistrerad från utskick. Du kommer inte längre få marknadsföringsmail.',
    status: 200,
  })
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const decoded = verifyUnsubscribeToken(token)
    if (!decoded.ok) return invalidLinkResponse()

    const supabase = getServerSupabase()

    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id, email_opt_out')
      .eq('business_id', decoded.businessId)
      .eq('customer_id', decoded.customerId)
      .maybeSingle()

    if (!customer) return invalidLinkResponse()

    // Slå upp företagsnamnet bara för att kunna personalisera bekräftelse-
    // sidan — helt valfritt, ett misslyckat uppslag får aldrig blockera
    // själva avregistreringen.
    let businessName: string | null = null
    try {
      const { data: business } = await supabase
        .from('business_config')
        .select('business_name')
        .eq('business_id', decoded.businessId)
        .maybeSingle()
      businessName = business?.business_name || null
    } catch { /* icke-blockerande */ }

    // Idempotent — redan avregistrerad ger samma bekräftelse utan ny UPDATE.
    if (customer.email_opt_out) return successResponse(businessName)

    const { error } = await supabase
      .from('customer')
      .update({
        email_opt_out: true,
        email_opt_out_at: new Date().toISOString(),
        email_opt_out_source: 'unsubscribe_link',
      })
      .eq('business_id', decoded.businessId)
      .eq('customer_id', decoded.customerId)

    if (error) {
      // sql/v151 inte körd ännu (kolumnerna saknas) — samma toleransmönster
      // som v86/sms_opt_out: logga och visa ändå bekräftelsesidan i stället
      // för att krascha på en publik länk. Flaggan får effekt så snart
      // migrationen körts och kunden klickar länken igen (idempotent).
      console.warn('[email/unsubscribe] kunde inte sätta email_opt_out (sql/v151 ej körd?):', error.message)
    }

    return successResponse(businessName)
  } catch (error: any) {
    console.error('[email/unsubscribe] GET-fel', error)
    return htmlPage({
      title: 'Något gick fel',
      message: 'Kunde inte hantera din avregistrering just nu. Försök igen om en stund.',
      status: 500,
    })
  }
}
