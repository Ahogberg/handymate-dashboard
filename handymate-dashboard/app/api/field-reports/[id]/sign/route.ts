import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { sanitizeSenderId } from '@/lib/sms/sender-id'
import { internalPushHeaders } from '@/lib/notifications/push-internal'

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
  // Tenant-svepet 2026-09-01: 'reject' saknade guard — samma token kunde
  // avvisa om och om igen, och varje gång gick ett SMS till hantverkaren
  // med fri text från anroparen. Ett avgjort ärende är avgjort.
  if (report.status === 'rejected') {
    return NextResponse.json({ error: 'Rapporten är redan avvisad' }, { status: 400 })
  }
  if (typeof signed_by === 'string' && signed_by.length > 120) {
    return NextResponse.json({ error: 'Namnet är för långt' }, { status: 400 })
  }
  if (typeof customer_note === 'string' && customer_note.length > 1000) {
    return NextResponse.json({ error: 'Kommentaren är för lång' }, { status: 400 })
  }

  if (action === 'sign') {
    await supabase.from('field_reports').update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_by: signed_by || 'Kund',
      customer_note: customer_note || null,
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)

    // Projektsteg (Del B, 2026-08-26): kundens signatur på fältrapporten är
    // en genomförd besiktning — forward-only via bryggan.
    if (report.project_id) {
      try {
        const { bumpProjectStage } = await import('@/lib/project-stages/event-bridge')
        await bumpProjectStage(report.business_id, { projectId: report.project_id }, 'field_report_signed')
      } catch (err) {
        console.error('[field-reports] bumpProjectStage field_report_signed failed (non-blocking):', err)
      }
    }

    // SMS till hantverkaren (non-blocking)
    try {
      const biz = report.business as any
      if (biz?.phone_number) {
        // Genom strypunkten (etapp 0 batch 4). Går till HANTVERKAREN — hans
        // kund har just signerat — därför recipient:'internal'.
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const r = await sendSmsViaElks({
          supabase,
          businessId: report.business_id,
          businessName: biz.business_name,
          to: biz.phone_number,
          message: `${signed_by || 'Kunden'} har signerat fältrapporten "${report.title}"!`,
          relatedId: params.id,
          messageType: 'field_report_signed',
          recipient: 'internal',
          purpose: 'internal',
        })
        if (!r.success) console.error('[field-reports] signeringsnotis misslyckades:', r.error)
      }
    } catch { /* non-blocking */ }

    // Push-notis (non-blocking)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
      await fetch(`${appUrl}/api/push/send`, {
        method: 'POST',
        headers: internalPushHeaders(),
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
        agent_id: 'karin',
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
        // Genom strypunkten (etapp 0 batch 4). Går till HANTVERKAREN.
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const r = await sendSmsViaElks({
          supabase,
          businessId: report.business_id,
          businessName: biz.business_name,
          to: biz.phone_number,
          message: `${signed_by || 'Kunden'} har invändningar mot "${report.title}". ${customer_note ? 'Kommentar: ' + customer_note : ''}`,
          relatedId: params.id,
          messageType: 'field_report_rejected',
          recipient: 'internal',
          purpose: 'internal',
        })
        if (!r.success) console.error('[field-reports] invändningsnotis misslyckades:', r.error)
      }
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({ success: true })
}
