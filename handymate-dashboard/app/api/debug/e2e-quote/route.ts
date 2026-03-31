import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/debug/e2e-quote
 * End-to-end test av offert-flödet:
 * 1. Skapa test-offert
 * 2. Skicka via mail (och/eller SMS)
 * 3. Verifiera signeringslänk
 * 4. Rapportera varje steg
 *
 * Body: { email?: string, phone?: string, method?: 'email'|'sms'|'both' }
 */
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const body = await request.json().catch(() => ({}))
  const testEmail = body.email || business.contact_email
  const testPhone = body.phone || business.phone_number
  const method = body.method || 'email'

  const steps: Array<{ step: string; status: 'ok' | 'fail' | 'skip'; detail: string; data?: any }> = []
  let testQuoteId: string | null = null
  let testCustomerId: string | null = null

  try {
    // ── STEG 1: Hitta eller skapa testkund ──
    const { data: existingCustomer } = await supabase
      .from('customer')
      .select('customer_id, name, email, phone_number')
      .eq('business_id', business.business_id)
      .eq('email', testEmail)
      .maybeSingle()

    if (existingCustomer) {
      testCustomerId = existingCustomer.customer_id
      steps.push({
        step: '1. Testkund',
        status: 'ok',
        detail: `Hittade befintlig kund: ${existingCustomer.name} (${existingCustomer.email})`,
        data: { customer_id: testCustomerId },
      })
    } else {
      const custId = 'test_' + Date.now()
      const { error: custErr } = await supabase.from('customer').insert({
        customer_id: custId,
        business_id: business.business_id,
        name: 'E2E Testkund',
        email: testEmail,
        phone_number: testPhone || '',
      })
      if (custErr) {
        steps.push({ step: '1. Testkund', status: 'fail', detail: custErr.message })
        return NextResponse.json({ success: false, steps })
      }
      testCustomerId = custId
      steps.push({
        step: '1. Testkund',
        status: 'ok',
        detail: `Skapade testkund: E2E Testkund (${testEmail})`,
        data: { customer_id: custId },
      })
    }

    // ── STEG 2: Skapa testoffert ──
    const quoteId = 'e2e_' + Date.now()
    const signToken = crypto.randomUUID()

    // Insert med bara kolumner som garanterat finns
    const insertData: any = {
      quote_id: quoteId,
      business_id: business.business_id,
      customer_id: testCustomerId,
      title: 'E2E Test — Badrumsrenovering',
      description: 'Automatiskt genererad testoffert för E2E-verifiering',
      status: 'draft',
      total: 45000,
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      quote_number: '#E2E',
    }

    const { error: quoteErr } = await supabase.from('quotes').insert(insertData)

    if (quoteErr) {
      steps.push({ step: '2. Skapa offert', status: 'fail', detail: quoteErr.message })
      return NextResponse.json({ success: false, steps })
    }

    // Sätt sign_token via update (fungerar oavsett om kolumnen finns vid insert)
    const { error: tokenErr } = await supabase
      .from('quotes')
      .update({ sign_token: signToken })
      .eq('quote_id', quoteId)

    if (tokenErr) {
      steps.push({
        step: '2. Skapa offert',
        status: 'ok',
        detail: `Offert skapad: ${quoteId} (45 000 kr) — sign_token kunde inte sättas: ${tokenErr.message}. Kör SQL: ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sign_token TEXT UNIQUE;`,
        data: { quote_id: quoteId, sign_token_error: tokenErr.message },
      })
    } else {
      steps.push({
        step: '2. Skapa offert',
        status: 'ok',
        detail: `Offert skapad: ${quoteId} (45 000 kr)`,
        data: { quote_id: quoteId, sign_token: signToken },
      })
    }

    testQuoteId = quoteId

    // ── STEG 3: Verifiera att offerten kan hämtas ──
    const { data: fetchedQuote, error: fetchErr } = await supabase
      .from('quotes')
      .select('quote_id, title, status, sign_token, customer_id')
      .eq('quote_id', quoteId)
      .single()

    if (fetchErr || !fetchedQuote) {
      steps.push({ step: '3. Hämta offert', status: 'fail', detail: fetchErr?.message || 'Offert hittades inte' })
      return NextResponse.json({ success: false, steps })
    }
    steps.push({
      step: '3. Hämta offert',
      status: 'ok',
      detail: `Offert verifierad: ${fetchedQuote.title} (status: ${fetchedQuote.status})`,
    })

    // ── STEG 4: Verifiera signeringslänk ──
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    const signUrl = `${APP_URL}/quote/${signToken}`

    const { data: publicQuote, error: publicErr } = await supabase
      .from('quotes')
      .select('quote_id, title, status')
      .eq('sign_token', signToken)
      .single()

    if (publicErr || !publicQuote) {
      steps.push({ step: '4. Signeringslänk', status: 'fail', detail: `Token ${signToken} hittades inte i DB` })
    } else {
      steps.push({
        step: '4. Signeringslänk',
        status: 'ok',
        detail: `Signeringslänk fungerar: ${signUrl}`,
        data: { sign_url: signUrl },
      })
    }

    // ── STEG 5: Skicka offert ──
    // Anropa send-endpointen internt
    const sendPayload: any = { quoteId, method }
    if (method === 'email' || method === 'both') {
      sendPayload.extraEmails = []
      sendPayload.bccEmails = []
    }

    const sendRes = await fetch(`${APP_URL}/api/quotes/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify(sendPayload),
    })

    const sendBody = await sendRes.json()

    if (!sendRes.ok) {
      steps.push({
        step: '5. Skicka offert',
        status: 'fail',
        detail: sendBody.error || `HTTP ${sendRes.status}`,
        data: sendBody,
      })
    } else {
      steps.push({
        step: '5. Skicka offert',
        status: 'ok',
        detail: sendBody.message || 'Offert skickad!',
        data: {
          smsSent: sendBody.smsSent,
          emailSent: sendBody.emailSent,
          sentVia: sendBody.sentVia,
        },
      })
    }

    // ── STEG 6: Verifiera att status uppdaterades ──
    const { data: updatedQuote } = await supabase
      .from('quotes')
      .select('status, sent_at')
      .eq('quote_id', quoteId)
      .single()

    if (updatedQuote?.status === 'sent') {
      steps.push({
        step: '6. Status uppdaterad',
        status: 'ok',
        detail: `Status: "sent", sent_at: ${updatedQuote.sent_at}`,
      })
    } else {
      steps.push({
        step: '6. Status uppdaterad',
        status: 'fail',
        detail: `Status: "${updatedQuote?.status}" (förväntade "sent")`,
      })
    }

    // ── STEG 7: Verifiera PDF-generering ──
    try {
      const pdfRes = await fetch(`${APP_URL}/api/quotes/pdf?id=${quoteId}`, {
        headers: { 'Cookie': request.headers.get('cookie') || '' },
      })
      if (pdfRes.ok) {
        const contentType = pdfRes.headers.get('content-type') || ''
        steps.push({
          step: '7. PDF-generering',
          status: 'ok',
          detail: `PDF genererad (${contentType}, ${pdfRes.headers.get('content-length') || '?'} bytes)`,
        })
      } else {
        steps.push({
          step: '7. PDF-generering',
          status: 'fail',
          detail: `HTTP ${pdfRes.status}: ${await pdfRes.text().catch(() => '')}`.substring(0, 200),
        })
      }
    } catch (pdfErr: any) {
      steps.push({ step: '7. PDF-generering', status: 'fail', detail: pdfErr.message })
    }

    // ── STEG 8: Simulera signering ──
    try {
      const acceptRes = await fetch(`${APP_URL}/api/quotes/public/${signToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign', signed_by_name: 'E2E Test' }),
      })

      if (acceptRes.ok) {
        const acceptData = await acceptRes.json().catch(() => null)
        steps.push({
          step: '8. Signering',
          status: 'ok',
          detail: 'Offert signerad digitalt',
          data: acceptData,
        })
      } else {
        const errText = await acceptRes.text().catch(() => '')
        steps.push({
          step: '8. Signering',
          status: 'fail',
          detail: `HTTP ${acceptRes.status}: ${errText.substring(0, 200)}`,
        })
      }
    } catch (signErr: any) {
      steps.push({ step: '8. Signering', status: 'fail', detail: signErr.message })
    }

    // ── STEG 9: Verifiera att offert → accepted + projekt skapas ──
    try {
      // Kort paus för att låta automationer köra
      await new Promise(resolve => setTimeout(resolve, 2000))

      const { data: signedQuote } = await supabase
        .from('quotes')
        .select('status, signed_at')
        .eq('quote_id', quoteId)
        .single()

      if (signedQuote?.status === 'accepted' || signedQuote?.signed_at) {
        steps.push({
          step: '9. Status → accepted',
          status: 'ok',
          detail: `Status: ${signedQuote.status}, signerad: ${signedQuote.signed_at}`,
        })
      } else {
        steps.push({
          step: '9. Status → accepted',
          status: 'fail',
          detail: `Status: ${signedQuote?.status || 'okänd'} (förväntade 'accepted')`,
        })
      }

      // Kolla om projekt skapades
      const { data: project } = await supabase
        .from('project')
        .select('project_id, name, status')
        .eq('business_id', business.business_id)
        .eq('quote_id', quoteId)
        .maybeSingle()

      if (project) {
        steps.push({
          step: '10. Projekt skapat',
          status: 'ok',
          detail: `Projekt: ${project.name} (${project.status})`,
          data: { project_id: project.project_id },
        })
      } else {
        steps.push({
          step: '10. Projekt skapat',
          status: 'fail',
          detail: 'Inget projekt hittades kopplat till offerten',
        })
      }

      // Kolla om deal flyttades till won
      const { data: deal } = await supabase
        .from('deal')
        .select('id, stage_id')
        .eq('business_id', business.business_id)
        .eq('quote_id', quoteId)
        .maybeSingle()

      if (deal) {
        const { data: stage } = await supabase
          .from('pipeline_stage')
          .select('slug, name')
          .eq('id', deal.stage_id)
          .single()

        steps.push({
          step: '11. Deal → Vunnen',
          status: stage?.slug === 'won' ? 'ok' : 'fail',
          detail: `Deal stage: ${stage?.name || stage?.slug || 'okänd'}`,
        })
      } else {
        steps.push({
          step: '11. Deal → Vunnen',
          status: 'skip',
          detail: 'Ingen deal kopplad till offerten',
        })
      }
    } catch (postSignErr: any) {
      steps.push({ step: '9-11. Post-signering', status: 'fail', detail: postSignErr.message })
    }

    // ── SAMMANFATTNING ──
    const failCount = steps.filter(s => s.status === 'fail').length
    const allOk = failCount === 0

    return NextResponse.json({
      success: allOk,
      summary: allOk
        ? `✅ Alla ${steps.length} steg lyckades! Offert skickad till ${testEmail}.`
        : `❌ ${failCount} av ${steps.length} steg misslyckades.`,
      sign_url: `${APP_URL}/quote/${signToken}`,
      steps,
    })

  } catch (err: any) {
    steps.push({ step: 'Oväntat fel', status: 'fail', detail: err.message })
    return NextResponse.json({ success: false, steps }, { status: 500 })
  }
}
