import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/field-reports/[id]/sign — Publik signering/avvisning via token
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null)
  if (!body?.token) {
    return NextResponse.json({ error: 'Token krävs' }, { status: 400 })
  }

  const { token, signed_by, customer_note, action } = body
  const supabase = getServerSupabase()

  // Verifiera token
  const { data: report } = await supabase
    .from('field_reports')
    .select('*, business:business_id(business_name, contact_name, phone_number)')
    .eq('id', params.id)
    .eq('signature_token', token)
    .single()

  if (!report) {
    return NextResponse.json({ error: 'Ogiltig token' }, { status: 401 })
  }

  if (report.status === 'signed') {
    return NextResponse.json({ error: 'Redan signerad' }, { status: 400 })
  }

  if (action === 'sign') {
    await supabase.from('field_reports').update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_by: signed_by || 'Kund',
      customer_note: customer_note || null,
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // SMS till hantverkaren (non-blocking)
    try {
      const biz = report.business as any
      if (biz?.phone_number) {
        const ELKS_USER = process.env.ELKS_API_USER
        const ELKS_PASS = process.env.ELKS_API_PASSWORD
        if (ELKS_USER && ELKS_PASS) {
          await fetch('https://api.46elks.com/a1/sms', {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${ELKS_USER}:${ELKS_PASS}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              from: (biz.business_name || 'Handymate').substring(0, 11),
              to: biz.phone_number,
              message: `${signed_by || 'Kunden'} har signerat fältrapporten "${report.title}"!`,
            }),
          })
        }
      }
    } catch { /* non-blocking */ }

    // Push-notis (non-blocking)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
      await fetch(`${appUrl}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: report.business_id,
          title: 'Rapport signerad!',
          body: `${signed_by || 'Kunden'} godkände ${report.title}`,
        }),
      })
    } catch { /* non-blocking */ }

    // Skapa approval → "Skapa faktura?"
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: report.business_id,
      approval_type: 'create_invoice_from_report',
      title: `Skapa faktura? — ${report.title}`,
      description: `${signed_by || 'Kunden'} signerade rapporten. Dags att fakturera?`,
      risk_level: 'low',
      status: 'pending',
      payload: {
        report_id: params.id,
        project_id: report.project_id,
        customer_id: report.customer_id,
        report_title: report.title,
        signed_by,
      },
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })

  } else if (action === 'reject') {
    await supabase.from('field_reports').update({
      status: 'rejected',
      customer_note: customer_note || null,
      signed_by: signed_by || null,
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // SMS till hantverkaren
    try {
      const biz = report.business as any
      if (biz?.phone_number) {
        const ELKS_USER = process.env.ELKS_API_USER
        const ELKS_PASS = process.env.ELKS_API_PASSWORD
        if (ELKS_USER && ELKS_PASS) {
          await fetch('https://api.46elks.com/a1/sms', {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${ELKS_USER}:${ELKS_PASS}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              from: (biz.business_name || 'Handymate').substring(0, 11),
              to: biz.phone_number,
              message: `${signed_by || 'Kunden'} har invändningar mot "${report.title}". ${customer_note ? 'Kommentar: ' + customer_note : ''}`,
            }),
          })
        }
      }
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({ success: true })
}
